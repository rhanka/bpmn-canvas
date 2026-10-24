// Lot-4 shared query substrate: exact rational ticks, UTF-16 ordering and
// the occurrence-query evaluator used by the export recipes and the
// capability records. This module holds no profile tables; every literal
// comes from its callers.
import { MISSING, failContract } from "./native-contracts.js";
import { evaluatePredicate, evaluateValue } from "./compiler.js";
import type { CompiledNotion, EvalContext, EvalHandle } from "./compiler.js";

export type Json = unknown;

// Assertion guard over the shared contract failure: narrows the checked
// condition at the call site. A bare never-returning call does not narrow.
export function requireTrue(condition: unknown, code: string): asserts condition {
  if (!condition) failContract(code);
}

// Text guard with the same narrowing behaviour.
export function requireText(value: unknown, code: string): string {
  requireTrue(typeof value === "string", code);
  return value;
}

// UTF-16 code-unit ordering used by every lot-4 sort.
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Exact rational ticks. Inputs arrive as shortest-spelling JSON numbers;
// arithmetic stays exact until the final conversion back to a number.
export interface Rational { readonly n: bigint; readonly d: bigint }
const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;
export function ratFromNumber(value: number): Rational {
  if (!Number.isFinite(value)) throw new Error("non-finite rational input");
  const match = DECIMAL.exec(value.toString());
  if (!match) throw new Error(`rational input without decimal spelling: ${value}`);
  const [, sign, int, frac = "", exp = "0"] = match;
  const digits = `${int}${frac}`;
  const exponent = Number.parseInt(exp, 10) - frac.length;
  const stripped = digits.replace(/^0+(?=\d)/, "");
  const n = BigInt(`${sign === "-" ? "-" : ""}${stripped === "" ? "0" : stripped}`);
  if (exponent >= 0) return { n: n * 10n ** BigInt(exponent), d: 1n };
  return { n, d: 10n ** BigInt(-exponent) };
}
export const ratFromInt = (value: number): Rational => {
  if (!Number.isSafeInteger(value)) throw new Error(`non-integer rational input: ${value}`);
  return { n: BigInt(value), d: 1n };
};
export const ratMul = (a: Rational, b: Rational): Rational => ({ n: a.n * b.n, d: a.d * b.d });
export const ratAdd = (a: Rational, b: Rational): Rational => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
export const ratSub = (a: Rational, b: Rational): Rational => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
export const ratCmp = (a: Rational, b: Rational): number => {
  const left = a.n * b.d, right = b.n * a.d;
  return left < right ? -1 : left > right ? 1 : 0;
};
// Round-half-to-even of an exact rational to whole ticks.
export function ratRoundEvenTicks(value: Rational): number {
  const negative = value.n < 0n;
  const abs = negative ? -value.n : value.n;
  const quotient = abs / value.d;
  const remainder = abs % value.d;
  const twice = remainder * 2n;
  let rounded = quotient;
  if (twice > value.d || (twice === value.d && quotient % 2n !== 0n)) rounded = quotient + 1n;
  const signed = negative ? -rounded : rounded;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("tick rounding outside the safe range");
  }
  return Number(signed);
}
export const ratIsInteger = (value: Rational): boolean => value.n % value.d === 0n;
export function ratToNumber(value: Rational): number {
  return Number(value.n) / Number(value.d);
}

// Read a slash path off a plain JSON object. Absent members read MISSING.
export function readPath(target: unknown, path: string): unknown {
  if (typeof path !== "string" || !path.startsWith("/")) return MISSING;
  let current: unknown = target;
  for (const segment of path.slice(1).split("/")) {
    if (current === null || current === undefined || typeof current !== "object") return MISSING;
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) return MISSING;
      current = current[Number(segment)];
      continue;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current === undefined ? MISSING : current;
}

export interface OccurrenceLike {
  readonly pageId: string;
  readonly occurrenceKey: string;
  readonly semanticId?: string;
  readonly emittedType?: string;
  [key: string]: unknown;
}

