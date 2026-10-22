// Data-only seal gate for the finding #24 expectations (block B, lot 5). No product module, codec, layout,
// renderer, exporter or command is imported or executed here, and no Git object is read: the hygiene matches
// the sealed hashed literal set (literal-set.json), the witnesses use synthetic literals hashed the same way,
// and the checks that need the base tree are the reviewer commands of README "Commands" (derive/ledger.mjs,
// derive/literal-set.mjs and derive/base-check.mjs). A failure names a position, an entry and a digest prefix
// only, never a matched text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { canonical, canonicalSha256 } from "./fixtures/x24-externalization/expectations/derive/canonical.mjs";
import { NORMALIZE, constantStrings, decodeMember, fnv1a32, lexJs, maskPath, rk32, scanBytes, scanText, selectorBranches } from "./fixtures/x24-externalization/expectations/derive/scan.mjs";
import { LONG_MIN, PREFILTER_BITS, hashedLiteral, jsonStrings, ledgerHits, literalHits, literalSet, unescapedSource } from "./fixtures/x24-externalization/expectations/derive/literals.mjs";
import { classify, compileRules } from "./fixtures/x24-externalization/expectations/derive/classify.mjs";
import { COMPARATORS, compareCase, idealObservation } from "./fixtures/x24-externalization/expectations/derive/comparators.mjs";
import { rolesOf } from "./fixtures/x24-externalization/expectations/derive/arith.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const ROOT = "tests/fixtures/x24-externalization/expectations";
const SEAL_SHA256 = "74745d66d8f49a27d4eb87ef7cf04bef0b0855959e8339bcc0119f01106f6974";
const PREVIOUS_SEAL_SHA256 = "7f15b3512dd4ccd7b9e355f0b834a65adbdba654f2c52996011b84e741cb27ac";
/** First seal, single seal fix round, integration micro-reseal, Unicode literal restoration, P-006 allowance, I1 relocation: seal.json#/previousSeals in order. */
const SEAL_CHAIN = ["d432a1d5cb3a727debc7d51dffa2fd1446a30d64a5c97d645108dd1b58777ff5", "0b17ff222da3332f06e622dc787cbe9c42d9c4050a53a58a27e1b7156dfb1d8c", "e47a3328828d3d6a77370a83d8704657a00301136b83261e7cb9ebf11dbf225f", "c3e99dc5e8544a6de0e04423516fcd28fcd7d16ac004ef010e526ccb4af0898b", "682ac140cef29f74c0092a8f6b1e64f77e8959b1b1f003dce893da7b56cfe746", PREVIOUS_SEAL_SHA256];
const DESIGN_SHA256 = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
const BASE_COMMIT = "05f737885bd44fddea84bf1b4d55ae5428704855";
const GROUPS = { L: 6, S: 28, A: 29, R: 10, X: 31, P: 7 };
const EXECUTABLES = ["derive/comparators.mjs", "derive/canonical.mjs", "derive/scan.mjs", "derive/literals.mjs", "derive/sourcemap.mjs", "../../../helpers/brand.mjs"];
const SEAL_TEST = "tests/x24-externalization-seal.test.mjs";
const HISTORY_GUARD_RECEIPT = "docs/design/receipts/block-b-x24-history-guard.json";
const UNICODE_RECEIPT = "docs/design/receipts/block-b-x24-unicode-literals-fix.json";
const ALLOWANCE_RECEIPT = "docs/design/receipts/block-b-x24-p006-selector-allowance.json";
const RELOCATION_RECEIPT = "docs/design/receipts/block-b-x24-i1-relocated-rows.json";
const RECEIPT = "docs/design/receipts/block-b-x24-final-spec-rebind.json";
const HEX64 = /^[0-9a-f]{64}$/;

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (path) => readFileSync(join(repo, path));
const json = (path) => JSON.parse(read(path).toString("utf8"));
const x24 = (path) => json(`${ROOT}/${path}`);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** A hit for a failure message: position, entry, digest prefix and rule, never the matched text. */
const where = (h) => `${h.at ?? ""}@${h.index ?? h.line}:${h.length ?? h.column} ${h.entry} ${String(h.sha256 ?? h.literal).slice(0, 8)} ${h.rule ?? h.form}`;

function walk(dir, rel = "") {
  const out = [];
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const path = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(join(dir, path));
    assert.ok(!stat.isSymbolicLink(), `linked entry ${path}`);
    if (stat.isDirectory()) out.push(...walk(dir, path));
    else out.push(path);
  }
  return out;
}

const sealBytes = read(`${ROOT}/seal.json`);
const seal = JSON.parse(sealBytes.toString("utf8"));
const sealed = [
  ...seal.files.map((f) => ({ ...f, repoPath: `${ROOT}/${f.path}` })),
  ...seal.external.map((f) => ({ ...f, repoPath: f.path })),
];
const verifyEntry = (entry, bytes) => {
  if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) throw new Error(`sealed file changed: ${entry.repoPath}`);
};
const ledger = x24("ledger.json");
const lexicon = x24("lexicon.json");
const manifest = x24("manifest.json");
const expectations = x24("probe-expectations.json");
const literalSetDoc = x24("literal-set.json");
const rowsById = new Map(ledger.occurrences.map((r) => [r.id, r]));

// ------------------------------------------------------------------ synthetic witnesses
/** Synthetic literals of the witnesses: no ledger literal; their hashes go into a copy of the lexicon only. */
const WITNESS = { marker: "[Qzxwvok]", short: "qzx", look: "Qzxwvk", descriptor: "Qzx:Wvok" };
/** A copy of the lexicon whose document marker, look name and descriptor entries also match the synthetic literals. */
function witnessLexicon() {
  const copy = structuredClone(lexicon);
  const add = (id, text) => {
    const m = copy.entries.find((e) => e.id === id).match[0];
    const key = NORMALIZE[m.key](text);
    m.hashes.push(m.type === "window" ? { sha256: sha(key), rk32: rk32(key) } : { sha256: sha(key), fnv1a32: fnv1a32(key) });
  };
  add("LX-MK-1", WITNESS.marker);
  add("LX-TH-1", WITNESS.look);
  add("LX-DS-1", WITNESS.descriptor);
  return copy;
}

// ------------------------------------------------------------------ seal
test("x24 seal: seal.json is pinned and covers every sealed byte and executable", () => {
  assert.equal(sha(sealBytes), SEAL_SHA256, "seal.json digest");
  assert.equal(seal.format, "x24-expectations-seal/3");
  assert.equal(seal.root, ROOT);
  assert.equal(seal.design.sha256, DESIGN_SHA256);
  assert.equal(seal.base.commit, BASE_COMMIT);
  assert.equal(seal.interpreterExecutedBeforeSeal, false);
  assert.deepEqual(seal.counts.byGroup, GROUPS);
  assert.deepEqual(seal.previousSeals.map((s) => s.sha256), SEAL_CHAIN);
  const listed = seal.files.map((f) => f.path);
  assert.equal(new Set(listed).size, listed.length, "duplicated path");
  assert.deepEqual(walk(join(repo, ROOT)).filter((p) => p !== "seal.json"), [...listed].sort(), "missing or extra file in the sealed directory");
  assert.deepEqual(seal.external.map((f) => f.path), ["tests/profile-externalization.probe.mjs", "docs/design/block-b-x24-expectations.md"]);
  for (const entry of sealed) verifyEntry(entry, read(entry.repoPath));
  assert.deepEqual(seal.executables.map((e) => e.file), EXECUTABLES, "pinned executables");
  for (const e of seal.executables) assert.equal(sha(read(join(ROOT, e.file))), e.sha256, `executable ${e.file}`);
  assert.deepEqual(manifest.executables.map((e) => [e.file, e.sha256]), seal.executables.map((e) => [e.file, e.sha256]), "manifest and seal pin the same executables");
  assert.deepEqual(seal.unsealed.map((u) => u.id), ["U-1", "U-2", "U-3", "U-4", "U-5", "U-6", "U-7"]);
});

test("x24 seal: a one-byte change in any sealed file fails", () => {
  for (const entry of sealed) {
    const bytes = read(entry.repoPath);
    const positions = new Set([0, bytes.length >> 2, bytes.length >> 1, (3 * bytes.length) >> 2, bytes.length - 1]);
    for (const i of positions) {
      const damaged = Buffer.from(bytes);
      damaged[i] ^= 1;
      assert.throws(() => verifyEntry(entry, damaged), /sealed file changed/, `${entry.repoPath} byte ${i}`);
    }
  }
  for (const i of [0, sealBytes.length >> 1, sealBytes.length - 1]) {
    const damaged = Buffer.from(sealBytes);
    damaged[i] ^= 1;
    assert.notEqual(sha(damaged), SEAL_SHA256, `seal.json byte ${i}`);
  }
});

// ------------------------------------------------------------------ derivation helper hygiene
const ALLOWED_IMPORTS = new Set(["node:fs", "node:path", "node:crypto"]);
const BRAND_HELPER = "../../../../helpers/brand.mjs";
const FORBIDDEN_MODULES = new Set(["child_process", "vm", "worker_threads", "module", "cluster", "inspector", "wasi", "repl"].flatMap((m) => [m, `node:${m}`]));
const FORBIDDEN_IDENTIFIERS = new Set(["require", "eval", "Function", "createRequire", "WebAssembly", "Worker", "importScripts"]);
const PROCESS_HOOKS = new Set(["binding", "_linkedBinding", "dlopen", "mainModule", "getBuiltinModule"]);
const GLOBALS = new Set(["globalThis", "global", "self", "window"]);
const constantOf = (t) => (t?.type === "string" ? t.piece.value : t?.type === "template" && t.subs.length === 0 ? t.chunks[0].value : null);
const isIdent = (t, v) => t?.type === "ident" && t.value === v;
const isPunct = (t, v) => t?.type === "punct" && t.value === v;
/**
 * Module specifiers and code-loading constructs of JavaScript text, read from its tokens (derive/scan.mjs
 * lexer), so that formatting, comments and statement position do not matter: static import and export-from
 * declarations anywhere, dynamic import(), require (also as a member), eval, Function, createRequire,
 * process hooks, computed global access and any constant naming a code-loading module.
 */
