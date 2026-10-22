// Assembly of expected export-ir/1 artifacts from literal spec-author
// decisions about the export recipes (no recipe interpreter): which occurrences
// each recipe selects, which fields it emits, which losses apply.
import { H, jcs, clone, compareText, digestOutputId } from "./lot4-core.mjs";
import { preorder, themeChain, themeDigest, metricPinsOf, descriptorDigestOf, resolveThemeId } from "./lot4-render.mjs";
import { reportOf, sortEntries, sortIdMap } from "./lot4-results.mjs";

const DOMAINS = ["page", "node", "edge", "label"];
const keyString = k => `${k.pageId}\u0000${k.occurrenceKey}\u0000${k.domain}`;

// DESIGN 10.2 L801 counter plan: requested keys, domain order, page order, UTF-16 key.
export function planCounter(keys, pages, origin) {
  const order = new Map(pages.map(p => [p.pageId, p.order]));
  const unique = [];
  for (const key of keys) if (!unique.some(k => keyString(k) === keyString(key))) unique.push(key);
  unique.sort((a, b) => DOMAINS.indexOf(a.domain) - DOMAINS.indexOf(b.domain) || order.get(a.pageId) - order.get(b.pageId) || compareText(a.occurrenceKey, b.occurrenceKey));
  return new Map(unique.map((k, i) => [keyString(k), `e_${origin + i}`]));
}
export function planNative(keys, render) {
  const ids = new Map(), used = new Map();
  for (const key of keys) {
    const kk = keyString(key);
    if (ids.has(kk)) continue;
    let id;
    if (key.domain === "page") id = key.pageId;
    else {
      const occ = render.occurrences.find(o => o.pageId === key.pageId && o.occurrenceKey === key.occurrenceKey);
      if (!occ || occ.semanticId === undefined) return { refused: "export-id-ambiguous" };
      id = occ.semanticId;
    }
    if (used.has(id) && used.get(id) !== kk) return { refused: "export-id-ambiguous" };
    used.set(id, kk); ids.set(kk, id);
  }
  return { ids };
}
export function planDigest(keys) {
  return new Map(keys.map(k => [keyString(k), digestOutputId(k.pageId, k.occurrenceKey, k.domain)]));
}

// Literal semantics of the export recipes of each profile family.
const isNode = o => o.emittedType === "node", isEdge = o => o.emittedType === "edge";
export const RECIPE_FAMILIES = {
  // lot-4 profile: export-nodes skips call activities, export-calls emits them
  // then reports navigation, export-aid-marker reports a stripped marker.
  lot4: ({ recipe, render, typeOf, notionOf }) => {
    const call = o => o.semanticId !== undefined && typeOf(o.semanticId) === "bpmn:CallActivity";
    if (recipe === "export-nodes") return render.occurrences.filter(o => isNode(o) && !call(o)).map(o => ({ kind: "node", occurrence: o }));
    if (recipe === "export-calls") return render.occurrences.filter(o => isNode(o) && call(o)).map(o => ({ kind: "node", occurrence: o, lossAfter: "navigation" }));
    if (recipe === "export-edges") return render.occurrences.filter(isEdge).map(o => ({ kind: "edge", occurrence: o }));
    if (recipe === "export-edge-labels") return render.occurrences.filter(o => isEdge(o) && o.label).map(o => ({ kind: "label", occurrence: o }));
    if (recipe === "export-aid-marker") return render.occurrences.filter(o => o.semanticId !== undefined && notionOf[o.semanticId] === "aid").map(o => ({ kind: "loss", occurrence: o, lossClass: "metadata" }));
    return undefined;
  },
  // Vendored lot-0 neutral profile: export-nodes emits every node occurrence.
  neutral: ({ recipe, render }) => (recipe === "export-nodes" ? render.occurrences.filter(isNode).map(o => ({ kind: "node", occurrence: o })) : undefined),
  // Vendored lot-0 grid profile: z-last is nested under the a-first node of its page.
  grid: ({ recipe, render }) => {
    if (recipe === "export-nodes") return render.occurrences.filter(o => isNode(o) && o.occurrenceKey !== "z-last").map(o => ({ kind: "node", occurrence: o }));
    if (recipe === "export-nested-nodes") return render.occurrences.filter(o => o.occurrenceKey === "z-last").map(o => ({ kind: "node", occurrence: o, parentKey: { pageId: o.pageId, occurrenceKey: "a-first", domain: "node" } }));
    return undefined;
  },
};
const key = (o, domain) => ({ pageId: o.pageId, occurrenceKey: domain === "page" ? "" : o.occurrenceKey, domain });
export function exportRecipesPlan({ recipes, render, family, typeOf, notionOf }) {
  const keys = [], emissions = [];
  const byPair = p => render.occurrences.find(o => o.pageId === p.pageId && o.occurrenceKey === p.occurrenceKey);
  for (const recipe of recipes) {
    if (recipe === "export-pages") { for (const p of render.pages) { keys.push(key(p, "page")); emissions.push({ recipe, kind: "page", page: p, key: key(p, "page") }); } continue; }
    const selected = RECIPE_FAMILIES[family]({ recipe, render, typeOf, notionOf });
    if (selected === undefined) throw new Error(`no literal semantics for ${family}/${recipe}`);
    for (const s of selected) {
      if (s.kind === "loss") { emissions.push({ recipe, ...s }); continue; }
      const k = key(s.occurrence, s.kind);
      keys.push(k);
      const e = { recipe, ...s, key: k };
      if (s.kind === "edge") {
        const src = key(byPair(s.occurrence.sourceOccurrence), "node"), dst = key(byPair(s.occurrence.targetOccurrence), "node");
        keys.push(src, dst); e.refs = { source: src, target: dst };
      }
      if (s.parentKey) keys.push(s.parentKey);
      emissions.push(e);
    }
  }
  return { keys, emissions };
}

