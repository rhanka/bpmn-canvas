import { canonicalize } from "./canonical.js";
import { failContract, pointerKey, typeMatches } from "./native-contracts.js";
import type { CompilerAuthority } from "./compiler-authority.js";
import type { CompleteProfileDocument } from "./envelope.js";
import { checkActionPhase, checkStaticRule, requiredWrites } from "./static-contracts.js";

type Ast = Record<string, any>;
type Domain = { types: readonly string[]; generic?: boolean };
type Env = Map<string, Domain>;
const render = (name: string): Domain => ({ types: [name] });
const renderFields: Record<string, Record<string, string>> = {
  RenderData: {},
  PageHandle: { "/pageId": "string", "/name": "string", "/order": "number", "/semanticRootId": "string", "/bounds/x": "number", "/bounds/y": "number", "/bounds/width": "number", "/bounds/height": "number" },
  OccurrenceHandle: { "/pageId": "string", "/occurrenceKey": "string", "/semanticId": "string", "/emittedType": "string", "/label/text": "string", "/bounds/x": "number", "/bounds/y": "number", "/bounds/width": "number", "/bounds/height": "number", "/role": "string" },
};
const unique = (items: readonly Ast[], key: string): Map<string, Ast> => {
  const map = new Map<string, Ast>();
  for (const item of items) {
    if (map.has(item[key])) failContract("profile-symbol");
    map.set(item[key], item);
  }
  return map;
};
const expectType = (actual: string, expected: string, code = "profile-type"): void => {
  // A descriptor slice may explicitly leave a scalar's primitive unspecified.
  // It still cannot admit a known incompatible expression or a structured read.
  if (actual !== expected && actual !== "scalar") failContract(code);
};

/** Whole-profile typing and authority, after closed-schema admission. Every
 * branch is checked; selectors refine local self without changing outer names.
 */
