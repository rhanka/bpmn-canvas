// x24 derivation helper: hand re-implementation of the base-tree legacy formulas, parametrised by an
// injected business-policy/1 record. Written from reading the base sources (cited per function by masked
// path and line); it reads only the pinned lot-0 unicode-case/1 table, and no product module, codec,
// layout, renderer or exporter is imported or executed. Names are neutral: no base identifier or business
// literal is written here.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// ------------------------------------------------------------------ classification
// ECMAScript WhiteSpace + LineTerminator = DESIGN.md:152 ecma262-2024-start set = JS RegExp \s.
const WS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]);

export function leadTrim(s) {
  let i = 0;
  while (i < s.length && WS.has(s.charCodeAt(i))) i++;
  return s.slice(i);
}
export function trimBoth(s) {
  let j = s.length;
  while (j > 0 && WS.has(s.charCodeAt(j - 1))) j--;
  return leadTrim(s.slice(0, j));
}

// Unicode 15.0.0 full upper case from the lot-0 unicode-case/1 table (the twin authority of DESIGN.md:116
// and the profile label case; never a second table). Its digest is pinned by the lot-0 manifest.
const CASE_TABLE = new URL("../../../unicode-case-15.0.0/case-table.json", import.meta.url);
export const CASE_TABLE_SHA256 = "c0fa6878b62a1abdee18879cb9a203d0f68a5959de76153a1996dbb3271c7293";
let upperMap = null;
function upperTable() {
  if (!upperMap) {
    const bytes = readFileSync(CASE_TABLE);
    if (createHash("sha256").update(bytes).digest("hex") !== CASE_TABLE_SHA256) throw new Error("unicode-case/1 table digest");
    upperMap = new Map(JSON.parse(bytes.toString("utf8")).upper.map(([from, to]) => [from, String.fromCodePoint(...to)]));
  }
  return upperMap;
}
/** Unicode 15.0.0 full upper case (unconditional mappings; upper casing has no context rule). */
export function upper15(s) {
  const map = upperTable();
  let out = "";
  for (const ch of s) out += map.get(ch.codePointAt(0)) ?? ch;
  return out;
}

const roleOf = (policy, role) => policy?.classification?.annotationRoles?.find((r) => r.role === role);
const caseOf = (r, s) => (r.labelCase === "upper" ? upper15(s) : s);
export const ROLES = ["document", "application"];

/** Role recognition (src/internal/annotations.ts:6-11, src/internal/processModel.ts:80-82, src/io/reference-model.ts:293-295). */
export function recognises(policy, role, text) {
  const r = roleOf(policy, role);
  if (!r) return false;
  const t = r.trim === "ecma262-2024-start" ? leadTrim(text ?? "") : (text ?? "");
  return t.startsWith(r.prefix);
}

/** The roles a text matches: zero, one, or two (an ambiguous text, DESIGN.md:154). */
export function rolesOf(policy, text) {
  return ROLES.filter((role) => recognises(policy, role, text));
}

export class AmbiguousNotion extends Error {
  constructor(text) {
    super("profile-ambiguous-notion");
    this.code = "profile-ambiguous-notion";
    this.text = text;
  }
}

/** Recognised role or null; two matching roles refuse profile-ambiguous-notion (DESIGN.md:154). */
export function roleFor(policy, text) {
  const hits = rolesOf(policy, text);
  if (hits.length > 1) throw new AmbiguousNotion(text);
  return hits[0] ?? null;
}

/** Display name (src/internal/annotations.ts:15-16): role trim, the prefix and every following space removed. */
export function displayName(policy, text) {
  const s = text ?? "";
  const role = roleFor(policy, s);
  if (!role) return s;
  const r = roleOf(policy, role);
  let t = r.trim === "ecma262-2024-start" ? leadTrim(s) : s;
  t = t.slice(r.prefix.length);
  let i = 0;
  while (i < t.length && WS.has(t.charCodeAt(i))) i++;
  return caseOf(r, t.slice(i));
}

/** Layout and export name (src/internal/processModel.ts:80-83, src/io/reference-model.ts:293-296): trims around the body. */
export function layoutName(policy, text) {
  const s = text ?? "";
  const role = roleFor(policy, s);
  if (!role) return null;
  const r = roleOf(policy, role);
  const u = r.trim === "ecma262-2024-start" ? trimBoth(s) : s;
  return caseOf(r, trimBoth(u.slice(r.prefix.length)));
}

/** Inserted text (palette creation, draw.io decoding, Sparx application annotations). */
export function insert(policy, role, body) {
  const r = roleOf(policy, role);
  if (!r) return null;
  return r.prefix + policy.classification.insertSeparator + body;
}

/** Text-annotation kind under a renderer family (annotated, recolor, flat); see README "x24.classify.kind". */
export function annotationKind(family, role) {
  if (family === "annotated") return role ?? null;
  if (family === "recolor") return role === "document" ? "doc" : role === "application" ? "app" : "annotation";
  return role === "document" ? "document" : "application";
}

// ------------------------------------------------------------------ metrics (src/internal/textMetrics.ts:43-84)
export function charWidth(policy, ch, size, bold) {
  const m = policy.metrics;
  let code = ch.charCodeAt(0);
  if (code < 32 || code > 126) {
    const alias = m.aliases.find((a) => a.from === ch);
    code = alias ? alias.to.charCodeAt(0) : -1;
  }
  const table = bold ? m.bold : m.regular;
  const w = code >= 32 && code <= 126 ? table[code - 32] : m.fallback;
  return (w * size) / 1000;
}
export function textWidth(policy, text, size, bold = false) {
  let sum = 0;
  for (const ch of text ?? "") sum += charWidth(policy, ch, size, bold);
  return sum;
}
export function wrapText(policy, text, size, maxWidth, bold = false) {
  const lines = [];
  for (const para of (text ?? "").split("\n")) {
    let cur = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      const cand = cur ? `${cur} ${word}` : word;
      if (textWidth(policy, cand, size, bold) <= maxWidth) {
        cur = cand;
        continue;
      }
      if (cur) lines.push(cur);
      cur = "";
      while (textWidth(policy, word, size, bold) > maxWidth && word.length > 1) {
        let cut = word.length;
        while (cut > 1 && textWidth(policy, word.slice(0, cut), size, bold) > maxWidth) cut -= 1;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      cur = word;
    }
    lines.push(cur);
  }
  return lines.length ? lines : [""];
}

