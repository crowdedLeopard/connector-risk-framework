"""Polite crawler for the Microsoft Learn connector reference.

Pages are cached under .cache/pages and revalidated with ETag so unchanged
pages are not downloaded again. Raw HTML is never committed.
"""
from __future__ import annotations

import json
import re
import time
import urllib.robotparser
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from html import unescape
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache"
PAGES = CACHE / "pages"
ETAGS = CACHE / "etags.json"

BASE = "https://learn.microsoft.com"
OVERVIEW = f"{BASE}/en-us/connectors/connector-reference/"
LIST_URL = f"{OVERVIEW}connector-reference-{{name}}-connectors"
USER_AGENT = (
    "ConnectorRiskFramework-crawler/1.0 "
    "(open-source Power Platform governance tool; weekly, low rate)"
)
CONCURRENCY = 4
MAX_ATTEMPTS = 5
# Each worker pauses between requests, which keeps the total near eight requests a second.
PAUSE_SECONDS = 0.5
RETRY_PASS_WAIT_SECONDS = 60

CELL = re.compile(r'<td width="25%">(.*?)</td>', re.S)
LINK = re.compile(r'href="/en-us/connectors/([^/"]+)/?"')
NAME = re.compile(r"<b>(.*?)</b>", re.S)
BY = re.compile(r"By:\s*(.*?)<br", re.S)
MARKER = re.compile(r'<img alt="([^"]*)" src="media/')


@dataclass
class Listing:
    slug: str
    name: str
    publisher: str
    markers: list[str]


def parse_listing(html: str) -> list[Listing]:
    """Parse connector cards from the overview or a filtered list page."""
    start = html.find('id="list-of-connectors"')
    body = html[start:] if start >= 0 else html[html.find("<main"):]
    found = []
    for cell in CELL.findall(body):
        link, name = LINK.search(cell), NAME.search(cell)
        if not link or not name:
            continue
        by = BY.search(cell)
        found.append(Listing(
            slug=link.group(1),
            name=unescape(name.group(1)).strip(),
            publisher=unescape(by.group(1)).strip() if by else "",
            markers=sorted(set(MARKER.findall(cell))),
        ))
    return found


class Crawler:
    def __init__(self) -> None:
        PAGES.mkdir(parents=True, exist_ok=True)
        self.etags = json.loads(ETAGS.read_text("utf-8")) if ETAGS.exists() else {}
        self.client = httpx.Client(
            headers={"User-Agent": USER_AGENT}, timeout=60, follow_redirects=True,
            limits=httpx.Limits(max_connections=CONCURRENCY),
        )
        self.robots = urllib.robotparser.RobotFileParser()
        self.robots.parse(self.client.get(f"{BASE}/robots.txt").text.splitlines())
        self.downloaded = 0
        self.revalidated = 0

    def _path(self, key: str) -> Path:
        return PAGES / f"{key}.html"

    def fetch(self, url: str, key: str) -> str:
        """Return page HTML, using the cached copy when the ETag still matches."""
        if not self.robots.can_fetch(USER_AGENT, url):
            raise PermissionError(f"robots.txt disallows {url}")
        path = self._path(key)
        headers = {}
        if key in self.etags and path.exists():
            headers["If-None-Match"] = self.etags[key]
        last_error = "no response"
        for attempt in range(MAX_ATTEMPTS):
            try:
                response = self.client.get(url, headers=headers)
            except httpx.TransportError as exc:
                last_error = type(exc).__name__
                time.sleep(2 ** attempt)
                continue
            if response.status_code == 304:
                self.revalidated += 1
                return path.read_text("utf-8")
            if response.status_code == 200:
                path.write_text(response.text, "utf-8")
                if etag := response.headers.get("etag"):
                    self.etags[key] = etag
                self.downloaded += 1
                return response.text
            if response.status_code == 429 or response.status_code >= 500:
                last_error = f"HTTP {response.status_code}"
                wait = response.headers.get("retry-after", "")
                time.sleep(min(int(wait), 120) if wait.isdigit() else 2 ** attempt)
                continue
            response.raise_for_status()
        raise RuntimeError(f"gave up on {url} after {MAX_ATTEMPTS} attempts: {last_error}")

    def pages(self, slugs: list[str]) -> tuple[dict[str, str], dict[str, str]]:
        """Fetch connector pages concurrently. Returns (html by slug, errors by slug)."""
        results: dict[str, str] = {}
        errors: dict[str, str] = {}

        def one(slug: str) -> None:
            try:
                results[slug] = self.fetch(f"{BASE}/en-us/connectors/{slug}/", f"c-{slug}")
                errors.pop(slug, None)
            except Exception as exc:  # recorded and reported by the fail-safe check
                errors[slug] = f"{type(exc).__name__}: {exc}"
            time.sleep(PAUSE_SECONDS)

        with ThreadPoolExecutor(CONCURRENCY) as pool:
            list(pool.map(one, slugs))
        if errors:
            # A short outage or throttling should not fail the week, so retry slowly, one at a time.
            time.sleep(RETRY_PASS_WAIT_SECONDS)
            for slug in sorted(errors):
                one(slug)
        return results, errors

    def save(self) -> None:
        ETAGS.write_text(json.dumps(self.etags, indent=0, sort_keys=True), "utf-8")


def crawl() -> dict:
    """Crawl the overview, filtered lists and every connector page."""
    crawler = Crawler()
    overview = parse_listing(crawler.fetch(OVERVIEW, "overview"))
    lists = {
        name: sorted({c.slug for c in parse_listing(crawler.fetch(LIST_URL.format(name=name), f"list-{name}"))})
        for name in ("microsoft", "partners", "mcpserver", "preview", "premium")
    }
    pages, errors = crawler.pages(sorted({c.slug for c in overview}))
    crawler.save()
    return {
        "overview": overview, "lists": lists, "pages": pages, "errors": errors,
        "downloaded": crawler.downloaded, "revalidated": crawler.revalidated,
    }


if __name__ == "__main__":
    started = time.time()
    result = crawl()
    print(f"overview {len(result['overview'])} pages {len(result['pages'])} "
          f"errors {len(result['errors'])} downloaded {result['downloaded']} "
          f"revalidated {result['revalidated']} in {time.time() - started:.0f}s")
    print({k: len(v) for k, v in result["lists"].items()})
    print(result["errors"])
