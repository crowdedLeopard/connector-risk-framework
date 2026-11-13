// Creates the publisher, solution, choices, tables, columns, lookups and keys in schema.mjs.
//
// Every step checks what already exists first, so running it again only adds what is missing.
// It never deletes or changes existing metadata: removing a column is a deliberate, manual step.

import { CHOICES, PUBLISHER, SOLUTION, TABLES } from "../dataverse/schema.mjs";

const LANG = 1033;

/** A Dataverse Label in one language. */
const label = (text) => ({
  "@odata.type": "Microsoft.Dynamics.CRM.Label",
  LocalizedLabels: [{ "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", Label: text, LanguageCode: LANG }],
});

/** Dataverse needs a SchemaName with the prefix; we keep it identical to the logical name. */
const schemaName = (logicalName) => logicalName;

const required = (on) => ({ Value: on ? "ApplicationRequired" : "None" });

/** Builds the attribute metadata for one column in schema.mjs. */
export function attributeMetadata(column, optionSetIds) {
  const base = {
    SchemaName: schemaName(column.name),
    DisplayName: label(column.label),
    Description: label(column.description ?? column.label),
    RequiredLevel: required(column.required),
  };
  switch (column.type) {
    case "String":
      return {
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        ...base,
        MaxLength: column.max,
        FormatName: { Value: column.format ?? "Text" },
      };
    case "Memo":
      return { "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata", ...base, MaxLength: column.max, Format: "TextArea" };
    case "Integer":
      return {
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        ...base,
        Format: "None",
        MinValue: -2147483648,
        MaxValue: 2147483647,
      };
    case "Boolean":
      return {
        "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        ...base,
        DefaultValue: false,
        OptionSet: {
          "@odata.type": "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
          TrueOption: { Value: 1, Label: label("Yes") },
          FalseOption: { Value: 0, Label: label("No") },
        },
      };
    case "DateOnly":
      return {
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        ...base,
        Format: "DateOnly",
        DateTimeBehavior: { Value: "DateOnly" },
      };
    case "Picklist":
      return {
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        ...base,
        "GlobalOptionSet@odata.bind": `/GlobalOptionSetDefinitions(${optionSetIds[column.optionSet]})`,
      };
    default:
      throw new Error(`Unknown column type ${column.type} on ${column.name}`);
  }
}

/** Runs every provisioning step in order. */
export async function provision(dv, log = () => {}) {
  await ensurePublisherAndSolution(dv, log);
  const optionSetIds = await ensureChoices(dv, log);
  for (const table of TABLES) await ensureTable(dv, table, optionSetIds, log);
  for (const table of TABLES) await ensureLookups(dv, table, log);
  for (const table of TABLES) await ensureKeys(dv, table, log);
  log("Publishing customisations.");
  await dv.request("POST", "PublishAllXml", {});
  await waitForKeys(dv, log);
  log("Schema is in place.");
}

export async function ensurePublisherAndSolution(dv, log) {
  const found = await dv.get(`publishers?$select=publisherid,customizationprefix&$filter=uniquename eq '${PUBLISHER.uniquename}'`);
  let publisherId = found.value[0]?.publisherid;
  if (!publisherId) {
    log(`Creating publisher ${PUBLISHER.uniquename} (prefix ${PUBLISHER.customizationprefix}).`);
    const r = await dv.request("POST", "publishers", PUBLISHER, { Prefer: "return=representation" });
    publisherId = r.data.publisherid;
  }
  const solution = await dv.get(`solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION.uniquename}'`);
  if (!solution.value.length) {
    log(`Creating solution ${SOLUTION.uniquename}.`);
    await dv.request("POST", "solutions", { ...SOLUTION, "publisherid@odata.bind": `/publishers(${publisherId})` });
  }
}

/** Creates any missing global choices and returns their MetadataIds by name. */
export async function ensureChoices(dv, log) {
  const ids = {};
  for (const [name, def] of Object.entries(CHOICES)) {
    const existing = await dv.tryGet(`GlobalOptionSetDefinitions(Name='${name}')?$select=MetadataId`);
    if (existing) {
      ids[name] = existing.MetadataId;
      continue;
    }
    log(`Creating choice ${name}.`);
    await dv.createMetadata("GlobalOptionSetDefinitions", {
      "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
      Name: name,
      DisplayName: label(def.label),
      IsGlobal: true,
      OptionSetType: "Picklist",
      Options: def.options.map(([key, text]) => ({ Value: def.values[key], Label: label(text) })),
    });
    ids[name] = (await dv.get(`GlobalOptionSetDefinitions(Name='${name}')?$select=MetadataId`)).MetadataId;
  }
  return ids;
}

