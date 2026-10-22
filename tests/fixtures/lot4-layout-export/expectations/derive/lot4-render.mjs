// Assembly of expected RenderData/1 from literal spec-author decisions.
// The notion of each element and the label text of each occurrence are written
// as literal tables (no predicate or recipe is evaluated). Token precedence,
// coverage order and synthetic records follow the README design points.
import { H, B, jcs, clone, compareText } from "./lot4-core.mjs";

export const PAINT = new Set(["fill", "stroke", "textColor", "fontFamily", "fontSize", "strokeWidth", "fontWeight", "dash", "arrow"]);
const byName = list => [...list].sort((a, b) => compareText(a.name, b.name));

// Literal notion decision per semantic element (DESIGN 9.3 L698: per-notion bindings).
export const NOTION_OF = {
  Pool_Main: "pool", Band_Main: "band", Lane_External: "lane-external", Lane_Work: "lane-work",
  Start_Main: "start", Task_Check: "task", Gateway_Ok: "decision", Task_Ship: "task", Task_Fix: "task", End_Done: "end",
  Flow_Start: "flow", Flow_Check: "flow", Flow_Ship: "flow", Flow_Back: "flow", Flow_Yes: "choice", Flow_No: "choice",
  StoreRef_Policy: "reference", Input_Order: "process-input", Output_Receipt: "process-output",
  Assoc_Policy: "relation", Assoc_Aid: "relation", Input_Link: "data-link", Output_Link: "data-link", Aid_Scanner: "aid",
  Pool_A: "pool", Band_A: "band", Task_A1: "task", StoreRef_A: "reference", Assoc_A: "relation",
  Pool_B: "pool", Band_B: "band", Task_B1: "task", StoreRef_B: "reference", Assoc_B: "relation",
  Pool_Empty: "pool",
  Pool_Choices: "pool", Start_Choices: "start", Gateway_Route: "decision", Flow_C0: "flow",
  Task_East: "task", Task_West: "task", Task_North: "task", Task_South: "task", Task_Up: "task", Task_Down: "task", Task_Other: "task",
  Flow_C1: "choice", Flow_C2: "choice", Flow_C3: "choice", Flow_C4: "choice", Flow_C5: "choice", Flow_C6: "choice", Flow_C7: "choice",
  Pool_Variety: "pool", Start_V: "start", Service_V: "service", Call_V: "call", End_V: "terminate-end", Flow_V1: "flow", Flow_V2: "flow", Flow_V3: "flow",
  // Note_Plain deliberately has no notion (no glyph binding).
};
export const FACETS_OF = { Task_Fix: ["rework-stroke", "rework-weight"] };

// Literal binding table of the lot-4 profile (theme -> notion -> glyph/tokens).
const t = (name, value) => ({ name, value });
export const LOT4_BINDINGS = {
  plain: {
    task: { glyph: "task", tokens: [t("fill", "#ffffff")] },
    aid: { glyph: "aid", tokens: [t("fill", "#eeeeff")] },
    start: { glyph: "start", tokens: [] },
    end: { glyph: "end", tokens: [] },
    "terminate-end": { glyph: "terminate-end", tokens: [t("strokeWidth", 3)] },
    service: { glyph: "service-task", tokens: [] },
    call: { glyph: "call", tokens: [t("strokeWidth", 2)] },
    decision: { glyph: "gateway", tokens: [t("fontWeight", "bold"), t("textColor", "#000000")] },
    choice: { glyph: "flow-line", tokens: [t("arrow", "filled"), t("fontWeight", "bold"), t("textColor", "#1f4fbf")] },
    flow: { glyph: "flow-line", tokens: [t("arrow", "filled")] },
    pool: { glyph: "pool", tokens: [] },
    band: { glyph: "band", tokens: [t("fill", "#f4f4f4")] },
    "lane-external": { glyph: "lane", tokens: [t("fill", "#fafafa")] },
    "lane-work": { glyph: "lane", tokens: [] },
    "process-input": { glyph: "data-input", tokens: [] },
    "process-output": { glyph: "data-output", tokens: [] },
    reference: { glyph: "store", tokens: [t("fill", "#f0f0ff")] },
    relation: { glyph: "association-line", tokens: [t("arrow", "open"), t("dash", "dashed")] },
    "data-link": { glyph: "data-line", tokens: [t("arrow", "open"), t("dash", "dashed")] },
    "rework-stroke": { glyph: "task", tokens: [t("stroke", "#aa0000")] },
    "rework-weight": { glyph: "task", tokens: [t("fontWeight", "bold")] },
  },
  lowered: {
    choice: { glyph: "flow-line", tokens: [t("arrow", "filled"), t("fontWeight", "bold"), t("textColor", "#1f4fbf")] },
  },
};