// Literal capability decisions per profile family (classes per occurrence).
export const CAPABILITY_FAMILIES = {
  lot4: ({ occurrence, typeOf, notionOf, tree }) => {
    if (occurrence.semanticId === undefined) return [];
    const type = typeOf(occurrence.semanticId), losses = [];
    if (type === "bpmn:DataStoreReference") losses.push("semantic-type");
    if (type === "bpmn:DataInput" || type === "bpmn:DataOutput") losses.push("semantic-type");
    if (type === "bpmn:DataInputAssociation" || type === "bpmn:DataOutputAssociation") losses.push("relation-kind");
    if (notionOf[occurrence.semanticId] === "band") losses.push("metadata");
    if (type === "bpmn:EndEvent" && tree.terminateEnds.has(occurrence.semanticId)) losses.push("semantic-type", "appearance");
    if (type === "bpmn:ServiceTask") losses.push("semantic-type");
    return losses;
  },
  // Lot-0 neutral and grid: one record, when true, structural, semantic-type.
  everyOccurrence: () => ["semantic-type"],
  none: () => [],
};

const unavailable = () => ({ domain: "none", pointer: null, targetId: null, provenance: "unavailable" });
export function assembleExport({ spec, render, envelope, viewRevision, family, capabilityFamily, notionOf = {}, capabilityOverride }) {
  const nodes = new Map(preorder(envelope.tree).map(n => [n.id, n]));
  const typeOf = id => nodes.get(id)?.type;
  // Literal reading of the terminate-end predicate: an EndEvent holding a TerminateEventDefinition.
  const terminateEnds = new Set();
  const walk = n => {
    if (n.$type === "bpmn:EndEvent" && (n.eventDefinitions ?? []).some(d => d.$type === "bpmn:TerminateEventDefinition")) terminateEnds.add(n.id);
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(c => { if (c && typeof c === "object" && typeof c.$type === "string") walk(c); });
      else if (v && typeof v === "object" && typeof v.$type === "string") walk(v);
    }
  };
  walk(envelope.tree);
  const { keys, emissions } = exportRecipesPlan({ recipes: spec.recipes, render, family, typeOf, notionOf });
  let ids;
  if (spec.idPolicy === "counter") ids = planCounter(keys, render.pages, spec.counterOrigin);
  else if (spec.idPolicy === "digest") ids = planDigest(keys);
  else { const r = planNative(keys, render); if (r.refused) return r; ids = r.ids; }
  const ir = [], idMap = [], emitted = new Set(), entries = [];
  const sourceOf = o => (o.semanticId === undefined ? unavailable() : { domain: "tree", pointer: nodes.get(o.semanticId).pointer, targetId: o.semanticId, provenance: "exact" });
  const lossEntry = (occurrence, lossClass, ruleId, result) => ({
    code: `export-loss/${lossClass}`, severity: "warn", classification: "loss", stage: "export", ruleId,
    messageKey: `export.loss.${lossClass}`, disposition: "mapped", source: sourceOf(occurrence), result,
    beforePresent: false, afterPresent: false, pageId: occurrence.pageId, occurrenceKey: occurrence.occurrenceKey, emittedType: occurrence.emittedType, lossClass,
  });
  for (const e of emissions) {
    if (e.kind === "loss") { entries.push(lossEntry(e.occurrence, e.lossClass, e.recipe, unavailable())); continue; }
    const id = ids.get(keyString(e.key));
    if (emitted.has(id)) return { refused: "export-parent-invalid" };
    const pageIdOf = pid => ids.get(keyString({ pageId: pid, occurrenceKey: "", domain: "page" }));
    let record;
    if (e.kind === "page") record = { kind: "page", id, name: e.page.name, bounds: e.page.bounds };
    else {
      const o = e.occurrence;
      const parent = e.parentKey ? ids.get(keyString(e.parentKey)) : pageIdOf(o.pageId);
      if (!emitted.has(parent)) return { refused: "export-parent-order" };
      const lbl = o.label ? { bounds: o.label.bounds, lines: o.label.lines } : undefined;
      if (e.kind === "node") record = { kind: "node", id, ...(o.label ? { name: o.label.text } : {}), parent, bounds: o.bounds, style: o.style, ...(lbl ? { label: lbl } : {}) };
      else if (e.kind === "edge") {
        const source = ids.get(keyString(e.refs.source)), target = ids.get(keyString(e.refs.target));
        if (!emitted.has(source) || !emitted.has(target)) return { refused: "export-parent-order" };
        record = { kind: "edge", id, source, target, parent, bounds: o.bounds, waypoints: o.waypoints, style: o.style, ...(lbl ? { label: lbl } : {}) };
      } else record = { kind: "label", id, text: o.label.text, parent, bounds: o.label.bounds, lines: o.label.lines };
    }
    emitted.add(id);
    ir.push(record);
    if (e.kind === "page") idMap.push({ sourceId: e.page.pageId, resultId: id, domain: "export", pageId: e.page.pageId });
    else if (e.occurrence.semanticId !== undefined) idMap.push({ sourceId: e.occurrence.semanticId, resultId: id, domain: "export", pageId: e.occurrence.pageId, occurrenceKey: e.occurrence.occurrenceKey });
    // Loss action after the emit of the same iteration: result = that record (B23).
    if (e.lossAfter) entries.push(lossEntry(e.occurrence, e.lossAfter, e.recipe, { domain: "artifact", pointer: `/ir/${ir.length - 1}`, targetId: id, provenance: "exact" }));
  }
  // Capability-declared losses: ruleId = export spec id, result unavailable (B23).
  for (const o of render.occurrences) for (const lossClass of CAPABILITY_FAMILIES[capabilityFamily]({ occurrence: o, typeOf, notionOf, tree: { terminateEnds } })) entries.push(lossEntry(o, lossClass, spec.id, unavailable()));
  const unique = [];
  for (const e of sortEntries(entries)) if (!unique.length || jcs(unique[unique.length - 1]) !== jcs(e)) unique.push(e);
  const capability = capabilityOverride ?? "structural";
  const sortedIdMap = sortIdMap(idMap);
  const identity = envelope.profileIdentity, revision = envelope.semanticRevision;
  // One artifact record per output file, digest = H(ir), every entry reachable (B22).
  const report = reportOf("mapExport", { sourceIdentity: identity, targetIdentity: identity, inputRevision: revision, outputRevision: revision,
    entries: unique, idMap: sortedIdMap, artifacts: [{ format: spec.format, capability, digest: H(ir), entryIndexes: unique.map((_, i) => i) }] });
  const prepared = { format: spec.format, profileIdentity: identity, semanticRevision: revision, viewRevision, ir, renderBinding: render.binding, report, capability, idMap: sortedIdMap };
  return { prepared, result: { status: "ok", operation: "mapExport", profileIdentity: identity, baseRevision: revision, revision, report, payload: prepared } };
}