// Scope for occurrence predicates: render occurrences, pages, the semantic
// tree behind them and the profile notions for recognizes.
export interface OccurrenceScope {
  readonly occurrences: readonly OccurrenceLike[];
  readonly pages: readonly { readonly pageId: string; readonly [key: string]: unknown }[];
  readonly semanticOf: (occurrence: OccurrenceLike) => Record<string, unknown> | undefined;
  readonly childrenOf: (element: Record<string, unknown>, property: string) => Record<string, unknown>[];
  readonly selfPageId?: string;
  readonly evalBase: EvalContext;
  readonly bound: Readonly<Record<string, unknown>>;
}

const occurrenceKeyOf = (item: unknown): string => {
  const record = item as OccurrenceLike;
  return `${record.pageId} ${record.occurrenceKey}`;
};

function resolveBinding(name: string, scope: OccurrenceScope): unknown {
  if (name === "self") return scope.bound["self"];
  const found = scope.bound[name];
  return found === undefined ? MISSING : found;
}

// The occurrence scope bindings as shared evaluation handles. Unbound
// (MISSING) aliases stay undeclared, so the shared evaluator refuses their
// use instead of silently reading MISSING.
const sharedBindings = (scope: OccurrenceScope): Record<string, EvalHandle> => {
  const out: Record<string, EvalHandle> = {};
  for (const [name, value] of Object.entries(scope.bound)) {
    if (value === MISSING || value === null || typeof value !== "object" || Array.isArray(value)) continue;
    out[name] = { node: value as EvalHandle["node"], pointer: "" };
  }
  return out;
};

const sharedContext = (scope: OccurrenceScope): EvalContext => ({
  ...scope.evalBase,
  bindings: { ...scope.evalBase.bindings, ...sharedBindings(scope) },
});

// A locally resolved scalar as a shared-evaluator literal: reads stay lenient
// (absent members are MISSING on typeless R records) while the pure operation
// applied to them is exactly the shared §2.2 implementation.
const lit = (operand: unknown): unknown => {
  if (typeof operand !== "string") failContract("profile-type");
  return { op: "literal", value: operand };
};

const delegateValue = (value: unknown, scope: OccurrenceScope): unknown => {
  const outcome = evaluateValue(value, sharedContext(scope), "emit.fields");
  return outcome.status === "ok" ? outcome.payload : failContract(outcome.code);
};

// Evaluate a value AST in occurrence scope. Reads stay local (typeless R
// records have no descriptor admission, so an absent member is MISSING rather
// than a contract error); composite value ops resolve their operands locally
// and delegate the pure operation to the shared evaluator, so export field
// values share exactly the §2.2 grammar (concat, stripPrefix, case) instead of
// reading MISSING. Value errors propagate to the refusing caller.
export function evaluateOccurrenceValue(value: unknown, scope: OccurrenceScope): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return MISSING;
  const node = value as Record<string, unknown>;
  switch (node["op"]) {
    case "literal": return node["value"] === undefined ? MISSING : node["value"];
    case "read": {
      const target = resolveBinding(node["binding"] as string, scope);
      if (target === MISSING) return MISSING;
      return readPath(target, node["path"] as string);
    }
    case "outputId": return MISSING;
    case "concat": {
      const inputs = node["values"] as unknown[];
      if (!Array.isArray(inputs) || inputs.length === 0) failContract("profile-schema");
      const parts = inputs.map(item => {
        const part = evaluateOccurrenceValue(item, scope);
        if (typeof part !== "string") failContract("profile-type");
        return part;
      });
      return delegateValue({ op: "concat", values: parts.map(lit) }, scope);
    }
    case "stripPrefix": {
      const raw = evaluateOccurrenceValue(node["value"], scope);
      if (typeof raw !== "string") failContract("profile-type");
      return delegateValue({ op: "stripPrefix", value: lit(raw), prefix: node["prefix"], trim: node["trim"] }, scope);
    }
    case "case": {
      const raw = evaluateOccurrenceValue(node["value"], scope);
      if (typeof raw !== "string") failContract("profile-type");
      return delegateValue({ op: "case", value: lit(raw), mode: node["mode"] }, scope);
    }
    case "id": {
      const target = resolveBinding(node["binding"] as string, scope);
      if (target === MISSING) return MISSING;
      const id = (target as { readonly id?: unknown }).id;
      return typeof id === "string" ? id : MISSING;
    }
    case "param": return failContract("profile-symbol");
    case "ids": return failContract("profile-value-context");
    default: {
      const outcome = evaluateValue(value, sharedContext(scope), "emit.fields");
      return outcome.status === "ok" ? outcome.payload : failContract(outcome.code);
    }
  }
}

