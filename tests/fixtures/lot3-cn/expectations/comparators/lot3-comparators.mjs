// Lot-3 sealed comparators (profile-parity-corpus/1, DESIGN R3.3 §14.3 L959-L963).
// Pinned executable: manifest.json `executables` and seal.json record the SHA-256
// of these exact bytes, so a change here is a reseal. Pure functions over JSON
// values; the only import is node:crypto (reference digests). Tolerance is zero:
// canonical JSON (profile-c14n/2) equality after explicit UNSEALED pointers only.
//
// Runner contract: compareCase(vector, actual) where `actual` maps roles to the
// values the implementation produced for that case:
//   result        the operation Result/1 (or PureResult) wire value
//   caller-state  the caller's input after the call (json value or exact text)
//   ids           the stable-id/1 values computed for `allocations`
//   value         the value returned by a pure helper (sortPlacements)
//   transport     { hops: [{ runtime, bytes, result }] } for a mixed chain
//   trace         [{ step, result, history?, events, injected? }] for a script
// and, for the vendored Python cases (BLOCKB-PARITY-SYNC §2.2):
//   plan          the planRecipe PureResult (WritePlan/1 payload)
//   apply         the applyPlan PureResult (ChangeReport/1 payload); in a planRecipe
//                 case it is applyPlan(plan.payload, envelope.tree, envelope) chained
//                 on the actual plan
//   compile       the compileProfile PureResult (a list for a profile list)
//   compiled-identity / compiled-identities  the §5.1 identity record(s) compiled
//   placements    the value returned by sortPlacements (the Python role spelling)
//   fixed-point   the Result/1 of the second run on the expected output (complete:
//                 payload, mode retained; normalize: payload.envelope; same
//                 activation and placement intent)
// It returns { ok, failures }. A comparator never repairs or normalizes a value.
import { createHash } from "node:crypto";

