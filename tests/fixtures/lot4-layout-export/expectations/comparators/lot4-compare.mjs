// Pinned executable comparators of the lot-4 seal (DESIGN 14.3 L961: pinned
// comparator source and hash, zero tolerance). Independent of the derivation
// tool: own RFC 8785 canonicalization, own XML reader. Imports node:crypto and
// the sibling XML reader only; no profile, layout, render or export code.
//
// Calling convention: comparator(expected, actual) -> { ok, failures }.
// `expected` maps each expected artifact role of the case to its parsed JSON
// (references resolved by the harness); `actual` is the observed output:
// the Result/1 or PureResult record (serializePrepared: payload.bytes is a
// Uint8Array), the seam output, the BPMN XML bytes (bpmn-structure/1),
// { before, after } input snapshots (source-immutability/1), or the ordered
// call outputs (determinism/1). drawio-structure/1 takes the Result of a second
// identical call as third argument when the sealed projection says
// deterministic: true (Python-shaped record of a vendored case).
import { createHash } from "node:crypto";
import { parseXml, attribute, elements, textOf, walkElements } from "./lot4-xml.mjs";

const verdict = failures => ({ ok: failures.length === 0, failures });
const utf16 = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// RFC 8785: UTF-16 key order, ECMAScript number spelling, no whitespace.
export function canonical(value) {
  if (value === null) return "null";
  if (value === true || value === false) return String(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical: nonfinite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value === "string") {
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) { const n = value.charCodeAt(i + 1); if (!(n >= 0xdc00 && n <= 0xdfff)) throw new Error("canonical: lone surrogate"); i++; }
      else if (c >= 0xdc00 && c <= 0xdfff) throw new Error("canonical: lone surrogate");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value).sort(utf16);
    for (const k of keys) if (value[k] === undefined) throw new Error(`canonical: undefined member ${k}`);
    return `{${keys.map(k => `${canonical(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  throw new Error(`canonical: not a JSON value (${Object.prototype.toString.call(value)})`);
}
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const tokens = pointer => {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`pointer ${pointer}`);
  return pointer.slice(1).split("/").map(t => t.replace(/~1/g, "/").replace(/~0/g, "~"));
};
export function resolvePointer(value, pointer) {
  let cur = value;
  for (const t of tokens(pointer)) {
    if (cur === null || typeof cur !== "object" || !Object.hasOwn(cur, Array.isArray(cur) ? Number(t) : t)) return { found: false };
    if (Array.isArray(cur) && !/^(0|[1-9][0-9]*)$/.test(t)) return { found: false };
    cur = cur[Array.isArray(cur) ? Number(t) : t];
  }
  return { found: true, value: cur };
}
function removePointer(value, pointer) {
  const path = tokens(pointer), last = path.pop();
  const parent = path.length ? resolvePointer(value, `/${path.map(t => t.replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`) : { found: true, value };
  if (!parent.found || parent.value === null || typeof parent.value !== "object") return false;
  if (Array.isArray(parent.value)) { parent.value[Number(last)] = null; return true; } // keep positions of other members
  if (!Object.hasOwn(parent.value, last)) return false;
  delete parent.value[last];
  return true;
}
function firstDifference(a, b, at = "") {
  if (canonicalOrNull(a) === canonicalOrNull(b)) return undefined;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()].map(String) : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(utf16);
    for (const k of keys) {
      const d = firstDifference(a[k], b[k], `${at}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`);
      if (d !== undefined) return d;
    }
  }
  return at || "/";
}
const canonicalOrNull = v => { try { return v === undefined ? "<absent>" : canonical(v); } catch (e) { return `<invalid ${e.message}>`; } };

// profile-c14n/2 and seam-exact/1: whole-artifact canonical equality.
export function canonicalEqual(expected, actual) {
  const want = expected.output ?? expected.result;
  const a = canonicalOrNull(actual), e = canonicalOrNull(want);
  return verdict(a === e ? [] : [`canonical mismatch at ${firstDifference(want, actual)}`]);
}

