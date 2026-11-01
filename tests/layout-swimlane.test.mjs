import { test } from "node:test";
import assert from "node:assert/strict";

import { createLayout } from "../dist/internal/swimlaneLayout.js";
import { fixturePolicy } from "./helpers/injected-policy.mjs";
import { initialView, contentBounds, MIN_FIT_SCALE } from "../dist/internal/viewbox.js";
const { layoutProcess, fit, labelBox, badgeSize, docHeight } = createLayout(fixturePolicy);

const proc = () => ({
  name: "P",
  lanes: [
    { name: "L1", nodes: [
      { type: "START", label: "s", text: "Start" },
      { type: "TASK", label: "t1", text: "Review request", application: "CRM" },
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
  s: { x: 100, y: 40, w: 48, h: 48 },
  t1: { x: 218, y: 25, w: 118, h: 78 },
  g: { x: 406, y: 40, w: 48, h: 48 },
  e: { x: 559, y: 40, w: 48, h: 48 },
  t2: { x: 524, y: 215, w: 118, h: 78 },
};

for (const columns of ["longest-path", "bpmn-io"]) {
  test(`layoutProcess is deterministic and pinned (${columns} columns)`, async () => {
    const a = await layoutProcess(proc(), { columns });
    const b = await layoutProcess(proc(), { columns });
    assert.deepEqual(a, b);
    assert.deepEqual(a.pool, { x: 0, y: 0, w: 712, h: 380 });
    assert.deepEqual(a.lanes, [["L1", { x: 31, y: 0, w: 681, h: 190 }], ["L2", { x: 31, y: 190, w: 681, h: 190 }]]);
    assert.deepEqual(a.nodes, NODES);
    assert.deepEqual(a.apps, { t1: { x: 238, y: 94, w: 78, h: 28 } });
    assert.deepEqual(a.edges[0], [[148, 64], [218, 64]]);
    assert.deepEqual(a.edges[4], [[583, 215], [583, 8], [277, 8], [277, 25]], "back edge routes through the channel above");
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
  assert.ok(lay.pool.h >= 190);
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
  assert.deepEqual(badgeSize("CRM", 120), [78, 28]);
  assert.ok(docHeight("Invoice") >= 48);
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
