import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { startServer } from "./p3/server.mjs";

test("neutral native demo completes each sealed step in a browser", { timeout: 120000 }, async () => {
  execFileSync("node", ["scripts/build-demo.mjs"], { stdio: "pipe" });
  const server = await startServer(new URL("../site", import.meta.url).pathname);
  const profile = mkdtempSync(join(tmpdir(), "b-"));
  // Unix-domain sockets are limited to 107 chars and Chromium nests its IPC
  // sockets under the profile dir: fail fast on a long TMPDIR instead of a
  // cryptic launch failure.
  if (profile.length > 70) throw new Error(`browser profile path too long for Chromium IPC sockets (${profile.length} chars > 70): set TMPDIR to a short path`);
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, { executablePath: chromium.executablePath(), headless: true });
    const page = context.pages()[0] ?? (await context.newPage());
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${server.origin}/native.html`);
    for (let step = 1; step <= 12; step++) {
      await page.getByRole("button", { name: "Run next step" }).click();
      await page.getByRole("status").filter({ hasText: `${step} of 12:` }).waitFor();
      if (step === 3) {
        const details = JSON.parse(await page.locator("#details").textContent());
        assert.equal(details.replacementTable.length, 1);
        assert.notEqual(details.replacementTable[0].sourceId, details.replacementTable[0].resultId);
      }
    }
    assert.equal(await page.locator("#download").isVisible(), true);
    const bytes = await page.locator("#download").evaluate(async link => (await fetch(link.href)).text());
    assert.match(bytes, /^<mxfile[ >]/);
    assert.equal(await page.getByRole("button", { name: "Run next step" }).isDisabled(), true);
    assert.deepEqual(errors, []);
  } finally {
    try {
      await context?.close();
    } finally {
      rmSync(profile, { recursive: true, force: true });
      await server.close();
    }
  }
});
