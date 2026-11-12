// Workshop structure against the recorded step-0 structure (test list §7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser as runPage } from "./browser/harness.mjs";
import { fixtureOptions, fixturePolicy } from "./helpers/injected-policy.mjs";

// Browser twin: the page receives the fixture descriptor and policy of the Node twins (window.__fixture).
const runInBrowser = (entry, name, fn) => runPage(entry, name, fn, fixtureOptions);

const root = fileURLToPath(new URL("../", import.meta.url));
const STEP0_TITLES = fixturePolicy.presentation.palette.entries.map((e) => e.title);
const fixture = JSON.parse(readFileSync(new URL("./fixtures/ui/step0-structure.json", import.meta.url), "utf8"));

test("workshop structure with the step-0 contract options", { timeout: 240000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-workshop-structure.mjs", "workshop-structure", (page) => page.evaluate(() => window.structure.run()));

  for (const look of ["annotated", "bpmn"]) {
    await t.test(`${look}: toolbar controls equal to step 0`, () => assert.deepEqual(o[look].controls, fixture.looks[look].controls));
    await t.test(`${look}: Fit, Format and Export menus equal to step 0`, () => assert.deepEqual(o[look].menus, fixture.looks[look].menus));
    await t.test(`${look}: palette = the injected annotated entries, two columns`, () => {
      assert.equal(o[look].palette.length, fixturePolicy.presentation.palette.entries.length);
      assert.deepEqual(o[look].palette.map((p) => [p.entry, p.classes]), fixture.looks[look].palette.map((p) => [p.entry, p.classes]));
      assert.equal(o[look].paletteTwoColumns, true);
      // Titles: the step-0 source titles (its recording in a DOM without layout has none).
      assert.deepEqual(o[look].palette.map((p) => p.title), STEP0_TITLES.map((x) => `Create ${x}`));
    });
  }
  await t.test("read-only: every control disabled as in step 0, Export included", () => assert.deepEqual(o.readOnly.controls, fixture.looks.readOnly.controls));
  await t.test("no notice after an export whose fidelity is empty", () => assert.deepEqual(o.noticeAfterExport, { downloads: ["diagram.drawio"], notices: 0 }));
  await t.test("(kept) no colour entry in the palette or the context pad", () => {
    assert.equal(o.contextPadShown, true);
    assert.deepEqual(o.colourEntries, []);
  });
  await t.test("defaults without the new options: 0.3 toolbar kept, Export items now end with 'Sparx'", () => {
    assert.deepEqual({ ...o.defaults, exportItems: undefined }, { zoom: true, import: true, svgChevrons: true, autoLayoutIcon: true, exportItems: undefined });
    assert.equal(o.defaults.exportItems.at(-1), "Sparx");
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
