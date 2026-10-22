// Lot-4 render data: theme resolution, the R digest formulas, the closed
// style/label/glyph contracts and the freshness verification.
import { canonicalDigest, canonicalize, ProfileContractError } from "./canonical.js";
import { sha256 } from "./sha256.js";
import { failContract, MISSING } from "./native-contracts.js";
import type { DescriptorIndex } from "./native-contracts.js";
import { evaluatePredicate, evaluateValue } from "./compiler.js";
import type { EvalContext } from "./compiler.js";
import { normalizeTokens } from "./presentation-contracts.js";
import { checkTemplateGlyphSignature } from "./static-contracts.js";
import { okResult, refusedResult, sortReportEntries } from "./lot4-result.js";
import type { PureResult, Result } from "./results.js";
import { bindingOwnerHandle, compareText, handleOf, lot4EvalContext, ratAdd, ratCmp, ratFromInt, ratFromNumber, ratMul, ratRoundEvenTicks, ratSub, ratToNumber, readPath, syntheticLabelText } from "./lot4-query.js";
import type { Rational } from "./lot4-query.js";

export interface Lot4RenderContext {
  readonly profile: Record<string, any>;
  readonly descriptors: DescriptorIndex;
  readonly notions: Map<string, { readonly recognition: unknown; readonly exclusiveGroup?: string; readonly facet?: boolean; readonly renderBindings?: readonly any[] }>;
  readonly unicodeCase: unknown;
  readonly metricBytes: Map<string, Uint8Array>;
  readonly renderTokens?: readonly RenderTokenRegistryEntry[];
}

export const PAINT = new Set(["fill", "stroke", "textColor", "fontFamily", "fontSize", "strokeWidth", "fontWeight", "dash", "arrow"]);

// Symbolic font and dash vocabularies are injected data, never source
// literals: the union of the render-token registry enums (when provided)
// and the fontFamily/dash values the profile itself declares in theme,
// notion-binding and synthetic tokens. A value in neither is refused.
export interface TokenVocabularies {
  readonly fontFamilies: readonly string[];
  readonly dashStyles: readonly string[];
}

export interface RenderTokenRegistryEntry {
  readonly name: string;
  readonly schema?: { readonly enum?: readonly unknown[] };
}

const collectSymbolic = (tokens: readonly any[] | undefined, fonts: Set<string>, dashes: Set<string>): void => {
  for (const token of tokens ?? []) {
    if (token?.name === "fontFamily" && typeof token.value === "string") fonts.add(token.value);
    if (token?.name === "dash" && typeof token.value === "string") dashes.add(token.value);
  }
};

export function tokenVocabularies(profile: Record<string, any>,
    renderTokens?: readonly RenderTokenRegistryEntry[]): TokenVocabularies {
  const fonts = new Set<string>(), dashes = new Set<string>();
  for (const entry of renderTokens ?? []) {
    if (entry?.name !== "fontFamily" && entry?.name !== "dash") continue;
    for (const value of entry?.schema?.enum ?? []) {
      if (typeof value === "string") (entry.name === "fontFamily" ? fonts : dashes).add(value);
    }
  }
  for (const theme of (profile.themes as any[]) ?? []) {
    collectSymbolic(theme.tokens, fonts, dashes);
    for (const declaration of (theme.syntheticOccurrences as any[]) ?? []) {
      collectSymbolic(declaration.tokens, fonts, dashes);
    }
  }
  for (const notion of (profile.notions as any[]) ?? []) {
    for (const binding of (notion.renderBindings as any[]) ?? []) {
      collectSymbolic(binding.tokens, fonts, dashes);
    }
  }
  return { fontFamilies: [...fonts].sort(compareText), dashStyles: [...dashes].sort(compareText) };
}

const H = (value: unknown): string => canonicalDigest(value);
const B = (bytes: Uint8Array): string => sha256(bytes);

export const resolveThemeId = (themes: any[], requested: string): string | undefined => {
  if (themes.some(x => x.id === requested)) return requested;
  const listing = themes.filter(x => (x.aliases ?? []).includes(requested));
  return listing.length === 1 ? listing[0].id : undefined;
};

export function themeChain(themes: any[], themeId: string): any[] | undefined {
  const chain: any[] = [];
  for (let id: string | undefined = themeId; id !== undefined;) {
    const theme = themes.find(x => x.id === id);
    if (!theme || chain.includes(theme)) return undefined;
    chain.push(theme);
    id = theme.fallback;
  }
  return chain;
}

export const themeDigest = (themes: any[], themeId: string): string => {
  const chain = themeChain(themes, themeId);
  if (!chain) failContract("render-stale");
  return H({ themeId, themes: [...(chain as any[])].reverse() });
};

export const metricPinsOf = (chain: any[], metricBytes: Map<string, Uint8Array>): { id: string; sha256: string }[] => {
  const ids = [...new Set(chain.map(x => x.metricsResource))].sort(compareText);
  return ids.map(id => {
    const bytes = metricBytes.get(id);
    if (!bytes) failContract("render-stale");
    return { id, sha256: B(bytes as Uint8Array) };
  });
};

