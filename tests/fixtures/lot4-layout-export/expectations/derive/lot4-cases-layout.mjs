// Cases: tick rounding, region geometry (9.4), layout primitive results,
// layout-level synthetic occurrences, glyph templates (9.3), compile admission.
import { ticksFromPoints } from "./lot4-core.mjs";
import { regionRow, center, templateGeometry } from "./lot4-geometry.mjs";
import { REGION, badgeGlyph, TEMPLATE_GLYPHS } from "./lot4-world.mjs";
import { pureOk, pureRefused } from "./lot4-results.mjs";

const C = (section, a, z = a) => ({ section, lines: [a, z] });
const ROUTE_REASON = "Harmonization K5 (erratum E-11): DESIGN 9.4 L723 routes links after expansion but fixes no routing rule; the route members are checked by layout-route/1 invariants.";

export function layoutCases(ctx, w) {
  const { addCase, inline, ref } = ctx;
  // ------------------------------------------------------------- ticks
  // Helpers return PureResult (BLOCKB-PARITY-SYNC PS-33, DESIGN 10.1 L737).
  const tick = (caseId, values, derivation, wrong) => addCase({
    caseId, group: "ticks", operation: "layoutTicks", inputs: [inline("points", values)],
    expected: [{ role: "result", json: pureOk(values.map(ticksFromPoints)) }], status: "ok", comparators: ["result-exact/1"],
    clause: [C("3.1", 270)], derivation, wrong, decisions: ["PS-33"],
  });
  tick("ticks-001-half-even", [0.0005, 0.0015, 0.0025, 0.0035, -0.0005, -0.0015, -0.0025],
    "One tick is 0.001 pt; each value times 1000 is an exact half, rounded once to the even neighbour; -0.5 rounds to -0, emitted as 0.",
    "Math.round (half up) yields [1,2,3,4,0,-1,-2]; half-away-from-zero yields [1,2,3,4,-1,-2,-3].");
  tick("ticks-002-rational-not-binary", [2.0005, 2.0035, 4.0055, 8.0095],
    "Each binary64 input is read as the exact rational of its shortest decimal spelling, then multiplied by 1000: 2000.5, 2003.5, 4005.5 and 8009.5 round to the even 2000, 2004, 4006 and 8010. The binary64 products are 2000.5000000000002, 2003.4999999999998, 4005.4999999999995 and 8009.499999999999.",
    "Rounding the binary64 product (even or half up) gives 2001, 2003, 4005 and 8009.");
  tick("ticks-003-negative-zero-and-tiny", [-0, 0, -0.0004, 1e-7, 2.5e-3],
    "Negative zero becomes zero; -0.4 ticks rounds to -0 then 0; exponent spellings are exact rationals (1e-7 -> 0.0001 ticks -> 0; 2.5e-3 -> 2.5 -> 2).",
    "Emitting -0 (Python -0.0 or a float) instead of integer 0, or half-up rounding of 2.5 to 3.");
  tick("ticks-004-large-and-integral", [152.5, 1000, 123456.789, 123456789012.345, -1234.5675, 98765.4325],
    "Integral and fractional pt values convert exactly (123456789012.345 pt -> 123456789012345 ticks); -1234567.5 rounds to the even -1234568 and 98765432.5 to the even 98765432.",
    "Half-up rounding gives -1234567 and 98765433.");

  // --------------------------------------------------------- region rows
  const T = REGION["external-lane"], BT = REGION["reference-band"];
  const region = (caseId, input, derivation, wrong, clause = [C("9.4", 721, 723)], decisions = ["PS-33"]) => {
    const seam = { ...input, items: input.items.map(it => { const { anchor, ...rest } = it; return anchor ? { ...rest, anchor } : rest; }) };
    const out = regionRow({ page: input.page, body: input.body, tokens: input.tokens, items: input.items.map(it => ({ ...it, anchorCenterX: it.anchor ? center(it.anchor) : undefined })) });
    return addCase({ caseId, group: "region", operation: "layoutRegions", inputs: [inline("region-input", seam)],
      expected: [{ role: "result", json: pureOk(out) }], status: "ok", comparators: ["result-exact/1"], clause, derivation, wrong, decisions });
  };
  const page = { x: 0, y: 0, width: 1200000, height: 640000 };
  const lane = { x: 30000, y: 0, width: 1070000, height: 150000 };
  const io = (elementId, anchor, label = { width: 30000, height: 14000 }, object = { width: 36000, height: 50000 }) => ({ elementId, occurrenceKey: `${elementId}_di`, object, ...(label ? { label } : {}), ...(anchor ? { anchor } : {}) });
  const task = x => ({ x, y: 260000, width: 100000, height: 80000 });
  region("region-001-single-anchored", { page, body: lane, tokens: T, items: [io("Input_Order", task(180000))] },
    "Content box excludes headerWidth+padding on the left (x>=70000). The IO centre takes the anchor activity centre 230000: left 212000. Row height max(60000, 50000+14000+2*10000)=84000 at the top of the lane body; the object centre line is cy = max(25000, (84000+25000-39000)/2) = 35000 (one IO row, BLOCKB-PARITY-SYNC PS-06): y=10000, label directly below at 60000.",
    "Centring on the lane, ignoring headerWidth, placing the label beside the object, or centring the row on the lane centre (y 43000).");
  region("region-002-wider-label", { page, body: lane, tokens: T, items: [io("Input_Order", task(180000)), io("Output_Receipt", task(440000), { width: 42000, height: 14000 })] },
    "The second item's 42000-wide label is wider than its 36000 object: the item extent is 42000, centred at 490000 (left 469000); the object is centred inside the extent (x=472000) and the label starts at 469000.",
    "Using the object width only for extent/collision (left 472000 for the label) or left-aligning the object.");
  region("region-003-collision-shift", { page, body: lane, tokens: T, items: [io("Input_A", task(180000)), io("Input_B", task(180000)), io("Input_C", task(185000))] },
    "All three anchors want centre 230000/235000. Items follow placement order; each later item colliding with previous right + gap is shifted right to exactly previous right + gap: lefts 212000, 268000, 324000.",
    "Overlapping items, shifting the earlier item left, or using zero spacing instead of the gap token.");
  region("region-004-no-anchor-sequence", { page, body: lane, tokens: T, items: [io("Input_A"), io("Input_B"), io("Input_C")] },
    "Without anchors the first item starts at the content left edge 70000 and each next item follows the previous by gap: 70000, 126000, 182000.",
    "Starting at the lane x (30000) or the header edge (60000), or spreading items evenly.");
  region("region-005-mixed-anchor", { page, body: lane, tokens: T, items: [io("Input_A"), io("Input_B", { x: 40000, y: 260000, width: 100000, height: 80000 }), io("Input_C")] },
    "Item A starts at 70000; item B's anchor centre 90000 gives left 72000, below previous right+gap 126000, so it shifts to 126000; item C follows by gap at 182000.",
    "Honouring the anchor centre despite a collision (72000) or clamping only to the content edge.");
  region("region-006-clamp-left", { page, body: lane, tokens: T, items: [io("Input_A", { x: 0, y: 260000, width: 100000, height: 80000 })] },
    "Anchor centre 50000 would give left 32000, which is clamped to the content left edge 70000.",
    "Drawing the item over the lane header (left 32000).");
  region("region-007-grow-lane-width", { page, body: lane, tokens: T, items: [io("Input_A", { x: 1030000, y: 260000, width: 100000, height: 80000 })] },
    "Anchor centre 1080000 gives right edge 1098000 beyond the content right edge 1090000; the lane body width grows by 8000 to 1078000 and the page (right edge 1200000) is unchanged.",
    "Clamping the item inside the lane (shifting it left) instead of growing the lane body.");
  region("region-008-grow-page", { page: { x: 0, y: 0, width: 1100000, height: 640000 }, body: lane, tokens: T, items: [io("Input_A", { x: 1100000, y: 260000, width: 100000, height: 80000 })] },
    "Right edge 1168000 exceeds the content edge 1090000: the lane grows by 78000 to 1148000 (right edge 1178000), which exceeds the page right edge 1100000, so the page width grows to 1178000 (minimal containment).",
    "Growing the lane but not the page, or clipping the item.");
  region("region-009-grow-lane-height", { page, body: { x: 30000, y: 0, width: 1070000, height: 70000 }, tokens: T, items: [io("Input_A", task(180000))] },
    "Row height 84000 exceeds the 70000 body; the body is expanded to 84000 rather than drawing above or below it.",
    "Keeping the 70000 body and letting the label fall outside it.");
  region("region-010-mixed-heights", { page, body: lane, tokens: T, items: [io("Input_A", task(180000)), io("Input_B", task(440000), { width: 30000, height: 28000 })] },
    "Two label heights (14000 and a two-line 28000) give blocks 64000 and 78000; row height max(60000, 78000+2*10000)=98000 at the top of the body; A = max(object.h/2) = 25000 and B = max(object.h/2+label.h) = 53000, so every object centre lies on cy = max(25000, (98000+25000-53000)/2) = 35000 (DESIGN 9.4 L723 'Align centers on one IO row', BLOCKB-PARITY-SYNC PS-06): both objects at y 10000, labels directly below at 60000; the body keeps its 150000 height.",
    "Centring each object+label block on its own (Input_A at y 17000, label 67000: the superseded harmonization K2 reading), or a row height without the label heights (70000).",
    undefined, ["PS-06", "PS-33"]);
  region("region-011-single-rounding", { page, body: { x: 0, y: 0, width: 4000, height: 70000 }, tokens: { headerWidth: 0, padding: 0, gap: 0, minHeight: 0 },
    items: [io("Input_A", { x: 1000, y: 1000, width: 1003, height: 10 }, { width: 0, height: 0 }, { width: 301, height: 64000 }), io("Input_B", undefined, { width: 0, height: 0 }, { width: 10, height: 64001 })] },
    "Anchor centre 1501.5 and extent 301 give left exactly 1351 (one final rounding). Rounding the centre first (1502) would give 1351.5 -> 1352. Row height 64001; A = B = 32000.5, so the object centre line is cy = 32000.5 (BLOCKB-PARITY-SYNC PS-06): item A top 0.5 rounds to even 0 and its label top 64000.5 to 64000, item B top 0; item B starts at 1652.",
    "Rounding intermediate centres or halves (left 1352) or rounding 0.5 up to 1.");
  region("region-012-band-row", { page, body: { x: 0, y: 470000, width: 1100000, height: 120000 }, tokens: BT,
    items: [io("StoreRef_Policy", task(180000), { width: 70000, height: 14000 }, { width: 50000, height: 50000 })] },
    "A reference band uses its bound participant rectangle with the same header/padding rule: content left 40000; centre 230000, extent 70000 (label) gives left 195000, object x 205000; row top 470000, block top 480000, label y 530000.",
    "Placing references in the band without the header/padding rule, or by lane rules of another region key.",
    [C("9.4", 721, 725)]);
  region("region-013-empty-region", { page, body: lane, tokens: T, items: [] },
    "An empty item list needs no IO row: the body and page stay unchanged even though minHeight would exceed nothing.",
    "Applying minHeight or padding growth to a region with no items.", [C("9.4", 723, 725)]);
  region("region-014-zero-tokens", { page, body: lane, tokens: { headerWidth: 0, padding: 0, gap: 0, minHeight: 0 }, items: [io("Input_A"), io("Input_B")] },
    "Zero tokens are real values, not missing ones: items abut at the lane x (30000, 66000) and the row is exactly the tallest block, 64000.",
    "Substituting hidden defaults for zero-valued tokens.");
  // Region rows of the fixture layouts, selected from the resolution trace by page and region.
  for (const [docName, pageId, regionKey, caseId, why] of [
    ["repeated", "View_A", "external-lane", "region-015-repeated-view", "The same semantic Input_Order on page View_A resolves in that page's own lane body (30000, 0, 570000, 140000): content left 70000, anchor Task_Check centre 350000 gives left 332000 and label x 335000; row top 0, block top 10000, label y 60000 - distinct from its View_Z geometry (212000)."],
    ["multi", "Page_A", "reference-band", "region-016-multi-band-a", "Process_A resolves its own bound band Band_A on Page_A: label 76000 wide, centre 250000, left 212000, object x 225000."],
    ["multi", "Page_B", "reference-band", "region-017-multi-band-b", "Process_B resolves its own bound band Band_B on Page_B: label 64000 wide, centre 450000, left 418000, object x 425000."],
  ]) {
    const trace = w.traces[docName].filter(t => t.pageId === pageId && t.regionKey === regionKey);
    if (trace.length !== 1) throw new Error(`${caseId}: trace selection`);
    const t = trace[0];
    const seam = { page: t.input.page, body: t.input.body, tokens: t.input.tokens, items: t.input.items.map(({ anchorCenterX, ...rest }) => rest) };
    addCase({ caseId, group: "region", operation: "layoutRegions", inputs: [inline("region-input", seam)],
      expected: [{ role: "result", json: pureOk(t.output) }], status: "ok", comparators: ["result-exact/1"], clause: [C("9.4", 721, 725)],
      derivation: why, wrong: "Sharing one rectangle across processes/pages or reusing the first page's geometry for every view.", decisions: ["PS-33"] });
  }
  if (JSON.stringify(w.traces.repeated.find(t => t.pageId === "View_A" && t.regionKey === "external-lane").output.items[0]) !== JSON.stringify({ elementId: "Input_Order", occurrenceKey: "d-Input_Order",
    bounds: { x: 332000, y: 10000, width: 36000, height: 50000 }, labelBounds: { x: 335000, y: 60000, width: 30000, height: 14000 } })) throw new Error("region-015 vector");

  // ---------------------------------------------------- layout primitive
  layoutPrimitiveCases(ctx, w);
}

