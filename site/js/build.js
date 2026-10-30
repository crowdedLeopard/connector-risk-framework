// The strategy builder: four steps from your platform to a finished strategy.
import { EXPOSURES, GROUPS, PRESETS, TOLERANCES, TOLERANCE_LABELS, TREATMENTS, ZONES, acpDraft, actionRulesDraft, defaultSettings, evaluateAll, exposureCounts, summarise } from "./engine.js";
import { announce, bar, cite, connectorDetails, csv, download, fmt, h, icon, pill, plural, product, resultsFor, saveSettings, store } from "./ui.js";

const zoneById = (id) => ZONES.find((z) => z.id === id);

const STEPS = [
  { id: "platform", label: "Your platform", href: "#/build/platform" },
  { id: "appetite", label: "Your risk appetite", href: "#/build/appetite" },
  { id: "limits", label: "Your limits", href: "#/build/limits" },
  { id: "strategy", label: "Your strategy", href: "#/strategy" },
];

export function stepper(current) {
  const at = STEPS.findIndex((s) => s.id === current);
  return `<nav aria-label="Strategy steps" class="no-print"><ol class="stepper">${STEPS.map((s, i) => `
    <li class="${i < at ? "done" : ""}"><a href="${s.href}" ${i === at ? 'aria-current="step"' : ""}><span class="n" aria-hidden="true">${i < at ? icon("allow", 13) : i + 1}</span>${h(s.label)}</a></li>`).join("")}</ol></nav>`;
}

/* ---------- Results dock ---------- */
let lastBlocks = null;

function dockZones() {
  return ZONES.map((z) => {
    const counts = summarise(resultsFor(z.id));
    const change = lastBlocks ? counts.block - lastBlocks[z.id] : 0;
    return `<div class="dock-zone"><div class="top"><span class="zname">${h(z.label)}</span><span><b>${fmt(counts.block)}</b> blocked${change ? `<span class="delta">${change > 0 ? "+" : ""}${fmt(change)}</span>` : ""}</span></div>${bar(counts)}</div>`;
  }).join("");
}

function rememberBlocks() {
  lastBlocks = Object.fromEntries(ZONES.map((z) => [z.id, summarise(resultsFor(z.id)).block]));
}

function dock(step) {
  const index = STEPS.findIndex((s) => s.id === step);
  const next = STEPS[index + 1];
  const back = STEPS[index - 1];
  return `<aside class="dock no-print" aria-label="Effect of your settings">
    <div class="dock-zones" id="dock-zones">${dockZones()}</div>
    <div class="dock-actions">
      ${back ? `<a class="btn ghost" href="${back.href}">Back</a>` : ""}
      <a class="btn primary" href="${next.href}">${next.id === "strategy" ? "See my strategy" : `Next: ${h(next.label.toLowerCase())}`}</a>
    </div>
  </aside>`;
}

