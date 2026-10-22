// Lot-4 closed layout: the tick and region seams plus the shared layout
// primitive (adapter base geometry plus profile placements plus the
// selected theme produce the closed Layout/1 record).
import { ProfileContractError } from "./canonical.js";
import { failContract } from "./native-contracts.js";
import { selectHandles } from "./compiler.js";
import type { EvalContext, EvalHandle } from "./compiler.js";
import { okResult, refusedResult } from "./lot4-result.js";
import type { PureResult, Result } from "./results.js";
import { compareText, lot4EvalContext, requireTrue, syntheticLabelText } from "./lot4-query.js";
import { ratAdd, ratCmp, ratFromInt, ratFromNumber, ratMul, ratRoundEvenTicks, ratSub, ratToNumber } from "./lot4-query.js";
import type { Rational } from "./lot4-query.js";

export interface Lot4LayoutContext {
  readonly profile: Record<string, any>;
  readonly descriptors: EvalContext["descriptors"];
  readonly notions: unknown;
  readonly unicodeCase?: unknown;
}

const refusedSeam = (code: string): PureResult<never> =>
  ({ status: "refused", code, diagnostics: [] }) as PureResult<never>;

const seamRefusal = (error: unknown): PureResult<never> => {
  const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
  return refusedSeam(code);
};

// ---------------------------------------------------------------- ticks

const THOUSAND: Rational = { n: 1000n, d: 1n };

// layoutTicks seam: exact decimal points to whole ticks, ties to even.
export function layoutTicks(input: unknown): PureResult<readonly number[]> {
  try {
    if (!Array.isArray(input)) failContract("profile-glyph-shape");
    const out = (input as unknown[]).map(point => {
      if (typeof point !== "number" || !Number.isFinite(point)) failContract("profile-glyph-shape");
      return ratRoundEvenTicks(ratMul(ratFromNumber(point as number), THOUSAND));
    });
    return { status: "ok", payload: out, diagnostics: [] };
  } catch (error) {
    return seamRefusal(error);
  }
}

// ---------------------------------------------------------------- regions

interface Bounds { x: number; y: number; width: number; height: number }

const HALF: Rational = { n: 1n, d: 2n };
const halfOf = (value: Rational): Rational => ({ n: value.n, d: value.d * 2n });

const roundBox = (x: Rational, y: Rational, width: Rational, height: Rational): Bounds => ({
  x: ratRoundEvenTicks(x), y: ratRoundEvenTicks(y),
  width: ratRoundEvenTicks(width), height: ratRoundEvenTicks(height),
});

export interface RegionRowItem {
  readonly elementId: string;
  readonly occurrenceKey: string;
  readonly object: { readonly width: number; readonly height: number };
  readonly label?: { readonly width: number; readonly height: number };
  readonly anchorCenterX?: Rational;
}

export interface RegionRowResult {
  readonly pageBounds: Bounds;
  readonly body: Bounds;
  readonly items: readonly { readonly elementId: string; readonly occurrenceKey: string; readonly bounds: Bounds; readonly labelBounds?: Bounds }[];
}

