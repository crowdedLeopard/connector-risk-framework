// Pure functions that turn the repository's published data into Dataverse rows.
//
// Nothing here talks to Dataverse, so it is unit tested offline (powerplatform/tests). Each function
// returns { set, id, body }: the entity set, the row's stable primary key, and the columns to write.
// Writing with PATCH set(id) is an upsert, so every sync is idempotent.

import { CHOICES } from "../dataverse/schema.mjs";
import { stableId } from "./dataverse.mjs";
import { describeChange } from "./describe.mjs";

const choice = (set, key) => (key == null ? null : CHOICES[set].values[key] ?? null);
const clip = (value, max) => (value == null ? null : String(value).slice(0, max));
const dateOnly = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value ?? "") ? value : null);
const bind = (set, id) => `/${set}(${id})`;

/** Primary keys. Each is derived from the row's natural key, never stored state. */
export const ids = {
  connector: (slug) => stableId("connector", slug),
  trait: (key) => stableId("trait", key),
  connectorTrait: (slug, key) => stableId("connectortrait", slug, key),
  operation: (slug, kind, opId, anchor) => stableId("operation", slug, kind, opId, anchor ?? ""),
  fact: (id) => stableId("fact", id),
  change: (date, type, slug) => stableId("change", date, type, slug),
  refresh: (date) => stableId("refresh", date),
};

/** Summarises authentication types for display, one per line. */
function authSummary(authTypes = []) {
  return authTypes
    .filter((a) => a.nameResolved !== false)
    .map((a) => `${a.name}${a.shareable ? " (shareable)" : ""}`)
    .join("\n");
}

/**
 * One connector row.
 * @param {object} entry Row from data/current/index.json (short keys).
 * @param {object|null} detail data/current/connectors/<slug>.json, when it exists.
 * @param {string} dataDate meta.dataDate of this refresh.
 */
export async function connectorRow(entry, detail, dataDate) {
  const cc = entry.cc ?? {};
  const ct = entry.ct ?? {};
  return {
    set: "crf_connectors",
    id: await ids.connector(entry.s),
    body: {
      crf_name: clip(entry.n, 200),
      crf_slug: entry.s,
      crf_apiid: clip(entry.api, 200) || null,
      crf_kind: clip(entry.k, 100) || null,
      crf_publishername: clip(entry.p, 200),
      crf_publishertype: choice("crf_publishertype", entry.pt),
      crf_origin: choice("crf_origin", entry.o),
      crf_originevidence: clip(detail?.originEvidence, 2000),
      crf_premium: Boolean(entry.pr),
      crf_preview: Boolean(entry.pv),
      crf_deprecated: Boolean(entry.dp),
      crf_mcp: Boolean(entry.m),
      crf_hasdefinition: Boolean(entry.cd),
      crf_isremoved: false,
      crf_liveactions: entry.la ?? 0,
      crf_triggers: entry.tr ?? 0,
      crf_readactions: cc.read ?? 0,
      crf_writeactions: cc.write ?? 0,
      crf_deleteactions: cc.delete ?? 0,
      crf_sendactions: cc.send ?? 0,
      crf_rawactions: cc.raw ?? 0,
      crf_adminactions: cc.admin ?? 0,
      crf_otheractions: cc.other ?? 0,
      crf_classifiable: Boolean(ct.classifiable),
      crf_datapolicy: Boolean(ct.dataPolicy),
      crf_blockable: Boolean(ct.blockable),
      crf_nonblockable: Boolean(ct.nonblockable),
      crf_actioncontrol: Boolean(ct.actionControl),
      crf_endpointfiltering: Boolean(ct.endpointFiltering),
      crf_logicapps: Boolean(ct.logicApps),
      crf_acpsupport: choice("crf_acpsupport", ct.acp),
      crf_tenantisolation: choice("crf_tenantisolation", ct.tenantIsolation),
      // Delimited at both ends so a filter can match one whole key: contains(crf_traitkeys,';write;')
      crf_traitkeys: clip(entry.x?.length ? `;${entry.x.join(";")};` : "", 1000),
      crf_categories: clip((entry.c ?? []).join("; "), 1000),
      crf_products: clip((entry.sv ?? []).join("; "), 500),
      crf_authtypes: clip(authSummary(detail?.authTypes), 4000),
      crf_servicedomain: clip(detail?.serviceDomain, 200),
      crf_learnurl: clip(detail?.learnUrl, 500),
      crf_website: clip(detail?.website, 500),
      crf_privacypolicy: clip(detail?.privacyPolicy, 500),
      crf_firstseen: dateOnly(entry.fs),
      crf_lastchanged: dateOnly(detail?.lastChanged),
      crf_datadate: dateOnly(dataDate),
    },
  };
}

/** Trait definitions, from EXPOSURES in site/js/engine.js. */
export async function traitRows(exposures) {
  return Promise.all(
    exposures.map(async (e, i) => ({
      set: "crf_traits",
      id: await ids.trait(e.id),
      body: {
        crf_name: e.label,
        crf_key: e.id,
        crf_group: choice("crf_traitgroup", e.group),
        crf_scope: choice("crf_traitscope", e.scope),
        crf_help: clip(e.help, 2000),
        crf_basis: clip(e.basis, 200),
        crf_sortorder: i,
      },
    })),
  );
}