// Layout primitive results (Result/1 "layout", harmonization K18).
export function layoutPrimitiveCases(ctx, w) {
  const { addCase, inline, ref } = ctx;
  const routeUnsealed = doc => doc.relocatedLinks.flatMap(l => {
    const i = doc.final.geometry.findIndex(g => g.pageId === l.pageId && g.occurrenceKey === l.occurrenceKey);
    return [{ pointer: `/payload/geometry/${i}/waypoints`, reason: ROUTE_REASON }, { pointer: `/payload/geometry/${i}/bounds`, reason: ROUTE_REASON }];
  });
  const layoutCase = ({ caseId, group = "layout", doc, pref = w.profileRef, env, place, themeId = "plain", clause, derivation, wrong, decisions }) => {
    const status = doc.refused ? `refused:${doc.refused}` : "ok";
    const unsealed = doc.refused ? [] : routeUnsealed(doc);
    const resultRef = ctx.artifact(`${caseId}.result.json`, doc.result);
    addCase({ caseId, group, operation: "layout", profile: pref,
      inputs: [ref("envelope", env.ref), ref("placements", place.ref), ref("base-geometry", doc.baseRef), inline("themeId", themeId)],
      expected: [ref("result", resultRef), ...(unsealed.length ? [inline("unsealed", unsealed)] : [])], status,
      comparators: ["result-exact/1", "profile-report/2", ...(unsealed.length ? ["layout-route/1"] : []), "source-immutability/1"], clause, derivation, wrong, decisions });
  };
  const L = w.layouts, E = w.envs, P = w.placements;
  layoutCase({ caseId: "layout-001-main", doc: L.main, env: E.main, place: P.main,
    clause: [C("9.1", 667), C("9.4", 721, 723)],
    derivation: "Region items move from their stale imported positions into the external-lane IO row (Input_Order, Output_Receipt) and the reference band row (StoreRef_Policy); every other occurrence and the page pass through unchanged; the three incident links are re-routed after expansion (route members UNSEALED, K5). Full Result/1: read-only revisions, B4 report header, empty entries.",
    wrong: "Leaving IO in its imported position, writing it into a work lane, moving unplaced occurrences, or omitting the report header members." });
  layoutCase({ caseId: "layout-002-repeated-views", doc: L.repeated, env: E.main, place: P.main,
    clause: [C("9.4", 725), C("9.1", 667)],
    derivation: "Two pages show the same process; each page resolves its own lane/band rectangles; repeated Input_Order and StoreRef_Policy get separate occurrence geometry; page order 0 (View_Z) precedes 1 (View_A).",
    wrong: "Computing region geometry once per semantic element and copying it to every page." });
  layoutCase({ caseId: "layout-003-multi-process", doc: L.multi, env: E.multi, place: P.multi,
    clause: [C("9.4", 725)],
    derivation: "Each process resolves its own bound reference band on its own page; the shared DataStore is shown through one reference per process.",
    wrong: "Resolving both references into the first process's band." });
  layoutCase({ caseId: "layout-004-empty-process", doc: L.empty, env: E.empty, place: P.none,
    clause: [C("9.4", 725)],
    derivation: "An empty process without IO needs no IO row; the pool passes through unchanged.",
    wrong: "Inventing an IO row, a lane or a band for an empty process." });
  layoutCase({ caseId: "layout-005-missing-lane", doc: L["main-nolane"], env: E.nolane, place: P.main,
    clause: [C("9.4", 721), C("9.3", 715)],
    derivation: "IO placements name region external-lane but the envelope has no external-lane binding and the theme declares no attachment region for it: the layout primitive never creates semantics and refuses render-region-missing (harmonization C13). Full refusal record: echoed identity and revision, empty diagnostics and report entries.",
    wrong: "Creating a lane in layout, falling back to the pool or page rectangle, dropping the IO silently, or returning profile-open from the primitive." });
  for (const [caseId, name, pref, envName, place, why, wrong] of [
    ["layout-006-neutral-fixture", "neutral-fixture", w.lot0.neutral.ref, "neutral", P.neutral, "The unchanged lot-0 neutral fixture places both tasks into region content, which no support binding resolves; there is no hidden page/plane default region (its explicitly bound successor is layout-008).", "Treating region content as the whole page or plane (a hidden private default)."],
    ["layout-007-grid-fixture", "grid-fixture", w.lot0.grid.ref, "grid", P.grid, "The unchanged lot-0 grid fixture places both service tasks into region side without a bound support; refusal, not invented geometry (its explicitly bound successor is layout-009).", "Inventing a side column from the region tokens alone."],
  ]) layoutCase({ caseId, doc: L[name], pref, env: E[envName], place, clause: [C("9.4", 721), C("9.3", 715)], derivation: why, wrong });
  layoutCase({ caseId: "layout-008-neutral-successor", doc: L["neutral-successor"], pref: w.successors.neutral.ref, env: E.neutralSuccessor, place: P.neutral,
    clause: [C("14.3", 961), C("9.4", 721, 723)],
    derivation: "Explicitly bound neutral successor (lot-0 completed tree plus a Lane bound to role content): region content resolves to Lane_content on each page. Z-page tokens headerWidth 0, padding 8, gap 8, minHeight 40: Task_A (no label) at left 8, Task_B (label 40000 wide) after it at 100016; row height max(40, 94000+16)=94016 at the body top; A = 40000 and B = 54000, so both object centres lie on cy = max(40000, (94016+40000-54000)/2) = 40008 (BLOCKB-PARITY-SYNC PS-06): Task_A and Task_B at y 8, Task_B label (130016, 80008). A-page: Task_B alone at (8, 8), label (30008, 80008).",
    wrong: "Keeping the lot-0 refusal for a bound successor, centring the row on the lane, ignoring the 8-tick padding, or centring the label-less Task_A block on its own (y 7008).", decisions: ["PS-06"] });
  layoutCase({ caseId: "layout-009-grid-successor", doc: L["grid-successor"], pref: w.successors.grid.ref, env: E.gridSuccessor, place: P.grid,
    clause: [C("14.3", 961), C("9.4", 721, 723), C("9.3", 713, 715)],
    derivation: "Explicitly bound grid successor: Task_A anchors on Y-consumer (opposite end Task_B, centre 350000) at left 300000; Task_B anchors on A-producer (Task_A centre 150000) but collides and moves to 400008; Lane_side grows to 500016. Row height 94016 and the object centre line cy = 40008 (BLOCKB-PARITY-SYNC PS-06): Task_A and Task_B at y 8, label (430008, 80008). On A-page Task_A is absent, so Task_B has no anchor and starts at 8. The theme's side-stripe declaration emits one record per represented page; its glyph is a header-band template without stripeWidth, so the stripe spans the whole grown region (harmonization K8): Z-page (0, 0, 500016, 100000), A-page (0, 0, 400000, 100000), label Auxiliary.",
    wrong: "Using the base lane width for the stripe, a default stripe width, a stripe on one page only, anchoring on an activity absent from the page, or centring the label-less Task_A block on its own (y 7008).", decisions: ["PS-06"] });
  layoutCase({ caseId: "layout-010-anchor-twice", doc: L["main-twice"], env: E.main, place: P.main,
    clause: [C("9.4", 723)],
    derivation: "Task_Check is shown twice on Page_Main, so its anchor is not available (harmonization K4: exactly one record of the anchor activity on the page): Input_Order starts at the content left edge 70000 and StoreRef_Policy at the band content edge 40000 (object x 50000); Output_Receipt keeps its unique Task_Ship anchor (left 469000).",
    wrong: "Anchoring on the first or nearest Task_Check record, or refusing the layout." });
  layoutCase({ caseId: "layout-011-geometry-theme-gated", doc: L["main-wide-own"], env: E.main, place: P.main, themeId: "wide-own",
    clause: [C("9.4", 721), C("13", 928), C("16", 1150)],
    derivation: "The case selects themeId wide-own, which declares geometry theme (fallback plain, region.external-lane.padding 12000); per-theme geometry is not approved (OPEN-DI/OPEN-LOOK, owner default shared geometry): the layout primitive refuses profile-open (harmonization H5). Envelope, placements and base geometry bytes equal those of layout-001, so the theme selection alone turns its ok result into this refusal. Full refusal record: echoed identity and revision, empty diagnostics and report entries.",
    wrong: "Ignoring the themeId selection (laying out with plain returns the layout-001 result), laying out with the wide-own padding 12000 as if the geometry:theme policy were approved, or refusing theme-geometry-conflict by comparing wide-own with its fallback plain (a single-theme layout checks no other theme)." });

  // Layout-level synthetic occurrences of the selected theme (DESIGN 9.3 L712-L715, Layout/1 semanticId? L667).
  const syn = (caseId, docName, env, place, themeId, clause, derivation, wrong) => layoutCase({ caseId, group: "synthetic", doc: L[docName], env, place, themeId, clause, derivation, wrong });
  syn("synthetic-001-band-stripe", "main-striped", E.main, P.main, "plain-striped", [C("9.3", 713, 715), C("9.1", 667)],
    "plain-striped declares one band-stripe; its selector selects Process_Main, represented on Page_Main (page root): one record with key JCS(['band-stripe','Process_Main','Page_Main']), no semanticId, role band-stripe, the leading 20000-wide stripe of the bound band rectangle (0, 470000, 20000, 120000), no label (empty literal).",
    "Emitting the stripe only in R, giving it a semanticId, sizing it from the header token, or labelling it with an empty string.");
  syn("synthetic-002-per-page", "repeated-striped", E.main, P.main, "plain-striped", [C("9.3", 715)],
    "Process_Main is represented on View_Z and View_A: one stripe per page, each in that page's own band rectangle.",
    "One stripe per owner across pages, or reusing View_Z geometry on View_A.");
  syn("synthetic-003-per-owner", "multi-striped", E.multi, P.multi, "plain-striped", [C("9.3", 715)],
    "Process_A is represented only on Page_A and Process_B only on Page_B: exactly two stripes, never the owner x page cross product.",
    "Emitting a stripe for every selected owner on every page.");
  syn("synthetic-004-region-missing", "empty-striped", E.empty, P.none, "plain-striped", [C("9.3", 715)],
    "Process_Empty has no bound reference band; the declaration's region cannot resolve: render-region-missing.",
    "Skipping the stripe silently or drawing it over the pool.");
  layoutCase({ caseId: "synthetic-005-grid-fixture", group: "synthetic", doc: L["grid-fixture-noplace"], pref: w.lot0.grid.ref, env: E.grid, place: P.none,
    clause: [C("9.3", 715)],
    derivation: "The unchanged lot-0 grid fixture without placements: only the side-stripe declaration of plain is involved; its owner Process_1 is the page root of both pages and its region side has no support binding: render-region-missing (layout-009 is the bound successor).",
    wrong: "Inventing a side column for the stripe, or skipping the declaration because no placement uses the region." });
  syn("synthetic-006-attached-badge", "main-badged", E.main, P.mainAid, "badged", [C("9.3", 712), C("9.4", 725)],
    "Aid_Scanner is placed in region aids, which has no binding but is the region of the selected theme's attached-badge declaration: an attachment region, so the aid keeps its geometry with role aids. The owner Aid_Scanner is represented on Page_Main through its own record (harmonization K7; it is not the page root). The badge attaches to the anchor's opposite node Task_Check (unique on the page) at (180000+10000, 260000+80000-20000) with the declared size viewBox 30x15 times 1000 ticks (harmonization K6 layout rule): (190000, 320000, 30000, 15000), label tool.",
    "Representing a page only through its root (no badge), taking the badge size as 30x15 ticks, anchoring at the node top-left, refusing the unbound attachment region, or moving the aid.");
  syn("synthetic-007-badge-ambiguous-anchor", "main-twice-badged", E.main, P.mainAid, "badged", [C("9.3", 712), C("9.3", 715)],
    "Task_Check, the anchor's opposite node, has two records on Page_Main: the ambiguous anchor refuses render-region-missing (harmonization C14); no nearest-activity repair.",
    "Attaching to the first or nearest Task_Check record.");
  syn("synthetic-008-badge-no-anchor", "main-badged-noanchor", E.main, P.mainAidNoAnchor, "badged", [C("9.3", 712), C("9.3", 715)],
    "The aid placement carries no anchorAssociationId: source association hiding/attachment requires the unique approved placement anchor, so the badge refuses render-region-missing (harmonization C14).",
    "Picking the only association of the aid as an implicit anchor.");
  syn("synthetic-009-badge-hide-source", "main-badged-hidden", E.main, P.mainAid, "badged-hidden", [C("9.3", 712), C("9.3", 717), C("13", 924)],
    "hideSource:true would map source coverage to the badge, an unqualified composite interaction (OPEN-RENDER-PRIMITIVES default): render-unsupported (harmonization C15).",
    "Hiding the source association and keeping the badge, or ignoring hideSource.");
  syn("synthetic-010-unbound-region", "main-aid-plain", E.main, P.mainAid, "plain", [C("9.4", 721), C("9.3", 715)],
    "Under plain no declaration names region aids and no binding exists for it: render-region-missing; layout never invents a region.",
    "Treating any unbound region as an attachment region or leaving the aid unplaced silently.");
}