// result-exact/1: the whole record, minus the sealed UNSEALED pointers. An entry
// scoped to another expected artifact (member `artifact`) does not apply here.
export function resultExact(expected, actual) {
  const failures = [];
  const unsealed = (expected.unsealed ?? []).filter(u => u.artifact === undefined || u.artifact === "result");
  const a = structuredClone(actual), e = structuredClone(expected.result);
  for (const { pointer } of unsealed) {
    if (!resolvePointer(a, pointer).found) failures.push(`unsealed pointer ${pointer} absent from the actual record`);
    else removePointer(a, pointer);
    if (resolvePointer(e, pointer).found) removePointer(e, pointer);
  }
  if (canonicalOrNull(a) !== canonicalOrNull(e)) failures.push(`record mismatch at ${firstDifference(e, a)}`);
  return verdict(failures);
}

// layout-route/1: LINK-ROUTE invariants on the UNSEALED route members.
const inside = (p, b) => Number.isSafeInteger(p?.x) && Number.isSafeInteger(p?.y) && p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
export function layoutRoute(expected, actual) {
  const failures = [];
  const routes = (expected.unsealed ?? []).map(u => /^\/payload\/geometry\/(\d+)\/waypoints$/.exec(u.pointer)).filter(Boolean).map(m => Number(m[1]));
  if (!routes.length) failures.push("no route members to check");
  const geometry = actual?.payload?.geometry ?? [];
  for (const i of routes) {
    const g = geometry[i];
    if (!g || !g.sourceOccurrence || !g.targetOccurrence) { failures.push(`geometry ${i} is not an edge`); continue; }
    const find = ref => geometry.find(x => x.pageId === ref.pageId && x.occurrenceKey === ref.occurrenceKey);
    const src = find(g.sourceOccurrence), dst = find(g.targetOccurrence);
    if (!src || !dst || g.sourceOccurrence.pageId !== g.pageId || g.targetOccurrence.pageId !== g.pageId) { failures.push(`geometry ${i}: endpoints do not resolve on the page`); continue; }
    const w = g.waypoints;
    if (!Array.isArray(w) || w.length < 2 || !w.every(p => Number.isSafeInteger(p?.x) && Number.isSafeInteger(p?.y) && Object.keys(p).length === 2)) { failures.push(`geometry ${i}: waypoints`); continue; }
    if (!inside(w[0], src.bounds)) failures.push(`geometry ${i}: first waypoint outside the final source bounds`);
    if (!inside(w[w.length - 1], dst.bounds)) failures.push(`geometry ${i}: last waypoint outside the final target bounds`);
    const xs = w.map(p => p.x), ys = w.map(p => p.y);
    const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    if (canonical(box) !== canonical(g.bounds)) failures.push(`geometry ${i}: bounds are not the waypoint bounding box`);
  }
  return verdict(failures);
}

// profile-report/2: DESIGN 10.1 report rules on every report of the record.
const STAGES = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"];
const entryKey = e => [e.ruleId, e.source?.domain, e.source?.pointer, e.source?.targetId, e.code, e.pageId, e.occurrenceKey,
  e.beforePresent ? canonical(e.before) : undefined, e.afterPresent ? canonical(e.after) : undefined, e.result?.domain, e.result?.pointer, e.result?.targetId, e.property];
