# Block B, finding #24: externalization expectations, clause to case table

Sealed expectations: `tests/fixtures/x24-externalization/expectations/` (method, data shape, operation
catalogue, UNSEALED list: its `README.md`; digests: its `seal.json`). Authority: DESIGN.md R3.3, SHA-256
`48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f`. Base: commit
`05f737885bd44fddea84bf1b4d55ae5428704855`. This revision is the single seal fix round
(review verdict REWORK: 2 BLOCKER, 4 MAJOR, 1 MINOR) together with the block B harmonization, sections
3.4 and 7; the README lists each finding and its correction.

Spec author: Opus (`claude-opus-5-5`), owner exception. Reviewer: gpt-6-astra, max effort.

## Groups

| Group | Cases | Purpose |
| --- | --- | --- |
| L | 6 | Occurrence ledger (3381 I-numbers, one per match, 0 unmatched), distribution members (203 D-numbers, 2445 member occurrences, 0 unexplained), modules (15), legacy value pins (SHA-256 only), literal-free seal (rules R1 to R4). |
| S | 28 | Admission of the injected business-policy/1 record (four admitted data sets, one with overlapping prefixes; schema, static and lexical refusals) and the recognition-stage ambiguity of DESIGN.md:154 (one refusal, one unambiguous run). |
| A | 29 | Legacy adapter on the legacy-shaped synthetic data set: every consumer, the full layout, the facts descriptor and the static, preview and workshop surfaces. |
| R | 10 | Hidden policies removed: retarget, name navigation, ambient decomposition, forced descriptor, built-in looks, first IO set, implicit markers, browser default tables, facts of another namespace version. |
| X | 31 | Substitution neutral A against neutral B for every consumer and surface, and the profile path on the lot-0 neutral profiles. |
| P | 7 | Exact assertions of the two acceptance probes and of the post-migration rescan. |

## Clause to case table

One row per cited DESIGN.md line or range, generated from `manifest.json` by `derive/clause-table.mjs`.
Every case cites at least one clause; the first input artifact of each case (role `clause`) carries the
same citations.

