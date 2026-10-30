// Page views. Every number on the site is computed from the data at render time.
import { EXPOSURES, EXPOSURE_BY_ID, GROUPS, PRESETS, TOLERANCES, TOLERANCE_LABELS, TREATMENTS, ZONES, acpDraft, actionRulesDraft, defaultSettings, evaluate, exposureCounts, summarise } from "./engine.js";
import { announce, bar, cite, connectorDetail, connectorDetails, csv, download, fmt, h, icon, legend, pill, plural, resultsFor, saveSettings, store } from "./ui.js";

const safeUrl = (url) => (/^https?:\/\//i.test(url ?? "") ? url : "");
const zoneById = (id) => ZONES.find((z) => z.id === id);
const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "n/a");

const CLASS_LABELS = {
  read: "Reads data", write: "Creates or changes data", delete: "Deletes or removes data", send: "Sends or shares data",
  raw: "Runs raw requests, queries or scripts", admin: "Administers platform, identity or access", other: "Purpose not clear from its name",
};
const CLASS_ORDER = ["admin", "raw", "delete", "send", "write", "read", "other"];
const SHORT_CLASS = { read: "Reads", write: "Writes", delete: "Deletes", send: "Sends", raw: "Raw", admin: "Admin" };

function zoneSelect(id = "zone-select") {
  return `<label class="field" for="${id}">Environment zone<select id="${id}">${ZONES.map((z) => `<option value="${z.id}" ${store.zone === z.id ? "selected" : ""}>${h(z.label)}</option>`).join("")}</select></label>`;
}

function zoneBars() {
  return ZONES.map((z) => {
    const counts = summarise(resultsFor(z.id));
    return `<div class="bar-row"><div class="bar-label"><span>${h(z.label)}</span></div>${bar(counts)}</div>`;
  }).join("") + legendAll();
}

function legendAll() {
  return `<ul class="legend">${Object.keys(TREATMENTS).map((k) => `<li><i class="seg-${k}"></i>${h(TREATMENTS[k].label)}</li>`).join("")}</ul>`;
}

/* ---------- Home ---------- */
export function renderHome(main) {
  const { counts, dataDate } = store.meta;
  const verified = store.facts.facts.filter((f) => f.status === "verified").length;
  main.innerHTML = `
    <section class="hero">
      <h1>Decide what every Power Platform connector may do in your organisation.</h1>
      <p class="lede">See what each connector can call and where it reaches. Set what your organisation will accept. Get a strategy that uses only controls Microsoft documents, with their limits stated.</p>
      <div class="actions">
        <a class="btn primary" href="#/criteria">Set what matters</a>
        <a class="btn" href="#/connectors">Browse ${fmt(counts.catalogue)} connectors</a>
      </div>
    </section>
    <div class="stats">
      <div class="stat"><b>${fmt(counts.catalogue)}</b><span>connectors on Microsoft Learn</span></div>
      <div class="stat"><b>${fmt(counts.operations)}</b><span>operations listed</span></div>
      <div class="stat"><b>${fmt(counts.operationsWithCall)}</b><span>operations with a published HTTP call</span></div>
      <div class="stat"><b>${verified} of ${store.facts.facts.length}</b><span>governance facts confirmed on their source pages on ${h(store.facts.checked)}</span></div>
    </div>
    <div class="grid two">
      <div class="card">
        <h2 style="margin-top:0">Under your current settings</h2>
        <p class="small muted">Preset: ${h(store.settings.preset ? PRESETS[store.settings.preset].label : "Customised")}. The same catalogue gives a different answer in each zone.</p>
        ${zoneBars()}
        <p class="small" style="margin-top:1rem"><a href="#/strategy">See the strategy this produces</a></p>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Find a connector</h2>
        <form id="home-search" role="search">
          <label class="field" for="home-q">Connector name or publisher<input id="home-q" type="search" autocomplete="off"></label>
          <button class="btn small" style="margin-top:.6rem" type="submit">Search</button>
        </form>
        <p class="small muted" style="margin-top:1rem">Examples:
          ${["sharepointonline", "sql", "gmail", "smtp", "openaiip", "powerplatformforadmins"].map((s) => `<a href="#/c/${s}">${h(store.bySlug.get(s)?.n ?? s)}</a>`).join(", ")}.</p>
      </div>
    </div>
    <h2>How it reaches an answer</h2>
    <div class="grid four">
      <div class="card"><span class="layer-tag fact">Fact</span><h3 style="margin-top:0">What Microsoft states</h3><p class="small">Operations, authentication types, publisher and available controls, each with its source.</p></div>
      <div class="card"><span class="layer-tag derived">Derived</span><h3 style="margin-top:0">What the facts show</h3><p class="small">Whether an operation reads, deletes or sends, and where data can go. The rule and evidence are shown, and accuracy is measured.</p></div>
      <div class="card"><span class="layer-tag choice">Your choice</span><h3 style="margin-top:0">What you will accept</h3><p class="small">Your limits for each zone. Only your organisation can set these, so the tool does not pretend to know them.</p></div>
      <div class="card"><span class="layer-tag result">Result</span><h3 style="margin-top:0">What to do</h3><p class="small">A treatment for each connector, tied to a control that can carry it out, or a clear statement that none can.</p></div>
    </div>
    <h2>Why there is no risk score</h2>
    <div class="prose">
      <p>A score out of 100 looks precise, but weights and cut-offs would have to be invented, and public documentation holds no data on how often connectors cause incidents. Ratings built this way can also mislead: identical ratings can hide very different risks. ${cite(["matrices", "semi-quant"])}</p>
      <p>This tool ranks connectors by which of <em>your</em> limits they cross. It assesses exposure, not likelihood. <a href="#/method">Read the method</a>.</p>
    </div>
    <p class="small muted">Catalogue data from ${h(dataDate)}.</p>`;
  main.querySelector("#home-search").addEventListener("submit", (event) => {
    event.preventDefault();
    catalogueState.q = main.querySelector("#home-q").value;
    location.hash = "#/connectors";
  });
  return "Connector Risk Framework";
}

/* ---------- Catalogue ---------- */
const catalogueState = { q: "", treatment: "", publisher: "", origin: "", product: "", category: "", exposure: "", licence: "", sort: "name", shown: 50 };

function filterCatalogue(results) {
  const s = catalogueState;
  const q = s.q.trim().toLowerCase();
  const rows = [];
  store.index.forEach((c, i) => {
    const r = results[i];
    if (q && !c.n.toLowerCase().includes(q) && !c.p.toLowerCase().includes(q) && !c.s.includes(q)) return;
    if (s.treatment && r.treatment !== s.treatment) return;
    if (s.publisher && c.pt !== s.publisher) return;
    if (s.origin && c.o !== s.origin) return;
    if (s.product && !c.sv.includes(s.product)) return;
    if (s.category && !c.c.includes(s.category)) return;
    if (s.exposure && !c.x.includes(s.exposure)) return;
    if (s.licence === "premium" && !c.pr) return;
    if (s.licence === "standard" && c.pr) return;
    rows.push({ c, r });
  });
  const sorters = {
    name: (a, b) => a.c.n.localeCompare(b.c.n),
    limits: (a, b) => b.r.redLines - a.r.redLines || a.c.n.localeCompare(b.c.n),
    treatment: (a, b) => TREATMENTS[a.r.treatment].order - TREATMENTS[b.r.treatment].order || a.c.n.localeCompare(b.c.n),
    operations: (a, b) => (b.c.la + b.c.tr) - (a.c.la + a.c.tr) || a.c.n.localeCompare(b.c.n),
  };
  return rows.sort(sorters[s.sort]);
}

