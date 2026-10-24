// Cases: RenderData/1 results (9.1/9.3), synthetic styling, decision labels,
// digest formulas and freshness (9.2), legacy themes (9.5), theme history.
import { H, clone, jcs } from "./lot4-core.mjs";
import { LOT4_BINDINGS, FACETS_OF, renderDigests, resolveThemeId, themeChain, assembleRender } from "./lot4-render.mjs";
import { pureOk, pureRefused, resultRefused } from "./lot4-results.mjs";
import { staleChecks } from "./lot4-export.mjs";
import { REGION } from "./lot4-world.mjs";

const C = (section, a, z = a) => ({ section, lines: [a, z] });
const RENDER_COMPARATORS = ["result-exact/1", "profile-report/2", "source-immutability/1"];

export function renderCases(ctx, w) {
  const { addCase, inline, ref } = ctx;
  const identity = env => ({ profileIdentity: env.value.profileIdentity, baseRevision: env.value.semanticRevision });
  const bagsIn = (overrides, diStyles) => [inline("overrides", overrides), inline("diStyles", diStyles)];
  function resolveCase({ caseId, group = "render", p = w.profile, pref = w.profileRef, env, layout, themeId = "plain", overrides = w.EMPTY_BAGS.overrides, diStyles = w.EMPTY_BAGS.diStyles,
    labelOf = w.labels.plain, extra = {}, expect, clause, derivation, wrong, name, relations, decisions }) {
    const out = w.render(expect === "ok" ? name ?? caseId : undefined, { p, envelope: env.value, layout: layout.final, themeId, overrides, diStyles, labelOf, extra });
    const inputs = [ref("envelope", env.ref), ref("layout", layout.ref), inline("themeId", themeId), ...bagsIn(overrides, diStyles)];
    if (expect === "ok") {
      if (out.refused) throw new Error(`${caseId}: expected ok, derivation refused ${out.refused} ${out.why ?? ""}`);
      addCase({ caseId, group, operation: "resolveTheme", profile: pref, inputs, expected: [ref("result", out.resultRef), ...(relations ? [inline("relations", relations)] : [])], status: "ok", comparators: RENDER_COMPARATORS, clause, derivation, wrong, decisions });
      return out;
    }
    if (out.refused !== expect) throw new Error(`${caseId}: expected ${expect}, derivation gave ${out.refused ?? "ok"}`);
    addCase({ caseId, group, operation: "resolveTheme", profile: pref, inputs, expected: [{ role: "result", json: out.result }], status: `refused:${expect}`, comparators: RENDER_COMPARATORS, clause, derivation, wrong });
    return out;
  }
  const L = w.layouts, E = w.envs;
  const R = {};
  R.main = resolveCase({ caseId: "render-001-main-plain", env: E.main, layout: L.main, expect: "ok", name: "main-plain",
    clause: [C("9.1", 669, 673), C("9.2", 679, 690), C("9.3", 698, 700)],
    derivation: "Every occurrence copies its Layout/1 geometry and label; emittedType is node or edge; glyph and notion tokens come from the element's single primary notion binding for plain; disjoint facet tokens (Task_Fix stroke and fontWeight) join at the notion level; theme paint tokens fill the rest; region.* tokens never enter style. Coverage lists every ID-bearing element in native pre-order (G3) with rendered/nonvisual dispositions. All ten binding digests are computed with H; the Result/1 carries the B4 report header.",
    wrong: "Declaration-order winners, merging region tokens into style, sorting coverage by ID, omitting nonvisual supports/ports, hashing a non-normalized bag, or a report without header members." });
  R.repeated = resolveCase({ caseId: "render-002-repeated-views", env: E.main, layout: L.repeated, expect: "ok", name: "repeated-plain",
    clause: [C("9.1", 671, 673), C("2.2", 126)],
    derivation: "Task_Check, Input_Order, StoreRef_Policy and the supports appear on View_Z (order 0) and View_A (order 1); coverage keeps every occurrence in page-order then key order; occurrences sort by page order then UTF-16 key (keys d-* on View_A).",
    wrong: "Keeping one occurrence per semantic ID, sorting occurrences by semantic ID or by pageId instead of page order." });
  R.multi = resolveCase({ caseId: "render-003-multi-process", env: E.multi, layout: L.multi, expect: "ok", name: "multi-plain",
    clause: [C("9.1", 671, 673)],
    derivation: "Two processes on two pages, two bands, one shared DataStore (nonvisual root element) and two references with their own local names.",
    wrong: "Rendering the shared DataStore itself or replacing the local reference name by the store name." });
  R.empty = resolveCase({ caseId: "render-004-empty-process", env: E.empty, layout: L.empty, expect: "ok", name: "empty-plain",
    clause: [C("9.1", 673), C("9.4", 725)],
    derivation: "Only the pool is rendered; Definitions, Process and Collaboration are nonvisual coverage records.",
    wrong: "Dropping nonvisual elements from coverage or inventing a lane/band occurrence." });
  R.neutral = resolveCase({ caseId: "render-005-neutral-fixture", p: w.lot0.neutral.profile, pref: w.lot0.neutral.ref, env: E.neutral, layout: L.neutral, expect: "ok", name: "neutral-plain",
    labelOf: w.labels.neutral, extra: { bindings: w.lot0Bindings, notionOf: w.NOTIONS.neutral, facetsOf: {} },
    clause: [C("9.1", 669, 673), C("9.3", 698, 702)],
    derivation: "Lot-0 neutral fixture completed tree under its own unchanged profile, on a supplied two-page layout: Task_A (empty name) has no label; the aid annotation label strips the declared prefix '[Aid] ' once; Task_B is repeated on two pages; theme region.content.* tokens stay out of style.",
    wrong: "Rendering an empty label box for Task_A, keeping the '[Aid] ' prefix, or copying region tokens into style." });
  // Multi-target bags in normalized order and the same records reversed (DESIGN 9.2 L692-L694).
  const tk = (name, value) => ({ name, value });
  const sortedBags = {
    overrides: {
      semantic: [{ semanticId: "Task_Check", tokens: [tk("dash", "dashed"), tk("strokeWidth", 2)] }, { semanticId: "Task_Fix", tokens: [tk("fill", "#fff0f0")] }],
      occurrence: [{ pageId: "Page_Main", occurrenceKey: "Task_Check_di", tokens: [tk("strokeWidth", 3)] }, { pageId: "Page_Main", occurrenceKey: "Task_Ship_di", tokens: [tk("textColor", "#003300")] }],
    },
    diStyles: {
      native: [{ pageId: "Page_Main", occurrenceKey: "Task_Check_di", tokens: [tk("dash", "solid"), tk("stroke", "#112233")] }, { pageId: "Page_Main", occurrenceKey: "Task_Fix_di", tokens: [tk("fill", "#ffeedd")] }],
      bioc: [{ pageId: "Page_Main", occurrenceKey: "Task_Check_di", tokens: [tk("stroke", "#998877"), tk("textColor", "#445566")] }, { pageId: "Page_Main", occurrenceKey: "Task_Ship_di", tokens: [tk("stroke", "#556677")] }],
    },
  };
  const reverseBag = bag => Object.fromEntries(Object.entries(bag).map(([k, list]) => [k, [...list].reverse().map(r => ({ ...r, tokens: [...r.tokens].reverse() }))]));
  const reversedBags = { overrides: reverseBag(sortedBags.overrides), diStyles: reverseBag(sortedBags.diStyles) };
  R.precedence = resolveCase({ caseId: "render-006-token-precedence", env: E.main, layout: L.main, themeId: "dim", overrides: sortedBags.overrides, diStyles: sortedBags.diStyles, expect: "ok", name: "main-dim-precedence",
    clause: [C("9.3", 700), C("9.2", 692)],
    derivation: "Two-target bags in normalized order. Task_Check_di: strokeWidth 3 (occurrence beats semantic 2), dash dashed (semantic beats native solid), stroke #112233 (native beats bioc #998877), textColor #445566 (bioc beats theme), fill #ffffff (notion beats selected dim #eeeeee), arrow open (selected dim beats fallback plain none). Task_Fix_di: fill #fff0f0 (semantic beats native #ffeedd), stroke #aa0000 (facet). Task_Ship_di: textColor #003300 (occurrence), stroke #556677 (bioc beats theme). Other occurrences show dim/fallback values.",
    wrong: "Whole-bag replacement, bioc over native, theme over notion, ignoring the fallback chain, applying a record to another target, or a declaration-order winner." });
  const again = w.render(undefined, { envelope: E.main.value, layout: L.main.final, themeId: "dim", overrides: reversedBags.overrides, diStyles: reversedBags.diStyles, labelOf: w.labels.plain });
  if (jcs(again.result) !== jcs(R.precedence.result)) throw new Error("reversed multi-target bags must normalize identically");
  addCase({ caseId: "render-007-reordered-bags", group: "render", operation: "resolveTheme", profile: w.profileRef,
    inputs: [ref("envelope", E.main.ref), ref("layout", L.main.ref), inline("themeId", "dim"), ...bagsIn(reversedBags.overrides, reversedBags.diStyles)],
    expected: [ref("result", R.precedence.resultRef), inline("relations", { sameResultAs: "render-006-token-precedence", overridesDigest: R.precedence.render.binding.overridesDigest, diStylesDigest: R.precedence.render.binding.diStylesDigest })],
    status: "ok", comparators: RENDER_COMPARATORS, clause: [C("9.2", 692, 694)],
    derivation: "The render-006 records with every bag reversed (two targets each in semantic, occurrence, native and bioc) and every token list reversed normalize to the same Overrides/1 and DiStyles/1 (targets by UTF-16 key, tokens by name), hence the byte-identical Result/1 and digests.",
    wrong: "Hashing the caller order (different overridesDigest/diStylesDigest), sorting tokens but not records, or letting the last record win." });
  R.sparse = resolveCase({ caseId: "render-008-sparse-occurrence-override", env: E.main, layout: L.repeated, expect: "ok", name: "repeated-sparse",
    overrides: { semantic: [], occurrence: [{ pageId: "View_A", occurrenceKey: "d-Task_Check", tokens: [{ name: "stroke", value: "#ff0000" }] }] },
    clause: [C("9.3", 700), C("9.2", 692)],
    derivation: "A sparse occurrence override changes only stroke of the View_A occurrence of Task_Check; the View_Z occurrence and all other tokens are unchanged; the Overrides/1 record stays sparse (one token) in overridesDigest.",
    wrong: "Applying the occurrence override to every occurrence of the semantic ID, or materializing all resolved tokens into the override record before hashing." });
  R.semantic = resolveCase({ caseId: "render-009-semantic-override", env: E.main, layout: L.repeated, expect: "ok", name: "repeated-semantic",
    overrides: { semantic: [{ semanticId: "Task_Check", tokens: [{ name: "stroke", value: "#00aa00" }] }], occurrence: [] },
    clause: [C("9.3", 700), C("9.1", 673)],
    derivation: "A semantic-ID override reaches both repeated occurrences of Task_Check (View_Z and View_A) and nothing else.",
    wrong: "Applying a semantic override to the first occurrence only." });
  const conflictBindings = { ...LOT4_BINDINGS, plain: { ...LOT4_BINDINGS.plain,
    "rework-fill-a": { glyph: "task", tokens: [{ name: "fill", value: "#111111" }] }, "rework-fill-b": { glyph: "task", tokens: [{ name: "fill", value: "#222222" }] } } };
  resolveCase({ caseId: "render-010-style-conflict", p: w.variants.conflict.profile, pref: w.variants.conflict.ref, env: E["main@conflict"], layout: L.main, expect: "render-style-conflict",
    extra: { bindings: conflictBindings, facetsOf: { ...FACETS_OF, Task_Fix: [...FACETS_OF.Task_Fix, "rework-fill-a", "rework-fill-b"] } },
    clause: [C("9.3", 698)],
    derivation: "Two matched facets of Task_Fix contribute fill #111111 and #222222 at the same notion precedence; no declaration-order winner is allowed. Full refusal record.",
    wrong: "Taking the first or last facet in profile order." });
  // Token refusals are literal decisions (the assembler does not validate tokens).
  const tokenInvalid = (caseId, overrides, why, wrong = "Accepting CSS colour names, negative widths or non-finite values.") => addCase({ caseId, group: "render", operation: "resolveTheme", profile: w.profileRef,
    inputs: [ref("envelope", E.main.ref), ref("layout", L.main.ref), inline("themeId", "plain"), ...bagsIn(overrides, w.EMPTY_BAGS.diStyles)],
    expected: [{ role: "result", json: resultRefused("resolveTheme", "render-token-invalid", identity(E.main)) }], status: "refused:render-token-invalid", comparators: RENDER_COMPARATORS, clause: [C("9.3", 700), C("9.1", 673)], derivation: why, wrong });
  tokenInvalid("render-011-token-unknown", { semantic: [], occurrence: [{ pageId: "Page_Main", occurrenceKey: "Task_Check_di", tokens: [{ name: "glow", value: "#ffffff" }] }] },
    "glow has no pinned render-token signature; unknown tokens refuse.", "Ignoring unknown tokens or passing them to the renderer.");
  tokenInvalid("render-012-token-value", { semantic: [{ semanticId: "Task_Check", tokens: [{ name: "fill", value: "red" }] }], occurrence: [] },
    "fill must be #RRGGBB or #RRGGBBAA; a CSS colour name is not a registered value.");
  tokenInvalid("render-013-token-negative", { semantic: [{ semanticId: "Task_Check", tokens: [{ name: "strokeWidth", value: -1 }] }], occurrence: [] },
    "strokeWidth must be a nonnegative finite number; -1 violates the generic render-token/1 signature.");
  resolveCase({ caseId: "render-014-stale-choice-label", env: E.main, layout: L["main-stale-choice"], expect: "render-stale",
    clause: [C("9.2", 690), C("9.3", 698)],
    derivation: "The layout carries label text 'yes' for Flow_Yes but the choice binding evaluates case upper to 'YES'; R must equal both its layout geometry and its evaluated label, so the layout input is stale.",
    wrong: "Copying the layout label blindly (accepts 'yes') or silently replacing it without invalidating the layout digest." });
  resolveCase({ caseId: "render-015-missing-label", env: E.main, layout: L["main-missing-label"], expect: "render-stale",
    clause: [C("9.2", 690), C("9.1", 671)],
    derivation: "Task_Check evaluates to 'Check order' but its layout occurrence has no label.", wrong: "Rendering a label the layout never fitted." });
  resolveCase({ caseId: "render-016-extra-label", env: E.main, layout: L["main-extra-label"], expect: "render-stale",
    clause: [C("9.2", 690), C("9.3", 698)],
    derivation: "Assoc_Aid's binding label is the empty literal (no label) but the layout carries a label 'x'.", wrong: "Keeping a label that the profile does not produce." });
  R.note = resolveCase({ caseId: "render-017-unsupported-coverage", env: E.note, layout: L["main-note"], expect: "ok", name: "note-plain",
    clause: [C("9.1", 673), C("9.3", 704)],
    derivation: "Note_Plain (no '[Aid]' prefix) matches no notion, so no glyph is selected: no occurrence is emitted for it, its coverage disposition is unsupported and one render-unsupported diagnostic (stage render, ruleId adapter, exact source pointer, page/key) is reported in RenderData and in the Result report (harmonization B25, K10).",
    wrong: "Falling back to a default TextAnnotation glyph, silently dropping the element from coverage, or refusing the whole render." });
  resolveCase({ caseId: "render-018-unknown-theme", env: E.main, layout: L.main, themeId: "night", expect: "render-stale",
    clause: [C("9.2", 690)], derivation: "No theme or theme alias night exists; an unresolved input returns render-stale.", wrong: "Falling back to the first or root theme." });
  const alias = w.render(undefined, { envelope: E.main.value, layout: L.main.final, themeId: "default", labelOf: w.labels.plain });
  if (jcs(alias.result) !== jcs(R.main.result)) throw new Error("alias must resolve to plain");
  addCase({ caseId: "render-019-theme-alias", group: "render", operation: "resolveTheme", profile: w.profileRef,
    inputs: [ref("envelope", E.main.ref), ref("layout", L.main.ref), inline("themeId", "default"), ...bagsIn(w.EMPTY_BAGS.overrides, w.EMPTY_BAGS.diStyles)],
    expected: [ref("result", R.main.resultRef), inline("relations", { sameResultAs: "render-001-main-plain", bindingThemeId: "plain" })], status: "ok", comparators: RENDER_COMPARATORS,
    clause: [C("12", 837), C("9.2", 684)],
    derivation: "plain declares the theme alias default; the alias selects plain and the binding records the theme id plain, so the Result/1 is byte-identical to render-001 (harmonization K11).",
    wrong: "Refusing a declared theme alias, or recording the alias in binding.themeId (another themeDigest)." });
  resolveCase({ caseId: "render-020-geometry-theme-gated", env: E.main, layout: L.main, themeId: "wide-own", expect: "profile-open",
    clause: [C("9.4", 721), C("13", 928), C("16", 1150)],
    derivation: "wide-own declares geometry theme; the per-theme geometry policy is not approved (owner default: shared geometry), so resolveTheme refuses profile-open (harmonization H5).",
    wrong: "Rendering with per-theme geometry as if approved." });
  R.neutralSuccessor = resolveCase({ caseId: "render-021-neutral-successor", p: w.successors.neutral.profile, pref: w.successors.neutral.ref, env: E.neutralSuccessor, layout: L["neutral-successor"], expect: "ok", name: "neutral-successor-plain",
    labelOf: w.labels.neutralSuccessor, extra: { bindings: w.successorBindings, notionOf: w.NOTIONS.neutralSuccessor, facetsOf: {} },
    clause: [C("14.3", 961), C("9.1", 669, 673)],
    derivation: "R of the explicitly bound neutral successor on its resolved layout: Lane_content renders with the lane glyph and label content; Task_A has no label; Task_B is repeated on both pages; LaneSet_1 and Process_1 are nonvisual. Occurrence bounds copy the layout-008 records, so Task_A follows the PS-06 IO row (y 8) and the layout and payload digests follow.",
    wrong: "Reusing the lot-0 supplied render records, or treating the bound lane as unsupported.", decisions: ["PS-06"] });
  R.gridSuccessor = resolveCase({ caseId: "render-022-grid-successor", p: w.successors.grid.profile, pref: w.successors.grid.ref, env: E.gridSuccessor, layout: L["grid-successor"], expect: "ok", name: "grid-successor-plain",
    labelOf: w.labels.gridSuccessor, extra: { bindings: w.successorBindings, notionOf: w.NOTIONS.gridSuccessor, facetsOf: {} },
    clause: [C("14.3", 961), C("9.3", 713, 715), C("9.3", 702)],
    derivation: "R of the explicitly bound grid successor: the two side-stripe layout records are styled by their declaration (fill #eeeeff over plain, glyph aid = header-band, label Auxiliary); the aid label is the upper-cased stripped note text HELPER; associations are not laid out and stay nonvisual. Occurrence bounds copy the layout-009 records, so Task_A follows the PS-06 IO row (y 8) and the layout and payload digests follow.",
    wrong: "Dropping the stripe records, styling them as semantic occurrences, or recomputing their geometry in R.", decisions: ["PS-06"] });
  w.gridSuccessorRender = R.gridSuccessor;
  R.metricZ = resolveCase({ caseId: "render-023-metric-chain", env: E.main, layout: L.main, themeId: "metric-z", expect: "ok", name: "main-metric-z",
    clause: [C("9.2", 687), C("9.2", 694)],
    derivation: "metric-z uses metric resource z-metrics and falls back to plain (neutral-metrics): metricsDigest hashes both chain resources sorted by id (neutral-metrics, z-metrics) although the chain meets them in the reverse order; z-metrics differs from the neutral metrics by one byte, so its sha256 and the metricsDigest/viewRevision differ from render-001 while the occurrences are unchanged.",
    wrong: "Hashing only the selected theme's resource, keeping chain order, or reusing the neutral digest for the one-byte variant." });
  if (R.metricZ.render.binding.metricsDigest === R.main.render.binding.metricsDigest) throw new Error("metric chain must differ");
  R.variety = resolveCase({ caseId: "render-024-variety", env: E.variety, layout: L.variety, expect: "ok", name: "variety-plain",
    clause: [C("9.3", 698), C("9.1", 673)],
    derivation: "The terminate end, the service task and the call activity each select their own notion glyph (terminate-end with strokeWidth 3, service-task, call with strokeWidth 2); the called Process_Review, Task_Review and the TerminateEventDefinition are nonvisual coverage records.",
    wrong: "Rendering the terminate end with the ordinary end glyph, or rendering the called process." });

  // Synthetic records styled by R (layout-level geometry, harmonization K7/K8 and DESIGN L667).
  R.striped = resolveCase({ caseId: "synthetic-011-stripe-styled", group: "synthetic", env: E.main, layout: L["main-striped"], themeId: "plain-striped", expect: "ok", name: "main-striped",
    clause: [C("9.3", 715), C("9.1", 673)],
    derivation: "The layout stripe record becomes an occurrence with emittedType node, glyphId stripe, declaration tokens fill #dddddd over the theme chain, no label and no coverage entry; its '[' key sorts after the upper-case keys.",
    wrong: "Giving the stripe a semanticId or coverage entry, applying semantic/DI levels to it, or sorting it first." });
  R.badged = resolveCase({ caseId: "synthetic-012-badge-styled", group: "synthetic", env: E.main, layout: L["main-badged"], themeId: "badged", expect: "ok", name: "main-badged",
    clause: [C("9.3", 712), C("9.3", 715)],
    derivation: "The layout badge record becomes an occurrence with glyphId badge, fill #ccccff and its label tool; the aid itself keeps its aid notion and its region role aids.",
    wrong: "Dropping the badge, hiding the source association (hideSource false), or recomputing the badge from the viewBox in R." });
  resolveCase({ caseId: "synthetic-013-foreign-record", group: "synthetic", env: E.main, layout: L["main-striped"], themeId: "plain", expect: "render-stale",
    clause: [C("9.1", 673), C("9.2", 690)],
    derivation: "The supplied layout contains a stripe record that no declaration of the selected theme plain produces: an unresolved input, render-stale.",
    wrong: "Rendering an anonymous record or silently dropping it." });

  // ----------------------------------------------------------- decision labels
  R.choices = resolveCase({ caseId: "decision-001-question-and-choices", group: "decision-label", env: E.choices, layout: L["choices-upper"], expect: "ok", name: "choices-plain",
    clause: [C("14.3", 971), C("9.3", 698, 702)],
    derivation: "The gateway keeps its native question as its own label with fontWeight bold and textColor #000000; each named outgoing flow is a choice label, upper-cased with the pinned Unicode 15.0.0 full mappings: istanbul->ISTANBUL (no dotted I), U+0130 stays U+0130, sharp s and U+FB06 expand, final sigma U+03C2 and U+03CC map to U+03A3/U+038C, U+0264 has no 15.0.0 upper mapping, U+0149 expands to U+02BC N, U+01C5 maps to U+01C4. Choice style: fontWeight bold, textColor #1f4fbf, arrow filled. The unnamed flow keeps choice style but has no label. No TextAnnotation occurrence or coverage record is created.",
    wrong: "Host or locale toUpperCase (U+A7CB for U+0264 on Unicode 16 hosts, dotted I for istanbul), simple case mapping without expansions, inventing branch text for the unnamed flow, or adding a TextAnnotation for the question." });
  R.choicesLower = resolveCase({ caseId: "decision-002-lower-final-sigma", group: "decision-label", env: E.choices, layout: L["choices-lower"], themeId: "lowered", labelOf: w.labels.lowered, expect: "ok", name: "choices-lowered",
    clause: [C("9.3", 702), C("2.2", 116)],
    derivation: "Theme lowered binds the choice label with case lower: U+0130 lowers to i + U+0307; the final capital sigma of ΟΔΟΣ (cased before, none after) becomes U+03C2 while the isolated Σ becomes U+03C3; U+01C5 lowers to U+01C6.",
    wrong: "Lowering every sigma to U+03C3, dropping U+0307, or locale-specific dotless i." });
  resolveCase({ caseId: "decision-003-host-case-stale", group: "decision-label", env: E.choices, layout: L["choices-host-case"], expect: "render-stale",
    clause: [C("9.3", 702), C("9.2", 690)],
    derivation: "A layout fitted with a host Unicode-16 mapping (U+A7CB) does not match the pinned 15.0.0 evaluation (U+0264).",
    wrong: "An implementation using the host case tables accepts this layout (and refuses the correct one in decision-001)." });
  resolveCase({ caseId: "decision-004-locale-case-stale", group: "decision-label", env: E.choices, layout: L["choices-locale-case"], expect: "render-stale",
    clause: [C("9.3", 702), C("2.2", 116)],
    derivation: "A Turkish-locale upper case (U+0130 for i) is not the locale-free default mapping.",
    wrong: "Locale-dependent case conversion." });
  addCase({ caseId: "decision-005-case-operator", group: "decision-label", operation: "evaluateValue", profile: w.profileRef,
    inputs: [inline("values", CASE_VECTORS.map(v => ({ op: "case", value: { op: "literal", value: v.input }, mode: v.mode, unicode: "15.0.0" })))],
    expected: [{ role: "output", json: CASE_VECTORS.map(v => pureOk(v.output)) }], status: "ok", comparators: ["seam-exact/1"], clause: [C("2.2", 116), C("9.3", 702)],
    derivation: "One PureResult per case value expression with the pinned unicode-case/1 15.0.0 tables, full mappings and Final_Sigma context only for lower; vectors include U+0130 both ways, Final_Sigma, U+0264, expansions and a titlecase digraph.",
    wrong: "toUpperCase/toLowerCase of the host, simple mappings, or sigma without context." });

  // -------------------------------------------------------------- digests
  R.renamed = resolveCase({ caseId: "digest-001-page-rename", group: "digest", env: E.main, layout: L["main-renamed"], expect: "ok", name: "main-renamed",
    clause: [C("9.1", 667), C("9.2", 683, 690)],
    derivation: "Only the page display name changes (pageId unchanged; the new name keeps leading spaces, & < > \" ', a tab and a trailing space exactly): layoutDigest, payloadDigest (pages are payload) and viewRevision change; semanticRevision, themeDigest, bag and metrics digests equal render-001.",
    wrong: "Hashing pageId only, deriving the name from pageId, or trimming/normalizing the captured name." });
  R.moved = resolveCase({ caseId: "digest-002-label-move", group: "digest", env: E.main, layout: L["main-label-moved"], expect: "ok", name: "main-label-moved",
    clause: [C("9.2", 683, 690)],
    derivation: "A DI-only label move of Gateway_Ok changes layoutDigest, the occurrence payload and viewRevision only; semanticRevision is unchanged.",
    wrong: "Changing semanticRevision for a presentation-only move, or not invalidating payloadDigest." });
  digestSeamCases(ctx, w, R);
  return R;
}

