// BPMN XML -> layout input. Adapted from an internal TypeScript implementation that
// mirrors an internal Python model (parse a process, normalize connection kinds and
// artifact types, repair attachments on non-activity nodes). Keys are element ids
// (labels may repeat in the editor); `text` carries the displayed name used for sizing.
// Needs a DOM `DOMParser`: it runs in the browser, never at import time.

import { ARTIFACT_TYPES, FLOW_TYPES, type LayoutConnection, type LayoutNode, type LayoutProcessInput } from "./swimlaneLayout.js";

const FLOW_TAG: Record<string, [string, string | null]> = {
  startEvent: ["START", null],
  endEvent: ["END", null],
  task: ["TASK", null],
  subProcess: ["SUB-PROCESS", null],
  callActivity: ["EXTERNAL_PROCESS", null],
  exclusiveGateway: ["GATEWAY", "OR"],
  parallelGateway: ["GATEWAY", "AND"],
  inclusiveGateway: ["GATEWAY", "OR"],
  intermediateThrowEvent: ["EVENT", null],
  intermediateCatchEvent: ["EVENT", null],
};
const ACTIVITY_TAGS = new Set([
  "task", "subProcess", "callActivity", "exclusiveGateway", "parallelGateway", "inclusiveGateway",
  "startEvent", "endEvent", "intermediateThrowEvent", "intermediateCatchEvent",
]);
const ACTIVITY_TYPES = new Set(["TASK", "SUB-PROCESS", "EXTERNAL_PROCESS"]);

type N = LayoutNode & { _pending?: boolean };
const local = (el: Element): string => el.localName;
const kids = (el: Element, name: string): Element[] => [...el.children].filter((c) => local(c) === name);
const tOf = (n: LayoutNode): string => (n.type || "TASK").trim().toUpperCase();

export type ParsedProcess = { id: string; proc: LayoutProcessInput };

/** Every process of a BPMN XML, parsed like the agent's bpmn_xml_to_process_list. */
export function parseProcesses(xml: string): ParsedProcess[] {
  if (typeof DOMParser === "undefined") throw new Error("parseProcesses needs a DOM (DOMParser)");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const roots = [...doc.documentElement.children];
  // bpmn-js keeps annotations / associations moved or created on a
  // collaboration diagram in the collaboration (bpmn_edit does the same).
  const collab = roots
    .filter((c) => local(c) === "collaboration")
    .flatMap((c) => [...c.children].filter((a) => local(a) === "textAnnotation" || local(a) === "association"));
  return roots.filter((c) => local(c) === "process").map((p) => ({ id: p.getAttribute("id") ?? "", proc: parseProcess(p, collab) }));
}

function processArtifacts(procEl: Element, collab: Element[]): Element[] {
  const ids = new Set([procEl, ...procEl.getElementsByTagName("*")].map((e) => e.getAttribute("id")).filter(Boolean));
  const annotations = new Set(collab.filter((a) => local(a) === "textAnnotation").map((a) => a.getAttribute("id")));
  const keep = new Set<string | null>();
  for (const a of collab) {
    if (local(a) !== "association") continue;
    const s = a.getAttribute("sourceRef");
    const t = a.getAttribute("targetRef");
    const known = (x: string | null): boolean => ids.has(x) || annotations.has(x);
    if (known(s) && known(t) && (ids.has(s) || ids.has(t))) {
      keep.add(a.getAttribute("id"));
      if (annotations.has(s)) keep.add(s);
      if (annotations.has(t)) keep.add(t);
    }
  }
  return collab.filter((a) => keep.has(a.getAttribute("id")));
}