const ORIGIN_LABELS = { microsoft: "Microsoft service", "third-party": "Third-party service", "maker-defined": "Destination set by maker", unstated: "Not stated on Learn" };
const PUBLISHER_LABELS = { microsoft: "Microsoft", independent: "Independent publisher", other: "Other publisher" };

export function renderCatalogue(main) {
  const s = catalogueState;
  const option = (value, label, current) => `<option value="${h(value)}" ${current === value ? "selected" : ""}>${h(label)}</option>`;
  main.innerHTML = `
    <h1>Connectors</h1>
    <p class="lede">Every connector on Microsoft Learn, plus built-in items that appear in data policies. The treatment shown reflects <a href="#/criteria">your settings</a>.</p>
    <div class="filters no-print">
      <label class="field" for="f-q">Search<input id="f-q" type="search" value="${h(s.q)}" autocomplete="off"></label>
      ${zoneSelect()}
      <label class="field" for="f-treatment">Treatment<select id="f-treatment"><option value="">All</option>${Object.keys(TREATMENTS).map((k) => option(k, TREATMENTS[k].label, s.treatment)).join("")}</select></label>
      <label class="field" for="f-exposure">Has trait<select id="f-exposure"><option value="">Any</option>${EXPOSURES.filter((e) => e.id !== "sensitive-category").map((e) => option(e.id, e.label, s.exposure)).join("")}</select></label>
      <label class="field" for="f-origin">Service<select id="f-origin"><option value="">All</option>${Object.keys(ORIGIN_LABELS).map((k) => option(k, ORIGIN_LABELS[k], s.origin)).join("")}</select></label>
      <label class="field" for="f-publisher">Publisher<select id="f-publisher"><option value="">All</option>${Object.keys(PUBLISHER_LABELS).map((k) => option(k, PUBLISHER_LABELS[k], s.publisher)).join("")}</select></label>
      <label class="field" for="f-product">Product<select id="f-product"><option value="">All</option>${["Power Apps", "Power Automate", "Copilot Studio", "Logic Apps"].map((p) => option(p, p, s.product)).join("")}</select></label>
      <label class="field" for="f-category">Category on Learn<select id="f-category"><option value="">All</option>${store.meta.categories.map((c) => option(c, c, s.category)).join("")}</select></label>
      <label class="field" for="f-licence">Licence class<select id="f-licence"><option value="">All</option>${option("standard", "Standard", s.licence)}${option("premium", "Premium", s.licence)}</select></label>
      <label class="field" for="f-sort">Sort by<select id="f-sort">${option("name", "Name", s.sort)}${option("limits", "Your limits crossed", s.sort)}${option("treatment", "Treatment", s.sort)}${option("operations", "Number of operations", s.sort)}</select></label>
    </div>
    <div class="actions no-print" style="justify-content:space-between">
      <p id="result-count" class="small" style="margin:0" aria-live="polite"></p>
      <button class="btn small" id="export-view" type="button">Download this view as CSV</button>
    </div>
    <div class="table-scroll" style="margin-top:.8rem"><table>
      <caption class="visually-hidden">Connectors with their treatment for the chosen zone</caption>
      <thead><tr><th scope="col">Connector</th><th scope="col">Treatment</th><th scope="col" class="num">Your limits crossed</th><th scope="col">What it can do</th><th scope="col">Service</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
    <div class="actions" style="margin-top:1rem"><button class="btn" id="show-more" type="button">Show more</button></div>`;

  const body = main.querySelector("#rows");
  const count = main.querySelector("#result-count");
  const more = main.querySelector("#show-more");
  const draw = () => {
    const rows = filterCatalogue(resultsFor(store.zone));
    count.textContent = `${plural(rows.length, "connector")} match. Zone: ${zoneById(store.zone).label}.`;
    body.innerHTML = rows.slice(0, s.shown).map(({ c, r }) => {
      const chips = CLASS_ORDER.filter((k) => c.cc[k] && SHORT_CLASS[k]).map((k) => `<span class="chip ${["admin", "raw"].includes(k) ? "strong" : ""}">${SHORT_CLASS[k]} ${c.cc[k]}</span>`).join("");
      return `<tr><td><a href="#/c/${encodeURIComponent(c.s)}">${h(c.n)}</a><span class="sub">${h(c.k || c.p)}</span></td>
        <td>${pill(r.treatment)}${r.group && r.treatment !== "block" ? `<span class="sub">${h(r.group)} group</span>` : ""}</td>
        <td class="num">${r.redLines || ""}</td>
        <td>${chips || '<span class="muted small">Not listed</span>'}</td>
        <td class="small">${h(ORIGIN_LABELS[c.o])}</td></tr>`;
    }).join("") || '<tr><td colspan="5">No connector matches these filters.</td></tr>';
    more.hidden = rows.length <= s.shown;
    more.textContent = `Show ${fmt(Math.min(100, rows.length - s.shown))} more`;
  };
  const bind = (id, key) => main.querySelector(id).addEventListener(id === "#f-q" ? "input" : "change", (e) => { s[key] = e.target.value; s.shown = 50; draw(); });
  [["#f-q", "q"], ["#f-treatment", "treatment"], ["#f-exposure", "exposure"], ["#f-origin", "origin"], ["#f-publisher", "publisher"], ["#f-product", "product"], ["#f-category", "category"], ["#f-licence", "licence"], ["#f-sort", "sort"]].forEach(([id, key]) => bind(id, key));
  main.querySelector("#zone-select").addEventListener("change", (e) => { store.zone = e.target.value; draw(); });
  more.addEventListener("click", () => { s.shown += 100; draw(); });
  main.querySelector("#export-view").addEventListener("click", () => {
    const rows = filterCatalogue(resultsFor(store.zone));
    download(`connectors-${store.zone}.csv`, csv([
      ["Connector", "Connector ID (derived)", "Publisher", "Service", "Zone", "Treatment", "Group", "Limits crossed", "Traits", "Learn page"],
      ...rows.map(({ c, r }) => [c.n, c.api, c.p, ORIGIN_LABELS[c.o], zoneById(store.zone).label, TREATMENTS[r.treatment].label, r.group ?? "", r.redLines, c.x.join("; "), c.api ? `https://learn.microsoft.com/en-us/connectors/${c.s}/` : ""]),
    ]), "text/csv");
    announce("Download started.");
  });
  draw();
  return "Connectors";
}

/* ---------- Connector page ---------- */
function summarySentence(d) {
  if (d.summary) return d.summary;
  const service = d.origin === "maker-defined" ? "Connects to a destination the maker supplies" : d.serviceDomain ? `Website listed on Learn: ${d.serviceDomain}` : "Learn lists no website for this service";
  const cats = d.categories.length ? `. Category: ${d.categories.join(", ")}` : "";
  const liveTriggers = d.triggers.filter((o) => !o.deprecated).length;
  const verbs = CLASS_ORDER.filter((k) => d.classCounts[k] && k !== "other").map((k) => CLASS_LABELS[k].toLowerCase());
  const can = verbs.length ? ` Its actions: ${verbs.join("; ")}.` : "";
  return `${service}${cats}. Offers ${plural(d.liveActions, "current action")} and ${plural(liveTriggers, "current trigger")}.${can}`;
}

function why(items) {
  return items.map((w) => `<li>${h(w.text)} ${cite(w.facts)}</li>`).join("");
}