/* ---------- Step 1: platform ---------- */
function drawPlatform() {
  const ctx = store.settings.context;
  const inService = (name) => store.index.filter((c) => c.sv.includes(name)).length;
  return `
    <section class="question">
      <h2>Which products are you governing?</h2>
      <p class="hint">Connector rules apply across these products. The counts are the connectors Microsoft Learn lists for each one.</p>
      <div class="toggle-stack">
        <div class="toggle-row fixed">${product("Power Apps")}<span class="text"><span>${fmt(inService("Power Apps"))} connectors</span></span><span class="always">Always included</span></div>
        <div class="toggle-row fixed">${product("Power Automate")}<span class="text"><span>${fmt(inService("Power Automate"))} connectors</span></span><span class="always">Always included</span></div>
        <label class="toggle-row">${product("Copilot Studio")}<span class="text"><span>${fmt(inService("Copilot Studio"))} connectors. Adds agent controls to your strategy.</span> ${cite(["copilot-scope"])}</span><input class="switch" type="checkbox" role="switch" id="ctx-copilot" aria-label="We build Copilot Studio agents" ${ctx.copilot ? "checked" : ""}></label>
        <label class="toggle-row">${product("Logic Apps")}<span class="text"><span>${fmt(inService("Logic Apps"))} connectors. Data policies do not cover it, so this adds Azure Policy.</span> ${cite(["logic-apps"])}</span><input class="switch" type="checkbox" role="switch" id="ctx-logic" aria-label="We use Azure Logic Apps" ${ctx.logicApps ? "checked" : ""}></label>
      </div>
    </section>
    <fieldset class="question">
      <legend>How do you enforce connector rules?</legend>
      <p class="hint">This decides which controls can carry out your decisions. ${cite(["acp-mixed", "acp-only"])}</p>
      <div class="choice-grid">
        ${[["classic", "Classic data policies", "Business, Non-Business and Blocked groups. Choose this if you have not set up advanced connector policies."],
          ["mixed", "Advanced connector policies, mixed mode", "ACP and classic policies run together, and the most restrictive setting wins."],
          ["acp", "Advanced connector policies only", "An allowlist. Classic policies are ignored for this scope."]].map(([v, l, t]) => `
        <label class="choice"><input type="radio" name="policyModel" value="${v}" ${ctx.policyModel === v ? "checked" : ""}><strong>${h(l)}</strong><span class="desc">${h(t)}</span></label>`).join("")}
      </div>
    </fieldset>
    <section class="question">
      <h2>Do you use Managed Environments?</h2>
      <p class="hint">Without them, nonblockable connectors stay nonblockable, even under ACP. ${cite(["acp-managed"])}</p>
      <label class="toggle-row" style="max-width:32rem"><span class="text"><strong>We use Managed Environments</strong></span><input class="switch" type="checkbox" role="switch" id="ctx-managed" ${ctx.managed ? "checked" : ""}></label>
    </section>`;
}

function bindPlatform(main, refresh) {
  const ctx = store.settings.context;
  main.querySelectorAll('input[name="policyModel"]').forEach((i) => i.addEventListener("change", (e) => { ctx.policyModel = e.target.value; saveSettings(); refresh(); }));
  [["#ctx-managed", "managed"], ["#ctx-logic", "logicApps"], ["#ctx-copilot", "copilot"]].forEach(([id, key]) => main.querySelector(id).addEventListener("change", (e) => { ctx[key] = e.target.checked; saveSettings(); refresh(); }));
}

/* ---------- Step 2: appetite ---------- */
function drawAppetite() {
  const s = store.settings;
  return `
    <fieldset class="question">
      <legend>How much are you prepared to accept?</legend>
      <p class="hint">Pick a starting point. Each one shows what it would do to the catalogue under your platform setup, so you can compare before you choose. You can fine-tune every limit in the next step.</p>
      <div class="choice-grid">
        ${Object.entries(PRESETS).map(([id, p]) => `
        <label class="choice"><input type="radio" name="preset" value="${id}" ${s.preset === id ? "checked" : ""}>
          <span class="tag ${id === "microsoft" ? "guidance" : ""}">${id === "microsoft" ? "Follows Microsoft guidance" : "Our judgement"}</span>
          <strong>${h(p.label)}</strong><span class="desc">${h(p.help)}</span>
          <span class="preview">${ZONES.map((z) => {
            const counts = summarise(evaluateAll(store.index, { ...s, zones: p.zones }, z.id));
            return `<span class="preview-zone"><span class="top"><span>${h(z.label)}</span><span><b>${fmt(counts.block)}</b> blocked</span></span>${bar(counts)}</span>`;
          }).join("")}</span>
        </label>`).join("")}
      </div>
      <ul class="legend" style="margin-top:1rem">${Object.keys(TREATMENTS).map((k) => `<li><i class="seg-${k}"></i>${h(TREATMENTS[k].label)}</li>`).join("")}</ul>
      <p class="small muted" style="margin-top:.8rem" id="preset-note">${s.preset ? "" : "You have customised your limits. Choosing a starting point here replaces them."}</p>
    </fieldset>`;
}

function bindAppetite(main, refresh) {
  const s = store.settings;
  main.querySelectorAll('input[name="preset"]').forEach((i) => i.addEventListener("change", (e) => {
    s.preset = e.target.value;
    s.zones = structuredClone(PRESETS[e.target.value].zones);
    main.querySelector("#preset-note").textContent = "";
    saveSettings();
    refresh();
    announce(`Applied ${PRESETS[e.target.value].label}.`);
  }));
}

