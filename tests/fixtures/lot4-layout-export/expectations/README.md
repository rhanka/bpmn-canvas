# Block B lot 4 — independent expectation seal (layout, R, target exporters)

## Authorship and review

- Spec author: Opus (owner exception during the Muse outage), independent of
  any block B implementation. No block B code was read or run.
- Reviewer: gpt-6-astra, max effort. The first revision (commit `eb5bffd`,
  `seal.json` SHA-256 `0376599bfa11d2cd2c629472e5fa42420109a5d6ccc2254761d49a7777d1c15c`,
  153 cases) was reviewed REWORK (BLOCKB-SEAL-REVIEW-L4.md: six MAJOR, one MINOR).
- This revision is the single seal fix round (SF): it applies the astra findings
  and the JS/Python harmonization decisions (BLOCKB-HARMONIZATION.md, section
  4.1 lot 4, items F-JS-L4-01..15, and every decision-matrix row touching lot 4).
  Precedence: DESIGN R3.3 text > harmonization decision > astra finding. The
  reseal ledger is `docs/design/receipts/block-b-lot4-reseal.json` (old and new
  byte pins); the fix-round record is a hand-written section below.
- Parity sync revision (this revision): applies the block-B JS/Python parity
  sync (BLOCKB-PARITY-SYNC.md: section 1 decisions, section 2 import rules,
  apply plan 3.2) in its section 1.2 order: own-side value changes, then the
  vendored Python lot-4 parity cases with the section-1 decisions applied to
  their values, then the reseal. Precedence: DESIGN R3.3 text > parity-sync
  decision > harmonization decision. Its record is the "Block-B parity sync"
  section below; its successor ledger is
  `docs/design/receipts/block-b-lot4-parity-sync.json` (the SF ledger stays as
  history).