function operationsSection(d) {
  const all = [...d.actions, ...d.triggers];
  if (!all.length) return '<p>Microsoft Learn lists no operations on this page.</p>';
  const groups = {};
  for (const op of d.actions) (groups[op.deprecated ? "deprecated" : op.class] ??= []).push(op);
  if (d.triggers.length) groups.trigger = d.triggers;
  const labels = { ...CLASS_LABELS, deprecated: "Deprecated actions", trigger: "Triggers" };
  const order = [...CLASS_ORDER, "trigger", "deprecated"].filter((k) => groups[k]);
  const anyCall = all.some((o) => o.method);
  return `${order.map((k, i) => `
    <details class="op-class" ${i < 2 && k !== "deprecated" ? "open" : ""}>
      <summary><span>${h(labels[k])}</span><span class="muted">${groups[k].length}</span></summary>
      <div class="table-scroll"><table><thead><tr><th scope="col">Operation</th><th scope="col">Operation ID</th>${anyCall ? '<th scope="col">Published call</th>' : ""}<th scope="col">Required inputs</th></tr></thead>
      <tbody>${groups[k].map((o) => `<tr><td>${d.learnUrl ? `<a href="${h(d.learnUrl)}#${h(o.anchor)}" target="_blank" rel="noopener">${h(o.name)}</a>` : h(o.name)}${o.basis && o.basis !== "name" ? `<span class="sub">Classed by: ${h(o.basis)}</span>` : ""}</td>
        <td><code>${h(o.opId)}</code></td>
        ${anyCall ? `<td>${o.method ? `<span class="method">${h(o.method)}</span> <span class="path">${h(o.path)}</span>` : '<span class="muted small">Not published</span>'}</td>` : ""}
        <td class="small">${h(o.parameters.filter((p) => p.required).map((p) => p.name).join(", ")) || '<span class="muted">None listed</span>'}</td></tr>`).join("")}</tbody></table></div>
    </details>`).join("")}`;
}

export async function renderConnector(main, slug) {
  const c = store.bySlug.get(slug);
  if (!c) {
    main.innerHTML = `<h1>Connector not found</h1><p>No connector has the ID ${h(slug)}. It may have been removed. <a href="#/connectors">See all connectors</a>.</p>`;
    return "Not found";
  }
  const d = await connectorDetail(slug);
  const override = store.settings.overrides[slug] ?? "";

  const draw = () => {
    const results = ZONES.map((z) => ({ z, r: evaluate(c, store.settings.zones[z.id], store.settings) }));
    const def = d.definition;
    main.innerHTML = `
      <p class="small no-print"><a href="#/connectors">All connectors</a></p>
      <h1>${h(d.name)}</h1>
      <p class="lede">${h(summarySentence(d))}</p>
      <p>
        ${d.kind ? `<span class="chip">${h(d.kind)}</span>` : ""}
        ${d.publisher ? `<span class="chip">Publisher: ${h(d.publisher)}</span>` : ""}
        ${d.premium ? '<span class="chip">Premium</span>' : ""}${d.preview ? '<span class="chip">Preview</span>' : ""}${d.deprecated ? '<span class="chip">Deprecated</span>' : ""}${d.mcp ? '<span class="chip">MCP server</span>' : ""}
        ${d.services.map((s) => `<span class="chip">${h(s)}</span>`).join("")}
      </p>
      ${d.parseFailed ? '<div class="callout"><strong>This page could not be read on the last refresh.</strong> Only the overview listing is available here, so operations and authentication are missing. Read the page on Microsoft Learn.</div>' : ""}
      ${d.learnUrl ? `<p class="small"><a href="${h(d.learnUrl)}" target="_blank" rel="noopener">Read the full description on Microsoft Learn</a>. First seen by this tool on ${h(d.firstSeen)}.</p>` : ""}

      <h2>What this means for your policy</h2>
      <div class="zone-cards">${results.map(({ z, r }) => `
        <div class="card zone-card">
          <h3>${h(z.label)}</h3>
          <p style="margin-bottom:.4rem">${pill(r.treatment)} ${r.group && r.treatment !== "block" ? `<span class="small muted">${h(r.group)} group</span>` : ""}</p>
          ${r.redLines ? `<p class="small" style="margin:0">Limits of yours it crosses: ${r.redLines}.</p>` : ""}
          ${r.why.length || r.steps.length ? `<ul>${why(r.why)}${why(r.steps)}</ul>` : '<p class="small muted" style="margin:0">Nothing you have set applies here.</p>'}
        </div>`).join("")}</div>
      <p class="small muted" style="margin-top:.7rem">Based on <a href="#/criteria">your settings</a>. Change them and these results update.</p>

      <fieldset class="card no-print" style="margin-top:1rem">
        <legend class="group-title" style="float:left;margin:0 0 .5rem">Your decision for this connector</legend>
        <div style="clear:both" class="preset-grid">
          ${[["", "No decision", "Follow my settings."], ["approved", "Approved service", "We contract this service. Stop counting it as third party, personal, external AI or independent."], ["allow", "Always allow", "Allow in every zone."], ["block", "Always block", "Block in every zone, where a control can."]].map(([v, l, t]) => `
          <label class="radio-card"><input type="radio" name="override" value="${v}" ${override === v ? "checked" : ""}><span><strong>${h(l)}</strong><br><span class="small muted">${h(t)}</span></span></label>`).join("")}
        </div>
      </fieldset>

      <h2>What it can do</h2>
      <p class="prose small muted">Operation names and IDs come from Microsoft Learn. Each is classed by the words in its name, so read the classes as a guide. HTTP calls come from <a href="https://github.com/microsoft/PowerPlatformConnectors" target="_blank" rel="noopener">Microsoft's connector repository</a>, where a matching definition exists, and the deployed connector may differ.</p>
      ${operationsSection(d)}

      <h2>Where it reaches</h2>
      <dl class="card" style="margin:0">
        <dt><strong>Service</strong></dt><dd style="margin:0 0 .6rem">${h(ORIGIN_LABELS[d.origin])}. <span class="muted small">${h(d.originEvidence)}</span> ${cite(["publisher-owner"])}</dd>
        ${safeUrl(d.website) ? `<dt><strong>Website listed on Learn</strong></dt><dd style="margin:0 0 .6rem"><a href="${h(d.website)}" target="_blank" rel="noopener nofollow">${h(d.serviceDomain)}</a></dd>` : ""}
        ${safeUrl(d.privacyPolicy) ? `<dt><strong>Privacy policy listed on Learn</strong></dt><dd style="margin:0 0 .6rem"><a href="${h(d.privacyPolicy)}" target="_blank" rel="noopener nofollow">Open the policy</a></dd>` : ""}
        ${def?.host ? `<dt><strong>Host in the published definition</strong></dt><dd style="margin:0 0 .6rem"><code>${h(def.host)}${h(def.basePath === "/" ? "" : def.basePath)}</code></dd>` : ""}
        ${def?.scopes?.length ? `<dt><strong>OAuth scopes in the published definition</strong></dt><dd style="margin:0">${def.scopes.map((x) => `<span class="chip"><code>${h(x)}</code></span>`).join("")}</dd>` : ""}
        ${!def ? '<dt><strong>Published definition</strong></dt><dd style="margin:0" class="muted small">No matching definition found in Microsoft\'s connector repository, so hosts and HTTP calls are not shown.</dd>' : ""}
      </dl>

      <h2>How it connects</h2>
      ${d.authTypes.length ? `<div class="table-scroll"><table>
        <thead><tr><th scope="col">Authentication type</th><th scope="col">Shared with the app?</th><th scope="col">Stores a secret?</th><th scope="col">Regions</th></tr></thead>
        <tbody>${d.authTypes.map((a) => {
          const secret = a.parameters.some((p) => ["securestring", "clientCertificate"].includes(p.type));
          return `<tr><td>${h(a.nameResolved ? a.name : "Name not resolved on Learn")}<span class="sub">${h(a.parameters.map((p) => p.name).join(", "))}</span></td><td>${a.shareable ? "Shareable" : "Not shareable"}</td><td>${secret ? "Yes" : "None listed"}</td><td class="small">${h(a.regions)}</td></tr>`;
        }).join("")}</tbody></table></div><p>${cite(["shareable", "saved-credential"])}</p>` : '<p>This page lists no authentication types. That does not prove the connector needs none.</p>'}

      <h2>Traits and your limits</h2>
      <div class="table-scroll"><table>
        <thead><tr><th scope="col">Trait</th><th scope="col">Evidence</th><th scope="col">How we know</th>${ZONES.map((z) => `<th scope="col">${h(z.label)}</th>`).join("")}</tr></thead>
        <tbody>${EXPOSURES.filter((e) => d.exposures[e.id]).map((e) => `<tr><td><strong>${h(e.label)}</strong></td><td class="small">${h(d.exposures[e.id])} ${cite(e.facts)}</td><td class="small muted">${h(e.basis)}</td>
          ${ZONES.map((z) => `<td class="small">${h(TOLERANCE_LABELS[store.settings.zones[z.id][e.id]])}</td>`).join("")}</tr>`).join("") || '<tr><td colspan="6">No traits recorded.</td></tr>'}</tbody></table></div>

      <h2>Controls available</h2>
      <ul class="notes card" style="margin-bottom:1rem">
        <li><strong>Classic data policies:</strong> ${!d.controls.dataPolicy ? "not applicable" : !d.controls.classifiable ? "cannot be classified" : d.controls.nonblockable ? "Business or Non-Business only, cannot be blocked" : "Business, Non-Business or Blocked"}. ${cite(d.controls.nonblockable ? ["nonblockable"] : d.controls.classifiable ? ["groups"] : ["content-conversion"])}</li>
        <li><strong>Connector action control:</strong> ${d.controls.actionControl ? "available" : "not available"}. ${cite(["action-control"])}</li>
        <li><strong>Endpoint filtering:</strong> ${d.controls.endpointFiltering ? "available, for static endpoints, in preview" : "not available"}. ${cite(["endpoint-filtering"])}</li>
        <li><strong>Advanced connector policies:</strong> ${{ supported: "covered, as part of the certified catalogue", unconfirmed: "check in the admin center", unsupported: "not yet supported", "not-applicable": "not applicable" }[d.controls.acp]}. ${cite(["acp-unsupported"])}</li>
        ${results[0].r.notes.map((n) => `<li>${h(n.text)} ${cite(n.facts)}</li>`).join("")}
        ${d.facts ? `<li>${cite(d.facts)}</li>` : ""}
      </ul>
      ${d.apiId ? `<p class="small muted">Connector ID, derived from the page address: <code>${h(d.apiId)}</code>. Check it against <code>Get-AdminPowerAppConnectorAction</code> before use.</p>` : ""}
      <p class="small no-print"><a href="#" id="print-page">Print this page</a></p>`;

    main.querySelectorAll('input[name="override"]').forEach((input) => input.addEventListener("change", (e) => {
      if (e.target.value) store.settings.overrides[slug] = e.target.value;
      else delete store.settings.overrides[slug];
      saveSettings();
      announce("Decision saved. Results updated.");
      const value = e.target.value;
      draw();
      main.querySelector(`input[name="override"][value="${value}"]`)?.focus();
    }));
    main.querySelector("#print-page").addEventListener("click", (e) => { e.preventDefault(); window.print(); });
  };
  draw();
  return d.name;
}

