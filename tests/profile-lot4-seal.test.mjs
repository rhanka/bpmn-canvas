// Lot-4 (layout, R, exporters) independent expectation seal. Data and pinned
// comparator checks only: no profile loader, compiler, evaluator, layout, codec
// or exporter is executed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import ts from "typescript";
import { brandTokens } from "./helpers/brand.mjs";
import * as CMP from "./fixtures/lot4-layout-export/expectations/comparators/lot4-compare.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const fixtures = join(repo, "tests/fixtures");
const root = join(fixtures, "lot4-layout-export/expectations");
const ledgerPath = join(repo, "docs/design/receipts/block-b-lot4-reseal.json");
const syncLedgerPath = join(repo, "docs/design/receipts/block-b-lot4-parity-sync.json");
const microLedgerPath = join(repo, "docs/design/receipts/block-b-lot4-microfix-reseal.json");
const keyLedgerPath = join(repo, "docs/design/receipts/block-b-lot4-unicode-key-fix.json");
const twinLedgerPath = join(repo, "docs/design/receipts/block-b-lot4-twin-applied-field.json");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8"));
const CASE_KEYS = ["caseId", "operation", "phase", "profileArtifact", "inputArtifacts", "expectedArtifacts", "expectedStatus", "comparatorIds"];
const DESIGN_SHA256 = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
const REVIEWED_SEAL = { commit: "eb5bffd", sha256: "0376599bfa11d2cd2c629472e5fa42420109a5d6ccc2254761d49a7777d1c15c", caseCount: 153 };
// Seal fix round (SF) seal, predecessor of the block-B parity sync reseal.
const SF_SEAL = { commit: "6d926bc", sha256: "f953942a2a86387120737c9f8d263e082e3ff94ec60036695c236abbbef4ae43", caseCount: 197 };
// Parity sync (PS) seal, predecessor of the layout-011 micro-fix reseal.
const PS_SEAL = { commit: "a7e284d", sha256: "043028b6cdd820497bbbe36546c19a90fedad7207322b43f1ad8f67da9d86678", caseCount: 391 };
// Micro-fix (MF) seal, predecessor of the idplan-007 code point restoration reseal.
const MF_SEAL = { commit: "6cd5bd9", sha256: "681b15c01b955c67de4e9e06b21b9b9f5ec87a4dc0ea13c6bac68595ad257beb", caseCount: 391 };
// Unicode key fix (KF) seal, predecessor of the twin-applied field reseal (block B squash commit).
const KF_SEAL = { commit: "25a66ed", sha256: "189c40c34242c238cfe247f027613b318aa4b62f0a852c16f1773615ddb336c4", caseCount: 391 };
const PY_SEAL_COMMIT = "c85646d1b87d674f278d10f480670331a0c91a99";
const VENDORED_COUNT = 194;

function inventory(dir, rel = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name), path = rel ? `${rel}/${name}` : name, st = lstatSync(full);
    assert.ok(!st.isSymbolicLink(), `linked entry ${path}`);
    if (st.isDirectory()) out.push(...inventory(full, path));
    else { assert.ok(st.isFile() && st.nlink === 1, `nonregular or hard-linked entry ${path}`); out.push(path); }
  }
  return out;
}
const safe = path => typeof path === "string" && /^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*$/.test(path) && !path.split("/").some(p => p === "." || p === "..");

// Verify the seal through an injectable reader so mutation witnesses need no disk writes.
export function verifySeal(read = path => readFileSync(join(root, path)), listing = inventory(root)) {
  const seal = JSON.parse(read("seal.json").toString("utf8"));
  if (seal.format !== "lot4-expectations-seal/1" || JSON.stringify(seal.excluded) !== '["seal.json"]' || !Array.isArray(seal.files) || !Array.isArray(seal.comparators)) throw new Error("seal format");
  const paths = seal.files.map(f => {
    if (Object.keys(f).sort().join(",") !== "bytes,path,sha256" || !safe(f.path) || !Number.isSafeInteger(f.bytes) || !/^[0-9a-f]{64}$/.test(f.sha256)) throw new Error("seal entry");
    return f.path;
  });
  if (new Set(paths).size !== paths.length) throw new Error("seal duplicate");
  if (JSON.stringify([...paths, "seal.json"].sort()) !== JSON.stringify([...listing].sort())) throw new Error("seal inventory");
  for (const f of seal.files) {
    const bytes = read(f.path);
    if (bytes.length !== f.bytes || sha(bytes) !== f.sha256) throw new Error(`seal drift ${f.path}`);
  }
  for (const c of seal.comparators) {
    const entry = seal.files.find(f => `lot4-layout-export/expectations/${f.path}` === c.path);
    if (!entry || entry.sha256 !== c.sha256) throw new Error(`seal comparator pin ${c.path}`);
  }
  return seal;
}
const cache = new Map();
const cached = path => { if (!cache.has(path)) cache.set(path, readFileSync(join(root, path))); return cache.get(path); };

test("lot 4: every sealed file matches its recorded length and SHA-256", () => {
  const seal = verifySeal();
  assert.ok(seal.files.length > 300);
  assert.match(seal.method, /no loader, compiler, evaluator, codec, layout, exporter or command output/);
});

test("lot 4: a one-byte change, a missing file or an extra file in the sealed tree fails", () => {
  const listing = inventory(root);
  const seal = verifySeal(cached, listing);
  for (const f of seal.files) {
    const original = cached(f.path);
    for (const at of new Set([0, original.length >> 1, original.length - 1])) {
      const damaged = Buffer.from(original); damaged[at] ^= 1;
      assert.throws(() => verifySeal(path => (path === f.path ? damaged : cached(path)), listing), /seal drift/, `${f.path}@${at}`);
    }
  }
  assert.throws(() => verifySeal(cached, listing.filter(p => p !== seal.files[0].path)), /seal inventory/);
  assert.throws(() => verifySeal(cached, [...listing, "cases/extra.json"]), /seal inventory/);
});

// ---------------------------------------------------------------- cases
const manifest = json(join(root, "manifest.json"));
const caseFiles = readdirSync(join(root, "cases")).sort();
const cases = caseFiles.map(f => json(join(root, "cases", f)));
const resolveArtifact = a => (Object.hasOwn(a, "path") ? JSON.parse(readFileSync(join(fixtures, a.path), "utf8")) : a.json);
const expectedOf = c => Object.fromEntries(c.expectedArtifacts.map(a => [a.role, resolveArtifact(a)]));

