// x24 derivation helper (CLI): writes the sealed profile-parity-corpus/1 cases, the dimension coverage
// map and the manifest. Expected values are hand-derived from the cited base sources and DESIGN clauses;
// arithmetic ones are computed by ./arith.mjs, an independent re-implementation of the legacy formulas.
// No product module, codec, layout, renderer, exporter or command is imported or executed, and no scanned
// literal is written: base literals are named by ledger row (literalRef). Run from the repository root:
//   node tests/fixtures/x24-externalization/expectations/derive/author-cases.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import * as X from "./arith.mjs";
import { canonical, canonicalSha256 } from "./canonical.mjs";
import { DECODE, LAYOUT_INPUT, LAYOUT_PROCESS, NONACTIVITY, SURFACE, exportScene, factsScene, factsVersionScene } from "./scenes.mjs";

const DIR = "tests/fixtures/x24-externalization/expectations";
const DESIGN = { design: "DESIGN.md R3.3", sha256: "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f" };
const sha = (b) => createHash("sha256").update(b).digest("hex");
const read = (p) => readFileSync(join(DIR, p));
const art = (role, path) => ({ role, path, sha256: sha(read(path)) });
const inline = (role, json) => ({ role, json });
const POLICY_PATH = { L: "policy/policy-legacy-synthetic.json", A: "policy/policy-neutral-a.json", B: "policy/policy-neutral-b.json" };
const BASE = Object.fromEntries(Object.entries(POLICY_PATH).map(([k, p]) => [k, JSON.parse(read(p))]));
const LOT0 = "../../profile-parity-corpus/profile-mechanism/1/";
const PROFILE = {
  A: { path: `${LOT0}neutral-profile.json`, sha256: sha(read(`${LOT0}neutral-profile.json`)), profile: "neutral/1" },
  B: { path: `${LOT0}neutral-grid-profile.json`, sha256: sha(read(`${LOT0}neutral-grid-profile.json`)), profile: "neutral-grid/1" },
};
const ledger = JSON.parse(read("ledger.json"));
const rowById = new Map(ledger.occurrences.map((r) => [r.id, r]));

// ------------------------------------------------------------------ case registry
const cases = [];
/**
 * Registers a case. `build(P)` returns {inputs, command?, expected, status?} for the data sets P = {L, A, B};
 * it is rerun with single-field mutations of P by the dimension coverage analysis. `reads` names the data
 * sets whose fields the case outputs depend on.
 */
function addCase(group, n, slug, c, meta) {
  const caseId = `x24-${group}-${String(n).padStart(3, "0")}-${slug}`;
  if (cases.some((x) => x.caseId === caseId || (x.group === group && x.n === n))) throw new Error(`duplicate case ${caseId}`);
  cases.push({ group, n, caseId, slug, c, meta });
}
function materialize(entry, P) {
  const b = entry.c.build(P);
  return {
    caseId: entry.caseId,
    operation: entry.c.operation,
    phase: entry.c.phase ?? null,
    profileArtifact: null,
    inputArtifacts: [inline("clause", { ...DESIGN, clauses: entry.meta.clauses }), ...b.inputs],
    ...(b.command ? { commandArtifact: b.command } : {}),
    expectedArtifacts: b.expected,
    expectedStatus: b.status ?? "success",
    comparatorIds: entry.c.comparators,
  };
}
const diff = (a, b, at = "") => {
  if (canonical(a) === canonical(b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => diff(a[k], b[k], `${at}/${String(k).replace(/~/g, "~0").replace(/\//g, "~1")}`));
  }
  return [at];
};
const subst = (ra, rb) => [inline("results-a", ra), inline("results-b", rb), inline("differences", diff(ra, rb))];
const run = (f) => {
  try {
    return f();
  } catch (e) {
    if (e?.code) return { status: "refused", code: e.code, ...(e.ids ? { ids: e.ids } : {}) };
    throw e;
  }
};
class Refusal extends Error {
  constructor(code, ids) {
    super(code);
    this.code = code;
    if (ids) this.ids = ids;
  }
}
/** A text vector naming a base literal by its ledger row: {concat: [part...]}, part = string | {literal, sha256}. */
const literalRef = (id) => {
  const row = rowById.get(id);
  if (!row || row.form !== "raw") throw new Error(`literalRef ${id} is not a raw ledger row`);
  return { literal: id, sha256: row.literal };
};

// ------------------------------------------------------------------ classification vectors
// DESIGN.md:152 vectors: empty, leading U+00A0 and U+FEFF (trimmed), leading U+0085 and U+200B (kept), mixed case,
// astral. Every non-ASCII code point is a braced escape, so that a rewrite of this file cannot fold it.
const TEXTS = [
  "[Binder] Spec", "  [Binder]Spec", "\u{a0}[Gadget] CRM ", "\u{feff}[Binder] Doc", "\u{85}[Binder] X", "\u{200b}[Gadget] X",
  "[binder] lower", "Note [Binder] inside", "[Binder]", "[Gadget]   ", "\t\n[Binder]\tA\tB", "[Binder] [Gadget] both",
  "[Gadget][Binder] both", "\u{1d400}[Binder] astral", "",
  "[Aid] alpha", "[Aid]alpha", " [Aid] lead", "[Folio] Manual", "[Folio]  spaced", " [Folio] lead",
  "[Note] beta", " [Note] spaced", "[Note] stra\u{df}e", "[Leaf] Handbook", " [Leaf] spaced", "plain text",
];
const classifyRow = (p, text) => ({ text, document: X.recognises(p, "document", text), application: X.recognises(p, "application", text), role: X.roleFor(p, text), displayName: X.displayName(p, text), layoutName: X.layoutName(p, text) });
const kindRow = (p, family, text) => ({ text, kind: X.annotationKind(family, X.roleFor(p, text)) });

// ------------------------------------------------------------------ layout input (src/internal/processModel.ts:35-193, retarget removed)
function layoutInput(p) {
  const anns = LAYOUT_INPUT.annotations.map((a) => ({ ...a, role: X.roleFor(p, a.text) }));
  const app = anns.filter((a) => a.role === "application").at(-1);
  const docs = anns.filter((a) => a.role === "document");
  const nodes = [
    { kind: "start", id: "S1", text: "In" },
    { kind: "task", id: "T1", text: "Review", ...(app ? { application: X.layoutName(p, app.text) } : {}) },
    { kind: "gateway", id: "G1", text: "Ok?", subtype: "OR" },
    { kind: "end", id: "E1", text: "Out" },
    { kind: "object-in", id: "D1", text: "Form", attachedTo: "T1", direction: "in" },
    ...docs.map((d) => ({ kind: "document", id: d.id, text: X.layoutName(p, d.text) || d.id, attachedTo: "T1", direction: "document" })),
  ];
  const connections = [
    { source: "D1", target: "T1", kind: "data" },
    { source: "S1", target: "T1", kind: "sequence" },
    { source: "T1", target: "G1", kind: "sequence" },
    { source: "G1", target: "E1", kind: "sequence", label: "yes" },
    ...docs.map((d) => ({ source: d.id, target: "T1", kind: "document" })),
  ];
  return { processes: [{ id: LAYOUT_INPUT.process.id, name: LAYOUT_INPUT.process.name, lanes: [{ name: LAYOUT_INPUT.lane.name, nodes }], connections }], diagnostics: [] };
}
function layoutNonActivity(p) {
  const a = NONACTIVITY.annotation;
  const doc = X.roleFor(p, a.text) === "document";
  const nodes = [
    { kind: "start", id: "S1", text: "In" }, { kind: "task", id: "T1", text: "Review" }, { kind: "gateway", id: "G1", text: "Ok?", subtype: "OR" }, { kind: "end", id: "E1", text: "Out" },
    ...(doc ? [{ kind: "document", id: a.id, text: X.layoutName(p, a.text) || a.id, attachedTo: "G1", direction: "document" }] : []),
  ];
  const link = { source: a.id, target: "G1", kind: "document" };
  return {
    processes: [{ id: "P1", name: "Gate", lanes: [{ name: "Desk", nodes }], connections: [{ source: "S1", target: "T1", kind: "sequence" }, { source: "T1", target: "G1", kind: "sequence" }, { source: "G1", target: "E1", kind: "sequence" }, ...(doc ? [link] : [])] }],
    diagnostics: doc ? [{ code: "attachment-host-not-activity", severity: "warn", artifact: a.id, host: "G1", connection: link }] : [],
  };
}

// ------------------------------------------------------------------ sizes, metrics, badges
const SIZE_VECTORS = [
  { measure: "badge-size", name: "CRM", hostWidth: 120 },
  { measure: "badge-size", name: "Account relationship manager", hostWidth: 120 },
  { measure: "badge-size", name: "X", hostWidth: 300 },
  { measure: "badge-min-host-width", name: "Account relationship manager" },
  { measure: "document-height", label: "Spec" },
  { measure: "document-height", label: "A much longer document title that wraps" },
  { measure: "node-size", kind: "task", label: "Approve order" },
  { measure: "node-size", kind: "task", label: "Approve order", application: "Account relationship manager" },
  { measure: "node-size", kind: "subprocess", label: "Handle", application: "CRM" },
  { measure: "node-size", kind: "call", label: "Escalate to partner" },
  { measure: "node-size", kind: "call", label: "Go" },
  { measure: "node-size", kind: "call", label: "Escalate", application: "CRM" },
  { measure: "node-size", kind: "subprocess", label: "Go" },
  { measure: "node-size", kind: "document", label: "Spec" },
  { measure: "node-size", kind: "gateway", label: "?" },
  { measure: "node-size", kind: "start", label: "In" },
  { measure: "node-size", kind: "end", label: "Out" },
  { measure: "node-size", kind: "event", label: "Wait" },
  { measure: "node-size", kind: "object-in", label: "Form" },
  { measure: "node-size", kind: "object-out", label: "Report" },
  { measure: "node-size", kind: "port-in", label: "Inbox" },
  { measure: "node-size", kind: "port-out", label: "Outbox" },
  { measure: "label-box", text: "Ok?", size: 11, maxWidth: 120 },
];
const sizeOf = (p, vec) => {
  switch (vec.measure) {
    case "badge-size": return X.badgeSize(p, vec.name, vec.hostWidth);
    case "badge-min-host-width": return X.badgeMinHostWidth(p, vec.name);
    case "document-height": return X.documentHeight(p, vec.label);
    case "node-size": return X.nodeSize(p, vec.kind, vec.label, vec.application, X.ACTIVITY_SLOTS.has(vec.kind) && X.eligibleHost(p, X.SLOT_TYPE[vec.kind]));
    case "label-box": return X.labelBox(p, vec.text, vec.size, vec.maxWidth);
    default: throw new Error(vec.measure);
  }
};
/** Every advance-table code point once (U+0020-U+007E), so that every table entry is read. */
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
const METRIC_VECTORS = [
  { measure: "text-width", text: "A", size: 12, bold: false }, { measure: "text-width", text: "A", size: 12, bold: true },
  { measure: "text-width", text: "Í", size: 12, bold: false }, { measure: "text-width", text: "Ç", size: 10, bold: false },
  { measure: "text-width", text: "ñ", size: 12, bold: false }, { measure: "text-width", text: "\t", size: 12, bold: false },
  { measure: "text-width", text: " ", size: 12, bold: false }, { measure: "text-width", text: "\u{1d400}", size: 12, bold: false },
  { measure: "text-width", text: "≠", size: 12, bold: false }, { measure: "text-width", text: "É", size: 12, bold: false },
  { measure: "text-width", text: "Approve order", size: 12, bold: false }, { measure: "text-width", text: "Approve order", size: 11, bold: true },
  { measure: "text-width", text: "", size: 12, bold: false },
  { measure: "text-width", text: ASCII, size: 10, bold: false }, { measure: "text-width", text: ASCII, size: 10, bold: true },
  { measure: "text-width", text: "ÍÇéÅ≠É", size: 10, bold: false }, { measure: "text-width", text: "ÍÇéÅ≠É", size: 10, bold: true },
  { measure: "wrap-text", text: "Approve the purchase order", size: 12, maxWidth: 60, bold: false },
  { measure: "wrap-text", text: "Supercalifragilistic", size: 12, maxWidth: 40, bold: false },
  { measure: "wrap-text", text: "one\ntwo three", size: 10, maxWidth: 30, bold: false },
  { measure: "wrap-text", text: "", size: 12, maxWidth: 50, bold: false },
];
const metricOf = (p, v) => (v.measure === "text-width" ? X.textWidth(p, v.text, v.size, v.bold) : X.wrapText(p, v.text, v.size, v.maxWidth, v.bold));
const BADGE_VECTORS = [
  { measure: "badge-row", names: ["CRM", "Vault"], hostWidth: 120, hostHeight: 80 },
  { measure: "badge-box", name: "Account relationship manager", hostWidth: 100 },
  { measure: "document-text-box", width: 120, height: 60 },
];
const badgeOf = (p, v) => (v.measure === "badge-row" ? X.badgeRow(p, v.names, v.hostWidth, v.hostHeight) : v.measure === "badge-box" ? X.badgeBox(p, v.name, v.hostWidth) : X.documentTextBox(p, v.width, v.height));

