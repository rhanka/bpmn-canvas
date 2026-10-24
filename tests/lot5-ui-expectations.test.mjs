// Lot-5 UI expectation seal: byte integrity, corpus format, clause citations,
// discrimination records, derivation-helper independence (token-based guard
// with bypass mutations), reproducibility, pinned comparator executable with
// altered-observation self-tests, schema shape self-checks and the reseal
// ledger. No profile loader, compiler, evaluator, codec, layout, exporter or
// command runs: observations are synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, linkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTATIONS, verifySeal, inventory, forbiddenImports, scanModuleLoads, derivationHelpers } from "./helpers/lot5-seal.mjs";
import { exemplar, alterations } from "./helpers/lot5-observe.mjs";
import { compareCase, COMPARATORS, UNSEALED } from "./fixtures/lot5-ui/expectations/comparators/lot5-compare.mjs";
import { validate } from "./fixtures/lot5-ui/expectations/author/lot5-schema-check.mjs";
import { brandTokens } from "./helpers/brand.mjs";
import { scanPathText } from "./helpers/path-guard.mjs";

const root = fileURLToPath(EXPECTATIONS);
const repo = new URL("../", import.meta.url);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(join(root, path), "utf8"));
const DESIGN_SHA256 = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
// SF (0353affc…) superseded the first seal (a3a523a9…), the parity sync (7a1c85aa…) superseded SF, the micro-reseal
// and the twin re-vendor (810c51cc…) superseded the parity sync, and the CR-10 arbitration supersedes the re-vendor.
const PREVIOUS_SEAL_SHA256 = "810c51cc538b28b6cd4212b40e20f02e6495c124a4afbf021401d7f64d05be8f";
const PARITY_SYNC_SEAL_SHA256 = "7a1c85aa4ef6c56cff827980d12b8bddce8157d9b06d683ac9b63c0152fe991d";
// Sealed directories the manifest pins: cases, generated fixtures and the vendored Python bytes (BLOCKB-PARITY-SYNC §2.2).
const PINNED_DIRS = ["cases/", "fixtures/", "vendor/"];
// Refusal codes the lot-5 vectors may expect: DESIGN R3.3 codes and the
// harmonization bindings (C7 profile-producer, C10/C11 operation-error,
// B19 profile-bounds, H2/H4 profile-open, C19 first lint error code).
const CODES = ["profile-ui-parameters", "transaction-entry-unsupported", "profile-symbol", "profile-type", "profile-producer", "profile-schema", "id-collision",
  "reference-dangling", "profile-metadata-missing", "profile-digest-mismatch", "input-conflict", "export-format-unsupported", "navigation-view-missing",
  "call-target-required", "operation-error", "operation-cancelled", "profile-bounds", "profile-open", "io-set-selection-required", "descriptor-mismatch",
  "activity-name-missing-pre-normalize"];
const CASE_KEYS = ["caseId", "comparatorIds", "expectedArtifacts", "expectedStatus", "inputArtifacts", "operation", "phase", "profileArtifact"];
const SCHEMAS = {
  profile: ["schemas/profile/profile-mechanism-1.schema.json", "c97cfba64560ec0e7098294a5e185187de9d1f2207b272c2f002f576865692da"],
  result: ["schemas/profile/result-1.schema.json", "7494b30f3c193fc9404446d4a41cbbaf92f6f0d384d4efaa8da17e5ffe8bf070"],
  snapshot: ["schemas/profile/snapshot-1.schema.json", "fc5019789ba322a28dc8b1b79649d0d8a059da63374d6d817f74338f3a6d483b"],
};
const schema = id => {
  const [path, pin] = SCHEMAS[id];
  const bytes = readFileSync(new URL(path, repo));
  assert.equal(sha(bytes), pin, `${path} pin`);
  return JSON.parse(bytes.toString("utf8"));
};
const cases = () => inventory().filter(p => p.startsWith("cases/")).map(p => json(p));
const inputsOf = c => Object.fromEntries(c.inputArtifacts.map(a => [a.role, a.path ? json(a.path) : a.json]));

test("lot5 seal verifies every sealed file against its byte length and SHA-256", () => {
  const files = verifySeal();
  assert.ok(files.length >= 270, `sealed files ${files.length}`);
  for (const required of ["README.md", "manifest.json", "clauses.json", "design-excerpts.json", "fixtures/ui-neutral-profile.json", "author/author-lot5.mjs",
    "author/lot5-arith.mjs", "comparators/lot5-compare.mjs"]) assert.ok(files.some(f => f.path === required), `unsealed ${required}`);
});

