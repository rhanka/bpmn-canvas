import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

test("bpmn.io logo: visible by default, hidden only with a named license", { timeout: 180000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-watermark.mjs", "watermark", (page) => page.evaluate(() => window.runWatermark()));

  await t.test("default: the logo is visible, nothing is reported", () => {
    assert.deepEqual(o.default.badge, { present: true, visible: true });
    assert.equal(o.default.emitted, 0);
    assert.equal(o.default.attr, null);
  });
  await t.test("hidden: false keeps it visible", () => {
    assert.deepEqual(o.hiddenFalse.badge, { present: true, visible: true });
  });
  await t.test("hidden with a license: the logo is hidden on that instance", () => {
    assert.equal(o.licensed.badge.present, true, "bpmn-js still creates it");
    assert.equal(o.licensed.badge.visible, false);
    assert.equal(o.licensed.attr, "hidden");
    assert.equal(o.licensed.emitted, 0);
  });
  await t.test("hidden without a license, or with a blank one: refused, the logo stays, a warning is reported", () => {
    for (const name of ["noLicense", "blankLicense"]) {
      assert.deepEqual(o[name].badge, { present: true, visible: true }, name);
      assert.equal(o[name].emitted, 1, `${name}: onDiagnostic`);
      assert.deepEqual(o[name].listed, ["warning"], `${name}: getDiagnostics`);
      assert.equal(o[name].attr, null, name);
    }
  });
  await t.test("React: the prop reaches the canvas (default visible, licensed hidden, refused visible)", () => {
    assert.equal(o.reactDefault.badge.visible, true);
    assert.equal(o.reactLicensed.badge.visible, false);
    assert.equal(o.reactRefused.badge.visible, true);
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