export const descriptorDigestOf = (pins: readonly { id: string }[]): string =>
  H([...pins].sort((a, b) => compareText(a.id, b.id)));

const byName = (list: { name: string; value: unknown }[]): { name: string; value: unknown }[] =>
  [...list].sort((a, b) => compareText(a.name, b.name));

const themePaint = (chain: any[]): Map<string, unknown> => {
  const out = new Map<string, unknown>();
  for (const theme of [...chain].reverse()) {
    for (const token of theme.tokens as any[]) {
      if (PAINT.has(token.name)) out.set(token.name, token.value);
    }
  }
  return out;
};

const bindingFor = (chain: any[], notions: Map<string, { readonly renderBindings?: readonly any[] }>, notion: string): any | undefined => {
  const bindings = notions.get(notion)?.renderBindings;
  if (!bindings) return undefined;
  for (const theme of chain) {
    const found = bindings.find(b => b.theme === theme.id);
    if (found) return found;
  }
  return undefined;
};

export interface TokenBags {
  readonly overrides: { readonly semantic: any[]; readonly occurrence: any[] };
  readonly diStyles: { readonly native: any[]; readonly bioc: any[] };
}

// Validate and normalize override and DI style bags. Shape, duplicate and
// token grammar violations are token-level; dangling targets are stale.
export function normalizeBags(args: {
  readonly overrides: unknown; readonly diStyles: unknown;
  readonly treeIds: Set<string>; readonly layoutKeys: Set<string>;
  readonly vocabularies?: TokenVocabularies;
}): TokenBags {
  const fail = (code: string): never => failContract(code);
  const vocabularies = args.vocabularies ?? { fontFamilies: [], dashStyles: [] };
  const checkTokens = (tokens: unknown): { name: string; value: unknown }[] => {
    if (!Array.isArray(tokens)) fail("render-token-invalid");
    const list = tokens as { name: unknown; value: unknown }[];
    for (const token of list) {
      if (!token || typeof token !== "object" || Array.isArray(token)) fail("render-token-invalid");
      if (typeof token.name !== "string" || token.name === "" || !PAINT.has(token.name)) fail("render-token-invalid");
      if (Object.keys(token).sort().join(",") !== "name,value") fail("render-token-invalid");
    }
    try {
      return normalizeTokens(list, { fontFamilies: [...vocabularies.fontFamilies], dashStyles: [...vocabularies.dashStyles] }) as { name: string; value: unknown }[];
    } catch {
      fail("render-token-invalid");
      return [];
    }
  };
  const checkSemantic = (records: unknown): any[] => {
    if (!Array.isArray(records)) fail("render-token-invalid");
    const seen = new Set<string>();
    return (records as any[]).map(record => {
      if (!record || typeof record !== "object" || Array.isArray(record)) fail("render-token-invalid");
      if (Object.keys(record).sort().join(",") !== "semanticId,tokens") fail("render-token-invalid");
      if (typeof record.semanticId !== "string" || record.semanticId === "") fail("render-token-invalid");
      if (seen.has(record.semanticId)) fail("render-token-invalid");
      seen.add(record.semanticId);
      if (!args.treeIds.has(record.semanticId)) fail("render-stale");
      return { semanticId: record.semanticId, tokens: checkTokens(record.tokens) };
    }).sort((a, b) => compareText(a.semanticId, b.semanticId));
  };
  const checkOccurrence = (records: unknown): any[] => {
    if (!Array.isArray(records)) fail("render-token-invalid");
    const seen = new Set<string>();
    return (records as any[]).map(record => {
      if (!record || typeof record !== "object" || Array.isArray(record)) fail("render-token-invalid");
      if (Object.keys(record).sort().join(",") !== "occurrenceKey,pageId,tokens") fail("render-token-invalid");
      if (typeof record.pageId !== "string" || record.pageId === ""
        || typeof record.occurrenceKey !== "string" || record.occurrenceKey === "") fail("render-token-invalid");
      const key = `${record.pageId} ${record.occurrenceKey}`;
      if (seen.has(key)) fail("render-token-invalid");
      seen.add(key);
      if (!args.layoutKeys.has(key)) fail("render-stale");
      return { pageId: record.pageId, occurrenceKey: record.occurrenceKey, tokens: checkTokens(record.tokens) };
    }).sort((a, b) => compareText(a.pageId, b.pageId) || compareText(a.occurrenceKey, b.occurrenceKey));
  };
  const overrides = args.overrides as { semantic: unknown; occurrence: unknown };
  const diStyles = args.diStyles as { native: unknown; bioc: unknown };
  if (!overrides || typeof overrides !== "object" || !diStyles || typeof diStyles !== "object") fail("render-token-invalid");
  return {
    overrides: { semantic: checkSemantic(overrides.semantic), occurrence: checkOccurrence(overrides.occurrence) },
    diStyles: { native: checkOccurrence(diStyles.native), bioc: checkOccurrence(diStyles.bioc) },
  };
}

