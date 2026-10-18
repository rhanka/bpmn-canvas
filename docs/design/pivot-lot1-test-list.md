# Lot 1 test list

Baseline: `405cc373572c23cc06bdd746aefec0a64d037553`. All business content is invented. Existing C1–C7 goldens remain independent, fixed emission oracles; new semantic fixtures carry their facts in moddle, with valid standard data endpoints. No layout or customer inputs enter these tests.

Each numbered entry is one top-level test unless it explicitly describes a parameterized family. Red means the baseline lacks the model export API/descriptor or retains a removed API. Kept tests are expected green throughout.

## io-moddle.test.mjs

1. Descriptor: six-property fixture descriptor; assert packaged descriptor equality, checksum and subpath import. Red: descriptor absent.
2. Round-trip: order, laneRef, direction, label, primaryAssociationRef and processRef; serialize/reparse, assert object references and values, zero warnings. Red: registered package API absent.
3. Process IO: DataInput/DataOutput with InputSet/OutputSet and DI; assert external input/output kinds and roles. Red: direct reader absent.
4. Unlinked roles: explicit in/out objects; assert both roles survive without links. Red: old reader defaults to input.
5. Dual role: item with input/output links and explicit role opposite primary attachment; assert role and attachment differ and every link survives. Red: side facts/first-link inference.
6. Shared document: two attachments, explicit primary; assert host, lane and both endpoint orders. Red: no typed primary selection.
7. Artifact lane: artifact in a different, homonymous lane from its host; assert lane ID/index. Red: no semantic lane reference.
8. Relation labels/direction: DATA/DOC labels and reversed DI waypoints; assert semantic labels/endpoints unchanged. Red: facts and waypoint inference.
9. Mixed order: DATA/DOC before FLOW in metadata/DI; assert FLOW first, stable semantic order inside partitions. Red: old raw relation sorting.
10. Node grouping: C7 with scrambled DI; assert host, split/reversed documents, reversed inputs, outputs. Red: direct semantic order absent.
11. Navigation: SubProcess, Task, CallActivity to homonymous pages with Unicode digits; rename nodes/pages and serialize/reparse; assert exact Process IDs, types and Draw.io indexes. Red: label/flag matching.
12. Immutability/determinism: deep-frozen laid-out model; repeated all-format exports and serialization; assert equal bytes, untouched objects and DI order. Red: direct exporter absent.
13. No DOM: Node process with throwing DOMParser and document getters; assert real formatted bytes. Red: DOM reader required.
14. BPMN preservation: unsupported reference vocabulary with extensions and DI; assert moddle BPMN serialization preserves it. Red: model serialization API absent.
15. Complete pages: reorder diagrams independently from root processes; assert semantic page order and each page exported. Red: DI defines pages.
16. Geometry is mandatory: remove one page's DI; assert no partial output and missing-di with Process ID. Red: direct exporter absent.
17. Invalid metadata family (one test per case): duplicate Info; negative/fractional/string/duplicate order; invalid direction; unresolved/wrong-type/cross-process lane; unresolved/nonincident primary; unresolved/non-root/wrong-type process; unknown namespace version; missing ambiguous direction; missing artifact lane; wrong owner attribute; duplicate ID; inconsistent flow endpoints; invalid data target; missing data source; unsupported nested content; free annotation; orphan application; invalid geometry; missing edge DI. Assert typed IoError and offending IDs, no output. Red: semantic validation absent.

18–19. Standard single-role family: input-only and output-only DataObjectReference without `direction`, with valid `laneRef`; assert role, host, grouping and both exports.
20–21. Shared item/document without primary: semantic relation order opposes DI order and waypoints; assert first semantic host, attachment direction, grouping and all links in both exports.
22–27. Vocabulary refusal family: inclusive gateway, boundary event, intermediate catching event, message flow, several participants and nested lanes. Both formatted exports reject with exact IoError code/IDs; BPMN preserves each model and its extensions.

## io-reference-codec.test.mjs

