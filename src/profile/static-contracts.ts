import { canonicalize, rawDigest } from "./canonical.js";
import { compileSchema } from "./contracts.js";
import { cloneJson, failContract, pointerKey } from "./native-contracts.js";
import type { DescriptorIndex } from "./native-contracts.js";

// Syntax-validated AST records and injected static facts. This is an isolated
// rule preflight, not a whole-profile compiler, evaluator or registry resolver.
type Ast = Record<string, any>;
type Context = Record<string, any>;
export interface DeclaredWrite { readonly binding: string; readonly path: string; readonly mode: string }
const semanticPhases = ["create", "edit", "reference", "complete", "normalize", "convert", "migrate"];
const explicitPhases = semanticPhases.filter(p => p !== "normalize");
const allPhases = [...semanticPhases, "export"];
const actionPhases: Readonly<Record<string, readonly string[]>> = {
  bind: allPhases, refuse: allPhases, create: explicitPhases, ensure: ["normalize"], set: semanticPhases,
  unset: semanticPhases, assignRef: semanticPhases, reparent: ["edit", "convert", "migrate", "normalize"],
  place: ["normalize"], emit: ["export"], loss: ["export"], remove: ["edit", "convert", "migrate"]
};
const own = (value: object, key: string): boolean => Object.hasOwn(value, key);
export function verifyResourcePins(resources: readonly { readonly assetKey: string; readonly sha256: string }[], assets: ReadonlyMap<string, Uint8Array>): void {
  canonicalize(resources);
  for (const resource of resources) {
    const bytes = assets.get(resource.assetKey);
    if (!bytes) failContract("profile-resource-missing");
    if (/^[0-9a-f]{64}$/.exec(resource.sha256)?.[0] !== resource.sha256 || rawDigest(bytes!) !== resource.sha256) failContract();
  }
}
export function checkActionPhase(op: string, phase: string): void {
  if (!own(actionPhases, op) || !actionPhases[op]!.includes(phase)) failContract("profile-action-phase");
}
export function requiredWrites(step: Ast): readonly DeclaredWrite[] {
  const write = (binding: string, path: string, mode: string): DeclaredWrite => ({ binding, path, mode });
  switch (step.op) {
    case "bind": case "refuse": return [];
    case "create": return [write(step.parent, `/${pointerKey(step.property)}`, "create")];
    case "ensure": return [write(step.parent, `/${pointerKey(step.property)}`, "create"), write("envelope", "/bindings", "binding")];
    case "set": case "unset": return [write(step.target, step.path, step.op)];
    case "assignRef": return [write(step.target, step.path, "reference")];
    case "reparent": return [write(step.target, "", "reparent"), write(step.parent, `/${pointerKey(step.property)}`, "reparent")];
    case "place": return [write(step.target, "", "placement")];
    case "emit": return [write("self", "", "artifact")];
    case "loss": return [write(step.target, "", "report")];
    case "remove": return [write(step.target, "", "remove")];
    default: return failContract("profile-schema");
  }
}

function bindingType(name: string, context: Context): string {
  return context.bindings && own(context.bindings, name) ? context.bindings[name] : failContract("profile-symbol");
}
function nativeField(type: string, path: string, context: Context): { kind: string; type: string } {
  const descriptors = context.descriptors as { types: DescriptorIndex } | undefined;
  if (!descriptors || !own(descriptors.types, type) || !/^(?:\/(?:[^~/]|~[01])*)+$/.test(path)) failContract("profile-type");
  const parts = path.slice(1).split("/").map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let descriptor = descriptors!.types[type]!;
  for (const [i, field] of parts.entries()) {
    if (i < parts.length - 1) {
      const targets = descriptor.containment[field];
      if (!targets || targets.length !== 1) failContract("profile-type");
      descriptor = descriptors!.types[targets![0]!] ?? failContract("profile-type");
    } else {
      if (own(descriptor.references, field)) return { kind: "reference", type: "element" };
      if (own(descriptor.containment, field)) return { kind: "containment", type: "element" };
      if (descriptor.scalars.includes(field)) return { kind: "scalar", type: descriptor.scalarTypes?.[field] ?? "scalar" };
    }
  }
  return failContract("profile-type");
}

