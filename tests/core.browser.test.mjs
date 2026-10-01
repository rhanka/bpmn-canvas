import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const r = (p) => readFileSync(root + p, "utf8");
const corpus = {
  ce1: r("experiments/e3/corpus/ce1-homonyms.bpmn"),
  ce3: r("experiments/e3/corpus/ce3-collapsed-subprocess.bpmn"),
  ce4: r("experiments/e3/corpus/ce4-two-pools-message.bpmn"),
  ce5: r("experiments/e3/corpus/ce5-two-diagrams-shared-root.bpmn"),
  noDi: r("tests/fixtures/corpus/no-di.bpmn"),
  rogue: r("tests/fixtures/corpus/rogue-extension.bpmn"),
  comments: r("tests/fixtures/corpus/comments.bpmn"),
  unresolved: r("tests/fixtures/corpus/unresolved-reference.bpmn"),
  dup: r("tests/fixtures/corpus/duplicate-id.bpmn"),
  extOk: r("tests/fixtures/corpus/extension-ok.bpmn"),
  tiny: r("tests/fixtures/corpus/tiny.bpmn"),
  notation: r("tests/fixtures/corpus/notation.bpmn"),
};

test("core in a real browser", { timeout: 240000 }, async (t) => {
  const { result, consoleLines, version } = await runInBrowser(root + "tests/browser/page-core.mjs", "core", (page) =>
    page.evaluate((c) => window.runCore(c), { corpus }),
  );
  t.diagnostic(`browser ${version}, ${result.length} checks`);
  for (const c of result) {
    await t.test(c.name, () => assert.ok(c.pass, JSON.stringify(c.detail)));
  }
  await t.test("no console errors or page errors", () => {
    // bpmn-js logs its own import warning for the deliberately broken unresolved-reference fixture.
    const expected = /failed to import <bpmn:SequenceFlow id="F" \/>/;
    const bad = consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l) && !expected.test(l));
    assert.deepEqual(bad, []);
  });
});
