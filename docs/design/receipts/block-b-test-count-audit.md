# Block B resume verification

Date: 2026-10-19. Code checked: f7c608e; comparison: 2319bbb → 6107cf8.

`dc183c2` and `f7c608e` satisfy items 1–2; no further implementation change was needed. Both commits have factual subjects and no attribution trailers.

## Identifier and API decision

LX-NV-1 (sha256 e40ce9d32fa2483ea41f0596a7ded974c5ba269f1fe540f5d0955d54778d2284): the identifier is now `lookupTarget`; all 12 planning references and the remaining repository references were updated. The exact old identifier has zero matches in the permitted tracked scope and all rebuilt dist files, including declarations, bundles and maps. No alias or old-name re-export remains.

LX-TH-3 (sha256 fe6d3468cf5c74d8ec2a95b40f2e05338c37a4202f8fad692d2b64a9cf9b468a): the comment at src/profile/lot4-export.ts:796 is reworded. The completion default at src/profile/completion.ts:13 and :166 is now `default`. Main 63a9258 has no completion.ts and does not export `complete` from src/profile/index.ts; DESIGN.md:232 specifies the mode argument but does not impose the removed spelling. The renamed completion mode was therefore not an already published public key or enum.

The two occurrences at src/profile/lot4-export.ts:834 remain under the published-declaration rule. At main 63a9258, exported `LintRunRequest` declares the property at src/profile/lint-bridge.ts:223; exported `compileLintPolicy` returns it at src/profile/lint-contracts.ts:47. Re-emitting main declarations entirely in memory produced the same property at dist/profile/lint-bridge.d.ts:62 and dist/profile/lint-contracts.d.ts:52. The package includes dist/ in its published files. No DESIGN naming exception is needed for these two existing API uses.

All four sealed expectation directories were checked: 1996 JSON files contain neither that property as an object key nor a completion `mode` with the removed value. Other mentions concern lint prose, helper bindings and injected legacy theme aliases; none imposes the completion spelling.

## Count reconciliation

| Campaign scope | Files | Tests |
| --- | ---: | ---: |
| 2319bbb, full I1 census | 124 | 3686 |
| 2319bbb, non-browser portion | 98 | 3203 |
| Browser portion, both revisions | 26 | 483 |
| 6107cf8, non-browser I1b census | 99 | 3210 |
| Current full census | 125 | 3693 |