/** Infer types only. No expression, selector or predicate is executed. */
function valueType(value: Ast, context: Context, location: string): string {
  switch (value.op) {
    case "literal":
      if (!["string", "number", "boolean"].includes(typeof value.value)) failContract("profile-type");
      return typeof value.value;
    case "param": return context.parameterTypes?.[value.name] ?? failContract("profile-symbol");
    case "id": bindingType(value.binding, context); return "string";
    case "read": return nativeField(bindingType(value.binding, context), value.path, context).type;
    case "ids":
      if (location !== "assignRef.values") failContract("profile-value-context");
      checkSelector(value.select, context); return "ids";
    case "outputId": {
      if (!/^emit\.(?:fields|parent)(?:\.|$)/.test(location)) failContract("profile-value-context");
      const binding = bindingType(value.binding, context);
      if ((binding === "PageHandle" && value.domain !== "page") || (binding === "OccurrenceHandle" && !["node", "edge", "label"].includes(value.domain))) failContract("profile-type");
      return "string";
    }
    case "concat":
      if (!Array.isArray(value.values) || !value.values.length || value.values.some((v: Ast) => valueType(v, context, location) !== "string")) failContract("profile-type");
      return "string";
    case "case": case "stripPrefix":
      if (valueType(value.value, context, location) !== "string") failContract("profile-type");
      return "string";
    default: return failContract("profile-schema");
  }
}

function checkSelector(selector: Ast, context: Context): void {
  const domain = bindingType(selector.from, context);
  const via = selector.via;
  if ((["pages", "occurrences", "semantic"].includes(via) || domain === "OccurrenceHandle" && via === "reference") &&
    !["export", "render"].includes(context.location)) failContract("profile-type");
  if (["reference", "inverseReference"].includes(via)) {
    if (!own(selector, "property")) failContract("profile-selector-property");
    if (domain !== "OccurrenceHandle") {
      let field;
      try { field = nativeField(domain, `/${pointerKey(selector.property)}`, context); } catch { failContract("profile-selector-property"); }
      if (field?.kind !== "reference") failContract("profile-selector-property");
    }
  } else if (own(selector, "property") && via !== "children") failContract("profile-selector-property");
  if (via === "children" && own(selector, "property") && nativeField(domain, `/${pointerKey(selector.property)}`, context).kind !== "containment") failContract("profile-selector-property");
  const native = !!context.descriptors?.types && own(context.descriptors.types, domain);
  let order: string;
  if (via === "semantic") {
    if (domain !== "OccurrenceHandle") failContract("profile-type");
    order = "id";
  } else if (via === "pages") {
    if (domain !== "RenderData") failContract("profile-type");
    order = "page-occurrence";
  } else if (via === "occurrences") {
    if (domain !== "RenderData" && domain !== "PageHandle") failContract("profile-type");
    order = "page-occurrence";
  } else if (domain === "PageHandle" && via === "self" || domain === "OccurrenceHandle" && ["self", "reference"].includes(via)) order = "page-occurrence";
  else {
    if (!native || !["self", "root", "owner", "children", "descendants", "reference", "inverseReference", "all"].includes(via)) failContract("profile-type");
    order = "id";
  }
  if (selector.order !== order) failContract("profile-selector-order");
}

function acyclic(symbols: readonly string[], dependencies: readonly (readonly string[])[], cycleCode: string): void {
  const edges = new Map(symbols.map(s => [s, [] as string[]]));
  for (const [from, to] of dependencies) {
    if (!edges.has(from!) || !edges.has(to!)) failContract("profile-symbol");
    edges.get(from!)!.push(to!);
  }
  const active = new Set<string>(), done = new Set<string>();
  function visit(symbol: string): void {
    if (active.has(symbol)) failContract(cycleCode);
    if (done.has(symbol)) return;
    active.add(symbol); for (const dep of edges.get(symbol)!) visit(dep);
    active.delete(symbol); done.add(symbol);
  }
  for (const symbol of symbols) visit(symbol);
}

function checkAuthority(subject: Ast, context: Context): void {
  const required = (subject.steps as Ast[]).flatMap(requiredWrites);
  if (required.some(w => !subject.writes.some((declared: DeclaredWrite) => canonicalize(w) === canonicalize(declared)))) failContract("profile-write-set");
  for (const step of subject.steps as Ast[]) {
    checkActionPhase(step.op, context.phase);
    if (["set", "unset"].includes(step.op) && step.path.split("/").at(-1) === "id") failContract("profile-producer");
    if (["bind", "refuse", "place", "emit", "loss"].includes(step.op)) continue;
    const actor = ["complete", "normalize"].includes(context.phase) ? "code" : "editor";
    const fields = context.fields ?? (context.field ? [context.field] : []);
    function checkField(binding: string, path: string, kind: string, explicitType?: string): void {
      const type = explicitType ?? bindingType(binding, context);
      const name = path.slice(1).replace(/~1/g, "/").replace(/~0/g, "~");
      const applicable = fields.filter((f: Ast) => (type === "native" || f.type === type) && f.field === name);
      if (!applicable.length || applicable.some((f: Ast) => f.kind !== kind)) failContract("profile-type");
      for (const field of applicable as Ast[]) {
        const producers = new Set<string>(field.producers);
        for (const delta of context.producerDelta ?? []) if (delta.nativeType === field.type && delta.path === path) {
          if (!producers.delete(delta.from)) failContract("profile-producer");
          producers.add(delta.to);
        }
        if (!producers.has(actor)) failContract("profile-producer");
      }
    }
    if (["set", "unset", "assignRef"].includes(step.op)) checkField(step.target, step.path, step.op === "assignRef" ? "reference" : "scalar");
    else if (["create", "ensure"].includes(step.op)) {
      checkField(step.parent, `/${pointerKey(step.property)}`, "containment");
      for (const field of step.fields) checkField("", `/${pointerKey(field.name)}`, "scalar", step.type);
      if (step.identity === "allocated" || step.op === "ensure") checkField("", "/id", "scalar", step.type);
    } else if (step.op === "reparent") {
      if (context.phase === "normalize" && !context.structuralMoveApproved) failContract("profile-producer");
      checkField(step.parent, `/${pointerKey(step.property)}`, "containment");
    } else if (step.op === "remove" && !context.explicitDeletion) failContract("profile-producer");
  }
}