// Evaluate a predicate AST in occurrence scope. Boolean structure, counting
// and occurrence traversal stay local; value predicates (equal, present,
// textPrefix, reachable) delegate to the shared evaluator, and element
// predicates (typeIs, recognizes, boundRole) delegate with the semantic
// element behind the occurrence. Value errors and undeclared bindings
// propagate (DESIGN L132); a refused element recognition is a non-match,
// exactly as the render path treats it.
export function testOccurrencePredicate(predicate: unknown, scope: OccurrenceScope): boolean {
  if (predicate === null || typeof predicate !== "object" || Array.isArray(predicate)) return false;
  const node = predicate as Record<string, unknown>;
  switch (node["op"]) {
    case "true": return true;
    case "false": return false;
    case "all": return (node["args"] as unknown[]).every(arg => testOccurrencePredicate(arg, scope));
    case "any": return (node["args"] as unknown[]).some(arg => testOccurrencePredicate(arg, scope));
    case "not": return !testOccurrencePredicate(node["arg"], scope);
    case "equal": {
      const left = evaluateOccurrenceValue(node["left"], scope);
      const right = evaluateOccurrenceValue(node["right"], scope);
      if (left === MISSING || right === MISSING) return false;
      return left === right;
    }
    case "present": {
      // False only for MISSING, exactly like the shared present contract.
      // Absent members already read as MISSING, so inapplicable reads stay
      // decidable without swallowing value type errors.
      return evaluateOccurrenceValue(node["value"], scope) !== MISSING;
    }
    case "textPrefix": {
      const raw = evaluateOccurrenceValue(node["value"], scope);
      if (raw === MISSING) return false;
      if (typeof raw !== "string") failContract("profile-type");
      const outcome = evaluatePredicate(
        { op: "textPrefix", value: lit(raw), prefix: node["prefix"], trim: node["trim"] },
        sharedContext(scope),
      );
      return outcome.status === "ok" ? outcome.payload : failContract(outcome.code);
    }
    case "reachable": {
      const outcome = evaluatePredicate(predicate, sharedContext(scope));
      return outcome.status === "ok" ? outcome.payload : failContract(outcome.code);
    }
    case "count": {
      const found = runOccurrenceSelect(node["select"] as Record<string, unknown>, scope);
      const min = node["min"] as number | undefined;
      const max = node["max"] as number | undefined;
      if (min !== undefined && found.length < min) return false;
      if (max !== undefined && found.length > max) return false;
      return true;
    }
    case "typeIs":
    case "recognizes":
    case "boundRole": {
      const name = node["binding"] as string;
      if (typeof name !== "string" || !Object.hasOwn(scope.bound, name)) failContract("profile-symbol");
      const target = scope.bound[name];
      if (target === MISSING || target === null || typeof target !== "object") return false;
      const element = isOccurrence(target) ? scope.semanticOf(target) : target as Record<string, unknown>;
      if (!element) return false;
      const elementId = (element as { id?: unknown }).id;
      const owner = typeof elementId === "string"
        ? bindingOwnerHandle(scope.evalBase.tree, (scope.evalBase.supportBindings ?? []) as readonly { readonly ownerId: string; readonly targetId: string }[], elementId)
        : undefined;
      // A refused element recognition is already a non-match from the shared
      // evaluator boundary, exactly as the render path treats it. Any other
      // evaluation error propagates to the refusing caller instead of
      // silently skipping the candidate.
      const outcome = evaluatePredicate(predicate, {
        ...scope.evalBase,
        bindings: {
          ...scope.evalBase.bindings,
          self: { node: element as EvalHandle["node"], pointer: "" },
          ...(owner === undefined ? {} : { bindingOwner: owner }),
        },
      });
      return outcome.status === "ok" ? outcome.payload : failContract(outcome.code);
    }
    default: return false;
  }
}

