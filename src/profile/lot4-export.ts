// Lot-4 target exporters: the export ID plan, the export IR mapping with
// the recipe, capability and loss contract, the preparation refusals and
// the serializer and BPMN column writers.
import { canonicalDigest, ProfileContractError } from "./canonical.js";
import { sha256 } from "./sha256.js";
import { failContract, MISSING, nativeIndex } from "./native-contracts.js";
import type { DescriptorIndex } from "./native-contracts.js";
import { evaluatePredicate, selectHandles } from "./compiler.js";
import type { EvalContext } from "./compiler.js";
import { compileLintPolicy } from "./lint-contracts.js";
import type { CompiledLintOptions } from "./lint-contracts.js";
import { createPinnedRegistry, runLintSync } from "./lint-bridge.js";
import type { ProfileSubfinding } from "./lint-bridge.js";
import { hydrate } from "../io/moddle-json.js";
import { serializeBpmn as writeBpmn } from "../io/serialize-bpmn.js";
import { buildReport } from "./report.js";
import { sortIdMap } from "./report.js";
import type { PureResult, Result } from "./results.js";
import { compareText, evaluateOccurrenceValue, lot4EvalContext, requireText, requireTrue, runOccurrenceSelect, testOccurrencePredicate } from "./lot4-query.js";
import { descriptorDigestOf, metricPinsOf, preorder, resolveTheme, resolveThemeId, themeChain, themeDigest, viewTuple } from "./lot4-render.js";
import { okResult, refusedResult, sortReportEntries } from "./lot4-result.js";
import { runLayout } from "./lot4-layout.js";
import { complete } from "./completion.js";
import { normalize } from "./normalize.js";

export interface Lot4ExportContext {
  readonly profile: Record<string, any>;
  readonly descriptors: DescriptorIndex;
  readonly notions: Map<string, { readonly recognition: unknown; readonly exclusiveGroup?: string; readonly facet?: boolean }>;
  readonly unicodeCase: unknown;
  readonly metricBytes: Map<string, Uint8Array>;
  /** The public-compiled profile handle for this document's profile,
   * supplied directly or on the call input. The handle is required: without
   * a valid handle, standalone preparation refuses explicitly and never
   * returns a successful artifact. */
  readonly compiled?: unknown;
  readonly registry: {
    readonly lintConfigs: Record<string, unknown>;
    readonly lintAllowlist: readonly string[];
    readonly requiredStandardRules: readonly string[];
    readonly compilerRuleTable: unknown;
    readonly capabilities: readonly string[];
    readonly signatures: Record<string, unknown>;
    readonly descriptors: unknown;
  };
}

const H = (value: unknown): string => canonicalDigest(value);

const valueOf = <T>(result: PureResult<T>): T => result.status === "ok" ? result.payload : failContract(result.code);

const refusedSeam = (code: string): PureResult<never> =>
  ({ status: "refused", code, diagnostics: [] }) as PureResult<never>;

const DOMAINS = ["page", "node", "edge", "label"];
const keyString = (key: { pageId: string; occurrenceKey?: string; domain: string }): string =>
  `${key.pageId} ${key.occurrenceKey ?? ""} ${key.domain}`;

// ---------------------------------------------------------------- exportIdPlan

// exportIdPlan seam: the per-adapter output ID table over explicit requests.
export function exportIdPlan(input: unknown): PureResult<{ readonly ids: readonly { pageId: string; occurrenceKey?: string; domain: string; id: string }[] }> {
  try {
    const plan = input as {
      readonly policy?: unknown; readonly counterOrigin?: unknown;
      readonly pages?: { readonly pageId: string; readonly order: number }[];
      readonly requests?: { readonly pageId?: unknown; readonly occurrenceKey?: unknown; readonly domain?: unknown; readonly semanticId?: unknown }[];
    };
    if (!plan || typeof plan !== "object") failContract("export-id-ambiguous");
    const policy = plan.policy;
    if (policy !== "counter" && policy !== "native" && policy !== "digest") failContract("export-id-ambiguous");
    const requests = (plan.requests ?? []).map(request => {
      requireTrue(!!request && typeof request === "object", "export-id-ambiguous");
      const pageId = requireText(request.pageId, "export-id-ambiguous");
      const domain = requireText(request.domain, "export-id-ambiguous");
      requireTrue(DOMAINS.includes(domain), "export-id-ambiguous");
      const occurrenceKey = domain === "page" ? "" : requireText(request.occurrenceKey, "export-id-ambiguous");
      const semanticIn: unknown = request.semanticId;
      return {
        pageId, occurrenceKey,
        domain,
        ...(semanticIn === undefined ? {} : { semanticId: semanticIn }),
      };
    });
    if (policy === "counter") {
      const origin = plan.counterOrigin;
      requireTrue(typeof origin === "number" && Number.isSafeInteger(origin), "export-id-ambiguous");
      const order = new Map((plan.pages ?? []).map(p => [p.pageId, p.order]));
      const unique: typeof requests = [];
      for (const key of requests) {
        if (!unique.some(k => keyString(k) === keyString(key))) unique.push(key);
      }
      unique.sort((a, b) => DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain)
        || (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0) || compareText(a.occurrenceKey, b.occurrenceKey));
      return {
        status: "ok",
        payload: {
          ids: unique.map((key, index) => ({
            pageId: key.pageId,
            occurrenceKey: key.occurrenceKey,
            domain: key.domain,
            id: `e_${origin + index}`,
          })),
        },
        diagnostics: [],
      };
    }
    if (policy === "digest") {
      return {
        status: "ok",
        payload: {
          ids: requests.map(key => ({
            pageId: key.pageId,
            occurrenceKey: key.occurrenceKey,
            domain: key.domain,
            id: `e_${H([key.pageId, key.occurrenceKey, key.domain])}`,
          })),
        },
        diagnostics: [],
      };
    }
    const ids: { pageId: string; occurrenceKey?: string; domain: string; id: string }[] = [];
    const used = new Map<string, string>();
    for (const key of requests) {
      const text = keyString(key);
      if (ids.some(row => keyString(row) === text)) continue;
      let id: string;
      if (key.domain === "page") id = key.pageId;
      else {
        const semanticId: unknown = key.semanticId;
        requireTrue(typeof semanticId === "string" && semanticId !== "", "export-id-ambiguous");
        id = semanticId;
      }
      if (used.has(id) && used.get(id) !== text) failContract("export-id-ambiguous");
      used.set(id, text);
      ids.push({
        pageId: key.pageId,
        occurrenceKey: key.occurrenceKey,
        domain: key.domain, id,
      });
    }
    return { status: "ok", payload: { ids }, diagnostics: [] };
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refusedSeam(code);
  }
}

// ---------------------------------------------------------------- mapExport

interface OccurrenceRecord {
  readonly pageId: string; readonly occurrenceKey: string; readonly semanticId?: string;
  readonly role?: string; readonly emittedType?: string; readonly glyphId?: string;
  readonly bounds?: unknown; readonly label?: { readonly text: string; readonly bounds: unknown; readonly lines: readonly string[] };
  readonly sourceOccurrence?: { readonly pageId: string; readonly occurrenceKey: string };
  readonly targetOccurrence?: { readonly pageId: string; readonly occurrenceKey: string };
  readonly waypoints?: readonly unknown[];
  readonly style?: readonly unknown[];
  [key: string]: unknown;
}

interface MapScope {
  readonly occurrences: readonly OccurrenceRecord[];
  readonly pages: readonly { readonly pageId: string; readonly name: string; readonly order: number;[key: string]: unknown }[];
  readonly elements: Map<string, any>;
  readonly pointers: Map<object, string>;
  readonly notions: Map<string, { readonly recognition: unknown; readonly exclusiveGroup?: string; readonly facet?: boolean }>;
  readonly evalBase: EvalContext;
}