// ------------------------------------------------------------------ swimlane sizes (src/internal/swimlaneLayout.ts:86-152)
const L = (policy) => policy.presentation.layout;
const lh = (policy) => policy.metrics.lineHeight;
export function fit(policy, text, size, o) {
  const padX = o.padX ?? 8;
  const padY = o.padY ?? 6;
  const oneLine = textWidth(policy, text, size, o.bold) + 2 * padX;
  let w;
  let lines;
  if (oneLine <= o.maxW) {
    w = Math.max(o.minW, oneLine);
    lines = 1;
  } else {
    w = o.maxW;
    lines = wrapText(policy, text, size, o.maxW - 2 * padX, o.bold).length;
  }
  const h = Math.max(o.minH, lines * size * lh(policy) + 2 * padY + (o.extraH ?? 0));
  return [Math.ceil(w), Math.ceil(h)];
}
export function labelBox(policy, text, size, maxW, bold = false) {
  if (!(text ?? "").trim()) return [0, 0];
  const lines = wrapText(policy, text, size, maxW, bold);
  const w = Math.max(...lines.map((l) => textWidth(policy, l, size, bold)));
  return [Math.ceil(Math.min(maxW, w) + 4), Math.ceil(lines.length * size * lh(policy) + 2)];
}
/** Badge size used by the layout (swimlaneLayout.ts:115-122). */
export function badgeSize(policy, name, hostW) {
  const a = L(policy).appBadge;
  const wanted = textWidth(policy, name, a.font, true) + a.chrome;
  const maxW = Math.max(a.minWidth, hostW - 2 * a.margin);
  const w = Math.trunc(Math.min(maxW, Math.max(a.minWidth, Math.ceil(wanted))));
  if (wanted <= w) return [w, a.height];
  const lines = wrapText(policy, name, a.font, w - a.chrome, true).length;
  return [w, Math.trunc(Math.max(a.height, Math.ceil(lines * a.font * lh(policy) + 8)))];
}
/** Minimum host width for a badge (swimlaneLayout.ts:124-128). */
export function badgeMinHostWidth(policy, name) {
  const a = L(policy).appBadge;
  const words = (name ?? "").split(/\s+/).filter(Boolean);
  const longest = words.length ? Math.max(...words.map((w) => textWidth(policy, w, a.font, true))) : 0;
  return Math.trunc(Math.ceil(longest + a.chrome + 2 * a.margin));
}
/** Document node height (swimlaneLayout.ts:130-133). */
export function documentHeight(policy, label) {
  const l = L(policy);
  const d = l.document;
  const block = wrapText(policy, label, l.labelFontSize, d.width - 2 * d.padX).length * l.labelFontSize * lh(policy);
  return Math.trunc(Math.max(d.minHeight, Math.ceil((d.textTop + block + d.padBottom) / d.waveTop)));
}
const sizeOf = (policy, slot) => {
  const s = L(policy).nodeSizes.find((n) => n.kind === slot);
  return s ? [s.width, s.height] : null;
};
export const FLOW_SLOTS = new Set(["start", "end", "task", "subprocess", "gateway", "event", "call"]);
export const ACTIVITY_SLOTS = new Set(["task", "subprocess", "call"]);
export const ARTIFACT_SLOTS = new Set(["object-in", "object-out", "port-in", "port-out", "document"]);
/** Node size of a slot (swimlaneLayout.ts:140-152); `eligible` tells whether the host may carry a badge. */
export function nodeSize(policy, slot, label, app, eligible) {
  const l = L(policy);
  const a = l.appBadge;
  const appText = eligible ? String(app || "") : "";
  const task = sizeOf(policy, "task");
  const call = sizeOf(policy, "call");
  const own = slot === "subprocess" ? sizeOf(policy, "subprocess") : task;
  const minW = appText ? Math.min(200, Math.max(own[0], badgeMinHostWidth(policy, appText))) : own[0];
  if (slot === "task" || slot === "subprocess") return fit(policy, label, l.fontSize, { minW, maxW: Math.max(200, minW), minH: own[1], padX: 8, padY: 8, extraH: appText ? a.overlap : 0 });
  if (slot === "call") return fit(policy, label, l.fontSize, { minW: Math.max(call[0], appText ? minW : call[0]), maxW: 200, minH: call[1], padX: 14, padY: 8, extraH: 10 });
  if (slot === "document") return [l.document.width, documentHeight(policy, label)];
  return sizeOf(policy, slot) ?? task;
}

/** BPMN 2.0 supertypes of the native types used by the sealed vectors (descriptor subtype closure). */
const SUPER = {
  "bpmn:Task": ["bpmn:Activity"], "bpmn:UserTask": ["bpmn:Task", "bpmn:Activity"], "bpmn:ServiceTask": ["bpmn:Task", "bpmn:Activity"],
  "bpmn:SubProcess": ["bpmn:Activity"], "bpmn:Transaction": ["bpmn:SubProcess", "bpmn:Activity"], "bpmn:CallActivity": ["bpmn:Activity"],
};
export const isA = (type, of) => type === of || (SUPER[type] ?? []).includes(of);
/** Badge eligibility of a native host type under attachment.applicationHost (exact type, or descriptor subtype). */
export function eligibleHost(policy, nativeType) {
  const h = policy.attachment.applicationHost;
  return h.mode === "exact" ? nativeType === h.type : isA(nativeType, h.type);
}
export const SLOT_TYPE = { task: "bpmn:Task", subprocess: "bpmn:SubProcess", call: "bpmn:CallActivity" };

// ------------------------------------------------------------------ swimlane layout (swimlaneLayout.ts:217-617), longest-path columns
const LEFT_PAD = 40;
const COL_GAP = 70;
const ROW_GAP = 24;
const RIGHT_PAD = 70;
const GROUP_GAP = 10;
const CENTRE_GAP = 10;
const bx = (x, y, w, h) => ({ x, y, w, h });
const cxOf = (b) => b.x + Math.floor(b.w / 2);
const cyOf = (b) => b.y + Math.floor(b.h / 2);

/**
 * Layout of one neutral layout-input process: {pool, lanes: [[name, box]], nodes, edges, edgeLabels,
 * connections, apps, labels}. Nodes carry {kind (slot), id, text?, application?, attachedTo?, direction?};
 * connections {source, target, kind: sequence | data | document, label?}. Columns are the longest-path
 * layering (the pure option of the base layout); generic spacing constants are those of the base.
 */