function loadsOf(text) {
  const specs = [];
  const dynamic = [];
  const visit = (tokens) => {
    const sig = tokens.filter((t) => t.type !== "ws" && t.type !== "comment");
    for (let k = 0; k < sig.length; k++) {
      const t = sig[k];
      if (t.type === "template") t.subs.forEach(visit);
      const value = constantOf(t);
      if (value !== null && FORBIDDEN_MODULES.has(value)) dynamic.push(`names module ${value}`);
      if (t.type !== "ident") continue;
      const next = sig[k + 1];
      if (t.value === "import" && !isPunct(sig[k - 1], ".")) {
        if (isPunct(next, "(")) dynamic.push("dynamic import");
        else if (!isPunct(next, ".")) {
          let j = k + 1;
          if (constantOf(next) === null) while (j < sig.length && !isIdent(sig[j], "from") && !isPunct(sig[j], ";")) j++;
          else j = k;
          const spec = constantOf(sig[j + 1]);
          if (spec === null) dynamic.push("unparsed import");
          else specs.push(spec);
        }
      } else if (t.value === "export" && (isPunct(next, "*") || isPunct(next, "{"))) {
        let j = k + 1;
        if (isPunct(next, "{")) while (j < sig.length && !isPunct(sig[j], "}")) j++;
        while (j < sig.length && !isIdent(sig[j], "from") && !isPunct(sig[j], ";") && !(isIdent(sig[j], "export") && j > k)) j++;
        if (isIdent(sig[j], "from")) {
          const spec = constantOf(sig[j + 1]);
          if (spec === null) dynamic.push("unparsed export");
          else specs.push(spec);
        }
      } else if (FORBIDDEN_IDENTIFIERS.has(t.value)) dynamic.push(`uses ${t.value}`);
      else if (t.value === "process" && isPunct(next, ".") && PROCESS_HOOKS.has(sig[k + 2]?.value)) dynamic.push(`uses process.${sig[k + 2].value}`);
      else if (GLOBALS.has(t.value) && isPunct(next, "[")) dynamic.push(`computed ${t.value} access`);
    }
  };
  visit(lexJs(text).tokens);
  return { specs, dynamic };
}
function helperProblems(name, text, siblings) {
  const { specs, dynamic } = loadsOf(text);
  const problems = dynamic.map((d) => `${name} ${d}`);
  for (const spec of specs) {
    if (ALLOWED_IMPORTS.has(spec) || spec === BRAND_HELPER) continue;
    if (spec.startsWith("./") && siblings.includes(spec.slice(2))) continue;
    problems.push(`${name} imports ${spec}`);
  }
  return problems;
}

test("x24 seal: derivation helpers import no interpreter, codec, layout, exporter or command", () => {
  const dir = `${ROOT}/derive`;
  const helpers = readdirSync(join(repo, dir)).filter((n) => n.endsWith(".mjs")).sort();
  assert.ok(helpers.length >= 17, "derivation helpers missing");
  for (const name of helpers) assert.deepEqual(helperProblems(name, read(`${dir}/${name}`).toString("utf8"), helpers), [], name);
  assert.deepEqual(loadsOf(read("tests/helpers/brand.mjs").toString("utf8")), { specs: ["node:crypto"], dynamic: [] }, "brand helper imports");
  const forbidden = [
    'const a = 1; import { layout } from "../../../../../dist/layout/index.js";',
    'let b = 2; import BpmnModdle from "bpmn-moddle"; let c = 3;',
    'import/* note */{ layout }/* note */from/* note */"../../../../../src/layout/index.js";',
    'import {\n  layout,\n  route,\n} from\n  "../../../../../dist/layout/index.js";',
    'import{layout}from"../../../../../dist/layout/index.js"',
    'import * as ts from "typescript";',
    'import "esbuild";',
    'import d, { e } from "node:vm";',
    'export * from "../../../../../src/io/index.js";',
    'export { encode } from "../../../../../src/io/index.js";',
    'export * as io from "../../../../../dist/io/index.js";',
    'import { execFileSync } from "node:child_process";',
    'import { createRequire } from "node:module";',
    'const m = await import("bpmn-js");',
    'const m = await import (\n  "bpmn-js");',
    "const m = import(`bpmn-js`);",
    "const m = `${await import(\"bpmn-js\")}`;",
    'const r = require("diagram-js");',
    'const r = require ("diagram-js");',
    'const r = module.require("diagram-js");',
    'const f = new Function("return 1");',
    'const f = Function("return 1");',
    'eval("1");',
    'process.binding("fs");',
    'const g = globalThis["req" + "uire"];',
    'const v = "node:vm";',
    'import { sibling } from "./not-a-helper.mjs";',
  ];
  for (const snippet of forbidden) assert.notDeepEqual(helperProblems("witness.mjs", `${snippet}\n`, helpers), [], snippet);
  const allowed = [
    'import { readFileSync } from "node:fs";',
    'import { sha256 } from "./scan.mjs";',
    '// import { layout } from "../../../../../dist/layout/index.js";',
    '/* const r = require("diagram-js"); */',
    "const text = 'import { layout } from \"x\"';",
    "const here = new URL(import.meta.url).pathname;",
    'export const value = 1;',
    'export { value };',
    "const argv = process.argv;",
  ];
  for (const snippet of allowed) assert.deepEqual(helperProblems("witness.mjs", `${snippet}\n`, helpers), [], snippet);
});

// ------------------------------------------------------------------ cases
const CASE_KEYS = new Set(["caseId", "operation", "phase", "profileArtifact", "inputArtifacts", "commandArtifact", "expectedArtifacts", "expectedStatus", "comparatorIds"]);
const nonEmpty = (v) => v !== null && v !== undefined && (typeof v === "string" ? v.length > 0 : Array.isArray(v) ? v.length > 0 : typeof v === "object" ? Object.keys(v).length > 0 : true);

test("x24 seal: cases follow profile-parity-corpus/1, cite DESIGN and never expect empty output", () => {
  const comparatorIds = new Set(x24("comparators.json").comparators.map((c) => c.id));
  assert.equal(manifest.format, "profile-parity-corpus/1");
  assert.deepEqual(manifest.comparators.map((c) => c.id).sort(), [...comparatorIds].sort());
  const groups = {};
  for (const entry of manifest.cases) groups[entry.group] = (groups[entry.group] ?? 0) + 1;
  assert.deepEqual(groups, GROUPS);
  for (const [path, digest] of Object.entries(manifest.files)) assert.equal(sha(read(join(ROOT, path))), digest, `manifest digest ${path}`);
  const ids = new Set();
  for (const entry of manifest.cases) {
    const c = x24(entry.path);
    assert.equal(c.caseId, entry.caseId);
    assert.ok(!ids.has(c.caseId), `duplicated case ${c.caseId}`);
    ids.add(c.caseId);
    assert.match(c.caseId, new RegExp(`^x24-${entry.group}-\\d{3}-[a-z0-9-]+$`));
    for (const key of Object.keys(c)) assert.ok(CASE_KEYS.has(key), `${c.caseId} key ${key}`);
    assert.match(c.operation, /^x24\.[a-z.-]+$/);
    const [clause] = c.inputArtifacts;
    assert.equal(clause.role, "clause", `${c.caseId} provenance first`);
    assert.equal(clause.json.sha256, DESIGN_SHA256);
    assert.deepEqual(clause.json.clauses, entry.clauses);
    assert.ok(entry.clauses.length > 0 && entry.clauses.every((s) => /^§[0-9.]+(?: item \d+)? L\d+/.test(s)), `${c.caseId} clauses`);
    assert.match(entry.discriminates, /^W-[A-Z]\d+$/);
    assert.ok(c.comparatorIds.length > 0 && c.comparatorIds.every((id) => comparatorIds.has(id)), `${c.caseId} comparators`);
    assert.match(c.expectedStatus, /^(success|refused:[a-z0-9-]+)$/);
    assert.ok(c.expectedArtifacts.length > 0, `${c.caseId} expects nothing`);
    for (const a of [...c.inputArtifacts, ...c.expectedArtifacts, ...(c.commandArtifact ? [c.commandArtifact] : [])]) {
      assert.equal(typeof a.role, "string");
      if ("path" in a) assert.equal(a.sha256, manifest.files[a.path], `${c.caseId} artifact ${a.path}`);
      else assert.ok("json" in a, `${c.caseId} artifact ${a.role}`);
      if (a.json?.path && a.json?.sha256) assert.equal(sha(read(join(ROOT, a.json.path))), a.json.sha256, `${c.caseId} profile ${a.json.path}`);
    }
    for (const a of c.expectedArtifacts) if (!("path" in a) && a.role !== "differences") assert.ok(nonEmpty(a.json), `${c.caseId} empty ${a.role}`);
    if (c.expectedStatus.startsWith("refused:")) assert.equal(c.expectedArtifacts.find((a) => a.role === "refusal").json.code, c.expectedStatus.slice("refused:".length));
  }
  const emptyDifferences = manifest.cases.filter((e) => x24(e.path).expectedArtifacts.some((a) => a.role === "differences" && a.json.length === 0)).map((e) => e.caseId);
  assert.deepEqual(emptyDifferences, ["x24-X-019-import-legacy-symbols"]);
});

