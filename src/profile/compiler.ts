import { canonicalDigest, canonicalize, ProfileContractError } from "./canonical.js";
import { choice } from "./boundary.js";
import { compileSchema, defaultParseLimits, parseProfileText } from "./contracts.js";
import type { SchemaValidator } from "./contracts.js";
import { profileIdentity } from "./envelope.js";
import type { CompleteProfileDocument, ProfileIdentity } from "./envelope.js";
import { checkActionPhase, checkStaticRule, requiredWrites, verifyResourcePins } from "./static-contracts.js";
import { MISSING, cloneJson, descriptorIndex, failContract, freezeJson, listDanglingReferences, nativeIndex, pointerKey, typeMatches, validateNativeReferences } from "./native-contracts.js";
import type { DescriptorIndex, NativeNode, SupportBinding } from "./native-contracts.js";
import { applyUnicodeCase } from "./unicode-case.js";
import type { UnicodeCaseTable } from "./unicode-case.js";
import type { PureResult } from "./results.js";
import { admitCompilerAuthority, checkCompilerSchema, checkRuleTable, snapshotCompilerInputs } from "./compiler-authority.js";
import type { AuthorityField, CompilerInputs, CompilerAuthority } from "./compiler-authority.js";
import { checkWholeProfile } from "./compiler-static.js";

const VALUE_OPS = ["literal", "read", "id", "ids", "param", "concat", "stripPrefix", "case", "outputId"] as const;
const PREDICATE_OPS = ["true", "false", "all", "any", "not", "typeIs", "present", "equal", "textPrefix", "count", "boundRole", "recognizes", "reachable"] as const;
const ACTION_OPS = ["bind", "create", "ensure", "set", "unset", "assignRef", "reparent", "place", "emit", "loss", "remove", "refuse"] as const;
const STAGES = ["import", "pre-normalize", "post-normalize", "post-layout", "release"] as const;
const RECIPE_PHASES = ["create", "edit", "complete", "normalize", "reference", "export", "convert", "migrate"] as const;
const LOSS_CLASSES = ["semantic-type", "relation-kind", "navigation", "appearance", "layout", "metadata", "unsupported-feature", "provenance-unavailable"] as const;

const opCapability: Readonly<Record<string, string>> = Object.freeze({
  literal: "predicates/1", read: "predicates/1", id: "predicates/1", ids: "predicates/1", param: "predicates/1",
  concat: "predicates/1", stripPrefix: "predicates/1", case: "predicates/1", outputId: "predicates/1",
  true: "predicates/1", false: "predicates/1", all: "predicates/1", any: "predicates/1", not: "predicates/1",
  typeIs: "predicates/1", present: "predicates/1", equal: "predicates/1", textPrefix: "predicates/1",
  boundRole: "predicates/1", recognizes: "predicates/1", count: "selectors/1", reachable: "selectors/1",
  bind: "recipes/1", create: "recipes/1", ensure: "recipes/1", set: "recipes/1", unset: "recipes/1",
  assignRef: "recipes/1", reparent: "recipes/1", place: "recipes/1", remove: "recipes/1", refuse: "recipes/1",
  emit: "export-ir/1", loss: "export-ir/1",
});

type Ast = Record<string, any>;
const record = (value: unknown): Ast => {
  if (!value || typeof value !== "object" || Array.isArray(value)) failContract("profile-schema");
  return value as Ast;
};
const ok = <T>(payload: T): PureResult<T> => ({ status: "ok", payload, diagnostics: [] });
const refused = (code: string): PureResult<never> => ({ status: "refused", code, diagnostics: [] });
const refusalCode = (error: unknown): string => error instanceof ProfileContractError ? error.code ?? "operation-error" : "operation-error";

export interface ValidatedProfile { readonly profile: CompleteProfileDocument; readonly identity: ProfileIdentity }
const admittedProfiles = new WeakMap<ValidatedProfile, CompilerAuthority>();

export function admittedIdRefScalars(validated: ValidatedProfile): readonly string[] {
  return (admittedProfiles.get(validated) ?? failContract("profile-identity-mismatch")).idRefScalars;
}

/** Effective-base producer table for runtime actor checks. Entries are frozen. */
export function admittedAuthorityFields(validated: ValidatedProfile): readonly AuthorityField[] {
  return [...((admittedProfiles.get(validated) ?? failContract("profile-identity-mismatch")).fields as readonly AuthorityField[])];
}

/** Effective-base admitted type names for import projection. */
export function admittedBaseTypes(validated: ValidatedProfile): readonly string[] {
  return [...((admittedProfiles.get(validated) ?? failContract("profile-identity-mismatch")).types as readonly string[])];
}

/** Strict lexical parse, then schema validation, then identity and resource
 * pins. Every lexical code precedes schema and compiler diagnostics. */
export function loadProfile(
  bytes: string | Uint8Array, inputs: CompilerInputs,
): PureResult<ValidatedProfile> {
  try {
    let text: string;
    if (typeof bytes === "string") text = bytes;
    else {
      try {
        text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new ProfileContractError("profile-unicode");
      }
    }
    const limits = inputs.maxBytes === undefined ? defaultParseLimits : { ...defaultParseLimits, maxBytes: inputs.maxBytes };
    const value = parseProfileText(text, limits);
    inputs = snapshotCompilerInputs(inputs);
    checkCompilerSchema(inputs);
    let schema: unknown;
    try {
      schema = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(inputs.schemaBytes));
    } catch {
      throw new ProfileContractError("profile-schema-keyword");
    }
    const validator: SchemaValidator = compileSchema(schema);
    if (!validator(value).valid) {
      // CR-13/14 have normative specialized codes even when a schema
      // conditional detects them. Other syntax errors keep schema precedence.
      if (!value || typeof value !== "object" || Array.isArray(value)) failContract("profile-schema");
      const relaxed = cloneJson(value) as Ast;
      const actionSyntax = compileSchema({ $defs: (schema as Ast).$defs, $ref: "#/$defs/action" });
      let specialized: string | undefined;
      for (const container of [...(Array.isArray(relaxed.recipes) ? relaxed.recipes : []), ...(Array.isArray(relaxed.rules) ? relaxed.rules : [])]) {
        if (!container || typeof container !== "object" || Array.isArray(container)) continue;
        for (const bind of [...(Array.isArray(container.steps) ? container.steps : []), ...(Array.isArray(container.bindings) ? container.bindings : [])]) {
          if (bind?.op === "bind" && Object.hasOwn(bind, "fallbacks") && bind.cardinality !== "first") {
            delete bind.fallbacks; specialized ??= "profile-bind-fallbacks";
          }
        }
        if (container.phase && Array.isArray(container.steps)) {
          for (const [index, step] of container.steps.entries()) {
            if (!actionSyntax(step).valid) continue;
            try { checkActionPhase(step.op, container.phase); }
            catch { container.steps[index] = { op: "refuse", code: "invalid-phase", target: "self" }; specialized ??= "profile-action-phase"; }
          }
        }
      }
      if (specialized && validator(relaxed).valid) throw new ProfileContractError(specialized);
      throw new ProfileContractError("profile-schema");
    }
    const profile = value as CompleteProfileDocument;
    if (profile.$schema !== "urn:profile-mechanism:1:profile" || profile.schemaVersion !== "1.0.0") failContract("profile-schema");
    const authority = admitCompilerAuthority(profile, inputs);
    const identity = profileIdentity(profile);
    const resources = profile.resources as readonly { readonly assetKey: string; readonly sha256: string }[];
    if (resources.length > 0) {
      if (!inputs.assetBag) throw new ProfileContractError("profile-resource-missing");
      verifyResourcePins(resources, inputs.assetBag);
    }
    const validated = freezeJson({ profile: cloneJson(profile), identity });
    admittedProfiles.set(validated, authority);
    return ok(validated);
  } catch (error) {
    return refused(refusalCode(error));
  }
}