// mapExport freshness (DESIGN 9.2 L690; harmonization K14): binding fields
// derivable from the inputs, then occurrence/layout record equality.
export function staleChecks({ profile, envelope, layout, render, metricBytes }) {
  const problems = [];
  const b = render.binding;
  if (b.semanticRevision !== envelope.semanticRevision) problems.push("semanticRevision");
  if (b.profileDigest !== H(profile)) problems.push("profileDigest");
  if (b.descriptorDigest !== descriptorDigestOf(envelope.profileIdentity.descriptors)) problems.push("descriptorDigest");
  if (b.layoutDigest !== H(layout)) problems.push("layoutDigest");
  const themeId = resolveThemeId(profile.themes, b.themeId);
  if (themeId !== b.themeId) problems.push("themeId");
  else {
    if (b.themeDigest !== themeDigest(profile.themes, themeId)) problems.push("themeDigest");
    if (b.metricsDigest !== H(metricPinsOf(themeChain(profile.themes, themeId), metricBytes))) problems.push("metricsDigest");
  }
  if (b.payloadDigest !== H({ pages: render.pages, occurrences: render.occurrences, coverage: render.coverage, diagnostics: render.diagnostics })) problems.push("payloadDigest");
  if (jcs(render.pages) !== jcs(layout.pages)) problems.push("pages");
  for (const o of render.occurrences) {
    const { emittedType, style, glyphId, ...rest } = o;
    const g = layout.geometry.find(x => x.pageId === o.pageId && x.occurrenceKey === o.occurrenceKey);
    if (!g || jcs(g) !== jcs(rest)) { problems.push(`occurrence ${o.pageId}/${o.occurrenceKey}`); break; }
  }
  return problems;
}
export const cloneRender = r => clone(r);
