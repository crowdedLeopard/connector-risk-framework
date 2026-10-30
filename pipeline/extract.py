"""Extract structured facts from a Microsoft Learn connector page.

Only structured fields are kept. Descriptions and contact details are not
stored; the site links to Learn for those.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup, Tag

FLAG_PATTERNS = {
    "independentPublisher": re.compile(r"\(\s*independent\s+pub\w*\s*\)", re.I),
    "preview": re.compile(r"\(\s*preview\s*\)", re.I),
    "deprecated": re.compile(r"\[\s*deprecated\s*\]", re.I),
}
UNRESOLVED = re.compile(r"^\[variables\(")


def _text(node: Tag | None) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node else ""


def _table_by_header(main: Tag, header: str) -> Tag | None:
    for table in main.find_all("table"):
        first = table.find("th")
        if first and _text(first).lower() == header.lower():
            return table
    return None


def _products(main: Tag) -> list[dict]:
    table = _table_by_header(main, "Service")
    if table is None:
        return []
    products = []
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        regions = _text(cells[2])
        excluded = re.split(r"\s-\s", regions.split("except the following:")[1]) if "except the following" in regions else []
        products.append({
            "service": _text(cells[0]),
            "class": _text(cells[1]),
            "regionsExcluded": [e.strip(" -\xa0") for e in excluded if e.strip(" -\xa0")],
        })
    return products


def _metadata(main: Tag) -> dict:
    table = _table_by_header(main, "Connector Metadata")
    meta = {"publisher": "", "website": "", "privacyPolicy": "", "categories": []}
    if table is None:
        return meta
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 2:
            continue
        key, cell = _text(cells[0]).lower(), cells[1]
        link = cell.find("a")
        if key == "publisher":
            meta["publisher"] = _text(cell)
        elif key == "website":
            meta["website"] = (link.get("href") if link else _text(cell)) or ""
        elif key == "privacy policy":
            meta["privacyPolicy"] = (link.get("href") if link else _text(cell)) or ""
        elif key == "categories":
            meta["categories"] = sorted({c.strip() for c in re.split(r"[;,]", _text(cell)) if c.strip()})
    return meta


def _section_nodes(heading: Tag):
    """Yield siblings after an h2 until the next h2."""
    for sibling in heading.find_next_siblings():
        if sibling.name == "h2":
            return
        yield sibling


def _auth_types(main: Tag) -> list[dict]:
    heading = main.find("h2", id="creating-a-connection")
    if heading is None:
        return []
    nodes = list(_section_nodes(heading))
    table = next((n for n in nodes if n.name == "table"), None)
    if table is None:
        return []
    types = []
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        if not cells:
            continue
        link = cells[0].find("a")
        anchor = (link.get("href") or "").lstrip("#") if link else ""
        name = _text(cells[0])
        share = _text(cells[-1]).lower()
        types.append({
            "name": name,
            "nameResolved": not UNRESOLVED.match(name),
            "anchor": anchor,
            "regions": _text(cells[2]) if len(cells) >= 4 else "",
            "shareable": True if share == "shareable" else False if share == "not shareable" else None,
            "parameters": [],
        })
    # Each authentication type has an h3 followed by a parameter table.
    current = None
    for node in nodes:
        if node.name == "h3":
            target = node.find("a", attrs={"name": True})
            keys = {node.get("id"), target.get("name") if target else None}
            current = next((t for t in types if t["anchor"] in keys), None)
            if current is None:
                title = _text(node).lower()
                current = next((t for t in types if t["name"].lower() == title), None)
        elif node.name == "table" and current is not None:
            for row in node.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) >= 2:
                    current["parameters"].append({"name": _text(cells[0]), "type": _text(cells[1])})
    for item in types:
        del item["anchor"]
    return types


def _operations(main: Tag, section: str, stop: tuple[str, ...]) -> list[dict]:
    heading = main.find("h2", id=section)
    if heading is None:
        return []
    operations = []
    current = None
    for node in heading.find_all_next(["h2", "h3", "div", "table"]):
        if node.name == "h2" and node.get("id") in stop:
            break
        if node.name == "h2":
            break
        if node.name == "h3":
            current = {"name": _text(node), "anchor": node.get("id", ""), "opId": "", "parameters": []}
        elif node.name == "div" and current is not None and "operation-id" in (node.get("class") or []):
            current["opId"] = _text(node.find("dd"))
            operations.append(current)
        elif node.name == "table" and current is not None and current["opId"] and not current["parameters"]:
            headers = [_text(th).lower() for th in node.find_all("th")]
            if "key" not in headers or "required" not in headers:
                continue
            for row in node.find_all("tr"):
                cells = row.find_all("td")
                if len(cells) >= 4:
                    current["parameters"].append({
                        "name": _text(cells[0]),
                        "required": _text(cells[2]).lower() == "true",
                        "type": _text(cells[3]),
                    })
    for op in operations:
        op["deprecated"] = bool(FLAG_PATTERNS["deprecated"].search(op["name"]))
    return operations


def domain_of(url: str) -> str:
    host = urlparse(url if "//" in url else f"https://{url}").hostname or ""
    return host.lower().removeprefix("www.")


def parse_page(slug: str, html: str) -> dict:
    """Parse one connector page. Raises ValueError when the page shape is not recognised."""
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main") or soup
    title = main.find("h1")
    if title is None:
        raise ValueError(f"{slug}: no title")
    name = _text(title)
    products = _products(main)
    metadata = _metadata(main)
    actions = _operations(main, "actions", ("triggers", "definitions"))
    triggers = _operations(main, "triggers", ("definitions",))
    auth_types = _auth_types(main)
    if not (products or metadata["publisher"] or metadata["website"] or actions or triggers or auth_types):
        raise ValueError(f"{slug}: no recognisable connector sections")
    return {
        "slug": slug,
        "name": name,
        "nameFlags": sorted(k for k, p in FLAG_PATTERNS.items() if p.search(name)),
        "products": products,
        **metadata,
        "serviceDomain": domain_of(metadata["website"]) if metadata["website"] else "",
        "authTypes": auth_types,
        "actions": actions,
        "triggers": triggers,
    }
