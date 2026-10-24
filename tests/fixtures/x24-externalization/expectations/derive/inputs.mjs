// x24 derivation helper (CLI): writes the synthetic BPMN, draw.io and layout-model inputs from the scenes
// of derive/scenes.mjs. String building only. Run from the repository root:
//   node tests/fixtures/x24-externalization/expectations/derive/inputs.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DECODE, LAYOUT_INPUT, LAYOUT_PROCESS, NONACTIVITY, SURFACE, exportScene, factsScene, factsVersionScene } from "./scenes.mjs";

const DIR = "tests/fixtures/x24-externalization/expectations/inputs";
const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const shape = (id, el, b, extra = "") => `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${el}"${extra}><dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/></bpmndi:BPMNShape>`;
const edge = (id, pts) => `      <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">${pts.map(([x, y]) => `<di:waypoint x="${x}" y="${y}"/>`).join("")}</bpmndi:BPMNEdge>`;
const write = (name, text) => writeFileSync(join(DIR, name), text.endsWith("\n") ? text : `${text}\n`);

// ------------------------------------------------------------------ layout inputs
{
  const anns = LAYOUT_INPUT.annotations;
  write("layout-input.bpmn", [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs" targetNamespace="urn:x24:layout">',
    `  <bpmn:process id="${LAYOUT_INPUT.process.id}" name="${LAYOUT_INPUT.process.name}" isExecutable="false">`,
    '    <bpmn:laneSet id="LS1">',
    `      <bpmn:lane id="${LAYOUT_INPUT.lane.id}" name="${LAYOUT_INPUT.lane.name}">`,
    ...["S1", "T1", "G1", "E1"].map((id) => `        <bpmn:flowNodeRef>${id}</bpmn:flowNodeRef>`),
    "      </bpmn:lane>",
    "    </bpmn:laneSet>",
    '    <bpmn:startEvent id="S1" name="In"/>',
    '    <bpmn:task id="T1" name="Review">',
    '      <bpmn:dataInputAssociation id="DIA1">',
    "        <bpmn:sourceRef>D1</bpmn:sourceRef>",
    "      </bpmn:dataInputAssociation>",
    "    </bpmn:task>",
    '    <bpmn:exclusiveGateway id="G1" name="Ok?"/>',
    '    <bpmn:endEvent id="E1" name="Out"/>',
    '    <bpmn:dataObjectReference id="D1" name="Form" dataObjectRef="DO1"/>',
    '    <bpmn:dataObject id="DO1"/>',
    '    <bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="T1"/>',
    '    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="G1"/>',
    '    <bpmn:sequenceFlow id="F3" name="yes" sourceRef="G1" targetRef="E1"/>',
    ...anns.map((a) => `    <bpmn:textAnnotation id="${a.id}"><bpmn:text>${esc(a.text)}</bpmn:text></bpmn:textAnnotation>`),
    ...anns.map((a, i) => `    <bpmn:association id="A${i + 1}" sourceRef="${a.id}" targetRef="T1"/>`),
    "  </bpmn:process>",
    "</bpmn:definitions>",
  ].join("\n"));
  write("layout-nonactivity.bpmn", [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Defs" targetNamespace="urn:x24:layout">',
    '  <bpmn:process id="P1" name="Gate" isExecutable="false">',
    '    <bpmn:laneSet id="LS1">',
    '      <bpmn:lane id="L1" name="Desk">',
    ...["S1", "T1", "G1", "E1"].map((id) => `        <bpmn:flowNodeRef>${id}</bpmn:flowNodeRef>`),
    "      </bpmn:lane>",
    "    </bpmn:laneSet>",
    '    <bpmn:startEvent id="S1" name="In"/>',
    '    <bpmn:task id="T1" name="Review"/>',
    '    <bpmn:exclusiveGateway id="G1" name="Ok?"/>',
    '    <bpmn:endEvent id="E1" name="Out"/>',
    '    <bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="T1"/>',
    '    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="G1"/>',
    '    <bpmn:sequenceFlow id="F3" sourceRef="G1" targetRef="E1"/>',
    `    <bpmn:textAnnotation id="${NONACTIVITY.annotation.id}"><bpmn:text>${esc(NONACTIVITY.annotation.text)}</bpmn:text></bpmn:textAnnotation>`,
    '    <bpmn:association id="A1" sourceRef="N1" targetRef="G1"/>',
    "  </bpmn:process>",
    "</bpmn:definitions>",
  ].join("\n"));
  write("layout-process.json", JSON.stringify({ processes: [{ id: "P1", proc: LAYOUT_PROCESS }] }, null, 2));
}

