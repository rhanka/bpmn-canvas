// Active diagram across a new document version, and undo/redo across a profile switch (core and workshop).
import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBpmnCanvas } from "../../dist/index.js";
import { BpmnWorkshop } from "../../dist/react/index.js";
import ce3 from "../../experiments/e3/corpus/ce3-collapsed-subprocess.bpmn";

const NS = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"';
const proc = (p, name, y) => `
  <bpmn:process id="${p}" name="${name}" isExecutable="false">
    <bpmn:startEvent id="${p}_S"/><bpmn:task id="${p}_T" name="Task of ${name}"/><bpmn:endEvent id="${p}_E"/>
    <bpmn:sequenceFlow id="${p}_F1" sourceRef="${p}_S" targetRef="${p}_T"/><bpmn:sequenceFlow id="${p}_F2" sourceRef="${p}_T" targetRef="${p}_E"/>
  </bpmn:process>`;
const dia = (d, p, name) => `
  <bpmndi:BPMNDiagram id="${d}" name="${name}"><bpmndi:BPMNPlane id="${d}_PL" bpmnElement="${p}">
    <bpmndi:BPMNShape id="${p}_dS" bpmnElement="${p}_S"><dc:Bounds x="100" y="122" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="${p}_dT" bpmnElement="${p}_T"><dc:Bounds x="520" y="300" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="${p}_dE" bpmnElement="${p}_E"><dc:Bounds x="160" y="40" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="${p}_dF1" bpmnElement="${p}_F1"><di:waypoint x="136" y="140"/><di:waypoint x="520" y="340"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="${p}_dF2" bpmnElement="${p}_F2"><di:waypoint x="520" y="340"/><di:waypoint x="196" y="58"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`;
