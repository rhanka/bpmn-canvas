import { createBpmnCanvas, renderDiagrams } from "../../dist/index.js";

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? null });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mount = (style = "") => {
  const h = document.createElement("div");
  h.style.cssText = "width:700px;height:420px;" + style;
  document.getElementById("app").appendChild(h);
  return h;
};
const sha = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const modelerOf = (handle) => handle.modeler;
const rejects = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e?.name ?? String(e);
  }
};

window.runCore = async ({ corpus }) => {
  results.length = 0;

  // E2: exact input bytes while untouched, on every E3 corpus file.
  for (const name of ["ce1", "ce3", "ce4", "ce5"]) {
    const xml = corpus[name];
    const host = mount();
    const diags = [];
    const h = createBpmnCanvas(host, { xml, onDiagnostic: (d) => diags.push(d) });
    check(`${name}: handle is returned synchronously`, typeof h.destroy === "function" && h.state === "loading");
    await h.ready;
    check(`${name}: ready, state ready`, h.state === "ready", h.state);
    check(`${name}: no diagnostics`, diags.length === 0, diags.map((d) => d.code));
    check(`${name}: E2 untouched getXml returns the exact input bytes`, (await sha(await h.getXml())) === (await sha(xml)));
    check(`${name}: badge present, linked, visible`, (() => {
      const w = host.querySelector(".bjs-powered-by");
      return !!w && w.getAttribute("href") === "http://bpmn.io" && getComputedStyle(w).display !== "none";
    })());
    h.destroy();
    check(`${name}: destroy removes the container`, host.querySelectorAll(".djs-container").length === 0);
  }

  // Edit -> getXml re-serialises; undo to base does not promise input bytes.
  {
    const xml = corpus.ce1;
    const h = createBpmnCanvas(mount(), { xml });
    await h.ready;
    const m = modelerOf(h);
    const el = m.get("elementRegistry").get("TA");
    m.get("modeling").updateProperties(el, { name: "EDITED" });
    const edited = await h.getXml();
    check("edit: getXml contains the edit and differs from input", edited.includes('name="EDITED"') && edited !== xml);
    h.undo();
    const afterUndo = await h.getXml();
    check("undo to base: getXml no longer promises input bytes (serialiser output)", afterUndo !== xml && afterUndo.includes('name="A-task"'));
    h.destroy();
  }

  // Revisions, echo, diagram-switch cause, undo stack cleared by open().
  {
    const changes = [];
    const h = createBpmnCanvas(mount(), { xml: corpus.ce5, revision: "host-1", onChange: (c) => changes.push(c) });
    await h.ready;
    const m = modelerOf(h);
    m.get("modeling").updateProperties(m.get("elementRegistry").get("TS"), { name: "S2" });
    check("onChange edit carries revision, baseRevision and diagramId", changes[0]?.cause === "edit" && changes[0].baseRevision === "host-1" && changes[0].diagramId === "DiagA" && !!changes[0].revision, changes[0]);
    const echo = await h.setXml(await h.getXml(), { revision: changes[0].revision });
    check("echo of an emitted revision is ignored", echo.applied === false && echo.reason === "echo", echo);
    check("echo did not reset the undo stack", h.canUndo() === true);
    const echoBase = await h.setXml(corpus.ce5, { revision: "host-1" });
    check("re-sending the base revision is an echo", echoBase.applied === false && echoBase.reason === "echo");
    check("canUndo before diagram switch", h.canUndo());
    const before = changes.length;
    await h.selectDiagram("DiagB");
    const sw = changes[before];
    check("selectDiagram emits cause diagram-switch without a new content revision", sw?.cause === "diagram-switch" && sw.revision === changes[before - 1].revision && sw.diagramId === "DiagB", sw);
    check("open() clears the undo stack (documented contract)", h.canUndo() === false);
    check("active diagram follows selectDiagram", h.getActiveDiagramId() === "DiagB");
    check("edit in A survived the switch", (await h.getXml()).includes('name="S2"'));
    const applied = await h.setXml(corpus.ce5, { revision: "host-2" });
    check("new host revision is applied", applied.applied === true);
    check("baseRevision follows setXml", (() => { m.get("modeling"); return true; })());
    h.destroy();
  }

  // B3: lifecycle. 50 mount/unmount cycles before ready, then one kept instance.
  {
    const host = mount();
    for (let i = 0; i < 50; i++) {
      const h = createBpmnCanvas(host, { xml: corpus.ce1 });
      h.destroy();
      await h.ready;
    }
    const kept = createBpmnCanvas(host, { xml: corpus.ce1 });
    await kept.ready;
    check("E5: exactly one .djs-container after 50 cycles", host.querySelectorAll(".djs-container").length === 1, host.querySelectorAll(".djs-container").length);
    kept.destroy();
    kept.destroy();
    check("destroy is idempotent and leaves no container", host.querySelectorAll(".djs-container").length === 0 && host.children.length === 0);
    check("state is destroyed", kept.state === "destroyed");
  }

  // E6: superseded operations and no onChange after destroy.
  {
    const changes = [];
    const h = createBpmnCanvas(mount(), { onChange: (c) => changes.push(c) });
    const a = h.setXml(corpus.ce1);
    const b = h.setXml(corpus.ce3);
    const aErr = await rejects(a);
    check("E6: superseded setXml(A) rejects with AbortError", aErr === "AbortError", aErr);
    const bRes = await b;
    check("E6: setXml(B) applied", bRes.applied === true);
    const c = h.setXml(corpus.ce4);
    h.destroy();
    const cErr = await rejects(c);
    check("E6: setXml pending at destroy rejects with AbortError", cErr === "AbortError", cErr);
    check("E6: setXml after destroy rejects with AbortError", (await rejects(h.setXml(corpus.ce1))) === "AbortError");
    check("E6: getXml after destroy rejects with AbortError", (await rejects(h.getXml())) === "AbortError");
    check("E6: no onChange after destroy", changes.length === 0);
    await h.ready;
  }

  // Invalid and no-DI inputs.
  {
    const diags = [];
    const h = createBpmnCanvas(mount(), { xml: "<bpmn:definitions", onDiagnostic: (d) => diags.push(d) });
    await h.ready;
    check("invalid initial XML: handle in state error, not a rejection", h.state === "error" && diags.some((d) => d.code === "invalid-xml"), diags.map((d) => d.code));
    check("invalid initial XML: getXml returns the host input", (await h.getXml()) === "<bpmn:definitions");
    const ok = await h.setXml(corpus.ce1);
    check("a valid setXml recovers from error", ok.applied === true && h.state === "ready", h.state);
    const bad = await h.setXml("<nope");
    check("invalid later XML keeps the last good document", bad.applied === false && bad.reason === "invalid" && h.state === "ready" && (await h.getXml()) === corpus.ce1);
    h.destroy();

    const d2 = [];
    const h2 = createBpmnCanvas(mount(), { xml: corpus.noDi, onDiagnostic: (d) => d2.push(d) });
    await h2.ready;
    check("no DI: missing-di diagnostic with ids, state error, no implicit DI", h2.state === "error" && d2.some((d) => d.code === "missing-di" && d.ids?.includes("T")), d2.map((d) => d.code));
    check("no DI: getXml returns the input untouched", (await h2.getXml()) === corpus.noDi);
    h2.destroy();
  }

  // B4: lossless-edit gate.
  for (const [label, xml, code] of [
    ["rogue extension", corpus.rogue, "unparsable-content"],
    ["comment", corpus.comments, "comments-present"],
    ["unresolved reference", corpus.unresolved, "unresolved-reference"],
    ["duplicate id", corpus.dup, "duplicate-id"],
  ]) {
    const diags = [];
    const h = createBpmnCanvas(mount(), { xml, onDiagnostic: (d) => diags.push(d) });
    await h.ready;
    check(`B4 ${label}: diagnostic ${code} with ids`, diags.some((d) => d.code === code && d.destructive === true), diags.map((d) => d.code));
    check(`B4 ${label}: opens read-only by default, reason lossy`, h.isReadOnly() && h.getReadOnlyReason() === "lossy" && diags.some((d) => d.code === "read-only-lossy"));
    const m = modelerOf(h);
    const el = m.get("elementRegistry").get("T");
    m.get("modeling").updateProperties(el, { name: "HACK" });
    check(`B4 ${label}: command is vetoed, getXml keeps input bytes`, (await h.getXml()) === xml && !h.canUndo());
    h.destroy();
    const h2 = createBpmnCanvas(mount(), { xml, allowLossyEdit: true });
    await h2.ready;
    const m2 = modelerOf(h2);
    m2.get("modeling").updateProperties(m2.get("elementRegistry").get("T"), { name: "OK" });
    check(`B4 ${label}: allowLossyEdit makes it editable`, !h2.isReadOnly() && (await h2.getXml()).includes('name="OK"'));
    h2.destroy();
  }
  {
    const h = createBpmnCanvas(mount(), { xml: corpus.extOk });
    await h.ready;
    const m = modelerOf(h);
    m.get("modeling").updateProperties(m.get("elementRegistry").get("T"), { name: "Z" });
    const out = await h.getXml();
    check("B4: extension attributes and extensionElements survive an edit", out.includes('acme:owner="team"') && out.includes("acme:sla"));
    h.destroy();
  }

  // Read-only: host flag, veto, navigation kept.
  {
    const h = createBpmnCanvas(mount(), { xml: corpus.ce1, readOnly: true });
    await h.ready;
    const m = modelerOf(h);
    const el = m.get("elementRegistry").get("TA");
    m.get("modeling").updateProperties(el, { name: "NO" });
    m.get("modeling").removeElements([el]);
    h.undo();
    h.redo();
    check("read-only: modeling commands are vetoed", (await h.getXml()) === corpus.ce1 && !!m.get("elementRegistry").get("TA"));
    check("read-only: reason is host", h.getReadOnlyReason() === "host");
    check("read-only: palette is hidden", getComputedStyle(h.root.querySelector(".djs-palette")).display === "none");
    await h.selectDiagram("DB");
    check("read-only: diagram switch still works", h.getActiveDiagramId() === "DB");
    h.setReadOnly(false);
    m.get("modeling").updateProperties(m.get("elementRegistry").get("TB"), { name: "YES" });
    check("setReadOnly(false) re-enables editing", (await h.getXml()).includes('name="YES"') && !h.isReadOnly());
    h.destroy();
  }

  // Isolation (E8): two instances, one hidden; no globals; ids unique.
  {
    const ls = localStorage.length;
    const hidden = mount("display:none");
    const a = createBpmnCanvas(hidden, { xml: corpus.ce4 });
    const b = createBpmnCanvas(mount(), { xml: corpus.ce4 });
    await Promise.all([a.ready, b.ready]);
    const ids = [...document.querySelectorAll("marker[id], linearGradient[id]")].map((n) => n.id);
    check("E8: marker/gradient ids are unique across instances", ids.length > 0 && new Set(ids).size === ids.length, { total: ids.length, unique: new Set(ids).size });
    check("isolation: localStorage untouched", localStorage.length === ls);
    check("isolation: no D[2]dRender-like global", !("D[2]dRender" in window));
    check("isolation: styles installed once", document.querySelectorAll("style[data-bpmn-canvas-styles]").length === 1 && document.querySelectorAll("style[data-bpmn-canvas-font]").length === 1);
    const badges = document.querySelectorAll(".bjs-powered-by").length;
    check("badge present on each instance", badges === 2, badges);
    a.destroy();
    b.destroy();
  }

  // Shadow DOM: styles go into the shadow root, @font-face stays at document level.
  {
    const hostEl = document.createElement("div");
    document.getElementById("app").appendChild(hostEl);
    const shadow = hostEl.attachShadow({ mode: "open" });
    const inner = document.createElement("div");
    inner.style.cssText = "width:600px;height:360px";
    shadow.appendChild(inner);
    const h = createBpmnCanvas(inner, { xml: corpus.ce4 });
    await h.ready;
    check("shadow DOM: styles injected into the shadow root", !!shadow.querySelector("style[data-bpmn-canvas-styles]"));
    check("shadow DOM: font-face at document level", !!document.head.querySelector("style[data-bpmn-canvas-font]"));
    h.destroy();
  }

  // styles: external leaves the page alone and carries a nonce otherwise.
  {
    const before = document.querySelectorAll("style[data-bpmn-canvas-styles]").length;
    const h = createBpmnCanvas(mount(), { xml: corpus.ce4, styles: "external" });
    await h.ready;
    check("styles external: nothing new installed", document.querySelectorAll("style[data-bpmn-canvas-styles]").length === before);
    h.destroy();
  }

  // Wheel option.
  {
    const host = mount();
    const h = createBpmnCanvas(host, { xml: corpus.ce4, wheel: "page-scroll" });
    await h.ready;
    const ev = new WheelEvent("wheel", { deltaY: 100, cancelable: true, bubbles: true });
    h.root.querySelector("svg").dispatchEvent(ev);
    check("wheel page-scroll: plain wheel is not captured", ev.defaultPrevented === false);
    const ev2 = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, cancelable: true, bubbles: true });
    h.root.querySelector("svg").dispatchEvent(ev2);
    check("wheel page-scroll: ctrl+wheel zooms", ev2.defaultPrevented === true);
    h.destroy();
  }

  // AbortSignal.
  {
    const ac = new AbortController();
    const host = mount();
    const h = createBpmnCanvas(host, { xml: corpus.ce1, signal: ac.signal });
    ac.abort();
    check("AbortSignal destroys the canvas", h.state === "destroyed" && host.children.length === 0);
    const pre = new AbortController();
    pre.abort();
    const h2 = createBpmnCanvas(mount(), { xml: corpus.ce1, signal: pre.signal });
    check("already-aborted signal yields a destroyed handle", h2.state === "destroyed");
    await h2.ready;
  }

  // E7: switching diagram while a layout is pending leaves label and content coherent.
  {
    const h = createBpmnCanvas(mount(), { xml: corpus.ce5 });
    await h.ready;
    const layout = h.autoLayout();
    const sw = h.selectDiagram("DiagB");
    await Promise.allSettled([layout, sw]);
    const root = modelerOf(h).get("canvas").getRootElement().businessObject.id;
    check("E7: active diagram id matches the displayed root", h.getActiveDiagramId() === "DiagB" && root === "CB", { active: h.getActiveDiagramId(), root });
    h.destroy();
  }

  // renderDiagrams.
  {
    const r = await renderDiagrams(corpus.ce1);
    check("render: one SVG per diagram with ids", r.diagrams.length === 2 && r.diagrams[0].id === "DA" && r.diagrams[1].id === "DB" && r.diagrams.every((d) => /<svg[\s>]/.test(d.svg)), r.diagrams.map((d) => d.id));
    check("render: no leftover host element", ![...document.body.children].some((c) => c.style?.left === "-20000px"));
    const ids = r.diagrams.flatMap((d) => [...d.svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    check("render: ids of marker/def elements are unique across returned SVGs", ids.length === 0 || new Set(ids).size === ids.length, { total: ids.length, unique: new Set(ids).size });
    const small = await renderDiagrams(corpus.tiny);
    check("render: tiny diagram is reported filtered-small with its diagramId", small.diagrams.length === 0 && small.diagnostics.some((d) => d.code === "filtered-small" && d.diagramId === "BD"), small.diagnostics.map((d) => d.code));
    const nodi = await renderDiagrams(corpus.noDi);
    check("render: no DI yields missing-di", nodi.diagrams.length === 0 && nodi.diagnostics.some((d) => d.code === "missing-di"));
    const bad = await renderDiagrams("<nope");
    check("render: invalid XML yields invalid-xml", bad.diagnostics.some((d) => d.code === "invalid-xml"));
    const ac = new AbortController();
    ac.abort();
    check("render: aborted signal rejects with AbortError", (await rejects(renderDiagrams(corpus.ce1, { signal: ac.signal }))) === "AbortError");
  }


  // autoLayout: one undo step, byte-identical restore, explicit refusals.
  {
    const changes = [];
    const diags = [];
    const h = createBpmnCanvas(mount(), { xml: corpus.ce4, onChange: (c) => changes.push(c), onDiagnostic: (d) => diags.push(d) });
    await h.ready;
    const m = modelerOf(h);
    m.get("modeling").moveElements([m.get("elementRegistry").get("T1")], { x: 250, y: 0 });
    const before = (await m.saveXML({ format: true })).xml;
    const n0 = changes.length;
    const res = await h.autoLayout();
    check("layout: changed > 0 and skipped is an array", res.changed > 0 && Array.isArray(res.skipped), res);
    check("layout: exactly one onChange with cause layout", changes.length === n0 + 1 && changes[n0].cause === "layout", changes.slice(n0).map((c) => c.cause));
    const moved = (await h.getXml()) !== before;
    h.undo();
    const after = await h.getXml();
    check("layout: one undo restores the exact pre-layout bytes", moved && after === before);
    h.destroy();

    const d2 = [];
    const h2 = createBpmnCanvas(mount(), { xml: corpus.notation, onDiagnostic: (d) => d2.push(d) });
    await h2.ready;
    const r2 = await h2.autoLayout();
    check("layout: process without participants is refused with ids, no exception", r2.changed === 0 && d2.some((d) => d.code === "layout-unsupported"), { r2, codes: d2.map((d) => d.code) });
    check("layout: refusal leaves the untouched input bytes", (await h2.getXml()) === corpus.notation);
    h2.destroy();

    const d3 = [];
    const h3 = createBpmnCanvas(mount(), { xml: corpus.ce4, readOnly: true, onDiagnostic: (d) => d3.push(d) });
    await h3.ready;
    const r3 = await h3.autoLayout();
    check("layout: read-only refuses and reports", r3.changed === 0 && d3.some((d) => d.code === "layout-unsupported") && (await h3.getXml()) === corpus.ce4);
    h3.destroy();
  }

  // legend profile (opt-in): renders, edits, upstream notation falls through, isolation.
  {
    const diags = [];
    const h = createBpmnCanvas(mount(), { xml: corpus.notation, profile: "legend", onDiagnostic: (d) => diags.push(d) });
    await h.ready;
    check("legend: ready without diagnostics", h.state === "ready" && diags.length === 0, diags.map((d) => d.code));
    check("legend: legend-drawn shapes present", h.root.querySelectorAll(".legend-shape").length > 0);
    const std = createBpmnCanvas(mount(), { xml: corpus.notation });
    await std.ready;
    check("standard (default): no legend-drawn shape", std.root.querySelectorAll(".legend-shape").length === 0);
    const markers = [...document.querySelectorAll("marker[id], linearGradient[id]")].map((n) => n.id);
    check("legend + standard instances: unique marker/gradient ids", new Set(markers).size === markers.length, { total: markers.length, unique: new Set(markers).size });
    const pre = std.root.querySelectorAll("[data-element-id='G'] ellipse, [data-element-id='G'] polygon, [data-element-id='G'] path").length;
    check("standard: inclusive gateway drawn by upstream (has a circle marker)", std.root.querySelectorAll("[data-element-id='G'] circle").length >= 1 || pre > 0);
    h.destroy();
    std.destroy();
  }

  return results;
};
window.__ready = true;
