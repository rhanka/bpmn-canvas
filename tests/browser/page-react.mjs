import { StrictMode, createElement, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { BpmnCanvas } from "../../dist/react/index.js";
import { BpmnToolCard, createBpmnToolkit, toolPartState } from "../../dist/assistant-ui/index.js";

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? null });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = fn(); if (v) return v; } catch {}
    await sleep(25);
  }
  return fn();
};
const mountPoint = () => {
  const el = document.createElement("div");
  el.style.cssText = "width:700px;height:420px";
  document.getElementById("app").appendChild(el);
  return el;
};

window.runReact = async ({ corpus }) => {
  results.length = 0;

  // R1/R2: StrictMode, 50 mount/unmount cycles.
  {
    const el = mountPoint();
    const root = createRoot(el);
    for (let i = 0; i < 50; i++) {
      root.render(createElement(StrictMode, null, createElement(BpmnCanvas, { xml: corpus.ce1 })));
      await sleep(0);
      root.render(null);
      await sleep(0);
    }
    root.render(createElement(StrictMode, null, createElement(BpmnCanvas, { xml: corpus.ce1 })));
    await waitFor(() => el.querySelectorAll(".djs-container").length >= 1);
    await sleep(300);
    check("E5 React StrictMode: exactly one .djs-container after 50 cycles", el.querySelectorAll(".djs-container").length === 1, el.querySelectorAll(".djs-container").length);
    check("E5: exactly one badge", el.querySelectorAll(".bjs-powered-by").length === 1);
    root.render(null);
    await sleep(100);
    check("E5: unmount leaves no container", el.querySelectorAll(".djs-container").length === 0 && el.querySelectorAll("[data-bpmn-canvas-instance]").length === 0);
    root.unmount();
  }

  // R3: echo of a saved revision keeps undo; xml prop swap replaces the document; readOnly prop.
  {
    const el = mountPoint();
    const root = createRoot(el);
    let handle;
    const states = [];
    let setXmlProp;
    function Host() {
      const [xml, setXml] = useState(corpus.ce5);
      const [rev, setRev] = useState(undefined);
      const [ro, setRo] = useState(false);
      const hRef = useRef(null);
      setXmlProp = { setXml, setRev, setRo };
      const onChange = useCallback(async (c) => {
        if (c.cause === "diagram-switch") return;
        const saved = await hRef.current.getXml();
        setXml(saved);
        setRev(c.revision);
      }, []);
      return createElement(BpmnCanvas, { xml, revision: rev, readOnly: ro, onChange, onReady: (h) => { handle = h; hRef.current = h; }, onStateChange: (s) => states.push(s) });
    }
    root.render(createElement(StrictMode, null, createElement(Host)));
    await waitFor(() => handle && handle.state === "ready");
    check("React: reaches ready", handle.state === "ready", handle.state);
    const m = handle.modeler;
    m.get("modeling").updateProperties(m.get("elementRegistry").get("TS"), { name: "R-EDIT" });
    await sleep(400);
    check("React echo: host round trip with revision keeps the undo stack", handle.canUndo() === true);
    check("React echo: still the same document content", (await handle.getXml()).includes('name="R-EDIT"'));
    setXmlProp.setRo(true);
    await sleep(100);
    check("React readOnly prop applies to the handle", handle.isReadOnly() && handle.getReadOnlyReason() === "host");
    setXmlProp.setRo(false);
    setXmlProp.setRev(undefined);
    setXmlProp.setXml(corpus.ce1);
    await waitFor(() => handle.getDiagrams().some((d) => d.id === "DA"));
    check("React xml prop change calls setXml and replaces the document", handle.getDiagrams().map((d) => d.id).join() === "DA,DB", handle.getDiagrams().map((d) => d.id));
    root.unmount();
    await sleep(100);
    check("React unmount destroys the handle", handle.state === "destroyed");
  }

  // Creation-time option change recreates exactly one canvas.
  {
    const el = mountPoint();
    const root = createRoot(el);
    root.render(createElement(BpmnCanvas, { xml: corpus.ce4, profile: "standard" }));
    await waitFor(() => el.querySelectorAll(".djs-container").length === 1);
    root.render(createElement(BpmnCanvas, { xml: corpus.ce4, profile: "legend" }));
    await sleep(600);
    check("React profile change recreates a single canvas", el.querySelectorAll(".djs-container").length === 1, el.querySelectorAll(".djs-container").length);
    root.unmount();
  }

  // assistant-ui adapter.
  {
    check("toolPartState: running/failed/complete mapping", toolPartState({ toolCallId: "a", toolName: "t" }) === "running"
      && toolPartState({ toolCallId: "a", toolName: "t", result: {}, isPreliminary: true }) === "running"
      && toolPartState({ toolCallId: "a", toolName: "t", isError: true, result: {} }) === "failed"
      && toolPartState({ toolCallId: "a", toolName: "t", status: { type: "incomplete" } }) === "failed"
      && toolPartState({ toolCallId: "a", toolName: "t", result: {} }) === "complete");

    const toolkit = createBpmnToolkit({ toolNames: ["draw", "other_tool"], resolveArtifact: async () => null });
    check("toolkit: entries are render-only backend, names are injected", Object.keys(toolkit).join() === "draw,other_tool" && toolkit.draw.type === "backend" && typeof toolkit.draw.render === "function" && !("execute" in toolkit.draw));

    const opened = [];
    let resolveCalls = 0;
    const resolveArtifact = async (part) => {
      resolveCalls++;
      return { documentId: part.toolCallId, revision: "1", xml: corpus.ce4, title: "T-" + part.toolCallId };
    };
    const el = mountPoint();
    const root = createRoot(el);
    const parts = Array.from({ length: 30 }, (_, i) => ({ toolCallId: "p" + i, toolName: "draw", result: { ok: true } }));
    root.render(createElement("div", null, ...parts.map((p) => createElement(BpmnToolCard, { key: p.toolCallId, part: p, resolveArtifact, onOpen: (a) => opened.push(a.documentId) }))));
    await waitFor(() => el.querySelectorAll("img").length === 30, 30000);
    check("E13: 30 completed parts render 30 static previews", el.querySelectorAll("img").length === 30, el.querySelectorAll("img").length);
    check("E13: previews are data: images, no inline SVG and no editable canvas", [...el.querySelectorAll("img")].every((i) => i.src.startsWith("data:image/svg+xml")) && el.querySelectorAll("svg").length === 0 && document.querySelectorAll(".djs-container").length === 0);
    el.querySelector("button").click();
    check("Open calls the host callback only", opened.length === 1 && opened[0] === "p0");
    root.unmount();

    // Running / failed states and no resolution for them.
    resolveCalls = 0;
    const el2 = mountPoint();
    const root2 = createRoot(el2);
    root2.render(createElement("div", null,
      createElement(BpmnToolCard, { part: { toolCallId: "r", toolName: "draw" }, resolveArtifact }),
      createElement(BpmnToolCard, { part: { toolCallId: "f", toolName: "draw", isError: true, result: "boom" }, resolveArtifact }),
      createElement(BpmnToolCard, { part: { toolCallId: "pre", toolName: "draw", result: {}, isPreliminary: true }, resolveArtifact })));
    await sleep(300);
    check("running, failed and preliminary parts never resolve an artifact", resolveCalls === 0, resolveCalls);
    check("running card has a status role, failed card an alert role", !!el2.querySelector('[data-state="running"] [role="status"]') && !!el2.querySelector('[data-state="failed"] [role="alert"]'));
    root2.unmount();

    // Stale resolution is dropped.
    const el3 = mountPoint();
    const root3 = createRoot(el3);
    const slow = (ms, id) => (part, signal) => new Promise((res) => setTimeout(() => res({ documentId: id, revision: "1", xml: corpus.ce4, title: id }), ms));
    const partA = { toolCallId: "same", toolName: "draw", result: { v: 1 } };
    const partB = { toolCallId: "same", toolName: "draw", result: { v: 2 } };
    root3.render(createElement(BpmnToolCard, { part: partA, resolveArtifact: slow(600, "OLD"), onOpen: () => {} }));
    await sleep(50);
    root3.render(createElement(BpmnToolCard, { part: partB, resolveArtifact: slow(100, "NEW"), onOpen: () => {} }));
    await waitFor(() => el3.querySelector("img"));
    await sleep(900);
    check("stale resolution (older result) cannot overwrite the newer one", el3.querySelector("img")?.alt === "NEW", el3.querySelector("img")?.alt);
    root3.unmount();
  }

  return results;
};
window.__ready = true;
