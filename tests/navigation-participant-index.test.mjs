// Witness: the collaboration index keeps every represented participant->Process
// association. A diagram whose plane points at a collaboration shows each
// participant pool; navigation to a called element must find the diagram even
// when another participant precedes the called element's pool, and must skip
// participants without a process reference. RED before the index fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const repo = process.cwd();
const require = createRequire(pathToFileURL(repo + '/package.json'));
const { JSDOM } = require('jsdom');
const dom = new JSDOM();
globalThis.DOMParser = dom.window.DOMParser;
const { documentNavigationIndex } = await import(pathToFileURL(repo + '/dist/internal/navigation-policy.js'));
const { navigationTarget } = await import(pathToFileURL(repo + '/dist/internal/legacy-policy.js'));
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
 xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
 xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Defs" targetNamespace="urn:test">
 <bpmn:process id="P_source" isExecutable="false"><bpmn:callActivity id="Call" calledElement="P_target"/></bpmn:process>
 <bpmn:process id="P_target" isExecutable="false"/>
 <bpmn:collaboration id="C">
  <bpmn:participant id="Pool_black"/>
  <bpmn:participant id="Pool_target" processRef="P_target"/>
 </bpmn:collaboration>
 <bpmndi:BPMNDiagram id="D_source"><bpmndi:BPMNPlane id="Source_plane" bpmnElement="P_source">
  <bpmndi:BPMNShape id="Call_shape" bpmnElement="Call"><dc:Bounds x="200" y="200" width="100" height="80"/></bpmndi:BPMNShape>
 </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
 <bpmndi:BPMNDiagram id="D_target"><bpmndi:BPMNPlane id="Plane" bpmnElement="C">
  <bpmndi:BPMNShape id="Shape_black" bpmnElement="Pool_black" isHorizontal="true"><dc:Bounds x="0" y="0" width="600" height="100"/></bpmndi:BPMNShape>
  <bpmndi:BPMNShape id="Shape_target" bpmnElement="Pool_target" isHorizontal="true"><dc:Bounds x="0" y="150" width="600" height="300"/></bpmndi:BPMNShape>
 </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
test('called element opens its shown view when a bare participant precedes it', async () => {
  const { parseDefinitions } = await import(pathToFileURL(repo + '/dist/io/index.js'));
  await parseDefinitions(xml);
  const index = documentNavigationIndex(xml);
  const result = navigationTarget({click:{calledElement:'P_target', type:'bpmn:CallActivity'}, activeDiagramId:'D_source'}, index);
  assert.deepEqual(result, {kind:'open', diagramId:'D_target'});
});
test('positive control: the same view resolves when its participant comes first', () => {
  const reordered = xml.replace(
    '<bpmn:participant id="Pool_black"/>\n  <bpmn:participant id="Pool_target" processRef="P_target"/>',
    '<bpmn:participant id="Pool_target" processRef="P_target"/>\n  <bpmn:participant id="Pool_black"/>',
  );
  const result = navigationTarget({click:{calledElement:'P_target'}, activeDiagramId:'D_target'}, documentNavigationIndex(reordered));
  assert.deepEqual(result, {kind:'current', diagramId:'D_target'});
});
test('called element keeps its shown view when another pool precedes it', async () => {
  const multiple = xml.replace(
    '<bpmn:process id="P_target" isExecutable="false"/>',
    '<bpmn:process id="P_target" isExecutable="false"/><bpmn:process id="P_other" isExecutable="false"/>',
  ).replace('<bpmn:participant id="Pool_black"/>', '<bpmn:participant id="Pool_black" processRef="P_other"/>');
  const { parseDefinitions } = await import(pathToFileURL(repo + '/dist/io/index.js'));
  await parseDefinitions(multiple);
  const result = navigationTarget({click:{calledElement:'P_target'}, activeDiagramId:'D_target'}, documentNavigationIndex(multiple));
  assert.deepEqual(result, {kind:'current', diagramId:'D_target'});
});