// ------------------------------------------------------------------ attachment and follow (src/profiles/<annotated look>/renderer.ts:69-109, 680-694)
const GRAPH = {
  elements: [
    { id: "T1", type: "bpmn:Task" }, { id: "SP1", type: "bpmn:SubProcess" }, { id: "G1", type: "bpmn:ExclusiveGateway" },
    { id: "N1", type: "bpmn:TextAnnotation", text: "[Gadget] ledger" }, { id: "N2", type: "bpmn:TextAnnotation", text: "[Gadget] vault" },
    { id: "N3", type: "bpmn:TextAnnotation", text: "[Aid] planner" }, { id: "N4", type: "bpmn:TextAnnotation", text: "[Note] tracker" },
    { id: "N5", type: "bpmn:TextAnnotation", text: "[Gadget] orphan" }, { id: "N6", type: "bpmn:TextAnnotation", text: "[Aid] gate" },
    { id: "N7", type: "bpmn:TextAnnotation", text: "[Note] sub" },
    { id: "U1", type: "bpmn:UserTask" }, { id: "N8", type: "bpmn:TextAnnotation", text: "[Note] user" },
  ],
  associations: [
    { id: "A1", source: "N1", target: "T1" }, { id: "A2", source: "SP1", target: "N2" }, { id: "A3", source: "N3", target: "T1" },
    { id: "A4", source: "N4", target: "T1" }, { id: "A5", source: "N5", target: "G1" }, { id: "A6", source: "N6", target: "SP1" },
    { id: "A7", source: "N7", target: "SP1" }, { id: "A8", source: "N8", target: "U1" },
  ],
};
function attachment(p, graph = GRAPH, follow = ["T1", "SP1", "U1"]) {
  const el = new Map(graph.elements.map((e) => [e.id, e]));
  const isApp = (id) => el.get(id).type === "bpmn:TextAnnotation" && X.recognises(p, "application", el.get(id).text);
  const isHost = (id) => X.eligibleHost(p, el.get(id).type);
  const associated = (id) => [...graph.associations.filter((a) => a.target === id).map((a) => a.source), ...graph.associations.filter((a) => a.source === id).map((a) => a.target)];
  const aidsOf = (id) => (isHost(id) ? associated(id).filter(isApp) : []);
  const linked = (id) => isApp(id) && associated(id).some(isHost);
  const hiddenShapes = graph.elements.map((e) => e.id).filter(linked);
  const hiddenLinks = graph.associations.filter((a) => (linked(a.source) && isHost(a.target)) || (linked(a.target) && isHost(a.source))).map((a) => a.id);
  const moved = [...follow];
  for (const s of follow) for (const a of aidsOf(s)) if (!moved.includes(a)) moved.push(a);
  return { aidsOf: Object.fromEntries(graph.elements.filter((e) => e.type !== "bpmn:TextAnnotation").map((e) => [e.id, aidsOf(e.id)])), hidden: [...hiddenShapes, ...hiddenLinks], moved };
}

// ------------------------------------------------------------------ tokens and theme selection (src/internal/engine.ts:74-105, src/internal/canvas.ts:68-69, 132-133)
const lookOf = (p, alias) => p.presentation.looks.find((l) => l.alias === alias);
const TOKEN_VECTORS = [{}, { stroke: "#123456" }, { fill: "#e0e0e0" }, { link: "#00ff00" }, { laneFill: "#fafafa" }, { taskFill: "#e0e0e0", taskFillEnd: "#cccccc" }, { text: "#101010" }, { labelText: "#202020" }, { docLink: "#303030", link: "#404040" }];
const tokensOf = (look, o) => (look.renderer === "recolor" ?{ tokens: X.resolveRecolor(look.tokens, o), named: X.namedTokens(o) } : { tokens: X.resolveTokens(look.tokens, o) });
function themeSelect(p, req) {
  const looks = p.presentation?.looks ?? [];
  const option = (name, key) => req.options?.[name] !== undefined && req.options[name] === p.presentation?.legacyOptions?.[key];
  if (req.look === undefined) return { status: "ok", renderer: "upstream", modelerModules: option("palette", "annotatedPalette") ? ["annotated-palette"] : [], viewerModules: [], paletteFloor: 0, markerSelectors: [] };
  const look = lookOf(p, req.look);
  if (!look) return { status: "refused", code: "profile-symbol" };
  const flat = option("drawing", "flatDrawing") ? true : look.flat;
  const out = { status: "ok", renderer: look.renderer, paletteFloor: look.paletteFloor, markerSelectors: look.markerSelectors };
  let modeler = [];
  let viewer = [];
  if (look.renderer === "annotated") {
    modeler = ["annotated-renderer", "annotated-follow"];
    viewer = ["annotated-renderer"];
    out.tokens = X.resolveTokens(look.tokens, req.tokens ?? {});
  } else if (look.renderer === "recolor") {
    const given = Object.values(req.tokens ?? {}).some((v) => v !== undefined);
    if (given) {
      modeler = ["recolor-renderer"];
      viewer = ["recolor-renderer"];
      out.tokens = X.resolveRecolor(look.tokens, req.tokens);
      out.named = X.namedTokens(req.tokens);
    }
    if (flat) {
      modeler = [...modeler, "flat-renderer"];
      viewer = [...viewer, "flat-renderer"];
      out.tokens = out.tokens ?? X.resolveRecolor(look.tokens, req.tokens ?? {});
    }
  }
  const palette = option("palette", "annotatedPalette") ? "annotated" : look.palette;
  if (palette === "annotated") modeler = [...modeler, "annotated-palette"];
  out.modelerModules = modeler;
  out.viewerModules = viewer;
  return out;
}
const LEGACY_REQUESTS = [
  { look: "look-annotated" }, { look: "look-annotated", tokens: { taskFill: "#abcdef" } }, { look: "look-recolor" }, { look: "look-recolor", tokens: { taskFill: "#abcdef" } },
  { look: "look-recolor", tokens: { stroke: "#222222" }, options: { drawing: "drawing-flat" } }, { look: "look-recolor", options: { drawing: "drawing-flat" } },
  { look: "look-plain" }, { look: "look-plain", options: { palette: "palette-annotated" } }, { look: "look-annotated", options: { palette: "palette-annotated", drawing: "drawing-flat" } },
  { look: "alpha-look" }, { look: "beta-look" },
];
const AB_REQUESTS = [
  { look: "alpha-look" }, { look: "alpha-look", tokens: { taskFill: "#abcdef" } }, { look: "beta-look" }, { look: "beta-look", tokens: { taskFill: "#abcdef" } },
  { look: "beta-look", options: { drawing: "flat-b" } }, { look: "delta-look", options: { drawing: "flat-a" } }, { look: "delta-look", tokens: { stroke: "#222222" } },
  { look: "gamma-look" }, { look: "alpha-look", options: { palette: "palette-a" } }, { look: "beta-look", options: { palette: "palette-a" } },
  { options: { palette: "palette-a" } }, { look: "look-annotated" }, {},
];

// ------------------------------------------------------------------ palette (src/profiles/<annotated look>/palette.ts:95-125)
function paletteEntries(p) {
  return (p.presentation?.palette?.entries ?? []).map((e) => ({
    id: e.id,
    group: e.group,
    className: e.icon,
    title: `Create ${e.title}`,
    html: `<div class="entry" draggable="true" title="Create ${e.title}"></div>`,
    create: e.tool === "connect" ? { tool: "connect" } : {
      type: e.bpmnType,
      ...(e.initialName ? { name: e.initialName } : {}),
      ...(e.initialRole ? { text: X.insert(p, e.initialRole, "") } : {}),
      ...(e.collapsed ? { isExpanded: false } : {}),
    },
  }));
}

// ------------------------------------------------------------------ navigation (src/react/workshop.tsx:130-174; DESIGN.md:623)
const DIAGRAMS = [{ id: "D0", name: "Main" }, { id: "D1", name: "Quote preparation" }, { id: "D2", name: "2.1 Credit check" }, { id: "Proc_called", name: "Other" }, { id: "D4", name: "Archive records" }];
const TWINS = [{ id: "X1", name: "Target" }, { id: "Target2", name: "Other" }];
const NAV_LEGACY = [
  { click: { type: "bpmn:CallActivity", name: "", calledElement: "proc_called" }, diagrams: DIAGRAMS, activeId: "D0" },
  { click: { type: "bpmn:CallActivity", name: "", calledElement: "Archive Records" }, diagrams: DIAGRAMS, activeId: "D0" },
  { click: { type: "bpmn:Task", name: " quote PREPARATION " }, diagrams: DIAGRAMS, activeId: "D0" },
  { click: { type: "bpmn:SubProcess", name: "Run 2.1 checks" }, diagrams: DIAGRAMS, activeId: "D0" },
  { click: { type: "bpmn:SubProcess", name: "Archive" }, diagrams: DIAGRAMS, activeId: "D0" },
  { click: { type: "bpmn:Task", name: "" }, diagrams: DIAGRAMS, activeId: "D0" },
  { click: { type: "bpmn:CallActivity", name: "Target", calledElement: "Target2" }, diagrams: TWINS, activeId: "D0" },
  { click: { type: "bpmn:SubProcess", name: "Quote preparation" }, diagrams: DIAGRAMS, activeId: "D1" },
];
const RULE_SETS = [["called-element", "name-equal", "section-equal"], ["called-element", "name-equal", "section-equal", "name-overlap"], ["called-element", "name-equal"], ["section-equal"], ["name-overlap"]];
const INDEX = {
  processes: ["P_main", "P_sub", "P_other", "P_orphan"],
  entries: [
    { diagramId: "D_main", semanticRootId: "Collab_main", processId: "P_main", label: "Main", order: 0 },
    { diagramId: "D_sub_b", semanticRootId: "P_sub", processId: "P_sub", label: "Sub B", order: 2 },
    { diagramId: "D_sub_a", semanticRootId: "P_sub", processId: "P_sub", label: "Sub A", order: 1 },
    { diagramId: "D_decoy", semanticRootId: "P_other", processId: "P_other", label: "Review", order: 3 },
  ],
};
const NAV_NATIVE = [
  { click: { type: "bpmn:CallActivity", name: "Review", calledElement: "P_sub" }, activeDiagramId: "D_main" },
  { click: { type: "bpmn:CallActivity", name: "Main", calledElement: "P_main" }, activeDiagramId: "D_main" },
  { click: { type: "bpmn:CallActivity", name: "Orphan", calledElement: "P_orphan" }, activeDiagramId: "D_main" },
  { click: { type: "bpmn:CallActivity", name: "Gone", calledElement: "P_missing" }, activeDiagramId: "D_main" },
  { click: { type: "bpmn:SubProcess", name: "Review" }, activeDiagramId: "D_main" },
  { click: { type: "bpmn:CallActivity", name: "Sub A", calledElement: "P_other" }, activeDiagramId: "D_main" },
];
const NAV_MIXED = [
  { click: { type: "bpmn:CallActivity", name: "Sub A", calledElement: "P_sub" }, activeDiagramId: "D_main", diagrams: [{ id: "D_main", name: "Main" }, { id: "D_sub_a", name: "Sub A" }, { id: "D_sub_b", name: "Sub B" }], activeId: "D_main" },
  { click: { type: "bpmn:Task", name: "Review" }, activeDiagramId: "D_main", diagrams: [{ id: "D_main", name: "Main" }, { id: "D_decoy", name: "Review" }], activeId: "D_main" },
  { click: { type: "bpmn:SubProcess", name: "Run 2.1 checks" }, activeDiagramId: "D_main", diagrams: [{ id: "D_main", name: "Main" }, { id: "D2", name: "2.1 Credit check" }], activeId: "D_main" },
  { click: { type: "bpmn:CallActivity", name: "Main", calledElement: "P_main" }, activeDiagramId: "D_main", diagrams: [{ id: "D_main", name: "Main" }], activeId: "D_main" },
  { click: { type: "bpmn:SubProcess", name: "Review" }, activeDiagramId: "D_main", diagrams: [{ id: "D_main", name: "Main" }, { id: "D_board", name: "Review board" }, { id: "D_decoy", name: "Review" }], activeId: "D_main" },
];