export function checkWholeProfile(profile: CompleteProfileDocument, authority: CompilerAuthority): void {
  const p = profile as unknown as Ast;
  const descriptors = authority.descriptors;
  const native: Domain = { types: authority.types, generic: true };
  const elements: Domain = { types: native.types.filter(t => descriptors[t]!.id), generic: true };
  const notions = unique(p.notions, "id"), recipes = unique(p.recipes, "id"), themes = unique(p.themes, "id"), messages = unique(p.messages, "id"), resources = unique(p.resources, "id");
  for (const section of ["rules", "ui", "exports", "migrations", "providerDialects"]) unique(p[section], "id");
  const symbol = (map: Map<string, Ast>, name: string): Ast => map.get(name) ?? failContract("profile-symbol");
  const type = (name: string): void => { if (!Object.hasOwn(descriptors, name) || !authority.types.includes(name)) failContract("profile-type"); };
  const binding = (env: Env, name: string): Domain => env.get(name) ?? failContract("profile-symbol");
  const baseEnv = (): Env => new Map([["root", { types: ["bpmn:Definitions"] }], ["self", native], ["bindingOwner", elements]]);
  function field(domain: Domain, path: string, kind?: string): { type: string; field: string; kind: string; targets: readonly string[]; valueType: string }[] {
    if (!/^(?:\/(?:[^~/]|~[01])*)+$/.test(path)) failContract("profile-type");
    const parts = path.slice(1).split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    let names = domain.types;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const fields = names.flatMap(t => {
        const d = descriptors[t];
        if (!d) return [];
        const role = Object.hasOwn(d.references, name) ? "reference" : Object.hasOwn(d.containment, name) ? "containment" : d.scalars.includes(name) ? "scalar" : undefined;
        return role ? [{ type: t, field: name, kind: role, targets: role === "reference" ? d.references[name]! : role === "containment" ? d.containment[name]! : [], valueType: d.scalarTypes?.[name] ?? "scalar" }] : [];
      });
      if (!fields.length || !domain.generic && fields.length !== names.length) failContract("profile-type");
      if (i === parts.length - 1) {
        if (kind && fields.some(f => f.kind !== kind)) failContract("profile-type");
        return fields;
      }
      if (fields.some(f => f.kind !== "containment" || f.targets.length !== 1)) failContract("profile-type");
      names = fields.flatMap(f => f.targets);
    }
    return failContract("profile-type");
  }
  function read(domain: Domain, path: string): string {
    const recordType = domain.types.length === 1 ? domain.types[0]! : "";
    if (Object.hasOwn(renderFields, recordType)) return renderFields[recordType]![path] ?? failContract("profile-type");
    const fields = field(domain, path);
    if (fields.some(f => f.kind === "containment")) failContract("profile-type");
    const types = new Set(fields.map(f => f.kind === "reference" ? "string" : f.valueType));
    return types.size === 1 ? [...types][0]! : "scalar";
  }
  function value(v: Ast, env: Env, params: Map<string, string>, location: string): string {
    switch (v.op) {
      case "literal": return typeof v.value;
      case "param": { const t = params.get(v.name) ?? failContract("profile-symbol"); return t === "element" ? "string" : t; }
      case "read": return read(binding(env, v.binding), v.path);
      case "id": {
        if (binding(env, v.binding).types.some(t => !descriptors[t]?.id)) failContract("profile-type");
        return "string";
      }
      case "concat": for (const part of v.values) expectType(value(part, env, params, location), "string"); return "string";
      case "case": case "stripPrefix": expectType(value(v.value, env, params, location), "string"); return "string";
      case "ids":
        if (location !== "assignRef.values") failContract("profile-value-context");
        if (select(v.select, env, params, location).types.some(t => !descriptors[t]?.id)) failContract("profile-type");
        return "ids";
      case "outputId": {
        if (!location.startsWith("emit.")) failContract("profile-value-context");
        const d = binding(env, v.binding);
        if (d.types.includes("RenderData") || d.types.includes("PageHandle") && v.domain !== "page" || d.types.includes("OccurrenceHandle") && v.domain === "page") failContract("profile-type");
        return "string";
      }
    }
    return failContract("profile-schema");
  }
  function narrow(ast: Ast, env: Env): Env {
    const out = new Map(env);
    if (ast.op === "typeIs") {
      type(ast.type);
      const old = binding(out, ast.binding);
      out.set(ast.binding, { types: old.types.filter(t => Object.hasOwn(descriptors, t) && typeMatches(t, ast.type, ast.mode, descriptors)) });
    } else if (ast.op === "recognizes") {
      const n = symbol(notions, ast.notion), old = binding(out, ast.binding);
      out.set(ast.binding, { types: old.types.filter(t => n.nativeTypes.includes(t)) });
    } else if (ast.op === "all") {
      let current = out; for (const a of ast.args) current = narrow(a, current); return current;
    }
    return out;
  }
  function predicate(ast: Ast, env: Env, params: Map<string, string>, location: string): void {
    switch (ast.op) {
      case "true": case "false": return;
      case "all": {
        // A conjunctive type guard refines sibling field reads, but no branch
        // escapes static checking, including branches known to be false.
        const refined = narrow(ast, env);
        for (const a of ast.args) predicate(a, refined, params, location);
        return;
      }
      case "any": for (const a of ast.args) predicate(a, new Map(env), params, location); return;
      case "not": predicate(ast.arg, env, params, location); return;
      case "typeIs": if (binding(env, ast.binding).types.some(t => !Object.hasOwn(descriptors, t))) failContract("profile-type"); type(ast.type); return;
      case "recognizes": if (binding(env, ast.binding).types.some(t => !Object.hasOwn(descriptors, t))) failContract("profile-type"); symbol(notions, ast.notion); return;
      case "boundRole": binding(env, ast.binding); binding(env, ast.owner); return;
      case "present": value(ast.value, env, params, "predicate"); return;
      case "equal": value(ast.left, env, params, "predicate"); value(ast.right, env, params, "predicate"); return;
      case "textPrefix": expectType(value(ast.value, env, params, "predicate"), "string"); return;
      case "count": select(ast.select, env, params, location); return;
      case "reachable":
        select(ast.from, env, params, location); select(ast.to, env, params, location);
        for (const t of ast.edgeTypes) { type(t); field({ types: [t] }, "/sourceRef", "reference"); field({ types: [t] }, "/targetRef", "reference"); }
        return;
    }
    failContract("profile-schema");
  }
  function select(s: Ast, env: Env, params: Map<string, string>, location: string): Domain {
    const from = binding(env, s.from), domain = from.types[0];
    let result: Domain = from;
    let order = "id";
    const exporting = ["export", "render"].includes(location);
    if (from.types.some(t => !Object.hasOwn(descriptors, t)) && !["pages", "occurrences", "semantic", "self", "reference"].includes(s.via)) failContract("profile-type");
    switch (s.via) {
      case "pages": if (!exporting || domain !== "RenderData") failContract("profile-type"); result = render("PageHandle"); order = "page-occurrence"; break;
      case "occurrences": if (!exporting || !["RenderData", "PageHandle"].includes(domain!)) failContract("profile-type"); result = render("OccurrenceHandle"); order = "page-occurrence"; break;
      case "semantic": if (!exporting || domain !== "OccurrenceHandle") failContract("profile-type"); result = native; break;
      case "self": if (["PageHandle", "OccurrenceHandle"].includes(domain!)) order = "page-occurrence"; break;
      case "root": result = { types: ["bpmn:Definitions"] }; break;
      case "all": result = native; break;
      case "owner": result = { types: authority.types.filter(t => Object.values(descriptors[t]!.containment).some(ts => ts.some(target => from.types.some(actual => typeMatches(actual, target, "assignable", descriptors))))), generic: true }; break;
      case "children": case "descendants": {
        const targets = s.property ? field(from, `/${pointerKey(s.property)}`, "containment").flatMap(f => f.targets) : from.types.flatMap(t => Object.values(descriptors[t]?.containment ?? {}).flat());
        result = s.via === "descendants" ? native : { types: [...new Set(targets)] };
        break;
      }
      case "reference": case "inverseReference": {
        if (domain === "OccurrenceHandle" && s.via === "reference") {
          if (!exporting || !["sourceOccurrence", "targetOccurrence"].includes(s.property)) failContract("profile-selector-property");
          result = render("OccurrenceHandle"); order = "page-occurrence"; break;
        }
        const names = s.via === "reference" ? from : native;
        const refs = names.types.flatMap(t => {
          const d = descriptors[t];
          if (!d) return [];
          if (Object.hasOwn(d.references, s.property)) return [{ type: t, targets: d.references[s.property]! }];
          if (authority.idRefScalars.includes(`${t}.${s.property}`)) return [{ type: t, targets: authority.types }];
          return [];
        });
        if (!refs.length) failContract("profile-selector-property");
        result = { types: [...new Set(s.via === "reference" ? refs.flatMap(f => f.targets) : refs.filter(f => f.targets.some(target => from.types.some(actual => typeMatches(actual, target, "assignable", descriptors)))).map(f => f.type))] };
        break;
      }
      default: failContract("profile-type");
    }
    if (s.order !== order) failContract("profile-selector-order");
    if (s.property !== undefined && !["children", "reference", "inverseReference"].includes(s.via)) failContract("profile-selector-property");
    const local = new Map(env); local.set("self", result);
    predicate(s.where, local, params, location);
    return narrow(s.where, local).get("self")!;
  }
  const fields = authority.fields.map(f => ({ ...f, producers: [...f.producers] }));
  for (const delta of p.producerDelta) {
    const f = fields.find(f => f.type === delta.nativeType && `/${pointerKey(f.field)}` === delta.path) ?? failContract("profile-producer");
    if (!f.producers.includes(delta.from)) failContract("profile-producer");
    f.producers = [...new Set([...f.producers.filter(a => a !== delta.from), delta.to])];
  }
  function write(domain: Domain, path: string, kind: string, phase: string): void {
    for (const f of field(domain, path, kind)) {
      const grant = fields.find(g => g.type === f.type && g.field === f.field && g.kind === kind);
      const actor = ["complete", "normalize"].includes(phase) ? "code" : "editor";
      if (!grant?.producers.includes(actor)) failContract("profile-producer");
    }
  }
  function bind(step: Ast, env: Env, params: Map<string, string>, phase: string): void {
    if (env.has(step.as)) failContract("profile-symbol");
    let selected = select(step.select, env, params, phase);
    for (const fallback of step.fallbacks ?? []) {
      const d = select(fallback, env, params, phase);
      selected = { types: [...new Set([...selected.types, ...d.types])] };
    }
    env.set(step.as, selected);
  }
  for (const n of p.notions) {
    for (const t of n.nativeTypes) type(t);
    const env = baseEnv(); env.set("self", { types: n.nativeTypes });
    predicate(n.recognition, env, new Map(), "recognition");
    unique(n.labels, "name"); unique(n.fields, "id");
    if (n.createRecipe && symbol(recipes, n.createRecipe).phase !== "create") failContract("profile-type");
    for (const id of n.referenceRecipes) if (symbol(recipes, id).phase !== "reference") failContract("profile-type");
  }
  for (const r of p.rules) {
    symbol(messages, r.message);
    if (r.repairRecipe && !["complete", "normalize"].includes(symbol(recipes, r.repairRecipe).phase)) failContract("profile-type");
    const env = baseEnv(), params = new Map<string, string>();
    env.set("self", select(r.select, env, params, "validation"));
    for (const b of r.bindings ?? []) bind(b, env, params, "validation");
    predicate(r.assert, env, params, "validation");
  }
  for (const recipe of p.recipes) {
    const env = baseEnv(), params = new Map<string, string>();
    unique(recipe.parameters, "name");
    for (const param of recipe.parameters) {
      params.set(param.name, param.type);
      if (param.type === "element") { if (env.has(param.name)) failContract("profile-symbol"); env.set(param.name, elements); }
    }
    if (recipe.phase === "export") env.set("render", render("RenderData"));
    env.set("self", select(recipe.select, env, params, recipe.phase));
    predicate(recipe.when, env, params, recipe.phase);
    for (const step of recipe.steps) {
      checkActionPhase(step.op, recipe.phase);
      for (const w of requiredWrites(step)) if (!recipe.writes.some((d: Ast) => canonicalize(d) === canonicalize(w))) failContract("profile-write-set");
      switch (step.op) {
        case "bind": bind(step, env, params, recipe.phase); break;
        case "create": case "ensure": {
          type(step.type);
          const parent = binding(env, step.parent), path = `/${pointerKey(step.property)}`;
          const targets = field(parent, path, "containment");
          if (targets.some(f => !f.targets.some(t => typeMatches(step.type, t, "assignable", descriptors)))) failContract("profile-type");
          const allocated = fields.some(f => f.type === step.type && f.field === "id");
          if ((step.op === "ensure" || step.identity === "allocated") !== allocated) failContract("profile-create-identity");
          if (allocated) {
            if (step.op === "create") {
              expectType(value(step.ownerId, env, params, "create.ownerId"), "string", "profile-create-identity");
              expectType(value(step.key, env, params, "create.key"), "string", "profile-create-identity");
            } else { binding(env, step.owner); binding(env, step.ownerId); }
            write({ types: [step.type] }, "/id", "scalar", recipe.phase);
          }
          write(parent, path, "containment", recipe.phase);
          unique(step.fields, "name");
          for (const f of step.fields) {
            const target = field({ types: [step.type] }, `/${pointerKey(f.name)}`, "scalar");
            if (f.name === "id") failContract("profile-producer");
            const actual = value(f.value, env, params, "create.fields");
            if (!["string", "number", "boolean", "scalar"].includes(actual)) failContract("profile-type");
            if (target[0]!.valueType !== "scalar") expectType(actual, target[0]!.valueType);
            write({ types: [step.type] }, `/${pointerKey(f.name)}`, "scalar", recipe.phase);
          }
          if (env.has(step.as)) failContract("profile-symbol"); env.set(step.as, { types: [step.type] }); break;
        }
        case "set": case "unset": {
          const domain = binding(env, step.target);
          if (step.path.split("/").at(-1) === "id") failContract("profile-producer");
          write(domain, step.path, "scalar", recipe.phase);
          if (step.op === "set") {
            const actual = value(step.value, env, params, "set.value");
            if (!["string", "number", "boolean", "scalar"].includes(actual)) failContract("profile-type");
            for (const f of field(domain, step.path)) if (f.valueType !== "scalar") expectType(actual, f.valueType);
          }
          break;
        }
        case "assignRef":
          write(binding(env, step.target), step.path, "reference", recipe.phase);
          for (const v of step.values) if (!["string", "ids"].includes(value(v, env, params, "assignRef.values"))) failContract("profile-type");
          break;
        case "reparent":
          binding(env, step.target); write(binding(env, step.parent), `/${pointerKey(step.property)}`, "containment", recipe.phase);
          if (recipe.phase === "normalize") failContract("profile-producer");
          break;
        case "place":
          binding(env, step.target); binding(env, step.owner); if (step.anchor) binding(env, step.anchor);
          if (step.related) select(step.related, env, params, recipe.phase); break;
        case "emit": {
          const expected = { page: ["id", "name"], node: ["id"], edge: ["id", "source", "target"], label: ["id", "text"], metadata: ["name", "value"] } as Record<string, string[]>;
          for (const f of step.fields) expectType(value(f.value, env, params, "emit.fields"), ["fontSize", "strokeWidth"].includes(f.name) ? "number" : "string", "profile-export-field");
          if (expected[step.kind]!.some(name => !step.fields.some((f: Ast) => f.name === name))) failContract("profile-export-field");
          if (step.parent) expectType(value(step.parent, env, params, "emit.parent"), "string", "profile-export-field");
          break;
        }
        case "loss": case "refuse": binding(env, step.target); break;
        case "remove": binding(env, step.target); for (const s of step.dependents) select(s, env, params, recipe.phase); break;
      }
    }
    for (const w of recipe.writes) if (!["envelope", "artifact"].includes(w.binding)) binding(env, w.binding);
  }
  const themeNames = new Set<string>();
  for (const theme of p.themes) {
    for (const name of [theme.id, ...theme.aliases]) { if (themeNames.has(name)) failContract("profile-symbol"); themeNames.add(name); }
    unique(theme.tokens, "name"); unique(theme.glyphs, "id"); unique(theme.syntheticOccurrences, "id");
    symbol(resources, theme.metricsResource);
    if (theme.fallback) symbol(themes, theme.fallback);
    for (const glyph of theme.glyphs) { checkStaticRule("CR-09", { glyph }, {}); if (glyph.nativeType) type(glyph.nativeType); }
  }
  const active = new Set<string>(), done = new Set<string>();
  function visit(id: string): void { if (active.has(id)) failContract("profile-cycle"); if (done.has(id)) return; active.add(id); const t = symbol(themes, id); if (t.fallback) visit(t.fallback); active.delete(id); done.add(id); }
  for (const id of themes.keys()) visit(id);
  function icon(i: Ast): Ast { const theme = symbol(themes, i.theme); symbol(unique(theme.glyphs, "id"), i.glyph); return theme; }
  function tokens(items: Ast[], theme: Ast): void {
    const known = unique(theme.tokens, "name"); unique(items, "name");
    for (const token of items) if (typeof token.value !== typeof symbol(known, token.name).value) failContract("profile-type");
  }
  function ui(entry: Ast, env: Env, valueType = "string"): void {
    symbol(messages, entry.label); if (entry.message) symbol(messages, entry.message);
    if (entry.visible) predicate(entry.visible, env, new Map(), "ui");
    if (entry.mutable) predicate(entry.mutable, env, new Map(), "ui");
    if (entry.when) predicate(entry.when, env, new Map(), "ui");
    for (const t of entry.targetTypes ?? []) type(t);
    const command = entry.command ?? entry.recipe;
    if (command) checkStaticRule("CR-10", entry, { recipe: symbol(recipes, command), sourceTypes: { owner: "element", target: "element", source: "element", key: "string", value: valueType } });
    else checkStaticRule("CR-10", entry, {});
  }
  for (const n of p.notions) {
    const env = baseEnv(); env.set("self", { types: n.nativeTypes });
    const boundThemes = new Set<string>();
    for (const b of n.renderBindings) {
      if (boundThemes.has(b.theme)) failContract("profile-type"); boundThemes.add(b.theme);
      tokens(b.tokens, icon(b)); expectType(value(b.label, env, new Map(), "render"), "string");
    }
    for (const f of n.fields) { const primitive = read(binding(env, "self"), f.path); ui(f, env, f.widget === "reference" ? "element" : primitive === "scalar" ? "string" : primitive); }
  }
  for (const theme of p.themes) for (const s of theme.syntheticOccurrences) {
    const env = baseEnv(); env.set("self", select(s.select, env, new Map(), "render"));
    expectType(value(s.label, env, new Map(), "render"), "string"); symbol(unique(theme.glyphs, "id"), s.glyph); tokens(s.tokens, theme);
  }
  for (const entry of p.ui) { icon(entry.icon); ui(entry, baseEnv()); }
  for (const endpoint of p.exports) {
    for (const id of endpoint.recipes) if (symbol(recipes, id).phase !== "export") failContract("profile-type");
    for (const cap of endpoint.capabilities) predicate(cap.when, baseEnv(), new Map(), "capability");
  }
  for (const m of p.messages) unique(m.texts, "name");
  // Aliases share their declared kind's namespace, including canonical IDs.
  const aliasNames = new Set<string>();
  for (const a of p.compatibilityAliases) {
    const key = `${a.kind}:${a.old}`;
    if (aliasNames.has(key)) failContract("profile-symbol"); aliasNames.add(key);
    if (a.mode !== "remove" && a.kind === "theme") symbol(themes, a.destination);
    if (a.mode !== "remove" && a.kind === "export") symbol(unique(p.exports, "id"), a.destination);
  }
}