// ------------------------------------------------------------------ comparators
const clone = (v) => structuredClone(v);
/** Pointer of the first leaf of a JSON value matching a predicate, or null. */
function firstLeaf(value, pred, at = []) {
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const hit = firstLeaf(v, pred, [...at, k]);
      if (hit) return hit;
    }
    return null;
  }
  return pred(value, at) ? at : null;
}
function setLeaf(value, at, f) {
  const out = clone(value);
  let node = out;
  for (const k of at.slice(0, -1)) node = node[k];
  node[at.at(-1)] = f(node[at.at(-1)]);
  return out;
}
const idKey = (at) => /^(id|ids|.*Id|source|target|element|host)$/.test(String(at.findLast((k) => !/^\d+$/.test(k)) ?? ""));
/** Wrong observations of a case: each must be rejected by its comparators. */
function wrongObservations(c, ideal) {
  const out = [];
  if (ideal.runs) {
    const { a, b } = ideal.runs;
    if (canonical(a.artifacts.results) !== canonical(b.artifacts.results)) out.push(["swapped runs", { runs: { a: b, b: a } }]);
    const leaf = firstLeaf(a.artifacts.results, () => true);
    if (leaf) out.push(["changed run a leaf", { runs: { a: { artifacts: { results: setLeaf(a.artifacts.results, leaf, (v) => (typeof v === "string" ? `${v}x` : typeof v === "number" ? v + 1 : !v)) } }, b } }]);
    out.push(["extra artifact in run b", { runs: { a, b: { artifacts: { ...b.artifacts, debug: {} } } } }]);
    out.push(["missing results in run a", { runs: { a: { artifacts: {} }, b } }]);
    return out;
  }
  const status = c.expectedStatus === "success" ? "refused:operation-error" : "success";
  out.push(["wrong status", { ...ideal, status }]);
  for (const role of Object.keys(ideal.artifacts)) {
    const { [role]: _, ...rest } = ideal.artifacts;
    out.push([`omitted ${role}`, { ...ideal, artifacts: rest }]);
  }
  out.push(["extra artifact", { ...ideal, artifacts: { ...ideal.artifacts, debug: { partial: true } } }]);
  for (const [role, value] of Object.entries(ideal.artifacts)) {
    if (role === "ledger") {
      out.push(["recomputed ledger differs", { ...ideal, artifacts: { ...ideal.artifacts, ledger: { sha256: "0".repeat(64) } } }]);
      continue;
    }
    const id = firstLeaf(value, (v, at) => typeof v === "string" && idKey(at));
    if (id) out.push([`changed id in ${role}`, { ...ideal, artifacts: { ...ideal.artifacts, [role]: setLeaf(value, id, (v) => `${v}x`) } }]);
    const num = firstLeaf(value, (v) => typeof v === "number");
    if (num) out.push([`changed number in ${role}`, { ...ideal, artifacts: { ...ideal.artifacts, [role]: setLeaf(value, num, (v) => v + 1) } }]);
    if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.diagnostics)) out.push([`added diagnostic in ${role}`, { ...ideal, artifacts: { ...ideal.artifacts, [role]: { ...value, diagnostics: [...value.diagnostics, { code: "x24-witness", severity: "warn" }] } } }]);
    if (role === "refusal") {
      out.push(["changed refusal code", { ...ideal, artifacts: { ...ideal.artifacts, refusal: { ...value, code: `${value.code}-x` } } }]);
      if (value.ids) out.push(["changed refusal ids", { ...ideal, artifacts: { ...ideal.artifacts, refusal: { ...value, ids: [...value.ids, "x24-witness"] } } }]);
    }
    if (role === "state") out.push(["changed state", { ...ideal, artifacts: { ...ideal.artifacts, state: { inputs: "changed" } } }]);
  }
  return out;
}

test("x24 seal: the pinned comparators accept the sealed values and reject wrong outputs", () => {
  assert.deepEqual(x24("comparators.json").comparators.map((c) => c.id).sort(), Object.keys(COMPARATORS).sort(), "every comparator id has executable semantics");
  let accepted = 0;
  let rejected = 0;
  for (const entry of manifest.cases) {
    const c = x24(entry.path);
    const ideal = idealObservation(c);
    if (!ideal) continue;
    const verdict = compareCase(c, ideal, { lexicon });
    assert.ok(verdict.ok, `${c.caseId} accepts its sealed values: ${verdict.failures.join("; ")}`);
    accepted++;
    for (const [label, wrong] of wrongObservations(c, ideal)) {
      assert.equal(compareCase(c, wrong, { lexicon }).ok, false, `${c.caseId} rejects ${label}`);
      rejected++;
    }
  }
  assert.deepEqual([accepted, rejected], [103, 459], "comparator witnesses: cases accepted, wrong observations rejected");
  // Assertion cases: a satisfying subject is accepted; an absent subject or a falsified assertion is rejected.
  const p1 = x24("cases/x24-P-001-probe-1-original.json");
  const original = expectations.probe1.original.call;
  const subject = { originalAssertion: { function: original.function, argument: original.argument, returns: false } };
  assert.ok(compareCase(p1, { status: "success", artifacts: { subject } }).ok, "P-001 accepts the original assertion");
  assert.equal(compareCase(p1, { status: "success", artifacts: { subject: { originalAssertion: { ...subject.originalAssertion, returns: true } } } }).ok, false, "P-001 rejects a recognised marker");
  assert.equal(compareCase(p1, { status: "success", artifacts: {} }).ok, false, "P-001 rejects an absent subject");
  const r4 = x24("cases/x24-R-004-no-forced-descriptor.json");
  const keys = r4.expectedArtifacts[0].json.find((a) => a.op === "keysEqual").value;
  const packages = r4.expectedArtifacts[0].json.find((a) => a.pointer === "/codecPackagesWithoutInjection").value;
  const surface = { packageExports: Object.fromEntries(keys.map((k) => [k, "./dist/index.js"])), distMembers: ["dist/index.js"], ioExports: ["createCodec"], codecPackagesWithoutInjection: packages };
  const witnesses = witnessLexicon();
  assert.ok(compareCase(r4, { status: "success", artifacts: { subject: surface } }, { lexicon }).ok, "R-004 accepts a neutral surface");
  assert.ok(compareCase(r4, { status: "success", artifacts: { subject: surface } }, { lexicon: witnesses }).ok, "R-004 accepts a neutral surface under the witness lexicon");
  for (const [label, s, lx] of [
    ["absent dist members", { ...surface, distMembers: undefined }, lexicon],
    ["descriptor export (synthetic descriptor-family literal)", { ...surface, ioExports: [...surface.ioExports, WITNESS.descriptor] }, witnesses],
    ["extra export key", { ...surface, packageExports: { ...surface.packageExports, "./extra": "./dist/extra.js" } }, lexicon],
  ]) assert.equal(compareCase(r4, { status: "success", artifacts: { subject: s } }, { lexicon: lx }).ok, false, `R-004 rejects ${label}`);
});

// ------------------------------------------------------------------ ledger
const FORM_ORDER = { path: 0, raw: 1, token: 2, decoded: 3 };

