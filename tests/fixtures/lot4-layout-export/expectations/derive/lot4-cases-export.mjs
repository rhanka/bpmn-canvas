// Cases: mapExport IR/IDs/losses (10.2), serializer results, BPMN column,
// legacy diagnostic adapter and prepareExport refusals.
import { H, clone, compareText, digestOutputId } from "./lot4-core.mjs";
import { assembleExport, planCounter, staleChecks } from "./lot4-export.mjs";
import { NOTION_OF } from "./lot4-render.mjs";
import { pureOk, pureRefused, resultRefused, resultOk, reportOf, lintEntry, sortEntries } from "./lot4-results.mjs";

const C = (section, a, z = a) => ({ section, lines: [a, z] });
const EXPORT_COMPARATORS = ["result-exact/1", "profile-report/2", "source-immutability/1"];

export function exportCases(ctx, w, R) {
  const { addCase, inline, ref } = ctx;
  const P = {};
  const identity = env => ({ profileIdentity: env.value.profileIdentity, baseRevision: env.value.semanticRevision });
  function mapCase({ caseId, group = "export", p = w.profile, pref = w.profileRef, env, layout, render, format, family = "lot4", capabilityFamily = "lot4", notionOf = NOTION_OF, capabilityOverride, expect = "ok", clause, derivation, wrong, decisions }) {
    const inputs = [ref("envelope", env.ref), ref("layout", layout.ref), ref("render", render.ref), inline("format", format)];
    const spec = p.exports.find(e => e.format === format);
    if (expect !== "ok") {
      if (spec) {
        const fresh = staleChecks({ profile: p, envelope: env.value, layout: layout.final, render: render.render, metricBytes: w.metricBytes });
        if (expect === "render-stale" ? !fresh.length : fresh.length) throw new Error(`${caseId}: freshness ${fresh.join(",")}`);
        if (expect === "export-id-ambiguous") {
          const out = assembleExport({ spec, render: render.render, envelope: env.value, viewRevision: render.viewRevision, family, capabilityFamily, notionOf });
          if (out.refused !== expect) throw new Error(`${caseId}: derivation ${out.refused ?? "ok"}`);
        }
      }
      addCase({ caseId, group, operation: "mapExport", profile: pref, inputs, expected: [{ role: "result", json: resultRefused("mapExport", expect, identity(env)) }], status: `refused:${expect}`, comparators: EXPORT_COMPARATORS, clause, derivation, wrong });
      return undefined;
    }
    if (staleChecks({ profile: p, envelope: env.value, layout: layout.final, render: render.render, metricBytes: w.metricBytes }).length) throw new Error(`${caseId}: stale inputs`);
    const out = assembleExport({ spec, render: render.render, envelope: env.value, viewRevision: render.viewRevision, family, capabilityFamily, notionOf, capabilityOverride });
    if (out.refused) throw new Error(`${caseId}: derivation refused ${out.refused}`);
    const resultRef = ctx.artifact(`${caseId}.map-result.json`, out.result);
    addCase({ caseId, group, operation: "mapExport", profile: pref, inputs, expected: [ref("result", resultRef)], status: "ok", comparators: EXPORT_COMPARATORS, clause, derivation, wrong, decisions });
    return { result: out.result, resultRef, prepared: out.prepared, spec };
  }
  const L = w.layouts, E = w.envs;
  P.main = mapCase({ caseId: "export-001-main-drawio", env: E.main, layout: L.main, render: R.main, format: "drawio",
    clause: [C("10.2", 770, 776), C("10.2", 801), C("10.1", 751, 753)],
    derivation: "Counter policy, origin 1: requested keys allocate page, node, edge, label domains, then page order and UTF-16 key. IR records carry the emitted fields plus the values copied from R (B21): page bounds; node bounds, style, label {bounds, lines}; edge bounds, waypoints, style, label; label record bounds and lines. Capability predicates add semantic-type for the store reference and both Process IO objects, relation-kind for both data associations, metadata for the band, all with ruleId drawing and unavailable result coordinates (B23); the loss-only aid-marker recipe adds the stripped-marker metadata loss with unavailable result coordinates (no record in its iteration). One artifact record, digest H(ir), every entry index (B22); B4 report header.",
    wrong: "Allocating IDs in emission order or by semantic ID, emitting IR records without the copied geometry/style/label, pointing capability losses at /ir records, one artifact record per page, dropping a loss, or unsorted report entries/idMap." });
  P.mainSparx = mapCase({ caseId: "export-002-main-sparx-native", env: E.main, layout: L.main, render: R.main, format: "sparx",
    clause: [C("2.2", 130), C("10.2", 776), C("10.2", 793)],
    derivation: "Native ID policy uses pageId for the page and the semantic ID for each occurrence, valid because every semantic element is emitted once. The sparx spec lists export-aid-marker: the stripped [Aid] marker reports export-loss/metadata from /rootElements/1/artifacts/1 with unavailable result coordinates (loss-only iteration, B23) and is reachable through entryIndexes (astra L4 #6); capability losses use ruleId ea.",
    wrong: "Prefixing native IDs, omitting the marker loss for the native target, pointing it at the first node record, or emitting edge labels whose native ID would duplicate the edge." });
  P.repeated = mapCase({ caseId: "export-003-repeated-drawio", env: E.main, layout: L.repeated, render: R.repeated, format: "drawio",
    clause: [C("2.2", 130), C("10.2", 801), C("10.1", 753)],
    derivation: "Two pages: page keys first (View_Z e_1, View_A e_2), then View_Z nodes before View_A nodes by page order, edges likewise, then labels. idMap keeps every repeated-view record and sorts by UTF-16 pageId (View_A before View_Z) independently of page order. Losses appear once per occurrence on each page.",
    wrong: "Collapsing repeated views to one idMap record, or sorting idMap by page order." });
  mapCase({ caseId: "export-004-repeated-sparx-ambiguous", env: E.main, layout: L.repeated, render: R.repeated, format: "sparx", expect: "export-id-ambiguous",
    clause: [C("2.2", 130)], derivation: "Task_Check (and the supports) have two occurrences in the artifact; the native policy is valid only for unique IDs. Full refusal record with echoed identity and revision.",
    wrong: "Suffixing IDs or keeping the first occurrence." });
  P.multi = mapCase({ caseId: "export-005-multi-drawio", env: E.multi, layout: L.multi, render: R.multi, format: "drawio",
    clause: [C("10.2", 790, 791), C("10.2", 801)],
    derivation: "Two pages and two bands: each reference occurrence keeps its semantic-type loss and each band its metadata loss; the shared DataStore itself is not emitted.",
    wrong: "Emitting one band for both processes or merging the two references by store." });
  P.empty = mapCase({ caseId: "export-006-empty-drawio", env: E.empty, layout: L.empty, render: R.empty, format: "drawio",
    clause: [C("10.2", 770, 774)], derivation: "A page and one pool node; no edges, no labels, no losses; capability structural; the artifact record still carries digest H(ir) and empty entryIndexes.", wrong: "Emitting nodes for nonvisual coverage records." });
  P.striped = mapCase({ caseId: "export-007-synthetic-drawio", env: E.main, layout: L["main-striped"], render: R.striped, format: "drawio",
    clause: [C("10.2", 770), C("10.1", 753), C("2.2", 130)],
    derivation: "The synthetic stripe is a node occurrence: export-nodes emits it with the counter policy, without a name (its label is absent, an optional field with no value is omitted), with its copied bounds and style, and without an idMap record (no source ID). Its '[...' key sorts after the upper-case keys, so it takes the last node number.",
    wrong: "Emitting name '' for an absent label, adding an idMap record with an invented source ID, or a native-ID fallback for the synthetic key." });
  mapCase({ caseId: "export-008-synthetic-sparx-ambiguous", env: E.main, layout: L["main-striped"], render: R.striped, format: "sparx", expect: "export-id-ambiguous",
    clause: [C("2.2", 130)], derivation: "A synthetic occurrence has no semantic ID, so the native policy cannot name it.", wrong: "Using the synthetic key as a native ID." });
  P.neutral = mapCase({ caseId: "export-009-neutral-fixture", p: w.lot0.neutral.profile, pref: w.lot0.neutral.ref, env: E.neutral, layout: L.neutral, render: R.neutral, format: "drawio",
    family: "neutral", capabilityFamily: "everyOccurrence", notionOf: w.NOTIONS.neutral,
    clause: [C("10.2", 770, 776), C("10.2", 801)],
    derivation: "Unchanged lot-0 neutral profile on its supplied two-page layout, counter origin 0, recipes export-pages and export-nodes: Z-page e_0, A-page e_1, then Z-page keys a-first, a-note, z-last (e_2..e_4) and A-page a-last-page (e_5). Task_A has no label so its node has no name. The single capability record (when true, structural, losses semantic-type) adds one semantic-type loss per occurrence (ruleId drawing, unavailable result).",
    wrong: "Using the lot-0 supplied render records instead of R, or emitting name '' for Task_A." });
  P.choices = mapCase({ caseId: "export-010-decision-labels", env: E.choices, layout: L["choices-upper"], render: R.choices, format: "drawio",
    clause: [C("14.3", 971), C("10.2", 772)],
    derivation: "The gateway node carries the question 'Which route?' as its name; each named choice flow yields one label record with the upper-cased choice text and its copied label bounds and lines; the unnamed flow yields none; no TextAnnotation node is emitted and the tree is unchanged.",
    wrong: "Emitting a separate annotation node for the question, inventing a label for the unnamed branch, or exporting the lower-case source text." });
  for (const [caseId, name, expect, why, wrong, clause] of [
    ["export-011-labels-native-ambiguous", "labels-native", "export-id-ambiguous", "The variant adds export-edge-labels to the native-ID sparx export; each label would reuse its edge's semantic ID.", "Silently suffixing label IDs.", [C("2.2", 130)]],
    ["export-012-parent-order", "parent-order", "export-parent-order", "The variant emits a label whose parent is the pool node before export-nodes emitted it (forward parent).", "Deferring or reordering emission to satisfy the parent.", [C("10.2", 774)]],
    ["export-013-duplicate-key", "dup-emit", "export-parent-invalid", "The variant adds a second recipe with the same body as export-nodes: its emissions repeat the same (pageId, occurrenceKey, node) keys, hence the same artifact IDs (duplicate keys).", "Overwriting the first record or allocating fresh numbers.", [C("10.2", 774)]],
    ["export-014-missing-required", "missing-field", "export-field-invalid", "The variant emits an edge for every occurrence; for a node occurrence the zeroOrOne source binding is MISSING, so the required edge field source has no value.", "Emitting source '' or skipping the record.", [C("10.2", 770)]],
  ]) mapCase({ caseId, p: w.variants[name].profile, pref: w.variants[name].ref, env: E[`main@${name}`], layout: L.main,
    render: w.render(`main@${name}-plain`, { p: w.variants[name].profile, envelope: E[`main@${name}`].value, layout: L.main.final, labelOf: w.labels.plain }),
    format: name === "labels-native" ? "sparx" : "drawio", expect, clause, derivation: `${why} Full refusal record with echoed identity and revision.`, wrong });
  mapCase({ caseId: "export-015-unknown-format", env: E.main, layout: L.main, render: R.main, format: "pdf", expect: "export-format-unsupported",
    clause: [C("10.2", 770), C("10.2", 780)], derivation: "No export spec of the profile targets pdf (the closed format enum has no pdf) and no adapter is registered for it.", wrong: "Falling back to the first export spec." });
  addCase({ caseId: "export-016-page-shape", group: "export", operation: "compileProfile", profile: w.profileRef,
    inputs: [inline("mutation", { pointer: `/recipes/${w.profile.recipes.findIndex(r => r.id === "export-pages")}/steps/0/fields/2`, value: { name: "shape", value: { op: "literal", value: "pool" } } }),
      ref("base", w.lot4Package.base), ref("descriptors", w.lot4Package.descriptors), ref("registry", w.lot4Package.registry), ref("schema", w.lot4Package.schema), ...w.lot4Package.assets.map(a => ref("asset", a))],
    expected: [{ role: "result", json: pureRefused("profile-export-field") }], status: "refused:profile-export-field", comparators: ["result-exact/1"], clause: [C("10.2", 772)],
    derivation: "export-ir/1 pages have only id and name; page.shape cannot pass the common signature. Full PureResult refusal (block A public compile contract: empty diagnostics).", wrong: "Accepting adapter-specific page fields." });
  const byteClaim = w.render("empty@byte-claim-plain", { p: w.variants["byte-claim"].profile, envelope: E["empty@byte-claim"].value, layout: L.empty.final, labelOf: w.labels.plain });
  P.byteClaim = mapCase({ caseId: "export-017-byte-claim-unqualified", p: w.variants["byte-claim"].profile, pref: w.variants["byte-claim"].ref, env: E["empty@byte-claim"], layout: L.empty, render: byteClaim, format: "drawio",
    capabilityOverride: "structural", capabilityFamily: "none",
    clause: [C("10.2", 799), C("10.1", 753), C("13", 933)],
    derivation: "The variant declares engine-byte-compatible for every occurrence, but no feature becomes byte-compatible by declaration alone: without qualified engine reference bytes the effective capability is structural (OPEN-EXPORT-EVIDENCE default) in the PreparedArtifact and its artifact record.",
    wrong: "Reporting engine-byte-compatible from the profile declaration." });
  mapCase({ caseId: "export-018-unsupported-capability", p: w.variants.unsupported.profile, pref: w.variants.unsupported.ref, env: E["main@unsupported"], layout: L.main,
    render: w.render("main@unsupported-plain", { p: w.variants.unsupported.profile, envelope: E["main@unsupported"].value, layout: L.main.final, labelOf: w.labels.plain }),
    format: "drawio", expect: "render-unsupported", clause: [C("10.1", 753), C("10.2", 797)],
    derivation: "The variant classes the aid occurrence unsupported: one unsupported necessary occurrence refuses the whole artifact with render-unsupported (harmonization C16); no partial download.", wrong: "Dropping the occurrence with a mapped loss and returning the rest, or refusing export-format-unsupported." });
  mapCase({ caseId: "export-019-unsupported-coverage", env: E.note, layout: L["main-note"], render: R.note, format: "drawio", expect: "render-unsupported",
    clause: [C("10.2", 797), C("10.1", 753)], derivation: "R records Note_Plain as unsupported (no glyph); necessary content without a declared safe mapping refuses.", wrong: "Exporting the rest of the diagram without the note." });
  // Stale R at mapExport (9.2 L690: terminal steps never repair R; harmonization K14).
  const tamper = (name, edit) => { const r = clone(R.main.render); edit(r); return { render: r, ref: ctx.artifact(`${name}.render.json`, r), viewRevision: R.main.viewRevision }; };
  const stale = (caseId, env, layout, render, why, clause = [C("9.2", 690)], wrong = "Repairing or recomputing R inside mapExport instead of refusing.") => mapCase({ caseId, group: "freshness", env, layout, render, format: "drawio", expect: "render-stale", clause, derivation: why, wrong });
  stale("export-020-stale-layout", E.main, L["main-renamed"], R.main, "R was resolved for the original page name; the supplied layout renames the page, so layoutDigest no longer matches.");
  stale("export-021-stale-envelope", E.choices, L.main, R.main, "The envelope is another document; R.binding.semanticRevision does not match it.");
  stale("export-022-stale-payload", E.main, L.main, tamper("main-tampered-label", r => { r.occurrences.find(o => o.occurrenceKey === "Task_Check_di").label.text = "Check goods"; }),
    "An occurrence label was edited without updating payloadDigest (and no longer equals the layout).");
  stale("export-023-stale-theme", E.main, L.main, tamper("main-tampered-theme", r => { r.binding.themeId = "dim"; }),
    "binding.themeId says dim but themeDigest was computed for plain.");
  stale("export-024-occurrence-mismatch", E.main, L.main, tamper("main-moved-occurrence", r => {
    r.occurrences.find(o => o.occurrenceKey === "Task_Ship_di").bounds.x += 1000;
    r.binding.payloadDigest = H({ pages: r.pages, occurrences: r.occurrences, coverage: r.coverage, diagnostics: r.diagnostics });
  }), "An occurrence is moved and payloadDigest recomputed, so every binding digest matches its inputs, but the occurrence no longer equals its Layout/1 record (harmonization K14).",
  [C("9.2", 690)], "Checking digests only: the self-consistent tampered R would be exported.");
  P.neutralSuccessor = mapCase({ caseId: "export-025-neutral-successor", p: w.successors.neutral.profile, pref: w.successors.neutral.ref, env: E.neutralSuccessor, layout: L["neutral-successor"], render: R.neutralSuccessor, format: "drawio",
    family: "neutral", capabilityFamily: "everyOccurrence", notionOf: w.NOTIONS.neutralSuccessor,
    clause: [C("14.3", 961), C("10.2", 776), C("10.2", 801)],
    derivation: "Complete loss map of the explicitly bound neutral successor: counter origin 0, pages e_0/e_1, nodes in page order then UTF-16 key (Z-page a-first, a-note, z-lane, z-last; A-page a-lane, a-last-page); every occurrence including the lane carries the semantic-type loss of the single when-true capability record (ruleId drawing, unavailable result). The a-first node bounds copy the PS-06 IO row of layout-008 (y 8).",
    wrong: "Exporting without the bound lane, or skipping losses for support occurrences.", decisions: ["PS-06"] });
  P.gridSuccessor = mapCase({ caseId: "export-026-grid-successor", p: w.successors.grid.profile, pref: w.successors.grid.ref, env: E.gridSuccessor, layout: L["grid-successor"], render: R.gridSuccessor, format: "drawio",
    family: "grid", capabilityFamily: "everyOccurrence", notionOf: w.NOTIONS.gridSuccessor,
    clause: [C("14.3", 961), C("10.2", 774), C("10.2", 801)],
    derivation: "Complete loss map of the explicitly bound grid successor, counter origin 10: z-last is emitted by export-nested-nodes under the a-first node of its page, after the other nodes, with its preallocated number; the two side stripes are emitted as nodes named Auxiliary without idMap records; the synthetic stripes also carry the when-true semantic-type loss with unavailable source and result coordinates. The a-first node bounds copy the PS-06 IO row of layout-009 (y 8).",
    wrong: "Numbering z-last by emission order, a stripe idMap record, or a fabricated tree pointer for a synthetic loss.", decisions: ["PS-06"] });
  P.variety = mapCase({ caseId: "export-027-variety-drawio", env: E.variety, layout: L.variety, render: R.variety, format: "drawio",
    clause: [C("10.2", 794, 796), C("10.2", 776)],
    derivation: "export-calls emits the call node and, in the same iteration, a navigation loss whose result is that node record /ir/<n> (B23 loss-action branch); the terminate end carries semantic-type and appearance losses and the retained ServiceTask a semantic-type loss (capability records, unavailable result): an ordinary End is never advertised as a lossless Terminate.",
    wrong: "Dropping the calledElement navigation silently, a navigation loss with unavailable coordinates, or exporting the terminate end without its semantic-type/appearance losses." });
  P.varietySparx = mapCase({ caseId: "export-028-variety-sparx", env: E.variety, layout: L.variety, render: R.variety, format: "sparx",
    clause: [C("10.2", 794, 796), C("2.2", 130)],
    derivation: "Native IDs: the navigation loss result targets the call node record whose ID is Call_V; capability losses use ruleId ea.",
    wrong: "Reporting the navigation loss against the calledElement target Process_Review, or suffixing native IDs." });

  // ------------------------------------------------------------- ID plan seams
  const plan = (caseId, input, output, status, why, wrong, clause = [C("10.2", 801)]) => addCase({ caseId, group: "export-id", operation: "exportIdPlan", inputs: [inline("plan-input", input)],
    expected: [{ role: "result", json: status === "ok" ? pureOk({ ids: output }) : pureRefused(status) }], status: status === "ok" ? "ok" : `refused:${status}`, comparators: ["result-exact/1"], clause, derivation: why, wrong });
  const gridPages = [{ pageId: "A-page", order: 1 }, { pageId: "Z-page", order: 0 }];
  const gridRequests = [
    { pageId: "Z-page", occurrenceKey: "", domain: "page" }, { pageId: "A-page", occurrenceKey: "", domain: "page" },
    { pageId: "Z-page", occurrenceKey: "a-first", domain: "node" }, { pageId: "A-page", occurrenceKey: "a-last-page", domain: "node" },
    { pageId: "Z-page", occurrenceKey: "z-last", domain: "node" }, { pageId: "Z-page", occurrenceKey: "a-first", domain: "node" },
  ];
  const listIds = (map, keys) => keys.map(k => ({ ...k, id: map.get(`${k.pageId}\u0000${k.occurrenceKey}\u0000${k.domain}`) }));
  const uniqueSorted = (keys, pages) => { const m = planCounter(keys, pages, 0); return [...m.keys()].map(s => { const [pageId, occurrenceKey, domain] = s.split("\u0000"); return { pageId, occurrenceKey, domain }; }); };
  plan("idplan-001-counter-grid", { policy: "counter", counterOrigin: 10, pages: gridPages, requests: gridRequests },
    listIds(planCounter(gridRequests, gridPages, 10), uniqueSorted(gridRequests, gridPages)), "ok",
    "The lot-0 grid recipes request page keys, export-nodes keys and the nested node with its container: allocation e_10 Z-page, e_11 A-page, e_12 a-first, e_13 z-last, e_14 a-last-page, exactly the lot-0 grid exportIR numbering, although z-last is emitted last; the repeated container request reuses e_12.",
    "Numbering in emission order (z-last would be e_14) or allocating the repeated request twice.");
  const mixed = [
    { pageId: "P2", occurrenceKey: "b", domain: "label" }, { pageId: "P2", occurrenceKey: "b", domain: "edge" }, { pageId: "P1", occurrenceKey: "z", domain: "node" },
    { pageId: "P2", occurrenceKey: "a", domain: "node" }, { pageId: "P1", occurrenceKey: "", domain: "page" }, { pageId: "P1", occurrenceKey: "B", domain: "node" },
    { pageId: "P2", occurrenceKey: "", domain: "page" }, { pageId: "P1", occurrenceKey: "z", domain: "node" },
  ];
  const mixedPages = [{ pageId: "P1", order: 5 }, { pageId: "P2", order: 2 }];
  plan("idplan-002-counter-domains", { policy: "counter", counterOrigin: 0, pages: mixedPages, requests: mixed },
    listIds(planCounter(mixed, mixedPages, 0), uniqueSorted(mixed, mixedPages)), "ok",
    "Domain order page, node, edge, label dominates; inside a domain page order (P2 order 2 before P1 order 5), then UTF-16 key ('B' before 'z'); only requested keys are allocated and the repeated P1/z request reuses its ID.",
    "Sorting by pageId text, by request order, or case-insensitively.");
  const dkeys = [{ pageId: "Page_Main", occurrenceKey: "", domain: "page" }, { pageId: "Page_Main", occurrenceKey: "Task_Check_di", domain: "node" }, { pageId: "Page_Main", occurrenceKey: "Flow_Yes_di", domain: "label" }];
  plan("idplan-003-digest", { policy: "digest", counterOrigin: 0, requests: dkeys }, dkeys.map(k => ({ ...k, id: digestOutputId(k.pageId, k.occurrenceKey, k.domain) })), "ok",
    "Digest IDs are e_ plus the full lowercase SHA-256 of JCS [pageId, occurrenceKey, domain]; a page uses the reserved empty key.",
    "Truncated digests, hashing the semantic ID, or a different tuple order.");
  plan("idplan-004-native-unique", { policy: "native", counterOrigin: 0, requests: [{ pageId: "Page_Main", occurrenceKey: "", domain: "page" }, { pageId: "Page_Main", occurrenceKey: "Task_Check_di", domain: "node", semanticId: "Task_Check" }] },
    [{ pageId: "Page_Main", occurrenceKey: "", domain: "page", id: "Page_Main" }, { pageId: "Page_Main", occurrenceKey: "Task_Check_di", domain: "node", id: "Task_Check" }], "ok",
    "Native policy: pageId for the page, semantic ID for the semantic occurrence when unique.", "Adding an e_ prefix or using occurrence keys.", [C("2.2", 130)]);
  plan("idplan-005-native-duplicate", { policy: "native", counterOrigin: 0, requests: [{ pageId: "View_Z", occurrenceKey: "Task_Check_di", domain: "node", semanticId: "Task_Check" }, { pageId: "View_A", occurrenceKey: "d-Task_Check", domain: "node", semanticId: "Task_Check" }] },
    null, "export-id-ambiguous", "Two occurrences on two pages share the semantic ID Task_Check, so the native ID would not be unique in the artifact.", "Keeping the first occurrence or suffixing the second ID.", [C("2.2", 130)]);
  plan("idplan-006-native-synthetic", { policy: "native", counterOrigin: 0, requests: [{ pageId: "Page_Main", occurrenceKey: "[\"band-stripe\",\"Process_Main\",\"Page_Main\"]", domain: "node" }] },
    null, "export-id-ambiguous", "A synthetic occurrence has no semantic ID, so the native policy cannot name it and requires a digest or counter policy.", "Using the synthetic key or the owner ID as the native ID.", [C("2.2", 130)]);
  // Non-ASCII keys are written as braced escapes so that no authoring channel can fold them.
  const utf16 = [{ pageId: "P", occurrenceKey: "\u{E000}", domain: "node" }, { pageId: "P", occurrenceKey: "\u{10000}", domain: "node" }, { pageId: "P", occurrenceKey: "z", domain: "node" }, { pageId: "P", occurrenceKey: "Z", domain: "node" }];
  plan("idplan-007-utf16-key-order", { policy: "counter", counterOrigin: 0, pages: [{ pageId: "P", order: 0 }], requests: utf16 },
    listIds(planCounter(utf16, [{ pageId: "P", order: 0 }], 0), uniqueSorted(utf16, [{ pageId: "P", order: 0 }])), "ok",
    "Four nonempty node keys of page P, requested as U+E000, U+10000, z, Z, sort by UTF-16 code units: Z (0x005A) e_0, z (0x007A) e_1, U+10000 (surrogate pair 0xD800 0xDC00) e_2, then U+E000 (0xE000) e_3. Code-point order would place U+E000 (e_2) before U+10000 (e_3).",
    "Code-point or UTF-8 byte order of occurrence keys (U+E000 e_2, U+10000 e_3), locale collation (z before Z), or numbering in request order (U+E000 e_0).", [C("10.2", 801), C("2.2", 126)]);
  // The renamed-page artifact for the escaping serializer case (consistent mapExport output).
  P.renamed = assembleExport({ spec: w.profile.exports[0], render: R.renamed.render, envelope: E.main.value, viewRevision: R.renamed.viewRevision, family: "lot4", capabilityFamily: "lot4", notionOf: NOTION_OF });
  return P;
}

