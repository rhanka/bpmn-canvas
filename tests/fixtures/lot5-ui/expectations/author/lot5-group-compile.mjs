// Group "compile" (and the two historical "surfaces" compile cases): admission
// of the fixture profile and the static UI/field rules (DESIGN §2.4.1 CR-05,
// CR-06, CR-10, §8.3 L655, L659) on hand-edited variant profiles. Variant bytes
// are committed (compact JSON) and pinned like every other fixture.
import { addCase, artifact, pin, cite, fixture, clone, P, PID, pureOk, pureRefused, unsealed } from "./lot5-kit.mjs";

const COMPILE_DEFAULT = "Compilation (A4 loadProfile then compileProfile) uses fixtures/ui-neutral-registry.json with the raw-pinned base, descriptors and metrics asset; a refusal is PureResult {status:\"refused\", code, diagnostics:[]}: no lint stage runs before compilation, so its diagnostics are empty (harmonization B2 applied to PureResult) and no compiled profile is returned.";
export const compileInputs = () => [pin("registry", fixture("fixtures/ui-neutral-registry.json", P.registryDocument)),
  artifact("compile-inputs", { base: "fixtures/ui-neutral-base.json", descriptors: ["fixtures/ui-neutral-descriptors.json"], assets: ["fixtures/ui-neutral-metrics.json"], digestDomain: "raw" })];
/** Variant registry: name -> {file, schemaValid}; read by the seal test's schema self-check. */
export const variants = [];
function variant(name, edit, { schemaValid }) {
  const value = clone(P.profile);
  edit(value);
  const file = fixture(`fixtures/variants/${name}.profile.json`, value, { compact: true });
  variants.push({ name, path: file.path, schemaValid });
  return file;
}
const uiEntry = (v, id) => v.ui.find(e => e.id === id);
const notionField = (v, notion, fieldId) => v.notions.find(n => n.id === notion).fields.find(f => f.id === fieldId);

function refusedCompile(group, nn, slug, { file, code, clauses, discriminates, defaults = [] }) {
  addCase(group, nn, slug, {
    operation: "compileProfile", profileArtifact: { path: file.path, sha256: file.sha256 }, inputArtifacts: compileInputs(),
    expectedArtifacts: [artifact("result", pureRefused(code))], expectedStatus: `refused:${code}`, comparatorIds: ["lot5/result"],
    clauses: [...clauses, cite("2.4.1", 182), cite("10.1", 737)], discriminates, defaults: [COMPILE_DEFAULT, ...defaults],
  });
}

