import { annotationRole, applicationHost, roleLabel, type BusinessPolicy } from "./business-policy.js";
import { readBusinessPolicy } from "./policy-admission.js";
import { textWidth, wrapText } from "./textMetrics.js";
import { ProfileContractError } from "../profile/canonical.js";

type Rec = Record<string, any>;
export function layoutPolicy(policy?: BusinessPolicy): Rec {
  const layout = policy?.presentation?.layout;
  if (!layout) throw new ProfileContractError("profile-resource-missing");
  return layout;
}
export function badgeSize(name: string, hostWidth: number, policy?: BusinessPolicy): { width: number; height: number } {
  const a = layoutPolicy(policy).appBadge;
  const wanted = textWidth(name, a.font, true, policy) + a.chrome;
  const width = Math.min(Math.max(a.minWidth, hostWidth - 2 * a.margin), Math.max(a.minWidth, Math.ceil(wanted)));
  const height = wanted <= width ? a.height : Math.max(a.height, Math.ceil(wrapText(name, a.font, width - a.chrome, true, policy).length * a.font * policy!.metrics.lineHeight + 8));
  return { width, height };
}
export function badgeBoxes(names: readonly string[], hostWidth: number, hostHeight: number, policy?: BusinessPolicy): Rec[] {
  const a = layoutPolicy(policy).appBadge;
  const sizes = names.map(name => badgeSize(name, hostWidth, policy));
  let x = (hostWidth - sizes.reduce((n, size) => n + size.width, 0) - a.gap * Math.max(0, sizes.length - 1)) / 2;
  return names.map((name, i) => {
    const size = sizes[i]!;
    const box = { name, x, y: hostHeight - a.overlap, ...size };
    x += size.width + a.gap;
    return box;
  });
}
export function documentRect(width: number, height: number, policy?: BusinessPolicy): Rec {
  const d = layoutPolicy(policy).document;
  return { x: d.padX, y: d.textTop, width: width - 2 * d.padX, height: Math.max(0, height * d.waveTop - d.textTop - d.padBottom) };
}