export function layoutProcess(policy, proc, originY = 0) {
  const l = L(policy);
  const a = l.appBadge;
  const lanes = proc.lanes ?? [];
  const laneOf = new Map();
  const kind = new Map();
  const nodeOf = new Map();
  const flowOrder = [];
  const known = new Set(l.nodeSizes.map((n) => n.kind));
  lanes.forEach((lane, li) => {
    for (const n of lane.nodes ?? []) {
      if (laneOf.has(n.id)) continue;
      laneOf.set(n.id, li);
      kind.set(n.id, known.has(n.kind) ? n.kind : "task");
      nodeOf.set(n.id, n);
      if (FLOW_SLOTS.has(kind.get(n.id))) flowOrder.push(n.id);
    }
  });
  const textOf = (n) => n.text ?? n.id ?? "";
  const flowSet = new Set(flowOrder);
  const allConns = (proc.connections ?? []).filter((c) => laneOf.has(c.source) && laneOf.has(c.target));
  const flow = allConns.filter((c) => c.kind === "sequence" && flowSet.has(c.source) && flowSet.has(c.target));
  const other = allConns.filter((c) => c.kind !== "sequence");
  const succ = new Map();
  for (const c of flow) succ.set(c.source, [...(succ.get(c.source) ?? []), c.target]);
  const starts = [...flowOrder.filter((n) => kind.get(n) === "start"), ...flowOrder];
  const back = new Set();
  const key2 = (x, y) => `${x}\u0000${y}`;
  const state = new Map();
  for (const root of starts) {
    if (state.has(root)) continue;
    const stack = [[root, 0]];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const nexts = succ.get(top[0]) ?? [];
      if (top[1] >= nexts.length) {
        state.set(top[0], 2);
        stack.pop();
        continue;
      }
      const nxt = nexts[top[1]++];
      const s = state.get(nxt) ?? 0;
      if (s === 1) back.add(key2(top[0], nxt));
      else if (s === 0) {
        state.set(nxt, 1);
        stack.push([nxt, 0]);
      }
    }
  }
  const indeg = new Map(flowOrder.map((n) => [n, 0]));
  const fsucc = new Map();
  for (const c of flow) {
    if (back.has(key2(c.source, c.target))) continue;
    indeg.set(c.target, indeg.get(c.target) + 1);
    fsucc.set(c.source, [...(fsucc.get(c.source) ?? []), c.target]);
  }
  const rank = new Map(flowOrder.map((n) => [n, 0]));
  const q = flowOrder.filter((n) => indeg.get(n) === 0);
  while (q.length) {
    const n = q.shift();
    for (const t of fsucc.get(n) ?? []) {
      rank.set(t, Math.max(rank.get(t), rank.get(n) + 1));
      indeg.set(t, indeg.get(t) - 1);
      if (indeg.get(t) === 0) q.push(t);
    }
  }
  const slots = new Map();
  const row = new Map();
  const rk = (li, r) => `${li}:${r}`;
  for (const n of flowOrder) {
    const k = rk(laneOf.get(n), rank.get(n));
    row.set(n, slots.get(k) ?? 0);
    slots.set(k, (slots.get(k) ?? 0) + 1);
  }
  const laneRows = lanes.map((_, li) => {
    const v = [...slots.entries()].filter(([k]) => Number(k.split(":")[0]) === li).map(([, n]) => n);
    return v.length ? Math.max(...v) : 1;
  });
  const maxRank = rank.size ? Math.max(...rank.values()) : 0;
  const size = new Map();
  for (const [n, nd] of nodeOf) {
    const k = kind.get(n);
    size.set(n, nodeSize(policy, k, textOf(nd), nd.application, ACTIVITY_SLOTS.has(k) && eligibleHost(policy, SLOT_TYPE[k])));
  }
  const labelsWh = new Map();
  for (const [n, nd] of nodeOf) {
    const k = kind.get(n);
    if (k === "start" || k === "end" || k === "event" || k === "gateway") labelsWh.set(n, labelBox(policy, textOf(nd), l.labelFontSize, l.labelMaxWidth.event));
    else if (ARTIFACT_SLOTS.has(k) && k !== "document") labelsWh.set(n, labelBox(policy, textOf(nd), l.labelFontSize, l.labelMaxWidth.item));
  }
  const appWh = new Map();
  for (const n of flowOrder) {
    const nd = nodeOf.get(n);
    const k = kind.get(n);
    if (nd.application && ACTIVITY_SLOTS.has(k) && eligibleHost(policy, SLOT_TYPE[k])) appWh.set(n, badgeSize(policy, String(nd.application), size.get(n)[0]));
  }
  const docs = new Map();
  const ins = new Map();
  const outs = new Map();
  const loose = new Map();
  const push = (m, k, v) => m.set(k, [...(m.get(k) ?? []), v]);
  for (const [id, nd] of nodeOf) {
    if (!ARTIFACT_SLOTS.has(kind.get(id))) continue;
    const host = nd.attachedTo && rank.has(nd.attachedTo) ? nd.attachedTo : null;
    if (host === null) {
      push(loose, laneOf.get(id), id);
      continue;
    }
    const dir = nd.direction || "in";
    push(dir === "document" ? docs : dir === "in" ? ins : outs, host, id);
  }
  const lw0 = (id) => labelsWh.get(id) ?? [0, 0];
  const blockW = (id) => (kind.get(id) === "document" ? size.get(id)[0] : Math.max(size.get(id)[0], lw0(id)[0]));
  const itemH = (id) => size.get(id)[1] + (lw0(id)[1] ? 4 + lw0(id)[1] : 0);
  const groupW = (items) => items.reduce((acc, i) => acc + blockW(i), 0) + GROUP_GAP * Math.max(0, items.length - 1);
  const splitDocs = (n) => {
    const d = docs.get(n) ?? [];
    const half = Math.floor((d.length + 1) / 2);
    return [d.slice(0, half), d.slice(half)];
  };
  const docRowH = new Map();
  for (const [host, ds] of docs) {
    const k = rk(laneOf.get(host), row.get(host));
    for (const d of ds) docRowH.set(k, Math.max(docRowH.get(k) ?? 0, size.get(d)[1]));
  }
  for (const [host, ds] of docs) {
    const k = rk(laneOf.get(host), row.get(host));
    for (const d of ds) size.set(d, [size.get(d)[0], docRowH.get(k)]);
  }
  const rowHalf = new Map();
  for (const n of flowOrder) {
    const k = rk(laneOf.get(n), row.get(n));
    rowHalf.set(k, Math.max(rowHalf.get(k) ?? 0, size.get(n)[1] / 2));
  }
  const ext = new Map();
  for (const n of flowOrder) {
    const [w, h] = size.get(n);
    const [leftDocs, rightDocs] = splitDocs(n);
    const k = rk(laneOf.get(n), row.get(n));
    const ds = docs.get(n) ?? [];
    const up = h / 2 + (ds.length ? rowHalf.get(k) - h / 2 + Math.max(...ds.map((d) => size.get(d)[1])) + 14 : 0);
    const appHalf = appWh.has(n) ? appWh.get(n)[0] / 2 : 0;
    let below = 0;
    if (appWh.has(n)) below = appWh.get(n)[1] - a.overlap;
    const itemStart = below + 14;
    const its = [...(ins.get(n) ?? []), ...(outs.get(n) ?? [])];
    if (its.length) below = itemStart + Math.max(...its.map(itemH));
    if (labelsWh.has(n) && lw0(n)[1]) below = Math.max(below, 4 + lw0(n)[1]);
    const side = Math.max(appHalf, CENTRE_GAP);
    const left = Math.max(w / 2, CENTRE_GAP + groupW(leftDocs), side + 8 + groupW(ins.get(n) ?? []), lw0(n)[0] / 2);
    const right = Math.max(w / 2, CENTRE_GAP + groupW(rightDocs), side + 8 + groupW(outs.get(n) ?? []), lw0(n)[0] / 2);
    ext.set(n, { left, right, up, down: h / 2 + below, itemStart });
  }
  const contentX = l.poolHeader + l.laneHeader + LEFT_PAD;
  const colMax = (c, f) => {
    const v = flowOrder.filter((n) => rank.get(n) === c).map((n) => f(ext.get(n)));
    return v.length ? Math.max(...v) : 60;
  };
  const colLeft = [];
  const colRight = [];
  for (let c = 0; c <= maxRank; c++) {
    colLeft.push(colMax(c, (e) => e.left));
    colRight.push(colMax(c, (e) => e.right));
  }
  const colX = [];
  let x = contentX;
  for (let c = 0; c <= maxRank; c++) {
    x += colLeft[c] ?? 0;
    colX.push(x);
    x += (colRight[c] ?? 0) + COL_GAP;
  }
  const looseW = lanes.map((_, li) => (loose.get(li) ?? []).reduce((acc, i) => acc + blockW(i) + GROUP_GAP, 0));
  const poolW = Math.trunc(Math.max(x - COL_GAP + RIGHT_PAD, contentX + (looseW.length ? Math.max(...looseW) : 0) + RIGHT_PAD));
  const rowUp = new Map();
  const rowDown = new Map();
  for (const n of flowOrder) {
    const k = rk(laneOf.get(n), row.get(n));
    rowUp.set(k, Math.max(rowUp.get(k) ?? 0, ext.get(n).up));
    rowDown.set(k, Math.max(rowDown.get(k) ?? 0, ext.get(n).down));
  }
  const rowTop = new Map();
  const rowCy = new Map();
  const laneBoxes = [];
  const looseY = new Map();
  let y = originY;
  lanes.forEach((lane, li) => {
    const top = y;
    for (let r = 0; r < (laneRows[li] ?? 1); r++) {
      const k = rk(li, r);
      const up = rowUp.has(k) ? rowUp.get(k) : 40;
      const down = rowDown.has(k) ? rowDown.get(k) : 40;
      rowTop.set(k, y);
      rowCy.set(k, Math.trunc(y + l.channel + up));
      y = Math.trunc(y + l.channel + up + down + ROW_GAP);
    }
    const ls = loose.get(li) ?? [];
    if (ls.length) {
      looseY.set(li, y);
      y += Math.max(...ls.map((i) => (kind.get(i) !== "document" ? itemH(i) : size.get(i)[1]))) + ROW_GAP;
    }
    const h = Math.max(l.minLaneHeight, y - top);
    y = top + h;
    laneBoxes.push([lane.name || "", bx(l.poolHeader, top, poolW - l.poolHeader, h)]);
  });
  const pool = bx(0, originY, poolW, Math.max(y - originY, l.minLaneHeight));
  const nodes = {};
  const labels = {};
  const apps = {};
  const placeItem = (i, ix, top, bw) => {
    const [w, h] = size.get(i);
    const c = ix + Math.floor(bw / 2);
    nodes[i] = bx(c - Math.floor(w / 2), top, w, h);
    if (lw0(i)[1]) {
      const [lw, lhh] = lw0(i);
      labels[i] = bx(c - Math.floor(lw / 2), top + h + 4, lw, lhh);
    }
  };
  for (const n of flowOrder) {
    const [w, h] = size.get(n);
    const k = rk(laneOf.get(n), row.get(n));
    const ncx = Math.trunc(colX[rank.get(n)] ?? 0);
    const ncy = rowCy.get(k);
    const b = bx(ncx - Math.floor(w / 2), ncy - Math.floor(h / 2), w, h);
    nodes[n] = b;
    if (lw0(n)[1]) {
      const [lw, lhh] = lw0(n);
      labels[n] = bx(ncx - Math.floor(lw / 2), b.y + b.h + 4, lw, lhh);
    }
    if (appWh.has(n)) {
      const [aw, ah] = appWh.get(n);
      apps[n] = bx(ncx - Math.floor(aw / 2), b.y + b.h - a.overlap, aw, ah);
    }
    const [leftDocs, rightDocs] = splitDocs(n);
    const docBottom = ncy - Math.trunc(rowHalf.get(k)) - 14;
    let xr = ncx - CENTRE_GAP;
    for (const d of [...leftDocs].reverse()) {
      const [dw, dh] = size.get(d);
      xr -= dw;
      nodes[d] = bx(xr, docBottom - dh, dw, dh);
      xr -= GROUP_GAP;
    }
    let xl = ncx + CENTRE_GAP;
    for (const d of rightDocs) {
      const [dw, dh] = size.get(d);
      nodes[d] = bx(xl, docBottom - dh, dw, dh);
      xl += dw + GROUP_GAP;
    }
    const side = Math.max(apps[n] ? Math.floor(apps[n].w / 2) : 0, CENTRE_GAP) + 8;
    const top = Math.trunc(ncy + h / 2 + ext.get(n).itemStart);
    xr = ncx - side;
    for (const i of [...(ins.get(n) ?? [])].reverse()) {
      const bw = blockW(i);
      xr -= bw;
      placeItem(i, xr, top, bw);
      xr -= GROUP_GAP;
    }
    xl = ncx + side;
    for (const i of outs.get(n) ?? []) {
      const bw = blockW(i);
      placeItem(i, xl, top, bw);
      xl += bw + GROUP_GAP;
    }
  }
  for (const [li, items] of loose) {
    let xl = contentX;
    for (const i of items) {
      const bw = blockW(i);
      if (kind.get(i) === "document") nodes[i] = bx(xl, looseY.get(li), size.get(i)[0], size.get(i)[1]);
      else placeItem(i, xl, looseY.get(li), bw);
      xl += bw + GROUP_GAP;
    }
  }
  const at = (id) => nodes[id];
  const edges = [];
  const edgeLabels = [];
  const channelUse = new Map();
  const channel = (n) => {
    const k = rk(laneOf.get(n), row.get(n));
    const used = channelUse.get(k) ?? 0;
    channelUse.set(k, used + 1);
    return rowTop.get(k) + 8 + (used % 3) * 5;
  };
  const upper = (p, r) => (cyOf(at(p)) <= cyOf(at(r)) ? p : r);
  const blocked = (yy, x0, x1, skip) => {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    return flowOrder.some((n) => !skip.includes(n) && at(n).x < hi && at(n).x + at(n).w > lo && at(n).y <= yy && yy <= at(n).y + at(n).h);
  };
  const gapX = (c) => Math.trunc((colX[c] ?? 0) - (colLeft[c] ?? 0) - COL_GAP / 2);
  for (const c of flow) {
    const sn = c.source;
    const tn = c.target;
    const s = at(sn);
    const t = at(tn);
    let pts;
    if (back.has(key2(sn, tn)) || cxOf(t) < cxOf(s)) {
      const high = channel(upper(sn, tn));
      pts = [[cxOf(s), s.y], [cxOf(s), high], [cxOf(t), high], [cxOf(t), t.y]];
    } else if (cxOf(t) === cxOf(s)) {
      const below = cyOf(t) > cyOf(s);
      const bottomEnd = below ? sn : tn;
      if (apps[bottomEnd] || (ins.get(bottomEnd) ?? []).length || (outs.get(bottomEnd) ?? []).length) {
        const xr = Math.trunc((colX[rank.get(sn)] ?? 0) + (colRight[rank.get(sn)] ?? 0) + 14);
        pts = [[s.x + s.w, cyOf(s)], [xr, cyOf(s)], [xr, cyOf(t)], [t.x + t.w, cyOf(t)]];
      } else if (below) pts = [[cxOf(s), s.y + s.h], [cxOf(t), t.y]];
      else pts = [[cxOf(s), s.y], [cxOf(t), t.y + t.h]];
    } else {
      const mx = gapX(rank.get(tn));
      const sameRow = Math.abs(cyOf(s) - cyOf(t)) < 2;
      if (sameRow && !blocked(cyOf(s), s.x + s.w, t.x, [sn, tn])) pts = [[s.x + s.w, cyOf(s)], [t.x, cyOf(t)]];
      else if (!sameRow && !blocked(cyOf(s), s.x + s.w, mx, [sn, tn])) pts = [[s.x + s.w, cyOf(s)], [mx, cyOf(s)], [mx, cyOf(t)], [t.x, cyOf(t)]];
      else if (sameRow) {
        const high = channel(sn);
        pts = [[cxOf(s), s.y], [cxOf(s), high], [cxOf(t), high], [cxOf(t), t.y]];
      } else {
        const high = channel(sn);
        pts = [[cxOf(s), s.y], [cxOf(s), high], [mx, high], [mx, cyOf(t)], [t.x, cyOf(t)]];
      }
    }
    edges.push(pts);
    if (c.label) {
      const [lw, lhh] = labelBox(policy, c.label, l.labelFontSize, 120);
      const [p0, p1, p2, p3] = pts;
      const elbow = pts.length === 4 && p1[0] === p2[0] && p0[1] === p1[1];
      const [[x1, y1], [x2, y2]] = elbow ? [p2, p3] : [p0, p1];
      if (elbow) edgeLabels.push(bx(x2 - lw - 4, y2 - lhh - 2, lw, lhh));
      else if (x1 === x2) edgeLabels.push(bx(x1 + 4, Math.floor((y1 + y2) / 2) - Math.floor(lhh / 2), lw, lhh));
      else edgeLabels.push(bx(Math.floor((x1 + x2) / 2) - Math.floor(lw / 2), Math.min(y1, y2) - lhh - 2, lw, lhh));
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
    const srcIsItem = ARTIFACT_SLOTS.has(kind.get(c.source));
    const [artN, actN] = srcIsItem ? [c.source, c.target] : [c.target, c.source];
    const own = nodeOf.get(artN).attachedTo === actN;
    let pts = linkRoute(artN, actN, at(artN), at(actN), kind, apps, colX, colLeft, rank, own);
    if (!srcIsItem) pts = [...pts].reverse();
    edges.push(pts);
    edgeLabels.push(null);
  }
  return { pool, lanes: laneBoxes, nodes, edges, edgeLabels, connections: [...flow, ...other], apps, labels };
}
function linkRoute(artN, actN, art, act, kind, apps, colX, colLeft, rank, own) {
  const gx = rank.has(actN) ? Math.trunc((colX[rank.get(actN)] ?? 0) - (colLeft[rank.get(actN)] ?? 0) - 12) : act.x - 12;
  if (kind.get(artN) === "document") {
    const lo = act.x + 14;
    const hi = act.x + act.w - 14;
    const top = act.y;
    const yy = act.y - 7;
    if (own) {
      if (lo <= cxOf(art) && cxOf(art) <= hi) return [[cxOf(art), art.y + art.h], [cxOf(art), top]];
      const xx = cxOf(art) < cxOf(act) ? lo : hi;
      return [[cxOf(art), art.y + art.h], [cxOf(art), yy], [xx, yy], [xx, top]];
    }
    const ay = art.y + art.h + 6;
    return [[cxOf(art), art.y + art.h], [cxOf(art), ay], [gx, ay], [gx, yy], [lo, yy], [lo, top]];
  }
  const app = apps[actN];
  const [lo, hi, bottom] = app ? [app.x + 6, app.x + app.w - 6, app.y + app.h] : [act.x + 8, act.x + act.w - 8, act.y + act.h];
  const yy = bottom + 7;
  if (own) {
    if (lo <= cxOf(art) && cxOf(art) <= hi) return [[cxOf(art), art.y], [cxOf(art), bottom]];
    const xx = cxOf(art) < cxOf(act) ? lo : hi;
    return [[cxOf(art), art.y], [cxOf(art), yy], [xx, yy], [xx, bottom]];
  }
  const ay = art.y - 8;
  return [[cxOf(art), art.y], [cxOf(art), ay], [gx, ay], [gx, yy], [lo, yy], [lo, bottom]];
}

