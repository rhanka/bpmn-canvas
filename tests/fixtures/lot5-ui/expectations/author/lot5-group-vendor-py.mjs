// Group "py": the Python lot-5 parity cases vendored unchanged (block-B parity
// sync, BLOCKB-PARITY-SYNC sections 2.1, 2.2 and 3.3, row PS-H25). vendor/py/
// holds the Python seal's bytes (profiles, packages, the five fixture records
// and the parity records), each checked against its raw SHA-256. A case record
// re-expresses only the file layout (vendor/py/ paths), the expected roles and
// the comparator ids of its Python parity record; every expected value is the
// Python JSON of the resealed owning seal (JCS-equal), decision PS-35 included
// (applied by that seal to its two compile successes), except the refusal code
// of the two CODE_CORRECTIONS cases (CR-10 arbitration). Nothing is recomputed
// and no interpreter output is read.
import { readFileSync } from "node:fs";
import { B, jcs, clone } from "./lot5-arith.mjs";
import { cases, clauseIndex, rawFixture, cite } from "./lot5-kit.mjs";

export const VENDOR = "vendor/py/";
const ROOT = new URL("../", import.meta.url);
const REPO = new URL("../../../../../", import.meta.url);
// Transcribed source pins and texts (author/lot5-vendor-py.json): seal, files, lot0, cases; nothing in it is computed.
const TABLE = JSON.parse(readFileSync(new URL("./lot5-vendor-py.json", import.meta.url), "utf8"));
if (TABLE.format !== "lot5-vendor-py/1") throw new Error("lot5-vendor-py.json format");
const { seal: PY_SEAL, files: PY_FILES, lot0: PY_LOT0, cases: PY_CASES } = TABLE;
const SOURCE = `the Python lot-5 seal ${PY_SEAL.manifest.sha256} (commit ${PY_SEAL.commit})`;
const OWNED = "values owned by that seal (BLOCKB-HARMONIZATION §3, BLOCKB-PARITY-SYNC)";

/**
 * CR-10 arbitration (README "CR-10 arbitration"): two vendored compile refusals keep their Python
 * bytes, but their case seals the decided refusal code; the Python seal owns the update of its
 * records. An entry fails the build once the vendored record carries the decided code, so the
 * re-vendor of the updated Python seal removes it.
 */
export const CODE_CORRECTIONS = Object.freeze({
  "compile-enum-duplicate-values": Object.freeze({
    vendored: "profile-ui-parameters", sealed: "profile-type",
    basis: "DESIGN names no code for the enum clause of CR-10 (§2.4.1 L195 lists profile-ui-parameters and profile-type; §8.3 L655 names profile-ui-parameters for missing or duplicate required parameters only), so the frozen lot-0 case s2b-cr10-enum-values decides",
    discriminates: "Two choices with different names share the JSON value One; schema uniqueItems accepts the distinct records and the compiler refuses profile-type (CR-10 arbitration: DESIGN names no code for the enum clause and the frozen lot-0 case s2b-cr10-enum-values decides). A compiler that accepts the profile, or reports the repeated value as profile-ui-parameters, fails.",
  }),
  "compile-ui-parameter-source-type": Object.freeze({
    vendored: "profile-ui-parameters", sealed: "profile-type",
    basis: "§8.3 L655 names profile-ui-parameters for missing or duplicate required parameters only and types every source; a binding of another source type is ill-typed content, profile-type (§2.1 L81, §2.4.1 L195), as the block-A CR-10 compiler test",
    clauses: Object.freeze([cite("2.1", 81)]),
    discriminates: "The element parameter owner of task-create is bound from source value (a scalar), so the binding is ill-typed and compilation refuses profile-type (CR-10 arbitration: §8.3 L655 names profile-ui-parameters for missing or duplicate parameters only; §2.1 L81). A compiler that accepts the profile, or reports the ill-typed binding as profile-ui-parameters, fails.",
  }),
});

