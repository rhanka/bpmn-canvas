// Regenerates docs/demo/{standard,legend,colored}.svg from docs/demo/B.1.0.bpmn with the static renderer.
// Needs `npm run build` first and a Chromium (CHROMIUM, default /snap/bin/chromium).
import { chromium } from "playwright-core";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { bundlePage } from "../tests/browser/harness.mjs";
import { startServer } from "../tests/p3/server.mjs";
import { DEMO_TOKENS } from "../docs/demo/palette.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const xml = readFileSync(join(root, "docs/demo/B.1.0.bpmn"), "utf8");
const { outdir } = await bundlePage(join(root, "tests/browser/page-demo.mjs"), "demo");
const server = await startServer(outdir);
const profile = mkdtempSync(join(root, "proofs-profile-"));
const ctx = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM ?? (existsSync("/snap/bin/chromium") ? "/snap/bin/chromium" : undefined), headless: true });
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(`${server.origin}/page/index.html`);
  await page.waitForFunction(() => window.__ready === true);
  const cases = { standard: { profile: "standard" }, legend: { profile: "legend" }, colored: { profile: "colored", coloredTokens: DEMO_TOKENS } };
  for (const [name, options] of Object.entries(cases)) {
    const r = await page.evaluate(([x, o]) => window.demo.render(x, o), [xml, options]);
    const svg = r.diagrams[0].svg.replace(/^<\?xml[^>]*>\s*/, "").replace(/<!DOCTYPE[^>]*>\s*/, "");
    writeFileSync(join(root, `docs/demo/${name}.svg`), svg.endsWith("\n") ? svg : svg + "\n");
    console.log(name, svg.length, "bytes,", r.diagnostics.length, "diagnostic(s)");
  }
} finally {
  await ctx.close();
  await server.close();
  rmSync(profile, { recursive: true, force: true });
  rmSync(outdir, { recursive: true, force: true });
}