/* ---------- What matters ---------- */
function impactPanel() {
  const results = resultsFor(store.zone);
  const counts = summarise(results);
  return `<h2 style="margin:0 0 .3rem;font-size:1.1rem">Effect on ${h(zoneById(store.zone).label)}</h2>
    ${bar(counts)}${legend(counts)}
    <hr style="border:0;border-top:1px solid var(--line);margin:1rem 0">
    ${ZONES.filter((z) => z.id !== store.zone).map((z) => `<div class="bar-row"><div class="bar-label small"><span>${h(z.label)}</span></div>${bar(summarise(resultsFor(z.id)))}</div>`).join("")}
    <p class="small" style="margin:1rem 0 0"><a href="#/strategy">See the strategy</a></p>`;
}

export function renderCriteria(main) {
  const s = store.settings;
  const ctx = s.context;
  const counts = exposureCounts(store.index, s);
  main.innerHTML = `
    <h1>What matters to your organisation</h1>
    <p class="lede">Choose what you will accept in each environment zone. The results update as you go. Nothing leaves this browser.</p>
    <div class="split">
      <div>
        <h2 style="margin-top:1rem">1. Your platform</h2>
        <p class="small muted">These decide which controls can carry out a decision.</p>
        <fieldset class="preset-grid" id="policy-model">
          <legend class="visually-hidden">Policy model</legend>
          ${[["classic", "Classic data policies", "Business, Non-Business and Blocked groups."], ["mixed", "ACP in mixed mode", "ACP and classic policies together. The most restrictive setting wins."], ["acp", "ACP only", "Classic policies are ignored for this scope."]].map(([v, l, t]) => `
          <label class="radio-card"><input type="radio" name="policyModel" value="${v}" ${ctx.policyModel === v ? "checked" : ""}><span><strong>${l}</strong><br><span class="small muted">${t}</span></span></label>`).join("")}
        </fieldset>
        <p style="margin-top:.4rem">${cite(["acp-mixed", "acp-only"])}</p>
        <label class="check"><input type="checkbox" id="ctx-managed" ${ctx.managed ? "checked" : ""}><span><strong>We use Managed Environments</strong><br><span class="small muted">Without them, nonblockable connectors stay nonblockable, even under ACP.</span> ${cite(["acp-managed"])}</span></label>
        <label class="check"><input type="checkbox" id="ctx-logic" ${ctx.logicApps ? "checked" : ""}><span><strong>We use Azure Logic Apps</strong><br><span class="small muted">Adds Azure Policy to the strategy, because data policies do not cover it.</span> ${cite(["logic-apps"])}</span></label>
        <label class="check"><input type="checkbox" id="ctx-copilot" ${ctx.copilot ? "checked" : ""}><span><strong>We build Copilot Studio agents</strong><br><span class="small muted">Adds agent controls to the strategy.</span> ${cite(["copilot-scope"])}</span></label>

        <h2>2. Start from</h2>
        <fieldset class="preset-grid" id="presets">
          <legend class="visually-hidden">Starting point</legend>
          ${Object.entries(PRESETS).map(([id, p]) => `<label class="radio-card"><input type="radio" name="preset" value="${id}" ${s.preset === id ? "checked" : ""}><span><strong>${h(p.label)}</strong><br><span class="small muted">${h(p.help)}</span></span></label>`).join("")}
        </fieldset>
        <p class="small muted" style="margin-top:.5rem" id="preset-note">${s.preset ? "" : "You have changed these settings from the preset."}</p>

        <h2>3. What you will accept</h2>
        <div class="tabs no-print" role="tablist" aria-label="Environment zone">
          ${ZONES.map((z) => `<button role="tab" type="button" id="tab-${z.id}" aria-controls="tol-panel" aria-selected="${store.zone === z.id}" tabindex="${store.zone === z.id ? 0 : -1}" data-zone="${z.id}">${h(z.label)}</button>`).join("")}
        </div>
        <div id="tol-panel" role="tabpanel" aria-labelledby="tab-${store.zone}"></div>

        <h2>4. Sensitive categories</h2>
        <p class="small muted prose">Mark the categories that hold data you treat as sensitive, then set your limit under What your data needs. Publishers choose these categories, and ${fmt(store.meta.counts.catalogue - store.meta.counts.withCategories)} connectors have none, so this is a coarse signal.</p>
        <fieldset class="chips-input"><legend class="visually-hidden">Sensitive categories</legend>
          ${store.meta.categories.map((c) => `<label><input type="checkbox" name="sensitive" value="${h(c)}" ${s.sensitiveCategories.includes(c) ? "checked" : ""}>${h(c)}</label>`).join("")}
        </fieldset>

        <h2>5. Save or share</h2>
        <div class="actions no-print">
          <button class="btn" type="button" id="settings-export">Download settings</button>
          <label class="btn" for="settings-import">Load settings<input class="visually-hidden" id="settings-import" type="file" accept="application/json,.json"></label>
          <button class="btn" type="button" id="settings-reset">Reset to Microsoft's starting point</button>
        </div>
        <p class="small muted" style="margin-top:.6rem" id="override-count"></p>
      </div>
      <aside class="card sticky" id="impact" aria-label="Effect of your settings"></aside>
    </div>`;

  const impact = main.querySelector("#impact");
  const panel = main.querySelector("#tol-panel");
  const refresh = () => { impact.innerHTML = impactPanel(); main.querySelector("#override-count").textContent = `${plural(Object.keys(s.overrides).length, "connector decision")} saved. Set these on each connector's page.`; };
  const markCustom = () => { s.preset = null; main.querySelectorAll('input[name="preset"]').forEach((i) => { i.checked = false; }); main.querySelector("#preset-note").textContent = "You have changed these settings from the preset."; };

  const drawPanel = () => {
    const tolerances = s.zones[store.zone];
    panel.setAttribute("aria-labelledby", `tab-${store.zone}`);
    panel.innerHTML = `<p class="small muted">${h(zoneById(store.zone).help)} ${cite(zoneById(store.zone).facts)}</p>` + GROUPS.map((group) => `
      <div class="group-title">${h(group.label)}</div>
      ${EXPOSURES.filter((e) => e.group === group.id).map((e) => `
        <fieldset class="exposure-row">
          <div><legend class="name">${h(e.label)}</legend><div class="help">${h(e.help)}</div>
            <div class="meta">${plural(counts[e.id], "connector")} · ${h(e.basis)}${e.scope === "action" ? " · Can be limited action by action" : ""}</div></div>
          <div class="segmented">${TOLERANCES.map((t) => `<label>${h(TOLERANCE_LABELS[t])}<input type="radio" name="tol-${e.id}" value="${t}" ${tolerances[e.id] === t ? "checked" : ""} data-exposure="${e.id}"></label>`).join("")}</div>
        </fieldset>`).join("")}`).join("");
  };

  panel.addEventListener("change", (event) => {
    const id = event.target.dataset.exposure;
    if (!id) return;
    s.zones[store.zone][id] = event.target.value;
    markCustom();
    saveSettings();
    refresh();
  });
  const tabs = [...main.querySelectorAll('[role="tab"]')];
  const selectTab = (tab) => {
    store.zone = tab.dataset.zone;
    tabs.forEach((t) => { t.setAttribute("aria-selected", t === tab); t.tabIndex = t === tab ? 0 : -1; });
    drawPanel();
    refresh();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key];
      if (next === undefined) return;
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      selectTab(target);
    });
  });
  main.querySelectorAll('input[name="policyModel"]').forEach((i) => i.addEventListener("change", (e) => { ctx.policyModel = e.target.value; saveSettings(); refresh(); }));
  [["#ctx-managed", "managed"], ["#ctx-logic", "logicApps"], ["#ctx-copilot", "copilot"]].forEach(([id, key]) => main.querySelector(id).addEventListener("change", (e) => { ctx[key] = e.target.checked; saveSettings(); refresh(); }));
  main.querySelectorAll('input[name="preset"]').forEach((i) => i.addEventListener("change", (e) => {
    s.preset = e.target.value;
    s.zones = structuredClone(PRESETS[e.target.value].zones);
    main.querySelector("#preset-note").textContent = "";
    saveSettings();
    drawPanel();
    refresh();
    announce(`Applied ${PRESETS[e.target.value].label}.`);
  }));
  main.querySelectorAll('input[name="sensitive"]').forEach((i) => i.addEventListener("change", () => {
    s.sensitiveCategories = [...main.querySelectorAll('input[name="sensitive"]:checked')].map((x) => x.value);
    saveSettings();
    Object.assign(counts, exposureCounts(store.index, s));
    drawPanel();
    refresh();
  }));
  main.querySelector("#settings-export").addEventListener("click", () => download("connector-risk-settings.json", JSON.stringify(s, null, 2)));
  main.querySelector("#settings-reset").addEventListener("click", () => {
    store.settings = defaultSettings();
    saveSettings();
    renderCriteria(main);
    announce("Settings reset.");
  });
  main.querySelector("#settings-import").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const loaded = validSettings(JSON.parse(await file.text()));
      store.settings = loaded;
      saveSettings();
      renderCriteria(main);
      announce("Settings loaded.");
    } catch (error) {
      announce(`That file could not be loaded: ${error.message}`);
      main.querySelector("#override-count").textContent = `That file could not be loaded: ${error.message}`;
    }
  });
  drawPanel();
  refresh();
  return "What matters";
}