// ------------------------------------------------------------------ reference exports (src/io/reference-model.ts:142-398, reference-sparx.ts, reference-drawio.ts)
const DESCRIPTOR = {
  A: { path: "inputs/x24-facts-descriptor.json", id: "x24-facts/1", uri: "urn:x24:facts:1" },
  B: { path: "inputs/x24-facts-descriptor-b.json", id: "x24-facts-b/1", uri: "urn:x24:facts-b:1" },
};
const descriptorFor = (k) => (k === "B" ? DESCRIPTOR.B : DESCRIPTOR.A);
const SCENE = {
  "inputs/export-legacy.bpmn": () => exportScene("L"),
  "inputs/export-a.bpmn": () => exportScene("A"),
  "inputs/export-b.bpmn": () => exportScene("B"),
  "inputs/export-facts.bpmn": () => factsScene("A"),
  "inputs/export-facts-b.bpmn": () => factsScene("B"),
  "inputs/export-facts-version-a.bpmn": () => factsVersionScene("A"),
  "inputs/export-facts-version-b.bpmn": () => factsVersionScene("B"),
};
const pagesOf = (p, file, descriptor) => X.referencePages(p, SCENE[file](), descriptor);
const exportAll = (p, file, descriptor) => {
  const pages = pagesOf(p, file, descriptor);
  return { status: "ok", pages, sparx: X.sparxModel(pages, p), drawio: { pages: pages.map((page) => X.drawioPage(page, pages, p)) } };
};
// ------------------------------------------------------------------ draw.io decoding (src/io/drawio-decode.ts:58-143)
const DECODE_FILE = { L: "inputs/decode-legacy.drawio", A: "inputs/decode-neutral.drawio", B: "inputs/decode-b.drawio" };
function decode(p, k) {
  const rules = p.presentation.exportStyles.decode;
  const styleOf = (s) => new Map(s.split(";").filter(Boolean).map((part) => [part.split("=")[0], part.split("=").slice(1).join("=")]));
  const matches = (style, m) => m.every(({ key, value }) => style.get(key) === value);
  const base = [
    { cell: "pool", id: "p0_c2", kind: "participant", label: "Intake", bounds: { x: 0, y: 0, width: 600, height: 250 } },
    { cell: "lane", id: "p0_c3", kind: "lane", label: "Desk", bounds: { x: 30, y: 0, width: 570, height: 250 }, parent: "p0_c2" },
    { cell: "task", id: "p0_c4", kind: "task", label: "Review", bounds: { x: 200, y: 78, width: 100, height: 80 }, parent: "p0_c3" },
  ];
  const abs = { lane: [30, 0], task: [200, 78] };
  const nodes = base.map(({ cell, ...n }) => n);
  const edges = [];
  DECODE[k].forEach((c, i) => {
    const style = styleOf(c.style);
    const kindRule = rules.kinds.find((r) => matches(style, r.match));
    if (!kindRule) throw new Refusal("unsupported-shape", [c.id]);
    const roleRule = rules.roles.find((r) => matches(style, r.match));
    const label = roleRule ? X.insert(p, roleRule.role, c.value) : c.value;
    const id = `p0_c${5 + i}`;
    const parentId = c.parent === "task" ? "p0_c4" : "p0_c3";
    const [ox, oy] = abs[c.parent];
    nodes.push({ id, kind: kindRule.kind, label, bounds: { x: c.box.x + ox, y: c.box.y + oy, width: c.box.w, height: c.box.h }, parent: parentId });
    if (parentId === "p0_c4" && label.startsWith(X.insert(p, "application", ""))) edges.push({ id: `${id}${rules.associationIdSuffix}`, kind: "association", label: "", source: id, target: "p0_c4", points: [] });
  });
  for (const n of nodes) if (n.parent === "p0_c4") n.parent = "p0_c3";
  return { status: "ok", pages: [{ id: "page_0", name: "Page 1", nodes, edges }] };
}

// ------------------------------------------------------------------ editor auto-layout (src/internal/layout/autoLayout.ts:57-75)
const AUTO_LAYOUT = { participant: { x: 100, y: 50 }, pool: { x: 0, y: 0 }, nodes: { T1: { x: 200, y: 78, w: 100, h: 80 } }, apps: { T1: { x: 210, y: 148, w: 80, h: 30 } } };
const AUTO_GRAPH = {
  elements: [
    { id: "T1", type: "bpmn:Task" },
    { id: "N1", type: "bpmn:TextAnnotation", text: "[Gadget] ledger" }, { id: "N2", type: "bpmn:TextAnnotation", text: "[Binder] Guide" },
    { id: "N3", type: "bpmn:TextAnnotation", text: "[Gadget] vault" }, { id: "N4", type: "bpmn:TextAnnotation", text: "[Aid] planner" },
    { id: "N5", type: "bpmn:TextAnnotation", text: "[Note] tracker" }, { id: "N6", type: "bpmn:TextAnnotation", text: "[Note] desk" },
    { id: "N7", type: "bpmn:TextAnnotation", text: "[Aid] gate" },
  ],
  associations: [
    { id: "A1", source: "N1", target: "T1" }, { id: "A3", source: "N3", target: "T1" }, { id: "A4", source: "N4", target: "T1" },
    { id: "A6", source: "N6", target: "T1" }, { id: "A2", source: "T1", target: "N2" }, { id: "A5", source: "T1", target: "N5" },
    { id: "A7", source: "T1", target: "N7" },
  ],
  hostLinks: { T1: { incoming: ["A1", "A3", "A4", "A6"], outgoing: ["A2", "A5", "A7"] } },
};
function autoLayoutBadges(p) {
  const badge = p.presentation.layout.appBadge;
  const dx = AUTO_LAYOUT.participant.x - AUTO_LAYOUT.pool.x;
  const dy = AUTO_LAYOUT.participant.y - AUTO_LAYOUT.pool.y;
  const move = (b) => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });
  const el = new Map(AUTO_GRAPH.elements.map((e) => [e.id, e]));
  const links = new Map(AUTO_GRAPH.associations.map((l) => [l.id, l]));
  const changes = [];
  for (const [hostId, box] of Object.entries(AUTO_LAYOUT.apps)) {
    const tb = move(AUTO_LAYOUT.nodes[hostId]);
    let i = 0;
    for (const id of [...AUTO_GRAPH.hostLinks[hostId].incoming, ...AUTO_GRAPH.hostLinks[hostId].outgoing]) {
      const link = links.get(id);
      const ann = el.get(link.source === hostId ? link.target : link.source);
      if (ann.type !== "bpmn:TextAnnotation" || !X.recognises(p, "application", ann.text)) continue;
      const ab = move({ ...box, x: box.x + i * (box.w + badge.gap) });
      i += 1;
      changes.push({ element: ann.id, bounds: ab });
      const x = ab.x + Math.floor(ab.w / 2);
      const pts = [[x, ab.y], [x, tb.y + tb.h - badge.linkInset]];
      changes.push({ element: link.id, waypoints: link.source === ann.id ? pts : [...pts].reverse() });
    }
  }
  return { changes };
}

// ------------------------------------------------------------------ full layout (src/internal/swimlaneLayout.ts:217-617)
function layoutProcessResult(p) {
  const r = X.layoutProcess(p, LAYOUT_PROCESS);
  return {
    pool: r.pool,
    lanes: r.lanes.map(([name, box]) => ({ name, box })),
    nodes: r.nodes,
    apps: r.apps,
    labels: r.labels,
    edges: r.connections.map((c, i) => ({ source: c.source, target: c.target, kind: c.kind, ...(c.label ? { label: c.label } : {}), points: r.edges[i], ...(r.edgeLabels[i] ? { labelBox: r.edgeLabels[i] } : {}) })),
  };
}

// ------------------------------------------------------------------ surfaces (static render, preview, workshop)
const SURFACE_INDEX = new Map([...SURFACE.nodes, ...SURFACE.annotations].map((n) => [n.id, n]));
// Shape kinds of the three drawers (<annotated look>/style.ts:60-91, <recolouring look>/renderer.ts:31-48, <flat drawer>.ts:24-40).
const DRAWER_KIND = { "bpmn:Task": "task", "bpmn:CallActivity": "external", "bpmn:SubProcess": "subprocess", "bpmn:ExclusiveGateway": "gateway", "bpmn:StartEvent": "event", "bpmn:EndEvent": "event", "bpmn:UserTask": "upstream" };
const FLAT_KIND = { "bpmn:Task": "task", "bpmn:CallActivity": "external", "bpmn:SubProcess": "subprocess", "bpmn:ExclusiveGateway": "gateway", "bpmn:StartEvent": "event", "bpmn:EndEvent": "event", "bpmn:UserTask": "task" };
const RECOLOR_KIND = { "bpmn:Task": "task", "bpmn:CallActivity": "external", "bpmn:SubProcess": "task", "bpmn:ExclusiveGateway": "gateway", "bpmn:StartEvent": "event", "bpmn:EndEvent": "event", "bpmn:UserTask": "task" };
const BADGE_KINDS = new Set(["task", "subprocess", "external"]);
const RECOLOR_TOKENS = { task: ["taskFill", "taskLine"], event: ["eventFill", "eventLine"], gateway: ["gatewayFill", "gatewayLine"], pool: ["poolFill", "poolLine"], lane: ["laneFill", "laneLine"], external: ["externalFill", "externalLine"], doc: [null, "docLine"], app: [null, "appLine"], annotation: [null, "stroke"], link: [null, "link"] };
/** Projection of the static render of the surface scene under one request (README "x24.surface.static"). */
function surfaceRender(p, req) {
  const sel = themeSelect(p, req);
  if (sel.status !== "ok") return sel;
  const s = SURFACE;
  const anns = s.annotations;
  const assocs = anns.map((a) => ({ id: `As_${a.id}`, source: a.id, target: a.host }));
  const out = { renderer: sel.renderer, flat: sel.viewerModules.includes("flat-renderer"), recolorModule: sel.viewerModules.includes("recolor-renderer"), elements: [] };
  const push = (e) => out.elements.push(e);
  if (sel.viewerModules.includes("annotated-renderer")) {
    const typeOf = (id) => SURFACE_INDEX.get(id)?.type ?? "bpmn:TextAnnotation";
    const isApp = (id) => typeOf(id) === "bpmn:TextAnnotation" && X.recognises(p, "application", SURFACE_INDEX.get(id).text);
    const isHost = (id) => X.eligibleHost(p, typeOf(id));
    const associated = (id) => [...assocs.filter((a) => a.target === id).map((a) => a.source), ...assocs.filter((a) => a.source === id).map((a) => a.target)];
    const aidsOf = (id) => (isHost(id) ? associated(id).filter(isApp) : []);
    const linked = (id) => isApp(id) && associated(id).some(isHost);
    push({ id: s.pool.id, kind: "pool", hidden: false, header: p.presentation.layout.poolStrip });
    push({ id: s.lane.id, kind: "lane", hidden: false, header: p.presentation.layout.laneHeaderWidth });
    for (const n of s.nodes) {
      const rec = { id: n.id, kind: DRAWER_KIND[n.type], hidden: false };
      const apps = BADGE_KINDS.has(rec.kind) ? aidsOf(n.id) : [];
      if (apps.length) {
        const names = apps.map((a) => X.displayName(p, SURFACE_INDEX.get(a).text));
        const one = apps.length === 1 ? SURFACE_INDEX.get(apps[0]).box : null;
        const rel = one ? { x: one.x - n.box.x, y: one.y - n.box.y } : null;
        const boxes = one && rel.y >= n.box.h - 20 && rel.y <= n.box.h + 5 && rel.x >= -5 && rel.x + one.w <= n.box.w + 5 ? [{ name: names[0], x: rel.x, y: rel.y, width: one.w, height: one.h }] : X.badgeRow(p, names, n.box.w, n.box.h);
        rec.badges = boxes.map((b, i) => ({ annotation: apps[i], name: b.name, x: b.x, y: b.y, width: b.width, height: b.height }));
      }
      push(rec);
    }
    for (const a of anns) {
      const role = X.roleFor(p, a.text);
      const rec = { id: a.id, kind: role ?? "upstream", hidden: linked(a.id) };
      if (role) rec.label = X.displayName(p, a.text);
      if (role === "document") {
        rec.band = p.presentation.layout.document.band;
        rec.textBox = X.documentTextBox(p, a.box.w, a.box.h);
      }
      push(rec);
    }
    for (const as of assocs) push({ id: as.id, kind: "link", hidden: linked(as.source) && isHost(as.target) });
  } else if (out.flat) {
    push({ id: s.pool.id, kind: "pool" });
    push({ id: s.lane.id, kind: "lane" });
    for (const n of s.nodes) push({ id: n.id, kind: FLAT_KIND[n.type], label: n.name });
    for (const a of anns) push({ id: a.id, kind: X.roleFor(p, a.text) === "document" ? "document" : "application", label: X.displayName(p, a.text) });
  } else if (out.recolorModule) {
    const named = new Set(sel.named);
    const colours = (kind) => {
      const [fill, stroke] = RECOLOR_TOKENS[kind];
      return { ...(fill && named.has(fill) ? { fill: sel.tokens[fill] } : {}), ...(named.has(stroke) ? { stroke: sel.tokens[stroke] } : {}) };
    };
    push({ id: s.pool.id, kind: "pool", ...colours("pool") });
    push({ id: s.lane.id, kind: "lane", ...colours("lane") });
    for (const n of s.nodes) push({ id: n.id, kind: RECOLOR_KIND[n.type], ...colours(RECOLOR_KIND[n.type]) });
    for (const a of anns) {
      const kind = X.annotationKind("recolor", X.roleFor(p, a.text));
      push({ id: a.id, kind, ...colours(kind) });
    }
    for (const as of assocs) push({ id: as.id, kind: "link", ...colours("link") });
  } else {
    for (const id of [s.pool.id, s.lane.id, ...s.nodes.map((n) => n.id), ...anns.map((a) => a.id), ...assocs.map((a) => a.id)]) push({ id, kind: "upstream" });
  }
  return out;
}
const SURFACE_REQUESTS = {
  L: [{ look: "look-annotated" }, { look: "look-recolor", tokens: { taskFill: "#abcdef", stroke: "#222222" } }, { look: "look-recolor", options: { drawing: "drawing-flat" } }, { look: "look-plain" }, {}],
  AB: [{ look: "alpha-look" }, { look: "gamma-look" }, { look: "beta-look", options: { drawing: "flat-b" } }, { look: "beta-look", tokens: { taskFill: "#abcdef", stroke: "#222222" } }, { look: "delta-look", options: { drawing: "flat-a" } }, { look: "delta-look", tokens: { fill: "#abcdef" } }, {}],
};
const WORKSHOP_FORMATS = {
  L: [{ id: "f-plain", label: "Plain", look: "look-plain" }, { id: "f-annotated", label: "Annotated", look: "look-annotated", tokens: { taskFill: "#abcdef" } }, { id: "f-flat", label: "Flat", look: "look-recolor", options: { drawing: "drawing-flat" } }],
  AB: [{ id: "f-alpha", label: "Alpha", look: "alpha-look" }, { id: "f-beta", label: "Beta", look: "beta-look" }, { id: "f-alpha-palette", label: "Alpha palette", look: "beta-look", options: { palette: "palette-a" } }],
};
function workshop(p, formats, clicks, index) {
  return {
    formats: formats.map((f) => ({ id: f.id, selection: themeSelect(p, { look: f.look, ...(f.tokens ? { tokens: f.tokens } : {}), ...(f.options ? { options: f.options } : {}) }) })),
    navigation: clicks.map((v) => X.navigate(p, v, index)),
  };
}