const lineKeys = ["flow", "taskLine", "eventLine", "gatewayLine", "poolLine", "laneLine", "externalLine", "docLine", "dataLine", "appLine"];
function shadeColor(hex: string, factor: number): string {
  if (!/^#[\da-f]{6}$/i.test(hex)) return hex;
  return "#" + [1, 3, 5].map(at => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(at, at + 2), 16) * factor))).toString(16).padStart(2, "0")).join("");
}
export function lookTokens(look: Rec, overrides: Rec = {}): { tokens: Rec; named?: string[] } {
  const given = Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined));
  const tokens = { ...look.tokens };
  const named = new Set(Object.keys(given));
  if (typeof given.stroke === "string") for (const key of lineKeys) { tokens[key] = given.stroke; named.add(key); }
  if (typeof given.fill === "string") { tokens.taskFill = given.fill; named.add("taskFill"); }
  Object.assign(tokens, given);
  if (given.docLink === undefined && given.link !== undefined) tokens.docLink = tokens.link;
  if (given.laneHeaderFill === undefined && given.laneFill !== undefined) tokens.laneHeaderFill = tokens.laneFill;
  if (given.taskFillEnd === undefined && typeof tokens.taskFill === "string" && tokens.taskFill !== look.tokens.taskFill) tokens.taskFillEnd = shadeColor(tokens.taskFill, 0.95);
  if (look.renderer === "recolor") {
    if (given.labelText === undefined) tokens.labelText = tokens.text;
    if (named.has("text")) named.add("labelText");
    return { tokens, named: [...named] };
  }
  return { tokens };
}
export function selectLook(request: Rec = {}, policy?: BusinessPolicy): Rec {
  const look = policy?.presentation?.looks?.find((look: Rec) => look.alias === request.look);
  if (request.look !== undefined && !look) return { status: "refused", code: "profile-symbol" };
  const out: Rec = { status: "ok", renderer: look?.renderer ?? "upstream", modelerModules: [], viewerModules: [], paletteFloor: look?.paletteFloor ?? 0, markerSelectors: [...(look?.markerSelectors ?? [])] };
  if (!look) {
    if (policy?.presentation?.legacyOptions?.annotatedPalette !== undefined && request.options?.palette === policy.presentation.legacyOptions.annotatedPalette) out.modelerModules.push("annotated-palette");
    return out;
  }
  const flat = look.flat || (policy?.presentation?.legacyOptions?.flatDrawing !== undefined && request.options?.drawing === policy.presentation.legacyOptions.flatDrawing);
  const palette = look.palette === "annotated" || (policy?.presentation?.legacyOptions?.annotatedPalette !== undefined && request.options?.palette === policy.presentation.legacyOptions.annotatedPalette);
  if (look.renderer === "annotated") { out.modelerModules.push("annotated-renderer", "annotated-follow"); out.viewerModules.push("annotated-renderer"); }
  const given = Object.values(request.tokens ?? {}).some(value => value !== undefined);
  if (look.renderer === "recolor" && given) { out.modelerModules.push("recolor-renderer"); out.viewerModules.push("recolor-renderer"); }
  if (look.renderer === "recolor" && flat) { out.modelerModules.push("flat-renderer"); out.viewerModules.push("flat-renderer"); }
  if (palette) out.modelerModules.push("annotated-palette");
  if (look.tokens && (look.renderer === "annotated" || given || flat)) {
    const resolved = lookTokens(look, request.tokens);
    out.tokens = resolved.tokens;
    if (look.renderer === "recolor" && given) out.named = resolved.named;
  }
  return out;
}
export function paletteEntries(policy?: BusinessPolicy): Rec[] {
  return (policy?.presentation?.palette?.entries ?? []).map((entry: Rec) => {
    const create: Rec = entry.tool === "connect" ? { tool: "connect" } : { type: entry.bpmnType };
    if (entry.initialName) create.name = entry.initialName;
    if (entry.collapsed) create.isExpanded = false;
    if (entry.initialRole) {
      const rule = policy!.classification.annotationRoles.find(rule => rule.role === entry.initialRole);
      if (!rule) throw new ProfileContractError("profile-symbol");
      create.text = rule.prefix + policy!.classification.insertSeparator;
    }
    return { id: entry.id, group: entry.group, className: entry.icon, title: `Create ${entry.title}`, html: `<div class="entry" draggable="true" title="Create ${entry.title}"></div>`, create };
  });
}
export function annotationKind(text: string, renderer: string, policy?: BusinessPolicy): string | null {
  const role = annotationRole(text, policy)?.role;
  if (renderer === "flat") return role === "document" ? "document" : "application";
  if (renderer === "recolor") return role === "document" ? "doc" : role === "application" ? "app" : "annotation";
  return role ?? null;
}
export function attachedAnnotations(host: Rec, policy?: BusinessPolicy): Rec[] {
  if (!applicationHost(host.businessObject ?? host, policy)) return [];
  const result: Rec[] = [];
  for (const link of [...(host.incoming ?? []), ...(host.outgoing ?? [])]) {
    if ((link.type ?? link.$type) !== "bpmn:Association") continue;
    const other = link.source === host ? link.target : link.source;
    const object = other?.businessObject ?? other;
    if ((object?.$type ?? object?.type) === "bpmn:TextAnnotation" && annotationRole(object.text, policy)?.role === "application") result.push(other);
  }
  return result;
}
export function movedShapes(shapes: readonly Rec[], policy?: BusinessPolicy): Rec[] {
  const out = [...shapes];
  for (const shape of shapes) for (const annotation of attachedAnnotations(shape, policy)) if (!out.includes(annotation)) out.push(annotation);
  return out;
}