test("lot 4: cases are profile-parity-corpus/1 records with resolvable pinned artifacts and full result records", () => {
  assert.equal(manifest.format, "profile-parity-corpus/1");
  assert.equal(manifest.pathBase, "tests/fixtures");
  const comparators = new Set(manifest.comparators.map(c => c.id));
  assert.deepEqual(Object.keys(manifest.files).filter(p => p.startsWith("cases/")).sort(), caseFiles.map(f => `cases/${f}`));
  for (const [path, digest] of Object.entries(manifest.files)) assert.equal(sha(readFileSync(join(root, path))), digest, path);
  const resolve = ref => {
    assert.ok(safe(ref.path), `unsafe artifact path ${ref.path}`);
    assert.equal(sha(readFileSync(join(fixtures, ref.path))), ref.sha256, `artifact digest ${ref.path}`);
  };
  const ids = new Set();
  for (const [i, c] of cases.entries()) {
    const file = caseFiles[i];
    assert.deepEqual(Object.keys(c).filter(k => k !== "commandArtifact").sort(), [...CASE_KEYS].sort(), file);
    assert.equal(`${c.caseId}.json`, file);
    assert.ok(!ids.has(c.caseId)); ids.add(c.caseId);
    assert.match(c.expectedStatus, /^(ok|refused:[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*)$/, file);
    assert.ok(c.expectedArtifacts.length > 0, `${file} empty expectation`);
    assert.ok(c.comparatorIds.length > 0 && c.comparatorIds.every(id => comparators.has(id)), `${file} comparators`);
    for (const a of [c.profileArtifact, c.commandArtifact, ...c.inputArtifacts, ...c.expectedArtifacts]) if (a && Object.hasOwn(a, "path")) resolve(a);
    const expected = expectedOf(c);
    assert.ok(expected.result !== undefined || expected.output !== undefined, `${file} result/output artifact`);
    if (c.expectedStatus.startsWith("refused:")) {
      // A refusal is never sealed by code alone: the whole PureResult/Result/1 record is expected.
      const r = expected.result;
      assert.equal(r?.status, "refused", file);
      assert.equal(r.code, c.expectedStatus.slice(8), file);
      assert.ok(Array.isArray(r.diagnostics), `${file} diagnostics`);
      if (Object.hasOwn(r, "operation")) {
        assert.equal(r.operation, c.operation, file);
        assert.equal(r.report?.reportVersion, "2", `${file} refusal report`);
        assert.deepEqual(r.diagnostics, r.report.entries, `${file} diagnostics = report entries`);
      } else assert.deepEqual(Object.keys(r).sort(), ["code", "diagnostics", "status"], `${file} PureResult refusal`);
    } else if (expected.result !== undefined) assert.equal(expected.result.status, "ok", file);
    for (const role of Object.keys(expected)) assert.ok(!(role === "verdict"), `${file} code-only verdict artifact`);
  }
  for (const pkg of manifest.packages) for (const ref of [pkg.profile, pkg.base, pkg.descriptors, pkg.registry, pkg.schema, ...pkg.assets]) resolve(ref);
});

test("lot 4: every case cites a DESIGN R3.3 clause inside its section and names a wrong implementation", () => {
  const index = json(join(root, "index.json"));
  const excerpts = json(join(root, "design-excerpts.json"));
  assert.equal(index.designSha256, DESIGN_SHA256);
  assert.equal(excerpts.designSha256, DESIGN_SHA256);
  const lines = new Map(excerpts.lines.map(l => [l.line, l.sha256]));
  const ids = caseFiles.map(f => f.replace(/\.json$/, "")).sort();
  assert.deepEqual(index.cases.map(c => c.caseId).sort(), ids);
  assert.equal(index.caseCount, ids.length);
  const groups = {};
  for (const c of index.cases) {
    groups[c.group] = (groups[c.group] ?? 0) + 1;
    assert.ok(c.clause.length > 0, c.caseId);
    for (const cl of c.clause) {
      const range = excerpts.sections[cl.section];
      assert.ok(range && cl.lines[0] >= range[0] && cl.lines[1] <= range[1] && cl.lines[0] <= cl.lines[1], `${c.caseId} clause ${JSON.stringify(cl)}`);
      for (let n = cl.lines[0]; n <= cl.lines[1]; n++) assert.match(lines.get(n) ?? "", /^[0-9a-f]{64}$/, `${c.caseId} excerpt L${n}`);
    }
    assert.ok(c.derivation.length > 40 && c.wrongImplementation.length > 15, `${c.caseId} derivation/wrong implementation`);
  }
  assert.deepEqual(groups, index.groups);
  assert.ok(index.unsealed.length > 0);
  for (const u of index.unsealed) assert.ok(u.id && u.item && u.gate && u.default && u.clause.length, u.id);
  for (const u of index.closed) assert.ok(u.id && u.item && u.closedBy, u.id);
  if (process.env.LOT4_DESIGN) {
    const bytes = readFileSync(process.env.LOT4_DESIGN);
    assert.equal(sha(bytes), DESIGN_SHA256);
    const text = bytes.toString("utf8").split("\n");
    for (const l of excerpts.lines) assert.equal(sha(Buffer.from(text[l.line - 1], "utf8")), l.sha256, `L${l.line}`);
  }
  const doc = readFileSync(join(repo, "docs/design/block-b-lot4-expectations.md"), "utf8");
  for (const id of ids) assert.ok(doc.includes(`\`${id}\``), `docs table misses ${id}`);
  for (const u of [...index.unsealed, ...index.closed]) assert.ok(doc.includes(u.id), `docs table misses ${u.id}`);
});

// ---------------------------------------------------------- comparators
test("lot 4: comparators are pinned executables recorded in the seal and the corpus manifest with their parents", () => {
  const seal = json(join(root, "seal.json"));
  const sources = new Map();
  for (const c of manifest.comparators) {
    for (const s of [c.source, ...c.dependencies]) {
      assert.equal(sha(readFileSync(join(fixtures, s.path))), s.sha256, s.path);
      assert.ok(seal.comparators.some(x => x.path === s.path && x.sha256 === s.sha256), `seal pins ${s.path}`);
      sources.set(s.path, s.sha256);
    }
    assert.equal(c.tolerance, "zero", c.id);
    assert.equal(typeof CMP[c.export], "function", `${c.id} export ${c.export}`);
    assert.equal(CMP.COMPARATORS[c.id], CMP[c.export], c.id);
  }
  assert.equal(sources.size, seal.comparators.length);
  const parents = json(join(fixtures, "profile-lot0/parents.json"));
  assert.deepEqual({ canvas: manifest.parents.canvas, headless: manifest.parents.headless }, parents);
  assert.equal(manifest.parents.canvas, "61903a61e2a6f258b506b4cdcd310a57787eee30845d6deb996afbb54abf33a9");
  assert.equal(manifest.parents.headless, "def4ffb25b6c60f963226fb62d9b433e10a1420f340a1835b8ac273711e29b3d");
  assert.equal(sha(readFileSync(join(fixtures, manifest.parents.record.path))), manifest.parents.record.sha256);
  assert.equal(sha(readFileSync(join(fixtures, manifest.extends.path))), manifest.extends.sha256);
});

// Fill the members an UNSEALED pointer removes, so the sealed record stands for a conforming output.
// Entries scoped to another expected artifact (member `artifact`) do not touch the record.
const DUMMY = { "/payload": {}, "/payload/bytes": new Uint8Array([60, 120, 47, 62]), "/payload/digest": "0".repeat(64), "/report/artifacts/0/digest": "0".repeat(64) };
const recordUnsealed = expected => (expected.unsealed ?? []).filter(u => u.artifact === undefined || u.artifact === "result");
function conforming(expected) {
  const actual = structuredClone(expected.result ?? expected.output);
  for (const { pointer } of recordUnsealed(expected)) if (!CMP.resolvePointer(actual, pointer).found) {
    const tokens = pointer.slice(1).split("/"), last = tokens.pop();
    CMP.resolvePointer(actual, tokens.length ? `/${tokens.join("/")}` : "").value[last] = structuredClone(DUMMY[pointer]);
  }
  return actual;
}
function leaves(value, pointer = "", out = []) {
  if (value === null || typeof value !== "object" || value instanceof Uint8Array) out.push(pointer);
  else for (const [k, v] of Object.entries(value)) leaves(v, `${pointer}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`, out);
  return out;
}
const setAt = (value, pointer, f) => {
  const tokens = pointer.slice(1).split("/").map(t => t.replace(/~1/g, "/").replace(/~0/g, "~")), last = tokens.pop();
  let cur = value; for (const t of tokens) cur = cur[t];
  cur[last] = f(cur[last]);
};
const mutateLeaf = v => (typeof v === "string" ? `${v}x` : typeof v === "number" ? v + 1 : typeof v === "boolean" ? !v : v === null ? 0 : v);
function mutations(expected) {
  const base = conforming(expected);
  const unsealed = recordUnsealed(expected).map(u => u.pointer);
  const all = leaves(base).filter(p => p !== "" && !unsealed.some(u => p === u || p.startsWith(`${u}/`)));
  const picks = [...new Set([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144].map(i => Math.min(i, all.length - 1)).concat([all.length - 1, all.length >> 1]))].map(i => all[i]).filter(Boolean);
  const out = picks.map(p => { const m = structuredClone(base); setAt(m, p, mutateLeaf); return [`leaf ${p}`, m]; });
  if (base && typeof base === "object" && !Array.isArray(base)) {
    const m1 = structuredClone(base); m1.extraMember = 1; out.push(["extra member", m1]);
    const keys = Object.keys(base); const m2 = structuredClone(base); delete m2[keys[keys.length - 1]]; out.push([`missing ${keys[keys.length - 1]}`, m2]);
  }
  const arrays = [];
  (function walk(v, p) { if (Array.isArray(v) && v.length > 1 && CMP.canonical(v[0]) !== CMP.canonical(v[1])) arrays.push(p); if (v && typeof v === "object" && !(v instanceof Uint8Array)) for (const [k, x] of Object.entries(v)) walk(x, `${p}/${k}`); })(base, "");
  for (const p of arrays.filter(p => !unsealed.some(u => p.startsWith(u))).slice(0, 2)) { const m = structuredClone(base); const arr = p ? CMP.resolvePointer(m, p).value : m; [arr[0], arr[1]] = [arr[1], arr[0]]; out.push([`swapped ${p}`, m]); }
  return { base, out };
}

test("lot 4: result-exact/1 and seam comparators accept every sealed record and reject altered outputs", () => {
  let checked = 0;
  for (const c of cases) {
    const expected = expectedOf(c);
    const id = c.comparatorIds.find(x => ["result-exact/1", "seam-exact/1", "profile-c14n/2"].includes(x));
    if (!id) continue;
    const compare = CMP.COMPARATORS[id];
    const { base, out } = mutations(expected);
    assert.equal(compare(expected, base).ok, true, `${c.caseId}: ${compare(expected, base).failures}`);
    for (const [label, m] of out) assert.equal(compare(expected, m).ok, false, `${c.caseId}: ${id} accepted ${label}`);
    checked++;
  }
  assert.ok(checked >= 380, `${checked} cases checked`);
});

test("lot 4: targeted alterations named by the review are rejected", () => {
  const byId = id => { const c = cases.find(x => x.caseId === id); return { c, e: expectedOf(c) }; };
  // Refusal reports: an extra diagnostic, emptied report entries or a code-only record fail.
  for (const c of cases.filter(x => x.expectedStatus.startsWith("refused:"))) {
    const e = expectedOf(c), r = e.result;
    const codeOnly = { status: "refused", code: r.code };
    assert.equal(CMP.resultExact(e, codeOnly).ok, false, `${c.caseId} code-only`);
    if (recordUnsealed(e).some(u => u.pointer === "/diagnostics")) {
      // Python-sealed lint findings are UNSEALED; lint-includes/1 holds the listed entries.
      assert.ok(c.comparatorIds.includes("lint-includes/1") && e.includes?.length > 0, `${c.caseId} UNSEALED diagnostics without includes`);
      continue;
    }
    const extra = structuredClone(r); extra.diagnostics = [...extra.diagnostics, { code: "x" }];
    assert.equal(CMP.resultExact(e, extra).ok, false, `${c.caseId} extra diagnostic`);
    if (r.report && r.report.entries.length) { const emptied = structuredClone(r); emptied.report.entries = []; assert.equal(CMP.resultExact(e, emptied).ok, false, `${c.caseId} emptied entries`); }
  }
  // Export IR: copied geometry, style and label lines are compared; loss coordinates too.
  for (const id of ["export-001-main-drawio", "export-027-variety-drawio", "export-026-grid-successor"]) {
    const { e } = byId(id);
    const ir = e.result.payload.ir, k = ir.findIndex(r => r.kind === "node");
    for (const alter of [r => { r.payload.ir[k].bounds.x += 1; }, r => { delete r.payload.ir[k].style; }, r => { r.payload.ir[k].style = []; },
      r => { const ix = r.payload.ir.findIndex(x => x.label); if (ix >= 0) r.payload.ir[ix].label.lines = []; else r.payload.ir[0].bounds.width += 1; },
      r => { r.report.entries[0].result = { domain: "artifact", pointer: "/ir/1", targetId: r.payload.ir[1].id, provenance: "exact" }; },
      r => { r.report.artifacts[0].digest = "0".repeat(64); }]) {
      const m = structuredClone(e.result); alter(m);
      assert.equal(CMP.resultExact(e, m).ok, false, `${id} alteration`);
    }
  }
  // profile-report/2 rejects reordered entries, unreachable losses and refused artifacts with digests.
  const { e: m1 } = byId("export-001-main-drawio");
  const swapped = structuredClone(m1.result); [swapped.report.entries[0], swapped.report.entries[1]] = [swapped.report.entries[1], swapped.report.entries[0]];
  assert.equal(CMP.reportOrder(m1, swapped).ok, false);
  const unreachable = structuredClone(m1.result); unreachable.report.artifacts[0].entryIndexes = unreachable.report.artifacts[0].entryIndexes.slice(1);
  assert.equal(CMP.reportOrder(m1, unreachable).ok, false);
  const { e: ref } = byId("export-004-repeated-sparx-ambiguous");
  const refusedWithDigest = structuredClone(ref.result); refusedWithDigest.report.artifacts = [{ format: "sparx", capability: "unsupported", digest: "0".repeat(64), entryIndexes: [] }];
  assert.equal(CMP.reportOrder(ref, refusedWithDigest).ok, false);
  // layout-route/1: route members are UNSEALED for result-exact/1 but held by the invariants.
  const { e: lay } = byId("layout-001-main");
  const bent = structuredClone(lay.result);
  const i = Number(/\/(\d+)\//.exec(lay.unsealed[0].pointer)[1]);
  bent.payload.geometry[i].waypoints[0] = { x: 1, y: 1 };
  bent.payload.geometry[i].bounds = { x: 1, y: 1, width: bent.payload.geometry[i].bounds.x + bent.payload.geometry[i].bounds.width - 1, height: bent.payload.geometry[i].bounds.y + bent.payload.geometry[i].bounds.height - 1 };
  assert.equal(CMP.resultExact(lay, bent).ok, true, "routes are UNSEALED for result-exact/1");
  assert.equal(CMP.layoutRoute(lay, bent).ok, false, "LINK-ROUTE invariant");
  const unboxed = structuredClone(lay.result); unboxed.payload.geometry[i].bounds.width += 1;
  assert.equal(CMP.layoutRoute(lay, unboxed).ok, false, "bounds = waypoint box");
});

test("lot 4: every sealed report satisfies profile-report/2 and every UNSEALED route satisfies layout-route/1", () => {
  let reports = 0, routes = 0;
  for (const c of cases) {
    const e = expectedOf(c);
    if (c.comparatorIds.includes("profile-report/2")) { const v = CMP.reportOrder(e, conforming(e)); assert.equal(v.ok, true, `${c.caseId}: ${v.failures}`); reports++; }
    if (c.comparatorIds.includes("layout-route/1")) { const v = CMP.layoutRoute(e, e.result); assert.equal(v.ok, true, `${c.caseId}: ${v.failures}`); routes++; }
  }
  assert.ok(reports >= 80 && routes >= 3, `${reports} reports, ${routes} routed layouts`);
});

// Synthetic conforming draw.io bytes built from a sealed projection: a comparator
// self-test witness only, never an expectation and never compared with an implementation.
const xmlAttr = v => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\t/g, "&#9;").replace(/\n/g, "&#10;").replace(/\r/g, "&#13;");
function drawioWitness(projection, { order = ["id", "value", "style", "parent", "vertex", "edge", "source", "target"], extra = "", tab = false } = {}) {
  const attrs = pairs => pairs.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([k, v]) => ` ${k}="${tab && k === "name" ? v : xmlAttr(v)}"`).join("");
  const lines = [`<mxfile${extra}>`];
  for (const d of projection.diagrams) {
    lines.push(`<diagram${attrs([["id", d.id], ["name", d.name]])}>`, "<mxGraphModel>", "<root>", "<mxCell id=\"0\"/>", "<mxCell id=\"1\" parent=\"0\"/>");
    for (const c of d.cells) {
      const pairs = [["id", c.id], ...(c.value !== undefined ? [["value", c.value]] : []), ["style", "s"], ["parent", c.parent === "$layer" ? "1" : c.parent],
        ...(c.kind === "edge" ? [["edge", "1"], ["source", c.source], ["target", c.target]] : [["vertex", "1"]])];
      lines.push(`<mxCell${attrs(pairs)}>`, "<mxGeometry as=\"geometry\"/>", "</mxCell>");
    }
    lines.push("</root>", "</mxGraphModel>", "</diagram>");
  }
  lines.push("</mxfile>");
  return Buffer.from(lines.join("\n"), "utf8");
}
const serialized = (e, bytes) => { const r = conforming(e); r.payload.bytes = new Uint8Array(bytes); r.payload.digest = sha(bytes); r.report.artifacts[0].digest = sha(bytes); return r; };