// ------------------------------------------------------------------ generic scene writer (reference export inputs)
const TAG = { "bpmn:StartEvent": "startEvent", "bpmn:EndEvent": "endEvent", "bpmn:Task": "task", "bpmn:UserTask": "userTask", "bpmn:SubProcess": "subProcess", "bpmn:CallActivity": "callActivity", "bpmn:ExclusiveGateway": "exclusiveGateway", "bpmn:ParallelGateway": "parallelGateway", "bpmn:IntermediateThrowEvent": "intermediateThrowEvent", "bpmn:DataObjectReference": "dataObjectReference", "bpmn:DataObject": "dataObject", "bpmn:SequenceFlow": "sequenceFlow", "bpmn:TextAnnotation": "textAnnotation", "bpmn:Association": "association" };
const factsXml = (f) => (f ? `<bpmn:extensionElements><${f.prefix}:${f.type.toLowerCase()} ${Object.entries(f.props).map(([k, v]) => `${k}="${esc(String(v))}"`).join(" ")}/></bpmn:extensionElements>` : "");
/** BPMN 2.0 XML of a generic scene (derive/scenes.mjs), DI included. */
export function sceneXml(scene) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', `<bpmn:definitions ${NS}${Object.entries(scene.namespaces ?? {}).map(([p, u]) => ` xmlns:${p}="${u}"`).join("")} id="Defs" targetNamespace="urn:x24:export">`];
  const c = scene.collaboration;
  if (c) out.push(`  <bpmn:collaboration id="${c.id}">`, `    <bpmn:participant id="${c.participant.id}" name="${esc(c.participant.name)}" processRef="${c.participant.processRef}"/>`, "  </bpmn:collaboration>");
  const shapes = [];
  const edges = [];
  const diagrams = [];
  for (const p of scene.processes) {
    out.push(`  <bpmn:process id="${p.id}"${p.name ? ` name="${esc(p.name)}"` : ""} isExecutable="false">`);
    if (p.lanes.length) {
      out.push(`    <bpmn:laneSet id="LS_${p.id}">`);
      for (const l of p.lanes) {
        out.push(`      <bpmn:lane id="${l.id}" name="${esc(l.name)}">`, ...l.members.map((m) => `        <bpmn:flowNodeRef>${m}</bpmn:flowNodeRef>`), "      </bpmn:lane>");
        shapes.push([p.id, shape(l.id, l.id, l.box, ' isHorizontal="true"')]);
      }
      out.push("    </bpmn:laneSet>");
    }
    const flows = p.flowElements.filter((e) => e.type === "bpmn:SequenceFlow");
    for (const e of p.flowElements) {
      const tag = TAG[e.type];
      if (e.type === "bpmn:SequenceFlow") {
        out.push(`    <bpmn:sequenceFlow id="${e.id}"${e.name ? ` name="${esc(e.name)}"` : ""} sourceRef="${e.source}" targetRef="${e.target}">${factsXml(e.facts)}</bpmn:sequenceFlow>`);
        edges.push([p.id, edge(e.id, e.points)]);
        continue;
      }
      if (e.type === "bpmn:DataObject") {
        out.push(`    <bpmn:dataObject id="${e.id}"/>`);
        continue;
      }
      const attrs = `id="${e.id}"${e.name !== undefined ? ` name="${esc(e.name)}"` : ""}${e.calledElement ? ` calledElement="${e.calledElement}"` : ""}${e.dataObjectRef ? ` dataObjectRef="${e.dataObjectRef}"` : ""}`;
      const body = [
        factsXml(e.facts),
        ...flows.filter((f) => f.target === e.id).map((f) => `<bpmn:incoming>${f.id}</bpmn:incoming>`),
        ...flows.filter((f) => f.source === e.id).map((f) => `<bpmn:outgoing>${f.id}</bpmn:outgoing>`),
        ...(e.properties ?? []).map((pr) => `<bpmn:property id="${pr.id}" name="${esc(pr.name)}"/>`),
        ...(e.dataInputAssociations ?? []).map((a) => `<bpmn:dataInputAssociation id="${a.id}">${factsXml(a.facts)}<bpmn:sourceRef>${a.source}</bpmn:sourceRef><bpmn:targetRef>${a.target}</bpmn:targetRef></bpmn:dataInputAssociation>`),
      ].join("");
      out.push(`    <bpmn:${tag} ${attrs}>${body}</bpmn:${tag}>`);
      shapes.push([p.id, shape(e.id, e.id, e.box, e.collapsed ? ' isExpanded="false"' : "").replace("</bpmndi:BPMNShape>", e.labelBox ? `<bpmndi:BPMNLabel><dc:Bounds x="${e.labelBox.x}" y="${e.labelBox.y}" width="${e.labelBox.w}" height="${e.labelBox.h}"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>` : "</bpmndi:BPMNShape>")]);
      for (const a of e.dataInputAssociations ?? []) edges.push([p.id, edge(a.id, a.points)]);
    }
    for (const a of p.artifacts) {
      if (a.type === "bpmn:TextAnnotation") {
        out.push(`    <bpmn:textAnnotation id="${a.id}">${factsXml(a.facts)}<bpmn:text>${esc(a.text)}</bpmn:text></bpmn:textAnnotation>`);
        shapes.push([p.id, shape(a.id, a.id, a.box)]);
      } else {
        out.push(`    <bpmn:association id="${a.id}" sourceRef="${a.source}" targetRef="${a.target}">${factsXml(a.facts)}</bpmn:association>`);
        if (a.points) edges.push([p.id, edge(a.id, a.points)]);
      }
    }
    out.push("  </bpmn:process>");
    const owned = c?.participant?.processRef === p.id;
    diagrams.push({ id: `D_${p.id}`, plane: owned ? c.id : p.id, items: [...(owned ? [shape(c.participant.id, c.participant.id, c.participant.box, ' isHorizontal="true"')] : []), ...shapes.filter((s) => s[0] === p.id).map((s) => s[1]), ...edges.filter((x) => x[0] === p.id).map((x) => x[1])] });
  }
  for (const d of diagrams) out.push(`  <bpmndi:BPMNDiagram id="${d.id}">`, `    <bpmndi:BPMNPlane id="Plane_${d.id}" bpmnElement="${d.plane}">`, ...d.items, "    </bpmndi:BPMNPlane>", "  </bpmndi:BPMNDiagram>");
  out.push("</bpmn:definitions>");
  return out.join("\n");
}
write("export-legacy.bpmn", sceneXml(exportScene("L")));
write("export-a.bpmn", sceneXml(exportScene("A")));
write("export-b.bpmn", sceneXml(exportScene("B")));
write("export-facts.bpmn", sceneXml(factsScene("A")));
write("export-facts-b.bpmn", sceneXml(factsScene("B")));
write("export-facts-version-a.bpmn", sceneXml(factsVersionScene("A")));
write("export-facts-version-b.bpmn", sceneXml(factsVersionScene("B")));
// ------------------------------------------------------------------ surface input (static render, preview, workshop)
{
  const s = SURFACE;
  const tag = TAG;
  const incoming = (id) => s.flows.filter((f) => f[2] === id).map((f) => `<bpmn:incoming>${f[0]}</bpmn:incoming>`).join("");
  const outgoing = (id) => s.flows.filter((f) => f[1] === id).map((f) => `<bpmn:outgoing>${f[0]}</bpmn:outgoing>`).join("");
  const box = new Map([...s.nodes, ...s.annotations].map((n) => [n.id, n.box]));
  const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  write("surface.bpmn", [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<bpmn:definitions ${NS} id="Defs" targetNamespace="urn:x24:surface">`,
    '  <bpmn:collaboration id="C1">',
    `    <bpmn:participant id="${s.pool.id}" name="${s.pool.name}" processRef="P1"/>`,
    "  </bpmn:collaboration>",
    '  <bpmn:process id="P1" isExecutable="false">',
    '    <bpmn:laneSet id="LS1">',
    `      <bpmn:lane id="${s.lane.id}" name="${s.lane.name}">`,
    ...s.nodes.map((n) => `        <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`),
    "      </bpmn:lane>",
    "    </bpmn:laneSet>",
    ...s.nodes.map((n) => `    <bpmn:${tag[n.type]} id="${n.id}" name="${esc(n.name)}">${incoming(n.id)}${outgoing(n.id)}</bpmn:${tag[n.type]}>`),
    ...s.flows.map(([id, from, to]) => `    <bpmn:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}"/>`),
    ...s.annotations.map((a) => `    <bpmn:textAnnotation id="${a.id}"><bpmn:text>${esc(a.text)}</bpmn:text></bpmn:textAnnotation>`),
    ...s.annotations.map((a) => `    <bpmn:association id="As_${a.id}" sourceRef="${a.id}" targetRef="${a.host}"/>`),
    "  </bpmn:process>",
    '  <bpmndi:BPMNDiagram id="D1">',
    '    <bpmndi:BPMNPlane id="Plane1" bpmnElement="C1">',
    shape(s.pool.id, s.pool.id, s.pool.box, ' isHorizontal="true"'),
    shape(s.lane.id, s.lane.id, s.lane.box, ' isHorizontal="true"'),
    ...s.nodes.map((n) => shape(n.id, n.id, n.box, n.type === "bpmn:SubProcess" ? ' isExpanded="false"' : "")),
    ...s.annotations.map((a) => shape(a.id, a.id, a.box)),
    ...s.flows.map(([id, from, to]) => {
      const p = box.get(from);
      const q = box.get(to);
      return edge(id, [[p.x + p.w, p.y + p.h / 2], [q.x, q.y + q.h / 2]]);
    }),
    ...s.annotations.map((a) => edge(`As_${a.id}`, [centre(a.box), centre(box.get(a.host))])),
    "    </bpmndi:BPMNPlane>",
    "  </bpmndi:BPMNDiagram>",
    "</bpmn:definitions>",
  ].join("\n"));
}

