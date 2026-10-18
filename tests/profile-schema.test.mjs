import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expectations, readCase, artifact, vendor, readJson, schemaPath } from "./helpers/profile-step3.mjs";
import { parseProfileText, loadProfileText, compileSchema } from "../dist/profile/contracts.js";

const schema = readJson(schemaPath);
const validator = await compileSchema(schema);

for (const vector of expectations.filter(v => v.operation === "profile-text-load" || v.operation === "profile-lexical-parse")) {
  test(`should execute sealed ${vector.caseId} without changing its verdict`, () => {
    const expected = vector.expectedArtifacts[0].json;
    const text = artifact(vector, "profile-text").text;
    if (expected.status === "ok") {
      assert.deepEqual(parseProfileText(text), JSON.parse(text));
    } else {
      assert.throws(() => loadProfileText(text, validator), error => error.code === expected.code);
    }
  });
}

for (const vector of expectations.filter(v => v.caseId.startsWith("lexical-"))) {
  test(`should execute canonical ${vector.caseId} with its sealed code`, () => {
    const input = Buffer.from(readCase(vector).inputArtifacts[0].hex, "hex").toString("utf8");
    const expected = vector.expectedArtifacts[0].json;
    if (expected.status === "ok") assert.equal(Object.is(parseProfileText(input).v, -0), true);
    else assert.throws(() => parseProfileText(input), error => error.code === expected.code);
  });
}

for (const vector of expectations.filter(v => v.caseId.startsWith("schema-"))) {
  test(`should execute the bounded JS outcome of sealed ${vector.caseId}`, async () => {
    const input = readCase(vector);
    const schemaArtifact = artifact(input, "schema");
    const root = schemaArtifact ? readJson(schemaArtifact.path) : artifact(input, "fragmentSchema").json;
    const registry = input.inputArtifacts.filter(a => a.role === "registry").map(a => ({
      bytes: readFileSync(new URL(a.path, vendor)), sha256: a.sha256
    }));
    const run = async () => (await compileSchema(root, registry))(artifact(input, "fragmentData").json);
    if (["profile-schema-ref", "profile-schema-keyword"].some(code => vector.expectedStatus === `refused:${code}`)) {
      await assert.rejects(run, error => vector.expectedStatus === `refused:${error.code}`);
    } else {
      const outcome = await run();
      const golden = vector.expectedArtifacts[0].json.ajv;
      assert.equal(outcome.valid, golden.ok ?? golden.dataOk);
      if (golden.errors) assert.equal(outcome.keyword, golden.errors[0].keyword);
    }
  });
}

test("should keep the private syntax schema byte-identical to the frozen companion", () => {
  assert.deepEqual(readFileSync(new URL("../schemas/profile/profile-mechanism-1.schema.json", import.meta.url)),
    readFileSync(new URL(schemaPath, vendor)));
});

test("should reject unsafe profile integers even when generic JCS admits their binary64 values", () => {
  assert.throws(() => parseProfileText("1e21"), error => error.code === "profile-number");
});

test("should preserve decoded special property names without prototype lookup", () => {
  const value = parseProfileText('{"__proto__":{"x":1},"constructor":2}');
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(Object.hasOwn(value, "__proto__"), true);
  assert.equal(value.__proto__.x, 1);
});

test("should check keywords only at schema positions", async () => {
  const validate = await compileSchema({ type: "object", properties: { format: { type: "string" } }, additionalProperties: false });
  assert.equal(validate({ format: "data" }).valid, true);
  assert.equal(validate({ other: "data" }).keyword, "additionalProperties");
});

test("should enforce registry hashes, explicit references and the closed pattern inventory", async () => {
  await assert.rejects(compileSchema({ $ref: "https://invalid.example/schema" }), { code: "profile-schema-ref" });
  await assert.rejects(compileSchema({ type: "string", pattern: ".*" }), { code: "profile-schema-pattern" });
  await assert.rejects(compileSchema({ $ref: "urn:profile-mechanism:1:profile" }, [{
    bytes: readFileSync(new URL(schemaPath, vendor)), sha256: "0".repeat(64)
  }]), { code: "profile-schema-ref" });
});

test("should compare JSON values structurally and count Unicode scalars", async () => {
  const unique = await compileSchema({ type: "array", uniqueItems: true });
  assert.equal(unique([true, 1]).valid, true);
  assert.equal(unique([{ a: 1, b: 2 }, { b: 2, a: 1 }]).valid, false);
  const length = await compileSchema({ type: "string", minLength: 2 });
  assert.equal(length("𐀀").valid, false);
  const integer = await compileSchema({ type: "integer" });
  assert.equal(integer(true).valid, false);
});

test("should enforce closed syntax without claiming static compilation", () => {
  // The frozen schema is the syntax oracle; these checks do not execute recipes.
  const valueSchema = schema.$defs.value;
  assert.ok(valueSchema.oneOf.length > 0);
  assert.equal(validator(null).valid, false);
  assert.equal(validator({}).valid, false);
});

test("should scan every new step-3 source, schema and test with the frozen brand guard", async () => {
  const { readdirSync } = await import("node:fs");
  const { brandTokens } = await import("./helpers/brand.mjs");
  const scope = JSON.parse(readFileSync(new URL("../docs/design/profile-externalization-scope.json", import.meta.url)));
  const paths = ["src/profile", "schemas/profile", "docs/design/receipts"];
  const files = ["tests/helpers/profile-step3.mjs", "tests/helpers/profile-native.mjs"];
  for (const name of readdirSync(new URL("./", import.meta.url))) if (/^profile-.*\.test\.mjs$/.test(name)) files.push(`tests/${name}`);
  for (const path of paths) for (const name of readdirSync(new URL(`../${path}/`, import.meta.url))) files.push(`${path}/${name}`);
  for (const path of files) {
    assert.deepEqual(brandTokens(path, scope.extraHashes), [], path);
    assert.deepEqual(brandTokens(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), scope.extraHashes), [], path);
  }
});