test("x24 seal: the ledger has one row per occurrence, consistent with its rules, its lexicon and its literal set", () => {
  const rulesDoc = x24("classification-rules.json");
  const rules = compileRules(rulesDoc);
  const entryOrder = new Map(lexicon.entries.map((e, i) => [e.id, i]));
  const entryById = new Map(lexicon.entries.map((e) => [e.id, e]));
  assert.equal(ledger.design.sha256, DESIGN_SHA256);
  assert.equal(ledger.base.commit, BASE_COMMIT);
  assert.equal(ledger.inputs.lexicon.sha256, sha(read(`${ROOT}/lexicon.json`)));
  assert.equal(ledger.inputs.rules.sha256, sha(read(`${ROOT}/classification-rules.json`)));
  for (const [path, digest] of Object.entries(ledger.inputs.helpers)) assert.equal(sha(read(`${ROOT}/${path}`)), digest, path);
  assert.equal(ledger.inputs.brandHelper.sha256, sha(read("tests/helpers/brand.mjs")));
  assert.equal(ledger.summary.occurrences, ledger.occurrences.length);
  assert.equal(ledger.summary.unmatched, 0);
  assert.equal(ledger.summary.unexplainedMemberHits, 0);
  assert.equal(ledger.summary.distributionMembers, ledger.distributionMembers.length);
  assert.equal(ledger.summary.memberOccurrences, ledger.distributionMembers.reduce((n, m) => n + m.hits.length, 0));
  // The files map is the base tree: one record per tracked base file.
  assert.equal(Object.keys(ledger.files).length, ledger.base.trackedFiles);
  for (const [file, f] of Object.entries(ledger.files)) {
    assert.ok(HEX64.test(f.pathSha256) && /^[0-9a-f]{40}$/.test(f.gitBlob) && HEX64.test(f.sha256), `${file} digests`);
    assert.ok(Number.isInteger(f.bytes) && Number.isInteger(f.lines) && typeof f.binary === "boolean", `${file} record`);
  }
  // Every row: stable id, source order, a span of its file, and the fields its first-match rule gives.
  const hashed = new Map(lexicon.entries.map((e) => [e.id, {
    keys: new Set(e.match.flatMap((m) => [...(m.hashes ?? []).map((h) => h.sha256), ...(m.only ?? [])])),
    structural: e.match.some((m) => m.type === "regex" && !m.hashes),
    brand: e.match.some((m) => m.type === "brand" && !m.only),
  }]));
  let previous = null;
  ledger.occurrences.forEach((row, i) => {
    assert.equal(row.id, `I-${String(i + 1).padStart(4, "0")}`);
    const f = ledger.files[row.file];
    assert.ok(f, `${row.id} file record`);
    assert.ok((row.form === "path" && row.line === 0 && row.endLine === 0) || (row.form === "raw" && row.line > 0 && row.endLine === row.line && row.line <= f.lines), `${row.id} span form`);
    assert.ok(row.endColumn > row.column && row.column >= 0, `${row.id} span`);
    for (const h of [row.literal, row.key, row.lineSha256]) assert.match(h, HEX64, `${row.id} digests`);
    if (row.line === 0) assert.equal(row.lineSha256, f.pathSha256, `${row.id} path row digest`);
    const entry = entryById.get(row.entry);
    assert.equal(row.family, entry.family, `${row.id} family`);
    const h = hashed.get(row.entry);
    assert.ok(h.keys.has(row.key) || (h.structural && row.key === row.literal) || h.brand, `${row.id} key is a lexicon hash of its entry`);
    const rule = classify(rules, row.file, row);
    assert.ok(rule, `${row.file}:${row.line}:${row.column} ${row.entry} unmatched`);
    assert.deepEqual(
      { rule: row.rule, category: row.category, consumer: row.consumer, policy: row.policy, targetRef: row.targetRef, disposition: row.disposition, designRefs: row.designRefs },
      { rule: rule.id, category: rule.category === "family" ? rulesDoc.familyCategory[row.family] : rule.category, consumer: rule.consumer, policy: rule.policy, targetRef: rule.target, disposition: rule.disposition, designRefs: [...entry.designRefs].sort() },
      `${row.id} classification recomputed from its own fields`);
    if (previous) {
      const order = cmp(previous.file, row.file) || previous.line - row.line || previous.column - row.column || FORM_ORDER[previous.form] - FORM_ORDER[row.form] || entryOrder.get(previous.entry) - entryOrder.get(row.entry) || previous.endLine - row.endLine || previous.endColumn - row.endColumn;
      assert.ok(order < 0, `${row.id} source order`);
    }
    previous = row;
  });
  // One row per match: no two rows share a span, and the matches of one entry never overlap on a line.
  const spans = new Set(ledger.occurrences.map((r) => [r.file, r.line, r.column, r.endLine, r.endColumn, r.form, r.entry].join("\0")));
  assert.equal(spans.size, ledger.occurrences.length, "one row per span");
  const runs = new Map();
  for (const r of ledger.occurrences) runs.set(`${r.file}\0${r.line}\0${r.form}\0${r.entry}`, [...(runs.get(`${r.file}\0${r.line}\0${r.form}\0${r.entry}`) ?? []), r]);
  for (const list of runs.values()) list.slice(1).forEach((r, i) => assert.ok(r.column >= list[i].endColumn, `${r.id} overlaps ${list[i].id}`));
  const repeated = ledger.occurrences.filter((r) => r.file === "src/internal/canvas.ts" && r.line === 133);
  assert.deepEqual(repeated.map((r) => [r.column, r.entry]), [[39, "LX-TH-2"], [58, "LX-TH-2"], [82, "LX-TH-1"]], "three matches of one line, two of the same literal, are three rows");
  assert.equal(repeated[0].literal, repeated[1].literal);
  // Rule, vocabulary and member consistency.
  const ruleIds = new Map(rulesDoc.rules.map((r) => [r.id, r]));
  const vocabulary = rulesDoc.vocabulary;
  for (const row of ledger.occurrences) {
    assert.ok(ruleIds.has(row.rule) && ledger.targets[row.targetRef], `${row.id} rule and target`);
    assert.ok(vocabulary.category.includes(row.category) && vocabulary.consumer.includes(row.consumer) && row.disposition in vocabulary.disposition, `${row.id} vocabulary`);
  }
  const explainByEntry = new Set(lexicon.entries.filter((e) => e.explainBy === "entry").map((e) => e.id));
  const allowlist = expectations.rescan.thirdPartyAllowlist;
  ledger.distributionMembers.forEach((m, i) => {
    assert.equal(m.id, `D-${String(i + 1).padStart(3, "0")}`);
    assert.ok(["clean", "carries-occurrences"].includes(m.status), m.path);
    assert.equal(m.status === "clean", m.hits.length === 0, m.path);
    for (const h of m.hits) {
      for (const id of h.explainedBy) assert.ok(rowsById.get(id)?.entry === h.entry && (explainByEntry.has(h.entry) || rowsById.get(id).literal === h.literal), `${m.path} ${h.line}:${h.column} explained by ${id}`);
      if (!h.explainedBy.length) assert.ok(h.thirdParty.length === 1 && allowlist.some((t) => t.package === h.thirdParty[0] && t.entry === h.entry), `${m.path} ${h.line}:${h.column} third-party attribution`);
    }
  });
  const byDisposition = {};
  for (const row of ledger.occurrences) byDisposition[row.disposition] = (byDisposition[row.disposition] ?? 0) + 1;
  assert.deepEqual(byDisposition, ledger.summary.byDisposition);
  // The hashed literal set is one record per distinct ledger literal, with the length of its spans.
  assert.equal(literalSetDoc.format, "x24-literal-set/1");
  assert.deepEqual([literalSetDoc.longMin, literalSetDoc.prefilter.bits], [LONG_MIN, PREFILTER_BITS]);
  const lengths = new Map();
  const firstEntry = new Map();
  for (const row of ledger.occurrences) {
    const length = row.endColumn - row.column;
    assert.ok(!lengths.has(row.literal) || lengths.get(row.literal) === length, `${row.id} literal length`);
    lengths.set(row.literal, length);
    if (!firstEntry.has(row.literal)) firstEntry.set(row.literal, row.entry);
  }
  const want = [...firstEntry].map(([literal, entry]) => [literal, lengths.get(literal), entry]).sort((a, b) => cmp(a[0], b[0]));
  assert.deepEqual(literalSetDoc.literals.map((l) => [l.sha256, l.length, l.entry]), want, "one hashed record per distinct ledger literal");
  assert.equal(literalSetDoc.count, want.length);
  for (const l of literalSetDoc.literals) {
    assert.match(l.edges, /^[WN]{2}$/, `${l.sha256.slice(0, 8)} edges`);
    assert.equal(Number.isInteger(l.prefilter), l.length >= LONG_MIN, `${l.sha256.slice(0, 8)} prefilter presence`);
    if (l.length >= LONG_MIN) assert.ok(l.prefilter >= 0 && l.prefilter < 2 ** PREFILTER_BITS, `${l.sha256.slice(0, 8)} prefilter range`);
  }
  // The sealed base selector branches and their allowances name raw rows of src/ (derive/base-check.mjs recomputes them).
  const sel = expectations.rescan.selectorBranch;
  for (const id of sel.baseBranchRows) {
    const r = rowsById.get(id);
    assert.ok(r && r.form === "raw" && sel.entries.includes(r.entry) && r.file.startsWith("src/"), `${id} base branch row`);
  }
  for (const a of sel.allowances) {
    const r = rowsById.get(a.row);
    assert.ok(r && sel.baseBranchRows.includes(a.row) && r.file === a.module && r.entry === a.entry && r.literal === a.literal && r.disposition === "context-generic", `${a.row} allowance row`);
  }
  // A reviewed allowance names a src/ module without a base file, a span and the bytes of the reviewed record of
  // its token there, and the context-generic base rows (one rule) of the published declarations the key belongs to.
  assert.deepEqual(sel.reviewedAllowances.map((a) => a.id), ["RA-01"], "reviewed allowances");
  for (const a of sel.reviewedAllowances) {
    const file = maskPath(a.module, lexicon);
    assert.ok(a.module.startsWith("src/") && !(file in ledger.files), `${a.id} module without a base file`);
    assert.ok(sel.entries.includes(a.entry) && a.count === 1 && HEX64.test(a.sha256) && a.reason.trim().length > 80, `${a.id} record`);
    const token = lexicon.reviewed.tokens.find((t) => t.id === a.reviewed);
    assert.ok(token && token.entry === a.entry && token.literal === a.literal, `${a.id} reviewed token`);
    const record = token.files.find((f) => f.file === file);
    assert.ok(record && record.sha256 === a.sha256 && record.spans.some((s) => canonical(s) === canonical(["raw", a.line, a.column, a.endLine, a.endColumn])), `${a.id} span and bytes of its reviewed record`);
    assert.ok(a.backingRows.length > 0, `${a.id} backing rows`);
    for (const id of a.backingRows) {
      const r = rowsById.get(id);
      assert.ok(r && r.rule === a.backingRule && r.entry === a.entry && r.literal === a.literal && r.disposition === "context-generic" && r.file.startsWith("src/"), `${id} backing row of ${a.id}`);
    }
  }
});

// ------------------------------------------------------------------ literal-free seal (BLOCKER 1)
const hygieneScope = () => [...sealed.map((e) => e.repoPath), SEAL_TEST, HISTORY_GUARD_RECEIPT, UNICODE_RECEIPT, ALLOWANCE_RECEIPT, RELOCATION_RECEIPT, RECEIPT];
/** Every hygiene hit of one file (rules R1 to R3 of probe-expectations.json#/sealHygiene). */
function fileHits(path, text, set) {
  const hits = scanText(path, text, lexicon, { relaxed: true }).occurrences.map((o) => ({ at: `R1 ${o.form}`, line: o.line, column: o.column, entry: o.entry, literal: o.literal, form: o.form }));
  hits.push(...literalHits(text, set).map((h) => ({ at: "text", ...h })));
  if (path.endsWith(".json")) {
    const strings = jsonStrings(JSON.parse(text));
    for (const [at, s] of strings) hits.push(...literalHits(s, set).map((h) => ({ at, ...h })));
    if (/\/(lexicon|classification-rules)\.json$/.test(path)) for (const [at, s] of strings) if (/\/(regex|path|before|after)$/.test(at)) hits.push(...literalHits(unescapedSource(s), set).map((h) => ({ at: `${at} unescaped`, ...h })));
  }
  if (/\.(?:m?js|cjs)$/.test(path)) for (const c of constantStrings(text)) hits.push(...literalHits(c.value, set).map((h) => ({ at: `constant@${c.starts[0]}`, ...h })));
  return hits;
}

