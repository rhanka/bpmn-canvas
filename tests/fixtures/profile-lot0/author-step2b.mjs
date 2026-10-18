// Standalone expectation AUTHORING TOOL, not a profile library or a test helper.
// Run manually: node author-step2b.mjs /absolute/path/to/DESIGN.md
// All decisions below are literal hand derivations. Only JCS/SHA-256 and data
// assembly are computed. No profile parser, compiler or interpreter is imported.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("./", import.meta.url);
const vendor = new URL("../profile-parity-corpus/profile-mechanism/1/", root);
const read = (name, base = root) => JSON.parse(readFileSync(new URL(name, base), "utf8"));
const save = (name, data) => writeFileSync(new URL(name, root), JSON.stringify(data, null, 2) + "\n");
const clone = x => structuredClone(x);
const sha = x => createHash("sha256").update(x).digest("hex");
const designBytes = readFileSync(process.argv[2]);
const designSha256 = "feb133295c88a54841c62f8a19a81aa2fb4372f4af564d5380d611220e8c3497";
if (sha(designBytes) !== designSha256) throw Error("Wrong design authority");
const designLines = designBytes.toString("utf8").split("\n");
// Restricted to the authored JSON values below. JS sort is UTF-16; stringify
// provides ECMAScript binary64/string rendering. This is not a lexical parser.
const jcs = x => Array.isArray(x) ? `[${x.map(jcs).join(",")}]`
  : x !== null && typeof x === "object" ? `{${Object.keys(x).sort().map(k => `${JSON.stringify(k)}:${jcs(x[k])}`).join(",")}}`
  : JSON.stringify(x);
const hashes = [];
const H = (label, value) => {
  const canonical = jcs(value), digest = sha(canonical);
  hashes.push({ label, domain: "JCS/UTF-8", value: clone(value), canonical, sha256: digest });
  return digest;
};
const B = (label, text) => {
  const digest = sha(text); hashes.push({ label, domain: "raw UTF-8", text, sha256: digest }); return digest;
};
const allocated = (label, owner, slot, key) => `g_${H(label, ["profile-mechanism/1", owner, slot, key])}`;
const profile = read("neutral-profile.json", vendor);
const base = read("neutral-base.json", vendor);
const descriptor = read("neutral-descriptors.json", vendor);
const added = [];
const artifact = (role, json) => ({ role, json: clone(json) });
function add(family, id, operation, input, output, code, refs, derivation, extra = {}) {
  const status = code === "ok" ? "ok" : "refused";
  const verdict = code === "ok" || code === "refused" ? { status } : { status, code };
  const lines = [...new Set(refs)].sort((a, b) => a - b);
  added.push({ caseId: `s2b-${id}`, family, ...extra, operation,
    inputArtifacts: [artifact("input", input)], expectedStatus: code === "ok" || code === "refused" ? code : `refused:${code}`,
    expectedArtifacts: [artifact("verdict", verdict), ...(output === undefined ? [] : [artifact("output", output)])],
    method: "hand-derived", author: "gpt-6-astra / xhigh",
    review: { status: "pending-independent-review", reviewer: null },
    provenance: lines.map(n => `DESIGN.md:${n}`), derivation });
}
const lit = value => ({ op: "literal", value });
const native = { from: "self", via: "self", where: { op: "true" }, order: "id" };
const nativeContext = { bindings: { self: "bpmn:Task", root: "bpmn:Definitions" }, descriptor: "neutral-descriptors.json", base: "neutral-base.json" };
function stat(n, id, subject, context, code, refs, why) {
  const ruleId = `CR-${String(n).padStart(2, "0")}`;
  add("static-rules", `cr${String(n).padStart(2, "0")}-${id}`, "static-rule-check",
    { ruleId, subject, context, boundary: "isolated normative rule; other rules and full-load precedence are not asserted" },
    undefined, code, [180, 183 + n, ...refs], why, { ruleId });
}

// CR-01: capabilities/signatures, with known registry facts supplied as data.
const capContext = { known: ["predicates/1", "selectors/1"], required: ["predicates/1"],
  registrySignature: { operator: "true", capabilityVersion: "1", argumentSchemaDigest: "1".repeat(64) } };
stat(1, "valid", { capabilities: ["predicates/1"], signature: capContext.registrySignature }, capContext, "ok", [46, 243], "The required known capability is present once and its complete registry signature matches.");
stat(1, "unknown", { capabilities: ["predicates/1", "foo/1"] }, capContext, "profile-capability", [46], "The additional foo/1 ID is absent from the known capability set; unknown capabilities refuse.");
stat(1, "duplicate", { capabilities: ["predicates/1", "predicates/1"] }, capContext, "profile-capability", [46], "The same capability appears twice, violating CR-01 uniqueness even though its ID is known.");
stat(1, "missing", { capabilities: ["selectors/1"] }, capContext, "profile-capability", [46], "A true predicate requires predicates/1, which the authored declaration omits.");
stat(1, "signature", { capabilities: ["predicates/1"], signature: { ...capContext.registrySignature, argumentSchemaDigest: "2".repeat(64) } }, capContext, "profile-capability", [243], "The operator and version match but the argument-schema digest differs; signatures require exact equality.");

stat(2, "valid", { location: "assignRef.values", value: { op: "ids", select: native } }, nativeContext, "ok", [110, 164], "An ids operand appears directly in assignRef.values, its only admitted value context.");
stat(2, "ids-scalar", { location: "set.value", value: { op: "ids", select: native } }, nativeContext, "profile-value-context", [110, 164], "An ID array cannot serve as a scalar set value; ids is restricted to assignRef.values.");
stat(2, "output-selection", { location: "export.select.where.equal.left", value: { op: "outputId", binding: "self", domain: "node" } }, { bindings: { self: "OccurrenceHandle" } }, "profile-value-context", [115], "Selection cannot depend on allocation-dependent outputId; only emit fields and parent may use it.");
stat(2, "concat-number", { location: "value", value: { op: "concat", values: [lit("x"), lit(1)] } }, {}, "profile-type", [112], "The number 1 is not a string; concat never coerces scalar operands to text.");
stat(2, "create-reference", { location: "create.fields", type: "bpmn:Association", fields: [{ name: "sourceRef", value: lit("Task_A") }] }, nativeContext, "profile-type", [161, 172], "Creation fields are scalar-only; sourceRef is a descriptor reference and requires assignRef.");

stat(3, "valid", native, nativeContext, "ok", [117, 121, 126], "Native self selection has no property operand and uses the required native ID order.");
stat(3, "order", { ...native, order: "page-occurrence" }, nativeContext, "profile-selector-order", [117, 121, 126], "The self binding is native, so its order must be id rather than page-occurrence.");
stat(3, "property", { ...native, property: "name" }, nativeContext, "profile-selector-property", [117], "The self traversal forbids a property argument; name being known does not permit it.");
stat(3, "missing-property", { ...native, via: "reference" }, { bindings: { self: "bpmn:Association" } }, "profile-selector-property", [117], "A reference selector requires its descriptor reference property and none is supplied.");
stat(3, "domain", { ...native, via: "semantic" }, nativeContext, "profile-type", [122, 128], "The semantic traversal requires an occurrence source; a native Task is the wrong domain.");