export interface RegistrySet {
  readonly compilerRuleTable: CompilerInputs["compilerRuleTable"];
  readonly capabilities: readonly string[];
  readonly signatures: Readonly<Record<string, { readonly capability: string; readonly version: string; readonly argumentSchemaDigest: string }>>;
  readonly descriptors: DescriptorIndex;
  readonly tokenSignatures?: Readonly<Record<string, string>>;
  readonly requiredStandardRules?: readonly string[];
  readonly lintConfigs?: Readonly<Record<string, { readonly extends?: readonly string[]; readonly rules?: Readonly<Record<string, unknown>> }>>;
  readonly lintAllowlist?: readonly string[];
}
export interface CompiledNotion { readonly recognition: unknown; readonly exclusiveGroup?: string; readonly facet?: boolean }
export interface CompiledProfile {
  readonly identity: ProfileIdentity;
  readonly capabilities: readonly string[];
  readonly operatorSignatures: Readonly<Record<string, { readonly capability: string; readonly version: string; readonly argumentSchemaDigest: string }>>;
  readonly notions: Readonly<Record<string, CompiledNotion>>;
  readonly digest: string;
}

function checkValueStructure(value: unknown, location: string, capabilities: Set<string>): void {
  const subject = record(value);
  const op = subject.op;
  if (typeof op !== "string" || !(VALUE_OPS as readonly string[]).includes(op)) failContract("profile-schema");
  capabilities.add(op);
  const text = (field: string): string => {
    if (typeof subject[field] !== "string") failContract("profile-schema");
    return subject[field] as string;
  };
  switch (op) {
    case "literal": {
      const literal = subject.value;
      if (!["string", "number", "boolean"].includes(typeof literal)) failContract("profile-schema");
      if (typeof literal === "number" && !Number.isFinite(literal)) failContract("profile-number");
      return;
    }
    case "read": text("binding"); text("path"); return;
    case "id": text("binding"); return;
    case "ids": {
      if (location !== "assignRef.values") failContract("profile-value-context");
      checkSelectorStructure(record(subject.select), "ids", capabilities);
      return;
    }
    case "param": text("name"); return;
    case "concat": {
      if (!Array.isArray(subject.values) || subject.values.length === 0) failContract("profile-schema");
      for (const item of subject.values) checkValueStructure(item, location, capabilities);
      return;
    }
    case "stripPrefix": {
      checkValueStructure(subject.value, location, capabilities);
      if (typeof subject.prefix !== "string" || !subject.prefix) failContract("profile-schema");
      choice(subject.trim, ["none", "ecma262-2024-start"]);
      return;
    }
    case "case": {
      checkValueStructure(subject.value, location, capabilities);
      choice(subject.mode, ["upper", "lower"]);
      return;
    }
    case "outputId": {
      if (!/^emit\.(?:fields|parent)(?:\.|$)/.test(location)) failContract("profile-value-context");
      text("binding");
      choice(subject.domain, ["page", "node", "edge", "label"]);
      return;
    }
  }
}

function checkSelectorStructure(selector: unknown, location: string, capabilities: Set<string>): void {
  void location;
  const subject = record(selector);
  if (typeof subject.from !== "string" || !subject.from) failContract("profile-schema");
  const via = ["self", "root", "owner", "children", "descendants", "reference", "inverseReference", "all", "pages", "occurrences", "semantic"];
  if (typeof subject.via !== "string" || !via.includes(subject.via)) failContract("profile-schema");
  if (["reference", "inverseReference"].includes(subject.via)) {
    if (typeof subject.property !== "string" || !subject.property) failContract("profile-selector-property");
  } else if (Object.hasOwn(subject, "property") && subject.via !== "children") failContract("profile-selector-property");
  if (subject.order !== "id" && subject.order !== "page-occurrence") failContract("profile-schema");
  checkPredicateStructure(subject.where, capabilities);
}

function checkPredicateStructure(predicate: unknown, capabilities: Set<string>): void {
  const subject = record(predicate);
  const op = subject.op;
  if (typeof op !== "string" || !(PREDICATE_OPS as readonly string[]).includes(op)) failContract("profile-schema");
  capabilities.add(op);
  const text = (field: string, nonempty = true): string => {
    if (typeof subject[field] !== "string" || (nonempty && !subject[field])) failContract("profile-schema");
    return subject[field] as string;
  };
  switch (op) {
    case "true": case "false": return;
    case "all": case "any": {
      if (!Array.isArray(subject.args) || subject.args.length === 0) failContract("profile-schema");
      for (const arg of subject.args) checkPredicateStructure(arg, capabilities);
      return;
    }
    case "not": {
      if (!subject.arg || typeof subject.arg !== "object" || Array.isArray(subject.args)) failContract("profile-schema");
      checkPredicateStructure(subject.arg, capabilities);
      return;
    }
    case "typeIs": text("binding"); text("type"); choice(subject.mode, ["exact", "assignable"]); return;
    case "present": checkValueStructure(subject.value, "predicate", capabilities); return;
    case "equal":
      checkValueStructure(subject.left, "predicate", capabilities);
      checkValueStructure(subject.right, "predicate", capabilities);
      return;
    case "textPrefix":
      checkValueStructure(subject.value, "predicate", capabilities);
      text("prefix");
      choice(subject.trim, ["none", "ecma262-2024-start"]);
      return;
    case "count": {
      checkSelectorStructure(record(subject.select), "count", capabilities);
      if (!Number.isSafeInteger(subject.min) || (subject.min as number) < 0) failContract("profile-bounds");
      if (subject.max !== undefined && (!Number.isSafeInteger(subject.max) || (subject.max as number) < (subject.min as number))) {
        failContract("profile-bounds");
      }
      return;
    }
    case "boundRole": text("binding"); text("owner"); text("role"); return;
    case "recognizes": text("binding"); text("notion"); return;
    case "reachable": {
      checkSelectorStructure(record(subject.from), "reachable.from", capabilities);
      checkSelectorStructure(record(subject.to), "reachable.to", capabilities);
      if (!Array.isArray(subject.edgeTypes) || subject.edgeTypes.length === 0 || subject.edgeTypes.some(t => typeof t !== "string" || !t)) {
        failContract("profile-schema");
      }
      if (!Number.isSafeInteger(subject.minHops) || (subject.minHops as number) < 0) failContract("profile-bounds");
      if (subject.maxHops !== undefined && (!Number.isSafeInteger(subject.maxHops) || (subject.maxHops as number) < (subject.minHops as number))) {
        failContract("profile-bounds");
      }
      return;
    }
  }
}

