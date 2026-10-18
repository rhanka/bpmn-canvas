// Workshop export atomicity (test list §8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("workshop: atomic exports", { timeout: 240000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-workshop-export.mjs", "workshop-export", (page) => page.evaluate(() => window.exportsPage.atomicity()));

  await t.test("onDownload(file, context): one capture, every format equal to descriptor-aware export of captured model", () => {
    assert.deepEqual(o.context.keys, ["diagramId", "profile", "revision", "touched", "xml"]);
    assert.equal(o.context.diagramId, o.context.active);
    assert.deepEqual([o.context.profile, o.context.touched, o.context.revisionIsString], ["legend", true, true]);
    assert.deepEqual(o.bytes, { bpmn: true, drawio: true, sparx: true });
  });
  await t.test("a pending direct edit is in the file; a drag in progress refuses the export", () => {
    assert.equal(o.directEdit.inFile, true);
    assert.deepEqual(o.drag, { file: false, notices: 1 });
  });
  await t.test("undo, page or look switch right after the click: file and context consistent", () => {
    for (const k of ["switch_undo", "switch_page", "switch_look"]) assert.deepEqual(o[k], { consistent: true, diagramIsKnown: true }, k);
  });
  await t.test("superseded by a newer document: AbortError → notice, no file; a local import enables local exports", () => {
    assert.deepEqual(o.superseded, { files: 0, notices: 1 });
    assert.deepEqual(o.afterImport, { BPMN: false, Drawio: false, Sparx: false });
  });
  await t.test("refusal: an alert notice 'Export failed: …', no file, BPMN still exportable", () => {
    assert.equal(o.refusal.file, false);
    assert.equal(o.refusal.notices.length, 1);
    assert.equal(o.refusal.notices[0].role, "alert");
    assert.match(o.refusal.notices[0].text, /^Export failed: /);
    assert.equal(o.refusal.bpmn, "diagram.bpmn");
  });
  await t.test("edit → undo → export: touched stays true, the bytes equal the unedited case's expected bytes", () => {
    assert.deepEqual(o.editUndo, { touched: true, equal: true });
  });
  await t.test("resize: whole re-fits (new); readable keeps the view (kept)", () => {
    assert.deepEqual([o.resize_whole.changed, o.resize_readable.changed], [true, false]);
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
