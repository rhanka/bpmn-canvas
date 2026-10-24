// Lot-3 seal integrity, comparator discrimination and golden independence.
// Asserts sealed data only: it never runs the authoring helper, a profile
// implementation or a codec. The pinned comparator module is sealed data too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
import { brandTokens } from "./helpers/brand.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const root = join(repo, "tests/fixtures/lot3-cn/expectations");
const fixtures = join(repo, "tests/fixtures");
// Root of trust: resealing requires changing this reviewed pin and the ledger.
const SEAL_SHA256 = "7bd2d206277c123ad027481a42969f013cd91ddc4a2bfaab0e529fbc7120cb3c";
const PREVIOUS_SEAL_SHA256 = "45560aaf66a7192b359c9877b7cd2959b00f50c5166b706ac7e93cc8971a2376";
const RECEIPT = "docs/design/receipts/block-b-lot3-l3tx-rebind.json";
// History: the literal restoration ledger, which resealed the unicode-names seal; the
// unicode-names ledger, which resealed the parity-sync seal; the parity-sync ledger,
// which resealed the seal fix round seal; and the seal fix round ledger, which
// superseded the first seal.
const LITERALS_RECEIPT = "docs/design/receipts/block-b-lot3-unicode-literals-fix.json";
const UNICODE_NAMES_SHA256 = "3d98de1dcdc79134e85a85531ae406d0b9633901cfc641ba6668be69ff10d0d1";
const UNICODE_NAMES_RECEIPT = "docs/design/receipts/block-b-lot3-unicode-names-fix.json";
const PARITY_SYNC_SHA256 = "1adc160ccd3c2567c5f45b1a1b92322a21f0dcccaf9676f3a7901b0642259934";
const PARITY_SYNC_RECEIPT = "docs/design/receipts/block-b-lot3-parity-sync.json";
const SEAL_FIX_SHA256 = "6b807ee2c219f614d0f434cb8568c8d15acc0cc425a11bfdaa5cf027d86e8b06";
const SEAL_FIX_RECEIPT = "docs/design/receipts/block-b-lot3-seal-fix.json";
const FIRST_SEAL_SHA256 = "986190925108a03e1996342638aaf9f3bcef9d37ddd6f3c6c5ae6246b0ab2904";
const PY_ROOT = "tests/profile_cn/expected/";
const DESIGN_SHA256 = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
const DESIGN_LINES = 1162;
const CASE_KEYS = ["caseId", "operation", "phase", "profileArtifact", "inputArtifacts", "expectedArtifacts", "expectedStatus", "comparatorIds"];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const comparatorsPath = join(root, "comparators/lot3-comparators.mjs");
const { compareCase, COMPARATORS, jcs } = await import(pathToFileURL(comparatorsPath).href);

function walk(dir, rel = "") {
  const files = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name), path = rel ? `${rel}/${name}` : name, stat = lstatSync(abs);
    assert.ok(!stat.isSymbolicLink(), `linked entry ${path}`);
    if (stat.isDirectory()) files.push(...walk(abs, path));
    else { assert.ok(stat.isFile() && stat.nlink === 1, `nonregular or linked entry ${path}`); files.push(path); }
  }
  return files;
}
const seal = () => json(join(root, "seal.json"));
function checkEntry(entry, bytes) {
  assert.equal(bytes.length, entry.bytes, `${entry.path} byte length`);
  assert.equal(sha(bytes), entry.sha256, `${entry.path} digest`);
}
function sealedEntries() {
  const s = seal();
  return [...s.files.map(e => ({ ...e, abs: join(root, e.path) })), ...s.documents.map(e => ({ ...e, abs: join(repo, e.path) })),
    ...s.inputs.map(e => ({ ...e, abs: join(repo, e.path) }))];
}
const cases = () => walk(join(root, "cases")).map(name => json(join(root, "cases", name)));

test("should pin the lot-3 seal and every sealed byte", () => {
  assert.equal(sha(readFileSync(join(root, "seal.json"))), SEAL_SHA256, "reviewed seal pin");
  const s = seal();
  assert.equal(s.format, "lot3-seal/2");
  assert.equal(s.designSha256, DESIGN_SHA256);
  assert.equal(s.authoring.previousSeal.sha256, PREVIOUS_SEAL_SHA256);
  assert.deepEqual(walk(root), [...s.files.map(e => e.path), "seal.json"].sort(), "missing or extra sealed file");
  for (const entry of sealedEntries()) checkEntry(entry, readFileSync(entry.abs));
});

test("should record the reseal in the ledger with old and new values", () => {
  const ledger = json(join(repo, RECEIPT));
  assert.equal(ledger.format, "block-b-lot3-reseal/1");
  assert.equal(ledger.previous.seal.sha256, PREVIOUS_SEAL_SHA256);
  assert.equal(ledger.current.seal.sha256, SEAL_SHA256);
  const sealBytes = readFileSync(join(root, "seal.json"));
  assert.deepEqual(ledger.current.seal, { bytes: sealBytes.length, sha256: sha(sealBytes) });
  const paths = [...ledger.supersedesFiles, ...ledger.addedFiles, ...ledger.removedFiles].map(e => e.path);
  assert.equal(new Set(paths).size, paths.length, "a path is listed once");
  for (const list of [ledger.supersedesFiles, ledger.addedFiles, ledger.removedFiles]) assert.deepEqual(list.map(e => e.path), list.map(e => e.path).sort());
  for (const entry of ledger.supersedesFiles) {
    assert.notDeepEqual(entry.old, entry.new, entry.path);
    checkEntry({ path: entry.path, ...entry.new }, readFileSync(join(repo, entry.path)));
    const before = ledger.previous.files.find(f => f.path === entry.path);
    assert.deepEqual(entry.old, before ? { bytes: before.bytes, sha256: before.sha256 } : ledger.previous.seal, entry.path);
  }
  for (const entry of ledger.addedFiles) checkEntry(entry, readFileSync(join(repo, entry.path)));
  for (const entry of ledger.removedFiles) assert.ok(!existsSync(join(repo, entry.path)), `${entry.path} still present`);
  assert.ok(ledger.supersedesFiles.some(e => e.path === "tests/fixtures/lot3-cn/expectations/seal.json"));
  // Every file of the previous seal is accounted for.
  for (const f of ledger.previous.files) {
    const now = existsSync(join(repo, f.path));
    assert.ok(now ? ledger.supersedesFiles.some(e => e.path === f.path) || sha(readFileSync(join(repo, f.path))) === f.sha256 : ledger.removedFiles.some(e => e.path === f.path), f.path);
  }
});

test("should list the old and new value of every resealed unicode-names sibling", () => {
  const [change, ...others] = json(join(repo, UNICODE_NAMES_RECEIPT)).valueChanges;
  assert.equal(others.length, 0, "the unicode-names fix changes one case");
  assert.equal(change.caseId, "l3-id-unicode-names");
  const vector = cases().find(c => c.caseId === change.caseId);
  const result = vector.expectedArtifacts.find(a => a.role === "result").json;
  assert.deepEqual(change.siblings.map(s => s.new.id), result.payload.tree.rootElements[0].flowElements.map(n => n.id));
  assert.equal(change.revisions.result.new, result.revision);
  assert.equal(change.revisions.input.new, vector.inputArtifacts.find(a => a.role === "envelope").json.semanticRevision);
  // The superseded expectation gave three byte-identical siblings one shared ID; now every ID differs.
  assert.equal(new Set(change.siblings.slice(1, 4).map(s => s.old.id)).size, 1);
  assert.equal(new Set(change.siblings.map(s => s.new.id)).size, change.siblings.length);
});