test("x24 seal: no ledger field and no sealed file equals or contains a scanned literal", () => {
  const set = literalSet([], literalSetDoc.literals);
  assert.ok(set.length > 100, "hashed literal set");
  assert.deepEqual(ledgerHits(ledger, set).map(where), [], "ledger fields, keys and row concatenations");
  for (const path of hygieneScope()) assert.deepEqual(fileHits(path, decodeMember(read(path)), set).map(where), [], path);
  // Witnesses: synthetic literals hashed as literal-set.json records are; each altered copy below must be caught.
  const m = WITNESS.marker;
  const s = WITNESS.short;
  assert.ok(s.length < LONG_MIN && m.length >= LONG_MIN, "a short and a long witness literal");
  const witnessSet = literalSet([], [hashedLiteral(m, "LX-MK-1"), hashedLiteral(s, "LX-DS-4")]);
  const row = ledger.occurrences[0];
  const altered = (patch) => ({ ...ledger, occurrences: [{ ...row, ...patch }, ...ledger.occurrences.slice(1)] });
  const half = Math.floor(m.length / 2);
  const witnesses = [
    ["literal copied into policy prose", altered({ policy: `${row.policy} (${m})` })],
    ["field equal to a literal", altered({ consumer: m })],
    ["literal split across adjacent fields", altered({ category: `context ${m.slice(0, half)}`, consumer: `${m.slice(half)} tail` })],
    ["short literal as a whole token", altered({ targetRef: `T-${s}` })],
    ["literal in a file key", { ...ledger, files: { ...ledger.files, [`docs/${m}.md`]: ledger.files[row.file] } }],
  ];
  for (const [label, copy] of witnesses) assert.ok(ledgerHits(copy, witnessSet).length > 0, `ledger witness: ${label}`);
  assert.equal(ledgerHits(altered({ targetRef: `T-${s}x` }), witnessSet).length, 0, "a short literal inside a longer word is not an occurrence");
  const esc = (t) => [...t].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
  const fileWitnesses = [
    ["escaped in a JSON string", "w.json", `{"note": "${esc(m)} body"}\n`],
    ["concatenated in a script", "w.mjs", `const note = "${m.slice(0, half)}" +\n  "${m.slice(half)}";\n`],
    ["template constant in a script", "w.mjs", `const note = \`${m.slice(0, half)}\${"${m.slice(half)}"}\`;\n`],
    ["plain in prose", "w.md", `A sentence with ${m} inside.\n`],
  ];
  for (const [label, path, text] of fileWitnesses) assert.ok(fileHits(path, text, witnessSet).length > 0, `file witness: ${label}`);
  const regexWitness = JSON.stringify({ entries: [{ match: [{ regex: `(${m.replace(/[[\]\\.()*+?{}|^$]/g, "\\$&")})` }] }] });
  assert.ok(fileHits(`${ROOT}/lexicon.json`, regexWitness, witnessSet).some((h) => /unescaped/.test(h.at)), "file witness: escaped literal in a regular expression source");
  // A hashed record and a text record of the same literal give the same hits (the probe combines both kinds).
  const sample = `a ${m}${m} b-${s}-c ${s}x ${m.slice(1)}`;
  const strip = (hits) => hits.map(({ index, length, sha256, rule }) => [index, length, sha256, rule]);
  assert.deepEqual(strip(literalHits(sample, witnessSet)), strip(literalHits(sample, literalSet([[m, "LX-MK-1"], [s, "LX-DS-4"]]))), "hashed and text records agree");
  assert.equal(literalSet([[m, "LX-MK-1"]], witnessSet.slice(0, 1)).length, 1, "a text record of a hashed literal is not added twice");
});

// ------------------------------------------------------------------ rescan witnesses (escaped, concatenated, template forms)
test("x24 seal: the pinned scanner finds escaped, concatenated and template forms and selector branches", () => {
  const witnesses = witnessLexicon();
  const m = WITNESS.marker;
  const markerLiteral = sha(m);
  const u = (t) => [...t].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
  const x = (t) => [...t].map((ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`).join("");
  const half = Math.floor(m.length / 2);
  const third = Math.floor(m.length / 3);
  const forms = [
    ["escaped and concatenated constant", "src/witness.ts", `const m = "${x(m.slice(0, half))}" + '${u(m.slice(half))}';\n`],
    ["constant template interpolation", "src/witness.ts", `const m = \`${m.slice(0, 2)}\${"${m.slice(2, half)}"}\${'${m.slice(half)}'}\`;\n`],
    ["three-line concatenation", "src/witness.ts", `const m = "${m.slice(0, third)}" +\n  "${m.slice(third, 2 * third)}" +\n  "${m.slice(2 * third)}";\n`],
    ["escaped template", "src/witness.ts", `const m = \`${u(m)} example\`;\n`],
    ["nested constant template", "src/witness.ts", `const m = \`\${\`${m.slice(0, half)}\${"${m.slice(half)}"}\`} tail\`;\n`],
    ["escaped JSON string", "src/witness.json", `{"text": "${u(m)} body"}\n`],
  ];
  for (const [label, path, text] of forms) {
    const found = scanText(path, text, witnesses).occurrences.filter((o) => o.entry === "LX-MK-1" && o.literal === markerLiteral);
    assert.equal(found.length, 1, `scanner witness: ${label}`);
    assert.equal(found[0].form, "token", `scanner witness form: ${label}`);
  }
  const dynamicPart = `const m = "${m.slice(0, half)}" + part + "${m.slice(half)}";\n`;
  assert.equal(scanText("src/witness.ts", dynamicPart, witnesses).occurrences.filter((o) => o.entry === "LX-MK-1").length, 0, "a dynamic part is left to the two-profile runs (DESIGN.md:874)");
  assert.equal(scanText("src/witness.ts", `const m = "${m}";\n`, lexicon).occurrences.filter((o) => o.entry === "LX-MK-1").length, 0, "the synthetic marker is not a sealed literal");
  // Look selector branches, including escaped and concatenated forms.
  const n = WITNESS.look.toLowerCase();
  const branchWitnesses = [
    ["comparison", `if (look === "${n}") draw();\n`, "comparison"],
    ["escaped comparison", `if ("${u(n)}" == look) draw();\n`, "comparison"],
    ["concatenated case label", `switch (look) { case "${n.slice(0, 2)}" + "${n.slice(2)}": break; }\n`, "case"],
    ["quoted key", `const t = { "${n}": 1, other: 2 };\n`, "key"],
    ["computed member", `const t = table["${n}"];\n`, "member"],
    ["array element", `const t = ["${n}", "other"];\n`, "element"],
    ["template computed key", `const t = { [\`${n}\`]: 1 };\n`, "key"],
  ];
  for (const [label, text, use] of branchWitnesses) assert.deepEqual(selectorBranches("src/witness.ts", text, witnesses, ["LX-TH-1"]).map((b) => b.use), [use], `branch witness: ${label}`);
  assert.deepEqual(selectorBranches("src/witness.ts", `const t = ["${n}x"];\n`, witnesses, ["LX-TH-1"]), [], "a longer word is no selector branch");
});

// ------------------------------------------------------------------ reviewed occurrences of the integration scan
test("x24 seal: every reviewed record of the lexicon binds exactly the occurrences of its token in its file", () => {
  assert.equal(lexicon.format, "x24-scan-lexicon/4");
  const review = lexicon.reviewed;
  assert.deepEqual(review.tokens.map((t) => t.id), review.tokens.map((_, i) => `RV-${String(i + 1).padStart(2, "0")}`));
  const entries = new Set(lexicon.entries.map((e) => e.id));
  const byPathSha = new Map();
  for (const prefix of review.eligible) {
    if (!existsSync(join(repo, prefix))) continue;
    const list = prefix.endsWith("/") ? walk(join(repo, prefix)).map((p) => `${prefix}${p}`) : [prefix];
    for (const p of list) byPathSha.set(sha(p), p);
  }
  const tokens = new Set();
  let total = 0;
  for (const t of review.tokens) {
    assert.ok(entries.has(t.entry) && HEX64.test(t.literal) && HEX64.test(t.key), `${t.id} token`);
    assert.ok(["generic-word", "legacy-api-value", "homograph"].includes(t.class) && t.justification.trim().length > 80, `${t.id} class and justification`);
    assert.ok(!tokens.has(`${t.entry} ${t.literal}`), `${t.id} token reviewed once`);
    tokens.add(`${t.entry} ${t.literal}`);
    assert.ok(t.files.length > 0 && t.count === t.files.reduce((n, f) => n + f.spans.length, 0), `${t.id} count`);
    for (const f of t.files) {
      const path = byPathSha.get(f.pathSha256);
      assert.ok(path, `${t.id} ${f.file}: bound file under an eligible prefix`);
      assert.equal(maskPath(path, lexicon), f.file, `${t.id} ${f.file}: masked path`);
      // A base file is never bound: its occurrences pair with ledger rows (README design decisions 18 and 21).
      assert.ok(!Object.hasOwn(ledger.files, f.file), `${t.id} ${f.file}: a block B file, not a path of the base tree`);
      const bytes = read(path);
      assert.equal(sha(bytes), f.sha256, `${t.id} ${f.file}: bound bytes unchanged (rebind after a block B reseal, README "Reviewed occurrences")`);
      const all = scanBytes(path, bytes, lexicon, { reviewed: false }).occurrences.filter((o) => o.entry === t.entry && o.literal === t.literal);
      assert.deepEqual(all.map((o) => [o.form, o.line, o.column, o.endLine, o.endColumn]), f.spans, `${t.id} ${f.file}: every occurrence of the token is bound`);
      for (const o of all) assert.equal(o.key, t.key, `${t.id} ${f.file}: key`);
      assert.equal(scanBytes(path, bytes, lexicon).occurrences.filter((o) => o.entry === t.entry && o.literal === t.literal).length, 0, `${t.id} ${f.file}: reviewed occurrences are not reported`);
      total += f.spans.length;
    }
  }
  assert.equal(total, 598, "reviewed occurrences");
  // Witnesses: another byte, another path or the relaxed scan report the occurrences again.
  const t = review.tokens[0];
  const f = t.files[0];
  const path = byPathSha.get(f.pathSha256);
  const bytes = read(path);
  const hit = (occurrences) => occurrences.some((o) => o.entry === t.entry && o.literal === t.literal);
  assert.ok(hit(scanBytes(path, Buffer.concat([bytes, Buffer.from("\n")]), lexicon).occurrences), "a changed bound file reports its occurrences again");
  assert.ok(hit(scanBytes(`${path}.copy`, bytes, lexicon).occurrences), "a record binds one path");
  assert.ok(hit(scanText(path, bytes.toString("utf8"), lexicon, { relaxed: true }).occurrences), "the relaxed scan ignores the reviewed records");
  // A reviewed allowance holds at the bound bytes of its module: the scanner finds its branch at its span, and it is
  // the only look selector branch of the module; one more byte voids it (README "Reviewed selector-branch allowance").
  const sel = expectations.rescan.selectorBranch;
  for (const a of sel.reviewedAllowances) {
    const moduleBytes = read(a.module);
    assert.equal(sha(moduleBytes), a.sha256, `${a.id}: module bytes unchanged (a change voids the allowance; reseal after review)`);
    const branches = selectorBranches(a.module, moduleBytes.toString("utf8"), lexicon, sel.entries);
    assert.deepEqual(branches.map((b) => [b.use, b.line, b.column, b.endLine, b.endColumn, b.entry, b.literal]), [[a.use, a.line, a.column, a.endLine, a.endColumn, a.entry, a.literal]], `${a.id}: the only look selector branch of its module sits at its span`);
    assert.notEqual(sha(Buffer.concat([moduleBytes, Buffer.from("\n")])), a.sha256, `${a.id}: a changed module no longer has the sealed bytes`);
  }
});

