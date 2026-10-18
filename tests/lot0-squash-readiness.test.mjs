import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashOf } from "./helpers/brand.mjs";

const root = new URL("../", import.meta.url);
const published = [
  { commit: "07be09e21d852beb592314d50e0370e883c9b842", line: 1, sha256: "583423608eda0cb63146a67a6ad655858bc511ba6f0d4fd742c0d898b684295a" },
  { commit: "45aa6903174462e8dd95137971510f28ba5b4a19", line: 7, sha256: "32ed8e0a3026bc02976abc70f27ddfe1f149b8f4dc5dad00a1451dd7e86e42e9" },
];
const row = ({ commit, line, sha256 }) => `git/${commit}:${line}\t${sha256}`;

test("should freeze exactly the two published commit occurrence exceptions", async () => {
  const { publishedCommitExceptions } = await import("./helpers/brand-baseline.mjs");
  assert.deepEqual(publishedCommitExceptions, published);
  assert.ok(Object.isFrozen(publishedCommitExceptions));
  for (const entry of publishedCommitExceptions) {
    assert.ok(Object.isFrozen(entry));
    assert.throws(() => { entry.line++; }, TypeError);
  }
  assert.throws(() => publishedCommitExceptions.push(published[0]), TypeError);
});

test("should reject a third commit and changed lines or hashes on either published commit", async () => {
  const { outsidePublishedCommitExceptions } = await import("./helpers/brand-baseline.mjs");
  const rejected = published.flatMap(entry => [
    row({ ...entry, commit: "0".repeat(40) }),
    row({ ...entry, line: entry.line + 1 }),
    row({ ...entry, sha256: published.find(other => other !== entry).sha256 }),
  ]);
  assert.deepEqual(outsidePublishedCommitExceptions(published.map(row)), []);
  assert.deepEqual(outsidePublishedCommitExceptions([...published.map(row), ...rejected]), rejected);
});

test("should seal every predecessor pin and reject unapproved history substitutions", async () => {
  const { loadHistoryPins, predecessorPin, successorPin } = await import("./helpers/lot0-history-pins.mjs");
  const pins = loadHistoryPins();
  const expected = ["lot0-brand-remediation", "lot0-reconciliation-closed"].flatMap(name => {
    const receipt = JSON.parse(readFileSync(new URL(`docs/design/receipts/${name}.json`, root)));
    return receipt.supersedesFiles.map(entry => ({ commit: entry.predecessorCommit ?? receipt.initialHead, path: entry.path, ...entry.old }));
  });
  assert.deepEqual(pins.predecessors, expected);
  for (const { commit, path, bytes, sha256 } of expected) assert.deepEqual(predecessorPin(commit, path), { bytes, sha256 });
  assert.throws(() => predecessorPin("0".repeat(40), expected[0].path), /predecessor/);
  assert.throws(() => predecessorPin(expected[0].commit, "tests/missing.mjs"), /predecessor/);
  const text = readFileSync(new URL("tests/fixtures/lot0-history.pin.json", root), "utf8");
  assert.throws(() => loadHistoryPins(text.replace(expected[0].sha256, "0".repeat(64))), /history pin digest/);
  assert.deepEqual(pins.successors.map(entry => entry.path).sort(), ["tests/brand-baseline.test.mjs", "tests/profile-corpus.test.mjs", "tests/profile-s123-receipt.test.mjs"]);
  for (const entry of pins.successors) {
    const bytes = readFileSync(new URL(entry.path, root));
    assert.deepEqual(successorPin(entry.path, entry.previous), { bytes: bytes.length, sha256: hashOf(bytes) });
    assert.throws(() => successorPin(entry.path, { ...entry.previous, sha256: "0".repeat(64) }), /successor predecessor/);
  }
});

test("should verify remediation and reconciliation when intermediate Git objects are unavailable", t => {
  const scratch = mkdtempSync(join(tmpdir(), "lot0-history-free-"));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const git = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const shim = join(scratch, "git");
  writeFileSync(shim, `#!${process.execPath}
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
if (["show", "rev-parse", "cat-file"].includes(args[0]) && args.slice(1).some(arg => /\\b[a-f0-9]{7,40}\\b/.test(arg))) process.exit(97);
const result = spawnSync(${JSON.stringify(git)}, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
`);
  chmodSync(shim, 0o755);
  assert.equal(spawnSync("node", [shim, "show", `${"a".repeat(40)}:tests/neutral.mjs`]).status, 97);
  const env = { ...process.env, PATH: `${scratch}:${process.env.PATH}` };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync("node", [
    "--test", "--test-name-pattern=should verify every remediation successor|should bind every reconciliation reseal",
    "tests/brand-baseline.test.mjs", "tests/profile-corpus.test.mjs",
  ], { cwd: root, encoding: "utf8", env });
  assert.match(result.stdout, /^# pass 2$/m);
  assert.match(result.stdout, /^# fail 0$/m);
  assert.equal(result.status, 0, `history-independent tests output sha256=${hashOf(result.stdout + result.stderr)}`);
});

test("should verify the explicit path reseal and every predecessor and successor digest", async () => {
  const { loadPathReseal, successorPin } = await import("./helpers/lot0-history-pins.mjs");
  const receipt = loadPathReseal();
  assert.deepEqual(receipt.supersedesFiles.map(entry => entry.path).sort(), [
    "docs/design/receipts/lot0-brand-gates-validation.json",
    "docs/design/receipts/lot0-s3.json",
    "docs/design/receipts/workbench-review.md",
  ]);
  for (const entry of receipt.supersedesFiles) {
    const bytes = readFileSync(new URL(entry.path, root));
    assert.deepEqual({ bytes: bytes.length, sha256: hashOf(bytes) }, successorPin(entry.path, entry.old));
    assert.notDeepEqual(entry.old, entry.new);
  }
  const closure = JSON.parse(readFileSync(new URL("docs/design/receipts/lot0-reconciliation-closed.json", root)));
  const old = closure.supersedesFiles.find(entry => entry.path === "docs/design/receipts/lot0-s3.json").new;
  assert.deepEqual(receipt.supersedesFiles.find(entry => entry.path === "docs/design/receipts/lot0-s3.json").old, old);
  const text = readFileSync(new URL("docs/design/receipts/lot0-squash-paths-reseal.json", root), "utf8");
  assert.throws(() => loadPathReseal(text.replace(receipt.supersedesFiles[0].old.sha256, "0".repeat(64))), /path reseal digest/);
});
