/**
 * Entry point. Loads the data, sets up the theme, and routes between views.
 *
 * Routing is hash-based (#/connectors, #/c/sharepointonline) so the site works on
 * GitHub Pages with no server rewrites, and every view can be linked to directly.
 * Each view is an async function (main, param) that renders into <main> and returns
 * the page title.
 *
 * @module app
 */
import { store, h, loadSettings } from "./ui.js";
import { renderBuild, renderStrategy } from "./build.js";
import { renderAbout, renderData, renderFreshness, renderStatus } from "./status.js";
import { renderChanges, renderCatalogue, renderConnector, renderHome, renderMethod } from "./views.js";

const main = document.getElementById("main");

// Route table: the first path segment selects the view; nav names the header link to mark current.
const routes = {
  "": { view: renderHome, title: "Connector Risk Framework" },
  connectors: { view: renderCatalogue, title: "Connectors", nav: "connectors" },
  c: { view: renderConnector, title: "Connector", nav: "connectors" },
  build: { view: renderBuild, title: "Risk profile", nav: "build" },
  // Kept so links to the earlier address still work.
  criteria: { view: (main) => renderBuild(main, "limits"), title: "Risk profile", nav: "build" },
  strategy: { view: renderStrategy, title: "Strategy", nav: "build" },
  changes: { view: renderChanges, title: "Changes", nav: "changes" },
  method: { view: renderMethod, title: "Method", nav: "method" },
  status: { view: renderStatus, title: "Data status" },
  data: { view: renderData, title: "Data and downloads" },
  about: { view: renderAbout, title: "About" },
};

/** Render the view for the current hash, set the title, and move focus to the new content. */
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

/**
 * Light or dark theme. The system setting applies until the reader presses the toggle;
 * their choice is then kept in localStorage and set as data-theme on <html>.
 */
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

// Wide tables scroll sideways inside a .table-scroll wrapper. A scrolling region must be
// reachable by keyboard (WCAG 2.1.1), so each one becomes a focusable, labelled region,
// named after the nearest heading above it. Views re-render often, so an observer applies
// this to every wrapper as it appears rather than each view doing it.
function labelScrollRegions(root) {
  root.querySelectorAll(".table-scroll:not([tabindex])").forEach((region) => {
    let heading = region.previousElementSibling;
    while (heading && !/^H[1-4]$/.test(heading.tagName)) heading = heading.previousElementSibling;
    region.tabIndex = 0;
    region.setAttribute("role", "region");
    region.setAttribute("aria-label", heading ? `Table: ${heading.textContent.trim()}` : "Table");
  });
}

/** Load the three files every view needs, fill the store, then render the first page. */
async function start() {
  new MutationObserver(() => labelScrollRegions(main)).observe(main, { childList: true, subtree: true });
  setupTheme();
  const load = (name) => fetch(`data/current/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${name}`);
    return r.json();
  });
  const [index, meta, facts] = await Promise.all([load("index"), load("meta"), load("facts")]);
  Object.assign(store, { index, meta, facts, settings: loadSettings() });
  store.bySlug = new Map(index.map((c) => [c.s, c]));
  store.factById = new Map(facts.facts.map((f) => [f.id, f]));
  renderFreshness();
  window.addEventListener("hashchange", route);
  await route();
}

start().catch((error) => {
  console.error(error);
  main.innerHTML = `<h1>The connector data could not be loaded</h1><p>${h(error.message)}</p>`;
});