const childrenOf = (element: any, property: string): any[] => {
  const value = element?.[property];
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter(item => item && typeof item === "object");
};

const scopeOf = (ctx: Lot4ExportContext, envelope: any, render: any): MapScope => {
  const pointers = new Map<object, string>();
  const elements = new Map<string, any>();
  const visit = (node: any, pointer: string): void => {
    if (!node || typeof node !== "object") return;
    pointers.set(node, pointer);
    if (typeof node.id === "string" && !elements.has(node.id)) elements.set(node.id, node);
    for (const key of Object.keys(node).sort()) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach((c, i) => { if (c && typeof c === "object" && typeof c.$type === "string") visit(c, `${pointer}/${key}/${i}`); });
      else if (value && typeof value === "object" && typeof value.$type === "string") visit(value, `${pointer}/${key}`);
    }
  };
  visit(envelope.tree, "");
  const supportBindings = (envelope.bindings as any[]).map(b => ({ ownerId: b.ownerId, role: b.role, targetId: b.targetId }));
  return {
    occurrences: render.occurrences as OccurrenceRecord[],
    pages: render.pages as MapScope["pages"],
    elements, pointers,
    notions: ctx.notions,
    evalBase: lot4EvalContext(ctx, envelope.tree, { node: envelope.tree, pointer: "" }, supportBindings),
  };
};

const occurrenceScope = (scope: MapScope, self: unknown, bound: Record<string, unknown>, selfPageId?: string): Parameters<typeof testOccurrencePredicate>[1] => ({
  occurrences: scope.occurrences as { pageId: string; occurrenceKey: string;[key: string]: unknown }[],
  pages: scope.pages,
  semanticOf: occurrence => {
    const id = (occurrence as OccurrenceRecord).semanticId;
    return id === undefined ? undefined : scope.elements.get(id);
  },
  childrenOf,
  ...(selfPageId === undefined ? {} : { selfPageId }),
  evalBase: scope.evalBase,
  bound: { ...bound, self },
});

const isMissing = (value: unknown): boolean => value === (MISSING as unknown);

const readTarget = (value: unknown): unknown => (isMissing(value) ? undefined : value);

// Capability classes of one occurrence: the worst matching record wins,
// engine-byte-compatible (verified exact bytes) below structural (shape
// preserved) below unsupported (refused).
const CAPABILITY_RANK = ["engine-byte-compatible", "structural", "unsupported"];
const capabilityOf = (scope: MapScope, capabilities: any[], occurrence: OccurrenceRecord): { rank: number; losses: string[] } => {
  let rank = 0;
  const losses: string[] = [];
  for (const capability of capabilities) {
    if (!testOccurrencePredicate(capability.when, occurrenceScope(scope, occurrence, {}))) continue;
    rank = Math.max(rank, CAPABILITY_RANK.indexOf(capability.class));
    for (const loss of capability.losses ?? []) losses.push(loss);
  }
  return { rank, losses };
};

const pointerOf = (scope: MapScope, element: any): string => {
  const pointer = scope.pointers.get(element);
  if (pointer === undefined) failContract("export-field-invalid");
  return pointer as string;
};

const semanticSource = (scope: MapScope, occurrence: OccurrenceRecord): { domain: string; pointer: string | null; targetId: string | null; provenance: string } => {
  if (occurrence.semanticId === undefined) return { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };
  const element = scope.elements.get(occurrence.semanticId);
  if (!element) return { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };
  return { domain: "tree", pointer: pointerOf(scope, element), targetId: occurrence.semanticId, provenance: "exact" };
};

interface Emission {
  readonly recipe: string;
  readonly kind: "page" | "node" | "edge" | "label" | "metadata" | "loss";
  readonly self: unknown;
  readonly selfPageId: string;
  readonly bound: Record<string, unknown>;
  readonly fields?: { readonly name: string; readonly value: unknown }[];
  readonly parentAst?: unknown;
  readonly lossClass?: string;
  readonly lossAfter?: { readonly lossClass: string };
  readonly refs?: { readonly source: unknown; readonly target: unknown };
}

// mapExport: envelope plus layout plus render plus a declared export format
// to the closed export IR with its capability and loss contract.
export function mapExport(ctx: Lot4ExportContext, input: {
  readonly envelope: any; readonly layout: unknown; readonly render: any; readonly format: string;
}): Result<unknown> {
  const envelope = input.envelope;
  const identity = envelope.profileIdentity;
  const revision = envelope.semanticRevision;
  const refused = (code: string): Result<unknown> => refusedResult("mapExport", code, { identity, revision });
  try {
    const spec = (ctx.profile.exports as any[]).find(e => e.format === input.format);
    if (!spec) return refused("export-format-unsupported");
    if (input.format !== "drawio" && input.format !== "sparx") return refused("export-format-unsupported");
    const render = input.render;
    const layout = input.layout as { pages: any[]; geometry: any[] };
    const binding = render.binding;
    const themeId = resolveThemeId(ctx.profile.themes as any[], binding.themeId);
    if (themeId === undefined || themeId !== binding.themeId) return refused("render-stale");
    const chain = themeChain(ctx.profile.themes as any[], themeId);
    if (!chain) return refused("render-stale");
    if (identity.sha256 !== H(ctx.profile)) {
      return refusedResult("mapExport", "profile-digest-mismatch", { identity, revision });
    }
    const problems: string[] = [];
    if (binding.semanticRevision !== H({ tree: envelope.tree, profileIdentity: identity, bindings: sortedEnvelopeBindings(envelope.bindings) })) problems.push("semanticRevision");
    if (binding.profileDigest !== H(ctx.profile)) problems.push("profileDigest");
    if (binding.descriptorDigest !== descriptorDigestOf(identity.descriptors)) problems.push("descriptorDigest");
    if (binding.layoutDigest !== H(layout)) problems.push("layoutDigest");
    try {
      if (binding.themeDigest !== themeDigest(ctx.profile.themes as any[], themeId)) problems.push("themeDigest");
    } catch { problems.push("themeDigest"); }
    try {
      if (binding.metricsDigest !== H(metricPinsOf(chain, ctx.metricBytes))) problems.push("metricsDigest");
    } catch { problems.push("metricsDigest"); }
    if (binding.payloadDigest !== H({ pages: render.pages, occurrences: render.occurrences, coverage: render.coverage, diagnostics: render.diagnostics })) {
      problems.push("payloadDigest");
    }
    if (canonicalDigest(render.pages) !== canonicalDigest(layout.pages)) problems.push("pages");
    if (!occurrencesMatchLayout(layout, render)) problems.push("occurrences");
    if (problems.length) return refused("render-stale");
    const scope = scopeOf(ctx, envelope, render);
    for (const record of render.coverage ?? []) {
      if ((record as { disposition?: unknown }).disposition === "unsupported") return refused("render-unsupported");
    }
    for (const occurrence of scope.occurrences) {
      if (capabilityOf(scope, spec.capabilities ?? [], occurrence).rank >= 2) return refused("render-unsupported");
    }
    const emissions = interpretRecipes(ctx, scope, spec);
    if (emissions.refused) return refused(emissions.refused);
    const keys = collectKeys(emissions.list);
    let ids: Map<string, string>;
    if (spec.idPolicy === "counter") ids = planCounterIds(keys, scope.pages, spec.counterOrigin);
    else if (spec.idPolicy === "digest") ids = new Map(keys.map(k => [keyString(k), `e_${H([k.pageId, k.occurrenceKey, k.domain])}`]));
    else {
      const planned = planNativeIds(keys, scope);
      if (planned.refused) return refused(planned.refused);
      ids = planned.ids as Map<string, string>;
    }
    const assembled = assembleRecords(scope, spec, emissions.list, ids);
    if (assembled.refused) return refused(assembled.refused);
    const viewRevision = H(viewTuple(binding));
    const reportEntries = sortReportEntries(assembled.entries);
    const idMap = sortIdMap(assembled.idMap);
    const prepared = {
      format: spec.format, profileIdentity: identity, semanticRevision: revision, viewRevision,
      ir: assembled.ir, renderBinding: binding, report: undefined as unknown, capability: "structural", idMap,
    };
    const artifacts = [{ format: spec.format, capability: "structural", digest: H(assembled.ir), entryIndexes: reportEntries.map((_, i) => i) }];
    const full = {
      ...prepared,
      report: buildReport("mapExport", {
        sourceIdentity: identity as any, targetIdentity: identity as any,
        inputRevision: revision, outputRevision: revision,
        entries: reportEntries as any[], idMap: idMap as any[], artifacts: artifacts as any[],
      }),
    };
    return okResult("mapExport", {
      identity, revision,
      entries: reportEntries, idMap, artifacts,
      payload: full,
    });
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refusedResult("mapExport", code, { identity, revision });
  }
}