export function jcs(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const d = value.charCodeAt(i + 1);
        if (!(d >= 0xdc00 && d <= 0xdfff)) throw new Error("lone surrogate");
        i++;
      } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error("lone surrogate");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("nonfinite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${jcs(value[k])}`).join(",")}}`;
  }
  throw new Error(`unsupported ${typeof value}`);
}
export const sha256 = text => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// ---------------------------------------------------------------- pointers
const unescape = s => s.replace(/~1/g, "/").replace(/~0/g, "~");
const escape = s => String(s).replace(/~/g, "~0").replace(/\//g, "~1");
const segmentsOf = pointer => (pointer === "" ? [] : pointer.slice(1).split("/").map(unescape));
const pointerOf = segments => segments.map(s => `/${escape(s)}`).join("");
function lookup(value, segments) {
  let cur = value;
  for (const s of segments) {
    if (Array.isArray(cur)) {
      if (!/^(0|[1-9][0-9]*)$/.test(s) || Number(s) >= cur.length) return { present: false };
      cur = cur[Number(s)];
    } else if (isObject(cur) && own(cur, s)) cur = cur[s];
    else return { present: false };
  }
  return { present: true, value: cur };
}
// Expands an UNSEALED pattern ('*' matches one key or index) against a value.
function expand(value, pattern) {
  let found = [[]];
  for (const s of segmentsOf(pattern)) {
    const next = [];
    for (const prefix of found) {
      const node = lookup(value, prefix);
      if (!node.present) continue;
      if (s === "*") {
        if (Array.isArray(node.value)) node.value.forEach((_, i) => next.push([...prefix, String(i)]));
        else if (isObject(node.value)) Object.keys(node.value).forEach(k => next.push([...prefix, k]));
      } else next.push([...prefix, s]);
    }
    found = next;
  }
  return found.filter(p => lookup(value, p).present);
}
const SENTINEL = "\u0000unsealed\u0000";
function setAt(value, segments, replacement) {
  if (!segments.length) return replacement;
  let cur = value;
  for (const s of segments.slice(0, -1)) cur = Array.isArray(cur) ? cur[Number(s)] : cur[s];
  const last = segments.at(-1);
  if (Array.isArray(cur)) cur[Number(last)] = replacement; else cur[last] = replacement;
  return value;
}
// UNSEALED members stay required (presence is compared), only their value is not.
function applyUnsealed(expected, actual, patterns, failures, label) {
  let e = clone(expected), a = clone(actual);
  for (const { pointer } of patterns) {
    for (const path of expand(e, pointer)) {
      if (!lookup(a, path).present) { failures.push(`${label}${pointerOf(path)}: required UNSEALED member absent`); continue; }
      e = setAt(e, path, SENTINEL);
      a = setAt(a, path, SENTINEL);
    }
  }
  return { e, a };
}
function firstDifference(e, a, path = []) {
  if (jcs(e) === jcs(a)) return null;
  if (Array.isArray(e) && Array.isArray(a)) {
    for (let i = 0; i < Math.max(e.length, a.length); i++) {
      if (i >= e.length || i >= a.length) return pointerOf([...path, String(i)]);
      const d = firstDifference(e[i], a[i], [...path, String(i)]);
      if (d !== null) return d;
    }
  }
  if (isObject(e) && isObject(a)) {
    for (const k of [...new Set([...Object.keys(e), ...Object.keys(a)])].sort()) {
      if (!own(e, k) || !own(a, k)) return pointerOf([...path, k]);
      const d = firstDifference(e[k], a[k], [...path, k]);
      if (d !== null) return d;
    }
  }
  return pointerOf(path);
}
function equalCanonical(expected, actual, patterns, failures, label) {
  if (actual === undefined) { failures.push(`${label}: no actual value`); return; }
  let e, a;
  try { ({ e, a } = applyUnsealed(expected, actual, patterns, failures, label)); jcs(a); } catch (error) { failures.push(`${label}: not canonical JSON (${error.message})`); return; }
  if (jcs(e) !== jcs(a)) failures.push(`${label}: differs at ${firstDifference(e, a) || "/"}`);
}
const unsealedFor = (vector, artifact) => {
  const record = vector.expectedArtifacts.find(x => x.role === "unsealed");
  return record ? record.json.filter(u => u.artifact === artifact) : [];
};
const expectedOf = (vector, role) => vector.expectedArtifacts.find(x => x.role === role);
const inputOf = (vector, role) => vector.inputArtifacts.find(x => x.role === role);

// ---------------------------------------------------------------- Report/2 order (DESIGN §10.1 L751, harmonization G2)
const STAGES = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"];
const nullFirst = (a, b) => (a === null ? (b === null ? 0 : -1) : b === null ? 1 : cmp(a, b));
const optional = (x, y, key) => (!own(x, key) ? (own(y, key) ? -1 : 0) : !own(y, key) ? 1 : cmp(x[key], y[key]));
const canonical = (x, y, key, flag) => (!x[flag] ? (y[flag] ? -1 : 0) : !y[flag] ? 1 : cmp(jcs(x[key]), jcs(y[key])));
export function compareEntries(x, y) {
  return STAGES.indexOf(x.stage) - STAGES.indexOf(y.stage)
    || cmp(x.ruleId, y.ruleId) || cmp(x.source.domain, y.source.domain)
    || nullFirst(x.source.pointer, y.source.pointer) || nullFirst(x.source.targetId, y.source.targetId)
    || cmp(x.code, y.code) || optional(x, y, "pageId") || optional(x, y, "occurrenceKey")
    || canonical(x, y, "before", "beforePresent") || canonical(x, y, "after", "afterPresent")
    || cmp(x.result.domain, y.result.domain) || nullFirst(x.result.pointer, y.result.pointer)
    || nullFirst(x.result.targetId, y.result.targetId) || optional(x, y, "property");
}
const ENTRY_KEYS = ["code", "severity", "classification", "stage", "ruleId", "messageKey", "disposition", "source", "result", "originalType", "property",
  "beforePresent", "before", "afterPresent", "after", "causedBy", "pageId", "occurrenceKey", "emittedType", "legacyCode", "lossClass"];
const COORD_KEYS = ["domain", "pointer", "targetId", "provenance"];
function checkReport(report, label, failures) {
  if (!isObject(report)) { failures.push(`${label}: report is not an object`); return; }
  const keys = ["reportVersion", "operation", "sourceIdentity", "targetIdentity", "inputRevision", "outputRevision", "entries", "rawStandardFindings", "idMap", "artifacts"];
  for (const k of Object.keys(report)) if (!keys.includes(k)) failures.push(`${label}: unknown report member ${k}`);
  for (const k of ["reportVersion", "operation", "entries", "rawStandardFindings", "idMap", "artifacts"]) if (!own(report, k)) failures.push(`${label}: report member ${k} absent`);
  if (report.reportVersion !== "2") failures.push(`${label}: reportVersion`);
  if (!Array.isArray(report.entries)) return;
  report.entries.forEach((entry, i) => {
    for (const k of Object.keys(entry)) if (!ENTRY_KEYS.includes(k)) failures.push(`${label}/entries/${i}: unknown member ${k}`);
    for (const side of ["source", "result"]) {
      if (!isObject(entry[side]) || jcs(Object.keys(entry[side]).sort()) !== jcs([...COORD_KEYS].sort())) failures.push(`${label}/entries/${i}/${side}: coordinate shape`);
    }
    if (entry.beforePresent !== own(entry, "before") || entry.afterPresent !== own(entry, "after")) failures.push(`${label}/entries/${i}: presence flags`);
    if ((entry.classification === "loss") !== own(entry, "lossClass")) failures.push(`${label}/entries/${i}: lossClass`);
    if (i > 0) {
      const order = compareEntries(report.entries[i - 1], entry);
      if (order > 0) failures.push(`${label}/entries/${i}: entries out of profile-report/2 order`);
      if (order === 0 && jcs(report.entries[i - 1]) === jcs(entry)) failures.push(`${label}/entries/${i}: uncoalesced duplicate`);
    }
  });
  if (Array.isArray(report.idMap)) {
    const key = r => [r.domain, own(r, "pageId") ? `1${r.pageId}` : "0", own(r, "occurrenceKey") ? `1${r.occurrenceKey}` : "0", r.sourceId, r.resultId];
    for (let i = 1; i < report.idMap.length; i++) {
      const [x, y] = [key(report.idMap[i - 1]), key(report.idMap[i])];
      const order = x.map((v, k) => cmp(v, y[k])).find(v => v !== 0) ?? 0;
      if (order > 0) failures.push(`${label}/idMap/${i}: idMap out of DESIGN L753 order`);
    }
  }
}
// Closed Result/1 and PureResult unions (DESIGN §10.1 L735-L737, harmonization B2/B3).
export function checkResultShape(result, label, failures) {
  if (!isObject(result)) { failures.push(`${label}: not an object`); return; }
  const keys = Object.keys(result).sort();
  const pure = !own(result, "operation");
  if (pure) {
    const expected = result.status === "ok" ? ["diagnostics", "payload", "status"] : ["code", "diagnostics", "status"];
    if (jcs(keys) !== jcs(expected)) failures.push(`${label}: PureResult members ${keys.join(",")}`);
    return;
  }
  if (result.status === "ok") {
    if (jcs(keys) !== jcs(["baseRevision", "operation", "payload", "profileIdentity", "report", "revision", "status"])) failures.push(`${label}: Result/1 success members ${keys.join(",")}`);
  } else if (result.status === "refused") {
    const allowed = ["baseRevision", "code", "diagnostics", "operation", "profileIdentity", "report", "status"];
    for (const k of keys) if (!allowed.includes(k)) failures.push(`${label}: unknown refusal member ${k}`);
    for (const k of ["code", "diagnostics", "operation", "report", "status"]) if (!own(result, k)) failures.push(`${label}: refusal member ${k} absent`);
    if (own(result, "profileIdentity") !== own(result, "baseRevision")) failures.push(`${label}: echo must carry identity and revision together`);
    if (isObject(result.report) && own(result, "diagnostics") && own(result.report, "entries") && jcs(result.diagnostics) !== jcs(result.report.entries)) failures.push(`${label}: diagnostics differ from report.entries`);
    if (isObject(result.report) && (own(result.report, "targetIdentity") || own(result.report, "outputRevision"))) failures.push(`${label}: refusal report carries output identity`);
  } else failures.push(`${label}: status ${result.status}`);
  if (own(result, "report")) checkReport(result.report, `${label}/report`, failures);
  if (result.status === "ok" && isObject(result.payload) && own(result.payload, "report") && jcs(result.payload.report) !== jcs(result.report)) {
    failures.push(`${label}: payload.report differs from report`);
  }
}

// ---------------------------------------------------------------- comparators
function compareCanonical(vector, actual, failures) {
  for (const artifact of vector.expectedArtifacts) {
    if (artifact.role === "unsealed") continue;
    if (own(artifact, "json")) { try { jcs(artifact.json); } catch (error) { failures.push(`expected ${artifact.role}: ${error.message}`); } }
    if (own(artifact, "text") && sha256(artifact.text) !== artifact.sha256) failures.push(`expected ${artifact.role}: text digest`);
    if (own(actual, artifact.role) && !["trace", "transport", "caller-state"].includes(artifact.role)) {
      equalCanonical(artifact.json ?? artifact.text, actual[artifact.role], unsealedFor(vector, artifact.role), failures, artifact.role);
    }
  }
}
function stableIds(allocations) {
  return allocations.map(a => `g_${sha256(jcs(["profile-mechanism/1", a.owner, a.slot, a.key]))}`);
}
function compareStableIds(vector, actual, failures) {
  const allocations = inputOf(vector, "allocations")?.json;
  const ids = expectedOf(vector, "ids")?.json;
  if (!allocations || !ids) { failures.push("stable-id/1: allocations or ids missing"); return; }
  if (jcs(stableIds(allocations)) !== jcs(ids)) failures.push("stable-id/1: sealed ids do not match the allocator definition");
  equalCanonical(ids, actual.ids, [], failures, "ids");
}
function compareDigests(vector, actual, failures) {
  for (const artifact of [...vector.inputArtifacts, ...vector.expectedArtifacts]) {
    if (own(artifact, "text") && sha256(artifact.text) !== artifact.sha256) failures.push(`${artifact.role}: SHA-256 of the exact UTF-8 bytes`);
  }
  const allocations = inputOf(vector, "allocations")?.json, ids = expectedOf(vector, "ids")?.json;
  if (allocations && ids && jcs(stableIds(allocations)) !== jcs(ids)) failures.push("ids: SHA-256 reference");
  const bytes = expectedOf(vector, "transport-bytes");
  if (bytes && actual.transport) actual.transport.hops?.forEach((hop, i) => { if (sha256(hop.bytes) !== bytes.sha256) failures.push(`transport hop ${i + 1}: SHA-256`); });
}
function compareResult(vector, actual, failures) {
  const expected = expectedOf(vector, "result");
  if (!expected) { failures.push("result-1/lot3: no expected result"); return; }
  const before = failures.length;
  checkResultShape(expected.json, "expected result", failures);
  if (failures.length > before) return;
  if (vector.expectedStatus === "ok" ? expected.json.status !== "ok" : `refused:${expected.json.code}` !== vector.expectedStatus) failures.push("expected status disagrees with the case status");
  if (actual.result === undefined) { failures.push("result: no actual value"); return; }
  checkResultShape(actual.result, "result", failures);
  equalCanonical(expected.json, actual.result, unsealedFor(vector, "result"), failures, "result");
}
// DESIGN §7.2 L565 placement order; relatedAssociationIds unique and ID-sorted.
export function comparePlacementRecords(x, y) {
  const anchor = !own(x, "anchorAssociationId") ? (own(y, "anchorAssociationId") ? -1 : 0) : !own(y, "anchorAssociationId") ? 1 : cmp(x.anchorAssociationId, y.anchorAssociationId);
  const related = () => {
    const [a, b] = [x.relatedAssociationIds, y.relatedAssociationIds];
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return cmp(a[i], b[i]);
    return a.length - b.length;
  };
  return cmp(x.ownerProcessId, y.ownerProcessId) || cmp(x.regionKey, y.regionKey) || cmp(x.elementId, y.elementId) || anchor || related();
}
function checkPlacements(list, label, failures) {
  if (!Array.isArray(list)) { failures.push(`${label}: not an array`); return; }
  list.forEach((p, i) => {
    const ids = p.relatedAssociationIds;
    if (!Array.isArray(ids) || ids.some((id, k) => k > 0 && !(ids[k - 1] < id))) failures.push(`${label}/${i}: relatedAssociationIds not unique and sorted`);
    if (i > 0 && comparePlacementRecords(list[i - 1], p) >= 0) failures.push(`${label}/${i}: placements out of DESIGN L565 order`);
  });
}
function comparePlacements(vector, actual, failures) {
  const expected = expectedOf(vector, "result")?.json?.payload?.placements ?? expectedOf(vector, "value")?.json ?? expectedOf(vector, "placements")?.json;
  if (!expected) { failures.push("placements-order/lot3: no expected placements"); return; }
  checkPlacements(expected, "expected placements", failures);
  const got = actual.result?.payload?.placements ?? actual.value ?? actual.placements;
  checkPlacements(got, "placements", failures);
  equalCanonical(expected, got, [], failures, "placements");
}
function compareSourcePreservation(vector, actual, failures) {
  const expected = expectedOf(vector, "caller-state");
  if (!expected) { failures.push("source-preservation/lot3: no caller state"); return; }
  if (own(expected, "text")) {
    if (actual["caller-state"] !== expected.text) failures.push("caller-state: source text changed");
  } else equalCanonical(expected.json, actual["caller-state"], [], failures, "caller-state");
}
function compareTransport(vector, actual, failures) {
  const plan = expectedOf(vector, "transport")?.json, bytes = expectedOf(vector, "transport-bytes"), results = expectedOf(vector, "hop-results")?.json;
  if (!plan || !bytes || !results) { failures.push("transport-bytes/lot3: incomplete expectation"); return; }
  if (sha256(bytes.text) !== bytes.sha256) failures.push("transport-bytes: digest");
  const hops = actual.transport?.hops;
  if (!Array.isArray(hops) || hops.length !== plan.hops.length) { failures.push("transport: hop count"); return; }
  plan.hops.forEach((hop, i) => {
    if (hops[i].runtime !== hop.runtime) failures.push(`transport hop ${i + 1}: runtime`);
    if (hops[i].bytes !== bytes.text) failures.push(`transport hop ${i + 1}: output bytes differ from the sealed transport bytes`);
    if (sha256(hops[i].bytes ?? "") !== hop.outputSha256) failures.push(`transport hop ${i + 1}: output digest`);
    checkResultShape(results[i], `expected hop ${i + 1}`, failures);
    equalCanonical(results[i], hops[i].result, unsealedFor(vector, `hop-results/${i}`), failures, `hop ${i + 1} result`);
  });
}
// Trace markers: {"$same": {step, pointer}} must equal the actual value at that
// pointer of that step's record; {"$differs": {step, pointer}} must differ from it.
function resolveMarkers(expected, trace, failures, label) {
  if (Array.isArray(expected)) return expected.map((v, i) => resolveMarkers(v, trace, failures, `${label}/${i}`));
  if (!isObject(expected)) return expected;
  const keys = Object.keys(expected);
  if (keys.length === 1 && (keys[0] === "$same" || keys[0] === "$differs")) {
    const { step, pointer } = expected[keys[0]];
    const record = trace.find(r => r.step === step);
    const target = record ? lookup(record, segmentsOf(pointer)) : { present: false };
    if (!target.present) { failures.push(`${label}: marker target step ${step}${pointer} absent`); return { $unresolved: true }; }
    return keys[0] === "$same" ? clone(target.value) : { $differsFrom: clone(target.value) };
  }
  return Object.fromEntries(keys.map(k => [k, resolveMarkers(expected[k], trace, failures, `${label}/${escape(k)}`)]));
}
function settleDiffers(expected, actual, failures, label) {
  if (Array.isArray(expected)) return expected.map((v, i) => settleDiffers(v, Array.isArray(actual) ? actual[i] : undefined, failures, `${label}/${i}`));
  if (!isObject(expected)) return expected;
  if (own(expected, "$differsFrom") && Object.keys(expected).length === 1) {
    if (actual === undefined || jcs(actual) === jcs(expected.$differsFrom)) failures.push(`${label}: value must differ from the referenced step`);
    return actual;
  }
  return Object.fromEntries(Object.keys(expected).map(k => [k, settleDiffers(expected[k], isObject(actual) ? actual[k] : undefined, failures, `${label}/${escape(k)}`)]));
}
function compareTrace(vector, actual, failures) {
  const expected = expectedOf(vector, "trace")?.json;
  const trace = actual.trace;
  if (!Array.isArray(expected) || !Array.isArray(trace)) { failures.push("transaction-trace/lot3: trace missing"); return; }
  if (trace.length !== expected.length) failures.push(`trace: ${trace.length} steps instead of ${expected.length}`);
  const patterns = unsealedFor(vector, "trace");
  expected.forEach((step, i) => {
    const got = trace[i];
    if (!got || got.step !== step.step) { failures.push(`trace/${i}: step ${step.step} missing`); return; }
    if (step.result !== undefined) { checkResultShape(got.result, `trace/${i}/result`, failures); }
    const resolved = settleDiffers(resolveMarkers(step, trace, failures, `trace/${i}`), got, failures, `trace/${i}`);
    const local = patterns.filter(p => p.pointer.startsWith(`/${i}/`)).map(p => ({ pointer: p.pointer.slice(`/${i}`.length) }));
    equalCanonical(resolved, got, local, failures, `trace/${i}`);
  });
}

// ---------------------------------------------------------------- vendored Python comparators (BLOCKB-PARITY-SYNC §2.2)
// Bounded fixed point of a complete/normalize success (DESIGN §7.3 L569): the second
// run on the expected output returns ok, the identical envelope (and placements), no
// report entry, and baseRevision = revision = the first revision.
function compareFixedPoint(vector, actual, failures) {
  const first = expectedOf(vector, "result")?.json;
  if (!first || first.status !== "ok" || !["complete", "normalize"].includes(vector.operation)) { failures.push("fixed-point/lot3: no expected complete or normalize success"); return; }
  const second = actual["fixed-point"];
  if (second === undefined) { failures.push("fixed-point: no actual second run"); return; }
  const before = failures.length;
  checkResultShape(second, "fixed-point", failures);
  if (failures.length > before) return;
  if (second.status !== "ok") { failures.push(`fixed-point: second run refused ${second.code}`); return; }
  const envelopeOf = r => (vector.operation === "complete" ? r.payload : r.payload?.envelope);
  equalCanonical(envelopeOf(first), envelopeOf(second), [], failures, "fixed-point envelope");
  if (vector.operation === "normalize") equalCanonical(first.payload.placements, second.payload?.placements, [], failures, "fixed-point placements");
  if (!Array.isArray(second.report?.entries) || second.report.entries.length) failures.push("fixed-point: second-run change entries are not empty");
  if (second.baseRevision !== first.revision || second.revision !== first.revision) failures.push("fixed-point: baseRevision and revision must equal the first revision");
}
// planRecipe/applyPlan PureResults: the `plan` and, when the case expects one, the
// `apply` chained on the actual plan; an applyPlan case expects `apply` only. The
// last executed step carries the case status.
function comparePlanApply(vector, actual, failures) {
  const roles = ["plan", "apply"].filter(role => expectedOf(vector, role));
  if (!roles.length) { failures.push("plan-apply/lot3: no expected plan or apply"); return; }
  const last = expectedOf(vector, roles.at(-1)).json;
  if (vector.expectedStatus === "ok" ? last?.status !== "ok" : `refused:${last?.code}` !== vector.expectedStatus) failures.push("expected status disagrees with the case status");
  if (roles.length === 2 && expectedOf(vector, "plan").json?.status !== "ok") failures.push("plan-apply/lot3: apply expected after a refused plan");
  for (const role of roles) {
    const expected = expectedOf(vector, role).json, before = failures.length;
    if (!isObject(expected) || own(expected, "operation")) { failures.push(`expected ${role}: not a PureResult`); continue; }
    checkResultShape(expected, `expected ${role}`, failures);
    if (failures.length > before) continue;
    if (actual[role] === undefined) { failures.push(`${role}: no actual value`); continue; }
    if (isObject(actual[role]) && own(actual[role], "operation")) { failures.push(`${role}: not a PureResult`); continue; }
    checkResultShape(actual[role], role, failures);
    equalCanonical(expected, actual[role], unsealedFor(vector, role), failures, role);
  }
}
// {"$unsealed": reason} markers of a vendored record: the member at each marker's
// pointer must exist in the actual value, and neither value is compared there.
function markerPointers(value, path = []) {
  if (isObject(value) && Object.keys(value).length === 1 && typeof value.$unsealed === "string") return [{ pointer: pointerOf(path) }];
  if (Array.isArray(value)) return value.flatMap((v, i) => markerPointers(v, [...path, String(i)]));
  if (isObject(value)) return Object.keys(value).flatMap(k => markerPointers(value[k], [...path, k]));
  return [];
}
// compileProfile (PS-25, PS-35): the closed PureResult (a list for a profile list)
// whose success payload is an {"$unsealed": reason} marker, and the §5.1 identity in
// compiled-identity (compiled-identities for a list), which every success seals.
function compareCompile(vector, actual, failures) {
  const expected = expectedOf(vector, "compile")?.json;
  if (expected === undefined) { failures.push("compile/lot3: no expected compile result"); return; }
  const list = Array.isArray(expected) ? expected : [expected];
  const before = failures.length;
  list.forEach((r, i) => {
    if (!isObject(r) || own(r, "operation")) failures.push(`expected compile/${i}: not a PureResult`);
    else checkResultShape(r, `expected compile/${i}`, failures);
  });
  if (failures.length > before) return;
  const refusal = list.find(r => r.status !== "ok");
  if ((refusal ? `refused:${refusal.code}` : "ok") !== vector.expectedStatus) failures.push("expected status disagrees with the case status");
  const identities = expectedOf(vector, "compiled-identity") ?? expectedOf(vector, "compiled-identities");
  if (!refusal && !identities) failures.push("compile/lot3: a compile success seals its compiled identity");
  if (actual.compile === undefined) { failures.push("compile: no actual value"); return; }
  if (Array.isArray(actual.compile) !== Array.isArray(expected)) { failures.push("compile: result list shape"); return; }
  (Array.isArray(actual.compile) ? actual.compile : [actual.compile]).forEach((r, i) => {
    if (!isObject(r) || own(r, "operation")) failures.push(`compile/${i}: not a PureResult`);
    else checkResultShape(r, `compile/${i}`, failures);
  });
  equalCanonical(expected, actual.compile, [...unsealedFor(vector, "compile"), ...markerPointers(expected)], failures, "compile");
  if (identities) equalCanonical(identities.json, actual[identities.role], [], failures, identities.role);
}

export const COMPARATORS = Object.freeze({
  "profile-c14n/2": compareCanonical,
  "stable-id/1": compareStableIds,
  "node-crypto": compareDigests,
  "python-hashlib": compareDigests,
  "result-1/lot3": compareResult,
  "placements-order/lot3": comparePlacements,
  "source-preservation/lot3": compareSourcePreservation,
  "transport-bytes/lot3": compareTransport,
  "transaction-trace/lot3": compareTrace,
  "fixed-point/lot3": compareFixedPoint,
  "plan-apply/lot3": comparePlanApply,
  "compile/lot3": compareCompile,
});

export function compareCase(vector, actual) {
  const failures = [];
  for (const id of vector.comparatorIds) {
    const comparator = COMPARATORS[id];
    if (!comparator) { failures.push(`unknown comparator ${id}`); continue; }
    // A malformed actual value is a failure of the case, never an uncaught error.
    try { comparator(vector, actual, failures); } catch (error) { failures.push(`${id}: ${error.message}`); }
  }
  return { ok: failures.length === 0, failures };
}