export const TWO = (first = "First") => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Defs" targetNamespace="http://example.org/history">${proc("P1", first)}${proc("P2", "Second")}${dia("D1", "P1", first)}${dia("D2", "P2", "Second")}
</bpmn:definitions>`;
// A pool with one lane, elements out of place: the swimlane auto-layout has work to do.
const POOL = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="DefsPool" targetNamespace="http://example.org/history-pool">
  <bpmn:collaboration id="C"><bpmn:participant id="PA" name="Pool" processRef="P1"/></bpmn:collaboration>
  <bpmn:process id="P1" isExecutable="false">
    <bpmn:laneSet id="LS"><bpmn:lane id="L1" name="Lane"><bpmn:flowNodeRef>P1_S</bpmn:flowNodeRef><bpmn:flowNodeRef>P1_T</bpmn:flowNodeRef><bpmn:flowNodeRef>P1_E</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet>
    <bpmn:startEvent id="P1_S"/><bpmn:task id="P1_T" name="Task"/><bpmn:endEvent id="P1_E"/>
    <bpmn:sequenceFlow id="P1_F1" sourceRef="P1_S" targetRef="P1_T"/><bpmn:sequenceFlow id="P1_F2" sourceRef="P1_T" targetRef="P1_E"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="DP"><bpmndi:BPMNPlane id="DP_PL" bpmnElement="C">
    <bpmndi:BPMNShape id="dPA" bpmnElement="PA" isHorizontal="true"><dc:Bounds x="60" y="20" width="800" height="420"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="dL1" bpmnElement="L1" isHorizontal="true"><dc:Bounds x="90" y="20" width="770" height="420"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="P1_dS" bpmnElement="P1_S"><dc:Bounds x="700" y="380" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="P1_dT" bpmnElement="P1_T"><dc:Bounds x="520" y="300" width="120" height="80"/></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="P1_dE" bpmnElement="P1_E"><dc:Bounds x="160" y="40" width="36" height="36"/></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="P1_dF1" bpmnElement="P1_F1"><di:waypoint x="700" y="398"/><di:waypoint x="580" y="380"/></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="P1_dF2" bpmnElement="P1_F2"><di:waypoint x="520" y="340"/><di:waypoint x="196" y="58"/></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
const ONE = TWO().replace(/<bpmndi:BPMNDiagram id="D2"[\s\S]*?<\/bpmndi:BPMNDiagram>/, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mount = (w = 900, h = 520) => {
  const el = document.createElement("div");
  el.style.cssText = `width:${w}px;height:${h}px;position:relative;margin:4px`;
  document.getElementById("app").appendChild(el);
  return el;
};
const shown = (host) => [...host.querySelectorAll(".djs-element[data-element-id]")].map((g) => g.getAttribute("data-element-id")).filter((id) => /^P\d_T$/.test(id));
const taskX = (xml, p) => Number(new RegExp(`id="${p}_dT"[^>]*>\\s*<dc:Bounds x="([\\d.]+)"`).exec(xml)?.[1]);

const nameOf = (h, id) => h.modeler.get("elementRegistry").get(id)?.businessObject?.name;
const rename = (h, id, name) => h.modeler.get("modeling").updateLabel(h.modeler.get("elementRegistry").get(id), name);
const settle = () => new Promise((r) => setTimeout(r, 30));
async function waitChange(log, cause, n) {
  for (let i = 0; i < 200 && log.filter((c) => c === cause).length < n; i++) await sleep(15);
}

window.hist = {
  async extra() {
    const out = {};
    // F1: edits on both sides of a switch; two undos, two redos come back to the second edit.
    {
      const host = mount();
      const log = [];
      const h = createBpmnCanvas(host, { xml: TWO(), onChange: (c) => log.push(c.cause) });
      await h.ready;
      rename(h, "P1_T", "A");
      await h.setProfile("legend");
      rename(h, "P1_T", "B");
      h.undo(); await settle();
      const afterU1 = nameOf(h, "P1_T");
      // The first undo was native and already emitted "undo": the snapshot undo is the second one.
      h.undo(); await waitChange(log, "undo", 2);
      const afterU2 = nameOf(h, "P1_T");
      h.redo(); await waitChange(log, "redo", 1);
      const afterR1 = nameOf(h, "P1_T");
      const canRedoAfterR1 = h.canRedo();
      h.redo(); await waitChange(log, "redo", 2); await settle();
      out.mixed = { afterU1, afterU2, afterR1, canRedoAfterR1, afterR2: nameOf(h, "P1_T"), canRedoEnd: h.canRedo() };
      h.destroy(); host.remove();
    }
    // F1, branch made after a snapshot undo.
    {
      const host = mount();
      const log = [];
      const h = createBpmnCanvas(host, { xml: TWO(), onChange: (c) => log.push(c.cause) });
      await h.ready;
      rename(h, "P1_T", "A1");
      rename(h, "P1_T", "A2");
      await h.setProfile("colored", { taskFill: "#eeeeff" });
      h.undo(); await waitChange(log, "undo", 1);
      const afterSnapshotUndo = nameOf(h, "P1_T");
      rename(h, "P1_T", "C");
      const futureDropped = h.history.future.length === 0;
      h.undo(); await settle();
      h.undo(); await waitChange(log, "undo", 3);
      const back = nameOf(h, "P1_T");
      h.redo(); await waitChange(log, "redo", 1);
      h.redo(); await waitChange(log, "redo", 2); await settle();
      out.branch = { afterSnapshotUndo, futureDropped, back, end: nameOf(h, "P1_T"), canRedo: h.canRedo() };
      h.destroy(); host.remove();
    }
    // F3: a failed save during the capture leaves the old modeler exactly as it was.
    {
      const host = mount();
      const h = createBpmnCanvas(host, { xml: TWO() });
      await h.ready;
      rename(h, "P1_T", "A");
      rename(h, "P1_T", "B");
      const stack = h.modeler.get("commandStack");
      const before = { name: nameOf(h, "P1_T"), idx: stack._stackIdx, canUndo: h.canUndo(), canRedo: h.canRedo(), xml: await h.getXml(), rev: h.lastRevision };
      const real = h.modeler.saveXML.bind(h.modeler);
      let calls = 0;
      h.modeler.saveXML = (...a) => (++calls === 2 ? Promise.reject(new Error("injected save failure")) : real(...a));
      let error = null;
      try { await h.setProfile("legend"); } catch (e) { error = String(e.message); }
      h.modeler.saveXML = real;
      out.captureFailure = { error, before: { ...before, xml: undefined }, after: { name: nameOf(h, "P1_T"), idx: stack._stackIdx, canUndo: h.canUndo(), canRedo: h.canRedo(), rev: h.lastRevision }, sameXml: (await h.getXml()) === before.xml, sameModeler: h.modeler.get("commandStack") === stack };
      h.destroy(); host.remove();
    }
    // F4: at most 100 snapshots in all, released by destroy.
    {
      const host = mount();
      const h = createBpmnCanvas(host, { xml: TWO() });
      await h.ready;
      for (let i = 1; i <= 205; i++) rename(h, "P1_T", "N" + i);
      for (let i = 0; i < 102; i++) h.undo();
      const current = nameOf(h, "P1_T");
      await h.setProfile("legend");
      out.cap = { current, kept: nameOf(h, "P1_T"), past: h.history.past.length, future: h.history.future.length };
      h.undo();
      await sleep(300);
      out.cap.afterMove = h.history.past.length + h.history.future.length;
      h.destroy();
      out.cap.afterDestroy = h.history.past.length + h.history.future.length;
      host.remove();
    }
    // F5: an undo queued before the lock does not touch the locked document.
    {
      const host = mount();
      const log = [];
      const h = createBpmnCanvas(host, { xml: TWO(), onChange: (c) => log.push(c.revision) });
      await h.ready;
      rename(h, "P1_T", "A");
      await h.setProfile("legend");
      const revs = log.length;
      h.undo();
      h.setReadOnly(true);
      await h.getXml();
      await sleep(200);
      out.readOnlyQueued = { name: nameOf(h, "P1_T"), newRevisions: log.length - revs, past: h.history.past.length };
      h.destroy(); host.remove();
    }
    // F2: the native drill-down into a collapsed sub-process drops the snapshots of the parent diagram.
    {
      const host = mount();
      const histories = [];
      const h = createBpmnCanvas(host, { xml: ce3, onHistoryChange: (x) => histories.push(x) });
      await h.ready;
      rename(h, "Sub_1", "Sub edited");
      await h.setProfile("legend");
      const before = { active: h.getActiveDiagramId(), past: h.history.past.length, canUndo: h.canUndo() };
      window.__drill = { h, before, histories, host };
      out.drillReady = before;
    }
    return out;
  },
  drillAfter() {
    const { h, histories } = window.__drill;
    const r = { active: h.getActiveDiagramId(), past: h.history.past.length, canUndo: h.canUndo(), lastHistory: histories[histories.length - 1] };
    h.destroy();
    window.__drill.host.remove();
    return r;
  },

  TWO: TWO(),
  async core() {
    const out = {};
    // B1: a new version of the document keeps the selected diagram when it still exists.
    const host = mount();
    const h = createBpmnCanvas(host, { xml: TWO() });
    await h.ready;
    await h.selectDiagram("D2");
    await h.setXml(TWO("First updated"));
    await sleep(50);
    out.keep = { active: h.getActiveDiagramId(), shown: shown(host), names: h.getDiagrams().map((d) => d.name) };
    await h.setXml(ONE);
    await sleep(50);
    out.fallback = { active: h.getActiveDiagramId(), shown: shown(host) };
    h.destroy(); host.remove();

    // B4: the undo history survives a profile switch, with redo and a new edit after it.
    const host2 = mount();
    const history = [];
    const changes = [];
    const c = createBpmnCanvas(host2, { xml: POOL, profile: "legend", onHistoryChange: (s) => history.push(s), onChange: (ch) => changes.push(ch.cause) });
    await c.ready;
    const x0 = await c.getXml();
    await c.autoLayout();
    const x1 = await c.getXml();
    out.layoutMoved = taskX(x1, "P1") !== taskX(x0, "P1");
    out.beforeSwitch = { canUndo: c.canUndo(), canRedo: c.canRedo() };
    await c.setProfile("colored", { taskFill: "#eeeeff" });
    out.afterSwitch = { canUndo: c.canUndo(), canRedo: c.canRedo(), legendShapes: host2.querySelectorAll(".legend-shape").length };
    c.undo();
    for (let i = 0; i < 100 && !changes.includes("undo"); i++) await sleep(20);
    const xu = await c.getXml();
    out.afterUndo = { taskX: taskX(xu, "P1"), x0: taskX(x0, "P1"), canUndo: c.canUndo(), canRedo: c.canRedo(), profileKept: host2.querySelectorAll(".legend-shape").length === 0 };
    c.redo();
    for (let i = 0; i < 100 && !changes.includes("redo"); i++) await sleep(20);
    const xr = await c.getXml();
    out.afterRedo = { taskX: taskX(xr, "P1"), x1: taskX(x1, "P1"), canUndo: c.canUndo(), canRedo: c.canRedo() };
    // A second switch keeps the whole history: two steps back reach the original layout.
    await c.setProfile("legend");
    c.undo();
    for (let i = 0; i < 100 && changes.filter((x) => x === "undo").length < 2; i++) await sleep(20);
    out.afterSecondSwitchUndo = { taskX: taskX(await c.getXml(), "P1"), canRedo: c.canRedo() };
    // A new document clears the snapshots.
    await c.setXml(TWO("Fresh"));
    out.afterNewDocument = { canUndo: c.canUndo(), canRedo: c.canRedo() };
    out.lastHistory = history[history.length - 1];
    c.destroy(); host2.remove();
    return out;
  },
  mountWorkshop() {
    const host = mount(1000, 560);
    host.id = "ws";
    const api = {};
    function Harness() {
      const [doc, setDoc] = useState({ xml: TWO(), revision: undefined });
      const [format, setFormat] = useState("custom");
      api.update = (xml) => setDoc({ xml, revision: undefined });
      return createElement(BpmnWorkshop, {
        xml: doc.xml,
        revision: doc.revision,
        formats: [{ id: "custom", label: "Custom", profile: "legend" }, { id: "bpmn", label: "BPMN", profile: "colored", tokens: { taskFill: "#eeeeff" } }],
        format,
        onFormatChange: setFormat,
        onXmlChange: (xml, change) => setDoc({ xml, revision: change.revision }),
        ref: (r) => { api.ref = r; },
      });
    }
    createRoot(host).render(createElement(Harness));
    window.histWs = api;
  },
};
window.__ready = true;
