import { annotationRole, roleLabel, applicationHost, type BusinessPolicy } from "./business-policy.js";
// BPMN XML -> layout input. Adapted from an internal TypeScript implementation that
// mirrors an internal Python model (parse a process, normalize connection kinds and
// artifact types, repair attachments on non-activity nodes). Keys are element ids
// (labels may repeat in the editor); `text` carries the displayed name used for sizing.
// Needs a DOM `DOMParser`: it runs in the browser, never at import time.

import { ARTIFACT_TYPES, FLOW_TYPES, type LayoutConnection, type LayoutNode, type LayoutProcessInput } from "./swimlaneLayout.js";

const FLOW_TAG: Record<string, [string, string | null]> = {
  startEvent: ["start", null],
  endEvent: ["end", null],
  task: ["task", null],
  subProcess: ["subprocess", null],
  callActivity: ["call", null],
  exclusiveGateway: ["gateway", "OR"],
  parallelGateway: ["gateway", "AND"],
  inclusiveGateway: ["gateway", "OR"],
  intermediateThrowEvent: ["event", null],
  intermediateCatchEvent: ["event", null],
};
const ACTIVITY_TAGS = new Set([
  "task", "subProcess", "callActivity", "exclusiveGateway", "parallelGateway", "inclusiveGateway",
  "startEvent", "endEvent", "intermediateThrowEvent", "intermediateCatchEvent",
]);
const ACTIVITY_TYPES = new Set(["task", "subprocess", "call"]);

type N = LayoutNode & { _pending?: boolean };
const local = (el: Element): string => el.localName;
const kids = (el: Element, name: string): Element[] => [...el.children].filter((c) => local(c) === name);
const tOf = (n: LayoutNode): string => (n.type || "task").trim().toLowerCase();

export type ParsedProcess = { id: string; proc: LayoutProcessInput };