function parseProcess(procEl: Element, collab: Element[] = []): LayoutProcessInput {
  const all = [procEl, ...procEl.getElementsByTagName("*")];
  for (const art of processArtifacts(procEl, collab)) all.push(art, ...art.getElementsByTagName("*"));
  const byId = new Map<string, Element>();
  for (const el of all) {
    const id = el.getAttribute("id");
    if (id && !["laneSet", "lane", "flowNodeRef"].includes(local(el))) byId.set(id, el);
  }
  const nodes = new Map<string, N>();
  const apps = new Map<string, string>();
  const docIds = new Set<string>();
  const name = (el: Element): string => el.getAttribute("name") ?? "";
  for (const [id, el] of byId) {
    const t = local(el);
    if (t === "textAnnotation") {
      const text = (el.textContent ?? "").trim();
      if (text.startsWith("[App]")) apps.set(id, text.slice(5).trim());
      else if (text.startsWith("[Doc]")) {
        nodes.set(id, { type: "DOCUMENT", label: id, text: text.slice(5).trim() || id });
        docIds.add(id);
      }
      continue;
    }
    if (t in FLOW_TAG) {
      const [type, subtype] = FLOW_TAG[t] as [string, string | null];
      nodes.set(id, { type, label: id, text: name(el) || id, ...(subtype ? { subtype } : {}) });
    } else if (t === "dataInput") nodes.set(id, { type: "EXTERNAL_INPUT", label: id, text: name(el) || id });
    else if (t === "dataOutput") nodes.set(id, { type: "PROCESS_OUTPUT", label: id, text: name(el) || id });
    else if (t === "dataObjectReference") nodes.set(id, { type: "TASK_OUTPUT", label: id, text: name(el) || id, _pending: true });
  }
  const laneNames: string[] = [];
  const laneMembers = new Map<string, number>();
  for (const laneSet of procEl.getElementsByTagName("*")) {
    if (local(laneSet) !== "laneSet") continue;
    for (const lane of kids(laneSet, "lane")) {
      laneNames.push(lane.getAttribute("name") || lane.getAttribute("id") || "");
      for (const ref of kids(lane, "flowNodeRef")) {
        const r = (ref.textContent ?? "").trim();
        if (byId.has(r)) laneMembers.set(r, laneNames.length - 1);
      }
    }
  }
  if (!laneNames.length) laneNames.push("Lane 1");
  const conns: LayoutConnection[] = [];
  for (const [id, el] of byId) {
    const t = local(el);
    if (t === "sequenceFlow") {
      const s = el.getAttribute("sourceRef") ?? "";
      const g = el.getAttribute("targetRef") ?? "";
      if (nodes.has(s) && nodes.has(g)) conns.push({ source: s, target: g, kind: "FLOW", ...(el.getAttribute("name") ? { label: el.getAttribute("name") } : {}) });
    } else if (t === "association") {
      const s = el.getAttribute("sourceRef") ?? "";
      const g = el.getAttribute("targetRef") ?? "";
      if (apps.has(s) && nodes.has(g)) nodes.get(g)!.app_label = apps.get(s) ?? null;
      else if (apps.has(g) && nodes.has(s)) nodes.get(s)!.app_label = apps.get(g) ?? null;
      else if (nodes.has(s) && nodes.has(g) && (docIds.has(s) || docIds.has(g))) conns.push({ source: s, target: g, kind: "DOC" });
    } else if (t === "dataInputAssociation" || t === "dataOutputAssociation") {
      const owner = el.parentElement && ACTIVITY_TAGS.has(local(el.parentElement)) ? el.parentElement.getAttribute("id") : null;
      if (!owner || !nodes.has(owner)) continue;
      const ref = kids(el, t === "dataInputAssociation" ? "sourceRef" : "targetRef");
      for (const r of ref) {
        const item = (r.textContent ?? "").trim();
        if (!nodes.has(item)) continue;
        const n = nodes.get(item)!;
        if (t === "dataInputAssociation") conns.push({ source: item, target: owner, kind: "DATA" });
        else conns.push({ source: owner, target: item, kind: "DATA" });
        if (n._pending) {
          n.type = t === "dataInputAssociation" ? "TASK_INPUT" : "TASK_OUTPUT";
          delete n._pending;
        }
      }
    }
    void id;
  }
  for (const n of nodes.values()) delete n._pending;
  // lanes: members by flowNodeRef, items / documents in their activity's lane
  const taskLane = new Map<string, number>();
  for (const c of conns) {
    const s = nodes.get(c.source);
    const g = nodes.get(c.target);
    if (!s || !g) continue;
    if (c.kind === "DATA") {
      const [art, act] = tOf(s) === "TASK_INPUT" || tOf(s) === "EXTERNAL_INPUT" ? [c.source, c.target] : [c.target, c.source];
      taskLane.set(art, laneMembers.get(act) ?? 0);
    } else if (c.kind === "DOC") {
      const art = tOf(g) === "DOCUMENT" ? c.target : c.source;
      const other = art === c.target ? c.source : c.target;
      taskLane.set(art, laneMembers.get(other) ?? 0);
    }
  }
  const lanes = laneNames.map((n) => ({ name: n, nodes: [] as LayoutNode[] }));
  for (const [id, n] of nodes) lanes[laneMembers.get(id) ?? taskLane.get(id) ?? 0]?.nodes.push(n);
  const proc: LayoutProcessInput = { name: procEl.getAttribute("name") || procEl.getAttribute("id") || "", lanes, connections: conns };
  normalize(proc);
  repairNonTaskAttachments(proc);
  return proc;
}