const resolveStyle = (args: {
  readonly chain: any[]; readonly notionTokens: readonly { name: string; value: unknown }[];
  readonly overrides: TokenBags["overrides"]; readonly diStyles: TokenBags["diStyles"];
  readonly occurrence: { readonly pageId: string; readonly occurrenceKey: string; readonly semanticId?: string };
  readonly synthetic?: boolean;
}): { name: string; value: unknown }[] => {
  const style = themePaint(args.chain);
  const layer = (list: readonly { name: string; value: unknown }[] | undefined): void => {
    for (const token of list ?? []) style.set(token.name, token.value);
  };
  layer(args.notionTokens);
  if (!args.synthetic) {
    layer(args.diStyles.bioc.find(r => r.pageId === args.occurrence.pageId && r.occurrenceKey === args.occurrence.occurrenceKey)?.tokens);
    layer(args.diStyles.native.find(r => r.pageId === args.occurrence.pageId && r.occurrenceKey === args.occurrence.occurrenceKey)?.tokens);
    if (args.occurrence.semanticId !== undefined) {
      layer(args.overrides.semantic.find(r => r.semanticId === args.occurrence.semanticId)?.tokens);
    }
  }
  layer(args.overrides.occurrence.find(r => r.pageId === args.occurrence.pageId && r.occurrenceKey === args.occurrence.occurrenceKey)?.tokens);
  return byName([...style].map(([name, value]) => ({ name, value })));
};

export const preorder = (tree: any): { id: string; pointer: string; type: string }[] => {
  const out: { id: string; pointer: string; type: string }[] = [];
  const visit = (node: any, pointer: string): void => {
    if (typeof node?.id === "string") out.push({ id: node.id, pointer, type: node.$type });
    for (const key of Object.keys(node ?? {}).sort()) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach((c, i) => { if (c && typeof c === "object" && typeof c.$type === "string") visit(c, `${pointer}/${key}/${i}`); });
      else if (value && typeof value === "object" && typeof value.$type === "string") visit(value, `${pointer}/${key}`);
    }
  };
  visit(tree, "");
  return out;
};

export const viewTuple = (binding: Record<string, any>): Record<string, unknown> => ({
  semanticRevision: binding["semanticRevision"], layoutDigest: binding["layoutDigest"], themeId: binding["themeId"],
  themeDigest: binding["themeDigest"], overridesDigest: binding["overridesDigest"],
  diStylesDigest: binding["diStylesDigest"], metricsDigest: binding["metricsDigest"],
});

const sortedBindings = (bindings: any[]): any[] =>
  [...bindings].sort((a, b) => compareText(a.ownerId, b.ownerId) || compareText(a.role, b.role) || compareText(a.targetId, b.targetId));

const semanticRevisionOf = (tree: any, profileIdentity: unknown, bindings: any[]): string =>
  H({ tree, profileIdentity, bindings: sortedBindings(bindings) });

const layoutSorted = (layout: any): boolean => {
  if (!layout || layout.layoutVersion !== "1" || !Array.isArray(layout.pages) || !Array.isArray(layout.geometry)) return false;
  const pages = layout.pages as any[];
  for (let i = 1; i < pages.length; i++) {
    if (pages[i - 1].order > pages[i].order) return false;
    if (pages[i - 1].order === pages[i].order && compareText(pages[i - 1].pageId, pages[i].pageId) >= 0) return false;
  }
  const order = new Map(pages.map((p: any) => [p.pageId, p.order]));
  const geometry = layout.geometry as any[];
  for (let i = 1; i < geometry.length; i++) {
    const prev = geometry[i - 1], current = geometry[i];
    const rank = (order.get(prev.pageId) ?? 0) - (order.get(current.pageId) ?? 0);
    if (rank > 0 || (rank === 0 && compareText(prev.occurrenceKey, current.occurrenceKey) >= 0)) return false;
  }
  return true;
};

// ---------------------------------------------------------------- templateGeometry

const HALF: Rational = { n: 1n, d: 2n };

const roundBox = (x: Rational, y: Rational, width: Rational, height: Rational): { x: number; y: number; width: number; height: number } => ({
  x: ratRoundEvenTicks(x), y: ratRoundEvenTicks(y),
  width: ratRoundEvenTicks(width), height: ratRoundEvenTicks(height),
});

