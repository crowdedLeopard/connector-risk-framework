/// <reference types="vite/client" />

/**
 * Types for the shared JavaScript modules the app imports from the rest of the repository.
 * The modules themselves are plain ES modules (site/js/engine.js, powerplatform/dataverse/schema.mjs);
 * these declarations describe only the parts the app uses.
 */

interface ImportMetaEnv {
  /** "demo" serves the repository's own data files and keeps edits in the browser. */
  readonly MODE: string;
  /** Optional base URL for demo data, for example the published GitHub Pages site. */
  readonly VITE_DEMO_DATA_URL?: string;
}

declare module "@engine" {
  export type Tolerance = "allow" | "controls" | "deny";
  export type TreatmentId = "block" | "retain" | "modify" | "allow" | "outside";
  export type ZoneId = "shared" | "team" | "production";
  export type PresetId = "microsoft" | "tighter" | "open";
  export type Override = "approved" | "allow" | "block";

  export interface Exposure {
    id: string;
    group: "destination" | "capability" | "identity" | "maintenance" | "data";
    scope: "action" | "endpoint" | "connector";
    cls?: string;
    label: string;
    help: string;
    basis: string;
    facts: string[];
  }
  export interface Zone {
    id: ZoneId;
    label: string;
    help: string;
    facts: string[];
  }
  export interface Controls {
    acp: string;
    actionControl: boolean;
    blockable: boolean;
    classifiable: boolean;
    dataPolicy: boolean;
    endpointFiltering: boolean;
    logicApps: boolean;
    nonblockable: boolean;
    tenantIsolation: string;
  }
  /** A connector in the short-key shape of data/current/index.json, which evaluate() expects. */
  export interface EngineConnector {
    s: string;
    n: string;
    p: string;
    pt: string;
    o: string;
    x: string[];
    c: string[];
    cc: Record<string, number>;
    ct: Controls;
    la: number;
    tr: number;
    m: boolean;
    api: string;
  }
  export interface Settings {
    version: number;
    levels: Record<ZoneId, PresetId>;
    adjust: Record<ZoneId, Record<string, Tolerance>>;
    zones: Record<ZoneId, Record<string, Tolerance>>;
    context: { policyModel: "classic" | "mixed" | "acp"; managed: boolean; logicApps: boolean; copilot: boolean };
    sensitiveCategories: string[];
    overrides: Record<string, Override>;
  }
  export interface Reason {
    text: string;
    facts: string[];
  }
  export interface Step extends Reason {
    kind: string;
    cls?: string;
  }
  export interface Result {
    treatment: TreatmentId;
    group: string | null;
    why: Reason[];
    slug: string;
    reasons: { id: string; tolerance: Tolerance }[];
    notes: Reason[];
    steps: Step[];
    redLines: number;
    override: Override | null;
    deniedClasses: string[];
    limitedClasses: string[];
  }

  export const TOLERANCES: Tolerance[];
  export const TOLERANCE_LABELS: Record<Tolerance, string>;
  export const GROUPS: { id: Exposure["group"]; label: string }[];
  export const EXPOSURES: Exposure[];
  export const EXPOSURE_BY_ID: Record<string, Exposure>;
  export const ZONES: Zone[];
  export const PRESETS: Record<PresetId, { label: string; help: string; zones: Record<ZoneId, Record<string, Tolerance>> }>;
  export const TREATMENTS: Record<TreatmentId, { label: string; iso: string; order: number }>;

  export function defaultSettings(): Settings;
  export function setLevel(settings: Settings, preset: PresetId, zoneId?: ZoneId | null): Settings;
  export function setLimit(settings: Settings, zoneId: ZoneId, exposureId: string, value: Tolerance): Settings;
  export function clearChanges(settings: Settings): Settings;
  export function countChanges(settings: Settings): number;
  export function profileLabel(settings: Settings): string;
  export function migrateProfile(settings: Settings): Settings;
  export function evaluate(connector: EngineConnector, tolerances: Record<string, Tolerance>, settings: Settings): Result;
  export function evaluateAll(connectors: EngineConnector[], settings: Settings, zoneId: ZoneId): Result[];
  export function summarise(results: Result[]): Record<TreatmentId, number>;
  export function exposureCounts(connectors: EngineConnector[], settings: Settings): Record<string, number>;
}

declare module "@schema" {
  interface ChoiceDefinition {
    label: string;
    options: [string, string][];
    /** Repository key to Dataverse option value. */
    values: Record<string, number>;
    /** Dataverse option value to repository key. */
    keys: Record<number, string>;
  }
  export const CHOICES: Record<
    | "crf_origin"
    | "crf_publishertype"
    | "crf_acpsupport"
    | "crf_tenantisolation"
    | "crf_operationkind"
    | "crf_operationclass"
    | "crf_traitgroup"
    | "crf_traitscope"
    | "crf_changetype"
    | "crf_decisiontype",
    ChoiceDefinition
  >;
  export const TABLES: { name: string; set: string; label: string; plural: string }[];
  export const SOLUTION: { uniquename: string; friendlyname: string; version: string };
}

declare module "@describe" {
  /** Describes one entry of a change file's `changed` list in plain words. */
  export function describeChange(change: Record<string, unknown>): string;
}
