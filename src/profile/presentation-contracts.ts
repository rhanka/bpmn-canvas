import { canonicalize, canonicalDigest, ProfileContractError } from "./canonical.js";
import { cloneJson, failContract } from "./native-contracts.js";
import type { NativeNode } from "./native-contracts.js";
import { profileIdentity, semanticRevision } from "./envelope.js";
import type { CompleteProfileDocument, DocumentEnvelope, IdentityPin, ProfileIdentity } from "./envelope.js";
import { array, choice, compareText, digest, equal, noNull, record, text, validateIdentity, validatePin } from "./boundary.js";
import { validateEntry } from "./report.js";
import type { ReportEntry } from "./report.js";

export interface Pair { readonly pageId: string; readonly occurrenceKey: string }
export interface Bounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface Page { readonly pageId: string; readonly name: string; readonly order: number; readonly semanticRootId: string; readonly bounds: Bounds }
export interface Label { readonly text: string; readonly bounds: Bounds; readonly lines: readonly string[] }
export interface Geometry extends Pair { readonly semanticId?: string; readonly role: string; readonly bounds: Bounds; readonly label?: Label;
  readonly sourceOccurrence?: Pair; readonly targetOccurrence?: Pair; readonly waypoints?: readonly { readonly x: number; readonly y: number }[] }
export interface Layout { readonly layoutVersion: "1"; readonly pages: readonly Page[]; readonly geometry: readonly Geometry[] }
export interface Token { readonly name: string; readonly value: string | number }
export interface Occurrence extends Geometry { readonly emittedType: string; readonly style: readonly Token[]; readonly glyphId: string }
export interface Overrides { readonly semantic: readonly { readonly semanticId: string; readonly tokens: readonly Token[] }[]; readonly occurrence: readonly (Pair & { readonly tokens: readonly Token[] })[] }
export interface DiStyles { readonly native: readonly (Pair & { readonly tokens: readonly Token[] })[]; readonly bioc: readonly (Pair & { readonly tokens: readonly Token[] })[] }
export interface RenderBinding { readonly semanticRevision: string; readonly profileDigest: string; readonly descriptorDigest: string; readonly layoutDigest: string;
  readonly themeId: string; readonly themeDigest: string; readonly overridesDigest: string; readonly diStylesDigest: string; readonly metricsDigest: string; readonly payloadDigest: string }
export type ViewBinding = Omit<RenderBinding, "payloadDigest">;
export interface RenderData { readonly renderVersion: "1"; readonly binding: RenderBinding; readonly pages: readonly Page[]; readonly occurrences: readonly Occurrence[];
  readonly coverage: readonly { readonly semanticId: string; readonly occurrences: readonly Pair[]; readonly disposition: "rendered" | "nonvisual" | "unsupported" }[]; readonly diagnostics: readonly ReportEntry[] }
export interface ImportedDi { readonly descriptorDigest: string; readonly diagrams: readonly unknown[]; readonly sha256: string }
export interface Snapshot { readonly snapshotVersion: "1"; readonly envelope: DocumentEnvelope; readonly presentation: {
  readonly layout: Layout; readonly themeId: string; readonly overrides: Overrides; readonly diStyles: DiStyles; readonly importedDi: ImportedDi;
  readonly selection: readonly Pair[]; readonly activePageId: string }; readonly viewRevision: string }
export interface PresentationContext {
  readonly profile: CompleteProfileDocument; readonly envelope: DocumentEnvelope; readonly layout: Layout; readonly themeId: string;
  readonly overrides: Overrides; readonly diStyles: DiStyles; readonly metricPins: readonly { readonly id: string; readonly sha256: string }[];
  readonly tokenContext?: TokenContext;
}
export interface TokenContext { readonly fontFamilies?: readonly string[]; readonly dashStyles?: readonly string[];
  readonly signatures?: Readonly<Record<string, (value: unknown) => boolean>> }
