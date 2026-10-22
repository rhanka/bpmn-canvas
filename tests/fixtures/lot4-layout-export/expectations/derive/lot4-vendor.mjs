// Vendored Python lot-4 parity cases (BLOCKB-PARITY-SYNC sections 2.1 and 2.2,
// rows PS-H20, PS-H21, PS-H22). The files under vendor/py are byte-identical to
// the Python seal commit named in vendor/py/source.json; this module checks their
// digests and re-expresses each case as a JS corpus/1 record. Paths, roles,
// comparator ids and the UNSEALED form are re-expressed; values are kept, except
// where a parity-sync section-1 decision changes them (PS-25, PS-35, PS-26): such
// a value is derived from the Python case plus the decision and the case names
// the decision. No value is recomputed from an implementation.
// Imports node builtins and sibling derivation modules only.
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { B, clone, compareText, jcs } from "./lot4-core.mjs";
import { EXPECTATIONS, SECTIONS, SEAL_PREFIX } from "./lot4-context.mjs";

const VENDOR_DIR = join(EXPECTATIONS, "vendor", "py");
const VENDOR_PREFIX = `${SEAL_PREFIX}vendor/py/`;
const read = rel => JSON.parse(readFileSync(join(VENDOR_DIR, rel), "utf8"));
function listing(dir, rel = "") {
  const out = [];
  for (const name of readdirSync(dir).sort(compareText)) {
    const full = join(dir, name), r = rel ? `${rel}/${name}` : name;
    if (lstatSync(full).isDirectory()) out.push(...listing(full, r)); else out.push(r);
  }
  return out;
}

// Python comparator ids -> JS comparator ids (section 2.2). compile-verdict/1
// compared status and code only; after PS-25/PS-35 the whole PureResult is
// sealed, hence result-exact/1. The stage trace is runtime mechanics: its
// comparator maps to source-immutability/1 and the trace is listed UNSEALED.
const COMPARATOR_MAP = {
  "result-exact/1": "result-exact/1", "compile-verdict/1": "result-exact/1", "lint-includes/1": "lint-includes/1",
  "drawio-structure/1": "drawio-structure/1", "source-immutability/1": "source-immutability/1", "stage-trace/1": "source-immutability/1",
};
const REASONS = {
  bytes: "Python seal UNSEALED pointer: DESIGN R3.3 fixes no draw.io bytes (structural until engine goldens, OPEN-EXPORT-EVIDENCE); the bytes and digests are checked by drawio-structure/1 (projection, byte invariants, digest = SHA-256 of the bytes).",
  lint: "Python seal UNSEALED pointer: the standard entries and raw findings of a refused preparation are block-A lint bridge output (lot 1); only the partial entries of the includes artifact are required (lint-includes/1).",
  trace: "Python stage trace of the private pipeline observer seam: runtime mechanics, not compared by JS (BLOCKB-PARITY-SYNC section 2.2); the input immutability it accompanies is checked by source-immutability/1.",
  payload: "CompiledProfile is an in-memory implementation object without a closed DESIGN wire shape (BLOCKB-PARITY-SYNC PS-35); compile success and empty diagnostics are sealed.",
};
const reasonOf = pointer => (/^\/(payload\/(bytes|digest)|report\/artifacts\/0\/digest)$/.test(pointer) ? REASONS.bytes
  : /^\/(diagnostics|report\/(entries|rawStandardFindings))$/.test(pointer) ? REASONS.lint : undefined);

