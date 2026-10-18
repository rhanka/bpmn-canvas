import { test } from "node:test";
import assert from "node:assert/strict";
import { brandHashesSha256, brandTokens, hashOf } from "./helpers/brand.mjs";

test("should pin the shared union of brand hashes", () => {
  assert.equal(brandHashesSha256, "a3e22cb4caff99dd72506ba8a770fd6bd838b0e2870f7cbb18ad896755625174");
});

test("should detect synthetic single words through extra hashes", () => {
  const token = "alpha";
  assert.deepEqual(brandTokens("Alpha alphaBeta beta_alpha", [hashOf(token)]), ["Alpha", "alpha"]);
});

test("should detect overlapping synthetic adjacent word pairs through extra hashes", () => {
  const token = ["alpha", "beta"].join(" ");
  const extraHashes = [hashOf(token)];
  assert.deepEqual(brandTokens("delta Alpha Beta gamma", extraHashes), ["Alpha Beta"]);
  for (const separator of ["  ", "\n", "-", "_"]) {
    assert.deepEqual(brandTokens(["alpha", "beta"].join(separator), extraHashes), []);
  }
});

test("should detect synthetic bracketed forms including common array indices through extra hashes", () => {
  for (const inner of ["gamma", "gamma_0", "0", "i"]) {
    const token = `[${inner}]`;
    const extraHashes = [hashOf(token)];
    assert.deepEqual(brandTokens(`value${token.toUpperCase()}`, extraHashes), [token.toUpperCase()]);
    assert.deepEqual(brandTokens(inner, extraHashes), []);
  }
});