/** Every process of a BPMN XML, parsed like the agent's bpmn_xml_to_process_list. */
export function parseProcesses(xml: string, policy?: BusinessPolicy): ParsedProcess[] {
  if (typeof DOMParser === "undefined") throw new Error("parseProcesses needs a DOM (DOMParser)");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const roots = [...doc.documentElement.children];
  // bpmn-js keeps annotations / associations moved or created on a
  // collaboration diagram in the collaboration (bpmn_edit does the same).
  const collab = roots
    .filter((c) => local(c) === "collaboration")
    .flatMap((c) => [...c.children].filter((a) => local(a) === "textAnnotation" || local(a) === "association"));
  return roots.filter((c) => local(c) === "process").map((p) => ({ id: p.getAttribute("id") ?? "", proc: parseProcess(p, collab, policy) }));
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

function parseProcess(procEl: Element, collab: Element[] = [], policy?: BusinessPolicy): LayoutProcessInput {
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
      const text = el.textContent ?? "";
      const role = annotationRole(text, policy)?.role;
      if (role === "application") apps.set(id, roleLabel(text, policy, true));
      else if (role === "document") {
        nodes.set(id, { type: "document", label: id, text: roleLabel(text, policy, true) || id });
        docIds.add(id);
      }
      continue;
    }
    if (t in FLOW_TAG) {
      const [type, subtype] = FLOW_TAG[t] as [string, string | null];
      nodes.set(id, { type, label: id, text: name(el) || id, ...(subtype ? { subtype } : {}) });
    } else if (t === "dataInput") nodes.set(id, { type: "port-in", label: id, text: name(el) || id });
    else if (t === "dataOutput") nodes.set(id, { type: "port-out", label: id, text: name(el) || id });
    else if (t === "dataObjectReference") nodes.set(id, { type: "object-out", label: id, text: name(el) || id, _pending: true });
  }
  const eligible = (id: string): boolean => {
    const tag = byId.get(id)?.localName ?? "";
    return applicationHost({ $type: "bpmn:" + tag.charAt(0).toUpperCase() + tag.slice(1) }, policy);
  };
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
      if (nodes.has(s) && nodes.has(g)) conns.push({ id, source: s, target: g, kind: "sequence", ...(el.getAttribute("name") ? { label: el.getAttribute("name") } : {}) });
    } else if (t === "association") {
      const s = el.getAttribute("sourceRef") ?? "";
      const g = el.getAttribute("targetRef") ?? "";
      if (apps.has(s) && nodes.has(g) && eligible(g)) nodes.get(g)!.application = apps.get(s) ?? null;
      else if (apps.has(g) && nodes.has(s) && eligible(s)) nodes.get(s)!.application = apps.get(g) ?? null;
      else if (nodes.has(s) && nodes.has(g) && (docIds.has(s) || docIds.has(g))) conns.push({ id, source: s, target: g, kind: "document" });
    } else if (t === "dataInputAssociation" || t === "dataOutputAssociation") {
      const owner = el.parentElement && ACTIVITY_TAGS.has(local(el.parentElement)) ? el.parentElement.getAttribute("id") : null;
      if (!owner || !nodes.has(owner)) continue;
      const ref = kids(el, t === "dataInputAssociation" ? "sourceRef" : "targetRef");
      for (const r of ref) {
        const item = (r.textContent ?? "").trim();
        if (!nodes.has(item)) continue;
        const n = nodes.get(item)!;
        if (t === "dataInputAssociation") conns.push({ id, source: item, target: owner, kind: "data" });
        else conns.push({ id, source: owner, target: item, kind: "data" });
        if (n._pending) {
          n.type = t === "dataInputAssociation" ? "object-in" : "object-out";
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
    if (c.kind === "data") {
      const [art, act] = tOf(s) === "object-in" || tOf(s) === "port-in" ? [c.source, c.target] : [c.target, c.source];
      taskLane.set(art, laneMembers.get(act) ?? 0);
    } else if (c.kind === "document") {
      const art = tOf(g) === "document" ? c.target : c.source;
      const other = art === c.target ? c.source : c.target;
      taskLane.set(art, laneMembers.get(other) ?? 0);
    }
  }
  const lanes = laneNames.map((n) => ({ name: n, nodes: [] as LayoutNode[] }));
  for (const [id, n] of nodes) lanes[laneMembers.get(id) ?? taskLane.get(id) ?? 0]?.nodes.push(n);
  const proc: LayoutProcessInput = { name: procEl.getAttribute("name") || procEl.getAttribute("id") || "", lanes, connections: conns };
  normalize(proc);
  reportAttachmentHosts(proc);
  return proc;
}

/** annotated_model.normalize: connection kinds, item types by direction, _task / _dir. */
export function normalize(proc: LayoutProcessInput): LayoutProcessInput {
  const nodes = new Map<string, LayoutNode>();
  for (const lane of proc.lanes) for (const n of lane.nodes) if (!nodes.has(n.label)) nodes.set(n.label, n);
  for (const c of proc.connections) {
    const s = nodes.get(c.source);
    const t = nodes.get(c.target);
    if (!s || !t) continue;
    const ts = tOf(s);
    const tt = tOf(t);
    const kind = tt === "document" || ts === "document" ? "document" : ARTIFACT_TYPES.has(tt) || ARTIFACT_TYPES.has(ts) ? "data" : "sequence";
    c.kind = kind;
    if (kind === "sequence") continue;
    const [art, act, dir] = ARTIFACT_TYPES.has(tt) ? [t, s, "out"] : [s, t, "in"];
    if (!FLOW_TYPES.has(tOf(act))) continue;
    const a = tOf(art);
    if (a === "object-in") art.type = dir === "out" ? "object-out" : "object-in";
    else if (a === "port-in") art.type = dir === "out" ? "port-out" : "port-in";
    if (art._task === undefined) art._task = act.label;
    if (art._dir === undefined) art._dir = kind === "document" ? "doc" : dir;
  }
  for (const n of nodes.values()) {
    const a = tOf(n);
    if (ARTIFACT_TYPES.has(a) && n._dir === undefined) {
      n._dir = ({ "object-in": "in", "port-in": "in", "document": "doc" } as Record<string, string>)[a] ?? "out";
      if (a === "object-in") n.type = "object-in";
      else if (a === "object-in") n.type = "port-in";
    }
  }
  return proc;
}

export function reportAttachmentHosts(proc: LayoutProcessInput): void {
  const nodes = new Map(proc.lanes.flatMap(lane => lane.nodes).map(node => [node.label, node]));
  const diagnostics: any[] = [];
  for (const connection of proc.connections) {
    if (connection.kind === "sequence") continue;
    const source = nodes.get(connection.source), target = nodes.get(connection.target);
    if (!source || !target) continue;
    const sourceArtifact = ARTIFACT_TYPES.has(tOf(source));
    const artifact = sourceArtifact ? source : target, host = sourceArtifact ? target : source;
    if (!ARTIFACT_TYPES.has(tOf(artifact)) || ACTIVITY_TYPES.has(tOf(host))) continue;
    diagnostics.push({ code: "attachment-host-not-activity", severity: "warn", artifact: artifact.label, host: host.label, connection: { source: connection.source, target: connection.target, kind: connection.kind } });
  }
  proc.diagnostics = diagnostics;
}
