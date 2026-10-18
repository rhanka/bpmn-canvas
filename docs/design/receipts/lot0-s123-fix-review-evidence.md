---
status: completed
reviewer-host: codex
reviewer-model: gpt-6-sol
reviewer-effort: high
target-ref: 19ef11a..a5b9d37
followup-ref: c28cd4e..a5b9d37
lens: evidence and oracle integrity
verdict: APPROVE
---

# Final independent evidence review — lot 0 S1–S8 correction

**Verdict: APPROVE for the requested S1–S8 JS correction and the export/render context boundary introduced while fixing S3.** This is scoped approval of the implementation and its unsealed regression evidence. It does not claim independent sealed coverage, headless-twin proof, final corpus qualification, full compiler acceptance or closure of the retained-stash gate. The original blind review and first follow-up remain separate records; this artifact reviews `c28cd4e..a5b9d37` and reconciles their findings for the aggregate range.

## Final bounded context correction

`src/profile/static-contracts.ts:98-128` now applies one context guard before traversal-specific checks. `pages`, `occurrences`, `semantic`, and `OccurrenceHandle` `reference` require `context.location` to be `export` or `render`; the existing source-domain and order checks still follow. This matches `DESIGN.md:124-128,186`, whose R3.2 bytes hash to `feb133295c88a54841c62f8a19a81aa2fb4372f4af564d5380d611220e8c3497`.

The 15 added cases in `tests/profile-s123-regressions.test.mjs:75-86` cover export, render, validation, create and absent context for each of the three previously unguarded routes. The receipt records the red `bffe7b1` result as 79 tests, 71 passed and eight failed; the parent reports a subsequent focused 367-pass run. I did not rerun that campaign. A direct no-build CR-03 probe against current `dist` returned `profile-type` for `RenderData/pages/validation`, `OccurrenceHandle/semantic/create` and `OccurrenceHandle/reference/create`, and accepted matching export/render inputs. The prior `RenderData/occurrences/create` refusal remains covered by the earlier context regression matrix at `tests/profile-s123-regressions.test.mjs:67-74`. The correction changes no unrelated selector path.

## S1–S8 and evidence integrity

The unchanged aggregate fixes for S1, S2, S4, S5, S6 and S7 retain the evidence in the original blind artifact. S3 now admits both occurrence sources with `page-occurrence` order and enforces the export/render context for typed traversals. S4 bare-refusal tests require a `ProfileContractError` with no own code field; the declare-only code property in `src/profile/canonical.ts:2-8` makes that assertion precise. S8's receipt test checks all four inventory groups (`tests/profile-s123-receipt.test.mjs:21-25`). I independently recalculated all 29 recorded byte lengths and SHA-256 hashes in those groups at `a5b9d37`; none mismatched. The aggregate diff changes no sealed fixture or seal. I did not read step-4 vector contents, run a build or full test campaign, or inspect peer artifacts.

The correction's new regression cases are implementation-authored and unsealed. `docs/design/receipts/lot0-s123-fix.json:328-336` explicitly keeps independent S2/S3/S5 competing-case derivation, review and sealing pending with the expectation author. Those additions, the headless-twin proof and final corpus qualification remain gates before a sealed parity or release claim. The receipt's `green` field still awaits final verification evidence from the parent's running `npm test`; the 483 browser-only passes recorded there were for the previous source revision and are not treated here as final aggregate verification.

## Separate, nonblocking selector observation

`DESIGN.md:128` also limits `OccurrenceHandle` `reference.property` to `sourceOccurrence` or `targetOccurrence`. The current branch at `src/profile/static-contracts.ts:103-109` requires a property but skips native descriptor validation for `OccurrenceHandle` without checking that two-value set. A direct CR-03 probe in export context accepted `property: "bogus"` along with both allowed names. The schema's selector property is a generic nonempty string (`schemas/profile/profile-mechanism-1.schema.json:535-566`), so this is a real pre-existing unsealed gap in the broader typed-selector contract. It is outside the requested S3 Gate, which concerns occurrence source admission, page-occurrence order and the context boundary introduced by that admission. Record and correct it in a separately scoped selector follow-up before claiming full compiler parity; this approval does not waive or close it.
