import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { successorPin } from "./helpers/lot0-history-pins.mjs";
import { createHash } from "node:crypto";

const repo = fileURLToPath(new URL("../", import.meta.url));
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const receiptPath = "docs/design/receipts/lot0-s123-fix.json";
test("should supersede historical inventories with current byte lengths and digests", () => {
  const receipt = JSON.parse(readFileSync(join(repo, receiptPath)));
  assert.ok(receipt.supersedes.some(record => record.path === "docs/design/receipts/lot0-s2b.json"));
  assert.ok(receipt.supersedes.some(record => record.path === "docs/design/receipts/lot0-s3.json"));
  for (const required of ["tests/profile-corpus-step2b.test.mjs", "tests/profile-r32-expectations.test.mjs", "tests/helpers/profile-seal.mjs"]) {
    assert.ok(receipt.testFiles.some(entry => entry.path === required), `missing ${required}`);
  }
  assert.equal(new Set(receipt.testFiles.map(entry => entry.path)).size, receipt.testFiles.length);
  const successor = JSON.parse(readFileSync(join(repo, "docs/design/receipts/lot0-s123-seal.json")));
  const r33 = JSON.parse(readFileSync(join(repo, "docs/design/receipts/lot0-r33-seal.json")));
  const implementation = JSON.parse(readFileSync(join(repo, "docs/design/receipts/lot0-r33.json")));
  const remediation = JSON.parse(readFileSync(join(repo, "docs/design/receipts/lot0-brand-remediation.json")));
  const closure = JSON.parse(readFileSync(join(repo, "docs/design/receipts/lot0-reconciliation-closed.json")));
  function remediationPin(path, prior) {
    const replacement = remediation.supersedesFiles.find(record => record.path === path);
    if (replacement) assert.deepEqual(replacement.old, { bytes: prior.bytes, sha256: prior.sha256 }, `${path} remediation predecessor`);
    const remediated = replacement?.new ?? prior;
    const closed = closure.supersedesFiles.find(record => record.path === path);
    if (closed) assert.deepEqual(closed.old, { bytes: remediated.bytes, sha256: remediated.sha256 }, `${path} closure predecessor`);
    return successorPin(path, closed?.new ?? remediated);
  }
  function implementationPin(path, prior) {
    const replacement = implementation.supersedesFiles.find(record => record.path === path);
    if (!replacement) return remediationPin(path, prior);
    assert.deepEqual(replacement.old, { bytes: prior.bytes, sha256: prior.sha256 }, `${path} implementation predecessor`);
    return remediationPin(path, replacement.new);
  }
  function currentPin(path, prior) {
    const replacement = r33.supersedesFiles.find(record => record.path === path);
    if (replacement) assert.deepEqual(replacement.old, { bytes: prior.bytes, sha256: prior.sha256 }, `${path} R3.3 predecessor`);
    return implementationPin(path, replacement?.new ?? prior);
  }
  for (const entry of [...receipt.testFiles, ...receipt.supersedes, ...receipt.implementationFiles, ...receipt.expectationAndFreezePins]) {
    const replacement = successor.supersedesFiles.find(record => record.path === entry.path);
    if (replacement) assert.deepEqual(replacement.old, { bytes: entry.bytes, sha256: entry.sha256 });
    const expected = currentPin(entry.path, replacement?.new ?? entry);
    const bytes = readFileSync(join(repo, entry.path));
    assert.equal(bytes.length, expected.bytes, `${entry.path} length`);
    assert.equal(digest(bytes), expected.sha256, `${entry.path} digest`);
  }
  for (const entry of successor.artifacts) {
    const expected = currentPin(entry.path, entry);
    const bytes = readFileSync(join(repo, entry.path));
    assert.equal(bytes.length, expected.bytes, `${entry.path} successor length`);
    assert.equal(digest(bytes), expected.sha256, `${entry.path} successor digest`);
  }
  for (const entry of [...r33.supersedesFiles.map(record => ({ path: record.path, ...record.new })), ...r33.addedFiles]) {
    const expected = implementationPin(entry.path, entry);
    const bytes = readFileSync(join(repo, entry.path));
    assert.equal(bytes.length, expected.bytes, `${entry.path} R3.3 length`);
    assert.equal(digest(bytes), expected.sha256, `${entry.path} R3.3 digest`);
  }
  for (const entry of implementation.artifacts) {
    const expected = remediationPin(entry.path, entry);
    const bytes = readFileSync(join(repo, entry.path));
    assert.equal(bytes.length, expected.bytes, `${entry.path} implementation length`);
    assert.equal(digest(bytes), expected.sha256, `${entry.path} implementation digest`);
  }
  assert.equal(receipt.sealedRecordsEdited, false);
});

test("should reject a forbidden token introduced only in a new receipt", () => {
  const scratch = mkdtempSync(join(tmpdir(), "profile-receipt-guard-"));
  try {
    // Copy bytes for the isolated guard/provenance checks; never alter the originals.
    for (const path of ["dist/profile", "src/profile", "schemas/profile", "tests/helpers", "tests/fixtures/profile-lot0",
      "tests/fixtures/profile-parity-corpus", "tests/fixtures/profile-parity-corpus.pin.json", "tests/fixtures/parity-corpus/MANIFEST.sha256",
      "tests/profile-schema.test.mjs", "docs/design/profile-externalization-scope.json", "docs/design/profile-lot0-baseline.md",
      "docs/design/profile-compiler-rules.json", "docs/design/receipts"]) {
      const destination = join(scratch, path);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(join(repo, path), destination, { recursive: true });
    }
    writeFileSync(join(scratch, "package.json"), '{"type":"module"}');
    // A synthetic forbidden word exercises coverage without embedding a real
    // name or changing the frozen lexicon used by top-level provenance checks.
    const suitePath = join(scratch, "tests/profile-schema.test.mjs");
    let suite = readFileSync(suitePath, "utf8");
    suite = suite.replace('const paths = [', `scope.extraHashes.push("${digest("neutralreceiptprobe")}");\n  const paths = [`);
    writeFileSync(suitePath, suite);
    writeFileSync(join(scratch, "docs/design/receipts/neutral-guard-probe.json"), '{"note":"neutralreceiptprobe"}');
    const childEnvironment = { ...process.env };
    delete childEnvironment.NODE_TEST_CONTEXT;
    const result = spawnSync("node", ["--test", "--test-name-pattern", "should scan every new step-3", suitePath], { cwd: scratch, encoding: "utf8", env: childEnvironment });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /neutral-guard-probe\.json/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