- Twin-applied field (block B final spec pass, review finding #20): the four
  vendored PS-35 compile successes that the twin record already carries in the
  decided form name it in the structured index field `twinApplied`
  (`["PS-35"]`); the seal test reads this field instead of matching the
  derivation text. No expected value changes. Its ledger is
  `docs/design/receipts/block-b-lot4-twin-applied-field.json`; the earlier
  ledgers stay as history.
- Authority: DESIGN.md revision R3.3, SHA-256
  `48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f`,
  sections 9 (L663–730) and 10.2 (L768–803), with 2.2–2.5, 3.3 (cited by
  vendored cases), 5.1, 6.2–6.4, 10.1, 12 (L837), 13 (OPEN register), 14.2
  row 4, 14.3 (corpus format, comparators, adversarial groups) and 16 (owner
  decisions). Block A public API of this
  worktree (`src/profile/`, `src/io/`, `docs/design/`) for contract shapes only,
  and the lot-0 contracts on main (Snapshot/1, R, Report/2,
  `profile-parity-corpus/1`, `unicode-case/1`).

## Method

1. Every expected value is a literal decision of the spec author, derived from
   the cited DESIGN clause or harmonization decision, or arithmetic/hashing over
   such decisions. The vendored Python cases are the exception: their values
   are those of the Python seal (author `spec-seal`), changed only where a named
   parity-sync decision applies (section "Vendored Python cases").
2. The authoring tool in `derive/` is standalone: its modules import only
   `node:crypto`, `node:fs`, `node:path`, `node:url` and each other. It
   contains no loader, compiler, evaluator, codec, layout, exporter or command
   import, and none was executed to produce, adjust or check any value. There is
   no update-from-actual mode; CI never runs the tool.
3. Notion assignments, labels per theme, recipe effects, capability classes and
   association endpoints are literal tables (`derive/lot4-render.mjs`,
   `derive/lot4-setup.mjs`, `derive/lot4-export.mjs`, `derive/lot4-fixtures.mjs`);
   the tool assembles them and computes `H(x) = sha256(UTF-8(JCS(x)))` with its
   own RFC 8785 implementation.
4. That JCS/SHA-256 implementation was checked against already sealed lot-0
   vectors before use (`r3-digest-vectors.json`, the `identity-stable-id` case,
   the step-4 render binding).
5. Unicode strings are literal; the tool re-checks every case vector against the
   pinned `unicode-case/1` 15.0.0 table data and stops on any difference.
6. Synthetic packages are checked against the vendored profile schema with a
   subset validator (`derive/lot4-schema-check.mjs`, syntax only). Compiler rule
   conformance is the written CR review below; admission is itself a sealed
   expectation. A refusal by the lot-2 compiler is a seal dispute for the
   reviewer, never a reseal by an implementer.
7. Cited DESIGN lines are pinned by line digest only (`design-excerpts.json`);
   no DESIGN text is copied into this repository.
8. Comparators are pinned executables (`comparators/`), independent of the
   derivation tool (own canonicalization and XML reader). Their source SHA-256 is
   recorded in `seal.json` and in `manifest.json`; the seal test proves that each
   comparator accepts every sealed record and rejects altered outputs.
9. Independence guard: a TypeScript-AST scan of `derive/` and `comparators/`
   rejects any import outside the allowlist (comments cannot hide or fake one),
   dynamic `import()`, `require` in any form, `eval`/`Function`/constructor
   escapes, `globalThis`/`module`/`process` escapes (only `process.argv`),
   `import.meta` other than `url`, and string literals naming implementation
   paths. Mutation witnesses in the seal test prove each bypass form is caught.
10. Key vectors were re-derived by hand before sealing: the region rows of the
    neutral and grid successors, the K4 no-anchor row, the attached badge, the
    navigation loss coordinates, the marker loss, the C19 lint entry.

Regeneration (spec author only):
`node tests/fixtures/lot4-layout-export/expectations/derive/lot4-derive.mjs <DESIGN.md R3.3>`.
The tool refuses any DESIGN bytes other than R3.3.

## Layout of this directory

| Path | Content |
| --- | --- |
| `cases/<caseId>.json` | One `profile-parity-corpus/1` case: exactly `caseId, operation, phase, profileArtifact, inputArtifacts, expectedArtifacts, expectedStatus, comparatorIds` (`commandArtifact` unused). |
| `artifacts/` | Synthetic packages, envelopes, placements, adapter base geometry, Layout/1, RenderData/1, full Result/1 records, PreparedArtifact, metric resource variant, legacy adapter manifest, digest records. |
| `comparators/` | The pinned executable comparators (`lot4-compare.mjs`) and their XML reader (`lot4-xml.mjs`). |
| `vendor/py/` | Vendored Python lot-4 parity files, byte-identical to the Python seal commit named in `vendor/py/source.json`: `parity/cases/`, `parity/artifacts/`, `packages/` (render base and descriptors); `source.json` (commit, seal digests, every file with its Python path and SHA-256, aliases, exclusions); `harness-index.json` (the verbatim author, clause, witness and derivation texts of each vendored case, pinned by the harness record SHA-256). |
| `manifest.json` | Corpus manifest: `pathBase`, parent manifests, extended lot-0 corpus manifest, comparators with source pins, SHA-256 of every case, artifact and vendored file, package inputs per profile artifact, `vendorSource`, the `vendored` list `{caseId, source, sha256}` and the PS-37 `aliases` `{caseId, aliasOf, sha256}`. |
| `index.json` | Per case: group, DESIGN clause (section + one-based line range), derivation, wrong implementation, applied parity-sync decisions (`decisions`) and, among them, the decisions already applied on the twin side (`twinApplied`); vendored cases also carry `author` and their `vendored` provenance; UNSEALED and closed registers. |
| `design-excerpts.json` | Section ranges and SHA-256 of each cited DESIGN line. |
| `derive/` | The standalone authoring tool (sealed with the data). |
| `seal.json` | Length and SHA-256 of every other file in this directory, plus the comparator source pins. |

Artifact references `{role, path, sha256}` use paths relative to `pathBase`
(`tests/fixtures`). Inline artifacts are `{role, json}`. `expectedStatus` is
`ok` or `refused:<code>` (a lint code may contain `/`, e.g.
`bpmnlint/end-event-required`). Every case has a `result` (full Result/1 or
PureResult record) or an `output` (seam output) artifact; a refusal is always a
whole record, never a code alone. Optional `unsealed` artifacts list RFC 6901
pointers removed before comparison, each with its reason; an entry with a
member `artifact` concerns that other expected artifact (pointer `""` = the
whole artifact) and is not applied to the result record.

## Operations

ABI operations (DESIGN 2.5 L225–L240, 10.1): `compileProfile` (the harness
runs loadProfile then compileProfile; PureResult), `layout` (the shared layout
primitive, harmonization K18: adapter base geometry plus placements and theme ->
Result/1 `layout`), `resolveTheme`, `mapExport`, `serializePrepared`,
`prepareExport` (Result/1), `evaluateValue` (one PureResult per value) and
`serializeBpmn` (BPMN column: hydrate `envelope.tree` with the pinned BPMN
descriptors through F1, then the block A F7 writer; structural facts only).

Helpers (harmonization A4 names; PureResult unless stated):

| Operation | Rule | Input -> output |
| --- | --- | --- |
| `layoutTicks` | 3.1 L270 | pt values (binary64) -> integer ticks (PureResult payload, parity sync PS-33) |
| `layoutRegions` | 9.4 L721–725 | page, support body, region tokens, items in placement order -> items, grown body, page bounds (PureResult payload, parity sync PS-33) |
| `templateGeometry` | 9.3 L706–715 | template glyph, bounds, optional labelBounds and badgeSize -> `header, body` / `fold, foldPath[, labelRotation]` / `stripe` / `badge, markerShift, hideSource` |
| `renderDigests` | 9.2 L679–690 | explicit digest record (Python twin `render_digests` shape) -> every binding digest and viewRevision |
| `verifyRenderData` | 9.2 L690 | envelope, layout, R, themeId, bags -> `{viewRevision}` or `render-stale` |
| `resolveLegacyTheme` | 9.5 L729 | legacy look name -> `{themeId}` |
| `checkThemeSwitch` | 9.4 L721, 16 item 6 | from/to theme -> `{relayoutRequired}` |
| `exportIdPlan` | 10.2 L801, 2.2 L130 | policy, origin, pages, requested keys -> `{ids}` |
| `mapLegacyDiagnostics` | 10.2 L778–785 | adapter id, legacy error/notice, source index, manifest -> Report/2 entry list |

Canvas-only seams keep their names: `theme-sequence` (8.2 L643, 9.2 L694:
per-step digests), `serializePrepared-sequence` (determinism),
`legacy-adapter-manifest` (manifest publication). The vendored Python cases use
the same names plus `mapExportSequence` (Python sequence seam: its `steps`
input lists mapExport inputs run in order in one process; its `output` lists
one record per call).

## Comparators

All tolerances are zero (DESIGN 14.3 L961); layout rounding happens during
generation, never at comparison. Calling convention:
`comparator(expected, actual) -> {ok, failures}` where `expected` maps each
expected artifact role to its parsed JSON.

| Id | Export | Checks |
| --- | --- | --- |
| `profile-c14n/2`, `seam-exact/1` | `canonicalEqual` | RFC 8785 equality of the whole artifact. |
| `result-exact/1` | `resultExact` | The whole Result/1 or PureResult record (status, operation, identity, revisions, code, diagnostics, report header, entries, rawStandardFindings, idMap, artifacts, payload) after removing only the sealed UNSEALED pointers, each of which must exist in the actual record; entries scoped to another artifact are skipped. |
| `layout-route/1` | `layoutRoute` | LINK-ROUTE invariants on UNSEALED route members: at least two integer waypoints, first inside or on the final source bounds, last inside or on the final target bounds, bounds equal to the waypoint bounding box. |
| `profile-report/2` | `reportOrder` | DESIGN 10.1 on every report of the actual record: L751 order plus harmonization G2 tie-breaks, no exact duplicate, idMap order (L753), lossClass iff classification loss, every loss reachable through entryIndexes, refusal: diagnostics = report entries, no artifact digest, no output header members. |
| `serialize-bytes/1` | `serializeBytes` | payload.digest and the report artifact digest equal SHA-256 of the bytes; UTF-8; no BOM; no CR (newline LF); no indented line (indent 0); no paired empty element (emptyElement short); every diagram an uncompressed mxGraphModel (compression none); the pinned attributeOrder. |
| `drawio-structure/1` | `drawioStructure` | DRAWIO-PROJECTION: one `diagram` per IR page in order with `id`/`name`; inside each, every `mxCell` with `vertex="1"` or `edge="1"` in document order as `{id, kind, parent, value?, source?, target?}` (`$layer` for the single layer cell, an empty value counts as absent); timestamp/random `mxfile` attributes (`modified`, `etag`) absent. A Python-shaped projection (vendored cases: `{comparator, diagrams, byteInvariants, deterministic}`) also checks `byteInvariants` on the returned bytes (UTF-8, no BOM, no CR, no compression, no paired empty element, both digests = SHA-256 of the bytes) and, for `deterministic: true`, identical bytes from a second identical call passed as third argument. |
| `lint-includes/1` | `lintIncludes` | Python seal comparator (vendored cases): each partial entry of the `includes` artifact matches at least one actual report entry on its listed members (`targetId` compares `source.targetId`), checked before UNSEALED removal. |
| `bpmn-structure/1` | `bpmnStructure` | Facts over the parsed F7 bytes: element by local name and id, parent (`definitions`, `<local>:<id>`, or the `ioSpecification` of an owner), attributes equal or absent, ordered child texts, element counts. |
| `source-immutability/1` | `sourceImmutable` | Canonical digest of every caller input identical before and after the call. |
| `determinism/1` | `determinism` | Identical inputs give identical bytes in the call order A, A, B, A. |

The seal test runs `result-exact/1` (or the seam comparator) on every case with
the sealed record as actual output (must pass) and with leaf, member and order
mutations (must fail); `profile-report/2` on every sealed report and
`layout-route/1` on every sealed route (must pass); targeted alterations
(code-only refusal, extra diagnostic, emptied entries, IR bounds/style/label,
loss coordinates, artifact digest, reordered entries, unreachable loss, refused
artifact with digest, bent route); `serialize-bytes/1` and `drawio-structure/1`
on synthetic conforming draw.io documents built from the sealed projections (a
comparator self-test witness, never an expectation) and their altered variants
(CRLF, BOM, indentation, paired element, attribute order, compression, wrong
digest, `modified` attribute, dropped/swapped cells and pages, raw tab in a
name); `bpmn-structure/1` on a synthetic BPMN document and its altered variants.

## Synthetic world

- Packages: `neutral-lot4-descriptors/1` and `neutral-lot4-base/1` version
  `lot4-2` (raw-pinned, extending the vendored neutral slices with stores,
  participants, lanes, Process IO, sets, ports, data associations, calls and
  terminate end events). Metric resources: the vendored `neutral-metrics` and
  `z-metrics`, whose bytes differ by exactly one byte (`"spaceAdvance": 300` ->
  `301`).
- Profile `neutral-lot4/1` 1.1.0, built from the vendored neutral profile: same
  rules, UI, provider and migration records; `place-task` removed (it targets an
  unbound region) and `export-nodes` replaced; the R3.1 `ensure-supports`
  normalize recipe declares the five support roles the envelopes bind
  (collaboration, main-participant, lane-set, external-lane, reference-band);
  every standard upstream lint setting is off in the ten tables (the profile
  subrules keep their draft/accept rows); added notions (start, end,
  terminate-end, service, call, decision, choice, flow, pool, band, lanes,
  Process IO, reference, relation, data-link, two facets), themes, export
  recipes, capability records and legacy aliases.
- Themes: `plain` (root, paint + region tokens, theme alias `default`), `dim`
  (paint), `plain-striped` (band-stripe declaration), `lowered` (choice label
  lower case), `wide`/`bold` (geometry-affecting tokens), `wide-own`
  (geometry theme, not approved), `bare` (separate root without band tokens),
  `templates` (template glyphs), `badged`/`badged-hidden` (attached-badge
  declaration, hideSource false/true), `metric-z` (metric resource `z-metrics`),
  `legacy-standard`, `legacy-custom`, `legacy-colored`.
- Exports: `drawing` (drawio, counter, origin 1: export-pages, export-nodes,
  export-calls, export-edges, export-edge-labels, export-aid-marker) and `ea`
  (sparx, native IDs: export-pages, export-nodes, export-calls, export-edges,
  export-aid-marker). Serializer data: UTF-8, LF, indent 0, compression none,
  short empty elements, attribute order id, value, style, parent, vertex, edge,
  source, target.
- Explicitly bound neutral successors (DESIGN 14.3 L961): `neutral/1` 1.2.0 and
  `neutral-grid/1` 2.1.0 are the vendored lot-0 profiles with the lot-4 package
  pins (the vendored neutral base admits no Lane), a normalize recipe ensuring a
  lane-set and a lane bound to the fixture's region key (content, side) and a
  lane notion/glyph. Their envelopes are the lot-0 completed trees plus that
  bound lane. The unchanged lot-0 fixtures still refuse (no bound support).
- Documents: `main` (one process, external lane with two Process IO objects,
  work lane, decision gateway, reference band with a store reference, aid
  annotation), `main` on two pages (`View_Z` full, `View_A` partial: repeated
  semantic IDs), `main` with Task_Check shown twice, `multi` (two processes, one
  shared DataStore, one reference and one band per process), `empty`, `choices`
  (decision labels and Unicode vectors), `variety` (service task, internal call,
  terminate end; called process not shown), `main-note` (an annotation without
  notion), `main-nolane` (external-lane binding absent), `main-unnamed`
  (Task_Fix with an empty name), the two successors and the two lot-0 fixtures.
- Variants (distinct patch versions, own identities and envelopes):

| Variant | Version | Delta |
| --- | --- | --- |
| conflict | 1.1.1 | two facets with different predicates both matching Task_Fix, fill #111111 and #222222 |
| labels-native | 1.1.2 | sparx export also lists `export-edge-labels` |
| byte-claim | 1.1.3 | drawio capability: every occurrence declared engine-byte-compatible |
| unsupported | 1.1.4 | drawio capability: aid occurrences unsupported |
| parent-order | 1.1.5 | a label recipe parented on the pool runs before `export-nodes` |
| dup-emit | 1.1.6 | a second recipe identical to `export-nodes` |
| missing-field | 1.1.7 | an edge recipe over every occurrence with a zeroOrOne source binding |

## Design points (DESIGN default or harmonization decision)

- DP-TICK (3.1 L270): a binary64 input is the exact rational of its shortest
  round-trip decimal; values times 1000 round once, ties to even, at the output;
  negative zero becomes 0.
- DP-REGION (9.4 L721, 9.3 L715, harmonization K1, C13): a placement's
  `(ownerProcessId, regionKey)` resolves through the envelope binding whose
  `ownerId` is the process and whose `role` equals the region key; the target's
  record on the page is the support rectangle. An unbound region is an
  attachment region when the selected theme declares an attached badge for it
  (the placed element keeps its geometry, role = region key); otherwise, or with
  no record on the page, or missing region tokens, the layout primitive refuses
  `render-region-missing`. Gated preparation refuses `profile-open`.
- DP-IO (9.4 L723, L725, harmonization K3; parity sync PS-06, which replaces
  the K2 per-block centring): content box = body minus `headerWidth` (left) and
  `padding` (all sides); items in the 7.2 placement order; item extent =
  max(object width, label width); left = anchor centre − extent/2 when the
  anchor is available, else previous right + gap (content left for the first);
  clamped to the content left edge; a later item closer than previous right +
  gap shifts right to it; object and label centred in the extent, label directly
  below the object. One row `[body.y, body.y + RH]` at the top of the body with
  `RH = max(minHeight, max(object.h + label.h) + 2·padding)`; with
  `A = max(object.h/2)` and `B = max(object.h/2 + label.h)`, every object centre
  lies on `cy = body.y + max(A, (RH + A − B)/2)` (L723 "Align centers on one IO
  row"): object `y = cy − h/2`, label `y = cy + h/2`; exact rationals, one
  roundEven per coordinate (equal to the K2 result when all heights are equal).
  The body height becomes `max(body.h, RH, cy + B − body.y)` and its width grows
  to contain the last right edge plus padding; the page grows to the minimal
  containing bounds; an empty item list leaves body and page unchanged.
  Reference bands and successor regions use the same rule with their own
  tokens.
- DP-ANCHOR (2.4.1 L218, 7.2 L563, harmonization K4): the anchor activity of
  `anchorAssociationId` is the activity owning a data association, or the other
  end of an Association relative to the placed element; it is available only
  when exactly one base geometry record of it is on the page.
- DP-LAYOUT (9.1 L667, harmonization K5, K18): the pinned adapter's base
  geometry is an input; the region step changes only region items (bounds,
  label bounds, `role` = region key) and grows supports/page; links incident to
  moved items are re-routed and their `waypoints`/`bounds` are UNSEALED
  pointers checked by `layout-route/1`. The primitive returns Result/1
  `layout` (read-only revisions, report header, no entries).
- DP-SYN (9.1 L667 `semanticId?`, 9.3 L712–715, harmonization K6, K7, K8, C14,
  C15): the selected theme's `syntheticOccurrences` are Layout/1 records without
  semanticId, emitted by the layout primitive and styled by R (declaration tokens
  at the binding level, no semantic or DI level; R refuses `render-stale` for a
  record no declaration of the selected theme produces). Owners: the literal
  reading of the root selector; represented page = page root or a page carrying
  a base record of the owner. Key `JCS([id, ownerId, pageId])`, role and label
  from the declaration (`""` gives no label). band-stripe: leading
  `min(stripeWidth, w)` slice of the grown bound region, full width when the
  glyph has no `stripeWidth`. attached-badge: `hideSource:true` refuses
  `render-unsupported`; the owner's placement in the declaration region must
  carry an anchor whose opposite node has exactly one record on the page, else
  `render-region-missing`; bounds `(node.x+offsetX, node.y+node.height+offsetY)`
  with the viewBox size times 1000 ticks.
- DP-LABEL (9.3 L698, 9.2 L690, harmonization F3, K16): a label is the notion
  binding's Value evaluated for the selected theme; a nonempty string gives a
  label, MISSING or the empty string gives none. R copies layout geometry and
  labels; a layout label that differs from the evaluated label (or presence
  mismatch) is a stale input: `render-stale`.
- DP-CHAIN (9.2 L684, 9.3 L700): bindings and glyphs resolve nearest-first
  along the selected theme's fallback chain; theme tokens resolve per name
  nearest-first; synthetic declarations come from the selected theme record.
- DP-THEME-ID (12 L837, harmonization K11, C17): `themeId` is a theme id or a
  theme alias declared by exactly one theme; the binding records the theme id.
  `resolveTheme` never reads `compatibilityAliases`; the legacy adapter path
  (`resolveLegacyTheme`) does, with exact names, and refuses `render-stale`
  for an unresolved look.
- DP-STYLE (9.3 L700, 9.1 L673, harmonization K9): per-token precedence
  occurrence > semantic > native DI > bioc > notion (primary notion and matched
  facets together, unequal values refuse `render-style-conflict`) > selected
  theme > fallback chain. Style holds the paint tokens; `region.*` tokens never
  enter style.
- DP-COVERAGE (9.1 L673, harmonization G3, K10, B25): every ID-bearing element
  including Definitions, in native pre-order with containment properties in
  UTF-16 name order; `rendered` with occurrences, `unsupported` when laid out
  without a glyph binding (no occurrence, one `render-unsupported` diagnostic:
  stage render, ruleId adapter, exact source pointer, page/key), otherwise
  `nonvisual`.
- DP-OCC (9.1 L671): `emittedType` is `node` or `edge`; edge bounds are the
  waypoint bounding box.
- DP-TEMPLATE (9.3 L708–715, harmonization K6): header-band splits at
  y + min(headerHeight, h); corner-fold uses roundEven(min(w,h)·foldRatio) and
  rotates the header text about its label-bounds centre, rounded once; the
  attached badge takes the explicitly declared badge size; band-stripe as in
  DP-SYN; a non-template glyph has no template geometry (`render-unsupported`).
- DP-GEO (9.4 L721, 16 item 6, harmonization K12, K13, H5): geometry-affecting
  values are the resolved `region.*`, `fontFamily`, `fontSize`, `fontWeight`
  tokens and the theme `metricsResource`; `checkThemeSwitch(from, to)` refuses
  `profile-open` when either theme declares geometry `theme` (not approved),
  `theme-geometry-conflict` when the values differ, else `{relayoutRequired:
  false}`. A single-theme render never checks other themes; layout and
  resolveTheme refuse `profile-open` for a geometry-theme selection.
- DP-METRICS (9.2 L687): metricsDigest hashes the unique metric resources of
  the selected chain, sorted by id, each `{id, sha256 = B(raw bytes)}`.
- DP-RESULT (10.1 L735–L739, harmonization B1–B4): success
  `{status, operation, profileIdentity, baseRevision, revision, report,
  payload}` with baseRevision = revision for read-only operations and the four
  report header members; refusal `{status, operation, profileIdentity?,
  baseRevision?, code, diagnostics, report}` echoing identity and revision when
  the input envelope (or prepared artifact) is shape-valid, report header
  `sourceIdentity`/`inputRevision` only, entries = findings of the lint stages
  executed before the refusal (`[]` when none ran), diagnostics = report entries,
  artifacts `[]`. resolveTheme report entries are the R diagnostics; mapExport
  uses one report for the Result and the PreparedArtifact. PureResult refusals
  are `{status, code, diagnostics: []}` (block A public compile contract).
- DP-IR (10.2 L772–774, harmonization B21): IR records are `{kind, id, ...named
  fields, parent?}` plus the values copied from R: page `bounds`; node `bounds`,
  `style`, `label: {bounds, lines}`; edge `bounds`, `waypoints`, `style`,
  `label`; label record `bounds`, `lines`; in emission order (export spec recipe
  order, then selector order); an omitted parent is the current page ID; an
  optional field whose value is MISSING is omitted, a required one refuses
  `export-field-invalid`; a parent or endpoint not yet emitted refuses
  `export-parent-order`; an ID emitted twice refuses `export-parent-invalid`.
- DP-ID (10.2 L801, 2.2 L130): counter plans include every outputId request
  (fields, parents, edge endpoints); native: page ID and semantic ID, any
  duplicate or synthetic occurrence refuses `export-id-ambiguous`; digest:
  `e_` + SHA-256 of `JCS([pageId, occurrenceKey, domain])`.
- DP-IDMAP (10.1 L753, harmonization L2): one record per emitted page and per
  emitted record whose self is a semantic occurrence; synthetic records have
  none.
- DP-LOSS (10.2 L776, harmonization B23): each applicable capability record
  contributes its loss classes with ruleId = export spec id and unavailable
  result coordinates; a loss action uses its recipe id and the last record
  emitted in the same recipe iteration as result (`/ir/<n>`, exact), unavailable
  when the iteration emitted nothing; source = exact tree pointer of the
  semantic element (unavailable for a synthetic occurrence); exact duplicates
  coalesce. Adapter-declared losses (parity sync PS-07, 10.2 L772, L776): an
  adapter whose serializer omits a common IR kind declares one loss entry per
  emitted record of that kind; `drawio/1` writes no metadata record, so each
  emitted metadata record yields `export-loss/metadata` with ruleId `adapter`,
  result `/ir/<index>` of that record (targetId null) and source = the emitting
  self. No JS-authored IR of this seal emits a metadata record (the lot-4
  export specs declare `metadata: []`); the vendored
  `export.map.kinds-and-losses` witnesses the rule.
- DP-ARTIFACT (10.1 L753, harmonization B22): one artifact record per output
  file, no `pageId`, `digest = H(ir)` in mapExport, every entry index; capability
  is the worst outcome, structural unless qualified engine bytes exist (10.2
  L799).
- DP-UNSUPPORTED (10.1 L753, 10.2 L797, harmonization C16): unsupported
  necessary content (class unsupported, or unsupported coverage) refuses the
  artifact with `render-unsupported`.
- DP-FRESH (9.2 L690, 10.1 L737, harmonization K14, K15): mapExport and
  verifyRenderData recompute the binding fields derivable from their inputs and
  require every R occurrence to equal its Layout/1 record (minus emittedType,
  style, glyphId); serializePrepared checks viewRevision, semanticRevision,
  `profileIdentity.sha256 = profileDigest` and the descriptorDigest of the
  prepared identity; any mismatch refuses `render-stale`; nothing is repaired.
- DP-SERIALIZE (2.5 L239, 10.1 L737, L753, 10.2 L803): serializePrepared
  returns Result/1 with the preparation identity and semanticRevision, payload
  `{format, bytes, digest, idMap, capability}`, report entries and idMap of the
  prepared report and one artifact record with `digest = B(bytes)`.
- DP-ADAPTER (10.2 L778–785, 10.1 L760, harmonization B24, L4): see
  `artifacts/legacy-adapter-manifest.json`. Mapped codes are exactly the DESIGN
  family table; every other emitted code is inventoried and takes the closed
  fallback. `mapLegacyDiagnostics` returns the entry list (ruleId `adapter`);
  entries are per ID; a mapped code keeps an exact pointer when the ID is
  indexed; the fallback keeps the ID but unavailable coordinates; no ID or an
  empty-string ID gives one entry with domain none; a code-less exception takes
  the fallback without `legacyCode`; a notice maps to `export-loss/<class>` only
  when the manifest declares it with a class of the closed set.
- DP-PREPARE (10.2 L803, 6.2 L478–481, 6.4 L515, harmonization C18, C19, H1,
  H2; parity sync PS-34): the options record is closed,
  `{format, themeId, overrides, diStyles, importedDi?}`; `importedDi`
  (Snapshot/1 record) is the geometry source of a headless adapter, and a
  runtime that needs it refuses `operation-error` at the layout stage when it
  is absent, never earlier; `signal?` is a JS-only runtime member that no
  corpus file carries. Options are validated first; then C, the pre-normalize lint stage
  (accept) and N under edit activation (a support creation is gated
  `profile-open`), then the later stages. A lint stage that leaves an unresolved
  error entry without a declared repair recipe refuses with the code of its
  first unresolved error entry in profile-report/2 order; the report holds the
  unified entries of the executed stages.

## Harmonization decisions applied

| Rows | Applied as |
| --- | --- |
| A1–A3 | corpus/1 records, `profileArtifact` `{path, sha256}`, manifest `pathBase` |
| A4 | helper operation names (Operations table) |
| A5 | `ok` / `refused:<code>` |
| A8, B1–B4 | full records everywhere (DP-RESULT); UNSEALED pointer lists with reasons |
| B21–B23 | DP-IR, DP-ARTIFACT, DP-LOSS (astra #6 merged under B23) |
| B24, L4 | DP-ADAPTER |
| B25, K10, G3 | DP-COVERAGE |
| C13 | DP-REGION (`layout-005`, `prepare-002`) |
| C14, C15 | DP-SYN (`synthetic-007`, `-008`, `-009`) |
| C16 | `export-018` |
| C17 | `legacy-004`, `legacy-005` |
| C18, C19 | `prepare-001`, `prepare-003` |
| F3, K16 | DP-LABEL |
| H1, H2, H5 | `prepare-002`; `layout-011`, `render-020`, `switch-004` |
| K1–K4 | DP-REGION, DP-IO, DP-ANCHOR (`layout-010`); the K2 per-block centring is replaced by the parity sync PS-06 object-centre line |
| K5 | route members UNSEALED (`layout-001`..`003`) |
| K6 | `template-008`, `template-011`, `synthetic-006` |
| K7, K8 | DP-SYN represented page; grid successor stripe (`layout-009`) |
| K11 | `render-019`, `verify-001` |
| K12, K13 | DP-GEO (`switch-001`..`007`) |
| K14, K15 | `export-024`, `verify-003`, `serialize-007`, `serialize-008` |
| K18 | `layout` and `layoutRegions` shared seams |
| L1–L3, L5, L6 | DP-ID, DP-IDMAP, `drawio-structure/1`, `bpmn-*` |

## Decisions outside the harmonization matrix (for the conductor)

1. Synthetic occurrences are Layout/1 records produced by the layout primitive
   and styled by R (DP-SYN). Basis: Layout/1 geometry has an optional semanticId
   (9.1 L667), attached badges need the placement anchor (9.3 L712, L715) which
   resolveTheme does not receive, and region resolution goes through the
   owner's placement or layout region (L715). This aligns the JS seal with the
   Python twin seal (layout-level synthetic records, theme record only).
2. Fixture choice, not a rule (parity sync PS-24): the lot-4 profile declares
   the support roles its envelopes bind with the R3.1 `ensure-supports` recipe.
   Envelope integrity validates bindings generically (closed record, owner and
   target exist, owner+role unique, target bound once) and never requires a
   bound role to be declared by profile data (5.1 L430: roles are opaque profile
   data keys); role-specific agreement is checked by the reuse validation of an
   ensure that names the role (harmonization C5). Fixtures that bind a role
   without an ensure recipe (the Python lot-4 `content`/`side` envelopes) stay
   valid; the refusal code for an undeclared role is erratum candidate E-40.
3. Refusal reports carry `artifacts: []` (block A refusal report precedent);
   compile refusals are `{status, code, diagnostics: []}`.
4. serializePrepared report content (DP-SERIALIZE): the prepared entries and
   idMap stay reachable from the terminal result (10.1 L753, 10.2 L803).
5. Every standard upstream lint setting of the synthetic lot-4 profile is off so
   that prepareExport lint stages are literal decisions (lint is lot 1).
6. `mapLegacyDiagnostics` returns the PureResult entry list (Python twin
   helper shape); the export path's refusal is its consumer's concern.
7. The neutral successors use the lot-4 package because the vendored neutral
   base admits no Lane, LaneSet, Collaboration or Participant.
8. A navigation loss comes from a recipe that emits the call node then reports
   the loss in the same iteration (both B23 branches are witnessed).

## Compile admission review (CR-01..CR-14)

The admission cases (`admission-*`) claim compile success by construction:
CR-01 capabilities used are the vendored set; CR-02 `outputId` only in emit
fields/parents, `ids` unused; CR-03 every selector uses its table order and
`property` only with reference/children; CR-04 count bounds min <= max; CR-05
every referenced notion, recipe, theme, glyph, resource (`neutral-metrics`,
`z-metrics`) and message exists, theme fallbacks are acyclic; CR-06 every action
matches a declared write (`artifact` for emit, `report` for loss, create/binding
/reference writes for ensure) and the base admits each field to code, editor and
import; CR-07 ensure steps allocate with explicit ownerId/slot/key (R3.1 shape);
CR-08 ten validation records with every standard setting and the profile
subrules; CR-09 one primary notion per element type, facets for the two Task_Fix
tokens, exact template signatures, typed tokens; CR-10 the vendored UI records
are unchanged; CR-11 emit fields are export-ir/1 fields with the right types;
CR-12 the vendored migration is unchanged; CR-13 no fallbacks; CR-14 export
recipes only emit, bind and report losses. Variant defects are runtime
conditions (style conflict, native ambiguity, parent order, duplicate key,
missing required field, unsupported capability).

## Discriminating vectors

Every case names, in `index.json` (`wrongImplementation`) and in the generated
table below, a plausible wrong implementation that it fails. Numeric vectors
were additionally checked against strawmen (`Math.round`, binary64 products,
double rounding).

## private-consumer-owned items (not authored here)

- Private exact engine bytes for any engine-byte-compatible claim (U-01).
- Injected metrics and text-fit outputs (U-03) and private token values (U-04);
  this seal references them by contract shape only and uses neutral synthetic
  values.
- Sparx bytes and EA checklist (U-07), draw.io geometry unit and style strings
  (U-08), the per-code manifest of the private consumer's Python export common
  report (U-12).

## UNSEALED

The register is `derive/lot4-unsealed.mjs`, copied to `index.json` and to the
docs table: U-01 engine bytes (OPEN-EXPORT-EVIDENCE/OPEN-Q6), U-02 composite
rendering and markerShift painting (OPEN-RENDER-PRIMITIVES, NM7), U-03 text fit
(private consumer metrics, E-20), U-04 private token values, U-05 external
discriminator row (OPEN-EXTERNAL, OPEN-BASE), U-06 support creation in
preparation (OPEN-RESERVED-N; the refusal is sealed), U-07 Sparx bytes and EA
check, U-08 draw.io bytes and digest values (pointers of `serialize-001..003`),
U-09 edge routing after region expansion (K5/E-11; pointers of
`layout-001..003`), U-10 prepareExport success end to end
(OPEN-CONTRACT-RECEIPTS; refusal paths sealed), U-11 theme history in the live
editor (OPEN-HOOK), U-12 private consumer Python export manifest, U-13 colored
DI policy content (OPEN-LEGACY). The CompiledProfile payload of `admission-*`
is an in-memory object without a closed wire shape (UNSEALED pointer
`/payload`).

Closed in this round: U-14 (ambiguous or missing badge anchor) by harmonization
C14.

## Not covered (scope gaps, no expectation)

Cross-page edges; `deflate-raw` compression and CRLF/indent options other than
the pinned ones; a full mapExport of the JS-authored world under the digest
policy (seam only; the vendored `export.map.digest-policy` covers the Python
fixture); synthetic declarations inherited from fallback themes; the reference
display-label fallback to the store name (every fixture reference is named);
raw upstream lint findings (every standard setting is off in the lot-4 tables;
the vendored `export.prepare.lint-refusal-stage-order` keeps them UNSEALED).

## Vendored Python cases (parity sync PS-H20, PS-H21, PS-H22)

The Python-only lot-4 groups that the harmonization (section 3.2) assigns to the
JS parity run are vendored from the Python seal, commit
`c8057bb82baf40be3b3e283d19017f8d80b063aa` (render tree `MANIFEST.sha256`
`bd73296ee1f8824f0d366201a7345605b6b03cc1ee0336c2c391bd1cc9823800`, export
tree `MANIFEST.sha256`
`6a9b163264eb9bb106ab2a61b7e2cc0b5c282453c4f09b3feb978ac1efc0d935`, parity
`manifest.json`
`42ffa5fd1860895ec0bf9d3c5885426a7d1d01481fb891745510df40ef62f4b6`), under the
import rules of BLOCKB-PARITY-SYNC section 2.1 and 2.2. They are not
re-authored: `derive/lot4-vendor.mjs` checks every vendored digest and
re-expresses each Python corpus/1 record as a JS case.

| Row | Groups (cases) |
| --- | --- |
| PS-H20 | `render.compile.*` (16), `export.compile.*` (15) |
| PS-H21 | `render.digest.*` (15), `render.fresh.*` (8), `render.r.*` (51), `render.template.*` (28), `render.legacy.*` (6) |
| PS-H22 | `export.map.*` (40), `export.serialize.*` (8), `export.prepare.compat-refusal`, `-lint-refusal-stage-order`, `-missing-support`, `-repairable-not-repaired`, `-repairable-without-recipe`, `-unknown-format`, `-unknown-theme` (7) |

The vendored list (194 ids) is `vendored` in `manifest.json` (`{caseId,
source, sha256}`, the SHA-256 of the Python case file) and the dotted groups of
the generated table below.

- Values: the expected artifacts are the Python bytes (`vendor/py/parity/`
  files referenced unchanged, inline artifacts JCS-equal), except where a
  section-1 decision changes the value; such a case derives it from the Python
  case plus the decision and names the decision in `index.json` (`decisions`)
  and in its derivation. PS-25: the 27 compile refusals become
  `{status, code, diagnostics: []}`. PS-35: the 4 compile successes become
  `{status: "ok", diagnostics: []}` with the UNSEALED `/payload` pointer (the
  `admission-*` form); the twin records of these 4 cases already carry the
  decided form (conductor ruling 2026-10-19, PS-35 double application), so each
  index entry lists PS-35 in `twinApplied` too and its value is the twin record
  unchanged, `/payload` included once. PS-26: the 3 `export.serialize.drawio-*` successes carry
  the prepared report entries and every entry index
  (`artifacts/export.serialize.*.serialize-result.json`); the derivation tool
  checks that no other member differs from the DP-SERIALIZE rule.
- Re-expressed, never recomputed: artifact paths (`vendor/py/parity/`, also
  inside the `mapExportSequence` steps); the Python UNSEALED pointer lists in
  the `{pointer, reason}` form with the same pointers; comparator ids
  (`compile-verdict/1` -> `result-exact/1` once PS-25/PS-35 seal the whole
  PureResult; `stage-trace/1` -> `source-immutability/1`, and the `trace`
  artifact is listed UNSEALED as runtime mechanics; `lint-includes/1` is a new
  pinned comparator; `drawio-structure/1` reads the Python-shaped projection);
  the sequence case `export.map.sequence-aba` (role `results` -> `output` with
  `seam-exact/1`, status spelling `sequence` -> `ok`, A5).
- Packages: the 73 vendored profiles on the lot-0 packages use the JS-vendored
  lot-0 files (same raw SHA-256); the 2 profiles on the render packages use
  `vendor/py/packages/`. `manifest.json` lists the package inputs of every
  vendored profile.
- Index: clause = the sections cited by the Python clause with their full line
  ranges, `vendored.citation` = the Python clause text; author `spec-seal`;
  the derivation states the vendoring origin and quotes the Python derivation;
  the wrong implementation names the Python witness.
- Not vendored: `export.prepare.success`, `-repairable-pre-normalize`,
  `-options-unknown-member` are runtime-specific (PS-36, PS-34); the two-sided
  groups `render.base.*`, `render.regions.*`, `render.switch.*`,
  `render.ticks.*` stay in their seal (section 5).
- Aliases (PS-37): `render.ticks.half-even` is an alias of
  `ticks-001-half-even` and `render.regions.mixed-label-heights` of
  `region-010-mixed-heights` (`aliases` in `manifest.json`, with the SHA-256 of
  the Python case file); no second copy is vendored.

## Fix-round record

| Input | Disposition |
| --- | --- |
| astra #1 comparators not pinned | Fixed: `comparators/` pinned in `seal.json` and `manifest.json` (source SHA-256, export, zero tolerance) with the parent manifests and the extended lot-0 corpus manifest; acceptance and rejection proven by the seal test. |
| astra #2 required fields escape comparison | Fixed: full Result/1 and PureResult records for every case, refusals included; IR records with copied geometry, style and label (B21); serializer result, ordering, options and metadata checks. Exact routes stay UNSEALED with invariants (harmonization K5: DESIGN fixes no routing rule), as the finding allows. |
| astra #3 mandatory coverage | Fixed: bound neutral and grid successors with complete Layout/R/loss-map paths, template painting, navigation, terminate/subtype mappings, BPMN column facts, the twin library manifest (empty); the private consumer's Python export manifest stays UNSEALED (U-12). |
| astra #4 digest vectors | Fixed: multi-target reversed bags (render-006/007, digest-007/008), reversed descriptor pins and metric resources, one-byte metric change (digest-004..006, render-023) with sealed relations. |
| astra #5 badge size | Fixed: explicit badge size (template-008: (190000, 320000, 30000, 15000)) and a size variation (template-011); the layout badge uses viewBox × 1000 (K6). |
| astra #6 marker loss | Fixed under B23: the sparx export lists the marker recipe; the loss keeps the exact source `/rootElements/1/artifacts/1` and unavailable result coordinates (loss-only iteration) instead of `/ir/1`. |
| astra #7 repeated-view trace | Fixed: region-015 selects View_A / external-lane (d-Input_Order at (332000, 10000), label (335000, 60000)). |
| F-JS-L4-01..13, 15 | Applied (table above). |
| F-JS-L4-14 | Not vendored in this round (no Python corpus/1 projection exists yet); closed by the parity sync below. |

## Block-B parity sync

Authority: BLOCKB-PARITY-SYNC.md (section 1 decisions, section 2 import rules,
apply plan 3.2), DESIGN R3.3 first. Own-side changes:

| Decision | Applied as | Cases |
| --- | --- | --- |
| PS-06 | DP-IO object-centre line (replaces the K2 per-block centring); `derive/lot4-geometry.mjs` `regionRow` | values: `region-010-mixed-heights` (Input_A y 17000 -> 10000, label 67000 -> 60000), `layout-008-neutral-successor`, `layout-009-grid-successor` (Task_A `a-first` y 7008 -> 8 on Z-page; no incident edge, body and page bounds unchanged) and their consumers `render-021-neutral-successor`, `render-022-grid-successor`, `export-025-neutral-successor`, `export-026-grid-successor` (layout artifacts, R occurrence bounds, layoutDigest, payloadDigest, viewRevision, IR node bounds, `H(ir)`); `region-011-single-rounding` is unchanged (both rules round 0.5 and 64000.5 to 0 and 64000) |
| PS-33 | `layoutTicks` and `layoutRegions` return PureResult: role `result` `{status, payload, diagnostics: []}` with `result-exact/1` instead of the raw `output` with `seam-exact/1` | `ticks-001…004`, `region-001…017` |
| PS-07 | DP-LOSS adapter-declared losses | docs |
| PS-24 | decision 2 reworded as a fixture choice | docs |
| PS-34 | DP-PREPARE closed options record | docs |
| PS-H20, PS-H21, PS-H22 | vendored Python cases with PS-25, PS-26, PS-35 applied; PS-36 exclusions | 194 cases (section above) |
| PS-37 | aliases instead of copies | `manifest.json` `aliases` |

The PS-06 vectors were re-derived by hand before sealing: `region-010`
(A 25000, B 53000, RH 98000, cy 35000), the Z-page rows of `layout-008` and
`layout-009` (A 40000, B 54000, RH 94016, cy 40008), `region-011` (cy 32000.5;
0.5 -> 0, 64000.5 -> 64000). After PS-06 and PS-33, the canonical inputs and
expected results of `region-010-mixed-heights` and `ticks-001-half-even` equal
those of the Python seal's `render.regions.mixed-label-heights` and
`render.ticks.half-even` (the PS-37 twins).

## Verification

`node --test tests/profile-lot4-seal.test.mjs` checks the seal byte for byte
(one-byte, missing and extra file witnesses), the case format and every pinned
artifact digest, full refusal records, clause citations against the section
ranges and line digests (set `LOT4_DESIGN` to the R3.3 bytes to repeat the line
hashes), the comparator pins and parents, comparator acceptance and rejection,
the profile-report/2 and LINK-ROUTE self-checks, the sealed relations, the
independence guard and its bypass witnesses, the brand/path guards, the
parity-sync checks (PS-33/PS-06 seams; every vendored file digest, each
vendored value equal to the Python value except the named PS-25/PS-35/PS-26
decisions, the aliases and the PS-36 exclusions; the twin-applied PS-35 marks
read from `twinApplied`; the Python-shaped `drawio-structure/1` and
`lint-includes/1` witnesses) and the reseal ledger chain (the earlier ledgers as
history, the twin-applied field ledger bound to the current bytes).

## Cases and wrong implementations

<!-- generated:cases -->
| Case | Group | Operation | Expected | Fails against |
| --- | --- | --- | --- | --- |
| `ticks-001-half-even` | ticks | layoutTicks | ok | Math.round (half up) yields [1,2,3,4,0,-1,-2]; half-away-from-zero yields [1,2,3,4,-1,-2,-3]. |
| `ticks-002-rational-not-binary` | ticks | layoutTicks | ok | Rounding the binary64 product (even or half up) gives 2001, 2003, 4005 and 8009. |
| `ticks-003-negative-zero-and-tiny` | ticks | layoutTicks | ok | Emitting -0 (Python -0.0 or a float) instead of integer 0, or half-up rounding of 2.5 to 3. |
| `ticks-004-large-and-integral` | ticks | layoutTicks | ok | Half-up rounding gives -1234567 and 98765433. |
| `region-001-single-anchored` | region | layoutRegions | ok | Centring on the lane, ignoring headerWidth, placing the label beside the object, or centring the row on the lane centre (y 43000). |
| `region-002-wider-label` | region | layoutRegions | ok | Using the object width only for extent/collision (left 472000 for the label) or left-aligning the object. |
| `region-003-collision-shift` | region | layoutRegions | ok | Overlapping items, shifting the earlier item left, or using zero spacing instead of the gap token. |
| `region-004-no-anchor-sequence` | region | layoutRegions | ok | Starting at the lane x (30000) or the header edge (60000), or spreading items evenly. |
| `region-005-mixed-anchor` | region | layoutRegions | ok | Honouring the anchor centre despite a collision (72000) or clamping only to the content edge. |
| `region-006-clamp-left` | region | layoutRegions | ok | Drawing the item over the lane header (left 32000). |
| `region-007-grow-lane-width` | region | layoutRegions | ok | Clamping the item inside the lane (shifting it left) instead of growing the lane body. |
| `region-008-grow-page` | region | layoutRegions | ok | Growing the lane but not the page, or clipping the item. |
| `region-009-grow-lane-height` | region | layoutRegions | ok | Keeping the 70000 body and letting the label fall outside it. |
| `region-010-mixed-heights` | region | layoutRegions | ok | Centring each object+label block on its own (Input_A at y 17000, label 67000: the superseded harmonization K2 reading), or a row height without the label heights (70000). |
| `region-011-single-rounding` | region | layoutRegions | ok | Rounding intermediate centres or halves (left 1352) or rounding 0.5 up to 1. |
| `region-012-band-row` | region | layoutRegions | ok | Placing references in the band without the header/padding rule, or by lane rules of another region key. |
| `region-013-empty-region` | region | layoutRegions | ok | Applying minHeight or padding growth to a region with no items. |
| `region-014-zero-tokens` | region | layoutRegions | ok | Substituting hidden defaults for zero-valued tokens. |
| `region-015-repeated-view` | region | layoutRegions | ok | Sharing one rectangle across processes/pages or reusing the first page's geometry for every view. |
| `region-016-multi-band-a` | region | layoutRegions | ok | Sharing one rectangle across processes/pages or reusing the first page's geometry for every view. |
| `region-017-multi-band-b` | region | layoutRegions | ok | Sharing one rectangle across processes/pages or reusing the first page's geometry for every view. |
| `layout-001-main` | layout | layout | ok | Leaving IO in its imported position, writing it into a work lane, moving unplaced occurrences, or omitting the report header members. |
| `layout-002-repeated-views` | layout | layout | ok | Computing region geometry once per semantic element and copying it to every page. |
| `layout-003-multi-process` | layout | layout | ok | Resolving both references into the first process's band. |
| `layout-004-empty-process` | layout | layout | ok | Inventing an IO row, a lane or a band for an empty process. |
| `layout-005-missing-lane` | layout | layout | refused:render-region-missing | Creating a lane in layout, falling back to the pool or page rectangle, dropping the IO silently, or returning profile-open from the primitive. |
| `layout-006-neutral-fixture` | layout | layout | refused:render-region-missing | Treating region content as the whole page or plane (a hidden private default). |
| `layout-007-grid-fixture` | layout | layout | refused:render-region-missing | Inventing a side column from the region tokens alone. |
| `layout-008-neutral-successor` | layout | layout | ok | Keeping the lot-0 refusal for a bound successor, centring the row on the lane, ignoring the 8-tick padding, or centring the label-less Task_A block on its own (y 7008). |
| `layout-009-grid-successor` | layout | layout | ok | Using the base lane width for the stripe, a default stripe width, a stripe on one page only, anchoring on an activity absent from the page, or centring the label-less Task_A block on its own (y 7008). |
| `layout-010-anchor-twice` | layout | layout | ok | Anchoring on the first or nearest Task_Check record, or refusing the layout. |
| `layout-011-geometry-theme-gated` | layout | layout | refused:profile-open | Ignoring the themeId selection (laying out with plain returns the layout-001 result), laying out with the wide-own padding 12000 as if the geometry:theme policy were approved, or refusing theme-geometry-conflict by comparing wide-own with its fallback plain (a single-theme layout checks no other theme). |
| `synthetic-001-band-stripe` | synthetic | layout | ok | Emitting the stripe only in R, giving it a semanticId, sizing it from the header token, or labelling it with an empty string. |
| `synthetic-002-per-page` | synthetic | layout | ok | One stripe per owner across pages, or reusing View_Z geometry on View_A. |
| `synthetic-003-per-owner` | synthetic | layout | ok | Emitting a stripe for every selected owner on every page. |
| `synthetic-004-region-missing` | synthetic | layout | refused:render-region-missing | Skipping the stripe silently or drawing it over the pool. |
| `synthetic-005-grid-fixture` | synthetic | layout | refused:render-region-missing | Inventing a side column for the stripe, or skipping the declaration because no placement uses the region. |
| `synthetic-006-attached-badge` | synthetic | layout | ok | Representing a page only through its root (no badge), taking the badge size as 30x15 ticks, anchoring at the node top-left, refusing the unbound attachment region, or moving the aid. |
| `synthetic-007-badge-ambiguous-anchor` | synthetic | layout | refused:render-region-missing | Attaching to the first or nearest Task_Check record. |
| `synthetic-008-badge-no-anchor` | synthetic | layout | refused:render-region-missing | Picking the only association of the aid as an implicit anchor. |
| `synthetic-009-badge-hide-source` | synthetic | layout | refused:render-unsupported | Hiding the source association and keeping the badge, or ignoring hideSource. |
| `synthetic-010-unbound-region` | synthetic | layout | refused:render-region-missing | Treating any unbound region as an attachment region or leaving the aid unplaced silently. |
| `admission-001-lot4-package` | admission | compileProfile | ok | Rejecting boundRole over bindingOwner, render traversals in export recipes, capability predicates guarded by semantic, chained theme fallbacks, or support roles declared by an ensure recipe. |
| `admission-002-variant-conflict` | admission | compileProfile | ok | Refusing at compile time a condition the DESIGN assigns to a runtime refusal code. |
| `admission-003-variant-labels-native` | admission | compileProfile | ok | Refusing at compile time a condition the DESIGN assigns to a runtime refusal code. |
| `admission-004-variant-byte-claim` | admission | compileProfile | ok | Refusing at compile time a condition the DESIGN assigns to a runtime refusal code. |
| `admission-005-variant-unsupported` | admission | compileProfile | ok | Refusing at compile time a condition the DESIGN assigns to a runtime refusal code. |
| `admission-006-variant-parent-order` | admission | compileProfile | ok | Refusing at compile time a condition the DESIGN assigns to a runtime refusal code. |
| `admission-007-variant-dup-emit` | admission | compileProfile | ok | Refusing at compile time a condition the DESIGN assigns to a runtime refusal code. |
| `admission-008-variant-missing-field` | admission | compileProfile | ok | Refusing at compile time a condition the DESIGN assigns to a runtime refusal code. |
| `admission-009-neutral-successor` | admission | compileProfile | ok | Refusing a region role declared only through an ensure recipe, or requiring the lot-0 base pin. |
| `admission-010-grid-successor` | admission | compileProfile | ok | Refusing a region role declared only through an ensure recipe, or requiring the lot-0 base pin. |
| `signature-001-duplicate` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `signature-002-wrong-type` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `signature-003-missing` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `signature-004-extra` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `signature-005-fold-range` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `signature-006-rotation-domain` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `signature-007-negative-ticks` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `signature-008-fractional-ticks` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `signature-009-boolean` | template | compileProfile | refused:profile-glyph-shape | Accepting the glyph and failing later at render time, reporting profile-schema/profile-type instead of profile-glyph-shape, or a refusal with a fabricated diagnostic. |
| `render-001-main-plain` | render | resolveTheme | ok | Declaration-order winners, merging region tokens into style, sorting coverage by ID, omitting nonvisual supports/ports, hashing a non-normalized bag, or a report without header members. |
| `render-002-repeated-views` | render | resolveTheme | ok | Keeping one occurrence per semantic ID, sorting occurrences by semantic ID or by pageId instead of page order. |
| `render-003-multi-process` | render | resolveTheme | ok | Rendering the shared DataStore itself or replacing the local reference name by the store name. |
| `render-004-empty-process` | render | resolveTheme | ok | Dropping nonvisual elements from coverage or inventing a lane/band occurrence. |
| `render-005-neutral-fixture` | render | resolveTheme | ok | Rendering an empty label box for Task_A, keeping the '[Aid] ' prefix, or copying region tokens into style. |
| `render-006-token-precedence` | render | resolveTheme | ok | Whole-bag replacement, bioc over native, theme over notion, ignoring the fallback chain, applying a record to another target, or a declaration-order winner. |
| `render-007-reordered-bags` | render | resolveTheme | ok | Hashing the caller order (different overridesDigest/diStylesDigest), sorting tokens but not records, or letting the last record win. |
| `render-008-sparse-occurrence-override` | render | resolveTheme | ok | Applying the occurrence override to every occurrence of the semantic ID, or materializing all resolved tokens into the override record before hashing. |
| `render-009-semantic-override` | render | resolveTheme | ok | Applying a semantic override to the first occurrence only. |
| `render-010-style-conflict` | render | resolveTheme | refused:render-style-conflict | Taking the first or last facet in profile order. |
| `render-011-token-unknown` | render | resolveTheme | refused:render-token-invalid | Ignoring unknown tokens or passing them to the renderer. |
| `render-012-token-value` | render | resolveTheme | refused:render-token-invalid | Accepting CSS colour names, negative widths or non-finite values. |
| `render-013-token-negative` | render | resolveTheme | refused:render-token-invalid | Accepting CSS colour names, negative widths or non-finite values. |
| `render-014-stale-choice-label` | render | resolveTheme | refused:render-stale | Copying the layout label blindly (accepts 'yes') or silently replacing it without invalidating the layout digest. |
| `render-015-missing-label` | render | resolveTheme | refused:render-stale | Rendering a label the layout never fitted. |
| `render-016-extra-label` | render | resolveTheme | refused:render-stale | Keeping a label that the profile does not produce. |
| `render-017-unsupported-coverage` | render | resolveTheme | ok | Falling back to a default TextAnnotation glyph, silently dropping the element from coverage, or refusing the whole render. |
| `render-018-unknown-theme` | render | resolveTheme | refused:render-stale | Falling back to the first or root theme. |
| `render-019-theme-alias` | render | resolveTheme | ok | Refusing a declared theme alias, or recording the alias in binding.themeId (another themeDigest). |
| `render-020-geometry-theme-gated` | render | resolveTheme | refused:profile-open | Rendering with per-theme geometry as if approved. |
| `render-021-neutral-successor` | render | resolveTheme | ok | Reusing the lot-0 supplied render records, or treating the bound lane as unsupported. |
| `render-022-grid-successor` | render | resolveTheme | ok | Dropping the stripe records, styling them as semantic occurrences, or recomputing their geometry in R. |
| `render-023-metric-chain` | render | resolveTheme | ok | Hashing only the selected theme's resource, keeping chain order, or reusing the neutral digest for the one-byte variant. |
| `render-024-variety` | render | resolveTheme | ok | Rendering the terminate end with the ordinary end glyph, or rendering the called process. |
| `synthetic-011-stripe-styled` | synthetic | resolveTheme | ok | Giving the stripe a semanticId or coverage entry, applying semantic/DI levels to it, or sorting it first. |
| `synthetic-012-badge-styled` | synthetic | resolveTheme | ok | Dropping the badge, hiding the source association (hideSource false), or recomputing the badge from the viewBox in R. |
| `synthetic-013-foreign-record` | synthetic | resolveTheme | refused:render-stale | Rendering an anonymous record or silently dropping it. |
| `decision-001-question-and-choices` | decision-label | resolveTheme | ok | Host or locale toUpperCase (U+A7CB for U+0264 on Unicode 16 hosts, dotted I for istanbul), simple case mapping without expansions, inventing branch text for the unnamed flow, or adding a TextAnnotation for the question. |
| `decision-002-lower-final-sigma` | decision-label | resolveTheme | ok | Lowering every sigma to U+03C3, dropping U+0307, or locale-specific dotless i. |
| `decision-003-host-case-stale` | decision-label | resolveTheme | refused:render-stale | An implementation using the host case tables accepts this layout (and refuses the correct one in decision-001). |
| `decision-004-locale-case-stale` | decision-label | resolveTheme | refused:render-stale | Locale-dependent case conversion. |
| `decision-005-case-operator` | decision-label | evaluateValue | ok | toUpperCase/toLowerCase of the host, simple mappings, or sigma without context. |
| `digest-001-page-rename` | digest | resolveTheme | ok | Hashing pageId only, deriving the name from pageId, or trimming/normalizing the captured name. |
| `digest-002-label-move` | digest | resolveTheme | ok | Changing semanticRevision for a presentation-only move, or not invalidating payloadDigest. |
| `digest-003-baseline` | digest | renderDigests | ok | Omitting empty bags from the hash, hashing the metric text instead of its raw bytes, or including payloadDigest in viewRevision. |
| `digest-004-descriptor-pins-reversed` | digest | renderDigests | ok | Hashing the caller pin order or the profileIdentity order. |
| `digest-005-metric-resources-reversed` | digest | renderDigests | ok | Hashing the supplied order, or deduplicating resources by content. |
| `digest-006-metric-byte-changed` | digest | renderDigests | ok | Keying the metric digest on the resource id only, or normalizing the metric JSON before hashing. |
| `digest-007-bags-sorted` | digest | renderDigests | ok | Changing semanticRevision for a view override, or expanding sparse records before hashing. |
| `digest-008-bags-reversed` | digest | renderDigests | ok | Hashing caller order, or sorting occurrence records by occurrenceKey before pageId. |
| `verify-001-alias-fresh` | freshness | verifyRenderData | ok | Refusing the alias as an unknown theme, or recomputing themeDigest for the alias name. |
| `verify-002-override-added` | freshness | verifyRenderData | refused:render-stale | Ignoring the override bags in freshness. |
| `verify-003-occurrence-moved` | freshness | verifyRenderData | refused:render-stale | Checking digests only (accepts the self-consistent tampered R). |
| `template-001-header-band` | template | templateGeometry | ok | Scaling the header with the viewBox ratio. |
| `template-002-header-band-growth` | template | templateGeometry | ok | Uniformly scaling the header to 36000. |
| `template-003-header-band-short` | template | templateGeometry | ok | A negative body height or a header overflowing the bounds. |
| `template-004-header-band-zero` | template | templateGeometry | ok | Substituting a default header height for 0. |
| `template-005-corner-fold-even` | template | templateGeometry | ok | Math.round gives fold 503 and path x 502. |
| `template-006-corner-fold-ratio` | template | templateGeometry | ok | Half-up rounding gives fold 3; rounding the centre half-up gives (100013, 50006). |
| `template-007-corner-fold-zero` | template | templateGeometry | ok | Rejecting foldRatio 0 or substituting a default fold. |
| `template-008-attached-badge` | template | templateGeometry | ok | Deriving the size from the viewBox numbers (30x15 ticks), anchoring at the node top-left or centring the badge on the node. |
| `template-011-attached-badge-size` | template | templateGeometry | ok | Ignoring the declared size in favour of the glyph viewBox (30000x15000 or 30x15). |
| `template-009-band-stripe` | template | templateGeometry | ok | Using the region header width or a trailing stripe. |
| `template-010-band-stripe-clamped` | template | templateGeometry | ok | Overflowing the region with a 20000-wide stripe. |
| `template-012-grid-aid-header-band` | template | templateGeometry | ok | Painting the aid as a plain rectangle or scaling the 12-tick header with the occurrence. |
| `template-013-grid-stripe-header-band` | template | templateGeometry | ok | Painting the stripe with the band-stripe placement rule or a default glyph. |
| `template-014-native-glyph` | template | templateGeometry | refused:render-unsupported | Returning the node bounds as if it were a template. |
| `legacy-001-standard` | legacy-theme | resolveLegacyTheme | ok | A hard-coded built-in standard look. |
| `legacy-002-legend` | legacy-theme | resolveLegacyTheme | ok | Reusing the standard theme or a library default custom look. |
| `legacy-003-colored` | legacy-theme | resolveLegacyTheme | ok | Hard-coding DI colour application inside the library. |
| `legacy-004-no-alias-data` | legacy-theme | resolveLegacyTheme | refused:render-stale | A hidden client default for standard, or legacy-unmapped (reserved for legacy diagnostic codes). |
| `legacy-005-exact-name` | legacy-theme | resolveLegacyTheme | refused:render-stale | Case-insensitive alias matching. |
| `legacy-006-alias-not-theme` | legacy-theme | resolveTheme | refused:render-stale | Resolving legacy look names inside the generic resolver. |
| `legacy-007-colored-sparse-di` | legacy-theme | resolveTheme | ok | Applying imported colours to every element or letting notion/facet tokens beat DI tokens. |
| `legacy-008-look-independent-recognition` | legacy-theme | resolveTheme | ok | Classifying the '[Aid]' marker from the selected look (legacy legend behaviour). |
| `history-001-theme-round-trip` | theme-history | theme-sequence | ok | Replaying history or N on a theme switch, carrying dim tokens into the second plain view, or changing semanticRevision. |
| `history-002-override-round-trip` | theme-history | theme-sequence | ok | Persisting override state in the semantic tree or leaving a residue after removal. |
| `switch-001-paint-only` | theme-history | checkThemeSwitch | ok | Forcing a relayout or refusing paint-only switches. |
| `switch-002-region-token` | theme-history | checkThemeSwitch | refused:theme-geometry-conflict | Reusing the plain geometry with another padding. |
| `switch-003-text-fit-token` | theme-history | checkThemeSwitch | refused:theme-geometry-conflict | Comparing region tokens only. |
| `switch-004-own-geometry` | theme-history | checkThemeSwitch | refused:profile-open | Allowing the geometry:theme policy without approval, or reporting theme-geometry-conflict. |
| `switch-005-missing-token` | theme-history | checkThemeSwitch | refused:theme-geometry-conflict | Treating missing tokens as equal to the other theme's values. |
| `switch-006-legacy-chain` | theme-history | checkThemeSwitch | ok | Resolving geometry tokens without the fallback chain. |
| `switch-007-metrics-resource` | theme-history | checkThemeSwitch | refused:theme-geometry-conflict | Comparing tokens only and ignoring the metric resource. |
| `export-001-main-drawio` | export | mapExport | ok | Allocating IDs in emission order or by semantic ID, emitting IR records without the copied geometry/style/label, pointing capability losses at /ir records, one artifact record per page, dropping a loss, or unsorted report entries/idMap. |
| `export-002-main-sparx-native` | export | mapExport | ok | Prefixing native IDs, omitting the marker loss for the native target, pointing it at the first node record, or emitting edge labels whose native ID would duplicate the edge. |
| `export-003-repeated-drawio` | export | mapExport | ok | Collapsing repeated views to one idMap record, or sorting idMap by page order. |
| `export-004-repeated-sparx-ambiguous` | export | mapExport | refused:export-id-ambiguous | Suffixing IDs or keeping the first occurrence. |
| `export-005-multi-drawio` | export | mapExport | ok | Emitting one band for both processes or merging the two references by store. |
| `export-006-empty-drawio` | export | mapExport | ok | Emitting nodes for nonvisual coverage records. |
| `export-007-synthetic-drawio` | export | mapExport | ok | Emitting name '' for an absent label, adding an idMap record with an invented source ID, or a native-ID fallback for the synthetic key. |
| `export-008-synthetic-sparx-ambiguous` | export | mapExport | refused:export-id-ambiguous | Using the synthetic key as a native ID. |
| `export-009-neutral-fixture` | export | mapExport | ok | Using the lot-0 supplied render records instead of R, or emitting name '' for Task_A. |
| `export-010-decision-labels` | export | mapExport | ok | Emitting a separate annotation node for the question, inventing a label for the unnamed branch, or exporting the lower-case source text. |
| `export-011-labels-native-ambiguous` | export | mapExport | refused:export-id-ambiguous | Silently suffixing label IDs. |
| `export-012-parent-order` | export | mapExport | refused:export-parent-order | Deferring or reordering emission to satisfy the parent. |
| `export-013-duplicate-key` | export | mapExport | refused:export-parent-invalid | Overwriting the first record or allocating fresh numbers. |
| `export-014-missing-required` | export | mapExport | refused:export-field-invalid | Emitting source '' or skipping the record. |
| `export-015-unknown-format` | export | mapExport | refused:export-format-unsupported | Falling back to the first export spec. |
| `export-016-page-shape` | export | compileProfile | refused:profile-export-field | Accepting adapter-specific page fields. |
| `export-017-byte-claim-unqualified` | export | mapExport | ok | Reporting engine-byte-compatible from the profile declaration. |
| `export-018-unsupported-capability` | export | mapExport | refused:render-unsupported | Dropping the occurrence with a mapped loss and returning the rest, or refusing export-format-unsupported. |
| `export-019-unsupported-coverage` | export | mapExport | refused:render-unsupported | Exporting the rest of the diagram without the note. |
| `export-020-stale-layout` | freshness | mapExport | refused:render-stale | Repairing or recomputing R inside mapExport instead of refusing. |
| `export-021-stale-envelope` | freshness | mapExport | refused:render-stale | Repairing or recomputing R inside mapExport instead of refusing. |
| `export-022-stale-payload` | freshness | mapExport | refused:render-stale | Repairing or recomputing R inside mapExport instead of refusing. |
| `export-023-stale-theme` | freshness | mapExport | refused:render-stale | Repairing or recomputing R inside mapExport instead of refusing. |
| `export-024-occurrence-mismatch` | freshness | mapExport | refused:render-stale | Checking digests only: the self-consistent tampered R would be exported. |
| `export-025-neutral-successor` | export | mapExport | ok | Exporting without the bound lane, or skipping losses for support occurrences. |
| `export-026-grid-successor` | export | mapExport | ok | Numbering z-last by emission order, a stripe idMap record, or a fabricated tree pointer for a synthetic loss. |
| `export-027-variety-drawio` | export | mapExport | ok | Dropping the calledElement navigation silently, a navigation loss with unavailable coordinates, or exporting the terminate end without its semantic-type/appearance losses. |
| `export-028-variety-sparx` | export | mapExport | ok | Reporting the navigation loss against the calledElement target Process_Review, or suffixing native IDs. |
| `idplan-001-counter-grid` | export-id | exportIdPlan | ok | Numbering in emission order (z-last would be e_14) or allocating the repeated request twice. |
| `idplan-002-counter-domains` | export-id | exportIdPlan | ok | Sorting by pageId text, by request order, or case-insensitively. |
| `idplan-003-digest` | export-id | exportIdPlan | ok | Truncated digests, hashing the semantic ID, or a different tuple order. |
| `idplan-004-native-unique` | export-id | exportIdPlan | ok | Adding an e_ prefix or using occurrence keys. |
| `idplan-005-native-duplicate` | export-id | exportIdPlan | refused:export-id-ambiguous | Keeping the first occurrence or suffixing the second ID. |
| `idplan-006-native-synthetic` | export-id | exportIdPlan | refused:export-id-ambiguous | Using the synthetic key or the owner ID as the native ID. |
| `idplan-007-utf16-key-order` | export-id | exportIdPlan | ok | Code-point or UTF-8 byte order of occurrence keys (U+E000 e_2, U+10000 e_3), locale collation (z before Z), or numbering in request order (U+E000 e_0). |
| `serialize-001-main-drawio` | serializer | serializePrepared | ok | Regenerating IDs, dropping labels, compressing despite compression none, CRLF newlines, a modified/etag attribute, another attribute order, a digest of something other than the bytes, or a report that drops the losses. |
| `serialize-002-repeated-drawio` | serializer | serializePrepared | ok | Merging pages or ordering diagrams by pageId. |
| `serialize-003-xml-escaping` | serializer | serializePrepared | ok | Unescaped markup, entity double-escaping, a raw tab in the attribute, or trimming the name. |
| `serialize-004-determinism` | serializer | serializePrepared-sequence | ok | Timestamps, call counters or a shared ID table across calls. |
| `serialize-005-stale-binding` | freshness | serializePrepared | refused:render-stale | Serializing anyway or repairing the binding. |
| `serialize-006-revision-mismatch` | freshness | serializePrepared | refused:render-stale | Serializing anyway or repairing the binding. |
| `serialize-007-stale-profile-digest` | freshness | serializePrepared | refused:render-stale | Serializing anyway or repairing the binding. |
| `serialize-008-stale-descriptor-digest` | freshness | serializePrepared | refused:render-stale | Serializing anyway or repairing the binding. |
| `bpmn-001-main-native` | bpmn-column | serializeBpmn | ok | Remapping the store to a TextAnnotation, giving the band a processRef, moving IO into a lane, or stripping the marker. |
| `bpmn-002-multi-native` | bpmn-column | serializeBpmn | ok | Deduplicating references by store, or overwriting the local reference name with the store name. |
| `bpmn-003-variety-native` | bpmn-column | serializeBpmn | ok | Dropping calledElement, writing an ordinary end event, or downgrading the service task to a task. |
| `legacy-adapter-001-manifest` | legacy-adapter | legacy-adapter-manifest | ok | Message-text heuristics, a global table shared by all adapters, unlisted codes mapped by similarity, or an undeclared twin adapter. |
| `legacy-adapter-002-duplicate-id` | legacy-adapter | mapLegacyDiagnostics | ok | One entry for the whole error, pointers guessed from the message, or ruleId set to the adapter id. |
| `legacy-adapter-003-missing-endpoint` | legacy-adapter | mapLegacyDiagnostics | ok | Fabricating the root pointer. |
| `legacy-adapter-004-unknown-format` | legacy-adapter | mapLegacyDiagnostics | ok | Refusing to map a listed code. |
| `legacy-adapter-005-unmapped-emitted` | legacy-adapter | mapLegacyDiagnostics | ok | Mapping by message text to export-format-unsupported. |
| `legacy-adapter-006-message-ignored` | legacy-adapter | mapLegacyDiagnostics | ok | id-collision inferred from the message, or an exact pointer for an unmapped code. |
| `legacy-adapter-007-empty-id` | legacy-adapter | mapLegacyDiagnostics | ok | An entry with targetId ''. |
| `legacy-adapter-008-codeless` | legacy-adapter | mapLegacyDiagnostics | ok | Using the exception name or message as legacyCode. |
| `legacy-adapter-009-workshop-dtd` | legacy-adapter | mapLegacyDiagnostics | ok | Treating workshop parse errors as successful exports. |
| `legacy-adapter-010-adapter-scope` | legacy-adapter | mapLegacyDiagnostics | ok | One global mapping table for every adapter. |
| `legacy-adapter-011-declared-notice` | legacy-adapter | mapLegacyDiagnostics | ok | Treating the notice as info text without a loss entry. |
| `legacy-adapter-012-undeclared-notice` | legacy-adapter | mapLegacyDiagnostics | ok | Passing an unknown notice through as success. |
| `legacy-adapter-013-notice-class-not-closed` | legacy-adapter | mapLegacyDiagnostics | ok | Mapping any manifest-declared class to export-loss/<class>. |
| `prepare-001-unknown-format` | prepare | prepareExport | refused:export-format-unsupported | Running C/N or layout before rejecting the format, reporting stage entries, or mutating the source. |
| `prepare-002-missing-support-gated` | prepare | prepareExport | refused:profile-open | Creating the lane during preparation, returning render-region-missing from the gated path, or reporting C change entries. |
| `prepare-003-lint-blocked` | prepare | prepareExport | refused:task-name-missing-pre-normalize | Continuing to N or later stages, refusing with a generic lint code, omitting the blocking entry from the report, or a fabricated result coordinate. |
| `export.compile.all-fields-valid` | export.compile | compileProfile | ok | Any output that differs from the Python-sealed record of this witness: every optional common field with its type compiles. |
| `export.compile.digest-nonzero-origin` | export.compile | compileProfile | refused:profile-type | Any output that differs from the Python-sealed record of this witness: non-counter policies require counterOrigin zero. |
| `export.compile.digest-zero-origin` | export.compile | compileProfile | ok | Any output that differs from the Python-sealed record of this witness: a non-counter policy with counterOrigin 0 compiles. |
| `export.compile.edge-fill` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: fill is a node field, not an edge field. |
| `export.compile.edge-missing-target` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: edge requires id, source and target. |
| `export.compile.label-missing-text` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: label requires id and text. |
| `export.compile.metadata-missing-value` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: metadata requires name and value. |
| `export.compile.native-nonzero-origin` | export.compile | compileProfile | refused:profile-type | Any output that differs from the Python-sealed record of this witness: non-counter policies require counterOrigin zero. |
| `export.compile.node-duplicate-field` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: duplicate fields refuse. |
| `export.compile.node-fill-number` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: string fields need strings. |
| `export.compile.node-font-size-string` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: numeric fields need numbers. |
| `export.compile.node-unknown-field` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: fields outside the node vocabulary refuse. |
| `export.compile.page-missing-name` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: page requires string id and name. |
| `export.compile.page-parent` | export.compile | compileProfile | refused:profile-type | Any output that differs from the Python-sealed record of this witness: a page emits at the artifact root and must omit parent. |
| `export.compile.page-shape` | export.compile | compileProfile | refused:profile-export-field | Any output that differs from the Python-sealed record of this witness: page.shape cannot pass. |
| `export.map.bind-ambiguous` | export.map | mapExport | refused:profile-ambiguous-binding | Any output that differs from the Python-sealed record of this witness: a bind with cardinality one over several handles refuses profile-ambiguous-binding. |
| `export.map.capability-byte-claim` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: no feature becomes byte-compatible by declaration alone. |
| `export.map.capability-losses` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: capability predicates evaluate once per occurrence; declared losses map like the loss action. |
| `export.map.capability-none` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: with no applicable capability record the artifact stays at the structural ceiling. |
| `export.map.capability-unsupported` | export.map | mapExport | refused:render-unsupported | Any output that differs from the Python-sealed record of this witness: an unsupported necessary occurrence refuses the entire artifact (no partially valid download). |
| `export.map.compat-digest-mismatch` | export.map | mapExport | refused:profile-digest-mismatch | Any output that differs from the Python-sealed record of this witness: compatibility rows apply before export. |
| `export.map.counter-reuse` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: repeated outputId requests reuse one ID; only requested keys are allocated. |
| `export.map.digest-policy` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: digest output IDs are e_ + full SHA-256 of JCS [pageId, occurrenceKey, domain]. |
| `export.map.edge-before-nodes` | export.map | mapExport | refused:export-parent-order | Any output that differs from the Python-sealed record of this witness: nodes before edges: an edge endpoint emitted later refuses export-parent-order. |
| `export.map.feature-table-witnesses` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: the DESIGN §10.2 feature rows on one drawio artifact: DataStore + DataStoreReference, reference-band and main Participants, Process IO and data associations, Documentation markers, internal calledElement navigation, Terminate. |
| `export.map.field-missing-required` | export.map | mapExport | refused:export-field-invalid | Any output that differs from the Python-sealed record of this witness: a required named field evaluating to MISSING refuses export-field-invalid. |
| `export.map.format-unknown` | export.map | mapExport | refused:export-format-unsupported | Any output that differs from the Python-sealed record of this witness: a format absent from the profile exports refuses export-format-unsupported. |
| `export.map.format-without-adapter` | export.map | mapExport | refused:export-format-unsupported | Any output that differs from the Python-sealed record of this witness: a declared format without a registered Python adapter refuses export-format-unsupported. |
| `export.map.grid-fixture` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: counterOrigin 10, a later child emission uses an earlier preallocated number, node parent of a node. |
| `export.map.kinds-and-losses` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: every export-ir/1 kind, edge endpoints, artifact-global and page metadata, each loss class through the loss action mapping, adapter-declared metadata losses. |
| `export.map.native-policy` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: native ID policy: pageId for a page, semanticId for a semantic occurrence when unique. |
| `export.map.native-policy-anonymous` | export.map | mapExport | refused:export-id-ambiguous | Any output that differs from the Python-sealed record of this witness: an occurrence without semanticId cannot take a native ID. |
| `export.map.native-policy-duplicate` | export.map | mapExport | refused:export-id-ambiguous | Any output that differs from the Python-sealed record of this witness: native IDs that are not unique in the artifact refuse export-id-ambiguous. |
| `export.map.native-policy-repeated-view` | export.map | mapExport | refused:export-id-ambiguous | Any output that differs from the Python-sealed record of this witness: repeated views of one semantic ID make native IDs ambiguous. |
| `export.map.neutral-fixture` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: export IR of the first neutral fixture: counter order, implicit page parents, copied R values, capability losses, repeated-view idMap. |
| `export.map.optional-field-missing` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: an optional named field evaluating to MISSING is omitted; no idMap row without a source identity. |
| `export.map.output-id-native-ambiguous` | export.map | mapExport | refused:export-occurrence-ambiguous | Any output that differs from the Python-sealed record of this witness: a native handle with two occurrences on the current page refuses export-occurrence-ambiguous. |
| `export.map.output-id-native-handle` | export.map | mapExport | ok | Any output that differs from the Python-sealed record of this witness: outputId on a native handle resolves the one exact current-page occurrence. |
| `export.map.parent-invalid-cycle` | export.map | mapExport | refused:export-parent-invalid | Any output that differs from the Python-sealed record of this witness: a parent equal to the record's own id is a cycle. |
| `export.map.parent-invalid-duplicate` | export.map | mapExport | refused:export-parent-invalid | Any output that differs from the Python-sealed record of this witness: duplicate artifact keys refuse export-parent-invalid. |
| `export.map.parent-invalid-kind` | export.map | mapExport | refused:export-parent-invalid | Any output that differs from the Python-sealed record of this witness: a parent of incompatible kind refuses export-parent-invalid. |
| `export.map.parent-invalid-unknown` | export.map | mapExport | refused:export-parent-invalid | Any output that differs from the Python-sealed record of this witness: a handle that this call never emits (cross-call handle) refuses export-parent-invalid. |
| `export.map.parent-order` | export.map | mapExport | refused:export-parent-order | Any output that differs from the Python-sealed record of this witness: pages before containers: an implicit page parent not yet emitted refuses export-parent-order. |
| `export.map.refuse-action` | export.map | mapExport | refused:export-blocked | Any output that differs from the Python-sealed record of this witness: a refuse action aborts the complete export atomically. |
| `export.map.render-unsupported` | export.map | mapExport | refused:render-unsupported | Any output that differs from the Python-sealed record of this witness: R coverage with an unsupported element refuses the export. |
| `export.map.sequence-aba` | export.map | mapExportSequence | ok | Any output that differs from the Python-sealed record of this witness: the symbol table lasts one call, is discarded on refusal and never survives A->B->A. |
| `export.map.stale-descriptor` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: each stale binding field returns render-stale. |
| `export.map.stale-layout` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a changed page name after R invalidates layoutDigest. |
| `export.map.stale-metrics` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: each stale binding field returns render-stale. |
| `export.map.stale-occurrence-geometry` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: an R whose occurrence geometry differs from the supplied layout record is stale even when its digests were recomputed. |
| `export.map.stale-payload` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a payload edited after binding fails payloadDigest. |
| `export.map.stale-profile` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: each stale binding field returns render-stale. |
| `export.map.stale-semantic` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: R bound to an older semantic revision is stale. |
| `export.map.stale-theme-digest` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: each stale binding field returns render-stale. |
| `export.map.stale-theme-unknown` | export.map | mapExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: each stale binding field returns render-stale. |
| `export.prepare.compat-refusal` | export.prepare | prepareExport | refused:profile-digest-mismatch | Any output that differs from the Python-sealed record of this witness: compatibility runs right after option validation: refusal with an empty report, no artifact, no mutation. |
| `export.prepare.lint-refusal-stage-order` | export.prepare | prepareExport | refused:bpmnlint/end-event-required | Any output that differs from the Python-sealed record of this witness: stage order: the first blocking lint stage (pre-normalize, accept) refuses with the complete report so far. |
| `export.prepare.missing-support` | export.prepare | prepareExport | refused:profile-open | Any output that differs from the Python-sealed record of this witness: preparation never creates supports: placements into an unbound region refuse profile-open. |
| `export.prepare.repairable-not-repaired` | export.prepare | prepareExport | refused:association-direction-missing | Any output that differs from the Python-sealed record of this witness: a declared repair recipe that does not repair leaves the pre-N error unresolved after N. |
| `export.prepare.repairable-without-recipe` | export.prepare | prepareExport | refused:association-direction-missing | Any output that differs from the Python-sealed record of this witness: a repairable pre-N error without a declared repair recipe blocks at pre-normalize. |
| `export.prepare.unknown-format` | export.prepare | prepareExport | refused:export-format-unsupported | Any output that differs from the Python-sealed record of this witness: an option format without an exports[] record and adapter refuses before the pipeline. |
| `export.prepare.unknown-theme` | export.prepare | prepareExport | refused:render-stale | Any output that differs from the Python-sealed record of this witness: an option theme that resolves to no theme refuses before the pipeline. |
| `export.serialize.drawio-grid-fixture` | export.serialize | serializePrepared | ok | Any output that differs from the Python-sealed record of this witness: a node parented to another node keeps that parent in the serialized cells. |
| `export.serialize.drawio-kinds` | export.serialize | serializePrepared | ok | Any output that differs from the Python-sealed record of this witness: structural serialization with an edge, a label record and metadata records. |
| `export.serialize.drawio-neutral-fixture` | export.serialize | serializePrepared | ok | Any output that differs from the Python-sealed record of this witness: structural draw.io serialization of a prepared artifact; digest = B(bytes); idMap and capability carried. |
| `export.serialize.format-unsupported` | export.serialize | serializePrepared | refused:export-format-unsupported | Any output that differs from the Python-sealed record of this witness: only registered adapters serialize. |
| `export.serialize.stale-descriptor-digest` | export.serialize | serializePrepared | refused:render-stale | Any output that differs from the Python-sealed record of this witness: the preparation descriptor pins must still match its renderBinding. |
| `export.serialize.stale-profile-digest` | export.serialize | serializePrepared | refused:render-stale | Any output that differs from the Python-sealed record of this witness: the preparation identity must still name the profile its renderBinding was bound to. |
| `export.serialize.stale-semantic` | export.serialize | serializePrepared | refused:render-stale | Any output that differs from the Python-sealed record of this witness: the prepared semantic revision must match its renderBinding. |
| `export.serialize.stale-view` | export.serialize | serializePrepared | refused:render-stale | Any output that differs from the Python-sealed record of this witness: serialization verifies renderBinding freshness. |
| `render.compile.binding-token-duplicate` | render.compile | compileProfile | refused:profile-type | Any output that differs from the Python-sealed record of this witness: duplicate token name in one render binding. |
| `render.compile.grid-profile` | render.compile | compileProfile | ok | Any output that differs from the Python-sealed record of this witness: the second neutral profile with its header-band glyph and synthetic side stripe compiles. |
| `render.compile.native-with-commands` | render.compile | compileProfile | refused:profile-schema | Any output that differs from the Python-sealed record of this witness: native glyph with commands is a schema violation. |
| `render.compile.path-bad-arity` | render.compile | compileProfile | refused:profile-schema | Any output that differs from the Python-sealed record of this witness: path command L with three values is a schema violation. |
| `render.compile.path-valid` | render.compile | compileProfile | ok | Any output that differs from the Python-sealed record of this witness: path glyph with M, L, C, Q, Z of the right arities and a positive viewBox compiles. |
| `render.compile.region-token-fraction` | render.compile | compileProfile | refused:profile-type | Any output that differs from the Python-sealed record of this witness: region tokens are nonnegative integer ticks. |
| `render.compile.synthetic-token-invalid` | render.compile | compileProfile | refused:profile-type | Any output that differs from the Python-sealed record of this witness: synthetic occurrence tokens follow the same signatures. |
| `render.compile.template-param-duplicate` | render.compile | compileProfile | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: duplicate template parameter. |
| `render.compile.template-param-extra` | render.compile | compileProfile | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template glyph with an extra parameter. |
| `render.compile.template-param-missing` | render.compile | compileProfile | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template glyph without its exact parameter set. |
| `render.compile.template-param-type` | render.compile | compileProfile | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter of the wrong type. |
| `render.compile.template-unknown` | render.compile | compileProfile | refused:profile-schema | Any output that differs from the Python-sealed record of this witness: a composite outside the closed template set cannot be expressed. |
| `render.compile.theme-token-type` | render.compile | compileProfile | refused:profile-type | Any output that differs from the Python-sealed record of this witness: theme token with a value outside its render-token/1 signature. |
| `render.compile.theme-token-unknown` | render.compile | compileProfile | refused:profile-type | Any output that differs from the Python-sealed record of this witness: token without a pinned signature. |
| `render.compile.viewbox-negative-height` | render.compile | compileProfile | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: path glyph viewBox needs a positive height. |
| `render.compile.viewbox-zero-width` | render.compile | compileProfile | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: native glyph viewBox needs a positive width. |
| `render.digest.bag-duplicate-target` | render.digest | renderDigests | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: duplicate DiStyles/1 targets refuse. |
| `render.digest.bag-null-token` | render.digest | renderDigests | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: null token values refuse. |
| `render.digest.bag-unknown-member` | render.digest | renderDigests | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: Overrides/1 records are closed: an unknown member refuses. |
| `render.digest.bags-reordered` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: reordered override/style records and tokens normalize identically. |
| `render.digest.bags-sorted` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: non-empty Overrides/1 and DiStyles/1 already in normalized order; overrides change viewRevision but not semanticRevision. |
| `render.digest.distinct-pages` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: two pages with distinct IDs and names in page order (Z-page order 0 before A-page order 1). |
| `render.digest.metric-byte-changed` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: one changed metric byte changes metricsDigest and viewRevision. |
| `render.digest.metric-bytes` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: metricsDigest over {id, sha256=B(raw metric bytes)} of the vendored neutral metrics. |
| `render.digest.occurrence-payload` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: payloadDigest over one occurrence record. |
| `render.digest.occurrence-payload-changed` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: one changed occurrence payload changes payloadDigest but not viewRevision. |
| `render.digest.page-id-changed` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: distinct page ID with an identical name changes layoutDigest, payloadDigest and viewRevision only. |
| `render.digest.page-name-changed` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: one changed page name with the same pageId invalidates layoutDigest (§9.1) and viewRevision. |
| `render.digest.r3-vectors` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: every binding digest and viewRevision on the pinned R3 vector, empty override/style bags, reordered descriptor pins. |
| `render.digest.theme-selection` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: selecting another theme changes themeDigest and viewRevision only; the chain runs from the fallback root to the selected theme. |
| `render.digest.theme-two-themes-plain` | render.digest | renderDigests | ok | Any output that differs from the Python-sealed record of this witness: theme list with a second theme; selecting plain hashes only its own chain. |
| `render.fresh.alias-same-theme` | render.fresh | verifyRenderData | ok | Any output that differs from the Python-sealed record of this witness: a theme alias names the same theme: still fresh. |
| `render.fresh.di-styles-changed` | render.fresh | verifyRenderData | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a DI style added after R makes diStylesDigest stale. |
| `render.fresh.overrides-changed` | render.fresh | verifyRenderData | refused:render-stale | Any output that differs from the Python-sealed record of this witness: an override added after R makes overridesDigest stale. |
| `render.fresh.payload-tampered` | render.fresh | verifyRenderData | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a payload edited after binding fails payloadDigest. |
| `render.fresh.plain-fresh` | render.fresh | verifyRenderData | ok | Any output that differs from the Python-sealed record of this witness: a fresh R verifies and yields its viewRevision. |
| `render.fresh.semantic-changed` | render.fresh | verifyRenderData | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a semantic edit after R makes semanticRevision stale. |
| `render.fresh.staircase-fresh` | render.fresh | verifyRenderData | ok | Any output that differs from the Python-sealed record of this witness: the same theme with its overrides and DI styles verifies. |
| `render.fresh.theme-selection-changed` | render.fresh | verifyRenderData | refused:render-stale | Any output that differs from the Python-sealed record of this witness: selecting another theme after R makes the binding stale. |
| `render.legacy.alias-absent` | render.legacy | resolveLegacyTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: no built-in legacy look mapping. |
| `render.legacy.alias-dangling` | render.legacy | resolveLegacyTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a legacy alias must land on a declared theme. |
| `render.legacy.alias-exact-name` | render.legacy | resolveLegacyTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: legacy alias names match exactly (no case folding). |
| `render.legacy.alias-mapped` | render.legacy | resolveLegacyTheme | ok | Any output that differs from the Python-sealed record of this witness: a legacy look name resolves only through injected compatibility data. |
| `render.legacy.alias-removed` | render.legacy | resolveLegacyTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a removed legacy alias maps to nothing. |
| `render.legacy.alias-wrong-kind` | render.legacy | resolveLegacyTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: only kind theme records map looks. |
| `render.r.attached-badge` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: badge occurrence styled from its declaration tokens; source occurrence kept (hideSource false). |
| `render.r.coverage-unsupported` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: no automatic standard-notation fallback: drawn element without a deliberate glyph is covered as unsupported with one render-unsupported diagnostic. |
| `render.r.di-style-unknown-page` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: Overrides/1 and DiStyles/1 reject unknown targets/members, duplicate targets and non-closed shapes. |
| `render.r.edge` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: edge occurrence: emittedType edge, binding stroke beats theme stroke. |
| `render.r.facet-disjoint` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: multiple matched facets contribute disjoint tokens. |
| `render.r.facet-equal-values` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: equal values for one token at the same precedence coalesce. |
| `render.r.geometry-theme-gated` | render.r | resolveTheme | refused:profile-open | Any output that differs from the Python-sealed record of this witness: per-theme geometry is not approved while OPEN-DI/OPEN-LOOK keeps shared geometry. |
| `render.r.grid-side-stripe` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: R of the second neutral profile: header-band glyph, ServiceTask glyph, synthetic stripe style, unsupported support lane with its diagnostic. |
| `render.r.label-empty-string` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: an occurrence whose evaluated label is the empty string carries no label. |
| `render.r.label-extra` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a layout label for an element whose bindings produce no label is stale. |
| `render.r.label-missing` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a layout record without the label the binding evaluates is stale. |
| `render.r.label-stale-text` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a layout label whose text differs from the evaluated binding label is stale. |
| `render.r.layout-foreign-synthetic` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: a geometry record without semanticId must be a synthetic occurrence of the selected theme. |
| `render.r.layout-unsorted` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: Layout/1 geometry must use page/occurrence order. |
| `render.r.override-duplicate-target` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: Overrides/1 and DiStyles/1 reject unknown targets/members, duplicate targets and non-closed shapes. |
| `render.r.override-tokens-not-array` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: Overrides/1 and DiStyles/1 reject unknown targets/members, duplicate targets and non-closed shapes. |
| `render.r.override-unknown-member` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: Overrides/1 and DiStyles/1 reject unknown targets/members, duplicate targets and non-closed shapes. |
| `render.r.override-unknown-occurrence-target` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: Overrides/1 and DiStyles/1 reject unknown targets/members, duplicate targets and non-closed shapes. |
| `render.r.override-unknown-semantic-target` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: Overrides/1 and DiStyles/1 reject unknown targets/members, duplicate targets and non-closed shapes. |
| `render.r.plain` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: RenderData/1 for the neutral profile: style from binding then theme, glyphs, coverage of every ID-bearing element, full binding. |
| `render.r.precedence-shuffled-input` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: reordered override/style tokens normalize identically (same R, same digests). |
| `render.r.precedence-staircase` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: token precedence chain, each of the seven levels winning once; fallback chain root-first in themeDigest. |
| `render.r.shared-theme-not-compared` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: a single-theme render never refuses theme-geometry-conflict: the shared-geometry check runs only between two selected themes. |
| `render.r.sparse-override` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: sparse overrides stay sparse: one token on one occurrence, digest over the sparse record. |
| `render.r.style-conflict-glyph` | render.r | resolveTheme | refused:render-style-conflict | Any output that differs from the Python-sealed record of this witness: matched bindings naming different glyphs refuse. |
| `render.r.style-conflict-token` | render.r | resolveTheme | refused:render-style-conflict | Any output that differs from the Python-sealed record of this witness: unequal values for one token at the same precedence refuse (no declaration-order winner). |
| `render.r.theme-alias` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: a declared theme alias selects the theme; the binding records the theme id. |
| `render.r.theme-legacy-name-not-generic` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: generic theme resolution never reads compatibility aliases. |
| `render.r.theme-unknown` | render.r | resolveTheme | refused:render-stale | Any output that differs from the Python-sealed record of this witness: an unresolvable theme id is an unresolved input. |
| `render.r.token-arrow-unknown` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-bioc-invalid` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: DI style bags are validated with the same signatures. |
| `render.r.token-color-trailing-newline` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-dash-unregistered` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-duplicate-name` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-fill-no-hash` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-fill-non-hex` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-fill-seven` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-fill-short` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-font-family-not-injected` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-font-size-boolean` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-font-size-negative` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-font-size-string` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-font-size-unsafe` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-font-weight-case` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-font-weight-unknown` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-null` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-semantic-invalid` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: semantic override bags are validated with the same signatures. |
| `render.r.token-stroke-number` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-stroke-width-negative` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-unknown-name` | render.r | resolveTheme | refused:render-token-invalid | Any output that differs from the Python-sealed record of this witness: render-token/1 boundary violation refuses. |
| `render.r.token-valid-boundaries` | render.r | resolveTheme | ok | Any output that differs from the Python-sealed record of this witness: each render-token/1 type at an admitted boundary. |
| `render.template.attached-badge` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: badge at (node.x+offsetX, node.y+node.height+offsetY) with the declared badge size; markerShift echoed. |
| `render.template.attached-badge-negative-offset` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: signed tick offsets. |
| `render.template.band-stripe` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: band-stripe takes a leading vertical rectangle of width min(stripeWidth, region.width), full height. |
| `render.template.band-stripe-clamped` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: band-stripe takes a leading vertical rectangle of width min(stripeWidth, region.width), full height. |
| `render.template.band-stripe-zero` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: band-stripe takes a leading vertical rectangle of width min(stripeWidth, region.width), full height. |
| `render.template.corner-fold` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: corner-fold size roundEven(min(w,h)*foldRatio) and its three-point path. |
| `render.template.corner-fold-decimal-ratio` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: corner-fold size roundEven(min(w,h)*foldRatio) and its three-point path. |
| `render.template.corner-fold-height-min` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: corner-fold size roundEven(min(w,h)*foldRatio) and its three-point path. |
| `render.template.corner-fold-rotation-center` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: header text rotates about its label bounds centre; the centre rounds once, ties to even. |
| `render.template.corner-fold-rotation-center-up` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: rotation centre ties round to the even neighbour upwards. |
| `render.template.corner-fold-tie-down` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: corner-fold size roundEven(min(w,h)*foldRatio) and its three-point path. |
| `render.template.corner-fold-tie-up` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: corner-fold size roundEven(min(w,h)*foldRatio) and its three-point path. |
| `render.template.corner-fold-zero` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: corner-fold size roundEven(min(w,h)*foldRatio) and its three-point path. |
| `render.template.header-band` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: header-band divides at y+min(headerHeight,h). |
| `render.template.header-band-body-grows` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: the header keeps its fixed height when the body grows (no uniform scaling). |
| `render.template.header-band-clamped` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: headerHeight larger than h is clamped by min(headerHeight,h). |
| `render.template.header-band-grid-glyph` | render.template | templateGeometry | ok | Any output that differs from the Python-sealed record of this witness: the second neutral profile's own header-band glyph (headerHeight 12). |
| `render.template.native-glyph` | render.template | templateGeometry | refused:render-unsupported | Any output that differs from the Python-sealed record of this witness: template geometry exists only for template glyphs. |
| `render.template.param-boolean` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.param-duplicate` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.param-extra` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.param-fraction` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.param-missing` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.param-negative` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.param-ratio-range` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.param-rotation` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.param-string` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
| `render.template.viewbox-zero` | render.template | templateGeometry | refused:profile-glyph-shape | Any output that differs from the Python-sealed record of this witness: template parameter or viewBox violation refuses. |
<!-- /generated:cases -->