stat(4, "valid", { op: "count", select: native, min: 1, max: 1 }, nativeContext, "ok", [145], "Equal inclusive minimum and maximum form a valid bounded count interval.");
stat(4, "count-reversed", { op: "count", select: native, min: 2, max: 1 }, nativeContext, "profile-bounds", [145], "The minimum 2 exceeds maximum 1, so the count interval is invalid before evaluation.");
stat(4, "hops-reversed", { op: "reachable", from: native, to: native, edgeTypes: ["bpmn:SequenceFlow"], minHops: 2, maxHops: 1 }, nativeContext, "profile-bounds", [148], "The lower hop bound exceeds the upper hop bound, independently of graph reachability.");

stat(5, "valid", { symbols: ["a", "b"], references: ["a"], dependencies: [["b", "a"]] }, { namespace: "notions" }, "ok", [79, 130, 147], "Both symbols are unique, the reference resolves, and the one directed dependency is acyclic.");
stat(5, "missing", { symbols: ["a"], references: ["missing"], dependencies: [] }, { namespace: "notions" }, "profile-symbol", [79], "The referenced notion does not exist in the supplied namespace; compilation cannot produce a partial result.");
stat(5, "duplicate", { symbols: ["a", "a"], references: [], dependencies: [] }, { namespace: "notions" }, "profile-symbol", [46, 79], "Duplicate notion IDs violate namespace uniqueness even without a reference to the duplicate.");
stat(5, "cycle", { symbols: ["a", "b"], references: [], dependencies: [["a", "b"], ["b", "a"]] }, { namespace: "notions" }, "profile-cycle", [130, 147], "Mutual recognition dependencies a to b to a form a cycle and fail compilation.");
stat(5, "lint-cycle", { extends: ["plugin:sample/a"] }, { configs: { "plugin:sample/a": { extends: ["plugin:sample/b"] }, "plugin:sample/b": { extends: ["plugin:sample/a"] } } }, "lint-config-cycle", [455], "The pinned lint config graph revisits active config a through b; the resolver cycle code is specific.");

const set = { op: "set", target: "self", path: "/isExecutable", value: lit(false) };
const write = { binding: "self", path: "/isExecutable", mode: "set" };
const authority = { phase: "complete", bindings: { self: "bpmn:Process" }, field: { type: "bpmn:Process", field: "isExecutable", kind: "scalar", producers: ["editor", "import"] }, producerDelta: [] };
const delta = { nativeType: "bpmn:Process", path: "/isExecutable", from: "editor", to: "code", reason: "Authorize completion default" };
stat(6, "valid", { steps: [set], writes: [write] }, { ...authority, producerDelta: [delta] }, "ok", [174, 204, 212, 214], "The explicit delta replaces editor with code for this generated default; its exact scalar write is declared.");
stat(6, "write", { steps: [set], writes: [] }, { ...authority, field: { ...authority.field, producers: ["code"] } }, "profile-write-set", [174, 204], "The scalar action lacks its required declared set write even though the actor is authorized.");
stat(6, "producer", { steps: [set], writes: [write] }, authority, "profile-producer", [204, 212, 214], "Completion uses code, which is absent from this explicitly supplied effective field producer set.");
stat(6, "absent-delta-source", { steps: [set], writes: [write] }, { ...authority, producerDelta: [{ ...delta, from: "ai" }] }, "profile-producer", [214], "The delta cannot replace ai because ai is absent from the original producer set.");
stat(6, "path-kind", { steps: [{ op: "assignRef", target: "self", path: "/isExecutable", values: [lit("Task_A")], mode: "replace" }], writes: [{ ...write, mode: "reference" }] }, { ...authority, producerDelta: [delta] }, "profile-type", [79, 205], "isExecutable is a scalar field; declaring a reference write cannot change its descriptor role.");

const createTask = profile.recipes[0].steps[0];
stat(7, "valid", createTask, { effectiveIdAdmission: true, bindings: { owner: "bpmn:Process" }, parameterTypes: { key: "string", name: "string" } }, "ok", [161, 282, 286], "Task admits ID, allocated identity has explicit ownerId, and the owner ID is a string.");
stat(7, "containment-on-id-type", { op: "create", as: "created", type: "bpmn:Task", parent: "owner", property: "flowElements", identity: "containment", fields: [] }, { effectiveIdAdmission: true }, "profile-create-identity", [161, 286], "Containment identity requires proof that the effective type excludes ID; Task instead admits it.");
stat(7, "allocated-idless", { ...createTask, type: "bpmn:Documentation", property: "documentation", fields: [] }, { effectiveIdAdmission: false }, "profile-create-identity", [161, 286], "Documentation in the neutral effective base is ID-less and must not receive allocated identity.");
stat(7, "owner-number", { ...createTask, ownerId: lit(7) }, { effectiveIdAdmission: true }, "profile-create-identity", [161, 282], "The explicit ownerId evaluates to a number; allocation requires a string owner domain.");

stat(8, "valid", { validation: profile.validation }, { requiredStages: ["import", "pre-normalize", "post-normalize", "post-layout", "release"], policies: ["draft", "accept"], resolver: "pinned recommended plus profile", standardManifest: "bpmnlint-11.15.0-recommended.json", rules: profile.rules }, "ok", [455, 459], "The neutral profile supplies one complete record per stage and policy with explicit standard and applicable profile settings.");
stat(8, "missing-stage", { validation: profile.validation.slice(1) }, { requiredStages: ["import", "pre-normalize", "post-normalize", "post-layout", "release"], policies: ["draft", "accept"] }, "lint-config-incomplete", [459], "Removing import/draft leaves one required stage-policy pair without its validation record.");
stat(8, "unknown-config", { extends: ["plugin:sample/missing"] }, { allowlist: ["plugin:sample/missing"], lookup: "undefined" }, "lint-config-unknown", [451, 455], "A syntactically allowed config name has no factory/config in the pinned resolver and refuses exactly.");
stat(8, "options-schema", { rule: "sample", options: { extra: true } }, { optionsSchema: { type: "object", properties: {}, additionalProperties: false } }, "profile-schema", [191, 455], "The pinned standard-rule options schema is closed and rejects the extra property before lint evaluation.");

stat(9, "valid", { exclusiveGroup: "primary", glyph: profile.themes[0].glyphs[0], tokens: [{ name: "fontSize", value: 12 }] }, { tokenSignatures: { fontSize: "nonnegative finite number" } }, "ok", [152, 691, 695], "The notion selects one group, native glyph shape is complete, and the fontSize token has the declared numeric type.");
stat(9, "notion-kind", { exclusiveGroup: "primary", facet: true }, {}, "profile-notion-kind", [152], "A notion cannot declare both an exclusive group and facet true; neither declaration wins.");
stat(9, "glyph", { glyph: { id: "g", kind: "native", nativeType: "bpmn:Task", viewBox: [0, 0, 0, 80], commands: [] } }, {}, "profile-glyph-shape", [695], "The native glyph width is zero; every glyph needs strictly positive viewBox width and height.");
stat(9, "token-type", { tokens: [{ name: "fontSize", value: "large" }] }, { tokenSignatures: { fontSize: "nonnegative finite number" } }, "profile-type", [691], "The compile-time fontSize token is a string instead of the signature's nonnegative finite number.");

