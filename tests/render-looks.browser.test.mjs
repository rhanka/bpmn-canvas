// Rendering in both looks against the recorded step-0 rendering (test list §7b).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInBrowser } from "./browser/harness.mjs";
import { normalizePaint } from "./helpers/normalize-paint.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const step0 = JSON.parse(readFileSync(new URL("./fixtures/ui/step0-render.json", import.meta.url), "utf8")).looks;

// Elements named in the test list, by assertion.
const TASK = "Log_request";
const LONG = "Check_the_incoming_request_against_all_the_applicable_rules_and_record_the_outcome";
const BPMN_LOOK = {
  "task and sub-process: rx 9, stroke 1.4; call activity stroke 3.5": [TASK, LONG, "Resolve_issue", "Escalate"],
  "start 1.5; end 4 with an inner filled circle": ["Request_in", "Request_done"],
  "gateway: diamond 1.4 and the step-0 marker": ["Valid"],
  "[Reference] and [Component]: the open bracket, unfilled, 1.4; [Component] shown": ["Doc_Desk_manual", "App_Log_request", "AppLink_Log_request"],
  "pool and lane: rect 1.4 plus the header line at x = 30": ["Service_desk_pool", "Front_desk", "Back_office"],
  "items and links": ["Request_form", "Ticket", "In_Request_form_Log_request", "Out_Log_request_Ticket", "Flow_Valid__Request_done", "DocLink_Desk_manual_Check_the_incoming_request_against_all_the_applicable_rules_and_record_the_outcome"],
};
const CUSTOM_LOOK = {
  "application box under its activity, [Component] annotation and link hidden": [TASK, "App_Log_request", "AppLink_Log_request"],
  "long label wrapped inside its task": [LONG],
  "end ring, lateral pool header, document page, items without arrows": ["Request_done", "Service_desk_pool", "Front_desk", "Doc_Desk_manual", "Request_form", "In_Request_form_Log_request"],
};

test("rendering in both looks", { timeout: 240000 }, async (t) => {
  const { result: o, consoleLines } = await runInBrowser(root + "tests/browser/page-render-looks.mjs", "render-looks", (page) => page.evaluate(() => window.renderLooks.run()));
  const expected = {};
  for (const look of ["custom", "bpmn"]) {
    expected[look] = Object.fromEntries(Object.entries(step0[look]).map(([id, e]) => [id, normalizePaint(e)]));
    o[look].elements = Object.fromEntries(Object.entries(o[look].elements).map(([id, e]) => [id, normalizePaint(e)]));
  }

  for (const [name, ids] of Object.entries(BPMN_LOOK)) {
    await t.test(`BPMN look (new): ${name}`, () => {
      for (const id of ids) assert.deepEqual(o.bpmn.elements[id], expected.bpmn[id], id);
    });
  }
  await t.test("BPMN look (new): labels inside activities, wrapped, no overflow", () => {
    assert.ok(o.bpmn.overflow.long.length > 0 && o.bpmn.overflow.long.every((x) => x.inside));
  });
  await t.test("BPMN look (new): every element equal to step 0", () => {
    assert.deepEqual(Object.keys(o.bpmn.elements).sort(), Object.keys(step0.bpmn).sort());
    for (const id of Object.keys(step0.bpmn)) assert.deepEqual(o.bpmn.elements[id], expected.bpmn[id], id);
  });
  for (const [name, ids] of Object.entries(CUSTOM_LOOK)) {
    await t.test(`(kept) Custom look: ${name}`, () => {
      for (const id of ids) assert.deepEqual(o.custom.elements[id], expected.custom[id], id);
    });
  }
  await t.test("(kept) Custom look: labels inside, above the application band", () => {
    assert.ok(o.custom.overflow.long.every((x) => x.inside) && o.custom.overflow.app.every((x) => x.inside));
  });
  await t.test("(kept) initial view identical in both looks, the whole diagram visible", () => {
    assert.deepEqual(o.custom.view, o.bpmn.view);
    assert.equal(o.custom.view.contentFits, true);
  });
  await t.test("no console errors", () => {
    assert.deepEqual(consoleLines.filter((l) => /^\[(error|pageerror)\]/.test(l)), []);
  });
});
