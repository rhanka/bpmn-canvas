// One-shot data-only reseal from the original R3.2 payload. Run from repo root
// with the verified authority directory as argv[2]. No library code is used.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = "tests/fixtures/profile-lot0/";
const authority = process.argv[2];
assert.ok(authority, "supply the authority directory");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(JSON.stringify(value));
const read = path => readFileSync(path, "utf8");
const load = path => JSON.parse(read(path));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const pin = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
const oldPin = "feb133295c88a54841c62f8a19a81aa2fb4372f4af564d5380d611220e8c3497";
const design = read(`${authority}/DESIGN.md`);
const priorDesign = read(`${authority}/DESIGN.R32.md`);
assert.equal(sha(design), pin);
assert.equal(sha(priorDesign), oldPin);
const lines = design.split("\n"), priorLines = priorDesign.split("\n");
const manifest = read(`${authority}/MANIFEST-R33.sha256`);
assert.equal(sha(manifest), "dbdbdbb8a61e87e76ea8e198561b86ffa1bbe86ea71a09261ab70ca31ef43dd3");
const companions = manifest.trim().split("\n").map(line => {
  const [sha256, path] = line.split("  ");
  const bytes = readFileSync(`${authority}/${path}`);
  assert.equal(sha(bytes), sha256, path);
  return { path, bytes: bytes.length, sha256 };
});
assert.equal(companions.length, 46);
const originalBytes = read(root + "expectations.json");
assert.equal(sha(originalBytes), "0e81cfb02f5bbca32f5f76c6fd6c0f2be641e5cbb81521d0763908aa0179a3bd");
const data = JSON.parse(originalBytes), original = structuredClone(data);

