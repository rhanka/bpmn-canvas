/** Lot-5 UI canvas: shared record shapes, tree index, digests, layout and report builders.
 * DESIGN R3.3 §8.3 on top of §8.1–§8.2; block-B harmonization rows B4, B9, B17–B20, G2, G5.
 * Browser-safe: no Node builtins (pure SHA-256 through canonical.js). */
import { canonicalDigest, stableId as allocateId } from "./canonical.js";
import { semanticRevision } from "./envelope.js";
import type { DescriptorIndex, NativeNode } from "./native-contracts.js";

export type Json = null | boolean | number | string | { readonly [key: string]: Json } | readonly Json[];
export type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;

export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const H = (value: unknown): string => canonicalDigest(value);
export const stableId = (ownerId: string, slot: string, stableKey: string): string => allocateId(ownerId, slot, stableKey);
export const revisionOf = (tree: NativeNode, identity: { [key: string]: Json }, bindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[]): string =>
  semanticRevision(tree, identity as never, bindings as never);

export type Rec = { [key: string]: unknown };
export const asRecord = (value: unknown): Rec | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : undefined;
export const asArray = (value: unknown): unknown[] | undefined => (Array.isArray(value) ? value as unknown[] : undefined);
const esc = (key: string): string => key.replace(/~/g, "~0").replace(/\//g, "~1");

export interface TreeNode { readonly node: NativeNode; readonly pointer: string; readonly parent: TreeNode | null; readonly property: string | null; readonly index: number | null }

/** Index over a native tree: id lookup, pointers, parents, pre-order walk in
 * descriptor containment order (harmonization B20). */
export class TreeIndex {
  readonly byId = new Map<string, TreeNode>();
  readonly order: TreeNode[] = [];
  constructor(
    readonly tree: NativeNode,
    readonly containmentOrder?: (type: string) => readonly string[] | undefined,
  ) {
    this.walk(tree, "", null, null, null);
  }
  private propsOf(node: NativeNode): string[] {
    const declared = this.containmentOrder?.(node.$type);
    const keys = Object.keys(node).filter(k => {
      const v = (node as Rec)[k];
      return v !== null && typeof v === "object";
    });
    if (!declared) return keys;
    const rank = new Map(declared.map((k, i) => [k, i]));
    return keys.sort((a, b) => (rank.get(a) ?? declared.length + a.charCodeAt(0)) - (rank.get(b) ?? declared.length + (b as string).charCodeAt(0)));
  }
  private walk(node: NativeNode, pointer: string, parent: TreeNode | null, property: string | null, index: number | null): void {
    const here: TreeNode = { node, pointer, parent, property, index };
    this.order.push(here);
    if (typeof node.id === "string" && !this.byId.has(node.id)) this.byId.set(node.id, here);
    for (const key of this.propsOf(node)) {
      const value = (node as Rec)[key];
      if (Array.isArray(value)) {
        value.forEach((child, i) => {
          if (child && typeof child === "object" && !Array.isArray(child)) this.walk(child as NativeNode, `${pointer}/${esc(key)}/${i}`, here, key, i);
        });
      } else if (value && typeof value === "object") {
        this.walk(value as NativeNode, `${pointer}/${esc(key)}`, here, key, null);
      }
    }
  }
  get(id: string): TreeNode | undefined {
    return this.byId.get(id);
  }
  /** Nearest ancestor-or-self with a string id (D2 owner rule input). */
  ownerOf(node: TreeNode): TreeNode | null {
    let current: TreeNode | null = node;
    while (current) {
      if (typeof current.node.id === "string") return current;
      current = current.parent;
    }
    return null;
  }
  /** Nearest ancestor-or-self whose node is a Process (B19 ownership). */
  processOf(node: TreeNode): TreeNode | null {
    let current: TreeNode | null = node;
    while (current) {
      if (current.node.$type === "bpmn:Process") return current;
      current = current.parent;
    }
    return null;
  }
  /** True when `node` is contained in `ancestor` (strict). */
  containedIn(node: TreeNode, ancestor: TreeNode): boolean {
    let current = node.parent;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
    }
    return false;
  }
}

/** Reference members for paste/remap: descriptor-declared references of the
 * node type plus descriptor-declared ID-valued scalars (Type.scalar), the
 * same driver remap.ts and import.ts use. Members no descriptor declares
 * are never rewritten nor reported, whatever their name. */
export interface ReferenceDriver {
  readonly descriptors: DescriptorIndex;
  readonly idRefScalars: readonly string[];
}

const referenceMembers = (driver: ReferenceDriver, typeName: string): Set<string> => {
  const found = new Set<string>();
  const spec = driver.descriptors[typeName];
  if (spec) for (const key of Object.keys(spec.references)) found.add(key);
  for (const key of driver.idRefScalars) {
    const dot = key.indexOf(".");
    if (dot >= 0 && key.slice(0, dot) === typeName) found.add(key.slice(dot + 1));
  }
  return found;
};