function checkBindStructure(step: unknown, capabilities: Set<string>): void {
  const subject = record(step);
  capabilities.add("bind");
  checkSelectorStructure(subject.select, "bind", capabilities);
  if (typeof subject.as !== "string" || !subject.as) failContract("profile-schema");
  choice(subject.cardinality, ["one", "zeroOrOne", "first"]);
  if (Object.hasOwn(subject, "fallbacks")) {
    if (subject.cardinality !== "first") failContract("profile-bind-fallbacks");
    if (!Array.isArray(subject.fallbacks)) failContract("profile-schema");
    for (const fallback of subject.fallbacks) checkSelectorStructure(fallback, "bind.fallback", capabilities);
  }
}

function checkActionStructure(step: unknown, phase: string, capabilities: Set<string>): void {
  const subject = record(step);
  const op = subject.op;
  if (typeof op !== "string" || !(ACTION_OPS as readonly string[]).includes(op)) failContract("profile-schema");
  capabilities.add(op);
  const text = (field: string): string => {
    if (typeof subject[field] !== "string" || !subject[field]) failContract("profile-schema");
    return subject[field] as string;
  };
  const checkStepsValue = (value: unknown, location: string): void => checkValueStructure(value, location, capabilities);
  switch (op) {
    case "bind": checkBindStructure(subject, capabilities); return;
    case "refuse": text("code"); text("target"); return;
    case "create": {
      text("as"); text("type"); text("parent"); text("property");
      choice(subject.identity, ["allocated", "containment"]);
      if (subject.identity === "allocated") {
        if (typeof subject.slot !== "string" || !subject.slot) failContract("profile-create-identity");
        if (!subject.ownerId || typeof subject.ownerId !== "object" || !subject.key || typeof subject.key !== "object") {
          failContract("profile-create-identity");
        }
      } else if (subject.ownerId !== undefined || subject.slot !== undefined || subject.key !== undefined) {
        failContract("profile-create-identity");
      }
      if (!Array.isArray(subject.fields)) failContract("profile-schema");
      for (const field of subject.fields) {
        const entry = record(field);
        if (typeof entry.name !== "string" || !entry.name) failContract("profile-schema");
        checkStepsValue(entry.value, "create.fields");
      }
      return;
    }
    case "ensure": {
      text("as"); text("type"); text("parent"); text("property"); text("owner"); text("role");
      // Only support objects allocate through ensure; anything else needs an
      // explicit producer, refused here.
      if (!["bpmn:Collaboration", "bpmn:Participant", "bpmn:LaneSet", "bpmn:Lane"].includes(subject.type as string)) {
        failContract("profile-producer");
      }
      if (typeof subject.slot !== "string" || !subject.slot) failContract("profile-create-identity");
      checkStepsValue(subject.ownerId, "ensure.ownerId");
      checkStepsValue(subject.key, "ensure.key");
      if (!Array.isArray(subject.fields)) failContract("profile-schema");
      for (const field of subject.fields) {
        const entry = record(field);
        if (typeof entry.name !== "string" || !entry.name) failContract("profile-schema");
        checkStepsValue(entry.value, "ensure.fields");
      }
      return;
    }
    case "set": case "unset": {
      text("target"); text("path");
      if ((subject.path as string).split("/").at(-1) === "id") failContract("profile-producer");
      if (op === "set") checkStepsValue(subject.value, "set.value");
      return;
    }
    case "assignRef": {
      text("target"); text("path");
      choice(subject.mode, ["replace", "appendUnique", "remove"]);
      if (!Array.isArray(subject.values)) failContract("profile-schema");
      for (const item of subject.values) checkStepsValue(item, "assignRef.values");
      return;
    }
    case "reparent": {
      text("target"); text("parent"); text("property");
      choice(subject.position, ["first", "last", "preserve"]);
      return;
    }
    case "place": text("target"); text("owner"); text("region"); return;
    case "emit": {
      text("as");
      choice(subject.kind, ["page", "node", "edge", "label", "metadata"]);
      if (!Array.isArray(subject.fields)) failContract("profile-schema");
      const names = new Set<string>();
      const required: Readonly<Record<string, readonly string[]>> = {
        page: ["id", "name"], node: ["id"], edge: ["id", "source", "target"], label: ["id", "text"], metadata: ["name", "value"],
      };
      const optional: Readonly<Record<string, readonly string[]>> = {
        page: [], node: ["name", "shape", "fill", "stroke", "textColor", "fontFamily", "fontSize", "strokeWidth"],
        edge: ["name", "stroke", "dash", "arrow", "strokeWidth"], label: [], metadata: [],
      };
      for (const field of subject.fields) {
        const entry = record(field);
        if (typeof entry.name !== "string" || names.has(entry.name)) failContract("profile-export-field");
        names.add(entry.name);
        const allowed = [...required[subject.kind as string]!, ...optional[subject.kind as string]!];
        if (!allowed.includes(entry.name)) failContract("profile-export-field");
        checkStepsValue(entry.value, "emit.fields");
      }
      for (const name of required[subject.kind as string]!) if (!names.has(name)) failContract("profile-export-field");
      if (subject.kind === "page" && Object.hasOwn(subject, "parent")) failContract("profile-type");
      return;
    }
    case "loss": {
      text("target");
      choice(subject.code, LOSS_CLASSES);
      return;
    }
    case "remove": {
      text("target");
      checkSelectorStructure(record(subject.dependents), "remove.dependents", capabilities);
      choice(subject.policy, ["refuseIfReferenced", "includeDeclared"]);
      return;
    }
  }
}

function checkRecipeStructure(recipe: unknown, capabilities: Set<string>): void {
  const subject = record(recipe);
  if (typeof subject.id !== "string" || !subject.id) failContract("profile-schema");
  if (typeof subject.phase !== "string" || !(RECIPE_PHASES as readonly string[]).includes(subject.phase)) failContract("profile-schema");
  checkSelectorStructure(record(subject.select), "recipe.select", capabilities);
  checkPredicateStructure(subject.when, capabilities);
  if (!Array.isArray(subject.writes)) failContract("profile-schema");
  if (!Array.isArray(subject.steps) || subject.steps.length === 0) failContract("profile-schema");
  const steps = subject.steps as Ast[];
  for (const step of steps) checkActionStructure(step, subject.phase as string, capabilities);
  if (subject.writes.length === 0 && !steps.every(step => ["bind", "refuse"].includes(step.op as string))) {
    failContract("profile-write-set");
  }
  for (const step of steps) checkActionPhase(step.op as string, subject.phase as string);
  const declared = new Set((subject.writes as unknown[]).map(write => canonicalize(write)));
  for (const step of steps) {
    for (const write of requiredWrites(step)) {
      if (!declared.has(canonicalize(write))) failContract("profile-write-set");
    }
  }
}

function collectRecognizes(value: unknown, found: Set<string>): void {
  const subject = record(value);
  if (subject.op === "recognizes" && typeof subject.notion === "string") found.add(subject.notion);
  for (const key of ["args", "arg", "value", "left", "right", "from", "to"]) {
    const child = subject[key];
    if (Array.isArray(child)) {
      for (const item of child) if (item && typeof item === "object") collectRecognizes(item, found);
    } else if (child && typeof child === "object") collectRecognizes(child, found);
  }
  for (const key of ["select", "where", "when", "assert"]) {
    const child = subject[key];
    if (child && typeof child === "object") collectRecognizes(child, found);
  }
}