// ------------------------------------------------------------------ relocated base rows of the integration scan
/** The pairing key of the I1 scan and of the probe rescan (derive/reviewed.mjs, probe-expectations.json#/probe2/trackedRescan). */
const pairKey = (r) => [r.file, r.form, r.entry, r.literal, r.column, r.endColumn, r.endLine - r.line, r.lineSha256].join("\0");
const RELOCATED_FIELDS = ["file", "form", "entry", "family", "literal", "key", "rule", "category", "consumer", "targetRef", "disposition"];

test("x24 seal: every relocated row continues one base row on the line a block B edit left", () => {
  const relocated = lexicon.relocated;
  assert.ok(typeof relocated.note === "string" && relocated.note.trim().length > 200, "relocation rule");
  assert.deepEqual(relocated.rows.map((r) => r.id), relocated.rows.map((_, i) => `RL-${String(i + 1).padStart(2, "0")}`));
  const baseKeys = new Set(ledger.occurrences.map(pairKey));
  const relocatedRows = new Set();
  for (const rec of relocated.rows) {
    const row = rowsById.get(rec.row);
    assert.ok(row && !relocatedRows.has(rec.row), `${rec.id}: one base row, relocated once`);
    relocatedRows.add(rec.row);
    // The same occurrence: the row's file, form, entry, literal, key and span length; its classification repeated.
    for (const f of RELOCATED_FIELDS) assert.equal(rec[f], row[f], `${rec.id}: ${f} of ${rec.row}`);
    assert.ok(rec.form === "raw" && rec.line > 0 && rec.endLine === rec.line && row.endLine === row.line, `${rec.id}: one raw line`);
    assert.equal(rec.endColumn - rec.column, row.endColumn - row.column, `${rec.id}: span length of ${rec.row}`);
    assert.ok(HEX64.test(rec.lineSha256) && rec.lineSha256 !== row.lineSha256 && !baseKeys.has(pairKey(rec)), `${rec.id}: the key of an edited line, which no base row has`);
    assert.ok(maskPath(rec.file, lexicon) === rec.file && sha(rec.file) === ledger.files[rec.file]?.pathSha256, `${rec.id}: a base file named by its own path`);
    // The edit replaced the spans of other rows of the same base line, outside the row's span; each replacement and
    // the row move by the length change of the replacements before them.
    assert.match(rec.edit.commit, /^[0-9a-f]{40}$/, `${rec.id}: edit commit`);
    assert.ok(rec.edit.replaced.length > 0, `${rec.id}: replaced rows`);
    let shift = 0;
    let before = 0;
    let end = 0;
    for (const r of rec.edit.replaced) {
      const b = rowsById.get(r.row);
      assert.ok(b && b.file === row.file && b.line === row.line && b.form === "raw" && b.column >= end && (b.endColumn <= row.column || b.column >= row.endColumn), `${rec.id}: replaced row ${r.row} on the base line, in order, outside the span`);
      assert.ok(HEX64.test(r.sha256) && r.sha256 !== b.literal && r.endColumn > r.column && r.column === b.column + shift, `${rec.id}: replacement of ${r.row}`);
      const delta = r.endColumn - r.column - (b.endColumn - b.column);
      shift += delta;
      if (b.endColumn <= row.column) before += delta;
      end = b.endColumn;
    }
    assert.equal(rec.column, row.column + before, `${rec.id}: columns of ${rec.row} after the edit`);
    assert.ok(/^[0-9a-f]{40}$/.test(rec.verifiedAt.commit) && HEX64.test(rec.verifiedAt.fileSha256), `${rec.id}: verified tree and bytes`);
  }
  // Against the current file: every line with the record's digest carries the occurrence at the record's columns and
  // each replacement at its columns, which no lexicon entry matches; at the verified bytes the record's own line is
  // one. A record whose line the file no longer holds pairs nothing (README "Relocated base rows").
  for (const rec of relocated.rows) {
    const bytes = read(rec.file);
    const { lines, occurrences } = scanBytes(rec.file, bytes, lexicon, { reviewed: false });
    const at = lines.flatMap((l, i) => (sha(l) === rec.lineSha256 ? [i + 1] : []));
    if (sha(bytes) === rec.verifiedAt.fileSha256) assert.ok(at.includes(rec.line), `${rec.id}: its line at the verified bytes`);
    for (const n of at) {
      const onLine = occurrences.filter((o) => o.line === n && o.endLine === n);
      assert.ok(onLine.some((o) => o.form === "raw" && o.column === rec.column && o.endColumn === rec.endColumn && o.entry === rec.entry && o.literal === rec.literal && o.key === rec.key), `${rec.id}: occurrence at ${n}:${rec.column}`);
      for (const r of rec.edit.replaced) {
        assert.equal(sha(lines[n - 1].slice(r.column, r.endColumn)), r.sha256, `${rec.id}: replacement of ${r.row} at ${n}:${r.column}`);
        assert.ok(!onLine.some((o) => o.column < r.endColumn && r.column < o.endColumn), `${rec.id}: no lexicon occurrence in the replacement at ${n}:${r.column}`);
      }
    }
  }
  // RL-01 to RL-03 (rows I-1427, I-1462 and I-1464) were retired by the final spec pass: the block B fix of review
  // finding 17 restored their base lines, so the occurrences pair through the base key (README "Relocated base rows").
  assert.deepEqual([...relocatedRows].sort(), [], "no current relocated base row");
});

// ------------------------------------------------------------------ injected data sets
function resolveRef(root, ref) {
  return ref.replace(/^#\//, "").split("/").reduce((node, key) => node[key], root);
}
function typeOk(type, v) {
  if (type === "object") return v !== null && typeof v === "object" && !Array.isArray(v);
  if (type === "array") return Array.isArray(v);
  if (type === "integer") return Number.isInteger(v);
  if (type === "number") return typeof v === "number" && Number.isFinite(v);
  return typeof v === type;
}
/** JSON Schema subset used by business-policy/1: returns the list of violations. */
function validate(schema, v, root, at = "", errors = []) {
  if (schema.$ref) return validate(resolveRef(root, schema.$ref), v, root, at, errors);
  if (v === null) {
    errors.push(`${at} null`);
    return errors;
  }
  if ("const" in schema && canonical(v) !== canonical(schema.const)) errors.push(`${at} const`);
  if (schema.enum && !schema.enum.some((e) => canonical(e) === canonical(v))) errors.push(`${at} enum`);
  if (schema.type && !typeOk(schema.type, v)) {
    errors.push(`${at} type`);
    return errors;
  }
  if (typeof v === "string") {
    const n = [...v].length;
    if (schema.minLength !== undefined && n < schema.minLength) errors.push(`${at} minLength`);
    if (schema.maxLength !== undefined && n > schema.maxLength) errors.push(`${at} maxLength`);
  }
  if (typeof v === "number") {
    if (schema.minimum !== undefined && v < schema.minimum) errors.push(`${at} minimum`);
    if (schema.maximum !== undefined && v > schema.maximum) errors.push(`${at} maximum`);
    if (schema.exclusiveMinimum !== undefined && v <= schema.exclusiveMinimum) errors.push(`${at} exclusiveMinimum`);
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) errors.push(`${at} minItems`);
    if (schema.maxItems !== undefined && v.length > schema.maxItems) errors.push(`${at} maxItems`);
    if (schema.uniqueItems && new Set(v.map(canonical)).size !== v.length) errors.push(`${at} uniqueItems`);
    if (schema.items) v.forEach((item, i) => validate(schema.items, item, root, `${at}/${i}`, errors));
  }
  if (typeOk("object", v)) {
    for (const key of schema.required ?? []) if (!(key in v)) errors.push(`${at}/${key} required`);
    for (const [key, value] of Object.entries(v)) {
      if (schema.properties && key in schema.properties) validate(schema.properties[key], value, root, `${at}/${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}/${key} additional`);
    }
  }
  if (schema.oneOf && schema.oneOf.filter((s) => validate(s, v, root).length === 0).length !== 1) errors.push(`${at} oneOf`);
  if (schema.not && validate(schema.not, v, root).length === 0) errors.push(`${at} not`);
  if (schema.if) {
    const branch = validate(schema.if, v, root).length === 0 ? schema.then : schema.else;
    if (branch) validate(branch, v, root, at, errors);
  }
  return errors;
}
const ascii = (s) => [...s].length === 1 && s.codePointAt(0) >= 0x20 && s.codePointAt(0) <= 0x7e;
/** Static rules of business-policy/1 admission (README "Admission"): first failing code or null. Prefix overlap is no load rule. */
function staticCode(p) {
  const dup = (list) => new Set(list).size !== list.length;
  if (dup(p.classification.annotationRoles.map((r) => r.role))) return "profile-symbol";
  const aliases = p.metrics.aliases;
  if (aliases.some((a) => [...a.from].length !== 1 || ascii(a.from) || !ascii(a.to))) return "profile-type";
  if (dup(aliases.map((a) => a.from))) return "profile-symbol";
  if (p.presentation && dup(p.presentation.looks.map((l) => l.alias))) return "profile-symbol";
  if (p.presentation && dup(p.presentation.layout.nodeSizes.map((n) => n.kind))) return "profile-symbol";
  return null;
}