// Unicode literal restoration: values the seal fix round rewrite of the helper had folded
// (U+E000 removed, U+00A0 and U+2028 replaced by a space), restored from the first seal.
const shown = s => [...s].map(c => { const cp = c.codePointAt(0); return cp >= 0x20 && cp <= 0x7e ? c : `\\u{${cp.toString(16)}}`; }).join("");
const nodeOf = (tree, id) => { let found; const visit = n => { if (Array.isArray(n)) n.forEach(visit); else if (n && typeof n === "object") { if (n.id === id) found = n; Object.values(n).forEach(visit); } }; visit(tree); return found; };
const roleOf = (vector, r) => [...vector.inputArtifacts, ...vector.expectedArtifacts].find(a => a.role === r);
const LITERAL_CASES = ["l3-id-stable-vectors", "l3-c-preserve", "l3-n-unicode-names", "l3-fp-n-unicode-names", "l3-mix-n-unicode-names-js-py-js", "l3-mix-n-unicode-names-py-js-py"];

test("should list the old and new value of every restored Unicode literal and of its derived values", () => {
  const changes = json(join(repo, LITERALS_RECEIPT)).valueChanges;
  assert.deepEqual(changes.map(c => c.caseId), LITERAL_CASES);
  for (const change of changes) {
    const vector = byId(change.caseId);
    if (change.allocations) {
      const allocations = roleOf(vector, "allocations").json, ids = roleOf(vector, "ids").json;
      assert.deepEqual(change.allocations.map(a => a.new), allocations.map((a, i) => ({ key: shown(a.key), owner: a.owner, slot: a.slot, id: ids[i] })));
      allocations.forEach((a, i) => assert.equal(ids[i], `g_${sha(jcs(["profile-mechanism/1", a.owner, a.slot, a.key]))}`, `stable-id/1 of ${shown(a.key)}`));
      assert.equal(new Set(ids).size, ids.length, "every key keeps its own ID");
      for (const a of change.allocations.filter(x => x.origin !== "unchanged")) assert.notEqual(a.old?.id, a.new.id, `index ${a.index}`);
      continue;
    }
    const input = roleOf(vector, "envelope").json;
    const result = roleOf(vector, "result")?.json ?? roleOf(vector, "hop-results").json[0];
    for (const l of change.literals) {
      const node = nodeOf(input.tree, l.elementId);
      assert.equal(shown(l.property === "name" ? node.name : node.documentation[0].text), l.new, `${change.caseId} ${l.elementId}`);
      assert.notEqual(l.old, l.new, `${change.caseId} ${l.elementId}`);
    }
    assert.equal(change.revisions.input.new, input.semanticRevision);
    assert.equal(change.revisions.input.new, sha(jcs({ tree: input.tree, profileIdentity: input.profileIdentity, bindings: input.bindings })), "semanticRevision = H({tree, profileIdentity, bindings})");
    assert.equal(change.revisions.result.new, result.revision);
    for (const side of ["input", "result"]) assert.notEqual(change.revisions[side].old, change.revisions[side].new);
    const transport = roleOf(vector, "transport-bytes");
    assert.equal(Boolean(change.transport), Boolean(transport), change.caseId);
    if (transport) {
      assert.deepEqual(change.transport.new, { bytes: Buffer.byteLength(transport.text, "utf8"), sha256: transport.sha256 });
      assert.equal(transport.text, jcs(result.payload.envelope), "transport bytes are the JCS of the N(x) envelope");
      assert.notEqual(change.transport.old.sha256, change.transport.new.sha256);
    }
  }
});

test("should keep the restored code points and fail every named normalization (DESIGN L260, L387, L967)", () => {
  const cps = s => [...s].map(c => c.codePointAt(0));
  const carries = (s, list) => list.every(cp => cps(s).includes(cp));
  const PY_WS = new RegExp("^[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u{1680}\\u{2000}-\\u{200a}\\u{2028}\\u{2029}\\u{202f}\\u{205f}\\u{3000}]+|[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u{1680}\\u{2000}-\\u{200a}\\u{2028}\\u{2029}\\u{202f}\\u{205f}\\u{3000}]+$", "gu");
  const WRONG = {
    NFC: s => s.normalize("NFC"), NFD: s => s.normalize("NFD"), NFKC: s => s.normalize("NFKC"), trim: s => s.trim(), strip: s => s.replace(PY_WS, ""),
    "NBSP to space": s => s.replace(/\u{a0}/gu, " "), "CRLF to LF": s => s.replace(/\r\n/g, "\n"),
    "line split": s => s.split(/\r\n|[\n\v\f\r\x1c-\x1e\x85\u{2028}\u{2029}]/u).join("\n"), "private use dropped": s => s.replace(/[\u{e000}-\u{f8ff}]/gu, ""),
    "astral replaced": s => s.replace(/[\u{10000}-\u{10ffff}]/gu, "\u{fffd}"),
  };
  // l3-id-stable-vectors: each named wrong allocator changes the sealed ID list.
  const vectors = byId("l3-id-stable-vectors"), allocations = roleOf(vectors, "allocations").json, ids = roleOf(vectors, "ids").json;
  for (const key of ["cl\u{e9}-\u{e000}", "cle\u{301}-\u{e000}", "a\u{a0}b"]) assert.ok(allocations.some(a => a.key === key), shown(key));
  const idsUnder = f => allocations.map(a => `g_${sha(jcs(["profile-mechanism/1", a.owner, a.slot, f(a.key)]))}`);
  for (const label of ["NFC", "NFD", "NFKC", "trim", "strip"]) assert.notDeepEqual(idsUnder(WRONG[label]), ids, `stable vectors: ${label}`);
  // Named and documentation texts of the C and N inputs.
  const texts = vector => { const out = []; JSON.stringify(roleOf(vector, "envelope").json.tree, (k, v) => { if ((k === "name" || k === "text") && typeof v === "string") out.push(v); return v; }); return out; };
  const rewritten = (vector, label) => texts(vector).some(s => WRONG[label](s) !== s);
  const preserve = byId("l3-c-preserve");
  assert.ok(texts(preserve).some(s => carries(s, [0xa0, 0x0d, 0x0a, 0x09])), "Documentation NBSP, CRLF and TAB");
  for (const label of ["NFKC", "trim", "strip", "NBSP to space", "CRLF to LF", "line split"]) assert.ok(rewritten(preserve, label), `l3-c-preserve: ${label}`);
  for (const caseId of LITERAL_CASES.slice(2)) {
    const vector = byId(caseId), tree = roleOf(vector, "envelope").json.tree;
    assert.ok(carries(nodeOf(tree, "Process_A").name, [0x10000, 0xe000]) && carries(nodeOf(tree, "DataStore_U").name, [0xe000, 0x10000]), `${caseId}: U+E000/U+10000`);
    assert.ok(carries(nodeOf(tree, "Start_U").name, [0x0a, 0x0d, 0x2028]) && carries(nodeOf(tree, "Task_U").name, [0xf4, 0xa0]), `${caseId}: LF/CRLF/U+2028 and NBSP`);
    assert.ok(carries(nodeOf(tree, "DataStoreReference_U").name, [0xe9, 0x65, 0x301, 0x1f4d8]), `${caseId}: precomposed and decomposed e`);
    for (const label of Object.keys(WRONG)) assert.ok(rewritten(vector, label), `${caseId}: ${label}`);
    const transport = roleOf(vector, "transport-bytes");
    if (transport) for (const cp of [0xe000, 0xa0, 0x2028, 0x301]) assert.ok(cps(transport.text).includes(cp), `${caseId}: raw U+${cp.toString(16)} in the transport bytes`);
  }
});

