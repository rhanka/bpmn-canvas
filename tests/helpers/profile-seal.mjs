// Data-seal verification only. No profile operations are evaluated here.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const fixture = join(repo, "tests/fixtures/profile-lot0");
const vendor = join(repo, "tests/fixtures/profile-parity-corpus");
const sourceCommit = "cb46b3b8f893996a83c056f31f8aa92aa2364bd3";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const asPath = path => path instanceof URL ? fileURLToPath(path) : resolve(path);

function safe(path) {
  assert.equal(typeof path, "string");
  assert.ok(path.length > 0 && !path.includes("\\") && !path.includes("\0"), "unsafe path");
  assert.ok(path.split("/").every(part => part && part !== "." && part !== ".."), "unsafe path");
  assert.ok(!path.startsWith("/"), "absolute path");
  return path;
}

function walk(root) {
  const files = [];
  function visit(path, relative) {
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), "linked entry");
    if (stat.isDirectory()) {
      const names = readdirSync(path).sort();
      assert.ok(names.length, "empty unlisted directory");
      for (const name of names) visit(join(path, name), relative ? `${relative}/${name}` : name);
    } else {
      assert.ok(stat.isFile() && stat.nlink === 1, "nonregular or linked entry");
      files.push(safe(relative));
    }
  }
  visit(root, "");
  return files.sort();
}

function inventory(root, entries) {
  const paths = entries.map(entry => safe(entry.path));
  assert.equal(new Set(paths).size, paths.length, "duplicated path");
  assert.deepEqual(walk(root), paths.toSorted(), "missing or extra payload");
  for (const entry of entries) {
    const bytes = readFileSync(join(root, entry.path));
    assert.equal(bytes.length, entry.bytes, `${entry.path} byte length`);
    assert.equal(digest(bytes), entry.sha256, `${entry.path} digest`);
  }
}

function checkArtifact(artifact, files) {
  if (!artifact || !Object.hasOwn(artifact, "path")) return;
  const path = safe(artifact.path);
  assert.ok(files.has(path), `uncovered artifact ${path}`);
  assert.equal(artifact.sha256, files.get(path).sha256, `artifact digest ${path}`);
}

export function verifyCorpus(root = vendor, pinPath = join(repo, "tests/fixtures/profile-parity-corpus.pin.json")) {
  root = asPath(root);
  const pin = json(pinPath);
  assert.equal(pin.format, "profile-corpus-pin/1");
  assert.equal(pin.status, "final");
  assert.equal(pin.sourceCommit, sourceCommit);
  assert.equal(pin.sourceTree, "contracts/");
  assert.equal(pin.sourceTreeId, "0c6bf891f147079e175a46d0d34f42ff308d235c");
  assert.equal(pin.tagAccepted, true);
  inventory(root, pin.files);
  const files = new Map(pin.files.map(entry => [entry.path, entry]));
  assert.deepEqual(pin.manifest, files.get(safe(pin.manifest.path)));
  const manifestBytes = readFileSync(join(root, pin.manifest.path));
  assert.equal(digest(manifestBytes), pin.manifest.sha256, "manifest pin");
  assert.equal(pin.manifest.sha256, "01b81fd9fb69f110a7f302631d6da92126bcb1672c67bea3ea68ff802df39faf", "reviewed manifest");
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.format, "profile-parity-corpus/1");
  const casePrefix = "profile-parity-corpus/1/cases/";
  assert.deepEqual(Object.keys(manifest.files).sort(), [...files.keys()].filter(path => path.startsWith(casePrefix)).sort());
  const comparators = new Set(manifest.comparators.map(record => record.id));
  assert.equal(comparators.size, manifest.comparators.length);
  const ids = new Set();
  for (const [path, hash] of Object.entries(manifest.files)) {
    assert.equal(hash, files.get(safe(path)).sha256, `manifest entry ${path}`);
    const vector = json(join(root, path));
    const required = ["caseId", "operation", "phase", "profileArtifact", "inputArtifacts", "expectedArtifacts", "expectedStatus", "comparatorIds"];
    assert.deepEqual(Object.keys(vector).filter(key => key !== "commandArtifact").sort(), required.sort());
    assert.ok(!ids.has(vector.caseId), "duplicated case"); ids.add(vector.caseId);
    assert.ok(vector.expectedArtifacts.length, "missing expectation");
    for (const id of vector.comparatorIds) assert.ok(comparators.has(id), `unknown comparator ${id}`);
    for (const artifact of [vector.profileArtifact, vector.commandArtifact, ...vector.inputArtifacts, ...vector.expectedArtifacts]) checkArtifact(artifact, files);
  }
  return { files: files.size, cases: ids.size };
}

