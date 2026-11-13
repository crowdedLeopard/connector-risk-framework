// Data status, the data contract and the About page. The freshness rules here match
// .github/workflows/watchdog.yml, which checks the live site every day.
import { fmt, h, plural, store } from "./ui.js";

export const REPO_URL = "https://github.com/crowdedLeopard/connector-risk-framework";
// The weekly refresh runs on Mondays at 05:17 UTC (see refresh.yml).
const REFRESH_DAY = 1;
const REFRESH_HOUR = 5;
const REFRESH_MINUTE = 17;
// A run can be late or fail once without alarm. After this many days the data counts as overdue.
export const LATE_AFTER_DAYS = 8;
export const STALE_AFTER_DAYS = 15;

const DAY = 86400000;

export function ageInDays(dataDate, now = new Date()) {
  const then = Date.parse(`${dataDate}T00:00:00Z`);
  if (Number.isNaN(then)) return Infinity;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((today - then) / DAY));
}

export function freshness(dataDate, now = new Date()) {
  const days = ageInDays(dataDate, now);
  if (days > STALE_AFTER_DAYS) return { days, state: "stale", label: "Out of date" };
  if (days > LATE_AFTER_DAYS) return { days, state: "late", label: "Refresh overdue" };
  return { days, state: "current", label: "Up to date" };
}

export function nextRefresh(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), REFRESH_HOUR, REFRESH_MINUTE));
  const ahead = (REFRESH_DAY - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + ahead);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

const longDate = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const ago = (days) => (days === 0 ? "today" : days === 1 ? "yesterday" : `${fmt(days)} days ago`);