export function vendorPyCases(ctx) {
  const { addCase } = ctx;
  const source = read("source.json");
  const harness = read("harness-index.json");
  if (source.format !== "lot4-py-vendor/1" || harness.format !== "lot4-py-harness-index/1" || harness.commit !== source.commit) throw new Error("vendor/py: format or commit");
  // Every vendored byte sequence is pinned and nothing else lives under vendor/py.
  const pinned = new Map(source.files.map(f => [f.path, f]));
  const present = listing(VENDOR_DIR).filter(p => !["source.json", "harness-index.json"].includes(p));
  if (jcs(present) !== jcs([...pinned.keys()].sort(compareText))) throw new Error("vendor/py inventory");
  for (const f of source.files) {
    const bytes = readFileSync(join(VENDOR_DIR, f.path));
    if (bytes.length !== f.bytes || B(bytes) !== f.sha256) throw new Error(`vendor/py drift ${f.path}`);
  }
  const vendorRef = rel => {
    const f = pinned.get(rel);
    if (!f) throw new Error(`vendor/py: ${rel} not vendored`);
    return { path: `${VENDOR_PREFIX}${rel}`, sha256: f.sha256 };
  };
  const parityRef = (pyPath, sha256) => {
    const r = vendorRef(`parity/${pyPath}`);
    if (r.sha256 !== sha256) throw new Error(`vendor/py digest ${pyPath}`);
    return r;
  };
  const sealOf = id => source.harnessManifests.find(m => m.path.startsWith(id.startsWith("render.") ? "tests/profile_render/" : "tests/profile_export/"));
  const vendored = [], packages = new Map();
  // Package inputs per vendored profile: the lot-0 packages are already vendored in
  // the JS tree with the same raw bytes; the render packages are under vendor/py.
  const packageOf = (profileRef, profile) => {
    const lot0 = profile.base.id === "neutral-base/1";
    const base = lot0 ? ctx.vendored("neutral-base.json") : vendorRef("packages/render-base.json");
    const descriptors = lot0 ? ctx.vendored("neutral-descriptors.json") : vendorRef("packages/render-descriptors.json");
    if (base.sha256 !== profile.base.sha256 || descriptors.sha256 !== profile.descriptors[0].sha256 || profile.descriptors.length !== 1) throw new Error(`package pins ${profileRef.path}`);
    const metrics = ctx.vendored("neutral-metrics.json");
    if (profile.resources.length !== 1 || profile.resources[0].assetKey !== "neutral-metrics.json" || profile.resources[0].sha256 !== metrics.sha256) throw new Error(`profile resources ${profileRef.path}`);
    packages.set(profileRef.path, { profile: profileRef, base, descriptors, registry: ctx.vendored("neutral-registry.json"), schema: ctx.vendored("profile-mechanism-1.schema.json"), assets: [metrics] });
  };
  const profileAt = ref => {
    const r = parityRef(ref.path, ref.sha256);
    packageOf(r, JSON.parse(readFileSync(join(VENDOR_DIR, "parity", ref.path), "utf8")));
    return r;
  };
  // Nested artifact references of inline inputs (sequence steps) are re-expressed too.
  const repath = (value, key) => {
    if (Array.isArray(value)) return value.map(v => repath(v));
    if (value && typeof value === "object") {
      if (typeof value.path === "string" && typeof value.sha256 === "string") return { ...value, ...(key === "profileArtifact" ? profileAt(value) : parityRef(value.path, value.sha256)) };
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, repath(v, k)]));
    }
    return value;
  };
  for (const h of harness.cases) {
    const id = h.caseId;
    const caseFile = pinned.get(`parity/cases/${id}.json`);
    const py = read(`parity/cases/${id}.json`);
    if (py.caseId !== id) throw new Error(`vendor/py case ${id}`);
    // twinApplied: the decisions of `decisions` already applied on the twin side at the decided head; the
    // sealed value is the twin record unchanged. A structured field, read by the seal test (not the derivation text).
    const decisions = [], decided = [], reexpressed = [], twinApplied = [];
    const exp = Object.fromEntries(py.expectedArtifacts.map(a => [a.role, a]));
    const valueOf = a => (a.path ? JSON.parse(readFileSync(join(VENDOR_DIR, "parity", a.path), "utf8")) : clone(a.json));
    let status = py.expectedStatus, result, unsealed = [];
    const decidedPointers = new Set();
    let comparators = [...new Set(py.comparatorIds.map(c => { if (!COMPARATOR_MAP[c]) throw new Error(`${id}: comparator ${c}`); return COMPARATOR_MAP[c]; }))];
    if (py.comparatorIds.includes("compile-verdict/1")) reexpressed.push("compile-verdict/1 becomes result-exact/1 on the whole PureResult");
    if (py.comparatorIds.includes("stage-trace/1")) reexpressed.push("stage-trace/1 maps to source-immutability/1 and the trace artifact is listed UNSEALED");
    if (py.operation === "compileProfile") {
      const r = valueOf(exp.result);
      if (r.status === "refused" && (Object.keys(r).length === 2
        || (Object.keys(r).length === 3 && typeof r.code === "string" && Array.isArray(r.diagnostics) && r.diagnostics.length === 0))) {
        result = { role: "result", json: { status: "refused", code: r.code, diagnostics: [] } };
        decisions.push("PS-25"); decided.push("PS-25: the compile refusal is the PureResult {status, code, diagnostics: []}; the Python record {status, code} gains diagnostics: [].");
        if (!py.comparatorIds.includes("compile-verdict/1")) reexpressed.push("compile-verdict/1 becomes result-exact/1 on the whole PureResult");
      } else if (r.status === "ok" && Object.keys(r).length === 2 && Array.isArray(r.diagnostics) && r.diagnostics.length === 0) {
        result = { role: "result", json: { status: "ok", diagnostics: [] } };
        unsealed.push({ pointer: "/payload", reason: REASONS.payload });
        decisions.push("PS-35"); twinApplied.push("PS-35"); decided.push("PS-35: the compile success observable is {status: ok, payload, diagnostics: []} with /payload UNSEALED; already applied on the twin side at the decided head (conductor ruling 2026-10-19, PS-35 double application), so the sealed value is taken unchanged from the twin record and is not re-applied.");
        reexpressed.push("the twin result-exact/1 record is kept with the single UNSEALED /payload pointer");
        decidedPointers.add("/payload");
      } else if (r.status === "ok" && Object.keys(r).length === 1) {
        result = { role: "result", json: { status: "ok", diagnostics: [] } };
        unsealed.push({ pointer: "/payload", reason: REASONS.payload });
        decisions.push("PS-35"); decided.push("PS-35: the compile success observable is {status: ok, payload, diagnostics: []} with /payload UNSEALED; the Python record {status} gains diagnostics: [] and the UNSEALED payload pointer.");
      } else throw new Error(`${id}: compile record`);
    } else if (py.operation === "serializePrepared" && status === "ok") {
      // PS-26: serializePrepared carries the prepared report entries and idMap and
      // one artifact record listing every entry index (JS rule).
      const r = valueOf(exp.result);
      const preparedRef = py.inputArtifacts.find(a => a.role === "prepared");
      const prepared = valueOf(preparedRef);
      const derivedResult = clone(r);
      derivedResult.report.entries = clone(prepared.report.entries);
      derivedResult.report.artifacts[0].entryIndexes = clone(prepared.report.artifacts[0].entryIndexes);
      const rule = { status: "ok", operation: "serializePrepared", profileIdentity: prepared.profileIdentity, baseRevision: prepared.semanticRevision, revision: prepared.semanticRevision,
        report: { reportVersion: "2", operation: "serializePrepared", sourceIdentity: prepared.profileIdentity, targetIdentity: prepared.profileIdentity, inputRevision: prepared.semanticRevision,
          outputRevision: prepared.semanticRevision, entries: prepared.report.entries, rawStandardFindings: [], idMap: prepared.idMap,
          artifacts: [{ format: prepared.format, capability: prepared.capability, entryIndexes: prepared.report.artifacts[0].entryIndexes }] },
        payload: { format: prepared.format, idMap: prepared.idMap, capability: prepared.capability } };
      if (jcs(derivedResult) !== jcs(rule)) throw new Error(`${id}: PS-26 leaves another difference`);
      const n = prepared.report.entries.length;
      if (jcs(prepared.report.artifacts[0].entryIndexes) !== jcs([...Array(n).keys()])) throw new Error(`${id}: prepared entry indexes`);
      result = { role: "result", ...ctx.artifact(`${id}.serialize-result.json`, derivedResult) };
      decisions.push("PS-26"); decided.push(`PS-26: the report carries the ${n} prepared report entries and the prepared idMap, and its artifact record lists every entry index (0..${n - 1}); the Python record had no entry and entryIndexes [].`);
    } else if (exp.results) {
      // mapExportSequence: one record per call. JS seam convention: role output,
      // whole-artifact canonical equality; corpus/1 status spelling (A5).
      if (status !== "sequence" || !Array.isArray(exp.results.json)) throw new Error(`${id}: sequence`);
      result = { role: "output", json: clone(exp.results.json) };
      status = "ok";
      comparators = comparators.map(c => (c === "result-exact/1" ? "seam-exact/1" : c));
      reexpressed.push("role results becomes output with seam-exact/1, the Python status spelling sequence becomes ok (A5: the sequence seam completes; each step record keeps its own status) and the step artifact paths point at vendor/py");
    } else {
      const a = exp.result;
      result = a.path ? { role: "result", ...parityRef(a.path, a.sha256) } : { role: "result", json: clone(a.json) };
    }
    if (exp.unsealed) {
      const rest = exp.unsealed.json.filter(pointer => !decidedPointers.has(pointer));
      unsealed.push(...rest.map(pointer => { const reason = reasonOf(pointer); if (!reason) throw new Error(`${id}: unsealed ${pointer}`); return { pointer, reason }; }));
      if (rest.length) reexpressed.push("the UNSEALED pointer list is written in the JS {pointer, reason} form with the same pointers");
    }
    if (exp.trace) unsealed.push({ artifact: "trace", pointer: "", reason: REASONS.trace });
    const others = py.expectedArtifacts.filter(a => !["result", "results", "unsealed"].includes(a.role)).map(a => {
      if (a.path) throw new Error(`${id}: referenced ${a.role}`);
      return { role: a.role, json: clone(a.json) };
    });
    const expected = [result, ...(unsealed.length ? [{ role: "unsealed", json: unsealed }] : []), ...others];
    const inputs = py.inputArtifacts.map(a => (a.path ? { role: a.role, ...parityRef(a.path, a.sha256) } : { role: a.role, json: repath(clone(a.json)) }));
    const profile = py.profileArtifact ? profileAt(py.profileArtifact) : null;
    const sections = [...new Set([...h.clause.matchAll(/§(\d+(?:\.\d+)*)/g)].map(m => m[1]))];
    if (!sections.length) throw new Error(`${id}: clause ${h.clause}`);
    const clause = sections.map(s => { if (!SECTIONS[s]) throw new Error(`${id}: section ${s}`); return { section: s, lines: [...SECTIONS[s]] }; });
    const seal = sealOf(id);
    const origin = `the Python lot-4 seal (commit ${source.commit}; ${seal.path} SHA-256 ${seal.sha256}), case file ${caseFile.source} SHA-256 ${caseFile.sha256}`;
    const derivation = [
      decisions.length ? `Vendored from ${origin}; values owned by that seal (BLOCKB-HARMONIZATION §3, BLOCKB-PARITY-SYNC) except as decided. ${decided.join(" ")}`
        : `Vendored unchanged from ${origin}; values owned by that seal (BLOCKB-HARMONIZATION §3, BLOCKB-PARITY-SYNC).`,
      reexpressed.length ? `Re-expressed for the JS corpus: ${reexpressed.join("; ")}.` : "",
      `Python derivation (${h.author}): ${h.derivation}`,
    ].filter(Boolean).join(" ");
    addCase({
      caseId: id, group: id.split(".").slice(0, 2).join("."), operation: py.operation, phase: py.phase, profile, inputs, expected, status, comparators,
      clause, derivation, wrong: `Any output that differs from the Python-sealed record of this witness: ${h.witness.replace(/\.$/, "")}.`,
      ...(decisions.length ? { decisions } : {}), ...(twinApplied.length ? { twinApplied } : {}), author: h.author,
      vendored: { from: "python-lot4-seal", commit: source.commit, caseFile: { path: caseFile.source, sha256: caseFile.sha256 }, harness: h.harness, citation: h.clause, witness: h.witness, ...(h.inputFrom ? { inputFrom: h.inputFrom } : {}) },
    });
    vendored.push({ caseId: id, source: caseFile.source, sha256: caseFile.sha256 });
  }
  for (const a of source.aliases) if (vendored.some(v => v.caseId === a.caseId)) throw new Error(`alias ${a.caseId} is vendored`);
  return {
    vendored, aliases: source.aliases.map(({ caseId, aliasOf, sha256 }) => ({ caseId, aliasOf, sha256 })), packages: [...packages.values()],
    files: [...source.files.map(f => ({ path: `vendor/py/${f.path}`, sha256: f.sha256 })),
      ...["source.json", "harness-index.json"].map(n => ({ path: `vendor/py/${n}`, sha256: B(readFileSync(join(VENDOR_DIR, n))) }))],
    source: { commit: source.commit, parityManifest: source.parityManifest, harnessManifests: source.harnessManifests, authority: source.authority },
  };
}