// Exact region row: anchored extents chained with the gap, one centred IO
// row, the support body grown to fit, the page grown right and down.
export function regionRow(args: {
  readonly page: Bounds; readonly body: Bounds;
  readonly tokens: { readonly headerWidth: number; readonly padding: number; readonly gap: number; readonly minHeight: number };
  readonly items: readonly RegionRowItem[];
}): RegionRowResult {
  const { page, body, tokens, items } = args;
  if (!items.length) return { pageBounds: { ...page }, body: { ...body }, items: [] };
  const left0 = ratAdd(ratAdd(ratFromInt(body.x), ratFromInt(tokens.headerWidth)), ratFromInt(tokens.padding));
  const right0 = ratSub(ratAdd(ratFromInt(body.x), ratFromInt(body.width)), ratFromInt(tokens.padding));
  let prevRight: Rational | undefined;
  const placed = items.map(item => {
    const w = ratFromInt(item.object.width), h = ratFromInt(item.object.height);
    const lw = item.label ? ratFromInt(item.label.width) : ratFromInt(0);
    const lh = item.label ? ratFromInt(item.label.height) : ratFromInt(0);
    const extent = ratCmp(w, lw) >= 0 ? w : lw;
    let left = item.anchorCenterX !== undefined
      ? ratSub(item.anchorCenterX, halfOf(extent))
      : prevRight === undefined ? left0 : ratAdd(prevRight, ratFromInt(tokens.gap));
    if (ratCmp(left, left0) < 0) left = left0;
    if (prevRight !== undefined && ratCmp(left, ratAdd(prevRight, ratFromInt(tokens.gap))) < 0) {
      left = ratAdd(prevRight, ratFromInt(tokens.gap));
    }
    prevRight = ratAdd(left, extent);
    return {
      item, w, h, lw, lh, left, extent,
      objX: ratAdd(left, halfOf(ratSub(extent, w))),
      labelX: ratAdd(left, halfOf(ratSub(extent, lw))),
      block: ratAdd(h, lh),
    };
  });
  const rowHeight = [ratFromInt(tokens.minHeight),
    ratAdd(placed.reduce((acc, p) => ratCmp(p.block, acc) > 0 ? p.block : acc, ratFromInt(0)), ratFromInt(2 * tokens.padding)),
  ].reduce((a, b) => ratCmp(a, b) >= 0 ? a : b);
  const above = placed.map(p => halfOf(p.h)).reduce((a, b) => ratCmp(a, b) >= 0 ? a : b);
  const below = placed.map(p => ratAdd(halfOf(p.h), p.lh)).reduce((a, b) => ratCmp(a, b) >= 0 ? a : b);
  const middle = halfOf(ratSub(ratAdd(rowHeight, above), below));
  const cy = ratAdd(ratFromInt(body.y), ratCmp(above, middle) >= 0 ? above : middle);
  const width = ratAdd(ratFromInt(body.width),
    ratCmp(ratFromInt(0), ratSub(prevRight as Rational, right0)) >= 0 ? ratFromInt(0) : ratSub(prevRight as Rational, right0));
  const grown = [ratFromInt(body.height), rowHeight, ratSub(ratAdd(cy, below), ratFromInt(body.y))]
    .reduce((a, b) => ratCmp(a, b) >= 0 ? a : b);
  const out = placed.map(p => {
    const top = ratSub(cy, halfOf(p.h));
    const record: { readonly elementId: string; readonly occurrenceKey: string; readonly bounds: Bounds; readonly labelBounds?: Bounds } = {
      elementId: p.item.elementId, occurrenceKey: p.item.occurrenceKey,
      bounds: roundBox(p.objX, top, p.w, p.h),
    };
    if (p.item.label) {
      return { ...record, labelBounds: roundBox(p.labelX, ratAdd(cy, halfOf(p.h)), p.lw, p.lh) };
    }
    return record;
  });
  const grownBody = roundBox(ratFromInt(body.x), ratFromInt(body.y), width, grown);
  const pageRight = [ratAdd(ratFromInt(page.x), ratFromInt(page.width)), ratAdd(ratFromInt(grownBody.x), ratFromInt(grownBody.width))]
    .reduce((a, b) => ratCmp(a, b) >= 0 ? a : b);
  const pageBottom = [ratAdd(ratFromInt(page.y), ratFromInt(page.height)), ratAdd(ratFromInt(grownBody.y), ratFromInt(grownBody.height))]
    .reduce((a, b) => ratCmp(a, b) >= 0 ? a : b);
  return {
    pageBounds: roundBox(ratFromInt(page.x), ratFromInt(page.y), ratSub(pageRight, ratFromInt(page.x)), ratSub(pageBottom, ratFromInt(page.y))),
    body: grownBody,
    items: out,
  };
}