function isOccurrence(item: unknown): item is OccurrenceLike {
  return !!item && typeof item === "object" && typeof (item as OccurrenceLike).pageId === "string"
    && typeof (item as OccurrenceLike).occurrenceKey === "string";
}

// Run a select in occurrence scope. Supported sources: render pages and
// occurrences; self via self or semantic; a named binding via self,
// semantic or children; root via all for plain element selects is handled
// by the shared selector and never reaches this interpreter.
export function runOccurrenceSelect(selector: unknown, scope: OccurrenceScope): unknown[] {
  if (selector === null || typeof selector !== "object" || Array.isArray(selector)) failContract();
  const node = selector as Record<string, unknown>;
  const from = node["from"] as string;
  const via = node["via"] as string;
  const where = node["where"] ?? { op: "true" };
  const collect = (candidates: unknown[], self: unknown): unknown[] => {
    const out: unknown[] = [];
    for (const candidate of candidates) {
      if (testOccurrencePredicate(where, { ...scope, bound: { ...scope.bound, self: candidate } })) out.push(candidate);
    }
    void self;
    return out;
  };
  if (from === "render" && via === "pages") return collect([...scope.pages], scope.bound["self"]);
  if (from === "render" && via === "occurrences") return collect([...scope.occurrences], scope.bound["self"]);
  if (from === "self" && via === "self") {
    const self = scope.bound["self"];
    return testOccurrencePredicate(where, scope) ? [self] : [];
  }
  if (from === "self" && via === "semantic") {
    const self = scope.bound["self"];
    const element = isOccurrence(self) ? scope.semanticOf(self) : undefined;
    if (!element) return [];
    return testOccurrencePredicate(where, { ...scope, bound: { ...scope.bound, self: element } }) ? [element] : [];
  }
  if (from === "root" && via === "self") {
    const root = (scope.evalBase as EvalContext).tree as unknown;
    const selected = { ...scope, bound: { ...scope.bound, self: root } };
    return testOccurrencePredicate(where, selected) ? [root] : [];
  }
  const source = resolveBinding(from, scope);
  if (source === MISSING) failContract();
  if (via === "self") {
    return testOccurrencePredicate(where, { ...scope, bound: { ...scope.bound, self: source } }) ? [source] : [];
  }
  if (via === "semantic") {
    const element = isOccurrence(source) ? scope.semanticOf(source) : undefined;
    if (!element) return [];
    return testOccurrencePredicate(where, { ...scope, bound: { ...scope.bound, self: element } }) ? [element] : [];
  }
  if (via === "children") {
    const property = node["property"] as string;
    if (source === null || typeof source !== "object" || Array.isArray(source)) failContract();
    const children = scope.childrenOf(source as Record<string, unknown>, property);
    return collect(children, source);
  }
  if (from === "self" && via === "reference") {
    const self = scope.bound["self"];
    if (self === null || typeof self !== "object" || Array.isArray(self)) failContract();
    const property = node["property"] as string;
    const ref = (self as Record<string, unknown>)[property];
    const refs = Array.isArray(ref) ? ref : [ref];
    const wanted = new Set<string>();
    for (const item of refs) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as OccurrenceLike;
        if (typeof record.pageId === "string" && typeof record.occurrenceKey === "string") {
          wanted.add(`${record.pageId} ${record.occurrenceKey}`);
        }
      }
    }
    return collect(scope.occurrences.filter(o => wanted.has(`${o.pageId} ${o.occurrenceKey}`)), self);
  }
  failContract();
  return [];
}

// Page-occurrence order: page order, then UTF-16 occurrence key.
export function sortByPageOccurrence<T extends { readonly pageId: string; readonly occurrenceKey: string }>(
  items: readonly T[], pages: readonly { readonly pageId: string; readonly order: number }[],
): T[] {
  const order = new Map(pages.map(p => [p.pageId, p.order]));
  return [...items].sort((a, b) =>
    (order.get(a.pageId) ?? 0) - (order.get(b.pageId) ?? 0) || compareText(a.occurrenceKey, b.occurrenceKey));
}

