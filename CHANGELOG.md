# Changelog

Notable changes to the decision method, the published data schema and the site. The format follows [Keep a Changelog](https://keepachangelog.com/en-GB/1.1.0/). Weekly data refreshes are not listed here: see the Changes page on the site.

Versions are explained in `pipeline/versions.py`.

## Unreleased

No decision or schema changes.

### Added

- **Power Platform edition** in `powerplatform/`: Dataverse tables for connectors, operations, traits, changes, refreshes, governance facts, risk profiles and decisions, with a repeatable provisioning script and an incremental sync from the weekly data. A **Dataverse sync** workflow runs it after each refresh once configured.
- **Code app** for Power Apps (React, TypeScript, Fluent UI) with overview, catalogue, connector, changes, criteria, decisions and method screens. It uses the site's engine unchanged, and a test checks that every connector gets the same treatment in every zone through Dataverse as on the site.
- **Power Platform checks** workflow for the sync tests, the app's type check, lint, tests and builds.

### Changed

- **New visual design.** A neutral palette with one accent, the Inter typeface (self-hosted), hairline borders in place of heavy shadows, a tighter type scale with tabular figures, quieter tables and badges, and a light hero in place of the dark gradient band. Both themes and every page pass the automated accessibility checks.
- Front-end modules and functions are documented with JSDoc, and `docs/` now explains the architecture and the design system.

### Fixed

- Scrolling tables are now keyboard-focusable, labelled regions.
- Browser-test jobs run on Ubuntu 24.04, which Playwright supports.

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