/** Every JSON number token of a vendored text is its own JavaScript rendering: parsing loses no precision and JCS renders the same digits. */
function exactNumbers(text, path) {
  const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\"") {
      for (i++; i < text.length && text[i] !== "\""; i++) if (text[i] === "\\") i++;
      continue;
    }
    if (c !== "-" && !(c >= "0" && c <= "9")) continue;
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) throw new Error(`${path}: malformed number at ${i}`);
    if (String(Number(m[0])) !== m[0]) throw new Error(`${path}: number ${m[0]} does not round-trip`);
    i += m[0].length - 1;
  }
}

/** Read one vendored file, check its raw SHA-256 against the Python manifest pin and register its bytes unchanged. */
function vendored(path) {
  const pin = PY_FILES[path];
  if (!pin) throw new Error(`${VENDOR}${path} is not a vendored file`);
  const text = readFileSync(new URL(`${VENDOR}${path}`, ROOT), "utf8");
  if (B(text) !== pin) throw new Error(`${VENDOR}${path}: SHA-256 differs from the Python seal`);
  exactNumbers(text, path);
  rawFixture(`${VENDOR}${path}`, text);
  return JSON.parse(text);
}

/**
 * Blank DESIGN R3.3 lines inside a cited Python range. A lot-5 citation names
 * nonblank lines only, so such a range is re-expressed as its nonblank runs
 * (same cited text); checkDesignBlankLines verifies the list on the DESIGN bytes.
 */
export const DESIGN_BLANK_LINES = Object.freeze([277]);
export function checkDesignBlankLines(lines) {
  for (const n of DESIGN_BLANK_LINES) if (lines[n - 1].trim()) throw new Error(`DESIGN line ${n} is not blank`);
}
/** DESIGN citations of a Python clause ("DESIGN R3.3 §8.3 L649 text; L655 text; §3.2 L276-L282 text"): a bare line belongs to the last named section. */
export function citations(clause) {
  const prefix = "DESIGN R3.3 ";
  if (!clause.startsWith(`${prefix}§`)) throw new Error(`clause ${clause}`);
  const out = [], seen = new Set();
  const add = (section, from, to) => {
    const key = `${section}|${from}|${to}`;
    if (!seen.has(key)) { seen.add(key); out.push({ section, from, to }); }
  };
  let section;
  for (const m of clause.slice(prefix.length).matchAll(/§(\d+(?:\.\d+)*)|(?<![A-Za-z0-9])L(\d+)(?:-L(\d+))?(?![0-9])/g)) {
    if (m[1]) { section = m[1]; continue; }
    if (!section) throw new Error(`clause ${clause}: line before a section`);
    const from = Number(m[2]), to = Number(m[3] ?? m[2]);
    if (!(to >= from)) throw new Error(`clause ${clause}: range ${from}-${to}`);
    let start = from;
    for (let n = from; n <= to + 1; n++) {
      if (n <= to && !DESIGN_BLANK_LINES.includes(n)) continue;
      if (n > start) add(section, start, n - 1);
      start = n + 1;
    }
  }
  if (!out.length) throw new Error(`clause ${clause}: no line`);
  return out;
}

const CASE_KEYS = ["caseId", "comparatorIds", "expectedArtifacts", "expectedStatus", "inputArtifacts", "operation", "phase", "profileArtifact"];
/** File layout: an artifact path of the Python pathBase moves below vendor/py/; json artifacts and roles stay as sealed. */
function moved(a, label) {
  if (!Object.hasOwn(a, "path")) return clone(a);
  if (PY_FILES[a.path] !== a.sha256) throw new Error(`${label}: ${a.path} is not pinned by the Python manifest`);
  return { ...clone(a), path: `${VENDOR}${a.path}` };
}

