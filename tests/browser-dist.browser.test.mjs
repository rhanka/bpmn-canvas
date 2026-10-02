// The browser build served like a CDN serves npm files: the packed package under a nested,
// versioned path on another origin (CORS), pages on their own nested path. ESM and IIFE,
// each with and without a strict CSP (no 'unsafe-inline', no data:, no connect-src).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const sriFile = JSON.parse(readFileSync(join(root, "dist/browser/sri.json"), "utf8"));
const sri = sriFile;
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".eot": "application/vnd.ms-fontobject", ".map": "application/json", ".json": "application/json", ".txt": "text/plain", ".html": "text/html", ".md": "text/markdown" };
const listen = (server, host) => new Promise((r) => server.listen(0, host, () => r(server.address().port)));

test("browser build from a CDN path: ESM and IIFE, with and without strict CSP", { timeout: 300000 }, async (t) => {
  // The CDN: the files of the packed package, as jsDelivr/unpkg serve them.
  const scratch = mkdtempSync(join(root, "proofs-profile-cdn-"));
  execFileSync("npm", ["pack", "--pack-destination", scratch, "--silent"], { cwd: root, stdio: "pipe" });
  const tgz = readdirSync(scratch).find((f) => f.endsWith(".tgz"));
  execFileSync("tar", ["xzf", join(scratch, tgz), "-C", scratch]);
  const pkgDir = join(scratch, "package");
  const cdnPrefix = `/npm/${pkg.name}@${pkg.version}`;
  const cdnLog = [];
  const cdn = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    cdnLog.push(path);
    const headers = { "Access-Control-Allow-Origin": "*", "Timing-Allow-Origin": "*", "Cache-Control": "no-store" };
    if (!path.startsWith(cdnPrefix + "/")) { res.writeHead(404, headers); return res.end(); }
    const file = normalize(join(pkgDir, path.slice(cdnPrefix.length)));
    if (!file.startsWith(pkgDir) || !existsSync(file)) { res.writeHead(404, headers); return res.end(); }
    res.writeHead(200, { ...headers, "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  const cdnPort = await listen(cdn, "localhost");
  const cdnOrigin = `http://localhost:${cdnPort}`;
  const cdnBase = cdnOrigin + cdnPrefix;

  // The application: its own origin and nested path.
  const pageDir = join(root, "tests/browser-dist");
  const appBase = "/app/nested/deep/";
  const app = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    if (path === "/favicon.ico") { res.writeHead(204); return res.end(); }
    if (!path.startsWith(appBase)) { res.writeHead(404); return res.end(); }
    const name = path.slice(appBase.length);
    const m = /^(esm|iife)(-csp)?(-external|-nolink|-badbase)?\.html$/.exec(name);
    const sd = /^srcdoc(-assetbase)?\.html$/.exec(name);
    const nonce = randomBytes(16).toString("base64");
    const headers = { "Cache-Control": "no-store" };
    let body;
    if (m) {
      const [, variant, csp, mode] = m;
      const external = mode === "-external" || mode === "-nolink";
      const iife = sri.files["bpmn-canvas.iife.min.js"].integrity;
      const esm = sri.files["bpmn-canvas.min.js"].integrity;
      body = readFileSync(join(pageDir, "page.html"), "utf8")
        .replaceAll("__VARIANT__", variant + (csp ? " (strict CSP)" : "") + (external ? " (external stylesheet)" : ""))
        .replaceAll("__STYLES__", external ? `<meta name="bpmn-styles" content="external">` + (mode === "-external" ? `\n<link rel="stylesheet" href="__CDN__/dist/styles.css" crossorigin="anonymous">` : "") : "")
        .replaceAll("__ASSETBASE__", mode === "-badbase" ? `<meta name="asset-base" content="__CDN__/dist/nowhere/">` : "")
        .replaceAll("__PRELOAD__", variant === "esm" ? `<link rel="modulepreload" href="__CDN__/dist/browser/bpmn-canvas.min.js" integrity="${esm}" crossorigin="anonymous">` : "")
        .replaceAll("__SCRIPTS__", variant === "esm" ? `<script type="module" src="./esm-page.js"></script>` : `<script src="__CDN__/dist/browser/bpmn-canvas.iife.min.js" integrity="${iife}" crossorigin="anonymous"></script>\n<script src="./iife-page.js"></script>`)
        .replaceAll("__NONCE__", csp ? nonce : "");
      headers["Content-Type"] = "text/html; charset=utf-8";
      if (csp) {
        headers["Content-Security-Policy"] = [
          "default-src 'none'",
          `script-src 'self' ${cdnOrigin}`,
          `style-src 'nonce-${nonce}' ${cdnOrigin}`,
          `font-src ${cdnOrigin}`,
          `img-src ${cdnOrigin}`,
          "connect-src 'none'",
          "base-uri 'none'",
          "form-action 'none'",
          "object-src 'none'",
        ].join("; ");
      }
    } else if (sd) {
      // Gemini Enterprise A2UI shape: agent-supplied HTML in an iframe srcdoc, connect-src 'none',
      // the IIFE inlined (no src, so no script URL to resolve assets against).
      const esc = (s) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
      const inner = [
        '<!doctype html><html lang="en"><head><meta charset="utf-8">',
        "<meta http-equiv=\"Content-Security-Policy\" content=\"connect-src 'none'\">",
        sd[1] ? '<meta name="asset-base" content="__CDN__/dist/assets/">' : "",
        '</head><body><div id="canvas"></div><div id="canvas2"></div>',
        `<script>${readFileSync(join(pageDir, "early.js"), "utf8")}</script>`,
        `<script>${readFileSync(join(root, "dist/browser/bpmn-canvas.iife.min.js"), "utf8")}</script>`,
        `<script type="module">${readFileSync(join(pageDir, "proof.js"), "utf8").replace("export async function", "async function")}\nwindow.__proof = runProof(window.BpmnCanvas, "srcdoc");</script>`,
        "</body></html>",
      ].join("\n").replaceAll("__CDN__", cdnBase);
      body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>srcdoc</title></head><body><iframe name="ge" title="canvas" width="1000" height="780" srcdoc="${esc(inner)}"></iframe></body></html>`;
      headers["Content-Type"] = "text/html; charset=utf-8";
    } else if (/^[a-z-]+\.js$/.test(name) && existsSync(join(pageDir, name))) {
      body = readFileSync(join(pageDir, name), "utf8");
      headers["Content-Type"] = "text/javascript";
    } else { res.writeHead(404); return res.end(); }
    res.writeHead(200, headers);
    res.end(body.replaceAll("__CDN__", cdnBase));
  });
  const appPort = await listen(app, "127.0.0.1");
  const appOrigin = `http://127.0.0.1:${appPort}`;

  const profile = mkdtempSync(join(root, "proofs-profile-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROMIUM ?? (existsSync("/snap/bin/chromium") ? "/snap/bin/chromium" : undefined),
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const evidenceDir = join(root, "proofs/browser-dist");
  mkdirSync(evidenceDir, { recursive: true });
  const evidence = { note: "srcdoc pages: GE A2UI IFrameSrcdoc shape (IIFE inlined, CSP connect-src 'none'); -badbase, -nolink and srcdoc without assetBase are expected failures that must show a visible diagnostic", package: `${pkg.name}@${pkg.version}`, cdnBase, appBase: appOrigin + appBase, sri, runs: {} };
  try {
    const BROKEN = { "esm-badbase": "asset-load-failed", "esm-nolink": "styles-missing", srcdoc: "asset-load-failed" };
    for (const name of ["esm", "iife", "esm-csp", "iife-csp", "esm-csp-external", "srcdoc-assetbase", "srcdoc", "esm-badbase", "esm-nolink"]) {
      await t.test(name, async () => {
        const page = ctx.pages()[0] ?? (await ctx.newPage());
        const consoleLines = [];
        const failed = [];
        page.removeAllListeners("console");
        page.removeAllListeners("requestfailed");
        page.on("console", (msg) => { if (msg.type() === "error" || msg.type() === "warning") consoleLines.push(`[${msg.type()}] ${msg.text()}`); });
        page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
        page.on("requestfailed", (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
        page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
        await page.goto(`${appOrigin}${appBase}${name}.html`);
        const frame = name.startsWith("srcdoc") ? await (async () => { await page.waitForSelector("iframe[name=ge]"); return page.frame({ name: "ge" }); })() : page;
        await frame.waitForFunction(() => window.__proof !== undefined, null, { timeout: 60000 });
        const proof = await frame.evaluate(() => window.__proof);
        const broken = BROKEN[name];

        // An edit with a real drag, then the document read back through the API.
        const task = await frame.locator('#canvas .djs-element[data-element-id="T"]').boundingBox();
        await page.mouse.move(task.x + task.width / 2, task.y + task.height / 2);
        await page.mouse.down();
        await page.mouse.move(task.x + task.width / 2 + 40, task.y + task.height / 2, { steps: 4 });
        await page.mouse.move(task.x + task.width / 2 + 80, task.y + task.height / 2, { steps: 4 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        const xml = await frame.evaluate(() => window.__api.getXml());
        const moved = /id="dT"[^>]*>\s*<dc:Bounds x="([\d.]+)"/.exec(xml)?.[1];
        const changes = await frame.evaluate(() => window.__api.changes);
        const resources = await frame.evaluate(() => performance.getEntriesByType("resource").map((e) => ({ name: e.name, status: e.responseStatus })));
        const violations = await frame.evaluate(() => window.__violations);
        await page.screenshot({ path: join(evidenceDir, `${name}.png`) });
        const assets = resources.filter((r) => r.name.startsWith(cdnBase));
        const run = { proof, movedTaskX: moved, changes, violations, consoleLines, failed, cdnRequests: assets };
        evidence.runs[name] = run;
        assert.equal(proof.state, "ready");

        assert.equal(proof.state, "ready");
        assert.ok(proof.legendShapes >= 5, `legend look rendered (${proof.legendShapes} shapes)`);
        assert.ok(proof.exports.includes("createBpmnCanvas") && proof.exports.includes("renderDiagrams") && proof.exports.includes("importDiagram") && proof.exports.includes("layoutProcess"), proof.exports.join(","));
        // Without any stylesheet diagram-js cannot edit (its hit areas live in the CSS): that case must be told, not hidden.
        if (broken !== "styles-missing") assert.ok(moved && Number(moved) > 320, `the drag moved the task in the XML (x=${moved})`);
        assert.ok(proof.canvasHeight > 100, "the canvas is not collapsed");
        if (broken) {
          // A problem with the assets is told in the canvas, not left as a blank or iconless canvas.
          assert.ok(proof.diagnostics.includes(broken), `diagnostic ${broken}: ${JSON.stringify(proof.diagnostics)}`);
          assert.equal(proof.noticeVisible, true, "the notice is visible in the canvas");
          assert.match(proof.notice, /BPMN canvas: /);
          return;
        }
        assert.deepEqual(proof.diagnostics, [], "no diagnostic on a healthy page");
        assert.equal(proof.notice, null);
        assert.equal(proof.fontReady, true, "the bpmn font loaded from the CDN");
        // Injected styles carry absolute URLs; the external stylesheet keeps relative ones, resolved against itself on the CDN.
        if (name.endsWith("-external")) assert.match(proof.glyph, /^url\("\.\/assets\/inline\/inline-\d\d\.svg"\)$/);
        else assert.ok(proof.glyph.startsWith(`url("${cdnBase}/dist/assets/inline/`), `palette glyph from the CDN: ${proof.glyph}`);
        assert.equal(proof.badgeDefaultVisible, true, "watermark visible by default");
        assert.equal(proof.badgeHiddenWithLicense, true, "watermark hidden when a license is named");
        assert.ok(changes.length > 0, "onChange fired");
        assert.ok(assets.some((r) => /bpmn\.woff2(\?|$)/.test(r.name) && r.status === 200), "font file fetched from the CDN");
        assert.ok(assets.some((r) => /\/inline\/inline-\d\d\.svg$/.test(r.name) && r.status === 200), "image file fetched from the CDN");
        assert.deepEqual(failed, [], "no failed request");
        assert.deepEqual(violations, [], "no CSP violation");
        assert.deepEqual(consoleLines, [], "no console error or warning");
        if (name.endsWith("-external")) assert.deepEqual(proof.styleTags, [], "no style tag: the CDN stylesheet only");
        if (name.includes("-csp")) {
          if (!name.endsWith("-external")) assert.ok(proof.styleTags.length > 0 && proof.styleTags.every((n) => n !== "no-nonce"), "every style tag carries the nonce");
          // Negative control: the policy is really enforced (an inline style attribute and a data: image are refused).
          const control = await page.evaluate(async () => {
            const before = window.__violations.length;
            const d = document.createElement("div");
            d.innerHTML = '<span style="color:red">x</span><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">';
            document.body.append(d);
            await new Promise((r) => setTimeout(r, 300));
            return window.__violations.slice(before);
          });
          run.negativeControl = control;
          assert.ok(control.some((v) => /^style-src/.test(v)) && control.some((v) => /^img-src/.test(v)), `CSP enforced: ${JSON.stringify(control)}`);
        }
      });
    }
  } finally {
    writeFileSync(join(evidenceDir, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
    await ctx.close();
    cdn.close();
    app.close();
    rmSync(profile, { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  }
});
