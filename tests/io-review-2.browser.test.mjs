import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";
import { config, descriptor, fixture, model, outputs } from "./helpers/semantic.mjs";

test("shipped browser IIFE: C1–C7 parity and second-review refusals", async (t) => {
  await runInBrowser("tests/browser/page-io.mjs", "io-review-2", async (page) => {
    await page.addScriptTag({ path: fileURLToPath(new URL("../dist/browser/bpmn-canvas.iife.min.js", import.meta.url)) });
    for (let i = 1; i <= 7; i++) await t.test(`C${i}: repeated Node/browser bytes equal unchanged goldens`, async () => {
      const actual = await page.evaluate(async ({ xml, config }) => {
        const io = window.BpmnCanvas;
        io.initializeCodecs(config);
        const { rootElement } = await io.parseDefinitions(xml);
        const out = {};
        for (const format of ["drawio", "sparx"]) {
          out[format] = new TextDecoder().decode(await io.export(rootElement, format));
          if (out[format] !== new TextDecoder().decode(await io.export(rootElement, format))) throw new Error("Browser bytes changed");
        }
        return out;
      }, { xml: fixture(`C${i}`), config });
      const m = await model(`C${i}`);
      assert.deepEqual(actual, await outputs(m));
      assert.deepEqual(actual, await outputs(m));
      assert.deepEqual(actual, { drawio: fixture(`C${i}`, "expected.drawio"), sparx: fixture(`C${i}`, "expected.sparx.xml") });
    });
    for (const [tag, attr] of [["info", "alias:order"], ["Info", "order"]]) await t.test(`browser rejects alias:${tag} ${attr} malformed lexical order`, async () => {
      const xml = fixture("C1").replace('xmlns:sem=', `xmlns:alias="${descriptor.uri}" xmlns:sem=`)
        .replace(/(<bpmn:dataObjectReference id="Order_form"[\s\S]*?)<sem:info[^>]*\/>/, (_, owner) => `${owner}<alias:${tag} ${attr}="9876junk" laneRef="Sales" direction="in" primaryAssociationRef="In_Order_form_Check_order"/>`);
      const result = await page.evaluate(async (xml) => {
        try { await window.BpmnCanvas.parseDefinitions(xml); return { accepted: true }; }
        catch (e) { return { code: e.code, ids: e.ids }; }
      }, xml);
      assert.deepEqual(result, { code: "invalid-semantics", ids: ["Order_form"] });
    });
  });
});
