// Comparator self-test scaffolding for the lot-5 UI corpus: builds a synthetic
// observation that satisfies a case's expected templates (exemplar) and
// derives altered observations from it. It never runs a loader, compiler,
// evaluator, codec, layout, exporter or command: observations are synthetic.
import { H, at } from "../fixtures/lot5-ui/expectations/comparators/lot5-compare.mjs";
import { createHash } from "node:crypto";

const isObj = v => v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Uint8Array);
const isMarker = v => isObj(v) && (Object.hasOwn(v, "$unsealed") || Object.hasOwn(v, "$equals") || Object.hasOwn(v, "$rule"));
const PENDING = Symbol("pending");
const clone = v => v instanceof Uint8Array ? new Uint8Array(v) : Array.isArray(v) ? v.map(clone) : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) : v;
const utf16 = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sample = type => ({ string: "unsealed-sample", number: 7, boolean: false, object: {}, array: [], bytes: new Uint8Array([60, 120, 47, 62]), any: "unsealed-sample" })[type];

function resolve(ref, ctx) {
  const source = Object.hasOwn(ref, "input") ? ctx.inputs[ref.input] : ctx.observed[ref.member];
  if (source === undefined) return { found: false };
  const r = at(source, ref.pointer ?? "");
  if (!r.found) return r;
  return containsPending(r.value) ? { found: false } : r;
}
function containsPending(v) {
  if (v === PENDING) return true;
  if (Array.isArray(v)) return v.some(containsPending);
  if (isObj(v)) return Object.values(v).some(containsPending);
  return false;
}
/** Instantiate one template against the partial observation; unresolved refs stay PENDING. */
function instantiate(t, ctx) {
  if (isMarker(t)) {
    // A Python-vocabulary marker (vendored lot5-py-* cases) has no type: any JSON value.
    if (Object.hasOwn(t, "$unsealed")) return t.optional ? undefined : sample(t.type ?? "any");
    if (Object.hasOwn(t, "$equals")) { const r = resolve(t.$equals, ctx); return r.found ? clone(r.value) : PENDING; }
    return rule(t, ctx);
  }
  if (Array.isArray(t)) return t.map(x => instantiate(x, ctx));
  if (isObj(t)) {
    const out = {};
    for (const [k, v] of Object.entries(t)) { const x = instantiate(v, ctx); if (x !== undefined) out[k] = x; }
    return out;
  }
  return t;
}
const pair = (p, k) => `${p}\u0000${k}`;
function rule(t, ctx) {
  switch (t.$rule) {
    case "view-revision": {
      const l = resolve(t.layout, ctx); if (!l.found) return PENDING;
      return H({ semanticRevision: t.semanticRevision, layoutDigest: H(l.value), themeId: t.themeId, themeDigest: t.themeDigest, overridesDigest: t.overridesDigest, diStylesDigest: t.diStylesDigest, metricsDigest: t.metricsDigest });
    }
    case "view-revision-binding": {
      const b = resolve(t.binding, ctx); if (!b.found) return PENDING; const v = b.value;
      return H({ semanticRevision: v.semanticRevision, layoutDigest: v.layoutDigest, themeId: v.themeId, themeDigest: v.themeDigest, overridesDigest: v.overridesDigest, diStylesDigest: v.diStylesDigest, metricsDigest: v.metricsDigest });
    }
    case "selection-valid": return [];
    case "bytes-sha256": { const b = resolve(t.bytes, ctx); if (!b.found) return PENDING; return createHash("sha256").update(b.value).digest("hex"); }
    case "ir-digest": { const ir = resolve(t.ir, ctx); if (!ir.found) return PENDING; return H(ir.value); }
    case "ir-names": return [{ kind: "page", id: "e_0", name: "page" }, ...t.required.map((name, n) => ({ kind: "node", id: `e_${n + 1}`, name, parent: "e_0" }))];
    case "export-idmap": return t.covers.map((id, n) => ({ sourceId: id, resultId: `e_${n + 1}`, domain: "export", pageId: "p", occurrenceKey: `k${String(n).padStart(3, "0")}` }));
    case "layout-delta": {
      const base = resolve(t.base, ctx); if (!base.found) return PENDING;
      const L0 = base.value, removed = new Set(t.remove);
      const pages = L0.pages.map(clone);
      const geometry = [];
      for (const g0 of L0.geometry) {
        if (removed.has(g0.semanticId)) continue;
        const m = (t.modify ?? []).find(m => m.pageId === g0.pageId && (m.occurrenceKey === g0.occurrenceKey || m.semanticId === g0.semanticId));
        const g = clone(g0);
        if (m) {
          Object.assign(g, clone(m.set ?? {}));
          for (const k of m.changed ?? []) if (k === "waypoints") g.waypoints = [...g.waypoints.slice(0, 1), { x: 1, y: 1 }, ...g.waypoints.slice(1)];
        }
        geometry.push(g);
      }
      t.add.filter(a => !a.edge).forEach(a => geometry.push({ pageId: a.pageId, occurrenceKey: `new:${a.semanticId}`, semanticId: a.semanticId, role: a.role, bounds: { x: 0, y: 0, width: 10, height: 10 } }));
      for (const a of t.add.filter(a => a.edge)) {
        const end = id => geometry.find(g => g.pageId === a.pageId && g.semanticId === id);
        const s = end(a.edge.source), e = end(a.edge.target);
        if (!s || !e) return PENDING;
        geometry.push({ pageId: a.pageId, occurrenceKey: `new:${a.semanticId}`, semanticId: a.semanticId, role: a.role, bounds: { x: 0, y: 0, width: 1, height: 1 },
          sourceOccurrence: { pageId: a.pageId, occurrenceKey: s.occurrenceKey }, targetOccurrence: { pageId: a.pageId, occurrenceKey: e.occurrenceKey }, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
      }
      const order = new Map(pages.map(p => [p.pageId, p.order]));
      geometry.sort((a, b) => order.get(a.pageId) - order.get(b.pageId) || utf16(a.occurrenceKey, b.occurrenceKey));
      return { layoutVersion: "1", pages, geometry };
    }
    default: throw new Error(`exemplar: unknown rule ${t.$rule}`);
  }
}
function deepFill(target, t, ctx) {
  // Replace PENDING slots of an instantiated value from its template, in place.
  if (target === PENDING) { const x = instantiate(t, ctx); return x; }
  if (Array.isArray(target)) return target.map((x, i) => deepFill(x, Array.isArray(t) ? t[i] : t, ctx));
  if (isObj(target) && !isMarker(t)) { for (const k of Object.keys(target)) target[k] = deepFill(target[k], t[k], ctx); return target; }
  return target;
}

/** A synthetic observation satisfying every comparator of the case. */
export function exemplar(caseRecord, inputs, COMPARATORS) {
  const ctx = { inputs, observed: {} };
  const expected = new Map(caseRecord.expectedArtifacts.map(a => [a.role, a.json]));
  const observing = caseRecord.comparatorIds.map(id => COMPARATORS[id]).filter(c => c.kind !== "mechanism");
  const members = observing.map(c => [c.member, expected.get(c.role)]);
  // Python step outcomes observe exactly {result} per step (equal/differ are relations, not observed members).
  for (const c of observing) ctx.observed[c.member] = c.steps ? expected.get(c.role).map(s => ({ result: instantiate(s.result, ctx) })) : instantiate(expected.get(c.role), ctx);
  for (let pass = 0; pass < 20; pass++) {
    let pending = false;
    for (const [member, t] of members) { ctx.observed[member] = deepFill(ctx.observed[member], t, ctx); if (containsPending(ctx.observed[member])) pending = true; }
    if (!pending) return ctx.observed;
  }
  throw new Error(`${caseRecord.caseId}: exemplar refs do not resolve`);
}

// ---------------------------------------------------------------- alterations
/** Leaf positions [path array, template slot kind] of a member: "sealed" literals, "unsealed" markers. */
function positions(value, template, path = [], out = []) {
  if (isMarker(template)) {
    if (Object.hasOwn(template, "$unsealed")) out.push({ path, kind: "unsealed", type: template.type });
    else if (Object.hasOwn(template, "$equals")) collectLeaves(value, path, out, "sealed");
    else out.push({ path, kind: "rule", rule: template.$rule });
    return out;
  }
  if (Array.isArray(template)) { template.forEach((t, i) => positions(value?.[i], t, [...path, i], out)); out.push({ path, kind: "array" }); return out; }
  if (isObj(template)) { for (const k of Object.keys(template)) positions(value?.[k], template[k], [...path, k], out); out.push({ path, kind: "object" }); return out; }
  out.push({ path, kind: "sealed" });
  return out;
}
function collectLeaves(v, path, out, kind) {
  if (Array.isArray(v)) { v.forEach((x, i) => collectLeaves(x, [...path, i], out, kind)); return; }
  if (isObj(v)) { for (const k of Object.keys(v)) collectLeaves(v[k], [...path, k], out, kind); return; }
  out.push({ path, kind });
}
const get = (v, path) => path.reduce((x, k) => x?.[k], v);
function set(v, path, value) { const parent = get(v, path.slice(0, -1)); parent[path[path.length - 1]] = value; }
const flip = v => typeof v === "string" ? `${v}x` : typeof v === "number" ? v + 1 : typeof v === "boolean" ? !v : v === null ? "null" : v instanceof Uint8Array ? (() => { const b = new Uint8Array(v); b[0] ^= 1; return b; })() : undefined;

/**
 * Altered observations: every sealed leaf flipped (spread sample), structural
 * edits of sealed objects/arrays, type changes of unsealed members (all must
 * FAIL), and value changes of unsealed members (must PASS).
 */
export function* alterations(caseRecord, observed, COMPARATORS, { perMember = 30 } = {}) {
  const expected = new Map(caseRecord.expectedArtifacts.map(a => [a.role, a.json]));
  for (const id of caseRecord.comparatorIds) {
    const c = COMPARATORS[id];
    if (c.kind === "mechanism") continue;
    const { member, role } = c;
    const pos = positions(observed[member], expected.get(role));
    const leaves = pos.filter(p => p.kind === "sealed" && flip(get(observed[member], p.path)) !== undefined);
    const step = Math.max(1, Math.floor(leaves.length / perMember));
    for (let n = 0; n < leaves.length; n += step) {
      const o = clone(observed); set(o[member], leaves[n].path, flip(get(o[member], leaves[n].path)));
      yield { label: `${id} sealed ${member}/${leaves[n].path.join("/")}`, observed: o, pass: false };
    }
    for (const p of pos.filter(p => p.kind === "object" && p.path.length)) {
      const o = clone(observed); const target = get(o[member], p.path);
      if (!isObj(target)) continue;
      target.unexpectedMember = 1;
      yield { label: `${id} extra member ${member}/${p.path.join("/")}`, observed: o, pass: false };
      const keys = Object.keys(get(observed[member], p.path) ?? {});
      if (keys.length) { const o2 = clone(observed); delete get(o2[member], p.path)[keys[0]]; yield { label: `${id} missing member ${member}/${p.path.join("/")}/${keys[0]}`, observed: o2, pass: false }; }
    }
    for (const p of pos.filter(p => p.kind === "array")) {
      const arr = get(observed[member], p.path);
      if (!Array.isArray(arr) || !arr.length) continue;
      const o = clone(observed); get(o[member], p.path).push(clone(arr[0]));
      yield { label: `${id} duplicated item ${member}/${p.path.join("/")}`, observed: o, pass: false };
      if (arr.length > 1 && JSON.stringify(arr[0]) !== JSON.stringify(arr[1])) {
        const o2 = clone(observed); const a2 = get(o2[member], p.path); [a2[0], a2[1]] = [a2[1], a2[0]];
        yield { label: `${id} reordered ${member}/${p.path.join("/")}`, observed: o2, pass: false };
      }
    }
    for (const p of pos.filter(p => p.kind === "unsealed")) {
      const v = get(observed[member], p.path);
      if (v === undefined) continue;
      const o = clone(observed); set(o[member], p.path, typeof v === "string" ? 12 : "wrong-type");
      // A Python-vocabulary marker admits any JSON type unless an equal relation compares the member.
      const free = p.type === undefined && c.vocabulary === "py" && !pyRelated(caseRecord, expected.get(role), c, p.path);
      yield { label: `${id} unsealed type ${member}/${p.path.join("/")}`, observed: o, pass: free };
      if (["string", "number", "boolean", "bytes"].includes(p.type)) {
        const o2 = clone(observed); set(o2[member], p.path, flip(v));
        yield { label: `${id} unsealed value ${member}/${p.path.join("/")}`, observed: o2, pass: !isReferenced(caseRecord, member, p.path) };
      }
    }
    for (const p of pos.filter(p => p.kind === "rule")) {
      const v = get(observed[member], p.path);
      if (typeof v === "string") { const o = clone(observed); set(o[member], p.path, `${v}x`); yield { label: `${id} rule ${p.rule} ${member}/${p.path.join("/")}`, observed: o, pass: false }; }
      if (p.rule === "layout-delta") yield* layoutAlterations(id, member, p.path, observed);
      if (p.rule === "ir-names" && Array.isArray(v)) {
        const o = clone(observed); get(o[member], p.path).push({ kind: "node", id: "e_99", name: "Name of an intermediate state", parent: "e_0" });
        yield { label: `${id} IR stale name ${member}/${p.path.join("/")}`, observed: o, pass: false };
      }
      if (p.rule === "export-idmap" && Array.isArray(v) && v.length) {
        const o = clone(observed); get(o[member], p.path).splice(0, 1);
        yield { label: `${id} idMap covered row dropped ${member}/${p.path.join("/")}`, observed: o, pass: false };
      }
    }
  }
}
const escapeSegment = k => String(k).replace(/~/g, "~0").replace(/\//g, "~1");
const under = (pointer, base) => base === "" || pointer === base || pointer.startsWith(`${base}/`);
/** Whether an equal relation of Python step outcomes compares the member at path ([step, "result", ...]) of the step observations. */
function pyRelated(caseRecord, template, c, path) {
  if (!c.steps || path[1] !== "result") return false;
  const i = path[0], pointer = path.slice(2).map(k => `/${escapeSegment(k)}`).join("");
  const saved = caseRecord.commandArtifact?.json?.steps?.[i]?.save;
  return template.some((t, k) => (t.equal ?? []).some(rel => (k === i && under(pointer, rel.pointer)) || (typeof saved === "string" && rel.saved === saved && under(pointer, rel.savedPointer))));
}
const BINDING_INPUTS = ["semanticRevision", "layoutDigest", "themeId", "themeDigest", "overridesDigest", "diStylesDigest", "metricsDigest"];
/** An unsealed value that another template compares through $equals is not free: changing it alone must fail. */
function isReferenced(caseRecord, member, path) {
  const pointer = `/${path.join("/")}`;
  let hit = false;
  (function walk(v) {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!isObj(v)) return;
    if (Object.hasOwn(v, "$equals") && v.$equals.member === member && (pointer === v.$equals.pointer || pointer.startsWith(`${v.$equals.pointer}/`))) hit = true;
    if (Object.hasOwn(v, "$rule")) for (const r of Object.values(v)) if (isObj(r) && r.member === member && (pointer === r.pointer || pointer.startsWith(`${r.pointer}/`))) {
      // view-revision-binding reads only the seven §9.2 view digest inputs of the binding.
      if (v.$rule === "view-revision-binding" && !BINDING_INPUTS.includes(path[path.length - 1])) continue;
      hit = true;
    }
    Object.values(v).forEach(walk);
  })(caseRecord.expectedArtifacts.map(a => a.json));
  return hit;
}
function* layoutAlterations(id, member, path, observed) {
  const L = get(observed[member], path);
  if (!L?.geometry?.length) return;
  const untouched = L.geometry.findIndex(g => !String(g.occurrenceKey).startsWith("new:"));
  if (untouched >= 0) {
    const o = clone(observed); get(o[member], path).geometry[untouched].bounds.x += 1;
    yield { label: `${id} layout untouched bounds ${member}`, observed: o, pass: false };
  }
  if (L.geometry.length > 1) {
    const o = clone(observed); const g = get(o[member], path).geometry; [g[0], g[1]] = [g[1], g[0]];
    yield { label: `${id} layout order ${member}`, observed: o, pass: false };
  }
  const added = L.geometry.findIndex(g => String(g.occurrenceKey).startsWith("new:"));
  if (added >= 0) {
    const o = clone(observed); get(o[member], path).geometry.splice(added, 1);
    yield { label: `${id} layout added occurrence dropped ${member}`, observed: o, pass: false };
  }
  const o2 = clone(observed); get(o2[member], path).pages[0].name += "x";
  yield { label: `${id} layout page name ${member}`, observed: o2, pass: false };
}
