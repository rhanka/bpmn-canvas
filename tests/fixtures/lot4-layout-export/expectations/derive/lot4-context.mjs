// Shared authoring context: deterministic artifact bytes, case records and the
// clause index. Imports node builtins and sibling derivation modules only.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { B, H, clone } from "./lot4-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const EXPECTATIONS = join(here, "..");
export const FIXTURES = join(EXPECTATIONS, "..", "..");
export const VENDOR = join(FIXTURES, "profile-parity-corpus", "profile-mechanism", "1");
export const SEAL_PREFIX = "lot4-layout-export/expectations/";
export const ARTIFACT_PREFIX = `${SEAL_PREFIX}artifacts/`;

// DESIGN R3.3 sections cited by this lot (one-based inclusive line ranges).
export const SECTIONS = {
  "2.2": [103, 134], "2.3": [136, 154], "2.4": [156, 178], "2.4.1": [180, 218], "2.5": [220, 254], "3.1": [258, 272], "3.3": [294, 326],
  "5.1": [428, 434], "5.2": [436, 446], "6.2": [466, 481], "6.3": [483, 504], "6.4": [506, 524],
  "7.2": [550, 565], "8.1": [577, 623], "8.1.1": [608, 613], "8.2": [625, 645],
  "9.1": [665, 673], "9.2": [675, 694], "9.3": [696, 717], "9.4": [719, 725], "9.5": [727, 729],
  "10.1": [733, 766], "10.2": [768, 803], "12": [821, 902], "13": [903, 937], "14.2": [945, 955], "14.3": [957, 973], "16": [1134, 1162],
};

// Pinned executable comparators (DESIGN 14.3 L961). Source digests are filled
// by the derivation from the committed comparator files; tolerance is zero.
export const COMPARATOR_SOURCES = ["comparators/lot4-compare.mjs", "comparators/lot4-xml.mjs"];
export const COMPARATORS = [
  { id: "profile-c14n/2", export: "canonicalEqual", note: "RFC 8785 canonical JSON equality of the whole expected artifact (mechanism comparator)." },
  { id: "seam-exact/1", export: "canonicalEqual", note: "Canonical equality of a named internal seam output (README seam table)." },
  { id: "result-exact/1", export: "resultExact", note: "Whole Result/1 or PureResult record (status, operation, identity, revisions, code, diagnostics, report header, entries, rawStandardFindings, idMap, artifacts, payload) canonically equal after removing only the sealed UNSEALED pointers, each of which must exist in the actual record; an UNSEALED entry scoped to another artifact (member artifact) does not apply to the record." },
  { id: "layout-route/1", export: "layoutRoute", note: "LINK-ROUTE invariants on the UNSEALED route members of links incident to relocated region items: at least two waypoints, first inside or on the final source bounds, last inside or on the final target bounds, bounds equal to the waypoint bounding box." },
  { id: "profile-report/2", export: "reportOrder", note: "DESIGN 10.1 rules re-checked on every report of the actual record: entry order and coalescing, idMap order, loss entries with lossClass reachable through entryIndexes, refused artifacts without digest." },
  { id: "serialize-bytes/1", export: "serializeBytes", note: "serializePrepared bytes: payload.digest and the report artifact digest equal SHA-256 of the bytes; UTF-8 without BOM; newline, indent, emptyElement, compression and attributeOrder serializer data honoured." },
  { id: "drawio-structure/1", export: "drawioStructure", note: "Parsed draw.io bytes projected to diagrams and cells equal the sealed projection; timestamp and random mxfile attributes absent. A Python-shaped projection (vendored cases) also checks its byteInvariants on the returned bytes and, when deterministic is true, identical bytes from a second identical call passed as third argument." },
  { id: "lint-includes/1", export: "lintIncludes", note: "Python seal comparator (vendored cases): each partial entry of the includes artifact matches at least one actual report entry on its listed members (targetId compares source.targetId), checked before UNSEALED removal." },
  { id: "bpmn-structure/1", export: "bpmnStructure", note: "Parsed BPMN XML facts: element by local name and id, parent, attributes equal or absent, ordered child texts, element counts." },
  { id: "source-immutability/1", export: "sourceImmutable", note: "Canonical digest of every caller-supplied input identical before and after the call." },
  { id: "determinism/1", export: "determinism", note: "Identical input bytes give identical output bytes in the stated call order (A, A, B, A); no state leaks between calls." },
];

export function makeContext() {
  const artifacts = new Map(), cases = [], index = [];
  const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  function rawArtifact(name, bytes) {
    if (artifacts.has(name) && !artifacts.get(name).equals(bytes)) throw new Error(`artifact ${name} redefined`);
    artifacts.set(name, Buffer.from(bytes));
    return { path: `${ARTIFACT_PREFIX}${name}`, sha256: B(bytes) };
  }
  const artifact = (name, value) => rawArtifact(name, json(value));
  const vendored = name => ({ path: `profile-parity-corpus/profile-mechanism/1/${name}`, sha256: B(readFileSync(join(VENDOR, name))) });
  const ref = (role, r) => ({ role, path: r.path, sha256: r.sha256 });
  const inline = (role, value) => ({ role, json: clone(value) });
  function addCase(c) {
    for (const k of ["caseId", "group", "operation", "expected", "status", "comparators", "clause", "derivation", "wrong"]) if (c[k] === undefined) throw new Error(`case ${c.caseId}: missing ${k}`);
    if (cases.some(x => x.caseId === c.caseId)) throw new Error(`duplicate case ${c.caseId}`);
    if (!c.expected.length) throw new Error(`case ${c.caseId}: empty expectation`);
    for (const cl of c.clause) {
      const range = SECTIONS[cl.section];
      if (!range || cl.lines[0] < range[0] || cl.lines[1] > range[1] || cl.lines[0] > cl.lines[1]) throw new Error(`case ${c.caseId}: clause ${JSON.stringify(cl)}`);
    }
    if (!c.expected.some(a => ["result", "output"].includes(a.role))) throw new Error(`case ${c.caseId}: no result/output artifact`);
    const record = {
      caseId: c.caseId, operation: c.operation, phase: c.phase ?? null, profileArtifact: c.profile ?? null,
      inputArtifacts: c.inputs ?? [], ...(c.command ? { commandArtifact: c.command } : {}),
      expectedArtifacts: c.expected, expectedStatus: c.status, comparatorIds: c.comparators,
    };
    cases.push(record);
    index.push({ caseId: c.caseId, group: c.group, file: `cases/${c.caseId}.json`, clause: c.clause, derivation: c.derivation, wrongImplementation: c.wrong,
      ...(c.decisions ? { decisions: c.decisions } : {}), ...(c.twinApplied ? { twinApplied: c.twinApplied } : {}), ...(c.dependsOn ? { dependsOn: c.dependsOn } : {}),
      ...(c.author ? { author: c.author } : {}), ...(c.vendored ? { vendored: c.vendored } : {}) });
    return record;
  }
  return { artifacts, cases, index, artifact, rawArtifact, vendored, ref, inline, addCase, json, H };
}
