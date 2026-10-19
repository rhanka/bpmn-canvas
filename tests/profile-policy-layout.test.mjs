import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLayout, layoutProcess } from "../dist/internal/swimlaneLayout.js";
import { differences } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";

const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
const input = (c, role) => {
  const a = c.inputArtifacts.find(a => a.role === role);
  return a.path ? load(a.path) : a.json;
};
for (const row of load("manifest.json").cases) {
  const c = load(row.path);
  if (!["x24.layout.process", "x24.layout.size"].includes(c.operation)) continue;
  test(`${c.caseId} sealed complete layout`, async () => {
    for (const suffix of c.inputArtifacts.some(a => a.role === "policy-a") ? ["a", "b"] : [""]) {
      const policy = input(c, suffix ? `policy-${suffix}` : "policy");
      if (c.operation === "x24.layout.size") {
        const runtime = createLayout(policy);
        const actual = input(c, "vectors").map(v => ({ ...v, result: v.measure === "badge-size" ? runtime.appBoxSizeLayout(v.name, v.hostWidth)
          : v.measure === "badge-min-host-width" ? runtime.appMinHostW(v.name)
          : v.measure === "document-height" ? runtime.docHeight(v.label)
          : v.measure === "label-box" ? runtime.labelBox(v.text, v.size, v.maxWidth, v.bold)
          : runtime.nodeSize({ type: v.kind, label: v.label, application: v.application }, v.kind) }));
        const expected = c.expectedArtifacts.find(a => a.role === (suffix ? `results-${suffix}` : "results")).json;
        assert.deepEqual(differences(actual, expected), [], c.caseId);
        continue;
      }
      const model = input(c, "layout-model");
      const processes = [];
      for (const process of model.processes) {
        const proc = { ...process.proc, lanes: process.proc.lanes.map(lane => ({ ...lane, nodes: lane.nodes.map(n => ({ type: n.kind, label: n.id, text: n.text, application: n.application, subtype: n.subtype, _task: n.attachedTo, _dir: n.direction === "document" ? "doc" : n.direction })) })), connections: process.proc.connections.map(c => ({ ...c, kind: c.kind })) };
        const layout = await layoutProcess(proc, { columns: "longest-path" }, policy);
        const projected = { pool: layout.pool, nodes: layout.nodes, labels: layout.labels, apps: layout.apps,
          lanes: layout.lanes.map(([name, box]) => ({ name, box })),
          edges: layout.connections.map((c, i) => ({ ...c, kind: c.kind, points: layout.edges[i], ...(layout.edgeLabels[i] ? { labelBox: layout.edgeLabels[i] } : {}) })) };
        processes.push({ id: process.id, layout: projected });
      }
      const actual = { processes };
      const expected = c.expectedArtifacts.find(a => a.role === (suffix ? `results-${suffix}` : "results")).json;
      assert.deepEqual(differences(actual, expected), [], c.caseId);
    }
  });
}