test("lot 4: serialize-bytes/1 and drawio-structure/1 accept a conforming document and reject altered bytes", () => {
  for (const id of ["serialize-001-main-drawio", "serialize-002-repeated-drawio", "serialize-003-xml-escaping"]) {
    const e = expectedOf(cases.find(x => x.caseId === id));
    const good = drawioWitness(e["drawio-structure"]);
    for (const cmp of [CMP.serializeBytes, CMP.drawioStructure, CMP.resultExact]) { const v = cmp(e, serialized(e, good)); assert.equal(v.ok, true, `${id} ${cmp.name}: ${v.failures}`); }
    const bad = {
      crlf: Buffer.from(good.toString("utf8").replace(/\n/g, "\r\n")), bom: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), good]),
      indent: Buffer.from(good.toString("utf8").replace(/\n<mxCell/g, "\n  <mxCell")), paired: Buffer.from(good.toString("utf8").replace("<mxGeometry as=\"geometry\"/>", "<mxGeometry as=\"geometry\"></mxGeometry>")),
      order: drawioWitness(e["drawio-structure"], { order: ["parent", "id", "value", "style", "vertex", "edge", "source", "target"] }),
      compressed: Buffer.from(good.toString("utf8").replace(/<mxGraphModel>[\s\S]*?<\/mxGraphModel>/, "eJzLSM3JyQcABiwCFQ==")),
    };
    for (const [label, bytes] of Object.entries(bad)) assert.equal(CMP.serializeBytes(e, serialized(e, bytes)).ok, false, `${id} serialize-bytes ${label}`);
    const wrongDigest = serialized(e, good); wrongDigest.payload.digest = sha(Buffer.from("x"));
    assert.equal(CMP.serializeBytes(e, wrongDigest).ok, false, `${id} digest`);
    const projectionBad = {
      modified: drawioWitness(e["drawio-structure"], { extra: " modified=\"2026-10-18T00:00:00Z\"" }),
      cellDropped: drawioWitness({ diagrams: e["drawio-structure"].diagrams.map((d, i) => (i ? d : { ...d, cells: d.cells.slice(1) })) }),
      cellsSwapped: drawioWitness({ diagrams: e["drawio-structure"].diagrams.map((d, i) => (i ? d : { ...d, cells: [d.cells[1], d.cells[0], ...d.cells.slice(2)] })) }),
      pagesSwapped: drawioWitness({ diagrams: [...e["drawio-structure"].diagrams].reverse().concat(e["drawio-structure"].diagrams.length === 1 ? [{ id: "x", name: "x", cells: [] }] : []) }),
    };
    for (const [label, bytes] of Object.entries(projectionBad)) assert.equal(CMP.drawioStructure(e, serialized(e, bytes)).ok, false, `${id} drawio-structure ${label}`);
    if (id === "serialize-003-xml-escaping") assert.equal(CMP.drawioStructure(e, serialized(e, drawioWitness(e["drawio-structure"], { tab: true }))).ok, false, "raw tab in the name attribute");
  }
});