test("should chain the l3-tx ledger to the literal, unicode-names, parity-sync and seal fix round ledgers and the first seal", () => {
  const ledger = json(join(repo, RECEIPT)), literals = json(join(repo, LITERALS_RECEIPT)), names = json(join(repo, UNICODE_NAMES_RECEIPT)), sync = json(join(repo, PARITY_SYNC_RECEIPT)), history = json(join(repo, SEAL_FIX_RECEIPT));
  for (const earlier of [literals, names, sync, history]) assert.equal(earlier.format, "block-b-lot3-reseal/1");
  assert.equal(history.previous.seal.sha256, FIRST_SEAL_SHA256);
  assert.equal(history.current.seal.sha256, SEAL_FIX_SHA256);
  assert.equal(sync.current.seal.sha256, PARITY_SYNC_SHA256);
  assert.equal(names.current.seal.sha256, UNICODE_NAMES_SHA256);
  assert.equal(literals.current.seal.sha256, PREVIOUS_SEAL_SHA256);
  assert.deepEqual(sync.previous.seal, history.current.seal, "the parity sync reseals the seal fix round seal");
  assert.deepEqual(names.previous.seal, sync.current.seal, "the unicode-names fix reseals the parity sync seal");
  assert.deepEqual(literals.previous.seal, names.current.seal, "the literal restoration reseals the unicode-names fix seal");
  assert.deepEqual(ledger.previous.seal, literals.current.seal, "the l3-tx rebind reseals the literal restoration seal");
  assert.deepEqual(sync.history, [{ ledger: SEAL_FIX_RECEIPT, seal: { sha256: SEAL_FIX_SHA256 }, previousSeal: { sha256: FIRST_SEAL_SHA256 } }]);
  assert.deepEqual(names.history, [{ ledger: PARITY_SYNC_RECEIPT, seal: { sha256: PARITY_SYNC_SHA256 }, previousSeal: { sha256: SEAL_FIX_SHA256 } }, ...sync.history]);
  assert.deepEqual(literals.history, [{ ledger: UNICODE_NAMES_RECEIPT, seal: { sha256: UNICODE_NAMES_SHA256 }, previousSeal: { sha256: PARITY_SYNC_SHA256 } }, ...names.history]);
  assert.deepEqual(ledger.history, [{ ledger: LITERALS_RECEIPT, seal: { sha256: PREVIOUS_SEAL_SHA256 }, previousSeal: { sha256: UNICODE_NAMES_SHA256 } }, ...literals.history]);
  assert.ok(history.removedFiles.some(e => e.path === "tests/profile-lot3-admission.test.mjs"), "the library-confirmed admission test is withdrawn");
  assert.ok(!existsSync(join(repo, "tests/profile-lot3-admission.test.mjs")));
  // The previous pins of each round are the pins the round before it produced.
  for (const [later, earlier] of [[ledger, literals], [literals, names], [names, sync], [sync, history]]) {
    const produced = new Map([...earlier.supersedesFiles.map(e => [e.path, e.new]), ...earlier.addedFiles.map(e => [e.path, { bytes: e.bytes, sha256: e.sha256 }])]);
    for (const f of later.previous.files) if (produced.has(f.path)) assert.deepEqual({ bytes: f.bytes, sha256: f.sha256 }, produced.get(f.path), f.path);
  }
});

// l3-tx real-canvas rebind: the ledger lists the previous and current value of every changed
// trace or script member, the UNSEALED pointers removed and added and the changed texts.
const TX_CASES = () => cases().filter(c => c.caseId.startsWith("l3-tx-")).map(c => c.caseId).sort();
const ABSENT = "absent";
const valueAt = (doc, pointer) => { const v = lookup(doc, pointer); return v === undefined ? ABSENT : v; };

test("should list the old and new value of every rebound l3-tx member and the coordinate decision", () => {
  const ledger = json(join(repo, RECEIPT)), index = json(join(root, "index.json"));
  assert.deepEqual(ledger.valueChanges.map(c => c.caseId).sort(), TX_CASES(), "every l3-tx case, and only those, changes");
  for (const change of ledger.valueChanges) {
    const vector = byId(change.caseId);
    const docs = { trace: vector.expectedArtifacts.find(a => a.role === "trace").json, script: vector.commandArtifact.json.steps };
    assert.ok(change.members.length > 0, change.caseId);
    for (const m of change.members) {
      assert.ok(["trace", "script"].includes(m.artifact) && /^DESIGN L\d+/.test(m.basis), `${change.caseId} ${m.pointer}`);
      assert.deepEqual(valueAt(docs[m.artifact], m.pointer), m.new, `${change.caseId} ${m.artifact}${m.pointer}: new value is the sealed one`);
      assert.notDeepEqual(m.old, m.new, `${change.caseId} ${m.artifact}${m.pointer}`);
    }
    // The load or snapshot event of step 2 carries the report of its own result, by relation.
    assert.ok(change.members.some(m => m.pointer === "/1/events/L1/0/report" && m.new.$same?.step === 2 && m.new.$same.pointer === "/result/report"), change.caseId);
    const unsealed = vector.expectedArtifacts.find(a => a.role === "unsealed").json.map(u => u.pointer);
    for (const p of change.unsealed.added) assert.ok(unsealed.includes(p), `${change.caseId} added ${p}`);
    for (const p of change.unsealed.removed) assert.ok(!unsealed.includes(p), `${change.caseId} removed ${p}`);
    assert.ok(change.unsealed.removed.includes("/1/events/L1/0/report"), `${change.caseId}: the event report is no longer UNSEALED`);
    if (change.discriminates) {
      assert.equal(change.discriminates.new.sha256, sha(index.cases.find(c => c.caseId === change.caseId).discriminates), change.caseId);
      assert.notEqual(change.discriminates.old.sha256, change.discriminates.new.sha256, change.caseId);
    }
  }
  assert.deepEqual(ledger.valueChanges.filter(c => c.discriminates).map(c => c.caseId).sort(),
    ["l3-tx-batch-one-entry", "l3-tx-guard-recovery", "l3-tx-incremental-draft", "l3-tx-io-set-selection-required", "l3-tx-reentrant-refused"]);
  // Changed UNSEALED reasons: the new texts are the ones the cases carry, the removed one is gone.
  const reasons = new Set(cases().flatMap(c => (c.expectedArtifacts.find(a => a.role === "unsealed")?.json ?? []).map(u => u.reason)));
  assert.deepEqual(ledger.unsealedReasons.map(r => r.key), ["layout", "layoutGeometry", "layoutPages", "report"]);
  for (const r of ledger.unsealedReasons) {
    assert.notEqual(r.old, r.new, r.key);
    if (r.new !== ABSENT) assert.ok(reasons.has(r.new), `${r.key}: new reason sealed`);
    if (r.old !== ABSENT) assert.ok(!reasons.has(r.old), `${r.key}: old reason gone`);
  }
  const [decision, ...more] = ledger.decisions;
  assert.equal(more.length, 0);
  assert.equal(decision.id, "transaction-change-coordinates");
  for (const line of ["L629", "L632-L633", "L751", "L755", "L766"]) assert.ok(decision.design.some(d => d.startsWith(line)), line);
});

