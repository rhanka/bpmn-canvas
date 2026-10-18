import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashOf } from "./helpers/brand.mjs";
import { resolveBaseRevision } from "./helpers/git-base.mjs";
import { scanAddedPaths } from "./helpers/path-guard.mjs";

const probe = hashOf("neutralprobe");
const other = hashOf("neutralother");
const row = `tests/neutral.txt:1\t${probe}`;
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), "git-base-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Base Test");
  git(root, "config", "user.email", "base@example.invalid");
  mkdirSync(join(root, "tests/fixtures"), { recursive: true });
  const text = `${row}\n`;
  writeFileSync(join(root, "tests/fixtures/brand-baseline.tsv"), text);
  writeFileSync(join(root, "tests/fixtures/brand-baseline.pin.json"), JSON.stringify({ format: "brand-baseline-pin/1", rowCount: 1, rowSha256: [hashOf(row)], sha256: hashOf(text) }));
  writeFileSync(join(root, "fixture.txt"), "neutral\n");
  git(root, "add", "tests/fixtures/brand-baseline.tsv", "tests/fixtures/brand-baseline.pin.json", "fixture.txt");
  git(root, "commit", "-m", "initial neutral content");
  return root;
}

// Detached checkouts keep no local branch, only the remote-tracking base.
function detachWithoutLocalMain(root) {
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(root, "checkout", "--detach", "HEAD");
  git(root, "branch", "-D", "main");
}

test("should prefer the local main branch when present", t => {
  const root = repository(t);
  assert.equal(resolveBaseRevision(root), "main");
  assert.deepEqual(scanAddedPaths(root), []);
});

test("should read the base history through the remote-tracking main", async t => {
  const { scanCommitMessages } = await import("./helpers/brand-baseline.mjs");
  const root = repository(t);
  detachWithoutLocalMain(root);
  assert.equal(resolveBaseRevision(root), "refs/remotes/origin/main");
  assert.deepEqual(scanCommitMessages(root, new Set([probe]), [probe, other]), []);
  assert.deepEqual(scanAddedPaths(root), []);
  const probePath = ["/", "home", "/", "person/file"].join("");
  writeFileSync(join(root, "fixture.txt"), `neutral\n${probePath}\n`);
  git(root, "add", "fixture.txt");
  git(root, "commit", "-m", "second neutral content");
  assert.deepEqual(scanAddedPaths(root), ["fixture.txt:2"]);
});

test("should fail loudly when no base revision exists", async t => {
  const { scanCommitMessages } = await import("./helpers/brand-baseline.mjs");
  const root = repository(t);
  git(root, "checkout", "--detach", "HEAD");
  git(root, "branch", "-D", "main");
  assert.throws(() => resolveBaseRevision(root), /base revision unavailable/);
  assert.throws(() => scanAddedPaths(root), /path diff unavailable/);
  assert.throws(() => scanCommitMessages(root, new Set([probe]), [probe]));
});
