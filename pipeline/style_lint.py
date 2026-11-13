"""House style checks: no en or em dashes, and British spelling, in everything a reader sees."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [ROOT / "site", ROOT / "data" / "facts.yaml", ROOT / "config" / "curated.yaml"] + [ROOT / name for name in ("README.md", "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md", "LICENSE-DATA.md")] + [ROOT / "docs"]
DASHES = re.compile("[–—]")
# "center" stays allowed only inside the product name "admin center".
AMERICAN = re.compile(r"\b(organi[z]ation\w*|prioriti[z]e\w*|analy[z]e[sd]?|behavior\w*|color\w*|favor\w*|licens[e]? class|catalog\b|customi[z]e\w*|recogni[z]e\w*|summari[z]e\w*)\b", re.I)
# CSS and JavaScript identifiers such as "color" are not reader-facing, so only their strings are checked.
CODE_SUFFIXES = {".css", ".svg"}
# Binary files, and third-party files whose text is not ours to restyle (the font and its licence).
SKIP_SUFFIXES = {".woff2", ".png", ".jpg", ".ico"}
SKIP_DIRS = {ROOT / "site" / "fonts"}


def files():
    for target in TARGETS:
        if target.is_dir():
            yield from (p for p in target.rglob("*")
                        if p.is_file() and p.suffix not in SKIP_SUFFIXES and not any(d in p.parents for d in SKIP_DIRS))
        elif target.exists():
            yield target


def check() -> list[str]:
    problems = []
    for path in files():
        text = path.read_text("utf-8")
        for number, line in enumerate(text.splitlines(), 1):
            where = f"{path.relative_to(ROOT)}:{number}"
            if DASHES.search(line):
                problems.append(f"{where}: en or em dash")
            if path.suffix in CODE_SUFFIXES:
                continue
            if path.suffix == ".js":
                # Check user-visible text only: quoted strings and template text, skipping identifiers.
                strings = re.findall(r'"[^"]*"|`[^`]*`', line)
                sample = " ".join(s for s in strings if " " in s and "<" not in s[:2])
            else:
                sample = line
            match = AMERICAN.search(sample)
            if match and "color-scheme" not in sample and "colorScheme" not in sample:
                problems.append(f"{where}: American spelling '{match.group(0)}'")
    return problems


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    found = check()
    for problem in found:
        print(problem)
    print(f"{len(found)} style problem(s)")
    sys.exit(1 if found else 0)
