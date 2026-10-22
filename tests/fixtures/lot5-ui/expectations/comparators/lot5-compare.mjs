// Pinned EXECUTABLE COMPARATORS of the lot-5 UI corpus (profile-parity-corpus/1).
// The implementation harness calls compareCase(caseRecord, inputs, observed);
// zero tolerance everywhere: values compare by RFC 8785 JCS bytes unless an
// expected template carries one of the explicit markers below. The module is
// standalone (Node crypto only) and never imports a loader, compiler,
// evaluator, codec, layout, exporter or command module.
//
// Template markers (they never occur in real outputs):
//   {"$unsealed": reason, "type": t, "optional"?: true}  member not sealed;
//       present with JSON type t (absent allowed when optional). Reasons are
//       listed in UNSEALED and in the corpus README.
//   {"$equals": {"member", "pointer"}}  equals the observed value at pointer.
//   {"$rule": name, ...}  named exact rule (RULES below).
// Vendored Python cases (lot5-py-*, block-B parity sync) keep the Python
// vocabulary, compared by the lot5-py/* comparators only (pyMatch below):
//   {"$unsealed": reason} with no other member  member that must exist, any
//       JSON type (Python SPEC_PROFILE_COMMANDS_PY §8.3); reasons in PY_UNSEALED.
import { createHash } from "node:crypto";

export const COMPARATOR_VERSION = "lot5-compare/1";

