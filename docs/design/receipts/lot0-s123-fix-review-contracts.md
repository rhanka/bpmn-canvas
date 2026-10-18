---
status: completed
reviewer-host: codex
reviewer-model: gpt-6-astra
reviewer-effort: high
target-ref: c28cd4e..a5b9d37
aggregate-target-ref: 19ef11a..a5b9d37
lens: normative correctness
verdict: APPROVE
---

# Final bounded contracts review

**APPROVE for the aggregate S1–S8 implementation correction `19ef11a..a5b9d37`.** The centralized context check implements the remaining DESIGN.md:128 restriction on pages, semantic and occurrence references while preserving the earlier occurrences fix. No new verified defect in the bounded delta.

Reviewed the exact four-file committed delta `c28cd4e..a5b9d37`, incorporating the preceding independently reviewed corrections. HEAD was `a5b9d37c1f8f8acdcd20f9e21c25808755689242`. Normative authority remains DESIGN R3.2 with the previously independently verified SHA-256 `feb133295c88a54841c62f8a19a81aa2fb4372f4af564d5380d611220e8c3497`. Both older review artifacts remain unchanged. No peer review artifact was accessed. No code, fixtures, seals, stash or excluded paths were modified, and no step 4 vector contents were inspected.

## Context restriction and diagnostic reasoning

`src/profile/static-contracts.ts:101–102` now tests the common invariant before the traversal-specific branches: pages, occurrences and semantic always require export/render; reference requires export/render when its source domain is OccurrenceHandle. DESIGN.md:128 explicitly imposes precisely that restriction. The domain and order checks remain separate and intact, implementing DESIGN.md:124,126,186.

The condition uses conjunction for occurrence reference, so native reference and inverseReference do not accidentally become export-only. Moving the old occurrences guard into this common check preserves both RenderData and PageHandle context protection. Removing the old semantic-only validation check does not weaken validation refusal: the common guard now also rejects create and missing context.

For valid bindings, a forbidden context yields `profile-type`. In admitted contexts, the existing wrong-order paths retain `profile-selector-order`; reference property checks are still reachable. Binding resolution still runs first, preserving `profile-symbol` for an unknown source. No normative total precedence is invented between independently invalid selector dimensions; the compatibility matrix's ordered diagnostic behavior is unchanged by this delta.

Independently executed 60 typed context/order combinations across pages, both occurrences sources, semantic, sourceOccurrence and targetOccurrence references. Each path was checked in export, render, validation, create and absent contexts with both orders. Legal contexts admitted the correct order and rejected the wrong order; forbidden or absent contexts refused. Input bytes were unchanged. Nine additional native self/reference/inverseReference controls across validation, create and missing contexts passed, demonstrating that the shared guard does not restrict those native paths.

The 15 added source regressions cover the three newly guarded paths in both admitted and three refused contexts. The correction document and receipt now include the expanded independent expectation-author work; they do not claim those new checks are sealed.

## Aggregate S1–S8 assessment

| Finding | Final assessment and authority |
| --- | --- |
| S1 | Closed. Source availability precedes patch/minor migration outcomes after earlier identity conflicts (`compatibility.ts:48`; DESIGN.md:294,305–312). Unchanged by this delta. |
| S2 | Closed under the supplied consensus interpretation. Schema identity is checked early; invalid exact envelopes yield bare refusal (`compatibility.ts:35,55`; DESIGN.md:301,313,421). Independent added sealed cases remain pending. |
| S3 | Closed for the scoped correction. Both occurrences domains are admitted with page-occurrence order, and the shared export/render context restriction covers pages, occurrences, semantic and occurrence references (`static-contracts.ts:101–128`; DESIGN.md:124,126,128,186). Expanded independent seal coverage remains pending. |
| S4 | Closed. Bare refusals preserve the ProfileContractError class without an own code field; prescribed diagnostics remain unchanged (`canonical.ts:3–7` and the previously reviewed refusal sites; DESIGN.md:260,421,425). |
| S5 | Closed. Parent scalar types and child overrides remain merged for inherited inference (`native-contracts.ts:42`; DESIGN.md:79,185). Independent typed-inheritance seal coverage remains pending. |
| S6 | Closed. The identity helper requires complete sections and hashes the complete document; full syntax validation remains the loader's responsibility (`envelope.ts:26–42`; DESIGN.md:46,65–75,260). |
| S7 | Closed. The supplemental scan still includes receipts (`profile-schema.test.mjs:103`; DESIGN.md:32). |
| S8 | Closed. Refreshed source/test hashes match; the inventory regression verifies test, implementation, historical receipt and expectation/freeze categories (`profile-s123-receipt.test.mjs:21`). Historical sealed records remain unchanged in the reviewed delta. |

## Preserved out-of-scope observation

A separately communicated observation was independently reproduced without consulting a peer artifact: in export context, an OccurrenceHandle `reference` with `property: "bogus"` and page-occurrence order is accepted, as are sourceOccurrence and targetOccurrence. DESIGN.md:128 restricts occurrence references to those two named endpoints. The reference-property branch in `src/profile/static-contracts.ts:103–109` checks presence but bypasses native-field validation for OccurrenceHandle without checking this endpoint allowlist.

This behavior predates the reviewed correction: the aggregate diff does not change reference-property validation, and the new common guard only restricts context. It therefore remains a concrete, unclosed pre-existing selector observation outside the requested S3 occurrences-source/order correction and its introduced-context closure. No new code or oracle change is requested within this bounded approval. A separate scoped correction should constrain the endpoint names and add independent coverage. This approval must not be read as full selector/compiler conformance.

## Verification and acceptance limits

Executed narrowly, without building:

- `node --test --test-reporter=dot tests/profile-s123-regressions.test.mjs`: 79 passed, exit 0.
- `node --test --test-name-pattern 'should supersede historical inventories' tests/profile-s123-receipt.test.mjs`: 1 passed, 0 failed.
- Independent selector probes: 60 typed context/order cases plus 9 native traversal controls passed.

No full or browser campaign was run by this reviewer; the parent's ongoing final verification is separate evidence. The receipt records earlier browser evidence against its actual source state, rather than presenting it as a completed final campaign. This review approves the bounded implementation correction, not the deferred qualification gates.

The S2/S3/S5 expectation additions, including every export/render context restriction, remain the independent expectation author's responsibility. Their pending status is a coverage gate, not an unresolved implementation defect established by this review. No sealed-fixture or reseal authorization is granted. Retained-stash, twin-proof and final-corpus acceptance remain open on their existing paths.

**Final verdict: APPROVE.**