export function templateCases(ctx, w) {
  const { addCase, inline } = ctx;
  const seam = (caseId, input, derivation, wrong, clause) => {
    const out = templateGeometry(input);
    addCase({ caseId, group: "template", operation: "templateGeometry", inputs: [inline("template-input", input)],
      expected: [{ role: "result", json: out.refused ? pureRefused(out.refused) : pureOk(out) }], status: out.refused ? `refused:${out.refused}` : "ok",
      comparators: ["result-exact/1"], clause, derivation, wrong });
  };
  const tg = (id, template, parameters, viewBox = [0, 0, 100, 80]) => ({ id, kind: "template", viewBox, commands: [], template, parameters: Object.entries(parameters).map(([name, value]) => ({ name, value })) });
  const hb = h => tg("hb", "header-band", { headerHeight: h });
  const HB = [C("9.3", 710)], CF = [C("9.3", 711)], BS = [C("9.3", 713)];
  seam("template-001-header-band", { glyph: hb(12000), bounds: { x: 0, y: 0, width: 100000, height: 80000 } },
    "Divide at y+min(headerHeight,h): header 12000, body 68000.", "Scaling the header with the viewBox ratio.", HB);
  seam("template-002-header-band-growth", { glyph: hb(12000), bounds: { x: 0, y: 0, width: 100000, height: 240000 } },
    "The header keeps its 12000 height when the body grows to 240000; no uniform scaling (36000 would be wrong).", "Uniformly scaling the header to 36000.", HB);
  seam("template-003-header-band-short", { glyph: hb(12000), bounds: { x: 10000, y: 20000, width: 50000, height: 5000 } },
    "min(headerHeight,h)=5000: the header takes the whole height and the body is empty (height 0) at y=25000.", "A negative body height or a header overflowing the bounds.", HB);
  seam("template-004-header-band-zero", { glyph: hb(0), bounds: { x: 0, y: 0, width: 100000, height: 80000 } },
    "headerHeight 0 is a value: empty header at y, body the full bounds.", "Substituting a default header height for 0.", HB);
  const cf = (ratio, rotation) => tg("cf", "corner-fold", { foldRatio: ratio, headerRotation: rotation });
  seam("template-005-corner-fold-even", { glyph: cf(0.5, 0), bounds: { x: 0, y: 0, width: 1005, height: 2000 }, labelBounds: { x: 0, y: 0, width: 1005, height: 2000 } },
    "fold = roundEven(min(1005,2000)*0.5) = roundEven(502.5) = 502; path (503,0),(503,502),(1005,502); label rotation 0 about the label centre (502.5,1000) -> (502,1000).",
    "Math.round gives fold 503 and path x 502.", [C("9.3", 711), C("9.3", 715)]);
  seam("template-006-corner-fold-ratio", { glyph: cf(0.1, 270), bounds: { x: 100000, y: 50000, width: 25, height: 40 }, labelBounds: { x: 100000, y: 50000, width: 25, height: 11 } },
    "fold = roundEven(25*0.1) = roundEven(2.5) = 2; rotation 270 about the label centre (100012.5, 50005.5) rounded once to the even neighbours (100012, 50006).",
    "Half-up rounding gives fold 3; rounding the centre half-up gives (100013, 50006).", [C("9.3", 711), C("9.3", 715)]);
  seam("template-007-corner-fold-zero", { glyph: cf(0, 90), bounds: { x: 0, y: 0, width: 100, height: 80 }, labelBounds: { x: 0, y: 0, width: 100, height: 20 } },
    "foldRatio 0 gives a degenerate fold at the top-right corner (100,0),(100,0),(100,0).", "Rejecting foldRatio 0 or substituting a default fold.", CF);
  const node = { x: 180000, y: 260000, width: 100000, height: 80000 };
  seam("template-008-attached-badge", { glyph: badgeGlyph(false), bounds: node, badgeSize: { width: 30000, height: 15000 } },
    "The badge attaches at (node.x+offsetX, node.y+node.height+offsetY) = (190000, 320000) with the explicitly declared badge bounds 30000x15000 (harmonization K6, astra L4 #5); markerShift 3000 and hideSource false pass through.",
    "Deriving the size from the viewBox numbers (30x15 ticks), anchoring at the node top-left or centring the badge on the node.", [C("9.3", 712), C("9.1", 671)]);
  seam("template-011-attached-badge-size", { glyph: badgeGlyph(false), bounds: node, badgeSize: { width: 24000, height: 12000 } },
    "Same glyph and viewBox [0,0,30,15] with declared bounds 24000x12000: the badge is (190000, 320000, 24000, 12000); the viewBox never sizes the badge.",
    "Ignoring the declared size in favour of the glyph viewBox (30000x15000 or 30x15).", [C("9.3", 712)]);
  const bs = width => tg("bs", "band-stripe", { stripeWidth: width }, [0, 0, 20, 100]);
  seam("template-009-band-stripe", { glyph: bs(20000), bounds: { x: 0, y: 470000, width: 1100000, height: 120000 } },
    "Leading vertical rectangle of width min(stripeWidth, region.width) and full region height.", "Using the region header width or a trailing stripe.", BS);
  seam("template-010-band-stripe-clamped", { glyph: bs(20000), bounds: { x: 0, y: 470000, width: 15000, height: 120000 } },
    "stripeWidth 20000 exceeds the 15000 region width; the stripe is clamped to 15000.", "Overflowing the region with a 20000-wide stripe.", BS);
  // Template painting of the second neutral profile's header-band glyph (DESIGN 9.3 L715, 14.3 L961).
  const gridAid = w.successors.grid.profile.themes[0].glyphs.find(g => g.id === "aid");
  const gridR = w.gridSuccessorRender;
  const aidOcc = gridR.render.occurrences.find(o => o.pageId === "Z-page" && o.occurrenceKey === "a-note");
  const stripeOcc = gridR.render.occurrences.find(o => o.pageId === "Z-page" && o.semanticId === undefined);
  seam("template-012-grid-aid-header-band", { glyph: gridAid, bounds: aidOcc.bounds },
    "The grid aid glyph is a header-band (headerHeight 12 ticks) painted inside the R occurrence of the aid on Z-page (100000, 350000, 150000, 40000): header (100000, 350000, 150000, 12), body (100000, 350012, 150000, 39988).",
    "Painting the aid as a plain rectangle or scaling the 12-tick header with the occurrence.", [C("9.3", 710), C("9.3", 715)]);
  seam("template-013-grid-stripe-header-band", { glyph: gridAid, bounds: stripeOcc.bounds },
    "The side stripe uses the header-band glyph for its paint (role decides placement, glyph paint): inside the full-width stripe (0, 0, 500016, 100000) the header is 12 ticks high.",
    "Painting the stripe with the band-stripe placement rule or a default glyph.", [C("9.3", 710), C("9.3", 715)]);
  seam("template-014-native-glyph", { glyph: { id: "task", kind: "native", nativeType: "bpmn:Task", viewBox: [0, 0, 100, 80], commands: [] }, bounds: node },
    "A native glyph has no template geometry: render-unsupported (unknown glyph capability, DESIGN 9.3 L704).",
    "Returning the node bounds as if it were a template.", [C("9.3", 704)]);
}

