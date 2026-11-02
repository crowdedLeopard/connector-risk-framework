// The decision engine. Pure functions only, so it runs the same in the browser and in tests.
// It never produces a risk score. It compares documented traits against the criteria the
// organisation sets, then says which documented control can carry out the result.

export const TOLERANCES = ["allow", "controls", "deny"];

export const TOLERANCE_LABELS = {
  allow: "Accept",
  controls: "Accept with controls",
  deny: "Do not accept",
};

export const GROUPS = [
  { id: "destination", label: "Where data can go" },
  { id: "capability", label: "What it can do" },
  { id: "identity", label: "Whose identity and credentials" },
  { id: "maintenance", label: "Who maintains it" },
  { id: "data", label: "What your data needs" },
];

// scope decides which control can act on an exposure:
//   action:    individual actions can be restricted
//   endpoint:  the destination can be restricted
//   connector: only the connector as a whole can be restricted
export const EXPOSURES = [
  { id: "any-endpoint", group: "destination", scope: "endpoint", label: "Reaches any endpoint the maker names",
    help: "HTTP, FTP, SFTP, SMTP and similar. The destination is not fixed by the connector.", basis: "Curated list", facts: ["http-child", "endpoint-filtering"] },
  { id: "maker-target", group: "destination", scope: "endpoint", label: "Maker chooses the target system at connection",
    help: "The connection asks for a server, host, URL or instance. Data policies cannot see which one.", basis: "Derived from connection parameters", facts: ["no-connection-control"] },
  { id: "third-party", group: "destination", scope: "connector", label: "Service outside Microsoft's own domains",
    help: "Data reaches a service run by another organisation. The publisher alone does not decide this.", basis: "Derived from Website on Learn", facts: ["publisher-owner"] },
  { id: "consumer", group: "destination", scope: "connector", label: "Personal or consumer service",
    help: "Business data could reach a personal account.", basis: "Curated list", facts: ["personal"] },
  { id: "public-publishing", group: "destination", scope: "connector", label: "Public publishing or public access",
    help: "Social media, public sites, or agents open without sign-in.", basis: "Learn category and curated list", facts: ["copilot-scope"] },
  { id: "external-ai", group: "destination", scope: "connector", label: "External AI service",
    help: "Learn category AI, on a service outside Microsoft's own domains.", basis: "Derived from category and Website", facts: ["publisher-owner"] },
  { id: "microsoft-premium", group: "destination", scope: "connector", label: "Microsoft service beyond the shared baseline",
    help: "Premium Microsoft services such as Azure. Microsoft's shared baseline stops at Microsoft 365 and standard services.", basis: "Derived from class and Website", facts: ["baseline-shared", "baseline-team"] },
  { id: "send", group: "capability", scope: "action", cls: "send", label: "Sends or shares data outward",
    help: "Email, messages, posts or invitations.", basis: "Derived from operation names", facts: ["action-control"] },
  { id: "delete", group: "capability", scope: "action", cls: "delete", label: "Deletes or removes data",
    help: "Operations named as deletions, or that use HTTP DELETE.", basis: "Derived from operations", facts: ["action-control"] },
  { id: "write", group: "capability", scope: "action", cls: "write", label: "Creates or changes data",
    help: "Operations that write to the connected service.", basis: "Derived from operation names", facts: ["action-control"] },
  { id: "raw", group: "capability", scope: "action", cls: "raw", label: "Runs raw requests, queries or scripts",
    help: "A single action that can do far more than its name suggests.", basis: "Derived from operation names", facts: ["action-control"] },
  { id: "admin", group: "capability", scope: "action", cls: "admin", label: "Administers platform, identity or access",
    help: "Operations that change roles, permissions or environments.", basis: "Derived from operation names and curated list", facts: ["action-control"] },
  { id: "shareable-auth", group: "identity", scope: "connector", label: "Offers a Shareable connection",
    help: "The connection is shared when a Power App is shared, so other people act through it.", basis: "Stated on Learn", facts: ["shareable", "owasp-risks"] },
  { id: "stored-secret", group: "identity", scope: "connector", label: "Connection stores a secret",
    help: "An API key, password or certificate is saved in the connection.", basis: "Stated on Learn", facts: ["saved-credential", "owasp-risks"] },
  { id: "independent", group: "maintenance", scope: "connector", label: "Independent publisher",
    help: "Built and maintained by a community author, not the service owner.", basis: "Stated on Learn or in Microsoft's repository", facts: [] },
  { id: "preview", group: "maintenance", scope: "connector", label: "Preview connector",
    help: "Marked Preview on Learn. Most of the catalogue is.", basis: "Stated on Learn", facts: [] },
  { id: "deprecated", group: "maintenance", scope: "connector", label: "Deprecated connector",
    help: "Marked deprecated in its name on Learn.", basis: "Stated on Learn", facts: [] },
  { id: "mcp", group: "maintenance", scope: "connector", label: "MCP server",
    help: "A tool surface for agents. ACP can only block the server as a whole.", basis: "Stated on Learn", facts: ["mcp-server"] },
  { id: "undocumented", group: "maintenance", scope: "connector", label: "Learn page has gaps",
    help: "The page shows no authentication types or no operations, or it could not be read.", basis: "Measured from the page", facts: [] },
  { id: "sensitive-category", group: "data", scope: "connector", label: "In a category you marked as sensitive",
    help: "Uses the categories on Learn, which publishers choose. Many connectors have none.", basis: "Your choice", facts: [] },
];