// ------------------------------------------------------------- serializer
// DESIGN 2.5 L239: serializePrepared(prepared, pinnedWriterOptions) ->
// Result<{format, bytes, digest, idMap, capability}>.
export function serializerCases(ctx, w, P) {
  const { addCase, inline, ref } = ctx;
  const BYTES_REASON = "Exact draw.io bytes are not fixed by DESIGN R3.3 (geometry unit conversion and style vocabulary of the target adapter, U-08; engine bytes OPEN-EXPORT-EVIDENCE, U-01): the bytes are checked by drawio-structure/1 and serialize-bytes/1, and every digest equals SHA-256 of the returned bytes.";
  const unsealed = [{ pointer: "/payload/bytes", reason: BYTES_REASON }, { pointer: "/payload/digest", reason: BYTES_REASON }, { pointer: "/report/artifacts/0/digest", reason: BYTES_REASON }];
  const projection = prepared => {
    const diagrams = prepared.ir.filter(r => r.kind === "page").map(pg => ({ id: pg.id, name: pg.name, cells: [] }));
    const pageOf = id => { const r = prepared.ir.find(x => x.id === id); return r.kind === "page" ? r.id : pageOf(r.parent); };
    for (const r of prepared.ir.filter(x => x.kind !== "page")) {
      const d = diagrams.find(x => x.id === pageOf(r.parent));
      const cell = r.kind === "edge" ? { id: r.id, kind: "edge", parent: "$layer", source: r.source, target: r.target, ...(r.name !== undefined ? { value: r.name } : {}) }
        : { id: r.id, kind: "vertex", parent: diagrams.some(x => x.id === r.parent) ? "$layer" : r.parent, ...(r.name !== undefined ? { value: r.name } : r.text !== undefined ? { value: r.text } : {}) };
      d.cells.push(cell);
    }
    return { mxfile: { absentAttributes: ["modified", "etag"] }, diagrams };
  };
  const invariants = serializer => ({ encoding: "UTF-8", byteOrderMark: false, newline: serializer.newline, indent: serializer.indent, compression: serializer.compression,
    emptyElement: serializer.emptyElement, attributeOrder: serializer.attributeOrder, digestIsSha256OfBytes: true });
  const options = w.profile.exports[0].serializer;
  // Result/1 of a successful serialization: the preparation identity and revision
  // (L737), the prepared report entries and idMap (losses stay reachable, L753/L803).
  const serialized = prepared => {
    const r = prepared.report;
    return resultOk("serializePrepared", { profileIdentity: prepared.profileIdentity, baseRevision: prepared.semanticRevision,
      report: reportOf("serializePrepared", { sourceIdentity: prepared.profileIdentity, targetIdentity: prepared.profileIdentity, inputRevision: prepared.semanticRevision, outputRevision: prepared.semanticRevision,
        entries: r.entries, idMap: prepared.idMap, artifacts: [{ format: prepared.format, capability: prepared.capability, entryIndexes: r.artifacts[0].entryIndexes }] }),
      payload: { format: prepared.format, idMap: prepared.idMap, capability: prepared.capability } });
  };
  const prep = (name, prepared) => ctx.artifact(`${name}.prepared.json`, prepared);
  const ser = (caseId, prepared, preparedRef, why, wrong, clause = [C("10.2", 801), C("10.1", 737)]) => {
    const resultRef = ctx.artifact(`${caseId}.serialize-result.json`, serialized(prepared));
    addCase({ caseId, group: "serializer", operation: "serializePrepared", inputs: [ref("prepared", preparedRef), inline("writerOptions", options)],
      expected: [ref("result", resultRef), inline("unsealed", unsealed), inline("drawio-structure", projection(prepared)), inline("byte-invariants", invariants(options))],
      status: "ok", comparators: ["result-exact/1", "profile-report/2", "serialize-bytes/1", "drawio-structure/1", "source-immutability/1"], clause, derivation: why, wrong });
  };
  const mainRef = prep("main", P.main.prepared);
  ser("serialize-001-main-drawio", P.main.prepared, mainRef,
    "One diagram per page in page order with the IR page ID and name; one cell per IR record in emission order; vertices carry the IR name/text, edges their IR source/target; top-level cells hang on the diagram layer. UTF-8 without BOM, LF only, no indentation, no compression, short empty elements, the pinned attribute order, no timestamp or random mxfile attributes; digest = SHA-256 of the returned bytes; the Result carries the preparation identity/revision, the prepared loss entries, idMap and capability.",
    "Regenerating IDs, dropping labels, compressing despite compression none, CRLF newlines, a modified/etag attribute, another attribute order, a digest of something other than the bytes, or a report that drops the losses.");
  ser("serialize-002-repeated-drawio", P.repeated.prepared, prep("repeated", P.repeated.prepared),
    "Two diagrams in page order (Overview, then Detail), each with only its own cells.", "Merging pages or ordering diagrams by pageId.");
  ser("serialize-003-xml-escaping", P.renamed.prepared, prep("main-renamed", P.renamed.prepared),
    "The page name has two leading spaces, & < > \" ', a tab and a trailing space; after XML parsing the diagram name equals the original string exactly, so the tab must be written as a character reference (attribute-value normalization would turn a raw tab into a space) and no whitespace is trimmed.",
    "Unescaped markup, entity double-escaping, a raw tab in the attribute, or trimming the name.");
  addCase({ caseId: "serialize-004-determinism", group: "serializer", operation: "serializePrepared-sequence",
    inputs: [ref("prepared-a", mainRef), ref("prepared-b", prep("multi", P.multi.prepared)), inline("writerOptions", options), inline("order", ["a", "a", "b", "a"])],
    expected: [{ role: "output", json: { sameBytesForSameInput: true, abaUnchanged: true } }], status: "ok", comparators: ["determinism/1"], clause: [C("10.2", 801), C("14.3", 963)],
    derivation: "A pure terminal serializer returns identical bytes for identical input, including after serializing another artifact (A->A->B->A); no clock, counter or cache leaks between calls.",
    wrong: "Timestamps, call counters or a shared ID table across calls." });
  const tampered = (name, edit) => { const p = clone(P.main.prepared); edit(p); return { value: p, ref: ctx.artifact(`${name}.prepared.json`, p) }; };
  for (const [caseId, edit, why, clause] of [
    ["serialize-005-stale-binding", p => { p.renderBinding.themeDigest = H({ themeId: "plain", themes: [] }); }, "renderBinding.themeDigest no longer yields the prepared viewRevision.", [C("10.1", 737), C("9.2", 690)]],
    ["serialize-006-revision-mismatch", p => { p.semanticRevision = w.envs.multi.value.semanticRevision; }, "prepared.semanticRevision differs from renderBinding.semanticRevision.", [C("10.1", 737), C("9.2", 690)]],
    ["serialize-007-stale-profile-digest", p => { p.renderBinding.profileDigest = H("another profile"); }, "renderBinding.profileDigest differs from profileIdentity.sha256 while viewRevision (which excludes it) still verifies (harmonization K15).", [C("10.1", 737), C("9.2", 681), C("9.2", 690)]],
    ["serialize-008-stale-descriptor-digest", p => { p.renderBinding.descriptorDigest = H([]); }, "renderBinding.descriptorDigest differs from H(profileIdentity.descriptors sorted) while viewRevision still verifies (harmonization K15).", [C("10.1", 737), C("9.2", 682), C("9.2", 690)]],
  ]) {
    const t = tampered(caseId, edit);
    addCase({ caseId, group: "freshness", operation: "serializePrepared", inputs: [ref("prepared", t.ref), inline("writerOptions", options)],
      expected: [{ role: "result", json: resultRefused("serializePrepared", "render-stale", { profileIdentity: t.value.profileIdentity, baseRevision: t.value.semanticRevision }) }], status: "refused:render-stale",
      comparators: ["result-exact/1", "profile-report/2", "source-immutability/1"], clause, derivation: `${why} Full refusal record echoing the preparation identity and revision; no bytes.`, wrong: "Serializing anyway or repairing the binding." });
  }

  // BPMN XML column (F7 native writer, structural facts only).
  const fact = (local, id, extra = {}) => ({ element: local, id, ...extra });
  const bpmn = (caseId, env, facts, why, wrong, clause) => addCase({ caseId, group: "bpmn-column", operation: "serializeBpmn",
    inputs: [ref("envelope", env.ref), inline("writerOptions", { format: true, preamble: true })],
    expected: [{ role: "output", json: facts }], status: "ok", comparators: ["bpmn-structure/1", "source-immutability/1"], clause, derivation: why, wrong });
  bpmn("bpmn-001-main-native", w.envs.main, [
    fact("dataStore", "Store_Policy", { parent: "definitions", attributes: { name: "Policy archive" } }),
    fact("dataStoreReference", "StoreRef_Policy", { parent: "process:Process_Main", attributes: { dataStoreRef: "Store_Policy", name: "Policy archive" } }),
    fact("participant", "Pool_Main", { parent: "collaboration:Collab_Main", attributes: { processRef: "Process_Main" } }),
    fact("participant", "Band_Main", { parent: "collaboration:Collab_Main", absent: ["processRef"] }),
    fact("dataInput", "Input_Order", { parent: "ioSpecification", owner: "process:Process_Main" }),
    fact("dataOutput", "Output_Receipt", { parent: "ioSpecification", owner: "process:Process_Main" }),
    fact("inputSet", "InputSet_Main", { children: { dataInputRefs: ["Input_Order"] } }),
    fact("dataInputAssociation", "Input_Link", { parent: "task:Task_Check", children: { sourceRef: ["Input_Order"], targetRef: ["Port_Check_In"] } }),
    fact("dataOutputAssociation", "Output_Link", { parent: "task:Task_Ship", children: { sourceRef: ["Port_Ship_Out"], targetRef: ["Output_Receipt"] } }),
    fact("textAnnotation", "Aid_Scanner", { children: { text: ["[Aid] Scanner"] } }),
    fact("association", "Assoc_Policy", { attributes: { sourceRef: "StoreRef_Policy", targetRef: "Task_Check", associationDirection: "One" } }),
    { element: "textAnnotation", count: 1 },
  ], "BPMN XML preserves the native store type and reference, the band Participant without processRef, Process IO in Process.ioSpecification with its sets, activity-owned data associations and the marker text unchanged; no extra annotation appears.",
  "Remapping the store to a TextAnnotation, giving the band a processRef, moving IO into a lane, or stripping the marker.", [C("10.2", 790, 793)]);
  bpmn("bpmn-002-multi-native", w.envs.multi, [
    fact("dataStore", "Store_Shared", { parent: "definitions" }),
    fact("dataStoreReference", "StoreRef_A", { parent: "process:Process_A", attributes: { dataStoreRef: "Store_Shared", name: "Shared register" } }),
    fact("dataStoreReference", "StoreRef_B", { parent: "process:Process_B", attributes: { dataStoreRef: "Store_Shared", name: "Register copy" } }),
    fact("participant", "Band_A", { parent: "collaboration:Collab_A", absent: ["processRef"] }),
    fact("participant", "Band_B", { parent: "collaboration:Collab_B", absent: ["processRef"] }),
    { element: "collaboration", count: 2 }, { element: "dataStore", count: 1 },
  ], "One shared root DataStore, one reference per process with its local name, one band per process in its own collaboration.",
  "Deduplicating references by store, or overwriting the local reference name with the store name.", [C("10.2", 790, 791)]);
  bpmn("bpmn-003-variety-native", w.envs.variety, [
    fact("callActivity", "Call_V", { parent: "process:Process_Variety", attributes: { calledElement: "Process_Review", name: "Call review" } }),
    fact("serviceTask", "Service_V", { parent: "process:Process_Variety", attributes: { name: "Run check" } }),
    fact("endEvent", "End_V", { parent: "process:Process_Variety", attributes: { name: "Stopped" } }),
    fact("terminateEventDefinition", "Terminate_V", { parent: "endEvent:End_V" }),
    fact("task", "Task_Review", { parent: "process:Process_Review" }),
    { element: "terminateEventDefinition", count: 1 }, { element: "callActivity", count: 1 }, { element: "serviceTask", count: 1 },
  ], "BPMN XML keeps the internal calledElement target, the TerminateEventDefinition of the end event and the retained ServiceTask subtype natively.",
  "Dropping calledElement, writing an ordinary end event, or downgrading the service task to a task.", [C("10.2", 794, 796)]);
}

