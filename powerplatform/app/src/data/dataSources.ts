/**
 * Data source registration for the Power Apps client library.
 *
 * `pa app add data-source --connector dataverse --table <name>` writes a dataSourcesInfo module and
 * registers each table in power.config.json, which the Power Apps host reads at run time. Those files
 * belong to one environment, so they are not committed (see docs/DEPLOY.md). This module uses the
 * generated dataSourcesInfo when it exists, and otherwise an equivalent built-in description, so the
 * app compiles and type-checks in CI before any environment is involved.
 */
import type { getClient } from "@microsoft/power-apps/data";

/** The shape getClient expects, taken from its signature so it tracks the library version. */
type DataSourcesInfo = Parameters<typeof getClient>[0];

/** Tables the app reads or writes, by entity set name: [logical name, primary key column]. */
export const TABLES = {
  crf_connectors: ["crf_connector", "crf_connectorid"],
  crf_operations: ["crf_operation", "crf_operationid"],
  crf_connectortraits: ["crf_connectortrait", "crf_connectortraitid"],
  crf_changes: ["crf_change", "crf_changeid"],
  crf_refreshes: ["crf_refresh", "crf_refreshid"],
  crf_facts: ["crf_fact", "crf_factid"],
  crf_profiles: ["crf_profile", "crf_profileid"],
  crf_decisions: ["crf_decision", "crf_decisionid"],
} as const;

export type TableName = keyof typeof TABLES;

const builtIn: DataSourcesInfo = Object.fromEntries(
  Object.entries(TABLES).map(([name, [, primaryKey]]) => [name, { tableId: "", version: "", primaryKey, dataSourceType: "Dataverse", apis: {} }]),
);

// Vite resolves these globs at build time; they match nothing until the CLI has generated the files.
const generated = {
  ...import.meta.glob<{ dataSourcesInfo: DataSourcesInfo }>("/.power/schemas/appschemas/dataSourcesInfo.ts", { eager: true }),
  ...import.meta.glob<{ dataSourcesInfo: DataSourcesInfo }>("/.ms/schemas/appschemas/dataSourcesInfo.ts", { eager: true }),
};

const generatedInfo: DataSourcesInfo = Object.values(generated)[0]?.dataSourcesInfo ?? {};

export const dataSourcesInfo: DataSourcesInfo = { ...builtIn, ...generatedInfo };

/**
 * The name the client library knows a table by. The CLI names Dataverse sources by entity set name;
 * the logical name is accepted as a fallback in case a CLI version names them differently.
 */
export function sourceName(table: TableName): string {
  const [logical] = TABLES[table];
  if (!(table in generatedInfo) && logical in generatedInfo) return logical;
  return table;
}