export function verifyFreeze(root = fixture) {
  root = asPath(root);
  const seal = json(join(root, "freeze.seal.json"));
  for (const entry of seal.files) {
    const bytes = readFileSync(join(root, safe(entry.path)));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(digest(bytes), entry.sha256, `stale frozen input ${entry.path}`);
  }
  for (const entry of seal.documents) {
    const bytes = readFileSync(join(repo, safe(entry.path)));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(digest(bytes), entry.sha256, `stale frozen document ${entry.path}`);
  }
  const freeze = json(join(root, "inputs.json"));
  assert.equal(freeze.design.revision, "R3.3");
  assert.equal(freeze.design.sha256, "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f");
  assert.equal(digest(readFileSync(join(root, "reconciliation.md"))), freeze.reconciliation.sha256);
  const manifest = readFileSync(join(root, "MANIFEST-R33.sha256"));
  assert.equal(digest(manifest), freeze.companionManifest.sha256);
  const entries = manifest.toString().trim().split("\n").map(line => { const [sha256, path] = line.split("  "); return { path, sha256 }; });
  assert.equal(entries.length, 46);
  assert.equal(freeze.companionManifest.entries, entries.length);
  assert.deepEqual(entries, freeze.companions.map(({ path, sha256 }) => ({ path, sha256 })));
  assert.equal(entries.find(entry => entry.path === "DESIGN.md").sha256, freeze.design.sha256);
  assert.deepEqual(json(join(root, "parents.json")), freeze.parents);
  assert.equal(digest(readFileSync(join(repo, "tests/fixtures/profile-parity-corpus.pin.json"))), freeze.corpus.pinSha256);
  assert.equal(digest(readFileSync(join(repo, "tests/fixtures/parity-corpus/MANIFEST.sha256"))), freeze.parents.canvas);
  assert.equal(freeze.base.ref, freeze.reconciliation.base);
  assert.equal(freeze.base.stashDisposition, "dropped-verified-duplicate");
  for (const record of [freeze.base, freeze.base.stashDecision]) {
    assert.equal(record.gateState, "closed", "closed stash gate");
    assert.equal(record.blocksIndependentSteps, false, "independent steps may continue");
  }
  return freeze;
}