// layoutRegions seam: one region row over explicit records.
export function layoutRegions(input: unknown): PureResult<RegionRowResult> {
  try {
    const record = input as {
      readonly page?: unknown; readonly body?: unknown; readonly tokens?: unknown;
      readonly items?: readonly {
        readonly elementId?: unknown; readonly occurrenceKey?: unknown;
        readonly object?: { readonly width?: unknown; readonly height?: unknown };
        readonly label?: { readonly width?: unknown; readonly height?: unknown };
        readonly anchor?: { readonly x?: unknown; readonly y?: unknown; readonly width?: unknown; readonly height?: unknown };
      }[];
    };
    if (!record || typeof record !== "object") failContract("profile-glyph-shape");
    const page = record.page as Bounds, body = record.body as Bounds;
    const tokens = record.tokens as { headerWidth: number; padding: number; gap: number; minHeight: number };
    for (const value of [page.x, page.y, page.width, page.height, body.x, body.y, body.width, body.height]) {
      if (typeof value !== "number" || !Number.isSafeInteger(value)) failContract("profile-glyph-shape");
    }
    for (const value of [tokens.headerWidth, tokens.padding, tokens.gap, tokens.minHeight]) {
      if (typeof value !== "number" || !Number.isSafeInteger(value)) failContract("profile-glyph-shape");
    }
    const items: RegionRowItem[] = (record.items ?? []).map(item => {
      const elementId: unknown = item.elementId, occurrenceKey: unknown = item.occurrenceKey;
      requireTrue(typeof elementId === "string" && typeof occurrenceKey === "string", "profile-glyph-shape");
      const object = item.object as { width: unknown; height: unknown };
      requireTrue(typeof object?.width === "number" && Number.isSafeInteger(object.width)
        && typeof object?.height === "number" && Number.isSafeInteger(object.height), "profile-glyph-shape");
      let label: { width: number; height: number } | undefined;
      if (item.label !== undefined) {
        const labelRecord = item.label as { width: unknown; height: unknown };
        requireTrue(typeof labelRecord?.width === "number" && Number.isSafeInteger(labelRecord.width)
          && typeof labelRecord?.height === "number" && Number.isSafeInteger(labelRecord.height), "profile-glyph-shape");
        label = { width: labelRecord.width, height: labelRecord.height };
      }
      let anchorCenterX: Rational | undefined;
      if (item.anchor !== undefined) {
        const anchor = item.anchor as { x: unknown; y: unknown; width: unknown; height: unknown };
        for (const value of [anchor.x, anchor.y, anchor.width, anchor.height]) {
          requireTrue(typeof value === "number" && Number.isSafeInteger(value), "profile-glyph-shape");
        }
        requireTrue(typeof anchor.x === "number" && typeof anchor.width === "number", "profile-glyph-shape");
        anchorCenterX = ratAdd(ratFromInt(anchor.x), halfOf(ratFromInt(anchor.width)));
      }
      requireTrue(typeof object.width === "number" && typeof object.height === "number", "profile-glyph-shape");
      return {
        elementId, occurrenceKey,
        object: { width: object.width, height: object.height },
        ...(label === undefined ? {} : { label }), ...(anchorCenterX === undefined ? {} : { anchorCenterX }),
      };
    });
    return { status: "ok", payload: regionRow({ page, body, tokens, items }), diagnostics: [] };
  } catch (error) {
    return seamRefusal(error);
  }
}

// ---------------------------------------------------------------- layout primitive

interface RegionTokens { readonly headerWidth: number; readonly padding: number; readonly gap: number; readonly minHeight: number }

interface PageRecord { pageId: string; name: string; order: number; semanticRootId: string; bounds: Bounds }
interface GeometryRecord {
  pageId: string; occurrenceKey: string; semanticId?: string; role?: string;
  bounds: Bounds;
  label?: { text: string; bounds: Bounds; lines: string[] };
  sourceOccurrence?: { pageId: string; occurrenceKey: string };
  targetOccurrence?: { pageId: string; occurrenceKey: string };
  waypoints?: { x: number; y: number }[];
}
interface PlacementRecord {
  elementId: string; ownerProcessId: string; regionKey: string;
  anchorAssociationId?: string; relatedAssociationIds?: string[];
}

const themesOf = (profile: Record<string, any>): any[] => profile.themes as any[];

const resolveThemeId = (profile: Record<string, any>, requested: string): string | undefined => {
  const themes = themesOf(profile);
  if (themes.some(x => x.id === requested)) return requested;
  const listing = themes.filter(x => (x.aliases ?? []).includes(requested));
  return listing.length === 1 ? listing[0].id : undefined;
};

const chainOf = (profile: Record<string, any>, themeId: string): any[] | undefined => {
  const chain: any[] = [];
  for (let id: string | undefined = themeId; id !== undefined;) {
    const theme = themesOf(profile).find(x => x.id === id);
    if (!theme || chain.includes(theme)) return undefined;
    chain.push(theme);
    id = theme.fallback;
  }
  return chain;
};

