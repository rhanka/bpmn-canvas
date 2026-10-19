J3 fix report — findings 15–20

Base: `bfed4a302446a3abbfec8b6bba46843dec432eca`. Branch: `workbench/functions-20261018-block-a-fix-j3`.
Authorities: DESIGN R3.3 §§2.5, 3.1, 8.1, 10.1 and F1 plan revision d, especially lines 29–43 and 58–80.

`npm ci` ran first. Before production edits, the reviewer-derived suite ran against the unchanged starting source: 32 tests, 8 passing controls, 24 failures, exit 1. Every assigned finding had a discriminating failure. The final dedicated suite has 39 tests; all pass. The JSON receipt lists every test name, baseline outcome, and old/new source byte counts and SHA-256 digests.

| Finding | Test names and red evidence on the base | Fix | Green evidence |
| --- | --- | --- | --- |
| 15 | `J3 #15 XML depth 257 should enforce the limit before construction`, `J3 #15 XML attributes 1025 should count declarations before construction`, and `J3 #15 XML attribute length 1048577 should bound UTF-16 units` each failed with “Missing expected rejection.” `J3 #15 hydrate should refuse 6000 levels without a stack overflow` caught a `RangeError`. `J3 #15 F7 should enforce projected object size before invoking the writer` also lacked its expected refusal. | Observe the pinned tokenizer before native tree construction for depth, element count, attribute count and decoded UTF-16 attribute lengths. Measure JCS UTF-8 bytes with an explicit stack and bounded traversal, without creating serialized JSON. Measure the native JSON view at XML admission and before F7 invokes the writer. Include typed attributes in the count and length checks for hydrate/project/F7. | All 16 finding-15 tests pass. Controls cover depth 255/256/257, counts 1023/1024/1025, lengths 1048575/1048576/1048577, one-million-element counters, exact object-size −1/limit/+1, typed attributes, and an XML input whose raw size fits while its projected object size exceeds the limit. |
| 16 | `J3 #16 encoding should ignore ordinary attribute`, plus the comment and PI variants, decoded `é` as `Ã©`. | Select byte encoding only from an initial XML declaration, allowing a UTF-8 BOM. Inspect the entire declaration rather than a fixed initial byte window. | All 4 tests pass: ordinary attributes/comments/PIs cannot choose encoding; declared UTF-8, BOM input and actual Latin-1 input retain their values. |
| 17 | `J3 #17 reserved attributes should allow attribute-shaped documentation` refused valid text with `reserved-name`. The seven `J3 #17 entity … should be refused before native construction` probes lacked the expected refusal, including underscore, Unicode, dot, hyphen, colon and supplementary names. | Inspect reserved names only while reading actual attribute keys in the quote-aware tag scan. Scan complete entity references against the closed numeric/predefined allowlist. | All 9 tests pass. Documentation text survives, actual reserved attributes refuse, unknown references refuse, and comments/PI/CDATA remain exempt. |
| 18 | `J3 #18 XML should reject duplicate expanded attribute names` lacked a refusal. Hydrate/project collision probes also lacked refusals. `J3 #18 generic local rebinding should survive project and hydrate` refused with “Unsupported namespace version.” The supplemental `J3 #18 F7 should refuse a declared attribute overwrite independently of hydration` failed against the original modules with “Missing expected rejection.” | Resolve declarations in local scope and compare expanded attribute names, including declaration values containing numeric references. Reject foreign aliases colliding with declared properties or another attribute. Propagate scope through containment and permit retained generic namespace shadowing during hydration. | All 6 tests pass, including direct F7 refusal, same-URI aliases, distinct-URI positive controls, hydrate/project collisions, and the native project/hydrate fixed point under local rebinding. |
| 19 | `J3 #19 F7 should refuse malformed generic QName before writing`, `J3 #19 F7 should refuse generic namespace NUL before encoding`, and `J3 #19 F7 should refuse generic namespace surrogate before encoding` each lacked an expected refusal. | Apply QName validation and the O1 character gate to generic element names and namespace descriptor strings before the literal writer or `TextEncoder`. | All 3 tests pass with `malformed-qname` or `invalid-xml-character`. |
| 20 | `J3 #20 reader to F7 should accept a generic element without namespace URI` failed with `invalid-model`. | Accept the reader's omitted `ns.uri` representation while retaining native factory/descriptor checks. Do not mutate the descriptor to repair it. | The direct reader→F7 test passes, matches the native writer's bytes, and confirms the URI remains absent. No project/hydrate detour is used. |

Supplemental baseline reproduction transpiled the three original boundary modules obtained with `git show bfed4a3:…` into ignored `dist/j3-baseline`. The regression copy changed only relative import routing. It produced 30 failures among 39 tests; its tokenizer-only control deliberately imports the new observer and is not a baseline implementation claim. The independent F7 overwrite test was also rerun alone against those original modules: one test, one failure, exit 1.

The final targeted campaign used `timeout --signal=TERM --kill-after=5s 180s node --test --test-reporter=tap --test-concurrency=1`, with the prescribed Git configuration environment. It ran these eleven suites:

- `tests/f1-xml-boundary-j3.test.mjs`
- `tests/f1-extensions-f1.test.mjs`
- `tests/f1-extensions-f7.test.mjs`
- `tests/f1-extensions-security.test.mjs`
- `tests/f1-extensions-diagnostics.test.mjs`
- `tests/workbench-f1.test.mjs`
- `tests/workbench-f7.test.mjs`
- `tests/workbench-parity-f1.test.mjs`
- `tests/workbench-parity-f7.test.mjs`
- `tests/io-moddle.test.mjs`
- `tests/io-reference-codec.test.mjs`

Result: 254 tests passed, zero failures, skips or cancellations; exit 0. Both `npm run typecheck` and `npm run typecheck:compat` passed. Compilation used the normal generation and asset-copy steps; the latter preserves the descriptor's shipped bytes. All test processes completed under their timeouts.

Shared files touched:

- `src/io/f1-extensions.ts`: tokenizer observation, bounded sizing and namespace helpers; declaration selection and lexical checks.
- `src/io/moddle-json.ts`: boundary checks, namespace-scope propagation, typed attribute limits, and shared presence symbols needed for exact native sizing.
- `src/io/serialize-bpmn.ts`: pre-writer sizing, namespace collisions, typed attribute limits, generic name/URI validation and omitted-URI acceptance.
- `package.json` and `package-lock.json`: one added dependency line each, directly pinning the already locked tokenizer version for the new runtime import.

New files are the local tokenizer type declaration, the dedicated regression suite, and this report with its JSON receipt. No sealed expectation or historical receipt was edited. No independent expectation was resealed. The JSON receipt records explicit old/new hashes for all five modified files.

Infeasible assigned items: none. The local-rebinding fixture is qualified for native project/hydrate equality; the upstream writer itself rejects that fixture because of an unresolved generated prefix, so the test makes no writer-parity claim for it. Existing recorded sealed-vector disputes and findings assigned to other themes remain outside this report's closure claim.
