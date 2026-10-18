// Independent data authoring only. No library imports, execution or verdict discovery.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("./", import.meta.url);
const read = name => readFileSync(new URL(name, root));
const json = name => JSON.parse(read(name));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const write = (name, value) => writeFileSync(new URL(name, root), JSON.stringify(value, null, 2) + "\n");
const clone = value => structuredClone(value);
const authority = readFileSync(process.argv[2]);
const designSha256 = "feb133295c88a54841c62f8a19a81aa2fb4372f4af564d5380d611220e8c3497";
assert.equal(hash(authority), designSha256);
const previous = read("expectations.json");
assert.equal(hash(previous), "c78217a66e5bfc485eb0511591cda923ed7361ef5507358b6fb76d7822f4672e");
const data = JSON.parse(previous);
assert.equal(data.vectors.length, 391);
assert.equal(JSON.stringify(data, null, 2) + "\n", previous.toString());
const originalVectors = JSON.stringify(data.vectors);
const neutral = JSON.parse(readFileSync(new URL("../profile-parity-corpus/profile-mechanism/1/neutral-profile.json", root)));
const vectors = [];
function add(caseId, finding, family, input, code, lines, derivation, extra = {}) {
  if (family === "compatibility" && !lines.includes(315)) lines = [...lines, 315].sort((a, b) => a - b);
  const verdict = code === "ok" ? { status: "ok" }
    : code === null ? { status: "refused" } : { status: "refused", code };
  const expectedArtifacts = [{ role: "verdict", json: verdict }];
  if (family === "compatibility") expectedArtifacts.push({ role: "output", json: {
    acceptedUnderInjectedProfile: code === "ok", sourcePreserved: true, migrationExecuted: false
  }});
  vectors.push({
    caseId: `s123-${caseId}`, finding, family, ...extra,
    operation: family === "compatibility" ? "compatibility-decision" : "static-rule-check",
    inputArtifacts: [{ role: "input", json: input }],
    expectedStatus: verdict.status === "ok" ? "ok" : code === null ? "refused" : `refused:${code}`,
    expectedArtifacts, method: "hand-derived", author: "gpt-6-astra / xhigh",
    review: { status: "pending-independent-review", reviewer: null },
    provenance: lines.map(line => `DESIGN.md:${line}`), derivation
  });
}

// Closed neutral identity records are supplied facts, not output from an identity helper.
function compatibility() {
  const identity = {
    mechanismVersion: "1", schemaVersion: "1.0.0", profile: "neutral/1", version: "1.1.0",
    sha256: "1".repeat(64), base: clone(neutral.base), descriptors: clone(neutral.descriptors)
  };
  return {
    runtime: { mechanisms: ["1"], schemas: ["1.0.0"], capabilities: [], assets: [] },
    injected: clone(identity), document: { documentVersion: "1", profileIdentity: clone(identity) },
    requiredCapabilities: [], requiredAssets: [], sourcePackage: "known-and-available",
    envelopeValid: true, selectedMigration: false
  };
}