const sortedEnvelopeBindings = (bindings: any[]): any[] =>
  [...bindings].sort((a, b) => compareText(a.ownerId, b.ownerId) || compareText(a.role, b.role) || compareText(a.targetId, b.targetId));

// Every render occurrence replays a layout geometry record exactly, apart
// from the emitted type, style and glyph carried only by the occurrence.
// Geometry without an occurrence (an uncovered record) is not a mismatch.
const occurrencesMatchLayout = (layout: { pages: any[]; geometry: any[] }, render: any): boolean => {
  for (const item of render.occurrences as any[]) {
    const { emittedType: _emittedType, style: _style, glyphId: _glyphId, ...rest } = item;
    const record = (layout.geometry as any[]).find(x => x.pageId === item.pageId && x.occurrenceKey === item.occurrenceKey);
    if (!record || canonicalDigest(record) !== canonicalDigest(rest)) return false;
  }
  return true;
};

const keyOfPage = (pageId: string): { pageId: string; occurrenceKey: string; domain: string } => ({ pageId, occurrenceKey: "", domain: "page" });
const keyOfOccurrence = (pageId: string, occurrenceKey: string, domain: string): { pageId: string; occurrenceKey: string; domain: string } => ({ pageId, occurrenceKey, domain });

const sortByPageOccurrence = <T extends { pageId: string; occurrenceKey: string }>(items: T[], pages: readonly { pageId: string; order: number }[]): T[] => {
  const order = new Map(pages.map(p => [p.pageId, p.order]));
  return [...items].sort((a, b) => (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0) || compareText(a.occurrenceKey, b.occurrenceKey));
};

// Run the export recipes of one spec: selects, binds, emits, losses and the
// refusal action. Output IDs stay unresolved until the ID plan exists.
function interpretRecipes(ctx: Lot4ExportContext, scope: MapScope, spec: any): { readonly refused?: string; readonly list: Emission[] } {
  void ctx;
  const list: Emission[] = [];
  const recipes = new Map((ctx.profile.recipes as any[]).filter(r => r.phase === "export").map(r => [r.id, r]));
  for (const recipeId of spec.recipes as string[]) {
    const recipe = recipes.get(recipeId);
    if (!recipe) failContract("export-format-unsupported");
    const matched = runOccurrenceSelect(recipe.select, occurrenceScope(scope, undefined, {}, undefined));
    const pageLike = (item: unknown): item is { pageId: string; occurrenceKey: string } => {
      const record = item as { pageId?: unknown; occurrenceKey?: unknown };
      return typeof record?.pageId === "string" && typeof record?.occurrenceKey === "string";
    };
    const ordered = (recipe.select?.via === "pages")
      ? [...matched].sort((a: any, b: any) => scope.pages.findIndex(p => p.pageId === (a as any).pageId) - scope.pages.findIndex(p => p.pageId === (b as any).pageId))
      : matched.every(pageLike) ? sortByPageOccurrence(matched as { pageId: string; occurrenceKey: string }[], scope.pages) as unknown[]
      : matched;
    for (const self of ordered) {
      const selfPageId = (self as { pageId: string }).pageId;
      const mark = list.length;
      const bound: Record<string, unknown> = {};
      for (const step of recipe.steps as any[]) {
        if (step.op === "bind") {
          const found = runOccurrenceSelect(step.select, occurrenceScope(scope, self, bound, selfPageId));
          if (step.cardinality === "one" && found.length !== 1) return { refused: "profile-ambiguous-binding", list };
          if ((step.cardinality === "first" || step.cardinality === "zeroOrOne") && found.length > 1) {
            return { refused: "profile-ambiguous-binding", list };
          }
          bound[step.as] = (step.cardinality === "one" ? found[0] : found[0] ?? MISSING) as unknown;
          continue;
        }
        if (step.op === "refuse") return { refused: step.code as string, list };
        if (step.op === "loss") {
          const target = step.target === "self" ? self : bound[step.target];
          if (target === undefined || target === MISSING) continue;
          // A self loss in an iteration that already emitted a record for
          // the same self attaches to that record (result = the record);
          // otherwise it stands alone with an unavailable result.
          if (target === self) {
            let attached = false;
            for (let i = list.length - 1; i >= mark; i--) {
              const prior = list[i] as Emission;
              if (prior.self !== self) break;
              if (prior.kind !== "loss" && !prior.lossAfter) {
                (list[i] as { lossAfter?: { lossClass: string } }).lossAfter = { lossClass: step.code as string };
                attached = true;
                break;
              }
            }
            if (attached) continue;
          }
          list.push({ recipe: recipeId, kind: "loss", self, selfPageId, bound: { ...bound }, lossClass: step.code, refs: { source: self, target } });
          continue;
        }
        if (step.op === "emit") {
          list.push({
            recipe: recipeId, kind: step.kind, self, selfPageId, bound: { ...bound },
            fields: step.fields as { name: string; value: unknown }[],
            ...(step.parent === undefined ? {} : { parentAst: step.parent }),
          });
          continue;
        }
        failContract("export-format-unsupported");
      }
    }
  }
  return { list };
}

const collectKeys = (emissions: Emission[]): { pageId: string; occurrenceKey: string; domain: string }[] => {
  const keys: { pageId: string; occurrenceKey: string; domain: string }[] = [];
  const add = (key: { pageId: string; occurrenceKey: string; domain: string }): void => {
    if (!keys.some(k => keyString(k) === keyString(key))) keys.push(key);
  };
  const addItem = (item: unknown, domain: string): void => {
    if (!item || typeof item !== "object" || isMissing(item)) return;
    const record = item as { pageId?: unknown; occurrenceKey?: unknown };
    if (typeof record.pageId !== "string") return;
    if (record.occurrenceKey === undefined) add(keyOfPage(record.pageId));
    else if (typeof record.occurrenceKey === "string") add(keyOfOccurrence(record.pageId, record.occurrenceKey, domain));
  };
  for (const emission of emissions) {
    if (emission.kind === "loss" || emission.kind === "metadata") continue;
    const self = emission.self as any;
    const idDomain = (emission.fields?.find(f => f.name === "id")?.value as any)?.domain ?? emission.kind;
    if (emission.kind === "page") add(keyOfPage(self.pageId));
    else add(keyOfOccurrence(self.pageId, self.occurrenceKey, idDomain));
    if (emission.kind === "edge") {
      for (const name of ["source", "target"]) {
        const field = emission.fields?.find(f => f.name === name)?.value as any;
        if (field?.op === "outputId") {
          const item = field.binding === "self" ? self : emission.bound[field.binding];
          addItem(item, "node");
        }
      }
    }
    const parentValue = emission.parentAst as any;
    if (parentValue?.op === "outputId") {
      const item = parentValue.binding === "self" ? self : emission.bound[parentValue.binding];
      addItem(item, parentValue.domain);
    }
  }
  return keys;
};

