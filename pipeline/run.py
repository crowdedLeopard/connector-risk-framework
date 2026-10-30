"""Weekly refresh: crawl, check, derive, diff and write the site data."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

from .crawl import PAGES, Listing, crawl, parse_listing
from .derive import (Classifier, _nonblockable_slugs, build_builtin, build_record, build_unparsed,
                     load_config, load_definitions, validate_classifier)
from .extract import parse_page
from .verify_facts import verify

ROOT = Path(__file__).resolve().parent.parent
CURRENT = ROOT / "data" / "current"
CONNECTORS = CURRENT / "connectors"
CHANGES = ROOT / "data" / "changes"
HISTORY = ROOT / "data" / "history.json"
REPO = ROOT / ".cache" / "ppc"
REPORT = ROOT / ".cache" / "report.md"

MAX_COUNT_DROP = 0.05
MAX_PARSE_FAILURE = 0.02


class FailSafe(Exception):
    """Raised when the data looks wrong, so the last good data stays live."""


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if not path.exists() or path.read_text("utf-8") != text:
        path.write_text(text, "utf-8")


def read_json(path: Path, default):
    return json.loads(path.read_text("utf-8")) if path.exists() else default


def update_repo() -> None:
    if (REPO / ".git").exists():
        subprocess.run(["git", "-C", str(REPO), "fetch", "-q", "--depth", "1", "origin", "dev"], check=True)
        subprocess.run(["git", "-C", str(REPO), "reset", "-q", "--hard", "FETCH_HEAD"], check=True)
    else:
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--branch", "dev",
                        "https://github.com/microsoft/PowerPlatformConnectors", str(REPO)], check=True)


def load_from_cache() -> dict:
    """Re-derive from the cached crawl without touching the network."""
    overview = parse_listing((PAGES / "overview.html").read_text("utf-8"))
    lists = {n: sorted({c.slug for c in parse_listing((PAGES / f"list-{n}.html").read_text("utf-8"))})
             for n in ("microsoft", "partners", "mcpserver", "preview", "premium")}
    pages = {p.stem[2:]: p.read_text("utf-8") for p in PAGES.glob("c-*.html")}
    return {"overview": overview, "lists": lists, "pages": pages, "errors": {}, "downloaded": 0, "revalidated": 0}


def check_nonblockable_names(curated: dict) -> list[str]:
    """Names on the classification page's table that have no slug mapping."""
    import httpx
    from bs4 import BeautifulSoup
    from .crawl import USER_AGENT
    html = httpx.get("https://learn.microsoft.com/en-us/power-platform/admin/dlp-connector-classification",
                     headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=60).text
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find(id=re.compile("connectors-that-you-cant-block"))
    table = heading.find_next("table") if heading else None
    if table is None:
        return ["table of nonblockable connectors was not found"]
    names = {re.sub(r"\s+", " ", td.get_text(" ", strip=True)) for td in table.select("tbody td")}
    known = set(curated["nonblockable"])
    known.add("Power Apps Notifications ( v1 and v2 )")
    return sorted(n for n in names if n and n not in known)


def summarise(record: dict) -> dict:
    """The compact row used by the catalogue and the decision engine."""
    return {
        "s": record["slug"], "n": record["name"], "p": record["publisher"], "pt": record["publisherType"],
        "o": record["origin"], "c": record["categories"], "sv": record["services"], "pr": record["premium"],
        "pv": record["preview"], "dp": record["deprecated"], "m": record["mcp"], "ct": record["controls"],
        "x": sorted(record["exposures"]), "cc": record["classCounts"], "la": record["liveActions"],
        "tr": len(record["triggers"]), "k": record.get("kind", ""), "fs": record.get("firstSeen", ""),
        "api": record["apiId"], "cd": bool(record["definition"]),
    }


def fingerprint(record: dict) -> dict:
    """Fields whose change is worth reporting. Deliberately excludes presentation fields."""
    return {
        "publisher": record["publisher"],
        "origin": record["origin"],
        "preview": record["preview"],
        "deprecated": record["deprecated"],
        "mcp": record["mcp"],
        "authTypes": sorted(f"{a['name']}|{a['shareable']}" for a in record["authTypes"]),
        "operations": sorted(o["opId"] for o in record["actions"] + record["triggers"]),
        "exposures": sorted(record["exposures"]),
    }