/** Creates the table with its primary name column, then adds any missing columns. */
export async function ensureTable(dv, table, optionSetIds, log) {
  const path = `EntityDefinitions(LogicalName='${table.name}')`;
  let entity = await dv.tryGet(`${path}?$select=LogicalName&$expand=Attributes($select=LogicalName)`);
  if (!entity) {
    log(`Creating table ${table.name}.`);
    await dv.createMetadata("EntityDefinitions", {
      "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
      SchemaName: schemaName(table.name),
      DisplayName: label(table.label),
      DisplayCollectionName: label(table.plural),
      Description: label(table.description),
      OwnershipType: table.ownership,
      HasActivities: false,
      HasNotes: false,
      IsActivity: false,
      // Auditing is on so changes to the organisation's criteria and decisions are traceable.
      IsAuditEnabled: { Value: true, CanBeChanged: true },
      Attributes: [
        {
          "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
          SchemaName: schemaName(table.primary.name),
          IsPrimaryName: true,
          MaxLength: table.primary.max,
          FormatName: { Value: "Text" },
          RequiredLevel: required(true),
          DisplayName: label(table.primary.label),
          Description: label(table.primary.label),
        },
      ],
    });
    entity = await dv.get(`${path}?$select=LogicalName&$expand=Attributes($select=LogicalName)`);
  }
  const have = new Set(entity.Attributes.map((a) => a.LogicalName));
  for (const column of table.columns) {
    if (have.has(column.name)) continue;
    log(`  Adding ${table.name}.${column.name}.`);
    await dv.createMetadata(`${path}/Attributes`, attributeMetadata(column, optionSetIds));
  }
}

/** Creates each lookup as a one-to-many relationship from the target table. */
export async function ensureLookups(dv, table, log) {
  for (const lookup of table.lookups ?? []) {
    const relationship = `${lookup.target}_${table.name}_${lookup.name}`.slice(0, 100);
    const existing = await dv.tryGet(`RelationshipDefinitions(SchemaName='${relationship}')?$select=SchemaName`);
    if (existing) continue;
    log(`Creating lookup ${table.name}.${lookup.name} to ${lookup.target}.`);
    await dv.createMetadata("RelationshipDefinitions", {
      "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
      SchemaName: relationship,
      ReferencedEntity: lookup.target,
      ReferencingEntity: table.name,
      // Fixing the navigation property name keeps @odata.bind keys predictable: "crf_connector@odata.bind".
      ReferencingEntityNavigationPropertyName: lookup.name,
      ReferencedEntityNavigationPropertyName: `${table.name}s_${lookup.name}`.slice(0, 100),
      CascadeConfiguration: {
        Assign: "NoCascade",
        Delete: lookup.cascadeDelete ?? "RemoveLink",
        Merge: "NoCascade",
        Reparent: "NoCascade",
        Share: "NoCascade",
        Unshare: "NoCascade",
      },
      Lookup: {
        "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
        SchemaName: schemaName(lookup.name),
        DisplayName: label(lookup.label),
        Description: label(lookup.label),
        RequiredLevel: required(false),
      },
    });
  }
}

export async function ensureKeys(dv, table, log) {
  if (!table.keys?.length) return;
  const keys = await dv.get(`EntityDefinitions(LogicalName='${table.name}')/Keys?$select=LogicalName`);
  const have = new Set(keys.value.map((k) => k.LogicalName));
  for (const key of table.keys) {
    if (have.has(key.name)) continue;
    log(`Creating key ${key.name}.`);
    await dv.createMetadata(`EntityDefinitions(LogicalName='${table.name}')/Keys`, {
      SchemaName: schemaName(key.name),
      DisplayName: label(key.label),
      KeyAttributes: key.columns,
    });
  }
}

/** Alternate keys are built by a background job; wait so later writes do not fail on them. */
async function waitForKeys(dv, log) {
  for (let i = 0; i < 60; i += 1) {
    const pending = [];
    for (const table of TABLES.filter((t) => t.keys?.length)) {
      const keys = await dv.get(`EntityDefinitions(LogicalName='${table.name}')/Keys?$select=LogicalName,EntityKeyIndexStatus`);
      for (const k of keys.value) {
        if (k.EntityKeyIndexStatus === "Failed") throw new Error(`Key ${k.LogicalName} failed to build.`);
        if (k.EntityKeyIndexStatus !== "Active") pending.push(k.LogicalName);
      }
    }
    if (!pending.length) return;
    log(`Waiting for keys: ${pending.join(", ")}.`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Alternate keys did not become active within five minutes.");
}
