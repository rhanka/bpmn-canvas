# Lot 3 sealed expectations: C/N, command authority and early history proof

Status: resealed in the single seal fix round after the independent review
(REWORK, six MAJOR and one MINOR findings) and the JS/Python harmonization
decisions of 2026-10-18. The fix-round report maps every finding and decision
to its outcome. Resealed for the block-B JS/Python parity sync of 2026-10-19
(BLOCKB-PARITY-SYNC): the own-side value changes PS-21 and PS-32, the vendored
Python lot-3 parity cases and the shared rules recorded under "Parity sync".
Resealed again on 2026-10-19 for `l3-id-unicode-names` alone, after the lot-3
code author reported that its sealed triple shared the ordinal-0 ID contrary to
DESIGN L292: a rewrite of this helper had folded U+E000, U+00A0 and U+2028 of
three input names into ASCII spaces, which made three siblings byte-identical,
and the helper passed a literal ordinal 0. The names regain those code points
and gain the canonically equivalent pair U+00E9 / e+U+0301; every ordinal is
computed by the L292 rule (all eight are 0 and the eight IDs differ).
Resealed once more on 2026-10-19 for the Unicode literals of six more case files,
after an audit of every case against the first seal: the same rewrite had folded
U+E000, U+00A0 and U+2028 in `l3-id-stable-vectors`, `l3-c-preserve` and the
process shared by `l3-n-unicode-names`, `l3-fp-n-unicode-names` and the two
`l3-mix-n-unicode-names-*` cases, which stayed green but no longer witnessed their
stated property. The first-seal code points are restored (ASCII helper source,
braced escapes) and a decomposed e+U+0301 key and reference name are added so that
the NFC and NFD claims are observable; only those cases and the IDs, revisions and
transport bytes derived from them change.
Resealed on 2026-10-19 for the real-canvas rebind of the 18 `l3-tx-*` scripts (block B
review, BLOCKER 1). They had run through a test double in `src/` that stored
placeholder presentations, emitted change events without a report, wrote the
re-entrancy outcome without a nested call and refused one entry by its name;
replayed on the real canvas, the C writes on created tasks came out at the exact
coordinates of the staged tree. Decision (DESIGN L751, L755, L766, §8.2 L629 and
L632–L633): a transaction is one operation whose change entries have their source
in its before-tree and their result in its committed tree, so the sealed generated
coordinates stay and the canvas reports them; observed findings keep the coordinates
of the linted candidate (L510, B12), as the lot-5 seal has them. Every `l3-tx-*` case
now also rejects the double: change events carry the report of their own result
(L606, L633), snapshots carry a Layout/1 record (L610, L667), the re-entrancy outcomes
are the Result/1 refusals of real nested calls made by the transaction-phase hook
(L604, L635) and the set-selection refusal of a new Process input comes from C, next
to a single-set control (L547). Only the `l3-tx-*` cases change.

- Spec author: Opus (owner exception while the usual spec author is unavailable).
- Reviewer: gpt-6-astra, max effort (first seal reviewed; this reseal pending review).
- Production code is written later, by another model, against these files. This
  directory contains no implementation and none was read, imported or run to
  obtain or confirm an expected value.

Authority: DESIGN R3.3 (1162 lines, SHA-256 `48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f`), in scope
§3.2 (L274–L292), §5.2–§5.3 (L436–L452) as consumed by import adapters, §7
(L532–L573) and §8.2 (L625–L645), with §2.4, §3.3, §4.1–§4.4, §6.2–§6.4, §8.1,
§10.1, §13, §14.3 and §16; then the harmonization decisions (precedence DESIGN >
harmonization > review finding); the block A public API at the seal base
(`src/profile/`, `src/io/`, `docs/design/`) read for contract shapes only; the
lot-0 contracts and vendored corpus (profile-c14n/2, stable-id/1,
DocumentEnvelope/1, Result/1, Report/2, Snapshot/1, profile-parity-corpus/1).

## Layout

| Path | Content |
| --- | --- |
| `cases/*.json` | 266 cases in the closed profile-parity-corpus/1 shape `{caseId, operation, phase, profileArtifact, inputArtifacts, commandArtifact?, expectedArtifacts, expectedStatus, comparatorIds}` |
| `manifest.json` | corpus manifest: parent manifests, pinned comparator executables, comparators, profiles with their load inputs and identity digests, case file digests, the vendored Python seal, the source record digest of each vendored case and the PS-37 aliases; paths relative to `tests/fixtures/` |
| `comparators/lot3-comparators.mjs` | the executable comparators (zero tolerance), pinned by SHA-256 in `manifest.json` and `seal.json` |
| `index.json` | per case: group, operation, status, primary DESIGN clause, secondary citations, runtimes and the plausible wrong implementation it fails (for a vendored case: the Python derivation, its parity-sync row, source and harness record digests and the derivation statement); the section table; the UNSEALED list |
| `profile/` | neutral-cn descriptor slice, base, the main profile and nine single-purpose variants |
| `vendor/py/` | raw files of the Python lot-3 seal (commit `1c2df31`), paths relative to its `tests/profile_cn/expected/`: `MANIFEST.sha256` (the seal, SHA-256 `0d3922f74fb71e19d305307a3153989dcdf4ba3685e8a6df06c28046cf15ad8e`), `parity/manifest.json`, the 90 imported `parity/cases/*.json` records, the 17 composed `parity/profiles/*.json` variants and the four `artifacts/` descriptor and base packages |
| `author/author-lot3.mjs` | the standalone derivation helper (manual tool, never run by CI) |
| `author/digests.json` | every stable-id/1 tuple, birth content signature, revision, view tuple and transport digest the helper computed, with the canonical strings |
| `seal.json` | SHA-256 and byte length of every file above, of the generated `docs/design/block-b-lot3-expectations.md` and of the consumed lot-0 inputs |

A case cannot carry a citation field without breaking the closed corpus shape
(DESIGN L959), so each citation lives in `index.json`; the clause → case table is
`docs/design/block-b-lot3-expectations.md`. The reseal ledgers
`docs/design/receipts/block-b-lot3-seal-fix.json` (seal fix round, kept as
history), `docs/design/receipts/block-b-lot3-parity-sync.json` (parity sync,
chained to it), `docs/design/receipts/block-b-lot3-unicode-names-fix.json`
(unicode-names fix, chained to the parity sync),
`docs/design/receipts/block-b-lot3-unicode-literals-fix.json` (Unicode literal
restoration, chained to the unicode-names fix) and
`docs/design/receipts/block-b-lot3-l3tx-rebind.json` (real-canvas rebind of the
`l3-tx-*` scripts, chained to the literal restoration) record the previous and
current seal digests and the old/new pin of every changed, added or removed file;
the last three also list the old and new value of every changed name, key, ID,
revision, transport digest and trace or script member.

## Method

1. Every expected tree, binding, placement and trace is a hand-authored literal,
   and every change report is a hand-declared list of written locations with the
   recipe that planned each write. The helper imports only `node:crypto`,
   `node:fs`, `node:path` and `node:url`. It computes JCS (RFC 8785) and SHA-256
   for stable-id/1 values, birth content signatures, revisions, view digests and
   transport digests, reads values at JSON pointers of its own literals, fills the
   Report/2 coordinates of the declared locations (B9), and sorts entries, idMap
   rows and placements by the DESIGN orders. It loads, compiles or evaluates
   nothing and runs no C, N, lint, layout, codec, exporter or command.
2. Before writing, the helper checks its literals: reverting every declared
   written location must give back the input tree byte for byte; a declared
   location whose value does not change aborts; C-complete trees must have
   ID-sorted same-container topology, gateway directions per DESIGN L544, covered
   IO sets, ports and backings; placements must be in the DESIGN L565 order.
3. The helper first reproduces digests already sealed by lot 0 (support IDs, the
   root ID, a sibling ordinal ID, the neutral profile digest, a semantic revision,
   the theme, overrides, styles and metrics digests, a layout digest and a view
   revision). Any mismatch aborts.
4. No runtime output became an expectation and no library run confirms one. The
   first seal's input-admission test (which imported the block A loader and
   asserted the profile identity) and its scratch compiler probe are withdrawn
   from the evidence: profile identities are computed by the helper with
   `node:crypto` only (`author/digests.json`), and compile admission is
   justified by the written review below. Regenerating requires editing the
   literals: `node tests/fixtures/lot3-cn/expectations/author/author-lot3.mjs <DESIGN.md>`.
5. The vendored Python cases are not authored here: the helper reads the raw
   Python seal files under `vendor/py/`, checks every digest against the pinned
   Python seal manifest and parity manifest, and re-expresses each record (see
   "Parity sync"). Their values are the Python seal's hand-derived values, never
   an implementation output; the compile records carry the PS-25/PS-35 values
   their owner applied before resealing, named in each case's derivation statement.

## Written compile review (CR-01…CR-14)

Each profile in `profile/` was reviewed against the compiler rule table
(DESIGN §2.4.1 L184–L212) without running a compiler:

- CR-01: the six lot-0 capabilities only; every operator used (count, reachable, recognizes, boundRole, typeIs, equal, present, ids, id, read, param, literal) belongs to them.
- CR-02: `ids` appears only in assignRef values; create fields are scalar literals or string parameters.
- CR-03: every selector uses order `id`; `property` appears only on reference, inverseReference and children traversals.
- CR-04: every count has min ≤ max; reachable uses minHops 1 without maxHops.
- CR-05: notion, recipe, rule, message, theme, glyph and binding names are unique and resolved; the recognition graph is acyclic (call-external, external-lane).
- CR-06: every action has its declared write; complete writes code-produced fields of the base; normalize writes only supports, bindings, Lane.flowNodeRef, processRef and Association direction; the extraction variant replaces `import` by `ai` on four fields only.
- CR-07: allocated creates and ensures carry explicit ownerId, slot and key values; ownerIds never rely on the nearest container (the default IO sets use the Definitions ID).
- CR-08: ten validation records, every standard rule present and off, every profile rule in its post-normalize stage with integrity rules at error in both policies.
- CR-09: notions declare one exclusive group or a facet; glyphs are native with positive viewBoxes; the second theme shares geometry and only changes paint.
- CR-10: every required recipe parameter of a surface entry is bound exactly once from owner, target, source, value or key.
- CR-11/CR-12: the export and migration records are the lot-0 neutral ones unchanged.
- CR-13: fallbacks appear only with cardinality `first`.
- CR-14: create/complete/normalize/edit actions respect the phase table (remove only in the edit recipe `remove-lane`).

## Fixture world

- `neutral-cn-descriptors/1` and `neutral-cn-base/1` (version `fixture-cn-1`):
  the BPMN slice for calls, events, timers, gateways, data associations, ports,
  Process IO and sets, Collaboration/Participant/LaneSet/Lane, DI/DC types,
  `bpmn:ComplexGateway` and the extension item `neutral:LegacyItem`, which the
  descriptors know but the base does not admit (presentation and out-of-base
  projection witnesses). Every base field is produced by `code`, `editor` and
  `import`; `calledElement` is the only ID-valued scalar.
- `neutral-cn/1` 1.1.0 derives from `neutral/1` (themes, UI entry, exports,
  dialect, migration, resources, task/aid notions, the five task-name rules and
  the command recipes are kept). It adds the notion `call-external` (exactly one
  Documentation marker with textFormat `text/x-neutral-call-kind` and text
  `external`, no calledElement) and the facet `external-lane` (bound role); 20
  post-normalize rules (ordinary path, call kind, trigger branch, supplier and
  consumer links, link endpoint type and direction, link ownership, sequence-flow
  container); the complete recipes (Definitions defaults, isExecutable, topology,
  gateway direction, item backing, input ports, IO sets); the normalize recipes
  (structure, external lane, reference band, external-membership release and
  append, placements, relation direction); the commands `create-start`,
  `create-end`, `connect`, `create-process-input`, `create-process-input-unassigned`
  and the edit recipe `remove-lane`; six surface entries for the scripts; and a
  paint-only second theme `contrast` (fallback `plain`). Every standard bpmnlint
  setting is off (the compensated policy family of DESIGN L499–L502); readiness
  rules warn in draft and error at acceptance, integrity rules error in both.
- Variants (one purpose each): `stale` counts stored references for gateway
  direction; `conflict` and `coalesce` add a sibling isExecutable write (true /
  identical); `outport` adds the output-port authority; `flip` adds a recipe
  reversing the reference pair back; `dirconflict` adds a second direction write;
  `ensureconflict` adds a second reference-band ensure with another name;
  `extraction` grants the ai actor four fields; `abort` appends a refuse step
  after every ensure.
- The lot-0 `neutral/1` and `neutral-grid/1` profiles serve the paired
  isExecutable vectors, the no-topology control and the lot-0 placement vectors
  (their completed trees and placements are reused unchanged from the lot-0
  fixtures).
- Support roles, slots and keys repeat the lot-0 support fixture (DESIGN
  L284–L286), so `Definitions_support`/`Process_A` supports have the lot-0 IDs.

## Operations, inputs and seams