/* ---------- Step 3: limits ---------- */
const TOLERANCE_ICON = { allow: "allow", controls: "modify", deny: "block" };

function limitCell(exposure, zone) {
  const value = store.settings.zones[zone.id][exposure.id];
  return `<fieldset class="cell"><legend>${h(exposure.label)}: ${h(zone.label)}</legend>
    <span class="zone-name" aria-hidden="true">${h(zone.label)}</span>
    <span class="tri">${TOLERANCES.map((t) => `<label title="${h(TOLERANCE_LABELS[t])}"><span class="visually-hidden">${h(TOLERANCE_LABELS[t])}</span>${icon(TOLERANCE_ICON[t], 15)}<input type="radio" name="t-${zone.id}-${exposure.id}" value="${t}" ${value === t ? "checked" : ""} data-exposure="${exposure.id}" data-zone="${zone.id}"></label>`).join("")}</span>
  </fieldset>`;
}

function drawLimits() {
  const s = store.settings;
  const counts = exposureCounts(store.index, s);
  const heads = ZONES.map((z) => `<span class="zone-col" title="${h(z.help)}">${h(z.label)}</span>`).join("");
  return `
    <p class="hint" style="max-width:46em;color:var(--ink-2)">Each row is a trait of a connector. Each column is a type of environment. Tell the tool what you will accept, and the bar below updates as you go.</p>
    <ul class="key" aria-label="What the symbols mean">
      ${TOLERANCES.map((t) => `<li><span class="mark ${t}">${icon(TOLERANCE_ICON[t], 15)}</span>${h(TOLERANCE_LABELS[t])}</li>`).join("")}
    </ul>
    ${GROUPS.map((group) => `
    <section class="matrix-group">
      <div class="matrix-head"><h2>${h(group.label)}</h2>${heads}</div>
      ${EXPOSURES.filter((e) => e.group === group.id).map((e) => `
      <div class="matrix-row">
        <div><div class="name">${h(e.label)}</div><div class="help">${h(e.help)}</div>
          <div class="meta"><span data-count="${e.id}">${plural(counts[e.id], "connector")}</span> · ${h(e.basis)}${e.scope === "action" ? " · Can be limited action by action" : ""}</div></div>
        ${ZONES.map((z) => limitCell(e, z)).join("")}
      </div>`).join("")}
      ${group.id === "data" ? `<div class="sensitive-box">
        <p class="small muted" style="margin:0 0 .5rem">Mark the categories that hold data you treat as sensitive. Publishers choose these categories, and ${fmt(store.meta.counts.catalogue - store.meta.counts.withCategories)} connectors have none, so this is a coarse signal.</p>
        <fieldset class="chips-input"><legend class="visually-hidden">Sensitive categories</legend>
          ${store.meta.categories.map((c) => `<label><input type="checkbox" name="sensitive" value="${h(c)}" ${s.sensitiveCategories.includes(c) ? "checked" : ""}>${h(c)}</label>`).join("")}
        </fieldset></div>` : ""}
    </section>`).join("")}
    <p class="small muted">${plural(Object.keys(s.overrides).length, "decision")} saved for individual connectors. Set these on <a href="#/connectors">each connector's page</a>.</p>`;
}

function bindLimits(main, refresh) {
  const s = store.settings;
  main.querySelector("#build-body").addEventListener("change", (event) => {
    const { exposure, zone } = event.target.dataset;
    if (exposure) {
      s.zones[zone][exposure] = event.target.value;
      s.preset = null;
    } else if (event.target.name === "sensitive") {
      s.sensitiveCategories = [...main.querySelectorAll('input[name="sensitive"]:checked')].map((x) => x.value);
      main.querySelector('[data-count="sensitive-category"]').textContent = plural(exposureCounts(store.index, s)["sensitive-category"], "connector");
    } else return;
    saveSettings();
    refresh();
  });
}

