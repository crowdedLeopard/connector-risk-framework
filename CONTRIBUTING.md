# Contributing

Thank you for helping keep this tool accurate. The most useful contributions are corrections: a connector shown with the wrong trait, a fact whose source has changed, or a control that works differently from how it is described.

## Reporting a correction

[Open an issue](https://github.com/crowdedLeopard/connector-risk-framework/issues/new/choose) and choose **Data correction**. Include the connector or fact, what is wrong, and a link to the Microsoft source that shows it. Corrections without a source cannot be accepted, because every claim on the site has to be traceable.

## Making a change

1. Fork the repository and create a branch.
2. Make the change. Where things live:
   - Curated lists and judgement calls: `config/curated.yaml`
   - Operation classification rules: `config/operation-classes.yaml`
   - Governance facts and their evidence phrases: `data/facts.yaml`
   - Decision logic: `site/js/engine.js`
   - Derivation of traits from crawled pages: `pipeline/derive.py`
3. Do not edit `data/current/` or `data/changes/` by hand. The weekly refresh writes them.
4. Run the checks below, then open a pull request and fill in the template.

## Checks

Every pull request runs these in CI. Run them locally first:

```bash
pip install -r requirements.txt
npm ci
npx playwright install chromium

python -m pytest pipeline/tests -q      # pipeline unit tests
npm test                                # decision engine and freshness rules
python -m pipeline.style_lint           # house style
python -m pipeline.validate_data        # data matches its JSON Schemas
python -m pipeline.build_site
npm run test:site                       # every page renders, passes axe accessibility checks, and links resolve
```

## House style

- British spelling, plain English and short sentences.
- No en or em dashes in anything a reader sees. The style check enforces both.
- Statements about Microsoft behaviour go in `data/facts.yaml` with a source and evidence phrases, in our own words. Link to Microsoft text rather than copying it.
- Label judgement as judgement. If something is our opinion rather than Microsoft's documentation, the site must say so.

## Versioning

Changes that alter a decision need a method version bump in `pipeline/versions.py` and an entry in `CHANGELOG.md`. Changes to the shape of published data need a schema version bump and an updated schema in `schema/`. `pipeline/versions.py` explains which part of the version to raise.

## Licence

By contributing, you agree that code is licensed under the MIT licence in [`LICENSE`](LICENSE) and data and written content under CC BY 4.0, as described in [`LICENSE-DATA.md`](LICENSE-DATA.md).
