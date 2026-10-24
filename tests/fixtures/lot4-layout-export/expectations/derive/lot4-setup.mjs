// Shared lot-4 packages, envelopes, layouts and expected render data.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { H, B, clone, compareText } from "./lot4-core.mjs";
import { VENDOR } from "./lot4-context.mjs";
import { validate } from "./lot4-schema-check.mjs";
import * as W from "./lot4-world.mjs";
import * as F from "./lot4-fixtures.mjs";
import { assembleRender, preorder, resolveThemeId, themeChain } from "./lot4-render.mjs";
import { resultOk, resultRefused } from "./lot4-results.mjs";

const vjson = name => JSON.parse(readFileSync(join(VENDOR, name), "utf8"));
export const identityOf = profile => ({ mechanismVersion: profile.mechanismVersion, schemaVersion: profile.schemaVersion, profile: profile.profile,
  version: profile.version, sha256: H(profile), base: profile.base, descriptors: profile.descriptors });
export const envelopeOf = (profile, tree, bindings) => {
  const profileIdentity = identityOf(profile);
  return { documentVersion: "1", profileIdentity, tree, bindings, semanticRevision: H({ tree, profileIdentity, bindings }) };
};

export function setup(ctx) {
  const schema = vjson("profile-mechanism-1.schema.json");
  const checker = validate(schema);
  const assertSchema = (label, profile) => { const r = checker.check(profile); if (!r.ok) throw new Error(`${label} schema: ${r.errors.slice(0, 5).join("; ")}`); };

  // Synthetic packages, raw-pinned like the vendored neutral base/descriptors.
  const descriptorsRef = ctx.artifact("neutral-lot4-descriptors.json", W.descriptorsDoc);
  const base = W.buildBase();
  const descriptorPin = { id: W.descriptorsDoc.id, version: base.version, sha256: descriptorsRef.sha256 };
  const baseRef = ctx.artifact("neutral-lot4-base.json", base);
  const basePin = { id: base.id, version: base.version, sha256: baseRef.sha256 };
  const neutral = vjson("neutral-profile.json"), grid = vjson("neutral-grid-profile.json");
  const metricsBytes = readFileSync(join(VENDOR, "neutral-metrics.json"));
  if (B(metricsBytes) !== neutral.resources[0].sha256) throw new Error("metrics pin drift");
  // A second metric resource whose bytes differ from the neutral metrics by
  // exactly one byte ("spaceAdvance": 300 -> 301).
  const text = metricsBytes.toString("utf8"), at = text.indexOf("\"spaceAdvance\": 300") + "\"spaceAdvance\": 30".length;
  const zBytes = Buffer.from(metricsBytes); zBytes[at] = "1".charCodeAt(0);
  if ([...metricsBytes].filter((v, i) => v !== zBytes[i]).length !== 1 || zBytes.length !== metricsBytes.length) throw new Error("one-byte metric variant");
  const zRef = ctx.rawArtifact("z-metrics.json", zBytes);
  const zResource = { ...neutral.resources[0], id: "z-metrics", sha256: B(zBytes), assetKey: "z-metrics.json", attribution: "Synthetic one-byte variant of the neutral metric fixture (lot-4 seal)." };
  const metricBytes = new Map([["neutral-metrics", metricsBytes], ["z-metrics", zBytes]]);

  const profile = W.buildProfile(neutral, basePin, descriptorPin, zResource);
  assertSchema("lot4", profile);
  const profileRef = ctx.artifact("neutral-lot4-profile.json", profile);

  // Materialized variants: each a distinct patch version with its own identity.
  const variants = {};
  const variant = (name, version, mutate) => {
    const p = clone(profile); p.version = version; mutate(p); assertSchema(name, p);
    variants[name] = { profile: p, ref: ctx.artifact(`neutral-lot4-${name}.profile.json`, p) };
    return variants[name];
  };
  // Two facets with different recognition predicates that both match Task_Fix only:
  // the conflict is observable at render time, not decidable from the profile text.
  const fixFacet = (id, fill, test) => ({ id, labels: [{ name: "en", value: id }], citations: [], nativeTypes: ["bpmn:Task"], facet: true,
    recognition: { op: "all", args: [{ op: "typeIs", binding: "self", type: "bpmn:Task", mode: "exact" }, test] },
    ai: profile.notions[2].ai, referenceRecipes: [], fields: [], renderBindings: [{ theme: "plain", glyph: "task", tokens: [{ name: "fill", value: fill }], label: { op: "read", binding: "self", path: "/name" } }] });
  const readName = { op: "read", binding: "self", path: "/name" };
  variant("conflict", "1.1.1", p => { p.notions.push(
    fixFacet("rework-fill-a", "#111111", { op: "equal", left: readName, right: { op: "literal", value: "Fix order" } }),
    fixFacet("rework-fill-b", "#222222", { op: "textPrefix", value: readName, prefix: "Fix", trim: "none" })); });
  variant("labels-native", "1.1.2", p => { p.exports[1].recipes = [...p.exports[1].recipes, "export-edge-labels"]; });
  variant("byte-claim", "1.1.3", p => { p.exports[0].capabilities = [{ when: { op: "true" }, class: "engine-byte-compatible", losses: [] }]; });
  variant("unsupported", "1.1.4", p => { p.exports[0].capabilities = [...p.exports[0].capabilities, { when: W.semanticIs({ op: "recognizes", binding: "self", notion: "aid" }), class: "unsupported", losses: ["unsupported-feature"] }]; });
  const occSel = where => ({ from: "render", via: "occurrences", where, order: "page-occurrence" });
  const readEq = (path, value) => ({ op: "equal", left: { op: "read", binding: "self", path }, right: { op: "literal", value } });
  const childRecipe = (id, parentDomain) => ({
    id, phase: "export", parameters: [], select: occSel(readEq("/occurrenceKey", "Task_Check_di")), when: { op: "true" }, writes: [{ binding: "self", path: "", mode: "artifact" }],
    steps: [
      { op: "bind", as: "container", select: occSel({ op: "all", args: [readEq("/occurrenceKey", parentDomain === "edge" ? "Flow_Check_di" : "Pool_Main_di"), { op: "equal", left: { op: "read", binding: "self", path: "/pageId" }, right: { op: "read", binding: "current", path: "/pageId" } }] }), cardinality: "one" },
      { op: "emit", as: "inner", kind: "label", parent: { op: "outputId", binding: "container", domain: parentDomain }, fields: [
        { name: "id", value: { op: "outputId", binding: "self", domain: "label" } }, { name: "text", value: { op: "literal", value: "inner" } }] },
    ],
  });
  const withCurrent = r => ({ ...r, steps: [{ op: "bind", as: "current", select: { from: "self", via: "self", where: { op: "true" }, order: "page-occurrence" }, cardinality: "one" }, ...r.steps] });
  variant("parent-order", "1.1.5", p => { p.recipes.push(withCurrent(childRecipe("export-inner-early", "node"))); p.exports[0].recipes = ["export-pages", "export-inner-early", "export-nodes", "export-edges"]; });
  variant("dup-emit", "1.1.6", p => {
    p.recipes.push({ ...clone(p.recipes.find(r => r.id === "export-nodes")), id: "export-nodes-again" });
    p.exports[0].recipes = ["export-pages", "export-nodes", "export-nodes-again"];
  });
  variant("missing-field", "1.1.7", p => {
    p.recipes.push({ id: "export-loose-edges", phase: "export", parameters: [], select: occSel({ op: "true" }), when: { op: "true" }, writes: [{ binding: "self", path: "", mode: "artifact" }],
      steps: [
        { op: "bind", as: "fromNode", select: { from: "self", via: "reference", property: "sourceOccurrence", where: { op: "true" }, order: "page-occurrence" }, cardinality: "zeroOrOne" },
        { op: "emit", as: "edge", kind: "edge", fields: [
          { name: "id", value: { op: "outputId", binding: "self", domain: "edge" } },
          { name: "source", value: { op: "outputId", binding: "fromNode", domain: "node" } },
          { name: "target", value: { op: "outputId", binding: "self", domain: "node" } }] }] });
    p.exports[0].recipes = ["export-pages", "export-nodes", "export-loose-edges"];
  });

  // Explicitly bound neutral successors (lot-4 package, declared region lane role).
  const successors = {};
  for (const [name, lot0, version, region] of [["neutral", neutral, "1.2.0", "content"], ["grid", grid, "2.1.0", "side"]]) {
    const p = W.buildSuccessor(lot0, { version, region, basePin, descriptorPin });
    assertSchema(`${name}-successor`, p);
    successors[name] = { profile: p, ref: ctx.artifact(`${name}-successor.profile.json`, p), region };
  }

  // Envelopes.
  const env = (name, p, tree, bindings) => { const e = envelopeOf(p, tree, bindings); return { value: e, ref: ctx.artifact(`${name}.envelope.json`, e) }; };
  const nfix = vjson("neutral-fixture.json"), gfix = vjson("neutral-grid-fixture.json");
  const envs = {
    main: env("main", profile, F.mainTree(), F.mainBindings()),
    note: env("main-note", profile, F.mainTree({ withNote: true }), F.mainBindings()),
    nolane: env("main-nolane", profile, F.mainTree(), F.mainBindings({ withoutLane: true })),
    unnamed: env("main-unnamed", profile, F.mainTree({ unnamedFix: true }), F.mainBindings()),
    multi: env("multi", profile, F.multiTree(), F.multiBindings()),
    empty: env("empty", profile, F.emptyTree(), F.emptyBindings()),
    choices: env("choices", profile, F.choicesTree(), F.choicesBindings()),
    variety: env("variety", profile, F.varietyTree(), F.varietyBindings()),
    neutralSuccessor: env("neutral-successor", successors.neutral.profile, F.successorTree(nfix.expected.completed, "content"), F.successorBindings("content")),
    gridSuccessor: env("grid-successor", successors.grid.profile, F.successorTree(gfix.expected.completed, "side"), F.successorBindings("side")),
  };
  for (const name of ["conflict", "labels-native", "unsupported", "parent-order", "dup-emit", "missing-field"]) envs[`main@${name}`] = env(`main@${name}`, variants[name].profile, F.mainTree(), F.mainBindings());
  envs["empty@byte-claim"] = env("empty@byte-claim", variants["byte-claim"].profile, F.emptyTree(), F.emptyBindings());
  // Lot-0 neutral fixtures (completed trees, no supports) under their own profiles.
  const lot0 = {
    neutral: { profile: neutral, ref: ctx.vendored("neutral-profile.json"), fixture: nfix },
    grid: { profile: grid, ref: ctx.vendored("neutral-grid-profile.json"), fixture: gfix },
  };
  envs.neutral = env("neutral-fixture", neutral, nfix.expected.completed, []);
  envs.grid = env("grid-fixture", grid, gfix.expected.completed, []);

  // Placements (normalization output, supplied).
  const placement = (name, value) => ({ value, ref: ctx.artifact(`${name}.placements.json`, value) });
  const placements = {
    main: placement("main", F.mainPlacements()),
    mainAid: placement("main-aid", F.mainPlacements({ aid: "anchored" })),
    mainAidNoAnchor: placement("main-aid-noanchor", F.mainPlacements({ aid: "unanchored" })),
    multi: placement("multi", F.multiPlacements()),
    none: placement("empty", []),
    neutral: placement("neutral-fixture", nfix.expected.placements),
    grid: placement("grid-fixture", gfix.expected.placements),
  };

  // ---------------------------------------------------------- layout seam
  // Literal reading of a synthetic declaration selector {from: root, via: all,
  // where: typeIs T exact, order: id} on the immutable tree.
  const ownersOf = tree => d => {
    const where = d.select.where;
    if (d.select.from !== "root" || d.select.via !== "all" || where.op !== "typeIs" || where.mode !== "exact") throw new Error(`owner selector ${d.id}`);
    return preorder(tree).filter(n => n.type === where.type).map(n => n.id).sort(compareText);
  };
  const layoutContext = (p, themeId, tree) => {
    const chain = themeChain(p.themes, themeId);
    const token = name => { for (const th of chain) { const tk = th.tokens.find(x => x.name === name); if (tk) return tk.value; } return undefined; };
    return {
      tokensFor: key => {
        const v = Object.fromEntries(["headerWidth", "padding", "gap", "minHeight"].map(n => [n, token(`region.${key}.${n}`)]));
        return Object.values(v).some(x => x === undefined) ? undefined : v;
      },
      declarations: chain[0].syntheticOccurrences,
      glyphOf: id => chain.flatMap(th => th.glyphs).find(g => g.id === id),
      ownersOf: ownersOf(tree),
      labelOf: d => d.label.value,
    };
  };
  const layouts = {}, traces = {};
  // Layout primitive (Result/1 "layout"): base geometry + placements + theme -> Layout/1.
  function layoutDoc(name, { p = profile, envelope, pages, place, themeId = "plain" }) {
    const identity = { profileIdentity: envelope.profileIdentity, baseRevision: envelope.semanticRevision };
    const baseGeometry = F.baseLayoutOf(pages);
    const baseRef = ctx.artifact(`${name}.base-geometry.json`, baseGeometry);
    const resolved = resolveThemeId(p.themes, themeId);
    let out;
    if (resolved === undefined) out = { refused: "render-stale" };
    else if (themeChain(p.themes, resolved)[0].geometry === "theme") out = { refused: "profile-open" };
    else { traces[name] = []; out = F.finalLayoutOf(pages, place, envelope.bindings, layoutContext(p, resolved, envelope.tree), traces[name]); }
    const doc = { name, base: baseGeometry, baseRef, pages };
    if (out.refused) { doc.refused = out.refused; doc.result = resultRefused("layout", out.refused, identity); }
    else {
      doc.final = out.layout; doc.relocatedLinks = out.relocatedLinks;
      doc.ref = ctx.artifact(`${name}.layout.json`, out.layout);
      doc.result = resultOk("layout", { ...identity, payload: out.layout });
    }
    layouts[name] = doc;
    return doc;
  }
  layoutDoc("main", { envelope: envs.main.value, pages: [F.mainPage()], place: placements.main.value });
  layoutDoc("repeated", { envelope: envs.main.value, pages: [F.mainPage({ pageId: "View_Z", name: "Overview" }), F.detailPage()], place: placements.main.value });
  layoutDoc("multi", { envelope: envs.multi.value, pages: F.multiPagesSpec(), place: placements.multi.value });
  layoutDoc("empty", { envelope: envs.empty.value, pages: [F.emptyPageSpec()], place: [] });
  layoutDoc("main-note", { envelope: envs.note.value, pages: [F.mainPage({ withNote: true })], place: placements.main.value });
  layoutDoc("main-nolane", { envelope: envs.nolane.value, pages: [F.mainPage()], place: placements.main.value });
  layoutDoc("main-twice", { envelope: envs.main.value, pages: [F.mainPage({ twice: true })], place: placements.main.value });
  layoutDoc("variety", { envelope: envs.variety.value, pages: [F.varietyPageSpec()], place: [] });
  // Theme-selected synthetic occurrences (DESIGN 9.3 L712-L715).
  layoutDoc("main-striped", { envelope: envs.main.value, pages: [F.mainPage()], place: placements.main.value, themeId: "plain-striped" });
  layoutDoc("repeated-striped", { envelope: envs.main.value, pages: [F.mainPage({ pageId: "View_Z", name: "Overview" }), F.detailPage()], place: placements.main.value, themeId: "plain-striped" });
  layoutDoc("multi-striped", { envelope: envs.multi.value, pages: F.multiPagesSpec(), place: placements.multi.value, themeId: "plain-striped" });
  layoutDoc("empty-striped", { envelope: envs.empty.value, pages: [F.emptyPageSpec()], place: [], themeId: "plain-striped" });
  layoutDoc("main-badged", { envelope: envs.main.value, pages: [F.mainPage()], place: placements.mainAid.value, themeId: "badged" });
  layoutDoc("main-twice-badged", { envelope: envs.main.value, pages: [F.mainPage({ twice: true })], place: placements.mainAid.value, themeId: "badged" });
  layoutDoc("main-badged-noanchor", { envelope: envs.main.value, pages: [F.mainPage()], place: placements.mainAidNoAnchor.value, themeId: "badged" });
  layoutDoc("main-badged-hidden", { envelope: envs.main.value, pages: [F.mainPage()], place: placements.mainAid.value, themeId: "badged-hidden" });
  layoutDoc("main-aid-plain", { envelope: envs.main.value, pages: [F.mainPage()], place: placements.mainAid.value });
  layoutDoc("main-wide-own", { envelope: envs.main.value, pages: [F.mainPage()], place: placements.main.value, themeId: "wide-own" });
  // Neutral successors: complete layout paths; the lot-0 originals refuse (no bound support).
  layoutDoc("neutral-successor", { p: successors.neutral.profile, envelope: envs.neutralSuccessor.value, pages: F.neutralSuccessorPages(), place: placements.neutral.value });
  layoutDoc("grid-successor", { p: successors.grid.profile, envelope: envs.gridSuccessor.value, pages: F.gridSuccessorPages(), place: placements.grid.value });
  // Label-state variants of the resolved main layout (inputs to freshness cases).
  const relabel = (name, labels) => layoutDoc(name, { envelope: envs.main.value, pages: [F.mainPage({ labels })], place: placements.main.value });
  relabel("main-stale-choice", { Flow_Yes: "yes" });
  relabel("main-missing-label", { Task_Check: null });
  relabel("main-extra-label", { Assoc_Aid: "x" });
  layoutDoc("main-renamed", { envelope: envs.main.value, pages: [F.mainPage({ name: "  Main sheet & <draft> \"2\" 'x'\t " })], place: placements.main.value });
  const expectRefused = new Set(["main-nolane", "empty-striped", "main-twice-badged", "main-badged-noanchor", "main-badged-hidden", "main-aid-plain", "main-wide-own"]);
  for (const name of Object.keys(layouts)) if (Boolean(layouts[name].refused) !== expectRefused.has(name)) throw new Error(`layout ${name}: unexpected ${layouts[name].refused ?? "ok"}`);
  const moved = clone(layouts.main.final);
  moved.geometry.find(g => g.occurrenceKey === "Gateway_Ok_di").label.bounds = { x: 320000, y: 335000, width: 70000, height: 14000 };
  layouts["main-label-moved"] = { final: moved, ref: ctx.artifact("main-label-moved.layout.json", moved) };
  const choicesDoc = (name, labels) => {
    const pages = [F.choicesPageSpec(labels)];
    layouts[name] = { final: F.baseLayoutOf(pages), pages };
    layouts[name].ref = ctx.artifact(`${name}.layout.json`, layouts[name].final);
  };
  choicesDoc("choices-upper", F.CHOICE_UPPER);
  choicesDoc("choices-lower", F.CHOICE_LOWER);
  choicesDoc("choices-host-case", { ...F.CHOICE_UPPER, Flow_C5: "Ɤ-SHAPE" });
  choicesDoc("choices-locale-case", { ...F.CHOICE_UPPER, Flow_C1: "İSTANBUL" });
  // Lot-0 neutral fixture views under the unchanged lot-0 profiles: two pages,
  // repeated Task_B, no regions involved (supplied layouts, not region results).
  const b = (x, y, width, height) => ({ x, y, width, height });
  const nlayout = {
    layoutVersion: "1",
    pages: [
      { pageId: "Z-page", name: "First sheet", order: 0, semanticRootId: "Process_1", bounds: b(0, 0, 1000000, 800000) },
      { pageId: "A-page", name: "Second sheet", order: 1, semanticRootId: "Process_1", bounds: b(0, 0, 1000000, 800000) },
    ],
    geometry: [
      { pageId: "Z-page", occurrenceKey: "a-first", semanticId: "Task_A", role: "content", bounds: b(100000, 100000, 100000, 80000) },
      { pageId: "Z-page", occurrenceKey: "a-note", semanticId: F.AID_ID, role: "content", bounds: b(100000, 300000, 100000, 40000),
        label: { text: "helper", bounds: b(100000, 300000, 100000, 40000), lines: ["helper"] } },
      { pageId: "Z-page", occurrenceKey: "z-last", semanticId: "Task_B", role: "content", bounds: b(300000, 100000, 100000, 80000),
        label: { text: "Ready", bounds: b(300000, 100000, 100000, 80000), lines: ["Ready"] } },
      { pageId: "A-page", occurrenceKey: "a-last-page", semanticId: "Task_B", role: "content", bounds: b(100000, 100000, 100000, 80000),
        label: { text: "Ready", bounds: b(100000, 100000, 100000, 80000), lines: ["Ready"] } },
    ],
  };
  layouts.neutral = { final: nlayout, base: nlayout, ref: ctx.artifact("neutral-fixture.layout.json", nlayout) };
  layouts.neutral.baseRef = layouts.neutral.ref;
  const glayout = clone(nlayout);
  glayout.geometry = glayout.geometry.filter(g => g.semanticId !== F.AID_ID);
  layouts.grid = { final: glayout, base: glayout, ref: ctx.artifact("grid-fixture.layout.json", glayout) };
  layouts.grid.baseRef = layouts.grid.ref;
  for (const [name, pl, p, why] of [["neutral-fixture", placements.neutral.value, neutral, "no binding Process_1/content"], ["grid-fixture", placements.grid.value, grid, "no binding Process_1/side"],
    ["grid-fixture-noplace", [], grid, "stripe region Process_1/side"]]) {
    const envelope = name === "neutral-fixture" ? envs.neutral.value : envs.grid.value;
    const view = name === "neutral-fixture" ? nlayout : glayout;
    const out = F.finalLayoutOf(view.pages.map(pg => ({ ...pg, base: view.geometry.filter(g => g.pageId === pg.pageId), links: [] })), pl, [], layoutContext(p, "plain", envelope.tree));
    if (out.refused !== "render-region-missing" || !out.why.startsWith(why)) throw new Error(`${name}: lot-0 original must refuse (${out.why})`);
    layouts[name] = { refused: out.refused, result: resultRefused("layout", out.refused, { profileIdentity: envelope.profileIdentity, baseRevision: envelope.semanticRevision }), baseRef: layouts[name === "neutral-fixture" ? "neutral" : "grid"].baseRef };
  }

  // Literal evaluated labels per theme (DESIGN 9.3 L698/L702; DP-LABEL).
  const MAIN_LABELS = {
    Pool_Main: "Main process", Lane_External: "External", Lane_Work: "Work", Band_Main: "References", Start_Main: "Order received",
    Task_Check: "Check order", Gateway_Ok: "Approved?", Task_Ship: "Ship order", Task_Fix: "Fix order", End_Done: "Order shipped",
    Aid_Scanner: "Scanner", Flow_Yes: "YES", Flow_No: "NO", Input_Order: "Order", Output_Receipt: "Receipt", StoreRef_Policy: "Policy archive",
    Pool_A: "Process A", Band_A: "References A", Task_A1: "Prepare", StoreRef_A: "Shared register",
    Pool_B: "Process B", Band_B: "References B", Task_B1: "Review", StoreRef_B: "Register copy",
    Pool_Empty: "Empty process", Note_Plain: undefined,
    Pool_Choices: "Routing", Start_Choices: "Request", Gateway_Route: "Which route?",
    Task_East: "East", Task_West: "West", Task_North: "North", Task_South: "South", Task_Up: "Up", Task_Down: "Down", Task_Other: "Other",
    Pool_Variety: "Variety process", Start_V: "Request", Service_V: "Run check", Call_V: "Call review", End_V: "Stopped",
  };
  const labels = {
    plain: id => (Object.hasOwn(F.CHOICE_UPPER, id) ? F.CHOICE_UPPER[id] : MAIN_LABELS[id]),
    lowered: id => (Object.hasOwn(F.CHOICE_LOWER, id) ? F.CHOICE_LOWER[id] : MAIN_LABELS[id]),
    neutral: id => ({ Task_B: "Ready", [F.AID_ID]: "helper" })[id],
    neutralSuccessor: id => ({ Task_B: "Ready", [F.AID_ID]: "helper", Lane_content: "content" })[id],
    gridSuccessor: id => ({ Task_B: "Ready", [F.AID_ID]: "HELPER", Lane_side: "side" })[id],
  };
  const lot0Bindings = { plain: { task: { glyph: "task", tokens: [{ name: "fill", value: "#ffffff" }] }, aid: { glyph: "aid", tokens: [{ name: "fill", value: "#eeeeff" }] } } };
  const successorBindings = { plain: { ...lot0Bindings.plain, lane: { glyph: "lane", tokens: [] } } };
  const NOTIONS = {
    neutral: { Task_A: "task", Task_B: "task", [F.AID_ID]: "aid" },
    neutralSuccessor: { Task_A: "task", Task_B: "task", [F.AID_ID]: "aid", Lane_content: "lane" },
    gridSuccessor: { Task_A: "task", Task_B: "task", [F.AID_ID]: "aid", Lane_side: "lane" },
  };
  const EMPTY_BAGS = { overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] } };
  // resolveTheme (Result/1): payload RenderData/1; report entries = R diagnostics.
  function render(name, { p = profile, envelope, layout, themeId = "plain", overrides = EMPTY_BAGS.overrides, diStyles = EMPTY_BAGS.diStyles, labelOf = labels.plain, extra = {} }) {
    const identity = { profileIdentity: envelope.profileIdentity, baseRevision: envelope.semanticRevision };
    const out = assembleRender({ profile: p, envelope, layout, themeId, overrides, diStyles, metricBytes, labelOf, ...extra });
    if (out.refused) return { ...out, result: resultRefused("resolveTheme", out.refused, identity) };
    const result = resultOk("resolveTheme", { ...identity, payload: out.render });
    result.report.entries = out.render.diagnostics;
    const ref = name ? ctx.artifact(`${name}.render.json`, out.render) : undefined;
    const resultRef = name ? ctx.artifact(`${name}.resolve-result.json`, result) : undefined;
    return { ...out, result, ref, resultRef };
  }
  // Package inputs needed to load/compile each profile artifact (CompilerInputs).
  const lot4Package = { base: baseRef, descriptors: descriptorsRef, registry: ctx.vendored("neutral-registry.json"), schema: ctx.vendored("profile-mechanism-1.schema.json"), assets: [ctx.vendored("neutral-metrics.json"), zRef] };
  const successorPackage = { ...lot4Package, assets: [ctx.vendored("neutral-metrics.json")] };
  const lot0Package = { base: ctx.vendored("neutral-base.json"), descriptors: ctx.vendored("neutral-descriptors.json"), registry: ctx.vendored("neutral-registry.json"), schema: ctx.vendored("profile-mechanism-1.schema.json"), assets: [ctx.vendored("neutral-metrics.json")] };
  const packages = [
    { profile: profileRef, ...lot4Package },
    ...Object.values(variants).map(v => ({ profile: v.ref, ...lot4Package })),
    ...Object.values(successors).map(s => ({ profile: s.ref, ...successorPackage })),
    { profile: lot0.neutral.ref, ...lot0Package }, { profile: lot0.grid.ref, ...lot0Package },
  ];
  return {
    packages, lot4Package, successorPackage,
    profile, profileRef, variants, successors, envs, lot0, placements, layouts, traces, labels, render, metricBytes, metricsBytes, zBytes, basePin, descriptorPin, EMPTY_BAGS,
    lot0Bindings, successorBindings, NOTIONS, schemaCheck: assertSchema, preorder, compareText, layoutDoc, ownersOf,
  };
}
