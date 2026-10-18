import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hashOf } from "./helpers/brand.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const script = fileURLToPath(new URL("../scripts/check-brand-release.mjs", import.meta.url));
const baselinePath = "tests/fixtures/brand-baseline.tsv";
const overridePath = `docs/release/override-${pkg.version}.json`;
const baseline = `tests/neutral.txt:1\t${hashOf("neutralprobe")}\n`;
const git = (root, ...args) => execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
const npm = execFileSync("which", ["npm"], { encoding: "utf8" }).trim();

function publication(t, text = baseline) {
  const root = mkdtempSync(join(tmpdir(), "brand-publication-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-b", "main");
  git(root, "config", "user.name", "Gate Test");
  git(root, "config", "user.email", "gate@example.invalid");
  mkdirSync(join(root, "tests/fixtures"), { recursive: true });
  mkdirSync(join(root, "docs/release"), { recursive: true });
  writeFileSync(join(root, baselinePath), text);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "neutral-gate-fixture", version: pkg.version, files: ["payload.txt"], scripts: { prepublishOnly: `node ${relative(root, script)}` } }));
  writeFileSync(join(root, "payload.txt"), "release payload\n");
  // Only npm view is simulated; pack and the publication lifecycle stay real.
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin/npm"), `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
if (process.argv[2] === "view") {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  if (process.argv[3] !== "neutral-gate-fixture@" + version || process.argv[4] !== "version") process.exit(98);
  const mode = process.env.TEST_REGISTRY_MODE;
  if (mode === "published") { console.log(JSON.stringify(version)); process.exit(0); }
  if (mode === "empty") process.exit(0);
  if (mode === "unexpected-version") { console.log(JSON.stringify("0.0.0")); process.exit(0); }
  if (mode === "unreachable") { console.error(JSON.stringify({ error: { code: "ENOTFOUND" } })); process.exit(1); }
  if (mode === "unauthorized") { console.error(JSON.stringify({ error: { code: "E401" } })); process.exit(1); }
  console.log(JSON.stringify({ error: { code: "E404" } })); process.exit(1);
}
const result = spawnSync(process.env.TEST_REAL_NPM, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
`);
  chmodSync(join(root, "bin/npm"), 0o755);
  git(root, "add", baselinePath, "package.json");
  git(root, "commit", "-m", "record publication baseline");
  return root;
}

function tarballDigest(root) {
  const destination = mkdtempSync(join(tmpdir(), "gate-pack-"));
  try {
    const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    return hashOf(readFileSync(join(destination, packed[0].filename)));
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}

function override(root, changes = {}, commit = true) {
  const record = { owner: "Release Owner", decision: "GO", ownerDecisionRef: "docs/release/owner-decision.md#approval", version: pkg.version, date: new Date().toISOString().slice(0, 10), baselineSha256: hashOf(baseline), tarballSha256: tarballDigest(root), ...changes };
  writeFileSync(join(root, overridePath), JSON.stringify(record) + "\n");
  if (commit) {
    git(root, "add", overridePath);
    git(root, "commit", "-m", "record nominative publication decision");
  }
}

const run = (root, mode = "absent") => spawnSync("node", [npm, "run", "prepublishOnly", "--silent"], {
  cwd: root, encoding: "utf8",
  env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, TEST_REGISTRY_MODE: mode, TEST_REAL_NPM: npm },
});

test("should wire the publication lifecycle to the brand release gate", () => {
  assert.equal(pkg.scripts.prepublishOnly, "node scripts/check-brand-release.mjs");
});

test("should refuse publication with a nonempty baseline and no override", t => {
  const result = run(publication(t));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /publication refused/i);
});

test("should allow an unpublished version with a committed owner decision for the exact version and tarball", t => {
  const root = publication(t);
  override(root);
  assert.equal(run(root).status, 0);
});

test("should refuse an override for the wrong version", t => {
  const root = publication(t);
  override(root, { version: "0.0.0" });
  assert.notEqual(run(root).status, 0);
});

test("should refuse an override for the wrong tarball digest", t => {
  const root = publication(t);
  override(root, { tarballSha256: "0".repeat(64) });
  assert.notEqual(run(root).status, 0);
});

test("should refuse an override after the packed payload changes", t => {
  const root = publication(t);
  override(root);
  writeFileSync(join(root, "payload.txt"), "changed payload\n");
  assert.notEqual(run(root).status, 0);
});

test("should refuse an override without an owner decision reference", t => {
  const root = publication(t);
  for (const ownerDecisionRef of [undefined, "", "  ", 7]) {
    override(root, { ownerDecisionRef });
    assert.notEqual(run(root).status, 0);
  }
});

test("should accept a retry of the same unpublished artifact", t => {
  const root = publication(t);
  override(root);
  assert.equal(run(root).status, 0);
  assert.equal(run(root).status, 0);
});

test("should refuse an already published version in a fresh checkout", t => {
  const root = publication(t);
  override(root);
  const result = run(root, "published");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Publication refused \[VERSION_ALREADY_PUBLISHED\]/);
});

test("should refuse the same artifact once the registry reports it published", t => {
  const root = publication(t);
  override(root);
  assert.equal(run(root).status, 0);
  const result = run(root, "published");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VERSION_ALREADY_PUBLISHED/);
});

test("should refuse with a typed message when the registry is unreachable", t => {
  const root = publication(t);
  override(root);
  const result = run(root, "unreachable");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Publication refused \[REGISTRY_UNAVAILABLE\].*could not verify/i);
  assert.equal(run(root).status, 0);
});

test("should refuse registry authentication failures and ambiguous responses", t => {
  const root = publication(t);
  override(root);
  for (const mode of ["unauthorized", "empty", "unexpected-version"]) {
    const result = run(root, mode);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /REGISTRY_UNAVAILABLE/);
  }
});

test("should refuse a stale override", t => {
  const root = publication(t);
  override(root, { date: "2000-01-01" });
  assert.notEqual(run(root).status, 0);
});

test("should refuse a malformed committed override record", t => {
  const root = publication(t);
  for (const text of ["{", "null", "[]", '{"decision":"GO"}']) {
    writeFileSync(join(root, overridePath), text);
    git(root, "add", overridePath);
    git(root, "commit", "-m", "exercise malformed decision record");
    assert.notEqual(run(root).status, 0);
  }
});

test("should allow publication when the baseline is empty", t => {
  assert.equal(run(publication(t, "")).status, 0);
});

test("should refuse uncommitted or modified publication overrides", t => {
  const root = publication(t);
  override(root, {}, false);
  assert.notEqual(run(root).status, 0);
  git(root, "add", overridePath);
  git(root, "commit", "-m", "record publication decision");
  override(root, { owner: "Changed Owner" }, false);
  assert.notEqual(run(root).status, 0);
});

test("should refuse an override for another owner decision, version, date or baseline", t => {
  const root = publication(t);
  for (const changes of [{ owner: "" }, { owner: "  " }, { decision: "NO" }, { version: "0.0.0" }, { date: "2000-01-01" }, { date: "invalid" }, { baselineSha256: "0".repeat(64) }]) {
    override(root, changes);
    assert.notEqual(run(root).status, 0);
  }
});

test("should refuse publication when the baseline is missing or malformed", t => {
  const root = publication(t);
  rmSync(join(root, baselinePath));
  assert.notEqual(run(root).status, 0);
  writeFileSync(join(root, baselinePath), "invalid\n");
  override(root);
  assert.notEqual(run(root).status, 0);
});
