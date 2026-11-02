// Shared state and rendering helpers.
import { TREATMENTS, defaultSettings, evaluateAll, migrateProfile } from "./engine.js";

const STORAGE_KEY = "crf.settings.v1";

export const store = { index: [], bySlug: new Map(), meta: null, facts: null, factById: new Map(), settings: null, zone: "shared", details: new Map() };

export const h = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const fmt = (n) => Number(n).toLocaleString("en-GB");
export const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && saved.zones?.shared) return migrateProfile(saved);
  } catch { /* storage can be unavailable; defaults still work */ }
  return defaultSettings();
}

let cache = new Map();
export function saveSettings() {
  cache = new Map();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store.settings)); } catch { /* the page still works without storage */ }
}

export function resultsFor(zoneId) {
  if (!cache.has(zoneId)) cache.set(zoneId, evaluateAll(store.index, store.settings, zoneId));
  return cache.get(zoneId);
}

export async function connectorDetail(slug) {
  if (!store.details.has(slug)) {
    const response = await fetch(`data/current/connectors/${encodeURIComponent(slug)}.json`);
    if (!response.ok) throw new Error(`No record for ${slug}`);
    store.details.set(slug, await response.json());
  }
  return store.details.get(slug);
}

export async function connectorDetails(slugs) {
  const queue = [...slugs];
  const worker = async () => { while (queue.length) await connectorDetail(queue.pop()).catch(() => null); };
  await Promise.all(Array.from({ length: 8 }, worker));
  return Object.fromEntries(slugs.filter((s) => store.details.has(s)).map((s) => [s, store.details.get(s)]));
}

const ICONS = {
  block: '<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>',
  retain: '<path d="M12 4l9 16H3z"/><path d="M12 10v5M12 17.5v.5"/>',
  modify: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  allow: '<path d="M5 13l4 4 10-11"/>',
  outside: '<path d="M14 5h5v5M19 5l-8 8M10 5H5v14h14v-5"/>',
};

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

export function tile(slug, name, small = false) {
  const key = CONNECTOR_PRODUCT[slug];
  if (key) return `<span class="tile icon-tile ${small ? "small" : ""}" aria-hidden="true">${productIcon(key)}</span>`;
  const letter = (String(name).match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return `<span class="tile ${small ? "small" : ""}" aria-hidden="true">${h(letter)}</span>`;
}

export const pill = (treatment) => `<span class="pill ${treatment}">${icon(treatment)}${h(TREATMENTS[treatment].label)}</span>`;

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

export function bar(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const segments = Object.keys(TREATMENTS).filter((k) => counts[k] > 0).map((k) => {
    const tip = `${TREATMENTS[k].label}: ${fmt(counts[k])}`;
    return `<span class="seg-${k}" style="width:${(counts[k] / total) * 100}%" data-tip="${h(tip)}" title="${h(tip)}"></span>`;
  });
  const summary = Object.keys(TREATMENTS).map((k) => `${TREATMENTS[k].label} ${fmt(counts[k])}`).join(", ");
  return `<div class="bar" role="img" aria-label="${h(summary)}">${segments.join("")}</div>`;
}

export function legend(counts) {
  return `<ul class="legend">${Object.keys(TREATMENTS).map((k) => `<li><i class="seg-${k}"></i>${h(TREATMENTS[k].label)} <b>${fmt(counts[k])}</b></li>`).join("")}</ul>`;
}

export function download(filename, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function announce(message) {
  document.getElementById("live").textContent = message;
}

export function csv(rows) {
  const cell = (v) => {
    let s = String(v ?? "");
    // Spreadsheet programs treat these leading characters as formulas.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