def diff(previous: dict, current: dict) -> dict:
    new = sorted(set(current) - set(previous))
    removed = sorted(set(previous) - set(current))
    changed = []
    for slug in sorted(set(previous) & set(current)):
        before, after = previous[slug], current[slug]
        if before == after:
            continue
        entry = {"slug": slug}
        added_ops = sorted(set(after["operations"]) - set(before["operations"]))
        removed_ops = sorted(set(before["operations"]) - set(after["operations"]))
        if added_ops:
            entry["operationsAdded"] = added_ops[:25]
        if removed_ops:
            entry["operationsRemoved"] = removed_ops[:25]
        for field in ("publisher", "origin", "preview", "deprecated", "mcp"):
            if before[field] != after[field]:
                entry[field] = {"from": before[field], "to": after[field]}
        if before["authTypes"] != after["authTypes"]:
            entry["authTypes"] = {"from": before["authTypes"], "to": after["authTypes"]}
        added_x = sorted(set(after["exposures"]) - set(before["exposures"]))
        removed_x = sorted(set(before["exposures"]) - set(after["exposures"]))
        if added_x:
            entry["exposuresAdded"] = added_x
        if removed_x:
            entry["exposuresRemoved"] = removed_x
        changed.append(entry)
    return {"new": new, "removed": removed, "changed": changed}


def run(use_cache: bool, today: str) -> dict:
    curated, class_config = load_config()
    classifier = Classifier(class_config)
    previous_meta = read_json(CURRENT / "meta.json", {})

    crawled = load_from_cache() if use_cache else crawl()
    overview: list[Listing] = crawled["overview"]
    if not overview:
        raise FailSafe("The overview page produced no connectors.")
    previous_count = previous_meta.get("counts", {}).get("catalogue")
    if previous_count and len(overview) < previous_count * (1 - MAX_COUNT_DROP):
        raise FailSafe(f"Connector count fell from {previous_count} to {len(overview)}.")

    update_repo()
    definitions = load_definitions(REPO)

    slugs = {c.slug for c in overview}
    problems = []
    for label, values in (
        ("nonblockable", _nonblockable_slugs(curated)),
        ("any_endpoint", set(curated["any_endpoint"])),
        ("consumer", set(curated["consumer"])),
        ("public_publishing", set(curated["public_publishing"])),
        ("endpoint_filtering", set(curated["endpoint_filtering"])),
        ("tenant_isolation_gap", set(curated["tenant_isolation_gap"])),
        ("not_classifiable", set(curated["not_classifiable"])),
        ("origin microsoft", set(curated["origin_when_no_website"]["microsoft"])),
        ("origin third-party", set(curated["origin_when_no_website"]["third-party"])),
        ("tenant_isolation_examples", set(curated["tenant_isolation_examples"])),
        ("admin connectors", set(class_config["classes"]["admin"]["connectors"])),
    ):
        missing = sorted(values - slugs)
        if missing:
            problems.append(f"Curated list {label} names connectors not in the catalogue: {', '.join(missing)}")
    unmapped = check_nonblockable_names(curated)
    if unmapped:
        problems.append("Names on the nonblockable list with no mapping: " + "; ".join(unmapped))

    records: dict[str, dict] = {}
    failures: dict[str, str] = dict(crawled["errors"])
    for listing in overview:
        html = crawled["pages"].get(listing.slug)
        try:
            if html is None:
                raise ValueError("page not fetched")
            parsed = parse_page(listing.slug, html)
            records[listing.slug] = build_record(parsed, listing, crawled["lists"], curated, classifier, definitions)
        except ValueError as exc:
            failures[listing.slug] = str(exc)
            records[listing.slug] = build_unparsed(listing, crawled["lists"], curated, "unexpected page layout")
    failure_rate = len(failures) / len(overview)
    if failure_rate > MAX_PARSE_FAILURE:
        raise FailSafe(f"{len(failures)} of {len(overview)} pages failed to parse.")

    catalogue = list(records.values())
    validation = validate_classifier(catalogue, classifier)
    for entry in curated["builtin"]:
        records[entry["slug"]] = build_builtin(entry)

    history = read_json(HISTORY, {})
    is_baseline = not history
    previous_prints = {slug: h["fingerprint"] for slug, h in history.items()}
    current_prints = {slug: fingerprint(r) for slug, r in records.items()}
    changes = diff(previous_prints, current_prints)
    next_history = {}
    for slug, record in records.items():
        before = history.get(slug, {})
        changed = before.get("fingerprint") != current_prints[slug]
        next_history[slug] = {
            "firstSeen": before.get("firstSeen", today),
            "lastChanged": today if changed or not before else before.get("lastChanged", today),
            "fingerprint": current_prints[slug],
        }
        record["firstSeen"] = next_history[slug]["firstSeen"]
        record["lastChanged"] = next_history[slug]["lastChanged"]

    facts = verify(today)
    facts_changed = [f for f in facts["facts"] if f["status"] != "verified"]

    meta = {
        "dataDate": today,
        "counts": {
            "catalogue": len(overview),
            "records": len(records),
            "builtin": len(curated["builtin"]),
            "microsoftPublished": sum(1 for r in catalogue if r["publisherType"] == "microsoft"),
            "independent": sum(1 for r in catalogue if r["publisherType"] == "independent"),
            "preview": sum(1 for r in catalogue if r["preview"]),
            "premium": sum(1 for r in catalogue if r["premium"]),
            "mcp": sum(1 for r in catalogue if r["mcp"]),
            "nonblockable": sum(1 for r in catalogue if r["controls"]["nonblockable"]),
            "withAuthDocumented": sum(1 for r in catalogue if r["authTypes"]),
            "withOperations": sum(1 for r in catalogue if r["actions"] or r["triggers"]),
            "withCategories": sum(1 for r in catalogue if r["categories"]),
            "withDefinition": sum(1 for r in catalogue if r["definition"]),
            "operations": sum(len(r["actions"]) + len(r["triggers"]) for r in catalogue),
            "operationsWithCall": sum(1 for r in catalogue for o in r["actions"] + r["triggers"] if o["method"]),
            "originUnstated": sum(1 for r in catalogue if r["origin"] == "unstated"),
        },
        "parseFailures": sorted(failures),
        "classifier": validation,
        "categories": sorted({c for r in catalogue for c in r["categories"]}),
    }

    # Fail-safe passed, so publish the new data. Files for removed connectors are deleted.
    CONNECTORS.mkdir(parents=True, exist_ok=True)
    for path in CONNECTORS.glob("*.json"):
        if path.stem not in records:
            path.unlink()
    for slug, record in records.items():
        write_json(CONNECTORS / f"{slug}.json", record)
    write_json(CURRENT / "index.json", [summarise(r) for r in sorted(records.values(), key=lambda r: r["name"].lower())])
    write_json(CURRENT / "meta.json", meta)
    write_json(CURRENT / "facts.json", facts)
    write_json(HISTORY, next_history)

    has_changes = not is_baseline and any(changes.values())
    if has_changes:
        names = {slug: records[slug]["name"] for slug in records}
        names.update({s: s for s in changes["removed"]})
        write_json(CHANGES / f"{today}.json", {"date": today, **changes, "names": {
            s: names[s] for s in changes["new"] + changes["removed"] + [c["slug"] for c in changes["changed"]]}})
    change_files = sorted((p.stem for p in CHANGES.glob("*.json") if p.stem != "index"), reverse=True)
    write_json(CHANGES / "index.json", change_files)

    report = render_report(today, meta, changes, problems, facts_changed, is_baseline, crawled, failures)
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(report, "utf-8")
    return {"problems": problems, "factsChanged": facts_changed, "changes": changes, "baseline": is_baseline, "report": report}