| Operation | Contract |
| --- | --- |
| `complete` | `complete(compiled, envelope, mode)` (DESIGN L232); input artifacts `envelope`, `mode` (`retained` or `extraction`, B7) and optional `activation` (`qualification`; absent means `edit`, H1); expected Result/1 with the envelope payload |
| `normalize` | `normalize(compiled, envelope, placementIntent?)` (L233); optional `activation` and `placement-intent` (`[{elementId}]`); payload `{envelope, placements, report}` with `payload.report` equal to `report` (B5) |
| `validate` | `validate(compiled, envelope, {phase, readinessPolicy})` at `post-normalize`; payload `{ok, counts}`; complete unified entries (B12) |
| `remapIds` | the approved import ID migration (B14, H9): input artifacts `envelope` (committed) and `importedDi` (Snapshot/1 record), `activation`; command `{kind: "id-remap", approved, approval, map, referenceFreeAttestations, namespaces?}`; payload `{envelope, importedDi}`; `report.idMap` is the complete original→result map |
| `importProjection` | out-of-base projection of a strict native JSON source (B15): payload `{tree}`; one loss entry per dropped element |
| `proposeSupportBindings`, `bindSupports` | recovery preview (input `provenance`: support IDs with creation provenance; PureResult `{proposals}`) and the explicit binding transaction (input `bindings`, `activation`; Result/1 with the envelope payload), DESIGN L440–L442 |
| `stable-id/1`, `sortPlacements` | pure vectors (allocation tuples; L565 placement order); the vendored sortPlacements case keeps the Python roles `placements` (input and expected) |
| `planRecipe` | vendored Python cases: `planRecipe(recipe, ReadContext, Params, Authority)` (L230) over the input `envelope` with `recipe` (a compiled recipe id, or a record), `params` and `authority` (`{actor, activation, deletionIntent}`); expected `plan` PureResult with WritePlan/1 and, when the case chains it, `apply` = applyPlan(plan.payload, envelope.tree, envelope) (PS-01) |
| `applyPlan` | vendored Python cases: `applyPlan(plan, stagedTree, stagedEnvelope)` (L231) with input artifacts `plan`, `envelope` and optional `stagedTree` (else the envelope tree); expected `apply` PureResult with ChangeReport/1 |
| `compileProfile` | vendored Python cases: `compileProfile(validated, RegistrySet)` (L227) on the pinned profile, or on each `profile` input record `{path, sha256}` of a list; expected `compile` PureResult (a list for a list) whose success payload is the marker `{"$unsealed": "compiled-profile"}`, and `compiled-identity` / `compiled-identities` (PS-25, PS-35) |
| `transaction-script` | canvas only (JS), on the real canvas: `lot3-transaction-script/2` steps calling `onChange`, `unsubscribe`, `setDefinitions`, `restoreSnapshot`, `getDefinitions`, `getSnapshot`, `applyCommands` (lot-5 command records, I3), `stageGesture` (seam: the final intent of a gesture), `setTheme`, `undo`, `redo`, `dispose`; `{$ref: {step, pointer}}` anywhere in a step, an `inject` request included, resolves to the actual value of an earlier step; `inject` is one directive of a closed set run by the transaction-phase hook (section "Transaction-phase hook"): `{phase: "staging", action: "abort-signal"}`, `{phase: "staging", action: "dispose"}`, `{phase: "applying", action: "reenter", request}`, `{phase: "applying", action: "reenter-and-throw", request}`; `injected` is the value that the real call made by the hook returned |

Every caller-visible input of a JS-owned case is compared after the call
(`caller-state`), success or refusal (DESIGN L573: only a successful return
exposes a candidate); a vendored Python refusal with an input envelope carries
`caller-state` equal to that envelope (BLOCKB-PARITY-SYNC §2.2).

### Transaction-phase hook

The `l3-tx-*` scripts drive the real canvas through an adapter in `tests/helpers`
that replaces the former test double and never writes an outcome itself. The
adapter needs one internal hook of the canvas transaction, reachable from the test
construction path of the canvas only, never from the public factory, its options
or the package:

- The canvas calls `hook(phase)` synchronously, once per accepted `applyCommands`
  or gesture transaction: `staging` after the step-1 checks (disposed, not loaded,
  read-only, aborted signal, stale `baseRevision` or `expectedViewRevision`, guard
  not idle) and the guard change to `staging`, before C; `applying` after the
  candidate is complete (C, pre-normalize lint, N, post-normalize lint) and the
  guard change to `applying`, before any live envelope, presentation, selection,
  history entry or change event changes (DESIGN L629–L635). It is never called for
  a refused request, a load, a snapshot, a theme switch, undo or redo.
- An exception thrown by the hook is an unexpected internal exception (L604): the
  stage is discarded, the guard returns to `idle` (L635), no history entry or event
  is produced, and the call returns `operation-error` echoing the committed identity
  and revision, whose `diagnostics` and `report.entries` are the lint entries of the
  stages already run on the candidate (L735, B2): none at `staging`, the
  pre-normalize and post-normalize entries at `applying`.
- A call made from the hook during `applying` re-enters the public API:
  `applyCommands` refuses `transaction-reentrant` at entry, before its first await,
  with the closed Result/1 refusal (echo of the committed identity and revision,
  empty report; L604, L635, B2, B3) and has no effect. During `staging` the adapter
  only aborts the signal or disposes the canvas; the canvas re-checks disposal
  (`canvas-disposed`, no echo) and the signal (`operation-cancelled`) before it
  commits.
- Directives: `abort-signal` aborts the AbortSignal of the request inside the
  `staging` hook; `dispose` calls `dispose()` there and records its PureResult as
  `injected`; `reenter` calls `applyCommands(request)` once inside the `applying`
  hook and records its resolved value; `reenter-and-throw` does the same, then
  throws. A directive whose phase is not reached exactly once fails the step.
- The adapter builds the canvas from the session artifacts (profile, descriptors
  and metrics, each checked by digest; business-profile mode, draft readiness,
  initial theme `session.theme`), reads history counts and change events through
  the canvas test accessors and translates `stageGesture` through the canvas gesture
  API.

## Comparators

`comparators/lot3-comparators.mjs` implements every comparator ID used by the
cases; `manifest.json` pins its SHA-256 under `executables` and per comparator.
Comparison is canonical-JSON equality of the complete artifact (Result/1 with
its complete Report/2: header, entries in profile-report/2 order, idMap order,
refusal diagnostics; payload; serialized bytes for transports). A member is
excluded only through the case's `unsealed` artifact, which lists JSON pointers
(`*` matches one key or index) with a reason; an UNSEALED member must still be
present. Trace records may use `{$same: {step, pointer}}` and
`{$differs: {step, pointer}}` markers that relate a value to the actual value of
an earlier step. The golden test runs every comparator on the ideal actual
values and on targeted mutations of them.

The parity sync adds the vendored Python comparators with their Python manifest
notes: `fixed-point/lot3` (the runner supplies the second-run Result/1 on the
expected output as the actual role `fixed-point`: status ok, identical envelope
and placements, no report entry, baseRevision = revision = the first revision)
and `plan-apply/lot3` (the `plan` PureResult and, when expected, the `apply`
PureResult of applyPlan chained on the actual plan); and `compile/lot3` (the
compile PureResult, compared after each `{"$unsealed": reason}` marker is
replaced by the actual member, which must exist, and the compiled identity;
PS-25, PS-35). `placements-order/lot3` also reads the vendored `placements` role.

## Harmonization decisions applied

A2, A4, A5, A7, A8 (corpus records, operation names, transport, full artifacts);
B1–B5, B7–B12, B14, B15 (Result/1, Report/2, payloads, mode, change entries and
coordinates, remap, projection); C1–C6, C8, C10, C11, C20 (refusal precedence and
codes); D1–D5 (identity slots and ordinals); F1, F2, F4 (emptied arrays); G1, G2,
G4, G6 (orders); H1–H3, H9 (activation and gates); I1–I5 (transactions); J1
(lint inside commands). The py-only cases added on JS fixtures are listed in the
fix-round report.

## Interpretations recorded (DESIGN default taken where a point would block)

1. Change entries (B8–B11): one entry per distinct written location whose value
   changes; `after` is the final value at that location, so a created element
   shows its final subtree; coalesced writes are reported once under the first
   planning recipe; placements and binding writes produce no entry. A write on
   an element created in the same operation (by a recipe or by a command of the
   same transaction) has the generated source `{none, null, null, generated}` and a
   generated result. A transaction is one operation: its change entries have their
   source in the before-tree of `baseRevision` and their result in the committed
   tree (DESIGN L751, L755, L766; §8.2 L629, L632–L633), never in the staged tree of
   one of its stages; observed findings keep the coordinates of the linted
   candidate and an unavailable result (L510, B12).
2. Emptied arrays stay `[]` and absent → `[]` is a change (F1); the out-of-base
   projection likewise keeps an emptied containment array (`dataOutputAssociations: []`).
3. C allocates missing IDs first (Definitions under `document-root/1`), from birth
   signatures captured before any default; the slot is the descriptor key of the
   containing `$type`, `.`, the containment property (D1); the duplicate ordinal
   counts ID-missing siblings only (D3).
4. Refusal precedence follows C1: invocation, envelope shape, §3.3 compatibility,
   envelope integrity, graph index (duplicate IDs, unclassified members, dangling
   references), extraction actor, identity, plans with gates at their step, apply,
   bounded fixed point. Refusals echo identity and revision per B3 and carry
   `diagnostics` equal to `report.entries`, the lint entries of stages executed
   before the refusal (B2).
5. Support reuse validates type, parent and containment property, processRef/owner
   relationship and single binding; declared ensure fields are creation fields (C5).
   An explicit deletion of a bound support removes its binding with it.
6. A dangling calledElement refuses `reference-dangling` at the graph index of C
   and N; `validate` reports it as an integrity/error entry of the graph index
   (ruleId `adapter`, messageKey equal to the code, DESIGN L516–L518 convention);
   `remapIds` keeps it and reports one observed entry (C2) whose source and result
   pointers address the property location `<element>/<escaped property>` with
   `property` kept, result provenance `exact` and `before` = `after` = the value
   (parity sync PS-32, the convention of the `validate` entry). The call-target-type
   rule is value-based so that no rule traverses a dangling reference.
7. External-namespace QNames: the migration record carries the namespace bindings
   the import adapter captured (`namespaces`); an in-document QName is rewritten
   keeping its prefix; an external one stays unchanged with one observed
   `unsupported-namespace` entry at the same property-location coordinates
   (PS-32), by the same DESIGN L444 reading as C2.
8. `importProjection` is read-only and commits nothing: `revision` = `baseRevision`
   and `report.outputRevision` = `report.inputRevision` (L268, L737; parity sync
   PS-21); loss entries carry ruleId `adapter` (L516–L518 convention, as
   harmonization B24) and an emptied containment array stays `[]`.
9. Unicode coverage is on values (names, situations, source text, keys); native
   object keys are ASCII.
10. A DI-only move inside its page changes only the moved occurrence's bounds;
    page records stay as restored. Edge routes after a move are UNSEALED.
11. A gesture transaction (`stageGesture`) commits through the same root
    transaction and reports as `applyCommands` with origin `command`.
12. A load, snapshot, theme, undo or redo change event carries the report of its
    own committed result (DESIGN L606, L633, L735); that report's content stays a
    source gap, so the event is compared with the actual result report (`$same`).
13. The layout of a Snapshot/1 presentation is a Layout/1 record (DESIGN L610,
    L667): its `layoutVersion` is compared; the pages and geometry of a
    canvas-computed layout are UNSEALED.
14. In a transaction, `io-set-selection-required` is the outcome of the C recipe
    that meets several InputSets and an uncovered input (DESIGN L547, L172), never of
    the command entry; the same script checks it against a single-set control.

## Parity sync (BLOCKB-PARITY-SYNC, 2026-10-19)

The block-B JS/Python parity sync reconciled the two lot-3 seals (precedence
DESIGN > harmonization > parity sync). Applied to this seal:

- Own values: PS-21 (interpretation 8) and PS-32 (interpretations 6 and 7).
- PS-01 (B13 closed): the Python WritePlan/1 `{planVersion: "1", phase, actor,
  activation, baseRevision, writes}`, whose planned writes carry the descriptive
  facts (`cardinality` on create, ensure, reparent and assignRef, `targetTypes` on
  assignRef), and ChangeReport/1 `{reportVersion: "change/1", tree, bindings,
  entries, placements, created, removed}` are the shared shapes;
  `applyPlan(plan, stagedTree, stagedEnvelope)` reads the facts only from the plan
  (`cn-plan-*`, `cn-apply-*`).
- PS-02: any refusal of the bounded second evaluation fails the fixed-point proof
  with `normalization-not-fixed`; the second-pass code is never returned and no
  candidate is exposed (`cn-c-second-pass-refused`, `cn-n-second-pass-refused`).
- PS-04: remap `map` rows have unique `sourceId` values (else `operation-error`);
  attested members are never rewritten; an invalid `importedDi` record refuses
  `snapshot-schema` and a foreign `importedDi.descriptorDigest` refuses
  `descriptor-mismatch`; a dangling DI `bpmnElement` is kept and reported with
  domain `artifact`.
- PS-05: an empty single-valued reference value is not a reference; dangling and
  wrong-type checks apply to nonempty values only (`cn-c-empty-called-element`).
- PS-11: `read` of a member the subject lacks yields MISSING; `textPrefix` and
  `equal` of MISSING are false and `present` is false (the branch evaluation of
  `all`/`any` is not decided: erratum candidate E-38).
- PS-14: the copy fragment pre-order starts at Definitions, visits object members
  in UTF-16 key order (the profile-c14n/2 order) and arrays by index, the same
  traversal as the coverage order (harmonization G3).
- PS-24: envelope integrity validates bindings generically (closed record, owner
  and target exist, owner+role unique, target bound once); role-specific agreement
  is checked by the reuse validation of an ensure that names the role (C5). The
  neutral-cn profiles declare every bound role with an ensure recipe as a fixture
  choice; the refusal code for an undeclared role is erratum candidate E-40.
- PS-34: the `prepareExport` options record is closed `{format, themeId,
  overrides, diStyles, importedDi?}`; `importedDi` (a Snapshot/1 record) is the
  geometry source of a headless adapter, and a runtime that needs it while it is
  absent refuses `operation-error` at the layout stage, never earlier; `signal?` is
  a JS-only runtime member never written in a corpus file.
- Vendored cases (PS-H08 to PS-H15): 90 Python parity records under `cases/` with
  the Python spelling, values owned by the Python seal and copied unchanged
  (JCS-equal) from that seal as resealed after its own parity-sync value changes
  (section 1.2 of the reconciliation). The compile records carry PS-25 (refusal
  `diagnostics: []`) and PS-35 (success payload marker
  `{"$unsealed": "compiled-profile"}`, identity in `compiled-identity` or
  `compiled-identities`) as their owner applied them; the helper checks those
  shapes and reproduces each compiled identity with node:crypto before vendoring.
  Re-expression only: role `placementIntent` becomes `placement-intent` and the
  other Python roles are kept; a refusal with an input envelope adds
  `caller-state`; the Python `profile-c14n/2` maps to the complete-artifact
  comparator of the primary role (`result-1/lot3`, `plan-apply/lot3` or
  `placements-order/lot3`) plus `profile-c14n/2`, and `fixed-point/lot3`,
  `plan-apply/lot3` and `compile/lot3` keep their ids (a compile record carries
  `compile/lot3` only).
- Aliases (PS-37), one parity case each, listed in `manifest.json` `aliases` with
  the Python record digest and not copied:
  `cn-n-place-neutral` is `l3-n-place-neutral`;
  `cn-n-place-grid-shared-anchor` is `l3-n-place-grid-shared-anchor`.
- The other Python lot-3 parity cases stay two-sided witnesses of behaviours this
  seal witnesses with its own fixtures (BLOCKB-PARITY-SYNC §5); `cn-gates-table` and
  `cn-c-uncompiled-context` are Python runtime-specific.

## Gate interpretation