// renderDigests seam (A4; py render_digests record) and verifyRenderData (K11, K14).
function digestSeamCases(ctx, w, R) {
  const { addCase, inline } = ctx;
  const neutralText = w.metricsBytes.toString("utf8"), zText = w.zBytes.toString("utf8");
  const plainTheme = { id: "plain", aliases: [], tokens: [{ name: "fill", value: "#ffffff" }], glyphs: [], metricsResource: "neutral-metrics", geometry: "shared", syntheticOccurrences: [] };
  const pins = { a: { id: "a-descriptors/1", version: "1", sha256: H("a-pin") }, z: { id: "z-descriptors/1", version: "1", sha256: H("z-pin") } };
  const pageRecord = { pageId: "Z-page", name: "First sheet", order: 0, semanticRootId: "Process_D", bounds: { x: 0, y: 0, width: 1000, height: 800 } };
  const baseRecord = {
    semanticTree: { $type: "bpmn:Definitions", id: "Definitions_D", rootElements: [{ $type: "bpmn:Process", id: "Process_D", name: "Digest" }] },
    profileIdentity: w.envs.main.value.profileIdentity, bindings: [],
    descriptorPins: [pins.a, pins.z], layout: { layoutVersion: "1", pages: [pageRecord], geometry: [] }, themeId: "plain", themes: [plainTheme],
    overrides: { semantic: [], occurrence: [] }, diStyles: { native: [], bioc: [] }, metrics: [{ id: "neutral-metrics", utf8: neutralText }],
    payload: { pages: [pageRecord], occurrences: [], coverage: [], diagnostics: [] },
  };
  const out = {};
  const digestCase = (caseId, record, relations, clause, derivation, wrong) => {
    out[caseId] = renderDigests(record);
    const recordRef = ctx.artifact(`${caseId}.record.json`, record);
    addCase({ caseId, group: "digest", operation: "renderDigests", inputs: [ctx.ref("record", recordRef)],
      expected: [{ role: "result", json: pureOk(out[caseId]) }, ...(relations ? [inline("relations", relations)] : [])], status: "ok", comparators: ["result-exact/1"], clause, derivation, wrong });
  };
  const fields = Object.keys(renderDigests(baseRecord));
  const rel = (caseId, other, differ) => ({ sameAs: { case: other, fields: fields.filter(f => !differ.includes(f)) }, differsFrom: { case: other, fields: differ } });
  digestCase("digest-003-baseline", baseRecord, undefined, [C("9.2", 679, 690)],
    "Explicit-record vector: semanticRevision = H({tree, profileIdentity, bindings}), descriptorDigest over pins sorted by id, layoutDigest, themeDigest over the one-theme chain, the empty override/style bags hash their empty records, metricsDigest over [{id, sha256 = B(raw bytes)}], viewRevision over the seven view fields, payloadDigest over the supplied payload.",
    "Omitting empty bags from the hash, hashing the metric text instead of its raw bytes, or including payloadDigest in viewRevision.");
  digestCase("digest-004-descriptor-pins-reversed", { ...baseRecord, descriptorPins: [pins.z, pins.a] }, rel("digest-004", "digest-003-baseline", []), [C("9.2", 682), C("9.2", 694)],
    "The two descriptor pins arrive in reverse id order; descriptorDigest sorts pins by unique id before hashing, so every output equals digest-003.",
    "Hashing the caller pin order or the profileIdentity order.");
  digestCase("digest-005-metric-resources-reversed", { ...baseRecord, metrics: [{ id: "z-metrics", utf8: zText }, { id: "neutral-metrics", utf8: neutralText }] },
    rel("digest-005", "digest-003-baseline", ["metricsDigest", "viewRevision"]), [C("9.2", 687), C("9.2", 694)],
    "Two metric resources supplied in reverse id order: metricsDigest = H([{neutral-metrics, B(neutral bytes)}, {z-metrics, B(z bytes)}]) sorted by id; viewRevision changes with it, every other output equals digest-003.",
    "Hashing the supplied order, or deduplicating resources by content.");
  digestCase("digest-006-metric-byte-changed", { ...baseRecord, metrics: [{ id: "neutral-metrics", utf8: zText }] },
    rel("digest-006", "digest-003-baseline", ["metricsDigest", "viewRevision"]), [C("9.2", 687), C("9.2", 694)],
    "The neutral metric bytes with one changed byte (spaceAdvance 300 -> 301) under the same resource id: B(raw bytes) changes, hence metricsDigest and viewRevision; every other output equals digest-003.",
    "Keying the metric digest on the resource id only, or normalizing the metric JSON before hashing.");
  const sortedBags = {
    overrides: { semantic: [{ semanticId: "Process_D", tokens: [{ name: "fill", value: "#eeeeee" }, { name: "stroke", value: "#111111" }] }, { semanticId: "Task_D", tokens: [{ name: "fill", value: "#dddddd" }] }],
      occurrence: [{ pageId: "A-page", occurrenceKey: "k-1", tokens: [{ name: "strokeWidth", value: 2 }] }, { pageId: "Z-page", occurrenceKey: "k-1", tokens: [{ name: "dash", value: "dashed" }] }] },
    diStyles: { native: [{ pageId: "Z-page", occurrenceKey: "a", tokens: [{ name: "fill", value: "#123456" }] }, { pageId: "Z-page", occurrenceKey: "b", tokens: [{ name: "stroke", value: "#654321" }] }],
      bioc: [{ pageId: "A-page", occurrenceKey: "z", tokens: [{ name: "fill", value: "#abcdef" }, { name: "textColor", value: "#000000" }] }, { pageId: "Z-page", occurrenceKey: "a", tokens: [{ name: "stroke", value: "#fedcba" }] }] },
  };
  const rev = bag => Object.fromEntries(Object.entries(bag).map(([k, list]) => [k, [...list].reverse().map(r => ({ ...r, tokens: [...r.tokens].reverse() }))]));
  digestCase("digest-007-bags-sorted", { ...baseRecord, ...sortedBags }, rel("digest-007", "digest-003-baseline", ["overridesDigest", "diStylesDigest", "viewRevision"]), [C("9.2", 685, 686), C("9.2", 692, 694)],
    "Two-target semantic, occurrence, native and bioc bags in normalized order: overridesDigest and diStylesDigest hash the records as supplied (sorted), viewRevision changes, semanticRevision does not (a view override is not semantic).",
    "Changing semanticRevision for a view override, or expanding sparse records before hashing.");
  digestCase("digest-008-bags-reversed", { ...baseRecord, overrides: rev(sortedBags.overrides), diStyles: rev(sortedBags.diStyles) }, rel("digest-008", "digest-007-bags-sorted", []), [C("9.2", 692, 694)],
    "The digest-007 bags with every record list and token list reversed normalize (records by semanticId or pageId then occurrenceKey, tokens by name, UTF-16) to the same records: every output equals digest-007.",
    "Hashing caller order, or sorting occurrence records by occurrenceKey before pageId.");
  for (const [a, b, differ] of [["digest-004-descriptor-pins-reversed", "digest-003-baseline", []], ["digest-005-metric-resources-reversed", "digest-003-baseline", ["metricsDigest", "viewRevision"]],
    ["digest-006-metric-byte-changed", "digest-003-baseline", ["metricsDigest", "viewRevision"]], ["digest-007-bags-sorted", "digest-003-baseline", ["overridesDigest", "diStylesDigest", "viewRevision"]],
    ["digest-008-bags-reversed", "digest-007-bags-sorted", []]]) for (const f of fields) if ((out[a][f] === out[b][f]) === differ.includes(f)) throw new Error(`${a} vs ${b}: ${f}`);
  if (out["digest-005-metric-resources-reversed"].metricsDigest === out["digest-006-metric-byte-changed"].metricsDigest) throw new Error("metric vectors must differ");

  // verifyRenderData (py verify_render_data; harmonization K11 alias freshness, K14 occurrence equality).
  const verify = (caseId, { render, themeId, overrides = w.EMPTY_BAGS.overrides, expect, clause, derivation, wrong }) => {
    const r = render.render;
    const resolved = resolveThemeId(w.profile.themes, themeId);
    const problems = staleChecks({ profile: w.profile, envelope: w.envs.main.value, layout: w.layouts.main.final, render: r, metricBytes: w.metricBytes });
    if (resolved !== r.binding.themeId) problems.push("themeId");
    if (H(overrides) !== r.binding.overridesDigest) problems.push("overridesDigest");
    const status = problems.length ? "render-stale" : "ok";
    if (status !== expect) throw new Error(`${caseId}: ${problems.join(",")}`);
    const renderRef = render.ref ?? ctx.artifact(`${caseId}.render.json`, r);
    addCase({ caseId, group: "freshness", operation: "verifyRenderData", profile: w.profileRef,
      inputs: [ctx.ref("envelope", w.envs.main.ref), ctx.ref("layout", w.layouts.main.ref), ctx.ref("render", renderRef), inline("themeId", themeId), inline("overrides", overrides), inline("diStyles", w.EMPTY_BAGS.diStyles)],
      expected: [{ role: "result", json: status === "ok" ? pureOk({ viewRevision: render.viewRevision }) : pureRefused("render-stale") }], status: status === "ok" ? "ok" : "refused:render-stale",
      comparators: ["result-exact/1", "source-immutability/1"], clause, derivation, wrong });
  };
  verify("verify-001-alias-fresh", { render: R.main, themeId: "default", expect: "ok", clause: [C("9.2", 690), C("12", 837)],
    derivation: "R was resolved for plain; the verification names the declared alias default of the same theme: every recomputed binding field matches, so it returns the viewRevision of render-001 (harmonization K11).",
    wrong: "Refusing the alias as an unknown theme, or recomputing themeDigest for the alias name." });
  verify("verify-002-override-added", { render: R.main, themeId: "plain", overrides: { semantic: [{ semanticId: "Task_Check", tokens: [{ name: "stroke", value: "#00aa00" }] }], occurrence: [] }, expect: "render-stale",
    clause: [C("9.2", 690)], derivation: "An override added after R makes overridesDigest stale.", wrong: "Ignoring the override bags in freshness." });
  const moved = clone(R.main.render);
  moved.occurrences.find(o => o.occurrenceKey === "Task_Ship_di").bounds.x += 1000;
  moved.binding.payloadDigest = H({ pages: moved.pages, occurrences: moved.occurrences, coverage: moved.coverage, diagnostics: moved.diagnostics });
  verify("verify-003-occurrence-moved", { render: { render: moved, viewRevision: R.main.viewRevision }, themeId: "plain", expect: "render-stale",
    clause: [C("9.2", 690)],
    derivation: "An occurrence of R is moved and payloadDigest recomputed so that every digest still matches; the occurrence no longer equals its Layout/1 record (harmonization K14), so R is stale.",
    wrong: "Checking digests only (accepts the self-consistent tampered R)." });
}

