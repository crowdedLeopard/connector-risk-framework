/**
 * Shared state and rendering helpers used by every view.
 *
 * Rendering model: each view builds an HTML string and assigns it to a container.
 * Every value that came from data or the reader passes through h() first, so data
 * can never inject markup. Helpers here return strings for the same reason.
 *
 * @module ui
 */
import { TREATMENTS, defaultSettings, evaluateAll, migrateProfile } from "./engine.js";

const STORAGE_KEY = "crf.settings.v1";

/**
 * The single in-memory store, filled once by app.js at start-up.
 * - index:     compact rows from data/current/index.json (see schema/index.schema.json)
 * - bySlug:    the same rows keyed by slug
 * - meta, facts: data/current/meta.json and facts.json
 * - factById:  facts keyed by ID, for citations
 * - settings:  the reader's risk profile, persisted in localStorage
 * - zone:      the environment zone the catalogue is showing
 * - details:   full connector records, fetched on demand and cached
 * - build:     data/current/build.json once status.js has loaded it
 */
export const store = { index: [], bySlug: new Map(), meta: null, facts: null, factById: new Map(), settings: null, zone: "shared", details: new Map() };

/** Escape a value for safe use in HTML text and attribute values. */
export const h = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Format a number with British thousands separators, for example 1,597. */
export const fmt = (n) => Number(n).toLocaleString("en-GB");
/** "1 connector", "2 connectors". Only for regular English plurals. */
export const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

/**
 * Read the saved risk profile, upgrading older shapes with migrateProfile().
 * Falls back to the defaults when storage is empty, unavailable or unreadable.
 * @returns {object} settings
 */
export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && saved.zones?.shared) return migrateProfile(saved);
  } catch { /* storage can be unavailable; defaults still work */ }
  return defaultSettings();
}

// Evaluation results per zone. Evaluating 1,600 connectors is cheap, but views ask for
// the same zone many times per render, so results are memoised until settings change.
let cache = new Map();

/** Persist store.settings and invalidate cached results. Call after every settings change. */
export function saveSettings() {
  cache = new Map();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.settings)); } catch { /* the page still works without storage */ }
}

/**
 * The engine's result for every connector in store.index, for one zone, in index order.
 * @param {string} zoneId "shared", "team" or "production"
 * @returns {object[]} one result per connector
 */
export function resultsFor(zoneId) {
  if (!cache.has(zoneId)) cache.set(zoneId, evaluateAll(store.index, store.settings, zoneId));
  return cache.get(zoneId);
}

/**
 * Fetch and cache a connector's full record from data/current/connectors/{slug}.json.
 * @throws {Error} when no record exists for the slug
 */
export async function connectorDetail(slug) {
  if (!store.details.has(slug)) {
    const response = await fetch(`data/current/connectors/${encodeURIComponent(slug)}.json`);
    if (!response.ok) throw new Error(`No record for ${slug}`);
    store.details.set(slug, await response.json());
  }
  return store.details.get(slug);
}

/**
 * Fetch many connector records with at most eight requests in flight. Records that fail
 * to load are left out rather than failing the whole batch.
 * @param {string[]} slugs
 * @returns {Promise<Object<string, object>>} records keyed by slug
 */
export async function connectorDetails(slugs) {
  const queue = [...slugs];
  const worker = async () => { while (queue.length) await connectorDetail(queue.pop()).catch(() => null); };
  await Promise.all(Array.from({ length: 8 }, worker));
  return Object.fromEntries(slugs.filter((s) => store.details.has(s)).map((s) => [s, store.details.get(s)]));
}

// Line icons for treatments, drawn on a 24 by 24 grid with a 2.2 stroke.
const ICONS = {
  block: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
  retain: '<path d="M12 4l9 16H3z"/><path d="M12 10v5M12 17.5v.5"/>',
  modify: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  allow: '<path d="M5 13l4 4 10-11"/>',
  outside: '<path d="M14 5h5v5M19 5l-8 8M10 5H5v14h14v-5"/>',
};

/** Inline SVG for a treatment icon. Decorative: the label beside it carries the meaning. */
export const icon = (name, size = 14) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// Official Microsoft product icons. Microsoft's terms require the full product name beside
// each icon, unaltered, and only ever representing that product. Azure Logic Apps is not in
// the Power Platform set, so it appears as its name alone.
const IMG = "img/microsoft/";
const PRODUCTS = {
  "Power Platform": { name: "Microsoft Power Platform", file: "PowerPlatform_scalable.svg" },
  "Power Apps": { name: "Power Apps", file: "PowerApps_scalable.svg" },
  "Power Automate": { name: "Power Automate", file: "PowerAutomate_scalable.svg" },
  "Copilot Studio": { name: "Microsoft Copilot Studio", file: "CopilotStudio_scalable.svg" },
  Dataverse: { name: "Microsoft Dataverse", file: "Dataverse_scalable.svg" },
  "Logic Apps": { name: "Azure Logic Apps", file: "" },
};