export const EXPOSURE_BY_ID = Object.fromEntries(EXPOSURES.map((e) => [e.id, e]));

// Zones follow the three environment types in Microsoft's data policy strategy guidance.
export const ZONES = [
  { id: "shared", label: "Default and shared", help: "The default environment, and any new environment.", facts: ["baseline-shared"] },
  { id: "team", label: "Dedicated team", help: "Chosen environments with a controlled maker list.", facts: ["baseline-team"] },
  { id: "production", label: "Production", help: "Business unit and project environments, agreed per solution.", facts: ["baseline-production"] },
];

const none = () => Object.fromEntries(EXPOSURES.map((e) => [e.id, "allow"]));
const withOverrides = (values) => ({ ...none(), ...values });

// Presets are starting points. "microsoft" follows Microsoft's guidance as closely as it can be followed,
// and the tool says where that guidance is silent. The others are clearly offered as judgement.
export const PRESETS = {
  microsoft: {
    label: "Microsoft's starting point",
    help: "Follows the data policy strategy guidance. Where it is silent, the setting stays at Accept.",
    zones: {
      shared: withOverrides({ "any-endpoint": "deny", "third-party": "deny", consumer: "deny", "public-publishing": "deny", "external-ai": "deny", "microsoft-premium": "deny" }),
      team: withOverrides({ "any-endpoint": "controls", "maker-target": "controls", "third-party": "controls", consumer: "controls", "public-publishing": "controls", "external-ai": "controls" }),
      production: withOverrides({ "any-endpoint": "controls", "maker-target": "controls", "third-party": "controls", consumer: "controls", "public-publishing": "controls", "external-ai": "controls" }),
    },
  },
  tighter: {
    label: "Tighter",
    help: "Our judgement, not Microsoft guidance. Adds limits on capabilities, credentials and maintenance.",
    zones: {
      shared: withOverrides({ "any-endpoint": "deny", "maker-target": "deny", "third-party": "deny", consumer: "deny", "public-publishing": "deny", "external-ai": "deny", "microsoft-premium": "deny", send: "controls", delete: "controls", raw: "deny", admin: "deny", "shareable-auth": "deny", "stored-secret": "deny", independent: "deny", preview: "deny", deprecated: "deny", mcp: "deny", undocumented: "controls", "sensitive-category": "deny" }),
      team: withOverrides({ "any-endpoint": "controls", "maker-target": "controls", "third-party": "controls", consumer: "deny", "public-publishing": "deny", "external-ai": "deny", send: "controls", delete: "controls", raw: "controls", admin: "deny", "shareable-auth": "controls", "stored-secret": "controls", independent: "deny", preview: "controls", deprecated: "deny", mcp: "controls", undocumented: "controls", "sensitive-category": "controls" }),
      production: withOverrides({ "any-endpoint": "controls", "maker-target": "controls", "third-party": "controls", consumer: "deny", "public-publishing": "deny", "external-ai": "controls", send: "controls", delete: "controls", raw: "controls", admin: "deny", "shareable-auth": "controls", "stored-secret": "controls", independent: "deny", preview: "deny", deprecated: "deny", mcp: "controls", undocumented: "controls", "sensitive-category": "controls" }),
    },
  },
  open: {
    label: "More open",
    help: "Our judgement, not Microsoft guidance. Keeps the hard limits on personal and public destinations in shared environments only.",
    zones: {
      shared: withOverrides({ "any-endpoint": "controls", consumer: "deny", "public-publishing": "deny", "third-party": "controls", "external-ai": "controls", admin: "controls" }),
      team: withOverrides({ "any-endpoint": "controls", consumer: "controls", "public-publishing": "controls", admin: "controls" }),
      production: withOverrides({ "any-endpoint": "controls", "maker-target": "controls", consumer: "controls", "public-publishing": "controls", admin: "controls" }),
    },
  },
};

