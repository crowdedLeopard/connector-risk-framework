# Security policy

## Reporting a problem

Please report security problems privately, using GitHub's [private vulnerability reporting](https://github.com/crowdedLeopard/connector-risk-framework/security/advisories/new). Do not open a public issue.

You should get an acknowledgement within five working days. We will tell you what we plan to do, and credit you in the changelog if you would like.

## Scope

The site is static. It has no server, sign-in, cookies or analytics, and it never contacts a Microsoft tenant. Settings stay in the reader's browser. Reports that matter most:

- Script injection through connector data, settings files or the address bar.
- A way for crafted data from Microsoft Learn to reach the published site without passing the pipeline checks.
- Weaknesses in the GitHub Actions workflows, such as excessive token permissions or untrusted input reaching a shell.
- Exported CSV that a spreadsheet program would run as a formula.

Out of scope: findings that need a compromised browser or device, missing headers that GitHub Pages does not let us set, and the accuracy of connector data (please [open an issue](https://github.com/crowdedLeopard/connector-risk-framework/issues/new/choose) for that).

## How the site is protected

- A Content-Security-Policy allows scripts only from the site itself and blocks plugins and framing of forms.
- All text from data is escaped before it is shown, and only `https` links from data are rendered.
- CSV exports prefix cells that start with formula characters.
- Workflows run with read-only tokens by default, and each job is granted only the permissions it needs.
- Dependabot keeps GitHub Actions, Python and npm dependencies up to date.