// ------------------------------------------------------------------ profile path (lot-0 neutral profiles; DESIGN.md:115-116, 146, 154, 163, 280)
const PROFILE_FACTS = {
  A: { marker: "[Aid]", strip: "[Aid] ", taskType: "bpmn:Task", upper: false },
  B: { marker: "[Note]", strip: "[Note] ", taskType: "bpmn:ServiceTask", upper: true },
};
const ELEMENTS = [
  { $type: "bpmn:TextAnnotation", id: "Ann1", text: "[Aid] alpha" }, { $type: "bpmn:TextAnnotation", id: "Ann2", text: "[Note] beta" },
  { $type: "bpmn:TextAnnotation", id: "Ann3", text: "[Binder] gamma" }, { $type: "bpmn:TextAnnotation", id: "Ann4", text: "[Gadget] delta" },
  { $type: "bpmn:TextAnnotation", id: "Ann5", text: " [Aid] lead" }, { $type: "bpmn:TextAnnotation", id: "Ann6", text: "[Aid]tight" },
  { $type: "bpmn:TextAnnotation", id: "Ann7", text: "[Note] straße" }, { $type: "bpmn:TextAnnotation", id: "Ann8", text: "[Note]  two" },
  { $type: "bpmn:Task", id: "Task1", name: "Review" }, { $type: "bpmn:ServiceTask", id: "Service1", name: "Send" }, { $type: "bpmn:Task", id: "Task2" },
];
const notionsOf = (k, e) => {
  const f = PROFILE_FACTS[k];
  if (e.$type === "bpmn:TextAnnotation" && (e.text ?? "").startsWith(f.marker)) return ["aid"];
  if (e.$type === f.taskType) return ["task"];
  return [];
};
const profileLabel = (k, e) => {
  const f = PROFILE_FACTS[k];
  if (notionsOf(k, e)[0] === "aid") {
    const stripped = e.text.startsWith(f.strip) ? e.text.slice(f.strip.length) : e.text;
    return f.upper ? X.upper15(stripped) : stripped;
  }
  return e.name;
};
const profileRecognise = (k) => ELEMENTS.map((e) => ({ id: e.id, notions: notionsOf(k, e) }));
const profileLabels = (k) => ELEMENTS.filter((e) => notionsOf(k, e).length).map((e) => ({ id: e.id, notion: notionsOf(k, e)[0], ...(profileLabel(k, e) !== undefined ? { label: profileLabel(k, e) } : {}) }));
const profileBindings = (k) => ELEMENTS.filter((e) => notionsOf(k, e).length).map((e) => {
  const notion = notionsOf(k, e)[0];
  const label = profileLabel(k, e);
  return { id: e.id, notion, theme: "plain", glyph: notion, tokens: [{ name: "fill", value: notion === "aid" ? "#eeeeff" : "#ffffff" }], ...(label !== undefined ? { label } : {}) };
});
const stableId = (ownerId, slot, key) => `g_${sha(canonical(["profile-mechanism/1", ownerId, slot, key]))}`;
const profileCreate = (k) => ({ parent: "P1", property: "artifacts", element: { $type: "bpmn:TextAnnotation", id: stableId("P1", "aid", "note-1"), text: `${PROFILE_FACTS[k].strip}planner` } });

// =================================================================== group L: occurrence ledger, distribution and seal hygiene
const ledgerArt = () => art("ledger", "ledger.json");
const baseInputs = () => [inline("base", ledger.base), art("lexicon", "lexicon.json"), art("rules", "classification-rules.json"), inline("pack", ledger.inputs.pack)];
addCase("L", 1, "occurrences", { operation: "x24.inventory", comparators: ["x24-ledger/1"], build: () => ({ inputs: baseInputs(), expected: [inline("section", { pointer: "/occurrences", rows: ledger.summary.occurrences, byForm: ledger.summary.byForm, byFamily: ledger.summary.byFamily, byDisposition: ledger.summary.byDisposition }), ledgerArt()] }) },
  { clauses: ["§12 L821-859", "§12.1 L863", "§12.1 L872-874"], consumer: "all", wrong: "W-L1" });
addCase("L", 2, "distribution-members", { operation: "x24.inventory", comparators: ["x24-ledger/1"], build: () => ({ inputs: baseInputs(), expected: [inline("section", { pointer: "/distributionMembers", members: ledger.summary.distributionMembers, memberOccurrences: ledger.summary.memberOccurrences, byStatus: ledger.summary.membersByStatus, byKind: ledger.summary.membersByKind }), ledgerArt()] }) },
  { clauses: ["§12.1 L863", "§12.1 L865-870", "§12.1 L874"], consumer: "package-surface", wrong: "W-L2" });
addCase("L", 3, "modules", { operation: "x24.inventory", comparators: ["x24-ledger/1"], build: () => ({ inputs: baseInputs(), expected: [inline("section", { pointer: "/modules", modules: ledger.modules.map((m) => ({ id: m.id, paths: m.paths, disposition: m.disposition, occurrences: m.occurrences })) }), ledgerArt()] }) },
  { clauses: ["§12.2 L880-897"], consumer: "all", wrong: "W-L3" });
addCase("L", 4, "zero-unmatched", { operation: "x24.inventory", comparators: ["x24-ledger/1"], build: () => ({ inputs: baseInputs(), expected: [inline("section", { unmatched: 0, unexplainedMemberHits: 0, brandOccurrences: ledger.occurrences.filter((r) => r.family === "brand").length, privateRows: ledger.occurrences.filter((r) => r.family === "private").map((r) => ({ id: r.id, file: r.file, line: r.line, column: r.column, disposition: r.disposition })) }), ledgerArt()] }) },
  { clauses: ["§12 L823", "§12.1 L863", "§12.1 L874", "§1 L34"], consumer: "all", wrong: "W-L4" });
const legacyValues = JSON.parse(read("legacy-values.json"));
addCase("L", 5, "legacy-value-pins", { operation: "x24.legacy.values", comparators: ["x24-legacy-values/1"], build: () => ({ inputs: [art("legacy-values", "legacy-values.json"), inline("private-legacy-data", { owner: "private integration", supplied: false, note: "Data UNSEALED; the private integration runs this case with its legacy business-policy/1 record and descriptor package." })], expected: [inline("pins", Object.fromEntries(Object.entries(legacyValues.values).map(([k, v]) => [k, v.sha256])))] }) },
  { clauses: ["§12.2 L899", "§16 item 5 L1148", "§9.5 L729"], consumer: "all", wrong: "W-L5" });
addCase("L", 6, "literal-free-seal", { operation: "x24.seal.literals", comparators: ["x24-seal-literals/1"], build: () => ({ inputs: [art("lexicon", "lexicon.json"), art("ledger", "ledger.json"), { ...art("rules", "probe-expectations.json"), pointer: "/sealHygiene" }, inline("scope", "every file of seal.json#/files and seal.json#/external, tests/x24-externalization-seal.test.mjs, docs/design/receipts/block-b-x24-history-guard.json, and every string field, key and row concatenation of ledger.json"), art("literal-set", "literal-set.json")], expected: [inline("literals", { relaxedHits: 0, literalHits: 0, ledgerHits: 0, exceptions: [] })] }) },
  { clauses: ["§12 L823", "§12.1 L872-874", "§1 L34"], consumer: "all", wrong: "W-L6" });

// =================================================================== group S: business-policy/1 admission and recognition stage
const schemaArt = () => art("schema", "policy/business-policy-1.schema.json");
const sectionsOf = (p) => Object.keys(p).filter((s) => s !== "policyVersion" && s !== "id").sort();
["A", "B", "L"].forEach((k, i) => {
  addCase("S", i + 1, `valid-${BASE[k].id}`, { operation: "x24.policy.validate", phase: "load", comparators: ["x24-exact-json/1"], build: () => ({ inputs: [schemaArt(), art("policy-text", POLICY_PATH[k])], expected: [inline("policy", { status: "ok", id: BASE[k].id, canonicalSha256: canonicalSha256(BASE[k]), sections: sectionsOf(BASE[k]) })] }) },
    { clauses: ["§12 L830-831, L836, L859", "§2.1 L48"], consumer: "all", wrong: "W-S1" });
});
const mutate = (k, edit) => {
  const p = structuredClone(BASE[k]);
  edit(p);
  return p;
};
const OVERLAP = mutate("A", (p) => {
  p.id = "x24-overlap";
  p.classification.annotationRoles[1].prefix = "[Aid]x";
});
const refusalCase = (n, slug, text, code, clause) => addCase("S", n, slug, { operation: "x24.policy.validate", phase: "load", comparators: ["x24-refusal/1"], build: () => ({ inputs: [schemaArt(), inline("policy-text", { text })], expected: [inline("refusal", { status: "refused", code })], status: `refused:${code}` }) },
  { clauses: [clause], consumer: "all", wrong: code.startsWith("profile-json") || code === "profile-number" || code === "profile-unicode" ? "W-S3" : "W-S2" });
