// Bundles a page entry with esbuild and runs it in a real Chromium.
// Uses bundled headless Chromium with a fresh OS-temporary profile for each run.
import { chromium } from "playwright-core";
import { build } from "esbuild";
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

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
    loader: { ".bpmn": "text", ".drawio": "text" },
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
  const profile = mkdtempSync(join(tmpdir(), "b-"));
  // Unix-domain sockets are limited to 107 chars and Chromium nests its IPC
  // sockets under the profile dir: fail fast on a long TMPDIR instead of a
  // cryptic launch failure.
  if (profile.length > 70) throw new Error(`browser profile path too long for Chromium IPC sockets (${profile.length} chars > 70): set TMPDIR to a short path`);
  let context;
  const consoleLines = [];
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: chromium.executablePath(),
      headless: true,
      args: ["--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files"],
    });
    const page = context.pages()[0] ?? (await context.newPage());
    page.on("console", (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
    await page.goto(url);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
    const version = context.browser()?.version() ?? "unknown";
    const result = await fn(page, { consoleLines, version });
    return { result, consoleLines, version };
  } finally {
    try {
      await context?.close();
    } finally {
      rmSync(profile, { recursive: true, force: true });
      rmSync(outdir, { recursive: true, force: true });
    }
  }
}