// ------------------------------------------------------------------ annotated look helpers (src/profiles/<annotated look>/style.ts:141-198)
/** Badge size drawn by the annotated look (style.ts:143-150). */
export function badgeBox(policy, name, hostWidth) {
  const a = L(policy).appBadge;
  const wanted = textWidth(policy, name, a.font, true) + a.chrome;
  const maxWidth = Math.max(a.minWidth, hostWidth - 2 * a.margin);
  const width = Math.min(maxWidth, Math.max(a.minWidth, Math.ceil(wanted)));
  if (wanted <= width) return { width, height: a.height };
  const lines = wrapText(policy, name, a.font, width - a.chrome, true).length;
  return { width, height: Math.max(a.height, Math.ceil(lines * a.font * lh(policy) + 8)) };
}
/** Badge row of a host, relative to the host (style.ts:161-171). */
export function badgeRow(policy, names, hostWidth, hostHeight) {
  const a = L(policy).appBadge;
  const sizes = names.map((n) => badgeBox(policy, n, hostWidth));
  const total = sizes.reduce((acc, s) => acc + s.width, 0) + a.gap * Math.max(0, names.length - 1);
  let x = (hostWidth - total) / 2;
  return names.map((name, i) => {
    const box = { name, x, y: hostHeight - a.overlap, width: sizes[i].width, height: sizes[i].height };
    x += sizes[i].width + a.gap;
    return box;
  });
}
/** Area of the document name (style.ts:191-198). */
export function documentTextBox(policy, w, h) {
  const d = L(policy).document;
  return { x: d.padX, y: d.textTop, width: w - 2 * d.padX, height: Math.max(0, h * d.waveTop - d.textTop - d.padBottom) };
}

