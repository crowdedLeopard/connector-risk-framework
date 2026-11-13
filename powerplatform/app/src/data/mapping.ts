/**
 * Converts stored rows into the app's types. Kept separate from I/O so it is unit tested
 * (mapping.test.ts) and so both repositories produce identical objects.
 */
import { CHOICES } from "@schema";
import type { Change, Connector, Decision, Fact, Operation, Profile, Refresh } from "./types";
import { defaultSettings, migrateProfile, type Override, type Settings } from "@engine";

/** Option value to repository key, for example 419300001 to "third-party". */
export const choiceKey = (set: keyof typeof CHOICES, value: unknown, fallback = ""): string =>
  typeof value === "number" ? CHOICES[set].keys[value] ?? fallback : fallback;

const list = (value: unknown, separator: string | RegExp): string[] =>
  typeof value === "string" && value.trim() ? value.split(separator).map((s) => s.trim()).filter(Boolean) : [];

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number => (typeof value === "number" ? value : 0);
const day = (value: unknown): string => str(value).slice(0, 10);

/** The columns the catalogue needs. Every query selects only what it uses. */
export const CONNECTOR_COLUMNS = [
  "crf_connectorid", "crf_name", "crf_slug", "crf_apiid", "crf_kind", "crf_publishername", "crf_publishertype",
  "crf_origin", "crf_premium", "crf_preview", "crf_deprecated", "crf_mcp", "crf_isremoved", "crf_liveactions",
  "crf_triggers", "crf_readactions", "crf_writeactions", "crf_deleteactions", "crf_sendactions", "crf_rawactions",
  "crf_adminactions", "crf_otheractions", "crf_classifiable", "crf_datapolicy", "crf_blockable", "crf_nonblockable",
  "crf_actioncontrol", "crf_endpointfiltering", "crf_logicapps", "crf_acpsupport", "crf_tenantisolation",
  "crf_traitkeys", "crf_categories", "crf_products", "crf_learnurl", "crf_firstseen", "crf_lastchanged", "crf_datadate",
] as const;

export type Row = Record<string, unknown>;

export function connectorFromRow(r: Row): Connector {
  // Only non-zero counts, matching index.json, because the engine sums whatever keys are present.
  const cc: Record<string, number> = {};
  for (const [cls, column] of [
    ["read", "crf_readactions"], ["write", "crf_writeactions"], ["delete", "crf_deleteactions"], ["send", "crf_sendactions"],
    ["raw", "crf_rawactions"], ["admin", "crf_adminactions"], ["other", "crf_otheractions"],
  ] as const) {
    const n = num(r[column]);
    if (n) cc[cls] = n;
  }
  return {
    id: str(r.crf_connectorid),
    s: str(r.crf_slug),
    n: str(r.crf_name),
    p: str(r.crf_publishername),
    pt: choiceKey("crf_publishertype", r.crf_publishertype, "other"),
    o: choiceKey("crf_origin", r.crf_origin, "unstated"),
    x: list(r.crf_traitkeys, ";"),
    c: list(r.crf_categories, ";"),
    cc,
    ct: {
      acp: choiceKey("crf_acpsupport", r.crf_acpsupport, "unconfirmed"),
      actionControl: Boolean(r.crf_actioncontrol),
      blockable: Boolean(r.crf_blockable),
      classifiable: Boolean(r.crf_classifiable),
      dataPolicy: Boolean(r.crf_datapolicy),
      endpointFiltering: Boolean(r.crf_endpointfiltering),
      logicApps: Boolean(r.crf_logicapps),
      nonblockable: Boolean(r.crf_nonblockable),
      tenantIsolation: choiceKey("crf_tenantisolation", r.crf_tenantisolation, "not-shown"),
    },
    la: num(r.crf_liveactions),
    tr: num(r.crf_triggers),
    m: Boolean(r.crf_mcp),
    api: str(r.crf_apiid),
    premium: Boolean(r.crf_premium),
    preview: Boolean(r.crf_preview),
    deprecated: Boolean(r.crf_deprecated),
    kind: str(r.crf_kind),
    products: list(r.crf_products, ";"),
    firstSeen: day(r.crf_firstseen),
    lastChanged: day(r.crf_lastchanged),
    removed: Boolean(r.crf_isremoved),
    learnUrl: str(r.crf_learnurl),
  };
}

