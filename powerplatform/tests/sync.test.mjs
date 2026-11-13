// Offline tests for the Dataverse mapping and sync. A small in-memory fake of the Web API stands in
// for Dataverse, so the whole sync runs end to end without an environment.
//
//   node --test powerplatform/tests/

import { test } from "node:test";
import assert from "node:assert/strict";
import { Dataverse, parseBatchResponse, stableId } from "../sync/dataverse.mjs";
import { changeRows, connectorRow, describeChange, operationRows } from "../sync/mapping.mjs";
import { sync } from "../sync/sync.mjs";
import { fileSource } from "../sync/cli.mjs";
import { CHOICES, TABLES } from "../dataverse/schema.mjs";
import { attributeMetadata } from "../sync/provision.mjs";

// ---------------------------------------------------------------------------------------------
// A fake Dataverse: tables are Maps of id -> row. It understands just what sync.mjs sends.
// ---------------------------------------------------------------------------------------------
function fakeDataverse() {
  const tables = new Map();
  const table = (set) => tables.get(set) ?? tables.set(set, new Map()).get(set);
  const calls = { batches: 0, writes: 0 };

  const flatten = (set, id, body) => {
    const row = { ...table(set).get(id) };
    const key = `${set.replace(/s$/, "").replace(/(refreshe)$/, "refresh")}id`;
    row[key] = id;
    for (const [k, v] of Object.entries(body)) {
      const bindMatch = k.match(/^(.+)@odata\.bind$/);
      if (bindMatch) row[`_${bindMatch[1]}_value`] = v.match(/\(([^)]+)\)/)[1];
      else row[k] = v;
    }
    table(set).set(id, row);
  };

  const respond = (status, body) =>
    new Response(status === 204 ? null : typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname.replace("/api/data/v9.2/", ""));
    if (p === "$batch") {
      calls.batches += 1;
      const parts = init.body.split(/--batch_[a-z0-9]+/).slice(1, -1);
      const out = [];
      for (const part of parts) {
        const [, method, target] = part.match(/(PATCH|DELETE|POST) \S*\/api\/data\/v9\.2\/(\S+) HTTP/);
        const [, set, id] = target.match(/^(\w+)\(([^)]+)\)$/);
        calls.writes += 1;
        if (method === "DELETE") table(set).delete(id);
        else flatten(set, id, JSON.parse(part.slice(part.lastIndexOf("\r\n\r\n") + 4).trim()));
        out.push("HTTP/1.1 204 No Content");
      }
      return respond(200, out.join("\r\n"));
    }
    if (init.method === "POST") {
      flatten(p, crypto.randomUUID(), JSON.parse(init.body));
      return respond(204, "");
    }
    const set = p.split("?")[0];
    let rows = [...table(set).values()];
    const filter = u.searchParams.get("$filter");
    if (filter) {
      const wanted = new Set([...filter.matchAll(/_crf_connector_value eq ([0-9a-f-]{36})/g)].map((m) => m[1]));
      rows = rows.filter((r) => wanted.has(r._crf_connector_value));
    }
    if (u.searchParams.get("$top")) rows = rows.slice(0, Number(u.searchParams.get("$top")));
    return respond(200, { value: rows });
  };
  return { tables, table, calls };
}

// A source built from the real repository data, trimmed so tests stay fast.
function sampleSource(limit = 40, mutate = (x) => x) {
  const real = fileSource();
  return {
    ...real,
    index: async () => mutate((await real.index()).slice(0, limit)),
  };
}