test("x24 seal: the data sets are admissible, every refusal vector carries its defect, ambiguity refuses at recognition", () => {
  const schema = x24("policy/business-policy-1.schema.json");
  for (const entry of manifest.cases.filter((e) => e.group === "S")) {
    const c = x24(entry.path);
    const input = c.inputArtifacts.find((a) => a.role === "policy-text");
    const text = input.path ? read(`${ROOT}/${input.path}`).toString("utf8") : input.json.text;
    const code = c.expectedStatus.slice("refused:".length);
    if (c.operation === "x24.classify") {
      const policy = JSON.parse(text);
      assert.deepEqual(validate(schema, policy, schema), [], `${c.caseId} policy passes the schema`);
      assert.equal(staticCode(policy), null, `${c.caseId} policy passes the static rules`);
      const vectors = c.inputArtifacts.find((a) => a.role === "vectors").json;
      if (c.expectedStatus === "success") assert.ok(vectors.every((v) => rolesOf(policy, v.text).length <= 1), `${c.caseId} vectors are unambiguous`);
      else {
        const refusal = c.expectedArtifacts.find((a) => a.role === "refusal").json;
        assert.equal(refusal.stage, "recognize", `${c.caseId} refuses at recognition`);
        assert.equal(rolesOf(policy, vectors[refusal.vector].text).length, 2, `${c.caseId} vector matches both roles`);
      }
    } else if (c.expectedStatus === "success") {
      const policy = JSON.parse(text);
      assert.deepEqual(validate(schema, policy, schema), [], `${c.caseId} schema`);
      assert.equal(staticCode(policy), null, `${c.caseId} static`);
      const expected = c.expectedArtifacts.find((a) => a.role === "policy").json;
      assert.equal(expected.canonicalSha256, canonicalSha256(policy));
      assert.equal(expected.id, policy.id);
    } else if (["profile-number", "profile-json-duplicate-key", "profile-unicode"].includes(code)) {
      assert.notEqual(text, JSON.stringify(x24("policy/policy-neutral-a.json")), `${c.caseId} lexical defect applied`);
    } else if (code === "profile-schema") {
      assert.notDeepEqual(validate(schema, JSON.parse(text), schema), [], `${c.caseId} has a schema defect`);
    } else {
      const policy = JSON.parse(text);
      assert.deepEqual(validate(schema, policy, schema), [], `${c.caseId} passes the schema`);
      assert.equal(staticCode(policy), code, `${c.caseId} static defect`);
    }
  }
  const overlap = JSON.parse(x24("cases/x24-S-024-overlapping-prefix-admitted.json").inputArtifacts.find((a) => a.role === "policy-text").json.text);
  const prefixes = overlap.classification.annotationRoles.map((r) => r.prefix);
  assert.ok(prefixes[1].startsWith(prefixes[0]) || prefixes[0].startsWith(prefixes[1]), "S-024 admits overlapping prefixes at load");
  const a = x24("policy/policy-neutral-a.json");
  const b = x24("policy/policy-neutral-b.json");
  for (const section of ["classification", "attachment", "metrics", "navigation", "presentation", "exportFacts"]) assert.notEqual(canonical(a[section]), canonical(b[section]), `neutral data sets differ in ${section}`);
});

// ------------------------------------------------------------------ classification vectors (DESIGN.md:152)
/** The ecma262-2024-start set of DESIGN.md:152: U+0009-000D, 0020, 00A0, 1680, 2000-200A, 2028, 2029, 202F, 205F, 3000, FEFF. */
const DESIGN_TRIM = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];
const CLASSIFY_VECTOR_CASES = ["A-001-classify", "A-002-kind-annotated", "A-003-kind-recolor", "A-004-kind-flat", "X-001-classify", "X-002-kind-annotated", "X-003-kind-recolor", "X-004-kind-flat"].map((s) => `cases/x24-${s}.json`);
/** Role of a text under a policy whose leading trim removes the code units of `set`: null, a role, or "ambiguous". */
function roleUnder(policy, text, set) {
  let i = 0;
  while (i < text.length && set.has(text.charCodeAt(i))) i++;
  const hits = policy.classification.annotationRoles.filter((r) => (r.trim === "ecma262-2024-start" ? text.slice(i) : text).startsWith(r.prefix));
  return hits.length > 1 ? "ambiguous" : (hits[0]?.role ?? null);
}