// templateGeometry seam: glyph record plus bounds (plus the label bounds or
// the badge size where the template needs them) to the template payload.
export function templateGeometry(input: {
  readonly glyph: unknown; readonly bounds: unknown; readonly labelBounds?: unknown; readonly badgeSize?: unknown;
}): PureResult<Record<string, unknown>> {
  try {
    const glyph = input.glyph as any;
    if (!glyph || typeof glyph !== "object") failContract("profile-glyph-shape");
    if (glyph.kind !== "template") return { status: "refused", code: "render-unsupported", diagnostics: [] };
    checkTemplateGlyphSignature(glyph);
    const viewBox = glyph.viewBox as unknown;
    if (!Array.isArray(viewBox) || viewBox.length !== 4
      || viewBox.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n))
      || (viewBox[2] as number) <= 0 || (viewBox[3] as number) <= 0) {
      failContract("profile-glyph-shape");
    }
    const bounds = input.bounds as { x: number; y: number; width: number; height: number };
    const params = new Map((glyph.parameters as any[]).map((p: any) => [p.name, p.value]));
    switch (glyph.template) {
      case "header-band": {
        const headerHeight = params.get("headerHeight") as number;
        const split = Math.min(headerHeight, bounds.height);
        return {
          status: "ok",
          payload: {
            header: { x: bounds.x, y: bounds.y, width: bounds.width, height: split },
            body: { x: bounds.x, y: bounds.y + split, width: bounds.width, height: bounds.height - split },
          },
          diagnostics: [],
        };
      }
      case "corner-fold": {
        const foldRatio = params.get("foldRatio") as number;
        const headerRotation = params.get("headerRotation") as number;
        const fold = ratRoundEvenTicks(ratMul(
          ratFromNumber(Math.min(bounds.width, bounds.height)),
          ratFromNumber(foldRatio),
        ));
        const xr = bounds.x + bounds.width;
        const payload: Record<string, unknown> = {
          fold,
          foldPath: [
            { x: xr - fold, y: bounds.y },
            { x: xr - fold, y: bounds.y + fold },
            { x: xr, y: bounds.y + fold },
          ],
        };
        if (input.labelBounds !== undefined) {
          const label = input.labelBounds as { x: number; y: number; width: number; height: number };
          const centerX = ratRoundEvenTicks(ratAdd(ratFromInt(label.x), { n: ratFromInt(label.width).n, d: ratFromInt(label.width).d * 2n }));
          const centerY = ratRoundEvenTicks(ratAdd(ratFromInt(label.y), { n: ratFromInt(label.height).n, d: ratFromInt(label.height).d * 2n }));
          payload["labelRotation"] = { angle: headerRotation, center: { x: centerX, y: centerY } };
        }
        return { status: "ok", payload, diagnostics: [] };
      }
      case "band-stripe": {
        const stripeWidth = params.get("stripeWidth") as number;
        const width = Math.min(stripeWidth, bounds.width);
        return {
          status: "ok",
          payload: { stripe: { x: bounds.x, y: bounds.y, width, height: bounds.height } },
          diagnostics: [],
        };
      }
      default: {
        const badgeSize = input.badgeSize as { width: number; height: number };
        if (!badgeSize || typeof badgeSize.width !== "number" || typeof badgeSize.height !== "number") {
          failContract("profile-glyph-shape");
        }
        const size = badgeSize as { width: number; height: number };
        return {
          status: "ok",
          payload: {
            badge: {
              x: bounds.x + (params.get("offsetX") as number),
              y: bounds.y + bounds.height + (params.get("offsetY") as number),
              width: size.width, height: size.height,
            },
            markerShift: params.get("markerShift"),
            hideSource: params.get("hideSource"),
          },
          diagnostics: [],
        };
      }
    }
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return { status: "refused", code, diagnostics: [] };
  }
}

// ---------------------------------------------------------------- renderDigests