1–7. One golden test per C1–C7: semantic fixture with fixed DI; assert both original expected files byte for byte under fixed configuration. Red: model export absent. C2 navigation is bound explicitly once; C5 carries C1 identity metadata after rename.
8. Empty/homonymous lanes C3: assert first-name Draw.io parent, last-name Sparx refs, unnamed-lane behavior; model lanes distinct by ID. Red: new API absent; formatting retained.
9. Escaping/numbers C6: assert XML escaping, half-even Draw.io rounding, Sparx precision. Red: new API absent; formatting retained.
10. Shared links/app anchors C4: assert one item/document, every link and DATA application anchors. Red: new API absent; formatting retained.
11. Duplicate labels C5: distinct cells/Sparx IDs, no suffix in visible names. Red: new API absent; formatting retained.
12. Configuration: initialize fixed envelope once, reject subsequent different configuration, caller mutation cannot change bytes. Red: initialization API absent.

## Retired-path replacement tests

`io-facts.test.mjs`: (1) no facts reader/export, (2) live rename/type/lane metadata wins by ID, (3) new item requires explicit lane and an explicit role when associations cannot determine it, (4) deleted primary rejects rather than guessing, (5) no geometry membership inference. Inputs: semantic C1/C3/C4 models. Red: old public facts API or absent model API.

`io-served.test.mjs`: (1) no XML export shortcut, (2) stale served/inputXml/facts arguments cannot supply bytes, (3) unsupported model rejects even with served files, (4) kept listDiagrams naming. Red: first three retired API/model behavior; fourth kept green.

`package-shape.test.mjs`: extend exports/pack assertions for descriptor/checksum, exact moddle pin and stable package/lock version; add OIDC-only release assertion. Red: no descriptor, range pin, token fallback. Keep existing no-brand, license, assets and package tests green.

`history-attribution.test.mjs`: existing three identity/history/attribution tests kept green. `io-pyserial.test.mjs`: existing six serializer tests kept green; no serializer changes intended.

## Consumer adaptation and non-regression

`tests/types/v04-compat.ts`: migrate removed facts/served/XML-export types to Definitions export and fixed codec configuration; compile with compatibility gate after implementation. Red: new types/API absent.

Workshop local-export browser replacement covers enabled three-format menu, current model bytes, typed refusal/no file, edits/undo and unchanged toolbar structure. Retire served-only assertions. Adapt `tests/browser/page-workshop-export.mjs`, `workshop-served.browser.test.mjs` and `workshop-export.browser.test.mjs` to descriptor-aware snapshot parsing and local export; keep atomic capture tests. Baseline red: served passthrough and missing model API. These browser consumers overlap lot 2 because removing workshop served branches in lot 1 requires replacing their assertions now.

`io.browser.test.mjs` / `tests/browser/page-io.mjs`: retain generic import/projection and diagnostics by calling the kept graph codecs directly; test BPMN/Sparx through descriptor-aware model export. Baseline new model API red; all unchanged import/projection checks green.

## Gates and boundaries

Build before red runs; record per-file pass/fail counts. Commit tests/fixtures alone before implementation. After scoped green: build, typecheck, typecheck:compat, full npm test with the prescribed Chromium binary; no push/tag/publication. Private fixed-DI emission parity is a separate local read-only gate, not DI-free layout or runtime acceptance. Publication/provenance/registry consumption remain unrun because this task prohibits publishing. The plan names a different implementing session; this request assigns the implementation here. No other architectural discrepancy is authorized.

## Recorded RED on 405cc37 source

Build passed. Counts include Node parent tests; new API absence prevents the atomicity browser helper from finishing its scenarios. Unchanged browser import/projection assertions passed (48); serializer (6), history (3), listDiagrams (1), and unchanged package guards (13) stayed green.

| File | Pass | Fail |
|---|---:|---:|
| io-moddle.test.mjs | 0 | 52 |
| io-reference-codec.test.mjs | 0 | 12 |
| io-facts.test.mjs | 0 | 5 |
| io-served.test.mjs | 1 | 3 |
| package-shape.test.mjs | 13 | 3 |
| history-attribution.test.mjs | 3 | 0 |
| io-pyserial.test.mjs | 6 | 0 |
| io.browser.test.mjs | 48 | 2 |
| workshop-served.browser.test.mjs | 1 | 4 |
| workshop-export.browser.test.mjs | 0 | 1 |

## Recorded GREEN

