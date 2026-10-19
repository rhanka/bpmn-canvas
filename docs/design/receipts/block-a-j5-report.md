J5 fix report. Base: `bfed4a302446a3abbfec8b6bba46843dec432eca`.
Findings 5, 25 and 26 have scoped fixes. Finding 24 remains unresolved.

| Finding | Discriminating tests and red evidence | Fix and green evidence |
| --- | --- | --- |
| 5, public facade | `J5 #5 should deliver pure profile operations synchronously` failed on the base: `loadProfile` returned a Promise, so status was undefined. `should publish profile and compiler facades` failed on the missing public export. `should preserve the raw SHA-256 domain synchronously` compared a Promise with the expected digest and failed. | Added public `profile` and `profile/compiler` entries; `profile-lint` aliases the facade. Load/compile/context/preview and their pure dependencies are synchronous. Added synchronous browser-compatible SHA-256, private compiled-state retention, declarative rule/binding interpretation, literal upstream synchronous rule traversal and `validate` returning Result/1 with identity, unchanged revisions, Report/2 and summary. All 7 public API tests pass, including browser execution without host crypto, full reports, typed refusal and A→B→A substitution. |
| 24, externalization | `J5 #24 should require injected data for business classification` failed on the base (`true !== false`). `should inventory occurrences and distribution members` failed with `scope has no I-number occurrence ledger`. The explicit probe still fails both assertions after this round. | **Unresolved; no green claim.** No partial ledger or classifier rename is presented as extraction. See the infeasibility statement below. |
| 25, native/F1 proofs | The seven `J5 #25 should reject ...` seal mutations fail against the actual helper loaded from the base: extras, duplicate entries, equal-byte symlinks, hard links and invalid format are accepted; escaping paths reach file opening instead of a typed seal refusal. The two comparator mutation tests also failed with `Missing expected exception`: changed retained URI/body/QName, middle diagnostics and tree data passed the old checks. | Hardened inventory/path/link/format checks; complete disputed outcomes with only explicit arbitrated deltas; no independent expected bytes changed. All 7 seal tests and both comparator mutation tests pass. Stability tests now traverse F1, an admitted descriptor index, native preview, an unrelated edit and F7, comparing complete results. Vendored all three unchanged MIWG originals and license with the four required hashes and attribution. The 157-test F1/workbench campaign passes. Three fresh Node processes agree on all 51 vector occurrences in natural/reverse/shuffled order: 36 exact sealed comparisons and 15 explicit arbitrations. Node receipt: `f1-extensions.json`; this is not full F1 or second-runtime acceptance. |
| 26, Unicode policy guard | `J5 #26 should reject every forbidden platform Unicode operation` failed on the base regex check because `value.toLocaleString()` was accepted. | Replaced the check with a TypeScript AST/token scan covering all `toLocale*`, constant computed access, destructuring, Intl, normalization, regex ignore-case flags and RegExp flags. Negative mutations and positive controls pass. The complete case-policy pair passes 10 tests. |

The base production tree was unchanged when the initial probes were run. The
old Unicode check and dispute comparator were extracted unchanged into test
helpers before their mutation probes. `F1_SEAL_BASELINE=1` reruns the seal
mutations using `git show bfed4a3:tests/helpers/f1-sealed.mjs`, with the fixture
root relocated to an isolated copy. A failure caused only by an absent file or
build is not counted as the discriminating red evidence.

Finding 24 is infeasible as a bounded fix in this round. The current consumers
still classify annotations in parser, renderer and export paths, silently
retarget attachments, normalize metrics through platform data, and navigate
by names. A complete distribution ledger must qualify all those consumers,
the legacy export and descriptor surfaces, generated assets, maps and package
members. The design allocates their generic replacements and consumer
migration to later lots; the generic transaction/render/UI paths needed to
substitute their policies are not supplied by this lot-2 tree. The descriptor
portion also belongs to the parallel XML/codec themes. A wrapper around the
current defaults would leave the finding true.

