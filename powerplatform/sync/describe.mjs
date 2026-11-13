/**
 * Describes one changed connector in plain words, for the change log.
 *
 * Shared by the Dataverse sync (which stores the text in crf_change.crf_summary) and the code app's
 * demo mode (which reads the change files directly), so both say the same thing. Trait IDs become
 * the labels people see everywhere else.
 */
import { EXPOSURE_BY_ID } from "../../site/js/engine.js";

const label = (id) => EXPOSURE_BY_ID[id]?.label ?? id;
const count = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** Field names in change files, as people would say them. */
const FIELD_LABELS = { name: "Name", publisher: "Publisher", origin: "Service", premium: "Licence", preview: "Preview status", deprecated: "Deprecation", acp: "Advanced connector policy support" };

/**
 * @param {object} c one entry of a change file's `changed` list
 * @returns {string} for example "Traits added: Sends or shares data outward. 3 operations added"
 */
export function describeChange(c) {
  const parts = [];
  if (c.exposuresAdded?.length) parts.push(`Traits added: ${c.exposuresAdded.map(label).join(", ")}`);
  if (c.exposuresRemoved?.length) parts.push(`Traits removed: ${c.exposuresRemoved.map(label).join(", ")}`);
  if (c.operationsAdded?.length) parts.push(`${count(c.operationsAdded.length, "operation")} added`);
  if (c.operationsRemoved?.length) parts.push(`${count(c.operationsRemoved.length, "operation")} removed`);
  if (c.authTypes) parts.push("Authentication types changed");
  for (const [k, v] of Object.entries(c)) {
    if (["slug", "exposuresAdded", "exposuresRemoved", "operationsAdded", "operationsRemoved", "authTypes"].includes(k)) continue;
    if (v && typeof v === "object" && "from" in v) parts.push(`${FIELD_LABELS[k] ?? k} changed from ${JSON.stringify(v.from)} to ${JSON.stringify(v.to)}`);
  }
  return parts.join(". ") || "Authentication or other details changed";
}
