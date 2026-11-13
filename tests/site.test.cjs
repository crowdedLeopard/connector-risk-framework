// End-to-end checks on the built site in _site: every page renders without errors,
// passes automated accessibility checks (axe-core, WCAG 2.1 AA rules), and every
// internal link and downloadable file resolves. Run `python -m pipeline.build_site` first.
//
//   node --test tests/site.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "_site");
// Injected through the debugging protocol, so the page's Content-Security-Policy stays in force.
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".csv": "text/csv" };
const PAGES = ["", "build", "strategy", "connectors", "c/sharepointonline", "c/calendly", "changes", "method", "status", "data", "about"];
const FAILED = /Page not found|could not be shown|could not be loaded|Connector not found/;

let server, base, browser;

before(async () => {
  assert.ok(fs.existsSync(path.join(ROOT, "index.html")), "Build the site first: python -m pipeline.build_site");
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(ROOT, url);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/`;
  // CHROMIUM_PATH lets a machine with its own Chromium skip `npx playwright install`.
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function open(route, { scheme = "light", width = 1280 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(`${base}#/${route}`);
  await page.waitForFunction(() => !document.querySelector("#main .loading"));
  await page.waitForLoadState("networkidle");
  return { page, errors };
}

async function axe(page) {
  await page.evaluate(AXE);
  const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`);
}

for (const scheme of ["light", "dark"]) {
  for (const route of PAGES) {
    test(`#/${route} renders and passes accessibility checks (${scheme})`, async () => {
      const { page, errors } = await open(route, { scheme });
      const text = await page.locator("#main").innerText();
      assert.doesNotMatch(text, FAILED);
      assert.ok(await page.locator("#main h1").count() === 1, "exactly one h1");
      assert.notEqual(await page.title(), "");
      assert.deepEqual(errors, []);
      assert.deepEqual(await axe(page), []);
      await page.close();
    });
  }
}

test("mobile width has no horizontal scroll", async () => {
  for (const route of ["", "connectors", "status", "data"]) {
    const { page } = await open(route, { width: 375 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `#/${route} overflows by ${overflow}px`);
    await page.close();
  }
});

test("every internal link resolves", async () => {
  const routes = new Set();
  const files = new Set();
  for (const route of PAGES) {
    const { page } = await open(route);
    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    for (const href of hrefs) {
      if (href.startsWith("#/")) routes.add(href.slice(2));
      else if (!/^(https?:|mailto:|#|blob:)/.test(href)) files.add(href);
    }
    await page.close();
  }
  for (const file of files) {
    const res = await fetch(new URL(file, base));
    assert.equal(res.status, 200, `broken file link: ${file}`);
  }
  const page = await browser.newPage();
  for (const route of routes) {
    await page.goto(`${base}#/${route}`);
    await page.waitForFunction(() => !document.querySelector("#main .loading"));
    await page.waitForTimeout(50);
    assert.doesNotMatch(await page.locator("#main").innerText(), FAILED, `broken route: #/${route}`);
  }
  await page.close();
});

test("a stale-data banner appears when the data is old", async () => {
  const page = await browser.newPage();
  await page.route("**/data/current/meta.json", async (route) => {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current/meta.json"), "utf8"));
    await route.fulfill({ json: { ...meta, dataDate: "2020-01-06" } });
  });
  await page.goto(`${base}#/`);
  await page.waitForFunction(() => !document.querySelector("#main .loading"));
  const banner = page.locator("#stale-banner");
  assert.equal(await banner.isVisible(), true);
  assert.match(await banner.innerText(), /Out of date/);
  await page.close();
});

test("no stale-data banner when the data is current", async () => {
  const page = await browser.newPage();
  await page.route("**/data/current/meta.json", async (route) => {
    const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "data/current/meta.json"), "utf8"));
    await route.fulfill({ json: { ...meta, dataDate: new Date().toISOString().slice(0, 10) } });
  });
  await page.goto(`${base}#/`);
  await page.waitForFunction(() => !document.querySelector("#main .loading"));
  assert.equal(await page.locator("#stale-banner").isVisible(), false);
  await page.close();
});