| DESIGN.md lines | Section | Cases |
| --- | --- | --- |
| 34 | §1 | L-004-zero-unmatched, L-006-literal-free-seal, R-007-no-policy-recognises-nothing, X-001-classify, P-001-probe-1-original, P-006-probe-2-rescan |
| 48 | §2.1 | S-001-valid-x24-neutral-a, S-002-valid-x24-neutral-b, S-003-valid-x24-legacy-synthetic, S-004-unknown-field, S-005-null-value, S-013-missing-metrics |
| 85-101 | §2.1.1 | S-021-lexical-number, S-022-lexical-duplicate-key, S-023-lexical-lone-surrogate |
| 115 | §2.2 | A-001-classify |
| 115-116 | §2.2 | X-021-profile-render-label |
| 146 | §2.3 | S-006-empty-prefix, S-007-unknown-trim, S-025-overlapping-prefix-unambiguous, A-001-classify, X-001-classify, X-020-profile-recognition |
| 152 | §2.3 | A-001-classify, X-001-classify, X-020-profile-recognition |
| 154 | §2.3 | S-009-overlapping-prefix, S-024-overlapping-prefix-admitted, S-025-overlapping-prefix-unambiguous, X-020-profile-recognition |
| 163 | §2.4 | X-022-profile-create-text |
| 182 | §2.4.1 | S-009-overlapping-prefix, S-024-overlapping-prefix-admitted |
| 190 | §2.4.1 | S-008-duplicate-role, S-016-duplicate-alias, S-017-duplicate-look, S-019-duplicate-node-size, S-024-overlapping-prefix-admitted, A-025-facts-descriptor-mismatch |
| 276-281 | §3.2 | X-022-profile-create-text |
| 547 | §7.1 | R-006-io-set-selection |
| 606 | §8.1 | A-025-facts-descriptor-mismatch, R-004-no-forced-descriptor |
| 615 | §8.1 | A-013-theme-select, A-028-workshop-surface |
| 623 | §8.1 | A-015-navigation-legacy-default, A-028-workshop-surface, R-002-navigation-called-element, X-014-navigation |
| 627-635 | §8.2 | A-010-transactions-follow, A-022-transactions-autolayout, X-010-transactions-follow |
| 649 | §8.3 | A-014-palette, X-013-palette |
| 651 | §8.3 | R-006-io-set-selection |
| 655 | §8.3 | X-022-profile-create-text |
| 659 | §8.3 | A-014-palette, X-013-palette |
| 671 | §9.1 | X-023-profile-render-bindings |
| 698 | §9.3 | X-021-profile-render-label |
| 698-700 | §9.3 | X-023-profile-render-bindings |
| 700 | §9.3 | A-011-tokens-annotated, A-012-tokens-recolor, X-011-tokens |
| 702 | §9.3 | S-014-alias-target-outside-table, S-015-alias-source-inside-table, A-007-metrics, R-003-no-ambient-decomposition, X-007-metrics, X-021-profile-render-label, X-022-profile-create-text |
| 712 | §9.3 | A-008-render-badges, A-009-render-attachment, A-010-transactions-follow, A-022-transactions-autolayout, A-026-static-surface, X-008-render-badges, X-009-render-attachment, X-024-transactions-autolayout, X-028-static-surface |
| 721 | §9.4 | S-019-duplicate-node-size, A-006-layout-size, A-023-layout-process, X-006-layout-size, X-025-layout-process |
| 729 | §9.5 | L-005-legacy-value-pins, S-017-duplicate-look, S-018-upstream-look-with-tokens, A-011-tokens-annotated, A-012-tokens-recolor, A-013-theme-select, R-005-no-built-in-look, X-012-theme-select |
| 770-772 | §10.2 | A-019-export-drawio |
| 770-803 | §10.2 | A-017-export-reference-page, A-024-export-facts, X-015-export-a-input, X-016-export-b-input, X-017-export-legacy-input, X-026-export-facts, X-031-export-facts-b |
| 791 | §10.2 | A-021-export-free-annotation, X-019-import-legacy-symbols |
| 793 | §10.2 | A-018-export-sparx |
| 821-859 | §12 | L-001-occurrences |
| 823 | §12 | L-004-zero-unmatched, L-006-literal-free-seal |
| 829 | §12 | A-011-tokens-annotated, A-012-tokens-recolor, A-019-export-drawio, R-008-browser-entry-defaults, X-011-tokens |
| 829-831 | §12 | A-026-static-surface, X-023-profile-render-bindings, X-028-static-surface |
| 830 | §12 | P-001-probe-1-original |
| 830-831 | §12 | S-001-valid-x24-neutral-a, S-002-valid-x24-neutral-b, S-003-valid-x24-legacy-synthetic, A-001-classify, A-002-kind-annotated, A-003-kind-recolor, A-004-kind-flat, A-005-layout-input, A-017-export-reference-page, A-020-import-drawio, A-021-export-free-annotation, R-007-no-policy-recognises-nothing, X-001-classify, X-002-kind-annotated, X-003-kind-recolor, X-004-kind-flat, X-005-layout-input, X-015-export-a-input, X-016-export-b-input, X-017-export-legacy-input, P-002-probe-1-no-policy, P-003-probe-1-injected |
| 831 | §12 | A-009-render-attachment, A-010-transactions-follow, A-014-palette, A-018-export-sparx, A-022-transactions-autolayout, X-009-render-attachment, X-010-transactions-follow, X-020-profile-recognition, X-024-transactions-autolayout |
| 833 | §12 | S-026-unknown-node-slot |
| 836 | §12 | S-001-valid-x24-neutral-a, S-002-valid-x24-neutral-b, S-003-valid-x24-legacy-synthetic, S-010-short-width-table, A-007-metrics, A-023-layout-process, X-006-layout-size, X-007-metrics, X-025-layout-process |
| 837 | §12 | A-011-tokens-annotated, A-012-tokens-recolor, A-013-theme-select, A-026-static-surface, A-028-workshop-surface, R-005-no-built-in-look, R-008-browser-entry-defaults, X-011-tokens, X-012-theme-select, X-028-static-surface, X-030-workshop-surface |
| 839 | §12 | S-028-missing-facts-property, A-017-export-reference-page, A-024-export-facts, A-025-facts-descriptor-mismatch, A-029-facts-unknown-version, R-009-facts-version-a, R-010-facts-version-b, X-026-export-facts, X-031-export-facts-b |
| 843 | §12 | S-020-decode-unknown-kind, A-014-palette, A-017-export-reference-page, A-018-export-sparx, A-019-export-drawio, A-020-import-drawio, R-006-io-set-selection, X-013-palette, X-015-export-a-input, X-016-export-b-input, X-017-export-legacy-input, X-018-import-neutral, X-019-import-legacy-symbols, X-027-import-b |
| 844 | §12 | A-006-layout-size, A-008-render-badges, A-009-render-attachment, A-019-export-drawio, A-022-transactions-autolayout, A-023-layout-process, A-026-static-surface, X-006-layout-size, X-008-render-badges, X-024-transactions-autolayout, X-025-layout-process, X-028-static-surface |
| 853 | §12 | S-028-missing-facts-property, A-024-export-facts, A-025-facts-descriptor-mismatch, A-029-facts-unknown-version, R-004-no-forced-descriptor, R-009-facts-version-a, R-010-facts-version-b, X-026-export-facts, X-031-export-facts-b |
| 854 | §12 | A-002-kind-annotated, A-003-kind-recolor, A-004-kind-flat, X-002-kind-annotated, X-003-kind-recolor, X-004-kind-flat |
| 855 | §12 | S-011-legacy-retarget, A-005-layout-input, R-001-nonactivity-host-preserved |
| 856 | §12 | S-026-unknown-node-slot, A-006-layout-size, A-023-layout-process, X-006-layout-size, X-025-layout-process |
| 857 | §12 | S-014-alias-target-outside-table, A-007-metrics, R-003-no-ambient-decomposition, X-007-metrics |
| 858 | §12 | A-027-preview-surface, A-028-workshop-surface, X-029-preview-surface, X-030-workshop-surface |
| 859 | §12 | S-001-valid-x24-neutral-a, S-002-valid-x24-neutral-b, S-003-valid-x24-legacy-synthetic, S-012-empty-rules, S-027-unknown-navigation-rule, A-015-navigation-legacy-default, A-016-navigation-legacy-rules, A-028-workshop-surface, R-002-navigation-called-element, X-014-navigation, X-030-workshop-surface |
| 863 | §12.1 | L-001-occurrences, L-002-distribution-members, L-004-zero-unmatched, P-004-probe-2-original, P-005-probe-2-ledger-rows |
| 865-870 | §12.1 | L-002-distribution-members, P-007-probe-2-distribution |
| 870 | §12.1 | A-026-static-surface, A-027-preview-surface, A-028-workshop-surface, X-028-static-surface, X-029-preview-surface, X-030-workshop-surface |
| 872 | §12.1 | P-005-probe-2-ledger-rows |
| 872-874 | §12.1 | L-001-occurrences, L-006-literal-free-seal, P-006-probe-2-rescan |
| 874 | §12.1 | L-002-distribution-members, L-004-zero-unmatched, P-007-probe-2-distribution |
| 876 | §12.1 | A-027-preview-surface, A-028-workshop-surface, X-029-preview-surface, X-030-workshop-surface |
| 880-897 | §12.2 | L-003-modules |
| 882 | §12.2 | A-029-facts-unknown-version, R-009-facts-version-a, R-010-facts-version-b |
| 886 | §12.2 | A-021-export-free-annotation, X-015-export-a-input, X-016-export-b-input, X-017-export-legacy-input, X-019-import-legacy-symbols |
| 887 | §12.2 | A-002-kind-annotated, A-003-kind-recolor, A-004-kind-flat, A-005-layout-input, A-009-render-attachment |
| 888 | §12.2 | A-026-static-surface |
| 895 | §12.2 | R-004-no-forced-descriptor, R-009-facts-version-a, R-010-facts-version-b |
| 896 | §12.2 | S-011-legacy-retarget, R-001-nonactivity-host-preserved, R-002-navigation-called-element |
| 897 | §12.2 | A-027-preview-surface |
| 899 | §12.2 | L-005-legacy-value-pins, R-005-no-built-in-look, R-007-no-policy-recognises-nothing, R-008-browser-entry-defaults, P-002-probe-1-no-policy, P-006-probe-2-rescan |
| 916 | §13 | S-011-legacy-retarget, R-001-nonactivity-host-preserved |
| 951 | §14.2 | X-001-classify, X-005-layout-input, X-015-export-a-input, X-016-export-b-input, X-017-export-legacy-input, X-020-profile-recognition, X-024-transactions-autolayout, X-025-layout-process, P-003-probe-1-injected |
| 954 | §14.2 | X-028-static-surface |
| 1148 | §16 item 5 | L-005-legacy-value-pins |
| 1154 | §16 item 8 | R-006-io-set-selection |
