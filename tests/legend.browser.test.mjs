import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("legend profile in a real browser", { timeout: 120000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-legend.mjs", "legend", (page) => page.evaluate(() => window.runSmoke()));

  await t.test("shapes the legend draws faithfully get the legend look", () => {
    for (const id of ["T1", "GX", "S", "E"]) assert.equal(o.a[id].shapeClass, true, id);
    assert.equal(o.a.GX.xMark, true, "exclusive gateway keeps its X");
  });
  await t.test("upstream notation falls through: no rectangle, no X for these", () => {
    for (const id of ["UT", "GI", "BT", "SM"]) assert.equal(o.a[id].legend, false, `${id} must be drawn by upstream`);
    assert.equal(o.a.GI.xMark, false, "inclusive gateway is not an exclusive X");
    assert.equal(o.a.GI.circles, 1, "inclusive gateway shows its circle marker");
    assert.equal(o.a.BT.circles, 3, "boundary timer keeps its double circle and clock");
  });
  await t.test("a linked [App] annotation is hidden and redrawn under its task", () => {
    assert.equal(o.a.APP.display, "none");
  });
  await t.test("an instance without the profile draws nothing in legend style", () => {
    for (const id of Object.keys(o.plain)) assert.equal(o.plain[id].legend, false, id);
  });
  await t.test("marker and gradient ids are prefixed by instance and unique", () => {
    assert.ok(o.defIds.a.includes("ia-legend-arrow") && o.defIds.a.includes("ia-legend-task-gradient"));
    assert.ok(o.defIds.b.includes("ib-legend-arrow") && o.defIds.b.includes("ib-legend-task-gradient"));
    assert.deepEqual(o.duplicateDocumentIds, []);
  });
  await t.test("the data-IO updater is per instance and creates inputSet and outputSet", () => {
    assert.equal(o.updater.legendInstanceUpdaterClass, "LegendBpmnUpdater");
    assert.equal(o.updater.createInLegend, "ok");
    assert.deepEqual([o.updater.ioSpecification, o.updater.inputSet, o.updater.outputSet, o.updater.dataInputRefInSet], [1, 1, 1, 1]);
    assert.equal(o.updater.dataInputsAfterUndo, 0);
  });
  await t.test("no prototype patch: the instance without the profile keeps the upstream updater", () => {
    assert.equal(o.updater.plainUpdaterClass, "BpmnUpdater");
    assert.match(o.updater.plainInstanceCreate, /no parent for/, "upstream baseline behavior unchanged");
  });
  await t.test("destroying one instance leaves the other drawing", () => {
    assert.equal(o.afterDestroyA.bTaskStillLegend, true);
    assert.ok(o.afterDestroyA.bDefIds.includes("ib-legend-arrow"));
  });
  await t.test("no warnings and no console errors", () => {
    assert.deepEqual([...o.warnings.a, ...o.warnings.b, ...o.warnings.plain], []);
    // The one expected error is the upstream baseline: DataInput creation on the instance without the profile.
    const expected = /no parent for <undefined> in <P>/;
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l) && !expected.test(l)), []);
  });
});