stat(10, "valid", profile.ui[0], { recipe: profile.recipes[0], sourceTypes: { owner: "element", key: "string", value: "string" } }, "ok", [193], "The palette supplies owner, key and name exactly once with types matching all required recipe parameters.");
stat(10, "missing-parameter", { ...profile.ui[0], parameters: profile.ui[0].parameters.slice(0, 2) }, { recipe: profile.recipes[0] }, "profile-ui-parameters", [193], "The required name parameter has no gesture/field binding; the compiler cannot invent it.");
stat(10, "enum-values", { widget: "enum", choices: [{ name: "a", value: 1 }, { name: "b", value: 1 }] }, {}, "profile-type", [63, 193], "Distinct choice names do not make duplicate JSON values distinct; both values are numeric one.");
stat(10, "readonly-command", { widget: "readonly", command: "rename" }, { recipeIds: ["rename"] }, "profile-type", [193], "A readonly field cannot carry a command even when that command resolves successfully.");

const pageEmit = { op: "emit", as: "page", kind: "page", fields: [{ name: "id", value: lit("page_a") }, { name: "name", value: lit("Page A") }] };
stat(11, "valid", pageEmit, { adapter: "export-ir/1", fieldTypes: { id: "string", name: "string" } }, "ok", [167, 208, 763, 765], "A root page emit provides exactly the required string id and name fields and omits parent.");
stat(11, "extra-field", { ...pageEmit, fields: [...pageEmit.fields, { name: "shape", value: lit("rect") }] }, { adapter: "export-ir/1" }, "profile-export-field", [763], "Page shape is outside the closed common page field vocabulary, even if a target format could store it.");
stat(11, "missing-field", { ...pageEmit, fields: pageEmit.fields.slice(0, 1) }, { adapter: "export-ir/1" }, "profile-export-field", [763], "The common page signature requires name as well as id; omitting name refuses compilation.");
stat(11, "wrong-field-type", { ...pageEmit, fields: [{ name: "id", value: lit(7) }, pageEmit.fields[1]] }, { adapter: "export-ir/1" }, "profile-export-field", [763], "Line 763 specifically assigns profile-export-field to wrong common-IR field types; numeric page id violates the string signature.");
stat(11, "output-domain", { ...pageEmit, fields: [{ name: "id", value: { op: "outputId", binding: "self", domain: "node" } }, pageEmit.fields[1]] }, { bindings: { self: "PageHandle" } }, "profile-type", [115, 128], "A PageHandle permits only outputId domain page; node is a domain/type error independent of IR field names.");

stat(12, "valid", profile.migrations[0], { containingProfile: { id: profile.profile, version: profile.version }, recipePhases: { "migrate-process": "migrate" } }, "ok", [321], "The source is an external previous-version pin, the target remains literal self, and the recipe is migrate-phase.");
stat(12, "target-pin", { ...profile.migrations[0], to: { id: profile.profile, version: profile.version, sha256: "a".repeat(64) } }, {}, "profile-migration-endpoint", [321], "An embedded target must remain literal self; a complete explicit target pin is forbidden.");
stat(12, "self-source", { ...profile.migrations[0], from: "self" }, {}, "profile-migration-endpoint", [321], "A migration source must be a complete external pin; the self source is prohibited.");
stat(12, "own-pin", { ...profile.migrations[0], from: { id: profile.profile, version: profile.version, sha256: "a".repeat(64) } }, { containingIdentity: { id: profile.profile, version: profile.version, sha256: "a".repeat(64) } }, "profile-migration-endpoint", [321], "The source pin denotes the containing profile, so it is not an external migration source.");
stat(12, "recipe-phase", profile.migrations[0], { recipePhases: { "migrate-process": "export" } }, "profile-migration-endpoint", [195, 321], "The referenced migration recipe is declared export-phase and cannot transform the source into the target.");

stat(13, "valid", { op: "bind", as: "first", select: native, cardinality: "first", fallbacks: [] }, nativeContext, "ok", [160], "An explicitly present empty fallback list is allowed when cardinality is first.");
for (const location of ["recipe.steps", "rule.bindings"]) for (const cardinality of ["one", "zeroOrOne"]) {
  stat(13, `${location.replace(".", "-")}-${cardinality}`, { op: "bind", as: "chosen", select: native, cardinality, fallbacks: [] }, { ...nativeContext, location }, "profile-bind-fallbacks", [160], "The fallback field is supplied even when empty; only first cardinality admits it in either binding location.");
}
stat(14, "valid", pageEmit, { phase: "export" }, "ok", [208], "Emit is an artifact-only action and is permitted in an export recipe.");
stat(14, "export-set", set, { phase: "export" }, "profile-action-phase", [204, 212], "Export cannot run set; the set authority row excludes export regardless of declared write permission.");
stat(14, "complete-remove", { op: "remove", target: "self", dependents: native, policy: "refuseIfReferenced" }, { phase: "complete" }, "profile-action-phase", [169, 210], "Remove is limited to edit, convert and migrate; completion cannot delete semantic objects.");
stat(14, "edit-place", { op: "place", target: "self", owner: "owner", region: "content", related: native }, { phase: "edit" }, "profile-action-phase", [166, 207], "Place is a normalize-only derived action, so an edit-phase recipe fails its phase preflight.");

const identity = { mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion,
  profile: profile.profile, version: profile.version, sha256: H("neutral complete profile", profile),
  base: profile.base, descriptors: profile.descriptors };
// These are matrix facts, not purported bytes for synthetic profile releases.
// Exact source packages/support have already been verified by the caller of
// this isolated decision boundary unless a witness explicitly changes a fact.
const compatible = { runtime: { mechanisms: ["1"], schemas: ["1.0.0"], capabilities: clone(profile.capabilities),
  assets: ["neutral-metrics.json"] }, injected: clone(identity), document: { documentVersion: "1", profileIdentity: clone(identity) },
  requiredCapabilities: clone(profile.capabilities), requiredAssets: ["neutral-metrics.json"],
  sourcePackage: "known-and-available", envelopeValid: true, selectedMigration: false };
