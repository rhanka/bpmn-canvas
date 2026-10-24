# Lot 5 UI surface expectations — independent seal (fix round SF)

## Authorship and status

- Spec author: Opus (claude-opus-5-5), independent spec author for block B lot 5
  (owner exception), single seal fix round SF.
- Reviewer: gpt-6-astra, max effort. Review of the first seal (seal.json
  `a3a523a93d40d2ecfd9663094077bea0da8350f4a75cbccac01e09a292c7398a`): REWORK
  (one BLOCKER, five MAJOR). This seal applies every finding, the block-B
  JS↔Python harmonization decisions ("harmonization <row>" below) and the SF
  precedence DESIGN R3.3 text > harmonization decision > review finding.
- Authority: DESIGN R3.3 (SHA-256
  `48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f`), the
  block-A public contracts of this worktree (`src/profile/`, `src/io/`,
  `schemas/profile/`, `docs/design/`), the lot-0 contracts vendored under
  `tests/fixtures/profile-parity-corpus/`, `tests/fixtures/profile-lot0/` and
  `tests/fixtures/unicode-case-15.0.0/`, and the harmonization decision document
  of 2026-10-18.
- Scope: DESIGN §8.3 (L647–L661: palette, context pad, replace, connect and
  properties) on top of §8.1 (L577–L623, native bridge and Snapshot/1) and the
  §8.2 transaction adapter contract (L625–L645); §14.2 row 5 (L954) is the exit
  gate.
- Block-B parity sync (BLOCKB-PARITY-SYNC, Opus spec author, owner exception,
  2026-10-19; its section 3.3 for this lot): the 98 Python lot-5 parity records
  `lot5-py-*` (row PS-H25) are vendored with the resealed Python seal's bytes
  under `vendor/py/`, author `spec-seal`; decision PS-35, applied by the owning
  seal, holds on the two Python compile successes; the lot-5 defaults record
  PS-11, PS-12, PS-14 and PS-17 (12a, 12b, 15, 16 below). No expected value of a
  case authored here changes.
- Integration micro-reseal (history rule I1 of the block-B integration, Opus
  spec author, owner exception, 2026-10-19): the zero-literal scan of the tree
  found two private literals in this seal, identified by SHA-256 only (entries
  LX-TV-2 and LX-DS-2 of the x24 scan lexicon). The `en` text of the palette
  entry `reference-create` becomes the neutral label "Reserved band" (the case
  pattern of the occurrence, an initial capital only), and the file name of the
  import-attributes bypass witness of the seal test becomes
  `neutral-descriptors.json`, the neutral descriptor of the
  `profile-mechanism/1` contract set. The profile keeps version 1.1.0: only that
  text and the digests it feeds change (profile, variants, envelopes, cases,
  manifest); every expected status and refusal code is unchanged, and the
  vendored Python cases and `vendor/py/` are byte-identical. The reseal ledger
  `docs/design/receipts/block-b-lot5-reseal.json` chains this seal to the
  parity-sync seal.
- CR-10 arbitration (Opus spec author, owner exception, 2026-10-19; section
  "CR-10 arbitration"): `compile-003-enum-duplicate-values`,
  `compile-015-ui-parameter-source-type` and their Python twins
  `py-compile-enum-duplicate-values` and `py-compile-ui-parameter-source-type`
  refuse `profile-type` instead of `profile-ui-parameters`, as the frozen lot-0
  corpus and the block-A compiler. Every other expected status and value is
  unchanged and `vendor/py/` is byte-identical; the reseal ledger records the
  old and new values and chains this seal to the twin re-vendor seal.

## Method