// Theme id or a declared theme alias (harmonization K11); the binding records the theme id.
export function resolveThemeId(themes, requested) {
  if (themes.some(x => x.id === requested)) return requested;
  const listing = themes.filter(x => x.aliases.includes(requested));
  return listing.length === 1 ? listing[0].id : undefined;
}
export function themeChain(themes, themeId) {
  const chain = [];
  for (let id = themeId; id !== undefined;) {
    const theme = themes.find(x => x.id === id);
    if (!theme || chain.includes(theme)) return undefined;
    chain.push(theme);
    id = theme.fallback;
  }
  return chain; // selected first
}
export const themeDigest = (themes, themeId) => H({ themeId, themes: [...themeChain(themes, themeId)].reverse() });
// metricsDigest (DESIGN 9.2 L687): unique metric resources of the chain, sorted by id.
export function metricPinsOf(chain, metricBytes) {
  const ids = [...new Set(chain.map(x => x.metricsResource))].sort(compareText);
  return ids.map(id => ({ id, sha256: B(metricBytes.get(id)) }));
}

function themePaint(chain) {
  const out = new Map();
  for (const theme of [...chain].reverse()) for (const tk of theme.tokens) if (PAINT.has(tk.name)) out.set(tk.name, tk.value);
  return out;
}
function bindingFor(chain, notion, bindings) {
  for (const theme of chain) if (bindings[theme.id]?.[notion]) return bindings[theme.id][notion];
  return undefined;
}
// DP-STYLE: occurrence > semantic > native DI > bioc DI > notion/facet > selected theme > fallback chain.
export function resolveStyle({ chain, notionTokens, overrides, diStyles, occurrence, synthetic = false }) {
  const style = themePaint(chain);
  const layer = list => { for (const tk of list ?? []) style.set(tk.name, tk.value); };
  layer(notionTokens);
  const pick = (bag, key) => bag.find(r => r.pageId === key.pageId && r.occurrenceKey === key.occurrenceKey)?.tokens;
  if (!synthetic) {
    layer(pick(diStyles.bioc, occurrence));
    layer(pick(diStyles.native, occurrence));
    if (occurrence.semanticId !== undefined) layer(overrides.semantic.find(r => r.semanticId === occurrence.semanticId)?.tokens);
  }
  layer(pick(overrides.occurrence, occurrence));
  return byName([...style].map(([name, value]) => ({ name, value })));
}

// DP-COVERAGE (harmonization G3): native pre-order, containment properties in UTF-16 name order.
export function preorder(tree) {
  const out = [];
  const visit = (node, pointer) => {
    if (typeof node.id === "string") out.push({ id: node.id, pointer, type: node.$type });
    for (const key of Object.keys(node).sort(compareText)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c, i) => { if (c && typeof c === "object" && typeof c.$type === "string") visit(c, `${pointer}/${key}/${i}`); });
      else if (v && typeof v === "object" && typeof v.$type === "string") visit(v, `${pointer}/${key}`);
    }
  };
  visit(tree, "");
  return out;
}

