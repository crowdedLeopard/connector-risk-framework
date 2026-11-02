// Page views. Every number on the site is computed from the data at render time.
import { EXPOSURES, EXPOSURE_BY_ID, TOLERANCE_LABELS, TREATMENTS, ZONES, evaluate, profileLabel, summarise } from "./engine.js";
import { announce, bar, cite, connectorDetail, csv, download, fmt, h, pill, plural, product, productIcon, productName, resultsFor, saveSettings, store, tile } from "./ui.js";

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

const arrowDown = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M6 14l6 6 6-6"/></svg>';

function legendAll() {
  return `<ul class="legend">${Object.keys(TREATMENTS).map((k) => `<li><i class="seg-${k}"></i>${h(TREATMENTS[k].label)}</li>`).join("")}</ul>`;
}

/* ---------- Home ---------- */
const GALLERY = ["commondataserviceforapps", "microsoftcopilotstudio", "powerappsforadmins", "powerappsforappmakers", "flowmanagement", "microsoftflowforadmins", "powerplatformforadmins", "powerplatformadminv2"];

export function renderHome(main) {
  const { counts, dataDate } = store.meta;
  const verified = store.facts.facts.filter((f) => f.status === "verified").length;
  main.innerHTML = `
    <section class="hero-band on-dark">
      <div class="wrap-inner hero-grid">
        <div>
          <h1>Decide what every connector <span class="gradient-text">may do in your organisation.</span></h1>
          <p class="lede">See what each connector can call and where it reaches. Set what you will accept. Get a strategy that uses only controls Microsoft documents, with their limits stated.</p>
          <div class="actions">
            <a class="btn primary" href="#/build">Set my risk profile</a>
            <a class="btn ghost" href="#/connectors">Browse ${fmt(counts.catalogue)} connectors</a>
          </div>
          <p class="hero-note">An independent tool built from public Microsoft documentation. Not an official Microsoft assessment.</p>
        </div>
        <div class="flow" role="group" aria-label="How products, connectors and your limits relate">
          <div class="flow-products">
            ${["Power Apps", "Power Automate", "Copilot Studio"].map((p) => `<div class="glass flow-product">${productIcon(p)}<span>${h(productName(p))}</span></div>`).join("")}
          </div>
          <div class="flow-arrow" aria-hidden="true">${arrowDown}</div>
          <div class="glass"><p class="flow-title">Use connectors</p><p class="flow-big">${fmt(counts.catalogue)} connectors, ${fmt(counts.operations)} operations</p></div>
          <div class="flow-arrow" aria-hidden="true">${arrowDown}</div>
          <div class="glass"><p class="flow-title">Your risk profile decides, by environment: ${h(profileLabel(store.settings))}</p>
            ${ZONES.map((z) => `<div class="flow-zone"><span>${h(z.label)}</span>${bar(summarise(resultsFor(z.id)))}</div>`).join("")}
            ${legendAll()}
          </div>
        </div>
      </div>
    </section>
    <div class="stats hero-stats">
      <div class="stat"><b>${fmt(counts.catalogue)}</b><span>connectors on Microsoft Learn</span></div>
      <div class="stat"><b>${fmt(counts.operations)}</b><span>operations listed</span></div>
      <div class="stat"><b>${fmt(counts.operationsWithCall)}</b><span>operations with a published HTTP call</span></div>
      <div class="stat"><b>${verified} of ${store.facts.facts.length}</b><span>governance facts confirmed on their source pages on ${h(store.facts.checked)}</span></div>
    </div>

    <h2>Three questions to a strategy</h2>
    <div class="journey">
      <a class="card journey-card" href="#/build"><span class="layer-tag yours">Question 1</span><h3>How cautious?</h3><p class="small" style="margin:0">Compare three levels by what each one does to the catalogue, then pick the closest.</p></a>
      <a class="card journey-card" href="#/build"><span class="layer-tag derived">Question 2</span><h3>What will you never allow?</h3><p class="small" style="margin:0">Optional. Tick anything you want ruled out in every environment.</p></a>
      <a class="card journey-card" href="#/build"><span class="layer-tag fact">Question 3</span><h3>What is in place?</h3><p class="small" style="margin:0">Which products you govern and which controls you have. This decides what can be enforced.</p></a>
      <a class="card journey-card" href="#/strategy"><span class="layer-tag result">Result</span><h3>Your strategy</h3><p class="small" style="margin:0">Ordered steps with sources, connector lists, and drafts for an administrator to review.</p></a>
    </div>

    <h2>Find a connector</h2>
    <form id="home-search" role="search" class="card" style="display:flex;gap:.7rem;align-items:flex-end;flex-wrap:wrap">
      <label class="field" for="home-q" style="flex:1;min-width:220px">Connector name or publisher<input id="home-q" type="search" autocomplete="off"></label>
      <button class="btn primary" type="submit">Search</button>
    </form>
    <h3>The Power Platform's own connectors</h3>
    <div class="gallery">${GALLERY.filter((s) => store.bySlug.has(s)).map((s) => `<a href="#/c/${s}">${tile(s, store.bySlug.get(s).n)}<span>${h(store.bySlug.get(s).n)}</span></a>`).join("")}</div>

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

const PRODUCT_FILTERS = ["Power Apps", "Power Automate", "Copilot Studio", "Logic Apps"];

export function renderCatalogue(main) {
  const s = catalogueState;
  const option = (value, label, current) => `<option value="${h(value)}" ${current === value ? "selected" : ""}>${h(label)}</option>`;
  main.innerHTML = `
    <h1>Connectors</h1>
    <p class="lede">Every connector on Microsoft Learn, plus built-in items that appear in data policies. The treatment shown reflects <a href="#/build">your risk profile</a>.</p>
    <div class="filter-panel no-print">
    <div class="product-filter" role="group" aria-label="Filter by product">
      <button type="button" data-product="" aria-pressed="${!s.product}">All products</button>
      ${PRODUCT_FILTERS.map((p) => `<button type="button" data-product="${h(p)}" aria-pressed="${s.product === p}">${productIcon(p)}${h(productName(p))}</button>`).join("")}
    </div>
    <div class="filters">
      <label class="field" for="f-q">Search<input id="f-q" type="search" value="${h(s.q)}" autocomplete="off"></label>
      ${zoneSelect()}
      <label class="field" for="f-treatment">Treatment<select id="f-treatment"><option value="">All</option>${Object.keys(TREATMENTS).map((k) => option(k, TREATMENTS[k].label, s.treatment)).join("")}</select></label>
      <label class="field" for="f-exposure">Has trait<select id="f-exposure"><option value="">Any</option>${EXPOSURES.filter((e) => e.id !== "sensitive-category").map((e) => option(e.id, e.label, s.exposure)).join("")}</select></label>
      <label class="field" for="f-origin">Service<select id="f-origin"><option value="">All</option>${Object.keys(ORIGIN_LABELS).map((k) => option(k, ORIGIN_LABELS[k], s.origin)).join("")}</select></label>
      <label class="field" for="f-publisher">Publisher<select id="f-publisher"><option value="">All</option>${Object.keys(PUBLISHER_LABELS).map((k) => option(k, PUBLISHER_LABELS[k], s.publisher)).join("")}</select></label>
      <label class="field" for="f-category">Category on Learn<select id="f-category"><option value="">All</option>${store.meta.categories.map((c) => option(c, c, s.category)).join("")}</select></label>
      <label class="field" for="f-licence">Licence class<select id="f-licence"><option value="">All</option>${option("standard", "Standard", s.licence)}${option("premium", "Premium", s.licence)}</select></label>
      <label class="field" for="f-sort">Sort by<select id="f-sort">${option("name", "Name", s.sort)}${option("limits", "Your limits crossed", s.sort)}${option("treatment", "Treatment", s.sort)}${option("operations", "Number of operations", s.sort)}</select></label>
    </div>
    </div>
    <div class="actions no-print" style="justify-content:space-between">
      <p id="result-count" class="small" style="margin:0" aria-live="polite"></p>
      <button class="btn small" id="export-view" type="button">Download this view as CSV</button>
    </div>
    <div class="table-scroll table-card" style="margin-top:.8rem"><table>
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
      return `<tr><td><div class="name-cell">${tile(c.s, c.n, true)}<div><a href="#/c/${encodeURIComponent(c.s)}">${h(c.n)}</a><span class="sub">${h(c.k || c.p)}</span></div></div></td>
        <td>${pill(r.treatment)}${r.group && r.treatment !== "block" ? `<span class="sub">${h(r.group)} group</span>` : ""}</td>
        <td class="num">${r.redLines || ""}</td>
        <td>${chips || '<span class="muted small">Not listed</span>'}</td>
        <td class="small">${h(ORIGIN_LABELS[c.o])}</td></tr>`;
    }).join("") || '<tr><td colspan="5">No connector matches these filters.</td></tr>';
    more.hidden = rows.length <= s.shown;
    more.textContent = `Show ${fmt(Math.min(100, rows.length - s.shown))} more`;
  };
  const productButtons = [...main.querySelectorAll("[data-product]")];
  productButtons.forEach((button) => button.addEventListener("click", () => {
    s.product = button.dataset.product;
    s.shown = 50;
    productButtons.forEach((b) => b.setAttribute("aria-pressed", b === button));
    draw();
  }));
  const bind = (id, key) => main.querySelector(id).addEventListener(id === "#f-q" ? "input" : "change", (e) => { s[key] = e.target.value; s.shown = 50; draw(); });
  [["#f-q", "q"], ["#f-treatment", "treatment"], ["#f-exposure", "exposure"], ["#f-origin", "origin"], ["#f-publisher", "publisher"], ["#f-category", "category"], ["#f-licence", "licence"], ["#f-sort", "sort"]].forEach(([id, key]) => bind(id, key));
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
      <div class="connector-head">${tile(slug, d.name)}<div><h1>${h(d.name)}</h1>
      <p class="lede" style="margin:0">${h(summarySentence(d))}</p></div></div>
      <p>
        ${d.kind ? `<span class="chip">${h(d.kind)}</span>` : ""}
        ${d.publisher ? `<span class="chip">Publisher: ${h(d.publisher)}</span>` : ""}
        ${d.premium ? '<span class="chip">Premium</span>' : ""}${d.preview ? '<span class="chip">Preview</span>' : ""}${d.deprecated ? '<span class="chip">Deprecated</span>' : ""}${d.mcp ? '<span class="chip">MCP server</span>' : ""}
      </p>
      ${d.services.length ? `<div class="works-in"><span class="label">Works in</span>${d.services.map((name) => product(name)).join("")}</div>` : ""}
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
      <p class="small muted" style="margin-top:.7rem">Based on <a href="#/build">your risk profile</a>. Change it and these results update.</p>

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