const json = (p) => JSON.stringify(p);
refusalCase(4, "unknown-field", json(mutate("A", (p) => { p.extra = true; })), "profile-schema", "§2.1 L48");
refusalCase(5, "null-value", json(mutate("A", (p) => { p.classification.insertSeparator = null; })), "profile-schema", "§2.1 L48");
refusalCase(6, "empty-prefix", json(mutate("A", (p) => { p.classification.annotationRoles[0].prefix = ""; })), "profile-schema", "§2.3 L146");
refusalCase(7, "unknown-trim", json(mutate("A", (p) => { p.classification.annotationRoles[0].trim = "both"; })), "profile-schema", "§2.3 L146");
refusalCase(8, "duplicate-role", json(mutate("A", (p) => { p.classification.annotationRoles[1].role = "application"; })), "profile-symbol", "§2.4.1 L190");
addCase("S", 9, "overlapping-prefix", { operation: "x24.classify", phase: "recognize", comparators: ["x24-refusal/1"], build: () => ({ inputs: [schemaArt(), inline("policy-text", { text: json(OVERLAP) }), inline("vectors", [{ text: "[Aid]x both" }])], expected: [inline("refusal", { status: "refused", code: "profile-ambiguous-notion", stage: "recognize", vector: 0 })], status: "refused:profile-ambiguous-notion" }) },
  { clauses: ["§2.3 L154", "§2.4.1 L182"], consumer: "render, layout, exporters", wrong: "W-S4" });
refusalCase(10, "short-width-table", json(mutate("A", (p) => { p.metrics.regular.pop(); })), "profile-schema", "§12 L836");
refusalCase(11, "legacy-retarget", json(mutate("L", (p) => { p.attachment.nonActivityHost = "legacy-retarget"; })), "profile-schema", "§12 L855, §12.2 L896, §13 L916");
refusalCase(12, "empty-rules", json(mutate("L", (p) => { p.navigation = { mode: "legacy-rules", rules: [] }; })), "profile-schema", "§12 L859");
refusalCase(13, "missing-metrics", json(mutate("A", (p) => { delete p.metrics; })), "profile-schema", "§2.1 L48");
refusalCase(14, "alias-target-outside-table", json(mutate("B", (p) => { p.metrics.aliases[0].to = "é"; })), "profile-type", "§9.3 L702, §12 L857");
refusalCase(15, "alias-source-inside-table", json(mutate("B", (p) => { p.metrics.aliases[0].from = "A"; })), "profile-type", "§9.3 L702");
refusalCase(16, "duplicate-alias", json(mutate("L", (p) => { p.metrics.aliases.push({ from: "Í", to: "J" }); })), "profile-symbol", "§2.4.1 L190");
refusalCase(17, "duplicate-look", json(mutate("L", (p) => { p.presentation.looks[2].alias = "look-annotated"; })), "profile-symbol", "§2.4.1 L190, §9.5 L729");
refusalCase(18, "upstream-look-with-tokens", json(mutate("L", (p) => { p.presentation.looks[0].tokens = p.presentation.looks[1].tokens; })), "profile-schema", "§9.5 L729");
refusalCase(19, "duplicate-node-size", json(mutate("A", (p) => { p.presentation.layout.nodeSizes.push({ kind: "task", width: 1, height: 1 }); })), "profile-symbol", "§2.4.1 L190, §9.4 L721");
refusalCase(20, "decode-unknown-kind", json(mutate("A", (p) => { p.presentation.exportStyles.decode.kinds[0].kind = "dataStoreReference"; })), "profile-schema", "§12 L843");
const lexical = [
  [21, "lexical-number", json(BASE.A).replace('"fallback":500', '"fallback":1e400'), "profile-number"],
  [22, "lexical-duplicate-key", json(BASE.A).replace('"policyVersion":"1"', '"policyVersion":"1","policyVersion":"1"'), "profile-json-duplicate-key"],
  [23, "lexical-lone-surrogate", json(BASE.A).replace('"id":"x24-neutral-a"', '"id":"x24-\\ud800"'), "profile-unicode"],
];
for (const [n, slug, text, code] of lexical) {
  if (text === json(BASE.A)) throw new Error(`lexical mutation ${slug} did not apply`);
  refusalCase(n, slug, text, code, "§2.1.1 L85-101");
}
addCase("S", 24, "overlapping-prefix-admitted", { operation: "x24.policy.validate", phase: "load", comparators: ["x24-exact-json/1"], build: () => ({ inputs: [schemaArt(), inline("policy-text", { text: json(OVERLAP) })], expected: [inline("policy", { status: "ok", id: OVERLAP.id, canonicalSha256: canonicalSha256(OVERLAP), sections: sectionsOf(OVERLAP) })] }) },
  { clauses: ["§2.3 L154", "§2.4.1 L182, L190"], consumer: "all", wrong: "W-S4" });
const OVERLAP_TEXTS = ["[Aid] single", "[Aid]", "[Aid]y other", "[Folio] former document", "plain"];
addCase("S", 25, "overlapping-prefix-unambiguous", { operation: "x24.classify", phase: "recognize", comparators: ["x24-exact-json/1"], build: () => ({ inputs: [schemaArt(), inline("policy-text", { text: json(OVERLAP) }), inline("vectors", OVERLAP_TEXTS.map((text) => ({ text })))], expected: [inline("results", OVERLAP_TEXTS.map((t) => classifyRow(OVERLAP, t)))] }) },
  { clauses: ["§2.3 L146, L154"], consumer: "render, layout, exporters", wrong: "W-S4" });
refusalCase(26, "unknown-node-slot", json(mutate("A", (p) => { p.presentation.layout.nodeSizes[0].kind = "lane"; })), "profile-schema", "§12 L833, L856");
refusalCase(27, "unknown-navigation-rule", json(mutate("B", (p) => { p.navigation.rules = ["name-equal", "any-name"]; })), "profile-schema", "§12 L859");
refusalCase(28, "missing-facts-property", json(mutate("A", (p) => { delete p.exportFacts.properties.lane; })), "profile-schema", "§12 L839, L853");

// =================================================================== group A: legacy adapter (legacy-shaped synthetic data set)
const lpol = () => art("policy", POLICY_PATH.L);
const reads = (k) => ({ reads: [k] });
addCase("A", 1, "classify", { operation: "x24.classify", phase: "recognize", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("vectors", TEXTS.map((text) => ({ text })))], expected: [inline("results", TEXTS.map((t) => classifyRow(P.L, t)))] }) },
  { clauses: ["§12 L830-831", "§2.3 L146, L152", "§2.2 L115"], consumer: "render, layout, exporters", wrong: "W-A1" });
["annotated", "recolor", "flat"].forEach((family, i) => {
  addCase("A", 2 + i, `kind-${family}`, { operation: "x24.classify.kind", phase: "render", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("family", family), inline("vectors", TEXTS.map((text) => ({ type: "bpmn:TextAnnotation", text })))], expected: [inline("results", TEXTS.map((t) => kindRow(P.L, family, t)))] }) },
    { clauses: ["§12 L830-831, L854", "§12.2 L887"], consumer: "render", wrong: "W-A2" });
});
addCase("A", 5, "layout-input", { operation: "x24.layout.input", phase: "layout", comparators: ["x24-exact-json/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), art("bpmn", "inputs/layout-input.bpmn")], expected: [inline("results", layoutInput(P.L)), inline("state", { inputs: "unchanged" })] }) },
  { clauses: ["§12 L830-831, L855", "§12.2 L887"], consumer: "layout", wrong: "W-A3" });
addCase("A", 6, "layout-size", { operation: "x24.layout.size", phase: "layout", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("vectors", SIZE_VECTORS)], expected: [inline("results", SIZE_VECTORS.map((v) => ({ ...v, result: sizeOf(P.L, v) })))] }) },
  { clauses: ["§12 L844, L856", "§9.4 L721"], consumer: "layout", wrong: "W-A4" });
addCase("A", 7, "metrics", { operation: "x24.metrics", phase: "layout", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("vectors", METRIC_VECTORS)], expected: [inline("results", METRIC_VECTORS.map((v) => ({ ...v, result: metricOf(P.L, v) })))] }) },
  { clauses: ["§12 L836, L857", "§9.3 L702"], consumer: "layout, render", wrong: "W-A5" });
addCase("A", 8, "render-badges", { operation: "x24.render.badges", phase: "render", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("vectors", BADGE_VECTORS)], expected: [inline("results", BADGE_VECTORS.map((v) => ({ ...v, result: badgeOf(P.L, v) })))] }) },
  { clauses: ["§12 L844", "§9.3 L712"], consumer: "render", wrong: "W-A6" });
addCase("A", 9, "render-attachment", { operation: "x24.render.attachment", phase: "render", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => {
  const r = attachment(P.L);
  return { inputs: [lpol(), inline("graph", GRAPH)], expected: [inline("results", { aidsOf: r.aidsOf, hidden: r.hidden })] };
} }, { clauses: ["§12 L831, L844", "§9.3 L712", "§12.2 L887"], consumer: "render", wrong: "W-A7" });
const moveCommand = () => inline("command", { name: "elements.move", shapes: ["T1", "SP1", "U1"], delta: { x: 10, y: 0 } });
addCase("A", 10, "transactions-follow", { operation: "x24.transactions.follow", phase: "edit", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("graph", GRAPH)], command: moveCommand(), expected: [inline("results", { moved: attachment(P.L).moved })] }) },
  { clauses: ["§8.2 L627-635", "§12 L831", "§9.3 L712"], consumer: "transactions", wrong: "W-A8" });
["look-annotated", "look-recolor"].forEach((alias, i) => {
  addCase("A", 11 + i, `tokens-${i ? "recolor" : "annotated"}`, { operation: "x24.tokens.resolve", phase: "render", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("look", alias), inline("vectors", TOKEN_VECTORS.map((overrides) => ({ overrides })))], expected: [inline("results", TOKEN_VECTORS.map((o) => tokensOf(lookOf(P.L, alias), o)))] }) },
    { clauses: ["§12 L829, L837", "§9.3 L700", "§9.5 L729"], consumer: "render, ui", wrong: "W-A9" });
});
addCase("A", 13, "theme-select", { operation: "x24.theme.select", phase: "render", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("vectors", LEGACY_REQUESTS)], expected: [inline("results", LEGACY_REQUESTS.map((r) => themeSelect(P.L, r)))] }) },
  { clauses: ["§12 L837", "§9.5 L729", "§8.1 L615"], consumer: "render, static, workshop", wrong: "W-A10" });
addCase("A", 14, "palette", { operation: "x24.palette", phase: "edit", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("look", "look-annotated")], expected: [inline("results", paletteEntries(P.L))] }) },
  { clauses: ["§12 L843", "§8.3 L649, L659", "§12 L831"], consumer: "ui", wrong: "W-A11" });
addCase("A", 15, "navigation-legacy-default", { operation: "x24.navigation", phase: "navigate", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("vectors", NAV_LEGACY)], expected: [inline("results", NAV_LEGACY.map((v) => X.navigate(P.L, v, INDEX)))] }) },
  { clauses: ["§12 L859", "§8.1 L623"], consumer: "workshop", wrong: "W-A12" });
addCase("A", 16, "navigation-legacy-rules", { operation: "x24.navigation", phase: "navigate", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => {
  const vectors = RULE_SETS.flatMap((rules) => NAV_LEGACY.map((v) => ({ navigation: { mode: "legacy-rules", rules }, ...v })));
  return { inputs: [lpol(), inline("vectors", vectors)], expected: [inline("results", vectors.map((v) => ({ rules: v.navigation.rules, ...X.navigate({ ...P.L, navigation: v.navigation }, v, INDEX) })))] };
} }, { clauses: ["§12 L859"], consumer: "workshop", wrong: "W-A13" });
const exportInputs = (k, file) => [art("policy", POLICY_PATH[k]), art("descriptor", descriptorFor(k).path), inline("descriptor", { id: descriptorFor(k).id }), art("bpmn", file)];
const refusalOf = (r) => ({ expected: [inline("refusal", r), inline("state", { inputs: "unchanged" })], status: `refused:${r.code}` });
const okOrRefusal = (r) => (r.status === "refused" ? refusalOf(r) : { expected: [inline("results", r), inline("state", { inputs: "unchanged" })] });
addCase("A", 17, "export-reference-page", { operation: "x24.export.reference", phase: "export", comparators: ["x24-exact-json/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: exportInputs("L", "inputs/export-legacy.bpmn"), ...okOrRefusal(run(() => ({ status: "ok", pages: pagesOf(P.L, "inputs/export-legacy.bpmn", DESCRIPTOR.A) }))) }) },
  { clauses: ["§12 L830-831, L839, L843", "§10.2 L770-803"], consumer: "exporters", wrong: "W-A14" });
addCase("A", 18, "export-sparx", { operation: "x24.export.sparx", phase: "export", comparators: ["x24-exact-json/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: exportInputs("L", "inputs/export-legacy.bpmn"), ...okOrRefusal(run(() => ({ status: "ok", models: X.sparxModel(pagesOf(P.L, "inputs/export-legacy.bpmn", DESCRIPTOR.A), P.L) }))) }) },
  { clauses: ["§12 L831, L843", "§10.2 L793"], consumer: "exporters", wrong: "W-A15" });
addCase("A", 19, "export-drawio", { operation: "x24.export.drawio", phase: "export", comparators: ["x24-exact-json/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: exportInputs("L", "inputs/export-legacy.bpmn"), ...okOrRefusal(run(() => {
  const pages = pagesOf(P.L, "inputs/export-legacy.bpmn", DESCRIPTOR.A);
  return { status: "ok", pages: pages.map((page) => X.drawioPage(page, pages, P.L)) };
})) }) }, { clauses: ["§12 L829, L843, L844", "§10.2 L770-772"], consumer: "exporters", wrong: "W-A16" });
addCase("A", 20, "import-drawio", { operation: "x24.import.drawio", phase: "import", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), art("drawio", DECODE_FILE.L)], expected: [inline("results", run(() => decode(P.L, "L")))] }) },
  { clauses: ["§12 L830-831, L843"], consumer: "importers", wrong: "W-A17" });