// Row conditions are literal. Rows 310/311 do not repeat 308/309's "both known".
for (const [direction, p, d, row, code] of [
  ["patch-up", "1.1.1", "1.1.0", 308, "profile-source-unavailable"],
  ["patch-down", "1.1.0", "1.1.1", 309, "profile-source-unavailable"],
  ["minor-up", "1.2.0", "1.1.0", 310, "profile-minor-migration-required"],
  ["minor-down", "1.1.0", "1.2.0", 311, "profile-minor-downgrade-required"]
]) for (const source of ["unknown", "unavailable"]) {
  const input = compatibility();
  input.injected.version = p;
  input.injected.sha256 = "2".repeat(64);
  input.document.profileIdentity.version = d;
  input.sourcePackage = source;
  const patch = direction.startsWith("patch");
  add(`s1-${direction}-${source}`, "S1", "compatibility", input, code,
    [294, row, 312, 315], patch
      ? `The ${direction} source is ${source}; the patch row's both-known requirement cannot be established. Row 312 preserves the source without fallback.`
      : `Row ${row} matches the same-major minor direction and precedes row 312 under line 294. Its condition does not require both packages known or available. Exact-source reopening or explicit migration is required; neither is executed. Adding an availability condition would amend the written matrix.`,
    { matrixRow: patch ? 312 : row });
}
for (const source of ["unknown", "unavailable"]) {
  const input = compatibility();
  input.injected.sha256 = "2".repeat(64);
  input.sourcePackage = source;
  add(`s1-digest-${source}`, "S1", "compatibility", input, "profile-digest-mismatch", [294, 307, 312],
    "Same business ID and package version with unequal digests matches row 307 before source availability; no source bytes or metadata may change.", { matrixRow: 307 });
}
for (const source of ["unknown", "unavailable"]) {
  const input = compatibility(); input.injected.schemaVersion = "2.0.0"; input.sourcePackage = source;
  add(`s2-injected-schema-${source}`, "S2", "compatibility", input, "profile-schema-version", [294, 301, 312],
    "The injected schema is absent from runtime support. Row 301 applies before source availability, irrespective of the document's supported schema.", { matrixRow: 301 });
}
for (const support of ["supported", "unsupported"]) for (const source of ["unknown", "unavailable"]) {
  const input = compatibility();
  input.document.profileIdentity.schemaVersion = "2.0.0";
  if (support === "supported") input.runtime.schemas.push("2.0.0");
  input.sourcePackage = source;
  add(`s2-document-schema-${support}-${source}`, "S2", "compatibility", input, "profile-source-unavailable", [294, 301, 312, 313],
    `Only D's schema differs (${support} by R); P's schema is supported, so row 301 does not apply. No earlier matrix condition matches. Row 312 refuses the ${source} source before the final all-identity-dimensions acceptance test.`, { matrixRow: 312 });
}
{
  const input = compatibility(); input.document.profileIdentity.schemaVersion = "2.0.0"; input.runtime.schemas.push("2.0.0");
  add("s2-document-schema-supported-available", "S2", "compatibility", input, null, [294, 301, 313, 421],
    "Both schemas are supported, but schema identity differs. Row 301 does not cover inequality; row 313 cannot accept because P and D are not equal in all identity dimensions. DESIGN gives no code for this residual refusal.", { matrixRow: 313 });
}
for (const source of ["available", "unavailable"]) {
  const input = compatibility(); input.envelopeValid = false;
  if (source === "unavailable") input.sourcePackage = source;
  add(`s2-envelope-invalid-${source}`, "S2", "compatibility", input,
    source === "available" ? null : "profile-source-unavailable", [294, 312, 313, 421],
    source === "available"
      ? "Identities match and the source is available, but the envelope is invalid. Line 421 requires refusal and row 313 cannot accept; neither line assigns an envelope-invalid code."
      : "With an unavailable source and invalid envelope, row 312 matches before the envelope-valid acceptance condition. The refusal is profile-source-unavailable and preserves all source state.",
    { matrixRow: source === "available" ? 313 : 312 });
}

const boundary = "isolated normative rule; other rules and full-load precedence are not asserted";
function selectorInput(from, via, order, phase, property) {
  const subject = { from, via, where: { op: "true" }, order };
  if (property) subject.property = property;
  const context = { bindings: { render: "RenderData", page: "PageHandle", occurrence: "OccurrenceHandle" } };
  if (phase !== "absent") context.phase = phase;
  return { ruleId: "CR-03", subject, context, boundary };
}
for (const [traversal, from, via, order, property, row] of [
  ["pages", "render", "pages", "page-occurrence", null, 123],
  ["occurrences-render", "render", "occurrences", "page-occurrence", null, 124],
  ["occurrences-page", "page", "occurrences", "page-occurrence", null, 124],
  ["semantic", "occurrence", "semantic", "id", null, 122],
  ["source-reference", "occurrence", "reference", "page-occurrence", "sourceOccurrence", 124],
  ["target-reference", "occurrence", "reference", "page-occurrence", "targetOccurrence", 124]
]) for (const phase of ["export", "render", "validation", "absent", "create", "edit", "complete", "normalize", "reference", "convert", "migrate"]) {
  const admitted = phase === "export" || phase === "render";
  add(`s3-${traversal}-${phase}`, "S3", "static-rules", selectorInput(from, via, order, phase, property),
    admitted ? "ok" : "profile-type", [row, 126, 128, 180, 186], admitted
      ? `Line 128 admits ${traversal} from the supplied typed source in ${phase} context. The selector uses ${order}, the result domain's required order; the isolated CR-03 check accepts.`
      : `Line 128 forbids ${traversal} outside export/render contexts. The ${phase} context does not authorize it even with a correctly typed source and matching order. CR-03 rejects the unsupported binding/context combination as profile-type.`,
    { ruleId: "CR-03" });
}
for (const from of ["render", "page"]) for (const phase of ["export", "render"]) {
  add(`s3-occurrences-${from}-${phase}-wrong-order`, "S3", "static-rules", selectorInput(from, "occurrences", "id", phase),
    "profile-selector-order", [124, 126, 128, 180, 186],
    `Occurrences from ${from} are admitted in ${phase} context, but native ID order is forbidden for this result domain. Line 126 assigns profile-selector-order; page order then occurrenceKey is required.`, { ruleId: "CR-03" });
}