// Pin the extracted text independently of expectation seals. Extraction was
// checked against the complete R3.3 SHA-256; optional authority bytes permit
// repeating that check without making the offline suite depend on an external path.
export function verifyDesignProvenance(expectations, evidence = json(join(fixture, "design-provenance.json")), authorityBytes,
  rules = json(join(repo, "docs/design/profile-compiler-rules.json"))) {
  assert.equal(evidence.format, "profile-design-provenance/1", "provenance format");
  assert.equal(evidence.designSha256, "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f", "provenance design pin");
  assert.equal(expectations.designSha256, evidence.designSha256, "provenance expectation pin");
  assert.equal(digest(JSON.stringify(evidence)), "92f68b02143087a65c45ac2f2e8fef5640611e47f76b8108e28185446085e148", "provenance excerpt pin");
  // This is the citation policy for the pinned lot-0 lexical vectors, not a
  // profile parser or an inference from free-text derivations. Acceptance
  // controls cite the same walk and schema boundary as refusal witnesses.
  for (const vector of expectations.vectors) {
    const lexical = vector.canonicalPath ? vector.caseId.startsWith("lexical-")
      : ["profile-text-load", "profile-lexical-parse"].includes(vector.operation);
    if (lexical) for (const line of [85, 97, 98, 99]) {
      assert.ok(vector.provenance.includes(`DESIGN.md:${line}`), `lexical provenance ${vector.caseId} missing ${line}`);
    }
  }
  // Independent per-case citation contract: byte resealing alone must not
  // bless an incomplete set, a header, or a different rule's defining row.
  const policy = json(join(fixture, "step2b-provenance-policy.json"));
  assert.equal(digest(JSON.stringify(policy)), "d5978b34bc8682e38506d622e8efaf525ff6cc6af56b2371e32a4fa2d52e12f7", "step-2b provenance policy pin");
  const step4 = json(join(fixture, "step4-provenance-policy.json"));
  assert.equal(digest(JSON.stringify(step4)), "afee3f969fbe719bd6c2e2e9a6587d2112569337142c776635f4f05154ceeeec", "step-4 provenance policy pin");
  const s123 = json(join(fixture, "s123-provenance-policy.json"));
  assert.equal(digest(JSON.stringify(s123)), "51e27e6bf6d41c5dc681074d0dbb34af77bc8d3d4900a586857954700a74651a", "S123 provenance policy pin");
  for (const entry of [policy, step4, s123]) assert.equal(entry.designSha256, evidence.designSha256, "policy provenance design pin");
  const requirements = [...policy.vectors, ...step4.vectors, ...s123.vectors];
  const added = expectations.vectors.filter(vector => vector.family);
  assert.deepEqual(added.map(vector => vector.caseId), requirements.map(vector => vector.caseId), "extension provenance inventory");
  for (const vector of added) {
    const requirement = requirements.find(entry => entry.caseId === vector.caseId);
    assert.equal(vector.family, requirement.family, `extension provenance family ${vector.caseId}`);
    assert.deepEqual(vector.provenance, requirement.required, `extension provenance citations ${vector.caseId}`);
    for (const ref of vector.provenance) {
      const line = evidence.lines.find(line => line.ref === ref);
      assert.ok(line, `extension provenance missing line ${ref}`);
      assert.doesNotMatch(line.text, /^\s*#|^~~~|^\|\s*(?:---|Compile rule|Action\s*\||Condition\s*\||Field\s*\|)/, `extension provenance header ${ref}`);
    }
  }
  assert.equal(rules.designSha256, evidence.designSha256, "action provenance design pin");
  // Resolve action names from the pinned defining rows, including the two
  // grouped rows. A header or another action's row cannot establish authority.
  const actionRows = evidence.lines.filter(line => /^DESIGN\.md:20[3-9]$|^DESIGN\.md:21[0-2]$/.test(line.ref));
  for (const action of rules.actions) {
    const row = actionRows.find(line => line.text.split("|")[1].trim().split(/,\s*|\s*\/\s*/).includes(action.action));
    assert.ok(row, `action provenance missing defining row for ${action.action}`);
    assert.equal(action.provenance, row.ref, `action provenance ${action.action}`);
  }
  const refs = [...expectations.vectors.flatMap(vector => vector.provenance), ...rules.provenance,
    ...rules.rules.map(rule => rule.provenance), ...rules.actions.map(action => action.provenance), ...rules.lexicalProvenance];
  assert.ok(refs.every(ref => /^DESIGN\.md:[1-9][0-9]*$/.test(ref)), "provenance reference syntax");
  assert.deepEqual(evidence.lines.map(line => line.ref).sort(), [...new Set(refs)].sort(), "provenance line inventory");
  let sourceLines;
  if (authorityBytes !== undefined) {
    assert.equal(digest(authorityBytes), evidence.designSha256, "provenance authority digest");
    sourceLines = authorityBytes.toString("utf8").split("\n");
  }
  for (const line of evidence.lines) {
    assert.ok(line.text.length > 0, `empty provenance ${line.ref}`);
    assert.equal(digest(line.text), line.sha256, `provenance line digest ${line.ref}`);
    // The one neutralized quotation retains the original authority line hash.
    // The complete excerpt pin above independently seals the replacement text.
    if (line.authoritySha256 !== undefined) {
      assert.equal(line.ref, "DESIGN.md:606", "provenance neutralization scope");
      assert.equal(line.authoritySha256, "47efe86ff95fdaed0796081df4a5d04ea000bfba781cb9012a628ebe798e9b69", "provenance original line pin");
    }
    if (sourceLines) {
      const source = sourceLines[Number(line.ref.split(":")[1]) - 1];
      assert.equal(digest(source), line.authoritySha256 ?? line.sha256, `provenance authority line ${line.ref}`);
      if (line.authoritySha256 === undefined) assert.equal(line.text, source, `provenance authority text ${line.ref}`);
    }
  }
}

export function verifyExpectedBytes(bytes, seal) {
  assert.equal(bytes.length, seal.bytes, "expectation length");
  assert.equal(digest(bytes), seal.sha256, "expectation digest");
}

export function verifyExpectations() {
  verifyCorpus(); verifyFreeze();
  const seal = json(join(fixture, "expectations.seal.json"));
  const bytes = readFileSync(join(fixture, "expectations.json"));
  verifyExpectedBytes(bytes, seal);
  const expectations = JSON.parse(bytes);
  assert.equal(expectations.designSha256, verifyFreeze().design.sha256);
  verifyDesignProvenance(expectations);
  const seen = new Set();
  for (const vector of expectations.vectors) {
    assert.ok(!seen.has(vector.caseId)); seen.add(vector.caseId);
    assert.ok(vector.expectedArtifacts.length);
    if (vector.canonicalPath) {
      const canonical = json(join(vendor, safe(vector.canonicalPath)));
      assert.equal(vector.caseId, canonical.caseId);
      assert.equal(vector.expectedStatus, canonical.expectedStatus);
      // Partial reference findings remain bounded by their declared comparator.
      assert.deepEqual(vector.expectedArtifacts, canonical.expectedArtifacts);
    }
  }
  return expectations;
}
