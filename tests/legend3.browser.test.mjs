import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("legend tokens, data IO lifecycle and hit outlines in a real browser", { timeout: 180000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-legend3.mjs", "legend3", (page) => page.evaluate(() => window.runLegend3()));
  if (process.env.LEGEND3_DUMP) console.log(JSON.stringify(o, null, 1));

  await t.test("[Doc] association: the defaults (reference look) draw it red, dashed 5 5, like the plain link", () => {
    assert.deepEqual(o.neutral.doc, { stroke: "#b85450", dash: "5 5" });
    assert.deepEqual(o.neutral.note, { stroke: "#b85450", dash: "5 5" });
    assert.deepEqual(o.neutral.warnings, []);
  });
  await t.test("docLink and docLinkDash colour only the associations to a [Doc]", () => {
    assert.deepEqual(o.given.doc, { stroke: "#b85450", dash: "3 4" });
    assert.deepEqual(o.given.note, { stroke: "#112233", dash: "5 5" });
  });
  await t.test("a directional association to a [Doc] is drawn the same way (no arrow); to a plain note it stays upstream's", () => {
    assert.deepEqual(o.given.directional, { stroke: "#b85450", dash: "3 4" });
    assert.equal(o.neutral.directional.note, null, "upstream draws it");
  });
  await t.test("dataLinkArrow: no arrow head by default (reference look), the BPMN arrow when the host turns it on", () => {
    assert.equal(o.arrow.neutral, false);
    assert.equal(o.arrow.on, true);
  });
  await t.test("labelText colours external labels; without it they keep the upstream colour", () => {
    assert.equal(o.labels.neutral, "#22242a");
    assert.equal(o.labels.named, "#445566");
  });
  await t.test("without docLink the [Doc] association follows the host's link", () => {
    assert.deepEqual(o.followed.doc, { stroke: "#112233", dash: "5 5" });
  });
  await t.test("laneHeaderFill paints the lane header; a host naming laneFill alone gets it on the header; default white", () => {
    assert.equal(o.given.header, "#fbf9f6");
    assert.equal(o.followed.header, "#aabbcc");
    assert.equal(o.neutral.header, "#ffffff");
  });

  await t.test("DataInput/DataOutput: create writes ioSpecification with both sets", () => {
    assert.deepEqual([o.io.before.dataInput, o.io.before.ioSpecification], [0, 0]);
    assert.deepEqual(o.io.parentOk, [true, true]);
    assert.deepEqual(o.io.createdDrawn, [true, true]);
    const c = o.io.created;
    assert.deepEqual([c.ioSpecification, c.dataInput, c.dataOutput, c.inputSet, c.outputSet, c.dataInputRefs, c.dataOutputRefs], [1, 1, 1, 1, 1, 1, 1]);
  });
  await t.test("move keeps the model, delete drops the reference, undo restores it", () => {
    assert.equal(o.io.afterMove.dataInput, 1);
    assert.equal(o.io.afterRemoveInput.dataInput, 0);
    assert.equal(o.io.afterRemoveInput.dataInputRefs, 0);
    assert.equal(o.io.afterUndoRemove.dataInput, 1);
    assert.equal(o.io.afterUndoRemove.dataInputRefs, 1);
  });
  await t.test("undo of the move returns to the created position; undoing everything removes the io specification", () => {
    assert.deepEqual(o.io.moved.x - o.io.afterUndoMove.x, 40);
    assert.deepEqual([o.io.afterUndoAll.dataInput, o.io.afterUndoAll.dataOutput, o.io.afterUndoAll.ioSpecification, o.io.afterUndoAll.inputSet, o.io.afterUndoAll.outputSet], [0, 0, 0, 0, 0], "the document is back to its original shape");
    assert.deepEqual([o.io.afterRedo.dataInput, o.io.afterRedo.dataOutput, o.io.afterRedo.ioSpecification], [1, 1, 1]);
  });

  await t.test("getShapePath follows the drawn shape: circle, diamond, document, rectangle", () => {
    const { S, G, DOC, T } = o.sizes;
    assert.match(o.paths.event, new RegExp(`^M0 ${S.h / 2}a${S.w / 2} ${S.h / 2} 0 1 0 ${S.w} 0a`));
    assert.equal(o.paths.gateway, `M${G.w / 2} 0L${G.w} ${G.h / 2}L${G.w / 2} ${G.h}L0 ${G.h / 2}Z`);
    assert.notEqual(o.paths.doc, `M0 0h${DOC.w}v${DOC.h}h-${DOC.w}Z`, "a document is not its bounding box");
    assert.ok(o.paths.doc.startsWith("M"));
    assert.equal(o.paths.task, `M0 0h${T.w}v${T.h}h-${T.w}Z`);
  });

  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
