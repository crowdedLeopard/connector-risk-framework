/**
 * Reads and writes the Connector Risk Framework tables through the Power Apps client library.
 *
 * Inside Power Apps the host signs the user in and applies their Dataverse security roles, so this
 * class never sees a token. Every query selects only the columns it maps, as Microsoft recommends,
 * and pages with skip tokens so large tables (about 23,000 operations) are never read in one go.
 */
import { getClient } from "@microsoft/power-apps/data";
import { getContext } from "@microsoft/power-apps/app";
import { CHOICES } from "@schema";
import type { Repository } from "./repository";
import type { Catalogue, Change, Connector, ConnectorDetail, Decision, Fact, Profile, Refresh, User } from "./types";
import { dataSourcesInfo, sourceName, type TableName } from "./dataSources";
import {
  CONNECTOR_COLUMNS,
  changeFromRow,
  connectorFromRow,
  decisionFromRow,
  factFromRow,
  operationFromRow,
  profileFromRow,
  refreshFromRow,
  type Row,
} from "./mapping";

interface QueryOptions {
  select: readonly string[];
  filter?: string;
  orderBy?: string[];
  top?: number;
}

/** Raised with a message a person can act on, rather than a raw HTTP error. */
export class DataError extends Error {
  constructor(action: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause ?? "unknown error");
    super(`Could not ${action}. ${detail}`);
  }
}

export class DataverseRepository implements Repository {
  readonly sourceLabel = "Dataverse";
  readonly canWrite = true;

  private readonly client = getClient(dataSourcesInfo);
  private slugById = new Map<string, string>();

  /** Reads every page of a query. */
  private async all(table: TableName, options: QueryOptions, action: string): Promise<Row[]> {
    const rows: Row[] = [];
    let skipToken: string | undefined;
    do {
      const result = await this.client.retrieveMultipleRecordsAsync<Row>(sourceName(table), {
        select: [...options.select],
        filter: options.filter,
        orderBy: options.orderBy,
        top: options.top,
        maxPageSize: 5000,
        skipToken,
      });
      if (!result.success) throw new DataError(action, result.error);
      rows.push(...(result.data ?? []));
      skipToken = options.top ? undefined : result.skipToken;
    } while (skipToken);
    return rows;
  }

  async currentUser(): Promise<User> {
    try {
      const context = await getContext();
      return { name: context.user.fullName ?? context.user.userPrincipalName ?? "" };
    } catch {
      return { name: "" };
    }
  }

  async loadCatalogue(): Promise<Catalogue> {
    const rows = await this.all("crf_connectors", { select: CONNECTOR_COLUMNS, orderBy: ["crf_name asc"] }, "load the connector catalogue");
    const connectors = rows.map(connectorFromRow);
    this.slugById = new Map(connectors.map((c) => [c.id, c.s]));
    const dataDate = rows.reduce((latest, r) => {
      const d = String(r.crf_datadate ?? "").slice(0, 10);
      return d > latest ? d : latest;
    }, "");
    const categories = [...new Set(connectors.flatMap((c) => c.c))].sort();
    return { connectors, dataDate, categories };
  }

  async loadDetail(connector: Connector): Promise<ConnectorDetail> {
    const filter = `_crf_connector_value eq ${connector.id}`;
    const [ops, traits, extra] = await Promise.all([
      this.all(
        "crf_operations",
        { select: ["crf_name", "crf_apioperationid", "crf_kind", "crf_class", "crf_basis", "crf_method", "crf_isdeprecated", "crf_parametercount", "crf_anchor"], filter, orderBy: ["crf_name asc"] },
        "load operations",
      ),
      this.all("crf_connectortraits", { select: ["crf_name", "crf_evidence"], filter }, "load trait evidence"),
      this.client.retrieveRecordAsync<Row>(sourceName("crf_connectors"), connector.id, {
        select: ["crf_originevidence", "crf_authtypes", "crf_website", "crf_privacypolicy", "crf_servicedomain"],
      }),
    ]);
    if (!extra.success) throw new DataError("load connector details", extra.error);
    const evidence: Record<string, string> = {};
    for (const t of traits) {
      // crf_name is "<slug> · <trait key>", written by the sync.
      const key = String(t.crf_name ?? "").split(" · ")[1];
      if (key) evidence[key] = String(t.crf_evidence ?? "");
    }
    const e = extra.data ?? {};
    return {
      operations: ops.map(operationFromRow),
      evidence,
      originEvidence: String(e.crf_originevidence ?? ""),
      authTypes: String(e.crf_authtypes ?? "").split("\n").filter(Boolean),
      website: String(e.crf_website ?? ""),
      privacyPolicy: String(e.crf_privacypolicy ?? ""),
      serviceDomain: String(e.crf_servicedomain ?? ""),
    };
  }

