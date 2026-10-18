import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, readFileSync, readdirSync, writeFileSync, rmSync, symlinkSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { predecessorPin, successorPin } from "./helpers/lot0-history-pins.mjs";

const fixtures = new URL("./fixtures/", import.meta.url);
const root = new URL("profile-parity-corpus/", fixtures);
const pin = new URL("profile-parity-corpus.pin.json", fixtures);
const verifier = () => import("./helpers/profile-seal.mjs");

test("should verify every final vendored contract byte offline", async () => {
  const { verifyCorpus } = await verifier();
  const result = verifyCorpus(root, pin);
  assert.equal(result.cases, 176);
  assert.equal(result.files, 198);
});

test("should pin the final resolved commit and tree with accepted tag metadata", () => {
  const record = JSON.parse(readFileSync(pin));
  assert.equal(record.sourceCommit, "cb46b3b8f893996a83c056f31f8aa92aa2364bd3");
  assert.equal(record.sourceTreeId, "0c6bf891f147079e175a46d0d34f42ff308d235c");
  assert.equal(record.tagObject, "dfb8a986933dd86ad176022df13efecb6c73b325");
  assert.equal(record.status, "final");
  assert.equal(record.tagName, "profile-corpus-v1.0.0");
  assert.equal(record.tagAccepted, true);
  assert.deepEqual(record.manifest, {
    path: "profile-parity-corpus/1/manifest.json", bytes: 30434,
    sha256: "01b81fd9fb69f110a7f302631d6da92126bcb1672c67bea3ea68ff802df39faf"
  });
});

test("should reproduce the pinned contracts tree from all 198 vendored blobs offline", () => {
  const record = JSON.parse(readFileSync(pin));
  const object = (type, bytes) => createHash("sha1")
    .update(`${type} ${bytes.length}\0`).update(bytes).digest();
  let blobs = 0;
  function tree(directory) {
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.isDirectory() ? "/" : "")),
        Buffer.from(b.name + (b.isDirectory() ? "/" : ""))));
    const body = entries.map(entry => {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      assert.ok(entry.isDirectory() || entry.isFile(), "regular Git tree entry");
      const hash = entry.isDirectory() ? tree(path) : (++blobs, object("blob", readFileSync(path)));
      return Buffer.concat([Buffer.from(`${entry.isDirectory() ? "40000" : "100644"} ${entry.name}\0`), hash]);
    });
    return object("tree", Buffer.concat(body));
  }
  const actual = tree(root).toString("hex");
  assert.equal(blobs, 198);
  assert.equal(actual, "0c6bf891f147079e175a46d0d34f42ff308d235c");
  assert.equal(actual, record.sourceTreeId);
});