const planCounterIds = (keys: { pageId: string; occurrenceKey: string; domain: string }[], pages: readonly { pageId: string; order: number }[], origin: number): Map<string, string> => {
  if (typeof origin !== "number" || !Number.isSafeInteger(origin)) failContract("export-id-ambiguous");
  const unique: typeof keys = [];
  for (const key of keys) if (!unique.some(k => keyString(k) === keyString(key))) unique.push(key);
  unique.sort((a, b) => DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain)
    || (pages.find(p => p.pageId === a.pageId)?.order ?? 0) - (pages.find(p => p.pageId === b.pageId)?.order ?? 0)
    || compareText(a.occurrenceKey, b.occurrenceKey));
  return new Map(unique.map((key, index) => [keyString(key), `e_${origin + index}`]));
};

const planNativeIds = (keys: { pageId: string; occurrenceKey: string; domain: string }[], scope: MapScope): { readonly refused?: string; readonly ids?: Map<string, string> } => {
  const ids = new Map<string, string>(), used = new Map<string, string>();
  for (const key of keys) {
    const text = keyString(key);
    if (ids.has(text)) continue;
    let id: string;
    if (key.domain === "page") id = key.pageId;
    else {
      const occurrence = scope.occurrences.find(o => o.pageId === key.pageId && o.occurrenceKey === key.occurrenceKey);
      if (!occurrence || occurrence.semanticId === undefined) return { refused: "export-id-ambiguous" };
      id = occurrence.semanticId;
    }
    if (used.has(id) && used.get(id) !== text) return { refused: "export-id-ambiguous" };
    used.set(id, text);
    ids.set(text, id);
  }
  return { ids };
};

// Resolve an outputId value AST against the ID plan.
const resolveOutputIdTarget = (scope: MapScope, ids: Map<string, string>, value: any, selfPageId: string, emission: Emission): string => {
  const item = value.binding === "self" ? emission.self : emission.bound[value.binding];
  if (item === undefined || isMissing(item)) failContract("export-field-invalid");
  const record = item as { pageId?: unknown; occurrenceKey?: unknown; id?: unknown };
  const key = ((): { pageId: string; occurrenceKey: string; domain: string } => {
    if (typeof record.pageId === "string" && record.occurrenceKey === undefined) {
      return keyOfPage(record.pageId);
    }
    if (typeof record.pageId === "string" && typeof record.occurrenceKey === "string") {
      return keyOfOccurrence(record.pageId, record.occurrenceKey, value.domain);
    }
    if (typeof record.id === "string") {
      const candidates = scope.occurrences.filter(o => o.semanticId === record.id && o.pageId === selfPageId);
      if (candidates.length !== 1) failContract("export-occurrence-ambiguous");
      const found = candidates[0] as OccurrenceRecord;
      return keyOfOccurrence(found.pageId, found.occurrenceKey, value.domain);
    }
    return failContract("export-field-invalid");
  })();
  const id = ids.get(keyString(key));
  requireTrue(id !== undefined, "profile-ambiguous-binding");
  return id;
};