export function defaultSettings() {
  return {
    version: 1,
    levels: Object.fromEntries(ZONES.map((z) => [z.id, "microsoft"])),
    adjust: Object.fromEntries(ZONES.map((z) => [z.id, {}])),
    zones: structuredClone(PRESETS.microsoft.zones),
    context: { policyModel: "classic", managed: false, logicApps: false, copilot: true },
    sensitiveCategories: [],
    overrides: {},
  };
}

// A risk profile is one preset level per zone, plus any limits the organisation has changed itself.
// `zones` is always worked out from those two, so changing a level keeps the organisation's own changes.
const levelLimit = (settings, zoneId, exposureId) => PRESETS[settings.levels[zoneId]].zones[zoneId][exposureId];

function applyProfile(settings) {
  settings.zones = Object.fromEntries(ZONES.map((z) => [z.id, { ...PRESETS[settings.levels[z.id]].zones[z.id], ...settings.adjust[z.id] }]));
  return settings;
}

export function setLevel(settings, preset, zoneId = null) {
  for (const z of ZONES) if (!zoneId || z.id === zoneId) settings.levels[z.id] = preset;
  return applyProfile(settings);
}

export function setLimit(settings, zoneId, exposureId, value) {
  if (levelLimit(settings, zoneId, exposureId) === value) delete settings.adjust[zoneId][exposureId];
  else settings.adjust[zoneId][exposureId] = value;
  return applyProfile(settings);
}

export function setNeverAllow(settings, exposureId, on) {
  for (const z of ZONES) {
    if (on) settings.adjust[z.id][exposureId] = "deny";
    else delete settings.adjust[z.id][exposureId];
  }
  return applyProfile(settings);
}

export function neverAllowState(settings, exposureId) {
  return {
    on: ZONES.every((z) => settings.zones[z.id][exposureId] === "deny"),
    fromLevel: ZONES.every((z) => levelLimit(settings, z.id, exposureId) === "deny" && !(exposureId in settings.adjust[z.id])),
  };
}

export function clearChanges(settings) {
  settings.adjust = Object.fromEntries(ZONES.map((z) => [z.id, {}]));
  return applyProfile(settings);
}

export function countChanges(settings) {
  return ZONES.reduce((sum, z) => sum + EXPOSURES.filter((e) => settings.zones[z.id][e.id] !== levelLimit(settings, z.id, e.id)).length, 0);
}

export function sharedLevel(settings) {
  const levels = new Set(ZONES.map((z) => settings.levels[z.id]));
  return levels.size === 1 ? [...levels][0] : null;
}

export function profileLabel(settings) {
  const level = sharedLevel(settings);
  const base = level ? PRESETS[level].label : "Different levels by environment";
  return countChanges(settings) ? `${base}, with your changes` : base;
}

// Settings saved before levels existed hold only the finished limits, so anything
// that differs from the level counts as the organisation's own change.
export function migrateProfile(settings) {
  if (settings.adjust) return settings;
  const fallback = Object.hasOwn(PRESETS, settings.preset ?? "") ? settings.preset : "microsoft";
  settings.levels = Object.fromEntries(ZONES.map((z) => [z.id, Object.hasOwn(PRESETS, settings.levels?.[z.id] ?? "") ? settings.levels[z.id] : fallback]));
  settings.adjust = Object.fromEntries(ZONES.map((z) => [z.id, Object.fromEntries(EXPOSURES
    .filter((e) => settings.zones[z.id]?.[e.id] && settings.zones[z.id][e.id] !== levelLimit(settings, z.id, e.id))
    .map((e) => [e.id, settings.zones[z.id][e.id]]))]));
  delete settings.preset;
  return applyProfile(settings);
}

// Connectors the organisation has approved no longer count these exposures, because
// a contract or a decision has already dealt with them.
const CLEARED_BY_APPROVAL = new Set(["third-party", "consumer", "external-ai", "independent"]);