// ------------------------------------------------------------------ draw.io decoding inputs
function drawioInput(cells) {
  const base = [
    '<mxCell id="0"/>', '<mxCell id="1" parent="0"/>',
    '<mxCell id="pool" value="Intake" style="swimlane;horizontal=0;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="600" height="250" as="geometry"/></mxCell>',
    '<mxCell id="lane" value="Desk" style="swimlane;horizontal=0;" vertex="1" parent="pool"><mxGeometry x="30" y="0" width="570" height="250" as="geometry"/></mxCell>',
    '<mxCell id="task" value="Review" style="shape=mxgraph.bpmn.task;taskMarker=abstract;" vertex="1" parent="lane"><mxGeometry x="170" y="78" width="100" height="80" as="geometry"/></mxCell>',
  ];
  const extra = cells.map((c) => `<mxCell id="${c.id}" value="${esc(c.value)}" style="${c.style}" vertex="1" parent="${c.parent}"><mxGeometry x="${c.box.x}" y="${c.box.y}" width="${c.box.w}" height="${c.box.h}" as="geometry"/></mxCell>`);
  return `<mxfile host="x24"><diagram id="pg1" name="Page 1"><mxGraphModel><root>${[...base, ...extra].join("")}</root></mxGraphModel></diagram></mxfile>`;
}
write("decode-legacy.drawio", drawioInput(DECODE.L));
write("decode-neutral.drawio", drawioInput(DECODE.A));
write("decode-b.drawio", drawioInput(DECODE.B));
console.log("inputs written");
