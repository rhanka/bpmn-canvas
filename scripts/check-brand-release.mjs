import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseBaseline } from "../tests/helpers/brand-baseline.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const git = args => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function packedDigest() {
  const scratch = mkdtempSync(join(tmpdir(), "release-gate-pack-"));
  try {
    // Pack locally without invoking lifecycle scripts or publishing anything.
    const result = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", scratch], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }));
    assert.equal(result.length, 1);
    const filename = result[0].filename;
    assert.ok(typeof filename === "string" && filename.endsWith(".tgz") && !/[\\/]/.test(filename));
    return digest(readFileSync(join(scratch, filename)));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export class ReleaseGateError extends Error {
  constructor(code, message) {
    super(`Publication refused [${code}]: ${message}`);
    this.name = "ReleaseGateError";
    this.code = code;
  }
}

function assertUnpublished(name, version, queryRegistry) {
  const unavailable = () => new ReleaseGateError("REGISTRY_UNAVAILABLE", "could not verify that the version is unpublished; registry unavailable or response invalid. Retry when registry verification succeeds.");
  let response;
  try {
    response = queryRegistry("npm", ["view", `${name}@${version}`, "version", "--json", "--fetch-retries=0", "--fetch-timeout=15000"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000,
    });
  } catch (error) {
    // Only an explicit npm E404 establishes absence. Network, authentication,
    // timeout and malformed responses must never grant approval.
    if (error.status === 1 && [error.stdout, error.stderr].some(output => {
      try { return JSON.parse(output)?.error?.code === "E404"; } catch { return false; }
    })) return;
    throw unavailable();
  }
  try {
    assert.equal(JSON.parse(response), version);
  } catch {
    throw unavailable();
  }
  throw new ReleaseGateError("VERSION_ALREADY_PUBLISHED", "the exact package version is already published; npm version immutability prevents reuse of this override.");
}

export function checkRelease({ queryRegistry = execFileSync } = {}) {
  try {
    const baseline = readFileSync("tests/fixtures/brand-baseline.tsv", "utf8");
    const rows = parseBaseline(baseline);
    if (rows.length) {
      const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));
      assert.ok(typeof name === "string" && name.trim().length > 0);
      assert.match(version, /^\d+\.\d+\.\d+$/);
      const path = `docs/release/override-${version}.json`;
      const bytes = readFileSync(path, "utf8");
      const committed = git(["show", `HEAD:${path}`]);
      assert.equal(bytes, committed);
      const record = JSON.parse(committed);
      assert.ok(record && typeof record === "object" && !Array.isArray(record));
      assert.deepEqual(Object.keys(record).sort(), ["owner", "decision", "ownerDecisionRef", "version", "date", "baselineSha256", "tarballSha256"].sort());
      assert.ok(typeof record.owner === "string" && record.owner.trim().length > 0);
      assert.ok(typeof record.ownerDecisionRef === "string" && record.ownerDecisionRef.trim().length > 0);
      assert.equal(record.decision, "GO");
      assert.equal(record.version, version);
      assert.equal(record.date, new Date().toISOString().slice(0, 10));
      assert.equal(record.baselineSha256, digest(baseline));
      assert.equal(typeof record.tarballSha256, "string");
      assert.match(record.tarballSha256, /^[a-f0-9]{64}$/);
      assert.equal(record.tarballSha256, packedDigest());

      // Registry version immutability works across fresh checkouts without CI
      // state. A failed publish may retry only the same approved artifact.
      assertUnpublished(name, version, queryRegistry);
    }
  } catch (error) {
    if (error instanceof ReleaseGateError) throw error;
    // Never echo baseline bytes, override contents or subprocess diagnostics.
    throw new ReleaseGateError("INVALID_OVERRIDE", "empty the brand baseline or commit an owner GO override with a decision reference, exact version, UTC date, baseline digest and npm pack tarball SHA-256.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    checkRelease();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