// Assemble the closed IR, idMap and entries from interpreted emissions.
function assembleRecords(scope: MapScope, spec: any, emissions: Emission[], ids: Map<string, string>): {
  readonly refused?: string; readonly ir: any[]; readonly idMap: any[]; readonly entries: any[];
} {
  const ir: any[] = [], idMap: any[] = [], entries: any[] = [];
  const emitted = new Map<string, string>();
  const unavailable = { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };
  const lossEntry = (occurrence: OccurrenceRecord, lossClass: string, ruleId: string, result: unknown, source?: unknown): unknown => ({
    code: `export-loss/${lossClass}`, severity: "warn", classification: "loss", stage: "export", ruleId,
    messageKey: `export.loss.${lossClass}`, disposition: "mapped",
    source: source ?? semanticSource(scope, occurrence), result,
    beforePresent: false, afterPresent: false,
    ...(occurrence.pageId !== undefined ? { pageId: occurrence.pageId } : {}),
    ...(occurrence.occurrenceKey !== undefined ? { occurrenceKey: occurrence.occurrenceKey } : {}),
    ...(occurrence.emittedType !== undefined ? { emittedType: occurrence.emittedType } : {}),
    lossClass,
  });
  const plannedIds = new Set(ids.values());
  for (const emission of emissions) {
    if (emission.kind === "loss") {
      const occurrence = emission.self as OccurrenceRecord;
      const target = (emission.refs as { target: unknown }).target as any;
      const element = target && typeof target === "object" && typeof (target as any).$type === "string" ? target : undefined;
      const source = element
        ? { domain: "tree", pointer: pointerOf(scope, element), targetId: typeof element.id === "string" ? element.id : occurrence.semanticId ?? null, provenance: "exact" }
        : semanticSource(scope, occurrence);
      entries.push(lossEntry(occurrence, emission.lossClass as string, emission.recipe, unavailable, source));
      continue;
    }
    const self = emission.self as any;
    const selfPageId: string = emission.selfPageId;
    const fieldValue = (name: string): unknown => {
      const field = emission.fields?.find(f => f.name === name)?.value as any;
      if (!field) return MISSING;
      if (field.op === "outputId") return resolveOutputIdTarget(scope, ids, field, selfPageId, emission);
      const value = readTarget(evaluateOccurrenceValue(field, occurrenceScope(scope, self, emission.bound, selfPageId)));
      return value === undefined ? MISSING : value;
    };
    const hasIdField = emission.fields?.some(f => f.name === "id") === true;
    let id: string | undefined;
    if (hasIdField) {
      const explicit = fieldValue("id");
      if (explicit === MISSING || typeof explicit !== "string") return { refused: "export-field-invalid", ir, idMap, entries };
      id = explicit;
    } else if (emission.kind === "page") {
      id = ids.get(keyString(keyOfPage(selfPageId)));
      if (id === undefined) return { refused: "profile-ambiguous-binding", ir, idMap, entries };
    } else if (emission.kind === "node" || emission.kind === "edge" || emission.kind === "label") {
      const occurrence = self as OccurrenceRecord;
      id = ids.get(keyString(keyOfOccurrence(selfPageId, occurrence.occurrenceKey, emission.kind)));
      if (id === undefined) return { refused: "profile-ambiguous-binding", ir, idMap, entries };
    }
    if (id !== undefined && emitted.has(id)) return { refused: "export-parent-invalid", ir, idMap, entries };
    let record: any;
    if (emission.kind === "page") {
      const name = fieldValue("name");
      if (name === MISSING) return { refused: "export-field-invalid", ir, idMap, entries };
      record = { kind: "page", id, name, bounds: self.bounds };
    } else if (emission.kind === "node" || emission.kind === "edge" || emission.kind === "label") {
      const occurrence = self as OccurrenceRecord;
      let parent: unknown;
      if (emission.parentAst !== undefined) {
        const parentValue = emission.parentAst as any;
        parent = parentValue.op === "outputId"
          ? resolveOutputIdTarget(scope, ids, parentValue, selfPageId, emission)
          : readTarget(evaluateOccurrenceValue(parentValue, occurrenceScope(scope, self, {}, selfPageId)));
      } else {
        parent = ids.get(keyString(keyOfPage(selfPageId)));
      }
      if (typeof parent !== "string") return { refused: "export-field-invalid", ir, idMap, entries };
      if (parent === id) return { refused: "export-parent-invalid", ir, idMap, entries };
      if (!plannedIds.has(parent)) return { refused: "export-parent-invalid", ir, idMap, entries };
      if (!emitted.has(parent)) return { refused: "export-parent-order", ir, idMap, entries };
      if (emitted.get(parent) !== "page" && emitted.get(parent) !== "node") {
        return { refused: "export-parent-invalid", ir, idMap, entries };
      }
      if (emission.kind === "node") {
        record = { kind: "node", id };
        const name = fieldValue("name");
        if (name !== MISSING) (record as any).name = name;
        Object.assign(record, { parent, bounds: occurrence.bounds, style: occurrence.style });
        if (occurrence.label) {
          if ((record as any).name === undefined) (record as any).name = occurrence.label.text;
          (record as any).label = { bounds: occurrence.label.bounds, lines: occurrence.label.lines };
        }
        for (const field of emission.fields ?? []) {
          if (["id", "name", "parent"].includes(field.name)) continue;
          const value = fieldValue(field.name);
          if (value !== MISSING) (record as any)[field.name] = value;
        }
      } else if (emission.kind === "edge") {
        const source = fieldValue("source"), target = fieldValue("target");
        if (source === MISSING || target === MISSING) return { refused: "export-field-invalid", ir, idMap, entries };
        if (!emitted.has(source as string) || !emitted.has(target as string)) {
          return { refused: "export-parent-order", ir, idMap, entries };
        }
        record = { kind: "edge", id, source, target };
        for (const field of emission.fields ?? []) {
          if (["id", "source", "target", "parent"].includes(field.name)) continue;
          const value = fieldValue(field.name);
          if (value !== MISSING) (record as any)[field.name] = value;
        }
        Object.assign(record, { parent, bounds: occurrence.bounds, waypoints: occurrence.waypoints, style: occurrence.style });
        if (occurrence.label) (record as any).label = { bounds: occurrence.label.bounds, lines: occurrence.label.lines };
      } else {
        const text = fieldValue("text");
        if (text === MISSING) return { refused: "export-field-invalid", ir, idMap, entries };
        if (!occurrence.label) return { refused: "export-field-invalid", ir, idMap, entries };
        record = {
          kind: "label", id, text, parent,
          bounds: occurrence.label.bounds, lines: occurrence.label.lines,
        };
      }
    } else {
      const name = fieldValue("name"), value = fieldValue("value");
      if (name === MISSING || value === MISSING) return { refused: "export-field-invalid", ir, idMap, entries };
      record = { kind: "metadata", name, value };
      if (emission.parentAst !== undefined) {
        const parentValue = emission.parentAst as any;
        const parent = parentValue.op === "outputId"
          ? resolveOutputIdTarget(scope, ids, parentValue, selfPageId, emission)
          : readTarget(evaluateOccurrenceValue(parentValue, occurrenceScope(scope, self, {}, selfPageId)));
        if (typeof parent === "string") (record as any).parent = parent;
      }
    }
    if (id !== undefined) emitted.set(id, emission.kind);
    ir.push(record);
    if (emission.lossAfter) {
      entries.push(lossEntry(self as OccurrenceRecord, emission.lossAfter.lossClass, emission.recipe, {
        domain: "artifact", pointer: `/ir/${ir.length - 1}`, targetId: id, provenance: "exact",
      }));
    }
    if (emission.kind === "page") {
      idMap.push({ sourceId: selfPageId, resultId: id, domain: "export", pageId: selfPageId });
    } else if ((self as OccurrenceRecord).semanticId !== undefined) {
      idMap.push({
        sourceId: (self as OccurrenceRecord).semanticId, resultId: id, domain: "export",
        pageId: selfPageId, occurrenceKey: (self as OccurrenceRecord).occurrenceKey,
      });
    }
  }
  // Capability-declared losses and adapter-declared metadata losses.
  for (const occurrence of scope.occurrences) {
    const { losses } = capabilityOf(scope, spec.capabilities ?? [], occurrence);
    for (const lossClass of losses) {
      entries.push(lossEntry(occurrence, lossClass, spec.id, unavailable));
    }
  }
  const writtenMetadata = new Set((spec.metadata ?? []) as string[]);
  let irIndex = -1;
  for (const emission of emissions) {
    if (emission.kind === "loss") continue;
    irIndex += 1;
    const record = ir[irIndex];
    if (record.kind !== "metadata" || writtenMetadata.has(record.name)) continue;
    const selfRef = metadataSelf(scope, emission);
    entries.push({
      code: "export-loss/metadata", severity: "warn", classification: "loss", stage: "export", ruleId: "adapter",
      messageKey: "export.loss.metadata", disposition: "mapped",
      source: selfRef.source, result: { domain: "artifact", pointer: `/ir/${irIndex}`, targetId: null, provenance: "exact" },
      beforePresent: false, afterPresent: false,
      ...(selfRef.pageId !== undefined ? { pageId: selfRef.pageId } : {}),
      lossClass: "metadata",
    });
  }
  return { ir, idMap, entries };
}