// ------------------------------------------------------------------ tokens (<annotated look>/tokens.ts:82-105, <recolouring look>/tokens.ts:1-28, style.ts:112-121)
export const STROKE_KEYS = ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"];
export function shade(hex, factor) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const scale = (i) => Math.max(0, Math.min(255, Math.round(parseInt(m[1].slice(i, i + 2), 16) * factor))).toString(16).padStart(2, "0");
  return `#${scale(0)}${scale(2)}${scale(4)}`;
}
export function resolveTokens(defaults, overrides = {}) {
  const given = {};
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) given[k] = v;
  const out = { ...defaults };
  if (typeof given.stroke === "string") for (const k of STROKE_KEYS) out[k] = given.stroke;
  if (typeof given.fill === "string") out.taskFill = given.fill;
  Object.assign(out, given);
  if (given.docLink === undefined && given.link !== undefined) out.docLink = out.link;
  if (given.laneHeaderFill === undefined && given.laneFill !== undefined) out.laneHeaderFill = out.laneFill;
  if (given.taskFillEnd === undefined && typeof out.taskFill === "string" && out.taskFill !== defaults.taskFill) out.taskFillEnd = shade(out.taskFill, 0.95);
  return out;
}
export function resolveRecolor(defaults, overrides = {}) {
  const resolved = resolveTokens(defaults, overrides);
  return overrides.labelText === undefined ? { ...resolved, labelText: resolved.text } : resolved;
}
export function namedTokens(overrides = {}) {
  const names = new Set();
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) names.add(k);
  if (names.has("stroke")) for (const k of STROKE_KEYS) names.add(k);
  if (names.has("fill")) names.add("taskFill");
  if (names.has("text")) names.add("labelText");
  return [...names];
}

// ------------------------------------------------------------------ navigation (src/react/workshop.tsx:130-174)
const fold = (s) => trimBoth(s ?? "").toLowerCase();
/** Legacy default target: called element by id or name, then the element name, never the shown diagram. */
export function legacyDefault(click, diagrams, activeId) {
  const others = diagrams.filter((d) => d.id !== activeId);
  const called = fold(click.calledElement);
  if (called) {
    const hit = others.find((d) => fold(d.id) === called || fold(d.name) === called);
    if (hit) return hit.id;
  }
  const title = fold(click.name);
  if (!title) return null;
  return others.find((d) => fold(d.name) === title)?.id ?? null;
}
const SECTION_PATTERN = /\b\d+(?:\.\d+)+\b/;
/** Legacy rule target: diagrams in order, the shown one skipped, the first diagram matching an enabled rule. */
export function legacyRules(rules, click, diagrams, activeId) {
  const on = new Set(rules);
  const title = fold(click.name);
  const called = fold(click.calledElement);
  const isSub = click.type === "bpmn:SubProcess" || click.type === "bpmn:CallActivity" || !!called;
  if (!isSub && !title) return null;
  for (const d of diagrams) {
    if (d.id === activeId) continue;
    const dn = fold(d.name);
    if (on.has("called-element") && called && (fold(d.id) === called || dn === called)) return d.id;
    if (!title) continue;
    if (on.has("name-equal") && dn === title) return d.id;
    if (on.has("section-equal")) {
      const p = SECTION_PATTERN.exec(title)?.[0];
      const r = SECTION_PATTERN.exec(dn)?.[0];
      if (p && r && p === r) return d.id;
    }
    if (on.has("name-overlap") && dn && (dn.includes(title) || title.includes(dn))) return d.id;
  }
  return null;
}
/** Native navigation (DESIGN.md:623) over index entries {diagramId, semanticRootId, processId?, label, order}. */
export function calledElementTarget(click, index, activeDiagramId) {
  const process = click.calledElement;
  if (!process) return { kind: "none" };
  if (!index.processes.includes(process)) return { kind: "refused", code: "reference-dangling" };
  const views = index.entries.filter((e) => e.processId === process).sort((p, r) => p.order - r.order || (p.diagramId < r.diagramId ? -1 : p.diagramId > r.diagramId ? 1 : 0));
  if (!views.length) return { kind: "refused", code: "navigation-view-missing" };
  if (views.some((v) => v.diagramId === activeDiagramId)) return { kind: "current", diagramId: activeDiagramId };
  if (views.length === 1) return { kind: "open", diagramId: views[0].diagramId };
  return { kind: "chooser", diagramIds: views.map((v) => v.diagramId) };
}
/** Navigation by mode: called-element (native index), legacy-default, legacy-rules. */
export function navigate(policy, vector, index) {
  const nav = policy.navigation;
  if (nav.mode === "called-element") return calledElementTarget(vector.click, index, vector.activeDiagramId);
  const target = nav.mode === "legacy-default" ? legacyDefault(vector.click, vector.diagrams, vector.activeId) : legacyRules(nav.rules, vector.click, vector.diagrams, vector.activeId);
  return { kind: target === null ? "none" : "open", ...(target === null ? {} : { diagramId: target }) };
}

// ------------------------------------------------------------------ number formatting of the reference serialisers (src/io/pyserial.ts)
/** Python round(x, 3): round half to even on the exact binary value (src/io/pyserial.ts:6-19); -0 becomes 0. */
export function pyRound3(x) {
  const s = x.toFixed(25);
  const neg = s.startsWith("-");
  const [int, frac = ""] = (neg ? s.slice(1) : s).split(".");
  const rest = frac.slice(3);
  let digits = BigInt(int + frac.slice(0, 3));
  const tie = rest[0] === "5" && /^0*$/.test(rest.slice(1));
  if (rest[0] > "5" || (rest[0] === "5" && !tie)) digits += 1n;
  else if (tie && digits % 2n === 1n) digits += 1n;
  const v = Number(digits) / 1000;
  return neg && v !== 0 ? -v : 0 + v;
}

// ------------------------------------------------------------------ reference page model (src/io/reference-model.ts:142-398)
export class ExportRefusal extends Error {
  constructor(code, ids) {
    super(code);
    this.code = code;
    this.ids = ids;
  }
}
const FLOW_KIND = { "bpmn:StartEvent": "start", "bpmn:EndEvent": "end", "bpmn:Task": "task", "bpmn:SubProcess": "subprocess", "bpmn:CallActivity": "call", "bpmn:ExclusiveGateway": "gateway", "bpmn:ParallelGateway": "gateway", "bpmn:IntermediateThrowEvent": "event" };
const ARTIFACT_TYPE = new Set(["bpmn:DataObjectReference", "bpmn:DataInput", "bpmn:DataOutput", "bpmn:TextAnnotation"]);
const RELATION_TYPE = new Set(["bpmn:Association", "bpmn:DataInputAssociation", "bpmn:DataOutputAssociation"]);
/**
 * Reference pages of a scene (derive/scenes.mjs format) under the injected policy and descriptor package
 * {id, uri}: the semantic checks of validateSemantics (facts read through exportFacts) and readPage, in
 * neutral form. Facts of another namespace version of the injected family refuse; facts of another
 * descriptor are not read.
 */