test("lot 4: drawio-structure/1 checks the Python-shaped projections of the vendored serializer cases", () => {
  const vendoredSerializers = cases.filter(c => c.comparatorIds.includes("drawio-structure/1") && expectedOf(c)["drawio-structure"].byteInvariants);
  assert.equal(vendoredSerializers.length, 3);
  for (const c of vendoredSerializers) {
    const e = expectedOf(c);
    const good = drawioWitness(e["drawio-structure"]);
    for (const v of [CMP.drawioStructure(e, serialized(e, good), serialized(e, good)), CMP.resultExact(e, serialized(e, good))]) assert.equal(v.ok, true, `${c.caseId}: ${v.failures}`);
    const text = good.toString("utf8");
    const bad = {
      crlf: Buffer.from(text.replace(/\n/g, "\r\n")), bom: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), good]),
      paired: Buffer.from(text.replace("<mxGeometry as=\"geometry\"/>", "<mxGeometry as=\"geometry\"></mxGeometry>")),
      compressed: Buffer.from(text.replace(/<mxGraphModel>[\s\S]*?<\/mxGraphModel>/, "eJzLSM3JyQcABiwCFQ==")),
      cellDropped: drawioWitness({ diagrams: e["drawio-structure"].diagrams.map((d, i) => (i ? d : { ...d, cells: d.cells.slice(1) })) }),
    };
    for (const [label, bytes] of Object.entries(bad)) assert.equal(CMP.drawioStructure(e, serialized(e, bytes), serialized(e, bytes)).ok, false, `${c.caseId} ${label}`);
    const wrongDigest = serialized(e, good); wrongDigest.payload.digest = sha(Buffer.from("x"));
    assert.equal(CMP.drawioStructure(e, wrongDigest, serialized(e, good)).ok, false, `${c.caseId} digest`);
    assert.equal(CMP.drawioStructure(e, serialized(e, good)).ok, false, `${c.caseId} second call missing`);
    assert.equal(CMP.drawioStructure(e, serialized(e, good), serialized(e, bad.paired)).ok, false, `${c.caseId} second call differs`);
  }
});

