import { applicationHost, type BusinessPolicy } from "./business-policy.js";
import { layoutPolicy } from "./legacy-policy.js";
// On-demand swimlane layout. Adapted from an internal TypeScript implementation,
// itself a client-side port of an internal Python layout (swimlane layout, text fit,
// bpmn-io grid). Columns come from bpmn-io's auto-layout (npm bpmn-auto-layout,
// an external dependency), then lane bands, text-fitted boxes, collision-free
// attached artifacts and link routing are computed here.
// Integer semantics follow the Python original: // -> Math.floor, int() -> Math.trunc.

import { layoutProcess as bpmnAutoLayout } from "bpmn-auto-layout";

import { textWidth as measureWidth, wrapText as wrapMeasured } from "./textMetrics.js";

export type LayoutNode = {
  type?: string | null;
  subtype?: string | null;
  label: string;
  /** Displayed name when `label` is a technical key (editor adapter); defaults to `label`. */
  text?: string;
  application?: string | null;
  _task?: string;
  _dir?: string;
};
export type LayoutConnection = { id?: string; source: string; target: string; label?: string | null; kind?: string };
export type LayoutProcessInput = { diagnostics?: any[]; name?: string; lanes: Array<{ name?: string; nodes: LayoutNode[] }>; connections: LayoutConnection[] };

export type Box = { x: number; y: number; w: number; h: number };
export type Point = [number, number];
export type ProcessLayout = {
  pool: Box;
  lanes: Array<[string, Box]>;
  nodes: Record<string, Box>;
  edges: Point[][];
  edgeLabels: Array<Box | null>;
  connections: LayoutConnection[];
  apps: Record<string, Box>;
  labels: Record<string, Box>;
};

export const FLOW_TYPES = new Set(["start", "end", "task", "subprocess", "gateway", "event", "call"]);
export const ARTIFACT_TYPES = new Set([
  "object-in", "object-out", "port-in", "port-out", "document", "object-in", "object-in",
]);