export function referencePages(policy, scene, descriptor) {
  const ef = policy.exportFacts;
  if (ef.descriptorId !== descriptor.id) throw new ExportRefusal("profile-symbol", [ef.descriptorId]);
  const factsOf = new Map();
  const all = (proc) => proc.flowElements.flatMap((e) => [e, ...(e.dataInputAssociations ?? []), ...(e.dataOutputAssociations ?? [])]).concat(proc.artifacts);
  for (const proc of scene.processes) {
    const orders = new Set();
    const laneIds = new Set(proc.lanes.map((l) => l.id));
    const ids = new Set(all(proc).map((e) => e.id));
    for (const e of all(proc)) {
      const f = e.facts;
      if (!f) continue;
      if (f.uri !== descriptor.uri && f.uri.startsWith(ef.namespaceFamily)) throw new ExportRefusal("unknown-semantics-version", [e.id]);
      if (f.uri !== descriptor.uri || `${f.prefix}:${f.type}` !== ef.extensionType) continue;
      const fx = {};
      for (const [field, name] of Object.entries(ef.properties)) if (name in f.props) fx[field] = f.props[name];
      factsOf.set(e.id, fx);
      const bad = () => new ExportRefusal("invalid-semantics", [e.id]);
      if (fx.order !== undefined) {
        if (!Number.isSafeInteger(fx.order) || fx.order < 0 || orders.has(fx.order)) throw bad();
        orders.add(fx.order);
      }
      if (fx.direction !== undefined && (e.type !== "bpmn:DataObjectReference" || !["in", "out"].includes(fx.direction))) throw bad();
      if (fx.label !== undefined && !RELATION_TYPE.has(e.type)) throw bad();
      if (fx.lane !== undefined && (!ARTIFACT_TYPE.has(e.type) || !laneIds.has(fx.lane))) throw bad();
      if (fx.primary !== undefined && (!ARTIFACT_TYPE.has(e.type) || !ids.has(fx.primary) || !RELATION_TYPE.has(all(proc).find((x) => x.id === fx.primary).type))) throw bad();
      if (fx.process !== undefined && (!["bpmn:Task", "bpmn:SubProcess"].includes(e.type) || !scene.processes.some((p) => p.id === fx.process))) throw bad();
    }
  }
  return scene.processes.map((proc, index) => readPage(policy, scene, proc, index, factsOf));
}
function readPage(policy, scene, proc, index, factsOf) {
  const participant = scene.collaboration?.participant?.processRef === proc.id ? scene.collaboration.participant : null;
  const semantic = [...proc.flowElements, ...proc.artifacts];
  const typeOf = new Map(semantic.map((e) => [e.id, e.type]));
  const lanes = proc.lanes.map((l) => ({ id: l.id, name: l.name ?? "", box: l.box }));
  const laneOf = new Map();
  proc.lanes.forEach((l, i) => l.members.forEach((id) => laneOf.set(id, i)));
  const rank = new Map();
  semantic.forEach((e, i) => {
    if (e.type !== "bpmn:DataObject") rank.set(e.id, factsOf.get(e.id)?.order ?? i);
  });
  const nodes = new Map();
  const aidNotes = new Map();
  const drawable = semantic.filter((e) => FLOW_KIND[e.type] || ARTIFACT_TYPE.has(e.type));
  for (const e of drawable) {
    const fx = factsOf.get(e.id);
    let label = e.name ?? "";
    let kind = FLOW_KIND[e.type] ?? (e.type === "bpmn:DataInput" ? "port-in" : e.type === "bpmn:DataOutput" ? "port-out" : "object");
    if (e.type === "bpmn:TextAnnotation") {
      const role = roleFor(policy, e.text ?? "");
      if (role === "application") {
        aidNotes.set(e.id, { box: e.box, text: layoutName(policy, e.text) });
        continue;
      }
      if (role !== "document") throw new ExportRefusal("free-annotation", [e.id]);
      kind = "document";
      label = layoutName(policy, e.text);
    }
    const artifact = ARTIFACT_TYPE.has(e.type);
    const li = artifact ? proc.lanes.findIndex((l) => l.id === fx?.lane) : laneOf.get(e.id);
    if (artifact && (li === undefined || li < 0)) throw new ExportRefusal("missing-semantics", [e.id]);
    let target = fx?.process;
    if (e.type === "bpmn:CallActivity" && e.calledElement !== undefined) {
      target = scene.processes.find((p) => p.id === e.calledElement)?.id;
      if (!target) throw new ExportRefusal("invalid-semantics", [e.id]);
    }
    const n = { id: e.id, kind, label, box: e.box, semanticOrder: rank.get(e.id), ...(e.type.endsWith("Gateway") ? { subtype: e.type === "bpmn:ParallelGateway" ? "AND" : "OR" } : {}), ...(target ? { calledProcess: target } : {}), ...(e.labelBox ? { labelBox: e.labelBox } : {}) };
    if (li !== undefined && li >= 0) {
      n.laneIndex = li;
      n.laneName = lanes[li].name;
    }
    nodes.set(e.id, n);
  }
  const apps = new Map();
  const usedNotes = new Set();
  const relations = semantic.filter((e) => e.type === "bpmn:SequenceFlow" || e.type === "bpmn:Association");
  const ownerOf = new Map();
  for (const e of semantic) if (ACTIVITY_SLOTS.has(FLOW_KIND[e.type])) for (const a of [...(e.dataInputAssociations ?? []), ...(e.dataOutputAssociations ?? [])]) {
    relations.push(a);
    ownerOf.set(a.id, e);
  }
  relations.forEach((e, i) => rank.set(e.id, factsOf.get(e.id)?.order ?? i));
  relations.sort((p, q) => rank.get(p.id) - rank.get(q.id));
  const connections = [];
  for (const a of relations) {
    let s = a.source;
    let t = a.target;
    const ck = a.type === "bpmn:SequenceFlow" ? "sequence" : a.type === "bpmn:Association" ? "document" : "data";
    const owner = ownerOf.get(a.id);
    if (owner) {
      if (a.type === "bpmn:DataInputAssociation") t = owner.id;
      else s = owner.id;
    }
    if (a.type === "bpmn:Association" && (aidNotes.has(s) || aidNotes.has(t))) {
      const ann = aidNotes.has(s) ? s : t;
      const host = ann === s ? t : s;
      if (!ACTIVITY_SLOTS.has(nodes.get(host)?.kind) || !eligibleHost(policy, typeOf.get(host))) throw new ExportRefusal("unattached-annotation", [ann]);
      if (usedNotes.has(ann) || apps.has(host)) throw new ExportRefusal("unsupported-element", [a.id]);
      usedNotes.add(ann);
      apps.set(host, aidNotes.get(ann));
      nodes.get(host).application = aidNotes.get(ann).text;
      continue;
    }
    if (!nodes.has(s) || !nodes.has(t)) throw new ExportRefusal("missing-endpoint", [a.id]);
    if (ck === "document" && nodes.get(s).kind !== "document" && nodes.get(t).kind !== "document") throw new ExportRefusal("unsupported-element", [a.id]);
    if (!a.points || a.points.length < 2) throw new ExportRefusal("element-without-di", [a.id]);
    connections.push({ id: a.id, source: s, target: t, kind: ck, label: ck === "sequence" ? a.name ?? "" : factsOf.get(a.id)?.label ?? "", points: a.points, semanticOrder: rank.get(a.id) });
  }
  for (const id of aidNotes.keys()) if (!usedNotes.has(id)) throw new ExportRefusal("unattached-annotation", [id]);
  connections.sort((p, q) => Number(p.kind !== "sequence") - Number(q.kind !== "sequence") || p.semanticOrder - q.semanticOrder);
  for (const e of drawable.filter((x) => ARTIFACT_TYPE.has(x.type))) {
    const n = nodes.get(e.id);
    if (!n) continue;
    const fx = factsOf.get(e.id);
    const incident = connections.filter((c) => c.kind !== "sequence" && (c.source === n.id || c.target === n.id));
    const role = (c) => (c.source === n.id ? "in" : "out");
    const roles = new Set(incident.filter((c) => c.kind === "data").map(role));
    if (e.type === "bpmn:DataObjectReference") {
      const direction = fx?.direction ?? (roles.size === 1 ? [...roles][0] : undefined);
      if (!direction) throw new ExportRefusal("missing-semantics", [e.id]);
      n.kind = direction === "in" ? "object-in" : "object-out";
    }
    const c = fx?.primary ? incident.find((x) => x.id === fx.primary) : incident[0];
    if (fx?.primary && !c) throw new ExportRefusal("invalid-semantics", [e.id]);
    if (c) {
      const host = c.source === n.id ? c.target : c.source;
      if (!ACTIVITY_SLOTS.has(nodes.get(host)?.kind)) throw new ExportRefusal("invalid-semantics", [e.id]);
      n.task = host;
      n.dir = n.kind === "document" ? "document" : role(c);
    } else n.dir = n.kind === "document" ? "document" : ["object-in", "port-in"].includes(n.kind) ? "in" : "out";
  }
  const seq = [...nodes.values()].sort((p, q) => p.semanticOrder - q.semanticOrder);
  const flowOrder = seq.filter((n) => FLOW_SLOTS.has(n.kind)).map((n) => n.id);
  const order = [];
  for (const host of flowOrder) {
    const docs = seq.filter((n) => n.task === host && n.dir === "document").map((n) => n.id);
    const half = Math.ceil(docs.length / 2);
    order.push(host, ...docs.slice(0, half).reverse(), ...docs.slice(half), ...seq.filter((n) => n.task === host && n.dir === "in").map((n) => n.id).reverse(), ...seq.filter((n) => n.task === host && n.dir === "out").map((n) => n.id));
  }
  const loose = new Map();
  for (const n of seq.filter((x) => !FLOW_SLOTS.has(x.kind) && !x.task)) {
    const li = n.laneIndex ?? -1;
    loose.set(li, [...(loose.get(li) ?? []), n.id]);
  }
  for (const ids of loose.values()) order.push(...ids);
  const boxes = [...lanes.map((l) => l.box), ...seq.map((n) => n.box)];
  const x = boxes.length ? Math.min(...boxes.map((b) => b.x)) : 0;
  const y = boxes.length ? Math.min(...boxes.map((b) => b.y)) : 0;
  const pool = participant ? participant.box : { x, y, w: boxes.length ? Math.max(...boxes.map((b) => b.x + b.w)) - x : 0, h: boxes.length ? Math.max(...boxes.map((b) => b.y + b.h)) - y : 0 };
  return { processId: proc.id, index, name: participant?.name || proc.name || `Process ${index + 1}`, pool, lanes, nodes: Object.fromEntries(nodes), order, flowOrder, apps: Object.fromEntries(apps), connections };
}