test("lot 4: lint-includes/1 holds the UNSEALED lint entries of the vendored preparation refusal", () => {
  const withIncludes = cases.filter(c => c.comparatorIds.includes("lint-includes/1"));
  assert.ok(withIncludes.length >= 1);
  for (const c of withIncludes) {
    const e = expectedOf(c);
    const entryOf = ({ targetId, ...rest }) => ({ ...rest, source: { domain: "tree", pointer: "", targetId: targetId ?? null, provenance: "exact" } });
    const actual = conforming(e); actual.report.entries = e.includes.map(entryOf); actual.diagnostics = actual.report.entries;
    for (const v of [CMP.lintIncludes(e, actual), CMP.resultExact(e, actual)]) assert.equal(v.ok, true, `${c.caseId}: ${v.failures}`);
    const missing = structuredClone(actual); missing.report.entries = missing.report.entries.slice(1);
    const altered = structuredClone(actual); altered.report.entries[0].code = "x";
    const retargeted = structuredClone(actual); for (const entry of retargeted.report.entries) if (entry.source.targetId) entry.source.targetId = "Task_X";
    for (const [label, m] of [["missing", missing], ["altered", altered], ["retargeted", retargeted], ["empty", { ...actual, report: { ...actual.report, entries: [] } }]])
      assert.equal(CMP.lintIncludes(e, m).ok, false, `${c.caseId} ${label}`);
  }
});

test("lot 4: parity sync PS-33 and PS-06 hold on the sealed seams", () => {
  const seams = cases.filter(c => ["layoutTicks", "layoutRegions"].includes(c.operation));
  assert.equal(seams.length, 21);
  for (const c of seams) {
    const e = expectedOf(c);
    assert.equal(e.output, undefined, c.caseId);
    assert.deepEqual(Object.keys(e.result).sort(), ["diagnostics", "payload", "status"], c.caseId);
    assert.deepEqual([e.result.status, e.result.diagnostics, c.comparatorIds], ["ok", [], ["result-exact/1"]], c.caseId);
  }
  // One IO row: every object centre on one line, each label directly below its object.
  const items = expectedOf(cases.find(c => c.caseId === "region-010-mixed-heights")).result.payload.items;
  assert.deepEqual(items.map(it => [it.bounds.y + it.bounds.height / 2, it.labelBounds.y - it.bounds.y - it.bounds.height]), [[35000, 0], [35000, 0]]);
});

test("lot 4: vendored Python cases are pinned to the Python seal and keep its values except the named decisions", () => {
  const source = json(join(root, "vendor/py/source.json"));
  assert.equal(source.commit, PY_SEAL_COMMIT);
  const listed = new Map(source.files.map(f => [f.path, f]));
  assert.deepEqual(inventory(join(root, "vendor/py")).filter(p => !["source.json", "harness-index.json"].includes(p)).sort(), [...listed.keys()].sort());
  for (const f of source.files) { const bytes = readFileSync(join(root, "vendor/py", f.path)); assert.deepEqual([bytes.length, sha(bytes)], [f.bytes, f.sha256], f.path); }
  const index = new Map(json(join(root, "index.json")).cases.map(e => [e.caseId, e]));
  assert.equal(manifest.vendored.length, VENDORED_COUNT);
  const pyValue = (py, role) => { const a = py.expectedArtifacts.find(x => x.role === role); return a.path ? json(join(root, "vendor/py/parity", a.path)) : a.json; };
  const decided = {};
  for (const v of manifest.vendored) {
    const raw = listed.get(`parity/cases/${v.caseId}.json`);
    assert.deepEqual([raw.source, raw.sha256], [v.source, v.sha256], v.caseId);
    const entry = index.get(v.caseId), c = cases.find(x => x.caseId === v.caseId), e = expectedOf(c);
    assert.equal(entry.author, "spec-seal", v.caseId);
    assert.equal(entry.vendored.caseFile.sha256, v.sha256, v.caseId);
    assert.ok(entry.derivation.includes(v.sha256) && entry.derivation.includes(PY_SEAL_COMMIT) && entry.derivation.includes("BLOCKB-PARITY-SYNC"), `${v.caseId} derivation`);
    const py = json(join(root, "vendor/py/parity/cases", `${v.caseId}.json`));
    for (const role of ["includes", "trace", "drawio-structure"]) if (py.expectedArtifacts.some(a => a.role === role)) assert.deepEqual(e[role], pyValue(py, role), `${v.caseId} ${role}`);
    const pyUnsealed = py.expectedArtifacts.find(a => a.role === "unsealed")?.json ?? [];
    const decisions = entry.decisions ?? [];
    for (const d of decisions) decided[d] = (decided[d] ?? 0) + 1;
    assert.deepEqual((e.unsealed ?? []).filter(u => u.artifact === undefined).map(u => u.pointer), [...(decisions.includes("PS-35") && !(entry.twinApplied ?? []).includes("PS-35") ? ["/payload"] : []), ...pyUnsealed], `${v.caseId} UNSEALED pointers`);
    if (py.expectedArtifacts.some(a => a.role === "results")) { assert.deepEqual(e.output, pyValue(py, "results"), v.caseId); continue; }
    const want = structuredClone(pyValue(py, "result"));
    if (decisions.includes("PS-25") || decisions.includes("PS-35")) want.diagnostics = [];
    if (decisions.includes("PS-26")) {
      const prepared = json(join(root, "vendor/py/parity", py.inputArtifacts.find(a => a.role === "prepared").path));
      want.report.entries = prepared.report.entries;
      want.report.artifacts[0].entryIndexes = prepared.report.artifacts[0].entryIndexes;
      assert.ok(want.report.entries.length > 0, v.caseId);
    }
    assert.deepEqual(e.result, want, `${v.caseId} value`);
  }
  assert.deepEqual(decided, { "PS-25": 27, "PS-35": 4, "PS-26": 3 });
  assert.deepEqual(manifest.aliases.map(a => [a.caseId, a.aliasOf]), [["render.ticks.half-even", "ticks-001-half-even"], ["render.regions.mixed-label-heights", "region-010-mixed-heights"]]);
  for (const a of manifest.aliases) {
    assert.ok(cases.some(c => c.caseId === a.aliasOf) && !cases.some(c => c.caseId === a.caseId), a.caseId);
    assert.equal(a.sha256, source.aliases.find(x => x.caseId === a.caseId).sha256, a.caseId);
  }
  for (const id of ["export.prepare.success", "export.prepare.repairable-pre-normalize", "export.prepare.options-unknown-member"]) assert.ok(!cases.some(c => c.caseId === id), `${id} is runtime-specific (PS-36)`);
});

