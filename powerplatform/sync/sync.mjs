// Loads the repository's weekly data into Dataverse, and keeps it in step.
//
// The sync is incremental by default. Connector rows are always upserted (1 to 2 thousand rows,
// a handful of $batch calls), but traits and operations, by far the largest tables, are rewritten
// only for connectors that are new or whose lastChanged date moved since the last sync. Rows that
// no longer exist in the data are deleted, except connectors, which are flagged as removed so their
// history and the organisation's decisions about them stay intact.

import { EXPOSURES, defaultSettings } from "../../site/js/engine.js";
import {
  changeRows,
  connectorRow,
  connectorTraitRows,
  factRows,
  ids,
  operationRows,
  refreshRow,
  traitRows,
  upserts,
} from "./mapping.mjs";

/**
 * @typedef {object} Source Where the repository data is read from.
 * @property {() => Promise<object[]>} index data/current/index.json
 * @property {(slug: string) => Promise<object|null>} detail data/current/connectors/<slug>.json
 * @property {() => Promise<object>} meta data/current/meta.json
 * @property {() => Promise<object>} facts data/current/facts.json
 * @property {() => Promise<string[]>} changeDates data/changes/index.json
 * @property {(date: string) => Promise<object>} changes data/changes/<date>.json
 */

/**
 * @param {import('./dataverse.mjs').Dataverse} dv
 * @param {Source} source
 * @param {{full?: boolean, commit?: string, log?: (m: string) => void, concurrency?: number, batchConcurrency?: number}} options
 *   concurrency: files read at once. batchConcurrency: Dataverse batches in flight (default 4, 6 for child rows).
 * @returns {Promise<object>} A summary of what was written.
 */