test("should resolve corpus bytes independently of tag metadata", async () => {
  const { verifyCorpus } = await verifier();
  const scratch = mkdtempSync(join(tmpdir(), "profile-tag-metadata-"));
  try {
    const copyPin = join(scratch, "pin.json");
    const record = JSON.parse(readFileSync(pin));
    record.tagName = "metadata-only";
    record.tagObject = "0".repeat(40);
    writeFileSync(copyPin, JSON.stringify(record));
    assert.deepEqual(verifyCorpus(root, copyPin), { files: 198, cases: 176 });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

for (const mutation of ["byte", "missing", "extra", "manifest", "revision", "tree", "status", "acceptance", "length", "escape", "duplicate", "symlink", "hardlink"]) {
  test(`should reject a corpus with ${mutation} damage`, async () => {
    const { verifyCorpus } = await verifier();
    const scratch = mkdtempSync(join(tmpdir(), "profile-seal-"));
    try {
      const copy = join(scratch, "corpus");
      const copyPin = join(scratch, "pin.json");
      cpSync(root, copy, { recursive: true });
      cpSync(pin, copyPin);
      const p = JSON.parse(readFileSync(copyPin));
      const victim = join(copy, "profile-parity-corpus/1/cases/identity-stable-id.json");
      if (mutation === "byte") writeFileSync(victim, readFileSync(victim).toString().replace("g_", "x_"));
      if (mutation === "missing") rmSync(victim);
      if (mutation === "extra") writeFileSync(join(copy, "extra.json"), "{}");
      if (mutation === "manifest") writeFileSync(join(copy, p.manifest.path), "{}\n");
      if (mutation === "tree") p.sourceTreeId = "0".repeat(40);
      if (mutation === "status") p.status = "unaccepted";
      if (mutation === "acceptance") p.tagAccepted = false;
      if (mutation === "revision") p.sourceCommit = "0".repeat(40);
      if (mutation === "length") p.files[0].bytes++;
      if (mutation === "escape") p.files[0].path = "../outside";
      if (mutation === "duplicate") p.files.push(p.files[0]);
      if (mutation === "symlink" || mutation === "hardlink") {
        const bytes = readFileSync(victim);
        const outside = join(scratch, "outside.json");
        writeFileSync(outside, bytes);
        rmSync(victim);
        (mutation === "symlink" ? symlinkSync : linkSync)(outside, victim);
      }
      writeFileSync(copyPin, JSON.stringify(p));
      assert.throws(() => verifyCorpus(copy, copyPin));
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
}

test("should pin baseline, separate parent manifests and all companion receipts", async () => {
  const { verifyFreeze } = await verifier();
  const freeze = verifyFreeze();
  assert.equal(freeze.base.ref, "e9f5f8961ac63f7163003c0960cb20c4080147a3");
  assert.equal(freeze.companions.length, 46);
  assert.equal(freeze.parents.canvas, "61903a61e2a6f258b506b4cdcd310a57787eee30845d6deb996afbb54abf33a9");
  assert.equal(freeze.parents.headless, "def4ffb25b6c60f963226fb62d9b433e10a1420f340a1835b8ac273711e29b3d");
  assert.equal(freeze.base.stashDisposition, "dropped-verified-duplicate");
});

test("should restrict the seal verifier to offline Node builtins", () => {
  const source = readFileSync(new URL("./helpers/profile-seal.mjs", import.meta.url), "utf8");
  const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m => m[1]);
  assert.ok(imports.length);
  assert.ok(imports.every(id => ["node:assert/strict", "node:fs", "node:path", "node:url", "node:crypto"].includes(id)));
  assert.doesNotMatch(source, /\b(?:fetch|exec|spawn|import\s*\(|https?|net|child_process)\b/);
});

test("should close the reconciliation gate after the delegated conductor drop", async () => {
  const { verifyFreeze } = await verifier();
  const freeze = verifyFreeze();
  const receipt = JSON.parse(readFileSync(new URL("../docs/design/receipts/lot0-s2-r32.json", import.meta.url)));
  for (const baseline of [freeze.base, receipt.inputs.baseline]) {
    assert.equal(baseline.stashDisposition, "dropped-verified-duplicate");
    for (const record of [baseline, baseline.stashDecision]) {
      assert.equal(record.gateState, "closed");
      assert.equal(record.blocksIndependentSteps, false);
    }
    assert.equal(baseline.stashDecision.agentTouchedStash, false);
    assert.equal(baseline.stashDecision.droppedBy, "conductor, git execution delegated by the owner");
    assert.equal(baseline.stashDecision.date, "2026-10-15");
    assert.equal(baseline.stashDecision.stashListEmpty, true);
    assert.equal(baseline.stashDecision.stashObject, "2116408888bcbb1105560f1af6e088bdef2dd2af");
    assert.equal(baseline.stashDecision.duplicateDiffSha256, "94a746a6ca13c68882af01d22bcb3529a4e72ceea96bdcea24daa221d13f1a12");
  }
  for (const name of ["lot0-s3.json", "lot0-s123-fix.json", "lot0-s123-seal.json"]) {
    const other = JSON.parse(readFileSync(new URL(`../docs/design/receipts/${name}`, import.meta.url)));
    assert.equal(other.source?.reconciliation?.gateState ?? other.limits.stashGate, "closed", name);
  }
});

test("should have an empty stash list when the reconciliation gate is closed", async () => {
  const { verifyFreeze } = await verifier();
  assert.equal(verifyFreeze().base.gateState, "closed");
  assert.equal(execFileSync("git", ["stash", "list"], { cwd: new URL("../", import.meta.url), encoding: "utf8" }), "");
});

test("should reject a reopened reconciliation gate after consistent byte resealing", async () => {
  const { verifyFreeze } = await verifier();
  const scratch = mkdtempSync(join(tmpdir(), "profile-gate-"));
  try {
    cpSync(new URL("profile-lot0/", fixtures), scratch, { recursive: true });
    const inputsPath = join(scratch, "inputs.json");
    const sealPath = join(scratch, "freeze.seal.json");
    const original = JSON.parse(readFileSync(inputsPath));
    for (const location of ["baseline", "stashDecision"]) {
      const inputs = structuredClone(original);
      const record = location === "baseline" ? inputs.base : inputs.base.stashDecision;
      record.gateState = "resolved-except-stash";
      const bytes = Buffer.from(JSON.stringify(inputs, null, 2) + "\n");
      writeFileSync(inputsPath, bytes);
      const seal = JSON.parse(readFileSync(sealPath));
      const entry = seal.files.find(entry => entry.path === "inputs.json");
      entry.bytes = bytes.length;
      entry.sha256 = createHash("sha256").update(bytes).digest("hex");
      writeFileSync(sealPath, JSON.stringify(seal));
      assert.throws(() => verifyFreeze(scratch), /closed stash gate/, location);
    }
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("should bind every reconciliation reseal to its predecessor and current bytes", () => {
  const repo = new URL("../", import.meta.url);
  const receipt = JSON.parse(readFileSync(new URL("docs/design/receipts/lot0-reconciliation-closed.json", repo)));
  const pin = bytes => ({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  assert.equal(receipt.gateState, "closed");
  assert.ok(receipt.supersedesFiles.length > 0);
  assert.equal(new Set(receipt.supersedesFiles.map(entry => entry.path)).size, receipt.supersedesFiles.length);
  for (const entry of receipt.supersedesFiles) {
    assert.deepEqual(predecessorPin(receipt.initialHead, entry.path), entry.old, `${entry.path} predecessor`);
    assert.deepEqual(pin(readFileSync(new URL(entry.path, repo))), successorPin(entry.path, entry.new), `${entry.path} successor`);
  }
});

for (const mutation of ["inputs.json", "parents.json", "reconciliation.md"]) {
  test(`should reject a stale or missing frozen ${mutation}`, async () => {
    const { verifyFreeze } = await verifier();
    const scratch = mkdtempSync(join(tmpdir(), "profile-freeze-"));
    try {
      cpSync(new URL("profile-lot0/", fixtures), scratch, { recursive: true });
      if (mutation === "parents.json") rmSync(join(scratch, mutation));
      else writeFileSync(join(scratch, mutation), "{}\n");
      assert.throws(() => verifyFreeze(scratch));
    } finally { rmSync(scratch, { recursive: true, force: true }); }
  });
}
