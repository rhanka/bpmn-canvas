import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { brandTokens, hashOf } from "./brand.mjs";
import { resolveBaseRevision } from "./git-base.mjs";

export function parseBaseline(text) {
  if (text === "") return [];
  assert.ok(text.endsWith("\n"), "baseline final newline");
  const rows = text.slice(0, -1).split("\n");
  assert.ok(rows.every(row => /^[^\t\n]+:[1-9][0-9]*\t[a-f0-9]{64}$/.test(row)), "baseline row syntax");
  assert.equal(new Set(rows).size, rows.length, "baseline duplicate row");
  assert.deepEqual(rows, [...rows].sort(), "baseline row order");
  return rows;
}

export function verifyBaseline(text, pin) {
  const rows = parseBaseline(text);
  assert.equal(pin.format, "brand-baseline-pin/1", "baseline pin format");
  assert.equal(pin.rowSha256.length, pin.rowCount, "baseline pin count");
  assert.equal(new Set(pin.rowSha256).size, pin.rowCount, "baseline pin uniqueness");
  assert.ok(rows.length <= pin.rowCount, "baseline grew beyond pin count");
  const approved = new Set(pin.rowSha256);
  assert.ok(rows.every(row => approved.has(hashOf(row))), "baseline addition requires a justified pin update");
  if (rows.length === pin.rowCount) assert.equal(hashOf(text), pin.sha256, "baseline pin digest");
  return rows;
}

export function scanText(path, text, extraHashes = []) {
  const rows = [];
  for (const token of brandTokens(path, extraHashes)) rows.push(`${path}:0\t${hashOf(token.toLowerCase())}`);
  for (const [index, line] of text.split("\n").entries()) {
    for (const token of brandTokens(line, extraHashes)) rows.push(`${path}:${index + 1}\t${hashOf(token.toLowerCase())}`);
  }
  return [...new Set(rows)].sort();
}

export function scanTracked(root = new URL("../../", import.meta.url)) {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const directory = root instanceof URL ? fileURLToPath(root) : root;
  return paths.flatMap(path => scanText(path, readFileSync(resolve(directory, path), "utf8"))).sort();
}

export function outsideBaseline(found, baseline) {
  const approved = new Set(baseline);
  return found.filter(row => !approved.has(row));
}

/** Temporary lot 0 allowance; lot 2 must empty the baseline. */
export function baselineHashAllowlist(root = new URL("../../", import.meta.url)) {
  const path = "tests/fixtures/brand-baseline.tsv";
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const committed = parseBaseline(git("show", `HEAD:${path}`));
  const pin = JSON.parse(git("show", "HEAD:tests/fixtures/brand-baseline.pin.json"));
  const directory = root instanceof URL ? fileURLToPath(root) : root;
  const rows = verifyBaseline(readFileSync(resolve(directory, path), "utf8"), pin);
  assert.deepEqual(outsideBaseline(rows, committed), [], "baseline may only shrink from committed rows");
  return new Set(rows.map(row => row.split("\t")[1]));
}

export function outsideBaselineHashes(path, text, allowed, extraHashes = []) {
  return scanText(path, text, extraHashes).filter(row => !allowed.has(row.split("\t")[1]));
}

// Closed exceptions for occurrences already published on main; never hash-wide.
export const publishedCommitExceptions = Object.freeze([
  Object.freeze({ commit: "07be09e21d852beb592314d50e0370e883c9b842", line: 1, sha256: "583423608eda0cb63146a67a6ad655858bc511ba6f0d4fd742c0d898b684295a" }),
  Object.freeze({ commit: "45aa6903174462e8dd95137971510f28ba5b4a19", line: 7, sha256: "32ed8e0a3026bc02976abc70f27ddfe1f149b8f4dc5dad00a1451dd7e86e42e9" }),
]);

export function outsidePublishedCommitExceptions(found) {
  const approved = new Set(publishedCommitExceptions.map(({ commit, line, sha256 }) => `git/${commit}:${line}\t${sha256}`));
  return found.filter(row => !approved.has(row));
}

export function scanCommitMessages(root, allowed, extraHashes = []) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
  // Resolve both histories even on other branches: a missing base must fail closed.
  const base = resolveBaseRevision(root);
  git("merge-base", base, "HEAD");
  const local = new Set(git("rev-list", `${base}..HEAD`).trim().split("\n"));
  if (git("branch", "--show-current").trim() !== "workbench/functions-20261004-profile-lot0") local.clear();
  for (const commit of git("rev-list", "--remotes").trim().split("\n")) local.delete(commit);
  const records = git("log", "--all", "--format=%H%x00%B%x00").split("\0");
  const hits = [];
  for (let i = 0; i + 1 < records.length; i += 2) {
    const commit = records[i].trim();
    const permitted = local.has(commit) ? allowed : new Set();
    hits.push(...outsidePublishedCommitExceptions(outsideBaselineHashes(`git/${commit}`, records[i + 1], permitted, extraHashes)));
  }
  return hits;
}