function validSettings(input) {
  const base = defaultSettings();
  if (input?.version !== 1 || typeof input.zones !== "object") throw new Error("it is not a settings file from this tool.");
  for (const z of ZONES) {
    for (const e of EXPOSURES) {
      const value = input.zones?.[z.id]?.[e.id];
      if (TOLERANCES.includes(value)) base.zones[z.id][e.id] = value;
    }
  }
  const ctx = input.context ?? {};
  base.context = {
    policyModel: ["classic", "mixed", "acp"].includes(ctx.policyModel) ? ctx.policyModel : "classic",
    managed: ctx.managed === true, logicApps: ctx.logicApps === true, copilot: ctx.copilot !== false,
  };
  base.sensitiveCategories = Array.isArray(input.sensitiveCategories) ? input.sensitiveCategories.filter((c) => store.meta.categories.includes(c)) : [];
  base.overrides = Object.fromEntries(Object.entries(input.overrides ?? {}).filter(([slug, v]) => store.bySlug.has(slug) && ["approved", "allow", "block"].includes(v)));
  base.preset = null;
  return base;
}

/* ---------- Strategy ---------- */
function zoneLists(zone) {
  const results = resultsFor(zone.id);
  const lists = { block: [], retain: [], modify: [], allow: [], outside: [] };
  store.index.forEach((c, i) => lists[results[i].treatment].push({ c, r: results[i] }));
  return lists;
}

