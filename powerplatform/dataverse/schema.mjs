// The Dataverse design for the Connector Risk Framework, as data.
//
// provision.mjs turns this into Dataverse tables through the Web API, and the solution export in
// powerplatform/solution/ is what that produces. Keep this file as the source of truth: change it
// here, provision, then export the solution again.
//
// The framework deliberately has no risk score. These tables hold the same documented traits,
// controls and operations the site uses, plus the organisation's own criteria and decisions.
// Treatments are worked out by site/js/engine.js at run time, never stored as a score.

export const PUBLISHER = {
  uniquename: "connectorriskframework",
  friendlyname: "Connector Risk Framework",
  customizationprefix: "crf",
  customizationoptionvalueprefix: 41930,
  description: "Publisher for the Connector Risk Framework solution.",
};

export const SOLUTION = {
  uniquename: "ConnectorRiskFramework",
  friendlyname: "Connector Risk Framework",
  version: "1.0.0.0",
  description:
    "Dataverse tables and a Power Apps code app for governing Power Platform connectors. Data is synced weekly from github.com/crowdedLeopard/connector-risk-framework.",
};

const V = 419300000; // first option value for the crf option value prefix

// Global choices. Each option's `key` is the string the repository data uses.
export const CHOICES = {
  crf_origin: {
    label: "Service origin",
    options: [
      ["microsoft", "Microsoft service"],
      ["third-party", "Third-party service"],
      ["maker-defined", "Destination set by maker"],
      ["unstated", "Not stated on Learn"],
    ],
  },
  crf_publishertype: {
    label: "Publisher type",
    options: [
      ["microsoft", "Microsoft"],
      ["independent", "Independent publisher"],
      ["other", "Other publisher"],
    ],
  },
  crf_acpsupport: {
    label: "Advanced connector policy support",
    options: [
      ["supported", "Supported"],
      ["unsupported", "Not supported"],
      ["unconfirmed", "Unconfirmed"],
      ["not-applicable", "Not applicable"],
    ],
  },
  crf_tenantisolation: {
    label: "Tenant isolation",
    options: [
      ["applies", "Applies"],
      ["gap", "Known gap"],
      ["not-shown", "Not shown on Learn"],
    ],
  },
  crf_operationkind: {
    label: "Operation kind",
    options: [
      ["action", "Action"],
      ["trigger", "Trigger"],
    ],
  },
  crf_operationclass: {
    label: "Operation class",
    options: [
      ["read", "Reads data"],
      ["write", "Creates or changes data"],
      ["delete", "Deletes or removes data"],
      ["send", "Sends or shares data outward"],
      ["raw", "Runs raw requests, queries or scripts"],
      ["admin", "Administers platform, identity or access"],
      ["other", "Not classified"],
    ],
  },
  crf_traitgroup: {
    label: "Trait group",
    options: [
      ["destination", "Where data can go"],
      ["capability", "What it can do"],
      ["identity", "Whose identity and credentials"],
      ["maintenance", "Who maintains it"],
      ["data", "What your data needs"],
    ],
  },
  crf_traitscope: {
    label: "Control scope",
    options: [
      ["action", "Individual actions"],
      ["endpoint", "Destination endpoint"],
      ["connector", "Whole connector"],
    ],
  },
  crf_changetype: {
    label: "Change type",
    options: [
      ["new", "New connector"],
      ["removed", "Removed connector"],
      ["changed", "Changed connector"],
    ],
  },
  crf_decisiontype: {
    label: "Connector decision",
    options: [
      ["approved", "Approved: agreement in place"],
      ["allow", "Always allow"],
      ["block", "Always block"],
    ],
  },
};

for (const choice of Object.values(CHOICES)) {
  choice.values = Object.fromEntries(choice.options.map(([key], i) => [key, V + i]));
  choice.keys = Object.fromEntries(choice.options.map(([key], i) => [V + i, key]));
}

// Column helpers. `name` is the logical name; SchemaName is derived from it.
const text = (name, label, max = 200, extra = {}) => ({ type: "String", name, label, max, ...extra });
const url = (name, label) => ({ type: "String", name, label, max: 500, format: "Url" });
const memo = (name, label, max = 4000) => ({ type: "Memo", name, label, max });
const int = (name, label) => ({ type: "Integer", name, label });
const bool = (name, label) => ({ type: "Boolean", name, label });
const date = (name, label) => ({ type: "DateOnly", name, label });
const choice = (name, label, optionSet) => ({ type: "Picklist", name, label, optionSet });

