import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { startServer } from "./p3/server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("README images are static SVG without script, from the shipped demo diagram", () => {
  for (const name of ["standard", "legend", "colored"]) {
    const svg = readFileSync(join(root, `docs/demo/${name}.svg`), "utf8");
    assert.match(svg, /^(<!--[^>]*-->\s*)?<svg[\s>]/, name);
    assert.ok(!/<script|onload=|onclick=|javascript:/i.test(svg), `${name}: no script`);
    assert.ok(svg.includes("Sub Process - Expanded"), `${name}: draws the sub-process`);
  }
  const bpmn = readFileSync(join(root, "docs/demo/B.1.0.bpmn"), "utf8");
  assert.match(bpmn, /encoding="UTF-8"/);
  assert.ok((bpmn.match(/<semantic:subProcess /g) ?? []).length >= 2, "at least two sub-processes");
});

test("the live demo page loads the diagram and switches looks", { timeout: 180000 }, async () => {
  execFileSync("node", ["scripts/build-demo.mjs"], { cwd: root, stdio: "pipe" });
  const server = await startServer(join(root, "site"));
  const profile = mkdtempSync(join(root, "proofs-profile-"));
  const ctx = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM ?? "/snap/bin/chromium", headless: true });
  const errors = [];
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${server.origin}/index.html`);
    await page.waitForSelector('.djs-element[data-element-id]');
    const count = await page.locator(".djs-element").count();
    assert.ok(count > 30, `diagram drawn (${count} elements)`);
    assert.equal(await page.locator(".legend-shape").count(), 0, "standard look first");
    await page.click('button[data-profile="legend"]');
    await page.waitForSelector(".legend-shape");
    assert.equal(await page.getAttribute('button[data-profile="legend"]', "aria-pressed"), "true");
    await page.click('button[data-profile="colored"]');
    await page.waitForFunction(() => document.querySelectorAll(".legend-shape").length === 0);
    assert.ok((await page.locator(".djs-element").count()) > 30);
    assert.deepEqual(errors, []);
  } finally {
    await ctx.close();
    await server.close();
    rmSync(profile, { recursive: true, force: true });
    rmSync(join(root, "site"), { recursive: true, force: true });
  }
});