Both typechecks passed. Full npm test: **641 passed, 0 failed, 0 skipped**, using the prescribed Chromium binary. Counts include Node parent tests.

| File | Pass | Fail |
|---|---:|---:|
| io-moddle.test.mjs | 52 | 0 |
| io-reference-codec.test.mjs | 12 | 0 |
| io-facts.test.mjs | 5 | 0 |
| io-served.test.mjs | 4 | 0 |
| package-shape.test.mjs | 16 | 0 |
| history-attribution.test.mjs | 3 | 0 |
| io-pyserial.test.mjs | 6 | 0 |
| io.browser.test.mjs | 50 | 0 |
| workshop-served.browser.test.mjs | 5 | 0 |
| workshop-export.browser.test.mjs | 9 | 0 |
| workshop-structure.browser.test.mjs | 12 | 0 |
| workshop.browser.test.mjs | 20 | 0 |

The private read-only, fixed-DI gate forces the new exporter on an offline-enriched moddle graph, with no facts/served/XML argument. Both historical outputs match: Draw.io 46,395 bytes, SHA-256 d808dc4ef719cd8a07ed037ccb752835f8dd4f4c6e1cb337b78468f1ce311020; Sparx 54,805 bytes, SHA-256 6734aa4cc92b497ebcb096d9eca4604d3fbcdb79d746b61f735fa8cd108cad33. All five navigation targets survive. No private fixture or configuration was copied into this repository. This establishes codec parity with fixed historical DI, not DI-free layout acceptance.

V1 candidate: **0.4.0**, unchanged and consistent in package/lock; the read-only registry check lists 0.1.0, 0.2.0 and 0.3.0, so the candidate is unused. Publication, release review, provenance/attestation verification and registry consumption are deferred under the owner's no-push/tag/publish instruction.

Necessary file-list extensions: src/io/errors.ts removes the retired types and adds semantic diagnostics; tsconfig.json enables JSON imports. Remaining workshop browser consumers and their helpers were adapted after the full gate exposed served/generic assertions, preserving the step-0 structure fixture and import/projection coverage. The type-change helper now traverses descriptor references (moddle references are non-enumerable); the shared-link Sparx assertion counts four DATA/DOC relations, because applications are emitted as activity children. No emitter formatting or serializer changes were needed. No architectural discrepancy or open question is identified for local lot 1. The canvas/layout/capture and command-stack semantic maintenance remain lot 2 work.

## Internal-review corrections on 882f7ca

Tests were committed before implementation. The red run built unchanged `882f7ca` sources and ran the four files below: **66 passed, 7 failed, 0 skipped**. Six failures demonstrated the incorrect Draw.io role marker and missing refusals for both loop types, a registered `/2` semantic descriptor, and fractional/junk XML orders. The strict built-package consumer failed with TS7016 for the untyped moddle import. Restored regression assertions stayed green.

| File | Red pass | Red fail | Green pass | Green fail |
|---|---:|---:|---:|---:|
| io-moddle.test.mjs | 56 | 6 | 62 | 0 |
| io-facts.test.mjs | 5 | 0 | 5 | 0 |
| io-served.test.mjs | 5 | 0 | 5 | 0 |
| io-consumer-types.test.mjs | 0 | 1 | 1 | 0 |

The role test checks the actual Draw.io marker and outgoing application attachment separately. Both loop tests verify BPMN round-trip preservation before checking formatted-export refusal. Restored assertions exercise naming fallbacks, all pages in both formatted outputs, live type/lane edits, expanded-subprocess refusal, missing shape DI and nonfinite waypoints. The type-change helper copies descriptor properties, including non-enumerable incoming/outgoing references.

The consumer copies the built package to an isolated directory, compiles only its consumer with `strict: true` and `skipLibCheck: false`, and includes no private source declarations. Both repository typechecks and this consumer check pass. Full `npm test`, including browser tests with the cached Chromium binary and fresh profiles: **653 passed, 0 failed, 0 skipped**. Brand and diff guards pass. README migration instructions now describe descriptor-aware parsing, fixed configuration and byte-returning model exports.

## Second internal-review corrections on 89ca4a5