export const TREATMENTS = {
  block: { label: "Block", iso: "Avoid", order: 0 },
  retain: { label: "Cannot enforce", iso: "Retain", order: 1 },
  modify: { label: "Allow with controls", iso: "Modify", order: 2 },
  allow: { label: "Allow", iso: "Retain", order: 3 },
  outside: { label: "Outside data policies", iso: "None", order: 4 },
};

const ACTION_NOUNS = { send: "send or share", delete: "delete", write: "create or change", raw: "raw request, query or script", admin: "administration" };

const CONDITION_TEXT = {
  "third-party": "Confirm the organisation has an agreement with this service, and name an owner.",
  consumer: "Keep it in Non-Business so it cannot be combined with business connectors.",
  "public-publishing": "Limit it to a named team that is approved to publish.",
  "external-ai": "Confirm where data is processed and retained before allowing business data.",
  "microsoft-premium": "Confirm the organisation owns the target resources.",
  "shareable-auth": "Prefer a Not shareable authentication type where the connector offers one.",
  "stored-secret": "Name an owner for the credential, and rotate it on a schedule.",
  independent: "Review the connector and its publisher before use.",
  preview: "Review before relying on it in production.",
  deprecated: "Plan a move to a supported alternative.",
  mcp: "Decide per server, and restrict it to agent environments.",
  undocumented: "Read the Learn page and check its authentication and operations yourself.",
  "sensitive-category": "Confirm the data classification allows this use.",
};

function canBlock(ct, { policyModel, managed }) {
  if (policyModel === "acp") {
    if (ct.acp !== "supported") return { can: false, why: "acp-gap" };
    if (ct.nonblockable && !managed) return { can: false, why: "needs-managed" };
    return { can: true, how: "acp" };
  }
  if (ct.blockable) return { can: true, how: "classic" };
  if (policyModel === "mixed" && ct.acp === "supported" && managed) return { can: true, how: "acp" };
  return { can: false, why: policyModel === "mixed" ? "needs-managed" : "nonblockable" };
}

function canLimitActions(ct, { policyModel, managed }) {
  if (policyModel !== "acp" && ct.actionControl) return { can: true, how: "action-control" };
  if (policyModel !== "classic" && ct.acp === "supported" && (!ct.nonblockable || managed)) return { can: true, how: "acp-actions" };
  return { can: false };
}

function canFilterEndpoints(ct, { policyModel }) {
  // Endpoint filtering lives in classic data policies, so ACP-only mode cannot use it.
  return ct.endpointFiltering && policyModel !== "acp";
}

const WHY_NOT_BLOCKABLE = {
  nonblockable: { text: "Classic data policies cannot block this connector. Advanced connector policies on a Managed Environment can.", facts: ["nonblockable", "acp-managed"] },
  "needs-managed": { text: "This connector stays nonblockable under ACP unless the environment is a Managed Environment.", facts: ["acp-managed"] },
  "acp-gap": { text: "ACP does not cover this item and ACP-only mode ignores classic data policies, so nothing would govern it here.", facts: ["acp-unsupported", "acp-only"] },
};