// ---------------------------------------------------------------- canonical bytes
export function jcs(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(jcs).join(",")}]`;
  if (value instanceof Uint8Array) throw new Error("bytes are not JSON");
  if (typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${jcs(value[k])}`).join(",")}}`;
  throw new Error(`unsupported value ${typeof value}`);
}
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const H = value => sha256(Buffer.from(jcs(value), "utf8"));
const utf16 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const typeOf = v => v === null ? "null" : Array.isArray(v) ? "array" : v instanceof Uint8Array ? "bytes" : typeof v;
const isMarker = v => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Uint8Array) &&
  (Object.hasOwn(v, "$unsealed") || Object.hasOwn(v, "$equals") || Object.hasOwn(v, "$rule"));

export const UNSEALED = Object.freeze({
  "auto-layout": "Geometry of an occurrence created by a command or gesture (occurrence key, bounds, waypoints, label): canvas auto-layout and drop geometry are runtime-specific (harmonization K18); DESIGN R3.3 fixes no default size, placement or key rule.",
  "text-measure": "Label member of an occurrence whose text changed: text measurement and wrapping are runtime-specific (harmonization K17, erratum E-20).",
  "edge-routing": "Waypoints and bounds of an edge whose route the gesture changes (bendpoint, incident endpoint moved): docking and routing are adapter output; endpoints stay sealed.",
  "page-growth": "Page bounds after a creation: auto-placement may extend the page; pageId, name, order and semanticRootId stay sealed.",
  "selection-after-commit": "Selection after a commit, undo or redo: DESIGN fixes selection only for refusals and cancellations (§8.2 L633); it must be valid.",
  "event-transaction": "transactionId of a load or theme change event: DESIGN §8.1 L606 names no transaction for these origins.",
  "export-adapter": "IR geometry/style records, occurrence keys, counter ID assignment, page set and serialized bytes of prepareExport: its layout stage is the runtime-specific canvas auto-layout (K18) with unpinned text measurement (E-20).",
  "replacement-map-multi-create": "report.idMap of a conversion that creates several ID-bearing elements: harmonization D7 and the Python binding define the replacement map for exactly one created element only.",
  "compiled-profile": "Payload of a successful compileProfile: an opaque in-process compiled object; only its identity record is sealed.",
  "history-epoch": "historyEpoch is a session-local counter excluded from parity (DESIGN §3.1 L268).",
  "subscription-id": "subscriptionId is session-local (DESIGN §8.1 L606).",
  "gesture-intent": "Staged input of a DI-only gesture: DESIGN §8.2 L637 names no command record for move/resize/label/bendpoint intents (OPEN-HOOK prototype output).",
  "twin-presentation": "Presentation members (viewRevision, layout, selection) of the Python headless twin: its layout is a DI transcription, runtime-specific (harmonization K18); semantic members stay exact.",
  // Python vocabulary of the vendored lot5-py-* cases (Python SPEC_PROFILE_COMMANDS_PY §8.3 table, sealed by the Python seal).
  "lot4-view-revision": "viewRevision of payloads, snapshots and events of a vendored Python case: §9.2 digest tuple over the lot-4 layout (DESIGN §3.1 L268); lot 5 compares it relationally (Python vocabulary).",
  "lot4-presentation": "presentation.layout, themeId, overrides, diStyles, activePageId, and importedDi when no record was supplied at load, of a vendored Python case: lot-4 layout adapter and theme selection; an explicitly loaded importedDi record is sealed exactly (Python vocabulary).",
  "session-history-epoch": "historyEpoch of a vendored Python case: session-local counter excluded from parity (DESIGN §3.1 L268) (Python vocabulary).",
  "session-subscription": "subscriptionId of a vendored Python case: session-local, excluded from parity (DESIGN §8.1 L606) (Python vocabulary).",
  "raw-lint-transport": "report.rawStandardFindings of the two vendored Python witnesses whose profile runs the vendored standard lint rules: raw upstream report records are the frozen upstream comparator (DESIGN §3.1 L272, §6.4 L508, L520); their Report/2 record shape is not fixed (BLOCKB-PARITY-SYNC PS-10, E-42) (Python vocabulary).",
});
/** Reasons of the Python vocabulary: the only reasons a lot5-py/* comparator accepts (compiled-profile shares the lot-5 reason, PS-35). */
export const PY_UNSEALED = Object.freeze(["lot4-view-revision", "lot4-presentation", "session-history-epoch", "session-subscription", "raw-lint-transport", "compiled-profile"]);

// ---------------------------------------------------------------- pointers and references
const unescape = s => s.replace(/~1/g, "/").replace(/~0/g, "~");
export function at(value, pointer) {
  if (pointer === "") return { found: true, value };
  let v = value;
  for (const part of pointer.slice(1).split("/").map(unescape)) {
    if (v === null || typeof v !== "object" || !Object.hasOwn(v, part)) return { found: false };
    v = v[part];
  }
  return { found: true, value: v };
}
function resolveRef(ref, ctx) {
  const source = Object.hasOwn(ref, "input") ? ctx.inputs[ref.input] : ctx.observed[ref.member];
  if (source === undefined) return { found: false };
  return at(source, ref.pointer ?? "");
}

// ---------------------------------------------------------------- template matching
export function match(expected, actual, ctx, path = "") {
  const out = [];
  if (isMarker(expected)) {
    if (Object.hasOwn(expected, "$unsealed")) {
      if (!Object.hasOwn(UNSEALED, expected.$unsealed)) out.push(`${path}: unknown unsealed reason ${expected.$unsealed}`);
      else if (expected.type !== "any" && typeOf(actual) !== expected.type) out.push(`${path}: unsealed member must be ${expected.type}, got ${typeOf(actual)}`);
      return out;
    }
    if (Object.hasOwn(expected, "$equals")) {
      const target = resolveRef(expected.$equals, ctx);
      if (!target.found) return [`${path}: $equals target missing`];
      return jcsSafe(target.value) === jcsSafe(actual) ? [] : [`${path}: differs from observed ${expected.$equals.member}${expected.$equals.pointer}`];
    }
    const rule = RULES[expected.$rule];
    if (!rule) return [`${path}: unknown rule ${expected.$rule}`];
    // A malformed observation is a failure, never an exception.
    try { return rule(expected, actual, ctx, path); } catch (error) { return [`${path}: rule ${expected.$rule} rejects a malformed value (${error.message})`]; }
  }
  if (expected === null || typeof expected !== "object") {
    return jcsSafe(expected) === jcsSafe(actual) ? [] : [`${path || "/"}: expected ${jcsSafe(expected)} got ${jcsSafe(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path || "/"}: expected array got ${typeOf(actual)}`];
    if (expected.length !== actual.length) return [`${path || "/"}: length ${actual.length} not ${expected.length}`];
    expected.forEach((item, i) => out.push(...match(item, actual[i], ctx, `${path}/${i}`)));
    return out;
  }
  if (actual === null || typeof actual !== "object" || Array.isArray(actual) || actual instanceof Uint8Array) return [`${path || "/"}: expected object got ${typeOf(actual)}`];
  for (const key of Object.keys(expected)) {
    const optional = isMarker(expected[key]) && expected[key].optional === true;
    if (!Object.hasOwn(actual, key)) { if (!optional) out.push(`${path}/${key}: missing`); continue; }
    out.push(...match(expected[key], actual[key], ctx, `${path}/${key}`));
  }
  for (const key of Object.keys(actual)) if (!Object.hasOwn(expected, key)) out.push(`${path}/${key}: unexpected member`);
  return out;
}
function jcsSafe(v) {
  try { return v instanceof Uint8Array ? `bytes:${sha256(v)}` : jcs(v); } catch { return `<${typeOf(v)}>`; }
}

// ---------------------------------------------------------------- Python vocabulary (vendored lot5-py-* cases)
const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Uint8Array);
const isPyMarker = v => isRecord(v) && Object.keys(v).length === 1 && typeof v.$unsealed === "string";
/**
 * Python matching rule (SPEC_PROFILE_COMMANDS_PY §8.3): the actual value equals
 * the template under profile-c14n/2 after each {"$unsealed": reason} marker is
 * replaced by the actual member it marks (the member must exist); objects have
 * exactly the template members, arrays exactly its items in order.
 */
export function pyMatch(expected, actual, path = "") {
  if (isPyMarker(expected)) {
    if (!PY_UNSEALED.includes(expected.$unsealed)) return [`${path}: unknown Python unsealed reason ${expected.$unsealed}`];
    return actual === undefined ? [`${path}: unsealed member missing`] : [];
  }
  if (expected === null || typeof expected !== "object") {
    return jcsSafe(expected) === jcsSafe(actual) ? [] : [`${path || "/"}: expected ${jcsSafe(expected)} got ${jcsSafe(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path || "/"}: expected array got ${typeOf(actual)}`];
    if (expected.length !== actual.length) return [`${path || "/"}: length ${actual.length} not ${expected.length}`];
    return expected.flatMap((item, i) => pyMatch(item, actual[i], `${path}/${i}`));
  }
  if (!isRecord(actual)) return [`${path || "/"}: expected object got ${typeOf(actual)}`];
  const out = [];
  for (const key of Object.keys(expected)) {
    if (!Object.hasOwn(actual, key)) { out.push(`${path}/${key}: missing`); continue; }
    out.push(...pyMatch(expected[key], actual[key], `${path}/${key}`));
  }
  for (const key of Object.keys(actual)) if (!Object.hasOwn(expected, key)) out.push(`${path}/${key}: unexpected member`);
  return out;
}
/**
 * Python step outcomes: one observation {result} per step of the sequence
 * command artifact, in order. Each template {result, equal?, differ?} matches
 * the complete step result by pyMatch; equal/differ [{pointer, saved,
 * savedPointer}] compare the result at pointer with the result of the earlier
 * step whose sequence record saves that name (profile-c14n/2 equality or
 * difference). Signal outcomes are not vendored (BLOCKB-PARITY-SYNC section 5).
 */
export function pySteps(expected, actual, caseRecord, path = "") {
  if (!Array.isArray(expected)) return [`${path}: step-outcomes template is not an array`];
  if (!Array.isArray(actual)) return [`${path}: expected an array of step observations got ${typeOf(actual)}`];
  if (actual.length !== expected.length) return [`${path}: ${actual.length} steps, expected ${expected.length}`];
  const script = caseRecord.commandArtifact?.json?.steps;
  if (!Array.isArray(script) || script.length !== expected.length) return [`${path}: the sequence command artifact does not list one record per step`];
  const savedAt = new Map();
  script.forEach((s, i) => { if (typeof s?.save === "string") savedAt.set(s.save, i); });
  const out = [];
  expected.forEach((t, i) => {
    const p = `${path}/${i}`, a = actual[i];
    if (!isRecord(t) || !Object.hasOwn(t, "result") || Object.keys(t).some(k => !["result", "equal", "differ"].includes(k))) { out.push(`${p}: unsupported step template`); return; }
    if (!isRecord(a) || Object.keys(a).join(",") !== "result") { out.push(`${p}: a step observation is exactly {result}`); return; }
    out.push(...pyMatch(t.result, a.result, `${p}/result`));
    for (const [kind, same] of [["equal", true], ["differ", false]]) {
      (t[kind] ?? []).forEach((rel, n) => {
        const j = savedAt.get(rel?.saved);
        if (j === undefined || j >= i) { out.push(`${p}/${kind}/${n}: no earlier step saves ${rel?.saved}`); return; }
        const x = at(a.result, rel.pointer), y = at(actual[j]?.result, rel.savedPointer);
        if (!x.found || !y.found) { out.push(`${p}/${kind}/${n}: pointer missing`); return; }
        if ((jcsSafe(x.value) === jcsSafe(y.value)) !== same) out.push(`${p}/${kind}/${n}: ${rel.pointer} ${same ? "differs from" : "equals"} saved ${rel.saved}${rel.savedPointer}`);
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------- rules
const pair = (pageId, occurrenceKey) => `${pageId}\u0000${occurrenceKey}`;
const RULES = {
  /** viewRevision = H({semanticRevision, layoutDigest: H(observed layout), themeId, themeDigest, overridesDigest, diStylesDigest, metricsDigest}). */
  "view-revision"(e, actual, ctx, path) {
    const layout = resolveRef(e.layout, ctx);
    if (!layout.found) return [`${path}: view-revision layout missing`];
    const want = H({ semanticRevision: e.semanticRevision, layoutDigest: H(layout.value), themeId: e.themeId, themeDigest: e.themeDigest,
      overridesDigest: e.overridesDigest, diStylesDigest: e.diStylesDigest, metricsDigest: e.metricsDigest });
    return actual === want ? [] : [`${path}: viewRevision ${actual} is not the §9.2 digest ${want}`];
  },
  /** Selection after a commit: an ordered unique array of {pageId, occurrenceKey} present in the observed layout. */
  "selection-valid"(e, actual, ctx, path) {
    const layout = resolveRef(e.layout, ctx);
    if (!layout.found || !Array.isArray(layout.value?.geometry)) return [`${path}: selection layout missing`];
    if (!Array.isArray(actual)) return [`${path}: selection must be an array`];
    const keys = new Set(layout.value.geometry.map(g => pair(g.pageId, g.occurrenceKey))), seen = new Set(), out = [];
    actual.forEach((s, i) => {
      if (!s || typeof s !== "object" || Object.keys(s).sort().join(",") !== "occurrenceKey,pageId") { out.push(`${path}/${i}: not a selection pair`); return; }
      const k = pair(s.pageId, s.occurrenceKey);
      if (seen.has(k)) out.push(`${path}/${i}: duplicate`); seen.add(k);
      if (!keys.has(k)) out.push(`${path}/${i}: not in layout`);
    });
    return out;
  },
  /** Exact Layout/1 delta against a base layout; see README "Presentation deltas". */
  "layout-delta"(e, actual, ctx, path) {
    const base = resolveRef(e.base, ctx);
    if (!base.found) return [`${path}: layout-delta base missing`];
    const L0 = base.value, L = actual, out = [];
    if (!L || typeof L !== "object" || L.layoutVersion !== "1" || !Array.isArray(L.pages) || !Array.isArray(L.geometry) || Object.keys(L).sort().join(",") !== "geometry,layoutVersion,pages") return [`${path}: not a Layout/1 record`];
    // Pages: identical, except bounds when the delta allows page growth.
    if (L.pages.length !== L0.pages.length) out.push(`${path}/pages: count`);
    L0.pages.forEach((p, i) => {
      const q = L.pages[i];
      if (!q) return;
      const strip = r => { const { bounds, ...rest } = r; return e.pages === "growth" ? rest : r; };
      if (jcs(strip(p)) !== jcs(strip(q))) out.push(`${path}/pages/${i}: differs`);
      if (e.pages === "growth" && !(q.bounds && Number.isSafeInteger(q.bounds.width) && Number.isSafeInteger(q.bounds.height))) out.push(`${path}/pages/${i}/bounds: invalid`);
    });
    const order = new Map(L.pages.map(p => [p.pageId, p.order]));
    // Ordering and key uniqueness (§9.1 L667, §2.2 page/occurrence order).
    for (let i = 1; i < L.geometry.length; i++) {
      const a = L.geometry[i - 1], b = L.geometry[i];
      const c = (order.get(a.pageId) ?? -1) - (order.get(b.pageId) ?? -1) || utf16(a.occurrenceKey, b.occurrenceKey);
      if (c >= 0) out.push(`${path}/geometry/${i}: not in page order then UTF-16 occurrenceKey order`);
    }
    const removed = new Set(e.remove ?? []);
    // A modified occurrence is named by its key, or by its semantic element on a page (exactly one base occurrence).
    const modified = new Map((e.modify ?? []).filter(m => Object.hasOwn(m, "occurrenceKey")).map(m => [pair(m.pageId, m.occurrenceKey), m]));
    const bySemantic = new Map((e.modify ?? []).filter(m => Object.hasOwn(m, "semanticId")).map(m => [pair(m.pageId, m.semanticId), m]));
    for (const [k, m] of bySemantic) if (L0.geometry.filter(g => pair(g.pageId, g.semanticId) === k).length !== 1) out.push(`${path}: modified ${m.semanticId} is not unique on ${m.pageId}`);
    const observedByKey = new Map(L.geometry.map(g => [pair(g.pageId, g.occurrenceKey), g]));
    const matched = new Set();
    for (const g0 of L0.geometry) {
      const k = pair(g0.pageId, g0.occurrenceKey), g = observedByKey.get(k);
      if (removed.has(g0.semanticId)) { if (g) out.push(`${path}: removed occurrence ${g0.occurrenceKey} still on ${g0.pageId}`); continue; }
      if (!g) { out.push(`${path}: occurrence ${g0.occurrenceKey} on ${g0.pageId} missing`); continue; }
      matched.add(k);
      const m = modified.get(k) ?? (g0.semanticId !== undefined ? bySemantic.get(pair(g0.pageId, g0.semanticId)) : undefined);
      if (!m) { if (jcs(g0) !== jcs(g)) out.push(`${path}: untouched occurrence ${g0.occurrenceKey} on ${g0.pageId} changed`); continue; }
      const sealedOf = r => Object.fromEntries(Object.entries(r).filter(([key]) => !(m.unsealed ?? []).includes(key) && !Object.hasOwn(m.set ?? {}, key)));
      if (jcs(sealedOf(g0)) !== jcs(sealedOf(g))) out.push(`${path}: sealed members of ${g0.occurrenceKey} changed`);
      for (const [key, value] of Object.entries(m.set ?? {})) if (jcs(g[key] ?? null) !== jcs(value)) out.push(`${path}: ${g0.occurrenceKey}.${key} is not the sealed value`);
      for (const key of m.changed ?? []) if (jcs(g0[key] ?? null) === jcs(g[key] ?? null)) out.push(`${path}: ${g0.occurrenceKey}.${key} did not change`);
      if (m.minWaypoints && !(Array.isArray(g.waypoints) && g.waypoints.length >= m.minWaypoints)) out.push(`${path}: ${g0.occurrenceKey} needs ${m.minWaypoints} waypoints`);
    }
    // Added occurrences: exactly the listed semantic elements, each once, on the listed page.
    const extra = L.geometry.filter(g => !matched.has(pair(g.pageId, g.occurrenceKey)));
    const adds = [...(e.add ?? [])];
    if (extra.length !== adds.length) out.push(`${path}: ${extra.length} added occurrences, expected ${adds.length}`);
    const used = new Set();
    for (const a of adds) {
      const i = extra.findIndex((g, n) => !used.has(n) && g.pageId === a.pageId && g.semanticId === a.semanticId);
      if (i < 0) { out.push(`${path}: no added occurrence of ${a.semanticId} on ${a.pageId}`); continue; }
      used.add(i);
      const g = extra[i];
      if (g.role !== a.role) out.push(`${path}: added ${a.semanticId} role ${g.role}`);
      if (typeof g.occurrenceKey !== "string" || !g.occurrenceKey.length) out.push(`${path}: added ${a.semanticId} key`);
      if (!g.bounds || !["x", "y", "width", "height"].every(k => Number.isSafeInteger(g.bounds[k])) || g.bounds.width < 0 || g.bounds.height < 0) out.push(`${path}: added ${a.semanticId} bounds`);
      const keys = Object.keys(g);
      if (a.edge) {
        const resolves = (ref, semanticId) => ref && ref.pageId === a.pageId && L.geometry.some(o => o.pageId === ref.pageId && o.occurrenceKey === ref.occurrenceKey && o.semanticId === semanticId);
        if (!resolves(g.sourceOccurrence, a.edge.source)) out.push(`${path}: added ${a.semanticId} source is not ${a.edge.source}`);
        if (!resolves(g.targetOccurrence, a.edge.target)) out.push(`${path}: added ${a.semanticId} target is not ${a.edge.target}`);
        if (!(Array.isArray(g.waypoints) && g.waypoints.length >= 2)) out.push(`${path}: added ${a.semanticId} waypoints`);
        for (const k of keys) if (!["pageId", "occurrenceKey", "semanticId", "role", "bounds", "label", "sourceOccurrence", "targetOccurrence", "waypoints"].includes(k)) out.push(`${path}: added ${a.semanticId} member ${k}`);
      } else {
        for (const k of keys) if (!["pageId", "occurrenceKey", "semanticId", "role", "bounds", "label"].includes(k)) out.push(`${path}: added ${a.semanticId} member ${k}`);
      }
    }
    // Occurrence keys unique per page.
    const all = new Set();
    for (const g of L.geometry) { const k = pair(g.pageId, g.occurrenceKey); if (all.has(k)) out.push(`${path}: duplicate key ${g.occurrenceKey}`); all.add(k); }
    return out;
  },
  /** PreparedArtifact.viewRevision recomputed from its renderBinding digests (§9.2 L690). */
  "view-revision-binding"(e, actual, ctx, path) {
    const b = resolveRef(e.binding, ctx);
    if (!b.found || !b.value || typeof b.value !== "object") return [`${path}: renderBinding missing`];
    const v = b.value;
    const want = H({ semanticRevision: v.semanticRevision, layoutDigest: v.layoutDigest, themeId: v.themeId, themeDigest: v.themeDigest,
      overridesDigest: v.overridesDigest, diStylesDigest: v.diStylesDigest, metricsDigest: v.metricsDigest });
    return actual === want ? [] : [`${path}: viewRevision is not the §9.2 digest of the render binding`];
  },
  /** digest = lowercase SHA-256 of the observed bytes at the referenced pointer. */
  "bytes-sha256"(e, actual, ctx, path) {
    const bytes = resolveRef(e.bytes, ctx);
    if (!bytes.found || !(bytes.value instanceof Uint8Array)) return [`${path}: bytes missing`];
    return actual === sha256(bytes.value) ? [] : [`${path}: digest is not SHA-256 of the bytes`];
  },
  /** digest = H(observed IR) (harmonization B22). */
  "ir-digest"(e, actual, ctx, path) {
    const ir = resolveRef(e.ir, ctx);
    if (!ir.found) return [`${path}: IR missing`];
    return actual === H(ir.value) ? [] : [`${path}: artifact digest is not H(ir)`];
  },
  /** IR of a final export: node names drawn from the final labels only, required names present, stale names absent. */
  "ir-names"(e, actual, ctx, path) {
    if (!Array.isArray(actual) || !actual.every(r => r && typeof r === "object" && typeof r.kind === "string" && typeof r.id === "string")) return [`${path}: IR must be an array of records with kind and id`];
    const out = [], names = actual.filter(r => r.kind === "node" && Object.hasOwn(r, "name")).map(r => r.name);
    for (const n of names) if (!e.allowed.includes(n)) out.push(`${path}: node name ${JSON.stringify(n)} is not a final label`);
    for (const n of e.required) if (!names.includes(n)) out.push(`${path}: final name ${JSON.stringify(n)} absent`);
    for (const n of e.stale ?? []) if (names.includes(n)) out.push(`${path}: stale name ${JSON.stringify(n)} exported`);
    if (!actual.some(r => r.kind === "page")) out.push(`${path}: no page record`);
    return out;
  },
  /** Export idMap: rows of domain export with unique result IDs, sorted per §10.1 L753, covering the listed semantic IDs. */
  "export-idmap"(e, actual, ctx, path) {
    if (!Array.isArray(actual)) return [`${path}: idMap must be an array`];
    const out = [], results = new Set();
    actual.forEach((m, i) => {
      if (!m || m.domain !== "export" || typeof m.sourceId !== "string" || typeof m.resultId !== "string") out.push(`${path}/${i}: not an export row`);
      else { if (results.has(m.resultId)) out.push(`${path}/${i}: duplicate resultId`); results.add(m.resultId); }
    });
    const key = m => [m.domain, m.pageId ?? "", m.occurrenceKey ?? "", m.sourceId, m.resultId];
    for (let i = 1; i < actual.length; i++) {
      const a = key(actual[i - 1]), b = key(actual[i]);
      let c = 0; for (let j = 0; j < a.length && !c; j++) c = utf16(a[j], b[j]);
      if (c > 0) out.push(`${path}/${i}: idMap not in §10.1 L753 order`);
    }
    for (const id of e.covers) if (!actual.some(m => m.sourceId === id)) out.push(`${path}: ${id} not exported`);
    for (const id of e.never ?? []) if (actual.some(m => m.sourceId === id)) out.push(`${path}: ${id} exported`);
    return out;
  },
};

export const RULE_NAMES = Object.freeze(Object.keys(RULES));

// ---------------------------------------------------------------- comparators
/** Members each comparator reads from the observation (the harness contract). */
export const COMPARATORS = Object.freeze({
  "lot5/result": { role: "result", member: "result", note: "Result/1 or PureResult of the operation, exact (JCS) with explicit rules." },
  "lot5/snapshot": { role: "snapshot", member: "snapshot", note: "getSnapshot() Result/1 after the operation: envelope, presentation delta, selection, viewRevision." },
  "lot5/events": { role: "events", member: "events", note: "Change events (DESIGN §8.1 L606) emitted by the operation, in order, exact." },
  "lot5/history": { role: "history", member: "history", note: "undo() then redo() Results and their events after a commit, or the refused undo() probe after a refusal or no-op; root transaction count." },
  "lot5/staged-command": { role: "staged-command", member: "staged", note: "Command input staged at the profile transaction adapter entry by the gesture, exact." },
  "lot5/diagnostic": { role: "diagnostic", member: "diagnostic", note: "Refusal Result/1 surfaced as the diagnostic outcome of a refused gesture (§8.2 L633)." },
  "lot5/gesture-outcome": { role: "gesture-outcome", member: "outcome", note: "UI outcome of a gesture that stages nothing (prompt, connection or reconnection refused, cancelled)." },
  "lot5/download": { role: "download", member: "download", note: "Host download callbacks with the prepared and serialized artifacts (final-only)." },
  "lot5/static-surface": { role: "static-surface", member: "surface", note: "Read-only viewer/preview surface inventory." },
  "lot5/upstream-filter": { role: "upstream-filter", member: "upstream", note: "Upstream entry classification of the canvas business-profile mode." },
  "lot5/sequence": { role: "sequence", member: "steps", note: "Per-step observations of a multi-step case, in order." },
  "lot5/package-surface": { role: "package-surface", member: "package", note: "Static dependency/import inventory of the package entry points." },
  "lot5/host-callbacks": { role: "host-callbacks", member: "host", note: "Workshop host callbacks (onChange count, automatic saves)." },
  "lot5/clipboard": { role: "clipboard", member: "clipboard", note: "Fragment written to the clipboard by cut." },
  "lot5/compiled-identity": { role: "compiled-identity", member: "compiledIdentity", note: "The §5.1 profileIdentity record carried by the compiled profile." },
  "lot5/follow-up": { role: "follow-up", member: "followUp", note: "Result of the getter called right after the operation (for example getDefinitions after a refused load)." },
  "lot5/twin": { role: "twin", member: "twin", note: "Python headless twin outputs for the same command or query input; presentation members are excluded (runtime-specific layout, K18)." },
  // Vendored Python cases (block-B parity sync, BLOCKB-PARITY-SYNC §2.2): the Python comparators, one per sealed role.
  "lot5-py/compile-outcome": { role: "compile-outcome", member: "compileOutcome", vocabulary: "py", note: "Python comparator lot5-py/compile-outcome: loadProfile then compileProfile on the profileArtifact bytes with the base and descriptors artifacts: the first refusal as {status, code, diagnostics}, or the success {status: ok, payload, diagnostics} whose payload (the compiled profile, no wire shape) is the {$unsealed: compiled-profile} member." },
  "lot5-py/compiled-identity": { role: "compiled-identity", member: "compiledIdentity", vocabulary: "py", note: "Python comparator lot5-py/compiled-identity: the profileIdentity record (DESIGN R3.3 §5.1) carried by the compiled profile of a compile success, exact under profile-c14n/2." },
  "lot5-py/setup-outcomes": { role: "setup-outcomes", member: "setup", vocabulary: "py", note: "Setup part of the Python comparator lot5-py/step-outcomes: one headless bridge per case created with the descriptors artifact (or the bridge input), the envelope input loaded (with importedDi when given) and the compiled profileArtifact activated; the setDefinitions and activateBusinessProfile results {load, activate} equal the setup outcomes under profile-c14n/2 after each {$unsealed} marker is replaced by the actual member it marks (the member must exist)." },
  "lot5-py/step-outcomes": { role: "step-outcomes", member: "stepResults", vocabulary: "py", steps: true, note: "Python comparator lot5-py/step-outcomes: after the setup, the sequence steps run in order; every actual step result equals its outcome template under profile-c14n/2 after each {$unsealed} marker is replaced by the actual member it marks (the member must exist); equal/differ compare a pointer with a saved result. Placeholders {$current} and {$saved} are resolved before the request runs (Python SPEC_PROFILE_COMMANDS_PY.md section 8)." },
  "profile-c14n/2": { kind: "mechanism", note: "RFC 8785 JCS bytes, UTF-16 key order (DESIGN R3.3 §3.1): the canonical form every lot-5 comparator compares; mechanism comparator of the vendored Python cases, observing no member of its own." },
  "stable-id/1": { kind: "mechanism", note: "Allocated IDs recompute (DESIGN R3.3 §3.2): the vendored Python cases seal stable-id/1 values literally; mechanism comparator, observing no member of its own." },
});

/** Compare one observation with one case. inputs maps input roles to parsed JSON (pinned files already verified). */
export function compareCase(caseRecord, inputs, observed) {
  const failures = [];
  const expected = new Map(caseRecord.expectedArtifacts.map(a => [a.role, a.json]));
  const ctx = { inputs, observed };
  for (const id of caseRecord.comparatorIds) {
    const c = COMPARATORS[id];
    if (!c) { failures.push(`${id}: unknown comparator`); continue; }
    if (c.kind === "mechanism") continue;
    if (!expected.has(c.role)) { failures.push(`${id}: no expected ${c.role} artifact`); continue; }
    if (!Object.hasOwn(observed, c.member)) { failures.push(`${id}: observation lacks ${c.member}`); continue; }
    const found = c.vocabulary !== "py" ? match(expected.get(c.role), observed[c.member], ctx, `${id}`)
      : c.steps ? pySteps(expected.get(c.role), observed[c.member], caseRecord, `${id}`) : pyMatch(expected.get(c.role), observed[c.member], `${id}`);
    failures.push(...found.map(f => f.startsWith(id) ? f : `${id}${f}`));
  }
  return { ok: failures.length === 0, failures };
}