test("should reject every output of the former transaction double and staged-tree coordinates", () => {
  const rejects = (caseId, mutate, label) => {
    const vector = byId(caseId), actual = idealActual(vector);
    mutate(actual);
    const outcome = compareCase(vector, actual);
    assert.equal(outcome.ok, false, `${caseId}: ${label}`);
  };
  const accepts = (caseId, mutate, label) => {
    const vector = byId(caseId), actual = idealActual(vector);
    mutate(actual);
    assert.deepEqual(compareCase(vector, actual).failures, [], `${caseId}: ${label}`);
  };
  // Change events without the report of their result (DESIGN L606, L633): every l3-tx case.
  for (const caseId of TX_CASES()) rejects(caseId, a => { a.trace[1].events.L1[0].report = null; }, "load or snapshot event without its report");
  rejects("l3-tx-batch-one-entry", a => { a.trace[5].events.L1[0].report = null; }, "undo event without its report");
  rejects("l3-tx-theme-history", a => { a.trace[3].events.L1[0].report = SYNTH_REPORT("applyCommands"); }, "theme event with another report than its result");
  accepts("l3-tx-cancelled", a => { const r = { ...SYNTH_REPORT("setDefinitions"), inputRevision: "0".repeat(64), outputRevision: "0".repeat(64) }; a.trace[1].result.report = r; a.trace[1].events.L1[0].report = clone(r); },
    "load report content is a source gap, the event carries the same report");
  // Placeholder presentations instead of a Layout/1 record (DESIGN L610, L667).
  const snapshots = { "l3-tx-batch-one-entry": [2, 4], "l3-tx-incremental-draft": [6, 8], "l3-tx-io-set-explicit-selection": [2, 4], "l3-tx-corrected-noop": [2], "l3-tx-theme-history": [4], "l3-tx-delete-support-undo": [3] };
  for (const [caseId, steps] of Object.entries(snapshots)) {
    for (const i of steps) {
      rejects(caseId, a => { a.trace[i].result.payload.presentation.layout = "unsealed"; }, `placeholder layout at trace ${i}`);
      rejects(caseId, a => { delete a.trace[i].result.payload.presentation.layout.pages; }, `Layout/1 pages absent at trace ${i}`);
      rejects(caseId, a => { a.trace[i].result.payload.presentation.layout.layoutVersion = "2"; }, `layoutVersion at trace ${i}`);
    }
    // Other canvas-computed pages are accepted when every step that restores the same snapshot carries them too.
    accepts(caseId, a => {
      for (const r of a.trace) {
        const layout = r.result?.payload?.presentation?.layout;
        if (layout && jcs(layout.pages) === jcs(SYNTH_PAGES)) layout.pages = [{ pageId: "page_other", name: "Other", order: 0, semanticRootId: "Collaboration_T", bounds: { x: 0, y: 0, width: 2, height: 2 } }];
      }
    }, "pages are UNSEALED");
  }
  // A re-entrancy outcome written without a nested call (DESIGN L604, L635, L735).
  rejects("l3-tx-reentrant-refused", a => { a.trace[2].injected = { status: "refused", code: "transaction-reentrant" }; }, "bare re-entrancy record");
  rejects("l3-tx-reentrant-refused", a => { a.trace[2].injected.code = "operation-error"; }, "nested call refused for another reason");
  rejects("l3-tx-reentrant-refused", a => { a.trace[2].result.payload.envelope.tree.rootElements[0].flowElements.push({ $type: "bpmn:Task", id: "g_nested", name: "Second", incoming: [], outgoing: [] }); }, "nested command committed");
  rejects("l3-tx-guard-recovery", a => { delete a.trace[2].injected; }, "throw without entering applying");
  rejects("l3-tx-guard-recovery", a => { a.trace[3].result = clone(a.trace[2].injected); a.trace[3].events = { L1: [] }; a.trace[3].history = { past: 0, future: 0 }; }, "guard left in applying");
  // A refusal by entry name: the single-set control must succeed (DESIGN L547).
  rejects("l3-tx-io-set-selection-required", a => { a.trace[5].result = clone(a.trace[2].result); a.trace[5].events = { L1: [] }; a.trace[5].history = { past: 0, future: 0 }; }, "refusal without running C on one set");
  rejects("l3-tx-io-set-selection-required", a => { a.trace[5].result.payload.envelope.tree.rootElements[0].ioSpecification.inputSets[0].dataInputRefs.pop(); }, "single set left uncovered");
  // Staged-tree coordinates of the C writes on created tasks (DESIGN L751, L755, L766).
  const staged = a => {
    for (const report of [a.trace[3].result.report, a.trace[3].events.L1[0].report]) for (const e of report.entries.filter(x => x.stage === "complete")) {
      e.source = { domain: "tree", pointer: e.result.pointer, targetId: e.result.targetId, provenance: "exact" };
      e.result.provenance = "exact";
    }
  };
  rejects("l3-tx-batch-one-entry", staged, "C writes on created tasks at staged-tree coordinates");
});

test("should fail on a one-byte change in any sealed file", () => {
  const entries = [...sealedEntries(), { path: "seal.json", abs: join(root, "seal.json"), bytes: readFileSync(join(root, "seal.json")).length, sha256: SEAL_SHA256 }];
  for (const entry of entries) {
    const bytes = readFileSync(entry.abs);
    const positions = new Set([0, bytes.length - 1, Math.floor(bytes.length / 2)]);
    for (let k = 1; k <= 8; k++) positions.add(Math.floor((bytes.length * k) / 9));
    for (const at of positions) {
      const damaged = Buffer.from(bytes); damaged[at] ^= 1;
      assert.throws(() => checkEntry(entry, damaged), undefined, `${entry.path} byte ${at}`);
    }
  }
});

test("should pin the comparator executable in the manifest and the seal", () => {
  const manifest = json(join(root, "manifest.json"));
  const digest = sha(readFileSync(comparatorsPath));
  assert.equal(manifest.executables.length, 1);
  assert.equal(manifest.executables[0].file, "lot3-cn/expectations/comparators/lot3-comparators.mjs");
  assert.equal(manifest.executables[0].sha256, digest);
  assert.equal(manifest.executables[0].tolerance, "zero");
  assert.deepEqual(seal().comparators, [{ path: "comparators/lot3-comparators.mjs", sha256: digest }]);
  const ids = new Set(manifest.comparators.map(c => c.id));
  assert.equal(ids.size, manifest.comparators.length);
  for (const c of manifest.comparators) {
    assert.equal(c.executable.sha256, digest, c.id);
    assert.equal(c.tolerance, "zero", c.id);
    assert.equal(typeof COMPARATORS[c.id], "function", `${c.id} executable`);
    assert.ok(c.note.length > 40, c.id);
  }
  for (const vector of cases()) for (const id of vector.comparatorIds) assert.ok(ids.has(id), `${vector.caseId} ${id}`);
  assert.equal(manifest.parentManifests[0].sha256, sha(readFileSync(join(fixtures, manifest.parentManifests[0].path))));
});

test("should keep every case in the closed profile-parity-corpus/1 shape", () => {
  const manifest = json(join(root, "manifest.json"));
  assert.equal(manifest.format, "profile-parity-corpus/1");
  assert.equal(manifest.pathBase, "tests/fixtures/");
  const files = walk(join(root, "cases")).map(name => `lot3-cn/expectations/cases/${name}`);
  assert.deepEqual(Object.keys(manifest.files).sort(), files.sort());
  for (const p of manifest.profiles) assert.equal(sha(readFileSync(join(fixtures, p.path))), p.sha256, p.path);
  const ids = new Set();
  for (const path of files) {
    const bytes = readFileSync(join(fixtures, path));
    assert.equal(sha(bytes), manifest.files[path], path);
    const vector = JSON.parse(bytes);
    assert.deepEqual(Object.keys(vector).filter(k => k !== "commandArtifact").sort(), [...CASE_KEYS].sort(), path);
    assert.equal(`lot3-cn/expectations/cases/${vector.caseId}.json`, path);
    assert.ok(!ids.has(vector.caseId)); ids.add(vector.caseId);
    assert.match(vector.expectedStatus, /^ok$|^refused:[a-z][a-z0-9-]*$/, path);
    assert.ok(vector.expectedArtifacts.some(a => a.role !== "unsealed"), `${path} empty expectation`);
    for (const a of [...vector.inputArtifacts, ...vector.expectedArtifacts, ...(vector.commandArtifact ? [vector.commandArtifact] : [])]) {
      assert.equal(typeof a.role, "string", path);
      const keys = Object.keys(a).sort();
      assert.ok(JSON.stringify(keys) === JSON.stringify(["json", "role"]) || JSON.stringify(keys) === JSON.stringify(["role", "sha256", "text"]), `${path} artifact ${a.role}`);
      if (a.text !== undefined) assert.equal(sha(Buffer.from(a.text, "utf8")), a.sha256, `${path} text artifact ${a.role}`);
    }
    if (vector.profileArtifact !== null) {
      assert.deepEqual(Object.keys(vector.profileArtifact).sort(), ["path", "sha256"], path);
      assert.equal(sha(readFileSync(join(fixtures, vector.profileArtifact.path))), vector.profileArtifact.sha256, path);
    }
    // A vendored compile list names each profile file as an input record {path, sha256}.
    for (const a of vector.inputArtifacts.filter(a => a.role === "profile")) {
      assert.deepEqual(Object.keys(a.json).sort(), ["path", "sha256"], `${path} profile input`);
      assert.equal(sha(readFileSync(join(fixtures, a.json.path))), a.json.sha256, `${path} profile input ${a.json.path}`);
    }
    const unsealed = vector.expectedArtifacts.find(a => a.role === "unsealed");
    if (unsealed) for (const u of unsealed.json) {
      assert.deepEqual(Object.keys(u).sort(), ["artifact", "pointer", "reason"], path);
      assert.ok(vector.expectedArtifacts.some(a => a.role === u.artifact.split("/")[0]), `${path} unsealed target ${u.artifact}`);
      assert.ok(u.reason.length > 40, `${path} unsealed reason`);
    }
    if (vector.expectedStatus.startsWith("refused:")) {
      // The refused step: the result, else (vendored cases) apply, plan or compile.
      const result = ["result", "apply", "plan", "compile"].map(role => vector.expectedArtifacts.find(a => a.role === role)).find(Boolean);
      assert.equal(result.json.code, vector.expectedStatus.slice("refused:".length), path);
      if (Object.hasOwn(result.json, "report")) assert.deepEqual(result.json.diagnostics, result.json.report.entries, `${path} diagnostics`);
      else assert.deepEqual(Object.keys(result.json).sort(), ["code", "diagnostics", "status"], `${path} PureResult refusal`);
      if (vector.inputArtifacts.some(a => a.role === "envelope" || a.role === "source")) assert.ok(vector.expectedArtifacts.some(a => a.role === "caller-state"), `${path} caller state`);
    }
  }
  assert.ok(ids.size >= 150);
});