// ------------------------------------------------------------------ reference draw.io export (src/io/reference-drawio.ts)
/** Exit or entry anchor of an edge end (reference-drawio.ts:56-64). */
function sideAnchor(p, toward, box) {
  const [x, y, w, h] = box;
  const dx = toward[0] - p[0];
  const dy = toward[1] - p[1];
  const fx = w ? Math.min(1, Math.max(0, (p[0] - x) / w)) : 0.5;
  const fy = h ? Math.min(1, Math.max(0, (p[1] - y) / h)) : 0.5;
  if (Math.abs(dx) >= Math.abs(dy)) return [dx > 0 ? 1 : 0, fy];
  return [fx, dy > 0 ? 1 : 0];
}
const ITEM_SLOTS = new Set(["object-in", "object-out", "port-in", "port-out"]);
function nodeStyle(n, s) {
  switch (n.kind) {
    case "start": return s.start;
    case "end": return s.end;
    case "gateway": return `${s.gatewayBase}${n.subtype === "AND" ? "parallel" : "exclusive"};`;
    case "subprocess": return s.subprocess;
    case "call": return s.external;
    case "event": return s.event;
    case "document": return s.document;
    default:
      if (ITEM_SLOTS.has(n.kind)) return `${s.item}bpmnTransferType=${n.kind === "object-out" || n.kind === "port-out" ? "output" : "input"};`;
      return s.task;
  }
}
function labelStyle(n) {
  if (ITEM_SLOTS.has(n.kind)) return `verticalLabelPosition=bottom;labelWidth=${n.labelBox ? n.labelBox.w : 100};`;
  if (n.labelBox && ["start", "end", "event", "gateway"].includes(n.kind)) return `whiteSpace=wrap;labelWidth=${n.labelBox.w};`;
  return "";
}
/**
 * Cells of one reference draw.io page (reference-drawio.ts:77-148) for a page model in neutral form:
 * {index, name, processId, pool, lanes: [{id, name, box}], nodes: {id: {kind, subtype?, label, box,
 * labelBox?, laneIndex?, laneName?, application?, calledProcess?}}, order, apps: {host: {box, text}},
 * connections: [{source, target, kind: sequence | data | document, label, points}]}.
 */
export function drawioPage(page, pages, policy) {
  const s = policy.presentation.exportStyles.drawio;
  const cells = [{ id: "0" }, { id: "1", parent: "0" }];
  let seq = 2;
  const vertex = (parent, value, style, x, y, w, h, link) => {
    const id = `c${seq++}`;
    cells.push({ id, value: value || "", style, vertex: true, parent, ...(link ? { link } : {}), geometry: { x: pyRound3(x), y: pyRound3(y), width: pyRound3(w), height: pyRound3(h) } });
    return id;
  };
  const edge = (source, target, value, style, points) => {
    const id = `c${seq++}`;
    const geometry = { relative: true };
    if (points.length) {
      geometry.sourcePoint = { x: pyRound3(points[0][0]), y: pyRound3(points[0][1]) };
      geometry.targetPoint = { x: pyRound3(points.at(-1)[0]), y: pyRound3(points.at(-1)[1]) };
      if (points.length > 2) geometry.points = points.slice(1, -1).map(([x, y]) => ({ x: pyRound3(x), y: pyRound3(y) }));
    }
    cells.push({ id, value: value || "", style, edge: true, parent: "1", source, target, geometry });
  };
  const pool = page.pool;
  const poolW = pool.w + s.dx;
  const poolH = pool.h + s.dy;
  const px = pool.x;
  const py = pool.y;
  const poolCell = vertex("1", page.name, s.pool, px, py, poolW, poolH);
  const laneCell = new Map();
  for (const lane of page.lanes) {
    if (laneCell.has(lane.name)) continue;
    const lx = s.poolHeaderWidth;
    const ly = lane.box.y - py + s.dy;
    laneCell.set(lane.name, [vertex(poolCell, lane.name, s.lane, lx, ly, poolW - s.poolHeaderWidth, lane.box.h), px + lx, py + ly]);
  }
  const cellOf = new Map();
  const absBox = new Map();
  const appCell = new Map();
  const appBox = new Map();
  for (const id of page.order) {
    const n = page.nodes[id];
    const x = n.box.x + s.dx;
    const y = n.box.y + s.dy;
    const key = n.laneIndex === undefined ? undefined : n.laneName || `Lane ${n.laneIndex + 1}`;
    const host = key === undefined ? undefined : laneCell.get(key);
    const [parent, ox, oy] = host ?? [poolCell, px, py];
    let style = nodeStyle(n, s) + labelStyle(n);
    if (page.apps[id]) style += `spacingBottom=${s.appBand};`;
    const target = pages.find((p) => p.processId === n.calledProcess);
    const link = target && target.index !== page.index ? `data:page/id,diagram-${target.index}` : undefined;
    cellOf.set(id, vertex(parent, n.label, style, x - ox, y - oy, n.box.w, n.box.h, link));
    absBox.set(id, [x, y, n.box.w, n.box.h]);
    const app = page.apps[id];
    if (n.application && app) {
      const b = app.box;
      appCell.set(id, vertex(cellOf.get(id), String(n.application), s.application, b.x - n.box.x, b.y - n.box.y, b.w, b.h));
      appBox.set(id, [b.x + s.dx, b.y + s.dy, b.w, b.h]);
    }
  }
  for (const conn of page.connections) {
    if (conn.points.length < 2 || !cellOf.has(conn.source) || !cellOf.has(conn.target)) continue;
    const points = conn.points.map(([x, y]) => [x + s.dx, y + s.dy]);
    const end = (id) => (conn.kind === "data" && appCell.has(id) ? [appCell.get(id), appBox.get(id)] : [cellOf.get(id), absBox.get(id)]);
    const [sCell, sBox] = end(conn.source);
    const [tCell, tBox] = end(conn.target);
    const [ex, ey] = sideAnchor(points[0], points[1], sBox);
    const [nx, ny] = sideAnchor(points.at(-1), points.at(-2), tBox);
    const style = `${s.edgeHead}exitX=${pyRound3(ex)};exitY=${pyRound3(ey)};entryX=${pyRound3(nx)};entryY=${pyRound3(ny)};${conn.kind !== "sequence" ? s.linkTail : s.flowTail}`;
    edge(sCell, tCell, conn.label || "", style, points);
  }
  return { id: `diagram-${page.index}`, name: page.name, pageWidth: poolW + 80, pageHeight: poolH + 80, cells };
}