export const productIcon = (key) => (PRODUCTS[key]?.file ? `<img src="${IMG}${PRODUCTS[key].file}" alt="" width="96" height="96">` : "");
export const productName = (key) => PRODUCTS[key]?.name ?? key;
export const product = (key) => `<span class="product">${productIcon(key)}${h(productName(key))}</span>`;

// Connectors that are themselves these Microsoft products, so their name sits beside the icon.
const CONNECTOR_PRODUCT = {
  microsoftcopilotstudio: "Copilot Studio", commondataservice: "Dataverse", commondataserviceforapps: "Dataverse",
  powerappsforadmins: "Power Apps", powerappsforappmakers: "Power Apps", powerappsnotification: "Power Apps", powerappsnotificationv2: "Power Apps",
  microsoftflowforadmins: "Power Automate", flowmanagement: "Power Automate",
  powerplatformforadmins: "Power Platform", powerplatformadminv2: "Power Platform",
};

/**
 * The square tile beside a connector name: the product icon for Microsoft's own platform
 * connectors, otherwise the first letter or digit of the name.
 */
export function tile(slug, name, small = false) {
  const key = CONNECTOR_PRODUCT[slug];
  if (key) return `<span class="tile icon-tile ${small ? "small" : ""}" aria-hidden="true">${productIcon(key)}</span>`;
  const letter = (String(name).match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return `<span class="tile ${small ? "small" : ""}" aria-hidden="true">${h(letter)}</span>`;
}

/** A treatment badge: icon plus label, coloured by treatment. */
export const pill = (treatment) => `<span class="pill ${treatment}">${icon(treatment)}${h(TREATMENTS[treatment].label)}</span>`;

/**
 * "Source:" links for the facts behind a statement, grouped by source page. A source whose
 * evidence phrase was not found at the last check is flagged as under review.
 * @param {string[]} factIds IDs from data/facts.yaml
 */
export function cite(factIds = []) {
  const seen = new Map();
  for (const id of factIds) {
    const fact = store.factById.get(id);
    if (!fact) continue;
    const entry = seen.get(fact.source) ?? { changed: false, statement: [] };
    if (fact.status !== "verified") entry.changed = true;
    entry.statement.push(fact.statement);
    seen.set(fact.source, entry);
  }
  if (!seen.size) return "";
  const links = [...seen].map(([key, entry]) => {
    const source = store.facts.sources[key];
    const flag = entry.changed ? ' <span class="changed">(source changed, under review)</span>' : "";
    return `<a href="${h(source.url)}" target="_blank" rel="noopener" title="${h(entry.statement.join(" "))}">${h(source.title)}</a>${flag}`;
  });
  return `<span class="source">Source: ${links.join("; ")}</span>`;
}

/**
 * A stacked bar of treatment counts. Each segment carries a tooltip; the whole bar has a
 * text equivalent for screen readers.
 * @param {Object<string, number>} counts from summarise()
 */
export function bar(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const segments = Object.keys(TREATMENTS).filter((k) => counts[k] > 0).map((k) => {
    const tip = `${TREATMENTS[k].label}: ${fmt(counts[k])}`;
    return `<span class="seg-${k}" style="width:${(counts[k] / total) * 100}%" data-tip="${h(tip)}" title="${h(tip)}"></span>`;
  });
  const summary = Object.keys(TREATMENTS).map((k) => `${TREATMENTS[k].label} ${fmt(counts[k])}`).join(", ");
  return `<div class="bar" role="img" aria-label="${h(summary)}">${segments.join("")}</div>`;
}

/** The colour key for bar(), with a count beside each treatment. */
export function legend(counts) {
  return `<ul class="legend">${Object.keys(TREATMENTS).map((k) => `<li><i class="seg-${k}"></i>${h(TREATMENTS[k].label)} <b>${fmt(counts[k])}</b></li>`).join("")}</ul>`;
}

/** Save a generated file in the browser, without a server round trip. */
export function download(filename, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Speak a status message to screen readers through the polite live region in index.html. */
export function announce(message) {
  document.getElementById("live").textContent = message;
}

/**
 * Serialise rows to RFC 4180 CSV. Cells that start with a formula character are prefixed
 * with an apostrophe so spreadsheet programs show them as text (CSV injection).
 * @param {Array<Array<*>>} rows the first row is the header
 */
export function csv(rows) {
  const cell = (v) => {
    let s = String(v ?? "");
    // Spreadsheet programs treat these leading characters as formulas.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
