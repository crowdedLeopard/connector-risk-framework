# Architecture

The Connector Risk Framework is a static site with a data pipeline behind it. There is no server, database or sign-in. Everything the site shows is computed in the reader's browser from JSON files that a scheduled job regenerates every week.

```
Microsoft Learn ──┐
                  ├─► pipeline/ ──► data/current/*.json ──► pipeline/build_site ──► _site/ ──► GitHub Pages
Microsoft's       │   (crawl,        data/changes/*.json      (adds build stamp,         ▲
connector repo ───┘    derive,       validated against         schemas, downloads)       │
                       verify)       schema/*.json                                       │
                                                                     watchdog.yml reads the live data date daily
```

## Pipeline (Python, `pipeline/`)

| Module | Responsibility |
|---|---|
| `crawl.py` | Fetches the connector overview and every connector page from Microsoft Learn, with ETag revalidation and an on-disk cache in `.cache/`. |
| `extract.py` | Parses a connector page into structured fields: operations, authentication types, products and regions. |
| `derive.py` | Turns facts into traits using the rules in `config/`. Classifies each operation as read, write, delete, send, raw or admin. |
| `verify_facts.py` | Checks that each fact's evidence phrases still appear on its source page. |
| `run.py` | Orchestrates a refresh, applies the fail-safes, writes `data/current/` and `data/changes/`, and writes the report used for issues. |
| `validate_data.py` | Validates every published file against `schema/`. |
| `build_site.py` | Assembles `_site/`: the site, the data, the schemas, a build stamp and the CSV and JSON downloads. |
| `style_lint.py` | House style: British spelling and no en or em dashes in reader-facing text. |
| `versions.py` | Method and schema version numbers, and the rules for raising them. |

## Site (`site/`)

Plain ES modules with no framework, bundler or third-party runtime code. The only external files are Microsoft's product icons and the self-hosted Inter font.

| Module | Responsibility |
|---|---|
| `js/app.js` | Entry point. Loads `index.json`, `meta.json` and `facts.json`, applies the theme, and routes on the address hash. |
| `js/engine.js` | The decision engine. Pure functions with no DOM access, so the same code runs in the browser and in `tests/engine.test.mjs`. |
| `js/ui.js` | The shared store, HTML escaping, formatting, settings persistence and small rendering helpers. |
| `js/views.js` | Home, catalogue, connector detail, weekly changes and method pages. |
| `js/build.js` | The risk profile page and the strategy it produces. |
| `js/status.js` | Data status, data and downloads, about, and the stale-data banner. Freshness rules match `watchdog.yml`. |
| `css/app.css` | The design system and all page styles. See [DESIGN.md](DESIGN.md). |

### Rendering and safety

Each view builds an HTML string and assigns it to `<main>`. Every value from data or from the reader passes through `h()` before it reaches markup, and only `https` links from data are rendered. A Content-Security-Policy in `index.html` allows scripts only from the site itself. Imported settings files are validated field by field in `build.js` before use.

### State

`store` in `ui.js` holds the loaded data and the reader's settings. Settings are saved to `localStorage` under `crf.settings.v1` after every change and can be exported as a file. Engine results are memoised per zone and cleared whenever settings change.

### Routing

Routes are hash-based (`#/connectors`, `#/c/sharepointonline`) so the site works on GitHub Pages with no rewrites. After each render, focus moves to `<main>` and the document title updates, so screen reader users hear the new page.

## Workflows (`.github/workflows/`)

| Workflow | Trigger | Job |
|---|---|---|
| `ci.yml` | Pull requests and pushes to `main` | Every check, then deploy on `main`. |
| `refresh.yml` | Mondays 05:17 UTC, or by hand | Crawl, check, commit data, deploy. Fail-safes keep the last good data live. |
| `watchdog.yml` | Daily 09:43 UTC, or by hand | Read the live data date. If it is overdue, open an issue, restart the refresh and fail. |

Both deploy jobs share the `pages` concurrency group, so two deployments never overlap.

## Tests

| Suite | What it proves |
|---|---|
| `pipeline/tests/` (pytest) | Parsing against saved pages, derivation rules, the build stamp, CSV escaping and schema validation. |
| `tests/engine.test.mjs` | Decision rules, presets and the enforceability checks. |
| `tests/status.test.mjs` | Freshness thresholds and the next-refresh calculation. |
| `tests/site.test.cjs` | In a real browser: every page renders without errors in both themes, passes axe-core WCAG 2.1 AA rules, has no horizontal scroll at 375px, and every internal link resolves. |