export const TABLES = [
  {
    name: "crf_connector",
    set: "crf_connectors",
    label: "Connector",
    plural: "Connectors",
    description: "A Power Platform connector, with the documented facts and derived traits from the weekly refresh.",
    ownership: "OrganizationOwned",
    primary: { name: "crf_name", label: "Name", max: 200 },
    columns: [
      text("crf_slug", "Slug", 100, { required: true }),
      text("crf_apiid", "API ID", 200),
      text("crf_kind", "Kind", 100),
      text("crf_publishername", "Publisher", 200),
      choice("crf_publishertype", "Publisher type", "crf_publishertype"),
      choice("crf_origin", "Service origin", "crf_origin"),
      memo("crf_originevidence", "Origin evidence", 2000),
      bool("crf_premium", "Premium"),
      bool("crf_preview", "Preview"),
      bool("crf_deprecated", "Deprecated"),
      bool("crf_mcp", "MCP server"),
      bool("crf_hasdefinition", "Has published definition"),
      bool("crf_isremoved", "Removed from catalogue"),
      int("crf_liveactions", "Live actions"),
      int("crf_triggers", "Triggers"),
      int("crf_readactions", "Read actions"),
      int("crf_writeactions", "Write actions"),
      int("crf_deleteactions", "Delete actions"),
      int("crf_sendactions", "Send actions"),
      int("crf_rawactions", "Raw request actions"),
      int("crf_adminactions", "Administration actions"),
      int("crf_otheractions", "Unclassified actions"),
      bool("crf_classifiable", "Classifiable by data policies"),
      bool("crf_datapolicy", "Governed by data policies"),
      bool("crf_blockable", "Blockable"),
      bool("crf_nonblockable", "On the nonblockable list"),
      bool("crf_actioncontrol", "Supports action control"),
      bool("crf_endpointfiltering", "Supports endpoint filtering"),
      bool("crf_logicapps", "Available in Logic Apps"),
      choice("crf_acpsupport", "Advanced connector policy support", "crf_acpsupport"),
      choice("crf_tenantisolation", "Tenant isolation", "crf_tenantisolation"),
      text("crf_traitkeys", "Trait keys", 1000),
      text("crf_categories", "Categories on Learn", 1000),
      text("crf_products", "Works in", 500),
      memo("crf_authtypes", "Authentication types", 4000),
      text("crf_servicedomain", "Service domain", 200),
      url("crf_learnurl", "Learn page"),
      url("crf_website", "Website"),
      url("crf_privacypolicy", "Privacy policy"),
      date("crf_firstseen", "First seen"),
      date("crf_lastchanged", "Last changed"),
      date("crf_datadate", "Data date"),
    ],
    keys: [{ name: "crf_connector_slug", label: "Slug", columns: ["crf_slug"] }],
  },
  {
    name: "crf_trait",
    set: "crf_traits",
    label: "Trait",
    plural: "Traits",
    description: "A documented exposure a connector can have, such as sending data outward. Mirrors EXPOSURES in site/js/engine.js.",
    ownership: "OrganizationOwned",
    primary: { name: "crf_name", label: "Name", max: 200 },
    columns: [
      text("crf_key", "Key", 100, { required: true }),
      choice("crf_group", "Group", "crf_traitgroup"),
      choice("crf_scope", "Control scope", "crf_traitscope"),
      memo("crf_help", "Explanation", 2000),
      text("crf_basis", "How we know", 200),
      int("crf_sortorder", "Sort order"),
    ],
    keys: [{ name: "crf_trait_key", label: "Key", columns: ["crf_key"] }],
  },
  {
    name: "crf_connectortrait",
    set: "crf_connectortraits",
    label: "Connector trait",
    plural: "Connector traits",
    description: "One trait on one connector, with the evidence for it.",
    ownership: "OrganizationOwned",
    primary: { name: "crf_name", label: "Name", max: 200 },
    columns: [memo("crf_evidence", "Evidence", 4000)],
    lookups: [
      { name: "crf_connector", label: "Connector", target: "crf_connector", cascadeDelete: "Cascade" },
      { name: "crf_trait", label: "Trait", target: "crf_trait", cascadeDelete: "Cascade" },
    ],
  },
  {
    name: "crf_operation",
    set: "crf_operations",
    label: "Operation",
    plural: "Operations",
    description: "An action or trigger on a connector, with the class the open classification rules gave it.",
    ownership: "OrganizationOwned",
    primary: { name: "crf_name", label: "Name", max: 300 },
    columns: [
      text("crf_apioperationid", "Operation ID", 300),
      choice("crf_kind", "Kind", "crf_operationkind"),
      choice("crf_class", "Class", "crf_operationclass"),
      text("crf_basis", "Classified by", 200),
      text("crf_method", "HTTP method", 20),
      bool("crf_isdeprecated", "Deprecated"),
      int("crf_parametercount", "Parameters"),
      text("crf_anchor", "Learn anchor", 400),
    ],
    lookups: [{ name: "crf_connector", label: "Connector", target: "crf_connector", cascadeDelete: "Cascade" }],
  },
  {
    name: "crf_fact",
    set: "crf_facts",
    label: "Governance fact",
    plural: "Governance facts",
    description: "A claim about Microsoft behaviour, checked against its source page on every refresh.",
    ownership: "OrganizationOwned",
    primary: { name: "crf_name", label: "ID", max: 100 },
    columns: [
      memo("crf_statement", "Statement", 2000),
      text("crf_status", "Status", 50),
      text("crf_source", "Source", 100),
      url("crf_sourceurl", "Source page"),
      memo("crf_missing", "Missing evidence", 2000),
      date("crf_lastchecked", "Last checked"),
    ],
  },
  {
    name: "crf_change",
    set: "crf_changes",
    label: "Catalogue change",
    plural: "Catalogue changes",
    description: "A connector that was added, removed or changed in a weekly refresh.",
    ownership: "OrganizationOwned",
    primary: { name: "crf_name", label: "Name", max: 300 },
    columns: [
      text("crf_slug", "Slug", 100),
      date("crf_changedate", "Change date"),
      choice("crf_changetype", "Change type", "crf_changetype"),
      memo("crf_summary", "Summary", 4000),
      memo("crf_detailjson", "Detail (JSON)", 100000),
    ],
    lookups: [{ name: "crf_connector", label: "Connector", target: "crf_connector", cascadeDelete: "RemoveLink" }],
  },
  {
    name: "crf_refresh",
    set: "crf_refreshes",
    label: "Data refresh",
    plural: "Data refreshes",
    description: "One weekly snapshot of the catalogue, for trends over time.",
    ownership: "OrganizationOwned",
    primary: { name: "crf_name", label: "Name", max: 100 },
    columns: [
      date("crf_datadate", "Data date"),
      int("crf_connectorcount", "Connectors"),
      int("crf_operationcount", "Operations"),
      int("crf_premiumcount", "Premium"),
      int("crf_previewcount", "Preview"),
      int("crf_mcpcount", "MCP servers"),
      int("crf_independentcount", "Independent publishers"),
      int("crf_microsoftcount", "Microsoft published"),
      int("crf_nonblockablecount", "Nonblockable"),
      int("crf_newcount", "New this week"),
      int("crf_removedcount", "Removed this week"),
      int("crf_changedcount", "Changed this week"),
      int("crf_classifieragree", "Classifier agreements"),
      int("crf_classifiercomparable", "Classifier comparisons"),
      text("crf_commit", "Source commit", 100),
      memo("crf_metajson", "Metadata (JSON)", 100000),
    ],
  },
  {
    name: "crf_profile",
    set: "crf_profiles",
    label: "Risk profile",
    plural: "Risk profiles",
    description: "The organisation's criteria: what it accepts in each environment zone. Settings use the engine.js settings shape.",
    ownership: "OrganizationOwned",
    primary: { name: "crf_name", label: "Name", max: 200 },
    columns: [
      memo("crf_description", "Description", 2000),
      bool("crf_isdefault", "Default profile"),
      memo("crf_settingsjson", "Settings (JSON)", 100000),
    ],
  },
  {
    name: "crf_decision",
    set: "crf_decisions",
    label: "Connector decision",
    plural: "Connector decisions",
    description: "The organisation's own decision on a connector, which overrides the criteria. The record owner is the decision owner.",
    ownership: "UserOwned",
    primary: { name: "crf_name", label: "Name", max: 200 },
    columns: [
      choice("crf_decision", "Decision", "crf_decisiontype"),
      memo("crf_rationale", "Rationale", 4000),
      text("crf_reference", "Reference", 200),
      date("crf_reviewdate", "Review by"),
    ],
    lookups: [{ name: "crf_connector", label: "Connector", target: "crf_connector", cascadeDelete: "Cascade" }],
  },
];

export const TABLE = Object.fromEntries(TABLES.map((t) => [t.name, t]));