The tests-first commit was replayed against unchanged `89ca4a5` production sources, including the shipped browser build: **14 passed, 41 failed, 0 skipped**. Existing C1–C7 goldens and fixtures are unchanged. Browser parent-test failures are included in Node's totals.

| File | Red pass | Red fail | Green pass | Green fail |
|---|---:|---:|---:|---:|
| io-review-2.test.mjs | 2 | 37 | 39 | 0 |
| io-consumer-types.test.mjs | 5 | 1 | 6 | 0 |
| io-review-2.browser.test.mjs | 7 | 3 | 10 | 0 |

Lexical tests cover `info` and `Info`, unqualified and qualified `order`, alternate namespace prefixes, scoped aliases, numeric entities, comments and foreign attributes. Valid spellings retain their typed values and golden bytes; junk, fractional and unsafe integer values reject with the owning ID. The lexical pass uses the registered descriptor with only `order` changed to String, so namespace and spelling resolution match the integer reader.

Activity-owned DataInput and DataOutput cases include the required input/output sets and standard data associations. Both serialized models pass the OMG XSD, reparse without warnings and export every relation. Eleven invalid-set cases check required sets, local membership, types, optional/executing references and cross-set references. Unsupported activity content remains refused.

The strict consumer now resolves the actual package exports for root, `/io`, `/layout`, `/react`, `/assistant-ui` and `/browser`, with no source shims and `skipLibCheck: false`. The browser declaration uses a structural updater base while retaining the same runtime constructor. C1–C7 are exported repeatedly through both Node and the shipped browser IIFE and compared with both unchanged goldens.

### Refusal audit against src/io at 405cc37

The unchanged XML/import/projection readers (`xml.ts`, `project.ts`, `drawio-decode.ts`, `drawio-pages.ts`, `graph.ts`) retain their checks. Removed facts/served paths are intentional lot-1 API retirements. Model export now validates semantic objects directly; it does not parse an XML export input.

| Old reader check | Current coverage and audit result |
|---|---|
| Process child whitelist | Restored ResourceRole, Auditing, Monitoring, InputOutputBinding and CorrelationSubscription refusals with child IDs; each has a BPMN-preservation regression. |
| Serialized reference children | Restored process supportedInterfaceRef/supports/extensionDefinitions and node categoryValueRef/eventDefinitionRef/extensionDefinitions checks. Reference XML children have no ID; process diagnostics retain the old empty ID, while node diagnostics name the owner. |
| Flow vocabulary, activity children, nested subprocesses and lanes | Existing vocabulary and both loop-characteristic regressions remain. Activity IO is the explicit Rev-3 supported exception and is validated. |
| Shape and edge vocabulary | Restored refusal for a drawn DataObject definition and an edge targeting a non-relation; both tests verify BPMN retains that DI. |
| Plane/process/pool resolution; multiple participants | Existing missing-page-DI and participant/vocabulary checks remain. |
| Bounds, lane/pool/shape DI, expanded subprocesses, waypoints and edge DI | Existing geometry, missing-shape/edge, expanded-subprocess and page checks remain. |
| Annotation/application/document links and relation endpoints | Existing free-annotation, orphan-application, endpoint, primary-reference and vocabulary checks remain. |

All restored refusal scenarios were compared with the old reader, which rejects them with `unsupported-element`. The second-review regressions demonstrate their acceptance on `89ca4a5` before the repair.

Final verification: build and both repository typechecks pass. The full Node test runner campaign, including every browser file with cached Chromium and fresh profiles, reports **707 passed, 0 failed, 0 skipped**. It includes the six strict consumer checks and the brand/package/history guards.

## Third internal-review corrections on b0ebf98

The tests-first run builds unchanged `b0ebf98` production sources, including the shipped browser IIFE. It reports **242 passed, 429 failed, 0 skipped**. Each failure demonstrates successful silent loss, accepted invalid IO membership, or false namespace-version refusal. The two existing positive-test setups remove obsolete endpoint declarations after changing associations; all existing assertions remain intact, and new orphan-declaration tests cover their refusal.

| File | Red pass | Red fail |
|---|---:|---:|
| io-containment.test.mjs | 137 | 391 |
| io-review-3.test.mjs | 4 | 27 |
| io-review-3.browser.test.mjs | 0 | 11 |
| io-moddle.test.mjs | 62 | 0 |
| io-review-2.test.mjs | 39 | 0 |