// ------------------------------------------------------------------ reference Sparx export (src/io/reference-sparx.ts)
export function normalizeId(raw) {
  if (!raw) return "";
  let c = raw.replace(/-/g, "_").replace(/\./g, "_").replace(/ /g, "_").replace(/[^A-Za-z0-9_]/g, "_");
  if (c && /^[0-9]/.test(c)) c = `id_${c}`;
  return c || "id";
}
function slug(text, prefix) {
  let base = (text || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || prefix;
  if (/^[0-9]/.test(base)) base = `${prefix}_${base}`;
  return normalizeId(base.slice(0, 60));
}
const SPARX_TAG = { task: "task", subprocess: "subProcess", call: "callActivity", start: "startEvent", end: "endEvent", event: "intermediateThrowEvent", "object-in": "dataObjectReference", "object-out": "dataObjectReference", "port-in": "dataObjectReference", "port-out": "dataObjectReference", document: "textAnnotation" };
const FLOW_NODE_TAGS = new Set(["task", "subProcess", "callActivity", "startEvent", "endEvent", "exclusiveGateway", "parallelGateway", "inclusiveGateway", "intermediateThrowEvent"]);
/**
 * The reference Sparx interchange model (reference-sparx.ts:40-166) for neutral page models: per page
 * {process: {id, name, lanes: [{id, name, flowNodeRefs}], elements: [{tag, id, name?, text?}],
 * connectors: [{tag, id, name?, sourceRef, targetRef}]}, diagram: {id, name, plane, shapes, edges}}.
 * Floating waypoints are kept as numbers.
 */
export function sparxModel(pages, policy) {
  const used = new Set();
  const fresh = (text, prefix) => {
    let cand = slug(text, prefix);
    for (let i = 2; used.has(cand); i++) cand = normalizeId(`${slug(text, prefix)}_${i}`);
    used.add(cand);
    return cand;
  };
  const built = pages.map((page) => {
    const procId = fresh(page.name || `Process ${page.index + 1}`, "Process");
    const swimlanes = [];
    const laneIds = new Map();
    for (const lane of page.lanes) {
      const lid = fresh(lane.name, "Lane");
      laneIds.set(lane.name, lid);
      swimlanes.push({ id: lid, name: lane.name, b: lane.box });
    }
    const elements = [];
    const elemIds = new Map();
    for (const id of page.order) {
      const n = page.nodes[id];
      const tag = n.kind === "gateway" ? (n.subtype === "AND" ? "parallelGateway" : "exclusiveGateway") : SPARX_TAG[n.kind] ?? "task";
      const eid = fresh(n.label, "Node");
      elemIds.set(id, eid);
      elements.push({ id: eid, type: tag, name: n.label, parent: laneIds.get(n.laneName ?? ""), b: n.box });
    }
    for (const host of page.flowOrder) {
      const app = page.apps[host];
      const n = page.nodes[host];
      if (!app || !n.application) continue;
      elements.push({ id: fresh(`App_${n.label}`, "App"), type: "textAnnotation", name: insert(policy, "application", n.application), parent: laneIds.get(n.laneName ?? ""), b: app.box });
    }
    const connectors = [];
    for (const conn of page.connections) {
      if (!elemIds.has(conn.source) || !elemIds.has(conn.target)) continue;
      const pts = conn.points;
      const sb = page.nodes[conn.source].box;
      const tb = page.nodes[conn.target].box;
      let exitX = 0.5;
      let exitY = 0.5;
      let entryX = 0.5;
      let entryY = 0.5;
      if (pts.length && sb.w && sb.h) {
        exitX = Math.min(1, Math.max(0, (pts[0][0] - sb.x) / sb.w));
        exitY = Math.min(1, Math.max(0, (pts[0][1] - sb.y) / sb.h));
      }
      if (pts.length && tb.w && tb.h) {
        entryX = Math.min(1, Math.max(0, (pts.at(-1)[0] - tb.x) / tb.w));
        entryY = Math.min(1, Math.max(0, (pts.at(-1)[1] - tb.y) / tb.h));
      }
      const sl = page.nodes[conn.source].label;
      const tl = page.nodes[conn.target].label;
      connectors.push({ id: fresh(`${sl}_${tl}`, "Flow"), source: elemIds.get(conn.source), target: elemIds.get(conn.target), name: conn.label || "", kind: conn.kind === "sequence" ? "FLOW" : "ASSOC", waypoints: pts.length > 2 ? pts.slice(1, -1) : [], exitX, exitY, entryX, entryY });
    }
    return { name: page.name, procId, swimlanes, elements, connectors };
  });
  return built.map((page) => {
    const lookup = new Map();
    for (const e of page.elements) lookup.set(normalizeId(e.id), e);
    for (const s of page.swimlanes) lookup.set(normalizeId(s.id), s);
    const bounds = (b) => ({ x: b.x, y: b.y, width: b.w, height: b.h });
    return {
      process: {
        id: page.procId,
        name: page.name,
        lanes: page.swimlanes.map((lane) => ({ id: normalizeId(lane.id), name: lane.name, flowNodeRefs: page.elements.filter((e) => e.parent === lane.id && FLOW_NODE_TAGS.has(e.type)).map((e) => normalizeId(e.id)) })),
        elements: page.elements.map((e) => (e.type === "textAnnotation" ? { tag: "textAnnotation", id: normalizeId(e.id), text: e.name } : { tag: e.type, id: normalizeId(e.id), name: e.name })),
        connectors: page.connectors.map((c) => (c.kind === "ASSOC" ? { tag: "association", id: normalizeId(c.id), sourceRef: normalizeId(c.source), targetRef: normalizeId(c.target) } : { tag: "sequenceFlow", id: normalizeId(c.id), name: c.name, sourceRef: normalizeId(c.source), targetRef: normalizeId(c.target) })),
      },
      diagram: {
        id: `BPMNDiagram_${page.procId}`,
        name: `${page.name} - Diagram`,
        plane: `BPMNPlane_${page.procId}`,
        shapes: [
          ...page.swimlanes.map((lane) => ({ id: `${normalizeId(lane.id)}_gui`, bpmnElement: normalizeId(lane.id), isHorizontal: true, bounds: bounds(lane.b) })),
          ...page.elements.map((e) => ({ id: `${normalizeId(e.id)}_gui`, bpmnElement: normalizeId(e.id), bounds: bounds(e.b) })),
        ],
        edges: page.connectors.map((c) => {
          const se = lookup.get(normalizeId(c.source));
          const te = lookup.get(normalizeId(c.target));
          const full = [];
          if (se && te) {
            full.push([se.b.x + se.b.w * c.exitX, se.b.y + se.b.h * c.exitY]);
            for (const p of c.waypoints) full.push(p);
            full.push([te.b.x + te.b.w * c.entryX, te.b.y + te.b.h * c.entryY]);
          }
          const out = { id: `${normalizeId(c.id)}_gui`, bpmnElement: normalizeId(c.id), waypoints: full.map(([x, y]) => ({ x, y })) };
          if (c.name && full.length >= 2) {
            const mid = Math.floor(full.length / 2);
            const p1 = full[mid - 1];
            const p2 = full[mid];
            out.label = { x: (p1[0] + p2[0]) / 2 - 20, y: (p1[1] + p2[1]) / 2 - 10, width: 40, height: 20 };
          } else if (c.name) out.label = {};
          return out;
        }),
      },
    };
  });
}
