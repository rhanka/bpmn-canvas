/** Lot-5 predicate/value evaluation over native trees.
 * Reuses the block-A evaluator (predicates, selectors, values) with canvas-built
 * handles; adds notion recognition, ui.when/visible/mutable checks, recipe-when
 * dispatch, display evaluation and localization. */
import { evaluatePredicate as predicate, evaluateValue as value, selectHandles } from "./compiler.js";
import type { CompiledProfile, EvalContext, EvalHandle } from "./compiler.js";
import { descriptorIndex } from "./native-contracts.js";
import type { DescriptorIndex, NativeNode } from "./native-contracts.js";
import type { UnicodeCaseTable } from "./unicode-case.js";
import { TreeIndex, asRecord, clone, type Rec } from "./lot5-support.js";
import type { PureResult } from "./results.js";

export interface Lot5ProfileView {
  readonly document: Rec;
  readonly compiled: CompiledProfile;
  readonly descriptors: DescriptorIndex;
  readonly descriptorTypes: Rec;
  readonly notions: readonly Rec[];
  readonly notionById: ReadonlyMap<string, Rec>;
  readonly recipes: readonly Rec[];
  readonly recipeById: ReadonlyMap<string, Rec>;
  readonly entries: readonly Rec[];
  readonly entryById: ReadonlyMap<string, Rec>;
  readonly messages: readonly Rec[];
  readonly themes: readonly Rec[];
  readonly exports: readonly Rec[];
  readonly resources: readonly Rec[];
  readonly fallbackLocale: string;
  readonly unicodeCase?: UnicodeCaseTable | undefined;
}

export function viewOf(profileDocument: Rec, compiled: CompiledProfile, descriptorTypes: Rec, unicodeCase?: UnicodeCaseTable | undefined): Lot5ProfileView {
  const notions = ((profileDocument.notions ?? []) as Rec[]).map(n => n);
  const recipes = ((profileDocument.recipes ?? []) as Rec[]).map(r => r);
  const entries = ((profileDocument.ui ?? []) as Rec[]).map(e => e);
  return {
    document: profileDocument,
    compiled,
    descriptors: descriptorIndex({ types: descriptorTypes as never }),
    descriptorTypes,
    notions,
    notionById: new Map(notions.map(n => [n.id as string, n])),
    recipes,
    recipeById: new Map(recipes.map(r => [r.id as string, r])),
    entries,
    entryById: new Map(entries.map(e => [e.id as string, e])),
    messages: ((profileDocument.messages ?? []) as Rec[]).map(m => m),
    themes: ((profileDocument.themes ?? []) as Rec[]).map(t => t),
    exports: ((profileDocument.exports ?? []) as Rec[]).map(e => e),
    resources: ((profileDocument.resources ?? []) as Rec[]).map(r => r),
    fallbackLocale: typeof (profileDocument.policies as Rec)?.localeFallback === "string"
      ? ((profileDocument.policies as Rec).localeFallback as string) : "en",
    unicodeCase,
  };
}

export interface EvalScope {
  readonly tree: NativeNode;
  readonly index: TreeIndex;
  readonly bindings: Record<string, EvalHandle>;
  readonly supportBindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[];
}

export function scopeOf(view: Lot5ProfileView, tree: NativeNode, index: TreeIndex,
  bindings: Record<string, EvalHandle>, supportBindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[] = []): EvalScope {
  return { tree, index, bindings, supportBindings };
}

const contextOf = (view: Lot5ProfileView, scope: EvalScope, admission: "strict" | "lenient" = "lenient"): EvalContext => {
  const context: Record<string, unknown> = {
    descriptors: view.descriptors,
    tree: scope.tree,
    bindings: scope.bindings,
    supportBindings: scope.supportBindings,
    admission,
  };
  const notions = (view.compiled as unknown as { notions?: EvalContext["notions"] }).notions;
  if (notions !== undefined) context.notions = notions;
  if (view.unicodeCase !== undefined) context.unicodeCase = view.unicodeCase;
  return context as unknown as EvalContext;
};

export const evalPredicate = (view: Lot5ProfileView, ast: unknown, scope: EvalScope): boolean => {
  const result = predicate(ast, contextOf(view, scope));
  if (result.status !== "ok") return false;
  return result.payload as boolean;
};

/** Predicate evaluation without the recognition non-match conversion: a
 * refused predicate outside notion recognition stays refused so query
 * results can surface the refusal code instead of filtering. */
export const evalPredicateResult = (view: Lot5ProfileView, ast: unknown, scope: EvalScope): PureResult<boolean> =>
  predicate(ast, contextOf(view, scope));

export const evalValue = (view: Lot5ProfileView, ast: unknown, scope: EvalScope, location: string): { ok: true; value: unknown } | { ok: false; code: string } => {
  const result = value(ast, contextOf(view, scope), location);
  if (result.status !== "ok") return { ok: false, code: result.code };
  return { ok: true, value: (result as unknown as { payload: unknown }).payload };
};