test("stable IDs are deterministic, version 5, and distinct per key", async () => {
  const a = await stableId("connector", "sql");
  assert.equal(a, await stableId("connector", "sql"));
  assert.notEqual(a, await stableId("connector", "sharepointonline"));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("every choice used by the data maps to an option value", async () => {
  const source = fileSource();
  const [index] = await Promise.all([source.index()]);
  for (const e of index) {
    const row = await connectorRow(e, null, "2026-01-01");
    for (const column of ["crf_origin", "crf_publishertype", "crf_acpsupport", "crf_tenantisolation"]) {
      assert.notEqual(row.body[column], null, `${e.s}.${column} has no option value`);
    }
  }
});

test("connector rows respect column lengths in the schema", async () => {
  const lengths = Object.fromEntries(TABLES.find((t) => t.name === "crf_connector").columns.filter((c) => c.max).map((c) => [c.name, c.max]));
  const source = fileSource();
  for (const e of (await source.index()).slice(0, 300)) {
    const row = await connectorRow(e, await source.detail(e.s), "2026-01-01");
    for (const [k, v] of Object.entries(row.body)) {
      if (typeof v === "string" && lengths[k]) assert.ok(v.length <= lengths[k], `${e.s}.${k} is ${v.length} characters`);
    }
  }
});

test("operation rows have unique IDs and a class for every operation", async () => {
  const source = fileSource();
  const rows = await operationRows("sql", await source.detail("sql"));
  assert.ok(rows.length > 10);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const r of rows) assert.ok(Object.values(CHOICES.crf_operationclass.values).includes(r.body.crf_class));
});

test("change rows describe what changed and link known connectors only", async () => {
  const rows = await changeRows(
    { date: "2026-11-09", names: {}, new: ["a"], removed: ["gone"], changed: [{ slug: "a", exposuresAdded: ["send"], operationsAdded: ["X", "Y"] }] },
    new Set(["a"]),
  );
  assert.equal(rows.length, 3);
  assert.ok(rows[0].body["crf_connector@odata.bind"]);
  assert.equal(rows[1].body["crf_connector@odata.bind"], undefined);
  assert.equal(describeChange({ slug: "a", exposuresAdded: ["send"], operationsAdded: ["X", "Y"] }), "Traits added: Sends or shares data outward. 2 operations added");
});

test("batch responses are parsed into successes and failures", () => {
  const text = 'HTTP/1.1 204 No Content\r\n--x\r\nHTTP/1.1 400 Bad Request\r\n{"error":{"message":"bad value"}}';
  const result = parseBatchResponse(text, [{ url: "a" }, { url: "b" }]);
  assert.equal(result.ok, 1);
  assert.equal(result.failed[0].message, "bad value");
});

test("attribute metadata is built for every column type", () => {
  const ids = Object.fromEntries(Object.keys(CHOICES).map((k) => [k, "00000000-0000-0000-0000-000000000000"]));
  for (const t of TABLES) for (const c of t.columns) assert.ok(attributeMetadata(c, ids)["@odata.type"]);
});

test("sync loads, then a second sync only rewrites what changed, and removals are flagged", async () => {
  const fake = fakeDataverse();
  const dv = new Dataverse({ url: "https://example.crm.dynamics.com" });

  const first = await sync(dv, sampleSource());
  assert.equal(first.failed.length, 0);
  assert.equal(fake.table("crf_connectors").size, 40);
  assert.ok(fake.table("crf_operations").size > 40);
  assert.ok(fake.table("crf_connectortraits").size > 40);
  assert.equal(fake.table("crf_profiles").size, 1);
  const opsAfterFirst = fake.table("crf_operations").size;

  // Nothing changed: no trait or operation writes, the profile is not duplicated.
  const writesBefore = fake.calls.writes;
  const second = await sync(dv, sampleSource());
  assert.equal(second.operations, 0);
  assert.equal(fake.table("crf_operations").size, opsAfterFirst);
  assert.equal(fake.table("crf_profiles").size, 1);
  assert.ok(fake.calls.writes - writesBefore < 200);

  // One connector leaves the catalogue: it is flagged, not deleted.
  const third = await sync(dv, sampleSource(40, (index) => index.slice(1)));
  assert.equal(third.removed, 1);
  assert.equal(fake.table("crf_connectors").size, 40);
  assert.equal([...fake.table("crf_connectors").values()].filter((r) => r.crf_isremoved).length, 1);
});

test("a connector that loses a trait has the stale trait row deleted", async () => {
  const fake = fakeDataverse();
  const dv = new Dataverse({ url: "https://example.crm.dynamics.com" });
  await sync(dv, sampleSource(5));
  const before = fake.table("crf_connectortraits").size;
  const source = sampleSource(5);
  const real = source.detail;
  source.index = async () => (await fileSource().index()).slice(0, 5).map((e, i) => (i === 0 ? { ...e, x: e.x.slice(1) } : e));
  source.detail = async (slug) => {
    const d = await real(slug);
    return d && slug === (await fileSource().index())[0].s ? { ...d, lastChanged: "2099-01-01" } : d;
  };
  const result = await sync(dv, source);
  assert.equal(result.deleted, 1);
  assert.equal(fake.table("crf_connectortraits").size, before - 1);
});

test("schema: no column or lookup reuses a name Dataverse reserves for the table", () => {
  // Dataverse names a table's primary key <table>id, and adds <table>name-style system columns.
  // A custom column with the primary key's name silently collides, so guard against it.
  for (const t of TABLES) {
    const names = [t.primary.name, ...t.columns.map((c) => c.name), ...(t.lookups ?? []).map((l) => l.name)];
    assert.ok(!names.includes(`${t.name}id`), `${t.name} has a column named ${t.name}id`);
    assert.equal(new Set(names).size, names.length, `${t.name} has duplicate column names`);
    for (const n of names) assert.match(n, /^crf_[a-z0-9_]+$/, `${t.name}.${n} must be lower case with the crf_ prefix`);
  }
});

test("docs: DATA-MODEL.md matches the schema", async () => {
  const { readFile } = await import("node:fs/promises");
  const { render } = await import("../dataverse/document.mjs");
  const committed = await readFile(new URL("../docs/DATA-MODEL.md", import.meta.url), "utf8");
  assert.equal(committed, render(), "Run: node powerplatform/dataverse/document.mjs");
});