function compat(id, row, change, code, why, extraRefs = []) {
  const input = clone(compatible); change(input);
  add("compatibility", `compat-${id}`, "compatibility-decision", input,
    { acceptedUnderInjectedProfile: code === "ok", sourcePreserved: true, migrationExecuted: false,
      ...(row === 299 ? { genericReadOnlyPreviewAllowed: true } : {}) }, code,
    [294, row, 315, ...extraRefs], why, { matrixRow: row });
}
compat("exact", 313, () => {}, "ok", "All identity dimensions, capabilities and source availability agree; acceptance remains subject to structural/readiness checks.");
for (const version of ["0", "2"]) compat(`document-${version}`, 298, x => { x.document.documentVersion = version; }, "document-version-unsupported", "An unsupported envelope version refuses whether older or newer; no implicit envelope upgrade is allowed.");
compat("missing", 299, x => { delete x.document.profileIdentity; }, "profile-metadata-missing", "The envelope lacks profile identity; only a generic read-only preview is allowed before an explicit activation plan.");
compat("xml-alone", 299, x => { delete x.document; x.sourceFormat = "bpmn-xml"; }, "profile-metadata-missing", "Standalone XML supplies no envelope identity/bindings manifest; exporter metadata cannot activate the injected profile.");
compat("conflict", 300, x => { x.hostIdentity = { ...x.injected, sha256: "b".repeat(64) }; x.snapshotIdentity = x.injected; }, "profile-metadata-conflict", "Host identity conflicts with the snapshot and document; no identity source wins by recency.");
compat("schema", 301, x => { x.injected.schemaVersion = "2.0.0"; }, "profile-schema-version", "The injected profile schema version is not among the runtime's advertised supported schemas.");
compat("mechanism", 301, x => { x.injected.mechanismVersion = "2"; }, "mechanism-version-unsupported", "The injected profile mechanism is unsupported even though its business identity is otherwise familiar.");
compat("document-mechanism", 302, x => { x.document.profileIdentity.mechanismVersion = "2"; }, "document-mechanism-unsupported", "The document mechanism is unsupported by this runtime; applying the supported target cannot reinterpret it.");
compat("mechanism-migration", 303, x => { x.runtime.mechanisms.push("2"); x.document.profileIdentity.mechanismVersion = "2"; }, "mechanism-migration-required", "Both mechanisms are supported but unequal, requiring an explicit migration from the exact source path.");
compat("capability", 304, x => { x.runtime.capabilities = x.runtime.capabilities.filter(c => c !== "recipes/1"); }, "profile-capability", "The required recipes/1 capability is absent and evaluation must not start.");
compat("asset", 304, x => { x.runtime.assets = []; }, "profile-resource-missing", "The required injected metric asset is absent; compatible identities alone do not authorize evaluation.");
compat("base", 305, x => { x.document.profileIdentity.base.sha256 = "c".repeat(64); }, "base-mismatch", "The document and injected profile pin different base digests and no migration has been selected.");
compat("descriptor", 305, x => { x.document.profileIdentity.descriptors[0].sha256 = "d".repeat(64); }, "descriptor-mismatch", "The descriptor ID/version agree but the exact digest differs; descriptor pins are not interchangeable.");
compat("business-id", 306, x => { x.document.profileIdentity.profile = "other/1"; }, "profile-major-mismatch", "Different business profile IDs require explicit business migration even when the native vocabulary matches.");
compat("business-major", 306, x => { x.document.profileIdentity.version = "2.1.0"; }, "profile-major-mismatch", "A different business major cannot be reinterpreted under the injected package.");
compat("digest", 307, x => { x.document.profileIdentity.sha256 = "e".repeat(64); }, "profile-digest-mismatch", "Equal package identity/version with unequal digest is an identity conflict, including a token-only change.");
compat("digest-migration-no-waiver", 307, x => { x.document.profileIdentity.sha256 = "e".repeat(64); x.selectedMigration = true; }, "profile-digest-mismatch", "Selecting a migration cannot waive a conflicting digest under the same package version; a new version is required.");
compat("patch-up", 308, x => { x.injected.version = "1.1.1"; x.injected.sha256 = "a".repeat(64); }, "profile-patch-migration-required", "The source patch is older and both packages are known; even a patch requires explicit migration or exact-source reopening.");
compat("patch-down", 309, x => { x.document.profileIdentity.version = "1.1.1"; x.document.profileIdentity.sha256 = "a".repeat(64); }, "profile-patch-downgrade-required", "The source patch is newer; the injected older patch cannot silently downgrade it.");
compat("minor-up", 310, x => { x.injected.version = "1.2.0"; x.injected.sha256 = "a".repeat(64); }, "profile-minor-migration-required", "The source minor is older; apparent vocabulary compatibility does not authorize automatic migration.");
compat("minor-down", 311, x => { x.document.profileIdentity.version = "1.2.0"; x.document.profileIdentity.sha256 = "a".repeat(64); }, "profile-minor-downgrade-required", "The source minor is newer and must not lose new notions through an automatic downgrade.");
compat("source-unavailable", 312, x => { x.sourcePackage = "unavailable"; }, "profile-source-unavailable", "The exact source package is unavailable; preserving source without a latest fallback is required.");
compat("precedence-version", 298, x => { x.document.documentVersion = "9"; delete x.document.profileIdentity; }, "document-version-unsupported", "Unsupported envelope version is checked before missing metadata, so row 298 wins over row 299.", [299]);
compat("precedence-capability", 304, x => { x.runtime.capabilities = []; x.document.profileIdentity.version = "2.0.0"; }, "profile-capability", "Missing required capability precedes business-major mismatch; the first matching matrix row is 304.", [306]);
compat("precedence-base", 305, x => { x.document.profileIdentity.base.sha256 = "c".repeat(64); x.document.profileIdentity.version = "2.0.0"; }, "base-mismatch", "Base mismatch precedes business-major mismatch; source identity is never interpreted by a later row first.", [306]);

// Exact envelope/revision values. These are boundary witnesses with native
// storage validation supplied as a precondition, not a substitute storage schema.
const tree = { $type: "bpmn:Definitions", id: "Definitions_A", targetNamespace: "urn:neutral:1", exporterVersion: "fixture-2",
  rootElements: [{ $type: "bpmn:Process", id: "Process_A", name: "Source", isExecutable: false,
    flowElements: [{ $type: "bpmn:Task", id: "Task_A", name: "Task", documentation: [{ $type: "bpmn:Documentation", text: "Source\nbytes", textFormat: "text/plain" }] }] }] };
const revision = (label, t = tree, p = identity, bindings = []) => H(label, { tree: t, profileIdentity: p, bindings });
const semanticRevision = revision("baseline semanticRevision");
const envelope = { documentVersion: "1", profileIdentity: identity, tree, bindings: [], semanticRevision };
function env(id, input, output, code, refs, why) {
  add("envelope-revisions", `envelope-${id}`, "envelope-revision-check", input, output, code,
    [258, 262, 421, ...refs], why, { scenario: id });
}
env("valid", { envelope, nativeStorageValidated: true }, envelope, "ok", [], "The closed envelope has exactly the required fields and its revision hashes tree, identity and bindings without the revision itself.");
env("unknown-field", { envelope: { ...envelope, layout: {} }, nativeStorageValidated: true }, { source: { ...envelope, layout: {} }, committed: false }, "refused", [423], "Layout is not an envelope field; the closed envelope refuses and preserves input. The design does not assign a diagnostic code here.");
env("null", { envelope: { ...envelope, bindings: null }, nativeStorageValidated: true }, { source: { ...envelope, bindings: null }, committed: false }, "refused", [], "Envelope bindings must be an array, never null; refusal is specified without a diagnostic code in this defining paragraph.");
const binding = { ownerId: "Process_A", role: "support", targetId: "Imported_support" };
const duplicateEnvelope = { ...envelope, bindings: [binding, binding] };
env("duplicate-binding", { envelope: duplicateEnvelope, boundary: "support binding uniqueness only" }, { source: duplicateEnvelope, committed: false }, "support-binding-conflict", [431, 564], "Two entries for the same owner and role violate unique support ownership; the isolated duplicate-role check specifies support-binding-conflict without asserting other envelope checks.");
const unsorted = [{ ownerId: "Process_B", role: "z", targetId: "Support_B" }, { ownerId: "Process_A", role: "z", targetId: "Support_A_z" }, { ownerId: "Process_A", role: "a", targetId: "Support_A_a" }];
const sorted = [unsorted[2], unsorted[1], unsorted[0]];
env("binding-order", { operation: "binding-order-and-revision-tuple", tree, profileIdentity: identity, bindings: unsorted, boundary: "canonical ordering and hash only, not envelope acceptance" },
  { bindings: sorted, semanticRevision: revision("sorted bindings revision", tree, identity, sorted) }, "ok", [668], "Before constructing an envelope, bindings sort by ownerId, role and targetId in UTF-16 order; only the resulting sorted array enters its hash.");