// Compile-time template signature negatives (DESIGN 9.3 L715, CR-09) and admission.
export function signatureCases(ctx, w) {
  const { addCase, inline, ref } = ctx;
  const pkgInputs = pkg => [ref("base", pkg.base), ref("descriptors", pkg.descriptors), ref("registry", pkg.registry), ref("schema", pkg.schema), ...pkg.assets.map(a => ref("asset", a))];
  const admitted = { status: "ok", diagnostics: [] };
  const admissionUnsealed = [{ pointer: "/payload", reason: "CompiledProfile is an in-memory implementation object without a closed DESIGN wire shape; compile success and empty diagnostics are sealed." }];
  const admit = (caseId, pref, pkg, clause, derivation, wrong) => addCase({ caseId, group: "admission", operation: "compileProfile", profile: pref, inputs: pkgInputs(pkg),
    expected: [{ role: "result", json: admitted }, inline("unsealed", admissionUnsealed)], status: "ok", comparators: ["result-exact/1"], clause, derivation, wrong });
  admit("admission-001-lot4-package", w.profileRef, w.lot4Package, [C("2.4.1", 186, 199), C("2.4", 164)],
    "The synthetic lot-4 package is schema-valid (subset checker over the vendored profile schema) and satisfies the presentation/export compile rules by construction (README CR review): one primary notion or facet per element type, unique per-theme bindings with glyphs declared in the theme chain, exact template signatures, closed export-ir/1 fields, export-only emit/loss actions with declared artifact/report writes, acyclic theme fallbacks, declared metric resources, and the R3.1 ensure recipe declaring the five support roles the envelopes bind.",
    "Rejecting boundRole over bindingOwner, render traversals in export recipes, capability predicates guarded by semantic, chained theme fallbacks, or support roles declared by an ensure recipe.");
  Object.entries(w.variants).forEach(([name, v], i) => admit(`admission-${String(i + 2).padStart(3, "0")}-variant-${name}`, v.ref, w.lot4Package, [C("2.4.1", 194, 196), C("10.2", 770, 774)],
    `Variant ${name} (version ${v.profile.version}) differs from the lot-4 package only as stated in the README variant table; its defect, if any, is a runtime condition and must not be refused at compile time.`,
    "Refusing at compile time a condition the DESIGN assigns to a runtime refusal code."));
  admit("admission-009-neutral-successor", w.successors.neutral.ref, w.successorPackage, [C("14.3", 961), C("2.4", 164)],
    "The neutral successor is the vendored neutral profile with the lot-4 package pins, a normalize recipe ensuring a lane-set and a lane bound to role content, and a lane notion/glyph; every other record is unchanged.",
    "Refusing a region role declared only through an ensure recipe, or requiring the lot-0 base pin.");
  admit("admission-010-grid-successor", w.successors.grid.ref, w.successorPackage, [C("14.3", 961), C("2.4", 164)],
    "The grid successor is the vendored grid profile with the lot-4 package pins, an ensure recipe for a lane bound to role side, and a lane notion/glyph.",
    "Refusing a region role declared only through an ensure recipe, or requiring the lot-0 base pin.");
  const themes = w.profile.themes, ti = themes.findIndex(t => t.id === "templates");
  const gi = id => themes[ti].glyphs.findIndex(g => g.id === id);
  const p = (id, k) => `/themes/${ti}/glyphs/${gi(id)}/parameters${k === undefined ? "" : `/${k}`}`;
  if (TEMPLATE_GLYPHS.length !== themes[ti].glyphs.length) throw new Error("templates theme");
  const cases = [
    ["signature-001-duplicate", { pointer: p("hb"), value: [{ name: "headerHeight", value: 12000 }, { name: "headerHeight", value: 12000 }] }, "A duplicated header-band parameter."],
    ["signature-002-wrong-type", { pointer: p("hb", 0), value: { name: "headerHeight", value: "12000" } }, "headerHeight given as a string."],
    ["signature-003-missing", { pointer: p("cf"), value: [{ name: "foldRatio", value: 0.25 }] }, "corner-fold without headerRotation."],
    ["signature-004-extra", { pointer: p("hb"), value: [{ name: "headerHeight", value: 12000 }, { name: "color", value: "#000000" }] }, "header-band with an undeclared parameter."],
    ["signature-005-fold-range", { pointer: p("cf", 0), value: { name: "foldRatio", value: 0.75 } }, "foldRatio outside [0,0.5]."],
    ["signature-006-rotation-domain", { pointer: p("cf", 1), value: { name: "headerRotation", value: 45 } }, "headerRotation outside {0,90,270}."],
    ["signature-007-negative-ticks", { pointer: p("hb", 0), value: { name: "headerHeight", value: -1 } }, "headerHeight negative ticks."],
    ["signature-008-fractional-ticks", { pointer: p("bs", 0), value: { name: "stripeWidth", value: 1.5 } }, "stripeWidth not an integer tick count."],
    ["signature-009-boolean", { pointer: p("ab", 2), value: { name: "hideSource", value: "false" } }, "hideSource given as a string, not a boolean."],
  ];
  for (const [caseId, mutation, what] of cases) addCase({
    caseId, group: "template", operation: "compileProfile", profile: w.profileRef, inputs: [inline("mutation", mutation), ...pkgInputs(w.lot4Package)],
    expected: [{ role: "result", json: pureRefused("profile-glyph-shape") }], status: "refused:profile-glyph-shape", comparators: ["result-exact/1"], clause: [C("9.3", 715)],
    derivation: `${what} The mutation keeps the profile schema-valid (literal parameter entries are free-form), so only the template signature check can refuse it. Full PureResult refusal: code and empty diagnostics (block A public compile contract).`,
    wrong: "Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic.",
  });
}
