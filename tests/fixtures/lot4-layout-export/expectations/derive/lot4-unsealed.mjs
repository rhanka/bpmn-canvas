// UNSEALED register of the lot-4 seal: points that depend on an unresolved
// DESIGN section 13 OPEN, on private-consumer-owned data, or on another lot's receipt.
export const DESIGN_SHA256 = "48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f";
const C = (section, a, z = a) => ({ section, lines: [a, z] });
export const UNSEALED = [
  { id: "U-01", item: "Private engine reference bytes for any engine-byte-compatible Draw.io/Sparx claim (private-consumer-owned; not authored here)",
    gate: "OPEN-EXPORT-EVIDENCE / OPEN-Q6; private consumer and both export sessions", default: "every unqualified combination is structural or unsupported; raw final-byte comparison, no comparison-time normalization", clause: [C("10.2", 799), C("13", 933)] },
  { id: "U-02", item: "Composite rendering grammar: wavy document outline with fixed header, badge-row splitting/spacing, markerShift painting (no RenderData field), legacy legend composite; hideSource:true is sealed as the render-unsupported refusal (synthetic-009)",
    gate: "OPEN-RENDER-PRIMITIVES (canvas NM7); conductor and both render/export sessions", default: "only explicit native/path/template glyphs with declared appearance losses; unsupported composites disabled", clause: [C("9.3", 712), C("9.3", 717), C("13", 924)] },
  { id: "U-03", item: "Text fit: engine-scalar-A/1 line breaking and label box measurement from injected metrics (label bounds/lines are layout inputs in this seal)",
    gate: "private consumer injected metrics (14.2 row 4) and both libraries' policy receipt (erratum E-20)", default: "injected scalar widths or the declared fallback width/alias map; no platform font measurement; case and width policies separate", clause: [C("3.1", 270), C("9.3", 702), C("14.2", 953)] },
  { id: "U-04", item: "Private token values (question/choice colours, injected standard/custom legacy themes, private region token values)",
    gate: "private consumer injected tokens (14.2 row 4); referenced by contract shape only", default: "neutral synthetic values stand in; libraries embed no private values", clause: [C("9.5", 729), C("14.3", 971), C("14.2", 953)] },
  { id: "U-05", item: "External discriminator export row and external call placement in the external lane",
    gate: "OPEN-EXTERNAL with OPEN-BASE admission of the Documentation marker; owner-ratified default, both libraries for encoding proof", default: "dedicated native Documentation marker; external creation disabled until the encoding and base admission are proved", clause: [C("10.2", 795), C("13", 909, 910)] },
  { id: "U-06", item: "Support creation during preparation (N ensure of a missing lane/band/collaboration)",
    gate: "OPEN-RESERVED-N technical atomicity gate; conductor and both libraries", default: "only declared structural supports; until proved, preparation refuses profile-open (sealed in prepare-002)", clause: [C("9.4", 725), C("13", 917)] },
  { id: "U-07", item: "Sparx serializer byte structure and EA import check (IR-level sparx expectations are sealed)",
    gate: "OPEN-Q6 / OPEN-EXPORT-EVIDENCE; private consumer and both export sessions; later owner EA check", default: "structural capability; EA import remains a later owner check", clause: [C("10.2", 789), C("10.2", 803)] },
  { id: "U-08", item: "Draw.io bytes: geometry unit conversion (ticks to file units), style-string vocabulary and therefore the serialized digest values (UNSEALED pointers /payload/bytes, /payload/digest, /report/artifacts/0/digest of serialize-001..003; checked by drawio-structure/1 and serialize-bytes/1)",
    gate: "target adapter publication (lot-4 code) plus the separately pinned conversion recipe (private consumer for historic engine parity)", default: "structural; the cell graph, names, serializer data invariants and digest = SHA-256 of the bytes are sealed", clause: [C("3.1", 270), C("10.2", 801)] },
  { id: "U-09", item: "Edge routing: ordinary routes come from the pinned adapter's base geometry input; routes of links incident to relocated region items are UNSEALED pointers (waypoints, bounds) of layout-001..003 checked by layout-route/1",
    gate: "harmonization K5 / erratum E-11: R3.4 routing rule; both libraries (pinned adapter artifact and layout receipt)", default: "route after expansion; LINK-ROUTE invariants; every other layout member exact", clause: [C("9.1", 667), C("9.4", 723)] },
  { id: "U-10", item: "prepareExport end-to-end success (C, lint stages, N, layout, R, map under accept); the refusal paths are sealed (prepare-001 option validation, prepare-002 support gate, prepare-003 lint block)",
    gate: "OPEN-CONTRACT-RECEIPTS: lot-1 lint and lot-3 C/N receipts; layout geometry source is runtime-specific (harmonization K18); conductor and both libraries", default: "section 10.2 orchestration under accept; refusal returns the complete report and no artifact", clause: [C("10.2", 803), C("13", 935)] },
  { id: "U-11", item: "Theme history inside the live editor (undo/redo across setTheme, change events, presentation history)",
    gate: "OPEN-HOOK; canvas session and conductor", default: "theme changes derive presentation from the current snapshot without replaying history (R-level round trips sealed)", clause: [C("8.2", 643), C("13", 923)] },
  { id: "U-12", item: "Per-code manifest of the private consumer's Python export common report (the twin library's own manifest is sealed: no legacy export entry point)",
    gate: "private consumer export session; per-adapter manifest before lot 4", default: "preserve pageId, occurrenceKey, emittedType and the complete idMap; unlisted codes take the closed fallback", clause: [C("10.1", 762), C("10.2", 785)] },
  { id: "U-13", item: "Content of the legacy colored sparse-DI policy (which imported colours a consumer honours)",
    gate: "OPEN-LEGACY; owner after the conductor/canvas migration proposal", default: "caller-supplied DiStyles; no hidden client default (mechanism sealed in legacy-003 and legacy-007)", clause: [C("9.5", 729), C("13", 927)] },
];
// Items of the first seal revision closed in this fix round (with their witnesses).
export const CLOSED = [
  { id: "U-14", item: "Refusal code for an ambiguous or missing attached-badge placement anchor", closedBy: "harmonization C14: render-region-missing (synthetic-007, synthetic-008)" },
];