// Hand-derived decisions from the ordered R3.3 rows. These literals are
// independent of the inventory's outcomes and of any runtime implementation.
const decisions = [
  ["s2b-compat-exact", "ok", 320],
  ["s2b-compat-document-0", "document-version-unsupported", 302],
  ["s2b-compat-document-2", "document-version-unsupported", 302],
  ["s2b-compat-missing", "profile-metadata-missing", 303],
  ["s2b-compat-xml-alone", "profile-metadata-missing", 303],
  ["s2b-compat-conflict", "profile-metadata-conflict", 304],
  ["s2b-compat-schema", "profile-schema-version", 305],
  ["s2b-compat-mechanism", "mechanism-version-unsupported", 306],
  ["s2b-compat-document-mechanism", "document-mechanism-unsupported", 307],
  ["s2b-compat-mechanism-migration", "mechanism-migration-required", 309],
  ["s2b-compat-capability", "profile-capability", 311],
  ["s2b-compat-asset", "profile-resource-missing", 311],
  ["s2b-compat-base", "base-mismatch", 312],
  ["s2b-compat-descriptor", "descriptor-mismatch", 312],
  ["s2b-compat-business-id", "profile-major-mismatch", 313],
  ["s2b-compat-business-major", "profile-major-mismatch", 313],
  ["s2b-compat-digest", "profile-digest-mismatch", 314],
  ["s2b-compat-digest-migration-no-waiver", "profile-digest-mismatch", 314],
  ["s2b-compat-patch-up", "profile-patch-migration-required", 315],
  ["s2b-compat-patch-down", "profile-patch-downgrade-required", 316],
  ["s2b-compat-minor-up", "profile-minor-migration-required", 317],
  ["s2b-compat-minor-down", "profile-minor-downgrade-required", 318],
  ["s2b-compat-source-unavailable", "profile-source-unavailable", 319],
  ["s2b-compat-precedence-version", "document-version-unsupported", 302, 303],
  ["s2b-compat-precedence-capability", "profile-capability", 311, 313],
  ["s2b-compat-precedence-base", "base-mismatch", 312, 313],
  ["s123-s1-patch-up-unknown", "profile-source-unavailable", 319, 315],
  ["s123-s1-patch-up-unavailable", "profile-source-unavailable", 319, 315],
  ["s123-s1-patch-down-unknown", "profile-source-unavailable", 319, 316],
  ["s123-s1-patch-down-unavailable", "profile-source-unavailable", 319, 316],
  ["s123-s1-minor-up-unknown", "profile-source-unavailable", 319, 317],
  ["s123-s1-minor-up-unavailable", "profile-source-unavailable", 319, 317],
  ["s123-s1-minor-down-unknown", "profile-source-unavailable", 319, 318],
  ["s123-s1-minor-down-unavailable", "profile-source-unavailable", 319, 318],
  ["s123-s1-digest-unknown", "profile-digest-mismatch", 314, 319],
  ["s123-s1-digest-unavailable", "profile-digest-mismatch", 314, 319],
  ["s123-s2-injected-schema-unknown", "profile-schema-version", 305, 319],
  ["s123-s2-injected-schema-unavailable", "profile-schema-version", 305, 319],
  ["s123-s2-document-schema-supported-unknown", "profile-source-unavailable", 310, 319],
  ["s123-s2-document-schema-supported-unavailable", "profile-source-unavailable", 310, 319],
  ["s123-s2-document-schema-unsupported-unknown", "document-schema-unsupported", 308, 319],
  ["s123-s2-document-schema-unsupported-unavailable", "document-schema-unsupported", 308, 319],
  ["s123-s2-document-schema-supported-available", "profile-schema-migration-required", 310],
  ["s123-s2-envelope-invalid-available", "refused", 320, 324, 430],
  ["s123-s2-envelope-invalid-unavailable", "profile-source-unavailable", 319, 320, 324, 430]
];
assert.deepEqual(decisions.map(([id]) => id), data.vectors.filter(v => v.operation === "compatibility-decision").map(v => v.caseId));
const changedReasons = {
  "profile-source-unavailable": "P1 requires an available exact source for the minor-version remedy; unknown or unavailable source therefore refuses profile-source-unavailable before a migration can be selected.",
  "document-schema-unsupported": "P2 adds the ordered unsupported document-schema row. Unsupported D schema refuses document-schema-unsupported before source availability; unsupported P schema is a separate diagnostic.",
  "profile-schema-migration-required": "P2 separates supported unequal schema identities from unsupported schemas. Both schemas and the exact source are available, so explicit schema migration is required; the former bare refusal is superseded."
};
const ref = n => `DESIGN.md:${n}`;
const modifiedRows = { 301: 305, 307: 314, 308: 315, 309: 316, 310: 317, 311: 318, 315: 322 };
function relocate(n) {
  if (modifiedRows[n]) return modifiedRows[n];
  const next = n < 8 ? n : n <= 295 ? n + 2 : n <= 300 ? n + 4 : n === 302 ? 307 : n === 303 ? 309 : n <= 314 ? n + 7 : n + 9;
  assert.equal(lines[next - 1], priorLines[n - 1], `unchanged authority line ${n}`);
  return next;
}
function moveRef(value) { return ref(relocate(Number(value.split(":")[1]))); }
function moveDerivation(value) {
  return value.replace(/R3\.2/g, "R3.3").replace(/\b([Ll]ine|[Rr]ow) (\d+)\b/g,
    (_, label, n) => `${label} ${relocate(Number(n))}`);
}
for (const vector of data.vectors) {
  vector.provenance = vector.provenance.map(moveRef);
  vector.derivation = moveDerivation(vector.derivation);
  if (vector.matrixRow) vector.matrixRow = relocate(vector.matrixRow);
}