const exportFields: Readonly<Record<string, { readonly required: readonly string[]; readonly optional: readonly string[]; readonly numeric?: readonly string[] }>> = {
  page: { required: ["id", "name"], optional: [] },
  node: { required: ["id"], optional: ["name", "shape", "fill", "stroke", "textColor", "fontFamily", "fontSize", "strokeWidth"], numeric: ["fontSize", "strokeWidth"] },
  edge: { required: ["id", "source", "target"], optional: ["name", "stroke", "dash", "arrow", "strokeWidth"], numeric: ["strokeWidth"] },
  label: { required: ["id", "text"], optional: [] }, metadata: { required: ["name", "value"], optional: [] }
};

export function checkStaticRule(ruleId: string, input: Ast, suppliedContext: Context): void {
  // Clone with the strict JSON encoder before reading any data properties.
  const subject = cloneJson(input), context = cloneJson(suppliedContext);
  switch (ruleId) {
    case "CR-01": {
      const ids = subject.capabilities as string[];
      if (new Set(ids).size !== ids.length || ids.some(id => !context.known.includes(id)) || context.required.some((id: string) => !ids.includes(id)) ||
        (context.registrySignature && canonicalize(subject.signature ?? {}) !== canonicalize(context.registrySignature))) failContract("profile-capability");
      return;
    }
    case "CR-02":
      if (subject.location === "create.fields") {
        for (const field of subject.fields) if (nativeField(subject.type, `/${pointerKey(field.name)}`, context).kind !== "scalar" ||
          !["string", "number", "boolean", "scalar"].includes(valueType(field.value, context, "create.fields"))) failContract("profile-type");
      } else valueType(subject.value, context, subject.location);
      return;
    case "CR-03": checkSelector(subject, context); return;
    case "CR-04": {
      const min = subject.op === "count" ? subject.min : subject.minHops, max = subject.op === "count" ? subject.max : subject.maxHops;
      if (!Number.isSafeInteger(min) || min < 0 || (max !== undefined && (!Number.isSafeInteger(max) || max < min))) failContract("profile-bounds");
      return;
    }
    case "CR-05": {
      if (subject.extends) {
        const configs = context.configs ?? {}, active = new Set<string>(), done = new Set<string>();
        function visit(name: string): void {
          if (active.has(name)) failContract("lint-config-cycle");
          if (done.has(name)) return;
          if (!own(configs, name)) failContract("lint-config-unknown");
          active.add(name); for (const dep of configs[name].extends ?? []) visit(dep);
          active.delete(name); done.add(name);
        }
        for (const name of subject.extends) visit(name);
      } else {
        if (new Set(subject.symbols).size !== subject.symbols.length || subject.references.some((s: string) => !subject.symbols.includes(s))) failContract("profile-symbol");
        acyclic(subject.symbols, subject.dependencies, "profile-cycle");
      }
      return;
    }
    case "CR-06": checkAuthority(subject, context); return;
    case "CR-07": {
      const allocated = subject.identity === "allocated";
      if (allocated !== context.effectiveIdAdmission) failContract("profile-create-identity");
      if (allocated) {
        try {
          if (valueType(subject.ownerId, context, "create.ownerId") !== "string" || typeof subject.slot !== "string") failContract("profile-create-identity");
        } catch { failContract("profile-create-identity"); }
      } else if (["ownerId", "slot", "key"].some(k => own(subject, k))) failContract("profile-create-identity");
      return;
    }
    case "CR-08": {
      if (subject.validation) {
        const expected = context.requiredStages.flatMap((stage: string) => context.policies.map((policy: string) => `${stage}/${policy}`));
        const actual = subject.validation.map((r: Ast) => `${r.id}/${r.policy}`);
        if (new Set(actual).size !== actual.length || expected.length !== actual.length || expected.some((id: string) => !actual.includes(id))) failContract("lint-config-incomplete");
        for (const phase of subject.validation) {
          const names = phase.settings.map((s: Ast) => s.rule);
          const required = [...(context.standardRules ?? []), ...(context.rules ?? []).filter((r: Ast) => r.phase === phase.id).map((r: Ast) => `profile:${r.id}`)];
          if (new Set(names).size !== names.length || required.some((name: string) => !names.includes(name))) failContract("lint-config-incomplete");
        }
      } else if (subject.extends) {
        for (const name of subject.extends) if (!context.allowlist?.includes(name) || !context.configs || !own(context.configs, name)) failContract("lint-config-unknown");
      } else if (context.optionsSchema && !(compileSchema(context.optionsSchema))(subject.options).valid) failContract("profile-schema");
      return;
    }
    case "CR-09": {
      if ((own(subject, "facet") || own(subject, "exclusiveGroup")) &&
        ((subject.facet === true) === (typeof subject.exclusiveGroup === "string" && subject.exclusiveGroup.length > 0))) failContract("profile-notion-kind");
      if (subject.glyph) {
        const g = subject.glyph;
        if (!["native", "path", "template"].includes(g.kind) || !Array.isArray(g.viewBox) || g.viewBox.length !== 4 ||
          g.viewBox.some((n: unknown) => typeof n !== "number" || !Number.isFinite(n)) || g.viewBox[2] <= 0 || g.viewBox[3] <= 0 ||
          (g.kind === "native" && (typeof g.nativeType !== "string" || g.commands?.length !== 0))) failContract("profile-glyph-shape");
      }
      if (subject.tokens) {
        const seen = new Set<string>();
        for (const t of subject.tokens) {
          const signature = context.tokenSignatures?.[t.name];
          if (seen.has(t.name) || !signature) failContract("profile-type");
          seen.add(t.name);
          if (signature === "nonnegative finite number" ? typeof t.value !== "number" || !Number.isFinite(t.value) || t.value < 0 : typeof t.value !== signature) failContract("profile-type");
        }
      }
      return;
    }
    case "CR-10": {
      if (subject.widget === "readonly" && own(subject, "command")) failContract("profile-type");
      if (subject.widget === "enum" && (!subject.choices.length || new Set(subject.choices.map((c: Ast) => canonicalize(c.value))).size !== subject.choices.length)) failContract("profile-type");
      if (subject.widget === "reference" && !subject.targetTypes?.length) failContract("profile-type");
      if (context.recipe) {
        const params = subject.parameters ?? [], declared = context.recipe.parameters;
        if (new Set(params.map((p: Ast) => p.name)).size !== params.length || params.some((p: Ast) => !declared.some((d: Ast) => d.name === p.name)) ||
          declared.some((d: Ast) => d.required && !params.some((p: Ast) => p.name === d.name))) failContract("profile-ui-parameters");
        for (const p of params) if (context.sourceTypes && context.sourceTypes[p.source] !== declared.find((d: Ast) => d.name === p.name).type) failContract("profile-type");
      }
      return;
    }
    case "CR-11": {
      const spec = own(exportFields, subject.kind) ? exportFields[subject.kind]! : failContract("profile-export-field");
      const names = subject.fields.map((f: Ast) => f.name);
      if (new Set(names).size !== names.length || spec.required.some(name => !names.includes(name)) || names.some((name: string) => ![...spec.required, ...spec.optional].includes(name))) failContract("profile-export-field");
      for (const field of subject.fields) {
        if (field.value.op === "outputId") valueType(field.value, context, "emit.fields");
        const type = valueType(field.value, context, "emit.fields");
        if (type !== (spec.numeric?.includes(field.name) ? "number" : "string") || context.fieldTypes && own(context.fieldTypes, field.name) && context.fieldTypes[field.name] !== type) failContract("profile-export-field");
      }
      if (subject.kind === "page" && own(subject, "parent")) failContract("profile-type");
      return;
    }
    case "CR-12": {
      const from = subject.from;
      if (subject.to !== "self" || !from || typeof from !== "object" || Array.isArray(from) ||
        context.containingIdentity && canonicalize(from) === canonicalize(context.containingIdentity) ||
        context.containingProfile && from.id === context.containingProfile.id && from.version === context.containingProfile.version ||
        (subject.recipes ?? []).some((id: string) => context.recipePhases?.[id] !== "migrate")) failContract("profile-migration-endpoint");
      return;
    }
    case "CR-13": if (own(subject, "fallbacks") && subject.cardinality !== "first") failContract("profile-bind-fallbacks"); return;
    case "CR-14": checkActionPhase(subject.op, context.phase); return;
    default: return failContract("profile-schema");
  }
}