export function evaluate(connector, tolerances, settings) {
  const context = settings.context;
  const ct = connector.ct;
  const override = settings.overrides[connector.s];
  const reasons = [];
  const notes = buildNotes(connector, context);

  if (!ct.classifiable) {
    return result("outside", null, connector, [], { notes: [...notes, { text: "This connector is not available for classification through data policies.", facts: ["content-conversion"] }] });
  }
  if (!ct.dataPolicy) {
    return result("outside", null, connector, [], { notes });
  }

  const exposures = new Set(connector.x);
  if (connector.c.some((c) => settings.sensitiveCategories.includes(c))) exposures.add("sensitive-category");
  if (override === "approved") for (const id of CLEARED_BY_APPROVAL) exposures.delete(id);

  const hardDenies = [];
  const deniedClasses = [];
  const limitedClasses = [];
  const endpointConditions = [];
  const conditions = [];

  for (const exposure of EXPOSURES) {
    if (!exposures.has(exposure.id)) continue;
    const tolerance = tolerances[exposure.id] ?? "allow";
    reasons.push({ id: exposure.id, tolerance });
    if (tolerance === "allow") continue;
    if (tolerance === "deny") {
      if (exposure.scope === "action") deniedClasses.push(exposure);
      else hardDenies.push(exposure);
    } else if (exposure.scope === "action") limitedClasses.push(exposure);
    else if (exposure.scope === "endpoint") endpointConditions.push(exposure);
    else conditions.push(exposure);
  }

  const deniedActionCount = deniedClasses.reduce((sum, e) => sum + (connector.cc[e.cls] ?? 0), 0);
  const everyActionDenied = connector.la > 0 && deniedActionCount >= connector.la && connector.tr === 0;
  const redLines = hardDenies.length + deniedClasses.length;
  const shared = { reasons, notes, redLines, override };

  if (override === "block") return decideBlock(connector, context, [{ text: "You chose to block this connector.", facts: [] }], shared);
  if (override === "allow") return result("allow", dataGroup(connector), connector, [{ text: "You chose to allow this connector.", facts: [] }], shared);

  if (hardDenies.length || everyActionDenied) {
    const why = hardDenies.map((e) => ({ text: `You do not accept this trait: ${e.label}.`, facts: e.facts }));
    if (!hardDenies.length) why.push({ text: "Every action on this connector falls in a capability you do not accept.", facts: ["action-control"] });
    return decideBlock(connector, context, why, shared);
  }

  const actionsLimit = canLimitActions(ct, context);
  const steps = [];
  const gaps = [];

  const addActionStep = (list, verb) => {
    for (const e of list) {
      const count = connector.cc[e.cls] ?? 0;
      if (!count) continue;
      const noun = `${count} ${e.label.toLowerCase().replace(/^(\w+)s\b/, "$1")} action${count === 1 ? "" : "s"}`;
      if (actionsLimit.can) {
        const how = actionsLimit.how === "action-control" ? "connector action control" : "the ACP allowed actions list";
        steps.push({ kind: verb, cls: e.cls, text: `${verb === "block-actions" ? "Block" : "Review and allow only what is needed from"} ${noun}, using ${how}.`, facts: actionsLimit.how === "action-control" ? ["action-control"] : ["acp-shape"] });
      } else {
        gaps.push({ text: `No control can limit ${noun} on this connector with your current policy setup.`, facts: ["action-control", "acp-managed"] });
      }
    }
  };
  addActionStep(deniedClasses, "block-actions");
  addActionStep(limitedClasses, "limit-actions");

  for (const e of endpointConditions) {
    if (canFilterEndpoints(ct, context)) {
      steps.push({ kind: "endpoint", text: "Add endpoint filtering rules. They cover static endpoints only, and the feature is in preview.", facts: ["endpoint-filtering", "endpoint-static", "endpoint-preview"] });
    } else {
      steps.push({ kind: "environment", text: `Allow it only in dedicated environments with a restricted maker list. Data policies cannot limit which target a connection uses.`, facts: ["no-connection-control", "baseline-production"] });
    }
  }
  for (const e of conditions) {
    if (CONDITION_TEXT[e.id]) steps.push({ kind: "condition", text: CONDITION_TEXT[e.id], facts: e.facts });
  }

  const unique = [...new Map(steps.map((s) => [s.text, s])).values()];
  if (gaps.length) return result("retain", dataGroup(connector), connector, gaps, { ...shared, steps: unique, deniedClasses: deniedClasses.map((e) => e.cls), limitedClasses: limitedClasses.map((e) => e.cls) });
  if (unique.length) return result("modify", dataGroup(connector), connector, [], { ...shared, steps: unique, deniedClasses: deniedClasses.map((e) => e.cls), limitedClasses: limitedClasses.map((e) => e.cls) });
  return result("allow", dataGroup(connector), connector, [], shared);
}

function decideBlock(connector, context, why, shared) {
  const block = canBlock(connector.ct, context);
  if (block.can) {
    const method = block.how === "acp"
      ? { text: "Leave it off the ACP allowlist.", facts: ["acp-allowlist"] }
      : { text: "Place it in the Blocked group.", facts: ["blockable"] };
    return result("block", "Blocked", connector, [...why, method], shared);
  }
  const reason = WHY_NOT_BLOCKABLE[block.why];
  return result("retain", dataGroup(connector), connector, [...why, reason, { text: "Record the risk owner's acceptance until a control is available.", facts: [] }], shared);
}

function dataGroup(connector) {
  if (connector.x.includes("consumer") || connector.x.includes("public-publishing") || connector.x.includes("any-endpoint")) return "Non-Business";
  return "Business";
}

