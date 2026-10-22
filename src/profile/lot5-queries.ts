/** Lot-5 read queries: listEntries (B17), listFields (B18), checkField, queryReferences
 * (B19, S5 §7), localize, upstream filter (B15), navigation index/resolve and the
 * export-IR builder (F3–F4). All read-only: no history, no events. */
import { typeMatches } from "./native-contracts.js";
import type { NativeNode } from "./native-contracts.js";
import {
  TreeIndex, clone, pureOk, pureRefused, asRecord, asArray, type Rec,
} from "./lot5-support.js";
import {
  subjectScope, evalPredicate, evalPredicateResult, recognizedNotions,
  displayOf, storedAt, labelOf, localize as resolveMessage,
  type Lot5ProfileView, type EvalScope,
} from "./lot5-eval.js";
import { checkFieldValue, copyFragment } from "./lot5-commands.js";
import type { CommandTree } from "./lot5-commands.js";

const utf16 = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function resolveField(view: Lot5ProfileView, fieldRef: string, scope: Parameters<typeof recognizedNotions>[1]): Rec | undefined {
  for (const notionId of recognizedNotions(view, scope)) {
    for (const field of (view.notionById.get(notionId)?.fields ?? []) as Rec[]) {
      if (field.id === fieldRef || `${notionId}/${field.id}` === fieldRef) return field;
    }
  }
  return undefined;
}

/** Strict visibility/mutability for query results: an absent predicate
 * holds, `false` hides, and a refusal outside notion recognition is
 * returned as the query refusal code instead of hiding. */
function holdsStrict(view: Lot5ProfileView, ast: unknown, scope: EvalScope): true | false | string {
  if (ast === undefined) return true;
  const tested = evalPredicateResult(view, ast, scope);
  if (tested.status !== "ok") return tested.code;
  return tested.payload;
}

// ---------------------------------------------------------------- listEntries (B17)
export function listEntries(view: Lot5ProfileView, tree: NativeNode, index: TreeIndex,
  surface: string, subjectId: string, locale: string, revision: string,
  bindings: CommandTree["bindings"] = []): Rec {
  const scope = subjectScope(view, tree, index, subjectId, bindings);
  if (!scope) return pureRefused("reference-dangling");
  const listed: Rec[] = [];
  for (const e of view.entries) {
    if (e.surface !== surface) continue;
    // A `when` refusal outside notion recognition is a query refusal, never
    // a filtered non-match.
    const tested = evalPredicateResult(view, e.when, scope);
    if (tested.status !== "ok") return pureRefused(tested.code);
    if (!tested.payload) continue;
    listed.push({ id: e.id as string, label: labelOf(view, e.label as string, locale),
      icon: { theme: (asRecord(e.icon)?.theme as string), glyph: (asRecord(e.icon)?.glyph as string) },
      order: e.order as number, upstreamEntries: clone(e.upstreamEntries ?? []) });
  }
  const groups: Rec[] = [];
  for (const item of listed) {
    const source = view.entryById.get(item.id as string);
    const group = (source?.group as string | undefined) ?? "tools";
    let record = groups.find(g => g.group === group);
    if (!record) {
      record = { group, entries: [] };
      groups.push(record);
    }
    const { ...rest } = item;
    (record.entries as Rec[]).push(rest as unknown as Rec);
  }
  // Group order follows first appearance in the profile array, before `when`
  // filtering (DESIGN §8.3): a group whose earliest entries are hidden still
  // keeps its declared position.
  const declared = new Map<string, number>();
  for (const candidate of view.entries) {
    if ((candidate as Rec).surface !== surface) continue;
    const group = ((candidate as Rec).group as string | undefined) ?? "tools";
    if (!declared.has(group)) declared.set(group, declared.size);
  }
  groups.sort((a, b) => (declared.get(a.group as string) ?? 0) - (declared.get(b.group as string) ?? 0));
  for (const record of groups) {
    (record.entries as Rec[]).sort((a, b) =>
      ((a.order as number) - (b.order as number)) || utf16(a.id as string, b.id as string));
  }
  return pureOk({ revision, surface, groups });
}

// ---------------------------------------------------------------- listFields (B18)
export function listFields(view: Lot5ProfileView, tree: NativeNode, index: TreeIndex,
  targetId: string, locale: string, revision: string,
  bindings: CommandTree["bindings"] = []): Rec {
  const node = index.get(targetId);
  if (!node) return pureRefused("reference-dangling");
  const scope = subjectScope(view, tree, index, targetId, bindings);
  if (!scope) return pureRefused("reference-dangling");
  const fields: Rec[] = [];
  for (const notionId of recognizedNotions(view, scope)) {
    const notion = view.notionById.get(notionId)!;
    for (const raw of (asArray(notion.fields) ?? []).map(f => asRecord(f))) {
      if (!raw || typeof raw.id !== "string") continue;
      const shown = holdsStrict(view, raw.visible, scope);
      if (typeof shown === "string") return pureRefused(shown);
      if (!shown) continue;
      const editable = holdsStrict(view, raw.mutable, scope);
      if (typeof editable === "string") return pureRefused(editable);
      const stored = storedAt(node.node as unknown as Rec, raw.path as string);
      const record: Rec = {
        notion: notionId,
        field: raw.id as string,
        path: raw.path as string,
        widget: raw.widget as string,
        label: labelOf(view, raw.label as string, locale),
        message: labelOf(view, raw.message as string, locale),
        mutable: editable && raw.command !== undefined,
        choices: clone(raw.widget === "enum" ? raw.choices ?? [] : []),
        targetTypes: clone(raw.widget === "reference" ? raw.targetTypes ?? [] : []),
        present: stored.present,
      };
      if (stored.present) {
        (record as Rec).value = clone(stored.value);
        const display = displayOf(view, raw, scope, stored.value);
        if (!display.ok) return pureRefused(display.code);
        (record as Rec).display = clone(display.value);
      }
      fields.push(record);
    }
  }
  return pureOk({ revision, targetId, fields });
}