The owner ratified the eleven §16 defaults on 2026-10-14; technical proof gates
remain effective (L1136). Harmonization H1 adds an explicit `activation` input:
`qualification` (neutral qualification, DESIGN L364, L554) runs gated effects;
absent means `edit`, where the first gated effective change in recipe, candidate
and step order refuses `profile-open` (H2: N support creation OPEN-RESERVED-N,
N Lane.flowNodeRef change OPEN-EXTERNAL, N membership removal OPEN-SHARING with
`responsibility-preservation-required` in qualification, C output-port fill
OPEN-IO, remap OPEN-ID). Reuse and no-ops are never gated, so every fixed point
runs in edit. Each gated path has a sealed edit refusal; activated behavior after
the gates pass is UNSEALED below.

## Groups

| Group | Cases | Main clauses |
| --- | --- | --- |
| identity | 12 | §3.2 L276–L292 |
| completion | 28 | §7.1 L536–L548, §2.4 L176, §3.3 L298–L319, §5.1 L434 |
| normalization | 40 | §7.2 L554–L565, §5.2 L438–L442, §4.4 L410, §4.1 L381–L383, §8.2 L631 |
| support-binding | 8 | §5.2 L440–L442, §13 L915 |
| fixed-point | 13 | §7.3 L569 |
| mixed-runtime | 6 | §7.3 L569, §14.3 L963 |
| call-kind | 14 | §4.1 L366–L379 |
| ordinary-path | 8 | §6.3 L499–L502, §14.3 L969, §4 L347 |
| trigger-branch | 6 | §4.2 L389 |
| io-links | 8 | §4.3 L397–L404, §6.3 L502 |
| import | 15 | §5.2 L444, §5.3 L450, §3.2 L290 |
| transaction | 18 | §8.1 L587–L606, §8.2 L629–L643, §7.2 L565 |
| python-plan-apply | 30 | §2.4 L158–L176, §2.4.1 L201–L216, §2.5 L230–L231 (vendored, PS-H08, PS-H11) |
| python-completion | 14 | §7.1 L536–L546, §3.3 L298–L314, §2.4 L176, §2.2 L132 (vendored, PS-H09, PS-H15) |
| python-normalization | 29 | §7.2 L554–L565, §7.3 L569–L573, §5.2 L438–L440, §8.2 L631 (vendored, PS-H10–PS-H13, PS-H15) |
| python-import | 4 | §5.2 L444, §13 L921 (vendored, PS-H13) |
| python-support-binding | 7 | §5.2 L440–L442, §13 L915, §16 L1150 (vendored, PS-H13) |
| python-compile | 6 | §2.4.1 L182–L199, §5.1 L430 (vendored, PS-H14) |

Refusal codes sealed with their triggers: `canvas-disposed`, `descriptor-role-unknown`, `document-version-unsupported`, `fixture-abort`, `id-collision`, `input-conflict`, `io-set-selection-required`, `migration-reference-opaque`, `normalization-not-fixed`, `operation-cancelled`, `operation-error`, `profile-action-phase`, `profile-ambiguous-binding`, `profile-create-identity`, `profile-digest-mismatch`, `profile-open`, `profile-producer`, `profile-schema`, `profile-source-unavailable`, `profile-symbol`, `profile-type`, `profile-ui-parameters`, `profile-write-conflict`, `profile-write-set`, `reference-dangling`, `responsibility-preservation-required`, `support-binding-conflict`, `transaction-entry-unsupported`, `transaction-reentrant`.
Classification codes sealed as findings: the §4.1 call-kind codes, the ordinary-path,
trigger-branch, supplier/consumer readiness codes, `link-endpoint-invalid`,
`link-owner-invalid`, `flow-cross-container` and the graph-index
`reference-dangling` entry.

## Clause index

| Section | Cases |
| --- | --- |
| §2.2 | cn-c-wrong-type-reference, cn-n-dangling-reference |
| §2.4 | c-gateway-phase-start, c-write-conflict, c-write-coalesce, n-not-fixed, n-ensure-conflicting-definition, cn-plan-actor-mismatch, cn-plan-add-note-containment, cn-plan-ambiguous-binding, cn-plan-append-remove-conflict, cn-plan-create-aid-grid, cn-plan-create-aid-neutral, cn-plan-create-id-collision, cn-plan-create-process-input, cn-plan-create-task-grid, cn-plan-create-task-neutral, cn-plan-export-phase, cn-plan-invalid-authority, cn-plan-lane-member-cn, cn-plan-lane-member-support, cn-plan-link, cn-plan-link-wrong-target-type, cn-plan-missing-parameter, cn-plan-optional-binding-missing, cn-plan-recipe-not-compiled, cn-plan-remove-referenced, cn-plan-remove-without-intent, cn-plan-reparent-annotation, cn-plan-scalar-write-conflict, cn-plan-undeclared-parameter, cn-plan-unknown-element-parameter, cn-plan-unset-name, cn-plan-wrong-parameter-type, cn-c-not-fixed, cn-n-ensure-conflicting-definition, cn-n-not-fixed, cn-compile-create-identity-mismatch, cn-compile-ensure-non-support-type, cn-c-second-pass-refused, cn-n-second-pass-refused |
| §2.4.1 | cn-compile-ensure-missing-binding-write, cn-compile-support-profile, cn-compile-variants |
| §2.5 | c-gateway-stale-topology, cn-apply-stale-plan, cn-apply-input-conflict, cn-c-invalid-mode, cn-n-compat-before-integrity |
| §3.1 | c-descriptor-role-unknown, cn-c-descriptor-role-unknown |
| §3.2 | id-stable-vectors, id-root-first, id-identical-siblings, id-reorder-stable, id-rename-stable, id-ordinal-missing-only, id-two-owners, id-unicode-names, id-timer-siblings, id-timer-reorder, id-collision-computed, id-duplicate-source, n-two-processes, imp-remap-target-grammar, imp-remap-nonsubset-id |
| §3.3 | c-version-mismatch-first, c-digest-mismatch-first, c-document-version, cn-c-document-version |
| §4 | path-cross-container-flow-accept |
| §4.1 | c-dangling-call, n-incomplete-call-untouched, n-internal-call-untouched, n-legacy-marker-ignored, call-external-valid, call-internal, call-ambiguous, call-duplicate, call-marker-invalid, call-conflict, call-conflict-empty, call-target-empty-draft, call-target-empty-accept, call-target-type, call-target-required-draft, call-target-required-accept, call-source-doc-not-marker, call-target-dangling-accept, cn-c-empty-called-element |
| §4.2 | n-unicode-names, trig-single-trigger-accept, trig-downstream-branch-accept, trig-no-branch-accept, trig-no-branch-draft, trig-parallel-only-accept, trig-normalize-no-invention |
| §4.3 | io-complete-links-accept, io-missing-links-accept, io-missing-links-draft, io-wrong-direction-accept, io-wrong-direction-draft, io-endpoint-type-accept, io-link-owner-accept, io-link-owner-draft |
| §4.4 | n-inserted-link, n-business-lane-refusal, n-shared-item-anchor, n-anchor-after-link-removal |
| §5.1 | c-namespace-defaults |
| §5.2 | n-imported-supports, n-binding-duplicate-role, n-binding-wrong-parent, n-binding-band-process-ref, n-binding-wrong-type, n-black-box-pool-retained, n-hash-shaped-occupant, n-reserved-lane-renamed, propose-recovery-with-provenance, propose-recovery-without-provenance, propose-recovery-partial-provenance, propose-black-box-pool, bind-supports-explicit-selection, bind-supports-gated, bind-supports-conflict, n-after-explicit-selection, imp-remap-total, imp-remap-total-edit, imp-remap-unapproved, imp-remap-swap, imp-remap-collision, imp-remap-duplicate-result, imp-remap-unknown-source, imp-remap-opaque, imp-remap-opaque-attested, imp-remap-dangling, imp-remap-qname, imp-remap-owner, cn-n-reserved-lane-renamed, cn-remap-owner, cn-remap-gated, cn-remap-unknown-source, cn-remap-target-grammar, cn-propose-recovery-partial-provenance, cn-propose-recovery-with-provenance, cn-propose-recovery-without-provenance, cn-propose-black-box-pool, cn-bind-supports-conflict, cn-bind-supports-explicit-selection, cn-bind-supports-gated, cn-n-after-explicit-selection |
| §5.3 | imp-projection-out-of-base |
| §6.3 | path-disconnected-task-accept, path-disconnected-task-draft, path-gateway-without-incoming-accept, path-unreachable-component-accept, path-cannot-reach-end-accept, path-incomplete-call-not-exempt-accept, path-unlinked-external-not-exempt-accept |
| §7.1 | c-isexecutable-neutral, c-isexecutable-grid, c-gateway-direction-control, c-empty-process, c-topology, c-gateway-direction, c-item-backing, c-input-ports, c-sets-default, c-sets-single-uncovered, c-sets-several-uncovered, c-sets-several-covered, c-preserve, c-invalid-mode, c-extraction-authorized, c-extraction-unauthorized, c-output-port-gated, c-output-port-qualification, tx-io-set-selection-required, tx-io-set-explicit-selection, cn-c-version-mismatch-first, cn-c-digest-mismatch-first, cn-c-gateway-direction-control, cn-c-output-port-gated, cn-c-output-port-qualification, cn-c-extraction-authorized, cn-c-extraction-unauthorized, cn-compile-port-without-authority |
| §7.2 | n-full, n-full-edit, n-imported-supports-edit, n-business-lane-refusal-edit, n-hash-shaped-occupant-edit, n-empty-process, n-roles-and-empty-support, n-direction-reversal, n-deleted-support-stays-absent, n-after-owner-remap, n-recreate-after-remap, n-recreate-after-remap-edit, n-relation-direction-conflict, sort-placements, n-place-neutral, n-place-grid-shared-anchor, n-place-grid-inserted-association, n-place-grid-deleted-association, tx-delete-support-undo, cn-n-support-band-process-ref, cn-n-support-creation-gated, cn-n-support-duplicate-role, cn-n-support-imported-ids, cn-n-support-imported-ids-edit, cn-n-support-late-band-collision, cn-n-support-late-band-collision-edit, cn-n-support-one-process, cn-n-support-two-processes, cn-n-support-wrong-parent, cn-n-place-grid-deleted-association, cn-n-place-grid-inserted-association, cn-sort-placements, cn-plan-remove-empty-support, cn-n-deleted-support-stays-absent, cn-n-recreate-after-remap, cn-n-reference-region-edit, cn-n-external-membership-edit, cn-n-recreate-after-remap-edit, cn-n-relation-direction-conflict |
| §7.3 | n-refusal-after-ensures, fp-n-full, fp-n-two-processes, fp-n-imported-supports, fp-n-direction-reversal, fp-n-unicode-names, fp-c-root-first, fp-c-topology, fp-c-gateways, fp-c-ports, fp-c-sets-default, fp-c-timers, fp-c-on-n-input, fp-c-after-n, mix-n-full-js-py-js, mix-n-full-py-js-py, mix-n-two-processes-js-py-js, mix-n-two-processes-py-js-py, mix-n-unicode-names-js-py-js, mix-n-unicode-names-py-js-py, cn-n-support-refusal-after-five-ensures |
| §8.1 | tx-dispose-pending |
| §8.2 | n-placement-intent-di-only, n-placement-intent-unknown, tx-incremental-draft, tx-batch-one-entry, tx-cancelled, tx-cancel-pending, tx-dispose-no-leak, tx-reentrant-refused, tx-guard-recovery, tx-refusal-preserves, tx-di-only-move, tx-corrected-noop, tx-theme-history, tx-stale-revision, tx-empty-history, tx-bare-recipe-refused, cn-n-placement-intent-di-only, cn-n-placement-intent-unknown |

Case IDs above omit the `l3-` prefix; line ranges per case are in `index.json`.

## UNSEALED

| Id | OPEN | Point | DESIGN default |
| --- | --- | --- | --- |
| U1 | OPEN-HOOK (§8.2 L637–639) | Live pointer and keyboard gesture interception (capture at pointer-down or direct-edit start, preview geometry, interception before the upstream commit or the measured restore fallback) and the browser witnesses DI-only drag, resize, reconnect, palette drop, direct edit, keyboard delete/paste, cancellation during async layout, multi-page rollback, one undo/redo and no callback leak; and a native modeling command (a command-stack entry such as element.updateLabel) arriving while the root transaction is applying. | Detached staging, one root profile.transaction command, final-only callbacks; an entry that cannot preserve pointer capture, selection, undo cursor and DI is disabled with transaction-entry-unsupported. No accepted lot-0 prototype or receipt exists at the seal base: only the programmatic contract (l3-tx-*) is sealed, and a gesture's final intent enters through the stageGesture adapter seam. DESIGN L635 refuses any unexpected command entry during applying with transaction-reentrant and disables unadapted mutation commands, but the headless canvas has no native modeling service and no caller-visible outcome of a refused native command is defined before the prototype receipt: l3-tx-reentrant-refused seals the public applyCommands re-entry only. |
| U2 | OPEN-RESERVED-N (§7.2 L554) | Activated N support creation in business-profile editing once both gates pass (owner ratified, conductor plus twin atomicity proof pending). | Until both gates pass, an N ensure that would create a support refuses profile-open in edit activation (sealed: l3-n-full-edit, l3-n-hash-shaped-occupant-edit, l3-n-recreate-after-remap-edit); neutral qualification proceeds (sealed qualification vectors). The activated editing behavior is not sealed. |
| U3 | OPEN-EXTERNAL, OPEN-BASE (§4.1 L362–364) | Creation of an external call (palette or AI), migration of legacy external markers to the discriminator, and the activated external branch of N in editing. | One dedicated native Documentation marker, absence means incomplete; external creation and migration stay unavailable until both libraries prove the encoding and the effective base admits CallActivity.documentation with a conditional calledElement. Sealed: recognition and the N external branch as qualification vectors with the neutral marker, and the edit refusal l3-n-imported-supports-edit (profile-open). The profile has no external creation entry. |
| U4 | OPEN-SHARING (§4.4 L410) | Removal of a conflicting business-lane membership once an accepted persisted representation of the original responsibility or an approved concrete loss exists, and the explicit bulk name synchronization command. | Preserve original memberships: qualification refuses responsibility-preservation-required (l3-n-business-lane-refusal), edit refuses profile-open (l3-n-business-lane-refusal-edit); never synchronize divergent reference names during N (l3-n-two-processes). The permitted removal and the bulk command are not sealed. |
| U5 | OPEN-IO (§7.1 L546) | Production activation of the missing-output-source producer exception and any completion that would remove or weaken a producer restriction. | Preserve every valid port and set; the main profile has no output-port authority (l3-c-input-ports leaves DOA_1 unported); the variant expressing the authority refuses profile-open in edit (l3-c-output-port-gated) and creates the keyed port only in qualification (l3-c-output-port-qualification). Activation needs the owner's approval of the precise change. |
| U6 | OPEN-RELATIONS (§4.3 L404) | External-producer substitution (an Association from an external call to a Process DataOutput), the activity-only producer restriction, the acceptance status of documents depending on them, and N's or validate's handling of that candidate link. | Retain every evidenced supplier/consumer link with its direction, invent no endpoint, keep the substitution and the activity-only rule gated, refuse affected final acceptance with profile-open while unresolved. The link-endpoint rule never reports the candidate pair, no sealed vector contains it, and N has no reversal recipe for it. |
| U7 | OPEN-RELATIONS (§4.2 L389–391; situation/trigger branch variant, DESIGN §13 L919) | The stricter immediate named-branch convention (start event followed directly by an exclusive gateway with named outgoing flows) and any acceptance status that depends on adopting it. | Ratified default: a source-backed downstream exclusive branch, no invented adjacency or choice text, no gateway created by N; the strict candidate stays disabled until expressly adopted (sealed: l3-trig-downstream-branch-accept accepts a non-adjacent branch). |
| U8 | OPEN-MIGRATION (§5.3 L452) | Every concrete behavior-changing or lossy migration: legacy evidence adapters (process-reference metadata, text markers, placement metadata, support labels) and the approval of a specific ID remap of accepted data. | Evidence-based classification, complete loss and remap report, retained ambiguous source snapshot, activation refuses rather than discarding. Sealed: remap mechanics with an explicit approval record and the OPEN-ID gate (l3-imp-remap-*), legacy markers never classifying (l3-n-legacy-marker-ignored); no legacy adapter is sealed. |
| U9 | OPEN-ID, OPEN-MACHINE (§3.2 L290) | Owner restrictions on already accepted persisted data, the activated binding transaction in editing once the gates pass, and the persisted-loss policy for retained black-box participants the base does not permit. | Explicit migration only, never edit-time normalization; recovery stays a proposal (sealed: l3-propose-*) until an explicit binding transaction, gated by OPEN-MACHINE (sealed: l3-bind-supports-gated refuses profile-open in edit, the qualification vectors bind); unrelated black-box participants are retained where the base permits them (l3-n-black-box-pool-retained), otherwise reported as normal import loss. |