/** Whole-profile static compile over admitted, immutable authority. */
export function compileProfile(validated: ValidatedProfile, registry: RegistrySet): PureResult<CompiledProfile> {
  try {
    const authority = admittedProfiles.get(validated) ?? failContract("profile-identity-mismatch");
    registry = cloneJson(registry);
    if (canonicalize(profileIdentity(validated.profile)) !== canonicalize(validated.identity)) failContract("profile-identity-mismatch");
    checkRuleTable(registry.compilerRuleTable);
    if (canonicalize(descriptorIndex({ types: registry.descriptors })) !== canonicalize(authority.descriptors)) failContract("descriptor-mismatch");
    const profile = cloneJson(validated.profile);
    const ids = new Map<string, string>();
    const takeIds = (section: string, key: string): void => {
      const items = (profile as unknown as Record<string, readonly Ast[] | undefined>)[section] ?? [];
      for (const item of items) {
        const id = (item as Ast)[key];
        if (typeof id !== "string" || !id) failContract("profile-schema");
        if (ids.has(`${section}:${id}`)) failContract("profile-symbol");
        ids.set(`${section}:${id}`, section);
      }
    };
    takeIds("notions", "id"); takeIds("rules", "id"); takeIds("recipes", "id");
    const capabilities = new Set<string>();
    const notions: Record<string, CompiledNotion> = {};
    const notionIds = new Set<string>();
    for (const notion of profile.notions as readonly Ast[]) {
      const id = notion.id as string;
      notionIds.add(id);
      const hasFacet = Object.hasOwn(notion, "facet");
      const hasGroup = typeof notion.exclusiveGroup === "string" && notion.exclusiveGroup.length > 0;
      if (hasFacet === hasGroup) failContract("profile-notion-kind");
      if (hasFacet && notion.facet !== true) failContract("profile-notion-kind");
      checkPredicateStructure(notion.recognition, capabilities);
      for (const recipeId of [...(notion.createRecipe ? [notion.createRecipe] : []), ...((notion.referenceRecipes ?? []) as string[])]) {
        if (typeof recipeId !== "string") failContract("profile-schema");
      }
      notions[id] = {
        recognition: cloneJson(notion.recognition),
        ...(hasGroup ? { exclusiveGroup: notion.exclusiveGroup as string } : {}),
        ...(hasFacet ? { facet: true as const } : {}),
      };
    }
    const recipeIds = new Set((profile.recipes as readonly Ast[]).map(recipe => {
      if (typeof recipe.id !== "string" || !recipe.id) failContract("profile-schema");
      return recipe.id;
    }));
    for (const notion of profile.notions as readonly Ast[]) {
      for (const recipeId of [...(notion.createRecipe ? [notion.createRecipe] : []), ...((notion.referenceRecipes ?? []) as string[])]) {
        if (!recipeIds.has(recipeId as string)) failContract("profile-symbol");
      }
      const refs = new Set<string>();
      collectRecognizes(notion.recognition, refs);
      for (const ref of refs) if (!notionIds.has(ref)) failContract("profile-symbol");
    }
    for (const rule of profile.rules as readonly Ast[]) {
      if (typeof rule.id !== "string" || !rule.id) failContract("profile-schema");
      if (typeof rule.phase !== "string" || !(STAGES as readonly string[]).includes(rule.phase)) failContract("profile-schema");
      checkSelectorStructure(record(rule.select), "rule.select", capabilities);
      checkPredicateStructure(rule.assert, capabilities);
      if (rule.bindings !== undefined) {
        if (!Array.isArray(rule.bindings)) failContract("profile-schema");
        for (const binding of rule.bindings) checkBindStructure(record(binding), capabilities);
      }
      const refs = new Set<string>();
      collectRecognizes(rule.select, refs); collectRecognizes(rule.assert, refs);
      for (const ref of refs) if (!notionIds.has(ref)) failContract("profile-symbol");
    }
    for (const recipe of profile.recipes as readonly Ast[]) checkRecipeStructure(recipe, capabilities);
    checkWholeProfile(profile, authority);
    const collectOperators = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (!Array.isArray(value) && Object.hasOwn(value, "op")) capabilities.add((value as Ast).op as string);
      for (const child of Object.values(value)) collectOperators(child);
    };
    collectOperators(profile);
    const depends = new Map<string, Set<string>>();
    for (const id of notionIds) depends.set(id, new Set());
    for (const notion of profile.notions as readonly Ast[]) {
      const refs = new Set<string>();
      collectRecognizes(notion.recognition, refs);
      for (const ref of refs) depends.get(notion.id as string)!.add(ref);
    }
    const visiting = new Set<string>(), visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) failContract("profile-cycle");
      visiting.add(id);
      for (const dep of depends.get(id)!) visit(dep);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of notionIds) visit(id);
    if (!Array.isArray(profile.placements) || profile.placements.length > 0) failContract("profile-schema");
    for (const ui of profile.ui as readonly Ast[]) {
      const entry = record(ui);
      if (entry.widget === "readonly" && Object.hasOwn(entry, "command")) failContract("profile-type");
      if (entry.widget === "enum") {
        const choices = entry.choices;
        if (!Array.isArray(choices) || choices.length === 0 ||
          new Set(choices.map(choice => canonicalize((choice as Ast).value))).size !== choices.length) failContract("profile-type");
      }
      if (entry.widget === "reference" && (!Array.isArray(entry.targetTypes) || entry.targetTypes.length === 0)) failContract("profile-type");
    }
    const recipePhases: Record<string, string> = {};
    for (const recipe of profile.recipes as readonly Ast[]) recipePhases[recipe.id as string] = recipe.phase as string;
    for (const migration of profile.migrations as readonly Ast[]) {
      const recipes = (migration as Ast).recipes as readonly string[] | undefined;
      for (const id of recipes ?? []) {
        if (!recipeIds.has(id)) failContract("profile-symbol");
      }
      checkStaticRule("CR-12", migration, {
        containingProfile: { id: profile.profile, version: profile.version },
        containingIdentity: cloneJson(validated.identity),
        recipePhases,
      });
    }
    for (const endpoint of profile.exports as readonly Ast[]) {
      for (const id of ((endpoint as Ast).recipes ?? []) as readonly string[]) {
        if (!recipeIds.has(id)) failContract("profile-symbol");
      }
    }
    for (const table of profile.validation as readonly Ast[]) {
      if (table.extends.length) {
        checkStaticRule("CR-08", { extends: table.extends }, { allowlist: registry.lintAllowlist ?? [], configs: registry.lintConfigs ?? {} });
        checkStaticRule("CR-05", { extends: table.extends }, { configs: registry.lintConfigs ?? {} });
      }
    }
    checkStaticRule("CR-08", { validation: profile.validation }, {
      requiredStages: [...STAGES], policies: ["draft", "accept"],
      standardRules: [...(registry.requiredStandardRules ?? [])], rules: profile.rules,
    });
    const tokenSignatures: Record<string, string> = {};
    for (const theme of profile.themes as readonly Ast[]) {
      for (const token of ((theme as Ast).tokens ?? []) as readonly Ast[]) {
        if (token && typeof token.name === "string" && typeof token.type === "string") tokenSignatures[token.name] = token.type;
      }
    }
    for (const notion of profile.notions as readonly Ast[]) {
      const presentation: Record<string, unknown> = {};
      for (const key of ["facet", "exclusiveGroup", "glyph", "tokens"] as const) {
        if (notion[key] !== undefined) presentation[key] = notion[key];
      }
      checkStaticRule("CR-09", presentation, {
        tokenSignatures: { ...tokenSignatures, ...(registry.tokenSignatures ?? {}) },
      });
    }
    const declaredCapabilities = profile.capabilities as readonly string[];
    checkStaticRule("CR-01", { capabilities: declaredCapabilities }, { known: registry.capabilities, required: ["predicates/1", "selectors/1", "recipes/1", "profile-lint/1", "render-data/1", "export-ir/1"] });
    if (canonicalize([...registry.capabilities].sort()) !== canonicalize([...authority.registrySignature.capabilities].sort())) failContract("profile-capability");
    for (const capability of declaredCapabilities) {
      if (typeof capability !== "string" || !/^[A-Za-z_][A-Za-z0-9_.:/-]*\/[1-9][0-9]*$/.test(capability)) failContract("profile-capability");
    }
    if (profile.validation.length > 0 && !declaredCapabilities.includes("profile-lint/1")) failContract("profile-capability");
    if (profile.exports.length > 0 && !declaredCapabilities.includes("export-ir/1")) failContract("profile-capability");
    if (profile.themes.length > 0 && !declaredCapabilities.includes("render-data/1")) failContract("profile-capability");
    const operatorSignatures: Record<string, { readonly capability: string; readonly version: string; readonly argumentSchemaDigest: string }> = {};
    for (const op of [...capabilities].sort()) {
      const candidate = registry.signatures[op];
      const capability = opCapability[op] as string;
      if (!candidate || candidate.capability !== capability || !declaredCapabilities.includes(capability) || !registry.capabilities.includes(capability)) {
        failContract("profile-capability");
      }
      if (!Object.hasOwn(authority.registrySignature.signatures, op) || canonicalize(candidate) !== canonicalize(authority.registrySignature.signatures[op])) failContract("profile-capability");
      const signature = candidate as { readonly capability: string; readonly version: string; readonly argumentSchemaDigest: string };
      if (signature.version !== "1" || !/^[0-9a-f]{64}$/.test(signature.argumentSchemaDigest)) failContract("profile-capability");
      operatorSignatures[op] = { capability: signature.capability, version: signature.version, argumentSchemaDigest: signature.argumentSchemaDigest };
    }
    const identity = validated.identity;
    const data = {
      identity: cloneJson(identity),
      capabilities: [...new Set([...capabilities].map(op => opCapability[op]!))].sort(),
      operatorSignatures,
      notions: cloneJson(notions),
    };
    const compiled: CompiledProfile = { ...data, digest: canonicalDigest(data) };
    return ok(freezeJson(compiled));
  } catch (error) {
    return refused(refusalCode(error));
  }
}

