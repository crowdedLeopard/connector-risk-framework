/**
 * The guarantee that matters most: a connector that goes through Dataverse comes back unchanged, so
 * the code app gives exactly the same treatment as the public site for every connector in every zone.
 *
 * It runs the committed catalogue through the sync's row builder (what is written to Dataverse) and
 * the app's row reader (what the app reads back), then compares with reading index.json directly.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultSettings, evaluateAll, ZONES } from "@engine";
// @ts-expect-error The sync is plain JavaScript with JSDoc types and has no declaration file.
import { connectorRow } from "../../sync/mapping.mjs";
import { connectorFromIndex, connectorFromRow, parseSettings, type IndexEntry } from "../src/data/mapping";

const index = JSON.parse(readFileSync(new URL("../../../data/current/index.json", import.meta.url), "utf8")) as IndexEntry[];

/** Fields that only exist on one side (Dataverse row IDs, sync bookkeeping) are left out of the comparison. */
const comparable = ({ id: _id, lastChanged: _l, learnUrl: _u, removed: _r, ...rest }: ReturnType<typeof connectorFromIndex>) => rest;

describe("Dataverse round trip", async () => {
  const viaDataverse = await Promise.all(
    index.map(async (entry) => {
      const row = (await connectorRow(entry, null, "2026-01-01")) as { id: string; body: Record<string, unknown> };
      return connectorFromRow({ ...row.body, crf_connectorid: row.id });
    }),
  );
  const direct = index.map(connectorFromIndex);

  it("keeps every field the engine and the screens use", () => {
    expect(viaDataverse.length).toBe(direct.length);
    for (let i = 0; i < direct.length; i++) expect(comparable(viaDataverse[i]), direct[i].s).toEqual(comparable(direct[i]));
  });

  it("gives the same treatment for every connector in every zone", () => {
    const settings = defaultSettings();
    for (const zone of ZONES) {
      const a = evaluateAll(viaDataverse, settings, zone.id).map((r) => r.treatment);
      const b = evaluateAll(direct, settings, zone.id).map((r) => r.treatment);
      expect(a).toEqual(b);
    }
  });
});

describe("parseSettings", () => {
  it("falls back to the defaults for missing or broken JSON", () => {
    expect(parseSettings("")).toEqual(defaultSettings());
    expect(parseSettings("{not json")).toEqual(defaultSettings());
  });

  it("never takes overrides from a profile, because decisions own them", () => {
    const stored = JSON.stringify({ ...defaultSettings(), overrides: { sql: "block" } });
    expect(parseSettings(stored).overrides).toEqual({});
  });
});