/** Re-express one Python parity record as a lot-5 case record and its clause entry. */
function vendorCase(file) {
  const record = vendored(file);
  const name = record.caseId.replace(/^lot5-py-/, "");
  const text = PY_CASES[name];
  if (!text || file !== `parity/lot5-py-${name}.json` || text.paritySha256 !== PY_FILES[file]) throw new Error(`${file}: no transcribed harness case`);
  const keys = Object.keys(record).filter(k => k !== "commandArtifact").sort();
  if (jcs(keys) !== jcs(CASE_KEYS)) throw new Error(`${file}: keys ${keys}`);
  const statement = `case file SHA-256 ${PY_FILES[file]} (harness record ${PY_SEAL.pathBase}${name}.json, SHA-256 ${text.harnessSha256})`;
  const correction = Object.hasOwn(CODE_CORRECTIONS, name) ? CODE_CORRECTIONS[name] : null;
  let expectedArtifacts, expectedStatus = record.expectedStatus, comparatorIds, derivation, unsealedNotes;
  if (record.operation === "compileProfile") {
    // The Python compile comparators and roles are kept (Python vocabulary): the outcome is the compileProfile PureResult.
    const roles = record.expectedArtifacts.map(a => a.role), v = record.expectedArtifacts[0]?.json;
    if (v?.status === "refused") {
      // PS-25 holds as sealed: {status: "refused", code, diagnostics: []}.
      if (jcs(record.comparatorIds) !== jcs(["lot5-py/compile-outcome", "profile-c14n/2"]) || jcs(roles) !== jcs(["compile-outcome"])) throw new Error(`${file}: compile refusal record`);
      if (jcs(Object.keys(v).sort()) !== jcs(["code", "diagnostics", "status"]) || jcs(v.diagnostics) !== "[]" || record.expectedStatus !== `refused:${v.code}`) throw new Error(`${file}: compile refusal shape`);
      if (correction && v.code !== correction.vendored) throw new Error(`${file}: vendored code ${v.code}; drop its CR-10 correction once the Python seal carries ${correction.sealed}`);
      derivation = correction
        ? `Vendored from ${SOURCE}, ${statement}; ${OWNED}, except the refusal code: the vendored record expects ${correction.vendored} and this case seals ${correction.sealed} (CR-10 arbitration, README "CR-10 arbitration": ${correction.basis}); the vendored bytes are unchanged and the Python seal owns their update. Re-expressed only: vendor/py/ artifact paths; roles and comparator ids as sealed (PS-25 holds as sealed: {status: "refused", code, diagnostics: []}).`
        : `Vendored unchanged from ${SOURCE}, ${statement}; ${OWNED}. Re-expressed only: vendor/py/ artifact paths; roles and comparator ids as sealed (PS-25 holds as sealed: {status: "refused", code, diagnostics: []}).`;
    } else {
      // PS-35, applied by the owning seal: {status: "ok", payload UNSEALED, diagnostics: []} and the separate compiled-identity artifact.
      const presync = PY_SEAL.presync[file];
      if (jcs(record.comparatorIds) !== jcs(["lot5-py/compile-outcome", "lot5-py/compiled-identity", "profile-c14n/2"]) || jcs(roles) !== jcs(["compile-outcome", "compiled-identity"])) throw new Error(`${file}: compile success record`);
      if (jcs(v) !== jcs({ diagnostics: [], payload: { $unsealed: "compiled-profile" }, status: "ok" }) || record.expectedStatus !== "ok" || !presync) throw new Error(`${file}: compile success shape`);
      derivation = `Vendored unchanged from ${SOURCE}, ${statement}; ${OWNED}. Decision PS-35 (BLOCKB-PARITY-SYNC), applied by the owning seal: the compile success is the PureResult {status: "ok", payload, diagnostics: []} with payload UNSEALED (compiled-profile, CompiledProfile has no wire shape) and the identity record is the separate compiled-identity artifact; this record equals the pre-sync record (SHA-256 ${presync}) plus PS-35, its identity record unchanged. Re-expressed only: vendor/py/ artifact paths; roles and comparator ids as sealed.`;
      unsealedNotes = ["/payload of compile-outcome (compiled-profile, Python vocabulary): BLOCKB-PARITY-SYNC PS-35."];
    }
    expectedArtifacts = record.expectedArtifacts.map(a => clone(a));
    if (correction && v?.status === "refused") { expectedArtifacts[0].json.code = correction.sealed; expectedStatus = `refused:${correction.sealed}`; }
    comparatorIds = [...record.comparatorIds];
  } else {
    // lot5-py/step-outcomes re-expressed as one comparator per sealed role (setup outcomes, step outcomes); same Python matching rule.
    const roles = record.expectedArtifacts.map(a => a.role), ids = record.comparatorIds;
    const setup = roles[0] === "setup-outcomes";
    if (jcs(roles) !== jcs(setup ? ["setup-outcomes", "step-outcomes"] : ["step-outcomes"])) throw new Error(`${file}: roles ${roles}`);
    if (!(ids[0] === "lot5-py/step-outcomes" && ids[1] === "profile-c14n/2" && (ids.length === 2 || (ids.length === 3 && ids[2] === "stable-id/1")))) throw new Error(`${file}: comparators ${ids}`);
    if (record.commandArtifact?.role !== "sequence" || record.expectedStatus !== "ok") throw new Error(`${file}: sequence shape`);
    expectedArtifacts = record.expectedArtifacts.map(a => clone(a));
    comparatorIds = [...(setup ? ["lot5-py/setup-outcomes"] : []), ...ids];
    derivation = `Vendored unchanged from ${SOURCE}, ${statement}; ${OWNED}. Re-expressed only: vendor/py/ artifact paths and comparator lot5-py/step-outcomes as ${setup ? "lot5-py/setup-outcomes plus " : ""}lot5-py/step-outcomes (one per sealed role, same Python matching rule); the headless sequence, its history and event members stay as sealed.`;
  }
  if (correction && expectedStatus === record.expectedStatus) throw new Error(`${file}: the CR-10 correction applies to compile refusals only`);
  const caseRecord = {
    caseId: record.caseId, operation: record.operation, phase: record.phase,
    profileArtifact: moved(record.profileArtifact, file), inputArtifacts: record.inputArtifacts.map(a => moved(a, file)),
    ...(record.commandArtifact ? { commandArtifact: clone(record.commandArtifact) } : {}),
    expectedArtifacts, expectedStatus, comparatorIds,
  };
  const path = `cases/py-${name}.json`;
  cases.push({ path, record: caseRecord });
  // A corrected case states the decided code; the Python derivation stays verbatim in vendored.correction.
  const vendoredCorrection = correction ? { correction: { member: "/expectedArtifacts/0/json/code", vendored: correction.vendored, sealed: correction.sealed, basis: correction.basis, pythonDerivation: text.derivation } } : {};
  clauseIndex.push({
    caseId: record.caseId, path, group: "py", clauses: [...citations(text.clause), ...(correction?.clauses ?? [])], discriminates: correction ? correction.discriminates : text.derivation, author: text.author,
    vendored: { clause: text.clause, derivation, parity: { path: `${VENDOR}${file}`, sha256: PY_FILES[file] }, harness: { path: `${PY_SEAL.pathBase}${name}.json`, sha256: text.harnessSha256 }, ...vendoredCorrection },
    ...(unsealedNotes ? { unsealed: unsealedNotes } : {}),
  });
}

export function vendorPy() {
  for (const [pyPath, { copy, sha256 }] of Object.entries(PY_LOT0)) {
    if (B(readFileSync(new URL(copy, REPO))) !== sha256) throw new Error(`${copy} is not the lot-0 file ${pyPath}`);
  }
  const parity = Object.keys(PY_FILES).filter(p => p.startsWith("parity/")).sort();
  const names = parity.map(p => p.replace(/^parity\/lot5-py-/, "").replace(/\.json$/, ""));
  if (jcs([...names].sort()) !== jcs(Object.keys(PY_CASES).sort())) throw new Error("vendored parity records and transcribed harness cases differ");
  for (const name of Object.keys(CODE_CORRECTIONS)) if (!names.includes(name)) throw new Error(`CR-10 correction ${name} names no vendored case`);
  for (const name of PY_SEAL.runtimeSpecific) if (names.includes(name)) throw new Error(`${name} is runtime-specific (BLOCKB-PARITY-SYNC section 5)`);
  for (const path of Object.keys(PY_FILES).sort()) if (!path.startsWith("parity/")) vendored(path);
  for (const file of parity) vendorCase(file);
}
