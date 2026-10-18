// layoutOnLoad (test list §5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("layoutOnLoad: a server document is laid out as part of its load", { timeout: 240000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-load-layout.mjs", "load-layout", (page) => page.evaluate(() => window.loadLayout.run()));

  await t.test("laid out, no undo step, no onChange, getXml() = input bytes", () => {
    assert.ok(o.server.task[0] > 60 && o.server.task[1] > 40, `task ${o.server.task}`);
    assert.deepEqual([o.server.canUndo, o.server.changes, o.server.sameBytes], [false, [], true]);
  });
  await t.test("layoutOnLoad false keeps the DI", () => {
    assert.deepEqual(o.kept, { task: [60, 40], canUndo: false, sameBytes: true });
  });
  await t.test("the second diagram is laid out on its first display only, once", () => {
    assert.deepEqual(o.deferred.before, [60, 40], "not laid out before it is shown");
    assert.ok(o.deferred.after[0] > 60, "laid out when shown");
    assert.equal(o.deferred.runs, 2, "the shown diagram at load + the second one at its first display");
    assert.deepEqual([o.deferred.canUndo, o.deferred.changes, o.deferred.sameBytes], [false, [], true]);
  });
  await t.test("failure: input re-imported, load-layout-failed warning, editable", () => {
    assert.deepEqual(o.failure.result, { applied: true });
    assert.deepEqual(o.failure.diagnostics.filter(([c]) => c === "load-layout-failed"), [["load-layout-failed", "warning"]]);
    assert.deepEqual([o.failure.task, o.failure.sameBytes, o.failure.state, o.failure.canUndo, o.failure.editable], [[60, 40], true, "ready", false, true]);
  });
  await t.test("setXml during the load layout: AbortError, nothing emitted, the queued document applies", () => {
    assert.deepEqual([o.during_setXml.first, o.during_setXml.second, o.during_setXml.changes, o.during_setXml.newDiagnostics], ["AbortError", "resolved", [], []]);
    assert.deepEqual(o.during_setXml.task, [120, 80]);
  });
  await t.test("destroy() during the load layout: AbortError, nothing emitted", () => {
    assert.deepEqual([o.during_destroy.first, o.during_destroy.changes, o.during_destroy.newDiagnostics, o.during_destroy.state], ["AbortError", [], [], "destroyed"]);
  });
  await t.test("echo, profile switch and undo across a switch never lay out", () => {
    assert.deepEqual(o.never, { echoRuns: 0, switchRuns: 0, undone: "Ship order" });
  });
  await t.test("read-only lifted for the load layout and restored, failure included", () => {
    assert.ok(o.readOnly.task[0] > 60);
    assert.deepEqual([o.readOnly.readOnly, o.readOnly.afterFailure], [true, true]);
  });
  await t.test("after an edit, the shown diagram is saved with its laid-out DI", () => {
    assert.ok(o.afterEdit[0] > 60 && o.afterEdit[1] > 40, `${o.afterEdit}`);
  });
  await t.test("workshop: layoutOnLoad prop; a load-layout failure calls onAutoLayoutError", () => {
    assert.ok(o.workshop.width > 60, `${o.workshop.width}`);
    assert.deepEqual(o.workshop.errors, []);
    assert.deepEqual(o.workshop.failureErrors, ["layout broke"]);
    assert.equal(o.workshop.shownAfterFailure, true);
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