const tokenOf = (chain: any[], name: string): unknown => {
  for (const theme of chain) {
    const found = (theme.tokens as any[]).find(t => t.name === name);
    if (found) return found.value;
  }
  return undefined;
};

const tokensFor = (chain: any[], regionKey: string): RegionTokens | undefined => {
  const read = (field: string): number | undefined => {
    const value = tokenOf(chain, `region.${regionKey}.${field}`);
    return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
  };
  const headerWidth = read("headerWidth"), padding = read("padding"), gap = read("gap"), minHeight = read("minHeight");
  if (headerWidth === undefined || padding === undefined || gap === undefined || minHeight === undefined) return undefined;
  return { headerWidth, padding, gap, minHeight };
};

interface TreeEntry { id: string; pointer: string; type: string }

const indexTree = (tree: any): Map<string, TreeEntry> => {
  const nodes = new Map<string, TreeEntry>();
  const visit = (node: any, pointer: string): void => {
    if (typeof node?.id === "string") nodes.set(node.id, { id: node.id, pointer, type: node.$type });
    for (const key of Object.keys(node ?? {}).sort()) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach((c, i) => { if (c && typeof c === "object" && typeof c.$type === "string") visit(c, `${pointer}/${key}/${i}`); });
      else if (value && typeof value === "object" && typeof (value as any).$type === "string") visit(value, `${pointer}/${key}`);
    }
  };
  visit(tree, "");
  return nodes;
};

// Straight link between the facing edges of two boxes: anchor centres
// quantized once to integer ticks (ties to even), top/bottom facing rule.
const straightLink = (source: Bounds, target: Bounds): { x: number; y: number }[] => {
  const quantum = (origin: number, size: number): number =>
    ratRoundEvenTicks(ratFromNumber(origin + size / 2));
  const scx = quantum(source.x, source.width), dcx = quantum(target.x, target.width);
  return source.y + source.height <= target.y
    ? [{ x: scx, y: source.y + source.height }, { x: dcx, y: target.y }]
    : [{ x: scx, y: source.y }, { x: dcx, y: target.y + target.height }];
};

const bboxOf = (waypoints: { x: number; y: number }[]): Bounds => {
  const xs = waypoints.map(p => p.x), ys = waypoints.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
};

const findById = (node: any, id: string): any | undefined => {
  if (!node || typeof node !== "object") return undefined;
  if ((node as any).id === id) return node;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = findById(child, id);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findById(value, id);
      if (found) return found;
    }
  }
  return undefined;
};

const findAssociationOwner = (node: any, associationId: string, property: string): string | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const owned = (node as any)[property];
  if (Array.isArray(owned) && owned.some((a: any) => (a?.id ?? a) === associationId) && typeof (node as any).id === "string") {
    return (node as any).id;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = findAssociationOwner(child, associationId, property);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findAssociationOwner(value, associationId, property);
      if (found) return found;
    }
  }
  return undefined;
};

// Anchor activity of a placement: the activity owning a data association,
// or the other end of an Association relative to the placed element.
const anchorActivity = (associationId: string | undefined, placedId: string, tree: any): string | undefined => {
  if (associationId === undefined) return undefined;
  const association = findById(tree, associationId);
  if (!association) return undefined;
  if (association.$type === "bpmn:DataInputAssociation") {
    return findAssociationOwner(tree, association.id, "dataInputAssociations");
  }
  if (association.$type === "bpmn:DataOutputAssociation") {
    return findAssociationOwner(tree, association.id, "dataOutputAssociations");
  }
  if (association.$type === "bpmn:Association") {
    const source = association.sourceRef?.id ?? association.sourceRef;
    const target = association.targetRef?.id ?? association.targetRef;
    if (source === placedId) return typeof target === "string" ? target : undefined;
    if (target === placedId) return typeof source === "string" ? source : undefined;
  }
  return undefined;
};

const glyphsOf = (chain: any[]): any[] => chain.flatMap(theme => theme.glyphs as any[]);