**3686 − 3210 = 483 omitted browser tests − 7 added tests = 476.** There are no removed, renamed or merged tests/*.test.mjs files. One file was added; five existing files changed. Every browser row below was omitted by the 99-file non-browser selection and remains present. This is a campaign-scope gap, not a source-test deletion. If I1b is described as a full campaign, that completeness claim is defective. No unexplained test reduction was found.

Current per-file counts were reproduced with `node --test <file>`, the prescribed Git hooks environment, bounded process lifetimes and process-group termination after each run. The 3/3 result for tests/profile-golden-independence.test.mjs is owner-supplied and was not rerun, as instructed. Thus 3690 tests were executed successfully and three are supplied evidence. Historical per-file counts are reconstructed from those runs and the source/fixture inventory delta; the old implementation was not checked out or replayed. The 26 browser source files are byte-identical between the comparison revisions. The four seal case inventories have no added or deleted case files.

| Changed file | Old → new | Reason |
| --- | ---: | --- |
| tests/profile-lot3-golden-independence.test.mjs | 14 → 18 | Four added Unicode/ordinal checks. The receipt-chain test was renamed and expanded; its prior checks remain. |
| tests/profile-lot3.test.mjs | 266 → 266 | Removed the stale stop after the Unicode-name correction; the former single skip now passes. |
| tests/profile-lot4-seal.test.mjs | 20 → 21 | Added the U+E000 key and ordering witness. |
| tests/profile-lot4.test.mjs | 391 → 391 | Injected pinned fallback inventories; no registration change. |
| tests/profile-src-literal-free.test.mjs | 0 → 1 | New source-literal guard. |
| tests/x24-externalization-seal.test.mjs | 12 → 13 | Added the classification trim witness. The history receipt test was renamed and expanded to the receipt chain; its prior checks remain. |

The four added lot-3 tests cover the resealed sibling values, restored literal/derived values, named normalization counterexamples, and byte-distinct ordinal-0 allocation. Commits 4dd048c/ce1162f introduce them; e88071d adds the lot-4 witness, b8e65d0 adds the x24 witness, and 59635c5 adds the source guard. Commit 669089c removes the stale lot-3 skip. Reworded test titles account for apparent removed definitions; no assertion group disappeared.

## Per-file census

The old column is reconstructed; the new column is measured at the checked code revision except the supplied 3/3 result. “Browser omitted” gives the written reason for every file absent from the I1b selection. Masked path components are identified by ledger id, with complete path digests below.

| File | 2319bbb | 6107cf8/current | I1b selection |
| --- | ---: | ---: | --- |
| tests/asset-base.test.mjs | 3 | 3 | Included |
| tests/aui.browser.test.mjs | 19 | 19 | Browser omitted |
| tests/block-a-fix3-reseal.test.mjs | 1 | 1 | Included |
| tests/block-a-phase2-integration.test.mjs | 4 | 4 | Included |
| tests/brand-baseline.test.mjs | 7 | 7 | Included |
| tests/brand-guard.test.mjs | 4 | 4 | Included |
| tests/brand-legacy-gates.test.mjs | 7 | 7 | Included |
| tests/brand-release-gate.test.mjs | 18 | 18 | Included |
| tests/browser-dist.browser.test.mjs | 10 | 10 | Browser omitted |
| tests/[LX-TH-2]-style.test.mjs | 8 | 8 | Included |
| tests/[LX-TH-2].browser.test.mjs | 20 | 20 | Browser omitted |
| tests/core.browser.test.mjs | 107 | 107 | Browser omitted |
| tests/demo.browser.test.mjs | 2 | 2 | Browser omitted |
| tests/diagnostics.test.mjs | 12 | 12 | Included |
| tests/f1-dispute-comparator.test.mjs | 2 | 2 | Included |
| tests/f1-extensions-diagnostics.test.mjs | 12 | 12 | Included |
| tests/f1-extensions-f1.test.mjs | 14 | 14 | Included |
| tests/f1-extensions-f7.test.mjs | 8 | 8 | Included |
| tests/f1-extensions-j4.test.mjs | 42 | 42 | Included |
| tests/f1-extensions-miwg.test.mjs | 5 | 5 | Included |
| tests/f1-extensions-security.test.mjs | 18 | 18 | Included |
| tests/f1-seal-integrity.test.mjs | 7 | 7 | Included |
| tests/f1-xml-boundary-j3.test.mjs | 39 | 39 | Included |
| tests/git-base.test.mjs | 3 | 3 | Included |
| tests/history-attribution.test.mjs | 3 | 3 | Included |
| tests/history.browser.test.mjs | 20 | 20 | Browser omitted |
| tests/io-consumer-types.test.mjs | 6 | 6 | Included |
| tests/io-containment.test.mjs | 528 | 528 | Included |
| tests/io-facts.test.mjs | 5 | 5 | Included |
| tests/io-moddle.test.mjs | 62 | 62 | Included |
| tests/io-pyserial.test.mjs | 6 | 6 | Included |
| tests/io-reference-codec.test.mjs | 12 | 12 | Included |
| tests/io-review-2.browser.test.mjs | 10 | 10 | Browser omitted |
| tests/io-review-2.test.mjs | 39 | 39 | Included |
| tests/io-review-3.browser.test.mjs | 11 | 11 | Browser omitted |
| tests/io-review-3.test.mjs | 31 | 31 | Included |
| tests/io-review-4.browser.test.mjs | 12 | 12 | Browser omitted |
| tests/io-review-4.test.mjs | 31 | 31 | Included |
| tests/io-served.test.mjs | 5 | 5 | Included |
| tests/io.browser.test.mjs | 50 | 50 | Browser omitted |
| tests/layout-boundary.browser.test.mjs | 9 | 9 | Browser omitted |
| tests/layout-boundary.test.mjs | 2 | 2 | Included |
| tests/layout-corpus.browser.test.mjs | 1 | 1 | Browser omitted |
| tests/layout-corpus.test.mjs | 4 | 4 | Included |
| tests/layout-entry.test.mjs | 6 | 6 | Included |
| tests/layout-on-load.browser.test.mjs | 12 | 12 | Browser omitted |
| tests/layout-processModel.test.mjs | 6 | 6 | Included |
| tests/layout-swimlane.test.mjs | 7 | 7 | Included |
| tests/layout-textMetrics.test.mjs | 5 | 5 | Included |
| tests/[LX-TH-1]-palette.test.mjs | 8 | 8 | Included |
| tests/[LX-TH-1]-style.test.mjs | 14 | 14 | Included |
| tests/[LX-TH-1].browser.test.mjs | 11 | 11 | Browser omitted |
| tests/[LX-TH-1]2.browser.test.mjs | 13 | 13 | Browser omitted |
| tests/[LX-TH-1]3.browser.test.mjs | 13 | 13 | Browser omitted |
| tests/lot0-squash-readiness.test.mjs | 5 | 5 | Included |
| tests/lot5-ui-expectations.test.mjs | 14 | 14 | Included |
| tests/navigation.test.mjs | 5 | 5 | Included |
| tests/package-shape.test.mjs | 16 | 16 | Included |
| tests/palette.browser.test.mjs | 16 | 16 | Browser omitted |
| tests/path-guard.test.mjs | 4 | 4 | Included |
| tests/profile-boundary-schema.test.mjs | 6 | 6 | Included |
| tests/profile-brand-guard.test.mjs | 1 | 1 | Included |
| tests/profile-canonical.test.mjs | 16 | 16 | Included |
| tests/profile-case-policy-guard.test.mjs | 2 | 2 | Included |
| tests/profile-case-policy.test.mjs | 8 | 8 | Included |
| tests/profile-compatibility.test.mjs | 47 | 47 | Included |
| tests/profile-compiler-j2.test.mjs | 50 | 50 | Included |
| tests/profile-compiler.test.mjs | 12 | 12 | Included |
| tests/profile-corpus-pin-final.test.mjs | 2 | 2 | Included |
| tests/profile-corpus-revendor.test.mjs | 3 | 3 | Included |
| tests/profile-corpus-s123.test.mjs | 9 | 9 | Included |
| tests/profile-corpus-step2b.test.mjs | 10 | 10 | Included |
| tests/profile-corpus-step4.test.mjs | 18 | 18 | Included |
| tests/profile-corpus.test.mjs | 26 | 26 | Included |
| tests/profile-descriptor-context.test.mjs | 4 | 4 | Included |
| tests/profile-envelope.test.mjs | 14 | 14 | Included |
| tests/profile-golden-independence.test.mjs | 3 | 3 | Included |
| tests/profile-identity.test.mjs | 24 | 24 | Included |
| tests/profile-lint-bridge.test.mjs | 49 | 49 | Included |
| tests/profile-lint-contract.test.mjs | 44 | 44 | Included |
| tests/profile-lot3-golden-independence.test.mjs | 14 | 18 | Included |
| tests/profile-lot3.test.mjs | 266 | 266 | Included |
| tests/profile-lot4-seal.test.mjs | 20 | 21 | Included |
| tests/profile-lot4-vendor.test.mjs | 1 | 1 | Included |
| tests/profile-lot4.test.mjs | 391 | 391 | Included |
| tests/profile-native-stability.test.mjs | 4 | 4 | Included |
| tests/profile-prereq-c3.test.mjs | 3 | 3 | Included |
| tests/profile-prereq-compat.test.mjs | 3 | 3 | Included |
| tests/profile-prereq-f5.test.mjs | 3 | 3 | Included |
| tests/profile-prereq-gates.test.mjs | 3 | 3 | Included |
| tests/profile-prereq-revision.test.mjs | 2 | 2 | Included |
| tests/profile-prereq-schema-reads.test.mjs | 2 | 2 | Included |
| tests/profile-public-api.test.mjs | 12 | 12 | Included |
| tests/profile-r32-expectations.test.mjs | 107 | 107 | Included |
| tests/profile-r33-seal.test.mjs | 11 | 11 | Included |
| tests/profile-r33.test.mjs | 57 | 57 | Included |
| tests/profile-render-contract.test.mjs | 48 | 48 | Included |
| tests/profile-report.test.mjs | 47 | 47 | Included |
| tests/profile-result.test.mjs | 27 | 27 | Included |
| tests/profile-s123-receipt.test.mjs | 2 | 2 | Included |
| tests/profile-s123-regressions.test.mjs | 79 | 79 | Included |
| tests/profile-s4-fix.test.mjs | 89 | 89 | Included |
| tests/profile-s4-scope.test.mjs | 1 | 1 | Included |
| tests/profile-schema.test.mjs | 80 | 80 | Included |
| tests/profile-snapshot.test.mjs | 22 | 22 | Included |
| tests/profile-src-literal-free.test.mjs | 0 | 1 | Included |
| tests/profile-static.test.mjs | 239 | 239 | Included |
| tests/profile-twin-proof.test.mjs | 154 | 154 | Included |
| tests/react.browser.test.mjs | 22 | 22 | Browser omitted |
| tests/render-looks.browser.test.mjs | 15 | 15 | Browser omitted |
| tests/test-history-guard.test.mjs | 14 | 14 | Included |
| tests/ui.browser.test.mjs | 39 | 39 | Browser omitted |
| tests/v02.browser.test.mjs | 18 | 18 | Browser omitted |
| tests/watermark.browser.test.mjs | 7 | 7 | Browser omitted |
| tests/workbench-f1.test.mjs | 26 | 26 | Included |
| tests/workbench-f7.test.mjs | 20 | 20 | Included |
| tests/workbench-g0.test.mjs | 2 | 2 | Included |
| tests/workbench-parity-f1.test.mjs | 21 | 21 | Included |
| tests/workbench-parity-f7.test.mjs | 22 | 22 | Included |
| tests/workshop-export.browser.test.mjs | 9 | 9 | Browser omitted |
| tests/workshop-served.browser.test.mjs | 5 | 5 | Browser omitted |
| tests/workshop-structure.browser.test.mjs | 12 | 12 | Browser omitted |
| tests/workshop.browser.test.mjs | 20 | 20 | Browser omitted |
| tests/x24-externalization-seal.test.mjs | 12 | 13 | Included |
| tests/xsd.test.mjs | 13 | 13 | Included |

Masked path SHA-256 values:

- tests/[LX-TH-2]-style.test.mjs: 7032cf5d16913ba031255f6de1c177d01d6eee2034c56224f464693e30feb01c
- tests/[LX-TH-2].browser.test.mjs: c29dc8c71b65242cb2c8072877c829b23b488c330b993b3869a95b8ca7afdfa2
- tests/[LX-TH-1]-palette.test.mjs: ef9dbfa9f1ca89f29351b60b35839caf6602af5efa492c4a642452b87be8a834
- tests/[LX-TH-1]-style.test.mjs: a22e5557d259b8b44675595df912d6d6e6ede8118a591b45314bf8d200fb0279
- tests/[LX-TH-1].browser.test.mjs: 1acf4614784e78b20e30d4021f87b0605fb74dfa300f328c551fa3f4149b911e
- tests/[LX-TH-1]2.browser.test.mjs: 203c277899c5203b7841ad4f918423e1e189f012ca6cb8a5b149612dfb66a8c0
- tests/[LX-TH-1]3.browser.test.mjs: a858db8bec45424c63c9312ac27b853bb9f37c3ca24370a35de58114ca296837

## Verification

Typecheck and npm run build passed. All executed non-browser checks passed after increasing the timeout for the two slow seal suites; the initial 60-second attempts ended before their TAP summaries. Lot-3 independence: 18/18; lot-4 seal: 21/21; lot-5 seal: 14/14; x24 seal: 13/13. All other seal suites in the census passed. History guard: 14/14. Brand, path and history-attribution checks passed. The 26 browser files passed 483/483 using an existing cached browser after the default launcher failed in its sandbox setup. No browser download was needed.

The brand baseline remains the pre-existing reviewed baseline; passing the brand checks does not assert that all legacy baseline occurrences were removed. No seal worktree or seal branch was modified. No push was performed.

## Remaining unmatched occurrences

The sealed scanner checked 2914 tracked files in the permitted scope; tmp/ and the excluded design document were not scanned. Pairing uses the per-file multiset of (form, ledger entry, literal digest), preserving multiplicity while ignoring moved lines or changed surrounding text. This read-only census does not change any scanner, baseline or expectation. Unpaired findings are exactly LX-TH-3 ×2 and LX-MT-4 ×4. Generated dist copies of the retained property are at dist/profile/lot4-export.js:854 ×2.

| Ledger id | File:line:column (zero-based column) | SHA-256 |
| --- | --- | --- |
| LX-MT-4 | docs/design/receipts/block-b-lot3-unicode-literals-fix.json:2068:64 | 8088da219c162b1c3733594fe2015156ee7b84042ea821ad552e9448e8cbbcdd |
| LX-TH-3 | src/profile/lot4-export.ts:834:4 | fe6d3468cf5c74d8ec2a95b40f2e05338c37a4202f8fad692d2b64a9cf9b468a |
| LX-TH-3 | src/profile/lot4-export.ts:834:21 | fe6d3468cf5c74d8ec2a95b40f2e05338c37a4202f8fad692d2b64a9cf9b468a |
| LX-MT-4 | tests/profile-lot3-golden-independence.test.mjs:157:34 | 8088da219c162b1c3733594fe2015156ee7b84042ea821ad552e9448e8cbbcdd |
| LX-MT-4 | tests/profile-lot3-golden-independence.test.mjs:157:57 | 8088da219c162b1c3733594fe2015156ee7b84042ea821ad552e9448e8cbbcdd |
| LX-MT-4 | tests/profile-lot3-golden-independence.test.mjs:166:31 | 8088da219c162b1c3733594fe2015156ee7b84042ea821ad552e9448e8cbbcdd |

LX-TH-3 is retained for the API reason above. The four LX-MT-4 findings are the permitted Unicode-form references in the receipt and normalization discrimination tests. Temporary audit outputs and test scratch created by this verification are removed after recording this report.
