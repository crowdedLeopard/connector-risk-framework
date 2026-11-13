// Freshness rules for the stale-data banner and the Status page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LATE_AFTER_DAYS, ageInDays, freshness, nextRefresh } from "../site/js/status.js";

const at = (iso) => new Date(iso);

test("age counts whole UTC days", () => {
  assert.equal(ageInDays("2026-11-09", at("2026-11-09T23:59:00Z")), 0);
  assert.equal(ageInDays("2026-11-09", at("2026-11-10T00:01:00Z")), 1);
  assert.equal(ageInDays("not a date", at("2026-11-10T00:00:00Z")), Infinity);
});

test("a missed Monday is tolerated, then flagged", () => {
  assert.equal(freshness("2026-11-09", at("2026-11-16T04:00:00Z")).state, "current");
  assert.equal(freshness("2026-11-09", at("2026-11-17T04:00:00Z")).state, "current");
  assert.equal(freshness("2026-11-09", at("2026-11-17T12:00:00Z")).days, LATE_AFTER_DAYS);
  assert.equal(freshness("2026-11-09", at("2026-11-18T12:00:00Z")).state, "late");
  assert.equal(freshness("2026-11-09", at("2026-11-30T12:00:00Z")).state, "stale");
});

test("next refresh is the coming Monday at 05:17 UTC", () => {
  assert.equal(nextRefresh(at("2026-11-13T16:00:00Z")).toISOString(), "2026-11-16T05:17:00.000Z");
  assert.equal(nextRefresh(at("2026-11-16T05:00:00Z")).toISOString(), "2026-11-16T05:17:00.000Z");
  assert.equal(nextRefresh(at("2026-11-16T05:17:00Z")).toISOString(), "2026-11-23T05:17:00.000Z");
});
