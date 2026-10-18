import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashOf } from "./helpers/brand.mjs";

const loadGuard = () => import("./helpers/brand-baseline.mjs");
const baselinePath = "tests/fixtures/brand-baseline.tsv";
const pinPath = "tests/fixtures/brand-baseline.pin.json";
const branch = "workbench/functions-20261004-profile-lot0";
const probe = hashOf("neutralprobe");
const other = hashOf("neutralother");
const row = `tests/neutral.txt:1\t${probe}`;
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function repository(t, message = "initial neutral content") {
  const root = mkdtempSync(join(tmpdir(), "brand-legacy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Gate Test");
  git(root, "config", "user.email", "gate@example.invalid");
  mkdirSync(join(root, "tests/fixtures"), { recursive: true });
  const text = row + "\n";
  writeFileSync(join(root, baselinePath), text);
  writeFileSync(join(root, pinPath), JSON.stringify({ format: "brand-baseline-pin/1", rowCount: 1, rowSha256: [hashOf(row)], sha256: hashOf(text) }));
  git(root, "add", baselinePath, pinPath);
  git(root, "commit", "-m", message);
  git(root, "checkout", "-b", branch);
  return root;
}

test("should derive legacy hash allowances from the committed shrinking baseline", async t => {
  const { baselineHashAllowlist } = await loadGuard();
  const root = repository(t);
  assert.deepEqual([...baselineHashAllowlist(root)], [probe]);
  writeFileSync(join(root, baselinePath), "");
  assert.deepEqual([...baselineHashAllowlist(root)], []);
  for (const replacement of [`${row}\ntests/new.txt:1\t${other}\n`, `tests/new.txt:1\t${other}\n`]) {
    writeFileSync(join(root, baselinePath), replacement);
    assert.throws(() => baselineHashAllowlist(root), /baseline/);
  }
  // Editing the working pin cannot authorize a new hash.
  const text = `tests/new.txt:1\t${other}\n`;
  writeFileSync(join(root, pinPath), JSON.stringify({ format: "brand-baseline-pin/1", rowCount: 1, rowSha256: [hashOf(text.trim())], sha256: hashOf(text) }));
  assert.throws(() => baselineHashAllowlist(root), /baseline/);
  writeFileSync(join(root, baselinePath), "");
  git(root, "add", baselinePath);
  git(root, "commit", "-m", "remove baseline");
  writeFileSync(join(root, baselinePath), row + "\n");
  assert.throws(() => baselineHashAllowlist(root), /baseline/);
});

test("should reject non-baseline hashes with path and line diagnostics in legacy gates", async () => {
  const { outsideBaselineHashes } = await loadGuard();
  const allowed = new Set([probe]);
  const hits = outsideBaselineHashes("dist/neutral.js", "neutralprobe\nneutralother", allowed, [probe, other]);
  assert.deepEqual(hits, [`dist/neutral.js:2\t${other}`]);
  assert.deepEqual(outsideBaselineHashes("dist/neutral.js", "neutralprobe", allowed, [probe, other]), []);
  assert.deepEqual(outsideBaselineHashes("dist/neutral.js", "neutralprobe", new Set(), [probe]), [`dist/neutral.js:1\t${probe}`]);
});

test("should exempt only baseline hashes in unpushed lot 0 commit messages", async t => {
  const { scanCommitMessages } = await loadGuard();
  const root = repository(t);
  git(root, "commit", "--allow-empty", "-m", "neutralprobe");
  assert.deepEqual(scanCommitMessages(root, new Set([probe]), [probe, other]), []);
  git(root, "commit", "--allow-empty", "-m", "neutralother");
  const hits = scanCommitMessages(root, new Set([probe]), [probe, other]);
  assert.equal(hits.length, 1);
  assert.match(hits[0], new RegExp(`^git/[a-f0-9]{40}:1\\t${other}$`));
});

test("should reject baseline hashes in main history even when inherited by lot 0", async t => {
  const { scanCommitMessages } = await loadGuard();
  const root = repository(t, "neutralprobe");
  assert.equal(scanCommitMessages(root, new Set([probe]), [probe]).length, 1);
});

test("should reject baseline hashes after the local commit becomes reachable from main", async t => {
  const { scanCommitMessages } = await loadGuard();
  const root = repository(t);
  git(root, "commit", "--allow-empty", "-m", "neutralprobe");
  git(root, "branch", "-f", "main", "HEAD");
  assert.equal(scanCommitMessages(root, new Set([probe]), [probe]).length, 1);
});

test("should reject baseline hashes on other branches and remote reachable commits", async t => {
  const { scanCommitMessages } = await loadGuard();
  const root = repository(t);
  git(root, "commit", "--allow-empty", "-m", "neutralprobe");
  git(root, "checkout", "-b", "other-work");
  assert.equal(scanCommitMessages(root, new Set([probe]), [probe]).length, 1);
  git(root, "checkout", branch);
  git(root, "update-ref", "refs/remotes/origin/lot0", "HEAD");
  assert.equal(scanCommitMessages(root, new Set([probe]), [probe]).length, 1);
});

test("should fail closed when main history is unavailable", async t => {
  const { scanCommitMessages } = await loadGuard();
  const root = repository(t);
  git(root, "branch", "-D", "main");
  assert.throws(() => scanCommitMessages(root, new Set([probe]), [probe]));
});