export function createLayout(input?: BusinessPolicy) {
  const policy = input ?? (() => { throw new Error("profile-resource-missing"); })();
  const l = layoutPolicy(policy);
  const textWidth = (text: string, size: number, bold = false): number => measureWidth(text, size, bold, policy);
  const wrapText = (text: string, size: number, width: number, bold = false): string[] => wrapMeasured(text, size, width, bold, policy);
const poolHeader = l.poolHeader;
const laneHeader = l.laneHeader;
const leftPad = 40;
const colGap = 70;
const layoutChannel = l.channel;
const fixedRowGap = 24;
const minLaneH = l.minLaneHeight;
const rightPad = 70;
const groupGap = 10;
const centreGap = 10;
const font = l.fontSize;
const labelFont = l.labelFontSize;
const lineHeight = policy.metrics.lineHeight;
const event = l.nodeSizes.find((n: any) => n.kind === "start").width;
const itemW = l.nodeSizes.find((n: any) => n.kind === "object-in").width;
const itemH = l.nodeSizes.find((n: any) => n.kind === "object-in").height;
const labelMaxW = { event: l.labelMaxWidth.event, ITEM: l.labelMaxWidth.item };
const sizes: Record<string, [number, number]> = Object.fromEntries(l.nodeSizes.map((n: any) => [n.kind, [n.width, n.height]]));
const activities = new Set(["task", "subprocess", "call"]);
const appMinW = l.appBadge.minWidth;
const appH = l.appBadge.height;
const appOverlap = l.appBadge.overlap;
const appChrome = l.appBadge.chrome;
const appMargin = l.appBadge.margin;
const docW = l.document.width;
const docTextTop = l.document.textTop;
const docWaveTop = l.document.waveTop;
const docPadX = l.document.padX;
const docPadBottom = l.document.padBottom;
const cellW = 150;

const cx = (b: Box): number => b.x + Math.floor(b.w / 2);
const textOf = (n: LayoutNode): string => n.text ?? n.label ?? "";
const cy = (b: Box): number => b.y + Math.floor(b.h / 2);
const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

// --- text_fit ---------------------------------------------------------------

function fit(
  text: string, size: number,
  o: { minW: number; maxW: number; minH: number; padX?: number; padY?: number; bold?: boolean; extraH?: number },
): [number, number] {
  const padX = o.padX ?? 8;
  const padY = o.padY ?? 6;
  const oneLine = textWidth(text, size, o.bold) + 2 * padX;
  let w: number;
  let lines: number;
  if (oneLine <= o.maxW) {
    w = Math.max(o.minW, oneLine);
    lines = 1;
  } else {
    w = o.maxW;
    lines = wrapText(text, size, o.maxW - 2 * padX, o.bold).length;
  }
  const h = Math.max(o.minH, lines * size * lineHeight + 2 * padY + (o.extraH ?? 0));
  return [Math.ceil(w), Math.ceil(h)];
}

function labelBox(text: string, size: number, maxW: number, bold = false): [number, number] {
  if (!(text ?? "").trim()) return [0, 0];
  const lines = wrapText(text, size, maxW, bold);
  const w = Math.max(...lines.map((l) => textWidth(l, size, bold)));
  return [Math.ceil(Math.min(maxW, w) + 4), Math.ceil(lines.length * size * lineHeight + 2)];
}

// --- sizes ------------------------------------------------------------------

function appBoxSizeLayout(name: string, hostW: number): [number, number] {
  const wanted = textWidth(name, l.appBadge.font, true) + appChrome;
  const maxW = Math.max(appMinW, hostW - 2 * appMargin);
  const w = Math.trunc(Math.min(maxW, Math.max(appMinW, Math.ceil(wanted))));
  if (wanted <= w) return [w, appH];
  const lines = wrapText(name, l.appBadge.font, w - appChrome, true).length;
  return [w, Math.trunc(Math.max(appH, Math.ceil(lines * l.appBadge.font * policy.metrics.lineHeight + 8)))];
}

function appMinHostW(name: string): number {
  const words = (name ?? "").split(/\s+/).filter(Boolean);
  const longest = words.length ? Math.max(...words.map((w) => textWidth(w, l.appBadge.font, true))) : 0;
  return Math.trunc(Math.ceil(longest + appChrome + 2 * appMargin));
}

function docHeight(label: string): number {
  const block = wrapText(label, labelFont, docW - 2 * docPadX).length * labelFont * policy.metrics.lineHeight;
  return Math.trunc(Math.max(l.document.minHeight, Math.ceil((docTextTop + block + docPadBottom) / docWaveTop)));
}

function kindOf(n: LayoutNode): string {
  const t = (n.type || "task").trim().toLowerCase();
  return t in sizes ? t : "task";
}

function nodeSize(n: LayoutNode, kind: string): [number, number] {
  const own = sizes[kind] ?? sizes.task!;
  const nativeType = ({ task: "bpmn:Task", subprocess: "bpmn:SubProcess", call: "bpmn:CallActivity" } as Record<string, string>)[kind];
  const app = nativeType && applicationHost({ $type: nativeType }, policy) ? String(n.application || "") : "";
  const base = kind === "subprocess" ? sizes.subprocess! : sizes.task!;
  const minimum = app ? Math.min(200, Math.max(base[0]!, appMinHostW(app))) : base[0]!;
  if (kind === "task" || kind === "subprocess") return fit(textOf(n), font, { minW: minimum, maxW: Math.max(200, minimum), minH: base[1]!, padX: 8, padY: 8, extraH: app ? appOverlap : 0 });
  if (kind === "call") return fit(textOf(n), font, { minW: Math.max(own[0]!, app ? minimum : own[0]!), maxW: 200, minH: own[1]!, padX: 14, padY: 8, extraH: 10 });
  if (kind === "document") return [docW, docHeight(textOf(n))];
  return own as [number, number];
}

// --- bpmn-io columns (bpmnio_grid.py) ---------------------------------------

const nativeTags: Record<string, string> = {
  "start": "startEvent", "end": "endEvent", "event": "intermediateThrowEvent",
  "subprocess": "subProcess", "call": "callActivity",
};

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function flowXml(nodes: LayoutNode[], flows: Array<[string, string]>): { xml: string; ids: Map<string, string> } {
  const ids = new Map(nodes.map((n, i) => [n.label, `n${i}`]));
  const inc = new Map<string, string[]>([...ids.values()].map((i) => [i, []]));
  const out = new Map<string, string[]>([...ids.values()].map((i) => [i, []]));
  const seqs: string[] = [];
  flows.forEach(([s, t], k) => {
    const si = ids.get(s);
    const ti = ids.get(t);
    if (si && ti) {
      const fid = `f${k}`;
      out.get(si)!.push(fid);
      inc.get(ti)!.push(fid);
      seqs.push(`<bpmn:sequenceFlow id="${fid}" sourceRef="${si}" targetRef="${ti}"/>`);
    }
  });
  const parts = nodes.map((n) => {
    const i = ids.get(n.label)!;
    const t = (n.type || "task").trim().toLowerCase();
    const tag = t === "gateway" ? ((n.subtype || "").trim().toUpperCase() === "AND" ? "parallelGateway" : "exclusiveGateway") : (nativeTags[t] ?? "task");
    const refs = inc.get(i)!.map((f) => `<bpmn:incoming>${f}</bpmn:incoming>`).join("") +
      out.get(i)!.map((f) => `<bpmn:outgoing>${f}</bpmn:outgoing>`).join("");
    return `<bpmn:${tag} id="${i}" name="${xmlEscape(textOf(n))}">${refs}</bpmn:${tag}>`;
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="d" ' +
    'targetNamespace="http://bpmn.io/schema/bpmn"><bpmn:process id="p" isExecutable="false">' +
    parts.join("") + seqs.join("") + "</bpmn:process></bpmn:definitions>";
  return { xml, ids };
}

const bounds = /bpmnElement="(n\d+)"[^>]*>\s*<dc:Bounds x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g;

async function bpmnioColumns(nodes: LayoutNode[], flows: Array<[string, string]>): Promise<Map<string, number> | null> {
  if (!nodes.length) return new Map();
  const { xml, ids } = flowXml(nodes, flows);
  let out: string;
  try {
    out = await bpmnAutoLayout(xml);
  } catch {
    return null;
  }
  const col = new Map<string, number>();
  for (const m of out.matchAll(bounds)) col.set(m[1] ?? "", Math.floor((Number(m[2]) + Number(m[4]) / 2) / cellW));
  if (col.size !== ids.size) return null;
  const base = Math.min(...col.values());
  const res = new Map<string, number>();
  for (const [label, id] of ids) res.set(label, col.get(id)! - base);
  return res;
}

// --- layout -----------------------------------------------------------------

async function layoutProcess(
  proc: LayoutProcessInput,
  opts: { originY?: number; columns?: "bpmn-io" | "longest-path" } = {},
): Promise<ProcessLayout> {
  const originY = opts.originY ?? 0;
  const columns = opts.columns ?? "bpmn-io";
  const lanes = proc.lanes ?? [];
  const laneOf = new Map<string, number>();
  const kind = new Map<string, string>();
  const nodeOf = new Map<string, LayoutNode>();
  const flowOrder: string[] = [];
  lanes.forEach((lane, li) => {
    for (const n of lane.nodes ?? []) {
      const lbl = n.label || "";
      if (laneOf.has(lbl)) continue;
      laneOf.set(lbl, li);
      kind.set(lbl, kindOf(n));
      nodeOf.set(lbl, n);
      if (FLOW_TYPES.has(kind.get(lbl)!)) flowOrder.push(lbl);
    }
  });
  const flowSet = new Set(flowOrder);
  const allConns = (proc.connections ?? []).filter((c) => laneOf.has(c.source) && laneOf.has(c.target));
  const flow = allConns.filter((c) => (c.kind || "sequence") === "sequence" && flowSet.has(c.source) && flowSet.has(c.target));
  const other = allConns.filter((c) => (c.kind || "sequence") !== "sequence");

  // columns: longest-path layering without back edges
  const succ = new Map<string, string[]>();
  const succOf = (n: string): string[] => succ.get(n) ?? [];
  for (const c of flow) succ.set(c.source, [...succOf(c.source), c.target]);
  const starts = [...flowOrder.filter((n) => kind.get(n) === "start"), ...flowOrder];
  const back = new Set<string>();
  const key2 = (a: string, b: string): string => `${a}\u0000${b}`;
  const state = new Map<string, number>();
  for (const root of starts) {
    if (state.has(root)) continue;
    const stack: Array<[string, number]> = [[root, 0]];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const nexts = succOf(top[0]);
      if (top[1] >= nexts.length) {
        state.set(top[0], 2);
        stack.pop();
        continue;
      }
      const nxt = nexts[top[1]++]!;
      const s = state.get(nxt) ?? 0;
      if (s === 1) back.add(key2(top[0], nxt));
      else if (s === 0) {
        state.set(nxt, 1);
        stack.push([nxt, 0]);
      }
    }
  }
  const indeg = new Map(flowOrder.map((n) => [n, 0]));
  const fsucc = new Map<string, string[]>();
  for (const c of flow) {
    if (back.has(key2(c.source, c.target))) continue;
    indeg.set(c.target, indeg.get(c.target)! + 1);
    fsucc.set(c.source, [...(fsucc.get(c.source) ?? []), c.target]);
  }
  let rank = new Map(flowOrder.map((n) => [n, 0]));
  const q = flowOrder.filter((n) => indeg.get(n) === 0);
  while (q.length) {
    const n = q.shift()!;
    for (const t of fsucc.get(n) ?? []) {
      rank.set(t, Math.max(rank.get(t)!, rank.get(n)! + 1));
      indeg.set(t, indeg.get(t)! - 1);
      if (indeg.get(t) === 0) q.push(t);
    }
  }
  if (columns === "bpmn-io") {
    const cols = await bpmnioColumns(flowOrder.map((n) => nodeOf.get(n)!), flow.map((c) => [c.source, c.target]));
    if (cols) {
      const used = [...new Set(cols.values())].sort((a, b) => a - b);
      rank = new Map(flowOrder.map((n) => [n, used.indexOf(cols.get(n)!)]));
    }
  }

  const slots = new Map<string, number>();
  const row = new Map<string, number>();
  const rk = (li: number, r: number): string => `${li}:${r}`;
  for (const n of flowOrder) {
    const key = rk(laneOf.get(n)!, rank.get(n)!);
    row.set(n, slots.get(key) ?? 0);
    slots.set(key, (slots.get(key) ?? 0) + 1);
  }
  const laneRows = lanes.map((_, li) => {
    const v = [...slots.entries()].filter(([k]) => Number(k.split(":")[0]) === li).map(([, n]) => n);
    return v.length ? Math.max(...v) : 1;
  });
  const maxRank = rank.size ? Math.max(...rank.values()) : 0;

  // sizes and attachments
  const size = new Map<string, [number, number]>();
  for (const [n, nd] of nodeOf) size.set(n, nodeSize(nd, kind.get(n)!));
  const labelsWh = new Map<string, [number, number]>();
  for (const [n, nd] of nodeOf) {
    const k = kind.get(n)!;
    if (k === "start" || k === "end" || k === "event" || k === "gateway") labelsWh.set(n, labelBox(textOf(nd), labelFont, labelMaxW.event));
    else if (ARTIFACT_TYPES.has(k) && k !== "document") labelsWh.set(n, labelBox(textOf(nd), labelFont, labelMaxW.ITEM));
  }
  const appWh = new Map<string, [number, number]>();
  for (const n of flowOrder) {
    const nd = nodeOf.get(n)!;
    if (nd.application && applicationHost({ $type: ({ task: "bpmn:Task", subprocess: "bpmn:SubProcess", call: "bpmn:CallActivity" } as Record<string, string>)[kind.get(n)!] }, policy)) appWh.set(n, appBoxSizeLayout(String(nd.application), size.get(n)![0]));
  }
  const docs = new Map<string, string[]>();
  const ins = new Map<string, string[]>();
  const outs = new Map<string, string[]>();
  const loose = new Map<number, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string): void => void m.set(k, [...(m.get(k) ?? []), v]);
  for (const [lbl, nd] of nodeOf) {
    if (!ARTIFACT_TYPES.has(kind.get(lbl)!)) continue;
    const host = nd._task && rank.has(nd._task) ? nd._task : null;
    if (host === null) {
      loose.set(laneOf.get(lbl)!, [...(loose.get(laneOf.get(lbl)!) ?? []), lbl]);
      continue;
    }
    const dir = nd._dir || "in";
    push(dir === "doc" ? docs : dir === "in" ? ins : outs, host, lbl);
  }
  const lw0 = (l: string): [number, number] => labelsWh.get(l) ?? [0, 0];
  const blockW = (l: string): number => (kind.get(l) === "document" ? size.get(l)![0] : Math.max(size.get(l)![0], lw0(l)[0]));
  const itemH = (l: string): number => size.get(l)![1] + (lw0(l)[1] ? 4 + lw0(l)[1] : 0);
  const groupW = (items: string[]): number => items.reduce((a, i) => a + blockW(i), 0) + groupGap * Math.max(0, items.length - 1);
  const splitDocs = (n: string): [string[], string[]] => {
    const d = docs.get(n) ?? [];
    const half = Math.floor((d.length + 1) / 2);
    return [d.slice(0, half), d.slice(half)];
  };
  const docRowH = new Map<string, number>();
  for (const [host, ds] of docs) {
    const k = rk(laneOf.get(host)!, row.get(host)!);
    for (const d of ds) docRowH.set(k, Math.max(docRowH.get(k) ?? 0, size.get(d)![1]));
  }
  for (const [host, ds] of docs) {
    const k = rk(laneOf.get(host)!, row.get(host)!);
    for (const d of ds) size.set(d, [size.get(d)![0], docRowH.get(k)!]);
  }
  const rowHalf = new Map<string, number>();
  for (const n of flowOrder) {
    const k = rk(laneOf.get(n)!, row.get(n)!);
    rowHalf.set(k, Math.max(rowHalf.get(k) ?? 0, size.get(n)![1] / 2));
  }

  type Ext = { left: number; right: number; up: number; down: number; itemStart: number };
  const ext = new Map<string, Ext>();
  for (const n of flowOrder) {
    const [w, h] = size.get(n)!;
    const [leftDocs, rightDocs] = splitDocs(n);
    const k = rk(laneOf.get(n)!, row.get(n)!);
    const ds = docs.get(n) ?? [];
    const up = h / 2 + (ds.length ? rowHalf.get(k)! - h / 2 + Math.max(...ds.map((d) => size.get(d)![1])) + 14 : 0);
    const appHalf = appWh.has(n) ? appWh.get(n)![0] / 2 : 0;
    let below = 0;
    if (appWh.has(n)) below = appWh.get(n)![1] - appOverlap;
    const itemStart = below + 14;
    const its = [...(ins.get(n) ?? []), ...(outs.get(n) ?? [])];
    if (its.length) below = itemStart + Math.max(...its.map(itemH));
    if (labelsWh.has(n) && lw0(n)[1]) below = Math.max(below, 4 + lw0(n)[1]);
    const side = Math.max(appHalf, centreGap);
    const left = Math.max(w / 2, centreGap + groupW(leftDocs), side + 8 + groupW(ins.get(n) ?? []), lw0(n)[0] / 2);
    const right = Math.max(w / 2, centreGap + groupW(rightDocs), side + 8 + groupW(outs.get(n) ?? []), lw0(n)[0] / 2);
    ext.set(n, { left, right, up, down: h / 2 + below, itemStart });
  }

  const contentX = poolHeader + laneHeader + leftPad;
  const colMax = (c: number, f: (e: Ext) => number): number => {
    const v = flowOrder.filter((n) => rank.get(n) === c).map((n) => f(ext.get(n)!));
    return v.length ? Math.max(...v) : 60;
  };
  const colLeft: number[] = [];
  const colRight: number[] = [];
  for (let c = 0; c <= maxRank; c++) {
    colLeft.push(colMax(c, (e) => e.left));
    colRight.push(colMax(c, (e) => e.right));
  }
  const colX: number[] = [];
  let x = contentX;
  for (let c = 0; c <= maxRank; c++) {
    x += colLeft[c] ?? 0;
    colX.push(x);
    x += (colRight[c] ?? 0) + colGap;
  }
  const looseW = lanes.map((_, li) => (loose.get(li) ?? []).reduce((a, i) => a + blockW(i) + groupGap, 0));
  const poolW = Math.trunc(Math.max(x - colGap + rightPad, contentX + (looseW.length ? Math.max(...looseW) : 0) + rightPad));

  const rowUp = new Map<string, number>();
  const rowDown = new Map<string, number>();
  for (const n of flowOrder) {
    const k = rk(laneOf.get(n)!, row.get(n)!);
    rowUp.set(k, Math.max(rowUp.get(k) ?? 0, ext.get(n)!.up));
    rowDown.set(k, Math.max(rowDown.get(k) ?? 0, ext.get(n)!.down));
  }
  const rowTop = new Map<string, number>();
  const rowCy = new Map<string, number>();
  const laneBoxes: Array<[string, Box]> = [];
  const looseY = new Map<number, number>();
  let y = originY;
  lanes.forEach((lane, li) => {
    const top = y;
    for (let r = 0; r < (laneRows[li] ?? 1); r++) {
      const k = rk(li, r);
      const up = rowUp.has(k) ? rowUp.get(k)! : 40;
      const down = rowDown.has(k) ? rowDown.get(k)! : 40;
      rowTop.set(k, y);
      rowCy.set(k, Math.trunc(y + layoutChannel + up));
      y = Math.trunc(y + layoutChannel + up + down + fixedRowGap);
    }
    const ls = loose.get(li) ?? [];
    if (ls.length) {
      looseY.set(li, y);
      y += Math.max(...ls.map((i) => (kind.get(i) !== "document" ? itemH(i) : size.get(i)![1]))) + fixedRowGap;
    }
    const h = Math.max(minLaneH, y - top);
    y = top + h;
    laneBoxes.push([lane.name || "", box(poolHeader, top, poolW - poolHeader, h)]);
  });
  const pool = box(0, originY, poolW, Math.max(y - originY, minLaneH));

  const nodes: Record<string, Box> = {};
  const at = (id: string): Box => nodes[id] as Box;
  const labels: Record<string, Box> = {};
  const apps: Record<string, Box> = {};
  const placeItem = (i: string, ix: number, top: number, bw: number): void => {
    const [w, h] = size.get(i)!;
    const c = ix + Math.floor(bw / 2);
    nodes[i] = box(c - Math.floor(w / 2), top, w, h);
    if (lw0(i)[1]) {
      const [lw, lh] = lw0(i);
      labels[i] = box(c - Math.floor(lw / 2), top + h + 4, lw, lh);
    }
  };
  for (const n of flowOrder) {
    const [w, h] = size.get(n)!;
    const k = rk(laneOf.get(n)!, row.get(n)!);
    const ncx = Math.trunc(colX[rank.get(n)!] ?? 0);
    const ncy = rowCy.get(k)!;
    const b = box(ncx - Math.floor(w / 2), ncy - Math.floor(h / 2), w, h);
    nodes[n] = b;
    if (lw0(n)[1]) {
      const [lw, lh] = lw0(n);
      labels[n] = box(ncx - Math.floor(lw / 2), b.y + b.h + 4, lw, lh);
    }
    if (appWh.has(n)) {
      const [aw, ah] = appWh.get(n)!;
      apps[n] = box(ncx - Math.floor(aw / 2), b.y + b.h - appOverlap, aw, ah);
    }
    const [leftDocs, rightDocs] = splitDocs(n);
    const docBottom = ncy - Math.trunc(rowHalf.get(k)!) - 14;
    let xr = ncx - centreGap;
    for (const d of [...leftDocs].reverse()) {
      const [dw, dh] = size.get(d)!;
      xr -= dw;
      nodes[d] = box(xr, docBottom - dh, dw, dh);
      xr -= groupGap;
    }
    let xl = ncx + centreGap;
    for (const d of rightDocs) {
      const [dw, dh] = size.get(d)!;
      nodes[d] = box(xl, docBottom - dh, dw, dh);
      xl += dw + groupGap;
    }
    const side = Math.max(apps[n] ? Math.floor(apps[n].w / 2) : 0, centreGap) + 8;
    const top = Math.trunc(ncy + h / 2 + ext.get(n)!.itemStart);
    xr = ncx - side;
    for (const i of [...(ins.get(n) ?? [])].reverse()) {
      const bw = blockW(i);
      xr -= bw;
      placeItem(i, xr, top, bw);
      xr -= groupGap;
    }
    xl = ncx + side;
    for (const i of outs.get(n) ?? []) {
      const bw = blockW(i);
      placeItem(i, xl, top, bw);
      xl += bw + groupGap;
    }
  }
  for (const [li, items] of loose) {
    let xl = contentX;
    for (const i of items) {
      const bw = blockW(i);
      if (kind.get(i) === "document") nodes[i] = box(xl, looseY.get(li)!, size.get(i)![0], size.get(i)![1]);
      else placeItem(i, xl, looseY.get(li)!, bw);
      xl += bw + groupGap;
    }
  }

  // flows
  const edges: Point[][] = [];
  const edgeLabels: Array<Box | null> = [];
  const channelUse = new Map<string, number>();
  const channel = (n: string): number => {
    const k = rk(laneOf.get(n)!, row.get(n)!);
    const used = channelUse.get(k) ?? 0;
    channelUse.set(k, used + 1);
    return rowTop.get(k)! + 8 + (used % 3) * 5;
  };
  const upper = (a: string, b: string): string => (cy(at(a)) <= cy(at(b)) ? a : b);
  const blocked = (yy: number, x0: number, x1: number, skip: [string, string]): boolean => {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    return flowOrder.some((n) => !skip.includes(n) && at(n).x < hi && at(n).x + at(n).w > lo && at(n).y <= yy && yy <= at(n).y + at(n).h);
  };
  const gapX = (c: number): number => Math.trunc((colX[c] ?? 0) - (colLeft[c] ?? 0) - colGap / 2);
  for (const c of flow) {
    const sn = c.source;
    const tn = c.target;
    const s = at(sn);
    const t = at(tn);
    let pts: Point[];
    if (back.has(key2(sn, tn)) || cx(t) < cx(s)) {
      const high = channel(upper(sn, tn));
      pts = [[cx(s), s.y], [cx(s), high], [cx(t), high], [cx(t), t.y]];
    } else if (cx(t) === cx(s)) {
      const below = cy(t) > cy(s);
      const bottomEnd = below ? sn : tn;
      if (apps[bottomEnd] || (ins.get(bottomEnd) ?? []).length || (outs.get(bottomEnd) ?? []).length) {
        const xr = Math.trunc((colX[rank.get(sn)!] ?? 0) + (colRight[rank.get(sn)!] ?? 0) + 14);
        pts = [[s.x + s.w, cy(s)], [xr, cy(s)], [xr, cy(t)], [t.x + t.w, cy(t)]];
      } else if (below) pts = [[cx(s), s.y + s.h], [cx(t), t.y]];
      else pts = [[cx(s), s.y], [cx(t), t.y + t.h]];
    } else {
      const mx = gapX(rank.get(tn)!);
      const sameRow = Math.abs(cy(s) - cy(t)) < 2;
      if (sameRow && !blocked(cy(s), s.x + s.w, t.x, [sn, tn])) pts = [[s.x + s.w, cy(s)], [t.x, cy(t)]];
      else if (!sameRow && !blocked(cy(s), s.x + s.w, mx, [sn, tn])) pts = [[s.x + s.w, cy(s)], [mx, cy(s)], [mx, cy(t)], [t.x, cy(t)]];
      else if (sameRow) {
        const high = channel(sn);
        pts = [[cx(s), s.y], [cx(s), high], [cx(t), high], [cx(t), t.y]];
      } else {
        const high = channel(sn);
        pts = [[cx(s), s.y], [cx(s), high], [mx, high], [mx, cy(t)], [t.x, cy(t)]];
      }
    }
    edges.push(pts);
    if (c.label) {
      const [lw, lh] = labelBox(c.label, labelFont, 120);
      const [p0, p1, p2, p3] = pts as [Point, Point, Point, Point];
      const elbow = pts.length === 4 && p1[0] === p2[0] && p0[1] === p1[1];
      const [[x1, y1], [x2, y2]] = elbow ? [p2, p3] : [p0, p1];
      if (elbow) edgeLabels.push(box(x2 - lw - 4, y2 - lh - 2, lw, lh));
      else if (x1 === x2) edgeLabels.push(box(x1 + 4, Math.floor((y1 + y2) / 2) - Math.floor(lh / 2), lw, lh));
      else edgeLabels.push(box(Math.floor((x1 + x2) / 2) - Math.floor(lw / 2), Math.min(y1, y2) - lh - 2, lw, lh));
    } else edgeLabels.push(null);
  }
  for (const c of other) {
    const s = at(c.source);
    const t = at(c.target);
    if (!s || !t) {
      edges.push([]);
      edgeLabels.push(null);
      continue;
    }
    const srcIsItem = ARTIFACT_TYPES.has(kind.get(c.source)!);
    const [artN, actN] = srcIsItem ? [c.source, c.target] : [c.target, c.source];
    const own = nodeOf.get(artN)!._task === actN;
    let pts = link(artN, actN, at(artN), at(actN), kind, apps, colX, colLeft, rank, own);
    if (!srcIsItem) pts = [...pts].reverse();
    edges.push(pts);
    edgeLabels.push(null);
  }
  return { pool, lanes: laneBoxes, nodes, edges, edgeLabels, connections: [...flow, ...other], apps, labels };
}

function itemAttach(act: Box, app: Box | undefined): [number, number, number] {
  if (app) return [app.x + 6, app.x + app.w - 6, app.y + app.h];
  return [act.x + 8, act.x + act.w - 8, act.y + act.h];
}

function link(
  artN: string, actN: string, art: Box, act: Box, kind: Map<string, string>, apps: Record<string, Box>,
  colX: number[], colLeft: number[], rank: Map<string, number>, own: boolean,
): Point[] {
  const gx = rank.has(actN) ? Math.trunc((colX[rank.get(actN)!] ?? 0) - (colLeft[rank.get(actN)!] ?? 0) - 12) : act.x - 12;
  if (kind.get(artN) === "document") {
    const lo = act.x + 14;
    const hi = act.x + act.w - 14;
    const top = act.y;
    const yy = act.y - 7;
    if (own) {
      if (lo <= cx(art) && cx(art) <= hi) return [[cx(art), art.y + art.h], [cx(art), top]];
      const xx = cx(art) < cx(act) ? lo : hi;
      return [[cx(art), art.y + art.h], [cx(art), yy], [xx, yy], [xx, top]];
    }
    const ay = art.y + art.h + 6;
    return [[cx(art), art.y + art.h], [cx(art), ay], [gx, ay], [gx, yy], [lo, yy], [lo, top]];
  }
  const [lo, hi, bottom] = itemAttach(act, apps[actN]);
  const yy = bottom + 7;
  if (own) {
    if (lo <= cx(art) && cx(art) <= hi) return [[cx(art), art.y], [cx(art), bottom]];
    const xx = cx(art) < cx(act) ? lo : hi;
    return [[cx(art), art.y], [cx(art), yy], [xx, yy], [xx, bottom]];
  }
  const ay = art.y - 8;
  return [[cx(art), art.y], [cx(art), ay], [gx, ay], [gx, yy], [lo, yy], [lo, bottom]];
}

return { fit, labelBox, appBoxSizeLayout, docHeight, flowXml, bpmnioColumns, layoutProcess, appMinHostW, nodeSize };
}