AI extraction and iteration paths (OPEN-ITERATION, OPEN-REFUSAL, OPEN-PROVIDER)
belong to the private host lane and are not covered here.

## Source gaps (not owner OPENs; UNSEALED pointers in the cases)

- Report content of load, snapshot restore, theme, undo and redo results (their
  change events carry the same report, compared by relation) and the transactionId
  of their change events (DESIGN L584–L606, L641).
- The Report/2 spelling of the correction notice of a corrected no-op (L641); only
  its presence as the single entry is sealed.
- Pages, geometry, occurrence keys, selection and active page of canvas-computed
  layouts (lot-4 outputs; the Layout/1 record and its version are compared) and edge
  routes after a move (L723, harmonization K5); restored states and the moved shape
  are exact.
- Session-local subscription IDs and history epochs (L606, L268).
- The refusal code of a read-only mutation (L619, L629) is not sealed.

## Block A admission findings (for the conductor)

1. `count` is read as `selector`, but the pinned schema requires `select`.
2. `reachable` is read as `source`/`target`, but the schema requires `from`/`to`.
3. `ensure.ownerId` is read as a binding name, but the schema types it as a value.
4. `remove.dependents` is read as an array, but the schema closes it to one selector.
5. An empty `calledElement` is refused as `reference-dangling` by the reference
   validator, contrary to `call-kind-conflict`/`call-target-empty` (L373, L375).
6. Static typing does not narrow `any(...)` unions; the inputs narrow owner
   bindings with `typeIs(bpmn:Process)`, with unchanged semantics.
7. `validate` refuses any envelope/compiled identity difference with
   `profile-metadata-conflict`; C1 requires the §3.3 matrix.

## Verification

- `tests/profile-lot3-golden-independence.test.mjs`: the reviewed seal pin and the
  reseal ledgers chained from the first seal, every sealed byte, a one-byte change
  in any sealed file, the closed case shape, comparator pins and discrimination
  self-tests (the vendored comparators included), the rejection of every output of
  the former transaction double and of staged-tree coordinates, the vendored records
  against the pinned Python seal, citations, the UNSEALED list, and an AST-based
  import guard over the helper and the comparator module with mutation tests for each
  bypass family.

## Per-case discrimination

Each sealed vector and the plausible wrong implementation it fails (copied from
`index.json`; the golden test keeps both identical).