export function rewriteRefs(node: unknown, map: ReadonlyMap<string, string>, driver: ReferenceDriver): void {
  if (Array.isArray(node)) {
    // Bare strings outside a reference member are data (names, texts),
    // never rewritten: only member arrays remap, at the object level below.
    for (const item of node) rewriteRefs(item, map, driver);
    return;
  }
  const record = asRecord(node);
  if (!record) return;
  const typeName = typeof record.$type === "string" ? (record.$type as string) : undefined;
  const members = typeName === undefined ? new Set<string>() : referenceMembers(driver, typeName);
  for (const [key, value] of Object.entries(record)) {
    if (key === "id") {
      if (typeof value === "string" && map.has(value)) record[key] = map.get(value) as unknown;
      continue;
    }
    if (members.has(key)) {
      if (typeof value === "string" && map.has(value)) record[key] = map.get(value) as unknown;
      else if (Array.isArray(value)) {
        record[key] = value.map(item => (typeof item === "string" && map.has(item) ? map.get(item) : item)) as unknown;
      }
      continue;
    }
    rewriteRefs(value, map, driver);
  }
}

/** Collect every descriptor-declared string reference of a tree for dangling analysis. */
export function danglingRefs(tree: NativeNode, known: ReadonlySet<string>,
    driver: ReferenceDriver): { id: string; member: string; value: string }[] {
  const out: { id: string; member: string; value: string }[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    const id = typeof record.id === "string" ? (record.id as string) : "";
    const typeName = typeof record.$type === "string" ? (record.$type as string) : undefined;
    if (typeName !== undefined) {
      for (const member of referenceMembers(driver, typeName)) {
        const value = record[member];
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          if (typeof item === "string" && item && !known.has(item)) out.push({ id, member, value: item });
        }
      }
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(tree);
  return out;
}

// ---------------------------------------------------------------- Report/2 and Result/1 (harmonization B2, B4, G2)
export interface ReportCoordinate { readonly domain: string; readonly pointer: string | null; readonly targetId: string | null; readonly provenance: string }
export const UNAVAILABLE: ReportCoordinate = { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };

export const reportFor = (operation: string, options: { entries?: readonly unknown[]; idMap?: readonly unknown[]; artifacts?: readonly unknown[];
  input?: string; output?: string; identity?: unknown; refusal?: boolean }): Rec => ({
  reportVersion: "2",
  operation,
  ...(options.identity !== undefined ? { sourceIdentity: clone(options.identity) } : {}),
  ...(!options.refusal && options.identity !== undefined ? { targetIdentity: clone(options.identity) } : {}),
  ...(options.input !== undefined ? { inputRevision: options.input } : {}),
  ...(!options.refusal && options.output !== undefined ? { outputRevision: options.output } : {}),
  entries: clone(options.entries ?? []),
  rawStandardFindings: [],
  idMap: clone(options.idMap ?? []),
  artifacts: clone(options.artifacts ?? []),
});

export const okResult = (operation: string, base: string, revision: string, payload: unknown, report: Rec, identity: unknown): Rec =>
  ({ status: "ok", operation, profileIdentity: clone(identity), baseRevision: base, revision, report, payload: clone(payload) });

export const refusedResult = (operation: string, code: string, options: { base?: string; identity?: unknown; entries?: readonly unknown[] } = {}): Rec => {
  const echo = options.base !== undefined && options.identity !== undefined;
  const reportOptions: { entries?: readonly unknown[]; idMap?: readonly unknown[]; artifacts?: readonly unknown[];
    input?: string; output?: string; identity?: unknown; refusal?: boolean } = { entries: options.entries ?? [], refusal: true };
  if (options.identity !== undefined) reportOptions.identity = options.identity;
  if (echo) reportOptions.input = options.base!;
  const result: Rec = {
    status: "refused",
    operation,
    code,
    diagnostics: clone(options.entries ?? []),
    report: reportFor(operation, reportOptions),
  };
  if (echo) {
    result.profileIdentity = clone(options.identity);
    (result as Rec).baseRevision = options.base as string;
  }
  return reorderRefused(result);
};

const reorderRefused = (result: Rec): Rec => {
  const ordered: Rec = { status: result.status, operation: result.operation };
  if (result.profileIdentity !== undefined) {
    (ordered as Rec).profileIdentity = result.profileIdentity;
    (ordered as Rec).baseRevision = result.baseRevision;
  }
  (ordered as Rec).code = result.code;
  (ordered as Rec).diagnostics = result.diagnostics;
  (ordered as Rec).report = result.report;
  return ordered;
};

export const pureOk = (payload: unknown, diagnostics: readonly unknown[] = []): Rec =>
  ({ status: "ok", payload: clone(payload), diagnostics: clone(diagnostics) });
export const pureRefused = (code: string, diagnostics: readonly unknown[] = []): Rec =>
  ({ status: "refused", code, diagnostics: clone(diagnostics) });

// ---------------------------------------------------------------- presentation digests (§9.2)
export interface PresentationDigests { readonly themeDigest: (themeId: string) => string; readonly overridesDigest: string;
  readonly diStylesDigest: string; readonly metricsDigest: string }

export const EMPTY_OVERRIDES: Rec = { semantic: [], occurrence: [] };
export const EMPTY_STYLES: Rec = { native: [], bioc: [] };

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const tokenName = (token: unknown): string => {
  const record = asRecord(token as Rec) ?? {};
  return typeof record.name === "string" ? (record.name as string) : "";
};

const sortedTokens = (tokens: unknown): Rec[] =>
  [...((asArray(tokens as Rec) ?? []).map(token => clone(token) as Rec))]
    .sort((a, b) => byText(tokenName(a), tokenName(b)));

/** Overrides/1 normalized for the digest (DESIGN §9.2): semantic records by
 * semanticId, occurrence records by pageId then occurrenceKey, tokens by name. */
export function normalizeOverrides(overrides: Rec): Rec {
  const root = asRecord(overrides) ?? {};
  const semantic = [...((asArray(root.semantic) ?? []).map(record => clone(record) as Rec))]
    .sort((a, b) => byText((a.semanticId as string) ?? "", (b.semanticId as string) ?? ""))
    .map(record => ({ ...record, tokens: sortedTokens(record.tokens) }));
  const occurrence = [...((asArray(root.occurrence) ?? []).map(record => clone(record) as Rec))]
    .sort((a, b) => byText((a.pageId as string) ?? "", (b.pageId as string) ?? "")
      || byText((a.occurrenceKey as string) ?? "", (b.occurrenceKey as string) ?? ""))
    .map(record => ({ ...record, tokens: sortedTokens(record.tokens) }));
  return { semantic, occurrence };
}

/** DiStyles/1 normalized for the digest (DESIGN §9.2): native and bioc
 * records by pageId then occurrenceKey, tokens by name. */
export function normalizeDiStyles(diStyles: Rec): Rec {
  const root = asRecord(diStyles) ?? {};
  const normalize = (key: string): Rec[] =>
    [...((asArray(root[key]) ?? []).map(record => clone(record) as Rec))]
      .sort((a, b) => byText((a.pageId as string) ?? "", (b.pageId as string) ?? "")
        || byText((a.occurrenceKey as string) ?? "", (b.occurrenceKey as string) ?? ""))
      .map(record => ({ ...record, tokens: sortedTokens(record.tokens) }));
  return { native: normalize("native"), bioc: normalize("bioc") };
}

export const overridesDigestOf = (overrides: Rec): string => H(normalizeOverrides(overrides));
export const diStylesDigestOf = (diStyles: Rec): string => H(normalizeDiStyles(diStyles));

export function digestsOf(profileDocument: Rec, metricsPins: readonly { id: string; sha256: string }[]): PresentationDigests {
  const pins = [...metricsPins].sort((a, b) => byText(a.id, b.id));
  const themes = asArray(profileDocument.themes) ?? [];
  const cache = new Map<string, string>();
  const themeDigest = (themeId: string): string => {
    const cached = cache.get(themeId);
    if (cached) return cached;
    const chain: unknown[] = [];
    for (let id: string | undefined = themeId; id !== undefined;) {
      const theme = themes.map(item => asRecord(item)).find(item => item?.id === id);
      if (!theme) break;
      chain.unshift(clone(theme));
      id = typeof theme.fallback === "string" ? (theme.fallback as string) : undefined;
    }
    const digest = H({ themeId, themes: chain });
    cache.set(themeId, digest);
    return digest;
  };
  return {
    themeDigest,
    overridesDigest: H(EMPTY_OVERRIDES),
    diStylesDigest: H(EMPTY_STYLES),
    metricsDigest: H(pins.map(pin => ({ id: pin.id, sha256: pin.sha256 }))),
  };
}

export const viewRevisionOf = (semanticRevisionValue: string, layout: unknown, themeId: string, digests: PresentationDigests): string =>
  H({ semanticRevision: semanticRevisionValue, layoutDigest: H(layout), themeId, themeDigest: digests.themeDigest(themeId),
    overridesDigest: digests.overridesDigest, diStylesDigest: digests.diStylesDigest, metricsDigest: digests.metricsDigest });

// ---------------------------------------------------------------- Layout/1 helpers
export interface GeometryRecord extends Rec { pageId: string; occurrenceKey: string }
export const pairKey = (pageId: string, occurrenceKey: string): string => `${pageId}\u0000${occurrenceKey}`;

export function sortGeometry(pages: readonly Rec[], geometry: GeometryRecord[]): GeometryRecord[] {
  const order = new Map(pages.map(p => [p.pageId as string, p.order as number]));
  const utf16 = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return [...geometry].sort((a, b) =>
    ((order.get(a.pageId) ?? -1) - (order.get(b.pageId) ?? -1)) || utf16(a.occurrenceKey, b.occurrenceKey));
}

/** Remove every occurrence of the listed semantic ids on all pages. */
export function removeOccurrences(layout: Rec, ids: ReadonlySet<string>): Rec {
  const geometry = (asArray(layout.geometry) ?? []).filter(g => !ids.has((asRecord(g)?.semanticId as string | undefined) ?? ""));
  return { ...clone(layout), geometry };
}
