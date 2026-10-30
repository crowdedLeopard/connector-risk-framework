import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { acpDraft, actionRulesDraft, defaultSettings, EXPOSURES, evaluate, evaluateAll, PRESETS, summarise, ZONES } from "../site/js/engine.js";

const index = JSON.parse(readFileSync(new URL("../data/current/index.json", import.meta.url)));
const facts = JSON.parse(readFileSync(new URL("../data/current/facts.json", import.meta.url)));
const get = (slug) => index.find((c) => c.s === slug);
const allow = Object.fromEntries(EXPOSURES.map((e) => [e.id, "allow"]));

const settings = (context = {}, extra = {}) => {
  const base = defaultSettings();
  return { ...base, ...extra, context: { ...base.context, ...context } };
};

test("every fact an exposure cites exists", () => {
  const known = new Set(facts.facts.map((f) => f.id));
  for (const e of EXPOSURES) for (const f of e.facts) assert.ok(known.has(f), `${e.id} cites ${f}`);
  for (const z of ZONES) for (const f of z.facts) assert.ok(known.has(f), `${z.id} cites ${f}`);
});

test("every preset sets a tolerance for every exposure in every zone", () => {
  for (const preset of Object.values(PRESETS)) {
    for (const z of ZONES) {
      for (const e of EXPOSURES) assert.ok(["allow", "controls", "deny"].includes(preset.zones[z.id][e.id]), `${z.id} ${e.id}`);
    }
  }
});

test("Microsoft's list of nonblockable connectors is never placed in Blocked by classic policies", () => {
  const strict = Object.fromEntries(EXPOSURES.map((e) => [e.id, "deny"]));
  const s = settings();
  const nonblockable = index.filter((c) => c.ct.nonblockable);
  assert.ok(nonblockable.length >= 24);
  for (const c of nonblockable) {
    const r = evaluate(c, strict, s);
    assert.notEqual(r.treatment, "block", c.n);
  }
});

test("SharePoint cannot be blocked classically but can through ACP on a Managed Environment", () => {
  const c = get("sharepointonline");
  const denyAll = { ...allow, "stored-secret": "deny" };
  assert.equal(evaluate(c, denyAll, settings({ policyModel: "classic" })).treatment, "retain");
  assert.equal(evaluate(c, denyAll, settings({ policyModel: "mixed", managed: false })).treatment, "retain");
  assert.equal(evaluate(c, denyAll, settings({ policyModel: "mixed", managed: true })).treatment, "block");
  assert.equal(evaluate(c, denyAll, settings({ policyModel: "acp", managed: true })).treatment, "block");
});

test("action control is not offered for a nonblockable connector, and the gap is stated", () => {
  const r = evaluate(get("sharepointonline"), { ...allow, delete: "deny" }, settings());
  assert.equal(r.treatment, "retain");
  assert.match(r.why[0].text, /No control can limit/);
});

test("a blockable connector with a denied capability keeps its other actions", () => {
  const r = evaluate(get("sql"), { ...allow, delete: "deny" }, settings());
  assert.equal(r.treatment, "modify");
  assert.ok(r.steps.some((s) => s.kind === "block-actions"));
  assert.deepEqual(r.deniedClasses, ["delete"]);
});

test("a connector whose every action is denied is blocked outright", () => {
  const r = evaluate(get("smtp"), { ...allow, send: "deny" }, settings());
  assert.equal(r.treatment, "block");
  assert.equal(r.group, "Blocked");
});

test("endpoint filtering is offered where documented, and not in ACP-only mode", () => {
  const tolerance = { ...allow, "any-endpoint": "controls" };
  const classic = evaluate(get("smtp"), tolerance, settings());
  assert.ok(classic.steps.some((s) => s.kind === "endpoint"));
  const ftp = evaluate(get("ftp"), tolerance, settings());
  assert.ok(ftp.steps.some((s) => s.kind === "environment"));
  const acpOnly = evaluate(get("smtp"), tolerance, settings({ policyModel: "acp", managed: true }));
  assert.ok(!acpOnly.steps.some((s) => s.kind === "endpoint"));
});