export function normalizeBags(overrides, diStyles) {
  const occ = (a, b) => compareText(a.pageId, b.pageId) || compareText(a.occurrenceKey, b.occurrenceKey);
  const tk = r => ({ ...r, tokens: byName(r.tokens) });
  return {
    overrides: { semantic: overrides.semantic.map(tk).sort((a, b) => compareText(a.semanticId, b.semanticId)), occurrence: overrides.occurrence.map(tk).sort(occ) },
    diStyles: { native: diStyles.native.map(tk).sort(occ), bioc: diStyles.bioc.map(tk).sort(occ) },
  };
}
export const viewTuple = binding => ({ semanticRevision: binding.semanticRevision, layoutDigest: binding.layoutDigest, themeId: binding.themeId,
  themeDigest: binding.themeDigest, overridesDigest: binding.overridesDigest, diStylesDigest: binding.diStylesDigest, metricsDigest: binding.metricsDigest });
export const descriptorDigestOf = pins => H([...pins].sort((a, b) => compareText(a.id, b.id)));

// Assemble RenderData/1. labelOf(semanticId) is the literal evaluated label
// (string, or undefined for no label) for the selected theme; synthetic
// labels are the literal declaration labels ("" means none).
export function assembleRender({ profile, envelope, layout, themeId: requested, overrides, diStyles, metricBytes, labelOf, bindings = LOT4_BINDINGS, notionOf = NOTION_OF, facetsOf = FACETS_OF }) {
  const themeId = resolveThemeId(profile.themes, requested);
  if (themeId === undefined) return { refused: "render-stale", why: "theme" };
  const chain = themeChain(profile.themes, themeId);
  if (chain[0].geometry === "theme") return { refused: "profile-open", why: "geometry theme" };
  const { overrides: ov, diStyles: ds } = normalizeBags(overrides, diStyles);
  const glyphIds = new Set(chain.flatMap(th => th.glyphs.map(g => g.id)));
  const occurrences = [], unsupported = new Map(), diagnostics = [];
  const nodes = new Map(preorder(envelope.tree).map(n => [n.id, n]));
  for (const g of layout.geometry) {
    if (g.semanticId === undefined) {
      // A synthetic record must be a declaration of the selected theme (key and role).
      let parts;
      try { parts = JSON.parse(g.occurrenceKey); } catch { return { refused: "render-stale", why: "synthetic key" }; }
      const d = chain[0].syntheticOccurrences.find(x => Array.isArray(parts) && x.id === parts[0]);
      if (!d || d.role !== g.role || parts[2] !== g.pageId || jcs(parts) !== g.occurrenceKey) return { refused: "render-stale", why: `synthetic ${g.occurrenceKey}` };
      const expected = d.label.value === "" ? undefined : d.label.value;
      if ((expected === undefined) !== (g.label === undefined) || (g.label && g.label.text !== expected)) return { refused: "render-stale", why: "synthetic label" };
      const style = resolveStyle({ chain, notionTokens: d.tokens, overrides: ov, diStyles: ds, occurrence: g, synthetic: true });
      occurrences.push({ ...clone(g), emittedType: "node", style, glyphId: d.glyph });
      continue;
    }
    const notion = notionOf[g.semanticId];
    const bind = notion && bindingFor(chain, notion, bindings);
    if (!bind) { unsupported.set(g.semanticId, g); continue; }
    if (!glyphIds.has(bind.glyph)) throw new Error(`assemble: glyph ${bind.glyph} missing in chain`);
    const expected = labelOf(g.semanticId);
    if ((expected === undefined) !== (g.label === undefined) || (g.label && g.label.text !== expected)) return { refused: "render-stale", why: `label ${g.occurrenceKey}` };
    const facetTokens = (facetsOf[g.semanticId] ?? []).flatMap(f => bindingFor(chain, f, bindings)?.tokens ?? []);
    const seen = new Map();
    for (const tk of [...bind.tokens, ...facetTokens]) {
      if (seen.has(tk.name) && jcs(seen.get(tk.name)) !== jcs(tk.value)) return { refused: "render-style-conflict" };
      seen.set(tk.name, tk.value);
    }
    const style = resolveStyle({ chain, notionTokens: [...seen].map(([name, value]) => ({ name, value })), overrides: ov, diStyles: ds, occurrence: g });
    const edge = g.sourceOccurrence !== undefined;
    const { sourceOccurrence, targetOccurrence, waypoints, ...rest } = g;
    occurrences.push({ ...clone(rest), emittedType: edge ? "edge" : "node", style, glyphId: bind.glyph, ...(edge ? { sourceOccurrence, targetOccurrence, waypoints } : {}) });
  }
  const order = new Map(layout.pages.map(p => [p.pageId, p.order]));
  occurrences.sort((a, b) => order.get(a.pageId) - order.get(b.pageId) || compareText(a.occurrenceKey, b.occurrenceKey));
  const coverage = preorder(envelope.tree).map(n => {
    const occ = occurrences.filter(o => o.semanticId === n.id).map(o => ({ pageId: o.pageId, occurrenceKey: o.occurrenceKey }));
    return { semanticId: n.id, occurrences: occ, disposition: occ.length ? "rendered" : unsupported.has(n.id) ? "unsupported" : "nonvisual" };
  });
  for (const [id, g] of unsupported) diagnostics.push({
    code: "render-unsupported", severity: "error", classification: "integrity", stage: "render", ruleId: "adapter", messageKey: "render-unsupported", disposition: "observed",
    source: { domain: "tree", pointer: nodes.get(id).pointer, targetId: id, provenance: "exact" },
    result: { domain: "none", pointer: null, targetId: null, provenance: "unavailable" },
    beforePresent: false, afterPresent: false, pageId: g.pageId, occurrenceKey: g.occurrenceKey,
  });
  const binding = {
    semanticRevision: envelope.semanticRevision, profileDigest: H(profile), descriptorDigest: descriptorDigestOf(envelope.profileIdentity.descriptors), layoutDigest: H(layout), themeId,
    themeDigest: themeDigest(profile.themes, themeId), overridesDigest: H(ov), diStylesDigest: H(ds), metricsDigest: H(metricPinsOf(chain, metricBytes)),
  };
  const payload = { pages: layout.pages, occurrences, coverage, diagnostics };
  binding.payloadDigest = H(payload);
  return { render: { renderVersion: "1", binding, ...payload }, viewRevision: H(viewTuple(binding)), normalized: { overrides: ov, diStyles: ds }, themeId };
}