Every expected value was written by hand from the DESIGN text, the block-A
contracts and the harmonization decisions. The authoring modules under `author/`
contain the explicit edits of each expected native tree (for example "remove
Task_X and append a `bpmn:UserTask` with ID `stable-id/1(Proc_main, replace,
k-replace-001)` carrying the name") and compute only RFC 8785 JCS, SHA-256,
`stable-id/1` identifiers and §9.2 digests. They load Node `crypto`, `fs`,
`path`, `url`, their sibling `./lot5-*.mjs` modules and the pinned comparator
module (for its comparator and reason tables); the comparator loads Node
`crypto` only. No profile loader, compiler, evaluator, codec, layout, exporter or
command module is loaded and no block-B implementation was read or run. The
arithmetic helper reproduces the reviewed lot-0 digest and allocator vectors.

No runtime output became a golden. Non-evidence input checks:

1. `author/lot5-schema-check.mjs` is a standalone subset checker of the closed
   JSON Schema keyword set of DESIGN §2.1 L52 (no third-party code). It checks
   that the fixture profile and the static-rule variants are valid against the
   pinned `schemas/profile/profile-mechanism-1.schema.json`, that the
   schema-rule variants are not, that every input snapshot is a valid Snapshot/1
   and that every Result/1 and PureResult template instantiates to a record valid
   against the pinned `result-1.schema.json`. It produces no expected value.
2. The first seal recorded one scratch run of the block-A loader and compiler on
   its input profile (harmonization I-2, NOT INDEPENDENT). That run is discarded:
   it is no evidence for any value of this seal, and the admission of the
   fixture profile rests on the written CR review below and on the expectation
   `compile-001-main-profile-admitted`.

`node author/author-lot5.mjs <DESIGN.md R3.3>` regenerates `cases/`,
`fixtures/`, `manifest.json`, `clauses.json`, `design-excerpts.json`, the
generated table block of this README and
`docs/design/block-b-lot5-expectations.md`; `node author/seal-lot5.mjs`
rewrites `seal.json`. The seal test re-runs the authoring modules in memory and
requires the sealed bytes to be exactly their output.

The `lot5-py-*` cases are not authored here (see "Vendored Python cases"):
`author/lot5-group-vendor-py.mjs` reads the Python seal's bytes under
`vendor/py/`, checks each against the raw SHA-256 the Python `MANIFEST.sha256`
lists (`author/lot5-vendor-py.json`), registers them unchanged and re-expresses
each parity record (file layout, roles, comparator ids); it computes no value.
The clause, derivation and author of each case are transcribed verbatim from the
Python harness record, whose SHA-256 is recorded. Two compile refusals are the
exception: their case seals the refusal code of the CR-10 arbitration
(`CODE_CORRECTIONS`, section "CR-10 arbitration"), the vendored bytes staying
unchanged.

## Layout

- `cases/` — `profile-parity-corpus/1` cases (one file per case; keys exactly
  `{caseId, operation, phase, profileArtifact, inputArtifacts, commandArtifact?,
  expectedArtifacts, expectedStatus, comparatorIds}`). `expectedStatus` is `ok`
  or `refused:<code>`; no case has an empty expectation and no refusal is sealed
  by its code alone (every refusal carries its complete record with
  `diagnostics` and `report`).
- `fixtures/` — synthetic inputs: descriptor slice, base, metrics, compiler
  registry, the `ui-neutral/1` 1.1.0 profile, compact profile variants and the
  input snapshots/envelopes under `fixtures/documents/`.
- `vendor/py/` — the Python lot-5 seal's bytes, unchanged, at their Python
  pathBase-relative paths: `artifacts/` (packages and the 24 profiles), the five
  fixture records `fixture-*.json` (composition provenance) and the 98 parity
  records `parity/lot5-py-*.json` the `cases/py-*.json` records re-express.
- `comparators/lot5-compare.mjs` — the pinned comparator executable
  (`lot5-compare/1`); its SHA-256 is recorded in `manifest.json` `executables`
  and in `seal.json` `executables`.
- `manifest.json` — corpus manifest: `pathBase`
  (`tests/fixtures/lot5-ui/expectations/`), comparator definitions (all
  `tolerance: zero`), the executable pin, the UNSEALED reasons in use and the
  SHA-256 of every case and fixture file.
- `clauses.json` — per case: DESIGN clauses (section and line range), the named
  wrong implementation the case rejects, the lot-5 defaults and UNSEALED notes
  it relies on; for a vendored case, `author`, the Python derivation as its
  discrimination text and `vendored` (the Python clause verbatim, the vendoring
  derivation and the SHA-256 of the parity and harness records). A Python range
  spanning a blank DESIGN line (L276-L282) is cited as its nonblank runs. For the
  two cases of the CR-10 arbitration the discrimination text states the decided
  code and `vendored.correction` records the vendored and sealed codes, the basis
  and the verbatim Python derivation.
- `design-excerpts.json` — SHA-256 of every cited DESIGN line.
- `author/` — authoring and seal tools, and `lot5-vendor-py.json` (the
  transcribed vendoring table: source pins, vendored file digests, lot-0 copies
  and the per-case Python author, clause and derivation).
- `seal.json` — byte length and SHA-256 of every other file in this directory.

Verification: `node --test tests/lot5-ui-expectations.test.mjs` (optionally with
`LOT5_DESIGN_AUTHORITY=<DESIGN.md R3.3>`). It checks the seal and a one-byte
change in every sealed file, unlisted/duplicate/linked/escaping entries and the
executable pin, the corpus format, citations, discrimination records, the
token-based loading guard with its bypass catalogue, reproducibility, fixture
pins, the schema self-checks, the comparators against synthetic exemplar
observations and more than 50 000 altered ones, the reseal ledger and the brand
and home-path guards. It runs no interpreter.

## Harness and observation contract (binding for the implementer)

1. Setup: the fixture profile is loaded and compiled with
   `fixtures/ui-neutral-registry.json` (base and descriptor pins in the raw
   digest domain, metrics asset bag). A canvas case starts from a canvas created
   with that descriptor context in draft readiness mode, the compiled profile
   activated, then `restoreSnapshot(input snapshot)` (§8.1.1 L612: restore is not
   recomputation, so `getSnapshot()` returns the input snapshot byte for byte;
   the restore starts a new history epoch). Load-path cases (`static-005`,
   `workshop-002`, `lifecycle-001`) start from a canvas holding no document.
   `static-006` creates the canvas in the §8.1 L619 read-only mode
   (`canvas-options`).
2. Command records (harmonization I3): `{command:"surface", entry, context}`,
   `{command:"upstream", upstream, context}` and `{command:"field", notion,
   field, context:{target, value}}`; a paste surface command carries `fragment`.
   Records are closed; the subject (the handle `ui.when` sees as `self`) is
   `owner` for palette and paste, `target` for context, replace, delete and
   direct-edit, `source` for append and connect; `context` holds exactly the
   subject and the sources the entry binds.
3. `"@current"` in a sequence request is replaced by
   `getSnapshot().payload.viewRevision` before the call; `"signal": "aborted"`
   in a request means an AbortSignal aborted before the call.
4. Gesture cases drive the browser UI described by the gesture artifact; the
   harness injects `transactionId` and `insertionKey`; `{pageId, semanticId}`
   occurrences mean the unique occurrence of that element on that page. The
   command input staged at the profile transaction adapter entry is observed as
   `staged`.
5. Observation members (`compareCase(caseRecord, inputs, observed)`):
   `result` (the Result/1 or PureResult of the call; a list for query cases),
   `snapshot` (the `getSnapshot()` Result/1 right after the call), `events`
   (change events received by a listener subscribed before the call), `history`
   (after a commit: `undo({expectedRevision, expectedViewRevision})` then `redo`,
   each `{result, events}`, plus `rootTransactions`, the number of new root
   `profile.transaction` commands on the live stack; after a refusal or no-op:
   `probe`, the refused `undo()` Result, `probeEvents` and `rootTransactions`),
   `staged`, `diagnostic` (the refusal surfaced by a refused gesture), `outcome`
   (gesture that stages nothing), `download` (`{prepared, serialized, callbacks}`
   for the workshop export: the prepareExport and exportPrepared Results and every
   host download callback argument), `followUp`, `compiledIdentity`, `surface`,
   `upstream`, `host`, `clipboard`, `package`, `steps` (one observation per
   sequence step carrying exactly the members of its template) and `twin` (the
   Python headless outputs of the same input). `inputs` maps each input role to
   its parsed pinned JSON.
6. Vendored Python cases (`lot5-py-*`, no canvas seam; Python
   SPEC_PROFILE_COMMANDS_PY §8 is the source of this contract). Artifact paths
   are relative to `vendor/py/` below the pathBase; a `file` member inside a
   vendored JSON input (`bridge.descriptorPackages`) and the profile resource
   `neutral-metrics` name the Python lot-0 contracts `contracts/profile-mechanism/1/…`,
   which are the byte-identical lot-0 corpus files
   `tests/fixtures/profile-parity-corpus/profile-mechanism/1/…` of this
   repository (raw SHA-256 pinned in `author/lot5-vendor-py.json`).
   - Compile cases (`compileProfile`): `loadProfile` then `compileProfile` on the
     profileArtifact bytes with the `base` and `descriptors` artifacts (raw-pinned,
     metrics asset `neutral-metrics`); observed `compileOutcome` (the PureResult)
     and, for a success, `compiledIdentity` (the §5.1 identity record, PS-35).
   - Step scripts (`commandArtifact` role `sequence`): one headless bridge per
     case created with the `descriptors` artifact (or the `bridge` input); with an
     `envelope` input, `setDefinitions(envelope, importedDi when given)` then
     `activateBusinessProfile(compiled profileArtifact)`, observed as `setup`
     `{load, activate}`; then each step of `steps` runs in order (`action` the A4
     camelCase operation, `request` its argument record, `save` the name under
     which its actual result is kept). `{"$current": "viewRevision"}` is
     `getSnapshot().payload.viewRevision` at that moment and `{"$saved": name,
     "pointer"}` the JSON at that pointer of a saved result, both resolved before
     the call; `onChange` collects every event under its `collect` name and
     `events` returns `{events: [...]}` for its `name`; a `setDefinitions` step
     loads `{document: {tree, bindings}}` completed with the case profile
     identity; `localize` is the shared helper (harmonization A4, E-47). Observed
     `stepResults`: one `{result}` per step, the complete actual result.

## Comparators

Every comparator ID resolves to the pinned executable `lot5-compare/1`, zero
tolerance. Values compare by RFC 8785 JCS bytes; objects must have exactly the
expected members and arrays exactly the expected items in order. Expected
templates may carry three explicit markers:

- `{"$unsealed": reason, "type"}` — a member not sealed (reason table below),
  present with that JSON type;
- `{"$equals": {member|input, pointer}}` — equal to an observed value or to the
  pinned input (used to keep one literal copy of each envelope and report);
- `{"$rule": name}` — an exact named rule: `view-revision` (§9.2 L690 over the
  observed layout), `view-revision-binding`, `layout-delta` (presentation delta,
  below), `selection-valid`, `bytes-sha256`, `ir-digest`, `ir-names`,
  `export-idmap`.

`layout-delta` (presentation deltas, astra MAJOR 2): the observed Layout/1 must
keep the base pages exactly (page bounds may grow only when the case adds an
occurrence), keep every occurrence it does not name byte-identical, drop every
occurrence of a removed semantic element on every page, and add exactly the
listed occurrences with exact page, semanticId, role and edge endpoints (an
added edge's source/target occurrence must hold the listed semantic element on
the same page; at least two waypoints); geometry stays in page order then UTF-16
occurrence key order with unique keys. A named occurrence may only change the
members its entry lists (`set` exact values, `changed`, `unsealed`).

Vendored Python cases (block-B parity sync, pinned executable change) keep the
Python vocabulary and comparator rule; the Python comparator ids are
re-expressed one per sealed role:

| Python comparator | Lot-5 comparator ids | Rule |
| --- | --- | --- |
| `lot5-py/compile-outcome`, `lot5-py/compiled-identity` | `lot5-py/compile-outcome` (role `compile-outcome`, observes `compileOutcome`), `lot5-py/compiled-identity` (role `compiled-identity`, observes `compiledIdentity`) | Python rule below: the compileProfile PureResult (a success's `payload` is `{"$unsealed": "compiled-profile"}`) and, for a success, the §5.1 identity record exact (PS-35) |
| `lot5-py/step-outcomes` | `lot5-py/setup-outcomes` (role `setup-outcomes`, observes `setup`) and `lot5-py/step-outcomes` (role `step-outcomes`, observes `stepResults`) | Python rule: profile-c14n/2 equality after each `{"$unsealed": reason}` marker (no `type`, reasons below) is replaced by the actual member, which must exist; `equal`/`differ` relations `[{pointer, saved, savedPointer}]` compare a step result with the result of the earlier step saving that name |
| `profile-c14n/2`, `stable-id/1` | `profile-c14n/2`, `stable-id/1` (`kind: mechanism`) | the canonical form and the allocator the other comparators rely on; they observe no member of their own |

Signal outcomes are not vendored: the three Python cases using them stay
runtime-specific (BLOCKB-PARITY-SYNC section 5).

## UNSEALED members (explicit list, harmonization A8)

| Reason | Members | Why |
| --- | --- | --- |
| `auto-layout` | occurrence key, bounds, waypoints and label of an occurrence created by a command or gesture (`layout-delta` add entries) | canvas auto-layout and drop geometry are runtime-specific (harmonization K18); DESIGN fixes no default size, placement or key rule |
| `text-measure` | `label` of an occurrence whose text changed (`layout-delta` modify `unsealed: ["label"]`) | text measurement and wrapping (harmonization K17, erratum E-20) |
| `edge-routing` | `bounds` and `waypoints` of the edge of the bendpoint witness | docking/routing are adapter output; key, role and endpoints stay sealed |
| `page-growth` | page `bounds` after a creation (`layout-delta` `pages: growth`) | auto-placement may extend the page |
| `selection-after-commit` | selection after a commit, gesture, undo or redo (`selection-valid`) | DESIGN fixes selection only for refusals (§8.2 L633) |
| `event-transaction` | `transactionId` of theme and snapshot events | §8.1 L606 names no transaction for these origins |
| `export-adapter` | prepareExport IR records beyond the `ir-names` rule, renderBinding `layoutDigest`/`payloadDigest`, occurrence keys and counter assignment of the export idMap, serialized bytes, exportPrepared report `artifacts` | the prepareExport layout stage is the runtime-specific canvas auto-layout (K18) with unpinned text measurement (E-20); header, capability, report, final names, freshness, H(ir) and SHA-256(bytes) stay exact |
| `replacement-map-multi-create` | `report.idMap` of `replace-005` (one conversion creating two ID-bearing elements) | harmonization D7 and the Python binding define the replacement map for exactly one created element |
| `compiled-profile` | payload of a successful compileProfile (also in the Python vocabulary of the two vendored compile successes, PS-35) | opaque compiled object; its identity record is sealed (`compiled-identity`) |
| `history-epoch` | `historyEpoch` | session-local counter (§3.1 L268) |
| `twin-presentation` | `viewRevision`, snapshot presentation and event `viewRevision` of the Python twin | its layout is a DI transcription (K18); every semantic member stays exact |
| `gesture-intent` | staged input of DI-only gestures (not compared) | §8.2 L637 names no command record for move/resize/label/bendpoint intents (OPEN-HOOK) |
| `lot4-view-revision` (Python vocabulary) | `viewRevision` of payloads, snapshots and events of a vendored case | §9.2 digest tuple over the lot-4 layout (§3.1 L268); compared relationally |
| `lot4-presentation` (Python vocabulary) | `presentation.layout`, `themeId`, `overrides`, `diStyles`, `activePageId`, and `importedDi` when no record was supplied at load, of a vendored case | lot-4 layout adapter and theme selection; an explicitly loaded `importedDi` record is sealed exactly (PS-15) |
| `session-history-epoch` (Python vocabulary) | `historyEpoch` of a vendored case | session-local counter (§3.1 L268) |
| `session-subscription` (Python vocabulary) | `subscriptionId` of a vendored case | session-local (§8.1 L606) |
| `raw-lint-transport` (Python vocabulary) | `report.rawStandardFindings` of the two vendored witnesses whose profile runs the vendored standard lint rules | raw upstream report records; their Report/2 shape is not fixed (§3.1 L272, §6.4 L508, L520; PS-10, E-42) |

## Case counts

<!-- generated: case counts -->
| Group | Cases |
| --- | --- |
| surfaces | 14 |
| compile | 17 |
| palette | 31 |
| context | 7 |
| connect | 11 |
| replace | 9 |
| delete | 11 |
| fields | 63 |
| paste | 15 |
| navigation | 9 |
| static | 6 |
| workshop | 9 |
| theme | 1 |
| views | 5 |
| presentation | 6 |
| lifecycle | 3 |
| history | 12 |
| twin | 1 |
| gates | 4 |
| demo | 1 |
| py | 98 |

333 cases; 101 end in a case-level refusal; 16 canvas sequences cover 74 steps; 98 vendored Python cases (group py: 20 compile, 78 headless step scripts covering 294 steps).
Profile `ui-neutral/1` 1.1.0: 16 notions, 30 UI entries, 18 fields, 38 recipes.
<!-- end generated -->

## Synthetic fixture design

- Descriptor slice `ui-neutral-descriptors/1` (version `lot5-2`): real BPMN type
  and property names; `bpmn:UserTask` extends `bpmn:Task`; Collaboration and
  Participant for the OPEN-RESERVED-N witnesses; TextAnnotation admits
  Documentation; InputOutputSpecification and Documentation are ID-less; FlowNode
  `incoming`/`outgoing` are deliberately not admitted.
- Base `ui-neutral-base/1` (`lot5-2`): every field produced by code, editor and
  import; `bpmn:CallActivity.calledElement` is the only ID-valued scalar.
- Profile `ui-neutral/1` 1.1.0 (a new package version, so no same-version digest
  conflict with the first seal): the notions share one exclusive group, the UI
  entries cover all eight surfaces and the fields the five widgets (counts in
  "Case counts"), two themes (`plain`,
  `contrast` with fallback `plain`, shared geometry), en texts plus three fr
  texts, one export (`drawing`, drawio, structural, no declared loss). Changes
  from 1.0.0: type-changing replaces are allocate/append/remove conversions with
  an explicit empty dependents selector (D7) and a same-type `note-to-aid`
  conversion; append entries bind their anchor from `source`; reference field
  values are typed `string` (§8.3 L655, L659); the call target field has
  visibility and mutability predicates (`[Hidden]`, `[Locked]` name prefixes); an
  aid-link anchor reference field; the gated `external-call-create` entry (refuse
  step `profile-open`, H4); the `input-loose-create` entry with the
  `require-input-set` completion refusal (§7.1 L547); the `ensure-collaboration`
  normalization for Processes named `Banded…` (H2); a choice display in full
  Unicode 15.0.0 upper case.
- Documents: `basic` (three Processes, two root stores, references, items, calls
  with source Documentation evidence on Call_1, annotations with evidence on
  Note_2, unreferenced Task_X and Task_Y, locked and hidden calls, two input sets,
  two pages, a grid-aligned external label on Start_1), `views` (repeated views of
  two Processes on four pages), `one-set`, `foreign`, `demo`, `unfixed` (Proc_main
  without the generated isExecutable default), `banded` / `banded-bound` (a
  Process needing a Collaboration support, without / with its binding), `dangling`
  (a call whose calledElement names no element), plus envelopes for the static
  and digest-mismatch cases.

## Harmonization decisions applied (JS lot-5 fix list and matrix rows)

| Row | Application |
| --- | --- |
| A1–A5 | corpus/1 records, `{path, sha256}` profile artifacts, manifest `pathBase`, camelCase operations (A4: `applyCommands`, `listEntries`, `listFields`, `checkField`, `queryReferences`, `copy`, `compileProfile`, `setDefinitions`, `activateBusinessProfile`, `setTheme`; canvas seams keep `canvas.*`, `viewer.*`, `workshop.*`, `ui.upstream-filter`), `ok`/`refused:<code>` |
| A8, B1–B4 | complete Result/1 and PureResult records with `report`, `diagnostics` = `report.entries` (entries of the lint stages run before a refusal, `[]` when none ran), identity echo whenever a document is loaded or a shape-valid argument envelope exists, B4 report headers |
| B12, G2, J1 | lint entries in every edit report under the draft policy (pre-normalize and post-normalize), complete unified entries, DESIGN L751 order with the G2 tie-breaks |
| B8–B10 | the C correction entry of `workshop-009` (`complete/set`) |
| B16–B20 | applyCommands payload; listEntries and listFields records; reference picking with the ownership rule and `profile-bounds`; fragments `{property, element}` in source pre-order |
| C7 | `profile-producer` for every unauthorized UI call: palette-016, context-005, connect-011, delete-010, replace-004, paste-009, fields-023 (and fields-046/047, fields-042) |
| C8, I3 | closed command records, upstream records, bare recipe and unlisted upstream commands refuse `transaction-entry-unsupported` (palette-020…028) |
| C9, C12 | `profile-symbol` for unknown entries/fields; removal closure → `reference-dangling` |
| C10, C11 | stale revisions and empty history → `operation-error` (history-008…010, fields-045, fields-062, paste-011) |
| C19 | lint-blocked export refuses with the first unresolved error code (workshop-008) |
| D6 | paste IDs `stable-id/1(owner, "paste", JCS([insertionKey, X]))` |
| D7 | type change → new allocated ID and replacement map, referenced original refuses, same-type conversion keeps the ID (replace-001…009, history-003, demo-001) |
| F1, G6 | emptied arrays stay `[]` (delete-011); created elements are appended |
| H1, H2, H4 | applyCommands runs N with activation `edit`: support creation refuses `profile-open` (gates-003), reuse commits (gates-004); external creation refuses `profile-open` through the profile refuse step (gates-002) |
| H8 | OPEN-HOOK and OPEN-PANEL stay canvas-only |
| I1, I2 | one history entry per accepted batch, undo/redo restore stored states, no-op and refusal leave no entry; cancellation `operation-cancelled` (palette-030), disposal `canvas-disposed` (lifecycle-002) |
| §3.3 py-only adds | see "Python-only cases" below |

### DESIGN override of a harmonization text

Harmonization D7 decides the Python model; its fix-list text (F-JS-L5-02) and
the job plan also ask for "re-pointed flows and links" on the owner demo. DESIGN
§2.4.1 L182 forbids implicit actions, §2.4 L171 refuses a removal whose closure
exceeds the declared deletion set, and mechanism 1 has no action that re-points
an arbitrary set of references in one execution. A referenced original therefore
refuses `reference-dangling` (replace-006, -007, -009), exactly as the Python
binding (`replace-dependency-refused`); the demo replaces the task while it is
still unconnected (new ID plus replacement map), then connects it. The override
is recorded for the conductor in the scratch file
`SF-JS-L5-DESIGN-OVERRIDES.md` so that the Python demo projection uses the same
step order.

## CR-10 arbitration (2026-10-19)

Two compile refusals of this seal disagreed with the frozen lot-0 corpus
(`profile-corpus-v1.0.0`, `tests/fixtures/profile-lot0/`) and with the block-A
compiler on the code of a CR-10 refusal. Precedence: DESIGN R3.3 text > frozen
lot-0 corpus > harmonization > lot seal; where DESIGN is silent the lot-0 corpus
and the block-A behaviour decide. Both cases change from `profile-ui-parameters`
to `profile-type`:

| Cases | Point | DESIGN | Decision |
| --- | --- | --- | --- |
| `compile-003-enum-duplicate-values`, `py-compile-enum-duplicate-values` | two enum choices with different names and one JSON value | §2.4.1 L195 lists `profile-ui-parameters` and `profile-type` for CR-10 without naming the code of its enum clause; §8.3 L655 names `profile-ui-parameters` for missing or duplicate required parameters only | DESIGN silent: the lot-0 case `s2b-cr10-enum-values` (`profile-type`) decides; block A agrees |
| `compile-015-ui-parameter-source-type`, `py-compile-ui-parameter-source-type` | the element parameter `owner` of `task-create` bound from the `value` source | §8.3 L655 names `profile-ui-parameters` for missing or duplicate required parameters only and types every source (owner, target and source are native handles, value is the typed submitted value); §2.1 L81: the compiler checks parameter types and ill-typed content yields `profile-type`; §2.4.1 L195 lists `profile-type` for CR-10 | `profile-type`, as the block-A CR-10 compiler test (`tests/profile-compiler-j2.test.mjs`) |

Harmonization I3 (an unknown member of a command record refuses
`profile-ui-parameters`, `palette-023-unknown-member`) is a rule of the command
records and decides neither case; `compile-016-ui-parameter-unknown` keeps
`profile-ui-parameters`.

The Python twins keep their vendored bytes: `CODE_CORRECTIONS` of
`author/lot5-group-vendor-py.mjs` seals the decided code and fails the build as
soon as a vendored record carries it, so the re-vendor of the updated Python
seal removes the entry. Python side to update (owning seal, pathBase
`tests/profile_commands/expected/`): the harness records
`compile-enum-duplicate-values.json` and `compile-ui-parameter-source-type.json`
(expected code and derivation), the parity records
`parity/lot5-py-compile-enum-duplicate-values.json` and
`parity/lot5-py-compile-ui-parameter-source-type.json`, `MANIFEST.sha256` and
`parity/manifest.json`. Their vendored copies here are not edited:
`vendor/py/parity/lot5-py-compile-enum-duplicate-values.json` and
`vendor/py/parity/lot5-py-compile-ui-parameter-source-type.json`.

R3.4 erratum candidate (proposed E-49; DESIGN §2.4.1 L195, §8.3 L655, §2.1 L81,
§14.4 L977 and L981): the CR-10 row names two codes without the check each one
covers, and the R3.3 artifact validator (`validate-r2.mjs` "wrong UI parameter
type", `r31-contract-checks.mjs` "duplicate enum values", receipt
`VALIDATION-R33.json`) expects `profile-ui-parameters` for both negatives. That
validator is artifact validation, not DESIGN text (§14.4 L977); the erratum
should state the split applied here (a missing, duplicate or undeclared binding:
`profile-ui-parameters`; an ill-typed binding, the enum choice rule, reference
target types and a readonly command: `profile-type`, as lot 0 and block A) and
align the validator and its receipt.

## Lot-5 defaults taken where DESIGN and the harmonization are silent

Each default is recorded in `clauses.json` on the cases that rely on it; a
reviewer disagreement is a reseal of the listed cases only.

1. Command subject and exact sources (§8.3 L655), as in the Python binding.
2. Gesture sources: palette drop owner = drop container, append source = clicked
   element, key = injected insertion key, value = explicit empty string.
3. Connect and direct-edit dispatch: among entries whose `ui.when` holds, the
   unique one whose recipe `when` holds is staged; none means not offered. An
   explicit command whose recipe `when` is false is a no-op (§2.4 L158).
4. Multi-set selection: the palette drop prompts with the InputSets of the owner
   in UTF-16 ID order and stages nothing; with one set it binds it.
5. A created element gets exactly one occurrence, on the page of the gesture or
   the active page displaying its owner; untouched occurrences stay byte-identical
   (§8.2 L630–L632; the fixture profile has no place action, region or synthetic
   occurrence, so no correction applies).
6. Selection: exact after refusals and no-ops (§8.2 L633) and in-place edits;
   minus removed occurrences after a deletion; valid after creations, gestures,
   undo and redo.
7. Undo/redo run no stage: their reports have no entry; their events carry the
   undone entry's transactionId and the undo/redo report.
8. A mutation on a read-only canvas (§8.1 L619) is refused before staging with
   `operation-error` (the C10/C11 code of requests rejected before staging, §8.2
   L629); a load with both XML and native input refuses `input-conflict` without
   echo; after `dispose()` every call refuses `canvas-disposed` without echo.
9. Navigation request/result format; an explicit diagram that does not display
   the called Process refuses `navigation-view-missing`; a missing Process
   refuses `reference-dangling` (§8.1 L623).
10. Workshop export: FormatOption `{formatId, themeId, label}` names
    `exports[].id`; PreparedArtifact and report artifacts use `exports[].format`.
11. Compile refusals are `{status:"refused", code, diagnostics:[]}`.
12. Value typing: an enum value outside the choices, a number, a Boolean or null
    for a text value refuses `profile-type`; an omitted value refuses
    `profile-ui-parameters` (Python binding S5 §4.3).
    - 12a. `read` of a member the subject lacks yields MISSING (BLOCKB-PARITY-SYNC
      PS-11, DESIGN §2.2 L110, §2.3 L144–L146): `textPrefix` and `equal` of
      MISSING are false and `present` is false; it is not an evaluation error.
      Branch evaluation of `all`/`any` is not decided (erratum candidate E-38) and
      no sealed case depends on it.
    - 12b. A field command whose existing target is not recognized as the named
      notion refuses `profile-type` (PS-12, Python `field-unknown`; a missing
      target stays `reference-dangling`, `fields-049`).
    - 12c. CR-10 compile codes (section "CR-10 arbitration"): a missing or
      duplicate required parameter binding refuses `profile-ui-parameters` (§8.3
      L655; an undeclared binding, `compile-016`, keeps that code); a binding
      whose source type differs from the recipe parameter type and enum choices
      that repeat a JSON value refuse `profile-type` (§2.1 L81, §2.4.1 L195;
      lot-0 `s2b-cr10-enum-values`, block A).
13. DI-only gestures commit one presentation transaction (origin `command`,
    unchanged envelope); the exact-delta witnesses use grid-aligned deltas on an
    unconnected shape and a grid-aligned label.
14. restoreSnapshot starts a new history epoch; its Result has baseRevision =
    revision = the restored envelope revision.
15. Copy pre-order (PS-14, harmonization B20, G3): a fragment lists its
    `{property, element}` records in pre-order from Definitions, object members
    in UTF-16 key order (the profile-c14n/2 order), arrays by index; the same
    traversal as the coverage order G3 (Python `copy-fragment-preorder`:
    `artifacts` before `flowElements`). Every fragment sealed here holds one
    containment property (`paste-001`, `paste-002`).
16. Deletion intent (PS-17, DESIGN §2.4 L171, L174): exactly the `delete` and
    `replace` surface commands (and the upstream IDs mapped to them) carry a
    deletion intent.

## Written CR review of `ui-neutral/1` 1.1.0 (admission, replaces the discarded scratch run)

| Rule | Hand check |
| --- | --- |
| CR-01 | six unique capabilities; every operator used is in the registry signature table |
| CR-02 | no `ids`; `outputId` only in export emit fields; create fields are scalars (`name`, `text`, `associationDirection`); `concat`, `stripPrefix`, `case` take strings |
| CR-03 | native traversals use order `id`, render traversals `page-occurrence`; `property` only with reference, inverseReference and children |
| CR-04 | count bounds `min ≤ max` (2; 0..0; 1) |
| CR-05 | every referenced notion, recipe, message, glyph and theme exists; IDs unique per namespace; theme fallback acyclic; upstream IDs listed once; every message has its `en` fallback text |
| CR-06 | every action maps to a declared write; every written field has the code/editor/import producers; no recipe writes `/id` |
| CR-07 | every create and ensure is allocated with an explicit ownerId, slot and key |
| CR-08 | ten validation records (five stages × draft/accept), all 26 standard rules plus one profile subrule per stage |
| CR-09 | one exclusive group; native glyphs with a positive viewBox and no commands; unique theme bindings |
| CR-10 | every required recipe parameter bound exactly once with a compatible source type; enum choices with unique values; reference fields with target types; readonly fields without command |
| CR-11 | page `{id, name}` and node `{id, name}` IR fields |
| CR-12, CR-13 | no migration, no bind fallbacks |
| CR-14 | phase-admitted actions only (checked by the schema conditionals with the subset checker) |

## UNSEALED owner items and gates (DESIGN default recorded, nothing guessed)

| Item | Point not sealed | DESIGN default |
| --- | --- | --- |
| OPEN-PANEL (§13 L925, §8.3 L661, §16 item 5 L1148) | the optional properties-panel adapter versus a generic panel, panel UI, focus restoration, screen-reader behavior, panel undo integration, any new dependency | optional adapter/subpath with pinned dependency evidence, kept out of root/static/browser surfaces until the owner selects it; only the headless field contract and the no-dependency gate (`gates-001`) are sealed |
| OPEN-EXTERNAL (§13 L910, §4.1 L362–L364, §16 item 2) | external-call creation and its private encoding | external creation stays disabled: the fixture gates it with a refuse step (`gates-002`, harmonization H4) |
| OPEN-RESERVED-N (§13 L917, §7.2 L554, §16 item 11) | atomic creation of persisted supports during an edit, band moves | edit-time support creation refuses `profile-open` (`gates-003`); reuse of bound supports is sealed (`gates-004`) |
| OPEN-HOOK (§13 L923, §8.2 L637–L639) | live-entry failure modes, cancellation during in-flight async layout, the staged record of DI-only intents | the gesture vectors assume the default contract (detached staging, one root `profile.transaction`, final-only callbacks); a measured prototype showing that an entry cannot preserve pointer capture, selection, undo cursor and DI makes it `transaction-entry-unsupported` through a recorded dispute and reseal |

Ratified owner defaults relied on (§16 L1136): OPEN-DRAFT (item 3: draft editing
with warnings, export requires acceptance: `workshop-008`) and OPEN-SHARING
(item 4: one shared root store, local name overrides: `fields-017`,
`fields-018`, `paste-006`).

## Vendored Python cases (BLOCKB-PARITY-SYNC row PS-H25)

The Python lot-5 seal owns these 98 parity cases; this corpus vendors them with
their values unchanged (BLOCKB-HARMONIZATION §3: "the values stay those of the
owning seal"; BLOCKB-PARITY-SYNC §1.2: vendored after the owning seal's own
value changes, with its resealed bytes). One exception, the CR-10 arbitration
(section "CR-10 arbitration"): two vendored compile refusals seal `profile-type`
while their Python records, unchanged here, carry `profile-ui-parameters`.
Source: the Python lot-5 seal resealed after the parity sync, commit `5f2fa778933097653dc046f802d423f1e11e5112`,
`MANIFEST.sha256`
`44bb6b913981cd704637f80e94fa9cc20d59547f94cfdfc7f79432fe2bbd083a`, parity
manifest `94b09d03dbbd05914f1c309e0b9836f170dbc5f9774c03ad3ab2d765d6404c48`
(corpus `lot5-py-1`). Against the pre-sync seal (commit `2fd688a`,
`MANIFEST.sha256` `36772702…0547`) every vendored file is byte-identical except
the two compile successes the owning seal resealed by PS-35; each equals its
pre-sync record plus PS-35 (`author/lot5-vendor-py.json` `seal.presync`). Each
case keeps the Python case ID, author `spec-seal`, the Python clause (parsed into
the cited lines) and the Python derivation (its discrimination text);
`clauses.json` records the vendoring statement, the parity record and harness
record SHA-256 of each case.

| Python family | Cases | Lot-5 case files |
| --- | --- | --- |
| `compile-*` | 20 (18 refusals, 2 successes) | `cases/py-compile-*.json` |
| `copy-*` | 3 | `cases/py-copy-*.json` |
| `create-*` | 4 | `cases/py-create-*.json` |
| `delete-*` | 3 | `cases/py-delete-*.json` |
| `field-*` | 12 | `cases/py-field-*.json` |
| `gate-*` | 3 | `cases/py-gate-*.json` |
| `history-*` | 9 | `cases/py-history-*.json` |
| `io-set-*` | 2 | `cases/py-io-set-*.json` |
| `l10n-resolution-order` | 1 (`localize`, a shared A4 helper, E-47) | `cases/py-l10n-resolution-order.json` |
| `lifecycle-*` | 3 | `cases/py-lifecycle-*.json` |
| `lint-*` | 4 (including the PS-13 witness `lint-draft-integrity-refused`) | `cases/py-lint-*.json` |
| `paste-*` | 5 | `cases/py-paste-*.json` |
| `pick-*` | 7 | `cases/py-pick-*.json` |
| `replace-*` | 3 | `cases/py-replace-*.json` |
| `surface-*` | 17 | `cases/py-surface-*.json` |
| `twin-*` | 2 (the Python composed fixtures, now vendored) | `cases/py-twin-*.json` |

Re-expressed only: artifact paths (below `vendor/py/`) and, for the step
scripts, the comparator id `lot5-py/step-outcomes` split per sealed role (table
in "Comparators"); every expected artifact is JCS-equal to the Python one, except
the `code` member of the two compile refusals of the CR-10 arbitration.
Decisions of BLOCKB-PARITY-SYNC section 1 checked on every vendored case:

| Decision | Outcome on the vendored cases |
| --- | --- |
| PS-35 compile success observable | applied (by the owning seal, then vendored): `py-compile-grid-l5-ok` and `py-compile-neutral-l5-ok` seal the PureResult `{status: "ok", payload, diagnostics: []}` with `payload` UNSEALED (`compiled-profile`) and the identity record, unchanged from the pre-sync record, as the separate `compiled-identity` artifact; the pre-sync `{status, identity, diagnostics}` record is not vendored |
| PS-25 PureResult refusal shape | holds as sealed: the 18 compile refusals are `{status: "refused", code, diagnostics: []}` |
| PS-08, PS-09, PS-10 lint entries | hold as sealed: bare profile-subrule rule IDs, result coordinates `{none, null, null, unavailable}`, `rawStandardFindings` `[]` when no standard rule runs and UNSEALED (`raw-lint-transport`) where they run |
| PS-11, PS-12, PS-14, PS-17 | hold as sealed (Python rules adopted); recorded as defaults 12a, 12b, 15 and 16 |
| PS-15 default archived `importedDi` | holds: outside the parity observable (`lot4-presentation`) unless a record is loaded |
| PS-16, PS-28, PS-29 | converged: undo/redo `baseRevision`, no implicit re-pointing on replace, subject and sources, entry-free undo/redo reports, no echo after dispose |
| PS-18 signal poll points | runtime: `tx-cancelled`, `tx-dispose-during-transaction` and `tx-reentrant-refused` stay Python runtime-specific cases (section 5), not vendored |

Every other parity case stays two-sided (BLOCKB-PARITY-SYNC section 5): the cases
sealed here witness the same behaviour rows with the `ui-neutral/1` fixture.

## Observed block-A divergences the lot-5 implementation must resolve

None changes an expectation (the pinned schema is the sole authority for record
keys, §2.4.1 L182):

- `remove.dependents` is one selector in the schema; the block-A compiler reads an
  array.
- `ensure.ownerId` is a Value in the schema; the block-A compiler reads it as a
  binding name (harmonization §4.3 item 3).
- `count.select` (used by `require-input-set`) must be read with the schema key
  (block-A fix2 per the job plan).
- The block-A static compiler does not read `upstreamEntries` and does not check
  fallback texts (`surfaces-013`, `surfaces-014`).

## Cross-lot reconciliation points

- Lot 3: C/N vocabulary B8/B9 (`workshop-009`), activation H1, the ensure reuse
  validation C5 (`gates-004`) and the removal closure code C12 come from the
  harmonized lot-3 contract.
- Lot 4: layout geometry of created occurrences, labels, export IR geometry and
  bytes are lot-4/adapter outputs (UNSEALED above); lot 5 seals their existence,
  endpoints, page, ordering, freshness, names and digests.
- The reference effective-label fallback (reference name, else store name, §4.4
  L408) is a render question: `fields-018` only seals that the reference label may
  change.

## Demo acceptance script (owner demo, case `demo-001-acceptance-script`)

Starting from `fixtures/documents/demo.snapshot.json` (Process "Demo request" with
"Request received" and "Request closed"):

1. Palette: drop Task → a Task with an empty name; two draft warnings (activity
   name missing); one history entry.
2. Direct edit the new task: "Review request" → warnings gone.
3. Replace the task by a user task (still unconnected): a new allocated ID
   carrying the name, the task removed, the replacement map in `report.idMap`.
4. Connect "Request received" → user task: one SequenceFlow.
5. Connect user task → "Request closed": one SequenceFlow.
6. Palette: drop Reserved band → one root DataStore (empty name) and one
   unnamed DataStoreReference.
7. Edit the store title: "Request policy" (the reference is untouched).
8. Connect the reference → user task: one Association with direction One (never a
   data input association).
9. Edit the name: "Review and approve request".
10. Undo → state after step 8; 11. Redo → state after step 9.
12. Export `drawing` → exactly one download of the final state (capability
    structural, no report entry, final names only, never "Review request").

Each step's staged command, envelope, report, snapshot delta, events and history
cursor are in the case; the Python twin replays steps 1–11.

## Per-case discrimination

<!-- generated: case table -->
| Case | Clauses | Fails against (plausible wrong implementation) |
| --- | --- | --- |
| `surfaces-001-palette-plain-en` | §8.3 L649, §8.3 L655, §8.3 L659, §10.1 L737 | Renders palette entries in profile array order (aid-create first, then reference-create...), orders groups alphabetically (data, flow, notes) instead of first appearance (notes, data, flow), sorts IDs with localeCompare (task-create before UserTask-create) or orders numerically as strings ("10" before "9"). |
| `surfaces-002-palette-contrast-en` | §8.3 L649, §3.1 L264, §9.2 L694, §8.3 L659, §10.1 L737 | Lets the selected theme filter, relabel or re-icon surface entries (theme bypass): any difference from the plain-theme listing fails. |
| `surfaces-003-palette-locale-fr` | §8.3 L649, §8.3 L659, §10.1 L737 | Falls back to the stable message key, or to an empty label, when the exact locale has no text, instead of policies.localeFallback (en); or ignores existing fr texts. |
| `surfaces-004-palette-locale-fr-ca` | §8.3 L649, §8.3 L659, §10.1 L737 | Truncates fr-CA to fr (BCP 47 lookup) and shows the fr texts; the contract is exact requested locale, then policies.localeFallback, then the key. |
| `surfaces-005-element-task` | §8.3 L649, §2.3 L143, §8.3 L651, §8.3 L659, §10.1 L737 | Offers to-task or keeps the upstream replace list (exact typeIs ignored), shows upstream append.gateway/append.intermediate-event, or omits connect-item-output because the upstream connect rule is used. |
| `surfaces-006-element-user-task` | §8.3 L649, §2.3 L143, §8.3 L659, §10.1 L737 | Evaluates typeIs(Task, exact) as assignable (instance-of), offering to-user-task on a UserTask, or drops assignable entries for the subtype. |
| `surfaces-007-element-end` | §8.3 L649, §8.3 L659, §10.1 L737 | Keeps upstream EndEvent append/connect affordances or a replace entry although no profile entry is enabled for an EndEvent. |
| `surfaces-008-element-reference` | §8.3 L649, §8.3 L651, §8.3 L659, §10.1 L737 | Offers the upstream DataStoreReference connect (data input association) or upstream append.text-annotation instead of the profile reference-link entry. |
| `surfaces-009-element-annotation` | §8.3 L649, §2.3 L141, §8.3 L653, §8.3 L659, §10.1 L737 | Evaluates content conditions inside ui.when (reading /text on every subject type: a non-annotation reads MISSING, BLOCKB-PARITY-SYNC PS-11, and the annotation's own text then hides one of its two direct-edit entries), or offers the generic rename-direct for annotations. |
| `surfaces-010-element-call` | §8.3 L649, §8.3 L659, §10.1 L737 | Adds connect-item-output to a CallActivity through an assignable Activity check, or drops the profile-only call-unlink context entry because no upstream entry maps it. |
| `surfaces-011-upstream-palette` | §8.3 L659 | Keeps unlisted upstream create entries (group, pool, sub-process, intermediate event) in business-profile mode, or drops the mapped global-connect-tool. |
| `surfaces-012-upstream-context-task` | §8.3 L659, §8.3 L649 | Leaves upstream append.gateway/append.intermediate-event active for a Task, or hides the replace wrench although to-user-task is enabled. |
| `surfaces-013-compile-duplicate-upstream` | §8.3 L659, §2.4.1 L190, §2.4.1 L182, §10.1 L737 | Compiler without the L659 upstream-uniqueness check accepts two recipes for create.task. |
| `surfaces-014-compile-missing-fallback-text` | §8.3 L659, §2.4.1 L190, §2.4.1 L182, §10.1 L737 | Compiler that accepts a surface label without policies.localeFallback text (falling back to the message key at runtime) instead of rejecting it at compile time. |
| `compile-001-main-profile-admitted` | §2.4.1 L186, §2.4.1 L190, §2.4.1 L191, §2.4.1 L195, §5.1 L430, §3.1 L262 | A compiler that refuses the schema-valid fixture (for example by reading remove.dependents as an array or count.select as selector) or derives the identity from file bytes instead of H(profile). |
| `compile-002-enum-duplicate-records` | §8.3 L655, §2.1 L48, §2.4.1 L182, §10.1 L737 | Accepts two identical choice records (schema uniqueItems) or reports a static-rule code before schema validation. |
| `compile-003-enum-duplicate-values` | §2.4.1 L195, §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts two choice names with the same JSON value (the choice is then ambiguous on submit), or reports the repeated value as a parameter-binding failure (profile-ui-parameters). |
| `compile-004-enum-empty-choices` | §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts an enum widget without choices (the field then renders an empty choice list and every submit refuses), instead of the schema refusal. |
| `compile-005-field-parameter-missing` | §2.4.1 L195, §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts a mutable field whose map omits the required rename parameter name (the value would come from an ambient variable). |
| `compile-006-id-not-ordinary-input` | §2.4 L165, §2.4.1 L191, §2.4.1 L206, §8.3 L653, §2.4.1 L182, §10.1 L737 | Accepts a recipe that sets an existing ID (IDs are not ordinary inputs); the Python binding uses the CR-06 code profile-producer. |
| `compile-007-mutable-without-command` | §8.3 L659, §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts a mutable field without a command, so the panel offers an edit that no recipe performs (a generic property write would be the only path). |
| `compile-008-mutable-without-parameters` | §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts a mutable field with a command but no parameter map, so the recipe parameters would be filled from ambient variables. |
| `compile-009-readonly-with-command` | §8.3 L655, §8.3 L659, §2.4.1 L182, §10.1 L737 | Accepts a readonly field that carries a command (the readonly isExecutable field becomes writable through rename). |
| `compile-010-reference-empty-target-types` | §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts a reference widget without admitted target types, so reference picking would offer every element or none. |
| `compile-011-ui-icon-unknown-glyph` | §8.3 L655, §2.4.1 L190, §2.4.1 L182, §10.1 L737 | Accepts an icon naming a glyph no theme declares and falls back to an upstream default icon at runtime. |
| `compile-012-ui-label-unknown-message` | §2.4.1 L190, §2.4.1 L182, §10.1 L737 | Accepts a label message key that the message table does not define and shows the raw key in the palette. |
| `compile-013-ui-parameter-duplicate` | §2.4.1 L195, §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts a parameter bound twice (last binding wins) instead of refusing the duplicate required parameter. |
| `compile-014-ui-parameter-missing` | §2.4.1 L195, §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts an entry that omits the required key parameter (allocation would depend on an ambient key). |
| `compile-015-ui-parameter-source-type` | §2.4.1 L195, §8.3 L655, §2.1 L81, §2.4.1 L182, §10.1 L737 | Accepts an element parameter bound from the submitted value instead of a validated gesture handle, or reports the ill-typed binding as a missing parameter (profile-ui-parameters). |
| `compile-016-ui-parameter-unknown` | §2.4.1 L195, §8.3 L655, §2.4.1 L182, §10.1 L737 | Accepts a binding of a parameter the recipe does not declare (an extra label input silently ignored or injected into the recipe). |
| `compile-017-upstream-duplicate-within-entry` | §8.3 L659, §2.4.1 L182, §10.1 L737 | Accepts one upstream ID listed twice by one entry (the schema admits it; the L659 uniqueness rule refuses it). |
| `palette-001-task-programmatic` | §8.3 L649, §8.3 L655, §8.3 L659, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Creates the shape with an upstream random ID (Activity_xxx) instead of stable-id/1, omits the explicit empty name, skips the draft lint stages (no warning entries), lets one palette action produce two history entries, or re-lays out untouched shapes. |
| `palette-002-task-gesture` | §8.3 L649, §8.3 L655, §3.2 L276, §3.2 L278–L282, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Executes the upstream create.task command (bpmn-js ElementFactory) and lets a changed listener patch it afterwards, producing a different ID, an extra history entry or a second onChange. |
| `palette-003-user-task` | §8.3 L649, §8.3 L655, §2.4 L163, §3.2 L276, §3.2 L278–L282, §2.3 L143, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Lints the new UserTask with an exact Task type test (no finding) instead of the assignable rule, or creates a plain Task. |
| `palette-004-start` | §8.3 L649, §8.3 L655, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Creates the native bpmn:StartEvent with an upstream ID or default name, or invents a calledElement/definition for the new element. |
| `palette-005-end` | §8.3 L649, §8.3 L655, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Creates the native bpmn:EndEvent with an upstream ID or default name, or invents a calledElement/definition for the new element. |
| `palette-006-gateway` | §8.3 L649, §8.3 L655, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Creates the native bpmn:ExclusiveGateway with an upstream ID or default name, or invents a calledElement/definition for the new element. |
| `palette-007-call` | §8.3 L649, §8.3 L655, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Creates the native bpmn:CallActivity with an upstream ID or default name, or invents a calledElement/definition for the new element. |
| `palette-008-reference` | §8.3 L651, §4 L352, §4.4 L408, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Creates only an upstream DataStoreReference without a root DataStore, names the reference instead of the store, places the DataStore inside the Process, or draws the root DataStore. |
| `palette-009-item` | §8.3 L651, §4 L349, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Creates a DataObjectReference without its DataObject backing, or orders the two created elements differently from the recipe steps. |
| `palette-010-aid` | §8.3 L653, §9.3 L702, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Stores the typed body without the configured marker, or adds the marker without its separating space. |
| `palette-011-input-two-sets-prompt` | §8.3 L651, §7.1 L547, §8.3 L655 | Silently appends the new DataInput to the first InputSet (Set_A), or commits without a set, instead of asking for the set when several valid sets exist. |
| `palette-012-input-set-b-gesture` | §8.3 L651, §7.1 L547, §2.4 L166, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Adds the input to both sets, to the first set, or replaces Set_B's absent dataInputRefs with a list that drops the new ID; or writes Lane.flowNodeRef for process IO. |
| `palette-013-input-set-b-programmatic` | §8.3 L651, §7.1 L547, §1.1 L32, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Twin divergence: a headless implementation that resolves the set by position or by name instead of the explicit target ID. |
| `palette-014-input-one-set-gesture` | §8.3 L651, §2.4 L166, §2.4 L176, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Prompts although exactly one valid set exists, or rewrites Set_A's reference array instead of appending the new ID after Input_1 (stable appendUnique order). |
| `palette-015-input-missing-target` | §8.3 L655, §2.4.1 L195, §8.2 L633, §10.1 L735, §10.1 L739 | Defaults the missing set parameter to the first set or to a label/ambient variable instead of refusing the missing required parameter. |
| `palette-016-disabled-owner` | §8.3 L649, §8.2 L633, §10.1 L735, §10.1 L739 | Treats the hidden palette entry as the only guard and executes a programmatic call whose ui.when (owner is a Process) is false, or refuses with the adapter code transaction-entry-unsupported. |
| `palette-017-unknown-entry` | §8.3 L659, §2.4.1 L190, §8.2 L633, §10.1 L735, §10.1 L739 | Falls through to the upstream create.group handler for an ID that no profile entry declares (unlisted upstream entries are disabled). |
| `palette-018-final-only-report` | §8.2 L631, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Reports or emits the intermediate state (activity-name-missing warnings after the first command), emits two onChange events, or records two history entries for one transaction. |
| `palette-019-contrast-theme-same-tree` | §8.3 L649, §3.1 L264, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Theme bypass: derives the created type, ID, name or report from the active theme; the envelope and report must equal the plain-theme case and only the theme digest differs in viewRevision. |
| `palette-020-upstream-command-mapped` | §8.3 L659, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Runs the upstream create.task handler (random ID, no lint) instead of the mapped task-create recipe, or refuses a listed upstream ID. |
| `palette-021-unlisted-upstream` | §8.3 L659, §8.2 L635, §8.2 L633, §10.1 L735, §10.1 L739 | Executes the upstream create.group command (a group is created) because the headless path does not apply the business-profile upstream filter. |
| `palette-022-bare-recipe-command` | §8.2 L635, §8.3 L657, §8.2 L633, §10.1 L735, §10.1 L739 | Accepts a bare {recipe, parameters} command, a second recipe authority that bypasses ui.when and the parameter map. |
| `palette-023-unknown-member` | §8.3 L655, §8.2 L633, §10.1 L735, §10.1 L739 | Ignores the unknown label member, or uses it as the created name. |
| `palette-024-extra-source` | §8.3 L655, §8.2 L633, §10.1 L735, §10.1 L739 | Ignores the extra target source that the task-create parameter map does not bind (an ambient parameter). |
| `palette-025-non-string-handle` | §8.3 L655, §2.2 L113, §8.2 L633, §10.1 L735, §10.1 L739 | Coerces the number 7 to an element ID or resolves it by position. |
| `palette-026-dangling-handle` | §8.3 L655, §2.2 L113, §2.2 L132, §8.2 L633, §10.1 L735, §10.1 L739 | Creates a placeholder Process or falls back to the active page's Process for an owner handle that names no element. |
| `palette-027-null-value` | §8.3 L655, §8.3 L659, §2.2 L113, §8.2 L633, §10.1 L735, §10.1 L739 | Treats a null value as an omitted name (no name property) or as the empty string. |
| `palette-028-number-value` | §8.3 L659, §2.2 L114, §8.2 L633, §10.1 L735, §10.1 L739 | Coerces the number 3 to the name "3" (implicit scalar coercion). |
| `palette-029-input-loose-two-sets` | §7.1 L547, §8.3 L651, §8.2 L631, §8.2 L633, §10.1 L735, §10.1 L739 | Appends the uncovered DataInput to the first InputSet, commits it uncovered, or runs C before the user command is staged. |
| `palette-030-cancelled-before-call` | §8.1 L604, §8.2 L629, §8.2 L633, §10.1 L735, §10.1 L739 | Rejects the Promise instead of returning the refusal union, or creates the task because cancellation is only polled after commit. |
| `palette-031-cancelled-after-call` | §8.1 L604, §8.2 L629, §8.2 L633, §10.1 L735, §10.1 L739 | Runs the queued transaction to completion although its signal was aborted while it waited, or commits the stage and only then reports the cancellation. |
| `context-001-append-task-programmatic` | §8.3 L649, §8.3 L655, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Appends with upstream AppendBehavior (random IDs, incoming/outgoing writes, auto-placement commands as extra history entries) or connects the flow in the reverse direction. |
| `context-002-append-task-gesture` | §8.3 L649, §8.3 L655, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Derives the anchor from the semantic ID of another repeated occurrence or from the selection instead of the clicked occurrence, or creates a different staged input than the programmatic call. |
| `context-003-append-end` | §8.3 L649, §2.3 L143, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Refuses the append from the UserTask with an exact-Task ui.when, or appends an intermediate event. |
| `context-004-aid-attach` | §4 L354, §8.3 L653, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Links the annotation with direction One (reference-link type) or from the task to the annotation, or omits the marker. |
| `context-005-append-on-end` | §8.3 L649, §8.2 L633, §10.1 L735, §10.1 L739 | Executes append-task from an EndEvent because the programmatic path skips the ui.when check that hides it from the context pad. |
| `context-006-call-unlink` | §8.3 L659, §2.4 L165, §8.3 L653, §4 L356, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Clears the call target by writing an empty string or null instead of an explicit unset, or drops the call's source Documentation evidence while editing it. |
| `context-007-call-unlink-noop` | §2.4 L158, §8.2 L641, §10.1 L735, §10.1 L739 | Refuses, or writes calledElement:"" / creates a history entry, when the recipe `when` (present calledElement) is false for a call that has no target. |
| `connect-001-flow-programmatic` | §8.3 L649, §4 L347, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Writes FlowNode incoming/outgoing (not admitted by the descriptor slice), or creates the flow in Definitions instead of the Process flow container. |
| `connect-002-flow-gesture` | §8.3 L649, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Uses the upstream connection rule (bpmn-js canConnect) to pick the connection type instead of the unique enabled profile connect entry whose recipe accepts the target. |
| `connect-003-reference-link-programmatic` | §8.3 L651, §4 L353, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Creates the upstream default DataInputAssociation (with a target port) for DataStoreReference→Task, or an Association with direction None. |
| `connect-004-reference-link-gesture` | §8.3 L651, §8.3 L649, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Lets the upstream DataStoreReference connect rule win (connection type bpmn:DataInputAssociation) instead of overriding it with the profile reference-link Association. |
| `connect-005-item-input` | §8.3 L651, §4 L350, §7.1 L546, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Uses an Association for an internal item, targets the task itself instead of an owned port, or allocates the port with the Process as ownerId. |
| `connect-006-item-output` | §8.3 L651, §4 L350, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Creates a SequenceFlow or Association from a task to an item (connect-flow chosen because both entries are enabled for the task source). |
| `connect-007-annotation-link` | §4 L354, §8.3 L651, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Gives an annotation link the reference-link direction One, or reverses it to task→annotation. |
| `connect-008-reference-to-call` | §4 L353, §8.3 L651, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Restricts the eligible activity to bpmn:Task by exact type and refuses or no-ops a CallActivity target. |
| `connect-009-ineligible-target-noop` | §2.4 L158, §4 L353, §8.2 L641, §10.1 L735, §10.1 L739 | Creates the Association anyway (ignoring the recipe `when`), or falls back to a SequenceFlow or DataInputAssociation for an ineligible target. |
| `connect-010-ineligible-target-gesture` | §8.3 L649, §8.3 L651 | Offers the connection because the upstream rule allows DataStoreReference→EndEvent data associations, or stages a no-op transaction (history entry) for a refused hover. |
| `connect-011-flow-from-end` | §8.3 L649, §8.2 L633, §10.1 L735, §10.1 L739 | Accepts an outgoing SequenceFlow from an EndEvent through the programmatic path because only the context pad hides it. |
| `replace-001-task-to-user-programmatic` | §8.3 L651, §2.4 L163, §2.4 L171, §2.4.1 L182, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L753 | Keeps the ID Task_X with an in-place type change (an implicit override the recipe grammar cannot express), omits the replacement map, keeps the original element, or places the replacement at the original index instead of appending it. |
| `replace-002-task-to-user-gesture` | §8.3 L649, §8.3 L651, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L753 | Executes upstream BpmnReplace (shape.replace with ReplaceConnectionBehavior) as several commands, producing more than one history entry, an intermediate onChange or an upstream-allocated ID. |
| `replace-003-user-to-task` | §8.3 L651, §2.3 L143, §2.4 L171, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L753 | Keeps the UserTask type because the target already is assignable to Task, loses the name, or reports no replacement map. |
| `replace-004-exact-type-refusal` | §8.3 L649, §2.3 L143, §8.2 L633, §10.1 L735, §10.1 L739 | Evaluates typeIs(Task, exact) with subtype inclusion and re-applies to-user-task to a UserTask. |
| `replace-005-reference-to-item` | §8.3 L651, §4 L349, §4 L352, §4.4 L408, §2.4 L171, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Deletes the shared root DataStore Store_2, keeps a dataStoreRef on the item, reuses the store as backing, keeps the ID Ref_2 for the new type, or lets N change the type silently instead of the explicit conversion. |
| `replace-006-reference-to-item-linked` | §8.3 L651, §2.4 L171, §8.2 L633, §10.1 L735, §10.1 L739 | Converts the reference although Link_1.sourceRef still names it, silently deleting Link_1, re-pointing it implicitly or keeping a dangling sourceRef. |
| `replace-007-referenced-task-refused` | §8.3 L651, §2.4 L171, §2.4.1 L182, §8.2 L633, §10.1 L735, §10.1 L739 | Re-points Flow_1, Flow_2 and Link_1 to the replacement implicitly (no declared write), keeps the ID in place, or cascades the deletion of the flows. |
| `replace-008-note-to-aid-same-type` | §8.3 L651, §9.3 L702, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Allocates a new ID for a conversion that keeps the native type, or reports a replacement map row for a surviving ID. |
| `replace-009-referenced-task-gesture-refused` | §8.3 L651, §2.4 L171, §8.2 L633, §8.2 L637, §10.1 L735 | Commits the upstream BpmnReplace (which re-points the connections) when the profile conversion refuses, or emits an onChange for the refused gesture. |
| `delete-001-reference-with-links` | §8.3 L653, §2.4 L171, §4.4 L408, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Leaves the reference-link Association as an orphan shell, or also deletes the shared root DataStore Store_1. |
| `delete-002-unconnected-task` | §8.3 L653, §2.4 L171, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Refuses an unreferenced element or removes more than its closure. |
| `delete-003-outgoing-only` | §8.3 L653, §2.4 L171, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Removes the start event but keeps Flow_1 with a dangling sourceRef (orphan shell), or refuses although the only dependent is declared. |
| `delete-004-incoming-refused` | §8.3 L653, §2.4 L171, §8.2 L633, §10.1 L735, §10.1 L739 | Cascades like upstream bpmn-js (deleting Flow_1 and Link_1 that the dependents selector does not declare), or deletes Task_A leaving Flow_1.targetRef dangling. |
| `delete-005-flow` | §8.3 L653, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Also deletes the flow endpoints or rewires Task_B to End_1. |
| `delete-006-keyboard-delete` | §8.3 L657, §8.3 L649, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Maps the keyboard shortcut to a second delete authority (upstream removeSelection editor action) instead of the canonical delete surface. |
| `delete-007-context-pad-delete` | §8.3 L649, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Runs the upstream context-pad delete (modeling.removeElements with its cascade behaviors) instead of the profile delete recipe, so the staged input or the history differs from the keyboard path. |
| `delete-008-multi-atomic` | §2.4 L172, §8.2 L643, §8.2 L633, §10.1 L735, §10.1 L739 | Commits the first deletion (Task_X) before the second command refuses: a transaction is atomic. |
| `delete-009-annotation-with-link` | §8.3 L653, §2.4 L171, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Leaves the annotation link without its source (orphan shell). |
| `delete-010-process-disabled` | §8.3 L649, §2.4 L174, §8.2 L633, §10.1 L735, §10.1 L739 | Accepts a programmatic delete of the Process (ui.when lists deletable element types only). |
| `delete-011-last-element-keeps-empty-array` | §8.3 L653, §2.4 L171, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Removes the emptied flowElements property instead of keeping the empty array, or refuses the deletion of an element without a view. |
| `fields-001-state-task` | §8.3 L653, §8.3 L655, §10.1 L737 | Shows the ID, a port or a hash as an ordinary input, or derives the label from the theme instead of the message table. |
| `fields-002-state-task-fr` | §8.3 L653, §8.3 L655, §8.3 L659, §10.1 L737 | Ignores the requested locale or falls back to the message key although an fr text exists (the message falls back to en). |
| `fields-003-state-aid` | §8.3 L653, §8.3 L655, §9.3 L702, §2.2 L115, §10.1 L737 | Displays the stored text with its marker, or strips the marker by rewriting the stored text. |
| `fields-004-state-aid-no-space` | §8.3 L653, §8.3 L655, §2.2 L115, §9.3 L702, §10.1 L737 | Strips a partial marker ("[Aid]" without the configured separator), returning "calculator"; stripPrefix must return the original value when the exact prefix does not match. |
| `fields-005-state-note-leading-space` | §8.3 L653, §8.3 L655, §2.3 L146, §2.3 L152, §10.1 L737 | Trims leading whitespace before the trim:none textPrefix test and recognizes the annotation as an aid. |
| `fields-006-state-process` | §8.3 L653, §8.3 L655, §2.1 L79, §8.3 L659, §10.1 L737 | Fills the absent processType with a descriptor default, or reports the readonly field as mutable. |
| `fields-007-state-call` | §8.3 L653, §8.3 L655, §8.3 L657, §10.1 L737 | Shows the called Process name as the stored value, or resolves the called element by name instead of by ID. |
| `fields-008-state-user-task` | §8.3 L653, §8.3 L655, §2.3 L154, §10.1 L737 | Recognizes the UserTask also as the task notion (assignable recognition), producing two exclusive-group matches or duplicated fields. |
| `fields-034-state-call-locked` | §8.3 L653, §8.3 L655, §10.1 L737 | Ignores the field mutability predicate (offering the locked call target as editable). |
| `fields-035-state-call-hidden` | §8.3 L653, §8.3 L655, §10.1 L737 | Lists a field whose visibility predicate is false (the hidden call target), or lists it as present but immutable. |
| `fields-036-state-choice-upper` | §8.3 L653, §8.3 L655, §2.2 L116, §10.1 L737 | Displays the stored name, upper-cases with a locale-dependent or simple per-character mapping ("FİT" or "STRAßE"), or rewrites storage to the display text. |
| `fields-037-state-aid-link-anchor` | §8.3 L653, §8.3 L655, §10.1 L737 | Shows the anchor's name as the stored value, or offers no field for an Association recognized by its direction. |
| `fields-038-state-no-fields` | §8.3 L653, §8.3 L655, §10.1 L737 | Shows generic BPMN properties (direction, endpoints) for a notion that declares no field. |
| `fields-039-check-enum` | §8.3 L659, §8.3 L655, §10.1 L737 | Accepts a choice name or a case-folded value on change, or validates on change differently from submit. |
| `fields-040-check-reference` | §8.3 L659, §8.3 L657, §10.1 L737 | Accepts any existing ID, an unresolved ID or a displayed label for a reference widget (reference widgets submit IDs of the targetTypes). |
| `fields-041-check-text` | §8.3 L659, §2.2 L114, §10.1 L737 | Treats the explicit empty string as invalid, or coerces a number or a Boolean to text. |
| `fields-042-check-denied` | §8.3 L659, §8.3 L653, §8.3 L649, §10.1 L737 | Reports an immutable, hidden or readonly field as valid on change although its submit refuses. |
| `fields-043-check-unknown-field` | §8.3 L659, §2.4.1 L190, §10.1 L737 | Answers valid:false (or valid:true) for a field that no recognized notion declares instead of refusing the unknown field symbol. |
| `fields-044-check-unknown-target` | §8.3 L659, §2.2 L132, §10.1 L737 | Validates against an implicit default target, or answers valid for a target that names no element. |
| `fields-045-check-stale-revision` | §8.3 L659, §8.2 L629, §10.1 L737 | Validates a submission against the current state although the caller's revision is stale. |
| `fields-009-edit-task-name` | §8.3 L653, §8.3 L655, §8.3 L659, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Edits the name through the upstream properties/label command (separate history entry, no lint), or trims the submitted text. |
| `fields-010-edit-situations-crlf` | §8.3 L653, §8.3 L655, §8.3 L659, §4.2 L387, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Normalizes CRLF to LF (or trims lines) in the multiline widget; the submitted string is stored exactly, without implicit conversion. |
| `fields-011-edit-empty-name` | §8.3 L653, §8.3 L655, §8.3 L659, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Removes the name property (omission) instead of storing the explicit empty string, or refuses the empty text. |
| `fields-012-edit-aid-body` | §8.3 L653, §8.3 L655, §8.3 L659, §9.3 L702, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Stores the body without restoring the configured marker, or restores it twice. |
| `fields-013-edit-aid-body-typed-marker` | §8.3 L653, §8.3 L655, §8.3 L659, §9.3 L702, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Deduplicates a marker typed by the user (stores "[Aid] tool"); the recipe restores the marker exactly once and display(stored) must return the submitted body. |
| `fields-014-edit-aid-no-space-keeps-evidence` | §8.3 L653, §8.3 L655, §8.3 L659, §9.3 L702, §4 L356, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Keeps the legacy partial marker "[Aid]calculator", or rewrites or drops the annotation's source Documentation evidence while editing the marked text (L653: without touching source evidence). |
| `fields-015-edit-call-target-keeps-evidence` | §8.3 L653, §8.3 L655, §8.3 L659, §8.3 L657, §4 L356, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Submits the displayed label ("Archive records") or a QName instead of the ID, or drops the call's source Documentation. |
| `fields-016-edit-process-kind` | §8.3 L653, §8.3 L655, §8.3 L659, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Stores the choice name ("public") or its localized label instead of its JSON value "Public". |
| `fields-017-edit-reference-override` | §8.3 L653, §8.3 L655, §8.3 L659, §4.4 L408, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Propagates the local reference-name override to the shared DataStore name. |
| `fields-018-edit-store-title` | §8.3 L653, §8.3 L655, §8.3 L659, §4.4 L408, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Renaming the store writes names onto its references (Ref_1) instead of leaving the fallback label derivation to the store. |
| `fields-019-edit-no-op` | §8.3 L653, §8.3 L655, §8.3 L659, §8.2 L641, §10.1 L735, §10.1 L739 | Records a history entry or emits onChange for a submission that produces no difference. |
| `fields-020-edit-call-target-wrong-type` | §8.3 L657, §8.3 L655, §8.2 L633, §10.1 L735, §10.1 L739 | Accepts any existing ID for a reference field instead of revalidating the submitted ID against targetTypes [bpmn:Process] at commit. |
| `fields-021-edit-call-target-dangling` | §8.3 L657, §4.1 L378, §8.2 L633, §10.1 L735, §10.1 L739 | Stores an unresolved called element (or creates a placeholder Process) instead of revalidating existence at commit. |
| `fields-022-edit-enum-not-a-choice` | §8.3 L659, §2.3 L145, §8.2 L633, §10.1 L735, §10.1 L739 | Case-folds "public" to the choice value "Public" or stores a value outside the declared choices. |
| `fields-023-edit-readonly` | §8.3 L655, §8.3 L659, §8.2 L633, §10.1 L735, §10.1 L739 | Writes isExecutable through the generic properties path although the field is readonly (no command). |
| `fields-024-edit-number-no-coercion` | §8.3 L659, §2.2 L114, §8.2 L633, §10.1 L735, §10.1 L739 | Coerces the number 5 to the string "5" for a text field instead of refusing the ill-typed submission (no implicit scalar coercion). |
| `fields-025-direct-edit-gesture` | §8.3 L649, §8.3 L657, §8.2 L637, §8.2 L632, §8.2 L633, §8.2 L641 | Commits the upstream direct-editing label update (element.updateLabel) as its own command instead of the canonical direct-edit surface; the envelope must equal the field-edit case. |
| `fields-026-direct-edit-aid-gesture` | §8.3 L653, §9.3 L702, §8.2 L637, §8.2 L632, §8.2 L633 | Edits the raw stored text (losing the marker) or stages note-direct-edit for a marked annotation. |
| `fields-046-edit-locked-target` | §8.3 L653, §8.3 L649, §8.2 L633, §10.1 L735, §10.1 L739 | Writes a field whose mutability predicate is false because the programmatic path skips the predicate the panel uses. |
| `fields-047-edit-hidden-target` | §8.3 L653, §8.3 L649, §8.2 L633, §10.1 L735, §10.1 L739 | Writes a field whose visibility predicate is false (an invisible field is not an authorization boundary either). |
| `fields-048-edit-unknown-field` | §2.4.1 L190, §8.3 L655, §8.2 L633, §10.1 L735, §10.1 L739 | Writes the generic property named by an undeclared field ID instead of refusing the unknown field symbol. |
| `fields-049-edit-unknown-target` | §8.3 L655, §2.2 L132, §8.2 L633, §10.1 L735, §10.1 L739 | Creates the element or applies the edit to the selected element when the target handle names no element. |
| `fields-050-edit-value-omitted` | §8.3 L655, §8.3 L659, §8.2 L633, §10.1 L735, §10.1 L739 | Treats an omitted value as the explicit empty string or removes the name (omission is not an empty text). |
| `fields-051-edit-boolean-no-coercion` | §8.3 L659, §2.2 L114, §8.2 L633, §10.1 L735, §10.1 L739 | Coerces the Boolean true to the name "true" (String(value)) instead of refusing the ill-typed submission. |
| `fields-052-edit-aid-link-anchor` | §8.3 L653, §8.3 L655, §8.3 L659, §8.3 L657, §2.4 L166, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Submits the anchor's name, or re-creates the association with a new ID instead of re-pointing its targetRef. |
| `fields-053-edit-aid-link-other-process` | §8.3 L657, §2.4 L166, §4 L358, §8.2 L633, §10.1 L735, §10.1 L739 | Accepts a candidate of the right type owned by another Process (a cross-owner association) because only targetTypes is revalidated at commit. |
| `fields-027-candidates-all` | §8.3 L657, §2.2 L123, §10.1 L737 | Sorts with localeCompare (Proc_main first) or by label, or lists DataStores/Tasks that the targetTypes exclude. |
| `fields-028-candidates-case` | §8.3 L657, §10.1 L737 | Matches on a normalized or folded label in a way that misses the literal substring. |
| `fields-029-candidates-case-miss` | §8.3 L657, §10.1 L737 | Uses case-insensitive matching ("Cycle" would match "Révision cycle"). |
| `fields-030-candidates-normalization` | §8.3 L657, §10.1 L737 | Applies NFC/NFD normalization so that decomposed e + U+0301 matches the precomposed é. |
| `fields-031-candidates-paging` | §8.3 L657, §10.1 L737 | Pages before sorting (returning the second Process in document order, Proc-review), or treats offset as 1-based. |
| `fields-032-candidates-astral` | §8.3 L657, §10.1 L737 | Iterates labels by UTF-16 code units in a way that drops or splits the astral scalar. |
| `fields-033-candidates-unknown-field` | §8.3 L657, §2.4.1 L190, §10.1 L737 | Returns all elements for an undeclared field instead of refusing the unknown field symbol. |
| `fields-054-candidates-anchor-ownership` | §8.3 L657, §4 L358, §10.1 L737 | Offers Task_R of Proc-review (wrong effective ownership), StartEvents (outside targetTypes), or sorts the calls after the tasks by label. |
| `fields-055-candidates-locked-field` | §8.3 L657, §8.3 L653, §10.1 L737 | Offers candidates for a field whose mutability predicate is false. |
| `fields-056-candidates-hidden-field` | §8.3 L657, §8.3 L653, §10.1 L737 | Offers candidates for a field whose visibility predicate is false. |
| `fields-057-candidates-not-reference` | §8.3 L657, §10.1 L737 | Lists elements for a text widget as if it were a reference field. |
| `fields-058-candidates-negative-offset` | §8.3 L657, §2.4.1 L189, §10.1 L737 | Clamps a negative offset to zero instead of refusing invalid paging. |
| `fields-059-candidates-fractional-limit` | §8.3 L657, §2.4.1 L189, §10.1 L737 | Truncates a fractional limit to 1 instead of refusing invalid paging. |
| `fields-060-candidates-boolean-limit` | §8.3 L657, §2.4.1 L189, §10.1 L737 | Coerces the Boolean limit true to 1 (JavaScript Number(true)) and returns one candidate instead of refusing invalid paging. |
| `fields-061-candidates-unknown-target` | §8.3 L657, §2.2 L132, §10.1 L737 | Answers candidates (for example every Process) for a target handle that names no element instead of refusing it. |
| `fields-062-candidates-stale-revision` | §8.3 L657, §10.1 L737 | Answers from the current state although the caller's baseRevision is stale (candidates must match the revision they are offered for). |
| `paste-001-copy-task` | §8.3 L657, §10.1 L737 | Copies through a mutating command (revision, history or event changes), or drops the source ID needed for remapping. |
| `paste-002-copy-group` | §8.3 L657, §10.1 L737 | Orders fragment elements by request order or UTF-16 ID instead of source document pre-order. |
| `paste-003-paste-task` | §8.3 L653, §2.4 L174, §3.2 L288, §3.2 L276, §3.2 L278–L282, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Keeps the copied ID (duplicate Task_A), suffixes it (Task_A_1), uses an upstream random ID, or allocates with the containment-property slot instead of the D6 paste slot. |
| `paste-004-paste-gesture` | §8.3 L657, §8.2 L637, §8.2 L632, §8.2 L633 | Routes keyboard paste through upstream copy-paste (separate authority) instead of the canonical paste surface. |
| `paste-005-paste-group` | §8.3 L653, §2.4 L174, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Leaves the pasted flow pointing at the original Task_A/Task_B (no internal remap), or downgrades the pasted UserTask to Task. |
| `paste-006-paste-reference-shared-store` | §8.3 L653, §4.4 L408, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Duplicates the root DataStore for the pasted reference, or drops the valid external dataStoreRef. |
| `paste-007-paste-cross-document-dangling` | §8.3 L653, §2.2 L132, §8.2 L633, §10.1 L735, §10.1 L739 | Pastes the reference with a dangling dataStoreRef, or silently drops the reference/creates a store, instead of refusing the invalid external reference. |
| `paste-008-paste-batch-one-pass` | §8.3 L653, §8.2 L631, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Runs C/lint/N once per pasted element (duplicated findings or two history entries) instead of once for the batch. |
| `paste-009-paste-into-task` | §8.3 L649, §8.2 L633, §10.1 L735, §10.1 L739 | Pastes into a non-container owner through the programmatic path. |
| `paste-010-cut-reference` | §8.3 L653, §8.3 L657, §8.2 L632, §8.2 L633 | Cuts without removing the dependent reference link (orphan shell), or copies the link although it was not selected. |
| `paste-011-copy-stale-revision` | §8.3 L657, §10.1 L737, §8.2 L629 | Copies from the current state although the caller's revision is stale. |
| `paste-012-copy-unknown-id` | §8.3 L657, §10.1 L737, §2.2 L132 | Returns an empty fragment (or skips the ID) instead of refusing an element ID that names nothing. |
| `paste-013-copy-definitions-root` | §8.3 L657, §10.1 L737, §2.4 L174 | Copies the whole Definitions root, which no paste owner can contain. |
| `paste-014-paste-then-edit-same-batch` | §8.3 L653, §8.2 L631, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Validates the second command against the pre-batch state (the pasted ID is unknown) instead of the stage left by the paste, or records two history entries. |
| `paste-015-paste-call-keeps-evidence` | §8.3 L653, §4 L356, §3.2 L288, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Drops the ID-less Documentation evidence of the copied call, assigns an ID to it, or drops the valid internal calledElement reference. |
| `navigation-001-index` | §8.1 L623, §9.1 L667 | Builds the index from diagram names or omits repeated views of the same Process; entries must be exactly {diagramId, semanticRootId, processId?, label, order} in page order. |
| `navigation-002-single-view` | §8.1 L623, §8.1 L612 | Navigates by the call name or a section number (legacy resolver) instead of calledElement→Process→view, or changes the semantic/view revision when switching pages. |
| `navigation-003-chooser` | §8.1 L623, §8.1 L612 | Opens the first diagram found (or the lowest diagram ID page-review-a) instead of offering a chooser ordered by view order (Review B, order 2, before Review A, order 3). |
| `navigation-004-current-view-preferred` | §8.1 L623, §8.1 L612 | Ignores that the current view already displays the target and opens page-review-b (lower order) or offers a chooser. |
| `navigation-005-explicit-diagram` | §8.1 L623, §8.1 L612 | Ignores the caller-supplied diagram ID and opens page-review-b (first in view order). |
| `navigation-006-view-missing-no-name-fallback` | §8.1 L623, §8.1 L612 | Falls back to the page whose name equals the call name ("Révision cycle") although calledElement is ProcArchive, which has no view. |
| `navigation-007-incomplete-call` | §8.1 L623, §8.1 L612, §4.1 L379 | Resolves an absent calledElement by name or opens the first page; an absent target has no Process to resolve. |
| `navigation-008-explicit-diagram-not-a-view` | §8.1 L623, §8.1 L612 | Opens a caller-supplied diagram that displays another Process (page-detail shows Proc_main) because the explicit ID is not validated against the called Process. |
| `navigation-009-missing-process` | §8.1 L623, §8.1 L612 | Answers navigation-view-missing (or offers view creation) for a calledElement that names no Process; DESIGN distinguishes a missing Process (reference-dangling). |
| `static-001-preview-surface` | §12.1 L876, §8.1 L619 | Mounts a full modeler for the preview (palette/context pad, keyboard edits commit), or accepts onChange/onExportResult on the read-only preview. |
| `static-002-no-normalize` | §8.1 L619, §3.3 L296 | Runs C on load in the static view (adding isExecutable:false) or otherwise normalizes the source state of a read-only preview. |
| `static-003-multi-page` | §8.1 L621, §9.1 L667, §8.1 L610 | Renders only the first diagram, renders pages by pageId instead of order, or merges repeated views of one Process into a single page. |
| `static-004-metadata-missing-preview` | §3.3 L303, §8.1 L619, §5.2 L442, §10.1 L735 | Activates the standalone tree under the injected profile by guessing, or lets the preview accept edits. |
| `static-005-digest-mismatch` | §3.3 L314, §3.3 L296, §8.1 L604, §10.1 L737 | Accepts the same profile ID/version with a different digest (token-only difference), migrates it silently, commits a partial model before refusing, or echoes the compiled profile's identity instead of the argument's. |
| `static-006-read-only-canvas-mutation` | §8.1 L619, §8.2 L629, §8.2 L633 | Applies the edit (read-only only hides the palette), normalizes the source state, or emits an onChange for the rejected mutation. |
| `workshop-001-get-definitions` | §12.1 L876, §10.1 L737 | Returns legacy XML or a bare envelope instead of Result<DocumentEnvelope>, or a revision different from the loaded one. |
| `workshop-002-input-conflict` | §8.1 L619, §10.1 L735 | Lets one input win (XML or native) when both are supplied for one load. |
| `workshop-003-export-success` | §10.2 L803, §12.1 L876, §8.1 L621, §10.1 L737, §10.1 L753, §9.2 L690 | Uses the legacy byte-or-throw export callback, calls the host twice or with an intermediate (pre-release or pre-layout) artifact, drops the report/idMap from the download context, reports a digest that is not the SHA-256 of the bytes, or mutates the document while exporting. |
| `workshop-004-export-unknown-format` | §10.2 L803, §12.1 L876, §8.1 L621, §10.2 L780 | Calls the download callback with an empty or partial artifact, throws instead of returning the refusal, runs the pipeline before validating the format (harmonization C18), or falls back to another format. |
| `workshop-005-preview-tool` | §12.1 L876 | Routes the native preview through the legacy XML overload (serialize/reparse) or invokes host callbacks from the read-only preview. |
| `workshop-006-onchange-final-only` | §8.2 L633, §8.1 L606, §8.1 L619, §8.1 L621 | Forwards raw bpmn-js commandStack.changed notifications (several per gesture) to the host onChange, or saves to the backend automatically. |
| `theme-001-switch-view-only` | §3.1 L264, §9.2 L690, §9.2 L694, §8.2 L643, §13 L928, §8.1 L606 | Replays native history or records an undo entry for the theme switch, changes profileIdentity/semanticRevision, or recomputes theme-specific geometry (geometry: shared). |
| `views-001-select-repeated-occurrence` | §8.1 L610, §8.1 L612 | Stores the selection by semantic ID (selecting both repeated occurrences, or the page-main one), or changes the view revision on selection. |
| `views-002-rename-shared-element` | §8.2 L643, §8.1 L610, §9.1 L673, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Updates only the selected page's occurrence, loses the page-detail selection, or creates one history entry per page. |
| `views-003-delete-shared-edge` | §8.2 L643, §9.1 L673, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690 | Removes the edge occurrence from the active page only, leaving a stale occurrence of a deleted semantic element on page-detail. |
| `views-004-palette-on-repeated-view` | §8.1 L610, §8.2 L643, §9.1 L667, §8.2 L637 | Places the new shape on page-main (first view of the Process), on every view of the Process, or derives the owner from the page name instead of the page semantic root. |
| `views-005-multi-page-rollback` | §8.2 L643, §2.4 L172, §8.2 L639, §8.2 L633, §10.1 L735, §10.1 L739 | Rolls back the refused batch on the active page only, leaving Flow_2 removed from page-detail, or commits the first deletion. |
| `presentation-001-drag-move-di-only` | §8.2 L637, §8.2 L630, §3.1 L268, §8.2 L641, §8.2 L639 | Skips the DI-only drag because semanticRevision is unchanged, records no history entry, moves other shapes, or writes a semantic change. |
| `presentation-002-resize-di-only` | §8.2 L637, §8.2 L630, §3.1 L268, §8.2 L641, §8.2 L639 | Treats the resize as a no-op (no history entry), changes the semantic tree, or rescales other occurrences. |
| `presentation-003-label-move-di-only` | §8.2 L637, §8.2 L630, §3.1 L268, §8.2 L641, §8.2 L639 | Moves the event shape with its label, re-routes Flow_1, or drops the label move because no semantic field changed. |
| `presentation-004-bendpoint-di-only` | §8.2 L637, §8.2 L630, §3.1 L268, §8.2 L641, §8.2 L639 | Commits the bendpoint through upstream modeling as a second history entry, re-routes other edges, or drops the change because the semantic tree is unchanged. |
| `presentation-005-reconnect-disabled` | §8.2 L635, §8.2 L637 | Lets upstream bpmn-js reconnect Flow_3 to Task_X directly (a semantic change outside the profile adapter). |
| `presentation-006-drag-cancelled` | §8.2 L637, §8.2 L633, §8.2 L639 | Commits the preview geometry of a cancelled drag, records a history entry, or emits an onChange. |
| `lifecycle-001-not-loaded` | §10.1 L737, §10.1 L735, §8.1 L604 | Fabricates an empty document or the profile's identity for the not-loaded state, or throws instead of returning the refusal union. |
| `lifecycle-002-dispose` | §8.1 L599, §8.1 L604, §8.1 L606 | Keeps answering getters from the disposed model, rejects the Promise, or lets a late command commit after disposal. |
| `lifecycle-003-activation-descriptor-mismatch` | §8.1 L617, §8.1 L615, §10.1 L735 | Activates a compiled profile whose descriptor pins differ from the canvas descriptor context, reinterprets the canvas context with the variant descriptors, or replaces the loaded document. |
| `history-001-refusal-leaves-no-entry` | §8.2 L633, §8.2 L641, §3.1 L268, §10.1 L735 | Pushes a history entry (or partial state) for the refused delete, so that the first undo restores the rename's after-state instead of the input; or undo/redo emit no or several events, or carry lint entries. |
| `history-002-noop-leaves-no-entry` | §8.2 L641, §8.1 L606 | Records the identical second submission as a history entry, so one undo leaves the renamed state, or emits an event for the no-op. |
| `history-003-entry-point-chain` | §8.2 L632, §8.2 L641, §8.3 L649, §8.3 L651, §3.2 L276 | Recomputes IDs or reruns C/N on redo, merges two entry points into one undo step, splits one entry point into several, truncates redo during undo, or replays the replacement with a different ID. |
| `history-004-insertion-key-reuse` | §3.2 L288, §8.3 L655 | Suffixes or re-randomizes the colliding allocated ID (a second task appears) instead of refusing id-collision. |
| `history-005-paste-key-reuse` | §3.2 L288, §8.3 L653 | Pastes a second copy by suffixing IDs when the same transaction-scoped insertion key is replayed. |
| `history-006-theme-switch-keeps-history` | §3.1 L264, §8.2 L643, §9.2 L694 | Clears or replays native history on a theme switch, treats the theme switch as an undo step, or restores the previous theme on undo. |
| `history-007-multi-page-undo` | §8.2 L643, §8.2 L641 | Restores the deleted edge on the active page only (multi-page operations stage and roll back all affected pages together). |
| `history-008-stale-base-revision` | §8.2 L629, §3.1 L268, §8.2 L633, §10.1 L735, §10.1 L739 | Applies the command to the current state although the caller staged it against another revision (last writer wins). |
| `history-009-stale-view-revision` | §8.2 L629, §8.1 L587, §8.2 L633, §10.1 L735, §10.1 L739 | Ignores expectedViewRevision (only the semantic revision is checked), committing over a presentation the caller has not seen. |
| `history-010-undo-redo-guards` | §8.1 L595, §8.1 L596, §8.2 L629 | Undoes the last entry although the caller's expected revision is stale, moves the cursor on a refused redo, or returns an ok no-op for an empty history. |
| `history-011-restore-starts-epoch` | §8.2 L643, §8.1 L594, §8.1 L612 | Keeps the pre-restore history so undo reverts into the replaced document, or recomputes the restored layout. |
| `history-012-empty-batch-noop` | §8.2 L641, §10.1 L735 | Runs C/N on an empty batch (completion writes or lint entries), records a history entry, or emits an event. |
| `workshop-007-export-after-edit` | §10.2 L803, §8.1 L621, §12.1 L876 | Exports a stale artifact (the pre-edit revision, a cached preparation or the old name) instead of the final committed state. |
| `workshop-008-export-blocked-unnamed` | §10.2 L803, §6.2 L478, §6.2 L481, §16 L1144, §12.1 L876 | Downloads the draft state with warnings (export barrier bypassed), calls the host with a partial artifact, reports the post-normalize entry or no entry, or blocks the later export of the named state. |
| `workshop-009-correction-final-only` | §8.2 L631, §8.2 L633, §7.1 L543, §10.1 L764, §10.2 L803, §8.1 L606 | Emits one onChange for the user command and another for the completion correction, exposes the uncorrected intermediate envelope, omits the correction entry, or downloads the uncorrected state. |
| `fields-063-commit-time-invalidation` | §8.3 L657, §2.4 L166 | Trusts the candidate list of the earlier revision and commits a reference to the deleted Task_X. |
| `twin-001-assignable-rule-user-task` | §2.3 L143, §1.1 L32, §14.3 L963, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | A twin whose assignable typeIs degrades to exact matching on plain native JSON omits the UserTask finding; the twins must produce identical envelopes and reports. |
| `gates-001-panel-dependency-absent` | §8.3 L661, §13 L925, §16 L1148 | Adds bpmn-js-properties-panel (or its base package) as a runtime/peer dependency or bundles it into the root/static/browser entry points before the owner selects the panel. |
| `gates-002-external-call-gated` | §8.3 L651, §4.1 L364, §13 L910, §16 L1140, §8.2 L633, §10.1 L735, §10.1 L739 | Creates a CallActivity (with or without a guessed marker) although external creation is gated by OPEN-EXTERNAL, or refuses with a non-gate code. |
| `gates-003-reserved-n-creation` | §7.2 L554, §13 L917, §16 L1160, §8.2 L631, §8.2 L633, §10.1 L735, §10.1 L739 | Creates the Collaboration support during an edit although OPEN-RESERVED-N is open, commits the rename without N, or reports the post-normalize entry. |
| `gates-004-reserved-n-reuse` | §7.2 L552, §5.2 L440, §5.1 L430, §8.2 L632, §8.2 L633, §8.2 L641, §8.1 L606, §10.1 L735, §10.1 L739, §9.2 L690, §10.1 L751, §6.2 L474, §6.4 L515 | Refuses profile-open although the support already exists and is bound, re-creates or renames the bound Collaboration, or drops the binding. |
| `demo-001-acceptance-script` | §14.2 L954, §8.3 L649, §8.3 L651, §8.3 L653, §8.2 L632, §8.2 L641, §10.2 L803, §2.4 L163 | Any upstream shortcut in the demo path: random IDs, DataInputAssociation for the reference link, an in-place retype keeping the task ID, more than one history entry per gesture, intermediate reports, or a download of a non-final state (the stale name Review request). |
| `py-compile-enum-duplicate-records` | §8.3 L655 | Two identical choice records violate the pinned schema uniqueItems keyword, so load refuses profile-schema before compilation. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-enum-duplicate-values` | §2.4.1 L195 | Two choices with different names share the JSON value One; schema uniqueItems accepts the distinct records and the compiler refuses profile-type (CR-10 arbitration: DESIGN names no code for the enum clause and the frozen lot-0 case s2b-cr10-enum-values decides). A compiler that accepts the profile, or reports the repeated value as profile-ui-parameters, fails. |
| `py-compile-enum-empty-choices` | §8.3 L655 | The link direction enum field (notion index 6) gets an empty choices array; the pinned schema conditional rejects it before compilation, so load refuses profile-schema. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-field-parameter-missing` | §8.3 L655, §2.4.1 L195 | The task name field keeps its rename command but loses the value->name binding; rename's required name parameter is unsupplied, so compilation refuses profile-ui-parameters. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-grid-l5-ok` | §2.4.1 L195, §8.3 L655, §10.1 L737 | The composed grid fixture compiles: its three UI entries and two fields bind every required parameter exactly once and every label and validation message has text for policies.localeFallback (en). Parity sync PS-35 (DESIGN §10.1 L737: PureResult success is exactly {status, payload, diagnostics}): the outcome is {status ok, payload, empty diagnostics} whose payload, the CompiledProfile (no wire shape), is unsealed as compiled-profile; the compiled profile identity of the committed profile bytes is sealed separately as expected.compiledIdentity (parity role compiled-identity). The identity values are unchanged. |
| `py-compile-id-not-ordinary-input` | §8.3 L653, §2.4 L165, §2.4.1 L206 | A recipe that sets /id on its target is added; an existing ID is never writable, so compilation refuses profile-producer (the code of the executable design checker for an id mutation). Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-message-missing-fallback` | §8.3 L659 | A message with only an fr text is added while policies.localeFallback is en; the DESIGN names no code, so the lot-5 binding uses the CR-05 missing-symbol code profile-symbol (DESIGN L190). Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-mutable-without-command` | §8.3 L659 | The mutable task name field loses its command; the schema requires command and parameters for a non-readonly field whose mutable predicate is not literally false, so load refuses profile-schema. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-mutable-without-parameters` | §8.3 L655 | The mutable task name field loses its parameters array; the schema refuses profile-schema. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-neutral-l5-ok` | §2.4.1 L195, §8.3 L655, §8.3 L659, §10.1 L737 | The composed neutral fixture satisfies CR-10: every UI entry and field binds each required recipe parameter exactly once with a type-compatible source (owner/target/source->element, value->string, key->string), the enum field has three distinct values, reference fields have targetTypes, the readonly field omits command and the immutable reference field (mutable op false) may omit command. Parity sync PS-35 (DESIGN §10.1 L737: PureResult success is exactly {status, payload, diagnostics}): the outcome is {status ok, payload, empty diagnostics} whose payload, the CompiledProfile (no wire shape), is unsealed as compiled-profile; the compiled identity, equal to the fixture identity, is sealed separately as expected.compiledIdentity (parity role compiled-identity). The identity values are unchanged. |
| `py-compile-readonly-with-command` | §8.3 L655, §8.3 L659 | The readonly note text field (notion index 2) receives command rename; the schema conditional refuses profile-schema. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-reference-empty-target-types` | §8.3 L655 | The reference store field (notion index 3) gets targetTypes []; the schema conditional refuses profile-schema. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-ui-icon-unknown-glyph` | §8.3 L655, §2.4.1 L190 | task-create names glyph missing-glyph, absent from theme plain, so compilation refuses profile-symbol. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-ui-label-unknown-message` | §2.4.1 L190 | task-create refers to an undefined message label.unknown, so compilation refuses profile-symbol. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-ui-parameter-duplicate` | §2.4.1 L195, §8.3 L655 | task-create binds key twice; a parameter supplied twice refuses profile-ui-parameters. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-ui-parameter-missing` | §2.4.1 L195, §8.3 L655 | The value->name binding of task-create is removed; required create-task parameter name is no longer supplied, so compilation refuses profile-ui-parameters. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-ui-parameter-source-type` | §2.4.1 L195, §8.3 L655, §2.1 L81 | The element parameter owner of task-create is bound from source value (a scalar), so the binding is ill-typed and compilation refuses profile-type (CR-10 arbitration: §8.3 L655 names profile-ui-parameters for missing or duplicate parameters only; §2.1 L81). A compiler that accepts the profile, or reports the ill-typed binding as profile-ui-parameters, fails. |
| `py-compile-ui-parameter-unknown` | §2.4.1 L195, §8.3 L655 | task-create binds a name extra that create-task does not declare; an undeclared parameter binding refuses profile-ui-parameters. Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-upstream-duplicate-across-entries` | §8.3 L659 | UI entry Zeta-task (index 2) is changed to list create.task, already listed by task-create. One upstream ID then maps to two entries; the DESIGN names no code, so the lot-5 binding uses the CR-05 namespace-uniqueness code profile-symbol (DESIGN L190). Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-compile-upstream-duplicate-within-entry` | §8.3 L659 | task-create lists create.task twice; the same upstream ID maps twice, which is a duplicate mapping (schema upstreamEntries has no uniqueItems, so the compiler refuses with profile-symbol). Seal fix round: the outcome is the complete PureResult refusal (empty diagnostics) of loading and compiling the committed profile bytes of input.profile.artifact. |
| `py-copy-fragment-preorder` | §8.3 L657 | Process_1 holds artifacts [Note_Z, Note_A] and flowElements [Task_1]. copy of [Note_A, Task_1, Note_Z] returns the elements in source document pre-order, not in UTF-16 ID order: the pre-order walks the canonical (profile-c14n/2) document, an element before its descendants, members in UTF-16 key order (artifacts before flowElements) and arrays by index, so the fragment is [Note_Z, Note_A, Task_1]. copy of [Task_1, Process_1] drops Task_1, which is contained in the requested Process_1, and returns the Process_1 subtree with property rootElements. |
| `py-copy-fragment-read-only` | §8.3 L657, §10.1 L737 | copy of [Link_1, Aid_1, Aid_1] returns one fragment whose elements are deduplicated and in source document pre-order (Aid_1 at artifacts index 0 before Link_1 at index 1; harmonization B20), each a deep copy with its containment property; the snapshot is unchanged and no history entry exists. |
| `py-copy-unknown-id` | §8.3 L657, §2.2 L132 | copy of a missing ID refuses reference-dangling; a stale baseRevision refuses operation-error (lot-5 stale binding, harmonization C10). |
| `py-create-append-task` | §8.3 L649, §2.4 L163, §2.4 L166 | task-append from Task_1 (key a1, value Next) creates bpmn:Task stable-id/1(Process_1, task, a1) named Next and a bpmn:Association stable-id/1(Process_1, append-link, a1) from Task_1 to the new task with direction One, both appended to their containment arrays. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-create-reference-then-connect` | §8.3 L651, §4.4 L408 | store-create (value Ledger) creates a root bpmn:DataStore named Ledger with stable-id/1(Definitions_1, store, s1) and an unnamed bpmn:DataStoreReference in Process_1 with stable-id/1(Process_1, reference, s1) whose dataStoreRef is assigned natively. The upstream connect gesture from that reference to Task_1 resolves to reference-link and appends one bpmn:Association (link recipe, direction None) to Process_1.artifacts; no DataInputAssociation or port is created on Task_1. Both reports are empty of entries (no C write, named task, standard rules off). |
| `py-create-task-palette-grid` | §8.3 L649, §7.1 L538, §3.2 L284 | The grid task-create creates a bpmn:ServiceTask with the same stable-id/1(Process_1, task, k1) as the neutral case; C applies the grid default and sets isExecutable from false to true (one complete/set entry, before false, after true), the opposite of the neutral profile. |
| `py-create-task-palette-neutral` | §8.3 L649, §2.4 L163, §3.2 L276, §3.2 L278–L282, §8.2 L631, §10.1 L739 | Palette task-create (I3 surface command) with owner Process_1, key k1 and value Draft runs create-task on the stage: one bpmn:Task with ID stable-id/1(Process_1, task, k1) and name Draft is appended to Process_1.flowElements. C (complete, mode retained, activation edit) then runs the neutral complete-process recipe on the stage and resets isExecutable from true to false: one Report/2 entry complete/set (info, repairable, corrected, ruleId complete-process, source and result at /rootElements/0/isExecutable, before true, after false; harmonization B8/B9). Both draft lint stages find nothing (names nonempty, standard rules off); N only places tasks. The payload echoes transactionId and changed=true; the report header carries source/target identity and input/output revisions (harmonization B4). |
| `py-delete-includes-dependents` | §8.3 L653, §2.4 L171 | aid-delete removes Aid_1 together with its declared dependents: Link_1 (Aid_1 as source) and Link_2 (Aid_1 as target). Note_1 and Link_3, which do not touch Aid_1, survive unchanged. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-delete-refuses-dependents` | §8.3 L653, §2.4 L171 | task-delete on Task_1 (target of Link_1) with refuseIfReferenced refuses reference-dangling (lot-5 code binding); no orphan edge can appear and nothing changes. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-delete-unreferenced` | §8.3 L653, §2.4 L171 | task-delete on the unreferenced Task_2 removes it; every other element keeps its ID and position. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-field-clear-optional-reference` | §8.3 L659, §2.4 L166 | The context entry store-clear runs clear-store (assignRef mode remove of the current store) on Ref_1: the single-valued dataStoreRef property is absent afterwards (not null, not empty) and both reference fields read present false, without display and value. |
| `py-field-display-edit-grid` | §8.3 L655, §2.2 L116 | The grid aid body field displays case-upper(stripPrefix(text, [Note] plus space)): stored [Note] straße displays STRASSE (full mapping expands ß) while value stays the stored text. Editing the body with neu stores [Note] neu and displays NEU; the stored text never receives the display casing. |
| `py-field-display-prefix-exact` | §2.2 L115, §8.3 L655 | [Aid]helper is recognized as aid (recognition prefix [Aid]) but the display prefix is [Aid] with a space; it does not match, so the display is the unchanged stored text, equal to value. |
| `py-field-edit-restores-marker` | §8.3 L653, §8.3 L655 | The body field of Aid_1 (I3 field command, notion aid) is submitted with updated; its edit-aid recipe stores [Aid] updated (marker once). The display afterwards is updated and value [Aid] updated; Link_1 and the other elements are unchanged. |
| `py-field-empty-string-explicit` | §8.3 L659 | Submitting the task name field with the empty string stores name equal to the empty string (the property is present, not removed); both draft subrules then observe Task_1 (warn, readiness, source /rootElements/0/flowElements/0) without blocking, and the field reads present with display and value empty. |
| `py-field-enum-validation` | §8.3 L659, §8.3 L655 | check_field reports Sideways (not a choice value) and one (a choice name, not its value) invalid with the code the submit returns, profile-type, and the field validation message key; the submit of Sideways is refused. One is valid on change and on submit, and sets associationDirection to One. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-field-listing-widgets` | §8.3 L653, §8.3 L655, §8.3 L659 | Fields of the recognized notion of each target: task name (text); aid body (multiline, display stripPrefix removes [Aid] plus space once while value is the stored text); the plain note text (readonly, never mutable); reference store and store-view (reference widgets display the stored ID; store-view has mutable false) while store-hint is hidden because Ref_1 has no name; link direction (enum with its choices). Every listed field carries value, the raw stored value, iff present (harmonization B18). Service_1 and Store_1 have no fields. |
| `py-field-not-editable` | §8.3 L653, §8.3 L659, §8.3 L649 | store-view (mutable false), store-hint (hidden: Ref_1 has no name), the readonly note text and the aid body of Aid_2 (mutable predicate false for [Aid] locked) are not editable: check_field reports profile-producer and each submit refuses profile-producer (harmonization C7). The aid body lists mutable false; nothing changes. |
| `py-field-reference-submits-ids` | §8.3 L659, §8.3 L657 | The store field of Ref_1 accepts the ID Store_2. Submitting the label Ledger is not an ID of any element (reference-dangling) and submitting Task_1 is not an admitted target type (profile-type); both refuse and the accepted assignment stays. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-field-unknown` | §2.4.1 L190, §8.3 L655 | Field commands name their notion (harmonization I3). The field nope is not declared by notion task and the notion nope does not exist: both refuse profile-symbol. The aid field body exists but Task_1 is not recognized as aid: the target handle has the wrong recognized notion, profile-type (lot-5 binding). A missing target refuses reference-dangling. |
| `py-field-value-omitted-or-coerced` | §8.3 L659 | A field command whose context lacks value lacks the bound value source (profile-ui-parameters). The values null, 5 and true are not coerced to the string parameter and refuse profile-type. Nothing changes. |
| `py-field-visible-predicate` | §8.3 L653 | With a local name override on Ref_1 the store-hint field becomes visible (present(read /name)) and editable; submitting Branch renames the reference without touching its store. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-gate-external-creation` | §8.3 L651, §4.1 L364, §13 L910, §16 L1140 | The generic library has no external-call branch; the fixture gates its external entry with a refuse step (code profile-open, harmonization H4). The command refuses profile-open atomically and creates nothing. |
| `py-gate-reserved-n-creation` | §7.2 L554, §13 L917, §16 L1160 | The fixture profile plus the vendored support recipe ensure-supports: aid-create on Process_A (no supports) stages a valid edit, but N, which apply_commands always runs with activation edit (harmonization H1, H2), would create five support objects and bindings. Support creation by an edit stays disabled while the OPEN-RESERVED-N technical gate is open, so N refuses profile-open, the code passes through and nothing is created; the pre-normalize stage found nothing, so the report is entry-free. |
| `py-gate-reserved-n-reuse` | §7.2 L552, §5.2 L440 | With the five imported supports already bound (vendored support case imported support IDs survive), N reuses them and persists no new support or binding (reuse is never gated), so the same aid-create edit commits; bindings are unchanged and the report has no entry. |
| `py-history-batch-one-step` | §8.2 L632, §8.2 L641 | One batch of three commands (task-create k2, rename Task_1 to B, aid-create a2) is accepted as one transaction: a single undo restores the initial snapshot and a single redo restores the after-state. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-history-change-events` | §8.2 L633, §8.2 L641, §8.1 L606 | A listener registered after activation receives exactly three events: the accepted batch (origin command, tx-1), its undo (origin undo) and its redo (origin redo), the latter two carrying the transactionId of the history step; each event carries the report of its operation result. The refused batch and the no-op batch emit no event. |
| `py-history-load-epoch` | §8.2 L643, §8.1 L584 | After one accepted batch, set_definitions loads the initial document again: the load starts a new epoch, so undo has nothing to undo (operation-error) and the loaded envelope is current. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-history-noop-no-entry` | §8.2 L641 | Renaming Task_1 to A twice: the second batch and an empty batch succeed with changed=false and the unchanged revision, envelope and snapshot (baseRevision = revision, report inputRevision = outputRevision); they add no history step, so one undo returns to the initial state and a second undo has nothing to undo. |
| `py-history-refusal-preserves-state` | §8.2 L633 | After one accepted batch, a batch whose first command renames Task_1 to Z on the stage and whose second command names an unknown entry is refused profile-symbol after the stage was modified: the stage is discarded, the refusal echoes the committed revision with an entry-free report (no lint stage ran), the snapshot stays byte-identical and no history step is added: one undo returns to the initial snapshot and redo returns to the accepted state. |
| `py-history-restore-bindings-presentation` | §8.2 L632, §8.2 L641, §7.2 L565, §8.1.1 L610 | The vendored support case with imported support IDs (Process_A, its lane set with the empty external lane, the Collaboration with main participant and reference band, five bindings) is loaded with an archived importedDi record showing the two participants (descriptorDigest = H of the lot-5 descriptor pins sorted by id, sha256 = H({descriptorDigest, diagrams})). lane-delete (delete surface, explicit deletion intent) removes the empty external lane: its containment array lanes becomes the empty array (kept, harmonization F1) and the binding targeting it is removed with it, leaving four bindings; the report has no entry. Undo restores a snapshot byte-identical to the one before the batch, including the five bindings, the lane with its original ID and the presentation with the archived importedDi; redo restores the after-state byte-identically. |
| `py-history-stale-revisions` | §8.2 L629, §3.1 L268 | A stale baseRevision and a stale expectedViewRevision both refuse before staging; with a stale revision an otherwise invalid command still reports the stale refusal (revision checks precede command checks). The DESIGN names no code; the lot-5 binding keeps the existing bridge code operation-error (harmonization C10), echoing the committed revision, not the stale argument. The document stays editable. |
| `py-history-undo-redo-guards` | §8.1 L595–L596, §8.2 L629 | undo and redo with a stale expectedRevision or expectedViewRevision refuse operation-error and keep the history cursor: the following guarded undo and redo still succeed. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-history-undo-redo-roundtrip` | §8.2 L641, §8.1 L595–L596 | Two accepted batches give two history steps. Undo, undo restore snapshots byte-identical (profile-c14n/2, presentation and viewRevision included) to the states after the first batch and the initial state; each undo result has baseRevision = the revision before the restoration and revision = the restored one, with an entry-free report (no recipe, C, N or lint runs). A third undo refuses operation-error (nothing to undo, harmonization C10). Redo, redo restore the two after-states, the redo stack is not truncated by undo, and a third redo refuses operation-error. |
| `py-io-set-explicit-selection` | §8.3 L651, §7.1 L547, §8.3 L653 | One batch creates the same DataInput and then selects Set_2 explicitly (input-select-set, source = the new ID). C runs once after the whole batch, finds no uncovered input and accepts: the input is appended to dataInputs and to Set_2.dataInputRefs only; Set_1 keeps its membership. A per-command C would have refused the intermediate state. |
| `py-io-set-selection-required` | §8.3 L651, §7.1 L547 | input-create adds DataInput stable-id/1(Process_1, input, in-2) covered by no InputSet while Process_1 has two InputSets. The fixture complete recipe complete-io-selection refuses io-set-selection-required during C on the stage; the code passes through unchanged, no lint stage ran (diagnostics = report.entries = []), the whole batch is discarded, the tree is unchanged and no history entry exists. |
| `py-l10n-resolution-order` | §8.3 L659 | label.store has en and fr texts: fr is exact; de, fr-CA (no BCP 47 truncation) and FR (case-sensitive) fall back to en; label.aid has only en; label.note de is exact; a key that is not a profile message (a library diagnostic key) resolves to the key itself. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-lifecycle-activation-descriptor-mismatch` | §8.1 L617 | The bridge is created with the vendored neutral descriptor package (version fixture-2) while the fixture profile pins the lot-5 descriptor package. Loading the envelope succeeds, activation refuses descriptor-mismatch (echoing the loaded identity and revision, harmonization B3) and the loaded envelope stays current and unchanged. |
| `py-lifecycle-dispose` | §8.1 L599, §8.1 L604 | dispose returns ok with payload disposed=true; afterwards every getter, command, history call, query and a second dispose refuse canvas-disposed, without echoed identity or revision. |
| `py-lifecycle-not-loaded` | §10.1 L737, §8.1 L589 | A bridge without a loaded document refuses getters, activation, commands and queries with document-not-loaded; Result refusals omit profileIdentity and baseRevision (and the report omits sourceIdentity and inputRevision). |
| `py-lint-draft-integrity-refused` | §6.2 L474, §6.2 L481, §8.2 L631, §8.2 L633 | Profile fixture-profile-neutral-lint keeps the vendored validation records. The palette batch of the former create-task-palette-neutral witness (Process_1 holding only Task_1, task-create key k1 value Draft) stages a second unconnected bpmn:Task. C writes nothing; the pre-normalize draft stage evaluates the upstream rules on the C output (bpmnlint 11.15.0 sources: a bpmn:Task without incoming and outgoing sequence flows is reported by no-disconnected, no-implicit-start and no-implicit-end; a Process without StartEvent and EndEvent by start-event-required and end-event-required; label-required and every other recommended rule find nothing; the profile subrule finds no unnamed task). Policy rows: the three connectivity rules error/integrity, the two event rules warn/readiness. An integrity error is never downgraded in draft and is not repairable, so the batch refuses at pre-normalize, before N, with the code of the first unresolved error entry in profile-report/2 order: ruleIds sort end-event-required < no-disconnected < no-implicit-end < no-implicit-start < start-event-required and the Task_1 pointer precedes the new task pointer, so the code is bpmnlint/no-disconnected (harmonization J1, C19). The refusal is atomic: report and diagnostics carry the eight pre-normalize entries (observed, source = the stage element pointer, result unavailable), the tree, IDs and history are unchanged. rawStandardFindings is unsealed (raw upstream transport). |
| `py-lint-draft-warnings-commit` | §6.2 L474, §16 L1144, §10.1 L739 | Same vendored validation. Process_1 has no flow node; aid-create (key w1, body note) adds one TextAnnotation. C writes nothing; each draft stage reports start-event-required and end-event-required on Process_1 (warn/readiness; no connectivity rule applies without flow nodes, a TextAnnotation is not checked by label-required); N writes nothing. Warnings never block a draft edit, so the batch commits with the four observed entries in profile-report/2 order (stage pre-normalize before post-normalize, then ruleId). rawStandardFindings is unsealed (raw upstream transport). |
| `py-lint-noop-correction-report` | §8.2 L641, §10.1 L739 | Task_1 already has the empty name. Renaming it to the empty string again stages no difference: the full pipeline still runs C, both draft lint stages and N, the result is changed=false with the unchanged revision, and its report carries the two observed task-named entries of Task_1 (the correction notice) while no history entry and no change event are produced. |
| `py-lint-post-normalize-error-blocks` | §6.2 L481, §6.2 L474, §10.1 L735 | The quiet fixture with one changed policy row: profile:task-named in the post-normalize draft record becomes error/integrity while profile:task-named-pre-normalize stays warn/readiness. task-create with key kp and the empty value stages an unnamed bpmn:Task: the pre-normalize stage observes it with a warning (no block), N writes nothing, the post-normalize stage reports task-named as an unresolved error, so the batch refuses with the rule's own code task-name-missing (first unresolved error entry in profile-report/2 order, harmonization C19). Report and diagnostics hold both stage entries; nothing is committed. |
| `py-paste-batch-one-step` | §8.3 L653, §8.2 L631–L632, §8.2 L641 | The fixture profile plus the normalize recipe guard-duplicate-aid (N refuses any TextAnnotation other than Aid_1 whose text is [Aid] helper). One batch pastes [Aid_1] with key p4 and edits the body field of the remapped ID to copied: the state after the paste alone would make N refuse (see paste-normalize-refused), the final staged state does not, and C and N run once after the whole batch, so the batch commits. Later commands of the batch see the staged paste. The result is one history step; undo restores the initial snapshot. |
| `py-paste-dangling-external-refused` | §8.3 L653, §2.2 L132 | Link_1 is copied, then aid-delete removes Aid_1 and Link_1 (artifacts becomes the empty array, kept per harmonization F1). Pasting the fragment would keep an external sourceRef to the deleted Aid_1, so the paste refuses reference-dangling and the tree stays as after the delete. |
| `py-paste-key-collision` | §8.3 L655, §3.2 L288 | Pasting [Aid_1] twice with key p1 computes the same stable ID twice: the second paste refuses id-collision without suffixing. The same fragment pasted with key p3 gets a distinct ID. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-paste-normalize-refused` | §8.2 L631, §8.2 L633, §10.1 L735 | Same guarded profile; Process_1 also holds Task_3 with an empty name. Pasting [Aid_1] with key p5 alone stages a second [Aid] helper annotation: C accepts, the pre-normalize draft stage observes task-named-pre-normalize on Task_3 (warn, does not block), then N refuses fixture-duplicate-aid (the refuse code passes through unchanged). The refusal echoes the committed identity and revision; its report and diagnostics hold exactly the entries of the lint stage executed before the refusal (harmonization B2), never a change entry; the tree is unchanged. The same paste followed in one batch by an edit of the pasted body to changed commits, with both draft stages reporting Task_3. |
| `py-paste-remap-preserves-external` | §8.3 L653, §3.2 L276 | The fragment [Aid_1, Link_1] is pasted into Process_1 with key p1 (I3 surface command carrying the fragment). Each copied ID X becomes stable-id/1(Process_1, paste, JCS([p1, X])) (harmonization D6); Link_1's internal sourceRef is remapped to the new annotation, its external targetRef Task_2 exists and is preserved. Both copies are appended to artifacts in fragment order. |
| `py-pick-field-states` | §8.3 L657, §10.1 L737 | store-view is visible but not mutable, so no candidate is offered; the text field name of Task_1 is not a reference widget (profile-type); an unknown field refuses profile-symbol; a missing target refuses reference-dangling; a stale baseRevision refuses operation-error. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. Unicode-integrity reseal (spec-seal): Store_9 carries again the decomposed name Cafe + U+0301 (UTF-8 43 61 66 65 CC 81) of the first seal, which the seal fix round had normalized to the precomposed U+00E9; every query keeps its candidate set, and the Store_9 names and labels and every revision follow, H({tree, profileIdentity, bindings}) = 13df756c1123190511223eed736588463baa6623cddb37e4f0204f8db9269095. |
| `py-pick-filter-sort` | §8.3 L657 | The store field admits bpmn:DataStore only: Task_1 (named Archive task) and Ref_1 are excluded. The seven stores sort by UTF-16 code units: Store-x (0x2D) < Store.y (0x2E) < Store_10 < Store_9 (digit order, not natural order) < Store_B < Store_b < store_a (uppercase S before lowercase s). A store without name has label equal to the empty string. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. Unicode-integrity reseal (spec-seal): Store_9 carries again the decomposed name Cafe + U+0301 (UTF-8 43 61 66 65 CC 81) of the first seal, which the seal fix round had normalized to the precomposed U+00E9; every query keeps its candidate set, and the Store_9 names and labels and every revision follow, H({tree, profileIdentity, bindings}) = 13df756c1123190511223eed736588463baa6623cddb37e4f0204f8db9269095. |
| `py-pick-paging-bounds` | §8.3 L657, §2.1 L50 | A negative offset or limit, an unsafe limit 2^53, a Boolean offset and a fractional offset are not safe nonnegative integers; the DESIGN names no code, the lot-5 binding refuses profile-bounds (CR-04 bounds; harmonization B19). Unicode-integrity reseal (spec-seal): Store_9 carries again the decomposed name Cafe + U+0301 (UTF-8 43 61 66 65 CC 81) of the first seal, which the seal fix round had normalized to the precomposed U+00E9; every query keeps its candidate set, and the Store_9 names and labels and every revision follow, H({tree, profileIdentity, bindings}) = 13df756c1123190511223eed736588463baa6623cddb37e4f0204f8db9269095. |
| `py-pick-paging` | §8.3 L657 | offset 2 limit 3 returns the third to fifth candidates of the sorted list; offset 6 returns the last one; offset 7 and offset 100 return none; limit 0 returns none. Paging never changes the order. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. Unicode-integrity reseal (spec-seal): Store_9 carries again the decomposed name Cafe + U+0301 (UTF-8 43 61 66 65 CC 81) of the first seal, which the seal fix round had normalized to the precomposed U+00E9; every query keeps its candidate set, and the Store_9 names and labels and every revision follow, H({tree, profileIdentity, bindings}) = 13df756c1123190511223eed736588463baa6623cddb37e4f0204f8db9269095. |
| `py-pick-query-case-sensitive` | §8.3 L657 | rchive matches Archive, archive box and the astral label (not ARCHIVE); A matches Archive and ARCHIVE only; archive matches archive box only; ARCHIVE matches only Store_B. Results keep UTF-16 ID order. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. Unicode-integrity reseal (spec-seal): Store_9 carries again the decomposed name Cafe + U+0301 (UTF-8 43 61 66 65 CC 81) of the first seal, which the seal fix round had normalized to the precomposed U+00E9; every query keeps its candidate set, and the Store_9 names and labels and every revision follow, H({tree, profileIdentity, bindings}) = 13df756c1123190511223eed736588463baa6623cddb37e4f0204f8db9269095. |
| `py-pick-query-no-normalization` | §8.3 L657 | Precomposed Café (U+00E9) matches only Store_10; the decomposed sequence e + U+0301 matches only Store_9; Cafe matches only Store_9 (its prefix), not the precomposed label; the astral U+1D49C matches only Store-x. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. Unicode-integrity audit (spec-seal): the integration reseal of this case is confirmed by hand derivation (profile-c14n/2 and SHA-256, nothing obtained from an implementation): Store_9 and the second query carry the decomposed UTF-8 bytes 43 61 66 65 CC 81 and 65 CC 81 of the first seal, which the seal fix round had normalized to the precomposed C3 A9 form, and every revision is H({tree, profileIdentity, bindings}) = 13df756c1123190511223eed736588463baa6623cddb37e4f0204f8db9269095. |
| `py-pick-reference-ownership` | §8.3 L657 | The inputs field of Set_A2 offers only the DataInputs of its own Process_A (In_A1, In_A2 in ID order); In_B1 of Process_B is never offered, even for the query First that it also matches (harmonization B19 ownership rule). Submitting In_B1 anyway is refused profile-type at commit; submitting In_A1 appends it to Set_A2.dataInputRefs. |
| `py-replace-dependency-refused` | §8.3 L651, §2.4 L171 | Task_1 is the targetRef of Link_1; the conversion's remove action uses refuseIfReferenced with no declared dependents, so the whole batch refuses. The DESIGN names no code; the lot-5 binding uses reference-dangling (the refused result would leave Link_1 dangling, DESIGN L132; harmonization C12). |
| `py-replace-preserves-id` | §8.3 L651 | note-to-aid converts Note_1 within the same native type (convert recipe sets text to [Aid] + text): the ID Note_1 survives, the report idMap is empty and the element is now recognized as aid, whose body field displays the stripped text while value is the stored text (harmonization B18). |
| `py-replace-replacement-map` | §8.3 L651, §10.1 L753 | task-to-service converts Task_2 to another native type: the convert recipe creates bpmn:ServiceTask stable-id/1(Process_1, service, r1) carrying name Fixed (appended) and removes Task_2 (unreferenced; the replace surface passes explicit deletion intent). The ID cannot survive a type change in the recipe grammar, so the result reports the replacement map in report.idMap with domain migration (harmonization D7); the report has no entry. |
| `py-surface-append-when` | §8.3 L649 | task-append (self = source) is listed when appending from Task_1 and hidden from Service_1; the call from Service_1 is refused although an Association may start at a ServiceTask. The DESIGN names no code for an unauthorized surface call; the lot-5 binding uses profile-producer (L649: an invisible menu is not the security/producer boundary; harmonization C7). The refusal echoes the committed identity and revision, carries no lint entry (no stage ran: diagnostics = report.entries = []) and the tree, IDs and history are unchanged. |
| `py-surface-connect-when` | §8.3 L649 | reference-link (self = source, typeIs bpmn:DataStoreReference) is listed from Ref_1 and hidden from Aid_1; the call from Aid_1 is refused although Association.sourceRef admits a TextAnnotation. The DESIGN names no code for an unauthorized surface call; the lot-5 binding uses profile-producer (L649: an invisible menu is not the security/producer boundary; harmonization C7). The refusal echoes the committed identity and revision, carries no lint entry (no stage ran: diagnostics = report.entries = []) and the tree, IDs and history are unchanged. |
| `py-surface-context-when` | §8.3 L649 | task-note (when typeIs bpmn:Task exact, self = target) is listed for Task_1 and hidden for Service_1; the call on Service_1 is refused although add-note could add Documentation to a ServiceTask. The DESIGN names no code for an unauthorized surface call; the lot-5 binding uses profile-producer (L649: an invisible menu is not the security/producer boundary; harmonization C7). The refusal echoes the committed identity and revision, carries no lint entry (no stage ran: diagnostics = report.entries = []) and the tree, IDs and history are unchanged. |
| `py-surface-delete-when` | §8.3 L649 | aid-delete is listed for Aid_1 and hidden for the plain Note_1; task-delete is listed for Task_2 (lane-delete needs a bpmn:Lane subject). The aid-delete call on Note_1 is refused although its remove action would succeed. The DESIGN names no code for an unauthorized surface call; the lot-5 binding uses profile-producer (L649: an invisible menu is not the security/producer boundary; harmonization C7). The refusal echoes the committed identity and revision, carries no lint entry (no stage ran: diagnostics = report.entries = []) and the tree, IDs and history are unchanged. |
| `py-surface-direct-edit-when` | §8.3 L649, §8.3 L657 | task-label (typeIs bpmn:Task and name != Fixed) is listed for Task_1 and hidden for Task_2 (named Fixed). The call on Task_2 is refused profile-producer with no change; the authorized call on Task_1 renames it to Checked (one accepted batch). The accepted report has no entry: C writes nothing (isExecutable already false), every bpmn:Task keeps a nonempty name so neither draft subrule finds anything, and the 26 standard rules are off. |
| `py-surface-gesture-parameters` | §8.3 L655 | A palette command must carry exactly its subject (owner) and the sources bound by task-create (owner, key, value) in context. Missing owner, value or key, an extra target handle, a fragment on a non-paste entry, an unknown command member, an unknown context member and a missing context each refuse profile-ui-parameters without change (I3 closed records). An explicit empty value is supplied, not omitted: the last command creates a task named with the empty string, and both draft subrules report it (task-named-pre-normalize at stage pre-normalize, task-named at stage post-normalize, warn/readiness, observed, source at the new task pointer /rootElements/0/flowElements/1, result unavailable); warnings do not block a draft edit. |
| `py-surface-handles-and-values` | §8.3 L655, §8.3 L659, §2.2 L132 | Owner Process_9 does not exist (reference-dangling). The string parameter name receives a number, a Boolean and null; none is coerced or treated as absent, each refuses profile-type. The tree is unchanged. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-surface-palette-entries-grid` | §8.3 L659, §7.1 L538 | The grid fixture lists task-create (order 0) before aid-create (order 1) in its single basic group. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-surface-palette-entries-localized` | §8.3 L659 | Same palette in locale fr: label.store and label.input have fr texts (exact), label, label.aid and label.note fall back to en. In locale fr-CA no text matches exactly (no BCP 47 truncation) so every label uses en; FR (case differs) also falls back to en. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-surface-palette-entries-order` | §8.3 L659, §8.3 L649 | Palette entries for owner Process_1: groups keep first-appearance order tools, basic, data (not alphabetical); inside basic the three order-0 entries sort by UTF-16 ID (Zeta-task < aid-create < task-create, uppercase first); inside data numeric order puts 9 before 10 before 20 (not ID or string order); hidden-task (when false) is not listed. PureResult diagnostics are empty. |
| `py-surface-palette-when` | §8.3 L649 | hidden-task (when false) is absent from the palette listing; a programmatic call is refused although its create-task recipe would succeed. The DESIGN names no code for an unauthorized surface call; the lot-5 binding uses profile-producer (L649: an invisible menu is not the security/producer boundary; harmonization C7). The refusal echoes the committed identity and revision, carries no lint entry (no stage ran: diagnostics = report.entries = []) and the tree, IDs and history are unchanged. |
| `py-surface-paste-when` | §8.3 L649, §8.3 L657 | paste-here is listed for owner Process_1 and paste-locked (when false) is not. A fragment copied from Note_1 does not authorize the hidden paste-locked entry: the call is refused profile-producer and nothing changes. Seal fix round: every step result is sealed in full, the closed Result/1 with its Report/2 header, entries, echo and diagnostics or the PureResult with empty diagnostics; commands use the I3 records and lot-4 or session members are excluded only through declared unsealed markers. |
| `py-surface-raw-recipe-command` | §8.3 L649, §8.2 L635 | A bare {recipe, parameters} record has no command discriminator and a record with command recipe names no accepted command kind; both bypass every UI entry and field authorization, so the bridge treats them as unadapted entries and refuses transaction-entry-unsupported (harmonization C8, I3). |
| `py-surface-replace-when` | §8.3 L649 | note-to-aid is listed for the plain Note_1 and hidden for Aid_1 (already marked); task-to-service is listed for Task_1. The note-to-aid call on Aid_1 is refused although its convert recipe would prefix the text again. The DESIGN names no code for an unauthorized surface call; the lot-5 binding uses profile-producer (L649: an invisible menu is not the security/producer boundary; harmonization C7). The refusal echoes the committed identity and revision, carries no lint entry (no stage ran: diagnostics = report.entries = []) and the tree, IDs and history are unchanged. |
| `py-surface-unknown-entry` | §2.4.1 L190 | Entry no-such-entry is not a UI entry of the active profile; the lot-5 binding refuses profile-symbol (harmonization C9). |
| `py-surface-unlisted-upstream` | §8.3 L659, §8.2 L635 | create.exclusive-gateway is listed by no UI entry, so the headless upstream command is disabled; the lot-5 binding uses the DESIGN code for a disabled entry, transaction-entry-unsupported (L637; harmonization C8). Nothing changes. |
| `py-surface-upstream-mapped` | §8.3 L659 | The upstream palette ID create.task (I3 upstream command) resolves to task-create; the command yields exactly the result, tree and report of create-task-palette-neutral. |
| `py-twin-grid-fixture-commands` | §14.2 L954, §7.1 L538 | The same two commands through the grid UI entries reproduce the vendored grid expected.completed tree: a ServiceTask target, the [Note] marker and isExecutable=true added by C (complete/set, before absent, after true); the draft entries equal the vendored grid lint expectations on the unnamed ServiceTask Task_A. |
| `py-twin-neutral-fixture-commands` | §14.2 L954, §8.3 L649, §7.1 L538 | The two commands of the vendored neutral fixture (add-note on Task_B, create-aid with key new-note) are issued through their UI entries task-note and aid-create in one batch. The committed tree equals the vendored expected.completed tree byte for byte, including the isExecutable=false that C adds on the stage (one complete/set entry, before absent, after false). The draft entries equal the vendored lint expectations pre-normalize/draft and post-normalize/draft (task-name-missing-pre-normalize and task-name-missing on Task_A, warn, readiness, messageKey invalid), with source at Task_A's pointer /rootElements/0/flowElements/1. |
<!-- end generated -->
