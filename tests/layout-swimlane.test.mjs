import { test } from "node:test";
import assert from "node:assert/strict";

import { layoutProcess, fit, labelBox, appBoxSizeLayout, docHeight } from "../dist/internal/swimlaneLayout.js";
import { initialView, contentBounds, MIN_FIT_SCALE } from "../dist/internal/viewbox.js";

const proc = () => ({
  name: "P",
  lanes: [
    { name: "L1", nodes: [
      { type: "START", label: "s", text: "Start" },
      { type: "TASK", label: "t1", text: "Review request", app_label: "CRM" },
      { type: "GATEWAY", label: "g", text: "OK?", subtype: "OR" },
      { type: "END", label: "e", text: "Done" },
    ] },
    { name: "L2", nodes: [{ type: "TASK", label: "t2", text: "Fix" }] },
  ],
  connections: [
    { source: "s", target: "t1" },
    { source: "t1", target: "g" },
    { source: "g", target: "e", label: "yes" },
    { source: "g", target: "t2", label: "no" },
    { source: "t2", target: "t1" },
  ],
});

// Regression pins of the current TypeScript output. They pin determinism and geometry;
// they are not a parity claim against the Python original.
const NODES = {
  s: { x: 100, y: 41, w: 50, h: 50 },
  t1: { x: 220, y: 26, w: 120, h: 80 },
  g: { x: 410, y: 41, w: 50, h: 50 },
  e: { x: 565, y: 41, w: 50, h: 50 },
  t2: { x: 530, y: 226, w: 120, h: 80 },
};

for (const columns of ["longest-path", "bpmn-io"]) {
  test(`layoutProcess is deterministic and pinned (${columns} columns)`, async () => {
    const a = await layoutProcess(proc(), { columns });
    const b = await layoutProcess(proc(), { columns });
    assert.deepEqual(a, b);
    assert.deepEqual(a.pool, { x: 0, y: 0, w: 720, h: 400 });
    assert.deepEqual(a.lanes, [["L1", { x: 30, y: 0, w: 690, h: 200 }], ["L2", { x: 30, y: 200, w: 690, h: 200 }]]);
    assert.deepEqual(a.nodes, NODES);
    assert.deepEqual(a.apps, { t1: { x: 240, y: 96, w: 80, h: 30 } });
    assert.deepEqual(a.edges[0], [[150, 66], [220, 66]]);
    assert.deepEqual(a.edges[4], [[590, 226], [590, 8], [280, 8], [280, 26]], "back edge routes through the channel above");
  });
}

test("every node lies inside its lane and every flow has a route and a label box when named", async () => {
  const lay = await layoutProcess(proc(), { columns: "longest-path" });
  const laneOf = { s: 0, t1: 0, g: 0, e: 0, t2: 1 };
  for (const [id, b] of Object.entries(lay.nodes)) {
    const lane = lay.lanes[laneOf[id]][1];
    assert.ok(b.x >= lane.x && b.x + b.w <= lane.x + lane.w, `${id} horizontally in lane`);
    assert.ok(b.y >= lane.y && b.y + b.h <= lane.y + lane.h, `${id} vertically in lane`);
  }
  assert.equal(lay.edges.length, 5);
  assert.ok(lay.edges.every((e) => e.length >= 2));
  assert.equal(lay.edgeLabels.filter(Boolean).length, 2);
  assert.ok(lay.nodes.s.x < lay.nodes.t1.x && lay.nodes.t1.x < lay.nodes.g.x && lay.nodes.g.x < lay.nodes.e.x, "columns follow the flow");
});

test("a lane order or id change does not change the geometry of unrelated nodes", async () => {
  const a = await layoutProcess(proc(), { columns: "longest-path" });
  const p = proc();
  p.lanes[0].nodes.reverse();
  const b = await layoutProcess(p, { columns: "longest-path" });
  assert.deepEqual(b.pool, a.pool);
  assert.equal(Object.keys(b.nodes).length, Object.keys(a.nodes).length);
});

test("an empty process lays out without throwing", async () => {
  const lay = await layoutProcess({ lanes: [], connections: [] }, { columns: "longest-path" });
  assert.deepEqual(lay.nodes, {});
  assert.ok(lay.pool.h >= 200);
});

test("text fitting helpers", () => {
  const [w, h] = fit("Short", 12, { minW: 120, maxW: 200, minH: 80 });
  assert.deepEqual([w, h], [120, 80]);
  const [w2, h2] = fit("A very long label that must wrap onto several lines to fit", 12, { minW: 120, maxW: 200, minH: 80 });
  assert.equal(w2, 200);
  assert.ok(h2 >= 80);
  assert.deepEqual(labelBox("", 11, 100), [0, 0]);
  const [lw, lh] = labelBox("Hello world", 11, 100);
  assert.ok(lw > 4 && lh > 2);
  assert.deepEqual(appBoxSizeLayout("CRM", 120), [80, 30]);
  assert.ok(docHeight("Invoice") >= 50);
});

test("initialView fits a small diagram and anchors a large one", () => {
  const shapes = [
    { type: "bpmn:Participant", x: 0, y: 0, width: 400, height: 200 },
    { type: "bpmn:StartEvent", x: 40, y: 80, width: 36, height: 36 },
  ];
  assert.deepEqual(contentBounds(shapes), { x: 0, y: 0, width: 400, height: 200 });
  assert.equal(contentBounds([]), null);
  const fitView = initialView(shapes, { width: 1000, height: 600 });
  assert.equal(fitView.mode, "fit");
  assert.ok(fitView.scale >= MIN_FIT_SCALE && fitView.scale <= 1);
  const wide = [{ type: "bpmn:Participant", x: 0, y: 0, width: 4000, height: 300 }, ...shapes];
  const anchored = initialView(wide, { width: 800, height: 500 });
  assert.equal(anchored.mode, "anchor");
  assert.equal(initialView(shapes, { width: 0, height: 0 }), null);
});
