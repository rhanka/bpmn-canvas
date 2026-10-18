import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";
import { config, fixture, io, model, outputs, text } from "./helpers/semantic.mjs";
import { artifactPlacements, associationEndpoints, moveArtifacts } from "./helpers/review-4.mjs";

test("shipped browser IIFE: fourth-review supported placements and endpoint identity", async (t) => {
  await runInBrowser("tests/browser/page-io.mjs", "io-review-4", async (page) => {
    await page.addScriptTag({ path: fileURLToPath(new URL("../dist/browser/bpmn-canvas.iife.min.js", import.meta.url)) });
    for (const [name, ids] of artifactPlacements) await t.test(`Collaboration ${name}: parse and repeated Node/browser bytes equal both goldens`, async () => {
      const m = await model(); moveArtifacts(m, ids);
      const xml = text(await io.export(m.definitions, "bpmn"));
      const actual = await page.evaluate(async ({ xml, config }) => {
        const io = window.BpmnCanvas; io.initializeCodecs(config);
        const { rootElement, warnings } = await io.parseDefinitions(xml), out = {};
        if (warnings.length) throw new Error("Supported placement produced parse warnings");
        for (const format of ["drawio", "sparx"]) {
          out[format] = new TextDecoder().decode(await io.export(rootElement, format));
          if (out[format] !== new TextDecoder().decode(await io.export(rootElement, format))) throw new Error("Browser bytes changed");
        }
        return out;
      }, { xml, config });
      assert.deepEqual(actual, await outputs(m));
      assert.deepEqual(actual, { drawio: fixture("C1", "expected.drawio"), sparx: fixture("C1", "expected.sparx.xml") });
    });
    for (const [name, associationId, field] of associationEndpoints) await t.test(`detached same-ID ${name}: both browser exporters refuse`, async () => {
      const actual = await page.evaluate(async ({ xml, config, associationId, field }) => {
        const io = window.BpmnCanvas; io.initializeCodecs(config);
        const { rootElement, elementsById } = await io.parseDefinitions(xml);
        const association = elementsById[associationId], moddle = io.createModdle();
        association[field] = moddle.create("bpmn:SubProcess", {
          id: association[field].id,
          flowElements: [moddle.create("bpmn:Task", { id: "Detached_nested_task" })],
        });
        const results = [];
        for (const format of ["drawio", "sparx"]) {
          try { await io.export(rootElement, format); results.push({ accepted: true }); }
          catch (e) { results.push({ typed: e instanceof io.IoError, code: e.code, ids: e.ids }); }
        }
        return results;
      }, { xml: fixture("C1"), config, associationId, field });
      assert.deepEqual(actual, Array.from({ length: 2 }, () => ({ typed: true, code: "invalid-semantics", ids: [associationId] })));
    });
    await t.test("ambiguous Collaboration artifact ownership refuses on browser parse", async () => {
      const m = await model(); moveArtifacts(m, ["Doc_Shipping_policy"]);
      m.elementsById.Order_handling_collab.participants.push(m.moddle.create("bpmn:Participant", { id: "Second_pool", processRef: m.elementsById.Order_handling }));
      const actual = await page.evaluate(async (xml) => {
        const io = window.BpmnCanvas;
        try { await io.parseDefinitions(xml); return { accepted: true }; }
        catch (e) { return { typed: e instanceof io.IoError, code: e.code, ids: e.ids }; }
      }, text(await io.export(m.definitions, "bpmn")));
      assert.deepEqual(actual, { typed: true, code: "multiple-participants", ids: ["Order_handling_pool", "Second_pool"] });
    });
  });
});