export interface EvalHandle { readonly node: NativeNode; readonly pointer: string }
export interface EvalContext {
  readonly descriptors: DescriptorIndex;
  readonly tree: NativeNode;
  readonly bindings: Readonly<Record<string, EvalHandle | readonly EvalHandle[]>>;
  readonly supportBindings?: readonly SupportBinding[];
  readonly notions?: Readonly<Record<string, CompiledNotion>>;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly idRefScalars?: readonly string[];
  readonly unicodeCase?: UnicodeCaseTable;
  readonly limits?: { readonly maxAstDepth?: number; readonly maxSelected?: number; readonly maxEvaluations?: number };
  /** Reference admission for this evaluation. Direct calls admit strictly
   * (reference-dangling refuses before evaluation); stage lint passes
   * leniently over trees whose dangling references are reported, not refused. */
  readonly admission?: "strict" | "lenient";
}
interface EvalState { depth: number; evaluations: number; notions: string[]; index: ReturnType<typeof nativeIndex> }

/** Per-tree evaluation index cache. Sibling plans read the immutable
 * phase-start snapshot, so one index build serves every evaluation of a pass
 * (otherwise per-candidate indexing makes C/N quadratic). Trees mutated
 * in place must call invalidateEvalIndex. Keyed by tree and descriptor set;
 * idRefScalars travel with the registry descriptors in every stage flow. */
const indexCache = new WeakMap<NativeNode, WeakMap<object, {
  readonly strict?: ReturnType<typeof nativeIndex>; readonly lenient?: ReturnType<typeof nativeIndex> }>>();

/** Drop a cached evaluation index after in-place tree mutation. */
export function invalidateEvalIndex(tree: NativeNode): void {
  indexCache.delete(tree);
}

/** Host input admission: node and byte caps return resource-limit. */
export function checkHostInputLimits(tree: NativeNode): void {
  let nodes = 0;
  const stack: unknown[] = [tree];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) stack.push(current[i]);
      continue;
    }
    if (!current || typeof current !== "object") continue;
    if (typeof (current as NativeNode).$type === "string") {
      nodes += 1;
      if (nodes > HOST_RESOURCE_LIMITS.maxInputNodes) return failContract("resource-limit");
    }
    for (const value of Object.values(current)) stack.push(value);
  }
  if (new TextEncoder().encode(canonicalize(tree)).length > HOST_RESOURCE_LIMITS.maxInputBytes) {
    return failContract("resource-limit");
  }
}

/** Explicit host resource limits (DESIGN §2.5). Exceeding a limit returns
 * resource-limit with no partial result. Values are pinned: the cost suite
 * asserts them alongside the 800-element budget. */
export const HOST_RESOURCE_LIMITS = Object.freeze({
  maxInputNodes: 10_000,
  maxInputBytes: 8_000_000,
  maxAstDepth: 256,
  maxSelected: 100_000,
  maxEvaluations: 1_000_000,
});

const DEFAULT_MAX_AST_DEPTH = HOST_RESOURCE_LIMITS.maxAstDepth;
const DEFAULT_MAX_SELECTED = HOST_RESOURCE_LIMITS.maxSelected;

function evalState(context: EvalContext): EvalState {
  // Strict admission refuses a dangling tree before evaluation; the lenient
  // index keeps member and identity checks but leaves dangling values to the
  // traversals that actually resolve them, so selections over trees with
  // unrelated dangling references stay decidable.
  const mode = context.admission === "lenient" ? "lenient" : "strict";
  let byDescriptors = indexCache.get(context.tree);
  if (!byDescriptors) {
    byDescriptors = new WeakMap();
    indexCache.set(context.tree, byDescriptors);
  }
  const cached = byDescriptors.get(context.descriptors)?.[mode];
  if (cached !== undefined) return { depth: 0, evaluations: 0, notions: [], index: cached };
  const index = mode === "lenient"
    ? listDanglingReferences(context.tree, context.descriptors, context.idRefScalars).index
    : validateNativeReferences(context.tree, context.descriptors, context.idRefScalars);
  byDescriptors.set(context.descriptors, { ...byDescriptors.get(context.descriptors), [mode]: index });
  return { depth: 0, evaluations: 0, notions: [], index };
}

function singleHandle(context: EvalContext, name: unknown): EvalHandle {
  if (typeof name !== "string") failContract("profile-symbol");
  const key = name as string;
  if (!Object.hasOwn(context.bindings, key)) failContract("profile-symbol");
  const handle = context.bindings[key] as unknown;
  if (handle && typeof handle === "object" && !Array.isArray(handle) && typeof (handle as EvalHandle).node === "object") {
    return handle as EvalHandle;
  }
  return failContract("profile-type");
}