addCase("A", 21, "export-free-annotation", { operation: "x24.export.reference", phase: "export", comparators: ["x24-refusal/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: exportInputs("L", "inputs/export-a.bpmn"), ...refusalOf(run(() => pagesOf(P.L, "inputs/export-a.bpmn", DESCRIPTOR.A))) }) },
  { clauses: ["§12 L830-831", "§12.2 L886", "§10.2 L791"], consumer: "exporters", wrong: "W-A18" });
const autoCommand = () => inline("command", { name: "bpmnCanvas.autoLayout" });
addCase("A", 22, "transactions-autolayout", { operation: "x24.transactions.autolayout", phase: "edit", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("layout", AUTO_LAYOUT), inline("graph", AUTO_GRAPH)], command: autoCommand(), expected: [inline("results", autoLayoutBadges(P.L))] }) },
  { clauses: ["§12 L831, L844", "§9.3 L712", "§8.2 L627-635"], consumer: "transactions", wrong: "W-A19" });
addCase("A", 23, "layout-process", { operation: "x24.layout.process", phase: "layout", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), art("layout-model", "inputs/layout-process.json")], expected: [inline("results", { processes: [{ id: "P1", layout: layoutProcessResult(P.L) }] })] }) },
  { clauses: ["§12 L836, L844, L856", "§9.4 L721"], consumer: "layout", wrong: "W-A20" });