export const handleOf = (index: TreeIndex, id: string): EvalHandle | undefined => {
  const found = index.get(id);
  return found ? { node: found.node, pointer: found.pointer } : undefined;
};

const rootHandle = (index: TreeIndex): EvalHandle => ({ node: index.tree, pointer: "" });

/** Handles for a subject element: self + root. */
export function subjectScope(view: Lot5ProfileView, tree: NativeNode, index: TreeIndex, subjectId: string,
  supportBindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[] = []): EvalScope | undefined {
  const self = handleOf(index, subjectId);
  if (!self) return undefined;
  return scopeOf(view, tree, index, { root: rootHandle(index), self }, supportBindings);
}

/** Notion ids recognizing the element, in profile notion order. */
export function recognizedNotions(view: Lot5ProfileView, scope: EvalScope): string[] {
  const out: string[] = [];
  for (const notion of view.notions) {
    if (evalPredicate(view, notion.recognition, scope)) out.push(notion.id as string);
  }
  return out;
}

/** Predicate result without the recognition non-match conversion: an absent
 * predicate holds, `false` stays false, and a refusal outside notion
 * recognition returns the evaluator's original code so command, field and
 * gesture paths propagate it instead of denying (DESIGN :141, :649). */
export const holdsResult = (view: Lot5ProfileView, ast: unknown, scope: EvalScope): true | false | string => {
  if (ast === undefined) return true;
  const tested = evalPredicateResult(view, ast, scope);
  if (tested.status !== "ok") return tested.code;
  return tested.payload;
};

/** Evaluate a recipe `when` with element handles bound (dispatch only),
 * preserving refusals: an absent predicate holds, a missing handle is a
 * non-match, and an evaluator refusal returns its original code. */
export function recipeWhenResult(view: Lot5ProfileView, recipe: Rec, tree: NativeNode, index: TreeIndex,
  handles: Record<string, string | undefined>,
  supportBindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[] = []): true | false | string {
  const bindings: Record<string, EvalHandle> = { root: rootHandle(index) };
  for (const [name, id] of Object.entries(handles)) {
    if (id === undefined) continue;
    const handle = handleOf(index, id);
    if (!handle) return false;
    bindings[name] = handle;
  }
  if (!bindings.self && bindings.source) bindings.self = bindings.source;
  if (!bindings.self && bindings.target) bindings.self = bindings.target;
  const when = (recipe as Rec).when;
  if (when === undefined) return true;
  const tested = evalPredicateResult(view, when, scopeOf(view, tree, index, bindings, supportBindings));
  if (tested.status !== "ok") return tested.code;
  return tested.payload;
}

// ---------------------------------------------------------------- localization (exact, fallback, key)
export function localize(view: Lot5ProfileView, key: string, locale: string): { key: string; source: "exact" | "fallback" | "key"; text: string } {
  const record = view.messages.find(m => m.id === key);
  const texts = (record?.texts ?? []) as Rec[];
  const exact = texts.find(t => t.name === locale)?.value;
  if (typeof exact === "string") return { key, source: "exact", text: exact };
  const fallback = texts.find(t => t.name === view.fallbackLocale)?.value;
  if (typeof fallback === "string") return { key, source: "fallback", text: fallback };
  return { key, source: "key", text: key };
}

export const labelOf = (view: Lot5ProfileView, key: string, locale: string): { key: string; text: string } => {
  const resolved = localize(view, key, locale);
  return { key, text: resolved.text };
};

// ---------------------------------------------------------------- field display
/** Evaluate a field `display` Value; without one the display is the raw value.
 * A refused evaluation stays refused with the evaluator's original code
 * (DESIGN :114, :134, :655, :737) instead of falling back to the raw value. */
export function displayOf(view: Lot5ProfileView, field: Rec, scope: EvalScope, raw: unknown): { ok: true; value: unknown } | { ok: false; code: string } {
  const display = (field as Rec).display;
  if (display === undefined) return { ok: true, value: clone(raw) };
  const evaluated = evalValue(view, display, scope, "field.display");
  if (!evaluated.ok) return evaluated;
  return { ok: true, value: evaluated.value };
}

/** Read a stored scalar at an absolute path of a node record. */
export function storedAt(node: Rec, path: string): { present: boolean; value?: unknown } {
  if (!/^\/(?:[^~/]|~[01])+$/.test(path)) return { present: false };
  const parts = path.slice(1).split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = node;
  for (const part of parts) {
    const record = asRecord(current);
    if (!record || !Object.hasOwn(record, part)) return { present: false };
    current = record[part];
  }
  return { present: true, value: current };
}

export { selectHandles };
export type { EvalHandle };