Proposed option, owner: conductor coordination. Authorize a bounded
cross-consumer externalization/migration scope: one stable I-number row per
actual occurrence and distribution member, every policy supplied by data,
legacy behavior selected through an explicit adapter, and both profiles
executed across every public consumer. Acceptance is a complete member list,
zero unmatched occurrences and discriminating substitution tests; current
zero-word checks alone cannot satisfy it. No release choice, semantic
retarget migration or later-lot implementation is inferred here.

Shared existing files touched:

- `package.json`: public entries; `THIRD_PARTY_NOTICES.md`: required attribution.
- `src/profile/compiler.ts`, `contracts.ts`, `static-contracts.ts`,
  `canonical.ts`, `envelope.ts`, `descriptor-context.ts`, `native-bridge.ts`:
  synchronous delivery and its digest/schema call chain only.
- `src/profile/lint-bridge.ts`, `bpmnlint-modules.d.ts`, `lint-contracts.ts`:
  synchronous literal upstream execution and policy compilation; the existing
  async transport remains internal. No J1 rule, resolver or coordinate fix.
- `src/profile/results.ts`: closed validation summary payload and consistency.
- `src/profile/presentation-contracts.ts`: two async keywords preserve its
  existing Promise signatures after the digest helper becomes synchronous.
- `tests/f1-extensions-f1.test.mjs`, `helpers/f1-sealed.mjs`,
  `profile-native-stability.test.mjs`: proof/comparator changes; no codec change.
- `tests/profile-static.test.mjs`, `profile-schema.test.mjs`,
  `profile-envelope.test.mjs`, `profile-s123-regressions.test.mjs`,
  `profile-s4-fix.test.mjs`: synchronous refusal assertions, unchanged codes.
- `tests/profile-canonical.test.mjs`, `package-shape.test.mjs`: explicit new
  export inventory. `profile-case-policy.test.mjs`: stronger source guard.
- `tests/helpers/lot0-history-pins.mjs`,
  `profile-corpus-pin-final.test.mjs`: explicit successor source-pin checking.

`block-a-j5-reseal.json` records old/new hashes for every changed existing
source/test/document. Historical receipts remain intact. Independent F1
expectations, their seal, the profile corpus and freeze bytes are unchanged.
New observations are evidence and are never read as expectations.

Validation:

- `npm ci`, build, typecheck and typecheck:compat pass.
- Targeted compiler/API/context/native/case/schema/static/result/lint suites:
  **638 passed, 0 failed, 0 skipped**.
- F1 plus workbench F1/F7/G0/parity suites: **157 passed, 0 failed, 0 skipped**.
- Brand/path/package campaign: **57 passed, 0 failed, 0 skipped**.
- Source-pin/history/package follow-up: **49 passed, 0 failed, 0 skipped**.
- Three fresh Node proof processes: **51 equal observations each**.
- Both broad all-profile attempts hit their 120-second process timeout. The
  first also exposed the historical source-pin assertion, subsequently fixed
  through the explicit reseal and verified by the focused source-pin tests.
  No broad-suite pass is claimed. Every test process was bounded and ended or
  was terminated by timeout; no force-exit option was used.
- The standalone externalization acceptance probe remains **2 failures**.
- The packed artifact contains the facade, declarations and MIWG license;
  `block-a-j5-package.json` records its hash and 195 members. No publication.
- The staged whitespace check flags the terminal blank line in the unchanged
  upstream `Reference/B.1.0.bpmn`. It is preserved to retain the required hash;
  all authored changes pass the whitespace check.

Other-theme dependencies remain material: the complete neutral lint manifest,
compiler admission/static/identity corrections, descriptor-context integration
and XML/codec/loss fixes must be reconciled before qualification. Public API
integration tests here use an explicit limited host rule manifest and injected
codec data; they do not claim the complete neutral profile already passes the
other themes' gates. The deferred second-runtime proof was not executed.