export async function loadBuild() {
  if (store.build !== undefined) return store.build;
  store.build = await fetch("data/current/build.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return store.build;
}

/* ---------- Footer stamp and the stale-data banner ---------- */
export function renderFreshness() {
  const { meta, facts } = store;
  const f = freshness(meta.dataDate);
  document.getElementById("data-stamp").innerHTML = `<a class="status-link" href="#/status"><span class="status-dot ${f.state}" aria-hidden="true"></span>Data status: ${h(f.label)}</a>. Catalogue from Microsoft Learn, refreshed ${h(meta.dataDate)}. Sources last checked ${h(facts.checked)}.`;
  const banner = document.getElementById("stale-banner");
  if (f.state === "current") {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.className = `stale-banner ${f.state}`;
  banner.innerHTML = `<div class="wrap"><strong>${h(f.label)}.</strong> The connector data was last refreshed on ${h(meta.dataDate)}, ${ago(f.days)}. It normally refreshes every Monday, so recent changes on Microsoft Learn may be missing. <a href="#/status">See data status</a>.</div>`;
}

/* ---------- Status ---------- */
export async function renderStatus(main) {
  const { meta, facts } = store;
  const build = await loadBuild();
  const f = freshness(meta.dataDate);
  const next = nextRefresh();
  const verified = facts.facts.filter((x) => x.status === "verified").length;
  const review = facts.facts.length - verified;
  const parsed = meta.counts.catalogue - meta.parseFailures.length;
  const fetchErrors = Object.keys(facts.fetchErrors ?? {}).length;
  const commit = build?.commit ? `<a href="${REPO_URL}/commit/${h(build.commit)}"><code>${h(build.commit.slice(0, 7))}</code></a>` : "Local build";
  const check = (ok, text) => `<li class="check ${ok ? "ok" : "warn"}"><span class="status-dot ${ok ? "current" : "late"}" aria-hidden="true"></span><span>${text}</span></li>`;
  main.innerHTML = `
    <h1>Data status</h1>
    <p class="lede">This site updates itself. A scheduled job recrawls Microsoft Learn every week, checks the result and redeploys. A second job checks this live site every day and raises an alert if the data has stopped updating.</p>

    <section class="status-hero card ${f.state}" aria-labelledby="status-now">
      <span class="status-dot big ${f.state}" aria-hidden="true"></span>
      <div><h2 id="status-now">${h(f.label)}</h2>
        <p>Connector data refreshed on <strong>${h(meta.dataDate)}</strong>, ${ago(f.days)}. Next scheduled refresh: <strong>${h(longDate(next))}, 05:17 UTC</strong>.</p></div>
    </section>

    <h2>Checks from the last refresh</h2>
    <ul class="checks">
      ${check(f.state === "current", `Data is no more than ${LATE_AFTER_DAYS} days old (now ${plural(f.days, "day")}).`)}
      ${check(meta.parseFailures.length === 0, `${fmt(parsed)} of ${fmt(meta.counts.catalogue)} connector pages parsed.${meta.parseFailures.length ? ` Shown with partial data: ${meta.parseFailures.map((s) => `<a href="#/c/${encodeURIComponent(s)}">${h(s)}</a>`).join(", ")}.` : ""}`)}
      ${check(review === 0, `${verified} of ${facts.facts.length} governance facts confirmed on their source pages on ${h(facts.checked)}.${review ? ` ${plural(review, "fact")} under review.` : ""}`)}
      ${check(fetchErrors === 0, fetchErrors ? `${plural(fetchErrors, "source page")} could not be fetched at the last check.` : "Every source page could be fetched.")}
    </ul>

    <h2>How the data stays current</h2>
    <ol class="plain timeline">
      <li><strong>Every Monday, 05:17 UTC.</strong> The <em>Weekly refresh</em> workflow crawls the connector catalogue on Microsoft Learn and Microsoft's connector repository, re-derives every trait, checks each governance fact against its source, validates the data against its published schema, runs the full test suite, commits the data and redeploys this site.</li>
      <li><strong>Built-in fail-safes.</strong> If the connector count falls by more than 5%, more than 2% of pages cannot be parsed, or any check fails, nothing is published and the last good data stays live. A failed run opens an issue in the repository.</li>
      <li><strong>Every day.</strong> The <em>Freshness watchdog</em> workflow reads the data date from this live site. If the data is more than ${LATE_AFTER_DAYS} days old, it opens an issue, starts a new refresh, and fails, so the repository owner is notified by GitHub.</li>
      <li><strong>On this page.</strong> If the data is more than ${LATE_AFTER_DAYS} days old, every page shows a warning banner, so nobody relies on old data without knowing.</li>
    </ol>

    <h2>This deployment</h2>
    <div class="table-scroll" style="max-width:640px"><table><tbody>
      <tr><th scope="row">Built</th><td>${build ? h(build.builtAt.replace("T", " ").replace("Z", " UTC")) : "Unknown"}</td></tr>
      <tr><th scope="row">Commit</th><td>${commit}</td></tr>
      <tr><th scope="row">Built by</th><td>${build?.runUrl ? `<a href="${h(build.runUrl)}">${h(build.workflow ?? "Workflow run")}</a>` : "Local build"}</td></tr>
      <tr><th scope="row">Method version</th><td>${h(build?.methodVersion ?? "Unknown")} <span class="small muted">(<a href="${REPO_URL}/blob/main/CHANGELOG.md">changelog</a>)</span></td></tr>
      <tr><th scope="row">Data schema version</th><td>${h(build?.schemaVersion ?? "Unknown")} <span class="small muted">(<a href="#/data">data and downloads</a>)</span></td></tr>
    </tbody></table></div>
    <p class="small"><a href="${REPO_URL}/actions">All workflow runs</a> · <a href="${REPO_URL}/issues">Open issues</a> · <a href="#/changes">What changed each week</a></p>`;
  return "Data status";
}

/* ---------- Data and downloads ---------- */
const INDEX_FIELDS = [
  ["s", "slug", "Stable identifier, also the Microsoft Learn page name"], ["n", "name", "Display name"],
  ["p", "publisher", "Publisher named on Learn"], ["pt", "publisherType", "microsoft, independent or other"],
  ["o", "origin", "Where the service runs: microsoft, third-party, maker-defined or unstated"],
  ["c", "categories", "Categories on Learn, chosen by the publisher"], ["sv", "products", "Products the connector works in"],
  ["pr", "premium", "Premium licence class"], ["pv", "preview", "Marked Preview"], ["dp", "deprecated", "Marked deprecated"],
  ["m", "mcp", "Is an MCP server"], ["x", "traits", "Derived trait IDs (see the Method page)"],
  ["cc", "operationClasses", "Operations per class: read, write, delete, send, raw, admin, other"],
  ["la", "currentActions", "Actions not marked deprecated"], ["tr", "triggers", "Number of triggers"],
  ["k", "kind", "Empty for ordinary connectors, otherwise the kind of built-in item"],
  ["fs", "firstSeen", "Date this tool first saw the connector"], ["api", "apiId", "API ID used in data policies"],
  ["cd", "definitionMatched", "A published definition was matched in Microsoft's repository"],
  ["ct", "controls", "Which documented controls can apply to it"],
];

export async function renderData(main) {
  const build = await loadBuild();
  const { meta } = store;
  const file = (path, schema, what) => `<tr><td><a href="${h(path)}"><code>${h(path)}</code></a></td><td>${what}</td><td>${schema ? `<a href="schema/${schema}"><code>${schema}</code></a>` : ""}</td></tr>`;
  main.innerHTML = `
    <h1>Data and downloads</h1>
    <p class="lede">Everything this site shows comes from static files you can download or read from your own tools. They are refreshed every week and each one has a published JSON Schema.</p>

    <h2>Downloads</h2>
    <div class="grid two">
      <a class="card download-card" href="downloads/connectors.csv" download><strong>Catalogue as CSV</strong><span class="small muted">${fmt(store.index.length)} rows, opens in Excel. Data from ${h(meta.dataDate)}.</span></a>
      <a class="card download-card" href="downloads/connectors.json" download><strong>Catalogue as JSON</strong><span class="small muted">The same rows with readable field names.</span></a>
    </div>
    <p class="small">These contain facts and derived traits only. Your own treatments depend on your risk profile: use <a href="#/connectors">Download this view as CSV</a> on the Connectors page, or the exports on your strategy.</p>

    <h2>Files and schemas</h2>
    <p>Paths are relative to this site's address. Data schema version <strong>${h(build?.schemaVersion ?? "1.0")}</strong>.</p>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">File</th><th scope="col">What it holds</th><th scope="col">Schema</th></tr></thead>
      <tbody>
        ${file("data/current/index.json", "index.schema.json", "One compact row per connector. Field names are below.")}
        ${file("data/current/connectors/sharepointonline.json", "connector.schema.json", "Everything known about one connector: operations, authentication, products and evidence for each trait. One file per slug.")}
        ${file("data/current/meta.json", "meta.schema.json", "Refresh date, counts and classifier measurements.")}
        ${file("data/current/facts.json", "facts.schema.json", "Every governance fact, its source and the result of the last check.")}
        ${file("data/changes/index.json", "", "List of weekly change sets, newest first.")}
        ${file("data/current/build.json", "build.schema.json", "Which commit and workflow run built this deployment.")}
      </tbody></table></div>

    <h2>Fields in the index and the downloads</h2>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Index key</th><th scope="col">Download name</th><th scope="col">Meaning</th></tr></thead>
      <tbody>${INDEX_FIELDS.map(([k, n, d]) => `<tr><td><code>${k}</code></td><td><code>${n}</code></td><td>${h(d)}</td></tr>`).join("")}</tbody></table></div>

    <h2>Versioning</h2>
    <div class="prose">
      <p>The data schema has a version. Fields may be added in a minor version. Removing or renaming a field needs a new major version, announced in the <a href="${REPO_URL}/blob/main/CHANGELOG.md">changelog</a> first. The decision method has its own version, so you can record which one produced a strategy.</p>
      <p>Every refresh is a commit, so any earlier state of the data can be retrieved from the <a href="${REPO_URL}/commits/main/data/current">repository history</a>.</p>
    </div>`;
  return "Data and downloads";
}

/* ---------- About ---------- */
export async function renderAbout(main) {
  const build = await loadBuild();
  main.innerHTML = `
    <h1>About this tool</h1>
    <p class="lede">The Connector Risk Framework helps Power Platform administrators decide what each connector may do in each type of environment, and which documented control carries out that decision.</p>

    <h2>What it is, and what it is not</h2>
    <div class="prose">
      <ul class="plain">
        <li><strong>It is guidance.</strong> It never signs in to a tenant, calls Microsoft admin APIs or changes a policy. Drafts it produces are for an administrator to review and test.</li>
        <li><strong>It is independent.</strong> It is built from public Microsoft documentation and is not a Microsoft product or an official Microsoft assessment.</li>
        <li><strong>It assesses exposure, not likelihood.</strong> It shows what a connector can do and where it reaches. It does not estimate how likely harm is, and it does not give a risk score. <a href="#/method">Read why</a>.</li>
      </ul>
    </div>

    <h2>Known limitations</h2>
    <div class="prose">
      <ul class="plain">
        <li>Data is only as complete as Microsoft Learn. Some connectors list no operations, authentication or category. The <a href="#/method">Method page</a> gives the measured coverage.</li>
        <li>Operation classes come from words in operation names, checked against published HTTP methods where they exist. They can be wrong for individual operations.</li>
        <li>Some lists rely on judgement, such as which services are personal or consumer services. Each is labelled where it is used.</li>
        <li>Custom connectors, and connectors visible only inside a tenant, are not in the catalogue.</li>
        <li>Data can be up to a week old. Check the <a href="#/status">data status</a> before relying on a recent change.</li>
      </ul>
    </div>

    <h2>Disclaimer</h2>
    <p class="prose">This site gives indicative assessments and suggested approaches for Power Platform connectors, derived from public Microsoft documentation. It is not an official Microsoft assessment and does not replace an organisation's own risk assessment. Check each connector's Microsoft Learn page and test any policy change outside production before applying it. The tool is provided as is, without warranty of any kind.</p>

    <h2>Privacy</h2>
    <p class="prose">The site is static. It sets no cookies, has no analytics or sign-in, and loads nothing from third parties. Your risk profile and decisions are saved only in this browser's local storage, and you can export or delete them on the <a href="#/build">Risk profile</a> page.</p>

    <h2>Security</h2>
    <p class="prose">To report a security problem, use <a href="${REPO_URL}/security/advisories/new">private vulnerability reporting</a> on GitHub rather than a public issue. The <a href="${REPO_URL}/blob/main/SECURITY.md">security policy</a> says what is in scope.</p>

    <h2>Corrections and contributions</h2>
    <p class="prose">If a connector's data or a fact looks wrong, <a href="${REPO_URL}/issues/new/choose">open an issue</a> with a link to the source. The <a href="${REPO_URL}/blob/main/CONTRIBUTING.md">contributing guide</a> explains how changes are checked.</p>

    <h2>Licences</h2>
    <p class="prose">The source code is under the <a href="${REPO_URL}/blob/main/LICENSE">MIT licence</a>. The data, schemas and written content are under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, so you can reuse them, including commercially, if you credit this tool. See <a href="${REPO_URL}/blob/main/LICENSE-DATA.md">what each licence covers</a>.</p>

    <h2>Version</h2>
    <p class="prose">Method version ${h(build?.methodVersion ?? "unknown")}, data schema version ${h(build?.schemaVersion ?? "unknown")}. See the <a href="${REPO_URL}/blob/main/CHANGELOG.md">changelog</a> and the <a href="${REPO_URL}">source code</a>.</p>

    <h2>Microsoft product icons</h2>
    <p class="prose">Microsoft product icons are shown unaltered, only to identify the product each was designed for, under <a href="https://learn.microsoft.com/en-us/power-platform/guidance/icons">Microsoft's published icon terms</a>. They remain Microsoft's and do not represent this tool.</p>`;
  return "About";
}