// Review finding #20: the twin-applied mark is the structured index field twinApplied, never a derivation text.
test("lot 4: twin-applied PS-35 marks never hide a missing /payload", () => {
  const entries = json(join(root, "index.json")).cases;
  const vendored = new Set(manifest.vendored.map(v => v.caseId));
  for (const entry of entries.filter(c => Object.hasOwn(c, "twinApplied"))) {
    assert.ok(Array.isArray(entry.twinApplied) && entry.twinApplied.length > 0 && new Set(entry.twinApplied).size === entry.twinApplied.length, `${entry.caseId} twinApplied list`);
    assert.ok(entry.twinApplied.every(d => d === "PS-35" && (entry.decisions ?? []).includes(d)), `${entry.caseId} twinApplied names its own PS-35 decision`);
    assert.ok(vendored.has(entry.caseId) && entry.author === "spec-seal", `${entry.caseId} twinApplied on a vendored twin case`);
  }
  const marked = entries.filter(c => (c.twinApplied ?? []).includes("PS-35"));
  assert.deepEqual(marked.map(c => c.caseId).sort(), ["export.compile.all-fields-valid", "export.compile.digest-zero-origin", "render.compile.grid-profile", "render.compile.path-valid"]);
  for (const entry of marked) {
    const py = json(join(root, "vendor/py/parity/cases", `${entry.caseId}.json`));
    const unsealed = py.expectedArtifacts.find(a => a.role === "unsealed")?.json ?? [];
    assert.ok(unsealed.includes("/payload"), `${entry.caseId} twin record lacks /payload`);
    // The field carries the pointer rule: without it the expected UNSEALED list would name /payload twice.
    const pointers = (expectedOf(cases.find(c => c.caseId === entry.caseId)).unsealed ?? []).filter(u => u.artifact === undefined).map(u => u.pointer);
    assert.deepEqual(pointers, unsealed, `${entry.caseId} twin UNSEALED pointers kept`);
    assert.notDeepEqual(pointers, ["/payload", ...unsealed], `${entry.caseId} a mark-less entry would re-apply PS-35`);
  }
});

test("lot 4: bpmn-structure/1, source-immutability/1 and determinism/1 discriminate", () => {
  const e = expectedOf(cases.find(x => x.caseId === "bpmn-003-variety-native"));
  const xml = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" id=\"Definitions_Variety\">",
    "<bpmn:process id=\"Process_Variety\"><bpmn:serviceTask id=\"Service_V\" name=\"Run check\"/><bpmn:callActivity id=\"Call_V\" name=\"Call review\" calledElement=\"Process_Review\"/>",
    "<bpmn:endEvent id=\"End_V\" name=\"Stopped\"><bpmn:terminateEventDefinition id=\"Terminate_V\"/></bpmn:endEvent></bpmn:process>",
    "<bpmn:process id=\"Process_Review\"><bpmn:task id=\"Task_Review\" name=\"Review\"/></bpmn:process></bpmn:definitions>",
  ].join("\n");
  const ok = CMP.bpmnStructure(e, new Uint8Array(Buffer.from(xml)));
  assert.equal(ok.ok, true, ok.failures.join("; "));
  for (const [label, text] of [["calledElement dropped", xml.replace(" calledElement=\"Process_Review\"", "")], ["terminate dropped", xml.replace("<bpmn:terminateEventDefinition id=\"Terminate_V\"/>", "")],
    ["subtype downgraded", xml.replace(/serviceTask/g, "task")], ["extra call", xml.replace("</bpmn:process>\n<bpmn:process id=\"Process_Review\">", "<bpmn:callActivity id=\"Call_X\"/></bpmn:process>\n<bpmn:process id=\"Process_Review\">")]])
    assert.equal(CMP.bpmnStructure(e, new Uint8Array(Buffer.from(text))).ok, false, label);
  assert.equal(CMP.sourceImmutable({}, { before: [{ a: 1 }], after: [{ a: 1 }] }).ok, true);
  assert.equal(CMP.sourceImmutable({}, { before: [{ a: 1 }], after: [{ a: 2 }] }).ok, false);
  const det = expectedOf(cases.find(x => x.caseId === "serialize-004-determinism"));
  const b = l => Buffer.from(l);
  assert.equal(CMP.determinism(det, [{ label: "a", bytes: b("1") }, { label: "a", bytes: b("1") }, { label: "b", bytes: b("2") }, { label: "a", bytes: b("1") }]).ok, true);
  assert.equal(CMP.determinism(det, [{ label: "a", bytes: b("1") }, { label: "a", bytes: b("1") }, { label: "b", bytes: b("2") }, { label: "a", bytes: b("3") }]).ok, false);
});

test("lot 4: sealed equality and difference relations hold between cases", () => {
  const byId = id => cases.find(x => x.caseId === id);
  // layout-011 is the theme-gated twin of layout-001: same envelope, placements and base
  // geometry bytes; only the selected theme differs, and it declares geometry theme.
  const inputsOf = id => Object.fromEntries(byId(id).inputArtifacts.map(a => [a.role, a]));
  const shared = inputsOf("layout-001-main"), gated = inputsOf("layout-011-geometry-theme-gated");
  for (const role of ["envelope", "placements", "base-geometry"]) assert.equal(gated[role].sha256, shared[role].sha256, `layout-011 ${role}`);
  const themeOf = (id, themeId) => resolveArtifact(byId(id).profileArtifact).themes.find(t => t.id === themeId);
  assert.deepEqual([shared.themeId.json, themeOf("layout-001-main", shared.themeId.json).geometry, byId("layout-001-main").expectedStatus], ["plain", "shared", "ok"]);
  assert.deepEqual([gated.themeId.json, themeOf("layout-011-geometry-theme-gated", gated.themeId.json).geometry, byId("layout-011-geometry-theme-gated").expectedStatus], ["wide-own", "theme", "refused:profile-open"]);
  for (const c of cases) {
    const rel = expectedOf(c).relations;
    if (!rel) continue;
    if (rel.sameResultAs) assert.deepEqual(byId(c.caseId).expectedArtifacts.find(a => a.role === "result"), { ...byId(rel.sameResultAs).expectedArtifacts.find(a => a.role === "result") }, c.caseId);
    if (rel.sameAs) {
      const mine = expectedOf(c).result.payload, other = expectedOf(byId(rel.sameAs.case)).result.payload;
      for (const f of rel.sameAs.fields) assert.equal(mine[f], other[f], `${c.caseId} ${f}`);
      for (const f of rel.differsFrom.fields) assert.notEqual(mine[f], other[f], `${c.caseId} ${f}`);
      assert.deepEqual([...rel.sameAs.fields, ...rel.differsFrom.fields].sort(), Object.keys(mine).sort(), `${c.caseId} relation covers every output`);
    }
  }
});