/** One row per trait on a connector, with the evidence text from the detail file. */
export async function connectorTraitRows(entry, detail, knownTraits) {
  const evidence = detail?.exposures ?? {};
  const connectorId = await ids.connector(entry.s);
  const rows = [];
  for (const key of entry.x ?? []) {
    if (!knownTraits.has(key)) continue;
    rows.push({
      set: "crf_connectortraits",
      id: await ids.connectorTrait(entry.s, key),
      body: {
        crf_name: clip(`${entry.s} · ${key}`, 200),
        crf_evidence: clip(evidence[key] ?? null, 4000),
        "crf_connector@odata.bind": bind("crf_connectors", connectorId),
        "crf_trait@odata.bind": bind("crf_traits", await ids.trait(key)),
      },
    });
  }
  return rows;
}

/** Actions and triggers. The anchor joins the key because a few connectors repeat an operation ID. */
export async function operationRows(slug, detail) {
  if (!detail) return [];
  const connectorId = await ids.connector(slug);
  const ops = [...(detail.actions ?? []), ...(detail.triggers ?? [])];
  const seen = new Set();
  const rows = [];
  for (const o of ops) {
    const kind = o.kind === "trigger" ? "trigger" : "action";
    const id = await ids.operation(slug, kind, o.opId ?? o.name, o.anchor);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      set: "crf_operations",
      id,
      body: {
        crf_name: clip(o.name, 300),
        crf_apioperationid: clip(o.opId, 300),
        crf_kind: choice("crf_operationkind", kind),
        crf_class: choice("crf_operationclass", o.class) ?? choice("crf_operationclass", "other"),
        crf_basis: clip(o.basis, 200),
        crf_method: clip(o.method?.toUpperCase(), 20),
        crf_isdeprecated: Boolean(o.deprecated),
        crf_parametercount: o.parameters?.length ?? 0,
        crf_anchor: clip(o.anchor, 400),
        "crf_connector@odata.bind": bind("crf_connectors", connectorId),
      },
    });
  }
  return rows;
}

/** Governance facts from data/current/facts.json. */
export async function factRows(factsFile) {
  const sources = factsFile.sources ?? {};
  return Promise.all(
    (factsFile.facts ?? []).map(async (f) => ({
      set: "crf_facts",
      id: await ids.fact(f.id),
      body: {
        crf_name: clip(f.id, 100),
        crf_statement: clip(f.statement, 2000),
        crf_status: clip(f.status, 50),
        crf_source: clip(f.source, 100),
        crf_sourceurl: clip(typeof sources[f.source] === "string" ? sources[f.source] : sources[f.source]?.url, 500),
        crf_missing: clip((f.missing ?? []).join("\n"), 2000),
        crf_lastchecked: dateOnly(f.lastChecked),
      },
    })),
  );
}

export { describeChange };

/** New, removed and changed connectors from one data/changes/<date>.json file. */
export async function changeRows(changes, knownSlugs) {
  const date = changes.date;
  const names = changes.names ?? {};
  const rows = [];
  const add = async (type, slug, summary, detail) => {
    const body = {
      crf_name: clip(`${names[slug] ?? slug}: ${type}`, 300),
      crf_slug: slug,
      crf_changedate: dateOnly(date),
      crf_changetype: choice("crf_changetype", type),
      crf_summary: clip(summary, 4000),
      crf_detailjson: detail ? clip(JSON.stringify(detail), 100000) : null,
    };
    // Removed connectors keep their row, so the change can still link to it.
    if (knownSlugs.has(slug)) body["crf_connector@odata.bind"] = bind("crf_connectors", await ids.connector(slug));
    rows.push({ set: "crf_changes", id: await ids.change(date, type, slug), body });
  };
  for (const slug of changes.new ?? []) await add("new", slug, "Added to the catalogue.");
  for (const slug of changes.removed ?? []) await add("removed", slug, "No longer in the catalogue.");
  for (const c of changes.changed ?? []) await add("changed", c.slug, describeChange(c), c);
  return rows;
}

/** One weekly snapshot, for trends. */
export async function refreshRow(meta, changes, operationCount, commit) {
  const counts = meta.counts ?? {};
  return {
    set: "crf_refreshes",
    id: await ids.refresh(meta.dataDate),
    body: {
      crf_name: meta.dataDate,
      crf_datadate: dateOnly(meta.dataDate),
      crf_connectorcount: counts.catalogue ?? null,
      crf_operationcount: operationCount ?? counts.operations ?? null,
      crf_premiumcount: counts.premium ?? null,
      crf_previewcount: counts.preview ?? null,
      crf_mcpcount: counts.mcp ?? null,
      crf_independentcount: counts.independent ?? null,
      crf_microsoftcount: counts.microsoftPublished ?? null,
      crf_nonblockablecount: counts.nonblockable ?? null,
      crf_newcount: changes?.new?.length ?? 0,
      crf_removedcount: changes?.removed?.length ?? 0,
      crf_changedcount: changes?.changed?.length ?? 0,
      crf_classifieragree: meta.classifier?.agree ?? null,
      crf_classifiercomparable: meta.classifier?.comparable ?? null,
      crf_commit: clip(commit, 100),
      crf_metajson: clip(JSON.stringify({ ...meta, classifier: { ...meta.classifier, sampleDisagreements: undefined } }), 100000),
    },
  };
}

/** Turns rows into $batch upsert requests. */
export const upserts = (rows) => rows.map((r) => ({ method: "PATCH", url: `${r.set}(${r.id})`, body: r.body }));