test("ACP-only mode leaves HTTP and custom connectors ungoverned, and says so", () => {
  const r = evaluate(get("builtin-http"), { ...allow, "any-endpoint": "deny" }, settings({ policyModel: "acp", managed: true }));
  assert.equal(r.treatment, "retain");
  assert.ok(r.why.some((w) => /ACP does not cover/.test(w.text)));
});

test("an allowed personal connector goes to Non-Business", () => {
  assert.equal(evaluate(get("gmail"), allow, settings()).group, "Non-Business");
  assert.equal(evaluate(get("salesforce"), allow, settings()).group, "Business");
});

test("Logic Apps only connectors are outside data policies", () => {
  const c = index.find((x) => !x.ct.dataPolicy);
  assert.ok(c);
  assert.equal(evaluate(c, { ...allow, "third-party": "deny" }, settings()).treatment, "outside");
});

test("Content Conversion is outside data policies", () => {
  assert.equal(evaluate(get("conversionservice"), allow, settings()).treatment, "outside");
});

test("approving a connector clears third-party exposure but not its capabilities", () => {
  const tolerance = { ...allow, "third-party": "deny", delete: "deny" };
  const s = settings({}, { overrides: { salesforce: "approved" } });
  const r = evaluate(get("salesforce"), tolerance, s);
  assert.notEqual(r.treatment, "block");
  assert.deepEqual(r.deniedClasses, ["delete"]);
});

test("explicit block and allow overrides win", () => {
  const block = settings({}, { overrides: { msnweather: "block" } });
  assert.equal(evaluate(get("msnweather"), allow, block).treatment, "block");
  const free = settings({}, { overrides: { gmail: "allow" } });
  assert.equal(evaluate(get("gmail"), { ...allow, consumer: "deny" }, free).treatment, "allow");
});

test("Microsoft's starting point blocks third parties in shared but not in team environments", () => {
  const s = settings();
  const c = get("salesforce");
  assert.equal(evaluate(c, s.zones.shared, s).treatment, "block");
  assert.equal(evaluate(c, s.zones.team, s).treatment, "modify");
});

test("tightening a setting never makes the block count fall", () => {
  const s = settings();
  const before = summarise(evaluateAll(index, s, "team"));
  const tighter = structuredClone(s);
  tighter.zones.team["external-ai"] = "deny";
  const after = summarise(evaluateAll(index, tighter, "team"));
  assert.ok(after.block >= before.block);
});

test("the ACP draft follows the documented shape and excludes blocked and unsupported items", () => {
  const s = settings({ policyModel: "mixed", managed: true });
  const results = evaluateAll(index, s, "shared");
  const { draft, notCovered } = acpDraft(index, results, "Shared");
  const rule = draft.ruleSets[0];
  assert.equal(rule.id, "ConnectorManagement");
  assert.ok(Array.isArray(rule.inputs.AllowedConnectorList));
  const entry = rule.inputs.AllowedConnectorList[0];
  assert.match(entry.AllowedConnector, /^\/providers\/Microsoft\.PowerApps\/apis\/shared_/);
  assert.ok(entry.AllowedActionsMode && entry.AllowedConnectionTypesMode);
  assert.ok(!rule.inputs.AllowedConnectorList.some((e) => e.AllowedConnector.endsWith("shared_salesforce")));
  assert.ok(notCovered.every((n) => typeof n === "string"));
  assert.match(draft.name, /DRAFT/);
});

test("action rules use the documented configuration shape", () => {
  const details = { sql: { apiId: "/providers/Microsoft.PowerApps/apis/shared_sql", actions: [{ opId: "DeleteItem_V2", class: "delete", deprecated: false }, { opId: "GetItems", class: "read", deprecated: false }] } };
  const r = evaluate(get("sql"), { ...allow, delete: "deny" }, settings());
  const out = actionRulesDraft([r], details);
  const config = out.connectorActionConfigurations[0];
  assert.deepEqual(config.actionRules, [{ actionId: "DeleteItem_V2", behavior: "Block" }]);
  assert.equal(config.defaultConnectorActionRuleBehavior, "Allow");
});