// ---------------------------------------------------------------- ideal actual values and comparator discrimination
const SYNTH_REPORT = operation => ({ reportVersion: "2", operation, entries: [], rawStandardFindings: [], idMap: [], artifacts: [] });
const SYNTH_PAGES = [{ pageId: "page_canvas", name: "Canvas", order: 0, semanticRootId: "Collaboration_T", bounds: { x: 0, y: 0, width: 1, height: 1 } }];
const lookup = (value, pointer) => {
  let cur = value;
  for (const raw of pointer.slice(1).split("/")) { const k = raw.replace(/~1/g, "/").replace(/~0/g, "~"); if (cur === null || typeof cur !== "object" || !(k in cur)) return undefined; cur = cur[k]; }
  return cur;
};
const setAt = (value, pointer, replacement) => {
  const keys = pointer.slice(1).split("/").map(k => k.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = value; for (const k of keys.slice(0, -1)) cur = cur[k]; cur[keys.at(-1)] = replacement;
};
// Concrete values for UNSEALED members so that the ideal trace has real shapes.
function synthetic(pointer, record) {
  const key = pointer.split("/").at(-1);
  if (key === "report") return SYNTH_REPORT(record.result?.operation ?? "event");
  if (key === "viewRevision") return sha(`view:${pointer}:${record.step}`);
  if (key === "layout") return { layoutVersion: "1", pages: [{ pageId: "page_canvas", name: "Canvas", order: 0, semanticRootId: "Collaboration_T", bounds: { x: 0, y: 0, width: 1, height: 1 } }], geometry: [] };
  if (key === "pages") return clone(SYNTH_PAGES);
  if (key === "geometry") return [];
  if (key === "selection") return [];
  if (key === "waypoints") return [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  if (key === "bounds") return { x: 0, y: 0, width: 1, height: 0 };
  if (key === "activePageId") return "page_canvas";
  if (key === "historyEpoch") return 1;
  if (key === "subscriptionId") return `sub-${record.step}`;
  if (key === "transactionId") return `tx-synthetic-${record.step}`;
  if (/^[0-9]+$/.test(key)) return { code: "synthetic/notice", severity: "info", classification: "repairable", stage: "normalize", ruleId: "synthetic", messageKey: "synthetic.notice", disposition: "corrected",
    source: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" }, result: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" }, beforePresent: false, afterPresent: false };
  return sha(`synthetic:${pointer}`);
}
function resolveTrace(vector) {
  const expected = vector.expectedArtifacts.find(a => a.role === "trace").json;
  const unsealed = (vector.expectedArtifacts.find(a => a.role === "unsealed")?.json ?? []).filter(u => u.artifact === "trace");
  const actual = [];
  const resolve = (node, step) => {
    if (Array.isArray(node)) return node.map(v => resolve(v, step));
    if (!node || typeof node !== "object") return node;
    if (node.$same) { const target = actual.find(r => r.step === node.$same.step) ?? step; return clone(lookup(target, node.$same.pointer)); }
    if (node.$differs) return sha(`differs:${JSON.stringify(node.$differs)}`);
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolve(v, step)]));
  };
  expected.forEach((record, i) => {
    const work = clone(record);
    for (const u of unsealed) if (u.pointer.startsWith(`/${i}/`)) { const local = u.pointer.slice(`/${i}`.length); setAt(work, local, synthetic(local, work)); }
    const partial = { ...work, events: undefined };
    const current = { step: work.step };
    actual.push(current);
    Object.assign(current, resolve(partial, current));
    current.events = resolve(work.events, current);
    if (current.events === undefined) delete current.events;
  });
  return actual;
}
// The ideal second run of a complete/normalize success on its own output: same
// envelope (and placements), no entry, baseRevision = revision = the first revision.
function idealFixedPoint(first, operation) {
  const rev = first.revision;
  const report = { reportVersion: "2", operation, sourceIdentity: clone(first.profileIdentity), targetIdentity: clone(first.profileIdentity), inputRevision: rev, outputRevision: rev,
    entries: [], rawStandardFindings: [], idMap: [], artifacts: [] };
  const payload = operation === "complete" ? clone(first.payload) : { envelope: clone(first.payload.envelope), placements: clone(first.payload.placements), report: clone(report) };
  return { status: "ok", operation, profileIdentity: clone(first.profileIdentity), baseRevision: rev, revision: rev, report, payload };
}
function idealActual(vector) {
  const role = r => vector.expectedArtifacts.find(a => a.role === r);
  const actual = {};
  if (role("result")) actual.result = clone(role("result").json);
  if (role("caller-state")) actual["caller-state"] = role("caller-state").text ?? clone(role("caller-state").json);
  if (role("ids")) actual.ids = clone(role("ids").json);
  if (role("value")) actual.value = clone(role("value").json);
  if (role("transport")) actual.transport = { hops: role("transport").json.hops.map((h, i) => ({ runtime: h.runtime, bytes: role("transport-bytes").text, result: clone(role("hop-results").json[i]) })) };
  if (role("trace")) actual.trace = resolveTrace(vector);
  // Vendored Python roles; an {"$unsealed": reason} marker stands for an opaque member.
  const opaque = value => Array.isArray(value) ? value.map(opaque) : value && typeof value === "object"
    ? (Object.keys(value).length === 1 && typeof value.$unsealed === "string" ? { compiled: `opaque ${value.$unsealed}` } : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, opaque(v)])))
    : value;
  for (const r of ["plan", "apply", "compile", "compiled-identity", "compiled-identities", "placements"]) if (role(r)) actual[r] = opaque(clone(role(r).json));
  if (vector.comparatorIds.includes("fixed-point/lot3")) actual["fixed-point"] = idealFixedPoint(role("result").json, vector.operation);
  return actual;
}
const byId = id => cases().find(c => c.caseId === id);
// stable-id/1 of an ID-missing Process_A task born with a given duplicate ordinal (DESIGN L278-L281, L292).
const birthId = (raw, ordinal) => `g_${sha(jcs(["profile-mechanism/1", "Process_A", "bpmn:Process.flowElements", jcs([sha(jcs(raw)), ordinal])]))}`;
const unicodeRaws = () => byId("l3-id-unicode-names").inputArtifacts.find(a => a.role === "envelope").json.tree.rootElements[0].flowElements;
// The same result with every allocated ID re-derived under another ordinal rule.
function withOrdinals(result, ordinalOf) {
  const from = result.payload.tree.rootElements[0].flowElements.map(n => n.id), to = unicodeRaws().map((raw, i) => birthId(raw, ordinalOf(i)));
  return JSON.parse(from.reduce((text, id, i) => text.split(id).join(to[i]), JSON.stringify(result)));
}

test("should accept every sealed case under its own pinned comparators with ideal actual values", () => {
  for (const vector of cases()) {
    const outcome = compareCase(vector, idealActual(vector));
    assert.deepEqual(outcome.failures, [], vector.caseId);
  }
});