// The layout primitive: adapter base geometry plus profile placements plus
// the selected theme produce the closed Layout/1 record.
export function runLayout(ctx: Lot4LayoutContext, input: {
  readonly envelope: any; readonly placements: unknown; readonly baseGeometry: unknown; readonly themeId: string;
}): Result<unknown> {
  const identity = input.envelope.profileIdentity;
  const revision = input.envelope.semanticRevision;
  const refused = (code: string): Result<unknown> => refusedResult("layout", code, { identity, revision });
  try {
    const themeId = resolveThemeId(ctx.profile, input.themeId);
    if (themeId === undefined) return refused("render-stale");
    const chain = chainOf(ctx.profile, themeId);
    if (!chain) return refused("render-stale");
    if (chain[0].geometry === "theme") return refused("profile-open");
    const placements = input.placements as PlacementRecord[];
    const base = input.baseGeometry as { pages: PageRecord[]; geometry: GeometryRecord[] };
    const tree = input.envelope.tree;
    const bindings = new Map((input.envelope.bindings as any[]).map(b => [`${b.ownerId} ${b.role}`, b]));
    const byOwnerRegion = new Map<string, PlacementRecord[]>();
    for (const placement of placements) {
      const key = `${placement.ownerProcessId} ${placement.regionKey}`;
      const list = byOwnerRegion.get(key) ?? [];
      list.push(placement);
      byOwnerRegion.set(key, list);
    }
    const pages: PageRecord[] = [...base.pages]
      .map(p => ({ ...p, bounds: { ...p.bounds } }))
      .sort((a, b) => a.order - b.order || compareText(a.pageId, b.pageId));
    const outPages: PageRecord[] = [];
    const outGeometry: GeometryRecord[] = [];
    const declarations = chain[0].syntheticOccurrences as any[];
    for (const page of pages) {
      const baseRecords: GeometryRecord[] = structuredClone(base.geometry.filter(g => g.pageId === page.pageId));
      const geometry: GeometryRecord[] = structuredClone(base.geometry.filter(g => g.pageId === page.pageId));
      let pageBounds = { ...page.bounds };
      // Pre-expansion bounds per occurrence: the incident-link pass below
      // compares against this snapshot to find every moved record.
      const boundsBefore = new Map(geometry.map(g => [g.occurrenceKey, JSON.stringify(g.bounds)]));
      for (const group of groupsOf(byOwnerRegion)) {
        const shown = group.list.filter(pl => geometry.some(g => g.semanticId === pl.elementId));
        if (!shown.length) continue;
        const binding = bindings.get(`${group.owner} ${group.regionKey}`);
        if (!binding) {
          if (declarations.some((d: any) => d.role === "attached-badge" && d.region === group.regionKey)) {
            for (const pl of shown) {
              const record = geometry.find(g => g.semanticId === pl.elementId);
              if (record) record.role = group.regionKey;
            }
            continue;
          }
          return refused("render-region-missing");
        }
        const support = geometry.find(g => g.semanticId === binding.targetId);
        if (!support) return refused("render-region-missing");
        const tokens = tokensFor(chain, group.regionKey);
        if (!tokens) return refused("render-region-missing");
        const items = shown.map(pl => {
          const record = geometry.find(g => g.semanticId === pl.elementId) as GeometryRecord;
          const anchorId = anchorActivity(pl.anchorAssociationId, pl.elementId, tree);
          const anchors = anchorId === undefined ? [] : baseRecords.filter(g => g.semanticId === anchorId);
          const anchor = anchors.length === 1 ? anchors[0] as GeometryRecord : undefined;
          return {
            elementId: pl.elementId, occurrenceKey: record.occurrenceKey,
            object: { width: record.bounds.width, height: record.bounds.height },
            ...(record.label ? { label: { width: record.label.bounds.width, height: record.label.bounds.height } } : {}),
            ...(anchor ? { anchorCenterX: ratAdd(ratFromInt(anchor.bounds.x), halfOf(ratFromInt(anchor.bounds.width))) } : {}),
          };
        });
        const row = regionRow({ page: pageBounds, body: { ...support.bounds }, tokens, items });
        pageBounds = row.pageBounds;
        support.bounds = row.body;
        for (const item of row.items) {
          const record = geometry.find(g => g.semanticId === item.elementId) as GeometryRecord;
          record.bounds = item.bounds;
          record.role = group.regionKey;
          if (record.label && item.labelBounds) record.label = { ...record.label, bounds: item.labelBounds };
        }
      }
      const supportBindings = (input.envelope.bindings as any[]).map(b => ({
        ownerId: b.ownerId as string, role: b.role as string, targetId: b.targetId as string,
      }));
      const synthetics = runSynthetics({ ctx, chain, tree, page, baseRecords, geometry, bindings, placements, supportBindings });
      if (synthetics.refused) return refused(synthetics.refused);
      if (synthetics.unsupported) return refused("render-unsupported");
      // Every link affected by the region expansion is recomputed from the
      // final node bounds: the anchor links of the placed items, plus any
      // other link incident to a record the expansion moved. Authored edges
      // between two unmoved records stay untouched. A recomputed link whose
      // endpoints are not both represented on the page is dropped.
      const anchorIds = new Set<string>();
      for (const group of groupsOf(byOwnerRegion)) {
        for (const pl of group.list) {
          if (pl.anchorAssociationId !== undefined) anchorIds.add(pl.anchorAssociationId);
        }
      }
      const movedKeys = new Set<string>();
      for (const record of geometry) {
        const before = boundsBefore.get(record.occurrenceKey);
        if (before !== undefined && before !== JSON.stringify(record.bounds)) movedKeys.add(record.occurrenceKey);
      }
      const kept: GeometryRecord[] = [];
      const isAffected = (link: GeometryRecord): boolean => {
        if (link.semanticId !== undefined && anchorIds.has(link.semanticId)) return true;
        const sourceKey = link.sourceOccurrence?.occurrenceKey;
        if (sourceKey !== undefined && movedKeys.has(sourceKey)) return true;
        const targetKey = link.targetOccurrence?.occurrenceKey;
        return targetKey !== undefined && movedKeys.has(targetKey);
      };
      for (const link of geometry) {
        if (link.sourceOccurrence === undefined || link.targetOccurrence === undefined
          || link.semanticId === undefined || !isAffected(link)) {
          kept.push(link);
          continue;
        }
        const source = geometry.find(g => g.occurrenceKey === link.sourceOccurrence?.occurrenceKey);
        const target = geometry.find(g => g.occurrenceKey === link.targetOccurrence?.occurrenceKey);
        if (!source || !target) continue;
        const waypoints = straightLink(source.bounds, target.bounds);
        kept.push({
          pageId: link.pageId, occurrenceKey: link.occurrenceKey, semanticId: link.semanticId,
          role: "content", bounds: bboxOf(waypoints),
          sourceOccurrence: link.sourceOccurrence, targetOccurrence: link.targetOccurrence, waypoints,
        });
      }
      geometry.length = 0;
      geometry.push(...kept);
      outPages.push({ ...page, bounds: pageBounds });
      outGeometry.push(...geometry, ...synthetics.records);
    }
    const order = new Map(outPages.map(p => [p.pageId, p.order]));
    outGeometry.sort((a, b) => (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0) || compareText(a.occurrenceKey, b.occurrenceKey));
    return okResult("layout", {
      identity, revision,
      payload: { layoutVersion: "1", pages: outPages, geometry: outGeometry },
    });
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refusedResult("layout", code, { identity, revision });
  }
}