export async function sync(dv, source, { full = false, commit = "", log = () => {}, concurrency = 8, batchConcurrency } = {}) {
  const summary = { connectors: 0, traits: 0, operations: 0, removed: 0, deleted: 0, facts: 0, changes: 0, failed: [] };
  const record = (label, result) => {
    summary.failed.push(...result.failed.map((f) => ({ label, url: f.request.url, status: f.status, message: f.message })));
    return result.ok;
  };

  const [index, meta, facts] = await Promise.all([source.index(), source.meta(), source.facts()]);
  log(`Data date ${meta.dataDate}: ${index.length} connectors.`);

  // 1. Reference data: trait definitions and governance facts.
  summary.traitDefinitions = record("traits", await dv.batchAll(upserts(await traitRows(EXPOSURES)), { concurrency: batchConcurrency, label: "trait definitions" }));
  summary.facts = record("facts", await dv.batchAll(upserts(await factRows(facts)), { concurrency: batchConcurrency, label: "facts" }));

  // 2. Work out which connectors need their child rows rewritten.
  const existing = await dv.getAll("crf_connectors?$select=crf_connectorid,crf_slug,crf_lastchanged,crf_isremoved");
  const existingBySlug = new Map(existing.map((r) => [r.crf_slug, r]));
  const details = new Map();
  await mapLimit(index, concurrency, async (entry) => details.set(entry.s, await source.detail(entry.s)));
  const stale = index.filter((entry) => {
    if (full) return true;
    const row = existingBySlug.get(entry.s);
    if (!row || row.crf_isremoved) return true;
    return (row.crf_lastchanged ?? "").slice(0, 10) !== (details.get(entry.s)?.lastChanged ?? "");
  });
  log(`${stale.length} ${stale.length === 1 ? "connector is" : "connectors are"} new or changed${full ? " (full sync)" : ""}.`);

  // 3. Connectors. Always upserted, so flags and counts match this week's data.
  const connectorRows = await Promise.all(index.map((e) => connectorRow(e, details.get(e.s), meta.dataDate)));
  summary.connectors = record("connectors", await dv.batchAll(upserts(connectorRows), { concurrency: batchConcurrency, label: "connectors" }));

  // 4. Connectors that left the catalogue are flagged, not deleted.
  const inIndex = new Set(index.map((e) => e.s));
  const gone = existing.filter((r) => !inIndex.has(r.crf_slug) && !r.crf_isremoved);
  summary.removed = record(
    "removed",
    await dv.batchAll(gone.map((r) => ({ method: "PATCH", url: `crf_connectors(${r.crf_connectorid})`, body: { crf_isremoved: true } })), { concurrency: batchConcurrency, label: "removed" }),
  );

  // 5. Traits and operations for the connectors that changed.
  if (stale.length) {
    const knownTraits = new Set(EXPOSURES.map((e) => e.id));
    const staleSlugs = new Set(stale.map((e) => e.s));
    const traitRowsWanted = (await Promise.all(stale.map((e) => connectorTraitRows(e, details.get(e.s), knownTraits)))).flat();
    const opRowsWanted = (await Promise.all(stale.map((e) => operationRows(e.s, details.get(e.s))))).flat();

    summary.traits = record("connector traits", await dv.batchAll(upserts(traitRowsWanted), { concurrency: batchConcurrency, label: "connector traits", concurrency: batchConcurrency ?? 6 }));
    summary.operations = record("operations", await dv.batchAll(upserts(opRowsWanted), { concurrency: batchConcurrency, label: "operations", concurrency: batchConcurrency ?? 6 }));

    // Delete child rows of changed connectors that this week's data no longer has.
    const wanted = new Set([...traitRowsWanted, ...opRowsWanted].map((r) => r.id));
    const connectorIdsBySlug = new Map(await Promise.all(stale.map(async (e) => [await ids.connector(e.s), e.s])));
    const children = full
      ? [
          ...(await dv.getAll("crf_connectortraits?$select=crf_connectortraitid,_crf_connector_value")).map((r) => ({ set: "crf_connectortraits", id: r.crf_connectortraitid, parent: r._crf_connector_value })),
          ...(await dv.getAll("crf_operations?$select=crf_operationid,_crf_connector_value")).map((r) => ({ set: "crf_operations", id: r.crf_operationid, parent: r._crf_connector_value })),
        ]
      : await childrenOf(dv, [...connectorIdsBySlug.keys()]);
    const orphans = children.filter((c) => !wanted.has(c.id) && (full || staleSlugs.has(connectorIdsBySlug.get(c.parent))));
    summary.deleted = record("deleted", await dv.batchAll(orphans.map((c) => ({ method: "DELETE", url: `${c.set}(${c.id})` })), { concurrency: batchConcurrency, label: "stale rows" }));
  }

  // 6. Change log: every weekly change file, so history is complete after a first sync.
  const dates = await source.changeDates();
  const knownSlugs = new Set([...inIndex, ...existing.map((r) => r.crf_slug)]);
  let latestChanges = null;
  for (const date of dates) {
    const changes = await source.changes(date);
    if (date === meta.dataDate) latestChanges = changes;
    summary.changes += record("changes", await dv.batchAll(upserts(await changeRows(changes, knownSlugs)), { concurrency: batchConcurrency, label: `changes ${date}` }));
  }

  // 7. The weekly snapshot for trends.
  const operationCount = [...details.values()].reduce((n, d) => n + (d?.actions?.length ?? 0) + (d?.triggers?.length ?? 0), 0);
  record("refresh", await dv.batchAll(upserts([await refreshRow(meta, latestChanges, operationCount, commit)]), { concurrency: batchConcurrency, label: "refresh" }));

  // 8. A starting risk profile, only if the organisation has none yet.
  const profiles = await dv.get("crf_profiles?$select=crf_profileid&$top=1");
  if (!profiles.value.length) {
    log("Creating the default risk profile (Microsoft's starting point).");
    await dv.request("POST", "crf_profiles", {
      crf_name: "Microsoft's starting point",
      crf_description: "Follows Microsoft's data policy strategy guidance. Change it in the app to match your organisation.",
      crf_isdefault: true,
      crf_settingsjson: JSON.stringify(defaultSettings()),
    });
  }

  log(summary.failed.length ? `Done. ${summary.failed.length} ${summary.failed.length === 1 ? "request" : "requests"} failed.` : "Done. No requests failed.");
  return summary;
}

/** Reads traits and operations for a set of connectors, 25 connectors per query to keep URLs short. */
async function childrenOf(dv, connectorIds) {
  const rows = [];
  for (let i = 0; i < connectorIds.length; i += 25) {
    const filter = connectorIds.slice(i, i + 25).map((id) => `_crf_connector_value eq ${id}`).join(" or ");
    for (const [set, key] of [["crf_connectortraits", "crf_connectortraitid"], ["crf_operations", "crf_operationid"]]) {
      const found = await dv.getAll(`${set}?$select=${key},_crf_connector_value&$filter=${encodeURIComponent(filter)}`);
      rows.push(...found.map((r) => ({ set, id: r[key], parent: r._crf_connector_value })));
    }
  }
  return rows;
}

/** Runs fn over items with at most `limit` in flight. */
export async function mapLimit(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

/** Reads the published site or raw GitHub files over HTTP. Used from a browser or a machine without a clone. */
export function httpSource(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  const json = async (path, optional = false) => {
    const response = await fetch(`${base}/${path}`);
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };
  return {
    index: () => json("data/current/index.json"),
    detail: (slug) => json(`data/current/connectors/${encodeURIComponent(slug)}.json`, true),
    meta: () => json("data/current/meta.json"),
    facts: () => json("data/current/facts.json"),
    changeDates: async () => (await json("data/changes/index.json", true)) ?? [],
    changes: (date) => json(`data/changes/${date}.json`),
  };
}