function compareEntries(a, b) {
  const sa = STAGES.indexOf(a.stage), sb = STAGES.indexOf(b.stage);
  if (sa !== sb) return sa - sb;
  const pa = entryKey(a), pb = entryKey(b);
  for (let i = 0; i < pa.length; i++) {
    const x = pa[i] ?? undefined, y = pb[i] ?? undefined;
    if (x === y) continue;
    if (x === undefined || x === null) return -1;
    if (y === undefined || y === null) return 1;
    const c = utf16(String(x), String(y)); if (c) return c;
  }
  return 0;
}
function compareIdMap(a, b) {
  for (const f of ["domain", "pageId", "occurrenceKey", "sourceId", "resultId"]) {
    const x = a[f], y = b[f];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const c = utf16(x, y); if (c) return c;
  }
  return 0;
}
export function reportOrder(expected, actual) {
  const failures = [];
  const reports = [["report", actual?.report], ["payload.report", actual?.payload?.report]].filter(([, r]) => r !== undefined);
  if (!reports.length) failures.push("no report");
  for (const [where, r] of reports) {
    if (r.reportVersion !== "2" || r.operation !== actual.operation) failures.push(`${where}: header`);
    const entries = r.entries ?? [];
    for (let i = 1; i < entries.length; i++) {
      const c = compareEntries(entries[i - 1], entries[i]);
      if (c > 0) failures.push(`${where}: entries ${i - 1}/${i} out of profile-report/2 order`);
      if (c === 0 && canonical(entries[i - 1]) === canonical(entries[i])) failures.push(`${where}: exact duplicate entry ${i}`);
    }
    if (!STAGES.includes(entries.find(e => !STAGES.includes(e.stage))?.stage ?? "load")) failures.push(`${where}: unknown stage`);
    const idMap = r.idMap ?? [];
    for (let i = 1; i < idMap.length; i++) if (compareIdMap(idMap[i - 1], idMap[i]) > 0) failures.push(`${where}: idMap ${i - 1}/${i} out of order`);
    const reachable = new Set((r.artifacts ?? []).flatMap(a => a.entryIndexes ?? []));
    for (const i of reachable) if (!Number.isSafeInteger(i) || i < 0 || i >= entries.length) failures.push(`${where}: entry index ${i} out of range`);
    entries.forEach((e, i) => {
      if ((e.classification === "loss") !== (e.lossClass !== undefined)) failures.push(`${where}: entry ${i} lossClass presence`);
      if (e.classification === "loss" && !reachable.has(i)) failures.push(`${where}: loss entry ${i} unreachable through entryIndexes`);
    });
    if (actual.status === "refused") {
      if ((r.artifacts ?? []).some(a => Object.hasOwn(a, "digest"))) failures.push(`${where}: refused artifact with digest`);
      if (canonicalOrNull(actual.diagnostics) !== canonicalOrNull(r.entries)) failures.push(`${where}: diagnostics differ from report entries`);
      if (Object.hasOwn(r, "targetIdentity") || Object.hasOwn(r, "outputRevision")) failures.push(`${where}: refusal report with output header members`);
    }
  }
  return verdict(failures);
}

// serialize-bytes/1: digests and serializer data invariants on the returned bytes.
export function serializeBytes(expected, actual) {
  const failures = [];
  const inv = expected["byte-invariants"];
  const bytes = actual?.payload?.bytes;
  if (!(bytes instanceof Uint8Array)) return verdict(["payload.bytes is not a byte array"]);
  const digest = sha256(bytes);
  if (actual.payload.digest !== digest) failures.push("payload.digest is not SHA-256 of the bytes");
  if (actual.report?.artifacts?.[0]?.digest !== digest) failures.push("report artifact digest is not SHA-256 of the bytes");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return verdict([...failures, "bytes are not UTF-8"]); }
  if (inv.byteOrderMark === false && text.charCodeAt(0) === 0xfeff) failures.push("byte order mark");
  if (inv.newline === "LF" && text.includes("\r")) failures.push("carriage return with newline LF");
  if (inv.indent === 0 && text.split("\n").some(line => /^[ \t]/.test(line))) failures.push("indentation with indent 0");
  if (inv.emptyElement === "short" && /<([A-Za-z_][\w.:-]*)(\s[^<>]*)?><\/\1>/.test(text)) failures.push("paired empty element with emptyElement short");
  let root;
  try { root = parseXml(text); } catch (e) { return verdict([...failures, e.message]); }
  if (inv.compression === "none") for (const d of elements(root).filter(el => el.local === "diagram")) {
    if (elements(d).length !== 1 || elements(d)[0].local !== "mxGraphModel" || d.children.some(c => c.type === "text" && c.value.trim())) failures.push(`diagram ${attribute(d, "id")} is not an uncompressed mxGraphModel`);
  }
  const order = inv.attributeOrder ?? [];
  if (order.length) for (const { el } of walkElements(root)) {
    const listed = el.attributes.map(([n]) => n).filter(n => order.includes(n));
    for (let i = 1; i < listed.length; i++) if (order.indexOf(listed[i - 1]) > order.indexOf(listed[i])) { failures.push(`${el.name} attribute order ${listed.join(",")}`); break; }
  }
  return verdict(failures);
}

