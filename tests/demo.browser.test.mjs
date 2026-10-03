import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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

test("the demo app: multi-tab workshop and a chat with a simulated assistant that drives the canvas", { timeout: 240000 }, async () => {
  execFileSync("node", ["scripts/build-demo.mjs"], { cwd: root, stdio: "pipe" });
  const server = await startServer(join(root, "site"));
  const profile = mkdtempSync(join(root, "proofs-profile-"));
  const ctx = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM ?? (existsSync("/snap/bin/chromium") ? "/snap/bin/chromium" : undefined), headless: true, viewport: { width: 1400, height: 900 } });
  const errors = [];
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`${server.origin}/index.html`);
    await page.waitForSelector('.djs-element[data-element-id]');
    const tabs = () => page.$$eval('[role="tab"]', (ts) => ts.map((t) => t.textContent.trim()));
    // First document: four diagrams, one tab each, in the default (Custom) look.
    assert.deepEqual(await tabs(), ["Onboarding employee", "IT", "Payroll", "Facilities"]);
    assert.ok((await page.locator(".legend-shape").count()) > 5, "Custom look by default");
    await page.click('[role="tab"]:has-text("Payroll")');
    await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() === "Payroll");

    // A suggestion: the assistant streams an answer and a tool call; the card previews the draft; Open loads it.
    await page.click('.suggestions button:has-text("new customer")');
    const card = page.locator('[data-bpmn-tool-card][data-state="complete"]').last();
    await card.locator("img").waitFor({ timeout: 30000 });
    await card.locator("button").click();
    await page.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()).join("|") === "Create New Customer|Check for connected clients");

    // A typed message: the assistant arranges the open diagram through the canvas API.
    await page.fill(".composer-input", "Arrange the diagram");
    await page.click(".composer-send");
    await page.waitForFunction(() => /Arranged: \d+ element/.test(document.querySelector(".msg.assistant:last-of-type")?.textContent ?? ""), null, { timeout: 30000 });

    // Look switch through the chat.
    await page.fill(".composer-input", "Switch to the BPMN look");
    await page.click(".composer-send");
    await page.waitForFunction(() => document.querySelectorAll(".legend-shape").length === 0, null, { timeout: 30000 });
    assert.ok((await page.locator(".djs-element").count()) > 30);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(root, "proofs-demo-app.png") }).catch(() => undefined);
    rmSync(join(root, "proofs-demo-app.png"), { force: true });

    // The page bundles third-party code: the site carries the license texts, and the footer links them.
    for (const f of ["LICENSE.txt", "THIRD_PARTY_NOTICES.md", "licenses/index.html", "licenses/bundled-packages.txt", "licenses/bpmn-js.LICENSE", "licenses/bpmn-font.OFL-1.1.txt"]) {
      assert.ok(existsSync(join(root, "site", f)), `site/${f}`);
    }
    assert.match(readFileSync(join(root, "site/licenses/bundled-packages.txt"), "utf8"), /== bpmn-js /);
    const links = await page.$$eval("footer a", (as) => as.map((a) => a.getAttribute("href")));
    for (const must of ["https://creativecommons.org/licenses/by/3.0/", "https://github.com/bpmn-miwg/bpmn-miwg-test-suite/tree/master/Reference", "LICENSE.txt", "THIRD_PARTY_NOTICES.md", "licenses/"]) {
      assert.ok(links.includes(must), `footer links ${must}`);
    }
    assert.match(await page.textContent("footer"), /re-encoded from ISO-8859-1 to UTF-8/);
    for (const rel of links.filter((h) => !/^https?:/.test(h))) {
      const res = await page.request.get(`${server.origin}/${rel === "licenses/" ? "licenses/index.html" : rel}`);
      assert.equal(res.status(), 200, `${rel} served`);
    }
    const listed = await (await page.request.get(`${server.origin}/licenses/index.html`)).text();
    for (const f of readdirSync(join(root, "site/licenses")).filter((f) => f !== "index.html")) assert.ok(listed.includes(`href="${f}"`), `licenses/index.html lists ${f}`);
  } finally {
    await ctx.close();
    await server.close();
    rmSync(profile, { recursive: true, force: true });
    rmSync(join(root, "site"), { recursive: true, force: true });
  }
});
