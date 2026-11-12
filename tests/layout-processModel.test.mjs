import { test, before } from "node:test";
import assert from "node:assert/strict";

import { installMiniDomParser } from "./layout-mini-dom.mjs";
import { normalize, parseProcesses } from "../dist/internal/processModel.js";
import { fixturePolicy } from "./helpers/injected-policy.mjs";

before(installMiniDomParser);

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">
  <bpmn:collaboration id="C">
    <bpmn:participant id="P" processRef="Proc"/>
    <bpmn:textAnnotation id="AppNote"><bpmn:text>[Component] CRM</bpmn:text></bpmn:textAnnotation>
    <bpmn:textAnnotation id="DocNote"><bpmn:text>[Reference] Invoice</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="A1" sourceRef="AppNote" targetRef="T1"/>
    <bpmn:association id="A2" sourceRef="DocNote" targetRef="T1"/>
  </bpmn:collaboration>
  <bpmn:process id="Proc" name="Order">
    <bpmn:laneSet id="LS">
      <bpmn:lane id="La" name="Sales"><bpmn:flowNodeRef>S</bpmn:flowNodeRef><bpmn:flowNodeRef>T1</bpmn:flowNodeRef><bpmn:flowNodeRef>G</bpmn:flowNodeRef></bpmn:lane>
      <bpmn:lane id="Lb" name="Ops"><bpmn:flowNodeRef>T2</bpmn:flowNodeRef><bpmn:flowNodeRef>E</bpmn:flowNodeRef></bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="S" name="Start"/>
    <bpmn:task id="T1" name="Enter order">
      <bpmn:dataInputAssociation id="DIA"><bpmn:sourceRef>DO1</bpmn:sourceRef></bpmn:dataInputAssociation>
    </bpmn:task>
    <bpmn:exclusiveGateway id="G" name="OK?"/>
    <bpmn:parallelGateway id="PG"/>
    <bpmn:task id="T2" name="Ship"/>
    <bpmn:endEvent id="E" name="Done"/>
    <bpmn:dataObjectReference id="DO1" name="Order form"/>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T1"/>
    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="G"/>
    <bpmn:sequenceFlow id="F3" sourceRef="G" targetRef="T2" name="yes"/>
    <bpmn:sequenceFlow id="F4" sourceRef="T2" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`;

test("parseProcesses reads lanes, node types, connections, annotations and data items", () => {
  const [parsed] = parseProcesses(XML, fixturePolicy);
  assert.equal(parsed.id, "Proc");
  const { proc } = parsed;
  assert.equal(proc.name, "Order");
  assert.deepEqual(proc.lanes.map((l) => l.name), ["Sales", "Ops"]);
  const types = Object.fromEntries(proc.lanes.flatMap((l) => l.nodes).map((n) => [n.label, n.type]));
  assert.equal(types.S, "start");
  assert.equal(types.T1, "task");
  assert.equal(types.G, "gateway");
  assert.equal(types.E, "end");
  assert.equal(types.DO1, "object-in", "data object read by an activity becomes a task input");
  assert.equal(types.DocNote, "document");
  assert.equal(types.AppNote, undefined, "[Component] annotations are folded into app_label, not nodes");
  const t1 = proc.lanes.flatMap((l) => l.nodes).find((n) => n.label === "T1");
  assert.equal(t1.application, "CRM");
  assert.equal(t1.text, "Enter order");
  const gateway = proc.lanes.flatMap((l) => l.nodes).find((n) => n.label === "G");
  assert.equal(gateway.subtype, "OR");
  const pg = proc.lanes.flatMap((l) => l.nodes).find((n) => n.label === "PG");
  assert.equal(pg.subtype, "AND");
  // lane membership: flowNodeRef, items follow their activity, a node in no lane goes to the first lane
  assert.deepEqual(proc.lanes[0].nodes.map((n) => n.label).sort(), ["DO1", "DocNote", "G", "PG", "S", "T1"]);
  assert.deepEqual(proc.lanes[1].nodes.map((n) => n.label).sort(), ["E", "T2"]);
  const kinds = proc.connections.map((c) => `${c.source}>${c.target}:${c.kind}`).sort();
  assert.deepEqual(kinds, ["DO1>T1:data", "DocNote>T1:document", "G>T2:sequence", "S>T1:sequence", "T1>G:sequence", "T2>E:sequence"]);
  assert.equal(proc.connections.find((c) => c.source === "G").label, "yes");
  const item = proc.lanes[0].nodes.find((n) => n.label === "DO1");
  assert.equal(item._task, "T1");
  assert.equal(item._dir, "in");
});

test("a process without lanes gets one default lane, and a document without process parses to nothing", () => {
  const [p] = parseProcesses('<bpmn:definitions xmlns:bpmn="x"><bpmn:process id="Q"><bpmn:task id="T" name="t"/></bpmn:process></bpmn:definitions>');
  assert.equal(p.proc.lanes.length, 1);
  assert.equal(p.proc.lanes[0].name, "Lane 1");
  assert.deepEqual(parseProcesses('<bpmn:definitions xmlns:bpmn="x"/>'), []);
});

test("normalize classifies connection kinds and artifact direction", () => {
  const proc = {
    lanes: [{ nodes: [
      { type: "task", label: "A" },
      { type: "object-in", label: "D1" },
      { type: "object-in", label: "D2" },
      { type: "document", label: "Doc" },
    ] }],
    connections: [
      { source: "D1", target: "A" },
      { source: "A", target: "D2" },
      { source: "Doc", target: "A" },
    ],
  };
  normalize(proc);
  const n = Object.fromEntries(proc.lanes[0].nodes.map((x) => [x.label, x]));
  assert.deepEqual(proc.connections.map((c) => c.kind), ["data", "data", "document"]);
  assert.equal(n.D1.type, "object-in");
  assert.equal(n.D1._dir, "in");
  assert.equal(n.D2.type, "object-out");
  assert.equal(n.D2._dir, "out");
  assert.equal(n.Doc._dir, "doc");
  assert.equal(n.D1._task, "A");
});

test("parseProcesses throws a clear error when no DOM is available", () => {
  const saved = globalThis.DOMParser;
  delete globalThis.DOMParser;
  try {
    assert.throws(() => parseProcesses("<a/>"), /needs a DOM/);
  } finally {
    globalThis.DOMParser = saved;
  }
});