test("should reject targeted mutations of required fields", () => {
  const rejects = (caseId, mutate, label) => {
    const vector = byId(caseId), actual = idealActual(vector);
    mutate(actual);
    const outcome = compareCase(vector, actual);
    assert.equal(outcome.ok, false, `${caseId}: ${label}`);
    assert.ok(outcome.failures.every(f => !/unsupported|lone surrogate|nonfinite/.test(f)), `${caseId}: ${label} must fail on a comparison, not on encoding: ${outcome.failures}`);
  };
  const accepts = (caseId, mutate, label) => {
    const vector = byId(caseId), actual = idealActual(vector);
    mutate(actual);
    assert.deepEqual(compareCase(vector, actual).failures, [], `${caseId}: ${label}`);
  };
  // Report entries: order, coordinates, vocabulary, header, presence flags.
  rejects("l3-n-full", a => { const e = a.result.report.entries; [e[0], e[1]] = [e[1], e[0]]; a.result.payload.report = clone(a.result.report); }, "entry order");
  rejects("l3-n-full", a => { a.result.report.entries[0].source.pointer = "/rootElements/2"; a.result.payload.report = clone(a.result.report); }, "source coordinate");
  rejects("l3-c-item-backing", a => { a.result.report.entries[0].result.provenance = "exact"; }, "result provenance");
  rejects("l3-c-item-backing", a => { a.result.report.entries[1].ruleId = "c-input-port"; }, "ruleId");
  rejects("l3-c-item-backing", a => { delete a.result.report.targetIdentity; }, "report header");
  rejects("l3-c-item-backing", a => { a.result.report.entries[1].beforePresent = true; a.result.report.entries[1].before = null; }, "presence flag");
  rejects("l3-n-full", a => { a.result.payload.report.entries = []; }, "payload report differs");
  rejects("l3-io-wrong-direction-accept", a => { a.result.report.entries = a.result.report.entries.filter(e => e.classification !== "integrity"); a.result.payload.counts.error -= 1; }, "integrity finding dropped");
  rejects("l3-io-wrong-direction-draft", a => { a.result.report.entries.find(e => e.ruleId === "link-endpoint").severity = "warn"; }, "integrity severity in draft");
  rejects("l3-imp-projection-out-of-base", a => { a.result.report.entries[0].lossClass = "semantic-type"; }, "loss class");
  rejects("l3-imp-projection-out-of-base", a => { a.result.report.entries[3].source.pointer = "/rootElements/0/flowElements/3"; }, "shifted source pointer");
  rejects("l3-imp-remap-total", a => { a.result.report.idMap = a.result.report.idMap.filter(r => r.sourceId !== r.resultId); }, "identity rows of idMap");
  rejects("l3-imp-remap-total", a => { a.result.payload.importedDi.diagrams[1].plane.bpmnElement = "Process_sub_old"; }, "navigation view plane");
  rejects("l3-imp-remap-dangling", a => { a.result.report.entries = []; }, "dangling observation");
  // Refusals are never compared by code alone.
  rejects("l3-c-write-conflict", a => { delete a.result.diagnostics; }, "refusal diagnostics");
  rejects("l3-c-write-conflict", a => { delete a.result.profileIdentity; delete a.result.baseRevision; }, "refusal echo");
  rejects("l3-c-document-version", a => { a.result.baseRevision = "0".repeat(64); a.result.profileIdentity = {}; }, "fabricated echo");
  rejects("l3-tx-guard-recovery", a => { a.trace[2].result.report.entries = []; a.trace[2].result.diagnostics = []; }, "attempted lint entries");
  // Source preservation, transport bytes, ids, placements.
  rejects("l3-n-binding-wrong-type", a => { a["caller-state"].bindings = []; }, "caller state");
  rejects("l3-imp-projection-out-of-base", a => { a["caller-state"] += " "; }, "source text");
  rejects("l3-mix-n-full-js-py-js", a => { a.transport.hops[1].bytes = a.transport.hops[1].bytes.replace("\"bindings\"", "\"bindings\" "); }, "transport bytes");
  rejects("l3-mix-n-full-py-js-py", a => { a.transport.hops[2].result.report.entries.push(clone(a.transport.hops[0].result.report.entries[0])); }, "second-run entries");
  rejects("l3-id-stable-vectors", a => { a.ids[3] = a.ids[4]; }, "trimmed key merged into its unpadded twin");
  rejects("l3-id-stable-vectors", a => { a.ids[1] = a.ids[0]; }, "decomposed key merged into its NFC form");
  rejects("l3-id-stable-vectors", a => { a.ids[5] = a.ids[6]; }, "NBSP key merged into the space key");
  // Unicode-names fix (DESIGN L292): a duplicate ordinal counts equal signatures only.
  rejects("l3-id-unicode-names", a => { a.result = withOrdinals(a.result, i => i); }, "duplicate ordinals counted across different content");
  accepts("l3-id-unicode-names", a => { a.result = withOrdinals(a.result, () => 0); }, "the same re-derivation under the L292 ordinals");
  rejects("l3-sort-placements", a => { const v = a.value; [v[0], v[1]] = [v[1], v[0]]; }, "placement order");
  // Traces: history, events, restored presentation, exact geometry; UNSEALED scope.
  rejects("l3-tx-incremental-draft", a => { a.trace[2].history.past = 2; }, "history counter");
  rejects("l3-tx-incremental-draft", a => { a.trace[2].events.L1.push(clone(a.trace[2].events.L1[0])); }, "extra event");
  rejects("l3-tx-incremental-draft", a => { a.trace[9].result.payload.presentation.selection = [{ pageId: "page_canvas", occurrenceKey: "x" }]; }, "undo presentation");
  rejects("l3-tx-incremental-draft", a => { a.trace[9].result.payload = clone(a.trace[8].result.payload); }, "undo restores the wrong snapshot");
  rejects("l3-tx-di-only-move", a => { a.trace[4].result.payload.presentation.layout.geometry.find(g => g.occurrenceKey === "task").bounds.x += 1; }, "moved geometry");
  rejects("l3-tx-di-only-move", a => { a.trace[4].result.payload.presentation.selection = []; }, "selection after move");
  rejects("l3-tx-di-only-move", a => { a.trace[3].result.payload.viewRevision = a.trace[1].result.payload.viewRevision; }, "view revision of a DI move");
  rejects("l3-tx-theme-history", a => { a.trace[5].result.payload.presentation.themeId = "plain"; }, "undo reverts the theme");
  rejects("l3-tx-corrected-noop", a => { a.trace[3].result.report.entries = []; }, "missing correction notice");
  rejects("l3-tx-corrected-noop", a => { a.trace[3].history.past = 1; }, "no-op history entry");
  rejects("l3-tx-incremental-draft", a => { delete a.trace[0].result.payload.subscriptionId; }, "UNSEALED member absent");
  accepts("l3-tx-incremental-draft", a => { a.trace[0].result.payload.subscriptionId = "another-session-id"; }, "UNSEALED member value");
  // The route after the move is UNSEALED, but redo must restore that same route.
  const reroute = a => { for (const i of [4, 6]) a.trace[i].result.payload.presentation.layout.geometry.find(g => g.occurrenceKey === "flow-1").waypoints = [{ x: 176000, y: 110000 }, { x: 240000, y: 110000 }]; };
  accepts("l3-tx-di-only-move", reroute, "UNSEALED route");
  rejects("l3-tx-di-only-move", a => { reroute(a); a.trace[6].result.payload.presentation.layout.geometry.find(g => g.occurrenceKey === "flow-1").waypoints[0].x += 1; }, "redo restores another route");
  // Parity sync values (PS-21, PS-32).
  rejects("l3-imp-projection-out-of-base", a => { a.result.revision = sha("committed projection"); a.result.report.outputRevision = a.result.revision; }, "committed revision of a read-only projection");
  rejects("l3-imp-remap-dangling", a => { for (const side of ["source", "result"]) a.result.report.entries[0][side].pointer = "/rootElements/0/flowElements/0"; }, "observation at the element pointer");
  // Vendored Python cases: chained apply, carried facts, compile shapes, fixed point, placements role, caller state.
  rejects("cn-plan-create-task-neutral", a => { delete a.apply; }, "chained apply missing");
  rejects("cn-plan-create-task-neutral", a => { a.apply.payload.created = []; }, "apply created list");
  rejects("cn-plan-lane-member-support", a => { a.plan.payload.writes[0].cardinality = "many"; }, "carried descriptive fact");
  rejects("cn-plan-link-wrong-target-type", a => { a.apply.code = "reference-dangling"; }, "apply refusal code");
  rejects("cn-apply-stale-plan", a => { a.apply.report = SYNTH_REPORT("applyPlan"); }, "PureResult refusal members");
  rejects("cn-compile-port-without-authority", a => { delete a.compile.diagnostics; }, "compile refusal shape (PS-25)");
  rejects("cn-compile-support-profile", a => { a["compiled-identity"].sha256 = "0".repeat(64); }, "compiled identity");
  rejects("cn-compile-support-profile", a => { delete a.compile.payload; }, "UNSEALED compiled payload absent");
  accepts("cn-compile-support-profile", a => { a.compile.payload = { compiled: "opaque runtime object" }; }, "UNSEALED compiled payload value");
  rejects("cn-compile-variants", a => { a["compiled-identities"].reverse(); }, "compiled identities order");
  rejects("cn-compile-variants", a => { delete a.compile[3].payload; }, "UNSEALED payload of a listed compile absent");
  rejects("cn-n-support-one-process", a => { delete a["fixed-point"]; }, "second run missing");
  rejects("cn-n-support-one-process", a => { const s = a["fixed-point"]; s.report.entries = clone(a.result.report.entries); s.payload.report = clone(s.report); }, "second-run entries");
  rejects("cn-c-output-port-qualification", a => { a["fixed-point"].revision = "0".repeat(64); }, "second-run revision");
  rejects("cn-sort-placements", a => { const v = a.placements; [v[0], v[1]] = [v[1], v[0]]; }, "vendored placement order");
  rejects("cn-c-version-mismatch-first", a => { a["caller-state"].semanticRevision = "0".repeat(64); }, "vendored refusal caller state");
});