function strategySteps() {
  const ctx = store.settings.context;
  const acp = ctx.policyModel !== "classic";
  const data = Object.fromEntries(ZONES.map((z) => [z.id, zoneLists(z)]));
  const anyActions = ZONES.flatMap((z) => data[z.id].modify.filter(({ r }) => r.steps.some((s) => s.kind.endsWith("actions"))));
  const anyEndpoint = ZONES.flatMap((z) => data[z.id].modify.filter(({ r }) => r.steps.some((s) => s.kind === "endpoint")));
  const retained = (zone) => data[zone].retain.length;
  const steps = [];
  const shared = data.shared;
  const group = (list, name) => list.filter(({ r }) => r.group === name).length;
  const nonBiz = group(shared.allow, "Non-Business") + group(shared.modify, "Non-Business");
  const biz = group(shared.allow, "Business") + group(shared.modify, "Business");
  steps.push({
    title: acp ? "Curate an allowlist for shared environments" : "Set one tenant baseline for shared environments",
    body: acp
      ? `Allow ${fmt(biz + nonBiz)} connectors and leave ${fmt(shared.block.length)} off the list. ACP enforces the list as soon as it is saved, so curate it first, and start in mixed mode.`
      : `Create one tenant-level policy covering all environments except those you choose to exclude. Under your settings it blocks ${fmt(shared.block.length)} connectors, places ${fmt(biz)} in Business and ${fmt(nonBiz)} in Non-Business. It also applies to new environments.`,
    facts: acp ? ["acp-immediate", "acp-mixed"] : ["baseline-shared", "few-policies"],
  });
  steps.push({
    title: "Keep policies few, and model them before publishing",
    body: "All policies that apply to an environment are evaluated together, and the most restrictive result wins. Use environment-level policies only for exceptions and custom connectors.",
    facts: ["few-policies", "most-restrictive", "fragmentation"],
  });
  steps.push({
    title: "Give team and production environments their own policies",
    body: `Exclude them from the shared baseline. Dedicated team environments can then block ${fmt(data.team.block.length)} connectors, and production ${fmt(data.production.block.length)}. In production, treat this as the outer limit and agree the actual connectors for each solution with its business unit.`,
    facts: ["baseline-team", "baseline-production"],
  });
  steps.push(acp ? {
    title: "Add new connectors to the allowlist deliberately",
    body: "New connectors are blocked automatically under ACP. Use the Changes page to review what has arrived each week.",
    facts: ["acp-new"], link: { href: "#/changes", text: "See weekly changes" },
  } : {
    title: "Review new connectors every week",
    body: "Keep Non-Business as the default group. Move each new connector to Business or Blocked after evaluating it. Use the Changes page to see what arrived.",
    facts: ["default-group"], link: { href: "#/changes", text: "See weekly changes" },
  });
  if (anyActions.length) {
    steps.push({
      title: "Limit actions on the connectors you allow",
      body: `Your settings limit actions on ${fmt(new Set(anyActions.map(({ c }) => c.s)).size)} connectors. Set the default for future actions deliberately. Individual triggers can only be managed through PowerShell.`,
      facts: ["action-control", "trigger-powershell"], exports: true,
    });
  }
  if (anyEndpoint.length) {
    steps.push({
      title: "Add endpoint filtering, and know its limits",
      body: "Rules cover static endpoints only, not environment variables, custom inputs or endpoints created at runtime. The feature is in preview, so pair it with environment isolation.",
      facts: ["endpoint-filtering", "endpoint-static", "endpoint-preview"],
    });
  }
  steps.push({
    title: "Plan for HTTP and custom connectors separately",
    body: `Check child flows before reclassifying HTTP, because they share a dependency. Classify custom connectors by host URL pattern at tenant level, and by name at environment level.${acp ? " ACP does not cover either type yet, so keep classic policies for them." : ""}`,
    facts: ["http-child", "custom-connectors", ...(acp ? ["acp-unsupported"] : [])],
  });
  const totalRetained = ZONES.reduce((sum, z) => sum + retained(z.id), 0);
  if (totalRetained) {
    steps.push({
      title: "Decide what to do where no control can enforce your limit",
      body: `${ZONES.map((z) => `${z.label}: ${fmt(retained(z.id))}`).join(". ")}. Most are core Microsoft connectors, which classic policies cannot block or limit. ${ctx.managed && acp ? "" : "ACP on a Managed Environment can restrict them. "}Otherwise, the risk owner must accept the position, or the limit must change.`,
      facts: ["nonblockable", "action-control", "acp-managed"],
    });
  }
  if (acp) {
    steps.push({
      title: "Watch for what ACP does differently",
      body: "ACP has no Business and Non-Business separation, so allowed connectors can be combined. Do not switch to ACP-only mode until HTTP connectors, custom connectors and endpoint filtering are governed another way.",
      facts: ["acp-no-groups", "acp-only", "acp-native-gap", "acp-unsupported"],
    });
  }
  if (ctx.logicApps) {
    const covered = store.index.filter((c) => c.ct.logicApps).length;
    steps.push({ title: "Mirror your blocks in Azure Policy", body: `${fmt(covered)} connectors are available in Azure Logic Apps. Data policies do not reach them there, so add matching Azure Policy rules.`, facts: ["logic-apps"] });
  }
  if (ctx.copilot) {
    steps.push({ title: "Decide agent controls per zone", body: "Decide on unauthenticated chat, HTTP requests, publishing channels and skills. Data policies govern each of these, and blocking one removes that capability from agents.", facts: ["copilot-scope", "acp-unsupported"] });
  }
  steps.push({
    title: "Close the cross-tenant gap",
    body: "Tenant isolation works only for connectors that use Microsoft Entra ID authentication, and a known issue leaves the Azure DevOps connector outside it. Use data policies for the rest.",
    facts: ["tenant-isolation", "tenant-ado"],
  });
  steps.push({
    title: "Check real usage before you change anything",
    body: "Policy changes affect apps, flows and agents that already exist, and non-compliant desktop flows are suspended. This tool cannot see your tenant, so inventory usage first, test outside production and tell makers what is changing.",
    facts: ["runtime-impact", "desktop-suspended"],
  });
  steps.push({
    title: "Handle exceptions the documented way",
    body: "Deny the request, change the policy, or move the environment out of the baseline and give it a policy for that use case. Give each exception an owner and a review date.",
    facts: ["exceptions"],
  });
  return { steps, data };
}