export { occurrenceKeyOf };

const escapePointerSegment = (segment: string): string => segment.replace(/~/g, "~0").replace(/\//g, "~1");

// Locate a tree element by id and return its evaluation handle with the
// JSON pointer of the element inside the tree.
export function handleOf(tree: unknown, id: string): EvalHandle | undefined {
  const visit = (node: unknown, pointer: string): EvalHandle | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const record = node as Record<string, unknown>;
    if (record.id === id) return { node: node as EvalHandle["node"], pointer };
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const found = visit(value[i], `${pointer}/${escapePointerSegment(key)}/${i}`);
          if (found) return found;
        }
      } else if (value && typeof value === "object") {
        const found = visit(value, `${pointer}/${escapePointerSegment(key)}`);
        if (found) return found;
      }
    }
    return undefined;
  };
  return visit(tree, "");
}

// The binding owner of one element: the unique owner of the support
// bindings targeting it. Ambiguous or unbound elements have no owner.
export function bindingOwnerHandle(tree: unknown, supportBindings: readonly { readonly ownerId: string; readonly targetId: string }[], id: string): EvalHandle | undefined {
  const owners = [...new Set(supportBindings.filter(b => b.targetId === id).map(b => b.ownerId))];
  if (owners.length !== 1) return undefined;
  return handleOf(tree, owners[0] as string);
}

// Build a shared evaluation context for lot-4 notion and label
// evaluation: self is the element handle, support bindings come from the
// envelope, notions come from the profile in Map or record shape.
export function lot4EvalContext(ctx: {
  readonly descriptors: EvalContext["descriptors"];
  readonly notions?: unknown;
  readonly unicodeCase?: unknown;
}, tree: EvalContext["tree"], self: EvalHandle, supportBindings?: EvalContext["supportBindings"], extraBindings?: Readonly<Record<string, EvalHandle>>): EvalContext {
  const notions = ctx.notions instanceof Map
    ? Object.fromEntries(ctx.notions as Map<string, CompiledNotion>)
    : (ctx.notions ?? {}) as Record<string, CompiledNotion>;
  const out: {
    descriptors: EvalContext["descriptors"]; tree: EvalContext["tree"];
    bindings: EvalContext["bindings"]; notions: Record<string, CompiledNotion>;
    supportBindings?: EvalContext["supportBindings"]; unicodeCase?: EvalContext["unicodeCase"];
  } = { descriptors: ctx.descriptors, tree, bindings: { self, ...extraBindings }, notions };
  if (supportBindings !== undefined) out.supportBindings = supportBindings;
  if (ctx.unicodeCase !== undefined) out.unicodeCase = ctx.unicodeCase as EvalContext["unicodeCase"];
  // No explicit undefined is ever assigned above; the cast only satisfies
  // exactOptionalPropertyTypes at the boundary.
  return out as EvalContext;
}

// Evaluate one synthetic label Value expression with the selected owner as
// self: an empty, missing or unevaluable label yields no text; a truthy
// non-string value is a stale render record. Shared by the layout produce
// path and the render verify path so both derive the same text.
export function syntheticLabelText(args: {
  readonly evalBase: { readonly descriptors: EvalContext["descriptors"]; readonly notions?: unknown; readonly unicodeCase?: unknown };
  readonly tree: EvalContext["tree"];
  readonly owner: EvalHandle;
  readonly ownerId: string;
  readonly supportBindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[] | undefined;
  readonly label: unknown;
}): string | undefined {
  const ownerBinding = args.supportBindings === undefined ? undefined
    : bindingOwnerHandle(args.tree, args.supportBindings, args.ownerId);
  const outcome = evaluateValue(args.label ?? { op: "literal", value: "" },
    lot4EvalContext(args.evalBase, args.tree, args.owner, args.supportBindings,
      ownerBinding === undefined ? undefined : { bindingOwner: ownerBinding }), "label");
  if (outcome.status !== "ok") return undefined;
  const payload: unknown = (outcome as { readonly payload: unknown }).payload;
  if (payload === (MISSING as unknown) || payload === "") return undefined;
  if (typeof payload !== "string") failContract("render-stale");
  return payload as string;
}