const wrongRevision = { ...envelope, semanticRevision: "0".repeat(64) };
env("revision-mismatch", { envelope: wrongRevision, nativeStorageValidated: true }, { source: wrongRevision, committed: false, requiredRevision: semanticRevision }, "refused", [], "The supplied revision differs from the exact hash tuple; it cannot be trusted or silently repaired on validation.");
const renamedTree = clone(tree); renamedTree.rootElements[0].name = "Renamed";
const renamedRevision = revision("semantic rename revision", renamedTree);
env("semantic-change", { envelope, operation: "approved-rename", targetId: "Process_A", name: "Renamed" },
  { tree: renamedTree, baseRevision: semanticRevision, revision: renamedRevision }, "ok", [266], "An authorized Process name edit changes semantic content; success reports the original base and the newly computed revision.");
const patchedProfile = clone(profile); patchedProfile.version = "1.1.1"; patchedProfile.themes[0].tokens[0].value = "#eeeeee";
const patchedIdentity = { ...identity, version: "1.1.1", sha256: H("new profile patch with changed token", patchedProfile) };
env("profile-change", { envelope, targetIdentity: patchedIdentity, migration: "explicitly-approved-and-target-validated" },
  { tree, profileIdentity: patchedIdentity, baseRevision: semanticRevision, revision: revision("new profile acceptance revision", tree, patchedIdentity), newHistoryEpoch: true }, "ok", [260, 266, 315, 603, 685], "Even with identical native tree bytes, an explicitly migrated new package changes acceptance-context revision and begins a new history epoch.");
const layout = { layoutVersion: "1", pages: [{ pageId: "page_a", name: "Page A", order: 0, semanticRootId: "Process_A", bounds: { x: 0, y: 0, width: 1000, height: 800 } }],
  geometry: [{ pageId: "page_a", occurrenceKey: "task_a", semanticId: "Task_A", role: "content", bounds: { x: 0, y: 0, width: 100, height: 80 } }] };
const emptyOverrides = { semantic: [], occurrence: [] }, emptyStyles = { native: [], bioc: [] };
const viewTuple = { semanticRevision, layoutDigest: H("layout A", layout), themeId: "plain",
  themeDigest: H("plain theme chain", { themeId: "plain", themes: [profile.themes[0]] }),
  overridesDigest: H("empty overrides", emptyOverrides), diStylesDigest: H("empty styles", emptyStyles),
  metricsDigest: H("metric resource pins", [{ id: profile.resources[0].id, sha256: profile.resources[0].sha256 }]) };
const viewRevision = H("view A", viewTuple);
// A package containing both themes is authored once before switching selection.
const twoThemes = clone(profile); const alternateTheme = { ...clone(profile.themes[0]), id: "alternate" };
alternateTheme.tokens[0].value = "#dddddd"; twoThemes.themes.push(alternateTheme);
const twoThemeIdentity = { ...identity, version: "1.2.0" };
twoThemes.version = "1.2.0"; twoThemeIdentity.sha256 = H("two-theme profile", twoThemes);
const twoThemeRevision = revision("two-theme semantic revision", tree, twoThemeIdentity);
const plainTuple = { ...viewTuple, semanticRevision: twoThemeRevision };
const alternateTuple = { ...plainTuple, themeId: "alternate", themeDigest: H("alternate theme chain", { themeId: "alternate", themes: [alternateTheme] }) };
env("theme-switch", { profile: twoThemes, tree, semanticRevision: twoThemeRevision, before: plainTuple, after: alternateTuple },
  { baseRevision: twoThemeRevision, revision: twoThemeRevision, beforeViewRevision: H("plain selected view", plainTuple), viewRevision: H("alternate selected view", alternateTuple) }, "ok", [266, 675, 681, 685], "Both themes already belong to the same injected package; changing selection affects only the exact view tuple, preserving semantic history.");
const draggedLayout = clone(layout); draggedLayout.geometry[0].bounds.x = 25;
const draggedTuple = { ...viewTuple, layoutDigest: H("dragged layout", draggedLayout) };
env("di-only", { envelope, beforeLayout: layout, afterLayout: draggedLayout, viewInputs: viewTuple },
  { tree, baseRevision: semanticRevision, revision: semanticRevision, beforeViewRevision: viewRevision, viewRevision: H("dragged view", draggedTuple) }, "ok", [264, 266, 674, 681], "A pure geometry drag changes Layout and viewRevision while the DI-free semantic tree and acceptance revision stay identical.");
const extTree = clone(tree); extTree.rootElements[0]["ext:x"] = 7;
const sourceWithPresentation = clone(extTree); sourceWithPresentation.diagrams = [{ $type: "bpmndi:BPMNDiagram", id: "Diagram_A" }]; sourceWithPresentation.rootElements[0]["color:fill"] = "#ffffff";
const projectedRevision = revision("semantic extension survives projection", extTree);
env("semantic-extension", { source: sourceWithPresentation, profileIdentity: identity, bindings: [], descriptorRoles: [
  { property: "bpmn:Definitions.diagrams", role: "presentation" }, { property: "bpmn:Process.color:fill", role: "presentation" }, { property: "bpmn:Process.ext:x", role: "semantic" }], admittedExtensions: ["ext:x"] },
  { tree: extTree, semanticRevision: projectedRevision, extractedPresentation: { diagrams: sourceWithPresentation.diagrams, properties: [{ pointer: "/rootElements/0/color:fill", value: "#ffffff" }] } }, "ok", [264], "Descriptor roles remove presentation fields but retain the admitted semantic extension x; a geometry-like name never authorizes removal.");
env("projection-unknown-role", { source: extTree, descriptorRoles: [], unclassifiedProperty: "bpmn:Process.ext:x" },
  { source: extTree, committed: false }, "descriptor-role-unknown", [264], "A foreign property lacking a pinned descriptor-role classification refuses projection; it cannot be guessed semantic or presentation.");
const sourceDigest = H("native import source tree", tree);
const jsonBase = H("native import base", { domain: "profile-import/1", format: "native-json", sourceDigest });
env("import-json-spacing", { format: "native-json", sources: [JSON.stringify(tree), JSON.stringify(tree, null, 2) + "\n"] },
  { sourceDigests: [sourceDigest, sourceDigest], baseRevisions: [jsonBase, jsonBase] }, "ok", [266], "Both strict JSON texts parse to the same source tree; spacing and trailing LF do not change canonical source digest or import baseRevision.");