const metadataSelf = (scope: MapScope, emission: Emission): { readonly source: { domain: string; pointer: string | null; targetId: string | null; provenance: string }; readonly pageId?: string } => {
  const self = emission.self as any;
  if (self === scope.evalBase.tree) {
    return { source: { domain: "tree", pointer: "", targetId: typeof self?.id === "string" ? self.id : null, provenance: "exact" } };
  }
  if (typeof self?.pageId === "string" && self.occurrenceKey === undefined) {
    return { source: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" }, pageId: self.pageId };
  }
  const occurrence = self as OccurrenceRecord;
  return { source: semanticSource(scope, occurrence), ...(occurrence.pageId !== undefined ? { pageId: occurrence.pageId } : {}) };
};

// ---------------------------------------------------------------- prepareExport

const ADAPTER_FORMATS = ["drawio", "sparx"];

// prepareExport: the async staged preparation from a source envelope to a
// mapped export (DESIGN L803, L240: Promise<Result<PreparedArtifact>>).
// Options, compatibility and graph checks (C admission on the staged copy),
// then the real C, the pre-normalize accept stage, the N support gate, the
// real N, and the remaining accept lint stages in DESIGN order —
// post-normalize, layout, post-layout, release — then R and map. C and N run
// on the staged copy through the required compiled handle; the input
// envelope is never mutated. A stable input keeps the identical tree, so
// every lint stage evaluates that stable tree. Without a valid handle the
// C stage is skipped and the N gate refuses, so no handle-less run can
// succeed. Refusal returns the report accumulated so far, in stage order,
// and no artifact.
export async function prepareExport(ctx: Lot4ExportContext, input: { readonly envelope: any; readonly options: any; readonly compiled?: unknown }): Promise<Result<unknown>> {
  const envelope = input.envelope;
  const identity = envelope.profileIdentity;
  const revision = envelope.semanticRevision;
  const compiled = (input as { readonly compiled?: unknown }).compiled ?? ctx.compiled;
  const refusedWith = (code: string, entries: any[] = []): Result<unknown> =>
    refusedResult("prepareExport", code, { identity, revision, entries });
  const entriesOf = (result: { readonly report?: { readonly entries?: any[] }; readonly diagnostics?: readonly unknown[] }): any[] =>
    [...(result.report?.entries ?? [])] as any[];
  // The report accumulated so far stays visible to the catch below, so an
  // exceptional refusal (an unapplied repair) keeps it and the current-stage
  // findings instead of returning an empty report.
  const accumulated: any[] = [];
  try {
    const options = input.options;
    const spec = (ctx.profile.exports as any[]).find(e => e.format === options.format);
    if (!spec || !ADAPTER_FORMATS.includes(options.format)) return refusedWith("export-format-unsupported");
    const themeId = resolveThemeId(ctx.profile.themes as any[], options.themeId);
    if (themeId === undefined) return refusedWith("render-stale");
    if (H(ctx.profile) !== identity.sha256
      || identity.mechanismVersion !== ctx.profile.mechanismVersion
      || identity.schemaVersion !== ctx.profile.schemaVersion
      || identity.profile !== ctx.profile.profile
      || identity.version !== ctx.profile.version) {
      return refusedWith("profile-digest-mismatch");
    }
    const treeIds = new Set(preorder(envelope.tree).map(n => n.id));
    for (const binding of envelope.bindings as any[]) {
      if (!treeIds.has(binding.targetId) || !treeIds.has(binding.ownerId)) {
        throw new ProfileContractError("operation-error");
      }
    }
    if (envelope.executable !== undefined && envelope.executable?.isExecutable !== false) {
      throw new ProfileContractError("operation-error");
    }
    let staged = envelope;
    if (compiled !== undefined && compiled !== null) {
      const completed = await complete(compiled as never, structuredClone(envelope) as never, "retained", undefined);
      accumulated.push(...entriesOf(completed as never));
      if (completed.status !== "ok") {
        return refusedWith((completed as { readonly code?: string }).code ?? "operation-error", accumulated);
      }
      staged = (completed as { readonly payload: any }).payload;
    }
    const pre = runAcceptLintStage(ctx, staged, "pre-normalize");
    accumulated.push(...pre.entries);
    if (pre.refused) return refusedWith(pre.refused, accumulated);
    if (normalizeNeedsSupport(ctx, staged)) return refusedWith("profile-open", accumulated);
    if (compiled === undefined || compiled === null) {
      return refusedWith("profile-context-unknown", accumulated);
    }
    {
      const normalized = await normalize(compiled as never, structuredClone(staged) as never, "edit", undefined);
      accumulated.push(...entriesOf(normalized as never));
      if (normalized.status !== "ok") {
        return refusedWith((normalized as { readonly code?: string }).code ?? "operation-error", accumulated);
      }
      staged = (normalized as { readonly payload: { readonly envelope: any } }).payload.envelope;
    }
    const post = runAcceptLintStage(ctx, staged, "post-normalize");
    accumulated.push(...post.entries);
    if (post.refused) return refusedWith(post.refused, accumulated);
    const laid = runLayout({ profile: ctx.profile, descriptors: ctx.descriptors,
      notions: ctx.notions, unicodeCase: ctx.unicodeCase }, {
      envelope: staged, placements: ctx.profile.placements, baseGeometry: options.baseGeometry, themeId,
    });
    if (laid.status !== "ok") return refusedWith((laid as { readonly code?: string }).code ?? "operation-error", [...accumulated, ...entriesOf(laid as never)]);
    const layout = (laid as { readonly payload: unknown }).payload;
    const postLayout = runAcceptLintStage(ctx, staged, "post-layout");
    accumulated.push(...postLayout.entries);
    if (postLayout.refused) return refusedWith(postLayout.refused, accumulated);
    const release = runAcceptLintStage(ctx, staged, "release");
    accumulated.push(...release.entries);
    if (release.refused) return refusedWith(release.refused, accumulated);
    const rendered = resolveTheme(ctx, {
      envelope: staged, layout, themeId,
      overrides: options.overrides ?? { semantic: [], occurrence: [] },
      diStyles: options.diStyles ?? { native: [], bioc: [] },
    });
    if (rendered.status !== "ok") {
      return refusedWith((rendered as { readonly code?: string }).code ?? "operation-error", [...accumulated, ...entriesOf(rendered as never)]);
    }
    const mapped = mapExport(ctx, { envelope: staged, layout, render: (rendered as { readonly payload: unknown }).payload, format: options.format });
    if (mapped.status !== "ok") {
      return refusedWith((mapped as { readonly code?: string }).code ?? "operation-error", [...accumulated, ...entriesOf(mapped as never)]);
    }
    const prepared = (mapped as { readonly payload: any }).payload;
    const mappedEntries = prepared.report.entries as any[];
    const entries = sortReportEntries([...accumulated, ...mappedEntries]);
    const idMap = prepared.idMap as any[];
    const position = new Map<any, number>();
    entries.forEach((entry, index) => {
      if (!position.has(entry)) position.set(entry, index);
    });
    const artifacts = (prepared.report.artifacts as any[]).map(artifact => ({
      ...structuredClone(artifact),
      entryIndexes: ((artifact.entryIndexes ?? []) as number[]).map(i => position.get(mappedEntries[i]!) ?? -1),
    }));
    const stagedRevision = (staged as { readonly semanticRevision?: string }).semanticRevision ?? revision;
    const report = buildReport("prepareExport", {
      sourceIdentity: identity as any, targetIdentity: identity as any,
      inputRevision: revision, outputRevision: stagedRevision,
      entries: entries as any[], idMap: idMap as any[], artifacts: artifacts as any[],
    });
    return okResult("prepareExport", {
      identity, revision: stagedRevision, baseRevision: revision,
      entries, idMap, artifacts,
      payload: { ...prepared, report },
    });
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    const carried = error instanceof ProfileContractError
      ? (error as { readonly entries?: readonly any[] }).entries ?? []
      : [];
    return refusedResult("prepareExport", code, { identity, revision, entries: [...accumulated, ...carried] });
  }
}

// The normalize support gate (C13, H2 OPEN-RESERVED-N): a normalize
// ensure or place step whose owner/region support binding the envelope
// lacks would create support under edit activation, so preparation
// refuses profile-open instead of inventing it. Selection and binding
// reuse the shared selector; anything the gate cannot resolve is not
// gate evidence.
function normalizeNeedsSupport(ctx: Lot4ExportContext, envelope: any): boolean {
  const support = new Set((envelope.bindings as any[]).map(b => `${(b as any).ownerId} ${(b as any).role}`));
  const tree = envelope.tree;
  const supportBindings = (envelope.bindings as any[]).map(b => ({ ownerId: b.ownerId, role: b.role, targetId: b.targetId }));
  const rootBase = lot4EvalContext(ctx, tree, { node: tree, pointer: "" }, supportBindings);
  const baseCtx: EvalContext = { ...rootBase, bindings: { root: { node: tree, pointer: "" } } };
  for (const recipe of (ctx.profile.recipes as any[]) ?? []) {
    if (recipe.phase !== "normalize" || !Array.isArray(recipe.steps)) continue;
    let selves: readonly unknown[];
    try {
      selves = valueOf(selectHandles(recipe.select, baseCtx)) as readonly unknown[];
    } catch { continue; }
    for (const self of selves) {
      const handle = self as { node: any; pointer: string };
      if (!handle || typeof handle !== "object" || !handle.node || typeof handle.node !== "object") continue;
      const bound: Record<string, { node: any; pointer: string }> = { self: handle };
      for (const step of recipe.steps) {
        if (step.op === "bind") {
          try {
            const found = valueOf(selectHandles(step.select, {
              ...baseCtx, bindings: { ...baseCtx.bindings, ...bound },
            })) as readonly unknown[];
            if (found.length === 1) bound[step.as] = found[0] as { node: any; pointer: string };
          } catch { /* unresolvable bind: not gate evidence */ }
        } else if (step.op === "ensure" && typeof step.role === "string") {
          const owner = step.owner === "self" ? handle : bound[step.owner];
          const ownerId = (owner as { node?: any } | undefined)?.node?.id;
          if (typeof ownerId === "string" && !support.has(`${ownerId} ${step.role}`)) return true;
        } else if (step.op === "place" && typeof step.region === "string") {
          const owner = bound[step.owner];
          const ownerId = (owner as { node?: any } | undefined)?.node?.id;
          if (typeof ownerId === "string" && !support.has(`${ownerId} ${step.region}`)) return true;
        }
      }
    }
  }
  return false;
}

// One accept lint stage over the shared lint runner: the profile runs with
// the selected stage accept table, base findings plus profile subrules
// unified in report order. A repairable finding continues only with a
// declared repair recipe that selects its target; applying a repair stays
// a lot-3 transaction.
function runAcceptLintStage(ctx: Lot4ExportContext, envelope: any, phase: "pre-normalize" | "post-normalize" | "post-layout" | "release"): { readonly refused?: string; readonly entries: any[] } {
  const adapted = structuredClone(ctx.profile);
  const inherited = createPinnedRegistry({ configs: ctx.registry.lintConfigs as never }).flatten(["bpmnlint:recommended"], {});
  const policy = compileLintPolicy(adapted as never, { phase, readinessPolicy: "accept" }, inherited, ctx.registry.requiredStandardRules, envelope.bindings);
  const policies: Record<string, { severity: unknown; classification: "integrity" | "readiness" | "repairable" | "advisory" }> = Object.create(null);
  for (const setting of policy.settings as any[]) {
    policies[setting.rule] = { severity: setting.severity, classification: setting.classification ?? "integrity" };
  }
  const supportBindings = (envelope.bindings as any[]).map(b => ({ ownerId: b.ownerId, role: b.role, targetId: b.targetId }));
  const rootBase = lot4EvalContext(ctx, envelope.tree, { node: envelope.tree, pointer: "" }, supportBindings);
  const evalContext: EvalContext = {
    ...rootBase, bindings: { root: { node: envelope.tree, pointer: "" } },
  };
  const evaluator = (options: CompiledLintOptions): readonly ProfileSubfinding[] => {
    const findings: ProfileSubfinding[] = [];
    const index = nativeIndex(envelope.tree, ctx.descriptors);
    for (const rule of (options.compiledRules ?? []) as any[]) {
      for (const self of valueOf(selectHandles(rule.select, evalContext))) {
        if (!valueOf(evaluatePredicate(rule.assert, { ...evalContext, bindings: { ...evalContext.bindings, self } }))) {
          const ancestor = index.entries
            .filter(e => typeof e.node.id === "string" && (self.pointer === e.pointer || self.pointer.startsWith(`${e.pointer}/`)))
            .sort((a, b) => b.pointer.length - a.pointer.length)[0];
          findings.push({
            profileRuleId: rule.id, code: rule.code, messageKey: rule.message, sourcePointer: self.pointer,
            ...(ancestor?.node.id ? { id: ancestor.node.id } : {}),
          });
        }
      }
    }
    return findings;
  };
  const root = hydrate(structuredClone(envelope.tree), { contractVersion: "1", defaults: "explicit", descriptors: {} });
  const { report: findings } = runLintSync(root, {
    stage: phase, readinessPolicy: "accept", profile: adapted as never, bindings: envelope.bindings,
    standard: policy.standard, policies, compiledOptions: policy.compiledOptions,
    evaluator, extraConfigs: { configs: ctx.registry.lintConfigs as never },
  });
  const ordered = sortReportEntries(findings.entries);
  const blocking = ordered.find(e => e.severity === "error");
  if (!blocking) return { entries: ordered };
  if (blocking.classification === "repairable") {
    const rule = (ctx.profile.rules as any[]).find(r => r.code === blocking.code && r.phase === phase);
    const recipe = rule ? (ctx.profile.recipes as any[]).find(r => r.id === rule.repairRecipe) : undefined;
    if (!recipe) return { refused: blocking.code as string, entries: ordered };
    const targets = valueOf(selectHandles(recipe.select, evalContext));
    if (!targets.length) return { refused: blocking.code as string, entries: ordered };
    // An unapplied repair refuses exceptionally, carrying the current-stage
    // findings so the catch preserves them with the accumulated report.
    const repairError = new ProfileContractError("operation-error");
    (repairError as { entries?: unknown }).entries = ordered;
    throw repairError;
  }
  return { refused: blocking.code as string, entries: ordered };
}

// ---------------------------------------------------------------- serializePrepared

const escapeAttribute = (value: string): string => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");

const numberText = (value: unknown): string | undefined =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;

// The occurrence style tokens as one deterministic draw.io style string.
// Absent or empty styles omit the attribute; malformed tokens refuse rather
// than silently dropping paint.
const styleOf = (record: any): string | undefined => {
  const style = record.style as unknown;
  if (style === undefined) return undefined;
  if (!Array.isArray(style)) throw new ProfileContractError("operation-error");
  if (style.length === 0) return undefined;
  const parts = style.map(token => {
    if (!token || typeof token !== "object" || Array.isArray(token)) throw new ProfileContractError("operation-error");
    const name = (token as { readonly name?: unknown }).name;
    const value = (token as { readonly value?: unknown }).value;
    if (typeof name !== "string" || (typeof value !== "string" && typeof value !== "number")) {
      throw new ProfileContractError("operation-error");
    }
    return `${name}=${String(value)}`;
  });
  parts.sort();
  return parts.join(";");
};

const rectAttrs = (bounds: any): string => {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) return "";
  const x = numberText((bounds as { readonly x?: unknown }).x);
  const y = numberText((bounds as { readonly y?: unknown }).y);
  const width = numberText((bounds as { readonly width?: unknown }).width);
  const height = numberText((bounds as { readonly height?: unknown }).height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return "";
  return ` x="${x}" y="${y}" width="${width}" height="${height}"`;
};

// The IR bounds, edge waypoints and node label bounds as nested draw.io
// geometry. Empty geometries stay self-closed (emptyElement short).
const geometryOf = (record: any): string => {
  if (record.kind === "edge") {
    const waypoints = Array.isArray(record.waypoints) ? record.waypoints : [];
    const points = waypoints.map((point: any) => {
      const x = numberText((point as { readonly x?: unknown })?.x);
      const y = numberText((point as { readonly y?: unknown })?.y);
      if (x === undefined || y === undefined) throw new ProfileContractError("operation-error");
      return `<mxPoint x="${x}" y="${y}"/>`;
    }).join("");
    if (!points) return `<mxGeometry as="geometry"${rectAttrs(record.bounds)}/>`;
    return `<mxGeometry as="geometry"${rectAttrs(record.bounds)}><Array as="points">${points}</Array></mxGeometry>`;
  }
  const self = rectAttrs(record.bounds);
  const labelBounds = (record as { readonly label?: { readonly bounds?: unknown } }).label?.bounds;
  const label = labelBounds ? `<mxRectangle as="label"${rectAttrs(labelBounds)}/>` : "";
  if (!self && !label) return "";
  if (!label) return `<mxGeometry as="geometry"${self}/>`;
  return `<mxGeometry as="geometry"${self}>${label}</mxGeometry>`;
};

export interface DrawioSerializer {
  readonly version: string;
  readonly encoding: string;
  readonly newline: string;
  readonly indent: number;
  readonly compression: string;
  readonly attributeOrder: readonly string[];
  readonly emptyElement: string;
}

// The drawio serializer record: pinned serializer data carried by the
// profile export spec and passed through as writerOptions. Anything the
// writer cannot honor refuses export-format-unsupported.
export function checkSerializer(writerOptions: unknown): DrawioSerializer {
  const record = writerOptions as Record<string, unknown> | null;
  if (!record || typeof record !== "object" || Array.isArray(record)) failContract("export-format-unsupported");
  const version = (record as Record<string, unknown>).version;
  const encoding = (record as Record<string, unknown>).encoding;
  const newline = (record as Record<string, unknown>).newline;
  const indent = (record as Record<string, unknown>).indent;
  const compression = (record as Record<string, unknown>).compression;
  const attributeOrder = (record as Record<string, unknown>).attributeOrder;
  const emptyElement = (record as Record<string, unknown>).emptyElement;
  if (typeof version !== "string" || version === "") failContract("export-format-unsupported");
  if (encoding !== "UTF-8") failContract("export-format-unsupported");
  if (newline !== "LF" && newline !== "CRLF") failContract("export-format-unsupported");
  if (indent !== 0) failContract("export-format-unsupported");
  if (compression !== "none") failContract("export-format-unsupported");
  if (!Array.isArray(attributeOrder) || attributeOrder.some(name => typeof name !== "string")) {
    failContract("export-format-unsupported");
  }
  if (emptyElement !== "short") failContract("export-format-unsupported");
  return { version: version as string, encoding: encoding as string, newline: newline as string,
    indent: indent as number, compression: compression as string,
    attributeOrder: [...(attributeOrder as string[])], emptyElement: emptyElement as string };
}

const orderAttributes = (attributes: [string, string][], order: readonly string[]): [string, string][] => {
  if (order.length === 0) return attributes;
  return attributes
    .map(([name, value], index) => ({ name, value, rank: order.includes(name) ? order.indexOf(name) : order.length + index }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ name, value }) => [name, value] as [string, string]);
};

