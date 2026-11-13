"""Check every published data file against its JSON Schema in schema/.

Run by CI on every pull request and by the weekly refresh before it commits,
so a change in Microsoft's pages cannot silently publish malformed data.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = ROOT / "schema"
DATA = ROOT / "data"


def validator(name: str) -> Draft202012Validator:
    schema = json.loads((SCHEMA / name).read_text("utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def targets():
    current = DATA / "current"
    yield "index.schema.json", [current / "index.json"]
    yield "meta.schema.json", [current / "meta.json"]
    yield "facts.schema.json", [current / "facts.json"]
    yield "connector.schema.json", sorted((current / "connectors").glob("*.json"))
    yield "changes.schema.json", sorted(p for p in (DATA / "changes").glob("*.json") if p.stem != "index")


def check() -> list[str]:
    problems = []
    for schema_name, paths in targets():
        v = validator(schema_name)
        if not paths:
            continue
        for path in paths:
            document = json.loads(path.read_text("utf-8"))
            for error in sorted(v.iter_errors(document), key=lambda e: list(e.path))[:5]:
                where = "/".join(str(p) for p in error.absolute_path) or "(root)"
                problems.append(f"{path.relative_to(ROOT)} at {where}: {error.message}")
    index = json.loads((DATA / "current" / "index.json").read_text("utf-8"))
    slugs = [row["s"] for row in index]
    if len(slugs) != len(set(slugs)):
        problems.append("data/current/index.json: duplicate slugs")
    files = {p.stem for p in (DATA / "current" / "connectors").glob("*.json")}
    if set(slugs) != files:
        problems.append(f"index.json and connectors/ disagree: {sorted(set(slugs) ^ files)[:10]}")
    return problems


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    found = check()
    for problem in found:
        print(problem)
    print(f"{len(found)} schema problem(s)")
    sys.exit(1 if found else 0)
