"""Turn extracted page facts into derived traits, keeping the evidence for each."""
from __future__ import annotations

import json
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"

METHODS = ("get", "post", "put", "patch", "delete")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
DATA_POLICY_SERVICES = {"Power Apps", "Power Automate", "Copilot Studio"}


def load_config() -> tuple[dict, dict]:
    curated = yaml.safe_load((CONFIG / "curated.yaml").read_text("utf-8"))
    classes = yaml.safe_load((CONFIG / "operation-classes.yaml").read_text("utf-8"))
    return curated, classes


def tokens(text: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    return re.findall(r"[a-z0-9]+", spaced.lower())


class Classifier:
    def __init__(self, config: dict) -> None:
        self.classes = config["classes"]
        self.word_class: dict[str, str] = {}
        for name in ("delete", "send", "write", "read"):
            for word in self.classes[name]["words"]:
                self.word_class[word] = name
        self.phrases = {
            name: [" ".join(tokens(p)) for p in self.classes[name]["phrases"]]
            for name in ("admin", "raw")
        }
        self.admin_connectors = set(self.classes["admin"]["connectors"])

    def from_text(self, name: str, op_id: str) -> str | None:
        """Classify from words alone, without using the HTTP method."""
        haystack = f" {' '.join(tokens(name))} | {' '.join(tokens(op_id))} "
        for cls in ("admin", "raw"):
            for phrase in self.phrases[cls]:
                if f" {phrase} " in haystack:
                    return cls
        for source in (name, op_id):
            for token in tokens(source):
                if token in self.word_class:
                    return self.word_class[token]
        return None

    def classify(self, slug: str, name: str, op_id: str, method: str | None) -> tuple[str, str]:
        """Return (class, basis). The basis says what drove the result."""
        if slug in self.admin_connectors:
            return "admin", "connector is an administration connector"
        found = self.from_text(name, op_id)
        if method == "delete" and found != "delete":
            return "delete", "HTTP DELETE"
        if found:
            return found, "name"
        if method:
            verb = {"get": "read", "delete": "delete"}.get(method, "write")
            return verb, f"HTTP {method.upper()}"
        return "other", "no classifying word"


def load_definitions(repo: Path) -> dict[str, list[dict]]:
    """Read published connector definitions, keyed by normalised title and folder.

    Several definitions can share a key, so each key holds every candidate.
    """
    definitions: dict[str, list[dict]] = {}
    for group in ("certified-connectors", "independent-publisher-connectors"):
        base = repo / group
        if not base.exists():
            continue
        for folder in sorted(p for p in base.iterdir() if p.is_dir()):
            swagger = folder / "apiDefinition.swagger.json"
            if not swagger.exists():
                continue
            try:
                doc = json.loads(swagger.read_text("utf-8-sig"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            operations = {}
            for path, item in (doc.get("paths") or {}).items():
                if not isinstance(item, dict):
                    continue
                for method in METHODS:
                    op = item.get(method)
                    if isinstance(op, dict) and op.get("operationId"):
                        operations[op["operationId"]] = {"method": method, "path": path}
            definition = {
                "group": group,
                "folder": folder.name,
                "host": doc.get("host") or "",
                "basePath": doc.get("basePath") or "",
                "operations": operations,
                "scopes": _scopes(folder / "apiProperties.json"),
            }
            for key in {norm(folder.name), norm((doc.get("info") or {}).get("title", ""))}:
                if key:
                    definitions.setdefault(key, []).append(definition)
    return definitions


def _scopes(path: Path) -> list[str]:
    if not path.exists():
        return []
    try:
        text = path.read_text("utf-8-sig")
        doc = json.loads(text)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return []
    found: set[str] = set()

    def walk(node) -> None:
        if isinstance(node, dict):
            settings = node.get("oAuthSettings")
            if isinstance(settings, dict):
                found.update(s for s in settings.get("scopes") or [] if isinstance(s, str))
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(doc)
    return sorted(found)


def norm(text: str) -> str:
    text = re.sub(r"\(.*?\)|\[.*?\]", "", text)
    return re.sub(r"[^a-z0-9]", "", text.lower())


def match_definition(record: dict, definitions: dict[str, list[dict]]) -> dict | None:
    """Pick the candidate sharing the most operation IDs, if it has at least half of the page's."""
    op_ids = {o["opId"] for o in record["actions"] + record["triggers"]}
    if not op_ids:
        return None
    candidates = definitions.get(norm(record["name"]), []) + definitions.get(norm(record["slug"]), [])
    if not candidates:
        return None
    # The folder name breaks ties, so the result does not depend on the platform's sort order.
    best = max(candidates, key=lambda c: (len(op_ids & set(c["operations"])), c["group"], c["folder"].lower()))
    return best if len(op_ids & set(best["operations"])) / len(op_ids) >= 0.5 else None


def _is_microsoft_domain(domain: str, curated: dict) -> bool:
    return any(domain == d or domain.endswith(f".{d}") for d in curated["microsoft_domains"])


def service_origin(record: dict, curated: dict, is_microsoft_publisher: bool, host: str = "") -> tuple[str, str]:
    """Return (origin, evidence). Publisher alone is never used to infer the service owner."""
    domain, slug = record.get("serviceDomain", ""), record["slug"]
    if slug in curated["origin_override"]:
        return "microsoft", "Sorted as Microsoft by curated judgement, because Learn's Website field points elsewhere."
    if domain:
        if _is_microsoft_domain(domain, curated):
            return "microsoft", f"Website on Learn is {domain}, on the Microsoft domain list."
        return "third-party", f"Website on Learn is {domain}, which is not on the Microsoft domain list."
    if slug in curated["any_endpoint"]:
        return "maker-defined", "The maker supplies the destination."
    mapping = curated["origin_when_no_website"]
    if slug in mapping["microsoft"]:
        return "microsoft", "No Website on Learn. Sorted as Microsoft by curated judgement from the connector name."
    if slug in mapping["third-party"]:
        return "third-party", "No Website on Learn. Sorted as third party by curated judgement from the connector name."
    if host and _is_microsoft_domain(host.lower(), curated):
        return "microsoft", f"No Website on Learn. The published definition calls {host}, on the Microsoft domain list."
    if is_microsoft_publisher:
        return "unstated", "Published by Microsoft, but Learn states no Website for the service."
    return "third-party", "No Website on Learn, and the publisher is not Microsoft."


def build_record(record: dict, listing, lists: dict, curated: dict, classifier: Classifier,
                 definitions: dict) -> dict:
    slug = record["slug"]
    is_microsoft = slug in lists["microsoft"]
    definition = match_definition(record, definitions)
    ops = definition["operations"] if definition else {}

    def enrich(op: dict, kind: str) -> dict:
        call = ops.get(op["opId"])
        cls, basis = classifier.classify(slug, op["name"], op["opId"], call["method"] if call else None)
        return {
            "name": op["name"], "opId": op["opId"], "anchor": op["anchor"], "kind": kind,
            "deprecated": op["deprecated"], "class": cls, "basis": basis,
            "method": call["method"].upper() if call else None,
            "path": call["path"] if call else None,
            "parameters": [{"name": EMAIL.sub("[address removed]", p["name"]), "required": p["required"], "type": p["type"]} for p in op["parameters"]],
        }

    actions = [enrich(o, "action") for o in record["actions"]]
    triggers = [enrich(o, "trigger") for o in record["triggers"]]
    live = [o for o in actions if not o["deprecated"]]
    class_counts: dict[str, int] = {}
    for op in live:
        class_counts[op["class"]] = class_counts.get(op["class"], 0) + 1

    categories = sorted({c.strip().capitalize() if c.islower() else c.strip() for c in record["categories"]})
    categories = sorted({_canonical_category(c) for c in categories})
    auth = [{k: a[k] for k in ("name", "nameResolved", "regions", "shareable", "parameters")} for a in record["authTypes"]]
    origin, origin_evidence = service_origin(record, curated, is_microsoft, definition["host"] if definition else "")

    services = {p["service"] for p in record["products"]}
    if not services:
        services = {m for m in listing.markers if m in {"Power Apps", "Power Automate", "Logic Apps"}}
    in_data_policies = bool(services & DATA_POLICY_SERVICES)
    nonblockable = slug in _nonblockable_slugs(curated)
    classifiable = slug not in curated["not_classifiable"]
    is_premium = "Premium" in listing.markers or any(
        p["class"] == "Premium" and p["service"] != "Logic Apps" for p in record["products"])
    is_preview = "Preview" in listing.markers or "preview" in record["nameFlags"]
    is_deprecated = "deprecated" in record["nameFlags"]
    is_independent = "independentPublisher" in record["nameFlags"] or bool(
        definition and definition["group"] == "independent-publisher-connectors")
    is_mcp = slug in lists["mcpserver"]
    has_entra = any(re.search(r"entra|azure ad|aad", a["name"], re.I) for a in auth)

    exposures: dict[str, str] = {}
    if slug in curated["any_endpoint"]:
        exposures["any-endpoint"] = curated["any_endpoint"][slug]
    target_pattern = re.compile(curated["target_parameter_pattern"])
    targets = sorted({p["name"] for a in auth for p in a["parameters"] if target_pattern.search(p["name"])})
    if targets and "any-endpoint" not in exposures:
        exposures["maker-target"] = "Connection asks for: " + ", ".join(targets[:4]) + "."
    if origin == "third-party":
        exposures["third-party"] = origin_evidence
    if slug in curated["consumer"]:
        exposures["consumer"] = curated["consumer"][slug]
    if "Social Media" in categories:
        exposures["public-publishing"] = "Learn places this connector in the Social Media category."
    elif slug in curated["public_publishing"]:
        exposures["public-publishing"] = curated["public_publishing"][slug]
    if "AI" in categories and origin != "microsoft":
        exposures["external-ai"] = "Learn places this connector in the AI category, and the service is outside the Microsoft domain list."
    if origin == "microsoft" and is_premium and not nonblockable:
        exposures["microsoft-premium"] = "A premium Microsoft service, beyond the Microsoft 365 and standard connectors in Microsoft's shared baseline."
    for cls, exposure in (("send", "send"), ("delete", "delete"), ("write", "write"), ("raw", "raw"), ("admin", "admin")):
        matching = [o["name"] for o in live if o["class"] == cls]
        if matching:
            shown = ", ".join(matching[:3])
            exposures[exposure] = f"{len(matching)} action{'s' if len(matching) != 1 else ''}, including {shown}."
    shareable = [a["name"] for a in auth if a["shareable"]]
    if shareable:
        exposures["shareable-auth"] = "Shareable authentication: " + ", ".join(_auth_label(n) for n in shareable[:3]) + "."
    secrets = sorted({a["name"] for a in auth if any(p["type"] in ("securestring", "clientCertificate") for p in a["parameters"])})
    if secrets:
        exposures["stored-secret"] = "Connection stores a secret: " + ", ".join(_auth_label(n) for n in secrets[:3]) + "."
    if is_independent:
        exposures["independent"] = "Named or filed as an independent publisher connector."
    if is_preview:
        exposures["preview"] = "Marked Preview on Learn."
    if is_deprecated:
        exposures["deprecated"] = "Marked deprecated in its name on Learn."
    if is_mcp:
        exposures["mcp"] = "Listed in Microsoft's MCP Server connector list."
    gaps = []
    if not auth:
        gaps.append("no authentication types")
    if not actions and not triggers:
        gaps.append("no operations")
    if gaps:
        exposures["undocumented"] = "The Learn page shows " + " and ".join(gaps) + "."

    if not classifiable:
        action_control = False
    else:
        action_control = not nonblockable and in_data_policies
    acp = "unconfirmed" if slug in curated["acp_unconfirmed"] else "supported" if in_data_policies else "not-applicable"

    return {
        "slug": slug,
        "name": _clean_name(record["name"]),
        "learnUrl": f"https://learn.microsoft.com/en-us/connectors/{slug}/",
        "apiId": f"/providers/Microsoft.PowerApps/apis/shared_{slug}",
        "publisher": record["publisher"] or listing.publisher,
        "publisherType": "microsoft" if is_microsoft else "independent" if is_independent else "other",
        "serviceDomain": record.get("serviceDomain", ""),
        "origin": origin,
        "originEvidence": origin_evidence,
        "categories": categories,
        "services": sorted(services),
        "products": record["products"],
        "premium": is_premium,
        "preview": is_preview,
        "deprecated": is_deprecated,
        "mcp": is_mcp,
        "website": record.get("website", ""),
        "privacyPolicy": record.get("privacyPolicy", ""),
        "authTypes": auth,
        "actions": actions,
        "triggers": triggers,
        "classCounts": class_counts,
        "liveActions": len(live),
        "definition": {
            "group": definition["group"], "folder": definition["folder"],
            "host": definition["host"], "basePath": definition["basePath"],
            "scopes": _clean_scopes(definition["scopes"]),
        } if definition else None,
        "controls": {
            "dataPolicy": in_data_policies,
            "classifiable": classifiable,
            "blockable": in_data_policies and classifiable and not nonblockable,
            "nonblockable": nonblockable,
            "actionControl": action_control,
            "endpointFiltering": slug in curated["endpoint_filtering"],
            "acp": acp,
            "tenantIsolation": "gap" if slug in curated["tenant_isolation_gap"] else "applies" if has_entra or slug in curated["tenant_isolation_examples"] else "not-shown",
            "logicApps": "Logic Apps" in services,
        },
        "exposures": exposures,
    }


def _canonical_category(category: str) -> str:
    known = {"it operations": "IT Operations", "website": "Website", "collaboration": "Collaboration",
             "social media": "Social Media", "ai": "AI"}
    return known.get(category.lower(), category)


def _auth_label(name: str) -> str:
    return "the default type" if name.lower().startswith(("default", "[variables")) else name


def _clean_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def _clean_scopes(scopes: list[str]) -> list[str]:
    return [s for s in scopes if "DUMMY" not in s][:40]


def _nonblockable_slugs(curated: dict) -> set[str]:
    slugs: set[str] = set()
    for value in curated["nonblockable"].values():
        slugs.update(value if isinstance(value, list) else [value])
    return slugs


def build_unparsed(listing, lists: dict, curated: dict, reason: str) -> dict:
    """A minimal record for a page that could not be parsed. It is shown, and flagged."""
    empty = {"slug": listing.slug, "name": listing.name, "nameFlags": [], "products": [], "publisher": listing.publisher,
             "website": "", "privacyPolicy": "", "categories": [], "serviceDomain": "", "authTypes": [], "actions": [], "triggers": []}
    classifier = Classifier(load_config()[1])
    built = build_record(empty, listing, lists, curated, classifier, {})
    built["exposures"]["undocumented"] = f"This page could not be parsed on the last refresh ({reason}). Read it on Microsoft Learn."
    built["parseFailed"] = True
    return built


def build_builtin(entry: dict) -> dict:
    """Records for items that appear in data policies but have no catalogue page."""
    exposures = {e: "Set from the Microsoft documentation cited below." for e in entry["exposures"]}
    action_control = entry.get("actionControl", True)
    return {
        "slug": entry["slug"], "name": entry["name"], "kind": entry["kind"], "summary": entry["summary"],
        "learnUrl": "", "apiId": "", "publisher": "Microsoft", "publisherType": "microsoft", "serviceDomain": "",
        "origin": "maker-defined" if "any-endpoint" in entry["exposures"] else "microsoft",
        "originEvidence": "Built into the platform.", "categories": [], "services": ["Power Apps", "Power Automate", "Copilot Studio"],
        "products": [], "premium": False, "preview": False, "deprecated": False, "mcp": False, "website": "", "privacyPolicy": "",
        "authTypes": [], "actions": [], "triggers": [], "classCounts": {}, "liveActions": 0, "definition": None,
        "facts": entry["facts"],
        "controls": {
            "dataPolicy": True, "classifiable": True, "blockable": True, "nonblockable": False, "actionControl": action_control,
            "endpointFiltering": entry["endpointFiltering"], "acp": entry["acp"], "tenantIsolation": "not-shown", "logicApps": False,
        },
        "exposures": exposures,
    }


def validate_classifier(records: list[dict], classifier: Classifier) -> dict:
    """Compare word-based classes against published HTTP methods. Methods are withheld from the words."""
    expected = {"read": {"GET"}, "write": {"POST", "PUT", "PATCH"}, "send": {"POST", "PUT", "PATCH"}, "delete": {"DELETE"}}
    tally = {c: {"agree": 0, "total": 0} for c in expected}
    disagreements = []
    unclassified = 0
    tested = 0
    for record in records:
        for op in record["actions"]:
            if not op["method"]:
                continue
            tested += 1
            cls = classifier.from_text(op["name"], op["opId"])
            if cls is None:
                unclassified += 1
                continue
            if cls not in expected:
                continue
            tally[cls]["total"] += 1
            if op["method"] in expected[cls]:
                tally[cls]["agree"] += 1
            elif len(disagreements) < 40:
                disagreements.append({"connector": record["slug"], "operation": op["name"], "class": cls, "method": op["method"]})
    total = sum(t["total"] for t in tally.values())
    agree = sum(t["agree"] for t in tally.values())
    delete_method = sum(1 for r in records for o in r["actions"] if o["method"] == "DELETE")
    delete_found = sum(1 for r in records for o in r["actions"]
                       if o["method"] == "DELETE" and classifier.from_text(o["name"], o["opId"]) == "delete")
    return {
        "operationsTested": tested, "unclassifiedByWords": unclassified, "comparable": total, "agree": agree,
        "byClass": tally, "deleteMethodOperations": delete_method, "deleteMethodFoundByWords": delete_found,
        "sampleDisagreements": disagreements,
    }
