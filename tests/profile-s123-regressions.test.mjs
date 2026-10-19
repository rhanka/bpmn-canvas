// Unsealed regression checks; compatibility follows DESIGN R3.3, never oracle replacements.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCompatibility } from "../dist/profile/compatibility.js";
import { checkStaticRule, verifyResourcePins } from "../dist/profile/static-contracts.js";
import { descriptorIndex, checkDeletionReferences } from "../dist/profile/native-contracts.js";
import { profileIdentity, validateEnvelope, semanticRevision } from "../dist/profile/envelope.js";
import { canonicalDigest, ProfileContractError } from "../dist/profile/canonical.js";
import { compileSchema } from "../dist/profile/contracts.js";

const pin = { id: "neutral-base", version: "1", sha256: "0".repeat(64) };
const bareRefusal = error => error instanceof ProfileContractError && !Object.hasOwn(error, "code");
const identity = { mechanismVersion: "1", schemaVersion: "1.0.0", profile: "neutral", version: "1.2.3",
  sha256: "1".repeat(64), base: pin, descriptors: [pin] };
const facts = () => ({ runtime: { mechanisms: ["1"], schemas: ["1.0.0", "1.1.0"], capabilities: [], assets: [] },
  injected: structuredClone(identity), document: { documentVersion: "1", profileIdentity: structuredClone(identity) },
  requiredCapabilities: [], requiredAssets: [], sourcePackage: "known-and-available", envelopeValid: true, selectedMigration: true });

// DESIGN R3.3:298,316-320: P1 covers every patch/minor direction.
for (const [version, code] of [["1.2.2", "profile-patch-migration-required"], ["1.2.4", "profile-patch-downgrade-required"],
  ["1.1.9", "profile-minor-migration-required"], ["1.3.0", "profile-minor-downgrade-required"]]) {
  for (const sourcePackage of ["known-and-available", "unknown", "unavailable"]) {
    test(`should check source availability for ${version} with ${sourcePackage}`, () => {
      const input = facts();
      input.document.profileIdentity.version = version;
      input.sourcePackage = sourcePackage;
      const before = structuredClone(input);
      assert.deepEqual(checkCompatibility(input), {
        verdict: { status: "refused", code: sourcePackage === "known-and-available" ? code : "profile-source-unavailable" },
        output: { acceptedUnderInjectedProfile: false, sourcePreserved: true, migrationExecuted: false }
      });
      assert.deepEqual(input, before);
    });
  }
}
test("should keep earlier identity conflicts ahead of unavailable source", () => {
  const input = facts();
  input.sourcePackage = "unavailable";
  input.document.profileIdentity.sha256 = "2".repeat(64);
  assert.equal(checkCompatibility(input).verdict.code, "profile-digest-mismatch");
  input.document.profileIdentity.profile = "other-neutral";
  assert.equal(checkCompatibility(input).verdict.code, "profile-source-unavailable");
});
// DESIGN R3.3:298,310: supported unequal schemas require a source-dependent migration.
for (const sourcePackage of ["unavailable", "known-and-available"]) {
  test(`should refuse schema identity disagreement before ${sourcePackage} source and migration`, () => {
    const input = facts();
    input.document.profileIdentity.schemaVersion = "1.1.0";
    input.document.profileIdentity.version = "1.2.2";
    input.sourcePackage = sourcePackage;
    assert.equal(checkCompatibility(input).verdict.code, sourcePackage === "known-and-available"
      ? "profile-schema-migration-required" : "profile-source-unavailable");
  });
}
test("should refuse invalid exact envelopes without an invented parity code", () => {
  const input = facts();
  input.envelopeValid = false;
  assert.deepEqual(checkCompatibility(input), { verdict: { status: "refused" },
    output: { acceptedUnderInjectedProfile: false, sourcePreserved: true, migrationExecuted: false } });
});

// DESIGN.md:124,126,128,186: both occurrence sources have the same order contract.
for (const domain of ["RenderData", "PageHandle"]) for (const order of ["page-occurrence", "id"]) {
  test(`should check ${domain} occurrence traversal with ${order} order`, async () => {
    const run = () => checkStaticRule("CR-03", { from: "source", via: "occurrences", order }, { bindings: { source: domain }, location: "export" });
    if (order === "page-occurrence") await run();
    else assert.throws(run, { code: "profile-selector-order" });
  });
}
for (const domain of ["RenderData", "PageHandle"]) for (const location of ["export", "render", "validation", "create", undefined]) {
  test(`should restrict ${domain} occurrences to export/render instead of ${location ?? "absent"} context`, async () => {
    const context = { bindings: { source: domain }, ...(location ? { location } : {}) };
    const run = () => checkStaticRule("CR-03", { from: "source", via: "occurrences", order: "page-occurrence" }, context);
    if (["export", "render"].includes(location)) await run();
    else assert.throws(run, { code: "profile-type" });
  });
}
for (const [domain, traversal] of [["RenderData", { via: "pages", order: "page-occurrence" }],
  ["OccurrenceHandle", { via: "semantic", order: "id" }],
  ["OccurrenceHandle", { via: "reference", property: "sourceOccurrence", order: "page-occurrence" }]]) {
  for (const location of ["export", "render", "validation", "create", undefined]) {
    test(`should restrict ${domain} ${traversal.via} to export/render instead of ${location ?? "absent"} context`, async () => {
      const context = { bindings: { source: domain }, ...(location ? { location } : {}) };
      const run = () => checkStaticRule("CR-03", { from: "source", ...traversal }, context);
      if (["export", "render"].includes(location)) await run();
      else assert.throws(run, { code: "profile-type" });
    });
  }
}