// A neutral descriptor slice makes a typed field genuinely inherited: no child copy.
for (const depth of ["parent", "grandparent"]) for (const type of ["string", "number", "boolean"]) {
  const descriptor = { id: "neutral-inherited-descriptors/1", types: {
    "neutral:Parent": { id: true, scalars: ["id", "value"], scalarTypes: { id: "string", value: type }, containment: {}, references: {} },
    "neutral:Child": { superClass: ["neutral:Parent"], id: true, scalars: [], scalarTypes: {}, containment: {}, references: {} }
  }};
  if (depth === "grandparent") {
    descriptor.types["neutral:Middle"] = { superClass: ["neutral:Parent"], id: true, scalars: [], scalarTypes: {}, containment: {}, references: {} };
    descriptor.types["neutral:Child"].superClass = ["neutral:Middle"];
  }
  add(`s5-${depth}-${type}`, "S5", "static-rules", {
    ruleId: "CR-02", subject: { location: "value", value: { op: "concat", values: [
      { op: "literal", value: "prefix:" }, { op: "read", binding: "self", path: "/value" }
    ] } }, context: { bindings: { self: "neutral:Child" }, descriptor }, boundary
  }, type === "string" ? "ok" : "profile-type", [79, 112, 180, 185],
    `The pinned neutral ${depth} declares value as ${type}; the child inherits that field without redeclaration. Descriptor field typing survives inheritance. Concat requires strings without coercion, so this ${type} read ${type === "string" ? "is accepted" : "must refuse profile-type"}.`,
  { ruleId: "CR-02" });
}

assert.equal(vectors.length, 95);
const evidence = json("design-provenance.json");
const lines = authority.toString("utf8").split("\n");
for (const ref of new Set(vectors.flatMap(v => v.provenance))) {
  const entry = evidence.lines.find(line => line.ref === ref);
  assert.ok(entry, `missing evidence ${ref}`);
  assert.equal(entry.text, lines[Number(ref.split(":")[1]) - 1]);
  assert.equal(hash(entry.text), entry.sha256);
}
const policy = { format: "profile-s123-provenance-policy/1", designSha256,
  vectors: vectors.map(v => ({ caseId: v.caseId, family: v.family, required: v.provenance })) };
write("s123-provenance-policy.json", policy);
data.vectors.push(...vectors);
assert.equal(JSON.stringify(data.vectors.slice(0, 391)), originalVectors);
write("expectations.json", data);
const seal = json("expectations.seal.json");
const bytes = read("expectations.json");
seal.bytes = bytes.length; seal.sha256 = hash(bytes);
seal.independentExtension = "S1/S2/S3/S5 / gpt-6-astra / xhigh";
write("expectations.seal.json", seal);
const freeze = json("freeze.seal.json");
for (const path of ["author-s123.mjs", "s123-provenance-policy.json"]) {
  const bytes = read(path); freeze.files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
}
write("freeze.seal.json", freeze);
console.log(JSON.stringify({ added: vectors.length, total: data.vectors.length, payload: seal.sha256,
  policyPin: hash(JSON.stringify(policy)), oldVectors: hash(originalVectors) }, null, 2));