function childrenOf(state: EvalState, handle: EvalHandle, descriptors: DescriptorIndex): { node: NativeNode; pointer: string; property: string }[] {
  const type = descriptors[handle.node.$type] ?? failContract("profile-type");
  const out: { node: NativeNode; pointer: string; property: string }[] = [];
  for (const [field, allowed] of Object.entries(type.containment)) {
    if (!Object.hasOwn(handle.node, field)) continue;
    const value = handle.node[field];
    const children = Array.isArray(value) ? value : [value];
    children.forEach((child, position) => {
      if (!child || typeof child !== "object" || Array.isArray(child)) failContract("profile-type");
      const node = child as NativeNode;
      if (!allowed.some(name => typeMatches(node.$type, name, "assignable", descriptors))) failContract("profile-type");
      out.push({ node, pointer: `${handle.pointer}/${pointerKey(field)}${Array.isArray(value) ? `/${position}` : ""}`, property: field });
    });
  }
  return out;
}

function orderHandles(handles: readonly EvalHandle[], order: string): EvalHandle[] {
  if (order !== "id" && order !== "page-occurrence") failContract("profile-schema");
  if (order === "page-occurrence") failContract("profile-selector-order");
  const seen = new Set<object>();
  const unique = handles.filter(handle => {
    if (seen.has(handle.node)) return false;
    seen.add(handle.node);
    return true;
  });
  return unique.sort((a, b) => {
    const aId = typeof a.node.id === "string" ? a.node.id : undefined;
    const bId = typeof b.node.id === "string" ? b.node.id : undefined;
    if (aId !== undefined && bId !== undefined) return aId < bId ? -1 : aId > bId ? 1 : 0;
    if (aId !== undefined) return -1;
    if (bId !== undefined) return 1;
    return a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0;
  });
}

function guardDepth(state: EvalState, context: EvalContext): void {
  guardEvaluation(state, context);
  state.depth += 1;
  if (state.depth > (context.limits?.maxAstDepth ?? DEFAULT_MAX_AST_DEPTH)) failContract("resource-limit");
}
function guardEvaluation(state: EvalState, context: EvalContext): void {
  if (++state.evaluations > (context.limits?.maxEvaluations ?? 1_000_000)) failContract("resource-limit");
}

// A descriptor reference property, or a base-declared ID-valued scalar
// reference. Reference traversal requires one of the two (DESIGN L119);
// a scalar or unknown property is profile-selector-property, never an
// empty selection.
function isReferenceProperty(descriptors: DescriptorIndex, idRefScalars: readonly string[] | undefined, field: string): boolean {
  for (const [typeName, type] of Object.entries(descriptors)) {
    if (Object.hasOwn(type.references, field)) return true;
    if (type.scalars.includes(field) && (idRefScalars ?? []).includes(`${typeName}.${field}`)) return true;
  }
  return false;
}
function doSelect(selector: unknown, context: EvalContext, state: EvalState): EvalHandle[] {
  guardDepth(state, context);
  try { return selectAtDepth(selector, context, state); } finally { state.depth -= 1; }
}
function selectAtDepth(selector: unknown, context: EvalContext, state: EvalState): EvalHandle[] {
  const subject = record(selector);
  if (typeof subject.from !== "string" || !Object.hasOwn(context.bindings, subject.from)) failContract("profile-symbol");
  const from = context.bindings[subject.from]!;
  const starts = (Array.isArray(from) ? [...from] : [from]).filter(handle => handle && typeof handle === "object" && handle.node && typeof handle.node === "object");
  if (starts.length !== (Array.isArray(from) ? from.length : 1)) failContract("profile-type");
  const viaList = ["self", "root", "owner", "children", "descendants", "reference", "inverseReference", "all", "pages", "occurrences", "semantic"];
  if (!viaList.includes(subject.via as string)) failContract("profile-schema");
  if (subject.order !== "id" && subject.order !== "page-occurrence") failContract("profile-schema");
  const via = subject.via as string;
  let candidates: EvalHandle[] = [];
  const byId = state.index.byId;
  switch (via) {
    case "self": candidates = starts; break;
    case "root": {
      if (context.tree.$type !== "bpmn:Definitions") failContract("profile-type");
      candidates = [{ node: context.tree, pointer: "" }];
      break;
    }
    case "owner": {
      for (const handle of starts) {
        const entry = state.index.entries.find(item => item.node === handle.node);
        if (entry?.parent) {
          const parentEntry = state.index.entries.find(item => item.node === entry.parent);
          if (parentEntry) candidates.push({ node: parentEntry.node, pointer: parentEntry.pointer });
        }
      }
      break;
    }
    case "children": case "descendants": {
      const property = Object.hasOwn(subject, "property") ? subject.property : undefined;
      if (property !== undefined && typeof property !== "string") failContract("profile-selector-property");
      const walk = (handle: EvalHandle, deep: boolean): void => {
        for (const child of childrenOf(state, handle, context.descriptors)) {
          if (property === undefined || child.property === property) candidates.push({ node: child.node, pointer: child.pointer });
          if (deep) walk({ node: child.node, pointer: child.pointer }, true);
        }
      };
      for (const handle of starts) walk(handle, via === "descendants");
      break;
    }
    case "reference": {
      if (typeof subject.property !== "string" || !subject.property) failContract("profile-selector-property");
      const field = (subject.property as string).replace(/~1/g, "/").replace(/~0/g, "~");
      // Heterogeneous candidates lacking this optional reference are skipped
      // per handle below; the property itself must still be a reference.
      if (!isReferenceProperty(context.descriptors, context.idRefScalars, field)) failContract("profile-selector-property");
      for (const handle of starts) {
        const type = context.descriptors[handle.node.$type] ?? failContract("profile-type");
        const isReference = Object.hasOwn(type.references, field);
        const isScalarRef = type.scalars.includes(field) && (context.idRefScalars ?? []).includes(`${handle.node.$type}.${field}`);
        // A declared scalar without this type's ID-reference qualification
        // is profile-selector-property, never a skipped selection; only
        // candidates with no such declared property are skipped.
        if (!isReference && !isScalarRef) {
          if (type.scalars.includes(field)) failContract("profile-selector-property");
          continue;
        }
        const raw = (handle.node as Record<string, unknown>)[field];
        if (raw === undefined) continue;
        const ids = Array.isArray(raw) ? raw : [raw];
        for (const id of ids) {
          if (typeof id !== "string") failContract("profile-type");
          const target = byId.get(id as string);
          if (target === undefined) failContract("reference-dangling");
          const resolved = target as { readonly node: NativeNode; readonly pointer: string };
          if (isReference && !(type.references[field] as readonly string[]).some(name => typeMatches(resolved.node.$type, name, "assignable", context.descriptors))) {
            failContract("profile-type");
          }
          candidates.push({ node: resolved.node, pointer: resolved.pointer });
        }
      }
      break;
    }
    case "inverseReference": {
      if (typeof subject.property !== "string" || !subject.property) failContract("profile-selector-property");
      const field = (subject.property as string).replace(/~1/g, "/").replace(/~0/g, "~");
      if (!isReferenceProperty(context.descriptors, context.idRefScalars, field)) failContract("profile-selector-property");
      const wanted = new Set(starts.filter(handle => typeof handle.node.id === "string").map(handle => handle.node.id as string));
      for (const entry of state.index.entries) {
        const type = context.descriptors[entry.node.$type] ?? failContract("profile-type");
        if (!Object.hasOwn(type.references, field) || !Object.hasOwn(entry.node, field)) continue;
        const raw = entry.node[field];
        const ids = (Array.isArray(raw) ? raw : [raw]).filter(id => typeof id === "string");
        if (ids.some(id => wanted.has(id as string))) candidates.push({ node: entry.node, pointer: entry.pointer });
      }
      break;
    }
    case "all": candidates = state.index.entries.map(entry => ({ node: entry.node, pointer: entry.pointer })); break;
    default: failContract("profile-type");
  }
  const where = subject.where;
  const kept = (where === undefined ? candidates : candidates.filter(candidate =>
    doPredicate(where, { ...context, bindings: { ...context.bindings, self: candidate } }, state)));
  const ordered = orderHandles(kept, subject.order as string);
  if (ordered.length > (context.limits?.maxSelected ?? DEFAULT_MAX_SELECTED)) failContract("resource-limit");
  return ordered;
}