function groupsOf(byOwnerRegion: Map<string, PlacementRecord[]>): { owner: string; regionKey: string; list: PlacementRecord[] }[] {
  return [...byOwnerRegion].map(([key, list]) => {
    const [owner, regionKey] = key.split(" ");
    return { owner: owner as string, regionKey: regionKey as string, list };
  });
}

function runSynthetics(args: {
  readonly ctx: Lot4LayoutContext;
  readonly chain: any[]; readonly tree: any; readonly page: PageRecord;
  readonly baseRecords: GeometryRecord[]; readonly geometry: GeometryRecord[];
  readonly bindings: Map<string, any>; readonly placements: PlacementRecord[];
  readonly supportBindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[] | undefined;
}): { readonly refused?: string; readonly unsupported?: boolean; readonly records: GeometryRecord[] } {
  const { ctx, chain, tree, page, baseRecords, geometry, bindings, placements, supportBindings } = args;
  const records: GeometryRecord[] = [];
  for (const declaration of chain[0].syntheticOccurrences as any[]) {
    const glyph = glyphsOf(chain).find((g: any) => g.id === declaration.glyph);
    if (!glyph) return { refused: "render-unsupported", records };
    for (const owner of selectOwners(ctx, declaration, tree, supportBindings)) {
      const ownerId = owner.id;
      const represented = page.semanticRootId === ownerId || baseRecords.some(g => g.semanticId === ownerId);
      if (!represented) continue;
      if (declaration.role === "band-stripe") {
        const supportId = bindings.get(`${ownerId} ${declaration.region}`)?.targetId;
        const region = supportId === undefined ? undefined : geometry.find(g => g.semanticId === supportId);
        if (!region) return { refused: "render-region-missing", records };
        const stripeWidth = glyph.template === "band-stripe"
          ? (glyph.parameters as any[]).find((p: any) => p.name === "stripeWidth")?.value
          : undefined;
        const width = stripeWidth === undefined ? region.bounds.width : Math.min(stripeWidth, region.bounds.width);
        const bounds = { x: region.bounds.x, y: region.bounds.y, width, height: region.bounds.height };
        // The label is a Value expression evaluated with the owner as self,
        // never a literal read off the declaration.
        const text = syntheticLabelText({ evalBase: ctx, tree, owner: owner.handle, ownerId, supportBindings, label: declaration.label });
        records.push({
          pageId: page.pageId, occurrenceKey: JSON.stringify([declaration.id, ownerId, page.pageId]),
          role: declaration.role, bounds,
          ...(text ? { label: { text, bounds: { ...bounds }, lines: [text] } } : {}),
        });
        continue;
      }
      const params = Object.fromEntries((glyph.parameters as any[]).map((p: any) => [p.name, p.value]));
      if (params.hideSource) return { refused: "render-unsupported", records };
      const placement = placements.find(p => p.elementId === ownerId && p.regionKey === declaration.region);
      if (!placement || placement.anchorAssociationId === undefined) return { refused: "render-region-missing", records };
      const anchorId = anchorActivity(placement.anchorAssociationId, ownerId, tree);
      const anchors = anchorId === undefined ? [] : baseRecords.filter(g => g.semanticId === anchorId);
      if (anchors.length !== 1) return { refused: "render-region-missing", records };
      const anchor = anchors[0] as GeometryRecord;
      const viewBox = glyph.viewBox as number[];
      const size = { width: (viewBox[2] as number) * 1000, height: (viewBox[3] as number) * 1000 };
      const bounds = {
        x: anchor.bounds.x + (params.offsetX as number),
        y: anchor.bounds.y + anchor.bounds.height + (params.offsetY as number),
        width: size.width, height: size.height,
      };
      const text = syntheticLabelText({ evalBase: ctx, tree, owner: owner.handle, ownerId, supportBindings, label: declaration.label });
      records.push({
        pageId: page.pageId, occurrenceKey: JSON.stringify([declaration.id, ownerId, page.pageId]),
        role: declaration.role, bounds,
        ...(text ? { label: { text, bounds: { ...bounds }, lines: [text] } } : {}),
      });
    }
  }
  return { records };
}