const cellOf = (record: any, order: readonly string[]): string => {
  const attributes: [string, string][] = [[`id`, escapeAttribute(record.id)]];
  if (record.kind === "page") return "";
  const style = styleOf(record);
  const geometry = geometryOf(record);
  if (record.kind === "node") {
    if (record.name !== undefined) attributes.push([`value`, escapeAttribute(record.name)]);
    if (style !== undefined) attributes.push([`style`, escapeAttribute(style)]);
    attributes.push([`parent`, escapeAttribute(record.parent)], [`vertex`, "1"]);
  } else if (record.kind === "edge") {
    if (record.name !== undefined) attributes.push([`value`, escapeAttribute(record.name)]);
    if (style !== undefined) attributes.push([`style`, escapeAttribute(style)]);
    attributes.push([`parent`, escapeAttribute(record.parent)], [`edge`, "1"],
      [`source`, escapeAttribute(record.source)], [`target`, escapeAttribute(record.target)]);
  } else {
    attributes.push([`value`, escapeAttribute(record.text)]);
    if (style !== undefined) attributes.push([`style`, escapeAttribute(style)]);
    attributes.push([`parent`, escapeAttribute(record.parent)], [`vertex`, "1"]);
  }
  const ordered = orderAttributes(attributes, order).map(([name, value]) => `${name}="${value}"`).join(" ");
  if (!geometry) return `<mxCell ${ordered}/>`;
  return `<mxCell ${ordered}>${geometry}</mxCell>`;
};