// renderDigests seam: the R digest formulas over explicit records.
// Bag shape validation shared by the digest seam and the resolve path:
// exact record members, non-empty keys, token arrays, no duplicate
// targets, value-level token validity. Target existence is checked only by
// the resolve path (dangling targets are stale data, not malformed bags).
export function normalizeBagsLoose(overrides: unknown, diStyles: unknown, vocabularies?: TokenVocabularies): TokenBags {
  const fail = (code: string): never => failContract(code);
  // Without injected vocabularies the loose seam checks shape and scalar
  // kind only (fontFamily/dash must be strings, as at compile time):
  // symbolic admission belongs to the resolve path, which owns the
  // injected registry and profile declarations.
  const checkTokens = (tokens: unknown): { name: string; value: unknown }[] => {
    if (!Array.isArray(tokens)) fail("render-token-invalid");
    const list = tokens as { name: unknown; value: unknown }[];
    const seen = new Set<string>();
    for (const token of list) {
      if (!token || typeof token !== "object" || Array.isArray(token)) fail("render-token-invalid");
      if (typeof token.name !== "string" || token.name === "" || !PAINT.has(token.name)) fail("render-token-invalid");
      if (Object.keys(token).sort().join(",") !== "name,value") fail("render-token-invalid");
      if (seen.has(token.name as string)) fail("render-token-invalid");
      seen.add(token.name as string);
      if ((token.name === "fontFamily" || token.name === "dash") && typeof token.value !== "string") {
        fail("render-token-invalid");
      }
    }
    const rest = list.filter(token => token.name !== "fontFamily" && token.name !== "dash");
    try {
      const checked = vocabularies === undefined ? normalizeTokens(rest, {}) as { name: string; value: unknown }[]
        : normalizeTokens(list, { fontFamilies: [...vocabularies.fontFamilies], dashStyles: [...vocabularies.dashStyles] }) as { name: string; value: unknown }[];
      return vocabularies === undefined
        ? [...checked, ...list.filter(token => token.name === "fontFamily" || token.name === "dash")
          .map(token => ({ name: token.name as string, value: token.value }))].sort((a, b) => compareText(a.name, b.name))
        : checked;
    } catch {
      fail("render-token-invalid");
      return [];
    }
  };
  const checkRecords = (records: unknown, kind: "semantic" | "occurrence"): any[] => {
    if (!Array.isArray(records)) fail("render-token-invalid");
    const seen = new Set<string>();
    return (records as any[]).map(record => {
      if (!record || typeof record !== "object" || Array.isArray(record)) fail("render-token-invalid");
      if (kind === "semantic") {
        if (Object.keys(record).sort().join(",") !== "semanticId,tokens") fail("render-token-invalid");
        if (typeof record.semanticId !== "string" || record.semanticId === "") fail("render-token-invalid");
        if (seen.has(record.semanticId)) fail("render-token-invalid");
        seen.add(record.semanticId);
        return { semanticId: record.semanticId, tokens: checkTokens(record.tokens) };
      }
      if (Object.keys(record).sort().join(",") !== "occurrenceKey,pageId,tokens") fail("render-token-invalid");
      if (typeof record.pageId !== "string" || record.pageId === ""
        || typeof record.occurrenceKey !== "string" || record.occurrenceKey === "") fail("render-token-invalid");
      const key = `${record.pageId} ${record.occurrenceKey}`;
      if (seen.has(key)) fail("render-token-invalid");
      seen.add(key);
      return { pageId: record.pageId, occurrenceKey: record.occurrenceKey, tokens: checkTokens(record.tokens) };
    });
  };
  const sortSemantic = (a: any, b: any): number => compareText(a.semanticId, b.semanticId);
  const sortOccurrence = (a: any, b: any): number =>
    compareText(a.pageId, b.pageId) || compareText(a.occurrenceKey, b.occurrenceKey);
  const ov = overrides as { semantic: unknown; occurrence: unknown };
  const ds = diStyles as { native: unknown; bioc: unknown };
  if (!ov || typeof ov !== "object" || !ds || typeof ds !== "object") fail("render-token-invalid");
  return {
    overrides: {
      semantic: checkRecords(ov.semantic, "semantic").sort(sortSemantic),
      occurrence: checkRecords(ov.occurrence, "occurrence").sort(sortOccurrence),
    },
    diStyles: {
      native: checkRecords(ds.native, "occurrence").sort(sortOccurrence),
      bioc: checkRecords(ds.bioc, "occurrence").sort(sortOccurrence),
    },
  };
}

// The view revision of one render binding: the digest over the
// seven-tuple (DESIGN 9.2). Shared by verification and history.
export function viewRevisionOf(binding: {
  readonly semanticRevision: string; readonly layoutDigest: string; readonly themeId: string;
  readonly themeDigest: string; readonly overridesDigest: string; readonly diStylesDigest: string;
  readonly metricsDigest: string;
}): string {
  return H({
    semanticRevision: binding.semanticRevision, layoutDigest: binding.layoutDigest, themeId: binding.themeId,
    themeDigest: binding.themeDigest, overridesDigest: binding.overridesDigest,
    diStylesDigest: binding.diStylesDigest, metricsDigest: binding.metricsDigest,
  });
}