test("should give every byte-distinct unicode name its own ordinal-0 ID (DESIGN L292)", () => {
  const raws = unicodeRaws(), names = raws.map(r => r.name);
  assert.equal(new Set(names).size, names.length, "byte-distinct names");
  // The code points an earlier helper rewrite folded into ASCII spaces stay present.
  for (const cp of [0x10000, 0xe000, 0xa0, 0x2028, 0x85, 0xe9, 0x301]) assert.ok(names.some(n => [...n].some(c => c.codePointAt(0) === cp)), `code point ${cp.toString(16)}`);
  const ids = byId("l3-id-unicode-names").expectedArtifacts.find(a => a.role === "result").json.payload.tree.rootElements[0].flowElements.map(n => n.id);
  assert.deepEqual(ids, raws.map(raw => birthId(raw, 0)));
  assert.equal(new Set(ids).size, ids.length);
});

test("should vendor every Python record unchanged from the pinned Python seal", () => {
  const manifest = json(join(root, "manifest.json")), index = json(join(root, "index.json"));
  const sealBytes = readFileSync(join(fixtures, manifest.vendoredSeal.manifest.vendored));
  assert.equal(sha(sealBytes), manifest.vendoredSeal.manifest.sha256, "pinned Python seal");
  const listed = Object.fromEntries(sealBytes.toString("utf8").trim().split("\n").map(line => line.split("  ").reverse()));
  const parityBytes = readFileSync(join(fixtures, manifest.vendoredSeal.parityManifest.vendored));
  assert.equal(sha(parityBytes), manifest.vendoredSeal.parityManifest.sha256);
  assert.equal(listed["parity/manifest.json"], manifest.vendoredSeal.parityManifest.sha256, "the Python seal lists its parity manifest");
  const pins = JSON.parse(parityBytes).files;
  const vendored = index.cases.filter(c => c.vendored);
  assert.deepEqual(manifest.vendored.map(v => v.caseId).sort(), vendored.map(c => c.caseId).sort());
  const role = r => (r === "placementIntent" ? "placement-intent" : r);
  for (const v of manifest.vendored) {
    const bytes = readFileSync(join(fixtures, v.source.vendored)), entry = vendored.find(c => c.caseId === v.caseId), vector = byId(v.caseId);
    assert.equal(sha(bytes), v.source.sha256, v.caseId);
    assert.equal(pins[v.source.path], v.source.sha256, `${v.caseId} pinned by the Python parity manifest`);
    assert.equal(listed[v.source.path.slice(PY_ROOT.length)], v.source.sha256, `${v.caseId} listed by the Python seal`);
    assert.deepEqual(entry.vendored.source, { runtime: "python", ...v.source }, v.caseId);
    assert.equal(listed[entry.vendored.harness.path.slice(PY_ROOT.length)], entry.vendored.harness.sha256, `${v.caseId} harness record`);
    const record = JSON.parse(bytes);
    for (const key of ["caseId", "operation", "phase", "expectedStatus"]) assert.equal(vector[key], record[key], `${v.caseId} ${key}`);
    assert.equal(vector.profileArtifact?.sha256, record.profileArtifact?.sha256, `${v.caseId} profile`);
    if (record.commandArtifact) assert.equal(jcs(vector.commandArtifact), jcs(record.commandArtifact), `${v.caseId} command`);
    for (const a of record.inputArtifacts) {
      const mine = vector.inputArtifacts.filter(x => x.role === role(a.role));
      if (Object.hasOwn(a, "path")) assert.ok(mine.some(x => x.json.sha256 === a.sha256), `${v.caseId} input ${a.path}`);
      else assert.equal(jcs(mine[0].json), jcs(a.json), `${v.caseId} input ${a.role}`);
    }
    for (const a of record.expectedArtifacts) assert.equal(jcs(vector.expectedArtifacts.find(x => x.role === a.role).json), jcs(a.json), `${v.caseId} ${a.role} unchanged`);
    if (record.operation !== "compileProfile") { assert.doesNotMatch(entry.vendored.derivation, /PS-25|PS-35/, v.caseId); continue; }
    // The owner applied PS-25/PS-35 to its compile records before resealing; the
    // derivation names the decision and the shapes follow it.
    const compile = vector.expectedArtifacts.find(x => x.role === "compile").json;
    for (const r of [compile].flat()) {
      if (r.status === "refused") { assert.match(entry.vendored.derivation, /PS-25/); assert.deepEqual(r, { status: "refused", code: r.code, diagnostics: [] }, v.caseId); }
      else { assert.match(entry.vendored.derivation, /PS-35/); assert.deepEqual(Object.keys(r.payload), ["$unsealed"], v.caseId); assert.deepEqual(r.diagnostics, [], v.caseId); }
    }
  }
  // PS-37 aliases: one parity case each, no copy.
  for (const a of manifest.aliases) {
    assert.equal(listed[`parity/cases/${a.caseId}.json`], a.sha256, a.caseId);
    assert.ok(byId(a.aliasOf), a.aliasOf);
    assert.equal(byId(a.caseId), undefined, `${a.caseId} is not copied`);
  }
});

test("should cite a pinned DESIGN clause and a plausible wrong implementation for every case", () => {
  const index = json(join(root, "index.json"));
  assert.equal(index.designSha256, DESIGN_SHA256);
  assert.equal(index.designLines, DESIGN_LINES);
  const caseIds = walk(join(root, "cases")).map(name => name.replace(/\.json$/, "")).sort();
  assert.deepEqual(index.cases.map(c => c.caseId).sort(), caseIds);
  const inRange = ({ section, lines }) => {
    const range = index.sections[section];
    assert.ok(range, `unknown section ${section}`);
    assert.ok(lines[0] >= range[0] && lines[1] <= range[1] && lines[0] <= lines[1] && lines[1] <= DESIGN_LINES, `${section} L${lines}`);
  };
  const groups = {};
  for (const c of index.cases) {
    inRange(c.clause); c.cites.forEach(inRange);
    assert.ok(c.discriminates.length >= 40, c.caseId);
    assert.ok(c.runtimes.length && c.runtimes.every(r => ["js", "python"].includes(r)), c.caseId);
    groups[c.group] = (groups[c.group] ?? 0) + 1;
  }
  assert.deepEqual(groups, index.groups);
  const table = readFileSync(join(repo, "docs/design/block-b-lot3-expectations.md"), "utf8");
  for (const id of caseIds) assert.ok(table.includes(`\`${id}\``), `design table ${id}`);
  const readme = readFileSync(join(root, "README.md"), "utf8");
  for (const c of index.cases) assert.ok(readme.includes(`| \`${c.caseId}\` | ${c.discriminates} |`), `README discrimination ${c.caseId}`);
});

