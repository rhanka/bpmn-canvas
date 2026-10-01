import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const r = (p) => readFileSync(root + p, "utf8");
const corpus = {
  ce1: r("experiments/e3/corpus/ce1-homonyms.bpmn"),
  ce4: r("experiments/e3/corpus/ce4-two-pools-message.bpmn"),
  ce5: r("experiments/e3/corpus/ce5-two-diagrams-shared-root.bpmn"),
};

test("react and assistant-ui adapters in a real browser", { timeout: 300000 }, async (t) => {
  const { result, consoleLines, version } = await runInBrowser(root + "tests/browser/page-react.mjs", "react", (page) =>
    page.evaluate((c) => window.runReact(c), { corpus }),
  );
  t.diagnostic(`browser ${version}, ${result.length} checks`);
  for (const c of result) await t.test(c.name, () => assert.ok(c.pass, JSON.stringify(c.detail)));
  await t.test("no console errors or page errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});

test("react entry keeps the use client directive in dist", () => {
  assert.match(r("dist/react/index.js").trimStart(), /^"use client";/);
  assert.match(r("dist/assistant-ui/index.js").trimStart(), /^"use client";/);
});

test("root entry stays importable without a DOM and without react", async () => {
  const mod = await import(root + "dist/index.js");
  assert.equal(typeof mod.createBpmnCanvas, "function");
  assert.equal(typeof mod.renderDiagrams, "function");
  const src = r("dist/index.js") + r("dist/internal/canvas.js") + r("dist/internal/render.js") + r("dist/internal/engine.js");
  assert.ok(!/from\s+["']react/.test(src), "core must not import react");
});