export function renderDigests(record: unknown): PureResult<Record<string, unknown>> {
  try {
    const input = record as {
      readonly semanticTree: unknown; readonly profileIdentity: unknown; readonly bindings: any[];
      readonly descriptorPins: { id: string }[]; readonly layout: unknown; readonly themeId: string;
      readonly themes: any[]; readonly overrides: unknown; readonly diStyles: unknown;
      readonly metrics: { id: string; utf8: string }[]; readonly payload?: unknown;
    };
    const { overrides: ov, diStyles: ds } = normalizeBagsLoose(input.overrides, input.diStyles);
    const themeId = resolveThemeId(input.themes, input.themeId);
    if (themeId === undefined) failContract("render-token-invalid");
    const chain = themeChain(input.themes, themeId as string);
    if (!chain) failContract("render-token-invalid");
    const out: Record<string, unknown> = {
      semanticRevision: H({ tree: input.semanticTree, profileIdentity: input.profileIdentity, bindings: sortedBindings(input.bindings) }),
      descriptorDigest: descriptorDigestOf(input.descriptorPins),
      layoutDigest: H(input.layout),
      themeDigest: themeDigest(input.themes, themeId as string),
      overridesDigest: H(ov),
      diStylesDigest: H(ds),
      metricsDigest: H([...input.metrics].sort((a, b) => compareText(a.id, b.id))
        .map(m => ({ id: m.id, sha256: B(new TextEncoder().encode(m.utf8)) }))),
    };
    out["viewRevision"] = H({
      semanticRevision: out["semanticRevision"], layoutDigest: out["layoutDigest"], themeId,
      themeDigest: out["themeDigest"], overridesDigest: out["overridesDigest"],
      diStylesDigest: out["diStylesDigest"], metricsDigest: out["metricsDigest"],
    });
    if (input.payload !== undefined) out["payloadDigest"] = H(input.payload);
    return { status: "ok", payload: out, diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return { status: "refused", code, diagnostics: [] };
  }
}

// ---------------------------------------------------------------- resolveTheme

const profileIdentityOf = (profile: Record<string, any>): Record<string, unknown> => ({
  mechanismVersion: profile.mechanismVersion,
  schemaVersion: profile.schemaVersion,
  profile: profile.profile,
  version: profile.version,
  base: profile.base,
  descriptors: profile.descriptors,
  sha256: H(profile),
});

// resolveTheme: envelope plus layout plus theme selection to RenderData/1.
export function resolveTheme(ctx: Lot4RenderContext, input: {
  readonly envelope: any; readonly layout: unknown; readonly themeId: string;
  readonly overrides: unknown; readonly diStyles: unknown;
}): Result<unknown> {
  const envelope = input.envelope;
  const identity = envelope.profileIdentity;
  const revision = envelope.semanticRevision;
  const refused = (code: string): Result<unknown> =>
    refusedResult("resolveTheme", code, { identity, revision });
  try {
    if (canonicalDigest(profileIdentityOf(ctx.profile)) !== canonicalDigest(identity)) return refused("render-stale");
    const layout = input.layout as { pages: any[]; geometry: any[] };
    if (!layoutSorted(layout)) return refused("render-stale");
    const themeId = resolveThemeId(ctx.profile.themes, input.themeId);
    if (themeId === undefined) return refused("render-stale");
    const chain = themeChain(ctx.profile.themes, themeId);
    if (!chain) return refused("render-stale");
    if (chain[0].geometry === "theme") return refused("profile-open");
    const tree = envelope.tree;
    const nodes = new Map(preorder(tree).map(n => [n.id, n]));
    const treeIds = new Set(nodes.keys());
    const layoutKeys = new Set(layout.geometry.map((g: any) => `${g.pageId} ${g.occurrenceKey}`));
    const vocabularies = tokenVocabularies(ctx.profile, ctx.renderTokens);
    let bags: TokenBags;
    try {
      bags = normalizeBags({ overrides: input.overrides, diStyles: input.diStyles, treeIds, layoutKeys, vocabularies });
    } catch (error) {
      const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
      return refused(code);
    }
    const supportBindings = (envelope.bindings as any[]).map(b => ({ ownerId: b.ownerId, role: b.role, targetId: b.targetId }));
    const matched = new Map<string, { primary?: string; facets: string[] }>();
    for (const id of treeIds) {
      const self = handleOf(tree, id);
      if (!self) continue;
      const owner = bindingOwnerHandle(tree, supportBindings, id);
      const base: EvalContext = lot4EvalContext(ctx, tree, self, supportBindings,
        owner === undefined ? undefined : { bindingOwner: owner });
      let primary: string | undefined;
      const facets: string[] = [];
      const groups = new Set<string>();
      for (const [notionId, notion] of ctx.notions) {
        const outcome = evaluatePredicate(notion.recognition, base);
        if (outcome.status !== "ok" || outcome.payload !== true) continue;
        if (notion.facet === true) {
          facets.push(notionId);
          continue;
        }
        if (notion.exclusiveGroup === undefined) continue;
        // Two matches in one exclusive group yield profile-ambiguous-notion:
        // declaration order never chooses a winner.
        if (groups.has(notion.exclusiveGroup)) return refused("profile-ambiguous-notion");
        groups.add(notion.exclusiveGroup);
        if (primary === undefined) primary = notionId;
      }
      matched.set(id, { ...(primary === undefined ? {} : { primary }), facets });
    }
    const glyphIds = new Set(chain.flatMap(theme => (theme.glyphs as any[]).map((g: any) => g.id)));
    const occurrences: any[] = [];
    const unsupported = new Map<string, any>();
    for (const record of layout.geometry) {
      if (record.semanticId === undefined) {
        let parts: unknown;
        try {
          parts = JSON.parse(record.occurrenceKey);
        } catch {
          return refused("render-stale");
        }
        const declaration = (chain[0].syntheticOccurrences as any[])
          .find((x: any) => Array.isArray(parts) && x.id === (parts as unknown[])[0]);
        if (!declaration || declaration.role !== record.role
          || (parts as unknown[])[2] !== record.pageId
          || canonicalize(parts) !== record.occurrenceKey) return refused("render-stale");
        // The expected label is the declaration Value expression evaluated
        // with the owner as self, exactly as the layout produce path derives
        // it: an empty, missing or unevaluable label verifies as absent.
        const ownerId = (parts as unknown[])[1] as string;
        const ownerNode = findElement(tree, ownerId);
        if (!ownerNode || typeof ownerId !== "string") return refused("render-stale");
        let expected: string | undefined;
        try {
          expected = syntheticLabelText({ evalBase: ctx, tree,
            owner: { node: ownerNode, pointer: nodes.get(ownerId)?.pointer ?? "" },
            ownerId, supportBindings, label: declaration.label });
        } catch {
          return refused("render-stale");
        }
        if ((expected === undefined) !== (record.label === undefined)
          || (record.label && record.label.text !== expected)) return refused("render-stale");
        const style = resolveStyle({
          chain, notionTokens: declaration.tokens ?? [], overrides: bags.overrides, diStyles: bags.diStyles,
          occurrence: record, synthetic: true,
        });
        occurrences.push({ ...structuredClone(record), emittedType: "node", style, glyphId: declaration.glyph });
        continue;
      }
      const match = matched.get(record.semanticId);
      const bind = match?.primary ? bindingFor(chain, ctx.notions, match.primary) : undefined;
      if (!bind) {
        // An unbound edge carrying a label is stale: with no binding the
        // label is unverifiable (label-extra), while unbound nodes and
        // labelless edges stay observable unsupported coverage.
        if (record.sourceOccurrence !== undefined && record.label !== undefined) return refused("render-stale");
        unsupported.set(record.semanticId, record);
        continue;
      }
      if (!glyphIds.has(bind.glyph)) return refused("render-stale");
      const self = handleOf(tree, record.semanticId);
      if (!self) return refused("render-stale");
      const owner = bindingOwnerHandle(tree, supportBindings, record.semanticId);
      const labelOutcome = evaluateValue(bind.label ?? { op: "literal", value: "" },
        lot4EvalContext(ctx, tree, self, supportBindings, owner === undefined ? undefined : { bindingOwner: owner }), "label");
      // A label that cannot be evaluated against a record carrying no label
      // verifies as absent (absent label input yields no label).
      if (labelOutcome.status !== "ok" && record.label !== undefined) return refused("render-stale");
      const text = labelOutcome.status !== "ok" || labelOutcome.payload === MISSING || labelOutcome.payload === "" ? undefined
        : typeof labelOutcome.payload === "string" ? labelOutcome.payload : undefined;
      if (labelOutcome.status === "ok" && labelOutcome.payload !== MISSING && labelOutcome.payload !== "" && typeof labelOutcome.payload !== "string") {
        return refused("render-stale");
      }
      if ((text === undefined) !== (record.label === undefined)
        || (record.label && record.label.text !== text)) return refused("render-stale");
      const facetBinds = (match?.facets ?? []).map(f => bindingFor(chain, ctx.notions, f)).filter(b => b !== undefined);
      const glyphs = new Set([bind.glyph, ...facetBinds.map(b => (b as any).glyph)]);
      if (glyphs.size > 1) return refused("render-style-conflict");
      const facetTokens = facetBinds.flatMap(b => (b as any).tokens ?? []);
      const seen = new Map<string, unknown>();
      for (const token of [...(bind.tokens as any[]), ...facetTokens]) {
        if (seen.has(token.name) && canonicalDigest(seen.get(token.name)) !== canonicalDigest(token.value)) {
          return refused("render-style-conflict");
        }
        seen.set(token.name, token.value);
      }
      const style = resolveStyle({
        chain, notionTokens: [...seen].map(([name, value]) => ({ name, value })),
        overrides: bags.overrides, diStyles: bags.diStyles, occurrence: record,
      });
      const edge = record.sourceOccurrence !== undefined;
      const { sourceOccurrence, targetOccurrence, waypoints, ...rest } = record;
      occurrences.push({
        ...structuredClone(rest), emittedType: edge ? "edge" : "node", style, glyphId: bind.glyph,
        ...(edge ? { sourceOccurrence, targetOccurrence, waypoints } : {}),
      });

    }
    const order = new Map(layout.pages.map((p: any) => [p.pageId, p.order]));
    occurrences.sort((a, b) => (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0) || compareText(a.occurrenceKey, b.occurrenceKey));
    const coverage = [...treeIds].map(id => {
      const own = occurrences.filter(o => o.semanticId === id).map(o => ({ pageId: o.pageId, occurrenceKey: o.occurrenceKey }));
      return { semanticId: id, occurrences: own, disposition: own.length ? "rendered" : unsupported.has(id) ? "unsupported" : "nonvisual" };
    });
    const diagnostics: any[] = [];
    for (const [id, record] of unsupported) {
      diagnostics.push({
        code: "render-unsupported", severity: "error", classification: "integrity", stage: "render",
        ruleId: "adapter", messageKey: "render-unsupported", disposition: "observed",
        source: { domain: "tree", pointer: nodes.get(id)?.pointer ?? null, targetId: id, provenance: "exact" },
        result: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" },
        beforePresent: false, afterPresent: false, pageId: record.pageId, occurrenceKey: record.occurrenceKey,
      });
    }
    const binding = {
      semanticRevision: revision, profileDigest: H(ctx.profile),
      descriptorDigest: descriptorDigestOf(identity.descriptors),
      layoutDigest: H(layout), themeId,
      themeDigest: themeDigest(ctx.profile.themes, themeId),
      overridesDigest: H(bags.overrides), diStylesDigest: H(bags.diStyles),
      metricsDigest: H(metricPinsOf(chain, ctx.metricBytes)),
    };
    const payload = { pages: layout.pages, occurrences, coverage, diagnostics };
    const full = { ...binding, payloadDigest: H(payload) };
    return okResult("resolveTheme", {
      identity, revision,
      entries: sortReportEntries(diagnostics), idMap: [],
      payload: { renderVersion: "1", binding: full, ...payload },
      tokenContext: { fontFamilies: [...vocabularies.fontFamilies], dashStyles: [...vocabularies.dashStyles] },
    });
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refusedResult("resolveTheme", code, { identity, revision });
  }
}

const findElement = (tree: any, id: string): any | undefined => {
  if (!tree || typeof tree !== "object") return undefined;
  if ((tree as any).id === id) return tree;
  for (const value of Object.values(tree)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = findElement(child, id);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findElement(value, id);
      if (found) return found;
    }
  }
  return undefined;
};