| Case | Fails against |
| --- | --- |
| `l3-id-stable-vectors` | Fails an allocator that trims keys (merging ' padded '/'padded'), Unicode-normalizes them (NFC or NFD merges the precomposed U+00E9 and decomposed e+U+0301 keys, NFKC also NBSP and space), escapes non-ASCII as \u sequences before hashing, or hashes a tuple other than ["profile-mechanism/1",owner,slot,key]. |
| `l3-id-root-first` | Fails an implementation that allocates children before the Definitions root (wrong owner domain), hashes content after stamping isExecutable or empty topology arrays, uses an undecorated containment name instead of the descriptor-qualified slot, gives the DataStore and Process one shared ordinal, or reports allocated IDs with exact instead of generated result provenance. |
| `l3-id-identical-siblings` | Fails an allocator that omits the duplicate ordinal (both siblings collide or receive one ID), counts ordinals across the whole document, or orders ordinals by anything other than the original containment array; the IDs equal the lot-0 sealed sibling vectors. |
| `l3-id-reorder-stable` | Fails an implementation that recomputes duplicate ordinals from current array positions (swapping the two surviving IDs) or reports any change for an already completed, reordered tree. |
| `l3-id-rename-stable` | Fails an implementation that re-derives content-signature IDs for surviving nodes after a label edit; the birth signature is used once only. |
| `l3-id-ordinal-missing-only` | Fails an allocator that counts the ID-bearing sibling with the same content in the duplicate ordinal (the two missing IDs would use ordinals 1 and 2), or that rewrites the existing Task_Same ID. |
| `l3-id-two-owners` | Fails an allocator that scopes duplicate ordinals per document instead of per ownerId and containment property (the second task would get ordinal 1). |
| `l3-id-unicode-names` | Fails an implementation that Unicode-normalizes (NFC or NFD merges the precomposed U+00E9 and decomposed e+U+0301 names, NFKC also NBSP and space), trims (NBSP, trailing space, U+0085) or line-splits (U+2028, U+0085) names before hashing, escapes U+E000/U+10000 in JCS, rewrites the stored names, or numbers duplicate ordinals across siblings of different content (the eight signatures differ, so every ordinal is 0 and the eight IDs differ). |
| `l3-id-timer-siblings` | Fails an implementation that assigns an ID to the ID-less FormalExpression, derives the timer definition owner from the Process instead of its own event, or uses one ordinal sequence for both timer definitions. |
| `l3-id-timer-reorder` | Fails an implementation that reallocates timer siblings or their definitions after a reorder, or reports changes on a completed tree. |
| `l3-id-collision-computed` | Fails an implementation that suffixes, overwrites or reidentifies when a computed stable-id/1 value is already used by a different object, commits a partial completion, or reports a refusal without the echoed identity and the empty diagnostics/report. |
| `l3-id-duplicate-source` | Fails an implementation that keeps the last duplicate, renames one of them or completes the document instead of refusing duplicate source IDs structurally. |
| `l3-c-isexecutable-neutral` | Paired with the other neutral profile: fails a library that hard-codes the private completion default instead of executing the injected complete recipe (this profile writes isExecutable=false). |
| `l3-c-isexecutable-grid` | Paired with the other neutral profile: fails a library that hard-codes the private completion default instead of executing the injected complete recipe (this profile writes isExecutable=true). |
| `l3-c-gateway-direction-control` | With the lot-0 neutral profile, which declares no topology or gateway recipe, fails a library that hard-codes topology repair (Gateway_G.incoming would become [Flow_1]) or stamps a gateway direction instead of executing only the injected recipes. |
| `l3-c-empty-process` | Fails an implementation that skips empty processes, invents boundary events or activities, or lets C create structural supports (supports belong to N). |
| `l3-c-topology` | Fails an implementation that keeps stale or document-ordered incoming/outgoing arrays, merges the cross-container Flow_X into Task_1.incoming, retargets the invalid SequenceFlow instead of leaving it unchanged, or omits the absent-to-present End_A.incoming write. |
| `l3-c-gateway-direction` | Fails an implementation that treats the moddle default of an absent gatewayDirection as present, keeps an existing wrong direction, uses a threshold of one instead of more than one, or rewrites the already correct Converging join. |
| `l3-c-gateway-stale-topology` | With direction counted from sequence flows, a stale incoming array is repaired and the direction is Mixed in one bounded run; fails an implementation that derives the direction from the stale stored array or needs a second pass. |
| `l3-c-gateway-phase-start` | The variant profile counts stored incoming references, so its first run sets Diverging from the phase-start snapshot and the bounded second evaluation sees Mixed; fails an implementation that lets one sibling read another sibling's writes (would return Mixed), retries without bound, or commits the non-fixed point. |
| `l3-c-item-backing` | Fails an implementation that replaces or re-creates the valid backing of DataObjectReference_Old, reuses the first DataObject, keys the new backing by name or position, infers dataStoreRef for the orphan reference from the equal DataStore name, or reports the created backing with an input source pointer. |
| `l3-c-input-ports` | Fails a first-port shortcut (both associations share one port), ports keyed by array position or created in array order (DIA_2 first), replacement of the valid Property_Existing target, creation of the missing DOA_1 output source port without an accepted code-creation authority, or generated ports reported without generated coordinates. |
| `l3-c-sets-default` | Fails an implementation that copies document order [b,a] instead of the selector ID order, allocates the sets under the nearest containing Process instead of the explicit Definitions ownerId (forbidden owner inference), or omits the default sets. |
| `l3-c-sets-single-uncovered` | Fails an implementation that rebuilds the set in ID order (moving DataInput_b), appends the uncovered inputs in document order [c, a] instead of canonical ID order [a, c], or creates a second default set beside the existing one. |
| `l3-c-sets-several-uncovered` | Fails an implementation that silently updates the first input set (or any set) when several sets exist and DataInput_c is uncovered; the whole completion refuses atomically. |
| `l3-c-sets-several-covered` | Fails an implementation that merges, reorders or re-creates sets once every input is covered by an explicit selection; the second set membership must be preserved untouched. |
| `l3-c-preserve` | Fails an implementation that downgrades UserTask to Task, drops or rewrites the condition expression, normalizes the Documentation whitespace/NBSP/CRLF, parses JSON-looking text without a declared textFormat, rebuilds the two overlapping input sets, or replaces the valid port. |
| `l3-c-write-conflict` | The variant profile adds a sibling complete recipe writing isExecutable=true; fails a last-writer-wins or declaration-order winner implementation instead of refusing profile-write-conflict atomically. |
| `l3-c-write-coalesce` | The variant profile adds an identical sibling write; fails an implementation that refuses identical writes as a conflict, reports two change entries for one coalesced write, or attributes it to the second recipe instead of the first planning recipe. |
| `l3-c-namespace-defaults` | Fails an implementation that leaves required generated Definitions defaults absent or stamps values other than the profile's declared namespace and base-contract version. |
| `l3-c-dangling-call` | Fails an implementation that treats an unresolved nonempty calledElement as absent (incomplete call) or as an external call, or completes the document instead of refusing the dangling reference at the graph index. |
| `l3-c-version-mismatch-first` | A document stored under the older minor 1.0.0 of the same profile, whose source package is not available to C: fails an implementation that allocates the missing Task ID or stamps defaults before the compatibility row, or that accepts a minor difference as compatible. |
| `l3-c-digest-mismatch-first` | Same profile ID and version with a known unequal digest: fails an implementation that completes the document, waives the conflict, or reports profile-source-unavailable instead of the identity conflict. |
| `l3-c-document-version` | Fails an implementation that reads an unknown envelope documentVersion as version 1, completes it, or fabricates profileIdentity/baseRevision in the refusal (an unknown documentVersion echoes neither). |
| `l3-c-descriptor-role-unknown` | Fails an implementation that drops, keeps or completes around a member the descriptors do not classify, instead of refusing descriptor-role-unknown at the graph index before C. |
| `l3-c-invalid-mode` | The mode vocabulary is closed (extraction, retained); fails an implementation that accepts draft as a third mode or treats it as retained instead of refusing operation-error. |
| `l3-c-extraction-authorized` | The variant grants the ai actor exactly the four authored fields; fails an implementation that refuses authorized extraction content, checks C's own code writes against the ai actor, or skips identity allocation for extracted content. |
| `l3-c-extraction-unauthorized` | Under the main profile no field admits the ai actor; fails an implementation that ignores the extraction mode, treats it as retained content, or completes before refusing profile-producer. |
| `l3-c-output-port-gated` | In edit activation the missing-output-source producer exception is gated; fails an implementation that creates the port, commits the DataOutputAssociation.sourceRef fill, or refuses with another code than profile-open. |
| `l3-c-output-port-qualification` | Neutral qualification exercises the gated exception: fails an implementation that keys the output port by position or by the activity alone, reuses an input port, or refuses in qualification. |
| `l3-n-full` | Fails an implementation that creates supports unconditionally or by label, allocates them outside stable-id/1, coalesces nothing (two Collaborations), places the DataStoreReference outside the bound band, writes Process IO into Lane.flowNodeRef, picks a non-minimal anchor, reorders the call's Documentation, emits unsorted placements, or reports the coalesced Collaboration ensure twice or under n-reference-band. |
| `l3-n-full-edit` | Edit activation of the same input: the first effective change is the Collaboration creation, gated by OPEN-RESERVED-N; fails an implementation that creates supports in edit, refuses with another code, or commits part of the run. |
| `l3-n-inserted-link` | An inserted reference link with a lower ID becomes the anchor and joins the related set while every support keeps the l3-n-full identity; fails an implementation that caches the previous anchor, drops the extra use link, or reallocates supports after an association insertion. |
| `l3-n-two-processes` | Fails an implementation that shares one Collaboration between processes, allocates both under one ownerId domain, deduplicates the shared store's references by title, synchronizes the local reference name with the store name, or attaches a band to the wrong owner. |
| `l3-n-imported-supports` | Fails an implementation that re-creates generated supports beside correctly bound imported ones, renames reused supports to the ensure field literals, reorders the business lanes, removes the clerk membership, or reports the membership write with generated instead of exact coordinates. |
| `l3-n-imported-supports-edit` | Edit activation: reuse of every bound support is never gated, but the external-lane membership append is the external branch of N (OPEN-EXTERNAL); fails an implementation that appends in edit or reports a support conflict instead of profile-open. |
| `l3-n-business-lane-refusal` | The external call sits in the unbound business lane and no accepted persisted responsibility representation exists: in qualification the library responsibility check refuses the removal; fails an implementation that removes that membership (moving the call), leaves the call in two lanes, or commits any support change. |
| `l3-n-business-lane-refusal-edit` | Edit activation: the removal of an existing Lane.flowNodeRef member is gated by OPEN-SHARING before the responsibility check; fails an implementation that answers responsibility-preservation-required or relocates the call in edit. |
| `l3-n-binding-duplicate-role` | Fails an implementation that accepts two bindings for one owner and role (first or last wins) instead of refusing support-binding-conflict at envelope integrity, before any plan or gate. |
| `l3-n-binding-wrong-parent` | Fails an implementation that accepts a bound band whose parent is not the bound collaboration, or silently moves it into the bound collaboration. |
| `l3-n-binding-band-process-ref` | Fails an implementation that accepts a bound reference band carrying processRef (a band is a black-box Participant) or strips the reference silently. |
| `l3-n-binding-wrong-type` | Fails an implementation that accepts an external-lane binding targeting a Task, or replaces the target by creating a new lane. |
| `l3-n-black-box-pool-retained` | Without trusted bindings, fails an implementation that adopts the unbound collaboration, its main-named participant or the reference-band-named black-box pool by label or structure; N creates its own bound supports and retains the ordinary pool unchanged. |
| `l3-n-hash-shaped-occupant` | An unbound participant already holds the exact band allocator ID; fails an implementation that reuses it because the ID is hash-shaped, suffixes the band ID, or commits the collaboration and main participant planned before the late collision. |
| `l3-n-hash-shaped-occupant-edit` | Edit activation of the same input: the gated Collaboration creation precedes the late band collision in recipe order; fails an implementation that reports id-collision first or evaluates every recipe before applying the first gate. |
| `l3-n-incomplete-call-untouched` | Fails an implementation that gives a targetless unmarked call an external lane, membership, placement or reversal even though a descriptive Association links it to the start event. |
| `l3-n-internal-call-untouched` | Fails an implementation that moves an internal call (calledElement resolving to an in-document Process) to the external lane or skips the collaboration of the called empty process. |
| `l3-n-legacy-marker-ignored` | Fails an implementation that classifies a call as external from Documentation text without the configured textFormat, from an annotation prefix, or from any other legacy marker. |
| `l3-n-empty-process` | Fails an implementation that skips an empty process or creates an external lane, lane set or reference band without a recognized need. |
| `l3-n-roles-and-empty-support` | Edit activation with only bound supports to reuse (never gated): business lanes were reordered and renamed and the bound external lane is empty; fails an implementation that sorts or re-labels lanes, garbage-collects the empty bound support, gates a reuse, or reports any change. |
| `l3-n-reserved-lane-renamed` | The generated reserved lane was renamed by the user: reuse validates type, parent, owner relationship and single binding only (harmonization C5); fails an implementation that compares the declared ensure field and refuses support-binding-conflict, renames the lane back, or creates a second lane. |
| `l3-n-shared-item-anchor` | Fails an implementation that anchors to the first association in document order (DIA_b), to the producer DOA_z, or omits one of the three related associations; the tree itself is unchanged. |
| `l3-n-anchor-after-link-removal` | After both consuming associations of the shared item were deleted, fails an implementation that keeps a cached consuming anchor, keeps deleted associations in the related set, or leaves the item unanchored instead of falling back to the producing DOA_z. |
| `l3-n-direction-reversal` | Fails an implementation that leaves wrong-direction descriptive links unchanged, reverses without setting associationDirection One, reallocates the association IDs, converts an Association into a data or sequence flow, computes the reference anchor from link direction (non-fixed second run), or reports the reversal without exact before/after coordinates. |
| `l3-n-unicode-names` | Fails an implementation that Unicode-normalizes (NFC composes the decomposed e+U+0301, NFD decomposes U+00E9 and U+00F4, NFKC also folds NBSP), trims (NBSP, U+0085, BOM, trailing space) or re-splits the LF/CRLF/U+2028 start situations, rewrites astral (U+10000, U+1F4D8) or private-use (U+E000) characters, or escapes non-ASCII differently in canonical bytes. |
| `l3-n-deleted-support-stays-absent` | The reserved lane and its binding were deleted explicitly and nothing needs the role: fails an implementation that resurrects the lane because its lane set is still bound, recreates every declared support role, or garbage-collects the empty bound lane set. |
| `l3-n-after-owner-remap` | Edit activation on the remapped document: fails an implementation that re-derives surviving support IDs from the current owner Process_R, refuses because a support ID no longer matches its allocator tuple, or re-creates any support. |
| `l3-n-recreate-after-remap` | A later need recreates the deleted reserved lane: fails an implementation that resurrects the old Process_A-derived lane ID, allocates under the old owner, reallocates the surviving lane set or collaboration, or creates a second lane set. |
| `l3-n-recreate-after-remap-edit` | Recreation is a support creation: fails an implementation that treats the re-creation of a previously bound role as a reuse and proceeds in edit activation. |
| `l3-n-placement-intent-di-only` | A DI-only move of the reference: fails an implementation whose N changes the semantic tree, bindings or placements because of a placement intent, or ignores the intent record shape. |
| `l3-n-placement-intent-unknown` | A placement intent naming no element: fails an implementation that ignores the stale intent or invents an element instead of refusing reference-dangling. |
| `l3-n-not-fixed` | The variant adds a recipe reversing the permitted reference pair back: the first run reverses, the bounded second evaluation reverses again; fails an implementation that retries without bound, commits the first-run result, or skips the second evaluation. |
| `l3-n-relation-direction-conflict` | Two recipes plan different associationDirection values on one wrong-direction association; fails a last-writer-wins or declaration-order implementation instead of refusing profile-write-conflict atomically. |
| `l3-n-ensure-conflicting-definition` | Two ensure plans for the same owner and reference-band role differ in their declared name; fails an implementation that coalesces them, keeps the first or last definition, or creates two bands instead of refusing profile-write-conflict. |
| `l3-sort-placements` | Fails a sort that uses code points instead of UTF-16 units (the U+E000 region before U+10000), places a present anchor before an absent one, or compares relatedAssociationIds by length or by their last element. |
| `l3-n-refusal-after-ensures` | The variant appends a refuse step planned after every support ensure of l3-n-full: fails an implementation that commits the supports or bindings created before the refusal, reports a gate or another code, or mutates the caller envelope. |
| `l3-n-place-neutral` | On the lot-0 neutral completed tree, fails an implementation whose placements differ from the lot-0 sealed ones (content region, no anchor, empty related set) or that writes the tree during placement. |
| `l3-n-place-grid-shared-anchor` | On the lot-0 grid completed tree, fails an implementation whose anchors or related sets differ from the lot-0 sealed placements (first consuming association by ID, every touching association related). |
| `l3-n-place-grid-inserted-association` | An inserted consuming association with a lower ID becomes Task_A's anchor and joins both related sets; fails an implementation that keeps the previous anchor or omits the inserted link from Task_B's related set. |
| `l3-n-place-grid-deleted-association` | Both consuming associations of Task_A deleted: fails an implementation that keeps a deleted anchor, leaves Task_A unanchored instead of falling back to the producing association, or keeps deleted IDs in the related sets. |
| `l3-propose-recovery-with-provenance` | Exact allocator ID, expected type, parent and owner relationship, and creation provenance for each support: fails an implementation that proposes nothing, applies the bindings itself, proposes by name, or returns unsorted proposals. |
| `l3-propose-recovery-without-provenance` | Without creation provenance a hash-shaped ID alone never authorizes reuse: fails an implementation that proposes the generated-looking supports or refuses instead of returning no proposal. |
| `l3-propose-recovery-partial-provenance` | Only the provenance-listed Collaboration qualifies: fails an implementation that also proposes the main Participant, lane set, lane or band whose IDs match but whose provenance is absent. |
| `l3-propose-black-box-pool` | An imported collaboration and a black-box pool labelled like supports: fails an implementation that proposes them by label or structure (their IDs are not allocator IDs). |
| `l3-bind-supports-explicit-selection` | An explicit support selection binds the imported Collaboration: fails an implementation that also binds the pool, edits the tree, reports change entries, or requires N to adopt the collaboration by label. |
| `l3-bind-supports-gated` | Edit activation: the explicit binding transaction is gated by OPEN-MACHINE; fails an implementation that commits the binding in edit or reports another code. |
| `l3-bind-supports-conflict` | The owner and role are already bound: fails an implementation that replaces or duplicates the binding instead of refusing support-binding-conflict. |
| `l3-n-after-explicit-selection` | N after the explicit selection reuses the bound Collaboration and creates its own main Participant and band inside it: fails an implementation that adopts the ordinary pool labelled reference-band, creates a second Collaboration, or reallocates the selected one. |
| `l3-fp-n-full` | Fails an implementation whose second N run re-creates, re-binds or re-appends supports, re-adds the call membership, gates a no-op in edit, or returns a non-empty report. |
| `l3-fp-n-two-processes` | Fails a second N run that merges or re-creates the per-process collaborations or reorders the shared-store placements. |
| `l3-fp-n-imported-supports` | Fails a second N run that appends the already present call membership again, gates the no-op append in edit, or rewrites imported support IDs. |
| `l3-fp-n-direction-reversal` | Fails a second N run that reverses the corrected links back, or changes the reference anchor once link directions changed. |
| `l3-fp-n-unicode-names` | Fails a second N run that re-encodes or normalizes any non-ASCII or whitespace name byte. |
| `l3-fp-c-root-first` | Fails a second C run that reallocates birth-signature IDs from current content or re-stamps defaults. |
| `l3-fp-c-topology` | Fails a second C run that still changes topology arrays or now pulls the cross-container flow into Task_1. |
| `l3-fp-c-gateways` | Fails a second C run that flips any gateway direction (sequential or stale-array evaluation). |
| `l3-fp-c-ports` | Fails a second C run that creates another port for an association that already has its keyed port. |
| `l3-fp-c-sets-default` | Fails a second C run that creates another default set or reorders the default membership. |
| `l3-fp-c-timers` | Fails a second C run that touches timer definitions or ID-less expressions. |
| `l3-fp-c-on-n-input` | Proves the l3-n-full input is a C fixed point; fails an implementation whose C rewrites topology, sets, ports or the call documentation of an already completed document. |
| `l3-fp-c-after-n` | Fails an implementation whose C rewrites N-owned supports, bindings or memberships of a normalized document. |
| `l3-mix-n-full-js-py-js` | Fails a twin pair whose js first run differs from the sealed N(x) result, whose python run on those bytes is not an exact fixed point with an empty report in edit activation, or whose transport changes IDs, key order, number spelling or non-ASCII encoding. |
| `l3-mix-n-full-py-js-py` | Fails a twin pair whose python first run differs from the sealed N(x) result, whose js run on those bytes is not an exact fixed point with an empty report in edit activation, or whose transport changes IDs, key order, number spelling or non-ASCII encoding. |
| `l3-mix-n-two-processes-js-py-js` | Fails a twin pair whose js first run differs from the sealed N(x) result, whose python run on those bytes is not an exact fixed point with an empty report in edit activation, or whose transport changes IDs, key order, number spelling or non-ASCII encoding. |
| `l3-mix-n-two-processes-py-js-py` | Fails a twin pair whose python first run differs from the sealed N(x) result, whose js run on those bytes is not an exact fixed point with an empty report in edit activation, or whose transport changes IDs, key order, number spelling or non-ASCII encoding. |
| `l3-mix-n-unicode-names-js-py-js` | Fails a twin pair whose js first run differs from the sealed N(x) result, whose python run on those bytes is not an exact fixed point with an empty report in edit activation, or whose transport changes IDs, key order, number spelling or non-ASCII encoding. |
| `l3-mix-n-unicode-names-py-js-py` | Fails a twin pair whose python first run differs from the sealed N(x) result, whose js run on those bytes is not an exact fixed point with an empty report in edit activation, or whose transport changes IDs, key order, number spelling or non-ASCII encoding. |
| `l3-call-external-valid` | Fails an implementation that reports a finding for a valid marked external call, requires calledElement, or ignores the marker appended after source Documentation. |
| `l3-call-internal` | Fails an implementation that classifies a call resolving to an in-document Process as incomplete, external or dangling. |
| `l3-call-ambiguous` | Fails an implementation that picks a winner among markers with different texts, reports duplicate or invalid instead, or treats the first marker as authoritative. |
| `l3-call-duplicate` | Fails an implementation that deduplicates identical markers silently and recognizes an external call instead of reporting the duplicate. |
| `l3-call-marker-invalid` | Fails an implementation that accepts an unknown marker text as a call kind or falls back to the incomplete-call classification. |
| `l3-call-conflict` | Fails an implementation that lets the internal target win over a valid external marker (or the reverse) instead of reporting the conflict. |
| `l3-call-conflict-empty` | Fails an implementation that treats an empty calledElement as absent next to a valid marker, or refuses it as a dangling reference before classification. |
| `l3-call-target-empty-draft` | Fails an implementation that refuses an empty calledElement as reference-dangling before classification, or reports it at error severity in draft. |
| `l3-call-target-empty-accept` | Fails an implementation that keeps the draft warning at acceptance or classifies the empty target as required-missing. |
| `l3-call-target-type` | Fails an implementation that accepts any CallableElement as an internal call target or reports it as dangling. |
| `l3-call-target-required-draft` | Fails an implementation that treats a targetless unmarked call as external, as an error in draft, or not at all. |
| `l3-call-target-required-accept` | Fails an implementation that keeps the targetless unmarked call at warning severity for acceptance. |
| `l3-call-source-doc-not-marker` | Fails an implementation that recognizes the marker by its text without the exact configured textFormat. |
| `l3-call-target-dangling-accept` | Fails an implementation that refuses validate for a dangling calledElement, classifies it as incomplete or as a wrong target type, omits the integrity entry, or reports it at warning severity. |
| `l3-path-disconnected-task-accept` | Fails an implementation whose external-call exemption also silences the disconnected ordinary Task, or that exempts every node once a linked external call exists. |
| `l3-path-disconnected-task-draft` | Fails an implementation that refuses or errors on an incomplete draft instead of reporting readiness warnings. |
| `l3-path-gateway-without-incoming-accept` | Fails an implementation that checks only activities, or derives reachability from containment instead of resolved sourceRef->targetRef sequence flows. |
| `l3-path-unreachable-component-accept` | Fails an implementation that accepts a component able to reach End but unreachable from Start, or reports only its first node. |
| `l3-path-cannot-reach-end-accept` | Fails an implementation that checks reachability from Start only, or accepts a dead-end branch because another branch reaches End. |
| `l3-path-incomplete-call-not-exempt-accept` | Fails an implementation that extends the external-call exemption to a linked but unmarked, targetless call. |
| `l3-path-unlinked-external-not-exempt-accept` | Fails an implementation that exempts a recognized external call without any descriptive link; only recognized and linked calls are exempt. |
| `l3-path-cross-container-flow-accept` | On the completed l3-c-topology tree, fails an implementation that accepts a SequenceFlow leaving its flow container, or lets that flow make Task_B reach an end event of another process. |
| `l3-trig-single-trigger-accept` | Fails an implementation that requires a branch after a single incoming trigger. |
| `l3-trig-downstream-branch-accept` | Fails an implementation of the stricter candidate (Start->ExclusiveGateway adjacency with named outgoing flows), which is disabled until expressly adopted; a downstream exclusive branch satisfies the ratified default. |
| `l3-trig-no-branch-accept` | Fails an implementation that accepts several triggers without any downstream exclusive branch at acceptance. |
| `l3-trig-no-branch-draft` | Fails an implementation that blocks drafts or reports the missing branch at error severity in draft. |
| `l3-trig-parallel-only-accept` | Fails an implementation that counts a parallel gateway as the required exclusive branch. |
| `l3-trig-normalize-no-invention` | N on a start event with two triggers and no branch must not insert a gateway, flows or choice names; it only creates the declared supports and one coalesced membership write, and keeps the situations text. |
| `l3-io-complete-links-accept` | Fails an implementation that requires links beyond the four evidenced relationships, treats the descriptive Associations as sequence flows, or flags a permitted link pair. |
| `l3-io-missing-links-accept` | Fails an implementation that fabricates endpoints, reports one finding for several missing links, or uses the draft severity at acceptance. |
| `l3-io-missing-links-draft` | Fails an implementation that blocks the draft or reports error severity for approved readiness rules in draft. |
| `l3-io-wrong-direction-accept` | The supplier Association points from the DataInput to the external call: fails an implementation that ignores Association direction, counts the reversed link as the supplier, or reports only the readiness finding without the endpoint integrity error. |
| `l3-io-wrong-direction-draft` | Fails an implementation that downgrades the endpoint integrity error to a warning in draft (only readiness rules warn in draft). |
| `l3-io-endpoint-type-accept` | An Association from an ordinary Task to the Process DataOutput: fails an implementation that accepts any Association to a DataOutput as a producer link, flags the valid data-association producer, or treats the gated external-producer candidate rule as covering an activity. |
| `l3-io-link-owner-accept` | Fails an implementation that checks link endpoint types but not ownership, accepts a trigger or supplier Association whose endpoint belongs to another process, or reports the two violations under one finding. |
| `l3-io-link-owner-draft` | Fails an implementation that downgrades the cross-owner integrity errors to warnings in draft or blocks the draft validation itself. |
| `l3-imp-remap-total` | Fails a partial or sequential map application, a remap that misses calledElement, Lane.flowNodeRef, processRef, binding ownerId, DI bpmnElement or the called process's view plane, rewrites DI-own or surviving support IDs, keeps the input revision, or emits an idMap without the identity rows of unchanged elements. |
| `l3-imp-remap-total-edit` | Edit activation: the approved ID remap is still gated by OPEN-ID; fails an implementation that applies the remap in edit or refuses with another code than profile-open. |
| `l3-imp-remap-unapproved` | The migration record carries no approval: fails an implementation that treats an ID remap as an implicit import normalization instead of refusing the invocation with operation-error. |
| `l3-imp-remap-swap` | Fails an implementation that applies map entries one by one (the first rename collides with the second task) instead of building the total map first and applying it atomically. |
| `l3-imp-remap-collision` | Fails an implementation that merges Task_1 into the existing unmapped Task_taken, overwrites it, or suffixes the result ID. |
| `l3-imp-remap-duplicate-result` | Fails an implementation that accepts a non-injective map (two sources to one result) and keeps the last writer. |
| `l3-imp-remap-unknown-source` | A map key naming no element of the document: fails an implementation that ignores the stale entry or reports a collision instead of refusing reference-dangling. |
| `l3-imp-remap-target-grammar` | A result ID outside the authoring subset: fails an implementation that accepts the invalid ID or normalizes it silently instead of refusing profile-schema. |
| `l3-imp-remap-opaque` | Fails an implementation that remaps around an opaque extension value without a pinned reference-free attestation, string-replaces inside it, or drops it. |
| `l3-imp-remap-opaque-attested` | With the attested reference-free property the remap proceeds and the opaque payload stays byte-identical even though it spells the old ID; fails an implementation that rewrites look-alike text or loses the extension value. |
| `l3-imp-remap-dangling` | A dangling calledElement stays unchanged and is reported once as an observed reference-dangling entry at its property location while the migration succeeds (harmonization C2, parity sync PS-32); fails an implementation that refuses, fetches or invents the target, rewrites the reference, omits the observation or points it at the element instead of /calledElement. |
| `l3-imp-remap-nonsubset-id` | Fails an implementation that normalizes the accepted out-of-subset ID at edit time, refuses the approved explicit migration, or misses the flow reference to the remapped ID. |
| `l3-imp-remap-qname` | Fails an implementation that compares QName strings literally (missing tns:Process_sub_old), drops or rewrites the prefix, rewrites the external ext: reference, fetches it, refuses the migration, or omits the unsupported-namespace observation or reports it at the element instead of its property location (parity sync PS-32). |
| `l3-imp-remap-owner` | Owner remap Process_A -> Process_R: fails an implementation that leaves binding ownerIds or the main processRef on the old ID, or reallocates the surviving Collaboration, main Participant and LaneSet from the new owner. |
| `l3-imp-projection-out-of-base` | Fails an implementation that refuses the whole document because out-of-base types exist, keeps references to removed flows or to the removed item, removes the retained direct flow or the data association that keeps a retained source, keeps an emptied data-association shell or the Association to the removed gateway, recomputes source pointers after removal (index 0 removed), or reports a committed revision for the read-only projection (parity sync PS-21). |
| `l3-tx-incremental-draft` | Fails an adapter that creates more than one history entry per command, recomputes IDs or reruns C/N on undo/redo, returns anything but the exact restored Snapshot/1 (envelope, presentation, selection, viewRevision), emits raw or intermediate change events, refuses incomplete drafts instead of reporting draft lint entries, or omits the C topology entries of each step. Each C write carries the coordinates of its own transaction (DESIGN L751, L755): generated for an element created by that transaction, exact for one created by an earlier transaction; fails an adapter that reports the coordinates of its staged tree. |
| `l3-tx-batch-one-entry` | Fails an adapter that records one history entry per command of a batch, so a single undo would leave the first task behind, emits one callback per command, or runs C/N between the two commands. The four C topology writes on the two created tasks carry the transaction coordinates (DESIGN L751, L755, L766): generated source and generated result; fails an adapter that reports them at the exact coordinates of its staged tree. |
| `l3-tx-cancelled` | Fails an adapter that stages or commits a request whose signal is already aborted, rejects the Promise instead of returning operation-cancelled with the echoed identity and empty diagnostics, or emits a change event. |
| `l3-tx-cancel-pending` | The signal aborts after the request is accepted and staging began: fails an adapter that finishes the staged transaction, commits part of it, pushes a history entry, emits an event, or reports a code other than operation-cancelled. |
| `l3-tx-dispose-no-leak` | Fails an adapter that keeps delivering callbacks after dispose, resolves later calls successfully, rejects instead of returning canvas-disposed, fabricates an identity echo after disposal, or keeps a subscription usable after disposal. |
| `l3-tx-dispose-pending` | Disposal while a transaction is staging: fails an adapter that commits the pending transaction, emits a success event, leaves the guard in staging, or answers anything but canvas-disposed afterwards. |
| `l3-tx-reentrant-refused` | A public applyCommands call entering while the root transaction is applying, valid against the committed revision: fails an adapter that executes or queues it (task b committed, a second event or history entry), refuses it with a code other than transaction-reentrant, returns anything but the closed Result/1 refusal that echoes the committed identity and revision with an empty report, or records an outcome without a real nested call (a bare {status, code} record). The native modeling command entry is UNSEALED (U1, OPEN-HOOK). |
| `l3-tx-guard-recovery` | An internal exception thrown by the applying-phase hook after its nested applyCommands call was refused transaction-reentrant (evidence that the guard was applying): fails an adapter that rejects instead of returning operation-error after rollback, drops the attempted candidate lint entries from the refusal report, commits part of the stage, emits an event, leaves the guard in applying so that the retry refuses transaction-reentrant, or returns the refusal without entering applying (no nested outcome). |
| `l3-tx-refusal-preserves` | Fails an adapter that suffixes or overwrites on a computed ID collision, commits a partial stage, pushes a history entry, or emits a change event for a refused command. |
| `l3-tx-io-set-selection-required` | Fails an adapter or C that silently appends the new input to the first set when several sets exist; the command refuses with io-set-selection-required, no lint stage ran (empty report) and tree, history and callbacks stay untouched. The refusal is the outcome of the C recipe on two sets: with a single InputSet the same unassigned command succeeds and C appends the input to that set (c-io-input-uncovered-single), so an adapter that refuses by entry name without running C fails the last step. |
| `l3-tx-io-set-explicit-selection` | Fails an adapter that ignores the explicitly selected InputSet_2 (appending to InputSet_1 or to both), or whose undo/redo does not restore the exact sets and presentation. |
| `l3-tx-di-only-move` | Fails an adapter that skips a drag because semanticRevision is unchanged, changes semanticRevision for a DI-only move, moves the task by another delta or other shapes too, drops the selection, creates zero or two history entries, or whose undo does not restore the exact archived Snapshot/1 including viewRevision. |
| `l3-tx-corrected-noop` | A nonzero drag of the anchored reference is corrected back to its region position: fails an adapter that keeps the dragged geometry, records a history entry, changes the view revision, emits a change event, or reports no correction notice for a gesture with no final semantic or visual difference. |
| `l3-tx-theme-history` | Fails an adapter that records the theme switch as a semantic history entry (undo would revert the theme instead of the task), replays native history to capture the theme snapshot (extra callbacks), changes semanticRevision on a theme switch, or whose undo does not keep the current theme with the restored layout and selection (exact viewRevision). |
| `l3-tx-delete-support-undo` | Fails an adapter whose N run after the deletion resurrects the reserved lane, that keeps the binding of the deleted lane, removes the empty bound lane set, or whose undo does not restore the actual deleted lane ID, binding and presentation. |
| `l3-tx-stale-revision` | Fails an adapter that applies a command or an undo against a stale semantic or view revision, rebases it silently, or refuses with a code other than operation-error (harmonization C10). |
| `l3-tx-empty-history` | Fails an adapter that answers undo or redo on an empty history with ok, a no-op snapshot or a rejected Promise instead of operation-error (harmonization C10). |
| `l3-tx-bare-recipe-refused` | Fails an adapter that executes a bare recipe command or an unlisted upstream entry as a second recipe authority instead of refusing transaction-entry-unsupported (harmonization C8). |