test("should list every UNSEALED gate with its OPEN id and DESIGN default", () => {
  const index = json(join(root, "index.json"));
  const readme = readFileSync(join(root, "README.md"), "utf8");
  assert.equal(new Set(index.unsealed.map(u => u.id)).size, index.unsealed.length);
  for (const u of index.unsealed) {
    assert.ok(u.openIds.length && u.openIds.every(id => /^OPEN-[A-Z0-9-]+$/.test(id)), u.id);
    assert.ok(u.point.length > 40 && u.default.length > 40, u.id);
    assert.ok(readme.includes(`| ${u.id} |`), `README ${u.id}`);
    for (const id of u.openIds) assert.ok(readme.includes(id), `README ${id}`);
  }
  for (const id of ["OPEN-HOOK", "OPEN-RESERVED-N", "OPEN-EXTERNAL", "OPEN-SHARING", "OPEN-IO", "OPEN-RELATIONS", "OPEN-MIGRATION", "OPEN-ID", "OPEN-MACHINE"]) {
    assert.ok(index.unsealed.some(u => u.openIds.includes(id)), id);
  }
});

// ---------------------------------------------------------------- independence guard (AST, robust to comments, strings, dynamic forms)
const HELPER_MODULES = new Set(["node:crypto", "node:fs", "node:path", "node:url"]);
const COMPARATOR_MODULES = new Set(["node:crypto"]);
const FORBIDDEN_NAMES = new Set(["require", "createRequire", "eval", "Function", "Worker", "SharedWorker", "importScripts", "globalThis", "global", "module",
  "WebAssembly", "fetch", "XMLHttpRequest", "__non_webpack_require__"]);
const FORBIDDEN_PROPERTIES = new Set(["constructor", "__proto__", "mainModule", "_linkedBinding"]);
export function interpreterImports(source, allowed = HELPER_MODULES, path = "module.mjs") {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = [];
  const flag = (node, what) => found.push(`${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${what}`);
  if (file.parseDiagnostics.length) found.push("0: unparseable module");
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) flag(node, "computed module specifier");
      else if (!allowed.has(node.moduleSpecifier.text)) flag(node, `module ${node.moduleSpecifier.text}`);
    }
    if (ts.isImportEqualsDeclaration(node)) flag(node, "import equals");
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) flag(node, "dynamic import");
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && node.parent.name.text === "url")) flag(node, "import.meta other than url");
    if (ts.isIdentifier(node) && FORBIDDEN_NAMES.has(node.text)) flag(node, `identifier ${node.text}`);
    if (ts.isPropertyAccessExpression(node) && FORBIDDEN_PROPERTIES.has(node.name.text)) flag(node, `property ${node.name.text}`);
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
      && (FORBIDDEN_PROPERTIES.has(node.argumentExpression.text) || FORBIDDEN_NAMES.has(node.argumentExpression.text))) flag(node, `element ${node.argumentExpression.text}`);
    // `process` as a value may only be read as process.argv; a property or key
    // spelled process (for example X.process) is not a reference to it.
    const asName = ts.isIdentifier(node) && ((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
      || (ts.isPropertyAssignment(node.parent) && node.parent.name === node) || (ts.isMethodDeclaration(node.parent) && node.parent.name === node));
    if (ts.isIdentifier(node) && node.text === "process" && !asName
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && node.parent.name.text === "argv")) flag(node, "process other than process.argv");
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
const helperFiles = () => walk(join(root, "author")).filter(p => /\.[cm]?js$/.test(p)).map(p => join(root, "author", p));

test("should keep every derivation helper and the comparator module free of interpreter imports", () => {
  assert.ok(helperFiles().length >= 1);
  for (const path of helperFiles()) assert.deepEqual(interpreterImports(readFileSync(path, "utf8"), HELPER_MODULES, path), [], path);
  assert.deepEqual(interpreterImports(readFileSync(comparatorsPath, "utf8"), COMPARATOR_MODULES, comparatorsPath), [], comparatorsPath);
});

test("should detect every import bypass family injected in a helper or the comparator module", () => {
  const helper = readFileSync(helperFiles()[0], "utf8"), comparator = readFileSync(comparatorsPath, "utf8");
  const bypasses = [
    'const marker = 0; import { complete } from "../../../../../dist/profile/index.js";',
    'const marker = 0; export { normalize } from "../../../../../src/profile/index.ts";',
    'const m = 1; export * from "@sentropic/bpmn-canvas/profile";',
    'import {\n  // a comment between the braces\n  complete\n} from /* inline */ "../../../../../dist/profile/index.js";',
    'import "bpmnlint";',
    'import data from "./data.json" with { type: "json" };',
    'import { createRequire as cr } from "node:module";',
    'import * as vm from "node:vm";',
    'const engine = await import("../../../../../dist/profile/index.js");',
    'const engine = await import(`../../../../../dist/${"profile"}/index.js`);',
    'const spec = "../dist/x.js"; const engine = await import(spec);',
    'const { compileProfile } = require("../../../../../dist/profile/compiler.js");',
    'const load = \\u0072equire; load("x");',
    'const r = globalThis["req" + "uire"]; r("x");',
    'const r = global.require; r("x");',
    'const r = module.require("x");',
    'const run = eval; run("1");',
    'const f = new Function("return 1");',
    'const f = Function("return 1");',
    'const f = [].constructor.constructor("return 1");',
    'const f = (() => 0)["constructor"]("return 1");',
    'const w = new Worker("x.js");',
    'const b = process.binding("fs");',
    'const m = process.mainModule;',
    'const u = import.meta.resolve("../dist/profile/index.js");',
    'const x = await fetch("https://example.invalid/profile.js");',
    'import { complete } from "../../../../../dist/profile/index.js"', // missing semicolon at end of file
    'import { broken from "x";', // unparseable injection
  ];
  for (const injected of bypasses) {
    assert.notDeepEqual(interpreterImports(injected), [], `snippet alone: ${injected}`);
    assert.notDeepEqual(interpreterImports(`${helper}\n${injected}\n`), [], `helper: ${injected}`);
    assert.notDeepEqual(interpreterImports(`${injected}\n${comparator}`, COMPARATOR_MODULES), [], `comparator: ${injected}`);
  }
  // Comments and strings that merely spell an import are not imports.
  for (const benign of [
    '// import { complete } from "../dist/profile/index.js"; require("x"); eval("y")',
    '/* const engine = await import("../dist/profile/index.js"); */',
    'const text = "import { complete } from \'../dist/profile/index.js\'; require(\'x\')";',
    'const tpl = `await import("x") and new Function()`;',
  ]) assert.deepEqual(interpreterImports(`${helper}\n${benign}\n`), [], `benign: ${benign}`);
  assert.notDeepEqual(interpreterImports(comparator, new Set()), [], "the comparator's own node:crypto import is visible to the guard");
});

test("should carry no protected brand token in any sealed lot-3 file", () => {
  for (const entry of [...sealedEntries().filter(e => !e.path.startsWith("tests/fixtures/profile-parity-corpus/")), ...[RECEIPT, LITERALS_RECEIPT, UNICODE_NAMES_RECEIPT, PARITY_SYNC_RECEIPT, SEAL_FIX_RECEIPT].map(path => ({ path, abs: join(repo, path) }))]) {
    assert.deepEqual(brandTokens(entry.path), [], entry.path);
    assert.deepEqual(brandTokens(readFileSync(entry.abs, "utf8")), [], entry.path);
  }
});
