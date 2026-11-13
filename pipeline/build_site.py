"""Assemble the deployable site in _site from site/ and the current data.

Besides copying files, this writes:
  data/current/build.json  a build stamp, so the live site can be traced to a commit and a run,
  schema/                  the JSON Schemas for every published data file,
  downloads/               the catalogue as CSV and as JSON with readable field names.
"""
from __future__ import annotations

import csv
import io
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

from pipeline.versions import METHOD_VERSION, SCHEMA_VERSION

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"

# Readable names for the compact keys in index.json. The Data page documents the same mapping.
FIELDS = [
    ("s", "slug"), ("n", "name"), ("p", "publisher"), ("pt", "publisherType"), ("o", "origin"),
    ("c", "categories"), ("sv", "products"), ("pr", "premium"), ("pv", "preview"), ("dp", "deprecated"),
    ("m", "mcp"), ("x", "traits"), ("cc", "operationClasses"), ("la", "currentActions"), ("tr", "triggers"),
    ("k", "kind"), ("fs", "firstSeen"), ("api", "apiId"), ("cd", "definitionMatched"), ("ct", "controls"),
]


def build_stamp(data_date: str) -> dict:
    env = os.environ.get
    repo, run_id, server = env("GITHUB_REPOSITORY"), env("GITHUB_RUN_ID"), env("GITHUB_SERVER_URL", "https://github.com")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "methodVersion": METHOD_VERSION,
        "builtAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "dataDate": data_date,
        "commit": env("GITHUB_SHA"),
        "repository": repo,
        "workflow": env("GITHUB_WORKFLOW"),
        "runUrl": f"{server}/{repo}/actions/runs/{run_id}" if repo and run_id else None,
    }


def readable(index: list[dict]) -> list[dict]:
    return [{name: row[key] for key, name in FIELDS} for row in index]


def catalogue_csv(rows: list[dict]) -> str:
    def cell(value) -> str:
        if isinstance(value, bool):
            return "yes" if value else "no"
        if isinstance(value, list):
            return "; ".join(value)
        if isinstance(value, dict):
            return "; ".join(f"{k}={v}" for k, v in value.items())
        text = str(value)
        # Spreadsheet programs treat these leading characters as formulas.
        return f"'{text}" if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text

    out = io.StringIO()
    names = [name for _, name in FIELDS if name != "controls"]
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(names + ["learnUrl"])
    for row in rows:
        learn = f"https://learn.microsoft.com/en-us/connectors/{row['slug']}/" if not row["kind"] else ""
        writer.writerow([cell(row[n]) for n in names] + [learn])
    return out.getvalue()


def build() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / "site", OUT)
    shutil.copytree(ROOT / "data" / "current", OUT / "data" / "current")
    changes = ROOT / "data" / "changes"
    if changes.exists():
        shutil.copytree(changes, OUT / "data" / "changes")
    shutil.copytree(ROOT / "schema", OUT / "schema")

    meta = json.loads((ROOT / "data" / "current" / "meta.json").read_text("utf-8"))
    stamp = build_stamp(meta["dataDate"])
    (OUT / "data" / "current" / "build.json").write_text(json.dumps(stamp, indent=1) + "\n", "utf-8")

    index = json.loads((ROOT / "data" / "current" / "index.json").read_text("utf-8"))
    rows = readable(index)
    downloads = OUT / "downloads"
    downloads.mkdir()
    (downloads / "connectors.json").write_text(json.dumps({
        "schemaVersion": SCHEMA_VERSION, "dataDate": meta["dataDate"], "connectors": rows,
    }, ensure_ascii=False, indent=1) + "\n", "utf-8")
    (downloads / "connectors.csv").write_text("﻿" + catalogue_csv(rows), "utf-8")
    (OUT / ".nojekyll").write_text("", "utf-8")


if __name__ == "__main__":
    build()
    print(f"built {OUT}")