/* ---------- Settings file ---------- */
function validSettings(input) {
  const base = defaultSettings();
  if (input?.version !== 1 || typeof input.zones !== "object") throw new Error("it is not a settings file from this tool.");
  for (const z of ZONES) {
    for (const e of EXPOSURES) {
      const value = input.zones?.[z.id]?.[e.id];
      if (TOLERANCES.includes(value)) base.zones[z.id][e.id] = value;
    }
  }
  const ctx = input.context ?? {};
  base.context = {
    policyModel: ["classic", "mixed", "acp"].includes(ctx.policyModel) ? ctx.policyModel : "classic",
    managed: ctx.managed === true, logicApps: ctx.logicApps === true, copilot: ctx.copilot !== false,
  };
  base.sensitiveCategories = Array.isArray(input.sensitiveCategories) ? input.sensitiveCategories.filter((c) => store.meta.categories.includes(c)) : [];
  base.overrides = Object.fromEntries(Object.entries(input.overrides ?? {}).filter(([slug, v]) => store.bySlug.has(slug) && ["approved", "allow", "block"].includes(v)));
  base.preset = null;
  return base;
}

function settingsFile() {
  return `<div class="settings-file no-print">
    <button class="linkish" type="button" id="settings-export">Download settings</button>
    <label class="linkish" for="settings-import" style="cursor:pointer">Load settings<input class="visually-hidden" id="settings-import" type="file" accept="application/json,.json"></label>
    <button class="linkish" type="button" id="settings-reset">Reset to Microsoft's starting point</button>
    <span id="settings-status" role="status"></span>
    <span>Your settings stay in this browser.</span>
  </div>`;
}

function bindSettingsFile(main, redraw) {
  main.querySelector("#settings-export").addEventListener("click", () => download("connector-risk-settings.json", JSON.stringify(store.settings, null, 2)));
  main.querySelector("#settings-reset").addEventListener("click", () => {
    store.settings = defaultSettings();
    saveSettings();
    redraw();
    announce("Settings reset.");
  });
  main.querySelector("#settings-import").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      store.settings = validSettings(JSON.parse(await file.text()));
      saveSettings();
      redraw();
      announce("Settings loaded.");
    } catch (error) {
      main.querySelector("#settings-status").textContent = `That file could not be loaded: ${error.message}`;
    }
  });
}

/* ---------- The builder page ---------- */
const VIEWS = {
  platform: { title: "Tell us about your platform", lede: "These answers decide which controls can carry out your decisions.", draw: drawPlatform, bind: bindPlatform },
  appetite: { title: "Set your risk appetite", lede: "Compare three starting points and pick the closest.", draw: drawAppetite, bind: bindAppetite },
  limits: { title: "Fine-tune your limits", lede: "Adjust what you will accept in each environment zone.", draw: drawLimits, bind: bindLimits },
};

export function renderBuild(main, step) {
  const id = VIEWS[step] ? step : "platform";
  const view = VIEWS[id];
  main.innerHTML = `
    ${stepper(id)}
    <div class="page-head"><h1>${h(view.title)}</h1><p class="lede" style="margin:0">${h(view.lede)}</p></div>
    <div id="build-body">${view.draw()}</div>
    ${settingsFile()}
    ${dock(id)}`;
  rememberBlocks();
  const zones = main.querySelector("#dock-zones");
  view.bind(main, () => { zones.innerHTML = dockZones(); });
  bindSettingsFile(main, () => renderBuild(main, id));
  return view.title;
}

/* ---------- Strategy ---------- */
function zoneLists(zone) {
  const results = resultsFor(zone.id);
  const lists = { block: [], retain: [], modify: [], allow: [], outside: [] };
  store.index.forEach((c, i) => lists[results[i].treatment].push({ c, r: results[i] }));
  return lists;
}

const PHASES = [
  { id: "prepare", title: "Prepare", why: "Before anything changes" },
  { id: "baseline", title: "Set the baseline", why: "One policy per environment type" },
  { id: "tighten", title: "Tighten", why: "Limit what stays allowed" },
  { id: "gaps", title: "Close the gaps", why: "Where policies do not reach" },
  { id: "run", title: "Keep it running", why: "Every week from here on" },
];