/** One entry of data/current/index.json, as used in demo mode. */
export interface IndexEntry {
  s: string; n: string; p: string; pt: string; o: string; x: string[]; c: string[]; cc: Record<string, number>;
  ct: Connector["ct"]; la: number; tr: number; m: boolean; api: string; pr: boolean; pv: boolean; dp: boolean;
  k: string; sv: string[]; fs: string; cd: boolean;
}

/** Reads an index.json entry (demo mode). Only the Connector fields are kept, never the raw short keys. */
export function connectorFromIndex(e: IndexEntry): Connector {
  return {
    s: e.s, n: e.n, p: e.p, pt: e.pt, o: e.o, x: e.x, c: e.c, cc: e.cc, ct: e.ct, la: e.la, tr: e.tr, m: e.m, api: e.api,
    id: "",
    premium: e.pr,
    preview: e.pv,
    deprecated: e.dp,
    kind: e.k,
    products: e.sv,
    firstSeen: e.fs,
    lastChanged: "",
    removed: false,
    learnUrl: e.api ? `https://learn.microsoft.com/en-us/connectors/${e.s}/` : "",
  };
}

export function operationFromRow(r: Row): Operation {
  return {
    name: str(r.crf_name),
    opId: str(r.crf_apioperationid),
    kind: choiceKey("crf_operationkind", r.crf_kind, "action") as Operation["kind"],
    cls: choiceKey("crf_operationclass", r.crf_class, "other"),
    basis: str(r.crf_basis),
    method: str(r.crf_method),
    deprecated: Boolean(r.crf_isdeprecated),
    parameterCount: num(r.crf_parametercount),
    anchor: str(r.crf_anchor),
  };
}

export function changeFromRow(r: Row): Change {
  return {
    id: str(r.crf_changeid),
    date: day(r.crf_changedate),
    type: choiceKey("crf_changetype", r.crf_changetype, "changed") as Change["type"],
    slug: str(r.crf_slug),
    name: str(r.crf_name).replace(/: (new|removed|changed)$/, ""),
    summary: str(r.crf_summary),
  };
}

export function refreshFromRow(r: Row): Refresh {
  return {
    date: day(r.crf_datadate),
    connectors: num(r.crf_connectorcount),
    operations: num(r.crf_operationcount),
    premium: num(r.crf_premiumcount),
    preview: num(r.crf_previewcount),
    mcp: num(r.crf_mcpcount),
    independent: num(r.crf_independentcount),
    added: num(r.crf_newcount),
    removed: num(r.crf_removedcount),
    changed: num(r.crf_changedcount),
    classifierAgree: num(r.crf_classifieragree),
    classifierComparable: num(r.crf_classifiercomparable),
  };
}

export function factFromRow(r: Row): Fact {
  return {
    id: str(r.crf_name),
    statement: str(r.crf_statement),
    status: str(r.crf_status),
    source: str(r.crf_source),
    sourceUrl: str(r.crf_sourceurl),
    lastChecked: day(r.crf_lastchecked),
  };
}

/**
 * Reads stored settings defensively: a profile saved by an older version, or edited by hand, must
 * never stop the app from opening. Anything unreadable falls back to Microsoft's starting point.
 */
export function parseSettings(json: unknown): Settings {
  try {
    const parsed = typeof json === "string" && json ? (JSON.parse(json) as Settings) : null;
    if (!parsed || typeof parsed !== "object") return defaultSettings();
    const base = defaultSettings();
    return migrateProfile({
      ...base,
      ...parsed,
      context: { ...base.context, ...parsed.context },
      sensitiveCategories: Array.isArray(parsed.sensitiveCategories) ? parsed.sensitiveCategories : [],
      // Overrides live in the decision register, never in the profile.
      overrides: {},
    });
  } catch {
    return defaultSettings();
  }
}

export function profileFromRow(r: Row): Profile {
  return {
    id: str(r.crf_profileid),
    name: str(r.crf_name),
    description: str(r.crf_description),
    settings: parseSettings(r.crf_settingsjson),
    modifiedOn: str(r.modifiedon),
  };
}

export function decisionFromRow(r: Row, slugById: Map<string, string>): Decision {
  const connectorId = str(r._crf_connector_value);
  return {
    id: str(r.crf_decisionid),
    connectorId,
    slug: slugById.get(connectorId) ?? "",
    decision: choiceKey("crf_decisiontype", r.crf_decision, "approved") as Override,
    rationale: str(r.crf_rationale),
    reference: str(r.crf_reference),
    reviewDate: day(r.crf_reviewdate),
    owner: str(r["_ownerid_value@OData.Community.Display.V1.FormattedValue"]),
    modifiedOn: str(r.modifiedon),
  };
}