test("lot5 seal fails on a one-byte change in any sealed file", () => {
  for (const file of verifySeal()) {
    const bytes = readFileSync(join(root, file.path));
    const positions = [...new Set([0, Math.floor(bytes.length / 2), bytes.length - 1])].filter(i => i >= 0 && i < bytes.length);
    for (const i of positions) {
      const damaged = Buffer.from(bytes); damaged[i] ^= 1;
      assert.throws(() => verifySeal(EXPECTATIONS, new Map([[file.path, damaged]])), /^Error: seal drift/, `${file.path} byte ${i}`);
    }
  }
  const seal = readFileSync(join(root, "seal.json"));
  const damaged = Buffer.from(seal); damaged[seal.length - 3] ^= 1;
  assert.throws(() => verifySeal(EXPECTATIONS, new Map([["seal.json", damaged]])), /^(?:Error: seal|SyntaxError)/);
});

async function mutated(change) {
  const directory = mkdtempSync(join(tmpdir(), "lot5-seal-"));
  try {
    const copy = join(directory, "expectations");
    cpSync(root, copy, { recursive: true });
    const seal = JSON.parse(readFileSync(join(copy, "seal.json"), "utf8"));
    change(copy, seal);
    writeFileSync(join(copy, "seal.json"), JSON.stringify(seal));
    assert.throws(() => verifySeal(copy), /^Error: seal /);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test("lot5 seal rejects unlisted, duplicate, linked, escaping, malformed and unpinned-executable entries", async () => {
  await mutated(copy => writeFileSync(join(copy, "cases", "extra.json"), "{}"));
  await mutated((copy, seal) => seal.files.push(seal.files[0]));
  await mutated((copy, seal) => { seal.files = seal.files.slice(1); });
  await mutated(copy => { const p = join(copy, "README.md"); writeFileSync(join(copy, "..", "linked.md"), readFileSync(p)); rmSync(p); symlinkSync(join(copy, "..", "linked.md"), p); });
  await mutated(copy => linkSync(join(copy, "manifest.json"), join(copy, "manifest-copy.json")));
  await mutated((copy, seal) => { seal.files[0].path = "../escape.json"; });
  await mutated((copy, seal) => { seal.format = "unknown/1"; });
  await mutated((copy, seal) => { seal.files[0].bytes += 1; });
  await mutated((copy, seal) => { seal.executables[0].sha256 = "0".repeat(64); });
});

test("lot5 derivation helpers and the comparator load only allowed modules (token-based guard)", () => {
  const helpers = derivationHelpers();
  assert.ok(helpers.length >= 15 && helpers.some(h => h.comparator), `helpers ${helpers.length}`);
  for (const { name, source, comparator } of helpers) {
    assert.deepEqual(forbiddenImports(source, { comparator }), [], `${name} loads an interpreter or foreign module`);
    assert.ok(scanModuleLoads(source).specifiers.length > 0, `${name} import scan found nothing`);
  }
});

// Each bypass must be caught wherever it is injected (start, middle, end of every helper).
const BYPASSES = [
  ["commented static import", '/* comment */ import { x } from "../../../../../src/profile/index.js";'],
  ["comments between tokens", 'import /* a */ { x } /* b */ from /* c */ "../../../../../src/profile/index.js";'],
  ["no spaces", 'import{x}from"../../../../../dist/io/index.js";'],
  ["several statements on one line", 'const lot5Spare = 1; import "bpmnlint/config/recommended.js"; void lot5Spare;'],
  ["multi-line import", 'import {\n  alpha,\n  beta\n} from\n  "bpmn-moddle";'],
  ["namespace import", 'import * as lot5Ns from "../../../../../src/io/index.js";'],
  ["default import", 'import Moddle from "bpmn-moddle";'],
  ["export star from", 'export * from "../../../../../dist/layout/index.js";'],
  ["export star as from", 'export * as lot5Layout from "../../../../../dist/layout/index.js";'],
  ["export names from", 'export { compileProfile as lot5Compile } from "../../../../../src/profile/index.js";'],
  ["dynamic import literal", 'const lot5M = await import("../../../../../dist/profile/index.js");'],
  ["dynamic import template", 'const lot5M = await import(`../../../../../src/${"profile"}/index.js`);'],
  ["dynamic import concatenation", 'const lot5M = await import("../../../../../src/" + "profile/index.js");'],
  ["dynamic import variable", 'const lot5P = "x"; const lot5M = await import(lot5P);'],
  ["require call", 'const lot5L = require("bpmnlint");'],
  ["module.require", 'const lot5L = module.require("bpmnlint");'],
  ["createRequire", 'const lot5R = createRequire(import.meta.url);'],
  ["globalThis access", 'const lot5G = globalThis["req" + "uire"];'],
  ["Function constructor", 'const lot5F = new Function("return import(\'bpmnlint\')");'],
  ["Function via Reflect", 'const lot5F = Reflect.construct(Function, ["return 1"]);'],
  ["indirect eval", 'const lot5E = (0, eval)("1");'],
  ["import.meta.resolve", 'const lot5U = import.meta.resolve("../../../../../src/profile/index.js");'],
  ["process.binding", 'const lot5B = process.binding("fs");'],
  ["process.mainModule", 'const lot5B = process.mainModule.require("bpmnlint");'],
  ["import attributes", 'import lot5Data from "../../../../../src/profile/neutral-descriptors.json" with { type: "json" };'],
  ["child_process builtin", 'import { execFileSync } from "node:child_process";'],
  ["vm builtin", 'import vm from "node:vm";'],
  ["module builtin", 'import * as lot5Mod from "node:module";'],
  ["worker_threads builtin", 'import { Worker } from "node:worker_threads";'],
  ["escaped identifier", 'const lot5Q = \\u0072equire("bpmnlint");'],
  ["import after a regex", 'const lot5Rx = /a/g; import "bpmnlint";'],
];
// Unterminated constructs only exist as such at the end of a file (elsewhere they absorb the following text, as for the JavaScript parser).
const TRAILING_BYPASSES = [
  ["unterminated comment", '/* import x from "bpmnlint";'],
  ["unterminated template", 'const lot5T = `import("bpmnlint")'],
  ["unterminated string", 'const lot5U = "import'],
];
test("lot5 import guard catches every bypass family wherever it is injected", () => {
  for (const { name, source, comparator } of derivationHelpers()) {
    const lines = source.split("\n");
    // Middle = right after the end of the import block (a statement boundary).
    const importEnd = lines.reduce((n, line, i) => /\bfrom\s+["'][^"']+["'];\s*$/.test(line) || /^import\s+["'][^"']+["'];/.test(line) ? i : n, 0);
    const spots = [["start", s => `${s}\n${source}`], ["middle", s => [...lines.slice(0, importEnd + 1), s, ...lines.slice(importEnd + 1)].join("\n")], ["end", s => `${source}\n${s}\n`]];
    for (const [label, bypass] of BYPASSES) for (const [where, inject] of spots) {
      assert.notDeepEqual(forbiddenImports(inject(bypass), { comparator }), [], `${name}: ${label} at ${where}`);
    }
    for (const [label, bypass] of TRAILING_BYPASSES) assert.notDeepEqual(forbiddenImports(`${source}\n${bypass}`, { comparator }), [], `${name}: ${label} at end`);
  }
  // Negative controls: loading words inside strings and comments are not loads.
  for (const quiet of ['const lot5S = "import x from \'bpmn-moddle\'; require(\'x\')";', '// import x from "bpmn-moddle";', '/* require("bpmnlint") */',
    'const lot5W = `text import mention`;']) {
    assert.deepEqual(forbiddenImports(`import { B } from "./lot5-arith.mjs";\n${quiet}\n`), [], quiet);
  }
  // The comparator may load node:crypto only.
  assert.notDeepEqual(forbiddenImports('import { readFileSync } from "node:fs";', { comparator: true }), []);
});

test("lot5 cases follow profile-parity-corpus/1 with pinned artifacts and pinned comparators", () => {
  const manifest = json("manifest.json");
  assert.equal(manifest.format, "profile-parity-corpus/1");
  assert.equal(manifest.pathBase, "tests/fixtures/lot5-ui/expectations/");
  assert.deepEqual(manifest.comparators.map(c => c.id).sort(), Object.keys(COMPARATORS).sort());
  for (const c of manifest.comparators) { assert.equal(c.tolerance, "zero"); assert.equal(c.executable, "lot5-compare/1"); }
  const seal = json("seal.json");
  const exe = manifest.executables.find(e => e.id === "lot5-compare/1");
  assert.equal(exe.sha256, sha(readFileSync(join(root, exe.path))), "executable pin in manifest");
  assert.deepEqual(seal.executables, [{ id: "lot5-compare/1", path: exe.path, sha256: exe.sha256 }], "executable pin in seal");
  for (const reason of Object.keys(manifest.unsealedReasons)) assert.equal(manifest.unsealedReasons[reason], UNSEALED[reason], reason);
  const sealed = inventory();
  const casePaths = sealed.filter(p => p.startsWith("cases/")), fixturePaths = sealed.filter(p => PINNED_DIRS.slice(1).some(d => p.startsWith(d)));
  assert.deepEqual(Object.keys(manifest.files).sort(), [...casePaths, ...fixturePaths].sort());
  for (const [path, digest] of Object.entries(manifest.files)) assert.equal(sha(readFileSync(join(root, path))), digest, path);
  const ids = new Set();
  for (const path of casePaths) {
    const c = json(path);
    assert.deepEqual(Object.keys(c).filter(k => k !== "commandArtifact").sort(), CASE_KEYS, path);
    assert.ok(!ids.has(c.caseId)); ids.add(c.caseId);
    assert.ok(c.expectedArtifacts.length > 0 && c.inputArtifacts.length > 0, `${path} empty artifacts`);
    const m = /^(?:ok|refused:([a-z][a-z0-9-]*))$/.exec(c.expectedStatus);
    assert.ok(m, `${path} status ${c.expectedStatus}`);
    if (m[1]) assert.ok(CODES.includes(m[1]), `${path} code ${m[1]}`);
    for (const id of c.comparatorIds) assert.ok(Object.hasOwn(COMPARATORS, id), `${path} comparator ${id}`);
    for (const a of [c.profileArtifact, c.commandArtifact, ...c.inputArtifacts, ...c.expectedArtifacts]) {
      if (!a) continue;
      if (Object.hasOwn(a, "path")) assert.equal(manifest.files[a.path], a.sha256, `${path} artifact ${a.path}`);
      else assert.ok(Object.hasOwn(a, "json") && typeof a.role === "string", `${path} artifact shape`);
    }
    // A refusal is never sealed by code alone: its expected record carries diagnostics or a report.
    if (m[1]) assert.ok(JSON.stringify(c.expectedArtifacts).includes("\"diagnostics\""), `${path} refusal without diagnostics`);
  }
  assert.ok(ids.size >= 230, `cases ${ids.size}`);
});

test("lot5 every case cites DESIGN clauses whose line digests are pinned", () => {
  const clauses = json("clauses.json"), excerpts = json("design-excerpts.json");
  assert.equal(clauses.designSha256, DESIGN_SHA256);
  assert.equal(excerpts.designSha256, DESIGN_SHA256);
  const pinned = new Map(excerpts.lines.map(l => [l.line, l.sha256]));
  assert.deepEqual(clauses.cases.map(c => c.caseId).sort(), cases().map(c => c.caseId).sort());
  for (const entry of clauses.cases) {
    assert.ok(entry.clauses.length > 0, entry.caseId);
    for (const c of entry.clauses) {
      assert.match(c.section, /^\d+(?:\.\d+)*$/);
      assert.ok(Number.isSafeInteger(c.from) && c.to >= c.from);
      for (let n = c.from; n <= c.to; n++) assert.ok(pinned.has(n), `${entry.caseId} cites unpinned line ${n}`);
    }
    assert.ok(typeof entry.discriminates === "string" && entry.discriminates.length >= 40, `${entry.caseId} names no wrong implementation`);
  }
  const authority = process.env.LOT5_DESIGN_AUTHORITY;
  if (authority) {
    const bytes = readFileSync(authority);
    assert.equal(sha(bytes), DESIGN_SHA256, "design authority bytes");
    const lines = bytes.toString("utf8").split("\n");
    for (const [line, digest] of pinned) assert.equal(sha(lines[line - 1]), digest, `line ${line}`);
  }
});

test("lot5 sealed bytes and the clause table are exactly the hand-authored modules' output", async () => {
  const { build } = await import("./fixtures/lot5-ui/expectations/author/author-lot5.mjs");
  const authority = process.env.LOT5_DESIGN_AUTHORITY;
  const { files, docs } = build(authority ? { designBytes: readFileSync(authority) } : {});
  for (const [path, text] of files) assert.equal(readFileSync(join(root, path), "utf8"), text, `regenerated ${path} differs`);
  const generated = new Set(files.keys());
  for (const path of inventory()) if (PINNED_DIRS.some(d => path.startsWith(d))) assert.ok(generated.has(path), `unauthored ${path}`);
  assert.equal(readFileSync(new URL("docs/design/block-b-lot5-expectations.md", repo), "utf8"), docs, "docs/design/block-b-lot5-expectations.md differs");
});

test("lot5 arithmetic helper reproduces the reviewed lot-0 digest and allocator vectors", async () => {
  const { H, B, stableId } = await import("./fixtures/lot5-ui/expectations/author/lot5-arith.mjs");
  const corpus = new URL("./fixtures/profile-parity-corpus/", import.meta.url);
  const read = p => JSON.parse(readFileSync(new URL(p, corpus), "utf8"));
  const { input: i, expected: e } = read("profile-mechanism/1/r3-digest-vectors.json");
  assert.equal(H({ tree: i.semanticTree, profileIdentity: i.profileIdentity, bindings: i.bindings }), e.semanticRevision);
  assert.equal(H([...i.descriptorPins].sort((a, b) => a.id < b.id ? -1 : 1)), e.descriptorDigest);
  assert.equal(H(i.layout), e.layoutDigest);
  assert.equal(H({ themeId: i.themeId, themes: i.themes }), e.themeDigest);
  assert.equal(H(i.overrides), e.overridesDigest);
  assert.equal(H(i.diStyles), e.diStylesDigest);
  assert.equal(H(i.metrics), e.metricsDigest);
  assert.equal(H(i.payload), e.payloadDigest);
  assert.equal(H({ semanticRevision: e.semanticRevision, layoutDigest: e.layoutDigest, themeId: i.themeId, themeDigest: e.themeDigest,
    overridesDigest: e.overridesDigest, diStylesDigest: e.diStylesDigest, metricsDigest: e.metricsDigest }), e.viewRevision);
  assert.equal(H({ domain: "profile-import/1", format: "bpmn-xml", sourceDigest: B(i.xml) }), e.importXMLBaseRevision);
  const ids = read("profile-parity-corpus/1/cases/identity-stable-id.json");
  ids.inputArtifacts[0].json.forEach((a, n) => assert.equal(stableId(a.owner, a.slot, a.key), ids.expectedArtifacts[0].json[n]));
  // The choice display vector relies on the vendored Unicode 15.0.0 full upper mapping of U+00DF.
  const unicode = JSON.parse(readFileSync(new URL("./fixtures/unicode-case-15.0.0/vectors.json", import.meta.url), "utf8"));
  assert.equal(unicode.vectors.find(v => v.input === "ß").upper, "SS");
});

test("lot5 fixture pins agree with the fixture bytes", () => {
  const profile = json("fixtures/ui-neutral-profile.json");
  const raw = path => sha(readFileSync(join(root, path)));
  assert.equal(profile.base.sha256, raw("fixtures/ui-neutral-base.json"));
  assert.equal(profile.descriptors[0].sha256, raw("fixtures/ui-neutral-descriptors.json"));
  assert.equal(profile.resources[0].sha256, raw("fixtures/ui-neutral-metrics.json"));
  for (const c of cases()) assert.equal(c.profileArtifact.sha256, raw(c.profileArtifact.path), c.caseId);
});

test("lot5 input and expected shapes validate against the pinned public schemas (non-evidence self-check)", () => {
  const profileSchema = schema("profile"), resultSchema = schema("result"), snapshotSchema = schema("snapshot");
  assert.deepEqual(validate(profileSchema, json("fixtures/ui-neutral-profile.json")), []);
  for (const path of inventory().filter(p => p.startsWith("fixtures/documents/") && p.endsWith(".snapshot.json"))) assert.deepEqual(validate(snapshotSchema, json(path)), [], path);
  const results = [];
  const collect = (role, v) => {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof v.status === "string") results.push(v);
    else if (Array.isArray(v) && ["result"].includes(role)) v.forEach(x => collect(role, x));
  };
  for (const c of cases()) {
    const inputs = inputsOf(c);
    const ex = exemplar(c, inputs, COMPARATORS);
    collect("result", ex.result); collect("snapshot", ex.snapshot); collect("diagnostic", ex.diagnostic); collect("follow-up", ex.followUp);
    if (ex.history) for (const r of [ex.history.probe, ex.history.undo?.result, ex.history.redo?.result]) collect("history", r);
    for (const step of ex.steps ?? []) collect("step", step.result);
    for (const r of results.splice(0)) assert.deepEqual(validate(resultSchema, r), [], `${c.caseId} ${r.operation ?? "pure"} ${r.status}`);
  }
});

test("lot5 comparators accept the exemplar and reject every altered sealed member", () => {
  let checked = 0;
  for (const c of cases()) {
    const inputs = inputsOf(c);
    const ex = exemplar(c, inputs, COMPARATORS);
    const accepted = compareCase(c, inputs, ex);
    assert.ok(accepted.ok, `${c.caseId}: ${accepted.failures.slice(0, 3).join("; ")}`);
    for (const alt of alterations(c, ex, COMPARATORS)) {
      checked++;
      const r = compareCase(c, inputs, alt.observed);
      assert.equal(r.ok, alt.pass, `${c.caseId}: ${alt.label}`);
    }
    assert.equal(compareCase(c, inputs, {}).ok, false, `${c.caseId} accepts an empty observation`);
  }
  assert.ok(checked > 50000, `alterations ${checked}`);
});

test("lot5 reseal ledger records the previous seal exactly and every changed file", () => {
  const ledger = JSON.parse(readFileSync(new URL("docs/design/receipts/block-b-lot5-reseal.json", repo), "utf8"));
  assert.equal(ledger.format, "block-b-lot5-reseal/1");
  assert.equal(ledger.previousSeal.sha256, PREVIOUS_SEAL_SHA256);
  // Chain: the predecessor ledger (twin re-vendor) superseded the parity-sync seal and produced the previous seal.
  assert.equal(ledger.predecessor.previousSeal.sha256, PARITY_SYNC_SEAL_SHA256);
  assert.equal(ledger.predecessor.newSeal.sha256, PREVIOUS_SEAL_SHA256);
  // Rebuild the previous seal.json bytes from the ledger: its digest must be the reviewed one.
  const previousFiles = [...ledger.files.filter(f => f.old).map(f => ({ path: f.path, ...f.old }))].sort((a, b) => a.path < b.path ? -1 : 1);
  const previous = `${JSON.stringify({ format: ledger.previousSeal.format, method: ledger.previousSeal.method, author: ledger.previousSeal.author,
    reviewer: ledger.previousSeal.reviewer, executables: ledger.previousSeal.executables, excluded: ["seal.json"], files: previousFiles }, null, 2)}\n`;
  assert.equal(sha(Buffer.from(previous, "utf8")), PREVIOUS_SEAL_SHA256, "previous seal reconstruction");
  // Current state: every sealed file is listed with its new pin; seal.json digest is the recorded new seal.
  const current = new Map(verifySeal().map(f => [f.path, { bytes: f.bytes, sha256: f.sha256 }]));
  for (const f of ledger.files) {
    if (f.new) assert.deepEqual(current.get(f.path), f.new, f.path); else assert.ok(!current.has(f.path), `${f.path} should be removed`);
    if (f.old && f.new) assert.equal(f.status, JSON.stringify(f.old) === JSON.stringify(f.new) ? "unchanged" : "superseded", f.path);
  }
  for (const path of current.keys()) assert.ok(ledger.files.some(f => f.path === path && f.new), `${path} missing from the ledger`);
  assert.equal(sha(readFileSync(join(root, "seal.json"))), ledger.newSeal.sha256, "new seal digest");
  for (const f of ledger.outsideSeal) {
    const bytes = readFileSync(new URL(f.path, repo));
    assert.deepEqual({ bytes: bytes.length, sha256: sha(bytes) }, f.new, f.path);
  }
});

test("lot5 files carry no protected brand words and no home paths", () => {
  const scanned = [...inventory().map(p => join(root, p)), fileURLToPath(new URL("./helpers/lot5-seal.mjs", import.meta.url)), fileURLToPath(new URL("./helpers/lot5-observe.mjs", import.meta.url)),
    fileURLToPath(import.meta.url), fileURLToPath(new URL("../docs/design/block-b-lot5-expectations.md", import.meta.url)),
    fileURLToPath(new URL("../docs/design/receipts/block-b-lot5-reseal.json", import.meta.url))];
  for (const path of scanned) {
    const text = readFileSync(path, "utf8");
    assert.equal(brandTokens(text).length, 0, `protected word in ${path.slice(path.indexOf("tests/") >= 0 ? path.indexOf("tests/") : 0)}`);
    assert.deepEqual(scanPathText("file", text), [], "home path");
  }
});
