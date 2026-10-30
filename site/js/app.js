import { store, h, loadSettings } from "./ui.js";
import { renderChanges, renderCatalogue, renderConnector, renderCriteria, renderHome, renderMethod, renderStrategy } from "./views.js";

const main = document.getElementById("main");

const routes = {
  "": { view: renderHome, title: "Connector Risk Framework" },
  connectors: { view: renderCatalogue, title: "Connectors", nav: "connectors" },
  c: { view: renderConnector, title: "Connector", nav: "connectors" },
  criteria: { view: renderCriteria, title: "What matters", nav: "criteria" },
  strategy: { view: renderStrategy, title: "Strategy", nav: "strategy" },
  changes: { view: renderChanges, title: "Changes", nav: "changes" },
  method: { view: renderMethod, title: "Method", nav: "method" },
};

async function route() {
  const [, first = "", ...rest] = location.hash.replace(/^#/, "").split("/");
  const entry = routes[first] ?? null;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (entry?.nav === a.dataset.nav) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (!entry) {
    main.innerHTML = '<h1>Page not found</h1><p><a href="#/">Go to the start page</a>.</p>';
    return;
  }
  try {
    const title = await entry.view(main, decodeURIComponent(rest.join("/")));
    document.title = title && title !== entry.title ? `${title}: Connector Risk Framework` : entry.title;
  } catch (error) {
    console.error(error);
    main.innerHTML = `<h1>That page could not be shown</h1><p>${h(error.message)}</p><p><a href="#/connectors">Go to all connectors</a>.</p>`;
  }
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

function setupTheme() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem("crf.theme");
    if (saved) root.dataset.theme = saved;
  } catch { /* uses the system theme */ }
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("crf.theme", root.dataset.theme); } catch { /* not remembered */ }
  });
}

async function start() {
  setupTheme();
  const load = (name) => fetch(`data/current/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${name}`);
    return r.json();
  });
  const [index, meta, facts] = await Promise.all([load("index"), load("meta"), load("facts")]);
  Object.assign(store, { index, meta, facts, settings: loadSettings() });
  store.bySlug = new Map(index.map((c) => [c.s, c]));
  store.factById = new Map(facts.facts.map((f) => [f.id, f]));
  document.getElementById("data-stamp").textContent = `Data from Microsoft Learn, refreshed ${meta.dataDate}. Sources last checked ${facts.checked}.`;
  window.addEventListener("hashchange", route);
  await route();
}

start().catch((error) => {
  console.error(error);
  main.innerHTML = `<h1>The connector data could not be loaded</h1><p>${h(error.message)}</p>`;
});