// ---------------------------------------------------------------- verifyRenderData

// verifyRenderData: the stored R against fresh inputs; any drift is stale.
export function verifyRenderData(ctx: Lot4RenderContext, input: {
  readonly envelope: any; readonly layout: unknown; readonly render: any;
  readonly themeId: string; readonly overrides: unknown; readonly diStyles: unknown;
}): PureResult<{ readonly viewRevision: string }> {
  const envelope = input.envelope;
  const identity = envelope.profileIdentity;
  const refused = (code: string): PureResult<never> =>
    ({ status: "refused", code, diagnostics: [] }) as PureResult<never>;
  try {
    const render = input.render;
    const binding = render.binding;
    const layout = input.layout as { pages: any[]; geometry: any[] };
    if (!layoutSorted(layout)) return refused("render-stale");
    const tree = envelope.tree;
    const treeIds = new Set(preorder(tree).map(n => n.id));
    const layoutKeys = new Set(layout.geometry.map((g: any) => `${g.pageId} ${g.occurrenceKey}`));
    let bags: TokenBags;
    try {
      bags = normalizeBags({ overrides: input.overrides, diStyles: input.diStyles, treeIds, layoutKeys,
        vocabularies: tokenVocabularies(ctx.profile, ctx.renderTokens) });
    } catch {
      return refused("render-stale");
    }
    const themeId = resolveThemeId(ctx.profile.themes, input.themeId);
    if (themeId === undefined) return refused("render-stale");
    const chain = themeChain(ctx.profile.themes, themeId);
    if (!chain) return refused("render-stale");
    const problems: string[] = [];
    if (binding.semanticRevision !== H({ tree, profileIdentity: identity, bindings: sortedBindings(envelope.bindings) })) {
      problems.push("semanticRevision");
    }
    if (binding.profileDigest !== H(ctx.profile)) problems.push("profileDigest");
    if (binding.descriptorDigest !== descriptorDigestOf(identity.descriptors)) problems.push("descriptorDigest");
    if (binding.layoutDigest !== H(layout)) problems.push("layoutDigest");
    if (themeId !== binding.themeId) problems.push("themeId");
    try {
      if (binding.themeDigest !== themeDigest(ctx.profile.themes, themeId)) problems.push("themeDigest");
    } catch {
      problems.push("themeDigest");
    }
    try {
      if (binding.metricsDigest !== H(metricPinsOf(chain, ctx.metricBytes))) problems.push("metricsDigest");
    } catch {
      problems.push("metricsDigest");
    }
    if (binding.payloadDigest !== H({ pages: render.pages, occurrences: render.occurrences, coverage: render.coverage, diagnostics: render.diagnostics })) {
      problems.push("payloadDigest");
    }
    if (canonicalDigest(render.pages) !== canonicalDigest(layout.pages)) problems.push("pages");
    const expected = occurrencesOf(layout, render);
    if (!expected || canonicalDigest(expected) !== canonicalDigest(render.occurrences)) problems.push("occurrences");
    if (themeId !== binding.themeId) problems.push("themeSelection");
    if (H(bags.overrides) !== binding.overridesDigest) problems.push("overridesDigest");
    if (H(bags.diStyles) !== binding.diStylesDigest) problems.push("diStylesDigest");
    if (problems.length) return refused("render-stale");
    return { status: "ok", payload: { viewRevision: viewRevisionOf(binding) }, diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refused(code);
  }
}

const occurrencesOf = (layout: { pages: any[]; geometry: any[] }, render: any): any[] | undefined => {
  const order = new Map(layout.pages.map((p: any) => [p.pageId, p.order]));
  const byKey = new Map<string, any>(render.occurrences.map((o: any) => [`${o.pageId} ${o.occurrenceKey}`, o]));
  const layoutKeys = new Set(layout.geometry.map((g: any) => `${g.pageId} ${g.occurrenceKey}`));
  for (const key of byKey.keys()) if (!layoutKeys.has(key)) return undefined;
  const out: any[] = [];
  for (const record of layout.geometry) {
    const occurrence = byKey.get(`${record.pageId} ${record.occurrenceKey}`);
    if (!occurrence) return undefined;
    if (record.semanticId === undefined) {
      if (occurrence.semanticId !== undefined || occurrence.pageId !== record.pageId
        || occurrence.occurrenceKey !== record.occurrenceKey || occurrence.role !== record.role) return undefined;
    } else if (occurrence.semanticId !== record.semanticId) return undefined;
    const edge = record.sourceOccurrence !== undefined;
    out.push({
      ...structuredClone(record),
      emittedType: edge ? "edge" : "node",
      style: occurrence.style,
      glyphId: occurrence.glyphId,
    });
  }
  out.sort((a, b) => (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0) || compareText(a.occurrenceKey, b.occurrenceKey));
  return out;
};