const xmlA = '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_A" targetNamespace="urn:neutral:1"/>', xmlB = xmlA + "\n";
const xmlDigestA = B("XML source without LF", xmlA), xmlDigestB = B("XML source with LF", xmlB);
env("import-xml-spacing", { format: "bpmn-xml", sources: [xmlA, xmlB] }, { sourceDigests: [xmlDigestA, xmlDigestB], baseRevisions: [
  H("XML base without LF", { domain: "profile-import/1", format: "bpmn-xml", sourceDigest: xmlDigestA }),
  H("XML base with LF", { domain: "profile-import/1", format: "bpmn-xml", sourceDigest: xmlDigestB })] }, "ok", [266], "XML import hashes original UTF-8 bytes, so one trailing LF changes sourceDigest and baseRevision even if the parsed native tree is equal.");
env("parse-failure", { format: "native-json", source: "{" }, { omittedFields: ["baseRevision", "revision"], committed: false }, "refused", [266, 726], "Invalid native JSON has no valid parsed source value; import refusal omits baseRevision and never exposes a committed revision.");
env("undo-revision", { current: { ...envelope, tree: renamedTree, semanticRevision: renamedRevision }, saved: envelope, operation: "undo" },
  { envelope, baseRevision: renamedRevision, revision: semanticRevision }, "ok", [266], "Undo restores the exact saved envelope and may restore a prior digest; revisions are content hashes rather than monotonically increasing counters.");
env("binding-change", { tree, profileIdentity: identity, beforeBindings: [], afterBindings: [binding], boundary: "revision formula only, not envelope acceptance" },
  { beforeRevision: semanticRevision, revision: revision("added support binding", tree, identity, [binding]) }, "ok", [], "Support bindings participate in the acceptance-context tuple, so changing them changes revision even if tree and profile identity are unchanged.");

function life(id, input, output, code, refs, why) {
  add("identity-lifecycle", `identity-${id}`, "identity-transition", input, output, code,
    [274, 278, 282, 286, ...refs], why, { scenario: id });
}
const rootId = allocated("missing Definitions identity", "document-root/1", "definitions", "root");
const rawProcess = { $type: "bpmn:Process", name: "New process" };
const processSignature = H("raw missing Process content", rawProcess);
const processKey = jcs([processSignature, 0]);
const processId = allocated("missing Process after root", rootId, "bpmn:Definitions.rootElements", processKey);
life("root-first", { stage: "C identities only", tree: { $type: "bpmn:Definitions", rootElements: [rawProcess] }, bindings: [] },
  { tree: { $type: "bpmn:Definitions", id: rootId, rootElements: [{ ...rawProcess, id: processId }] }, bindings: [],
    allocationOrder: [rootId, processId], contentSignature: processSignature, stableKey: processKey }, "ok", [290, 533],
  "Definitions is born first under document-root/1; the child's descriptor-qualified slot uses that newly established root ID and its raw subtree signature, before defaults.");
const portId = allocated("explicit owner across ID-less IO parent", "Process_A", "input-port", "Association_A");
const ioTree = { $type: "bpmn:Definitions", id: "Definitions_A", rootElements: [{ $type: "bpmn:Process", id: "Process_A", ioSpecification: { $type: "bpmn:InputOutputSpecification", dataInputs: [] } }] };
const ioResult = clone(ioTree); ioResult.rootElements[0].ioSpecification.dataInputs.push({ $type: "bpmn:DataInput", id: portId, name: "Input" });
life("idless-parent", { tree: ioTree, action: { op: "create", identity: "allocated", as: "port", type: "bpmn:DataInput", parent: "io", property: "dataInputs", ownerId: lit("Process_A"), slot: "input-port", key: lit("Association_A"), fields: [{ name: "name", value: lit("Input") }] },
  context: { ioPointer: "/rootElements/0/ioSpecification", effectiveIdAdmission: { "bpmn:InputOutputSpecification": false, "bpmn:DataInput": true }, actorAuthorized: true } },
  { tree: ioResult, createdIds: [portId] }, "ok", [161], "The containing IO object is ID-less but the authored ownerId is Process_A; allocation never guesses a parent ID or assigns one to the IO object.");
const docTree = { $type: "bpmn:Definitions", id: "Definitions_A", rootElements: [{ $type: "bpmn:Process", id: "Process_A", documentation: [] }] };
const docResult = clone(docTree); docResult.rootElements[0].documentation.push({ $type: "bpmn:Documentation", text: "Kept source", textFormat: "text/plain" });
life("containment", { tree: docTree, recipe: profile.recipes[8], parameters: { target: "Process_A", body: "Kept source" }, effectiveIdAdmission: false },
  { tree: docResult, createdIds: [], coordinate: { targetId: "Process_A", pointer: "/rootElements/0/documentation/0", revisionBound: true } }, "ok", [161, 746],
  "The Documentation creation uses containment identity, writes no allocator fields or ID, and is addressed through its nearest ID-bearing ancestor and revision-bound pointer.");

// Explicit five-support expected construction, not execution of ensure recipes.
// The support fixture supplies descriptor/base/recipe input only. No .expected
// tree, IDs, count or verdict from that file is used to build these expectations.
const support = read("neutral-support-fixture.R31.json", vendor);
const supportContext = { fixture: "neutral-support-fixture.R31.json", members: ["descriptors", "base", "recipe"], qualificationOnly: true };
function authoredSupports(owner) {
  const collaboration = allocated(`${owner} collaboration`, "Definitions_support", "collaboration", owner);
  const main = allocated(`${owner} main`, owner, "main-participant", "main-participant");
  const laneSet = allocated(`${owner} lane set`, owner, "lane-set", "lane-set");
  const lane = allocated(`${owner} external lane`, owner, "external-lane", "external-lane");
  const band = allocated(`${owner} band`, owner, "reference-band", "reference-band");
  return {
    process: { $type: "bpmn:Process", id: owner, name: owner, isExecutable: false, laneSets: [{ $type: "bpmn:LaneSet", id: laneSet, name: "lane-set", lanes: [{ $type: "bpmn:Lane", id: lane, name: "external-lane" }] }] },
    collaboration: { $type: "bpmn:Collaboration", id: collaboration, name: "collaboration", participants: [{ $type: "bpmn:Participant", id: main, name: "main-participant", processRef: owner }, { $type: "bpmn:Participant", id: band, name: "reference-band" }] },
    bindings: [{ ownerId: owner, role: "collaboration", targetId: collaboration }, { ownerId: owner, role: "external-lane", targetId: lane }, { ownerId: owner, role: "lane-set", targetId: laneSet }, { ownerId: owner, role: "main-participant", targetId: main }, { ownerId: owner, role: "reference-band", targetId: band }],
    createdIds: [collaboration, main, laneSet, lane, band]
  };
}
const A = authoredSupports("Process_A"), C = authoredSupports("Process_C");
const supportInput = { tree: { $type: "bpmn:Definitions", id: "Definitions_support", rootElements: [{ $type: "bpmn:Process", id: "Process_A", name: "Process_A", isExecutable: false }] }, bindings: [] };
const supportOutput = { tree: { $type: "bpmn:Definitions", id: "Definitions_support", rootElements: [A.process, A.collaboration] }, bindings: A.bindings };
life("five-supports", { ...supportInput, context: supportContext, recipe: support.recipe }, { ...supportOutput, createdIds: A.createdIds, changeCount: 6 }, "ok", [162, 203, 205, 284, 421, 429, 543, 549, 564],
  "The five declared ensure steps create five supports and the main processRef assignment is the sixth change; binding ownership is Process_A while Collaboration allocation belongs to Definitions_support.");