const pairKey = (p: Pair): string => canonicalize([p.pageId, p.occurrenceKey]);
function pair(value: unknown): asserts value is Pair { const p = record(value, ["pageId", "occurrenceKey"]); text(p.pageId); text(p.occurrenceKey); }
const integer = (n: unknown): void => { if (!Number.isSafeInteger(n)) failContract(); };
export function validateBounds(value: unknown): Bounds {
  const b = record(value, ["x", "y", "width", "height"]); Object.values(b).forEach(integer);
  if ((b.width as number) < 0 || (b.height as number) < 0) failContract(); return cloneJson(value) as Bounds;
}
export function sortPages(pages: readonly Page[]): Page[] {
  array(pages); const ids = new Set<string>(), orders = new Set<number>();
  for (const value of pages) {
    const p = record(value, ["pageId", "name", "order", "semanticRootId", "bounds"]); text(p.pageId); text(p.name, true); text(p.semanticRootId); integer(p.order);
    if ((p.order as number) < 0 || ids.has(p.pageId) || orders.has(p.order as number)) failContract(); ids.add(p.pageId); orders.add(p.order as number); validateBounds(p.bounds);
  }
  return [...cloneJson(pages)].sort((a, b) => a.order - b.order || compareText(a.pageId, b.pageId));
}
export function sortOccurrences<T extends Pair>(occurrences: readonly T[], pages: readonly Page[]): T[] {
  array(occurrences); const order = new Map(sortPages(pages).map((p, i) => [p.pageId, i]));
  for (const value of occurrences) {
    if (!value || typeof value !== "object" || Array.isArray(value)) failContract();
    text(value.pageId); text(value.occurrenceKey); if (!order.has(value.pageId)) failContract();
  }
  return [...cloneJson(occurrences)].sort((a, b) => order.get(a.pageId)! - order.get(b.pageId)! || compareText(a.occurrenceKey, b.occurrenceKey));
}
function validateGeometry(value: unknown, peers: readonly Pair[], pages: readonly Page[], render: boolean, crossPage = true, tokens: TokenContext = {}): void {
  const g = record(value, ["pageId", "occurrenceKey", "role", "bounds", ...(render ? ["emittedType", "style", "glyphId"] : [])],
    ["semanticId", "label", "sourceOccurrence", "targetOccurrence", "waypoints"]);
  for (const key of ["pageId", "occurrenceKey", "role", "semanticId", "emittedType", "glyphId"]) if (Object.hasOwn(g, key)) text(g[key]);
  if (!pages.some(p => p.pageId === g.pageId)) failContract(); validateBounds(g.bounds);
  if (Object.hasOwn(g, "label")) { const l = record(g.label, ["text", "bounds", "lines"]); text(l.text, true); validateBounds(l.bounds); array(l.lines); l.lines.forEach(v => text(v, true)); }
  const endpointKeys = ["sourceOccurrence", "targetOccurrence", "waypoints"];
  const edge = render ? g.emittedType === "edge" : endpointKeys.some(k => Object.hasOwn(g, k));
  if (edge) {
    pair(g.sourceOccurrence); pair(g.targetOccurrence); array(g.waypoints);
    if (g.waypoints.length < 2) failContract();
    for (const p of [g.sourceOccurrence, g.targetOccurrence]) {
      if (!peers.some(o => pairKey(o) === pairKey(p)) || !crossPage && p.pageId !== g.pageId) failContract();
    }
    for (const point of g.waypoints) { const p = record(point, ["x", "y"]); integer(p.x); integer(p.y); }
  } else if (endpointKeys.some(k => Object.hasOwn(g, k))) failContract();
  if (render) { const style = normalizeTokens(g.style, tokens); if (!equal(style, g.style)) failContract(); }
}
export function validateOccurrence(value: unknown, peers: readonly Pair[], pages: readonly Page[], options: { readonly crossPage?: boolean; readonly tokenContext?: TokenContext } = {}): Occurrence {
  canonicalize(value); noNull(value); validateGeometry(value, peers, pages, true, options.crossPage ?? true, options.tokenContext); return cloneJson(value) as Occurrence;
}
export function validateLayout(value: unknown): Layout {
  canonicalize(value); noNull(value); const l = record(value, ["layoutVersion", "pages", "geometry"]); choice(l.layoutVersion, ["1"]); array(l.pages); array(l.geometry);
  const pages = sortPages(l.pages as Page[]), geometry = l.geometry as Geometry[];
  const seen = new Set<string>();
  for (const g of geometry) { validateGeometry(g, geometry, pages, false); const key = pairKey(g); if (seen.has(key)) failContract(); seen.add(key); }
  if (!equal(pages, l.pages) || !equal(sortOccurrences(geometry, pages), geometry)) failContract();
  return cloneJson(value) as Layout;
}
export const syntheticKey = (declarationId: string, ownerId: string, pageId: string): string => { [declarationId, ownerId, pageId].forEach(v => text(v)); return canonicalize([declarationId, ownerId, pageId]); };
export function normalizeTokens(value: unknown, context: TokenContext = {}): Token[] {
  array(value); const names = new Set<string>();
  for (const item of value) {
    const t = record(item, ["name", "value"]); text(t.name);
    if (names.has(t.name)) failContract("render-token-invalid"); names.add(t.name);
    const v = t.value;
    const valid = ["fill", "stroke", "textColor"].includes(t.name) ? typeof v === "string" && /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(v) :
      ["strokeWidth", "fontSize"].includes(t.name) ? typeof v === "number" && Number.isFinite(v) && v >= 0 && Math.abs(v) <= Number.MAX_SAFE_INTEGER :
      t.name === "fontWeight" ? v === "normal" || v === "bold" : t.name === "arrow" ? ["none", "open", "filled", "hollow-triangle"].includes(v as string) :
      t.name === "fontFamily" ? context.fontFamilies?.includes(v as string) : t.name === "dash" ? context.dashStyles?.includes(v as string) :
      context.signatures && Object.hasOwn(context.signatures, t.name) ? context.signatures[t.name]!(v) : false;
    if (!valid) failContract("render-token-invalid");
  }
  return (cloneJson(value) as Token[]).sort((a, b) => compareText(a.name, b.name));
}
/** ID-bearing semantic records only; descriptor admission is an earlier boundary. */
export function semanticIds(tree: NativeNode): Set<string> {
  const ids = new Set<string>();
  function walk(v: unknown): void { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") { const n = v as Record<string, unknown>; if (typeof n.$type === "string" && typeof n.id === "string") { if (ids.has(n.id)) failContract("id-collision"); ids.add(n.id); } Object.values(n).forEach(walk); } }
  walk(tree); return ids;
}
function occurrenceBag(value: unknown, peers: readonly Pair[], context: TokenContext): (Pair & { readonly tokens: readonly Token[] })[] {
  array(value); const seen = new Set<string>();
  const result = value.map(item => { const r = record(item, ["pageId", "occurrenceKey", "tokens"]); pair({ pageId: r.pageId, occurrenceKey: r.occurrenceKey }); const p = r as unknown as Pair;
    const key = pairKey(p); if (seen.has(key) || !peers.some(o => pairKey(o) === key)) failContract(); seen.add(key);
    return { ...p, tokens: normalizeTokens(r.tokens, context) }; });
  return result.sort((a, b) => compareText(a.pageId, b.pageId) || compareText(a.occurrenceKey, b.occurrenceKey));
}
export function normalizeOverrides(value: unknown, tree: NativeNode, peers: readonly Pair[], context: TokenContext = {}): Overrides {
  canonicalize(value); const r = record(value, ["semantic", "occurrence"]); array(r.semantic);
  const ids = semanticIds(tree), seen = new Set<string>();
  const semantic = r.semantic.map(item => { const s = record(item, ["semanticId", "tokens"]); text(s.semanticId);
    if (!ids.has(s.semanticId) || seen.has(s.semanticId)) failContract(); seen.add(s.semanticId); return { semanticId: s.semanticId, tokens: normalizeTokens(s.tokens, context) }; }).sort((a, b) => compareText(a.semanticId, b.semanticId));
  return { semantic, occurrence: occurrenceBag(r.occurrence, peers, context) };
}
export function normalizeDiStyles(value: unknown, peers: readonly Pair[], context: TokenContext = {}): DiStyles {
  canonicalize(value); const r = record(value, ["native", "bioc"]); return { native: occurrenceBag(r.native, peers, context), bioc: occurrenceBag(r.bioc, peers, context) };
}
export async function pinDigest(pins: readonly (IdentityPin | { readonly id: string; readonly sha256: string })[], descriptors: boolean): Promise<string> {
  canonicalize(pins); array(pins); const seen = new Set<string>();
  for (const pin of pins) { if (descriptors) validatePin(pin); else { const r = record(pin, ["id", "sha256"]); text(r.id); digest(r.sha256); }
    if (seen.has(pin.id)) failContract(); seen.add(pin.id); }
  return canonicalDigest([...pins].sort((a, b) => compareText(a.id, b.id)));
}
export async function presentationBinding(ctx: PresentationContext): Promise<ViewBinding> {
  validateLayout(ctx.layout); validateIdentity(ctx.envelope.profileIdentity);
  const profileDigest = await canonicalDigest(ctx.profile);
  if (profileDigest !== ctx.envelope.profileIdentity.sha256 || !equal(await profileIdentity(ctx.profile), ctx.envelope.profileIdentity)) failContract("render-stale");
  const themes = ctx.profile.themes as readonly Record<string, unknown>[], chain: Record<string, unknown>[] = [], seen = new Set<string>();
  let id: unknown = ctx.themeId;
  while (id !== undefined) {
    text(id); if (seen.has(id)) failContract("render-stale"); seen.add(id);
    const theme = themes.find(t => t.id === id); if (!theme) failContract("render-stale"); chain.unshift(theme!); id = theme!.fallback;
  }
  const overrides = normalizeOverrides(ctx.overrides, ctx.envelope.tree, ctx.layout.geometry, ctx.tokenContext);
  const styles = normalizeDiStyles(ctx.diStyles, ctx.layout.geometry, ctx.tokenContext);
  return { semanticRevision: ctx.envelope.semanticRevision, profileDigest, descriptorDigest: await pinDigest(ctx.envelope.profileIdentity.descriptors, true), layoutDigest: await canonicalDigest(ctx.layout), themeId: ctx.themeId,
    themeDigest: await canonicalDigest({ themeId: ctx.themeId, themes: chain }), overridesDigest: await canonicalDigest(overrides), diStylesDigest: await canonicalDigest(styles), metricsDigest: await pinDigest(ctx.metricPins, false) };
}
export async function viewRevision(binding: Pick<ViewBinding, "semanticRevision" | "layoutDigest" | "themeId" | "themeDigest" | "overridesDigest" | "diStylesDigest" | "metricsDigest">): Promise<string> {
  const { semanticRevision, layoutDigest, themeId, themeDigest, overridesDigest, diStylesDigest, metricsDigest } = binding;
  return canonicalDigest({ semanticRevision, layoutDigest, themeId, themeDigest, overridesDigest, diStylesDigest, metricsDigest });
}
export async function payloadDigest(value: Pick<RenderData, "pages" | "occurrences" | "coverage" | "diagnostics">): Promise<string> {
  const { pages, occurrences, coverage, diagnostics } = value; return canonicalDigest({ pages, occurrences, coverage, diagnostics });
}
export function validateRenderBinding(value: unknown): RenderBinding {
  const b = record(value, ["semanticRevision", "profileDigest", "descriptorDigest", "layoutDigest", "themeId", "themeDigest", "overridesDigest", "diStylesDigest", "metricsDigest", "payloadDigest"]);
  for (const [key, v] of Object.entries(b)) if (key === "themeId") text(v); else digest(v); return cloneJson(value) as RenderBinding;
}
export function validateRenderDataShape(value: unknown, options: { readonly crossPage?: boolean; readonly tokenContext?: TokenContext } = {}): RenderData {
  canonicalize(value); const r = record(value, ["renderVersion", "binding", "pages", "occurrences", "coverage", "diagnostics"]); choice(r.renderVersion, ["1"]);
  const render = r as unknown as RenderData; validateRenderBinding(r.binding);
  // Report diagnostics retain their specified nullable coordinates/before/after.
  noNull({ binding: r.binding, pages: r.pages, occurrences: r.occurrences, coverage: r.coverage });
  array(r.pages); array(r.occurrences); array(r.coverage); array(r.diagnostics);
  const pages = sortPages(render.pages), seen = new Set<string>();
  for (const o of render.occurrences) {
    validateOccurrence(o, render.occurrences, pages, options);
    const key = pairKey(o); if (seen.has(key)) failContract(); seen.add(key);
  }
  if (!equal(pages, render.pages) || !equal(sortOccurrences(render.occurrences, pages), render.occurrences)) failContract("render-stale");
  const covered = new Set<string>();
  for (const c of render.coverage) {
    const v = record(c, ["semanticId", "occurrences", "disposition"]); text(v.semanticId); array(v.occurrences); choice(v.disposition, ["rendered", "nonvisual", "unsupported"]);
    if (covered.has(c.semanticId)) failContract(); covered.add(c.semanticId);
    c.occurrences.forEach(pair);
    const actual = render.occurrences.filter(o => o.semanticId === c.semanticId).map(({ pageId, occurrenceKey }) => ({ pageId, occurrenceKey }));
    if (!equal(actual, c.occurrences) || (c.disposition === "rendered") !== (actual.length > 0)) failContract();
  }
  if (render.occurrences.some(o => o.semanticId !== undefined && !covered.has(o.semanticId))) failContract();
  render.diagnostics.forEach(validateEntry); return cloneJson(value) as RenderData;
}
export async function validateRenderData(value: unknown, ctx: PresentationContext & { readonly crossPage?: boolean }): Promise<RenderData> {
  const render = validateRenderDataShape(value, { crossPage: ctx.crossPage ?? true, ...(ctx.tokenContext ? { tokenContext: ctx.tokenContext } : {}) });
  validateLayout(ctx.layout); if (!equal(render.pages, ctx.layout.pages)) failContract("render-stale");
  const ids = semanticIds(ctx.envelope.tree);
  for (const o of render.occurrences) {
    if (o.semanticId !== undefined && !ids.has(o.semanticId)) failContract();
    const captured = ctx.layout.geometry.find(g => pairKey(g) === pairKey(o));
    if (o.semanticId !== undefined && !captured) failContract("render-stale");
    if (captured) {
      const { emittedType: _type, style: _style, glyphId: _glyph, ...geometry } = o;
      if (!equal(captured, geometry)) failContract("render-stale");
    }
  }
  if (render.coverage.length !== ids.size || render.coverage.some(c => !ids.has(c.semanticId))) failContract();
  const binding = { ...await presentationBinding(ctx), payloadDigest: await payloadDigest(render) };
  if (!equal(binding, render.binding)) failContract("render-stale"); return cloneJson(render);
}
export async function archiveDi(value: { readonly descriptorDigest: string; readonly diagrams: readonly unknown[] }, validateDi: (diagrams: readonly unknown[]) => boolean): Promise<ImportedDi> {
  canonicalize(value); noNull(value); record(value, ["descriptorDigest", "diagrams"]); digest(value.descriptorDigest); array(value.diagrams);
  if (!validateDi(value.diagrams)) failContract("descriptor-mismatch"); return { ...cloneJson(value), sha256: await canonicalDigest(value) };
}
export type SnapshotContext = Omit<PresentationContext, "layout" | "themeId" | "overrides" | "diStyles"> & {
  readonly hostProfileIdentity?: ProfileIdentity; readonly validateEnvelope: (value: unknown) => Promise<DocumentEnvelope>;
  readonly validateDi: (diagrams: readonly unknown[]) => boolean;
};
export async function validateSnapshot(value: unknown, context: SnapshotContext): Promise<Snapshot> {
  try { return await checkSnapshot(value, context); }
  catch (error) {
    // Nested shape validators share the generic boundary refusal. Snapshot/1
    // assigns its own schema code; retain all named integrity/freshness codes.
    if (error instanceof ProfileContractError && error.code === undefined) failContract("snapshot-schema");
    throw error;
  }
}
async function checkSnapshot(value: unknown, context: SnapshotContext): Promise<Snapshot> {
  canonicalize(value); noNull(value); const r = record(value, ["snapshotVersion", "envelope", "presentation", "viewRevision"], [], "snapshot-schema"); choice(r.snapshotVersion, ["1"]);
  const envelope = await context.validateEnvelope(r.envelope); validateIdentity(envelope.profileIdentity);
  if (context.hostProfileIdentity && !equal(context.hostProfileIdentity, envelope.profileIdentity)) failContract("profile-metadata-conflict");
  if (await semanticRevision(envelope.tree, envelope.profileIdentity, envelope.bindings) !== envelope.semanticRevision) failContract("document-revision-mismatch");
  if (!equal(await profileIdentity(context.profile), envelope.profileIdentity)) failContract("profile-metadata-conflict");
  const p = record(r.presentation, ["themeId", "overrides", "diStyles", "importedDi", "selection", "activePageId"], ["layout"], "snapshot-schema");
  const archive = record(p.importedDi, ["descriptorDigest", "diagrams", "sha256"], [], "snapshot-schema");
  const actualArchive = await archiveDi({ descriptorDigest: archive.descriptorDigest as string, diagrams: archive.diagrams as unknown[] }, context.validateDi);
  if (!equal(actualArchive, archive) || actualArchive.descriptorDigest !== await pinDigest(envelope.profileIdentity.descriptors, true)) failContract("snapshot-stale");
  if (!Object.hasOwn(p, "layout")) failContract("snapshot-stale");
  const layout = validateLayout(p.layout); text(p.themeId); text(p.activePageId, true); array(p.selection);
  if (layout.pages.length ? !layout.pages.some(page => page.pageId === p.activePageId) : p.activePageId !== "" || p.selection.length !== 0) failContract();
  const seen = new Set<string>();
  for (const item of p.selection) { pair(item); const key = pairKey(item); if (seen.has(key) || !layout.geometry.some(o => pairKey(o) === key)) failContract(); seen.add(key); }
  if (!equal(normalizeOverrides(p.overrides, envelope.tree, layout.geometry, context.tokenContext), p.overrides) ||
      !equal(normalizeDiStyles(p.diStyles, layout.geometry, context.tokenContext), p.diStyles)) failContract();
  const binding = await presentationBinding({ ...context, envelope, layout, themeId: p.themeId, overrides: p.overrides as Overrides, diStyles: p.diStyles as DiStyles });
  if (await viewRevision(binding) !== r.viewRevision) failContract("snapshot-stale"); return cloneJson(value) as Snapshot;
}