/** legend_model.normalize: connection kinds, item types by direction, _task / _dir. */
export function normalize(proc: LayoutProcessInput): LayoutProcessInput {
  const nodes = new Map<string, LayoutNode>();
  for (const lane of proc.lanes) for (const n of lane.nodes) if (!nodes.has(n.label)) nodes.set(n.label, n);
  for (const c of proc.connections) {
    const s = nodes.get(c.source);
    const t = nodes.get(c.target);
    if (!s || !t) continue;
    const ts = tOf(s);
    const tt = tOf(t);
    const kind = tt === "DOCUMENT" || ts === "DOCUMENT" ? "DOC" : ARTIFACT_TYPES.has(tt) || ARTIFACT_TYPES.has(ts) ? "DATA" : "FLOW";
    c.kind = kind;
    if (kind === "FLOW") continue;
    const [art, act, dir] = ARTIFACT_TYPES.has(tt) ? [t, s, "out"] : [s, t, "in"];
    if (!FLOW_TYPES.has(tOf(act))) continue;
    const a = tOf(art);
    if (a === "DATA_OBJECT") art.type = dir === "out" ? "TASK_OUTPUT" : "TASK_INPUT";
    else if (a === "EXTERNAL_DATA_OBJECT") art.type = dir === "out" ? "PROCESS_OUTPUT" : "EXTERNAL_INPUT";
    if (art._task === undefined) art._task = act.label;
    if (art._dir === undefined) art._dir = kind === "DOC" ? "doc" : dir;
  }
  for (const n of nodes.values()) {
    const a = tOf(n);
    if (ARTIFACT_TYPES.has(a) && n._dir === undefined) {
      n._dir = ({ TASK_INPUT: "in", EXTERNAL_INPUT: "in", DOCUMENT: "doc" } as Record<string, string>)[a] ?? "out";
      if (a === "DATA_OBJECT") n.type = "TASK_INPUT";
      else if (a === "EXTERNAL_DATA_OBJECT") n.type = "EXTERNAL_INPUT";
    }
  }
  return proc;
}

/** legend_model.repair_non_task_attachments: DATA / DOC links on a non-activity move to the nearest preceding activity. */
export function repairNonTaskAttachments(proc: LayoutProcessInput): void {
  const nodes = new Map<string, LayoutNode>();
  for (const lane of proc.lanes) for (const n of lane.nodes) if (!nodes.has(n.label)) nodes.set(n.label, n);
  const preds = new Map<string, string[]>();
  for (const c of proc.connections) {
    if ((c.kind || "FLOW").toUpperCase() !== "FLOW") continue;
    if (nodes.has(c.source) && nodes.has(c.target)) preds.set(c.target, [...(preds.get(c.target) ?? []), c.source]);
  }
  const nearest = (label: string): string | null => {
    const seen = new Set([label]);
    const queue = [...(preds.get(label) ?? [])];
    while (queue.length) {
      const cand = queue.shift()!;
      if (seen.has(cand)) continue;
      seen.add(cand);
      const n = nodes.get(cand);
      if (n && ACTIVITY_TYPES.has(tOf(n))) return cand;
      queue.push(...(preds.get(cand) ?? []).filter((p) => !seen.has(p)));
    }
    return null;
  };
  const kept: LayoutConnection[] = [];
  for (let c of proc.connections) {
    const kind = (c.kind || "FLOW").toUpperCase();
    if (kind !== "DATA" && kind !== "DOC") {
      kept.push(c);
      continue;
    }
    const s = nodes.get(c.source);
    const t = nodes.get(c.target);
    if (!s || !t) {
      kept.push(c);
      continue;
    }
    let art: string;
    let host: string;
    if (kind === "DOC") {
      if (tOf(s) === "DOCUMENT") [art, host] = [c.source, c.target];
      else if (tOf(t) === "DOCUMENT") [art, host] = [c.target, c.source];
      else {
        kept.push(c);
        continue;
      }
    } else {
      if (ARTIFACT_TYPES.has(tOf(s)) && ARTIFACT_TYPES.has(tOf(t))) {
        kept.push(c);
        continue;
      }
      art = ARTIFACT_TYPES.has(tOf(s)) ? c.source : c.target;
      host = ARTIFACT_TYPES.has(tOf(s)) ? c.target : c.source;
    }
    const hostIsSource = host === c.source;
    if (ACTIVITY_TYPES.has(tOf(nodes.get(host)!))) {
      kept.push(c);
      continue;
    }
    const newHost = nearest(host);
    if (newHost === null) continue;
    c = hostIsSource ? { ...c, source: newHost } : { ...c, target: newHost };
    const a = nodes.get(art);
    if (a) a._task = newHost;
    kept.push(c);
  }
  proc.connections = kept;
}