// renderDigests seam (A4; py render_digests record shape): DESIGN 9.2 table on explicit records.
export function renderDigests(record) {
  const { semanticTree, profileIdentity, bindings, descriptorPins, layout, themeId, themes, overrides, diStyles, metrics, payload } = record;
  const sortedBindings = [...bindings].sort((a, b) => compareText(a.ownerId, b.ownerId) || compareText(a.role, b.role) || compareText(a.targetId, b.targetId));
  const { overrides: ov, diStyles: ds } = normalizeBags(overrides, diStyles);
  const out = {
    semanticRevision: H({ tree: semanticTree, profileIdentity, bindings: sortedBindings }),
    descriptorDigest: descriptorDigestOf(descriptorPins),
    layoutDigest: H(layout),
    themeDigest: themeDigest(themes, themeId),
    overridesDigest: H(ov),
    diStylesDigest: H(ds),
    metricsDigest: H([...metrics].sort((a, b) => compareText(a.id, b.id)).map(m => ({ id: m.id, sha256: B(Buffer.from(m.utf8, "utf8")) }))),
  };
  out.viewRevision = H({ semanticRevision: out.semanticRevision, layoutDigest: out.layoutDigest, themeId, themeDigest: out.themeDigest,
    overridesDigest: out.overridesDigest, diStylesDigest: out.diStylesDigest, metricsDigest: out.metricsDigest });
  if (payload !== undefined) out.payloadDigest = H(payload);
  return out;
}