test("x24 seal: the classification vectors carry the DESIGN.md:152 code points and A-001 rejects each wrong trim of W-A1", () => {
  const hex = (c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`;
  const textsOf = (c) => c.inputArtifacts.find((a) => a.role === "vectors").json.map((v) => v.text);
  for (const path of CLASSIFY_VECTOR_CASES) {
    const texts = textsOf(x24(path));
    const leads = new Set(texts.filter((t) => t.length > 0).map((t) => t.codePointAt(0)));
    // U+00A0 (restored by the Unicode literal restoration) and U+FEFF are trimmed, U+0085 and U+200B are kept.
    for (const c of [0xa0, 0xfeff, 0x85, 0x200b]) assert.ok(leads.has(c), `${path}: a vector led by ${hex(c)}`);
    assert.ok([...leads].some((c) => c > 0xffff), `${path}: a vector led by an astral code point`);
    assert.ok(texts.includes(""), `${path}: the empty vector`);
  }
  const design = new Set(DESIGN_TRIM);
  const a1 = x24("cases/x24-A-001-classify.json");
  const policy = x24(a1.inputArtifacts.find((a) => a.role === "policy").path);
  const texts = textsOf(a1);
  const roles = a1.expectedArtifacts.find((a) => a.role === "results").json.map((r) => r.role);
  assert.deepEqual(texts.map((t) => roleUnder(policy, t, design)), roles, "A-001 roles under the DESIGN.md:152 set");
  const x1 = x24("cases/x24-X-001-classify.json");
  for (const [results, input] of [["results-a", "policy-a"], ["results-b", "policy-b"]]) {
    const p = x24(x1.inputArtifacts.find((a) => a.role === input).path);
    assert.deepEqual(textsOf(x1).map((t) => roleUnder(p, t, design)), x1.expectedArtifacts.find((a) => a.role === results).json.map((r) => r.role), `X-001 ${results} roles under the DESIGN.md:152 set`);
  }
  // The leading U+00A0 vector is recognised through the ecma262-2024-start trim of its role.
  const nbsp = texts.findIndex((t) => t.codePointAt(0) === 0xa0);
  assert.ok(nbsp >= 0 && roles[nbsp] !== null, "A-001 recognises its vector led by U+00A0");
  assert.equal(policy.classification.annotationRoles.find((r) => r.role === roles[nbsp]).trim, "ecma262-2024-start");
  const changed = (set) => texts.flatMap((t, i) => (roleUnder(policy, t, new Set(set)) !== roles[i] ? [i] : []));
  assert.deepEqual(changed(DESIGN_TRIM.filter((c) => c !== 0xa0)), [nbsp], "A-001 rejects a trim omitting U+00A0 at its restored vector");
  for (const [label, set] of [
    ["omitting U+FEFF", DESIGN_TRIM.filter((c) => c !== 0xfeff)],
    ["taking U+0085", [...DESIGN_TRIM, 0x85]],
    ["taking U+200B", [...DESIGN_TRIM, 0x200b]],
  ]) assert.ok(changed(set).length > 0, `A-001 rejects a trim ${label}`);
});

// ------------------------------------------------------------------ probes
test("x24 seal: the strengthened probes keep their original assertions", () => {
  const probe = read("tests/profile-externalization.probe.mjs").toString("utf8");
  const lines = probe.split("\n");
  const digests = lines.map(sha);
  const original = expectations.probe1.original;
  // Base lines 1-4 are the probe's first lines (digests of the base lines; derive/base-check.mjs compares the texts).
  for (const [n, digest] of Object.entries(original.headLines)) assert.equal(digests[Number(n) - 1], digest, `probe line ${n} is base line ${n}`);
  // The literal-free call is bound to base lines 5, 8 and 9 by row positions and line digests.
  const importRow = rowsById.get(original.import.template.find((p) => p.row).row);
  const callRow = rowsById.get(original.call.template.find((p) => p.row).row);
  const markerRow = rowsById.get(original.call.argument.concat.find((p) => typeof p !== "string").literal);
  assert.equal(ledger.files[original.probe].gitBlob, original.baseBlob, "base probe blob");
  for (const [r, line] of [[importRow, original.import.line], [callRow, original.call.line], [markerRow, original.call.line]]) {
    assert.ok(r.file === original.probe && r.line === line && r.form === "raw", `${r.id} sits in base probe line ${line}`);
    assert.equal(r.lineSha256, original.baseLines[String(line)], `${r.id} line digest`);
  }
  assert.equal(importRow.column, original.import.template[0].length, "imported name at its template position");
  assert.equal(callRow.column, original.call.template[0].length, "called name at its template position");
  assert.equal(markerRow.column, callRow.endColumn + original.call.template[2].length + 1, "marker opens the JSON argument");
  assert.equal(importRow.literal, callRow.literal, "the called function is the imported one");
  assert.equal(callRow.literal, original.call.function);
  assert.equal(markerRow.literal, original.call.argument.concat[0].sha256);
  assert.equal(expectations.probe1.functions.find((f) => f.role === "document").sha256, original.call.function);
  assert.equal(original.call.returns, false);
  const call = "  assert.equal(documentClassifier(textOf(original.argument)), false,";
  const literalFree = [
    "  const exportsByHash = new Map(Object.keys(annotations).map((name) => [sha256(name), annotations[name]]));",
    "  const original = expectations.probe1.original.call;",
    "  const documentClassifier = exportsByHash.get(original.function);",
    '  assert.equal(typeof documentClassifier, "function", "document classifier export");',
    call,
  ];
  for (const line of literalFree) assert.ok(lines.includes(line), line);
  assert.equal(digests[lines.indexOf(call) + 1], original.baseLines[String(original.message.line)], "base line 9 kept as the message line");
  assert.ok(probe.includes('import * as annotations from "../dist/internal/annotations.js";'), "classifier module import");
  // Probe 2: its original lines and the scope read are base lines, found by digest.
  const p2 = expectations.probe2.original;
  p2.baseLines.forEach(([first, last], k) => {
    const block = p2.lines[k];
    assert.equal(block.length, last - first + 1, `probe 2 lines ${first}-${last}`);
    assert.ok(digests.some((_, i) => block.every((h, j) => digests[i + j] === h)), `probe 2 original lines ${first}-${last} verbatim`);
  });
  assert.ok(digests.includes(p2.scopeLine.sha256), "probe 2 scope read verbatim");
  for (const name of [expectations.probe1.test, expectations.probe2.test]) assert.ok(probe.includes(`test("${name}"`), name);
  // The materialized base literals stay in the tracked tree: each keeps history-record rows that must stay present.
  const source = expectations.probe1.literalSource;
  const present = new Set(expectations.probe2.postMigrationPresence.present);
  assert.ok(expectations.probe2.postMigrationStatus["history-record"].every((s) => present.has(s)), "history records stay present");
  for (const id of source.rows) {
    const literal = rowsById.get(id)?.literal;
    assert.ok(source.historyRows[literal]?.length > 0, `${id} has history rows`);
    for (const h of source.historyRows[literal]) assert.ok(rowsById.get(h)?.literal === literal && rowsById.get(h).disposition === "history-record", `${h} history row of ${id}`);
  }
  assert.ok(probe.includes('git("ls-files", "-z")'), "the probe lists the index");
});

// ------------------------------------------------------------------ reseal receipts
const pinOf = (path) => {
  const bytes = read(path);
  return { bytes: bytes.length, sha256: sha(bytes) };
};

/** The value of a JSON file at a JSON pointer (~1 and ~0 unescaped), or undefined. */
const valueAt = (path, pointer) => pointer.split("/").slice(1).map((k) => k.replace(/~1/g, "/").replace(/~0/g, "~")).reduce((node, key) => node?.[key], json(path));

test("x24 seal: the reseal receipts chain the seals and record every changed file", () => {
  // The history-guard receipt is the frozen record of the integration micro-reseal; each later receipt pins the
  // earlier ones: the Unicode receipt pins the history-guard receipt, the P-006 allowance receipt pins both, the
  // I1 relocation receipt pins the three and the final spec rebind receipt pins the four.
  const guard = json(HISTORY_GUARD_RECEIPT);
  const unicode = json(UNICODE_RECEIPT);
  const allowance = json(ALLOWANCE_RECEIPT);
  const relocation = json(RELOCATION_RECEIPT);
  const receipt = json(RECEIPT);
  const guardPin = { receipt: HISTORY_GUARD_RECEIPT, ...pinOf(HISTORY_GUARD_RECEIPT), seal: SEAL_CHAIN[2], previousSeal: SEAL_CHAIN[1] };
  const unicodePin = { receipt: UNICODE_RECEIPT, ...pinOf(UNICODE_RECEIPT), seal: SEAL_CHAIN[3], previousSeal: SEAL_CHAIN[2] };
  const allowancePin = { receipt: ALLOWANCE_RECEIPT, ...pinOf(ALLOWANCE_RECEIPT), seal: SEAL_CHAIN[4], previousSeal: SEAL_CHAIN[3] };
  const relocationPin = { receipt: RELOCATION_RECEIPT, ...pinOf(RELOCATION_RECEIPT), seal: PREVIOUS_SEAL_SHA256, previousSeal: SEAL_CHAIN[4] };
  assert.equal(guard.format, "block-b-x24-history-guard/1");
  assert.equal(guard.previousSeal.sha256, SEAL_CHAIN[1]);
  assert.equal(guard.newSeal.sha256, SEAL_CHAIN[2]);
  assert.deepEqual(guard.guard.closedAllowance, ["07be09e", "45aa690"]);
  assert.equal(unicode.format, "block-b-x24-unicode-literals-fix/1");
  assert.deepEqual(unicode.history, [guardPin]);
  assert.deepEqual(unicode.previousSeal, guard.newSeal);
  assert.deepEqual([unicode.newSeal.path, unicode.newSeal.sha256], [`${ROOT}/seal.json`, SEAL_CHAIN[3]]);
  assert.equal(allowance.format, "block-b-x24-p006-selector-allowance/1");
  assert.deepEqual(allowance.history, [guardPin, unicodePin]);
  assert.deepEqual(allowance.previousSeal, unicode.newSeal);
  assert.deepEqual([allowance.newSeal.path, allowance.newSeal.sha256], [`${ROOT}/seal.json`, SEAL_CHAIN[4]]);
  assert.equal(relocation.format, "block-b-x24-i1-relocated-rows/1");
  assert.deepEqual(relocation.history, [guardPin, unicodePin, allowancePin]);
  assert.deepEqual(relocation.previousSeal, allowance.newSeal);
  assert.deepEqual([relocation.newSeal.path, relocation.newSeal.sha256], [`${ROOT}/seal.json`, PREVIOUS_SEAL_SHA256]);
  assert.equal(receipt.format, "block-b-x24-final-spec-rebind/1");
  assert.deepEqual(receipt.history, [guardPin, unicodePin, allowancePin, relocationPin]);
  assert.deepEqual(receipt.previousSeal, relocation.newSeal);
  assert.deepEqual(receipt.newSeal, { path: `${ROOT}/seal.json`, bytes: sealBytes.length, sha256: SEAL_SHA256 });
  const rounds = [unicode, allowance, relocation, receipt];
  for (const r of [guard, ...rounds]) {
    for (const list of [r.supersedesFiles, r.addedFiles]) assert.deepEqual(list.map((f) => f.path), [...list.map((f) => f.path)].sort(), "sorted file lists");
    const paths = [...r.supersedesFiles, ...r.addedFiles].map((f) => f.path);
    assert.equal(new Set(paths).size, paths.length, "each file once");
  }
  // Pins before the Unicode round: the files of its previous seal and the history-guard round, which agree.
  const pins = new Map(unicode.previousSealFiles.map((f) => [f.path, { bytes: f.bytes, sha256: f.sha256 }]));
  for (const f of [...guard.supersedesFiles.map((g) => ({ path: g.path, ...g.new })), ...guard.addedFiles]) {
    if (!pins.has(f.path)) pins.set(f.path, { bytes: f.bytes, sha256: f.sha256 });
    assert.deepEqual(pins.get(f.path), { bytes: f.bytes, sha256: f.sha256 }, `${f.path}: previous seal and history-guard receipt agree`);
  }
  // Each round in order: the files of its previous seal carry the pins after the earlier round, every old pin is the
  // pin before the round and seal.json goes from its previous seal to its new seal. A file no round supersedes keeps
  // its pin; the pins after the last round are the current bytes.
  rounds.forEach((r, k) => {
    if (k > 0) for (const f of r.previousSealFiles) assert.deepEqual(pins.get(f.path), { bytes: f.bytes, sha256: f.sha256 }, `${r.format} ${f.path}: previous seal file`);
    const superseded = new Map(r.supersedesFiles.map((f) => [f.path, f]));
    for (const f of r.supersedesFiles) assert.notDeepEqual(f.old, f.new, `${r.format} ${f.path}`);
    assert.deepEqual(superseded.get(`${ROOT}/seal.json`)?.old, { bytes: r.previousSeal.bytes, sha256: r.previousSeal.sha256 }, `${r.format} seal.json old pin is the previous seal`);
    assert.deepEqual(superseded.get(`${ROOT}/seal.json`)?.new, { bytes: r.newSeal.bytes, sha256: r.newSeal.sha256 }, `${r.format} seal.json new pin is the new seal`);
    for (const [path, pin] of pins) if (superseded.has(path)) assert.deepEqual(superseded.get(path).old, pin, `${r.format} ${path} old pin`);
    for (const f of r.supersedesFiles) pins.set(f.path, f.new);
    for (const f of r.addedFiles) pins.set(f.path, { bytes: f.bytes, sha256: f.sha256 });
  });
  for (const [path, pin] of pins) assert.deepEqual(pinOf(path), pin, `${path}: current bytes are its pin after the last round`);
  for (const e of sealed) assert.ok(pins.has(e.repoPath), `${e.repoPath} sealed before or added`);
  assert.deepEqual(receipt.previousSealFiles.map((f) => f.path), sealed.map((e) => e.repoPath), "the last round pins every file of its previous seal");
  // Every recorded value change is the value at its pointer after its round: the current value, or the old value of
  // a later round that records the same pointer.
  rounds.forEach((r, k) => {
    assert.ok(r.valueChanges.length > 0, `${r.format} value changes`);
    for (const v of r.valueChanges) {
      assert.notDeepEqual(v.old, v.new, `${v.path}#${v.pointer}`);
      const later = rounds.slice(k + 1).flatMap((l) => l.valueChanges).find((w) => w.path === v.path && w.pointer === v.pointer);
      assert.deepEqual(later ? later.old : valueAt(v.path, v.pointer), v.new, `${v.path}#${v.pointer}`);
    }
  });
});