The generated campaign derives **528 containment cases** from every concrete BPMN/semantic descriptor type assignable to each non-DI containment property of the 29 supported containers. It compares each successful export against both C1's unchanged goldens and the container's pre-injection export, so scaffolding that already changes C1 cannot conceal an ignored child. Both codecs must agree on the outcome. Explicit cases verify unsupported-child IDs and BPMN preservation, including mixed Process/Choreography pages, nested opaque extensions, event definitions, expressions, assignments, data state, lane partitions and pool multiplicity. IO cases cover both directions and both process/activity owners, optional/executing subsets, omitted membership and valid multi-set membership. Namespace cases cover scoped shadowing, comments and actual unknown versions.

The projection now records consumed elements and model-valued properties, then audits every descriptor containment path and opaque extension child reachable from Definitions. Unknown properties and children are closed by default. Reference checks do not resurrect removed semantic elements from stale DI. Unsupported page roots refuse before projection filtering. Required IO scaffolding and referenced DataObject/Property declarations remain supported; unused declarations, redundant empty sets and unsupported children refuse explicitly. The existing message-flow and unsupported-reference diagnostic behavior is preserved.

Namespace declarations come from the parsed moddle graph. Unknown declarations receive stable reader prefixes so their resolved extension descriptors retain the URI even when a registered prefix is shadowed. Required semantic versions are checked on these resolved descriptors; comments and unused aliases cannot trigger refusals.

| File | Red pass | Red fail | Green pass | Green fail |
|---|---:|---:|---:|---:|
| io-containment.test.mjs | 137 | 391 | 528 | 0 |
| io-review-3.test.mjs | 4 | 27 | 31 | 0 |
| io-review-3.browser.test.mjs | 0 | 11 | 11 | 0 |
| io-moddle.test.mjs | 62 | 0 | 62 | 0 |
| io-review-2.test.mjs | 39 | 0 | 39 | 0 |

Final build, both repository typechecks, all six strict package consumers, brand/package/history guards and the complete Node/Chromium campaign pass: **1,277 passed, 0 failed, 0 skipped, 0 cancelled**. Browser tests use the cached Chromium binary with fresh profiles. Existing C1–C7 Node/browser repeated bytes and goldens are unchanged. The descriptor campaign reports **20 changed exports and 508 typed refusals across 121 child types**, with zero unchanged successful exports. The [complete refused/exported construct inventory](pivot-lot1-containment-results.md) lists every type, exported location, refusal code and all 528 cases. No emitter, fixture or golden changed.

## Fourth internal-review corrections on 9065783

The tests-first run builds unchanged `9065783` production sources and its shipped browser IIFE. The scoped campaign reports **543 passed, 28 failed, 0 skipped, 0 cancelled**. Failures reproduce Collaboration artifact lane ownership, missing process-wide order validation, ambiguous ownership diagnostics and accepted detached same-ID Association endpoints. All six supported ownership placements pass the OMG XSD before parsing assertions. Browser parent failures are included in the counts.

| File | Red pass | Red fail |
|---|---:|---:|
| io-containment.test.mjs | 527 | 1 |
| io-review-4.test.mjs | 12 | 19 |
| io-review-4.browser.test.mjs | 4 | 8 |

The 528 descriptor cases are classified before execution from DESIGN Rev 3's page/artifact, flow, lane and DATA-relation contract: **21 expected-supported, 507 expected-refused**. Every supported placement must parse without warnings and export through both codecs, retaining identical bytes after parsing. Typed refusals cannot satisfy a supported case. Every refused case must refuse through both codecs with a typed diagnostic and an offending element or owner. Existing successful-export comparisons against both C1 goldens and the pre-injection model remain intact. Injected names are assigned only to descriptor types with a standard name property, so a malformed test attribute cannot mask support.

Explicit regressions move document/application annotations, their Associations, and each pair to the single-participant Collaboration, keeping references and DI; successful parses and exports must equal both unchanged C1 goldens. Detached same-ID sources and targets of both document and application Associations must refuse with the Association ID before attachment consumption. Additional cases require typed multi-participant refusal and shared Process/Collaboration order validation.
