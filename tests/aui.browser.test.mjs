import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const corpus = { ce4: readFileSync(root + "experiments/e3/corpus/ce4-two-pools-message.bpmn", "utf8") };

test("adapter inside a real assistant-ui 0.15.22 runtime", { timeout: 300000 }, async (t) => {
  const { result, consoleLines, version } = await runInBrowser(root + "tests/browser/page-aui.mjs", "aui", (page) =>
    page.evaluate((c) => window.runAui(c), { corpus }),
  );
  t.diagnostic(`browser ${version}, ${result.length} checks`);
  for (const c of result.filter((r) => r.name.startsWith("info:"))) t.diagnostic(`${c.name} ${JSON.stringify(c.detail)}`);
  for (const c of result.filter((r) => !r.name.startsWith("info:"))) await t.test(c.name, () => assert.ok(c.pass, JSON.stringify(c.detail)));
  await t.test("no console errors or page errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
