# C24 validation

Status: incomplete. Production policy reads are injected; release acceptance remains blocked by sealed conflicts and new campaign failures. No expectation, seal or comparator was changed.

## Consumer evidence

| Consumer | Tests | Passed | Failed |
| --- | ---: | ---: | ---: |
| Admission and ambiguity | 27 | 27 | 0 |
| Classification and metrics | 7 | 7 | 0 |
| Drawing geometry and role entrypoints | 4 | 4 | 0 |
| Kinds, looks, palette, navigation and workshop | 20 | 20 | 0 |
| Layout input and import | 7 | 7 | 0 |
| Complete layout and sizes | 4 | 4 | 0 |
| Attachment, follow and auto-layout transactions | 6 | 6 | 0 |
| Explicit IO-set selection | 1 | 1 | 0 |
| Native profile consumers | 4 | 4 | 0 |
| Package surfaces | 2 | 2 | 0 |
| Source zero-list scan | 1 | 1 | 0 |
| Export and facts | 14 | 7 | 7 |

Total: 97 tests, 90 passed, 7 failed. The seven export failures stop at the duplicate-ID boundary. Four static/preview surface cases also stop on that sealed-input conflict. Details and clauses are in [the conflict record](c24-expectation-conflicts.md).

The compatibility adapter is exercised through classification, metrics, kinds, look selection, palette and navigation entrypoints. Transaction, layout, codec, native-profile and surface callers receive explicit policy data. Sealed A/B substitution vectors use the unchanged pinned comparators.

## Inventory

The measured inventory contains 3,520 rows and 259 package members. Unmatched rows: 0. Unexplained package hits: 0. Source/package zero-list hits: 0. LX-DS-2 residuals in source and package members: 0.

The 874 base source policy rows have migration statuses: 600 injected, 257 replaced, 17 removed. A total of 1,115 base source occurrence identities no longer pair after migration, including renamed mechanism references; this is an identity count, not a count of distinct literal strings.

All I-number observations and per-entry counts are in [the measured scope](profile-externalization-scope.json), under `summary.removedIds` and `summary.removedByEntry`. LX-DS-2 source IDs: I-0770, I-0771, I-0772, I-0774, I-0775, I-0782, I-0784, I-0862, I-0873, I-0876, I-0933, I-0937, I-0955, I-0956.

P-006 has the known protected selector and its emitted counterpart, plus 346 presence conflicts: 315 in immutable expected artifacts, 29 in older test programs, and I-0001/I-0002 absent at the starting head. Those observations are preserved rather than hidden by an exception.

## Checks

- Typecheck, compatibility typecheck and build: passed.
- Lot 3/4/5/C24 seal batch: 65/66; only the known RV-01 expectation binding fails.
- Scope freshness check: passed.
- Original probe bytes and all sealed fixture bytes: unchanged. Probe promotion imports those same assertions.
- History guard: 13/14, byte-identical to main. Its nested corpus assertion is blocked by the frozen scope format conflict.
- Golden independence: the exhaustive byte-mutation test passed with the requested internal 3600 s timeout. At the final scope, the provenance test fails on the frozen scope format; the rule-table test passes.
- Complementary review selection: unavailable; no peer consensus claimed. See [availability record](c24-review.md).

Hygiene batch: 42/44. Both failures are frozen scope provenance/successor checks (expected 1391 bytes); brand, path and attribution scanning assertions pass.

Full non-browser campaign: 115 files, 2,890 tests, 2,747 passed, 142 failed, 1 skipped, 0 cancelled. Three failures are the named starting-head conditions; P-006 is the authorized remaining probe failure. The other 138 failures are NEW, including the seven sealed-input export cases and freeze/earlier-consumer checks. They are not accepted as green. [The failure docket](c24-campaign.json) identifies each failing test by ordinal and digest without recording a business literal.

Including the separately checked golden file: 2,893 tests, 2,749 passed, 143 failed, 1 skipped. The extra failure is the frozen-scope provenance check.

The final parser correction preserves lexical validation when the injected descriptor qualifies property names. The malformed-order rejection checks pass; twelve combined checks still stop earlier on the preserved formatted-output golden comparison.

Probes: 1/2. Classification passes; inventory stops at P-006. Assertions remain byte-identical. All invoked test processes exited or were terminated by their owning runner.


## Implementation commits

- c7f0cc3 Read annotation roles and text metrics from injected policy
- 580253c Validate injected policy shape and symbols
- 91b275c Read look and drawing policy from caller data
- 0754a23 Inject layout dimensions and preserve attachment hosts
- 09005da Inject codec descriptors and formatting policy
- 1f662e4 Use category names for presentation mechanisms
- 10854e5 Document caller policy and forward workshop import options
- faf5467 Exercise injected policy cases and supply native fixture data
- 79dfe75 Exercise sealed role vectors through the drawing helper
- d77656d Check adapter entrypoints against sealed caller data
- d2a2cd7 Preserve lexical validation for qualified descriptor properties

The final evidence commit contains this record and the measured inventory. Nothing was pushed.