export function fit(text: string, size: number, options: { minW: number; maxW: number; minH: number; padX?: number; padY?: number; bold?: boolean; extraH?: number }, policy?: BusinessPolicy): [number, number] { return createLayout(policy).fit(text, size, options); }
export function labelBox(text: string, size: number, width: number, bold = false, policy?: BusinessPolicy): [number, number] { return createLayout(policy).labelBox(text, size, width, bold); }
export function appBoxSizeLayout(name: string, width: number, policy?: BusinessPolicy): [number, number] { return createLayout(policy).appBoxSizeLayout(name, width); }
export function docHeight(text: string, policy?: BusinessPolicy): number { return createLayout(policy).docHeight(text); }
export function flowXml(nodes: LayoutNode[], flows: Array<[string, string]>, policy?: BusinessPolicy): { xml: string; ids: Map<string,string> } { return createLayout(policy).flowXml(nodes, flows); }
export function bpmnioColumns(nodes: LayoutNode[], flows: Array<[string,string]>, policy?: BusinessPolicy): Promise<Map<string,number> | null> { return createLayout(policy).bpmnioColumns(nodes, flows); }
export function layoutProcess(proc: LayoutProcessInput, options: { originY?: number; columns?: "bpmn-io" | "longest-path" } = {}, policy?: BusinessPolicy): Promise<ProcessLayout> { return createLayout(policy).layoutProcess(proc, options); }