// drawio-structure/1: diagrams and cells projected from the parsed bytes.
export function drawioProjection(bytes) {
  const root = parseXml(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (root.local !== "mxfile") throw new Error("root is not mxfile");
  const diagrams = elements(root).filter(el => el.local === "diagram").map(d => {
    const model = elements(d).find(el => el.local === "mxGraphModel");
    const rootEl = model && elements(model).find(el => el.local === "root");
    if (!rootEl) throw new Error(`diagram ${attribute(d, "id")} without mxGraphModel/root`);
    const cells = elements(rootEl).filter(el => el.local === "mxCell");
    const roots = cells.filter(c => attribute(c, "parent") === undefined);
    const layers = cells.filter(c => roots.length === 1 && attribute(c, "parent") === attribute(roots[0], "id") && attribute(c, "vertex") !== "1" && attribute(c, "edge") !== "1");
    if (roots.length !== 1 || layers.length !== 1) throw new Error(`diagram ${attribute(d, "id")}: expected one root cell and one layer`);
    const layer = attribute(layers[0], "id");
    const out = cells.filter(c => attribute(c, "vertex") === "1" || attribute(c, "edge") === "1").map(c => {
      const value = attribute(c, "value");
      const edge = attribute(c, "edge") === "1";
      return { id: attribute(c, "id"), kind: edge ? "edge" : "vertex", parent: attribute(c, "parent") === layer ? "$layer" : attribute(c, "parent"),
        ...(edge ? { source: attribute(c, "source"), target: attribute(c, "target") } : {}), ...(value === undefined || value === "" ? {} : { value }) };
    });
    return { id: attribute(d, "id"), name: attribute(d, "name"), cells: out };
  });
  return { root, diagrams };
}
export function drawioStructure(expected, actual, again) {
  const want = expected["drawio-structure"];
  const bytes = actual?.payload?.bytes;
  if (!(bytes instanceof Uint8Array)) return verdict(["payload.bytes is not a byte array"]);
  let got;
  try { got = drawioProjection(bytes); } catch (e) { return verdict([e.message]); }
  const failures = [];
  for (const name of want.mxfile?.absentAttributes ?? []) if (attribute(got.root, name) !== undefined) failures.push(`mxfile attribute ${name} present`);
  if (canonical(got.diagrams) !== canonical(want.diagrams)) failures.push(`projection mismatch at ${firstDifference(want.diagrams, got.diagrams)}`);
  // Python-shaped projection (vendored cases): byte invariants and determinism.
  const inv = want.byteInvariants;
  if (inv) {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    if (inv.encoding !== "UTF-8") failures.push(`unsupported encoding ${inv.encoding}`);
    if (inv.byteOrderMark === false && text.charCodeAt(0) === 0xfeff) failures.push("byte order mark");
    if (inv.carriageReturn === false && text.includes("\r")) failures.push("carriage return");
    if (inv.pairedEmptyElements === false && /<([A-Za-z_][\w.:-]*)(\s[^<>]*)?><\/\1>/.test(text)) failures.push("paired empty element");
    if (inv.compressed === false) for (const d of elements(got.root).filter(el => el.local === "diagram")) {
      if (elements(d).length !== 1 || elements(d)[0].local !== "mxGraphModel" || d.children.some(c => c.type === "text" && c.value.trim())) failures.push(`diagram ${attribute(d, "id")} is not an uncompressed mxGraphModel`);
    }
    if (inv.digestIsSha256OfBytes === true) {
      const digest = sha256(bytes);
      if (actual.payload.digest !== digest) failures.push("payload.digest is not SHA-256 of the bytes");
      if (actual.report?.artifacts?.[0]?.digest !== digest) failures.push("report artifact digest is not SHA-256 of the bytes");
    }
  }
  if (want.deterministic === true) {
    const repeat = again?.payload?.bytes;
    if (!(repeat instanceof Uint8Array)) failures.push("deterministic: second call result missing");
    else if (sha256(repeat) !== sha256(bytes)) failures.push("deterministic: a second identical call returned different bytes");
  }
  return verdict(failures);
}

// lint-includes/1 (Python seal comparator, vendored cases): each partial entry
// of the includes artifact matches at least one actual report entry on its
// listed members (targetId compares source.targetId), before UNSEALED removal.
export function lintIncludes(expected, actual) {
  const partials = expected.includes;
  const entries = actual?.report?.entries;
  if (!Array.isArray(partials) || !partials.length) return verdict(["no includes artifact"]);
  if (!Array.isArray(entries)) return verdict(["no report entries"]);
  const failures = [];
  partials.forEach((partial, i) => {
    const hit = entries.some(e => Object.entries(partial).every(([k, v]) => canonicalOrNull(k === "targetId" ? e?.source?.targetId : e?.[k]) === canonicalOrNull(v)));
    if (!hit) failures.push(`includes ${i} matches no report entry`);
  });
  return verdict(failures);
}

// bpmn-structure/1: facts over the parsed BPMN XML bytes.
export function bpmnStructure(expected, actual) {
  const facts = expected.output;
  if (!(actual instanceof Uint8Array)) return verdict(["BPMN output is not a byte array"]);
  let root;
  try { root = parseXml(new TextDecoder("utf-8", { fatal: true }).decode(actual)); } catch (e) { return verdict([e.message]); }
  const all = [...walkElements(root)];
  const failures = [];
  const named = (local, id) => all.filter(({ el }) => el.local === local && attribute(el, "id") === id);
  for (const f of facts) {
    if (f.count !== undefined) { const n = all.filter(({ el }) => el.local === f.element).length; if (n !== f.count) failures.push(`${f.element}: ${n} elements, expected ${f.count}`); continue; }
    const found = named(f.element, f.id);
    if (found.length !== 1) { failures.push(`${f.element}#${f.id}: ${found.length} elements`); continue; }
    const { el, parent } = found[0];
    const ref = spec => { const [local, id] = spec.split(":"); return { local, id }; };
    if (f.parent === "definitions" && parent?.local !== "definitions") failures.push(`${f.id}: parent ${parent?.local}`);
    else if (f.parent === "ioSpecification") {
      const owner = ref(f.owner);
      const grand = all.find(x => x.el === parent)?.parent;
      if (parent?.local !== "ioSpecification" || grand?.local !== owner.local || attribute(grand, "id") !== owner.id) failures.push(`${f.id}: not in the ioSpecification of ${f.owner}`);
    } else if (f.parent && f.parent !== "definitions") {
      const p = ref(f.parent);
      if (parent?.local !== p.local || attribute(parent, "id") !== p.id) failures.push(`${f.id}: parent ${parent?.local}#${attribute(parent ?? { attributes: [] }, "id")}`);
    }
    for (const [name, value] of Object.entries(f.attributes ?? {})) if (attribute(el, name) !== value) failures.push(`${f.id}: attribute ${name}`);
    for (const name of f.absent ?? []) if (attribute(el, name) !== undefined) failures.push(`${f.id}: attribute ${name} present`);
    for (const [local, texts] of Object.entries(f.children ?? {})) {
      const got = elements(el).filter(c => c.local === local).map(textOf);
      if (canonical(got) !== canonical(texts)) failures.push(`${f.id}: children ${local}`);
    }
  }
  return verdict(failures);
}

// source-immutability/1: every caller input is canonically unchanged.
export function sourceImmutable(expected, actual) {
  const { before, after } = actual ?? {};
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return verdict(["input snapshots"]);
  const same = (x, y) => (x instanceof Uint8Array && y instanceof Uint8Array ? sha256(x) === sha256(y) : canonicalOrNull(x) === canonicalOrNull(y));
  return verdict(before.flatMap((b, i) => (same(b, after[i]) ? [] : [`input ${i} mutated`])));
}

// determinism/1: identical inputs give identical bytes in the stated call order.
export function determinism(expected, actual) {
  const runs = actual ?? [];
  const byLabel = new Map();
  const failures = [];
  for (const { label, bytes } of runs) {
    const digest = sha256(bytes);
    if (byLabel.has(label) && byLabel.get(label) !== digest) failures.push(`call ${label} returned different bytes`);
    byLabel.set(label, digest);
  }
  if (canonical(expected.output) !== canonical({ sameBytesForSameInput: true, abaUnchanged: true })) failures.push("unexpected determinism record");
  return verdict(failures);
}

export const COMPARATORS = {
  "profile-c14n/2": canonicalEqual, "seam-exact/1": canonicalEqual, "result-exact/1": resultExact, "layout-route/1": layoutRoute,
  "profile-report/2": reportOrder, "serialize-bytes/1": serializeBytes, "drawio-structure/1": drawioStructure, "bpmn-structure/1": bpmnStructure,
  "source-immutability/1": sourceImmutable, "determinism/1": determinism, "lint-includes/1": lintIncludes,
};