## Vendored Python cases

Each vendored case and the Python seal's derivation, copied verbatim as its
discrimination text (`index.json`; BLOCKB-PARITY-SYNC §2.2). `index.json` also
records the parity-sync row, the source and harness record digests and the
derivation statement of each case.

| Case | Python derivation |
| --- | --- |
| `cn-plan-actor-mismatch` | Explicit create/edit/reference/convert/migrate commands use the editor actor, complete/normalize use code (DESIGN §2.4.1 R3.1 bounded authority witness): planning create-task with actor code refuses profile-producer. |
| `cn-plan-add-note-containment` | add-note uses identity containment: the planned create carries no id (no ownerId, slot or key) and its descriptive fact (Task.documentation is multi-valued: cardinality many); the Documentation is appended to Task_B.documentation exactly as the vendored neutral-fixture created[0]; created lists only ID-bearing creations (empty here). |
| `cn-plan-ambiguous-binding` | rename-only-task binds one Task among the owner's flowElements with cardinality one; Process_amb has two, so planning refuses profile-ambiguous-binding (array order never chooses a winner). The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision. |
| `cn-plan-append-remove-conflict` | appendUnique and remove deltas on Lane_c.flowNodeRef coalesce by id, but appending and removing the same id Task_cmd refuses profile-write-conflict at application. Both planned writes carry the cn facts of Lane.flowNodeRef (cardinality many, the admitted flow-node targetTypes; spec §3.2). The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision. |
| `cn-plan-create-aid-grid` | create-aid on the vendored grid input: concat of the profile's marker literal '[Note] ' and the body gives '[Note] helper'; the allocated id is the pinned fixture vector stable-id(Process_1, aid, new-note) = g_61b2...800c; the planned create carries cardinality many (Process.artifacts multi-valued, spec §3.2). |
| `cn-plan-create-aid-neutral` | create-aid on the vendored neutral input: concat of the profile's marker literal '[Aid] ' and the body gives '[Aid] helper'; the allocated id is the pinned fixture vector stable-id(Process_1, aid, new-note) = g_61b2...800c; the planned create carries cardinality many (Process.artifacts multi-valued, spec §3.2). |
| `cn-plan-create-id-collision` | create-task with key k-dup plans stable-id(Process_1, task, k-dup), which an unrelated TextAnnotation already carries. A computed collision with a different object is id-collision (DESIGN §3.2): apply_plan refuses it and never suffixes, overwrites or reidentifies. |
| `cn-plan-create-process-input` | Input is the cn-remap-owner output. The ID-less ioSpecification is created by containment (no id) and addressed within the plan by its handle (index 0); the DataInput's ownerId is the explicitly evaluated owner id Process_X, never the ID-less parent: stable-id(Process_X, process-input, in-1). The two planned writes carry the cn slice facts apply needs: Process.ioSpecification is single-valued (cardinality single: an object, not an array) and dataInputs multi-valued (cardinality many); the LaneSet keeps its stored empty lanes array. |
| `cn-plan-create-task-grid` | create-task on the vendored grid input: one allocated create of bpmn:ServiceTask (the two profiles differ in task subtype) with ownerId = the owner parameter's id, slot task, key = the key parameter, appended to Process_1.flowElements. The planned write carries the descriptive fact apply needs (Process.flowElements is multi-valued: cardinality many; spec §3.2, DESIGN §2.5 applyPlan has no descriptor argument). Explicit commands report no Report/2 entry (spec §3.3); created lists the new id. |
| `cn-plan-create-task-neutral` | create-task on the vendored neutral input: one allocated create of bpmn:Task (the two profiles differ in task subtype) with ownerId = the owner parameter's id, slot task, key = the key parameter, appended to Process_1.flowElements. The planned write carries the descriptive fact apply needs (Process.flowElements is multi-valued: cardinality many; spec §3.2, DESIGN §2.5 applyPlan has no descriptor argument). Explicit commands report no Report/2 entry (spec §3.3); created lists the new id. |
| `cn-plan-export-phase` | export-pages is an export recipe (emit actions on the render binding); export has no native write authority (DESIGN §2.4.1 R3.1 witness) and is planned by map_export (lot 4), so plan_recipe refuses profile-action-phase. |
| `cn-plan-invalid-authority` | Authority.actor is the closed set editor or code (spec §3.1); 'ai' is not an explicit-command or C/N actor, so the invocation is invalid: operation-error (H C11) before any recipe check. |
| `cn-plan-lane-member-cn` | assign-lane-member on the cn-n profile. planRecipe reads the descriptor index of its own ReadContext and records it in the write: bpmn:Lane.flowNodeRef is many-valued with targetTypes ['bpmn:CallActivity', 'bpmn:ExclusiveGateway', 'bpmn:ServiceTask', 'bpmn:StartEvent', 'bpmn:Task'] in this profile's descriptors. applyPlan(plan, stagedTree, stagedEnvelope) has no descriptor argument (DESIGN §2.5) and applies the carried facts: the stored value is ["Task_cmd"]. The twin case on the other profile stores the other form, so a runtime resolving facts from ambient or global state fails one of them. |
| `cn-plan-lane-member-support` | assign-lane-member on the support-cmd profile. planRecipe reads the descriptor index of its own ReadContext and records it in the write: bpmn:Lane.flowNodeRef is single-valued with targetTypes ['bpmn:Task'] in this profile's descriptors. applyPlan(plan, stagedTree, stagedEnvelope) has no descriptor argument (DESIGN §2.5) and applies the carried facts: the stored value is "Task_A". The twin case on the other profile stores the other form, so a runtime resolving facts from ambient or global state fails one of them. |
| `cn-plan-link` | link creates one Association (allocated under Process_1, slot link, key l1) and assigns its single-valued sourceRef/targetRef to the element parameters; each assignRef carries cardinality single and the admitted targetTypes of the neutral descriptors (spec §3.2), which apply checks; reference writes never create an endpoint (both exist). |
| `cn-plan-link-wrong-target-type` | link with target = Process_1: the element parameter exists, so planning succeeds and records the targetRef write with the neutral targetTypes ['bpmn:ServiceTask', 'bpmn:Task', 'bpmn:TextAnnotation']. Before assignment apply validates existence and target type (DESIGN §2.4 assignRef): a bpmn:Process is not admitted, so apply_plan refuses profile-type and stages nothing. |
| `cn-plan-missing-parameter` | create-task declares the required string parameter name; omitting it refuses profile-ui-parameters before any evaluation (no parameter comes from a label or an ambient variable). |
| `cn-plan-optional-binding-missing` | rename-optional-task binds task with cardinality zeroOrOne over the owner's Task children; Process_opt has none, so task is MISSING (DESIGN §2.4 bind) and the set step is a required use of MISSING, which refuses (DESIGN §2.2): profile-type. |
| `cn-plan-recipe-not-compiled` | The recipe argument keeps the id create-task but changes its allocation slot, so it differs (JCS) from compiled.recipes['create-task']: planning accepts only compiled recipes (CR-05 symbols; no recipe from outside the profile), so plan_recipe refuses profile-symbol before reading parameters. |
| `cn-plan-remove-referenced` | remove-element(Task_A) with policy refuseIfReferenced and no declared dependents: the inbound closure contains Assoc_1.sourceRef, a retained reference, so planning refuses reference-dangling; no cascading delete exists. The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision. |
| `cn-plan-remove-without-intent` | The remove action requires actor authorization and explicit deletion intent; the authority carries deletionIntent false, so planning refuses profile-producer. The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision. |
| `cn-plan-reparent-annotation` | move-annotation declares {self,'',reparent} and {process,/artifacts,reparent} (DESIGN §2.4.1 reparent row) and one reparent step with position last: Note_1 keeps its id and is appended after Note_2 in Process_2.artifacts; no reference names Note_1 and bpmn:TextAnnotation is admitted there. The source array is emptied and stays [] (H F1). Explicit edit; nothing is created or removed. |
| `cn-plan-scalar-write-conflict` | Planning records both declared set writes (scalar writes carry no descriptive fact); application detects two different scalar values for Task_cmd/name and refuses profile-write-conflict (no last-writer behaviour). The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision. |
| `cn-plan-undeclared-parameter` | create-task declares owner, key and name; an additional colour parameter is not a declared parameter (DESIGN §8.3: parameters bind declared names only), so planning refuses profile-ui-parameters. |
| `cn-plan-unknown-element-parameter` | Element parameters bind existing element ids only; Process_ghost is absent, so planning refuses reference-dangling. |
| `cn-plan-unset-name` | clear-name declares {self,/name,unset} and one unset step: the edit plan has one unset write (single-segment scalar path, no value, no descriptive fact needed) and application removes Task_cmd.name (Task.name is an optional scalar of the cn base, editor-produced). Explicit commands report no Report/2 entry; nothing is created or removed. |
| `cn-plan-wrong-parameter-type` | create-task declares name as a required string parameter; the call supplies the number 42. Parameters are validated in declaration order before evaluation, with no implicit coercion (DESIGN §8.3): a wrong JSON type refuses profile-type. |
| `cn-apply-stale-plan` | The plan (with its carried cardinality fact) is the cn-plan-create-task-neutral plan whose baseRevision is the revision of the neutral input; the staged envelope is the already-applied output (another revision) and its tree argument equals that envelope's tree, so apply_plan refuses operation-error (stale plan) and stages nothing. |
| `cn-apply-input-conflict` | The plan and the staged envelope are those of cn-plan-create-task-neutral, but the staged tree argument differs from the staged envelope's tree (Task_B renamed): two inputs for one staged state (DESIGN §8.1 input-conflict), refused before the revision check and before staging. |
| `cn-c-version-mismatch-first` | The envelope identity differs from the compiled neutral identity only by an older minor version (1.0.0 vs 1.1.0) and its digest. §3.3 rows apply before C (precedence step 3, H C1): the minor row is source-dependent and C/N never load another package, so P1 yields profile-source-unavailable before any id is allocated (§7.1 reject source version mismatch first). The input tree has missing ids that must stay missing. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-c-digest-mismatch-first` | Same profile id and version as the compiled grid profile, known unequal digests: the §3.3 identity-conflict row refuses profile-digest-mismatch (no P1 override) before any C write (precedence step 3). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-c-document-version` | documentVersion 2 is unknown: the first §3.3 row (and the closed §5.1 envelope check, precedence step 2) refuses document-version-unsupported. An unknown documentVersion is the H B3 no-echo case, so the refusal and its report carry neither profileIdentity/sourceIdentity nor baseRevision/inputRevision (§10.1: missing identity is omitted, not fabricated). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty; nothing is echoed. |
| `cn-c-gateway-direction-control` | The topology and GatewayDirection rules are private effective-base policy data, not library rules (§7.1). The neutral profile declares none, so C changes only isExecutable: the stale G_ctl incoming [F2], the absent S1 outgoing and the absent gatewayDirection stay exactly as imported. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-c-output-port-gated` | Filling the absent sourceRef of a DataOutputAssociation is the missing-output-source producer exception gated by OPEN-IO (technical gate open; §16 item 8 requires an explicitly accepted code-creation authority). With the default edit activation C refuses profile-open at that recipe step (the earlier ungated topology plans do not matter: nothing is applied) and commits nothing. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-c-output-port-qualification` | Same input as cn-c-output-port-gated under activation=qualification (§7.2/§13 neutral qualification may proceed): C creates stable-id(Task_O, output-port, DOA_missing) in Task_O.properties (absent before; the array is created) and assigns sourceRef, a multi-valued reference; the flowless Task_O receives empty incoming/outgoing arrays (H F1). Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-c-not-fixed` | suffix-task-name sets name := concat(name, '!'): the first pass gives 'A!' (and the empty topology arrays of Task_1), the bounded second evaluation succeeds but changes the name again to 'A!!', so C(C(x)) != C(x) and C refuses normalization-not-fixed, rolling back the whole stage (no candidate exposed). Witness of the 'second evaluation still changes a value' branch; the refusal branch is cn-c-second-pass-refused. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-c-extraction-authorized` | The grid-extraction delta moves rootElements, flowElements and ServiceTask.name from import to ai, so every field present in the AI extraction is admitted to actor ai (spec §6.1). C then allocates the three missing ids and the grid default isExecutable=true. The fixed-point rerun uses mode retained (the output is retained content). Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-c-extraction-unauthorized` | The neutral base grants no field to actor ai; in extraction mode the first present field (Definitions.rootElements) is not AI-producible, so C refuses profile-producer before identity allocation. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-c-descriptor-role-unknown` | Task.colour is classified by no descriptor role of the neutral slice; the graph index check before C (precedence step 5, H C1) refuses descriptor-role-unknown (§3.1). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-c-invalid-mode` | mode accepts exactly extraction or retained (spec §3.4, H B7); 'draft' is a readiness policy, not a C mode, so the call refuses operation-error at precedence step 1 (H C1/C11). The envelope argument is itself a JSON object with documentVersion 1, a shape-valid identity and a semanticRevision, so the refusal echoes them (H B3: only an unknown documentVersion, an unparseable input or the not-loaded state omit the echo). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-support-band-process-ref` | Vendored negative 'reference band cannot carry processRef' under activation=qualification: refusal support-binding-conflict, the whole staged operation rolls back and the caller tree and bindings are unchanged. Reuse validation of the bound band fails on the no-processRef relationship (§5.2, H C5 keeps this check). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-support-creation-gated` | Same input as cn-n-support-one-process with the default edit activation: the first ensure would create a persisted support while the OPEN-RESERVED-N technical gate is open (§16 item 11 owner part ratified, twin proof pending), so N refuses profile-open and the caller tree and bindings are unchanged. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-support-duplicate-role` | Vendored negative 'duplicate imported role rolls back' under activation=qualification: refusal support-binding-conflict, the whole staged operation rolls back and the caller tree and bindings are unchanged. The duplicate (ownerId, role) binding is rejected by envelope integrity (precedence step 4, H C1), after the §3.3 compatibility row accepted the exact identity; the envelope still has documentVersion 1, a shape-valid identity and a semanticRevision, so the refusal echoes them (H B3; the revision string is echoed as given). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-support-imported-ids` | Vendored case 'imported support IDs survive': every role is correctly bound to an imported non-generated id (type, parent/property and declared fields agree), so N reuses all five, the processRef write is a no-op, no id is allocated and the report is empty (fixture changeCount 0). Reuse is not a gated mutation, so the qualification activation accepts it. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-n-support-imported-ids-edit` | Vendored case 'imported support IDs survive': every role is correctly bound to an imported non-generated id (type, parent/property and declared fields agree), so N reuses all five, the processRef write is a no-op, no id is allocated and the report is empty (fixture changeCount 0). Reuse is not a gated mutation, so the edit activation accepts it. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-n-support-late-band-collision` | Vendored negative 'late band ID collision rolls back four earlier supports' under activation=qualification: refusal id-collision, the whole staged operation rolls back and the caller tree and bindings are unchanged. The four earlier ensures plan creations; the band ensure's allocator id is occupied by an unrelated, unbound Participant (precedence step 8, §6.3). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-support-late-band-collision-edit` | Same input as cn-n-support-late-band-collision with the default edit activation: the first ensure (Collaboration) would create, so profile-open is reported before the fifth ensure's id-collision (refusals follow recipe/candidate/step order). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-support-one-process` | Exact vendored expectation of neutral-support-fixture.R31.json case 'complete support creation': five ensures (Collaboration under Definitions with ownerId Definitions_support and key Process_A; main Participant, LaneSet, reserved Lane and reference-band Participant in the Process_A domain) plus the main processRef assignment give exactly six change entries (fixture changeCount 6); creation order is the fixture createdIds order (Collaboration appended after the Process, main before band). Bindings sort by ownerId/role/targetId. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-n-support-refusal-after-five-ensures` | R3.1 check 'explicit refusal after five ensures rolls back': the support-abort variant appends {op:refuse, code:fixture-abort} after the five ensures and the processRef assignment; the refusal code is the profile's, nothing is committed and the caller tree and bindings are unchanged. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-support-two-processes` | Vendored case 'two processes have separate collaborations': each Process gets its own Collaboration (ownerId Definitions_support, keys Process_A and Process_B), bound to that Process, plus its own four Process-domain supports; twelve change entries (fixture changeCount 12), creation order Process_A then Process_B. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-n-support-wrong-parent` | Vendored negative 'imported band under wrong parent refuses' under activation=qualification: refusal support-binding-conflict, the whole staged operation rolls back and the caller tree and bindings are unchanged. The graph index accepts the misplaced Participant (Process.artifacts is a classified member; containment admission is not a graph-index check); reuse validation of the bound band then fails on parent/containment property (§5.2, H C5). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-place-grid-deleted-association` | Without A-producer, Task_B has no association with sourceRef Task_B, so bind(first) falls back to the producing selector (targetRef Task_B) and picks its minimum id Y-consumer; both tasks relate to the remaining Y/Z associations. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-n-place-grid-inserted-association` | Inserting X-consumer (Task_A -> Task_B) adds it to both related lists and, being the lowest consuming id for Task_A, makes it Task_A's anchor; Task_B still anchors on A-producer, its only consuming association. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-sort-placements` | Order by UTF-16 (ownerProcessId, regionKey, elementId, anchorAssociationId with absent before present, relatedAssociationIds compared element-wise, prefix first). P_10 precedes P_2; for the same target the anchorless record comes first, then related [A1] < [A1,B2] < [A2]; U+10000 (surrogates D800 DC00) precedes U+E000 in UTF-16 although it follows it in code-point order. |
| `cn-n-placement-intent-di-only` | Same as cn-n-place-neutral with placement intent [{elementId: Task_A}] for a DI-only move: the intent is validated but N's semantic outputs depend only on the tree, so envelope, placements and report are identical (a DI-only drag changes only viewRevision, which N does not compute). Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-n-placement-intent-unknown` | The intent names Task_ghost, absent from the tree: the validated intent refuses reference-dangling after envelope and compatibility checks. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-plan-remove-empty-support` | remove-element on the empty external lane with explicit deletion intent: the closure is the lane alone (no retained inbound reference); application deletes it, keeps the emptied LaneSet.lanes array as [] (an emptied array is stored as written, H F1) and removes its envelope binding, the support's ownership record. removed lists the deleted id; explicit commands report no Report/2 entry. |
| `cn-n-deleted-support-stays-absent` | Input is the cn-plan-remove-empty-support output (LaneSet.lanes stored as []). Nothing needs the external-lane role, so N does not recreate it and never removes the empty array: no change, edit activation accepted. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-n-recreate-after-remap` | Input is the cn-plan-create-process-input output: the new Process IO needs the external-lane role again. The bound LaneSet is reused; the deleted lane's identity ended, so ensure creates stable-id(Process_X, external-lane, external-lane) with the current ownerId (g_11a96576...), different from the deleted g_8cb2e97e..., and reports it; the recreated lane is appended to the LaneSet's stored empty lanes array. The DataInput is placed in region external-lane without anchor. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-n-reference-region-edit` | Same input as cn-n-reference-region-multi-process with the default edit activation: the Collaboration ensure would create a support, so N refuses profile-open. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-external-membership-edit` | Same input as cn-n-external-membership-append with the default edit activation: the appendUnique is an effective Lane.flowNodeRef change of the external branch of N, gated by OPEN-EXTERNAL (encoding proof) and OPEN-RESERVED-N, so N refuses profile-open. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-recreate-after-remap-edit` | Same input as cn-n-recreate-after-remap with the default edit activation: the lane recreation is a persisted support creation, refused profile-open. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-relation-direction-conflict` | The conflict variant adds a recipe setting the same reversed association's associationDirection to Both while reverse-reference-links sets One: two different scalar values for one target/path refuse profile-write-conflict; nothing is applied. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-ensure-conflicting-definition` | The variant appends a recipe ensuring (Process_A, reference-band) with name 'band' while ensure-reference-band declares 'reference-band': identical ensure plans coalesce, conflicting definitions refuse profile-write-conflict (qualification, so no gate intervenes). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-not-fixed` | decorate-main-participant sets name := concat(name, '*') on every Participant with a processRef. First pass: Main_R becomes 'main-participant*' (with the Link_R reversal). The bounded second evaluation succeeds: the bound Main_R is reused unchanged (reuse validation compares no declared field, H C5), the reversed link no longer matches, but the recipe changes the name again to 'main-participant**'. N(N(x)) != N(x), so N refuses normalization-not-fixed and rolls back the whole stage (no partial reversal either). Witness of the 'second evaluation still changes a value' branch; the refusal branch is cn-n-second-pass-refused. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-reserved-lane-renamed` | The bound external lane carries a user-chosen name, not the ensure declaration's creation field (external-lane). Reuse validation checks only type, parent and containment property, the processRef/owner relationship and the single binding (DESIGN §5.2; H C5: declared ensure fields are creation fields, a renamed bound support is reused unchanged): the lane is reused, never renamed back, and supports are never found by name. The marked Call_ext is already its member, so the appendUnique is a no-op; no effective change is gated, so the edit activation accepts with no entry (fixed point). Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-remap-owner` | Input is the cn-n-deleted-support-stays-absent document plus its archived imported DI (one process diagram whose plane names Process_A). The approved command maps Process_A to Process_X; the total map is identity elsewhere. The main Participant's processRef, every binding ownerId and the DI plane bpmnElement follow, while the surviving supports keep their actual stable-id ids allocated under Process_A (never reallocated) and DI objects keep their own ids. Payload {envelope, importedDi} with the importedDi digest recomputed; report idMap is the complete original->result map of every ID-bearing element (identity rows included, domain migration, §10.1 order; H B14). No invalidation flag: the new revision implies it. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-remap-gated` | ID remapping is a separate approved import migration: the command record is valid and approved, but the OPEN-ID technical gate is open, so with the default edit activation remap_ids refuses profile-open (H H9: approval record and gate both apply). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-remap-unknown-source` | The map row sourceId Ghost names no element of the document: reference-dangling (H C20, py-only code adopted by both runtimes). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-remap-target-grammar` | Result ids must satisfy the authoring subset ^[A-Za-z_][A-Za-z0-9_.-]{0,255}$; '9-bad' starts with a digit, so remap refuses profile-schema (H C20). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-propose-recovery-partial-provenance` | Provenance lists only the Collaboration: it alone is proposed; the other four roles keep no proposal (their ids are occupied but unattested). |
| `cn-propose-recovery-with-provenance` | The trusted generated tree of support case 1 lost its bindings. Every role's allocator id exists with the expected type, parent/property and declared fields, and the explicit creation provenance lists it, so the read-only adapter proposes the five original bindings; the envelope is not modified (activation still needs an explicit recovery transaction, bind_supports). |
| `cn-propose-recovery-without-provenance` | Same tree without provenance: matching allocator ids alone (hash-shaped ids) do not authorize reuse, so nothing is proposed. |
| `cn-propose-black-box-pool` | Collab_X/Pool_X carry support labels but no allocator ids and no provenance: no proposal (labels never classify supports). The envelope carries the current cn-n identity (placement regions equal to the support roles, H K1; edit recipes completing the §2.4 action matrix), which fixes its revision. |
| `cn-bind-supports-conflict` | The envelope already binds (Process_P, collaboration); supplying it again would duplicate owner+role, refused support-binding-conflict. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-bind-supports-explicit-selection` | The import plan explicitly selects Collab_X as Process_P's collaboration support (activation qualification). bind_supports validates owner and target existence and uniqueness and adds the binding; the tree is unchanged and the revision changes through the bindings. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-bind-supports-gated` | Import support binding is N/import activation gated by OPEN-MACHINE (technical gate open): the default edit activation refuses profile-open. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-after-explicit-selection` | Input is the cn-bind-supports-explicit-selection output. The bound Collab_X passes reuse validation (Definitions.rootElements parent, declared name collaboration); the main Participant and band are created inside it after Pool_X, which stays an ordinary unbound participant. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-compile-create-identity-mismatch` | Hand review: create-task's create step is rewritten with identity containment and no ownerId/slot/key (schema-valid: containment forbids the allocator fields). The type bpmn:Task is known and ID-bearing (id true in the neutral descriptors, Task.id admitted by the base); DESIGN §2.4 'identity:containment ... the compiler must prove that the effective base excludes id for this type' and CR-07 'allocated/containment agree with effective id admission' fail; the declared write {owner,/flowElements,create} still matches. Expected: refused profile-create-identity. Wire shape (parity sync PS-25): a compile refusal is exactly the PureResult {status: refused, code, diagnostics: []}. |
| `cn-compile-ensure-missing-binding-write` | Hand review: every ensure demands {envelope,/bindings,binding} (DESIGN §2.4.1 action/write table: 'parent/property create and envelope /bindings binding'). The variant removes that declared write from ensure-supports; the per-step type, containment and producer checks pass exactly as for the support variant, and the recipe-level comparison finds a required write missing from the declared set (CR-06 'Every action maps to declared writes'). Expected: refused profile-write-set. Wire shape (parity sync PS-25): a compile refusal is exactly the PureResult {status: refused, code, diagnostics: []}. |
| `cn-compile-ensure-non-support-type` | Hand review: the variant turns the lane ensure into an ensure of bpmn:Task under self.flowElements and replaces the declared {laneSet,/lanes,create} write by {self,/flowElements,create}, so the declared and required write sets still agree (no profile-write-set), the type is known and Process.flowElements admits Task (no profile-type), and the four earlier steps are unchanged. DESIGN §2.4: 'ensure is restricted to declared structural support roles and native Collaboration/Participant/LaneSet/Lane'; §2.4.1 action/write table: ensure needs 'declared structural type/role and ratified support authority', an authority condition of CR-06 whose authority code is profile-producer (the DESIGN fixture checker raises profile-producer for a non-support ensure). Expected: refused profile-producer. Wire shape (parity sync PS-25): a compile refusal is exactly the PureResult {status: refused, code, diagnostics: []}. |
| `cn-compile-port-without-authority` | Hand review: the delta is valid (DataInputAssociation.targetRef exists and lists code in the cn base; DESIGN §2.4.1 'each producerDelta replaces its named from actor with to'), so the effective producers become {dropped, editor, import}. complete-input-port is a complete recipe (actor code) whose assignRef target self is a generic native binding (its select predicate is an all(...), not a bare typeIs): 'Generic native bindings conservatively check every admitted target type supporting the field', i.e. SequenceFlow, Association, DataInputAssociation and DataOutputAssociation targetRef; DataInputAssociation lacks code, and CR-06 'rejects a phase actor absent from the resulting field producer set'. No earlier recipe writes a DataInputAssociation field (link writes a typed Association targetRef with actor editor). Expected: refused profile-producer. Wire shape (parity sync PS-25): a compile refusal is exactly the PureResult {status: refused, code, diagnostics: []}. |
| `cn-compile-support-profile` | Hand review against DESIGN §2.4/§2.4.1 (no compiler output used). Variant = neutral minus place-task plus the vendored ensure-supports recipe, pins re-pinned to the support slice (a superset of the neutral slice: Collaboration/Participant/LaneSet/Lane, Definitions.rootElements admitting Collaboration, Process.laneSets). CR-05: the five ensure handles are declared before use (main as assignRef target, collaboration and laneSet as parents). CR-06 write set: the required demands are {root,/rootElements,create}, {collaboration,/participants,create} (twice), {self,/laneSets,create}, {laneSet,/lanes,create}, {envelope,/bindings,binding} (once per ensure) and {main,/processRef,reference}; identical demands coalesce (§2.4 'Identical writes coalesce'), giving exactly the six declared writes. CR-06 authority: ensure types are the four support types, each parent containment admits the ensured type, the name fields are declared scalars, and every written field (ids, names, containments, processRef) lists actor code in the support base. CR-07: ensure allocates ID-bearing types with string ownerId values (id of root or self). CR-14: ensure and assignRef belong to normalize. The kept neutral recipes use only types/fields present in both slices. Expected: ok, identity = §5.1 record with sha256 = H(variant). Wire shape (parity sync PS-35): the PureResult {status: ok, payload, diagnostics: []} with payload UNSEALED (CompiledProfile has no wire shape; the member must exist); the compiled §5.1 identity is sealed apart as the compiled-identity artifact. |
| `cn-compile-variants` | Written CR-01..CR-14 review of every success-path variant (no compiler output used; spec §11.2): neutral and grid are the vendored profiles; support as in cn-compile-support-profile, support-abort adds a refuse step (no write); grid-extraction replaces import by ai on three base fields (valid deltas, no recipe writes them); the cn variants add recipes whose every action maps to its declared writes (identical demands coalesce), whose written fields list the phase actor (code for complete/normalize, editor for commands) in the cn base, whose created types are admitted by their containment and whose ID modes agree with id admission; count uses select and reachable from/to as pinned in the schema; inverseReference properties belong to the referencing type. The compiled identity is the §5.1 record whose sha256 is H(variant profile). Wire shape (parity sync PS-35): one PureResult {status: ok, payload, diagnostics: []} per variant in input order, payload UNSEALED (CompiledProfile has no wire shape; the member must exist); the identities are sealed apart as the compiled-identities artifact, one {variant, identity} per variant. |
| `cn-c-empty-called-element` | An empty calledElement is classified by §4.1 (call-target-empty without marker, call-kind-conflict with one), a validate finding, never reference-dangling (H C3). The graph index therefore accepts it; no cn-c recipe applies to a CallActivity and the Process already carries isExecutable=false, so C is a no-op: ok, no entry. Report header (H B4): sourceIdentity and targetIdentity are the envelope identity, inputRevision is baseRevision, outputRevision is revision. |
| `cn-c-second-pass-refused` | mark-task-name sets name := 'marked' (idempotent) and refuse-marked-task refuses fixture-second-pass for a Task named 'marked'. First pass: every plan reads the phase-start snapshot (name 'A'), so the refuse recipe has no candidate and the pass succeeds with name 'marked' plus the empty topology arrays. The bounded second evaluation changes nothing but reaches the refuse step: the second run does not return the identical result, so the fixed-point proof fails with normalization-not-fixed (DESIGN §2.4), never with the second-pass code, and no candidate is exposed. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-c-wrong-type-reference` | Flow_1.targetRef names DO_1, an existing bpmn:DataObject, while the cn slice admits only bpmn:ExclusiveGateway and bpmn:Task as SequenceFlow targets. Wrong-type references are integrity errors before evaluation (DESIGN §2.2): the graph index refuses reference-dangling (H C1 step 5, C2) instead of completing topology. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-compat-before-integrity` | The duplicate-role envelope of cn-n-support-duplicate-role with an older document minor (1.0.0 vs 1.1.0) and its digest: precedence step 3 (§3.3 compatibility, P1 because C/N never load another package) refuses profile-source-unavailable before step 4 would report the duplicate binding (H C1: compatibility before envelope integrity). Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-dangling-reference` | Assoc_ghost.targetRef names no element. Dangling references are integrity errors before evaluation and never count as absent (DESIGN §2.2): the N graph index (precedence step 5, H C1/C2) refuses reference-dangling before any support plan; layout therefore only ever receives N outputs whose references resolve. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
| `cn-n-second-pass-refused` | mark-main-participant sets name := 'marked' (idempotent) on Participants with a processRef; refuse-marked-participant refuses fixture-second-pass for a Participant named 'marked'. First pass (edit, every support bound, nothing gated): plans read the phase-start snapshot, so Main_R is renamed 'marked', Link_R reversed and Ref_R placed, and the refuse recipe has no candidate. The bounded second evaluation changes nothing (Main_R reused, the rename a no-op) but reaches the refuse step: the fixed-point proof fails with normalization-not-fixed (DESIGN §2.4), not with the second-pass code, and no candidate is exposed. Refusal record (H B2, B3, B4): no candidate; diagnostics and report entries are empty (no lint stage ran); the input identity and revision are echoed and repeated as report sourceIdentity and inputRevision. |