export function compile() {
  // Historical surfaces cases, same numbers.
  refusedCompile("surfaces", 13, "compile-duplicate-upstream", {
    file: variant("duplicate-upstream", v => { uiEntry(v, "UserTask-create").upstreamEntries = ["create.task"]; }, { schemaValid: true }), code: "profile-symbol",
    clauses: [cite("8.3", 659), cite("2.4.1", 190)],
    defaults: ["DESIGN names no dedicated code for a duplicate upstream mapping; CR-05 (unique names per namespace) gives profile-symbol (Python binding S5 §6 rule 3)."],
    discriminates: "Compiler without the L659 upstream-uniqueness check accepts two recipes for create.task." });
  refusedCompile("surfaces", 14, "compile-missing-fallback-text", {
    file: variant("missing-fallback-text", v => { v.messages.find(m => m.id === "entry.task-create").texts = [{ name: "fr", value: "Tâche" }]; }, { schemaValid: true }), code: "profile-symbol",
    clauses: [cite("8.3", 659), cite("2.4.1", 190)],
    defaults: ["DESIGN calls missing fallback text a compiler error without naming a code; CR-05 (every referenced message must exist) gives profile-symbol (Python binding S5 §6 rule 4)."],
    discriminates: "Compiler that accepts a surface label without policies.localeFallback text (falling back to the message key at runtime) instead of rejecting it at compile time." });

  // Admission of the fixture profile itself (written CR review in the README; no compiler output was used).
  addCase("compile", 1, "main-profile-admitted", {
    operation: "compileProfile", inputArtifacts: compileInputs(),
    expectedArtifacts: [artifact("result", pureOk(unsealed("compiled-profile", "object"))), artifact("compiled-identity", PID)],
    expectedStatus: "ok", comparatorIds: ["lot5/result", "lot5/compiled-identity"],
    clauses: [cite("2.4.1", 186), cite("2.4.1", 190), cite("2.4.1", 191), cite("2.4.1", 195), cite("5.1", 430), cite("3.1", 262)],
    defaults: [COMPILE_DEFAULT, "The compiled identity is the §5.1 profileIdentity record of the profile: sha256 = H(profile), base and descriptors pins in the raw digest domain."],
    discriminates: "A compiler that refuses the schema-valid fixture (for example by reading remove.dependents as an array or count.select as selector) or derives the identity from file bytes instead of H(profile)." });
  const cr10 = "CR-10 (§2.4.1 L195): every required recipe parameter supplied exactly once by typed bindings; enums need unique JSON values.";
  // CR-10 arbitration (README "CR-10 arbitration"): the code of the enum clause and of an ill-typed binding.
  const cr10Enum = "CR-10 arbitration: DESIGN names no code for the enum clause (§2.4.1 L195 lists profile-ui-parameters and profile-type; §8.3 L655 names profile-ui-parameters for missing or duplicate required parameters only), so the frozen lot-0 case s2b-cr10-enum-values decides: profile-type.";
  const cr10Typed = "CR-10 arbitration: §8.3 L655 names profile-ui-parameters for missing or duplicate required parameters only and types every source (owner, target and source are native handles, value is the typed submitted value); a binding of another source type is ill-typed content, profile-type (§2.1 L81, §2.4.1 L195), as the block-A CR-10 compiler test.";
  [
    [2, "enum-duplicate-records", v => { notionField(v, "process", "kind").choices.push({ name: "none", value: "None" }); }, false, "profile-schema", [cite("8.3", 655), cite("2.1", 48)],
      "Accepts two identical choice records (schema uniqueItems) or reports a static-rule code before schema validation."],
    [3, "enum-duplicate-values", v => { notionField(v, "process", "kind").choices.push({ name: "nothing", value: "None" }); }, true, "profile-type", [cite("2.4.1", 195), cite("8.3", 655)],
      "Accepts two choice names with the same JSON value (the choice is then ambiguous on submit), or reports the repeated value as a parameter-binding failure (profile-ui-parameters).", [cr10Enum]],
    [4, "enum-empty-choices", v => { notionField(v, "process", "kind").choices = []; }, false, "profile-schema", [cite("8.3", 655)],
      "Accepts an enum widget without choices (the field then renders an empty choice list and every submit refuses), instead of the schema refusal."],
    [5, "field-parameter-missing", v => { notionField(v, "task", "name").parameters = [{ name: "target", source: "target" }]; }, true, "profile-ui-parameters", [cite("2.4.1", 195), cite("8.3", 655)],
      "Accepts a mutable field whose map omits the required rename parameter name (the value would come from an ambient variable)."],
    [6, "id-not-ordinary-input", v => { v.recipes.push({ id: "rewrite-id", phase: "edit", parameters: [{ name: "target", type: "element", required: true }, { name: "id", type: "string", required: true }],
      select: { from: "target", via: "self", where: P.TRUE, order: "id" }, when: P.TRUE, writes: [{ binding: "self", path: "/id", mode: "set" }],
      steps: [{ op: "set", target: "self", path: "/id", value: { op: "param", name: "id" } }] }); }, true, "profile-producer", [cite("2.4", 165), cite("2.4.1", 191), cite("2.4.1", 206), cite("8.3", 653)],
      "Accepts a recipe that sets an existing ID (IDs are not ordinary inputs); the Python binding uses the CR-06 code profile-producer."],
    [7, "mutable-without-command", v => { const f = notionField(v, "task", "name"); delete f.command; delete f.parameters; }, false, "profile-schema", [cite("8.3", 659), cite("8.3", 655)],
      "Accepts a mutable field without a command, so the panel offers an edit that no recipe performs (a generic property write would be the only path)."],
    [8, "mutable-without-parameters", v => { delete notionField(v, "task", "name").parameters; }, false, "profile-schema", [cite("8.3", 655)],
      "Accepts a mutable field with a command but no parameter map, so the recipe parameters would be filled from ambient variables."],
    [9, "readonly-with-command", v => { Object.assign(notionField(v, "process", "executable"), { command: "rename", parameters: [{ name: "target", source: "target" }, { name: "name", source: "value" }] }); }, false, "profile-schema", [cite("8.3", 655), cite("8.3", 659)],
      "Accepts a readonly field that carries a command (the readonly isExecutable field becomes writable through rename)."],
    [10, "reference-empty-target-types", v => { notionField(v, "call", "target").targetTypes = []; }, false, "profile-schema", [cite("8.3", 655)],
      "Accepts a reference widget without admitted target types, so reference picking would offer every element or none."],
    [11, "ui-icon-unknown-glyph", v => { uiEntry(v, "task-create").icon.glyph = "rocket"; }, true, "profile-symbol", [cite("8.3", 655), cite("2.4.1", 190)],
      "Accepts an icon naming a glyph no theme declares and falls back to an upstream default icon at runtime."],
    [12, "ui-label-unknown-message", v => { uiEntry(v, "task-create").label = "entry.unknown"; }, true, "profile-symbol", [cite("2.4.1", 190)],
      "Accepts a label message key that the message table does not define and shows the raw key in the palette."],
    [13, "ui-parameter-duplicate", v => { uiEntry(v, "task-create").parameters.push({ name: "owner", source: "target" }); }, true, "profile-ui-parameters", [cite("2.4.1", 195), cite("8.3", 655)],
      "Accepts a parameter bound twice (last binding wins) instead of refusing the duplicate required parameter."],
    [14, "ui-parameter-missing", v => { const e = uiEntry(v, "task-create"); e.parameters = e.parameters.filter(p => p.name !== "key"); }, true, "profile-ui-parameters", [cite("2.4.1", 195), cite("8.3", 655)],
      "Accepts an entry that omits the required key parameter (allocation would depend on an ambient key)."],
    [15, "ui-parameter-source-type", v => { uiEntry(v, "task-create").parameters.find(p => p.name === "owner").source = "value"; }, true, "profile-type", [cite("2.4.1", 195), cite("8.3", 655), cite("2.1", 81)],
      "Accepts an element parameter bound from the submitted value instead of a validated gesture handle, or reports the ill-typed binding as a missing parameter (profile-ui-parameters).", [cr10Typed]],
    [16, "ui-parameter-unknown", v => { uiEntry(v, "task-create").parameters.push({ name: "label", source: "value" }); }, true, "profile-ui-parameters", [cite("2.4.1", 195), cite("8.3", 655)],
      "Accepts a binding of a parameter the recipe does not declare (an extra label input silently ignored or injected into the recipe)."],
    [17, "upstream-duplicate-within-entry", v => { uiEntry(v, "task-create").upstreamEntries = ["create.task", "create.task"]; }, true, "profile-symbol", [cite("8.3", 659)],
      "Accepts one upstream ID listed twice by one entry (the schema admits it; the L659 uniqueness rule refuses it)."],
  ].forEach(([nn, slug, edit, schemaValid, code, clauses, discriminates, decided = []]) => refusedCompile("compile", nn, slug, {
    file: variant(slug, edit, { schemaValid }), code, clauses, discriminates,
    defaults: [code === "profile-schema" ? "The pinned schema rejects the record (§2.4.1 L182: the schema is the sole authority for keys, requiredness and enumerations); schema validation precedes the static rules." : cr10, ...decided],
  }));
}
