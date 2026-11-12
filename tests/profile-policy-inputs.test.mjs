import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { parseProcesses } from "../dist/internal/processModel.js";
import { decodeDrawio } from "../dist/io/drawio-decode.js";
import { differences, substitution } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";

const dom = new JSDOM(); globalThis.DOMParser = dom.window.DOMParser;
globalThis.XMLSerializer = dom.window.XMLSerializer;
after(() => { dom.window.close(); delete globalThis.DOMParser; delete globalThis.XMLSerializer; });
const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
function input(c, role) {
  const a = c.inputArtifacts.find(a => a.role === role);
  if (!a) return undefined;
  if (!a.path) return a.json;
  const text = readFileSync(new URL(a.path, root), "utf8");
  return a.path.endsWith(".json") ? JSON.parse(text) : text;
}
async function observe(c, policy) {
  if (c.operation === "x24.import.drawio") {
    try { return JSON.parse(JSON.stringify({ status: "ok", pages: await decodeDrawio(input(c, "drawio"), { businessPolicy: policy }) })); }
    catch (error) { if (!error.code) throw error; return { status: "refused", code: error.code, ids: [...(error.ids ?? [])] }; }
  }
  const parsed = parseProcesses(input(c, "bpmn"), policy);
  return { diagnostics: parsed.flatMap(p => p.proc.diagnostics ?? []), processes: parsed.map(({ id, proc }) => ({ id, name: proc.name,
    lanes: proc.lanes.map(lane => ({ name: lane.name, nodes: lane.nodes.map(n => ({ kind: n.type, id: n.label, text: n.text,
      ...(n.application != null ? { application: n.application } : {}), ...(n.subtype != null ? { subtype: n.subtype } : {}),
      ...(n._task ? { attachedTo: n._task } : {}), ...(n._dir ? { direction: n._dir === "doc" ? "document" : n._dir } : {}) })) })),
    connections: proc.connections.map(({ id, kind, ...rest }) => ({ ...rest, kind: kind })),
  })) };
}
for (const row of load("manifest.json").cases) {
  const c = load(row.path);
  if (!["x24.layout.input", "x24.import.drawio"].includes(c.operation)) continue;
  test(`${c.caseId} sealed input policy`, async () => {
    if (c.inputArtifacts.some(a => a.role === "policy-a")) {
      const runs = {};
      for (const key of ["a", "b"]) runs[key] = { status: "success", artifacts: { results: await observe(c, input(c, `policy-${key}`)) } };
      assert.deepEqual(substitution(c, { runs }).failures, [], c.caseId);
    } else {
      const actual = await observe(c, input(c, "policy"));
      const expected = c.expectedArtifacts.find(a => a.role === (c.expectedStatus === "success" ? "results" : "refusal")).json;
      assert.deepEqual(differences(actual, expected), [], c.caseId);
    }
  });
}