life("fixed-point", { ...supportOutput, context: supportContext, recipe: support.recipe }, { ...supportOutput, createdIds: [], changeCount: 0 }, "ok", [162, 174, 431, 560, 564],
  "All five bindings resolve to the exact expected supports and the main reference already agrees, so the second pass preserves tree/bindings and reports zero changes.");
const imported = clone(supportOutput);
// Literal ID replacement is authoring a different input/output specimen, not
// an ID-migration implementation. No reference discovery occurs here.
const importedIds = ["Imported_collaboration", "Imported_main", "Imported_lane_set", "Imported_lane", "Imported_band"];
imported.tree.rootElements[1].id = importedIds[0]; imported.tree.rootElements[1].participants[0].id = importedIds[1];
imported.tree.rootElements[0].laneSets[0].id = importedIds[2]; imported.tree.rootElements[0].laneSets[0].lanes[0].id = importedIds[3];
imported.tree.rootElements[1].participants[1].id = importedIds[4];
imported.bindings = [
  { ownerId: "Process_A", role: "collaboration", targetId: importedIds[0] }, { ownerId: "Process_A", role: "external-lane", targetId: importedIds[3] },
  { ownerId: "Process_A", role: "lane-set", targetId: importedIds[2] }, { ownerId: "Process_A", role: "main-participant", targetId: importedIds[1] },
  { ownerId: "Process_A", role: "reference-band", targetId: importedIds[4] }];
life("imported-id", { ...imported, context: supportContext, recipe: support.recipe }, { ...imported, createdIds: [], changeCount: 0 }, "ok", [429, 431, 564],
  "Correct imported support IDs are authoritative regardless of their spelling; ensure reuses them without allocating or rewriting their labels.");
const collision = clone(supportInput); collision.tree.rootElements[0].artifacts = [{ $type: "bpmn:TextAnnotation", id: A.createdIds[4], text: "Unrelated occupant" }];
life("collision", { ...collision, context: supportContext, recipe: support.recipe }, { source: collision, committed: false, createdIds: [] }, "id-collision", [170, 560, 564],
  "The final band allocation collides with a distinct existing annotation; no suffix, overwrite or reidentification is allowed and earlier staged supports roll back.");
const rawTask = { $type: "bpmn:Task", name: "Same", documentation: [{ $type: "bpmn:Documentation", text: "Evidence", textFormat: "text/plain" }] };
const taskSignature = H("identical raw Task subtree", rawTask);
const taskKey0 = jcs([taskSignature, 0]), taskKey1 = jcs([taskSignature, 1]);
const taskId0 = allocated("duplicate ordinal 0", "Process_A", "bpmn:Process.flowElements", taskKey0);
const taskId1 = allocated("duplicate ordinal 1", "Process_A", "bpmn:Process.flowElements", taskKey1);
const siblingInput = { $type: "bpmn:Process", id: "Process_A", flowElements: [rawTask, rawTask] };
const siblingResult = { $type: "bpmn:Process", id: "Process_A", flowElements: [{ ...rawTask, id: taskId0 }, { ...rawTask, id: taskId1 }] };
life("missing-siblings", { stage: "C identities only", ownerSubtree: siblingInput },
  { ownerSubtree: siblingResult, contentSignatures: [taskSignature, taskSignature], duplicateOrdinals: [0, 1], stableKeys: [taskKey0, taskKey1], createdIds: [taskId0, taskId1] }, "ok", [290],
  "Equal raw semantic signatures share an owner/property, so original sibling positions select ordinals zero and one; their complete tuple digests yield different IDs.");
const reordered = { ...siblingResult, flowElements: [siblingResult.flowElements[1], siblingResult.flowElements[0]] };
life("reorder", { stage: "C identities after approved reorder", ownerSubtree: reordered }, { ownerSubtree: reordered, createdIds: [] }, "ok", [290, 527],
  "Both siblings already have valid IDs, so their new array positions do not recompute duplicate ordinals or reallocate either survivor.");
const renamed = clone(siblingResult); renamed.flowElements[0].name = "Changed label";
life("rename", { stage: "C identities after approved rename", ownerSubtree: renamed }, { ownerSubtree: renamed, createdIds: [] }, "ok", [290, 527],
  "The content signature is a birth-only exception; changing a surviving Task label never recomputes its identity.");
const remapped = clone(supportOutput);
remapped.tree.rootElements[0].id = "Process_B";
remapped.tree.rootElements[1].participants[0].processRef = "Process_B";
remapped.bindings.forEach(b => { b.ownerId = "Process_B"; });
life("owner-remap", { ...supportOutput, migration: { approved: true, map: [{ sourceId: "Process_A", resultId: "Process_B", domain: "migration" }] }, referenceFields: ["bpmn:Participant.processRef"], opaqueExtensions: [] },
  { ...remapped, idMap: [{ sourceId: "Process_A", resultId: "Process_B", domain: "migration" }], createdIds: [], layoutInvalidated: true, renderInvalidated: true }, "ok", [435, 556, 744],
  "The approved owner remap updates the main process reference and every binding owner atomically; all five surviving support IDs retain their actual pre-remap identities.");
const laneBeforeDelete = clone(remapped.tree.rootElements[0].laneSets[0].lanes[0]);
const deleted = clone(remapped); deleted.tree.rootElements[0].laneSets[0].lanes = []; deleted.bindings = deleted.bindings.filter(b => b.role !== "external-lane");
life("delete-no-need", { ...remapped, operation: "explicit-delete-then-normalize", targetId: laneBeforeDelete.id, dependencyClosure: [], roleNeeded: false, approved: true },
  { ...deleted, removedIds: [laneBeforeDelete.id], createdIds: [] }, "ok", [169, 210, 556],
  "Explicit dependency-checked deletion ends the empty lane identity and removes its binding; subsequent normalization leaves it absent while no role is needed.");
const recreatedLaneId = allocated("new lane after owner remap and deletion", "Process_B", "external-lane", "external-lane");
const recreated = clone(deleted); recreated.tree.rootElements[0].laneSets[0].lanes = [{ ...laneBeforeDelete, id: recreatedLaneId }];
recreated.bindings.splice(1, 0, { ownerId: "Process_B", role: "external-lane", targetId: recreatedLaneId });
life("recreate", { ...deleted, operation: "ensure-external-lane", ownerId: "Process_B", slot: "external-lane", stableKey: "external-lane", roleNeeded: true, structuralAuthorityGranted: true },
  { ...recreated, createdIds: [recreatedLaneId] }, "ok", [162, 435, 556],
  "A later role need creates a genuinely new lane under current owner Process_B; the deleted Process_A-domain ID is not resurrected by allocation.");
life("undo", { current: deleted, saved: remapped, operation: "undo-explicit-deletion" }, { ...remapped, restoredIds: [laneBeforeDelete.id], allocatedIds: [] }, "ok", [266, 556],
  "Undo restores the actual saved deleted lane and original generated ID, even though a fresh allocation under the remapped owner would differ.");