  async loadChanges(): Promise<Change[]> {
    const rows = await this.all(
      "crf_changes",
      { select: ["crf_changeid", "crf_name", "crf_slug", "crf_changedate", "crf_changetype", "crf_summary"], orderBy: ["crf_changedate desc", "crf_name asc"] },
      "load catalogue changes",
    );
    return rows.map(changeFromRow);
  }

  async loadRefreshes(): Promise<Refresh[]> {
    const rows = await this.all(
      "crf_refreshes",
      {
        select: [
          "crf_datadate", "crf_connectorcount", "crf_operationcount", "crf_premiumcount", "crf_previewcount", "crf_mcpcount",
          "crf_independentcount", "crf_newcount", "crf_removedcount", "crf_changedcount", "crf_classifieragree", "crf_classifiercomparable",
        ],
        orderBy: ["crf_datadate asc"],
      },
      "load refresh history",
    );
    return rows.map(refreshFromRow);
  }

  async loadFacts(): Promise<Fact[]> {
    const rows = await this.all(
      "crf_facts",
      { select: ["crf_name", "crf_statement", "crf_status", "crf_source", "crf_sourceurl", "crf_lastchecked"], orderBy: ["crf_name asc"] },
      "load governance facts",
    );
    return rows.map(factFromRow);
  }

  async loadProfile(): Promise<Profile | null> {
    const rows = await this.all(
      "crf_profiles",
      { select: ["crf_profileid", "crf_name", "crf_description", "crf_settingsjson", "modifiedon"], orderBy: ["crf_isdefault desc", "modifiedon desc"], top: 1 },
      "load the risk profile",
    );
    return rows[0] ? profileFromRow(rows[0]) : null;
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    const body = {
      crf_name: profile.name,
      crf_description: profile.description,
      crf_isdefault: true,
      crf_settingsjson: JSON.stringify({ ...profile.settings, overrides: {} }),
    };
    const result = profile.id
      ? await this.client.updateRecordAsync<typeof body, Row>(sourceName("crf_profiles"), profile.id, body)
      : await this.client.createRecordAsync<typeof body, Row>(sourceName("crf_profiles"), body);
    if (!result.success) throw new DataError("save the risk profile", result.error);
    return { ...profile, id: profile.id || String(result.data?.crf_profileid ?? ""), modifiedOn: new Date().toISOString() };
  }

  async loadDecisions(): Promise<Decision[]> {
    const rows = await this.all(
      "crf_decisions",
      {
        select: ["crf_decisionid", "crf_name", "_crf_connector_value", "crf_decision", "crf_rationale", "crf_reference", "crf_reviewdate", "_ownerid_value", "modifiedon"],
        orderBy: ["modifiedon desc"],
      },
      "load connector decisions",
    );
    return rows.map((r) => decisionFromRow(r, this.slugById));
  }

  async saveDecision(decision: Decision): Promise<Decision> {
    // Only the fields a person edits are sent, so auditing shows real changes only.
    const body: Record<string, unknown> = {
      crf_name: decision.slug,
      crf_decision: CHOICES.crf_decisiontype.values[decision.decision],
      crf_rationale: decision.rationale,
      crf_reference: decision.reference,
      crf_reviewdate: decision.reviewDate || null,
    };
    if (!decision.id) body["crf_connector@odata.bind"] = `/crf_connectors(${decision.connectorId})`;
    const result = decision.id
      ? await this.client.updateRecordAsync<typeof body, Row>(sourceName("crf_decisions"), decision.id, body)
      : await this.client.createRecordAsync<typeof body, Row>(sourceName("crf_decisions"), body);
    if (!result.success) throw new DataError("save the decision", result.error);
    return { ...decision, id: decision.id || String(result.data?.crf_decisionid ?? ""), modifiedOn: new Date().toISOString() };
  }

  async deleteDecision(decision: Decision): Promise<void> {
    const result = await this.client.deleteRecordAsync(sourceName("crf_decisions"), decision.id);
    if (!result.success) throw new DataError("remove the decision", result.error);
  }
}
