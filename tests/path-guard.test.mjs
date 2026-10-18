import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanPathText, scanTrackedPaths, scanAddedPaths } from "./helpers/path-guard.mjs";

const repo = new URL("../", import.meta.url);
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const probes = [
  ["/", "home", "/", "person/file"].join(""),
  ["/", "Users", "/", "person/file"].join(""),
  ...["C", "c"].flatMap(drive => ["\\", "/"].map(slash => `${drive}:${slash}uSeRs${slash}person${slash}file`)),
];

test("should detect home directories without disclosing their contents", () => {
  for (const probe of probes) {
    assert.deepEqual(scanPathText("fixture.txt", `neutral\n${probe}`), ["fixture.txt:2"]);
    assert.deepEqual(scanPathText("fixture.bin", `\0${probe}\0`), ["fixture.bin:1"]);
  }
  assert.deepEqual(scanPathText("fixture.txt", "<repo>/file <scratch>/file <sibling-repo>/file"), []);
});

test("should reject every tracked home path without exceptions", () => {
  assert.deepEqual(scanTrackedPaths(repo), []);
});

test("should reject home paths in added lines of the branch diff", () => {
  assert.deepEqual(scanAddedPaths(repo), []);
});

test("should scan tracked bytes and added lines while ignoring untracked and removed content", t => {
  const root = mkdtempSync(join(tmpdir(), "path-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Guard Test");
  git(root, "config", "user.email", "guard@example.invalid");
  writeFileSync(join(root, "fixture.txt"), `${probes[0]}-removed\n`);
  git(root, "add", "fixture.txt");
  git(root, "commit", "-m", "record guard fixture");
  git(root, "checkout", "-b", "probe");
  writeFileSync(join(root, "fixture.txt"), "neutral\n");
  git(root, "add", "fixture.txt");
  git(root, "commit", "-m", "remove fixture path");
  writeFileSync(join(root, "untracked.txt"), probes[0]);
  assert.deepEqual(scanTrackedPaths(root), []);
  assert.deepEqual(scanAddedPaths(root), []);
  for (const probe of probes) {
    writeFileSync(join(root, "fixture.txt"), `neutral\n${probe}\n`);
    assert.deepEqual(scanTrackedPaths(root), ["fixture.txt:2"]);
    git(root, "add", "fixture.txt");
    git(root, "commit", "-m", "exercise added fixture path");
    assert.deepEqual(scanAddedPaths(root), ["fixture.txt:2"]);
  }
  git(root, "branch", "-D", "main");
  assert.throws(() => scanAddedPaths(root), /path diff unavailable/);
});