function strategySteps() {
  const ctx = store.settings.context;
  const acp = ctx.policyModel !== "classic";
  const data = Object.fromEntries(ZONES.map((z) => [z.id, zoneLists(z)]));
  const anyActions = ZONES.flatMap((z) => data[z.id].modify.filter(({ r }) => r.steps.some((s) => s.kind.endsWith("actions"))));
  const anyEndpoint = ZONES.flatMap((z) => data[z.id].modify.filter(({ r }) => r.steps.some((s) => s.kind === "endpoint")));
  const retained = (zone) => data[zone].retain.length;
  const steps = [];
  const shared = data.shared;
  const group = (list, name) => list.filter(({ r }) => r.group === name).length;
  const nonBiz = group(shared.allow, "Non-Business") + group(shared.modify, "Non-Business");
  const biz = group(shared.allow, "Business") + group(shared.modify, "Business");
  steps.push({
    phase: "prepare",
    title: "Check real usage before you change anything",
    body: "Policy changes affect apps, flows and agents that already exist, and non-compliant desktop flows are suspended. This tool cannot see your tenant, so inventory usage first, test outside production and tell makers what is changing.",
    facts: ["runtime-impact", "desktop-suspended"],
  });
  steps.push({
    phase: "prepare",
    title: "Keep policies few, and model them before publishing",
    body: "All policies that apply to an environment are evaluated together, and the most restrictive result wins. Use environment-level policies only for exceptions and custom connectors.",
    facts: ["few-policies", "most-restrictive", "fragmentation"],
  });
  steps.push({
    phase: "baseline",
    title: acp ? "Curate an allowlist for shared environments" : "Set one tenant baseline for shared environments",
    body: acp
      ? `Allow ${fmt(biz + nonBiz)} connectors and leave ${fmt(shared.block.length)} off the list. ACP enforces the list as soon as it is saved, so curate it first, and start in mixed mode.`
      : `Create one tenant-level policy covering all environments except those you choose to exclude. Under your settings it blocks ${fmt(shared.block.length)} connectors, places ${fmt(biz)} in Business and ${fmt(nonBiz)} in Non-Business. It also applies to new environments.`,
    facts: acp ? ["acp-immediate", "acp-mixed"] : ["baseline-shared", "few-policies"],
  });
  steps.push({
    phase: "baseline",
    title: "Give team and production environments their own policies",
    body: `Exclude them from the shared baseline. ${data.team.block.length || data.production.block.length ? `Dedicated team environments can then block ${fmt(data.team.block.length)} connectors, and production ${fmt(data.production.block.length)}.` : "Your limits block nothing outright in either, and rely on controls instead."} In production, treat this as the outer limit and agree the actual connectors for each solution with its business unit.`,
    facts: ["baseline-team", "baseline-production"],
  });
  if (anyActions.length) {
    steps.push({
      phase: "tighten",
      title: "Limit actions on the connectors you allow",
      body: `Your settings limit actions on ${fmt(new Set(anyActions.map(({ c }) => c.s)).size)} connectors. Set the default for future actions deliberately. Individual triggers can only be managed through PowerShell.`,
      facts: ["action-control", "trigger-powershell"],
    });
  }
  if (anyEndpoint.length) {
    steps.push({
      phase: "tighten",
      title: "Add endpoint filtering, and know its limits",
      body: "Rules cover static endpoints only, not environment variables, custom inputs or endpoints created at runtime. The feature is in preview, so pair it with environment isolation.",
      facts: ["endpoint-filtering", "endpoint-static", "endpoint-preview"],
    });
  }
  steps.push({
    phase: "tighten",
    title: "Plan for HTTP and custom connectors separately",
    body: `Check child flows before reclassifying HTTP, because they share a dependency. Classify custom connectors by host URL pattern at tenant level, and by name at environment level.${acp ? " ACP does not cover either type yet, so keep classic policies for them." : ""}`,
    facts: ["http-child", "custom-connectors", ...(acp ? ["acp-unsupported"] : [])],
  });
  if (ctx.copilot) {
    steps.push({ phase: "tighten", products: ["Copilot Studio"], title: "Decide agent controls per zone", body: "Decide on unauthenticated chat, HTTP requests, publishing channels and skills. Data policies govern each of these, and blocking one removes that capability from agents.", facts: ["copilot-scope", "acp-unsupported"] });
  }
  const totalRetained = ZONES.reduce((sum, z) => sum + retained(z.id), 0);
  if (totalRetained) {
    steps.push({
      phase: "gaps",
      title: "Decide what to do where no control can enforce your limit",
      body: `${ZONES.map((z) => `${z.label}: ${fmt(retained(z.id))}`).join(". ")}. Most are core Microsoft connectors, which classic policies cannot block or limit. ${ctx.managed && acp ? "" : "ACP on a Managed Environment can restrict them. "}Otherwise, the risk owner must accept the position, or the limit must change.`,
      facts: ["nonblockable", "action-control", "acp-managed"],
    });
  }
  if (acp) {
    steps.push({
      phase: "gaps",
      title: "Watch for what ACP does differently",
      body: "ACP has no Business and Non-Business separation, so allowed connectors can be combined. Do not switch to ACP-only mode until HTTP connectors, custom connectors and endpoint filtering are governed another way.",
      facts: ["acp-no-groups", "acp-only", "acp-native-gap", "acp-unsupported"],
    });
  }
  if (ctx.logicApps) {
    const covered = store.index.filter((c) => c.ct.logicApps).length;
    steps.push({ phase: "gaps", products: ["Logic Apps"], title: "Mirror your blocks in Azure Policy", body: `${fmt(covered)} connectors are available in Azure Logic Apps. Data policies do not reach them there, so add matching Azure Policy rules.`, facts: ["logic-apps"] });
  }
  steps.push({
    phase: "gaps",
    title: "Close the cross-tenant gap",
    body: "Tenant isolation works only for connectors that use Microsoft Entra ID authentication, and a known issue leaves the Azure DevOps connector outside it. Use data policies for the rest.",
    facts: ["tenant-isolation", "tenant-ado"],
  });
  steps.push(acp ? {
    phase: "run",
    title: "Add new connectors to the allowlist deliberately",
    body: "New connectors are blocked automatically under ACP. Use the Changes page to review what has arrived each week.",
    facts: ["acp-new"], link: { href: "#/changes", text: "See weekly changes" },
  } : {
    phase: "run",
    title: "Review new connectors every week",
    body: "Keep Non-Business as the default group. Move each new connector to Business or Blocked after evaluating it. Use the Changes page to see what arrived.",
    facts: ["default-group"], link: { href: "#/changes", text: "See weekly changes" },
  });
  steps.push({
    phase: "run",
    title: "Handle exceptions the documented way",
    body: "Deny the request, change the policy, or move the environment out of the baseline and give it a policy for that use case. Give each exception an owner and a review date.",
    facts: ["exceptions"],
  });
  return { steps, data, totalRetained };
}