// idplan-007 witnesses the UTF-16 occurrenceKey order of the counter plan (DESIGN 10.2 L801)
// against code-point order. An authoring channel once folded its U+E000 key to the empty
// string: the case bytes and the derivation source must keep it, and every named wrong key
// order must give other IDs than the sealed allocation.
test("lot 4: idplan-007 keeps its U+E000 key and separates UTF-16 order from code-point order", () => {
  const id = "idplan-007-utf16-key-order";
  const bytes = readFileSync(join(root, "cases", `${id}.json`));
  const occurrences = seq => { let n = 0; for (let i = bytes.indexOf(seq); i >= 0; i = bytes.indexOf(seq, i + 1)) n++; return n; };
  assert.equal(occurrences(Buffer.from([0xee, 0x80, 0x80])), 2, "U+E000 (UTF-8 EE 80 80) in the request list and in the expected IDs");
  assert.equal(occurrences(Buffer.from([0xf0, 0x90, 0x80, 0x80])), 2, "U+10000 (UTF-8 F0 90 80 80) in the request list and in the expected IDs");
  const source = readFileSync(join(root, "derive/lot4-cases-export.mjs"), "utf8");
  assert.ok(source.includes('const utf16 = [{ pageId: "P", occurrenceKey: "\\u{E000}", domain: "node" }, { pageId: "P", occurrenceKey: "\\u{10000}", domain: "node" }'), "derivation source keeps the braced escapes");
  const c = cases.find(x => x.caseId === id);
  const input = c.inputArtifacts.find(a => a.role === "plan-input").json;
  const keys = input.requests.map(r => r.occurrenceKey);
  assert.deepEqual([input.policy, input.counterOrigin, input.pages, keys], ["counter", 0, [{ pageId: "P", order: 0 }], ["\u{E000}", "\u{10000}", "z", "Z"]]);
  assert.ok(input.requests.every(r => r.pageId === "P" && r.domain === "node" && r.occurrenceKey.length > 0), "ordinary occurrence keys are nonempty (DESIGN L130)");
  const sealed = expectedOf(c).result.payload.ids.map(r => [r.occurrenceKey, r.id]);
  assert.deepEqual(sealed, [["Z", "e_0"], ["z", "e_1"], ["\u{10000}", "e_2"], ["\u{E000}", "e_3"]]);
  // One page, one domain and counterOrigin 0: the allocation is the key order alone.
  const allocate = order => [...keys].sort(order).map((k, i) => [k, `e_${i}`]);
  const lex = (x, y) => { for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; };
  const units = s => Array.from({ length: s.length }, (_, i) => s.charCodeAt(i));
  const points = s => Array.from(s, ch => ch.codePointAt(0));
  const folded = s => units(s).map(u => (u >= 0x41 && u <= 0x5a ? u + 0x20 : u));
  assert.deepEqual(allocate((a, b) => lex(units(a), units(b))), sealed, "UTF-16 code-unit order");
  const wrong = {
    "code-point order": allocate((a, b) => lex(points(a), points(b))),
    "UTF-8 byte order": allocate((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))),
    "case-folded order (locale collation puts z before Z)": allocate((a, b) => lex(folded(a), folded(b))),
    "request order": keys.map((k, i) => [k, `e_${i}`]),
  };
  for (const [label, ids] of Object.entries(wrong)) assert.notDeepEqual(ids, sealed, label);
  assert.deepEqual(wrong["code-point order"].slice(2), [["\u{E000}", "e_2"], ["\u{10000}", "e_3"]]);
});

// ------------------------------------------------- independence guard
// Static AST scan of the derivation helpers and comparators: only allowlisted
// node builtins and existing siblings are imported; no dynamic import, require,
// eval/Function, global or process escape, import.meta other than url, or
// string literal naming an implementation path.
const BANNED_REFERENCES = new Set(["require", "eval", "Function", "globalThis", "global", "module", "exports", "getBuiltinModule", "createRequire", "Reflect", "WebAssembly", "Worker", "importScripts"]);
const BANNED_PROPERTIES = new Set(["constructor", "getBuiltinModule", "mainModule", "dlopen", "_linkedBinding", "__proto__"]);
const BANNED_STRINGS = new Set(["constructor", "require", "eval", "Function", "getBuiltinModule", "mainModule", "dlopen", "_linkedBinding", "createRequire", "__proto__",
  "module", "node:module", "vm", "node:vm", "child_process", "node:child_process", "worker_threads", "node:worker_threads", "src", "dist", "node_modules"]);
const IMPLEMENTATION_PATH = /(^|[/\\])(src|dist|node_modules)([/\\]|$)|bpmn-moddle|bpmn-js|@sentropic/;
export function guardViolations(path, text, { allowed, siblings }) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = [];
  const nameOf = node => node.parent && ((ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) || (ts.isPropertyAssignment(node.parent) && node.parent.name === node) ||
    ((ts.isMethodDeclaration(node.parent) || ts.isPropertyDeclaration(node.parent) || ts.isGetAccessor(node.parent) || ts.isSetAccessor(node.parent)) && node.parent.name === node) ||
    ts.isImportSpecifier(node.parent) || ts.isExportSpecifier(node.parent) || (ts.isBindingElement(node.parent) && node.parent.propertyName === node));
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const spec = node.moduleSpecifier.text;
      if (!allowed.has(spec) && !(/^\.\/lot4-[a-z-]+\.mjs$/.test(spec) && siblings.has(spec.slice(2)))) found.push(`import ${spec}`);
    }
    if (ts.isImportEqualsDeclaration(node)) found.push("import-equals");
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("dynamic import");
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === "url")) found.push("import.meta other than url");
    if (ts.isIdentifier(node)) {
      if (!nameOf(node) && BANNED_REFERENCES.has(node.text)) found.push(`reference ${node.text}`);
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node && BANNED_PROPERTIES.has(node.text)) found.push(`property ${node.text}`);
      if (node.text === "process" && !nameOf(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node && node.parent.name.text === "argv")) found.push("process escape");
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const t = node.text;
      if (BANNED_STRINGS.has(t) || IMPLEMENTATION_PATH.test(t)) found.push(`string ${JSON.stringify(t)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
const GUARDED = [
  { dir: "derive", allowed: new Set(["node:crypto", "node:fs", "node:path", "node:url"]) },
  { dir: "comparators", allowed: new Set(["node:crypto"]) },
];

test("lot 4: derivation helpers and comparators import only allowlisted builtins and siblings", () => {
  for (const { dir, allowed } of GUARDED) {
    const names = readdirSync(join(root, dir)).filter(n => n.endsWith(".mjs"));
    const siblings = new Set(names);
    assert.ok(names.length >= 2);
    for (const name of names) assert.deepEqual(guardViolations(name, readFileSync(join(root, dir, name), "utf8"), { allowed, siblings }), [], `${dir}/${name}`);
  }
});

test("lot 4: the independence guard catches every bypass form and ignores comments", () => {
  const derive = { allowed: GUARDED[0].allowed, siblings: new Set(readdirSync(join(root, "derive"))) };
  const comparators = { allowed: GUARDED[1].allowed, siblings: new Set(readdirSync(join(root, "comparators"))) };
  const base = readFileSync(join(root, "derive/lot4-core.mjs"), "utf8");
  const bypasses = [
    'import { compileProfile } from "../../../../../src/profile/index.js";',
    'import * as io from "../../../../../dist/io/index.js";',
    'export * from "../../../../../src/profile/compiler.js";',
    'import /* a */ { resolveTheme } /* b */ from /* c */ "@sentropic/bpmn-canvas/profile";',
    'import BpmnModdle from "bpmn-moddle";',
    'import { x } from "./not-a-sibling.mjs";',
    'import { x } from "./lot4-missing.mjs";',
    'const m = await import("node:fs");',
    'const spec = "./lot4-core.mjs"; const m = await import(spec);',
    "const m = await import(`./${\"lot4\"}-core.mjs`);",
    'const m = await import(/* webpackIgnore: true */ "./lot4-core.mjs");',
    'const r = require("node:fs");',
    'const req = require; req("node:fs");',
    'require.call(null, "node:fs");',
    '(0, require)("node:fs");',
    'module.require("node:fs");',
    'const { require: r } = globalThis;',
    'import { createRequire } from "node:module";',
    'const m = process.getBuiltinModule("node:module");',
    'const p = process; p.binding("fs");',
    'process["dlopen"]({}, "x");',
    'globalThis.require("node:fs");',
    'globalThis["req" + "uire"]("node:fs");',
    'eval("import(\'node:fs\')");',
    'new Function("return import(\'node:fs\')")();',
    '(() => 0).constructor("return import(\'node:fs\')")();',
    'const f = (() => 0)["constructor"];',
    'import.meta.resolve("./lot4-core.mjs");',
    'readFileSync(join(here, "..", "..", "src", "profile", "compiler.ts"));',
    'readFileSync("../../../../../dist/profile/index.js");',
    'Reflect.apply(Math.max, null, []);',
    'new Worker("./x.mjs");',
    'WebAssembly.compile(new Uint8Array());',
    'import x = require("x");',
  ];
  for (const injected of bypasses) assert.ok(guardViolations("lot4-core.mjs", `${injected}\n${base}`, derive).length > 0, injected);
  assert.ok(guardViolations("lot4-compare.mjs", `import { readFileSync } from "node:fs";\n${base}`, comparators).length > 0, "comparators may not read files");
  // Comments and inert strings are not imports.
  for (const inert of ['// const r = require("../../src/profile/index.js");', '/* import { x } from "../../dist/x.js"; */', 'const note = "import { x } from y";'])
    assert.deepEqual(guardViolations("lot4-core.mjs", `${inert}\n${base}`, derive), [], inert);
});