export function navigationTarget(vector: Rec, index: Rec, policy?: BusinessPolicy): Rec {
  const mode = policy?.navigation.mode ?? "called-element";
  const click = vector.click;
  if (mode === "called-element") {
    if (!click.calledElement) return { kind: "none" };
    if (!index.processes.includes(click.calledElement)) return { kind: "refused", code: "reference-dangling" };
    const views = index.entries.filter((entry: Rec) => entry.processId === click.calledElement).sort((a: Rec, b: Rec) => a.order - b.order || (a.diagramId < b.diagramId ? -1 : a.diagramId > b.diagramId ? 1 : 0));
    if (!views.length) return { kind: "refused", code: "navigation-view-missing" };
    if (views.some((view: Rec) => view.diagramId === vector.activeDiagramId)) return { kind: "current", diagramId: vector.activeDiagramId };
    return views.length === 1 ? { kind: "open", diagramId: views[0].diagramId } : { kind: "chooser", diagramIds: views.map((view: Rec) => view.diagramId) };
  }
  const fold = (value?: string): string => (value ?? "").trim().toLowerCase();
  const called = fold(click.calledElement), name = fold(click.name);
  const others = vector.diagrams.filter((d: Rec) => d.id !== vector.activeId);
  let target: Rec | undefined;
  if (mode === "legacy-default") target = (called ? others.find((d: Rec) => fold(d.id) === called || fold(d.name) === called) : undefined) ?? (name ? others.find((d: Rec) => fold(d.name) === name) : undefined);
  else target = others.find((d: Rec) => (policy!.navigation.rules ?? []).some(rule => {
    const title = fold(d.name);
    if (rule === "called-element") return !!called && (fold(d.id) === called || title === called);
    if (!name) return false;
    if (rule === "name-equal") return name === title;
    if (rule === "section-equal") { const a = /\b\d+(?:\.\d+)+\b/.exec(name)?.[0]; return !!a && a === /\b\d+(?:\.\d+)+\b/.exec(title)?.[0]; }
    return rule === "name-overlap" && !!title && (name.includes(title) || title.includes(name));
  }));
  return target ? { kind: "open", diagramId: target.id } : { kind: "none" };
}

/** Explicit compatibility adapter. Each instance owns a snapshot of caller data. */
export function createLegacyAdapter(data: BusinessPolicy): Readonly<Rec> {
  const policy = readBusinessPolicy(JSON.stringify(data));
  return Object.freeze({
    classify: (text: string) => {
      const role = annotationRole(text, policy)?.role ?? null;
      return { text, document: role === "document", application: role === "application", role, displayName: roleLabel(text, policy), layoutName: role ? roleLabel(text, policy, true) : null };
    },
    kind: (text: string, renderer: string) => annotationKind(text, renderer, policy),
    textWidth: (text: string, size: number, bold = false) => textWidth(text, size, bold, policy),
    wrapText: (text: string, size: number, width: number, bold = false) => wrapText(text, size, width, bold, policy),
    badgeSize: (text: string, width: number) => badgeSize(text, width, policy),
    badgeBoxes: (names: readonly string[], width: number, height: number) => badgeBoxes(names, width, height, policy),
    documentRect: (width: number, height: number) => documentRect(width, height, policy),
    selectLook: (request: Rec) => selectLook(request, policy),
    paletteEntries: () => paletteEntries(policy),
    attachedAnnotations: (host: Rec) => attachedAnnotations(host, policy),
    movedShapes: (shapes: readonly Rec[]) => movedShapes(shapes, policy),
    navigate: (vector: Rec, index: Rec) => navigationTarget(vector, index, policy),
    layoutInput: async (xml: string) => (await import("./processModel.js")).parseProcesses(xml, policy),
    layout: async (process: any, options?: any) => (await import("./swimlaneLayout.js")).layoutProcess(process, options, policy),
    parse: async (xml: string, context: any = {}) => (await import("../io/index.js")).parseDefinitions(xml, { ...context, businessPolicy: policy }),
    export: async (definitions: any, format: any, context: any = {}) => (await import("../io/index.js")).export(definitions, format, { ...context, businessPolicy: policy }),
    import: async (xml: string, context: any = {}) => (await import("../io/index.js")).importDiagram(xml, { ...context, businessPolicy: policy }),
    render: async (xml: string, options: any = {}) => (await import("./render.js")).renderDiagrams(xml, { ...options, businessPolicy: policy }),
  });
}
