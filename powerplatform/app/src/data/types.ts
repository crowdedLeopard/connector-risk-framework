/**
 * The app's data model. Views depend only on these types and on the Repository interface, never on
 * Dataverse directly, so the same screens run against Dataverse in Power Apps and against the
 * repository's JSON files in demo mode.
 */
import type { EngineConnector, Override, Settings } from "@engine";

/** A connector: the engine's short-key shape plus the fields the screens show. */
export interface Connector extends EngineConnector {
  /** Dataverse row ID. Empty in demo mode. */
  id: string;
  premium: boolean;
  preview: boolean;
  deprecated: boolean;
  /** Kind of built-in item, for example "Desktop flow module". Empty for ordinary connectors. */
  kind: string;
  products: string[];
  firstSeen: string;
  lastChanged: string;
  removed: boolean;
  learnUrl: string;
}

export interface Operation {
  name: string;
  opId: string;
  kind: "action" | "trigger";
  cls: string;
  basis: string;
  method: string;
  deprecated: boolean;
  parameterCount: number;
  anchor: string;
}

/** The parts of a connector only the detail page needs, loaded on demand. */
export interface ConnectorDetail {
  operations: Operation[];
  /** Evidence for each trait the connector has, keyed by trait ID. */
  evidence: Record<string, string>;
  originEvidence: string;
  authTypes: string[];
  website: string;
  privacyPolicy: string;
  serviceDomain: string;
}

export interface Change {
  id: string;
  date: string;
  type: "new" | "removed" | "changed";
  slug: string;
  name: string;
  summary: string;
}

/** One weekly refresh, for trends. */
export interface Refresh {
  date: string;
  connectors: number;
  operations: number;
  premium: number;
  preview: number;
  mcp: number;
  independent: number;
  added: number;
  removed: number;
  changed: number;
  classifierAgree: number;
  classifierComparable: number;
}

export interface Fact {
  id: string;
  statement: string;
  status: string;
  source: string;
  sourceUrl: string;
  lastChecked: string;
}

/** The organisation's criteria. `settings` is the engine's settings object. */
export interface Profile {
  id: string;
  name: string;
  description: string;
  settings: Settings;
  modifiedOn: string;
}

/** A decision register entry; it overrides the criteria for one connector. */
export interface Decision {
  id: string;
  connectorId: string;
  slug: string;
  decision: Override;
  rationale: string;
  reference: string;
  reviewDate: string;
  owner: string;
  modifiedOn: string;
}

export interface Catalogue {
  connectors: Connector[];
  dataDate: string;
  categories: string[];
}

export interface User {
  name: string;
}