export function renderStrategy(main) {
  const { steps, data } = strategySteps();
  const ctx = store.settings.context;
  const modelLabel = { classic: "classic data policies", mixed: "ACP in mixed mode", acp: "ACP only" }[ctx.policyModel];
  const acpAvailable = ctx.policyModel !== "classic";
  main.innerHTML = `
    <h1>Your connector strategy</h1>
    <p class="lede">Generated from your settings: ${h(store.settings.preset ? PRESETS[store.settings.preset].label : "customised limits")}, using ${h(modelLabel)}${ctx.managed ? " on Managed Environments" : ", without Managed Environments"}.</p>
    <div class="actions no-print"><a class="btn" href="#/criteria">Change settings</a><button class="btn" type="button" id="print-strategy">Print or save as PDF</button></div>

    <h2>Where you end up</h2>
    <div class="zone-cards">${ZONES.map((z) => {
      const counts = summarise(resultsFor(z.id));
      return `<div class="card zone-card"><h3>${h(z.label)}</h3>${bar(counts)}${legend(counts)}</div>`;
    }).join("")}</div>

    <h2>What to do, in order</h2>
    <div class="card">
      ${steps.map((s, i) => `<div class="step"><div class="step-n" aria-hidden="true">${i + 1}</div><div>
        <h3>${h(s.title)}</h3><p style="margin-bottom:.3rem">${h(s.body)}</p>
        ${s.link ? `<p class="small" style="margin-bottom:.3rem"><a href="${s.link.href}">${h(s.link.text)}</a></p>` : ""}
        ${cite(s.facts)}</div></div>`).join("")}
    </div>

    <h2>What this cannot tell you</h2>
    <div class="prose">
      <ul class="plain">
        <li>Which connectors your makers use, or which they combine. Splitting two connectors into different groups stops any app or flow that uses both. ${cite(["groups"])}</li>
        <li>Which system a connection points at. Data policies cannot see this either. ${cite(["no-connection-control"])}</li>
        <li>Which users may use a connector. Policies apply to environments and tenants, not users. ${cite(["no-user-scope"])}</li>
        <li>How likely an incident is. That needs your own usage and incident data.</li>
      </ul>
    </div>

    <h2>Connector lists</h2>
    <div class="filters no-print" style="max-width:320px">${zoneSelect("strategy-zone")}</div>
    <div id="zone-lists"></div>

    <h2 class="no-print">Download drafts</h2>
    <div class="no-print">
      <div class="callout"><strong>These are drafts for administrator review.</strong> Connector IDs are derived from Learn page addresses, and action lists depend on name-based classes. Check both before applying anything. This site never calls Microsoft APIs.</div>
      <div class="actions">
        <button class="btn" type="button" id="dl-csv">Treatment for all zones (CSV)</button>
        <button class="btn" type="button" id="dl-actions">Action rules for this zone (JSON)</button>
        ${acpAvailable ? '<button class="btn" type="button" id="dl-acp">ACP allowlist for this zone (JSON)</button>' : ""}
      </div>
      <p class="small" style="margin-top:.5rem">${cite(["action-control", "acp-shape"])}</p>
      <p class="small muted" id="dl-status" role="status"></p>
    </div>`;

  const listRoot = main.querySelector("#zone-lists");
  const drawLists = () => {
    const lists = data[store.zone];
    const section = (key, title, intro) => {
      const rows = lists[key];
      if (!rows.length) return "";
      const sorted = [...rows].sort((a, b) => b.r.redLines - a.r.redLines || a.c.n.localeCompare(b.c.n));
      return `<details class="op-class"><summary><span>${pill(key)} ${h(title)}</span><span class="muted">${fmt(rows.length)}</span></summary>
        <div style="padding:0 .9rem .8rem"><p class="small muted">${h(intro)}</p>
        <ul class="plain" style="columns:2 280px">${sorted.slice(0, 200).map(({ c, r }) => `<li><a href="#/c/${encodeURIComponent(c.s)}">${h(c.n)}</a>${r.group && key !== "block" ? ` <span class="muted small">(${h(r.group)})</span>` : ""}</li>`).join("")}</ul>
        ${rows.length > 200 ? `<p class="small muted">Showing the first 200 of ${fmt(rows.length)}. Download the CSV for all of them.</p>` : ""}</div></details>`;
    };
    listRoot.innerHTML = section("retain", "No control can enforce your limit", "These need a risk owner's decision, or a change of policy model.")
      + section("block", "Blocked", "Sorted by how many of your limits each one crosses.")
      + section("modify", "Allowed with controls", "Open a connector to see its specific controls.")
      + section("allow", "Allowed", "Your settings place no condition on these.")
      + section("outside", "Outside data policies", "Data policies do not govern these. Logic Apps connectors need Azure Policy.");
  };
  main.querySelector("#strategy-zone").addEventListener("change", (e) => { store.zone = e.target.value; drawLists(); });
  main.querySelector("#print-strategy").addEventListener("click", () => window.print());
  const status = main.querySelector("#dl-status");
  main.querySelector("#dl-csv").addEventListener("click", () => {
    const all = ZONES.map((z) => resultsFor(z.id));
    download("connector-treatments.csv", csv([
      ["Connector", "Connector ID (derived)", "Publisher", ...ZONES.flatMap((z) => [`${z.label}: treatment`, `${z.label}: group`, `${z.label}: limits crossed`])],
      ...store.index.map((c, i) => [c.n, c.api, c.p, ...all.flatMap((results) => [TREATMENTS[results[i].treatment].label, results[i].group ?? "", results[i].redLines])]),
    ]), "text/csv");
    status.textContent = "Download started.";
  });
  main.querySelector("#dl-actions").addEventListener("click", async (event) => {
    event.target.disabled = true;
    status.textContent = "Fetching operation lists.";
    const results = resultsFor(store.zone);
    const targets = results.filter((r) => r.deniedClasses.length && r.treatment !== "block").map((r) => r.slug);
    const details = await connectorDetails(targets);
    const out = actionRulesDraft(results, details);
    download(`action-rules-${store.zone}-DRAFT.json`, JSON.stringify({ note: "Draft for administrator review.", ...out }, null, 2));
    status.textContent = `Draft covers ${plural(out.connectorActionConfigurations.length, "connector")}.`;
    event.target.disabled = false;
  });
  main.querySelector("#dl-acp")?.addEventListener("click", async (event) => {
    event.target.disabled = true;
    status.textContent = "Fetching operation lists.";
    const results = resultsFor(store.zone);
    const targets = results.filter((r) => r.deniedClasses.length && r.treatment !== "block").map((r) => r.slug);
    const details = await connectorDetails(targets);
    const { draft, notCovered } = acpDraft(store.index, results, zoneById(store.zone).label, details);
    download(`acp-allowlist-${store.zone}-DRAFT.json`, JSON.stringify(draft, null, 2));
    status.textContent = `Draft allows ${plural(draft.ruleSets[0].inputs.AllowedConnectorList.length, "connector")}. Not covered by ACP, so govern separately: ${notCovered.join(", ")}.`;
    event.target.disabled = false;
  });
  drawLists();
  return "Strategy";
}