// Unicode 15.0.0 vectors for the case operator (input, mode, output) — literal.
export const CASE_VECTORS = [
  { input: "istanbul", mode: "upper", output: "ISTANBUL" },
  { input: "İzmir", mode: "upper", output: "İZMIR" },
  { input: "İzmir", mode: "lower", output: "i̇zmir" },
  { input: "ΟΔΟΣ Σ", mode: "lower", output: "οδος σ" },
  { input: "ΟΣΑ", mode: "lower", output: "οσα" },
  { input: "σοφός", mode: "upper", output: "ΣΟΦΌΣ" },
  { input: "ɤ-shape", mode: "upper", output: "ɤ-SHAPE" },
  { input: "straße ﬆop", mode: "upper", output: "STRASSE STOP" },
  { input: "ŉ ǅ", mode: "upper", output: "ʼN Ǆ" },
  { input: "ŉ ǅ", mode: "lower", output: "ŉ ǆ" },
];

export function themeCases(ctx, w, R) {
  const { addCase, inline, ref } = ctx;
  const identity = env => ({ profileIdentity: env.value.profileIdentity, baseRevision: env.value.semanticRevision });
  // ------------------------------------------------------------ legacy looks
  const look = (caseId, profileRef, lookName, expect, why, wrong) => addCase({
    caseId, group: "legacy-theme", operation: "resolveLegacyTheme", profile: profileRef, inputs: [inline("look", lookName)],
    expected: [{ role: "result", json: expect.startsWith("refused:") ? pureRefused(expect.slice(8)) : pureOk({ themeId: expect }) }],
    status: expect.startsWith("refused:") ? expect : "ok", comparators: ["result-exact/1"], clause: expect.startsWith("refused:") ? [C("9.5", 729), C("9.2", 690)] : [C("9.5", 729)], derivation: why, wrong,
  });
  look("legacy-001-standard", w.profileRef, "standard", "legacy-standard", "The injected compatibility alias kind theme maps standard to the injected standard theme.", "A hard-coded built-in standard look.");
  look("legacy-002-legend", w.profileRef, "legend", "legacy-custom", "legend maps to the injected custom theme.", "Reusing the standard theme or a library default custom look.");
  look("legacy-003-colored", w.profileRef, "colored", "legacy-colored", "colored maps to its declared theme; the sparse DI colours stay caller-supplied DiStyles (legacy-007).", "Hard-coding DI colour application inside the library.");
  look("legacy-004-no-alias-data", w.lot0.neutral.ref, "standard", "refused:render-stale", "The lot-0 neutral profile injects no compatibility aliases; reproducing old behaviour requires caller-supplied data; the unresolved look refuses render-stale (harmonization C17).", "A hidden client default for standard, or legacy-unmapped (reserved for legacy diagnostic codes).");
  look("legacy-005-exact-name", w.profileRef, "Standard", "refused:render-stale", "Alias names match exactly; no case folding.", "Case-insensitive alias matching.");
  addCase({ caseId: "legacy-006-alias-not-theme", group: "legacy-theme", operation: "resolveTheme", profile: w.profileRef,
    inputs: [ref("envelope", w.envs.main.ref), ref("layout", w.layouts.main.ref), inline("themeId", "standard"), inline("overrides", w.EMPTY_BAGS.overrides), inline("diStyles", w.EMPTY_BAGS.diStyles)],
    expected: [{ role: "result", json: resultRefused("resolveTheme", "render-stale", identity(w.envs.main)) }], status: "refused:render-stale", comparators: RENDER_COMPARATORS, clause: [C("9.5", 729), C("9.2", 690)],
    derivation: "Generic code uses opaque theme IDs: standard is neither a theme id nor a declared theme alias, and resolveTheme does not consult compatibilityAliases.", wrong: "Resolving legacy look names inside the generic resolver." });
  const coloredStyles = {
    native: [{ pageId: "Page_Main", occurrenceKey: "Task_Ship_di", tokens: [{ name: "fill", value: "#ffe0e0" }] }],
    bioc: [{ pageId: "Page_Main", occurrenceKey: "Task_Fix_di", tokens: [{ name: "stroke", value: "#0000aa" }] }],
  };
  const colored = w.render("main-legacy-colored", { envelope: w.envs.main.value, layout: w.layouts.main.final, themeId: "legacy-colored", diStyles: coloredStyles, labelOf: w.labels.plain });
  addCase({ caseId: "legacy-007-colored-sparse-di", group: "legacy-theme", operation: "resolveTheme", profile: w.profileRef,
    inputs: [ref("envelope", w.envs.main.ref), ref("layout", w.layouts.main.ref), inline("themeId", "legacy-colored"), inline("overrides", w.EMPTY_BAGS.overrides), inline("diStyles", coloredStyles)],
    expected: [ref("result", colored.resultRef)], status: "ok", comparators: RENDER_COMPARATORS, clause: [C("9.5", 729), C("9.3", 700)],
    derivation: "Sparse imported colours apply only to their two occurrences: the native fill #ffe0e0 on Task_Ship_di beats the task notion fill, and the bioc stroke #0000aa on Task_Fix_di beats the facet stroke #aa0000 (the notion level is below bioc); legacy-colored inherits the legacy-standard stroke #333333 elsewhere.",
    wrong: "Applying imported colours to every element or letting notion/facet tokens beat DI tokens." });
  const custom = w.render("main-legacy-custom", { envelope: w.envs.main.value, layout: w.layouts.main.final, themeId: "legacy-custom", labelOf: w.labels.plain });
  const strip = r => r.payload.occurrences.map(({ style, ...rest }) => rest);
  if (jcs(strip(custom.result)) !== jcs(strip(R.main.result)) || jcs(custom.render.coverage) !== jcs(R.main.render.coverage)) throw new Error("look must not change recognition");
  addCase({ caseId: "legacy-008-look-independent-recognition", group: "legacy-theme", operation: "resolveTheme", profile: w.profileRef,
    inputs: [ref("envelope", w.envs.main.ref), ref("layout", w.layouts.main.ref), inline("themeId", "legacy-custom"), inline("overrides", w.EMPTY_BAGS.overrides), inline("diStyles", w.EMPTY_BAGS.diStyles)],
    expected: [ref("result", custom.resultRef)], status: "ok", comparators: RENDER_COMPARATORS, clause: [C("9.5", 729), C("9.3", 698)],
    derivation: "Switching to the injected custom look changes only style values; occurrences, glyph IDs, labels and coverage (including the aid marker notion) are identical to render-001.",
    wrong: "Classifying the '[Aid]' marker from the selected look (legacy legend behaviour)." });

  // ------------------------------------------------------------ theme history
  const step = (envelope, layout, themeId, overrides = w.EMPTY_BAGS.overrides) => {
    const out = w.render(undefined, { envelope, layout, themeId, overrides, labelOf: w.labels.plain });
    const b = out.render.binding;
    return { themeId, semanticRevision: b.semanticRevision, layoutDigest: b.layoutDigest, themeDigest: b.themeDigest, overridesDigest: b.overridesDigest, payloadDigest: b.payloadDigest, viewRevision: out.viewRevision };
  };
  const seq = [step(w.envs.main.value, w.layouts.main.final, "plain"), step(w.envs.main.value, w.layouts.main.final, "dim"), step(w.envs.main.value, w.layouts.main.final, "plain")];
  addCase({ caseId: "history-001-theme-round-trip", group: "theme-history", operation: "theme-sequence", profile: w.profileRef,
    inputs: [ref("envelope", w.envs.main.ref), ref("layout", w.layouts.main.ref), inline("steps", [{ themeId: "plain" }, { themeId: "dim" }, { themeId: "plain" }])],
    expected: [{ role: "output", json: seq }, { role: "invariants", json: { semanticRevisionConstant: true, layoutDigestConstant: true, firstEqualsLast: true } }], status: "ok",
    comparators: ["seam-exact/1"], clause: [C("8.2", 643), C("9.2", 694)],
    derivation: "A theme selection changes themeDigest, payloadDigest and viewRevision only; plain -> dim -> plain returns exactly the first view (no state carried from dim); semantic history and IDs are untouched because profileIdentity and the tree are unchanged.",
    wrong: "Replaying history or N on a theme switch, carrying dim tokens into the second plain view, or changing semanticRevision." });
  const ov = { semantic: [], occurrence: [{ pageId: "View_A", occurrenceKey: "d-Task_Check", tokens: [{ name: "stroke", value: "#ff0000" }] }] };
  const seq2 = [step(w.envs.main.value, w.layouts.repeated.final, "plain"), step(w.envs.main.value, w.layouts.repeated.final, "plain", ov), step(w.envs.main.value, w.layouts.repeated.final, "plain")];
  addCase({ caseId: "history-002-override-round-trip", group: "theme-history", operation: "theme-sequence", profile: w.profileRef,
    inputs: [ref("envelope", w.envs.main.ref), ref("layout", w.layouts.repeated.ref), inline("steps", [{ themeId: "plain" }, { themeId: "plain", overrides: ov }, { themeId: "plain" }])],
    expected: [{ role: "output", json: seq2 }, { role: "invariants", json: { semanticRevisionConstant: true, layoutDigestConstant: true, firstEqualsLast: true } }], status: "ok",
    comparators: ["seam-exact/1"], clause: [C("9.2", 694), C("8.2", 643)],
    derivation: "Adding then removing a view override changes overridesDigest/payloadDigest/viewRevision and restores them exactly; semanticRevision never changes.",
    wrong: "Persisting override state in the semantic tree or leaving a residue after removal." });
  // checkThemeSwitch (A4; harmonization K12 token set, K13 pair scope, H5 gate).
  const GEOMETRY = ["region.external-lane.headerWidth", "region.external-lane.padding", "region.external-lane.gap", "region.external-lane.minHeight",
    "region.reference-band.headerWidth", "region.reference-band.padding", "region.reference-band.gap", "region.reference-band.minHeight", "fontFamily", "fontSize", "fontWeight"];
  const resolvedGeometry = themeId => {
    const chain = themeChain(w.profile.themes, themeId);
    const token = name => { for (const th of chain) { const t = th.tokens.find(x => x.name === name); if (t) return t.value; } return undefined; };
    return { ...Object.fromEntries(GEOMETRY.map(n => [n, token(n)])), metricsResource: chain[0].metricsResource };
  };
  if (Object.keys(REGION).length !== 2) throw new Error("geometry token set");
  const sw = (caseId, from, to, expect, why, wrong, clause = [C("9.4", 721), C("16", 1150)]) => {
    const toTheme = themeChain(w.profile.themes, to)[0];
    const derived = toTheme.geometry === "theme" || themeChain(w.profile.themes, from)[0].geometry === "theme" ? "refused:profile-open"
      : jcs(resolvedGeometry(from)) === jcs(resolvedGeometry(to)) ? "ok" : "refused:theme-geometry-conflict";
    if (derived !== expect) throw new Error(`${caseId}: ${derived}`);
    addCase({ caseId, group: "theme-history", operation: "checkThemeSwitch", profile: w.profileRef, inputs: [inline("from", from), inline("to", to)],
      expected: [{ role: "result", json: expect === "ok" ? pureOk({ relayoutRequired: false }) : pureRefused(expect.slice(8)) }], status: expect,
      comparators: ["result-exact/1"], clause, derivation: why, wrong });
  };
  sw("switch-001-paint-only", "plain", "dim", "ok", "dim inherits every region, text-fit and metric value from plain; only paint differs, so the shared geometry is reused.", "Forcing a relayout or refusing paint-only switches.");
  sw("switch-002-region-token", "plain", "wide", "refused:theme-geometry-conflict", "wide changes region.external-lane.padding under geometry shared.", "Reusing the plain geometry with another padding.");
  sw("switch-003-text-fit-token", "plain", "bold", "refused:theme-geometry-conflict", "fontWeight feeds label fitting (harmonization K12 token set); bold under geometry shared conflicts.", "Comparing region tokens only.");
  sw("switch-004-own-geometry", "plain", "wide-own", "refused:profile-open", "wide-own declares geometry theme; per-theme geometry is not approved (OPEN-DI/OPEN-LOOK owner default shared geometry), so the switch refuses profile-open (harmonization H5).", "Allowing the geometry:theme policy without approval, or reporting theme-geometry-conflict.",
    [C("9.4", 721), C("13", 928), C("16", 1150)]);
  sw("switch-005-missing-token", "plain", "bare", "refused:theme-geometry-conflict", "bare (a separate root) has no region.reference-band.* tokens; a missing value differs from a present one.", "Treating missing tokens as equal to the other theme's values.");
  sw("switch-006-legacy-chain", "plain", "legacy-colored", "ok", "legacy-colored -> legacy-standard -> plain changes paint (stroke) only.", "Resolving geometry tokens without the fallback chain.");
  sw("switch-007-metrics-resource", "plain", "metric-z", "refused:theme-geometry-conflict", "metric-z selects another metric resource; metricsResource is geometry-affecting (label fitting, harmonization K12), so the shared-geometry switch conflicts.", "Comparing tokens only and ignoring the metric resource.",
    [C("9.4", 721), C("9.3", 702)]);
}
export { assembleRender };