const snapshot = v => ({ expectedStatus: v.expectedStatus, expectedArtifacts: v.expectedArtifacts });
const review = [];
for (const [caseId, code, row, ...otherRows] of decisions) {
  const vector = data.vectors.find(v => v.caseId === caseId);
  const prior = original.vectors.find(v => v.caseId === caseId);
  const verdict = code === "ok" ? { status: "ok" } : code === "refused" ? { status: "refused" } : { status: "refused", code };
  vector.expectedStatus = code === "ok" || code === "refused" ? code : `refused:${code}`;
  const output = { acceptedUnderInjectedProfile: code === "ok", sourcePreserved: true, migrationExecuted: false };
  if (code === "profile-metadata-missing") output.genericReadOnlyPreviewAllowed = true;
  vector.expectedArtifacts = [{ role: "verdict", json: verdict }, { role: "output", json: output }];
  vector.matrixRow = row;
  vector.provenance = [...new Set([296, 298, row, ...otherRows, 322, 324])].sort((a, b) => a - b).map(ref);
  const changed = hash(snapshot(prior)) !== hash(snapshot(vector));
  const disputed = /s123-s1-minor-/.test(caseId) || /s123-s2-document-schema-/.test(caseId);
  let reason;
  if (changed) reason = changedReasons[code];
  else if (/s123-s2-document-schema-supported-/.test(caseId)) reason = "P1 applies at the supported unequal-schema row: without an available exact source the refusal remains profile-source-unavailable. P2 changes its defining row, not its verdict.";
  else if (/s123-s1-patch-/.test(caseId)) reason = "The patch remedy requires known versions/digests and an available exact source. P1 and the source-unavailable row retain the refusal and preserve source state.";
  else if (/s123-s1-digest-/.test(caseId)) reason = "Both unequal digests are explicitly known for the same profile ID/version. P1 preserves this ordered identity-conflict diagnostic even when the package is unknown or unavailable.";
  else if (/s123-s2-injected-schema-/.test(caseId)) reason = "The injected schema is unsupported. P1 preserves that ordered diagnostic regardless of source availability; P2 reserves profile-schema-version for this P-schema boundary.";
  else if (code === "refused") reason = "Identities and source availability agree but the envelope is invalid. R3.3 explicitly retains a bare refusal and assigns no new diagnostic to this residual case.";
  else if (caseId.endsWith("envelope-invalid-unavailable")) reason = "The unavailable-source row matches before the final valid-envelope acceptance row; source state remains preserved and no migration executes.";
  else reason = moveDerivation(prior.derivation);
  vector.derivation = reason;
  review.push({ caseId, disputed, changed, inputSha256: hash(prior.inputArtifacts), old: snapshot(prior), new: snapshot(vector), oldProvenance: prior.provenance, provenance: vector.provenance, reason });
}
assert.equal(review.filter(v => v.changed).length, 7);
assert.equal(review.filter(v => v.disputed).length, 9);