/* ---------- Changes ---------- */
export async function renderChanges(main) {
  const files = await fetch("data/changes/index.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const sets = await Promise.all(files.slice(0, 12).map((f) => fetch(`data/changes/${f}.json`).then((r) => r.json())));
  const link = (slug, names) => store.bySlug.has(slug) ? `<a href="#/c/${encodeURIComponent(slug)}">${h(names[slug] ?? slug)}</a>` : h(names[slug] ?? slug);
  main.innerHTML = `
    <h1>Weekly changes</h1>
    <p class="lede">The catalogue refreshes every week. New connectors arrive here so you can decide on them, and existing connectors that change appear with what changed.</p>
    <p class="small">${cite(["default-group", "acp-new"])}</p>
    ${sets.length ? sets.map((set) => `
      <section class="card" style="margin-top:1rem">
        <h2 style="margin-top:0">${h(set.date)}</h2>
        <p>${plural(set.new.length, "new connector")}, ${plural(set.removed.length, "removed connector")}, ${plural(set.changed.length, "changed connector")}.</p>
        ${set.new.length ? `<h3>New</h3><ul class="plain" style="columns:2 260px">${set.new.map((s) => `<li>${link(s, set.names)}</li>`).join("")}</ul>` : ""}
        ${set.removed.length ? `<h3>Removed</h3><ul class="plain" style="columns:2 260px">${set.removed.map((s) => `<li>${link(s, set.names)}</li>`).join("")}</ul>` : ""}
        ${set.changed.length ? `<details class="op-class"><summary><span>Changed</span><span class="muted">${set.changed.length}</span></summary><div class="table-scroll"><table><thead><tr><th scope="col">Connector</th><th scope="col">What changed</th></tr></thead><tbody>
          ${set.changed.map((c) => `<tr><td>${link(c.slug, set.names)}</td><td class="small">${h(describeChange(c))}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      </section>`).join("") : `<div class="card"><p style="margin:0">The baseline was taken on ${h(store.meta.dataDate)}. Changes appear here after the next refresh that finds any.</p></div>`}`;
  return "Changes";
}

function describeChange(c) {
  const parts = [];
  if (c.operationsAdded) parts.push(`Operations added: ${c.operationsAdded.join(", ")}`);
  if (c.operationsRemoved) parts.push(`Operations removed: ${c.operationsRemoved.join(", ")}`);
  if (c.exposuresAdded) parts.push(`Traits added: ${c.exposuresAdded.map((e) => EXPOSURE_BY_ID[e]?.label ?? e).join(", ")}`);
  if (c.exposuresRemoved) parts.push(`Traits removed: ${c.exposuresRemoved.map((e) => EXPOSURE_BY_ID[e]?.label ?? e).join(", ")}`);
  if (c.authTypes) parts.push("Authentication types changed");
  for (const field of ["publisher", "origin", "preview", "deprecated", "mcp"]) if (c[field]) parts.push(`${field}: ${c[field].from} to ${c[field].to}`);
  return parts.join(". ") || "Details changed";
}

/* ---------- Method ---------- */
export function renderMethod(main) {
  const { counts, classifier: k, parseFailures } = store.meta;
  const byClass = Object.entries(k.byClass);
  main.innerHTML = `
    <h1>Method</h1>
    <p class="lede">How this tool reaches its answers, what has been measured, and what it does not know.</p>

    <h2>The logic</h2>
    <div class="prose">
      <p>The tool keeps four things separate, and labels each one wherever it appears.</p>
      <ol class="plain">
        <li><strong>Facts.</strong> Read from Microsoft Learn and Microsoft's connector repository.</li>
        <li><strong>Derived traits.</strong> Worked out from those facts by rules kept in the open, with the evidence shown on each connector.</li>
        <li><strong>Your criteria.</strong> For each trait and zone: accept, accept with controls, or do not accept.</li>
        <li><strong>The result.</strong> Traits are compared with your criteria, then the tool asks which documented control can carry out the decision.</li>
      </ol>
      <h3>The rules, in order</h3>
      <ol class="plain">
        <li>Data policies do not govern the connector: it is outside this assessment, and the tool says what does.</li>
        <li>You do not accept a trait that applies to the whole connector, or every action falls in a capability you do not accept: block it.</li>
        <li>You do not accept a capability, and other actions remain: block those actions only.</li>
        <li>You accept a trait with controls: apply the documented control, or a stated condition.</li>
        <li>The chosen control cannot apply to this connector under your setup: the result is Cannot enforce, and the tool says why. It never reports a block that cannot happen.</li>
      </ol>
      <p>Connectors are ranked by how many of your limits they cross. Nothing is averaged, so one severe trait cannot be diluted by mild ones.</p>
    </div>

    <h2>Why there is no score</h2>
    <div class="prose">
      <ul class="plain">
        <li>A semi-quantitative scale has values and meanings that do not carry over to other contexts. ${cite(["semi-quant"])}</li>
        <li>Risk matrices can give identical ratings to very different risks, and can rate smaller risks above larger ones. ${cite(["matrices"])}</li>
        <li>We found no public data on connector incidents or usage, so any likelihood figure would be invented.</li>
      </ul>
      <p>The structure of the process follows the common pattern of establishing criteria, analysing, evaluating and then treating risk, and the treatment names Avoid, Modify and Retain follow ISO/IEC 27005 terms. We worked from public summaries of that standard, which is a paid document, so this tool does not claim conformance with it.</p>
      <h3>What the treatments mean</h3>
      <ul class="plain">${Object.values(TREATMENTS).map((t) => `<li><strong>${h(t.label)}.</strong> Treatment type: ${h(t.iso)}.</li>`).join("")}</ul>
    </div>

    <h2>What has been measured</h2>
    <div class="stats">
      <div class="stat"><b>${fmt(counts.catalogue - parseFailures.length)} of ${fmt(counts.catalogue)}</b><span>connector pages parsed</span></div>
      <div class="stat"><b>${pct(counts.withOperations, counts.catalogue)}</b><span>list operations</span></div>
      <div class="stat"><b>${pct(counts.withAuthDocumented, counts.catalogue)}</b><span>list authentication types</span></div>
      <div class="stat"><b>${pct(counts.withCategories, counts.catalogue)}</b><span>list a category</span></div>
      <div class="stat"><b>${pct(counts.withDefinition, counts.catalogue)}</b><span>match a published definition</span></div>
      <div class="stat"><b>${pct(counts.operationsWithCall, counts.operations)}</b><span>of operations have a published HTTP call</span></div>
    </div>
    ${parseFailures.length ? `<p class="small">Pages that could not be parsed, shown with partial data: ${parseFailures.map((s) => `<a href="#/c/${encodeURIComponent(s)}">${h(s)}</a>`).join(", ")}.</p>` : ""}
    <h3>How accurate the operation classes are</h3>
    <div class="prose">
      <p>The classes come from words in operation names. We tested them against HTTP methods in Microsoft's published definitions, withholding the method from the classifier. Of ${fmt(k.comparable)} comparable operations, ${fmt(k.agree)} agree (${pct(k.agree, k.comparable)}). A further ${fmt(k.unclassifiedByWords)} of the ${fmt(k.operationsTested)} tested had no classifying word.</p>
      <p>This tests consistency, not truth, because many APIs use POST for reads and some use POST for deletions. Agreement below 100% is therefore expected. Words alone found ${fmt(k.deleteMethodFoundByWords)} of the ${fmt(k.deleteMethodOperations)} operations that use HTTP DELETE (${pct(k.deleteMethodFoundByWords, k.deleteMethodOperations)}). Where a definition is published, HTTP DELETE now overrides the words.</p>
    </div>
    <div class="table-scroll" style="max-width:520px"><table>
      <thead><tr><th scope="col">Class from words</th><th scope="col">Method expected</th><th scope="col" class="num">Agree</th><th scope="col" class="num">Compared</th><th scope="col" class="num">Rate</th></tr></thead>
      <tbody>${byClass.map(([name, t]) => `<tr><td>${h(CLASS_LABELS[name])}</td><td class="small">${name === "read" ? "GET" : name === "delete" ? "DELETE" : "POST, PUT, PATCH"}</td><td class="num">${fmt(t.agree)}</td><td class="num">${fmt(t.total)}</td><td class="num">${pct(t.agree, t.total)}</td></tr>`).join("")}</tbody></table></div>

    <h2>Where judgement is used</h2>
    <div class="prose">
      <p>These parts are judgement, not fact. Each is visible in the repository and labelled on the connector page.</p>
      <ul class="plain">
        <li><strong>The personal service list.</strong> Some of these services also sell business plans. Mark a connector Approved if you contract it.</li>
        <li><strong>The any-endpoint list.</strong> Chosen by reading what each connector does.</li>
        <li><strong>The Microsoft domain list.</strong> This decides whether a service counts as Microsoft's own. GitHub and LinkedIn are treated as separate services, although Microsoft owns them.</li>
        <li><strong>Target-system detection.</strong> A pattern applied to connection parameter names, which can miss or over-match.</li>
        <li><strong>External AI.</strong> Relies on the AI category, which publishers choose.</li>
        <li><strong>The Tighter and More open presets.</strong> Starting points only. Microsoft's starting point follows its guidance, and stays at Accept where the guidance is silent.</li>
        <li><strong>The suggested conditions</strong> on connector pages, such as naming a credential owner. These are practical suggestions, not Microsoft requirements.</li>
      </ul>
    </div>

    <h2>Keeping it current</h2>
    <div class="prose"><p>A scheduled job runs every week. It recrawls the catalogue, re-derives every trait and redeploys the site. It also checks that short evidence phrases for each fact below still appear on the source page. A missing phrase marks that fact as changed on this site and raises an issue for review. If the connector count falls by more than 5%, or more than 2% of pages cannot be parsed, the job stops and the last good data stays live.</p></div>

    <h2>Every fact, with its source</h2>
    <div class="table-scroll"><table>
      <thead><tr><th scope="col">Statement</th><th scope="col">Source</th><th scope="col">Status</th><th scope="col">Checked</th></tr></thead>
      <tbody>${store.facts.facts.map((f) => {
        const src = store.facts.sources[f.source];
        return `<tr><td>${h(f.statement)}</td><td class="small"><a href="${h(src.url)}" target="_blank" rel="noopener">${h(src.title)}</a></td><td class="small">${f.status === "verified" ? "Phrase found" : "Source changed, under review"}</td><td class="small">${h(f.lastChecked)}</td></tr>`;
      }).join("")}</tbody></table></div>
    <p class="small muted" style="margin-top:.8rem">A found phrase shows the source still says what it said. It cannot prove the wider meaning has not moved, so read the source before relying on a statement. Statements are in our own words. Learn descriptions are linked, not copied.</p>`;
  return "Method";
}