// The drawio serializer: one diagram per IR page in order, cells in IR
// emission order, the pinned attribute order and byte invariants.
export function serializeDrawio(ir: readonly any[], serializer: DrawioSerializer): Uint8Array {
  const newline = serializer.newline === "CRLF" ? "\r\n" : "\n";
  const lines = [`<mxfile version="${escapeAttribute(serializer.version)}">`];
  const pages = ir.filter(r => r.kind === "page");
  for (const page of pages) {
    lines.push(`<diagram id="${escapeAttribute(page.id)}" name="${escapeAttribute(page.name)}">`);
    lines.push(`<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>`);
    for (const record of ir) {
      if (record.kind === "page" || record.kind === "metadata") continue;
      const parent = record.parent;
      const onPage = parent === page.id || ir.some(r => r.id === parent && r.kind !== "page" && parentOf(ir, r) === page.id);
      void onPage;
      if (diagramOf(ir, record) !== page.id) continue;
      lines.push(cellOf({ ...record, parent: parentOfId(ir, record, page.id) }, serializer.attributeOrder));
    }
    lines.push(`</root></mxGraphModel></diagram>`);
  }
  lines.push(`</mxfile>`);
  return new TextEncoder().encode(lines.join(newline));
}

const parentOf = (ir: readonly any[], record: any): string => record.parent;
const parentOfId = (ir: readonly any[], record: any, pageId: string): string => {
  const parent = record.parent;
  if (parent === pageId) return "1";
  return parent;
};
const diagramOf = (ir: readonly any[], record: any): string => {
  let current = record;
  const seen = new Set<unknown>();
  for (;;) {
    const parent = current.parent;
    if (parent === undefined) return current.kind === "page" ? current.id : "";
    // A parent cycle never resolves to a diagram: skip the record instead
    // of looping forever.
    if (seen.has(parent)) return "";
    seen.add(parent);
    const owner = ir.find(r => r.id === parent);
    if (!owner) return "";
    if (owner.kind === "page") return owner.id;
    current = owner;
  }
};

// serializePrepared: the prepared artifact plus writer options to the
// serialized bytes. Staleness is checked inside the artifact first.
export function serializePrepared(input: { readonly prepared: any; readonly writerOptions: any }): Result<unknown> {
  const prepared = input.prepared;
  const identity = prepared.profileIdentity;
  const revision = prepared.semanticRevision;
  const refused = (code: string): Result<unknown> => refusedResult("serializePrepared", code, { identity, revision });
  try {
    if (prepared.format !== "drawio" && prepared.format !== "sparx") return refused("export-format-unsupported");
    const binding = prepared.renderBinding;
    if (prepared.semanticRevision !== binding.semanticRevision) return refused("render-stale");
    if (prepared.viewRevision !== H(viewTuple(binding))) return refused("render-stale");
    if (binding.profileDigest !== identity.sha256) return refused("render-stale");
    if (binding.descriptorDigest !== descriptorDigestOf(identity.descriptors)) return refused("render-stale");
    // Only the draw.io terminal serializer exists: any other admitted format
    // (Sparx) refuses export-format-unsupported until its serializer is
    // qualified, instead of a generic operation error.
    if (prepared.format !== "drawio") return refused("export-format-unsupported");
    const serializer = checkSerializer(input.writerOptions);
    const bytes = serializeDrawio(prepared.ir, serializer);
    const digest = sha256(bytes);
    const idMap = sortIdMap(prepared.idMap);
    const entries = sortReportEntries(prepared.report.entries);
    return okResult("serializePrepared", {
      identity, revision,
      entries, idMap,
      artifacts: [{ format: prepared.format, capability: prepared.capability, digest, entryIndexes: entries.map((_, i) => i) }],
      payload: { format: prepared.format, bytes, digest, idMap, capability: prepared.capability },
    });
  } catch (error) {
    const code = error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";
    return refusedResult("serializePrepared", code, { identity, revision });
  }
}

// serializeBpmn: the envelope tree hydrated with the pinned BPMN
// descriptors, then the block A BPMN writer.
export async function serializeBpmn(ctx: Lot4ExportContext, input: { readonly envelope: any; readonly writerOptions: any }): Promise<Uint8Array> {
  void ctx;
  const model = hydrate(structuredClone(input.envelope.tree), { contractVersion: "1", defaults: "explicit", descriptors: {} });
  return writeBpmn(model as never, { format: input.writerOptions.format, preamble: input.writerOptions.preamble });
}


