"""Check every fact's evidence phrases against its live source page."""
from __future__ import annotations

import re
import sys
from datetime import date
from html import unescape
from pathlib import Path

import httpx
import yaml

from .crawl import USER_AGENT

ROOT = Path(__file__).resolve().parent.parent
FACTS = ROOT / "data" / "facts.yaml"


def normalise(text: str) -> str:
    text = text.replace("’", "'").replace("‘", "'").replace(" ", " ")
    return re.sub(r"\s+", " ", text).lower()


def page_text(html: str) -> str:
    start = html.find("<main")
    body = html[start:] if start >= 0 else html
    body = re.sub(r"<(script|style)\b.*?</\1>", " ", body, flags=re.S)
    return normalise(unescape(re.sub(r"<[^>]+>", " ", body)))


def verify(today: str | None = None) -> dict:
    """Return the site's facts payload, with a verified flag on each fact."""
    today = today or date.today().isoformat()
    doc = yaml.safe_load(FACTS.read_text("utf-8"))
    client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True)
    pages: dict[str, str] = {}
    fetch_errors: dict[str, str] = {}
    for key, source in doc["sources"].items():
        try:
            response = client.get(source["url"])
            response.raise_for_status()
            pages[key] = page_text(response.text)
        except httpx.HTTPError as exc:
            fetch_errors[key] = str(exc)
    facts = []
    for fact in doc["facts"]:
        source = fact["source"]
        missing = []
        if source in pages:
            missing = [p for p in fact["evidence"] if normalise(p) not in pages[source]]
        facts.append({
            "id": fact["id"],
            "statement": fact["statement"],
            "source": source,
            "status": "unreachable" if source in fetch_errors else "changed" if missing else "verified",
            "missing": missing,
            "lastChecked": today,
        })
    return {"sources": doc["sources"], "facts": facts, "checked": today, "fetchErrors": fetch_errors}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    result = verify()
    bad = [f for f in result["facts"] if f["status"] != "verified"]
    print(f"{len(result['facts']) - len(bad)} of {len(result['facts'])} facts verified")
    for fact in bad:
        print(f"  {fact['id']}: {fact['status']} {fact['missing']}")
    print("fetch errors:", result["fetchErrors"])
    sys.exit(1 if bad else 0)
