import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";
import { fixture } from "./helpers/semantic.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
test("workshop: current model local exports", { timeout: 240000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-workshop-export.mjs", "workshop-local", (page) => page.evaluate(() => window.exportsPage.local()));
  await t.test("three formats enabled; stale served files do not supply bytes", () => {
    assert.deepEqual(o.menu, { BPMN: false, Drawio: false, Sparx: false });
    assert.equal(o.drawio, fixture("C1", "expected.drawio"));
    assert.equal(o.sparx, fixture("C1", "expected.sparx.xml"));
  });
  await t.test("current edits and undo determine output", () => {
    assert.match(o.edit, /Current shipment/); assert.equal(o.undo, o.drawio);
  });
  await t.test("typed refusal yields alert without file; BPMN preserves unsupported model", () => {
    assert.equal(o.refused, null); assert.equal(o.notices[0].role, "alert");
    assert.match(o.notices[0].text, /Export failed:/); assert.match(o.bpmn, /inclusiveGateway/);
  });
  await t.test("no console errors", () => assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []));
});
