# Changelog

Notable changes to the decision method, the published data schema and the site. The format follows [Keep a Changelog](https://keepachangelog.com/en-GB/1.1.0/). Weekly data refreshes are not listed here: see the Changes page on the site.

Versions are explained in `pipeline/versions.py`.

## Method 1.0.0, schema 1.0 (2026-11-13)

First formally versioned release. No decision changes from the previous site.

### Added

- **Data status page** showing when the data was last refreshed, the next scheduled refresh, the checks from the last run, and which commit and workflow run built the live site.
- **Stale-data banner** on every page if the data is more than 8 days old.
- **Freshness watchdog** workflow that checks the live site every day, opens an issue and restarts the refresh if the data is overdue.
- **Published data contract**: JSON Schemas for every data file in `schema/`, checked on every pull request and before every refresh is published.
- **Data and downloads page** with the full catalogue as CSV and JSON, a field dictionary and the versioning policy.
- **About page** with scope, known limitations, disclaimer, privacy, security reporting and licences.
- **Quality gates** in CI and in the weekly refresh: every page is rendered in a real browser in light and dark themes, checked with axe-core against WCAG 2.1 AA rules, checked at phone width for horizontal scrolling, and every internal link and file is followed.
- Content-Security-Policy, security policy, contributing guide, issue and pull request templates, code owners and Dependabot.
- Licences: MIT for code, CC BY 4.0 for data and content.

### Changed

- The npm lockfile now resolves from the public npm registry, so `npm ci` works on GitHub-hosted runners.