// Owners of a synthetic declaration: the declared selector evaluated once
// over the immutable normalized tree, deduplicated and in id order. Any
// selector the shared evaluator refuses is outside the sealed surface.
const selectOwners = (ctx: Lot4LayoutContext, declaration: any, tree: any,
    supportBindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[] | undefined):
    { readonly id: string; readonly handle: EvalHandle }[] => {
  requireTrue(declaration && typeof declaration === "object", "operation-error");
  const selector = (declaration as any).select;
  requireTrue(selector && typeof selector === "object", "operation-error");
  const treeHandle: EvalHandle = { node: tree, pointer: "" };
  const base = lot4EvalContext(ctx, tree, treeHandle, supportBindings);
  const evalCtx: EvalContext = { ...base, bindings: { ...base.bindings, root: treeHandle } };
  const selected = selectHandles(selector, evalCtx);
  if (selected.status !== "ok") failContract("operation-error");
  const seen = new Set<string>();
  const owners: { readonly id: string; readonly handle: EvalHandle }[] = [];
  for (const handle of (selected as { readonly payload: readonly unknown[] }).payload) {
    const node = (handle as { readonly node?: { readonly id?: unknown } }).node;
    const id = node?.id;
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    owners.push({ id, handle: handle as EvalHandle });
  }
  return owners.sort((a, b) => compareText(a.id, b.id));
};
