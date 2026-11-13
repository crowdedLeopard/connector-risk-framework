#!/usr/bin/env node
// Command line entry point for provisioning the schema and syncing data.
//
//   node powerplatform/sync/cli.mjs provision        Create or complete the tables in the environment.
//   node powerplatform/sync/cli.mjs sync [--full]    Load this clone's data/ into Dataverse.
//   node powerplatform/sync/cli.mjs plan             Show what a sync would write, without connecting.
//
// Settings come from environment variables, so nothing secret is ever passed on the command line:
//   DATAVERSE_URL        https://<org>.crm.dynamics.com
//   AZURE_TENANT_ID      Directory (tenant) ID
//   AZURE_CLIENT_ID      Application (client) ID of the service principal
//   AZURE_CLIENT_SECRET  Optional. Without it, GitHub Actions OIDC federation is used.
//   GITHUB_SHA           Optional. Recorded on the refresh row.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tokenProvider } from "./auth.mjs";
import { Dataverse } from "./dataverse.mjs";
import { provision } from "./provision.mjs";
import { sync } from "./sync.mjs";
import { connectorRow, operationRows } from "./mapping.mjs";
import { SOLUTION } from "../dataverse/schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Reads the repository's data folder from disk. */
export function fileSource(root = ROOT) {
  const json = async (rel, optional = false) => {
    const file = path.join(root, rel);
    if (optional && !existsSync(file)) return null;
    return JSON.parse(await readFile(file, "utf8"));
  };
  return {
    index: () => json("data/current/index.json"),
    detail: (slug) => json(`data/current/connectors/${slug}.json`, true),
    meta: () => json("data/current/meta.json"),
    facts: () => json("data/current/facts.json"),
    changeDates: async () => (await json("data/changes/index.json", true)) ?? [],
    changes: (date) => json(`data/changes/${date}.json`),
  };
}

function client() {
  const url = process.env.DATAVERSE_URL;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const missing = Object.entries({ DATAVERSE_URL: url, AZURE_TENANT_ID: tenantId, AZURE_CLIENT_ID: clientId })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Set ${missing.join(", ")}.`);
  const token = tokenProvider({ tenantId, clientId, clientSecret: process.env.AZURE_CLIENT_SECRET, resource: url });
  return new Dataverse({ url, token, solution: SOLUTION.uniquename, log: console.log });
}

async function plan() {
  const source = fileSource();
  const [index, meta] = await Promise.all([source.index(), source.meta()]);
  let operations = 0;
  for (const entry of index) operations += (await operationRows(entry.s, await source.detail(entry.s))).length;
  const sample = await connectorRow(index[0], await source.detail(index[0].s), meta.dataDate);
  console.log(JSON.stringify({ dataDate: meta.dataDate, connectors: index.length, operations, sample }, null, 2));
}

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  if (command === "plan") return plan();
  if (command === "provision") return provision(client(), console.log);
  if (command === "sync") {
    // --concurrency=N lowers (or raises) how many batches are in flight, for environments that throttle hard.
    const concurrency = Number(flags.find((f) => f.startsWith("--concurrency="))?.split("=")[1]) || undefined;
    const summary = await sync(client(), fileSource(), { full: flags.includes("--full"), commit: process.env.GITHUB_SHA ?? "", log: console.log, batchConcurrency: concurrency });
    console.log(JSON.stringify({ ...summary, failed: summary.failed.slice(0, 20) }, null, 2));
    // A few rejected rows should not hide a good refresh, but a broad failure must fail the job.
    if (summary.failed.length > 25) process.exitCode = 1;
    return;
  }
  console.log("Usage: node powerplatform/sync/cli.mjs <provision|sync [--full] [--concurrency=N]|plan>");
  process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    if (error.detail) console.error(JSON.stringify(error.detail).slice(0, 2000));
    process.exitCode = 1;
  });
}
