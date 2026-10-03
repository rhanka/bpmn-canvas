// Bundles a page entry with esbuild and runs it in a real Chromium.
// Default: headless Chromium with a throw-away profile. With CDP_URL set, connects to an
// existing browser and uses ONE task-owned tab that it closes itself (never the browser).
import { chromium } from "playwright-core";
import { build } from "esbuild";
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { startServer } from "../p3/server.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

export async function bundlePage(entry, name) {
  const outdir = join(root, "proofs-profile-build", name);
  const pagedir = join(outdir, "page");
  mkdirSync(pagedir, { recursive: true });
  await build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    outfile: join(pagedir, "page.js"),
    logLevel: "warning",
    absWorkingDir: root,
    loader: { ".bpmn": "text" },
    define: { "process.env.NODE_ENV": '"development"' },
  });
  // dist/internal/styles.js resolves `../assets/...` from its own directory; a bundle one level
  // below the assets reproduces the package layout (page/page.js next to assets/).
  cpSync(join(root, "dist/assets"), join(outdir, "assets"), { recursive: true });
  writeFileSync(join(pagedir, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>${name}</title></head><body><div id="app"></div><script type="module" src="./page.js"></script></body></html>`);
  return { url: pathToFileURL(join(pagedir, "index.html")).href, outdir };
}

export async function runInBrowser(entry, name, fn) {
  const { url, outdir } = await bundlePage(entry, name);
  const cdp = process.env.CDP_URL;
  let context, browser, page, profile, server;
  const consoleLines = [];
  try {
    if (cdp) {
      // A normal Chrome refuses module scripts from file://: serve the page from 127.0.0.1.
      server = await startServer(outdir);
      browser = await chromium.connectOverCDP(cdp);
      context = browser.contexts()[0];
      page = await context.newPage();
    } else {
      profile = mkdtempSync(join(root, "proofs-profile-"));
      context = await chromium.launchPersistentContext(profile, {
        executablePath: process.env.CHROMIUM ?? (existsSync("/snap/bin/chromium") ? "/snap/bin/chromium" : undefined),
        headless: true,
        args: ["--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files"],
      });
      page = context.pages()[0] ?? (await context.newPage());
    }
    page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
    await page.goto(cdp ? `${server.origin}/page/index.html` : url);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    const version = (context.browser() ?? browser)?.version() ?? "unknown";
    const result = await fn(page, { consoleLines, version });
    return { result, consoleLines, version };
  } finally {
    if (cdp) {
      await page?.close(); // only the tab this run created
      await browser?.close(); // CDP: closes Playwright's transport only, not the browser
      await server?.close();
    } else await context?.close();
    if (profile) rmSync(profile, { recursive: true, force: true });
    rmSync(outdir, { recursive: true, force: true });
  }
}