// ---------------------------------------------------------------- checkField (on-change validation)
export function checkField(view: Lot5ProfileView, tree: NativeNode, index: TreeIndex,
  targetId: string, fieldRef: string, value: unknown, revision: string,
  bindings: CommandTree["bindings"] = []): Rec {
  const node = index.get(targetId);
  if (!node) return pureRefused("reference-dangling");
  const scope = subjectScope(view, tree, index, targetId, bindings);
  if (!scope) return pureRefused("reference-dangling");
  const field = resolveField(view, fieldRef, scope);
  if (!field) return pureRefused("profile-symbol");
  const shown = holdsStrict(view, field.visible, scope);
  if (typeof shown === "string") return pureRefused(shown);
  const editable = holdsStrict(view, field.mutable, scope);
  if (typeof editable === "string") return pureRefused(editable);
  if (!shown || !editable || !field.command) {
    return pureOk({ revision, valid: false, code: "profile-producer", messageKey: field.message });
  }
  const checked = checkFieldValue(view, field, value, targetId, node, index);
  if ("code" in checked) {
    return pureOk({ revision, valid: false, code: checked.code, messageKey: field.message });
  }
  return pureOk({ revision, valid: true });
}

// ---------------------------------------------------------------- queryReferences (S5 §7, B19)
export function queryReferences(view: Lot5ProfileView, tree: NativeNode, index: TreeIndex,
  targetId: string, fieldRef: string, query: string, offset: number, limit: number, revision: string,
  bindings: CommandTree["bindings"] = []): Rec {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 0) {
    return pureRefused("profile-bounds");
  }
  const node = index.get(targetId);
  if (!node) return pureRefused("reference-dangling");
  const scope = subjectScope(view, tree, index, targetId, bindings);
  if (!scope) return pureRefused("reference-dangling");
  const field = resolveField(view, fieldRef, scope);
  if (!field) return pureRefused("profile-symbol");
  if (field.widget !== "reference") return pureRefused("profile-type");
  const targetTypes = (asArray(field.targetTypes) ?? []).filter((t): t is string => typeof t === "string");
  const shown = holdsStrict(view, field.visible, scope);
  if (typeof shown === "string") return pureRefused(shown);
  const editable = holdsStrict(view, field.mutable, scope);
  if (typeof editable === "string") return pureRefused(editable);
  if (!shown || !editable) {
    return pureOk({ revision, candidates: [] });
  }
  const candidates: Rec[] = [];
  for (const entry of index.order) {
    if (typeof entry.node.id !== "string") continue;
    if (!targetTypes.some(type => typeMatches(entry.node.$type, type, "assignable", view.descriptors))) continue;
    if (!pickOwnership(node, entry)) continue;
    const name = asRecord(entry.node)?.name;
    const label = typeof name === "string" ? name : "";
    if (query !== "" && !label.includes(query)) continue;
    candidates.push({ id: entry.node.id, type: entry.node.$type, label });
  }
  candidates.sort((a, b) => utf16(a.id as string, b.id as string));
  return pureOk({ revision, candidates: candidates.slice(offset, offset + limit) });
}

/** B19 pick ownership: a root element for any target, else the same nearest Process. */
function pickOwnership(target: { node: NativeNode; parent: unknown }, candidate: { node: NativeNode; parent: unknown }): boolean {
  if (candidate.node.$type === "bpmn:Process" || candidate.node.$type === "bpmn:Collaboration" || candidate.node.$type === "bpmn:DataStore") {
    return true;
  }
  const processOf = (handle: { node: NativeNode; parent: unknown }): string | null => {
    let current: { node: NativeNode; parent: unknown } | null = handle;
    while (current) {
      if (current.node.$type === "bpmn:Process" && typeof current.node.id === "string") return current.node.id;
      current = current.parent as { node: NativeNode; parent: unknown } | null;
    }
    return null;
  };
  return processOf(target) === processOf(candidate);
}

// ---------------------------------------------------------------- localize
export function localizeQuery(view: Lot5ProfileView, key: string, locale: string): Rec {
  return pureOk(resolveMessage(view, key, locale));
}

