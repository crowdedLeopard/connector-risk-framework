# Connector Risk Framework

[![Checks](https://github.com/crowdedLeopard/connector-risk-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/crowdedLeopard/connector-risk-framework/actions/workflows/ci.yml)
[![Weekly refresh](https://github.com/crowdedLeopard/connector-risk-framework/actions/workflows/refresh.yml/badge.svg)](https://github.com/crowdedLeopard/connector-risk-framework/actions/workflows/refresh.yml)
[![Freshness watchdog](https://github.com/crowdedLeopard/connector-risk-framework/actions/workflows/watchdog.yml/badge.svg)](https://github.com/crowdedLeopard/connector-risk-framework/actions/workflows/watchdog.yml)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue)](LICENSE)
[![Data: CC BY 4.0](https://img.shields.io/badge/data-CC%20BY%204.0-blue)](LICENSE-DATA.md)

**Live site: https://crowdedleopard.github.io/connector-risk-framework/**

An interactive tool for deciding how to govern Power Platform connectors. It shows what each connector can call and where it reaches, lets an organisation set what it will accept in each environment zone, and generates a management strategy that uses only documented controls.

It is guidance, not enforcement. It never signs in to a tenant or calls Microsoft admin APIs, and settings stay in the reader's browser.

## What it gives you

- **A catalogue of every connector** on Microsoft Learn, with search, filters, sorting, CSV export and a page per connector showing its operations, authentication, products and the evidence for each trait.
- **A risk profile** of three short questions, with an advanced grid for every trait by environment zone.
- **A strategy** in ordered steps, each tied to a documented control and its source, with draft policy settings for an administrator to review.
- **Weekly change sets** so new and changed connectors can be triaged.
- **Open data**: the full catalogue as CSV and JSON, with published JSON Schemas and a versioning policy. See the Data page on the site.

## How the logic works

There is deliberately no risk score. See the Method page on the site for the reasoning and measured accuracy.

1. **Facts** from Microsoft Learn and Microsoft's connector repository.
2. **Derived traits**, using the open rules in `config/` and `pipeline/derive.py`.
3. **Your criteria**, set in the browser.
4. **The result**, from `site/js/engine.js`, which also checks that a documented control can carry out each decision.

Every claim about Microsoft behaviour is a record in `data/facts.yaml`, with short evidence phrases that are checked against the source page on every refresh.

## How it keeps itself up to date

| When | Workflow | What it does |
|---|---|---|
| Every Monday, 05:17 UTC | `refresh.yml` | Crawls Microsoft Learn and Microsoft's connector repository, re-derives every trait, rechecks every fact, validates the data against its schemas, runs every test including the browser and accessibility checks, commits the data and deploys the site. |
| Every day, 09:43 UTC | `watchdog.yml` | Reads the data date from the **live site**. If it is more than 8 days old, it opens a *Data freshness alert* issue, re-enables and restarts the refresh, and fails so GitHub notifies the owner. It closes the issue when the data is current again. |
| Every push to `main` | `ci.yml` | Runs every check, then deploys code and content changes. |

Fail-safes: if the connector count falls by more than 5%, more than 2% of pages cannot be parsed, or any check fails, nothing is published and the last good data stays live. A failed refresh opens an issue. On the site, every page shows a warning banner if the data is more than 8 days old, and the **Data status** page shows the last refresh, the next scheduled one, the results of the last run's checks and the commit that built the live site.

### If an alert fires

1. Open the latest *Weekly refresh* run from the alert issue and read the failed step.
2. A **fail-safe** stop usually means Microsoft changed a page layout. Fix the parser in `pipeline/extract.py`, run `python -m pipeline.run --use-cache` locally, and merge. The next scheduled or manual run publishes.
3. A **fact under review** means a source page no longer contains its evidence phrase. Read the source, then update the fact in `data/facts.yaml`.
4. If scheduled workflows were **disabled**, which GitHub does after 60 days without repository activity, enable them on the Actions tab. The watchdog tries to re-enable the refresh itself.
5. To refresh straight away, run *Weekly refresh* from the Actions tab.

## Quality gates

Every pull request and every weekly refresh runs:

| Check | Command |
|---|---|
| Pipeline unit tests | `python -m pytest pipeline/tests -q` |
| Decision engine and freshness rules | `npm test` |
| House style: British spelling, no en or em dashes | `python -m pipeline.style_lint` |
| Data matches its published JSON Schemas | `python -m pipeline.validate_data` |
| Every page renders without errors in light and dark themes, passes axe-core WCAG 2.1 AA rules, has no horizontal scroll at phone width, and every internal link and file resolves | `npm run test:site` |

## Running locally

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt     # on Windows: .venv\Scripts\pip
npm ci
npx playwright install chromium

.venv/bin/python -m pipeline.run              # crawl and derive; takes a while
.venv/bin/python -m pipeline.build_site
python -m http.server 4173 --directory _site
```

## Layout

| Path | Purpose |
|---|---|
| `pipeline/` | Crawler, extractor, derivation, fact checks, schema validation, site build and weekly run |
| `config/` | Curated lists and operation classification rules |
| `data/facts.yaml` | Governance facts and sources |
| `data/current/` | Generated site data |
| `data/changes/` | Generated weekly change sets |
| `schema/` | JSON Schemas for every published data file |
| `site/` | The static site, with no build step or third-party runtime dependencies |
| `tests/` | Decision engine, freshness and end-to-end site tests |
| `docs/` | [Architecture](docs/ARCHITECTURE.md) and [design system](docs/DESIGN.md) |

## Versions

The decision method and the data schema are versioned separately in `pipeline/versions.py`, which explains when to raise each part. Changes are recorded in [CHANGELOG.md](CHANGELOG.md). The live site shows both versions on its Data status page.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to report a correction or make a change, and [SECURITY.md](SECURITY.md) for how to report a security problem privately.

## Licences

Code is under the [MIT licence](LICENSE). Data, schemas and written content are under [CC BY 4.0](LICENSE-DATA.md).

## Microsoft product icons

`site/img/microsoft/` holds unaltered icons from Microsoft's [Power Platform icons](https://learn.microsoft.com/en-us/power-platform/guidance/icons) download. They remain Microsoft's, are not covered by this repository's licences, and are used under Microsoft's published terms: only to identify the product each was designed for, with its name beside it. None represents this tool. Azure Logic Apps is not in that set, so it appears as its name alone.

## Disclaimer

This site gives indicative assessments and suggested approaches for Power Platform connectors, derived from public Microsoft documentation. It is not an official Microsoft assessment and does not replace an organisation's own risk assessment. Check each connector's Microsoft Learn page and test any policy change outside production before applying it.