/** Selector evaluation over the immutable phase-start snapshot. Evaluation is
 * pure, so the boundary converts any internal throw to refused; bindings are
 * not reserialized per call (they alias the admission-checked snapshot). */
export function selectHandles(selector: unknown, context: EvalContext): PureResult<readonly EvalHandle[]> {
  try {
    return ok(doSelect(selector, context, evalState(context)));
  } catch (error) {
    return refused(refusalCode(error));
  }
}

const TRIM_START = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);
function trimStartEcma(value: string): string {
  let position = 0;
  while (position < value.length && TRIM_START.has(value.codePointAt(position)!)) {
    position += value.codePointAt(position)! > 0xffff ? 2 : 1;
  }
  return value.slice(position);
}

function doValue(value: unknown, context: EvalContext, state: EvalState, location: string): unknown {
  guardDepth(state, context);
  try { return valueAtDepth(value, context, state, location); } finally { state.depth -= 1; }
}
function valueAtDepth(value: unknown, context: EvalContext, state: EvalState, location: string): unknown {
  const subject = record(value);
  const op = subject.op;
  if (typeof op !== "string" || !(VALUE_OPS as readonly string[]).includes(op)) failContract("profile-schema");
  switch (op) {
    case "literal": {
      if (!["string", "number", "boolean"].includes(typeof subject.value)) failContract("profile-type");
      if (typeof subject.value === "number") {
        if (!Number.isFinite(subject.value)) failContract("profile-number");
        if (Number.isInteger(subject.value) && !Number.isSafeInteger(subject.value)) failContract("profile-number");
      }
      return cloneJson(subject.value);
    }
    case "read": {
      const handle = singleHandle(context, subject.binding);
      if (typeof subject.path !== "string") failContract("profile-type");
      return readValue(handle, subject.path as string, context.descriptors, context.admission === "lenient");
    }
    case "id": {
      const handle = singleHandle(context, subject.binding);
      // A missing ID is an evaluation error outside C identity allocation
      // (DESIGN §2.2). Count/equal guards decide on MISSING from read, never id.
      if (typeof handle.node.id !== "string") return failContract("profile-type");
      return handle.node.id;
    }
    case "ids": {
      if (location !== "assignRef.values") failContract("profile-value-context");
      const handles = doSelect(subject.select, context, state);
      const ids: string[] = [];
      for (const handle of handles) {
        if (typeof handle.node.id !== "string") failContract("profile-type");
        const id = handle.node.id as string;
        if (!ids.includes(id)) ids.push(id);
      }
      return ids;
    }
    case "param": {
      if (typeof subject.name !== "string" || !Object.hasOwn(context.params ?? {}, subject.name)) failContract("profile-symbol");
      return cloneJson((context.params as Record<string, unknown>)[subject.name as string]);
    }
    case "concat": {
      if (!Array.isArray(subject.values) || subject.values.length === 0) failContract("profile-schema");
      return (subject.values as unknown[]).map(item => {
        const part = doValue(item, context, state, location);
        if (typeof part !== "string") failContract("profile-type");
        return part;
      }).join("");
    }
    case "stripPrefix": {
      const raw = doValue(subject.value, context, state, location);
      if (typeof raw !== "string" || typeof subject.prefix !== "string" || !subject.prefix) failContract("profile-type");
      const text = raw as string;
      const trimmed = subject.trim === "ecma262-2024-start" ? trimStartEcma(text) : subject.trim === "none" ? text : failContract("profile-schema");
      const fixed = trimmed as string;
      return fixed.startsWith(subject.prefix as string) ? fixed.slice((subject.prefix as string).length) : text;
    }
    case "case": {
      const raw = doValue(subject.value, context, state, location);
      if (typeof raw !== "string") failContract("profile-type");
      if (subject.mode !== "upper" && subject.mode !== "lower") failContract("profile-schema");
      const table = context.unicodeCase ?? failContract("profile-resource-missing");
      return applyUnicodeCase(raw as string, subject.mode, table);
    }
    case "outputId": {
      if (!/^emit\.(?:fields|parent)(?:\.|$)/.test(location)) failContract("profile-value-context");
      failContract("export-occurrence-ambiguous");
    }
  }
  return failContract("profile-schema");
}

function readValue(handle: EvalHandle, path: string, descriptors: DescriptorIndex, lenient: boolean): unknown {
  if (!/^(?:\/(?:[^~/]|~[01])*)+$/.test(path)) failContract("profile-type");
  const parts = path.slice(1).split("/").map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  // Total raw-member read: a member absent on this node yields MISSING inside
  // stage evaluation, so predicates over heterogeneous candidates stay
  // decidable instead of refusing. A direct read of a field no descriptor
  // declares is a contract error, not a missing value.
  let current: unknown = handle.node;
  for (const [position, field] of parts.entries()) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return MISSING;
    if (position < parts.length - 1) {
      // Intermediate segments traverse known single containment only; array
      // indexing belongs to revision-bound command inputs, never recognition
      // recipes (DESIGN §2.2). Typed record reads keep their plain walk.
      if (/^(0|[1-9][0-9]*)$/.test(field)) return failContract("profile-type");
      const intermediate = current as NativeNode;
      if (typeof intermediate.$type === "string" && descriptors[intermediate.$type] !== undefined &&
        Array.isArray((intermediate as Record<string, unknown>)[field])) {
        return failContract("profile-type");
      }
    }
    if (!Object.hasOwn(current, field)) {
      if (lenient) return MISSING;
      const node = current as { readonly $type?: unknown };
      const type = typeof node.$type === "string" ? descriptors[node.$type] : undefined;
      const declared = field === "$type" || field === "id" || (type !== undefined &&
        (type.scalars.includes(field) || Object.hasOwn(type.containment, field) || Object.hasOwn(type.references, field)));
      if (!declared) failContract("profile-type");
      return MISSING;
    }
    const next = (current as Record<string, unknown>)[field];
    if (next === undefined) return MISSING;
    if (position === parts.length - 1) return cloneJson(next);
    current = next;
  }
  return MISSING;
}

