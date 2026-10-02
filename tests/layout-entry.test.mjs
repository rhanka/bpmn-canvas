import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const layout = await import(root + "dist/layout/index.js");

const input = {
  name: "Request",
  lanes: [
    { name: "Requester", nodes: [{ type: "START", label: "Need" }, { type: "TASK", label: "Fill form" }] },
    { name: "Approver", nodes: [{ type: "GATEWAY", label: "Valid?" }, { type: "TASK", label: "Approve", app_label: "CRM" }, { type: "END", label: "Done" }] },
  ],
  connections: [
    { source: "Need", target: "Fill form" },
    { source: "Fill form", target: "Valid?", label: "submit" },
    { source: "Valid?", target: "Approve", label: "yes" },
    { source: "Approve", target: "Done" },
  ],
};

test("the layout entry is importable and runs in Node without any DOM", async () => {
  assert.equal(typeof document, "undefined");
  assert.deepEqual(Object.keys(layout).sort(), ["layoutProcess", "parseProcesses", "textWidth", "wrapText"]);
  const lay = await layout.layoutProcess(input);
  assert.deepEqual(Object.keys(lay).sort(), ["apps", "connections", "edges", "edgeLabels", "labels", "lanes", "nodes", "pool"].sort());
  assert.equal(Object.keys(lay.nodes).length, 5);
  assert.equal(lay.lanes.length, 2);
  assert.equal(lay.edges.length, 4);
});

test("the layout is deterministic and every node sits inside its lane and the pool", async () => {
  const a = await layout.layoutProcess(input);
  const b = await layout.layoutProcess(structuredClone(input));
  assert.deepEqual(a, b);
  const inside = (box, outer) => box.x >= outer.x && box.y >= outer.y && box.x + box.w <= outer.x + outer.w && box.y + box.h <= outer.y + outer.h;
  const laneOf = { Need: 0, "Fill form": 0, "Valid?": 1, Approve: 1, Done: 1 };
  for (const [id, box] of Object.entries(a.nodes)) {
    assert.ok(inside(box, a.pool), `${id} inside the pool`);
    assert.ok(inside(box, a.lanes[laneOf[id]][1]), `${id} inside its lane`);
  }
});

test("both column strategies give a left-to-right flow", async () => {
  for (const columns of ["bpmn-io", "longest-path"]) {
    const lay = await layout.layoutProcess(input, { columns });
    const x = (id) => lay.nodes[id].x;
    assert.ok(x("Need") < x("Fill form") && x("Fill form") < x("Valid?") && x("Valid?") < x("Approve") && x("Approve") < x("Done"), columns);
  }
});

test("text metrics: Helvetica widths and wrapping", () => {
  assert.ok(layout.textWidth("Approve", 12) > 0);
  assert.ok(layout.textWidth("Approve", 12, true) > layout.textWidth("Approve", 12));
  const lines = layout.wrapText("a long label that must wrap onto several lines", 12, 60);
  assert.ok(lines.length > 1);
});

test("an empty process is laid out without throwing", async () => {
  const lay = await layout.layoutProcess({ name: "Empty", lanes: [], connections: [] });
  assert.deepEqual(lay.nodes, {});
});