addCase("A", 24, "export-facts", { operation: "x24.export.legacy", phase: "export", comparators: ["x24-exact-json/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: exportInputs("L", "inputs/export-facts.bpmn"), ...okOrRefusal(run(() => exportAll(P.L, "inputs/export-facts.bpmn", DESCRIPTOR.A))) }) },
  { clauses: ["§12 L839, L853", "§10.2 L770-803"], consumer: "exporters", wrong: "W-A21" });
addCase("A", 25, "facts-descriptor-mismatch", { operation: "x24.export.legacy", phase: "export", comparators: ["x24-refusal/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), art("descriptor", DESCRIPTOR.B.path), inline("descriptor", { id: DESCRIPTOR.B.id }), art("bpmn", "inputs/export-legacy.bpmn")], ...refusalOf(run(() => exportAll(P.L, "inputs/export-legacy.bpmn", DESCRIPTOR.B))) }) },
  { clauses: ["§12 L839, L853", "§2.4.1 L190", "§8.1 L606"], consumer: "exporters", wrong: "W-A22" });
addCase("A", 26, "static-surface", { operation: "x24.surface.static", phase: "render", comparators: ["x24-exact-json/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), art("bpmn", "inputs/surface.bpmn"), inline("vectors", SURFACE_REQUESTS.L)], expected: [inline("results", SURFACE_REQUESTS.L.map((r) => surfaceRender(P.L, r))), inline("state", { inputs: "unchanged" })] }) },
  { clauses: ["§12 L829-831, L837, L844", "§12.1 L870", "§9.3 L712", "§12.2 L888"], consumer: "static, render", wrong: "W-A23" });
addCase("A", 27, "preview-surface", { operation: "x24.surface.preview", phase: "render", comparators: ["x24-exact-json/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), art("bpmn", "inputs/surface.bpmn"), inline("vectors", SURFACE_REQUESTS.L.slice(0, 2))], expected: [inline("results", SURFACE_REQUESTS.L.slice(0, 2).map((r) => surfaceRender(P.L, r))), inline("state", { inputs: "unchanged" })] }) },
  { clauses: ["§12 L858", "§12.1 L870, L876", "§12.2 L897"], consumer: "assistant, render", wrong: "W-A24" });
addCase("A", 28, "workshop-surface", { operation: "x24.surface.workshop", phase: "navigate", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("formats", WORKSHOP_FORMATS.L), inline("vectors", NAV_LEGACY.slice(0, 4))], expected: [inline("results", workshop(P.L, WORKSHOP_FORMATS.L, NAV_LEGACY.slice(0, 4), INDEX))] }) },
  { clauses: ["§12 L837, L858, L859", "§12.1 L870, L876", "§8.1 L615, L623"], consumer: "workshop", wrong: "W-A25" });
addCase("A", 29, "facts-unknown-version", { operation: "x24.export.legacy", phase: "export", comparators: ["x24-refusal/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: exportInputs("L", "inputs/export-facts-version-a.bpmn"), ...refusalOf(run(() => exportAll(P.L, "inputs/export-facts-version-a.bpmn", DESCRIPTOR.A))) }) },
  { clauses: ["§12 L839, L853", "§12.2 L882"], consumer: "exporters", wrong: "W-A26" });

// =================================================================== group R: removed hidden policies
const apol = () => art("policy", POLICY_PATH.A);
addCase("R", 1, "nonactivity-host-preserved", { operation: "x24.layout.input", phase: "layout", comparators: ["x24-exact-json/1", "x24-state/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), art("bpmn", "inputs/layout-nonactivity.bpmn")], expected: [inline("results", layoutNonActivity(P.L)), inline("state", { inputs: "unchanged" })] }) },
  { clauses: ["§12 L855", "§12.2 L896", "§13 L916"], consumer: "layout", wrong: "W-R1" });
addCase("R", 2, "navigation-called-element", { operation: "x24.navigation", phase: "navigate", comparators: ["x24-exact-json/1"], ...reads("A"), build: (P) => ({ inputs: [apol(), inline("index", INDEX), inline("vectors", NAV_NATIVE)], expected: [inline("results", NAV_NATIVE.map((v) => X.navigate(P.A, v, INDEX)))] }) },
  { clauses: ["§12 L859", "§8.1 L623", "§12.2 L896"], consumer: "workshop, ui", wrong: "W-R2" });
const NFD_VECTORS = [{ measure: "text-width", text: "ñ", size: 12, bold: false }, { measure: "text-width", text: "ü", size: 12, bold: false }, { measure: "text-width", text: "Å", size: 12, bold: false }];
addCase("R", 3, "no-ambient-decomposition", { operation: "x24.metrics", phase: "layout", comparators: ["x24-exact-json/1"], ...reads("L"), build: (P) => ({ inputs: [lpol(), inline("vectors", NFD_VECTORS)], expected: [inline("results", NFD_VECTORS.map((v) => ({ ...v, result: metricOf(P.L, v) })))] }) },
  { clauses: ["§12 L857", "§9.3 L702"], consumer: "layout", wrong: "W-R3" });
const EXPORT_KEYS = [".", "./react", "./assistant-ui", "./styles.css", "./package.json", "./io", "./layout", "./profile-lint", "./browser", "./browser/iife", "./profile", "./profile/compiler"];
addCase("R", 4, "no-forced-descriptor", { operation: "x24.package.surface", phase: "package", comparators: ["x24-assertions/1"], build: () => ({ inputs: [inline("checks", ["package.json#/exports", "dist members", "io entry exports", "codec packages without injection"])], expected: [inline("assertions", [
  { pointer: "/packageExports", op: "keysEqual", value: EXPORT_KEYS },
  { pointer: "/packageExports", op: "noLexiconOccurrence", value: { families: ["descriptor"] } },
  { pointer: "/distMembers", op: "noLexiconOccurrence", value: { families: ["descriptor"] } },
  { pointer: "/ioExports", op: "noLexiconOccurrence", value: { families: ["descriptor"] } },
  { pointer: "/codecPackagesWithoutInjection", op: "equals", value: ["bioc", "bpmn", "bpmndi", "color", "dc", "di"] },
])] }) }, { clauses: ["§12 L853", "§12.2 L895", "§8.1 L606"], consumer: "descriptor, package-surface", wrong: "W-R4" });
// Base look aliases by ledger row: the legacy public look type union of src/types.ts line 7.
const lookRef = (entry) => {
  const row = ledger.occurrences.find((r) => r.file === "src/types.ts" && r.line === 7 && r.entry === entry && r.form === "raw");
  if (!row) throw new Error(`no base look literal for ${entry}`);
  return { concat: [literalRef(row.id)] };
};
const BASE_LOOKS = ["LX-TH-3", "LX-TH-1", "LX-TH-2"].map(lookRef);
addCase("R", 5, "no-built-in-look", { operation: "x24.theme.select", phase: "render", comparators: ["x24-exact-json/1"], ...reads("A"), build: (P) => {
  const vectors = [...BASE_LOOKS.map((look) => ({ look })), { look: BASE_LOOKS[2], tokens: { taskFill: "#abcdef" } }, {}];
  return { inputs: [apol(), inline("vectors", vectors)], expected: [inline("results", vectors.map((v) => (v.look ? { status: "refused", code: "profile-symbol" } : themeSelect(P.A, v))))] };
} }, { clauses: ["§12 L837", "§9.5 L729", "§12.2 L899"], consumer: "render, static, workshop", wrong: "W-R5" });
addCase("R", 6, "io-set-selection", { operation: "x24.ui.create-process-io", phase: "edit", comparators: ["x24-exact-json/1"], build: () => ({ inputs: [inline("process", { ioSpecification: { inputSets: ["IS1", "IS2"], outputSets: ["OS1"] } }), inline("vectors", [{ type: "bpmn:DataInput" }, { type: "bpmn:DataInput", inputSet: "IS2" }, { type: "bpmn:DataOutput" }])], expected: [inline("results", [{ status: "refused", code: "io-set-selection-required" }, { status: "ok", inputSet: "IS2" }, { status: "ok", outputSet: "OS1" }])] }) },
  { clauses: ["§12 L843", "§7.1 L547", "§8.3 L651", "§16 item 8 L1154"], consumer: "transactions, ui", wrong: "W-R6" });
// Base role markers by ledger row: the layout input reads both markers of the base tree at src/internal/processModel.ts lines 81-82.
const markerRef = (line, entry) => {
  const row = ledger.occurrences.find((r) => r.file === "src/internal/processModel.ts" && r.line === line && r.entry === entry && r.form === "raw");
  if (!row) throw new Error(`no base marker on line ${line}`);
  return literalRef(row.id);
};
const BASE_APP = markerRef(81, "LX-MK-2");
const BASE_DOC = markerRef(82, "LX-MK-1");
const NO_POLICY = [
  { concat: [BASE_DOC, " Spec"] }, { concat: ["  ", BASE_DOC, "Spec"] }, { concat: [" ", BASE_APP, " CRM "] }, { concat: [BASE_APP] }, { concat: ["\t", BASE_DOC, "\tA"] },
  "[Binder] Spec", "[Gadget] CRM", "[Aid] alpha", "[Folio] Manual", "[Note] beta", "[Leaf] Handbook", "plain text", "",
];
const noPolicyRow = () => ({ document: false, application: false, role: null, displayNameUnchanged: true, layoutName: null });
addCase("R", 7, "no-policy-recognises-nothing", { operation: "x24.classify", phase: "recognize", comparators: ["x24-exact-json/1"], build: () => ({ inputs: [inline("policy-supplied", false), inline("vectors", NO_POLICY.map((text) => ({ text })))], expected: [inline("results", NO_POLICY.map(noPolicyRow))] }) },
  { clauses: ["§12 L830-831", "§1 L34", "§12.2 L899"], consumer: "render, layout, exporters", wrong: "W-R7" });
addCase("R", 8, "browser-entry-defaults", { operation: "x24.package.surface", phase: "package", comparators: ["x24-assertions/1"], build: () => ({ inputs: [inline("checks", ["browser entry exports"])], expected: [inline("assertions", [
  { pointer: "/browserExports", op: "noLexiconOccurrence", value: { families: ["theme", "palette", "classification-api"] } },
  { pointer: "/browserExports", op: "excludesPattern", value: "_ACTION_IDS$" },
])] }) }, { clauses: ["§12 L829, L837", "§12.2 L899"], consumer: "package-surface", wrong: "W-R8" });
[["A", 9, "inputs/export-facts-version-a.bpmn"], ["B", 10, "inputs/export-facts-version-b.bpmn"]].forEach(([k, n, file]) => {
  addCase("R", n, `facts-version-${k.toLowerCase()}`, { operation: "x24.export.legacy", phase: "export", comparators: ["x24-refusal/1", "x24-state/1"], ...reads(k), build: (P) => ({ inputs: exportInputs(k, file), ...refusalOf(run(() => exportAll(P[k], file, descriptorFor(k)))) }) },
    { clauses: ["§12 L839, L853", "§12.2 L882, L895"], consumer: "exporters", wrong: "W-R9" });
});

// =================================================================== group X: substitution neutral A <-> neutral B
const abPolicies = () => [art("policy-a", POLICY_PATH.A), art("policy-b", POLICY_PATH.B)];
const sub = (n, slug, operation, phase, extra, fa, meta, command) => addCase("X", n, slug, { operation, phase, comparators: ["x24-substitution/1"], reads: ["A", "B"], build: (P) => ({ inputs: [...abPolicies(), ...extra()], ...(command ? { command: command() } : {}), expected: subst(fa(P.A, "A"), fa(P.B, "B")) }) }, meta);
sub(1, "classify", "x24.classify", "recognize", () => [inline("vectors", TEXTS.map((text) => ({ text })))], (p) => TEXTS.map((t) => classifyRow(p, t)), { clauses: ["§12 L830-831", "§2.3 L146, L152", "§14.2 L951", "§1 L34"], consumer: "render, layout, exporters", wrong: "W-X1" });
["annotated", "recolor", "flat"].forEach((family, i) => sub(2 + i, `kind-${family}`, "x24.classify.kind", "render", () => [inline("family", family), inline("vectors", TEXTS.map((text) => ({ type: "bpmn:TextAnnotation", text })))], (p) => TEXTS.map((t) => kindRow(p, family, t)), { clauses: ["§12 L830-831, L854"], consumer: "render", wrong: "W-X2" }));
sub(5, "layout-input", "x24.layout.input", "layout", () => [art("bpmn", "inputs/layout-input.bpmn")], (p) => layoutInput(p), { clauses: ["§12 L830-831", "§14.2 L951"], consumer: "layout", wrong: "W-X3" });
sub(6, "layout-size", "x24.layout.size", "layout", () => [inline("vectors", SIZE_VECTORS)], (p) => SIZE_VECTORS.map((v) => ({ ...v, result: sizeOf(p, v) })), { clauses: ["§12 L836, L844, L856", "§9.4 L721"], consumer: "layout", wrong: "W-X4" });
sub(7, "metrics", "x24.metrics", "layout", () => [inline("vectors", METRIC_VECTORS)], (p) => METRIC_VECTORS.map((v) => ({ ...v, result: metricOf(p, v) })), { clauses: ["§12 L836, L857", "§9.3 L702"], consumer: "layout, render", wrong: "W-X5" });
sub(8, "render-badges", "x24.render.badges", "render", () => [inline("vectors", BADGE_VECTORS)], (p) => BADGE_VECTORS.map((v) => ({ ...v, result: badgeOf(p, v) })), { clauses: ["§12 L844", "§9.3 L712"], consumer: "render", wrong: "W-X6" });
sub(9, "render-attachment", "x24.render.attachment", "render", () => [inline("graph", GRAPH)], (p) => {
  const r = attachment(p);
  return { aidsOf: r.aidsOf, hidden: r.hidden };
}, { clauses: ["§12 L831", "§9.3 L712"], consumer: "render", wrong: "W-X7" });
sub(10, "transactions-follow", "x24.transactions.follow", "edit", () => [inline("graph", GRAPH)], (p) => ({ moved: attachment(p).moved }), { clauses: ["§8.2 L627-635", "§12 L831"], consumer: "transactions", wrong: "W-X8" }, moveCommand);
sub(11, "tokens", "x24.tokens.resolve", "render", () => [inline("look", { first: true }), inline("vectors", TOKEN_VECTORS.map((overrides) => ({ overrides })))], (p) => TOKEN_VECTORS.map((o) => ({ look: p.presentation.looks[0].alias, overrides: o, ...tokensOf(p.presentation.looks[0], o) })), { clauses: ["§12 L829, L837", "§9.3 L700"], consumer: "render, ui", wrong: "W-X9" });
sub(12, "theme-select", "x24.theme.select", "render", () => [inline("vectors", AB_REQUESTS)], (p) => AB_REQUESTS.map((r) => themeSelect(p, r)), { clauses: ["§12 L837", "§9.5 L729"], consumer: "render, static, workshop", wrong: "W-X10" });
sub(13, "palette", "x24.palette", "edit", () => [inline("look", { first: true })], paletteEntries, { clauses: ["§12 L843", "§8.3 L649, L659"], consumer: "ui", wrong: "W-X11" });
sub(14, "navigation", "x24.navigation", "navigate", () => [inline("index", INDEX), inline("vectors", NAV_MIXED)], (p) => NAV_MIXED.map((v) => X.navigate(p, v, INDEX)), { clauses: ["§12 L859", "§8.1 L623"], consumer: "workshop", wrong: "W-X12" });
const exportFor = (file) => (p, k) => run(() => exportAll(p, file, descriptorFor(k)));
const exportInputsAB = (file) => () => [art("descriptor-a", DESCRIPTOR.A.path), inline("descriptor-a-id", { id: DESCRIPTOR.A.id }), art("descriptor-b", DESCRIPTOR.B.path), inline("descriptor-b-id", { id: DESCRIPTOR.B.id }), art("bpmn", file)];
[[15, "export-a-input", "inputs/export-a.bpmn"], [16, "export-b-input", "inputs/export-b.bpmn"], [17, "export-legacy-input", "inputs/export-legacy.bpmn"]].forEach(([n, slug, file]) => {
  sub(n, slug, "x24.export.legacy", "export", exportInputsAB(file), exportFor(file), { clauses: ["§12 L830-831, L843", "§12.2 L886", "§10.2 L770-803", "§14.2 L951"], consumer: "exporters", wrong: "W-X13" });
});
sub(18, "import-neutral", "x24.import.drawio", "import", () => [art("drawio", DECODE_FILE.A)], (p) => run(() => decode(p, "A")), { clauses: ["§12 L843"], consumer: "importers", wrong: "W-X14" });
sub(19, "import-legacy-symbols", "x24.import.drawio", "import", () => [art("drawio", DECODE_FILE.L)], (p) => run(() => decode(p, "L")), { clauses: ["§12 L843", "§12.2 L886", "§10.2 L791"], consumer: "importers", wrong: "W-X15" });
const profAB = () => [inline("profile-a", PROFILE.A), inline("profile-b", PROFILE.B)];
const profileCase = (n, slug, operation, phase, extra, f, meta) => addCase("X", n, slug, { operation, phase, comparators: ["x24-substitution/1"], build: () => ({ inputs: [...profAB(), ...extra], expected: subst(f("A"), f("B")) }) }, meta);
profileCase(20, "profile-recognition", "x24.profile.recognize", "recognize", [inline("elements", ELEMENTS)], profileRecognise, { clauses: ["§2.3 L146, L152, L154", "§12 L831", "§14.2 L951"], consumer: "render, ui, transactions", wrong: "W-X16" });
profileCase(21, "profile-render-label", "x24.profile.label", "render", [inline("elements", ELEMENTS)], profileLabels, { clauses: ["§9.3 L698, L702", "§2.2 L115-116"], consumer: "render", wrong: "W-X17" });
profileCase(22, "profile-create-text", "x24.profile.create", "create", [inline("recipe", "create-aid"), inline("params", { owner: "P1", key: "note-1", body: "planner" })], profileCreate, { clauses: ["§8.3 L655", "§9.3 L702", "§2.4 L163", "§3.2 L276-281"], consumer: "ui, transactions", wrong: "W-X18" });
profileCase(23, "profile-render-bindings", "x24.profile.bindings", "render", [inline("elements", ELEMENTS)], profileBindings, { clauses: ["§9.3 L698-700", "§9.1 L671", "§12 L829-831"], consumer: "render, static", wrong: "W-X19" });
sub(24, "transactions-autolayout", "x24.transactions.autolayout", "edit", () => [inline("layout", AUTO_LAYOUT), inline("graph", AUTO_GRAPH)], autoLayoutBadges, { clauses: ["§12 L831, L844", "§9.3 L712", "§14.2 L951"], consumer: "transactions", wrong: "W-X20" }, autoCommand);
sub(25, "layout-process", "x24.layout.process", "layout", () => [art("layout-model", "inputs/layout-process.json")], (p) => ({ processes: [{ id: "P1", layout: layoutProcessResult(p) }] }), { clauses: ["§12 L836, L844, L856", "§9.4 L721", "§14.2 L951"], consumer: "layout", wrong: "W-X21" });
sub(26, "export-facts", "x24.export.legacy", "export", exportInputsAB("inputs/export-facts.bpmn"), exportFor("inputs/export-facts.bpmn"), { clauses: ["§12 L839, L853", "§10.2 L770-803"], consumer: "exporters", wrong: "W-X22" });
sub(27, "import-b", "x24.import.drawio", "import", () => [art("drawio", DECODE_FILE.B)], (p) => run(() => decode(p, "B")), { clauses: ["§12 L843"], consumer: "importers", wrong: "W-X14" });
sub(28, "static-surface", "x24.surface.static", "render", () => [art("bpmn", "inputs/surface.bpmn"), inline("vectors", SURFACE_REQUESTS.AB)], (p) => SURFACE_REQUESTS.AB.map((r) => surfaceRender(p, r)), { clauses: ["§12 L829-831, L837, L844", "§12.1 L870", "§9.3 L712", "§14.2 L954"], consumer: "static, render", wrong: "W-X23" });
sub(29, "preview-surface", "x24.surface.preview", "render", () => [art("bpmn", "inputs/surface.bpmn"), inline("vectors", SURFACE_REQUESTS.AB.slice(0, 2))], (p) => SURFACE_REQUESTS.AB.slice(0, 2).map((r) => surfaceRender(p, r)), { clauses: ["§12 L858", "§12.1 L870, L876"], consumer: "assistant, render", wrong: "W-X24" });
sub(30, "workshop-surface", "x24.surface.workshop", "navigate", () => [inline("formats", WORKSHOP_FORMATS.AB), inline("index", INDEX), inline("vectors", NAV_MIXED)], (p) => workshop(p, WORKSHOP_FORMATS.AB, NAV_MIXED, INDEX), { clauses: ["§12 L837, L858, L859", "§12.1 L870, L876"], consumer: "workshop", wrong: "W-X25" });
sub(31, "export-facts-b", "x24.export.legacy", "export", exportInputsAB("inputs/export-facts-b.bpmn"), exportFor("inputs/export-facts-b.bpmn"), { clauses: ["§12 L839, L853", "§10.2 L770-803"], consumer: "exporters", wrong: "W-X22" });

// =================================================================== group P: probe expectations
const probeLines = JSON.parse(read("probe-expectations.json")).probe1;
const PROBE_TEXTS = [{ concat: [BASE_DOC, " example"] }, { concat: [BASE_APP, " example"] }, { concat: ["  ", BASE_DOC, " spaced"] }, "[Binder] legacy", "[Gadget] legacy", "[Aid] alpha", "[Note] beta", "[Folio] f", "[Leaf] l", "plain"];
const FN = probeLines.functions;
addCase("P", 1, "probe-1-original", { operation: "x24.probe.classification", phase: "probe", comparators: ["x24-assertions/1"], build: () => ({ inputs: [{ ...art("original", "probe-expectations.json"), pointer: "/probe1/original" }], expected: [inline("assertions", [
  { pointer: "/originalAssertion/function", op: "equals", value: probeLines.original.call.function },
  { pointer: "/originalAssertion/argument", op: "equals", value: probeLines.original.call.argument },
  { pointer: "/originalAssertion/returns", op: "equals", value: false },
])] }) }, { clauses: ["§12 L830", "§1 L34"], consumer: "render", wrong: "W-P1" });
addCase("P", 2, "probe-1-no-policy", { operation: "x24.probe.classification", phase: "probe", comparators: ["x24-exact-json/1"], build: () => {
  const calls = PROBE_TEXTS.flatMap((text) => FN.map((f) => ({ function: f.sha256, args: [text] })));
  return { inputs: [inline("calls", calls)], expected: [inline("results", PROBE_TEXTS.flatMap(() => FN.map((f) => (f.returns === "boolean" ? false : { unchanged: true }))))] };
} }, { clauses: ["§12 L830-831", "§12.2 L899"], consumer: "render", wrong: "W-P2" });
const PROBE_INJECTED = PROBE_TEXTS.filter((t) => typeof t === "string");
addCase("P", 3, "probe-1-injected", { operation: "x24.probe.classification", phase: "probe", comparators: ["x24-exact-json/1"], reads: ["L", "A", "B"], build: (P) => ({ inputs: [art("policy-legacy", POLICY_PATH.L), art("policy-a", POLICY_PATH.A), art("policy-b", POLICY_PATH.B), inline("texts", PROBE_INJECTED)], expected: [inline("results", Object.fromEntries(["L", "A", "B"].map((k) => [k, PROBE_INJECTED.map((t) => ({ text: t, document: X.recognises(P[k], "document", t), application: X.recognises(P[k], "application", t), displayName: X.displayName(P[k], t) }))])))] }) },
  { clauses: ["§12 L830-831", "§14.2 L951"], consumer: "render", wrong: "W-P3" });
addCase("P", 4, "probe-2-original", { operation: "x24.probe.scope", phase: "probe", comparators: ["x24-assertions/1"], build: () => ({ inputs: [inline("scope", "docs/design/profile-externalization-scope.json")], expected: [inline("assertions", [{ pointer: "/occurrences", op: "nonEmptyArray" }, { pointer: "/distributionMembers", op: "nonEmptyArray" }])] }) },
  { clauses: ["§12.1 L863"], consumer: "all", wrong: "W-P4" });
addCase("P", 5, "probe-2-ledger-rows", { operation: "x24.probe.scope", phase: "probe", comparators: ["x24-assertions/1"], build: () => ({ inputs: [inline("scope", "docs/design/profile-externalization-scope.json"), ledgerArt()], expected: [inline("assertions", [
  { pointer: "/format", op: "equals", value: "profile-externalization-scope/2" },
  { pointer: "/baseLedger/sha256", op: "equals", value: sha(read("ledger.json")) },
  { pointer: "/occurrences", op: "containsRowsOf", value: { ledger: "ledger.json", pointer: "/occurrences", key: "id", fields: ["file", "line", "column", "endLine", "endColumn", "form", "entry", "family", "literal", "key", "lineSha256", "rule", "category", "consumer", "targetRef", "disposition"] } },
  { pointer: "/occurrences/*/postMigration/status", op: "inSet", value: ["removed", "injected", "replaced", "retained-legacy-api", "retained-test-input", "successor-public-test", "documentation-updated", "retained-history", "retained-context", "retained-notice"] },
  { pointer: "/occurrences/*/postMigration/evidence", op: "nonEmptyString" },
  { pointer: "", op: "noLexiconOccurrence", value: { mode: "relaxed" } },
])] }) }, { clauses: ["§12.1 L863", "§12.1 L872"], consumer: "all", wrong: "W-P5" });
addCase("P", 6, "probe-2-rescan", { operation: "x24.probe.rescan", phase: "probe", comparators: ["x24-scan/1"], build: () => ({ inputs: [art("lexicon", "lexicon.json"), { ...art("rules", "probe-expectations.json"), pointer: "/rescan" }], expected: [inline("assertions", [
  { pointer: "/unmatched", op: "equals", value: 0 },
  { pointer: "/unexplainedMemberHits", op: "equals", value: 0 },
  { pointer: "/zeroListHits", op: "equals", value: 0 },
  { pointer: "/selectorBranches", op: "equals", value: 0 },
  { pointer: "/unboundExceptions", op: "equals", value: 0 },
])] }) }, { clauses: ["§12.1 L872-874", "§1 L34", "§12.2 L899"], consumer: "all", wrong: "W-P6" });
addCase("P", 7, "probe-2-distribution", { operation: "x24.probe.scope", phase: "probe", comparators: ["x24-assertions/1"], build: () => ({ inputs: [inline("scope", "docs/design/profile-externalization-scope.json")], expected: [inline("assertions", [
  { pointer: "/distributionMembers", op: "equalsPackMembers", value: "npm pack --dry-run --json --ignore-scripts of the post-migration tree" },
  { pointer: "/distributionMembers/*/sha256", op: "matchesBytes" },
  { pointer: "/distributionMembers/*/status", op: "inSet", value: ["clean", "carries-occurrences"] },
  { pointer: "/distributionMembers", op: "noLexiconOccurrence", value: { families: ["descriptor"], field: "path" } },
])] }) }, { clauses: ["§12.1 L865-870", "§12.1 L874"], consumer: "package-surface", wrong: "W-P7" });

// =================================================================== dimension coverage (one mutation per injected field)
const EXEMPT = {
  "/policyVersion": "record version constant (schema const)",
  "/id": "record identity, part of the admission digest only (S group)",
  "/metrics/id": "metrics resource identity, metadata",
  "/metrics/unit": "schema constant",
  "/metrics/firstCodePoint": "schema constant",
  "/metrics/license": "notice metadata carried with the data",
  "/metrics/attribution": "notice metadata carried with the data",
  "/attachment/nonActivityHost": "schema constant (preserve-report)",
};
/** Fields that the legacy semantics never read for the record they sit in (README "Dimension coverage"). */
function exemptFor(policy, pointer) {
  const look = /^\/presentation\/looks\/(\d+)\/(.+)$/.exec(pointer);
  if (look) {
    const l = policy.presentation.looks[Number(look[1])];
    if (look[2] === "flat" && l.renderer !== "recolor") return `ignored by the ${l.renderer} renderer (flat drawing applies to recolour looks)`;
    if (look[2] === "tokens/labelText" && l.renderer === "recolor") return "replaced by the text colour unless named (recolour rule)";
  }
  const size = /^\/presentation\/layout\/nodeSizes\/(\d+)\/(width|height)$/.exec(pointer);
  if (size && policy.presentation.layout.nodeSizes[Number(size[1])].kind === "document") return "not read by the legacy layout: document nodes are sized from presentation.layout.document (src/internal/swimlaneLayout.ts:150)";
  const entry = /^\/presentation\/palette\/entries\/(\d+)\/bpmnType$/.exec(pointer);
  if (entry && policy.presentation.palette.entries[Number(entry[1])].tool === "connect") return "a connect-tool entry creates no element, so its type is not read";
  return null;
}
const leaves = (v, at = "") => (v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => leaves(x, `${at}/${k}`)) : [[at, v]]);
const ALT = {
  trim: { none: "ecma262-2024-start", "ecma262-2024-start": "none" },
  labelCase: { none: "upper", upper: "none" },
  mode: { exact: "assignable", assignable: "exact", "called-element": "legacy-default", "legacy-default": "called-element", "legacy-rules": "called-element" },
  type: { "bpmn:Activity": "bpmn:Task", "bpmn:Task": "bpmn:SubProcess", "bpmn:SubProcess": "bpmn:Task", "bpmn:CallActivity": "bpmn:Task" },
  renderer: { annotated: "recolor", recolor: "annotated", upstream: "upstream" },
  palette: { upstream: "annotated", annotated: "upstream" },
  initialRole: { document: "application", application: "document" },
  kind: { callActivity: "textAnnotation", textAnnotation: "callActivity" },
  group: { events: "flows", activities: "events", gateways: "events", data: "events", annotations: "events", structure: "events", flows: "events" },
  role: { document: "application", application: "document" },
};
function mutated(value, pointer) {
  const key = pointer.split("/").at(-1);
  const parent = pointer.split("/").at(-2);
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return Number.isInteger(value) ? value + Math.max(1, Math.ceil(value * 0.2)) : Math.round((value + 0.05) * 1000) / 1000;
  if (/^\/navigation\/rules\/\d+$/.test(pointer)) return value === "name-equal" ? "name-overlap" : "name-equal";
  if (typeof value === "string" && [...value].length === 1) return String.fromCodePoint(value.codePointAt(0) + 1);
  if (key === "kind" && parent !== undefined && /^\d+$/.test(parent) && pointer.includes("/nodeSizes/")) return null;
  const alt = ALT[key]?.[value];
  if (alt !== undefined) return alt === value ? null : alt;
  return `${value}z`;
}
function setAt(obj, pointer, v) {
  const parts = pointer.split("/").slice(1);
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p];
  o[parts.at(-1)] = v;
}
const consumerCases = cases.filter((x) => x.c.reads?.length && ["A", "R", "X", "P"].includes(x.group));
const baseOutputs = new Map(consumerCases.map((x) => [x.caseId, canonical(materialize(x, BASE))]));
const coverage = {};
const uncovered = [];
for (const k of ["L", "A", "B"]) {
  coverage[k] = {};
  for (const [pointer, value] of leaves(BASE[k])) {
    const reason = EXEMPT[pointer] ?? exemptFor(BASE[k], pointer);
    if (reason) {
      coverage[k][pointer] = { exempt: reason };
      continue;
    }
    const m = mutated(value, pointer);
    if (m === null) {
      coverage[k][pointer] = { exempt: "identity key of a list member (its value is the lookup key of the record)" };
      continue;
    }
    const P = structuredClone(BASE);
    setAt(P[k], pointer, m);
    const hit = [];
    for (const x of consumerCases) {
      if (!x.c.reads.includes(k)) continue;
      let out;
      try {
        out = canonical(materialize(x, P));
      } catch (e) {
        out = `error:${e.message}`;
      }
      if (out !== baseOutputs.get(x.caseId)) hit.push(x.caseId);
    }
    coverage[k][pointer] = { mutation: m, cases: hit };
    if (!hit.length) uncovered.push(`${k} ${pointer}`);
  }
}

// =================================================================== write
rmSync(join(DIR, "cases"), { recursive: true, force: true });
mkdirSync(join(DIR, "cases"), { recursive: true });
const files = {};
const bodies = cases.map((x) => materialize(x, BASE));
cases.forEach((x, i) => {
  const text = canonical(bodies[i]) + "\n";
  writeFileSync(join(DIR, `cases/${x.caseId}.json`), text);
  files[`cases/${x.caseId}.json`] = sha(text);
});
writeFileSync(join(DIR, "dimension-coverage.json"), JSON.stringify({ format: "x24-dimension-coverage/1", note: "For every leaf field of the three sealed data sets: the single-field mutation applied and the consumer cases whose expected outputs change under it (README \"Dimension coverage\"); exempt fields name their reason.", coverage }, null, 1) + "\n");
const referenced = new Set(["dimension-coverage.json"]);
for (const b of bodies) for (const a of [...b.inputArtifacts, ...b.expectedArtifacts, ...(b.commandArtifact ? [b.commandArtifact] : [])]) if (a.path) referenced.add(a.path);
for (const p of [...referenced].sort()) if (!p.startsWith("../")) files[p] = sha(read(p));
for (const k of ["A", "B"]) files[PROFILE[k].path] = PROFILE[k].sha256;
const comparators = JSON.parse(read("comparators.json"));
const manifest = {
  format: "profile-parity-corpus/1",
  corpusVersion: "x24-expectations-2",
  sourceRepository: "bpmn-canvas",
  pathBase: "tests/fixtures/x24-externalization/expectations/",
  notes: "Block B finding #24 sealed expectations. The first input artifact of every case has role clause and is provenance only; it is never passed to the operation. Text vectors of the form {concat: [...]} name base literals by ledger row (literalRef) and are materialized by the harness.",
  comparators: comparators.comparators.map((c) => ({ id: c.id, kind: c.kind, note: c.note })),
  executables: ["derive/comparators.mjs", "derive/canonical.mjs", "derive/scan.mjs", "derive/literals.mjs", "derive/sourcemap.mjs", "../../../helpers/brand.mjs"].map((file) => ({ file, sha256: sha(read(file)), tolerance: "zero" })),
  files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))),
  cases: cases.map((x) => ({ path: `cases/${x.caseId}.json`, caseId: x.caseId, group: x.group, consumer: x.meta.consumer, clauses: x.meta.clauses, discriminates: x.meta.wrong, ...(x.c.reads ? { reads: x.c.reads } : {}) })),
};
writeFileSync(join(DIR, "manifest.json"), JSON.stringify(manifest, null, 1) + "\n");
const byGroup = {};
for (const x of cases) byGroup[x.group] = (byGroup[x.group] ?? 0) + 1;
console.log(JSON.stringify({ cases: cases.length, byGroup, uncovered }));