// Inventory is a coverage/cross-check input only. No expectation is assigned
// from its output; the literal decisions above have already been authored.
const inventoryBytes = read(`${authority}/R33-MATRIX-OUTCOMES.json`);
assert.equal(sha(inventoryBytes), "79c25e5370bc2976b19728468d3614bb43713e1464bce808a4ee5c8ac3890a3e");
const inventory = JSON.parse(inventoryBytes);
assert.equal(inventory.existingVectorCount, 66);
for (const record of review) {
  const entry = inventory.vectors.find(v => v.caseId === record.caseId);
  assert.ok(entry, record.caseId);
  assert.deepEqual(Object.fromEntries(record.new.expectedArtifacts.map(a => [a.role, a.json])), entry.r33, record.caseId);
}
const additional = original.vectors.filter(v => v.operation !== "compatibility-decision" && v.provenance.some(r => {
  const n = Number(r.split(":")[1]); return n >= 294 && n <= 317;
}));
assert.deepEqual(additional.map(v => v.caseId), ["s2b-envelope-profile-change"]);
const changedIds = review.filter(v => v.changed).map(v => v.caseId);
const audit = {
  format: "profile-r33-matrix-review/1", designSha256: pin,
  author: { model: "gpt-6-astra", effort: "xhigh", role: "independent expectation author" },
  inventory: { sha256: sha(inventoryBytes), total: 66, sealed: 45, unsealed: 21,
    changedFromR32: inventory.changedFromR32,
    recordedExpectationChangesBeyondDisputes: inventory.recordedExpectationChangesBeyondDisputes,
    disposition: "All 45 sealed inputs independently reviewed. The other 21 entries are historical/unsealed code assertions, not sealed vectors; runtime disagreement is measured only after sealing." },
  preservation: {
    inputs: hash(original.vectors.map(v => ({ caseId: v.caseId, inputArtifacts: v.inputArtifacts }))),
    unaffectedOutputs: hash(original.vectors.filter(v => !changedIds.includes(v.caseId)).map(v => ({ caseId: v.caseId, ...snapshot(v) })))
  },
  vectors: review,
  additionalMatrixCitations: additional.map(v => ({ caseId: v.caseId, old: snapshot(v), new: snapshot(v),
    oldProvenance: v.provenance, provenance: data.vectors.find(x => x.caseId === v.caseId).provenance,
    reason: "The semantic revision includes the exact profile identity. R3.3 retains this identity/revision requirement; no compatibility operation or verdict is asserted by this envelope witness." }))
};
data.designSha256 = pin;
data.scope = "486 independent vectors under DESIGN R3.3; all 45 compatibility decisions and the additional matrix citation reviewed. Seven verdicts explicitly superseded; all inputs and other expected outputs retained.";
save(root + "expectations.json", data);
save(root + "r33-matrix-review.json", audit);
for (const name of ["step2b-provenance-policy.json", "step4-provenance-policy.json", "s123-provenance-policy.json"]) {
  const policy = load(root + name);
  policy.designSha256 = pin;
  for (const v of policy.vectors) v.required = data.vectors.find(x => x.caseId === v.caseId).provenance;
  save(root + name, policy);
}
const rulesPath = "docs/design/profile-compiler-rules.json";
const rules = load(rulesPath);
rules.designSha256 = pin; rules.revision = "R3.3";
for (const rule of [...rules.rules, ...rules.actions]) rule.provenance = moveRef(rule.provenance);
rules.lexicalProvenance = rules.lexicalProvenance.map(moveRef);
rules.provenance = rules.provenance.map(moveRef);
rules.precedenceScope = rules.precedenceScope.replace("R3.2", "R3.3");
rules.lexicalDependency = rules.lexicalDependency.replace("R3.2", "R3.3");
save(rulesPath, rules);
const refs = [...new Set([...data.vectors.flatMap(v => v.provenance), ...rules.provenance,
  ...rules.rules.map(r => r.provenance), ...rules.actions.map(a => a.provenance), ...rules.lexicalProvenance])]
  .sort((a, b) => Number(a.split(":")[1]) - Number(b.split(":")[1]));
const evidence = load(root + "design-provenance.json");
evidence.designSha256 = pin;
evidence.lines = refs.map(ref => { const text = lines[Number(ref.split(":")[1]) - 1]; return { ref, text, sha256: sha(text) }; });
save(root + "design-provenance.json", evidence);
const inputs = load(root + "inputs.json");
inputs.design = { revision: "R3.3", sha256: pin };
inputs.companionManifest = { sha256: sha(manifest), entries: companions.length };
inputs.companions = companions;
inputs.decisions.lexicalDependency = inputs.decisions.lexicalDependency.replace("R3.2", "R3.3");
save(root + "inputs.json", inputs);
const step4 = load(root + "step4-inputs.json");
step4.designSha256 = pin;
save(root + "step4-inputs.json", step4);
writeFileSync(root + "MANIFEST-R33.sha256", manifest);
for (const name of ["compatibility-codes.json", "compatibility-verdict.schema.json"]) writeFileSync(root + name, readFileSync(`${authority}/${name}`));
const seal = load(root + "expectations.seal.json"), bytes = readFileSync(root + "expectations.json");
seal.bytes = bytes.length; seal.sha256 = sha(bytes);
seal.independentExtension = "R3.3 matrix reseal / gpt-6-astra / xhigh";
save(root + "expectations.seal.json", seal);
console.log(JSON.stringify({ changed: changedIds, expectationSeal: sha(readFileSync(root + "expectations.seal.json")), payload: seal.sha256,
  compactPins: Object.fromEntries(["design-provenance.json", "step2b-provenance-policy.json", "step4-provenance-policy.json", "s123-provenance-policy.json", "r33-matrix-review.json"].map(name => [name, hash(load(root + name))])) }, null, 2));