// DESIGN.md:260,421,425: these refusals have no specified diagnostic code.
test("should refuse mismatched resource bytes without an invented parity code", async () => {
  assert.throws(() => verifyResourcePins([{ assetKey: "neutral", sha256: "0".repeat(64) }], new Map([["neutral", new Uint8Array([1])]])), bareRefusal);
});
test("should refuse live deletion dependencies without an invented parity code", () => {
  assert.throws(() => checkDeletionReferences([{ sourceId: "dependent" }], [], "refuseIfReferenced"), bareRefusal);
  checkDeletionReferences([{ sourceId: "dependent" }], ["dependent"], "includeDeclared");
});
const envelopeSyntax = await compileSchema(JSON.parse(readFileSync(new URL("../schemas/profile/document-envelope-1.schema.json", import.meta.url))));
const envelopeDescriptors = descriptorIndex({ types: { "bpmn:Definitions": { id: true, scalars: ["id", "targetNamespace", "exporterVersion"], containment: {}, references: {} } } });
const envelopeContext = { syntax: envelopeSyntax, descriptors: envelopeDescriptors, supportRoles: [], storageValidator: () => true };
const envelope = async () => {
  const tree = { $type: "bpmn:Definitions", id: "root", targetNamespace: "urn:neutral", exporterVersion: "1" };
  return { documentVersion: "1", profileIdentity: identity, tree, bindings: [], semanticRevision: await semanticRevision(tree, identity, []) };
};
for (const damage of ["unknown-field", "null", "storage", "namespace", "exporter", "presentation"]) {
  test(`should refuse ${damage} envelope damage without an invented parity code`, async () => {
    const value = await envelope(), context = { ...envelopeContext };
    if (damage === "unknown-field") value.extra = true;
    if (damage === "null") value.tree.extra = null;
    if (damage === "storage") context.storageValidator = () => false;
    if (damage === "namespace") delete value.tree.targetNamespace;
    if (damage === "exporter") delete value.tree.exporterVersion;
    if (damage === "presentation") {
      value.tree.view = "neutral";
      context.descriptorRoles = [{ property: "bpmn:Definitions.view", role: "presentation" }];
    }
    const before = structuredClone(value);
    await assert.rejects(() => validateEnvelope(value, context), bareRefusal);
    assert.deepEqual(value, before);
  });
}

// DESIGN.md:79,185: inherited native fields retain their pinned scalar types.
const type = (extra = {}) => ({ id: false, scalars: [], containment: {}, references: {}, ...extra });
test("should preserve inherited scalar types through multiple parents and child overrides", async () => {
  const descriptors = { types: descriptorIndex({ types: {
    Parent: type({ scalars: ["name", "flag"], scalarTypes: { name: "string", flag: "boolean" } }),
    LaterParent: type({ scalars: ["flag"], scalarTypes: { flag: "number" } }),
    Child: type({ extends: ["Parent", "LaterParent"] }),
    Grandchild: type({ extends: ["Child"], scalarTypes: { flag: "string" } })
  } }) };
  assert.deepEqual(descriptors.types.Child.scalarTypes, { name: "string", flag: "number" });
  assert.deepEqual(descriptors.types.Grandchild.scalarTypes, { name: "string", flag: "string" });
  const concat = path => ({ location: "value", value: { op: "concat", values: [{ op: "read", binding: "self", path }] } });
  await checkStaticRule("CR-02", concat("/name"), { descriptors, bindings: { self: "Child" } });
  assert.throws(() => checkStaticRule("CR-02", concat("/flag"), { descriptors, bindings: { self: "Child" } }), { code: "profile-type" });
  await checkStaticRule("CR-02", concat("/flag"), { descriptors, bindings: { self: "Grandchild" } });
});

// DESIGN.md:46,65-75,260: hash a complete profile document, never an identity pin.
const completeProfile = JSON.parse(readFileSync(new URL("./fixtures/profile-parity-corpus/profile-mechanism/1/neutral-profile.json", import.meta.url)));
test("should hash the complete profile including every injected section", async () => {
  assert.equal((await profileIdentity(completeProfile)).sha256, await canonicalDigest(completeProfile));
  const changed = structuredClone(completeProfile);
  changed.messages.push({ id: "neutral-message", text: [] });
  assert.notEqual((await profileIdentity(changed)).sha256, (await profileIdentity(completeProfile)).sha256);
});
test("should refuse identity-only arguments to the complete-profile identity helper", async () => {
  const { sha256, ...identityOnly } = identity;
  assert.throws(() => profileIdentity(identityOnly), { code: "profile-schema" });
  assert.throws(() => profileIdentity(identity), { code: "profile-schema" });
});
const profileSchema = JSON.parse(readFileSync(new URL("../schemas/profile/profile-mechanism-1.schema.json", import.meta.url)));
for (const section of profileSchema.required) {
  test(`should refuse a profile digest when required section ${section} is absent`, async () => {
    const incomplete = structuredClone(completeProfile);
    delete incomplete[section];
    assert.throws(() => profileIdentity(incomplete), { code: "profile-schema" });
  });
}
