import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createModdle } from "../dist/io/index.js";
import { differences, substitution } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";
import { policyModule } from "./helpers/policy-module.mjs";

const root = new URL("./fixtures/x24-externalization/expectations/", import.meta.url);
const load = path => JSON.parse(readFileSync(new URL(path, root)));
const input = (c, role) => { const a = c.inputArtifacts.find(a => a.role === role); return a?.path ? load(a.path) : a?.json; };
const drawing = await policyModule("src/profiles/{LX-TH-1:ba29297b}/renderer.ts");
const aids = drawing.member("63194f6a821b45846017bf0a64cbceca12ab37ae7e41ba868b0accfb25a06f4c");
const hidden = drawing.module.isHiddenInAnnotated;
const follow = Object.values(drawing.module).find(value => typeof value === "function" && value.$inject?.length === 2);
const layout = (await policyModule("src/internal/layout/autoLayout.ts")).module;
function graphOf(graph) {
  const moddle = createModdle();
  const shapes = graph.elements.map(e => ({ ...e, businessObject: moddle.create(e.type, { id: e.id, ...(e.text !== undefined ? { text: e.text } : {}) }), incoming: [], outgoing: [] }));
  const byId = new Map(shapes.map(e => [e.id, e]));
  const links = graph.associations.map(link => ({ id: link.id, type: "bpmn:Association", waypoints: [], source: byId.get(link.source), target: byId.get(link.target) }));
  for (const link of links) { link.source.outgoing.push(link); link.target.incoming.push(link); byId.set(link.id, link); }
  for (const [id, ends] of Object.entries(graph.hostLinks ?? {})) for (const direction of ["incoming", "outgoing"]) byId.get(id)[direction] = ends[direction].map(id => byId.get(id));
  return { shapes, links, byId };
}
function observe(c, policy) {
  const graph = graphOf(input(c, "graph"));
  if (c.operation === "x24.render.attachment") {
    return { aidsOf: Object.fromEntries(graph.shapes.filter(e => e.type !== "bpmn:TextAnnotation").map(e => [e.id, aids(e, policy).map(a => a.id)])), hidden: [...graph.shapes, ...graph.links].filter(e => hidden(e, policy)).map(e => e.id) };
  }
  if (c.operation === "x24.transactions.follow") {
    const callbacks = new Map();
    const bus = { on: (name, callback) => callbacks.set(name, callback) };
    new follow(bus, { businessPolicy: policy });
    const context = { shapes: c.commandArtifact.json.shapes.map(id => graph.byId.get(id)) };
    callbacks.get(c.commandArtifact.json.name)({ context });
    return { moved: context.shapes.map(e => e.id) };
  }
  const model = input(c, "layout");
  const registry = { get: id => graph.byId.get(id), getAll: () => [...graph.shapes, ...graph.links] };
  const changes = layout.layoutChanges(registry, model.participant, { ...model, lanes: [], labels: {}, connections: [], edges: [], edgeLabels: [] }, [], policy);
  return { changes: changes.filter(change => change.element.type === "bpmn:TextAnnotation" || change.element.type === "bpmn:Association").map(change => ({ ...change, element: change.element.id })) };
}
for (const row of load("manifest.json").cases) {
  const c = load(row.path);
  if (!["x24.render.attachment", "x24.transactions.follow", "x24.transactions.autolayout"].includes(c.operation)) continue;
  test(`${c.caseId} sealed transaction policy`, () => {
    if (c.inputArtifacts.some(a => a.role === "policy-a")) {
      const runs = Object.fromEntries(["a", "b"].map(key => [key, { status: "success", artifacts: { results: observe(c, input(c, `policy-${key}`)) } }]));
      assert.deepEqual(substitution(c, { runs }).failures, [], c.caseId);
    } else assert.deepEqual(differences(observe(c, input(c, "policy")), c.expectedArtifacts.find(a => a.role === "results").json), [], c.caseId);
  });
}