life("live-reference", { ...remapped, operation: "explicit-delete", targetId: laneBeforeDelete.id, inboundReferences: [{ sourceId: "Reference_A", property: "pinned:laneRef", targetId: laneBeforeDelete.id }], declaredDependents: [], policy: "refuseIfReferenced" },
  { source: remapped, committed: false }, "refused", [169, 210, 556],
  "The requested deletion leaves a live reference outside its declared dependency closure; refusal preserves the support and all bindings. These lines specify no diagnostic code.");
const missingBinding = clone(supportOutput); missingBinding.bindings = missingBinding.bindings.filter(b => b.role !== "external-lane");
life("binding-recovery", { ...missingBinding, trustedGeneratedDocument: true, creationProvenanceVerified: true, exactTypeParentOwnerVerified: true, recoveryTransactionSelected: false },
  { source: missingBinding, proposedBinding: A.bindings[1], activated: false, committed: false }, "refused", [431],
  "Matching allocator ID, type, parent, owner and provenance permits a recovery proposal only; without the explicit recovery transaction the binding is not activated.");
life("multi-process", { tree: { ...supportInput.tree, rootElements: [supportInput.tree.rootElements[0], { $type: "bpmn:Process", id: "Process_C", name: "Process_C", isExecutable: false }] }, bindings: [], context: supportContext, recipe: support.recipe },
  { tree: { ...supportInput.tree, rootElements: [A.process, C.process, A.collaboration, C.collaboration] }, bindings: [...A.bindings, ...C.bindings], createdIds: [...A.createdIds, ...C.createdIds], changeCount: 12 }, "ok", [162, 284, 421, 429, 564],
  "Each Process owns five distinct support roles and a separate Collaboration; shared Definitions allocation uses different Process stable keys and never creates one shared owner exception.");
life("rollback", { ...supportInput, context: supportContext, recipe: { ...support.recipe, steps: [...support.recipe.steps, { op: "refuse", code: "fixture-stop", target: "self" }] } },
  { source: supportInput, committed: false, createdIds: [] }, "fixture-stop", [170, 201, 560, 564],
  "An explicit authored refusal after all five ensures and the main reference aborts the entire staged operation; none of those candidate changes reaches caller state.");
const duplicateSupport = clone(imported); duplicateSupport.bindings.push(clone(imported.bindings[0]));
life("duplicate-role", { ...duplicateSupport, context: supportContext }, { source: duplicateSupport, committed: false }, "support-binding-conflict", [421, 431, 564],
  "Even duplicate entries targeting the same imported support violate owner-role uniqueness and refuse before recognition or normalization.");
const wrongBand = clone(imported); wrongBand.tree.rootElements[1].participants[1].processRef = "Process_A";
life("band-process-ref", { ...wrongBand, context: supportContext }, { source: wrongBand, committed: false }, "support-binding-conflict", [284, 429, 431, 564],
  "A bound reference-band Participant must have no processRef; a matching ID and label cannot override the native support invariant.");
const wrongParent = clone(imported); wrongParent.tree.rootElements[0].artifacts = [wrongParent.tree.rootElements[1].participants.pop()];
life("wrong-parent", { ...wrongParent, context: supportContext, boundary: "support binding consistency" }, { source: wrongParent, committed: false }, "support-binding-conflict", [429, 431, 564],
  "The imported bound band sits outside the owner's Collaboration; the support-binding check refuses instead of moving it to fit the binding.");

// Append exactly; original 84 vectors and existing metadata are preserved.
const expectations = read("expectations.json");
if (expectations.vectors.length < 84 || expectations.vectors.slice(84).some(v => !v.caseId.startsWith("s2b-") || v.author !== "gpt-6-astra / xhigh")) throw Error("Unexpected expectation extension");
const originalAscii = JSON.stringify(expectations.vectors.slice(0, 84)).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
if (sha(originalAscii) !== "00b4d08061e3e5d2ab19f6bf88b6cebc389f3722e6568dcda610a447cfca4ccb") throw Error("Original vectors changed");
expectations.vectors = expectations.vectors.slice(0, 84);
expectations.vectors.push(...added);
expectations.step2b = { scope: "Independent local static-rule, compatibility, envelope/revision and identity lifecycle boundary witnesses; no runtime qualification or canonical publication claim.",
  authoringTool: "author-step2b.mjs", digestLedger: "step2b-digests.json", priorVectors: 84,
  diagnosticPolicy: "A bare refused verdict asserts refusal only where DESIGN assigns no exact code; it never claims an invented runtime diagnostic.",
  staticBoundary: "static-rule-check checks the named rule in isolation, including compiler preflight for schema-overlapping rules; it does not assert full-load diagnostic precedence." };
save("expectations.json", expectations);
save("step2b-digests.json", { format: "profile-authoring-digests/1", designSha256, hashes });
save("step2b-provenance-policy.json", { format: "profile-step2b-provenance/1", designSha256,
  vectors: added.map(v => ({ caseId: v.caseId, family: v.family, required: v.provenance })) });
const rules = read("../../../docs/design/profile-compiler-rules.json");
const refs = [...new Set([...expectations.vectors.flatMap(v => v.provenance), ...rules.actions.map(a => a.provenance)])].sort((a, b) => Number(a.split(":")[1]) - Number(b.split(":")[1]));
const evidence = read("design-provenance.json");
evidence.lines = refs.map(ref => { const text = designLines[Number(ref.split(":")[1]) - 1]; return { ref, text, sha256: sha(text) }; });
save("design-provenance.json", evidence);
const seal = read("expectations.seal.json"), expectedBytes = readFileSync(new URL("expectations.json", root));
seal.bytes = expectedBytes.length; seal.sha256 = sha(expectedBytes);
seal.authoringMethod = "hand-derived literal rule outcomes and transitions; standalone JCS/SHA-256 of explicitly authored values";
seal.independentExtension = "step-2b / gpt-6-astra / xhigh";
save("expectations.seal.json", seal);
const freeze = read("freeze.seal.json");
for (const path of ["author-step2b.mjs", "step2b-digests.json", "step2b-provenance-policy.json", "README.md"]) {
  if (!freeze.files.some(entry => entry.path === path)) freeze.files.push({ path });
}
for (const entry of freeze.files) { const bytes = readFileSync(new URL(entry.path, root)); entry.bytes = bytes.length; entry.sha256 = sha(bytes); }
// Only the brand scan's added test path changes among the frozen documents.
const scope = freeze.documents.find(entry => entry.path === "docs/design/profile-externalization-scope.json");
const scopeBytes = readFileSync(new URL(`../../../${scope.path}`, root)); scope.bytes = scopeBytes.length; scope.sha256 = sha(scopeBytes);
save("freeze.seal.json", freeze);
console.log(JSON.stringify({ added: added.length, families: Object.fromEntries([...new Set(added.map(v => v.family))].map(f => [f, added.filter(v => v.family === f).length])),
  provenancePin: sha(JSON.stringify(evidence)), policyPin: sha(JSON.stringify(read("step2b-provenance-policy.json"))),
  expectationSeal: sha(readFileSync(new URL("expectations.seal.json", root))), freezeSeal: sha(readFileSync(new URL("freeze.seal.json", root))) }, null, 2));