function result(treatment, group, connector, why, extra = {}) {
  return {
    treatment, group, why, slug: connector.s,
    reasons: extra.reasons ?? [], notes: extra.notes ?? [], steps: extra.steps ?? [], redLines: extra.redLines ?? 0,
    override: extra.override ?? null, deniedClasses: extra.deniedClasses ?? [], limitedClasses: extra.limitedClasses ?? [],
  };
}

function buildNotes(connector, context) {
  const notes = [];
  const ct = connector.ct;
  if (ct.logicApps && context.logicApps) {
    notes.push(ct.dataPolicy
      ? { text: "Blocking this in Power Platform does not stop Azure Logic Apps using it. Add a matching Azure Policy rule.", facts: ["logic-apps"] }
      : { text: "Available only in Azure Logic Apps, so Power Platform data policies do not govern it. Use Azure Policy.", facts: ["logic-apps"] });
  } else if (!ct.dataPolicy) {
    notes.push({ text: "Not listed for Power Apps, Power Automate or Copilot Studio, so Power Platform data policies do not govern it.", facts: ["logic-apps"] });
  }
  if (ct.tenantIsolation === "gap") notes.push({ text: "Tenant isolation is not enforced for this connector because of a known issue.", facts: ["tenant-ado"] });
  else if (ct.tenantIsolation === "applies") notes.push({ text: "Tenant isolation applies to connections that use Microsoft Entra ID.", facts: ["tenant-isolation"] });
  if (connector.m) notes.push({ text: "ACP can block this MCP server as a whole, but not individual tools.", facts: ["mcp-server"] });
  if (ct.acp === "unconfirmed") notes.push({ text: "ACP does not yet support HTTP connectors, and the page does not say whether this one counts. Check it in the admin center.", facts: ["acp-unsupported"] });
  if (context.policyModel !== "classic" && connector.x.includes("consumer")) notes.push({ text: "ACP has no Business and Non-Business separation, so an allowed personal connector can be combined with business connectors.", facts: ["acp-no-groups"] });
  return notes;
}

export function evaluateAll(connectors, settings, zoneId) {
  const tolerances = settings.zones[zoneId];
  return connectors.map((c) => evaluate(c, tolerances, settings));
}

export function summarise(results) {
  const counts = { block: 0, retain: 0, modify: 0, allow: 0, outside: 0 };
  for (const r of results) counts[r.treatment] += 1;
  return counts;
}

export function exposureCounts(connectors, settings) {
  const counts = Object.fromEntries(EXPOSURES.map((e) => [e.id, 0]));
  for (const c of connectors) {
    for (const x of c.x) if (x in counts) counts[x] += 1;
    if (c.c.some((cat) => settings.sensitiveCategories.includes(cat))) counts["sensitive-category"] += 1;
  }
  return counts;
}

// Draft ACP policy in the shape documented by Microsoft. `details` maps slug to the
// full connector record, needed for operation IDs when only some actions are allowed.
export function acpDraft(connectors, results, zoneLabel, details = {}) {
  const list = [];
  const skipped = [];
  connectors.forEach((c, i) => {
    const r = results[i];
    if (r.treatment === "block" || r.treatment === "outside") return;
    if (c.ct.acp !== "supported") { skipped.push(c.n); return; }
    const entry = { AllowedConnector: c.api, AllowedActionsMode: "AllAllowed", AllowedConnectionTypesMode: "AllAllowed" };
    if (r.deniedClasses.length && details[c.s]) {
      entry.AllowedActionsMode = "SomeAllowed";
      entry.AllowedActions = details[c.s].actions
        .filter((o) => !o.deprecated && !r.deniedClasses.includes(o.class))
        .map((o) => o.opId);
    }
    list.push(entry);
  });
  return {
    draft: {
      name: `DRAFT for administrator review: ${zoneLabel}`,
      ruleSets: [{ id: "ConnectorManagement", version: "1.0", inputs: { AllowedConnectorList: list } }],
    },
    notCovered: skipped,
  };
}

export function actionRulesDraft(results, details) {
  const configurations = [];
  for (const r of results) {
    if (!r.deniedClasses.length || !details[r.slug] || r.treatment === "block") continue;
    const blocked = details[r.slug].actions.filter((o) => !o.deprecated && r.deniedClasses.includes(o.class));
    if (!blocked.length) continue;
    configurations.push({
      connectorId: details[r.slug].apiId,
      actionRules: blocked.map((o) => ({ actionId: o.opId, behavior: "Block" })),
      defaultConnectorActionRuleBehavior: "Allow",
    });
  }
  return { connectorActionConfigurations: configurations };
}