// The pinned brand lexicon (hashes only) also covers the private profile label.
test("lot 4: sealed files carry no brand word, private profile label or absolute home path", () => {
  const scope = json(join(repo, "docs/design/profile-externalization-scope.json"));
  const files = [...inventory(root).map(p => join(root, p)), join(repo, "docs/design/block-b-lot4-expectations.md"), ledgerPath, syncLedgerPath, microLedgerPath, keyLedgerPath, twinLedgerPath, fileURLToPath(import.meta.url)];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(brandTokens(text, scope.extraHashes).length, 0, `brand guard ${file.slice(repo.length)}`);
    assert.doesNotMatch(text, /\/home\/|[A-Za-z]:\\Users\\/, `absolute home path ${file.slice(repo.length)}`);
  }
});

// Reseal ledgers: the fix-round ledger (history) binds the reviewed seal to the SF
// seal; the parity-sync ledger (history) binds the SF seal to the PS seal; the
// micro-fix ledger (history) binds the PS seal to the MF seal; the Unicode key
// ledger (history) binds the MF seal to the KF seal; the twin-applied field
// ledger binds the KF seal to the current bytes.
test("lot 4: the reseal ledgers chain the reviewed seal, the fix-round seal and the current bytes", () => {
  assert.ok(existsSync(ledgerPath) && existsSync(syncLedgerPath) && existsSync(microLedgerPath) && existsSync(keyLedgerPath) && existsSync(twinLedgerPath));
  const pin = rel => { const bytes = readFileSync(join(repo, rel)); return { bytes: bytes.length, sha256: sha(bytes) }; };
  const history = json(ledgerPath);
  assert.equal(history.format, "block-b-lot4-reseal/1");
  assert.deepEqual({ commit: history.predecessor.commit, sha256: history.predecessor.seal.sha256, caseCount: history.predecessor.caseCount }, REVIEWED_SEAL);
  assert.deepEqual({ sha256: history.successor.seal.sha256, caseCount: history.successor.caseCount }, { sha256: SF_SEAL.sha256, caseCount: SF_SEAL.caseCount });
  const sync = json(syncLedgerPath);
  assert.equal(sync.format, "block-b-lot4-reseal/1");
  assert.deepEqual(sync.predecessorLedger, { path: "docs/design/receipts/block-b-lot4-reseal.json", ...pin("docs/design/receipts/block-b-lot4-reseal.json") });
  assert.deepEqual({ commit: sync.predecessor.commit, sha256: sync.predecessor.seal.sha256, caseCount: sync.predecessor.caseCount }, SF_SEAL);
  assert.deepEqual(sync.predecessor.seal, history.successor.seal);
  assert.deepEqual({ sha256: sync.successor.seal.sha256, caseCount: sync.successor.caseCount }, { sha256: PS_SEAL.sha256, caseCount: PS_SEAL.caseCount });
  const micro = json(microLedgerPath);
  assert.equal(micro.format, "block-b-lot4-reseal/1");
  assert.deepEqual(micro.predecessorLedger, { path: "docs/design/receipts/block-b-lot4-parity-sync.json", ...pin("docs/design/receipts/block-b-lot4-parity-sync.json") });
  assert.deepEqual({ commit: micro.predecessor.commit, sha256: micro.predecessor.seal.sha256, caseCount: micro.predecessor.caseCount }, PS_SEAL);
  assert.deepEqual(micro.predecessor.seal, sync.successor.seal);
  assert.deepEqual({ sha256: micro.successor.seal.sha256, caseCount: micro.successor.caseCount }, { sha256: MF_SEAL.sha256, caseCount: MF_SEAL.caseCount });
  const key = json(keyLedgerPath);
  assert.equal(key.format, "block-b-lot4-reseal/1");
  assert.deepEqual(key.predecessorLedger, { path: "docs/design/receipts/block-b-lot4-microfix-reseal.json", ...pin("docs/design/receipts/block-b-lot4-microfix-reseal.json") });
  assert.deepEqual({ commit: key.predecessor.commit, sha256: key.predecessor.seal.sha256, caseCount: key.predecessor.caseCount }, MF_SEAL);
  assert.deepEqual(key.predecessor.seal, micro.successor.seal);
  assert.deepEqual({ sha256: key.successor.seal.sha256, caseCount: key.successor.caseCount }, { sha256: KF_SEAL.sha256, caseCount: KF_SEAL.caseCount });
  const ledger = json(twinLedgerPath);
  assert.equal(ledger.format, "block-b-lot4-reseal/1");
  assert.deepEqual(ledger.predecessorLedger, { path: "docs/design/receipts/block-b-lot4-unicode-key-fix.json", ...pin("docs/design/receipts/block-b-lot4-unicode-key-fix.json") });
  assert.deepEqual({ commit: ledger.predecessor.commit, sha256: ledger.predecessor.seal.sha256, caseCount: ledger.predecessor.caseCount }, KF_SEAL);
  assert.deepEqual(ledger.predecessor.seal, key.successor.seal);
  assert.deepEqual({ bytes: ledger.successor.seal.bytes, sha256: ledger.successor.seal.sha256 }, pin(ledger.successor.seal.path));
  assert.equal(ledger.successor.caseCount, json(join(root, "index.json")).caseCount);
  assert.equal(ledger.successor.vendoredCases, VENDORED_COUNT);
  const paths = ledger.supersedesFiles.map(e => e.path);
  assert.deepEqual(paths, [...new Set(paths)].sort());
  for (const entry of ledger.supersedesFiles) {
    assert.deepEqual(entry.new, pin(entry.path), entry.path);
    assert.notDeepEqual(entry.old, entry.new, entry.path);
  }
  assert.ok(paths.includes(ledger.successor.seal.path) && paths.includes("tests/profile-lot4-seal.test.mjs"));
});