function zoneNumbers(counts) {
  return `<ul class="zone-numbers">${Object.keys(TREATMENTS).filter((k) => k !== "outside" || counts[k]).map((k) => `<li><b>${fmt(counts[k])}</b><span><i class="seg-${k}"></i>${h(TREATMENTS[k].label)}</span></li>`).join("")}</ul>`;
}

export function renderStrategy(main) {
  const { steps, data, totalRetained } = strategySteps();
  const ctx = store.settings.context;
  const modelLabel = { classic: "Classic data policies", mixed: "ACP in mixed mode", acp: "ACP only" }[ctx.policyModel];
  const acpAvailable = ctx.policyModel !== "classic";
  let number = 0;
  main.innerHTML = `
    ${stepper("strategy")}
    <div class="page-head"><h1>Your connector strategy</h1>
      <p class="lede" style="margin:0 0 1rem">What your settings do to the catalogue, and what to do about it, in order.</p>
      <div class="summary-line">
        <span class="chip">${h(store.settings.preset ? PRESETS[store.settings.preset].label : "Customised limits")}</span>
        <span class="chip">${h(modelLabel)}</span>
        <span class="chip">${ctx.managed ? "Managed Environments" : "No Managed Environments"}</span>
        <a class="small no-print" href="#/build/platform" style="margin-left:.3rem">Change these</a>
      </div>
      <ul class="product-row">${["Power Apps", "Power Automate", ...(ctx.copilot ? ["Copilot Studio"] : []), ...(ctx.logicApps ? ["Logic Apps"] : [])].map((p) => `<li>${product(p)}</li>`).join("")}</ul>
    </div>

    <h2>Where you end up</h2>
    <div class="zone-cards">${ZONES.map((z) => {
      const counts = summarise(resultsFor(z.id));
      return `<div class="card zone-result"><h3>${h(z.label)}</h3><p class="zone-help">${h(z.help)}</p>${bar(counts)}${zoneNumbers(counts)}</div>`;
    }).join("")}</div>
    ${totalRetained ? `<div class="decision">${icon("retain", 22)}<p><strong>You have a decision to make.</strong> Your limits cover connectors that no control can enforce under your setup: ${ZONES.map((z) => `${fmt(data[z.id].retain.length)} in ${h(z.label.toLowerCase())}`).join(", ")}. A risk owner must accept these, or you need to change the limit or your policy model. <a href="#zone-lists-head">See the list</a>.</p></div>` : ""}

    <h2>What to do, in order</h2>
    ${PHASES.map((phase) => {
      const list = steps.filter((s) => s.phase === phase.id);
      if (!list.length) return "";
      return `<section class="phase"><h3 class="phase-title">${h(phase.title)}<span class="why">${h(phase.why)}</span></h3><ol class="steps">
        ${list.map((s) => { number += 1; return `<li class="step"><div class="step-n" aria-hidden="true">${number}</div><div class="step-body">
          ${s.products ? `<div class="product-row">${s.products.map((p) => product(p)).join("")}</div>` : ""}
          <h3>${h(s.title)}</h3><p>${h(s.body)}</p>
          ${s.link ? `<p class="small"><a href="${s.link.href}">${h(s.link.text)}</a></p>` : ""}
          ${cite(s.facts)}</div></li>`; }).join("")}</ol></section>`;
    }).join("")}

    <h2>What this cannot tell you</h2>
    <div class="grid two">
      <div class="card small"><strong>Which connectors your makers use or combine.</strong> Splitting two connectors into different groups stops any app or flow that uses both. ${cite(["groups"])}</div>
      <div class="card small"><strong>Which system a connection points at.</strong> Data policies cannot see this either. ${cite(["no-connection-control"])}</div>
      <div class="card small"><strong>Which users may use a connector.</strong> Policies apply to environments and tenants, not users. ${cite(["no-user-scope"])}</div>
      <div class="card small"><strong>How likely an incident is.</strong> That needs your own usage and incident data.</div>
    </div>

    <h2 id="zone-lists-head">Connector lists</h2>
    <div class="tabs no-print" role="tablist" aria-label="Environment zone">
      ${ZONES.map((z) => `<button role="tab" type="button" id="list-tab-${z.id}" aria-controls="zone-lists" aria-selected="${store.zone === z.id}" tabindex="${store.zone === z.id ? 0 : -1}" data-zone="${z.id}">${h(z.label)}</button>`).join("")}
    </div>
    <div id="zone-lists" role="tabpanel" aria-labelledby="list-tab-${store.zone}"></div>

    <h2 class="no-print">Take it with you</h2>
    <div class="card no-print">
      <div class="callout" style="margin-top:0"><strong>These are drafts for administrator review.</strong> Connector IDs are derived from Learn page addresses, and action lists depend on name-based classes. Check both before applying anything. This site never calls Microsoft APIs.</div>
      <div class="actions">
        <button class="btn primary" type="button" id="print-strategy">Print or save as PDF</button>
        <button class="btn" type="button" id="dl-csv">Treatment for all zones (CSV)</button>
        <button class="btn" type="button" id="dl-actions">Action rules for this zone (JSON)</button>
        ${acpAvailable ? '<button class="btn" type="button" id="dl-acp">ACP allowlist for this zone (JSON)</button>' : ""}
      </div>
      <p class="small" style="margin:.6rem 0 0">${cite(["action-control", "acp-shape"])}</p>
      <p class="small muted" id="dl-status" role="status" style="margin:.3rem 0 0"></p>
      ${settingsFile()}
    </div>`;

  const listRoot = main.querySelector("#zone-lists");
  const drawLists = () => {
    const lists = data[store.zone];
    const section = (key, title, intro) => {
      const rows = lists[key];
      if (!rows.length) return "";
      const sorted = [...rows].sort((a, b) => b.r.redLines - a.r.redLines || a.c.n.localeCompare(b.c.n));
      return `<details class="op-class"><summary><span>${pill(key)} ${h(title)}</span><span class="muted">${fmt(rows.length)}</span></summary>
        <div style="padding:0 1rem .8rem"><p class="small muted">${h(intro)}</p>
        <ul class="plain" style="columns:2 280px">${sorted.slice(0, 200).map(({ c, r }) => `<li><a href="#/c/${encodeURIComponent(c.s)}">${h(c.n)}</a>${r.group && key !== "block" ? ` <span class="muted small">(${h(r.group)})</span>` : ""}</li>`).join("")}</ul>
        ${rows.length > 200 ? `<p class="small muted">Showing the first 200 of ${fmt(rows.length)}. Download the CSV for all of them.</p>` : ""}</div></details>`;
    };
    listRoot.innerHTML = section("retain", "No control can enforce your limit", "These need a risk owner's decision, or a change of policy model.")
      + section("block", "Blocked", "Sorted by how many of your limits each one crosses.")
      + section("modify", "Allowed with controls", "Open a connector to see its specific controls.")
      + section("allow", "Allowed", "Your settings place no condition on these.")
      + section("outside", "Outside data policies", "Data policies do not govern these. Logic Apps connectors need Azure Policy.");
  };
  const tabs = [...main.querySelectorAll('[role="tab"]')];
  const selectTab = (tab) => {
    store.zone = tab.dataset.zone;
    tabs.forEach((t) => { t.setAttribute("aria-selected", t === tab); t.tabIndex = t === tab ? 0 : -1; });
    listRoot.setAttribute("aria-labelledby", tab.id);
    drawLists();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (e) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1 }[e.key];
      if (next === undefined) return;
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      selectTab(target);
    });
  });
  main.querySelector('a[href="#zone-lists-head"]')?.addEventListener("click", (e) => {
    e.preventDefault();
    main.querySelector("#zone-lists-head").scrollIntoView();
  });
  main.querySelector("#print-strategy").addEventListener("click", () => window.print());
  bindSettingsFile(main, () => renderStrategy(main));
  const status = main.querySelector("#dl-status");
  main.querySelector("#dl-csv").addEventListener("click", () => {
    const all = ZONES.map((z) => resultsFor(z.id));
    download("connector-treatments.csv", csv([
      ["Connector", "Connector ID (derived)", "Publisher", ...ZONES.flatMap((z) => [`${z.label}: treatment`, `${z.label}: group`, `${z.label}: limits crossed`])],
      ...store.index.map((c, i) => [c.n, c.api, c.p, ...all.flatMap((results) => [TREATMENTS[results[i].treatment].label, results[i].group ?? "", results[i].redLines])]),
    ]), "text/csv");
    status.textContent = "Download started.";
  });
  main.querySelector("#dl-actions").addEventListener("click", async (event) => {
    event.target.disabled = true;
    status.textContent = "Fetching operation lists.";
    const results = resultsFor(store.zone);
    const targets = results.filter((r) => r.deniedClasses.length && r.treatment !== "block").map((r) => r.slug);
    const details = await connectorDetails(targets);
    const out = actionRulesDraft(results, details);
    download(`action-rules-${store.zone}-DRAFT.json`, JSON.stringify({ note: "Draft for administrator review.", ...out }, null, 2));
    status.textContent = `Draft covers ${plural(out.connectorActionConfigurations.length, "connector")}.`;
    event.target.disabled = false;
  });
  main.querySelector("#dl-acp")?.addEventListener("click", async (event) => {
    event.target.disabled = true;
    status.textContent = "Fetching operation lists.";
    const results = resultsFor(store.zone);
    const targets = results.filter((r) => r.deniedClasses.length && r.treatment !== "block").map((r) => r.slug);
    const details = await connectorDetails(targets);
    const { draft, notCovered } = acpDraft(store.index, results, zoneById(store.zone).label, details);
    download(`acp-allowlist-${store.zone}-DRAFT.json`, JSON.stringify(draft, null, 2));
    status.textContent = `Draft allows ${plural(draft.ruleSets[0].inputs.AllowedConnectorList.length, "connector")}. Not covered by ACP, so govern separately: ${notCovered.join(", ")}.`;
    event.target.disabled = false;
  });
  drawLists();
  return "Strategy";
}
