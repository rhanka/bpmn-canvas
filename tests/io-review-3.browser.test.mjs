import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";
import { config, fixture, io, model, text } from "./helpers/semantic.mjs";
import { choreographyXml, namespaceCases, splitIo } from "./helpers/review-3.mjs";

test("shipped browser IIFE: third-review refusals and resolved namespaces", async (t) => {
  await runInBrowser("tests/browser/page-io.mjs", "io-review-3", async (page) => {
    await page.addScriptTag({ path: fileURLToPath(new URL("../dist/browser/bpmn-canvas.iife.min.js", import.meta.url)) });
    const refusal = async (xml, code, ids, parseOnly = false) => {
      const actual = await page.evaluate(async ({ xml, config, parseOnly }) => {
        const io = window.BpmnCanvas; io.initializeCodecs(config);
        try {
          const { rootElement, warnings } = await io.parseDefinitions(xml);
          if (parseOnly) return { accepted: true };
          const bpmn = new TextDecoder().decode(await io.export(rootElement, "bpmn"));
          const results = [];
          for (const f of ["drawio", "sparx"]) {
            try { await io.export(rootElement, f); results.push({ accepted: true }); }
            catch (e) { results.push({ code: e.code, ids: e.ids }); }
          }
          return { warnings, bpmn, results };
        } catch (e) { return { code: e.code, ids: e.ids }; }
      }, { xml, config, parseOnly });
      if (parseOnly) assert.deepEqual(actual, { code, ids });
      else {
        assert.deepEqual(actual.warnings, []);
        assert.match(actual.bpmn, /Exchange_page/);
        assert.match(actual.bpmn, /Exchange_message_di/);
        assert.deepEqual(actual.results, [{ code, ids }, { code, ids }]);
      }
    };
    await t.test("mixed choreography page refuses; BPMN preserves it", async () => refusal(await choreographyXml(), "unsupported-element", ["Exchange_page"]));
    for (const direction of ["Input", "Output"]) for (const field of [`optional${direction}Refs`, `whileExecuting${direction}Refs`, "omitted membership"]) await t.test(`${direction} ${field} is invalid`, async () => {
      const m = await model(), { setA, setB, b, membership } = splitIo(m, direction);
      if (field === "omitted membership") setB[membership] = []; else setA[field] = [b];
      await refusal(text(await io.export(m.definitions, "bpmn")), "invalid-semantics", ["Check_order"], true);
    });
    for (const [name, xml] of namespaceCases) await t.test(`${name} retains C1 goldens`, async () => {
      const actual = await page.evaluate(async ({ xml }) => {
        const io = window.BpmnCanvas, parsed = await io.parseDefinitions(xml), out = {};
        for (const f of ["drawio", "sparx"]) out[f] = new TextDecoder().decode(await io.export(parsed.rootElement, f));
        return out;
      }, { xml });
      assert.deepEqual(actual, { drawio: fixture("C1", "expected.drawio"), sparx: fixture("C1", "expected.sparx.xml") });
    });
  });
});