function doPredicate(predicate: unknown, context: EvalContext, state: EvalState): boolean {
  guardDepth(state, context);
  try { return predicateAtDepth(predicate, context, state); } finally { state.depth -= 1; }
}
function predicateAtDepth(predicate: unknown, context: EvalContext, state: EvalState): boolean {
  const subject = record(predicate);
  const op = subject.op;
  if (typeof op !== "string" || !(PREDICATE_OPS as readonly string[]).includes(op)) failContract("profile-schema");
  switch (op) {
    case "true": return true;
    case "false": return false;
    case "all": {
      if (!Array.isArray(subject.args) || subject.args.length === 0) failContract("profile-schema");
      let result = true;
      for (const arg of subject.args) result = doPredicate(arg, context, state) && result;
      return result;
    }
    case "any": {
      if (!Array.isArray(subject.args) || subject.args.length === 0) failContract("profile-schema");
      let result = false;
      for (const arg of subject.args) result = doPredicate(arg, context, state) || result;
      return result;
    }
    case "not": {
      if (!subject.arg || typeof subject.arg !== "object" || Array.isArray(subject.args)) failContract("profile-schema");
      return !doPredicate(subject.arg, context, state);
    }
    case "typeIs": {
      const handle = singleHandle(context, subject.binding);
      if (typeof subject.type !== "string") failContract("profile-schema");
      if (subject.mode !== "exact" && subject.mode !== "assignable") failContract("profile-schema");
      return typeMatches(handle.node.$type, subject.type, subject.mode, context.descriptors);
    }
    case "present": {
      // False only for MISSING (DESIGN §2.2). An absent member already reads
      // as MISSING, so inapplicable reads stay decidable without swallowing
      // evaluation errors.
      return doValue(subject.value, context, state, "predicate") !== MISSING;
    }
    case "equal": {
      const left = doValue(subject.left, context, state, "predicate");
      const right = doValue(subject.right, context, state, "predicate");
      if (left === MISSING || right === MISSING || typeof left !== typeof right) return false;
      return left === right;
    }
    case "textPrefix": {
      const raw = doValue(subject.value, context, state, "predicate");
      if (raw === MISSING) return false;
      if (typeof raw !== "string" || typeof subject.prefix !== "string" || !subject.prefix) failContract("profile-type");
      const text = raw as string;
      const trimmed = subject.trim === "ecma262-2024-start" ? trimStartEcma(text) : subject.trim === "none" ? text : failContract("profile-schema");
      return (trimmed as string).startsWith(subject.prefix as string);
    }
    case "count": {
      const handles = doSelect(subject.select, context, state);
      if (!Number.isSafeInteger(subject.min) || (subject.min as number) < 0) failContract("profile-bounds");
      if (subject.max !== undefined && (!Number.isSafeInteger(subject.max) || (subject.max as number) < (subject.min as number))) {
        failContract("profile-bounds");
      }
      return handles.length >= (subject.min as number) && (subject.max === undefined || handles.length <= (subject.max as number));
    }
    case "boundRole": {
      const one = (name: unknown): EvalHandle | undefined => {
        if (typeof name !== "string" || !Object.hasOwn(context.bindings, name)) return undefined;
        const handle = context.bindings[name] as EvalHandle | readonly EvalHandle[] | undefined;
        if (!handle || Array.isArray(handle)) return undefined;
        const node = (handle as EvalHandle).node;
        return typeof node === "object" && node !== null ? (handle as EvalHandle) : undefined;
      };
      const target = one(subject.binding);
      const owner = one(subject.owner);
      if (typeof subject.role !== "string" || !subject.role) failContract("profile-schema");
      if (!target) return false;
      if (typeof target.node.id !== "string") return false;
      // bindingOwner is the unique owner from a verified support binding
      // targeting this candidate, or MISSING. Ambiguous ownership refuses
      // before recognition (DESIGN §2.2): the shortcut never picks a winner.
      if (!owner) {
        if (subject.owner !== "bindingOwner") return false;
        const owners = new Set((context.supportBindings ?? []).filter(binding =>
          binding.targetId === target.node.id && binding.role === subject.role).map(binding => binding.ownerId));
        if (owners.size > 1) return failContract("support-binding-conflict");
        return owners.size === 1;
      }
      if (typeof owner.node.id !== "string") return false;
      return (context.supportBindings ?? []).some(binding =>
        binding.ownerId === owner.node.id && binding.role === subject.role && binding.targetId === target.node.id);
    }
    case "recognizes": {
      const handle = singleHandle(context, subject.binding);
      if (typeof subject.notion !== "string") failContract("profile-schema");
      const candidate = context.notions?.[subject.notion as string];
      if (!candidate) failContract("profile-symbol");
      const notion = candidate as CompiledNotion;
      if (state.notions.includes(subject.notion as string)) failContract("profile-cycle");
      state.notions.push(subject.notion as string);
      try {
        try {
          return doPredicate(notion.recognition, { ...context, bindings: { ...context.bindings, self: handle } }, state);
        } catch (error) {
          // A refused element recognition is a non-match: the single
          // recognition boundary shared by lint, UI and export. Errors
          // raised outside a notion recognition still propagate.
          if (error instanceof ProfileContractError) return false;
          throw error;
        }
      } finally {
        state.notions.pop();
      }
    }
    case "reachable": {
      const sources = doSelect(subject.from, context, state);
      const targets = doSelect(subject.to, context, state);
      if (!Array.isArray(subject.edgeTypes) || subject.edgeTypes.length === 0) failContract("profile-schema");
      if (!Number.isSafeInteger(subject.minHops) || (subject.minHops as number) < 0) failContract("profile-bounds");
      const maxHops = subject.maxHops === undefined ? state.index.entries.length : subject.maxHops;
      if (!Number.isSafeInteger(maxHops) || (maxHops as number) < (subject.minHops as number)) failContract("profile-bounds");
      const wanted = new Set(targets.filter(handle => typeof handle.node.id === "string").map(handle => handle.node.id as string));
      const edges = new Map<string, string[]>();
      for (const entry of state.index.entries) {
        if (!(subject.edgeTypes as string[]).includes(entry.node.$type)) continue;
        const from = (entry.node as Record<string, unknown>).sourceRef;
        const to = (entry.node as Record<string, unknown>).targetRef;
        if (typeof from !== "string" || typeof to !== "string") continue;
        if (!state.index.byId.has(from) || !state.index.byId.has(to)) continue;
        const list = edges.get(from) ?? [];
        list.push(to);
        edges.set(from, list);
      }
      const start = sources.filter(handle => typeof handle.node.id === "string").map(handle => handle.node.id as string);
      const seen = new Set<string>();
      const queue: [string, number][] = start.map(id => [id, 0]);
      for (const id of start) seen.add(JSON.stringify([id, 0]));
      for (let cursor = 0; cursor < queue.length; cursor++) {
        guardEvaluation(state, context);
        const [current, hops] = queue[cursor]!;
        if (wanted.has(current) && hops >= (subject.minHops as number) && hops <= (maxHops as number)) return true;
        if (hops >= (maxHops as number)) continue;
        for (const next of edges.get(current) ?? []) {
          const key = JSON.stringify([next, hops + 1]);
          if (!seen.has(key)) {
            seen.add(key);
            queue.push([next, hops + 1]);
          }
        }
      }
      return false;
    }
  }
  return failContract("profile-schema");
}

/** Predicate evaluation against the immutable snapshot. Errors are errors, never false. */
export function evaluatePredicate(predicate: unknown, context: EvalContext): PureResult<boolean> {
  try {
    const result = doPredicate(predicate, context, evalState(context));
    if (typeof result !== "boolean") failContract("profile-type");
    return ok(result);
  } catch (error) {
    return refused(refusalCode(error));
  }
}

/** Value evaluation. Missing reads surface the internal MISSING sentinel. */
export function evaluateValue(value: unknown, context: EvalContext, location: string): PureResult<unknown> {
  try {
    return ok(doValue(value, context, evalState(context), location));
  } catch (error) {
    return refused(refusalCode(error));
  }
}