def render_report(today, meta, changes, problems, facts_changed, is_baseline, crawled, failures) -> str:
    lines = [f"## Refresh {today}", ""]
    lines += [f"- Connectors in catalogue: {meta['counts']['catalogue']}",
              f"- Pages downloaded: {crawled['downloaded']}; unchanged: {crawled['revalidated']}",
              f"- Pages that could not be parsed: {len(failures)}" + (f" ({', '.join(sorted(failures))})" if failures else "")]
    if is_baseline:
        lines += ["- First run, so this is the baseline and no changes are reported."]
    else:
        lines += [f"- New: {len(changes['new'])}; removed: {len(changes['removed'])}; changed: {len(changes['changed'])}"]
        if changes["new"]:
            lines += ["", "### New connectors to triage"] + [f"- [ ] [{s}](https://learn.microsoft.com/en-us/connectors/{s}/)" for s in changes["new"]]
        if changes["removed"]:
            lines += ["", "### Removed connectors"] + [f"- {s}" for s in changes["removed"]]
    if problems:
        lines += ["", "### Checks that need attention"] + [f"- {p}" for p in problems]
    if facts_changed:
        lines += ["", "### Source pages that changed", "A fact's evidence phrase is no longer on its source page. Review the fact."]
        lines += [f"- `{f['id']}`: {f['status']} {f['missing']}" for f in facts_changed]
    return "\n".join(lines) + "\n"


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--use-cache", action="store_true", help="re-derive from the cached crawl")
    parser.add_argument("--date", default=date.today().isoformat())
    args = parser.parse_args()
    try:
        result = run(args.use_cache, args.date)
    except FailSafe as exc:
        message = f"Refresh stopped by the fail-safe: {exc} The last good data stays live.\n"
        REPORT.parent.mkdir(exist_ok=True)
        REPORT.write_text(message, "utf-8")
        print(message)
        return 2
    print(result["report"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
