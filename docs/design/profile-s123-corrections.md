# Lot 0 steps 1–3 review corrections

Authority: DESIGN.md R3.2, SHA-256
`feb133295c88a54841c62f8a19a81aa2fb4372f4af564d5380d611220e8c3497`.
The correction starts at `19ef11a`; red regression tests are in `6afe211`.

| Finding | Current correction | Design evidence |
| --- | --- | --- |
| S1 | Patch and minor migrations require a known, available source. Earlier identity conflicts retain precedence; selected migration is still intent only. | DESIGN.md:294,307–312,315 |
| S2 | Schema identity disagreement refuses at the schema row, before migration/source checks. Invalid exact envelopes return a bare refusal. | DESIGN.md:301,313,421 |
| S3 | Occurrences admit both RenderData and PageHandle in export/render contexts; both require page-occurrence order. Unsealed regressions cover admission, order and context refusal. | DESIGN.md:124,126,128,186 |
| S4 | Envelope/storage, live-reference deletion and resource-digest refusals have no parity code. Specified codes, including missing resources, are preserved. | DESIGN.md:260,421,425; no diagnostic spelling is assigned there |
| S5 | Descriptor scalar-type maps merge in parent order, followed by child overrides; inherited string inference and numeric rejection are tested. | DESIGN.md:79,185 |
| S6 | The helper accepts a CompleteProfileDocument and checks required section presence/kinds before hashing the complete document. Identity-only shapes refuse profile-schema. Full syntax validation remains the loader's responsibility. | DESIGN.md:46,65–75,79,260 |
| S7 | The supplemental neutrality guard scans the receipts directory. An isolated negative test injects a synthetic forbidden token solely in a new receipt. | DESIGN.md:32 |
| S8 | A superseding receipt inventories both previously omitted suites, the seal helper and the current correction files with raw SHA-256 and byte length. Historical receipt bytes remain unchanged. | DESIGN.md:260; review S8 Gate |

The undocumented-code choice for S2/S4 is **bare refusal**, as permitted by the
review Gate. No new parity diagnostic is introduced. The compatibility preflight
uses the caller's envelope-validity fact; `validateEnvelope` performs the actual
schema/storage checks. Neither path silently accepts an invalid envelope.

`receipts/lot0-s123-fix.json` supersedes the verification inventories in
`receipts/lot0-s2b.json` and `receipts/lot0-s3.json`. It also supersedes their
historical seal-helper and expectations-test hashes. Those original records may
be used by the seal/provenance chain and are preserved byte for byte. The frozen
scope, fixtures, provenance policies and seals are unchanged.

The regression checks are not sealed expectations. The expectation author must
independently add the S2 schema/availability and invalid-envelope competing
cases, the S3 positive/order-negative pair and context restrictions for each source, and the S5 inherited
typed-field case before those additions can be claimed as sealed twin coverage.
This correction does not grant a reseal or final corpus acceptance. Existing
sealed verdicts are checked without modification; any disagreement must be
recorded separately for the expectation author.

Independent model re-review found that the same export-only context restriction
also needed enforcing on pages, semantic and occurrence references. The shared
typed-traversal guard now covers these paths; the added checks admit export and
render and refuse validation, create and an absent context. These checks also
remain unsealed and need independent expectation-author coverage.

The retained-stash gate stays open and untouched. Twin proof and final corpus
qualification remain deferred. No step 4 implementation is included.

Final verification at implementation commit `a5b9d37`: typecheck passed; all
1,974 npm tests passed, including 563 profile checks and the exhaustive seal-byte
mutation proof. The isolated browser rerun passed 483 checks outside the sandbox
after the initial sandbox's Chromium/DBus launch failure. Both independent
built-in model reviewers approve the scoped correction; their complete records
are linked from `receipts/lot0-s123-fix-review.md`.
