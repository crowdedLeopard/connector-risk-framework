"""Assemble the deployable site in _site from site/ and the current data."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "_site"


def build() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / "site", OUT)
    shutil.copytree(ROOT / "data" / "current", OUT / "data" / "current")
    changes = ROOT / "data" / "changes"
    if changes.exists():
        shutil.copytree(changes, OUT / "data" / "changes")
    (OUT / ".nojekyll").write_text("", "utf-8")


if __name__ == "__main__":
    build()
    print(f"built {OUT}")