// ---------------------------------------------------------------- copy (B20)
export function copyQuery(tree: NativeNode, index: TreeIndex, elementIds: readonly string[], revision: string): Rec {
  const outcome = copyFragment(tree, index, elementIds, revision);
  if ("code" in outcome) return pureRefused(outcome.code);
  return pureOk(outcome.fragment);
}

// ---------------------------------------------------------------- upstream filter (B15)
/** A `when` refusal outside notion recognition is a query refusal, never a
 * filtered non-match (matches listEntries/listFields/checkField). */
function whenEnabled(view: Lot5ProfileView, when: unknown, scope: EvalScope): boolean | string {
  const tested = evalPredicateResult(view, when, scope);
  if (tested.status !== "ok") return tested.code;
  return tested.payload;
}

export function upstreamFilter(view: Lot5ProfileView, tools: readonly (Rec | string)[], scope?: Parameters<typeof evalPredicate>[2]): Rec {
  const mapped: Rec[] = [], disabled: string[] = [], outOfScope: string[] = [], derived: Rec[] = [];
  for (const tool of tools) {
    const id = (typeof tool === "string" ? tool : tool.id) as string;
    const entry = view.entries.find(e => ((e.upstreamEntries ?? []) as string[]).includes(id));
    if (entry) {
      // Connect-surface entries never evaluate a predicate; otherwise a
      // refusal surfaces with its code instead of disabling the entry.
      let enabled: boolean | string = true;
      if (entry.surface !== "connect" && scope) enabled = whenEnabled(view, entry.when, scope);
      if (typeof enabled === "string") return pureRefused(enabled);
      mapped.push({ upstream: id, entry: entry.id, enabled });
    } else if (id === "replace" && scope) {
      let shown = false;
      for (const candidate of view.entries) {
        if (candidate.surface !== "replace") continue;
        const held = whenEnabled(view, candidate.when, scope);
        if (typeof held === "string") return pureRefused(held);
        if (held) {
          shown = true;
          break;
        }
      }
      derived.push({ upstream: id, shown, reason: "replace surface has enabled entries for the subject" });
    } else if (/^(create[.]|append[.]|connect$|replace$|delete$)/.test(id)) disabled.push(id);
    else outOfScope.push(id);
  }
  mapped.sort((a,b) => utf16(a.upstream as string,b.upstream as string));
  return pureOk({ mapped, disabled: disabled.sort(), outOfScope: outOfScope.sort(), ...(derived.length ? { derived } : {}) });
}

// ---------------------------------------------------------------- navigation (§8.1)
export interface NavigationPage { readonly pageId: string; readonly order: number; readonly diagramId: string;
  readonly semanticRootId: string; readonly name: string }

export function navigationIndex(pages: readonly NavigationPage[], revision: string, tree: NativeNode, index: TreeIndex): Rec {
  const entries = [...pages]
    .sort((a, b) => (a.order - b.order) || utf16(a.diagramId, b.diagramId))
    .map(page => {
      const record: Rec = { diagramId: page.diagramId, semanticRootId: page.semanticRootId, label: page.name, order: page.order };
      const root = index.get(page.semanticRootId);
      if (root?.node.$type === "bpmn:Process" && typeof root.node.id === "string") {
        (record as Rec).processId = root.node.id;
      }
      return record;
    });
  void revision;
  void tree;
  return pureOk(entries);
}

export function navigateCall(pages: readonly NavigationPage[], revision: string, tree: NativeNode, index: TreeIndex,
  callId: string, currentDiagramId: string | undefined, diagramId: string | undefined): Rec {
  void revision;
  const call = index.get(callId);
  if (!call) return pureRefused("reference-dangling");
  const calledElement = asRecord(call.node)?.calledElement;
  if (calledElement === undefined) return pureRefused("call-target-required");
  if (typeof calledElement !== "string" || calledElement === "") return pureRefused("call-target-empty");
  const target = index.get(calledElement);
  if (!target) return pureRefused("reference-dangling");
  if (target.node.$type !== "bpmn:Process") return pureRefused("call-target-type");
  const views = pages.filter(page => page.semanticRootId === calledElement);
  if (views.length === 0) return pureRefused("navigation-view-missing");
  if (diagramId !== undefined) {
    const explicit = views.find(page => page.diagramId === diagramId);
    if (!explicit) return pureRefused("navigation-view-missing");
    return pureOk({ diagramId: explicit.diagramId, resolution: "open" });
  }
  const current = currentDiagramId !== undefined ? views.find(page => page.diagramId === currentDiagramId) : undefined;
  if (current) return pureOk({ diagramId: current.diagramId, resolution: "open" });
  const ordered = [...views].sort((a, b) => (a.order - b.order) || utf16(a.diagramId, b.diagramId));
  if (ordered.length > 1) return pureOk({ resolution: "choose", candidates: ordered.map(page => ({ diagramId: page.diagramId,
    semanticRootId: page.semanticRootId, processId: calledElement, label: page.name, order: page.order })) });
  const first = ordered[0]!;
  return pureOk({ diagramId: first.diagramId, resolution: "open" });
}