// ------------------------------------------------------- legacy diagnostic adapter
export function legacyAdapterCases(ctx, w) {
  const { addCase, inline, ref } = ctx;
  const M = (legacyCode, code, messageKey, emitted) => ({ legacyCode, code, messageKey, classification: "integrity", severity: "error", disposition: "refused", perId: true, emitted });
  const designMapped = [
    M("unknown-format", "export-format-unsupported", "export.format-unsupported", false),
    M("unsupported-format", "export-format-unsupported", "export.format-unsupported", false),
    M("invalid-reference", "reference-dangling", "reference-dangling", false),
    M("missing-endpoint", "reference-dangling", "reference-dangling", true),
    M("duplicate-id", "id-collision", "id-collision", true),
  ];
  const exportInventory = ["element-without-di", "free-annotation", "invalid-geometry", "invalid-semantics", "missing-di", "missing-semantics", "multiple-participants",
    "nested-subprocess", "no-pages", "not-bpmn", "orphan-application", "unknown-semantics-version", "unsupported-element", "unsupported-model", "unsupported-structure"];
  const manifest = {
    format: "legacy-adapter-manifest/1",
    revision: 2,
    reviewedAgainst: "block A public sources at 5ba04e0 (io index, reference-model, reference-drawio and reference-sparx modules; react workshop export; assistant-ui) and the Python twin library (bpmn_io) at commit 1254d9a",
    closedLossClasses: ["semantic-type", "relation-kind", "navigation", "appearance", "layout", "metadata", "unsupported-feature", "provenance-unavailable"],
    closedFallback: { code: "legacy-unmapped", messageKey: "legacy.unmapped", classification: "integrity", severity: "error", disposition: "refused", coordinates: "unavailable", legacyCode: "exact string code when present, otherwise omitted" },
    adapters: [
      { id: "js-legacy-export", entry: "io export(definitions, format): byte-or-throw legacy export for bpmn, drawio and sparx", producerShape: "IoError(code, message, ids)",
        mapped: designMapped, fallbackInventory: exportInventory, notices: [], codeless: "closed fallback without legacyCode" },
      { id: "js-workshop-export", entry: "workshop download: initializeCodecs, parseDefinitions, then js-legacy-export; cancellation stays operation-cancelled", producerShape: "IoError(code, message, ids)",
        mapped: designMapped, fallbackInventory: [...exportInventory, "dtd", "invalid-configuration", "invalid-xml"].sort(compareText), notices: [], codeless: "closed fallback without legacyCode" },
      { id: "assistant-ui-export", entry: "no legacy export entry point at block A head (render only)", producerShape: "none", mapped: [], fallbackInventory: [], notices: [], codeless: "closed fallback without legacyCode" },
      { id: "python-twin-legacy-export", entry: "no legacy export entry point in the Python twin library at 1254d9a (no draw.io/Sparx writer, no IoError or fidelity-notice producer)", producerShape: "none",
        mapped: [], fallbackInventory: [], notices: [], codeless: "closed fallback without legacyCode" },
    ],
  };
  const manifestRef = ctx.artifact("legacy-adapter-manifest.json", manifest);
  addCase({ caseId: "legacy-adapter-001-manifest", group: "legacy-adapter", operation: "legacy-adapter-manifest", inputs: [],
    expected: [{ ...ref("output", manifestRef) }], status: "ok", comparators: ["profile-c14n/2"], clause: [C("10.2", 778, 785)],
    derivation: "Each export adapter publishes a finite per-code manifest before lot 4: only the codes named by the DESIGN legacy family table are mapped; every other code the adapter can emit is listed for review and takes the closed fallback; no code is guessed from message text. The twin library's manifest is empty (no legacy export entry point); the private consumer's Python export common report stays private-consumer-owned (U-12).",
    wrong: "Message-text heuristics, a global table shared by all adapters, unlisted codes mapped by similarity, or an undeclared twin adapter." });
  const unavailable = { domain: "none", pointer: null, targetId: null, provenance: "unavailable" };
  const entry = (code, messageKey, legacyCode, source, extra = {}) => ({ code, severity: "error", classification: "integrity", stage: "export", ruleId: "adapter", messageKey, disposition: "refused",
    source, result: unavailable, beforePresent: false, afterPresent: false, ...(legacyCode === undefined ? {} : { legacyCode }), ...extra });
  const tree = (pointer, targetId) => ({ domain: "tree", pointer, targetId, provenance: pointer === null ? "unavailable" : "exact" });
  // mapLegacyDiagnostics (A4): PureResult whose payload is the Report/2 entry list in profile-report/2 order.
  const adapterCase = (caseId, adapter, legacy, sourceIndex, entries, why, wrong, opts = {}) => addCase({ caseId, group: "legacy-adapter", operation: "mapLegacyDiagnostics",
    inputs: [inline("adapter", adapter), inline("legacy", legacy), inline("sourceIndex", sourceIndex), ...(opts.manifest ? [inline("manifest", opts.manifest)] : [ref("manifest", manifestRef)])],
    expected: [{ role: "result", json: pureOk(sortEntries(entries)) }], status: "ok", comparators: ["result-exact/1"], clause: [C("10.2", 778, 785), C("10.1", 760)], derivation: why, wrong });
  const index = { Task_A: "/rootElements/0/flowElements/1", Task_Z: "/rootElements/0/flowElements/0" };
  adapterCase("legacy-adapter-002-duplicate-id", "js-legacy-export", { kind: "IoError", code: "duplicate-id", ids: ["Task_Z", "Task_A"], message: "Duplicate semantic ID" }, index,
    [entry("id-collision", "id-collision", "duplicate-id", tree("/rootElements/0/flowElements/0", "Task_Z")), entry("id-collision", "id-collision", "duplicate-id", tree("/rootElements/0/flowElements/1", "Task_A"))],
    "One integrity refusal entry per ID; indexed IDs keep their exact original pointer; entries sort by source pointer; ruleId adapter (harmonization B24).", "One entry for the whole error, pointers guessed from the message, or ruleId set to the adapter id.");
  adapterCase("legacy-adapter-003-missing-endpoint", "js-legacy-export", { kind: "IoError", code: "missing-endpoint", ids: ["Assoc_9"], message: "Relation endpoint is not exported" }, {},
    [entry("reference-dangling", "reference-dangling", "missing-endpoint", tree(null, "Assoc_9"))],
    "Without an original index the pointer is unavailable; the target ID and exact legacy code are retained.", "Fabricating the root pointer.");
  adapterCase("legacy-adapter-004-unknown-format", "js-legacy-export", { kind: "IoError", code: "unknown-format", ids: [], message: "x" }, {},
    [entry("export-format-unsupported", "export.format-unsupported", "unknown-format", unavailable)],
    "A DESIGN-listed family code maps even though the current JS adapter does not emit it; no ID gives one coarse entry with unavailable coordinates.", "Refusing to map a listed code.");
  adapterCase("legacy-adapter-005-unmapped-emitted", "js-legacy-export", { kind: "IoError", code: "unsupported-model", ids: [], message: "Unknown export format" }, {},
    [entry("legacy-unmapped", "legacy.unmapped", "unsupported-model", unavailable)],
    "unsupported-model is emitted (unknown format branch) but not mapped by the reviewed manifest: closed fallback, despite a message that mentions the format.", "Mapping by message text to export-format-unsupported.");
  adapterCase("legacy-adapter-006-message-ignored", "js-legacy-export", { kind: "IoError", code: "invalid-semantics", ids: ["Task_A"], message: "Duplicate semantic ID Task_A at /rootElements/0" }, index,
    [entry("legacy-unmapped", "legacy.unmapped", "invalid-semantics", tree(null, "Task_A"))],
    "The closed fallback keeps the ID but unavailable coordinates even when the ID is indexed; the message text creates neither id-collision nor a pointer.", "id-collision inferred from the message, or an exact pointer for an unmapped code.");
  adapterCase("legacy-adapter-007-empty-id", "js-legacy-export", { kind: "IoError", code: "unsupported-element", ids: [""], message: "Activity loops are not exported" }, {},
    [entry("legacy-unmapped", "legacy.unmapped", "unsupported-element", unavailable)],
    "An empty-string ID is not a target: a single coarse entry with unavailable coordinates.", "An entry with targetId ''.");
  adapterCase("legacy-adapter-008-codeless", "js-legacy-export", { kind: "exception", name: "TypeError", message: "writer failed" }, {},
    [entry("legacy-unmapped", "legacy.unmapped", undefined, unavailable)],
    "A legacy exception without a string code takes the closed fallback without legacyCode (nothing exact to preserve).", "Using the exception name or message as legacyCode.");
  adapterCase("legacy-adapter-009-workshop-dtd", "js-workshop-export", { kind: "IoError", code: "dtd", ids: [], message: "DTD is not supported" }, {},
    [entry("legacy-unmapped", "legacy.unmapped", "dtd", unavailable)],
    "The workshop path adds parse codes to its inventory; dtd is listed for review and not mapped.", "Treating workshop parse errors as successful exports.");
  adapterCase("legacy-adapter-010-adapter-scope", "assistant-ui-export", { kind: "IoError", code: "duplicate-id", ids: ["X"], message: "x" }, {},
    [entry("legacy-unmapped", "legacy.unmapped", "duplicate-id", tree(null, "X"))],
    "Mappings are per adapter: the assistant-UI adapter publishes an empty manifest, so even duplicate-id takes the fallback there.", "One global mapping table for every adapter.");
  const revised = clone(manifest); revised.revision = 3; revised.adapters[0].notices = [{ legacyCode: "projection", lossClass: "semantic-type" }];
  const notice = { code: "export-loss/semantic-type", severity: "warn", classification: "loss", stage: "export", ruleId: "adapter", messageKey: "export.loss.semantic-type", disposition: "mapped",
    source: unavailable, result: unavailable, beforePresent: false, afterPresent: false, legacyCode: "projection", lossClass: "semantic-type" };
  adapterCase("legacy-adapter-011-declared-notice", "js-legacy-export", { kind: "FidelityNotice", code: "projection", message: "Projected for interchange" }, {}, [notice],
    "A reviewed manifest revision declaring a closed loss class for the notice maps it to export-loss/<class>, warn, loss, mapped, keeping legacyCode; a coarse notice has unavailable coordinates.", "Treating the notice as info text without a loss entry.",
    { manifest: revised });
  adapterCase("legacy-adapter-012-undeclared-notice", "js-legacy-export", { kind: "FidelityNotice", code: "projection", message: "Projected for interchange" }, {},
    [entry("legacy-unmapped", "legacy.unmapped", "projection", unavailable)],
    "The pinned revision-2 manifest declares no notices: an undeclared notice fails closed.", "Passing an unknown notice through as success.");
  const openClass = clone(manifest); openClass.revision = 3; openClass.adapters[0].notices = [{ legacyCode: "projection", lossClass: "visual" }];
  adapterCase("legacy-adapter-013-notice-class-not-closed", "js-legacy-export", { kind: "FidelityNotice", code: "projection", message: "Projected for interchange" }, {},
    [entry("legacy-unmapped", "legacy.unmapped", "projection", unavailable)],
    "The manifest declares the notice with lossClass visual, which is not one of the closed DESIGN loss classes: the notice fails closed (harmonization L4: both closed set and manifest declaration).",
    "Mapping any manifest-declared class to export-loss/<class>.", { manifest: openClass });
}

