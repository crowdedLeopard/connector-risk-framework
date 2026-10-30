# Connector Risk Framework

An interactive tool for deciding how to govern Power Platform connectors. It shows what each connector can call and where it reaches, lets an organisation set what it will accept in each environment zone, and generates a management strategy that uses only documented controls.

It is guidance, not enforcement. It never signs in to a tenant or calls Microsoft admin APIs, and settings stay in the reader's browser.

## How the logic works

There is deliberately no risk score. See the Method page on the site for the reasoning and measured accuracy.

1. **Facts** from Microsoft Learn and Microsoft's connector repository.
2. **Derived traits**, using the open rules in `config/` and `pipeline/derive.py`.
3. **Your criteria**, set in the browser.
4. **The result**, from `site/js/engine.js`, which also checks that a documented control can carry out each decision.

Every claim about Microsoft behaviour is a record in `data/facts.yaml`, with short evidence phrases that are checked against the source page on every refresh.

## Layout

| Path | Purpose |
|---|---|
| `pipeline/` | Crawler, extractor, derivation, fact checks and weekly run |
| `config/` | Curated lists and operation classification rules |
| `data/facts.yaml` | Governance facts and sources |
| `data/current/` | Generated site data |
| `data/changes/` | Generated weekly change sets |
| `site/` | The static site, with no build step or third-party runtime dependencies |
| `tests/` | Decision engine tests |

## Running locally

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python -m pipeline.run
.venv/Scripts/python -m pipeline.build_site
python -m http.server 4173 --directory _site
```

## Checks

```bash
.venv/Scripts/python -m pytest pipeline/tests -q
```

```bash
node --test tests/engine.test.mjs
```

```bash
.venv/Scripts/python -m pipeline.style_lint
```

## Weekly refresh

`.github/workflows/refresh.yml` runs every Monday and can be started by hand. It crawls, checks, commits the data and deploys to GitHub Pages in the same run, because a push made with `GITHUB_TOKEN` does not start other workflows. It opens an issue for new connectors, changed sources and failures. If the connector count falls by more than 5%, or more than 2% of pages cannot be parsed, it stops and the last good data stays live.

## Disclaimer

This site gives indicative assessments and suggested approaches for Power Platform connectors, derived from public Microsoft documentation. It is not an official Microsoft assessment and does not replace an organisation's own risk assessment. Check each connector's Microsoft Learn page and test any policy change outside production before applying it.