// ------------------------------------------------------------- prepareExport
export function preparationCases(ctx, w) {
  const { addCase, inline, ref } = ctx;
  const opts = format => ({ format, themeId: "plain", overrides: w.EMPTY_BAGS.overrides, diStyles: w.EMPTY_BAGS.diStyles });
  const prepare = (caseId, env, format, code, entries, clause, derivation, wrong) => addCase({ caseId, group: "prepare", operation: "prepareExport", profile: w.profileRef,
    inputs: [ref("envelope", env.ref), inline("options", opts(format))],
    expected: [{ role: "result", json: resultRefused("prepareExport", code, { profileIdentity: env.value.profileIdentity, baseRevision: env.value.semanticRevision, entries }) }],
    status: `refused:${code}`, comparators: ["result-exact/1", "profile-report/2", "source-immutability/1"], clause, derivation, wrong });
  prepare("prepare-001-unknown-format", w.envs.main, "pdf", "export-format-unsupported", [], [C("10.2", 803), C("10.2", 780)],
    "Option validation precedes the pipeline (harmonization C18): no export spec targets pdf; no stage runs, so the refusal echoes identity and revision with empty diagnostics and report entries, returns no artifact and leaves the source envelope unchanged.",
    "Running C/N or layout before rejecting the format, reporting stage entries, or mutating the source.");
  prepare("prepare-002-missing-support-gated", w.envs.nolane, "drawio", "profile-open", [], [C("9.4", 725), C("10.2", 803), C("13", 917)],
    "Pipeline under edit activation (harmonization H1): C changes nothing (isExecutable already false, every ID present); the pre-normalize accept table has only the profile subrule and every task is named, so no entry; N then needs the ensure-supports recipe to create the missing external lane, a gated effective support creation (OPEN-RESERVED-N, harmonization H2): prepareExport refuses profile-open with the complete report so far (no entries, no artifact).",
    "Creating the lane during preparation, returning render-region-missing from the gated path, or reporting C change entries.");
  const unnamedFix = lintEntry({ code: "task-name-missing-pre-normalize", severity: "error", classification: "readiness", stage: "pre-normalize", ruleId: "task-named-pre-normalize", messageKey: "invalid",
    pointer: "/rootElements/1/flowElements/4", targetId: "Task_Fix" });
  prepare("prepare-003-lint-blocked", w.envs.unnamed, "drawio", "task-name-missing-pre-normalize", [unnamedFix], [C("10.2", 803), C("6.2", 478), C("6.2", 481), C("6.4", 515)],
    "Task_Fix has an empty name. C changes nothing; the pre-normalize accept stage runs the profile subrule task-named-pre-normalize (every standard setting of the lot-4 tables is off), which reports one readiness error on Task_Fix with no declared repair recipe, so the stage blocks: prepareExport refuses with the code of the first unresolved error entry (harmonization C19). The report holds that single unified entry (ruleId = subrule id, code/messageKey from the rule, accept severity error, exact source pointer, observed disposition); diagnostics equal the report entries; no later stage runs.",
    "Continuing to N or later stages, refusing with a generic lint code, omitting the blocking entry from the report, or a fabricated result coordinate.");
}
