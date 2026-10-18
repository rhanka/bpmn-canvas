# Independent model re-review of the S1–S8 correction

Author: codex, requested gpt-6.1-sol, high effort.
Reviewed implementation range: `19ef11a..a5b9d37`.

| Built-in reviewer | Requested effort | Lens | Final scoped verdict | Artifact |
| --- | --- | --- | --- | --- |
| gpt-6-astra | high | Normative correctness and diagnostic precedence | APPROVE | [contracts](lot0-s123-fix-review-contracts.md) |
| gpt-6-sol | high | Regression evidence, oracle independence and inventories | APPROVE | [evidence](lot0-s123-fix-review-evidence.md) |

The reviewers worked independently and did not read peer artifacts. Requested
model metadata is recorded without claiming post-routing identity attestation.
The first review found the new occurrence-source admission also accepted
forbidden contexts. Its red test commit is `deeea0b` and correction `c28cd4e`.
The second found the same context invariant missing on the adjacent typed
traversals; red tests are `bffe7b1` and correction `a5b9d37`. Both final reviewers
approve the S1–S8 implementation and that bounded context closure. Earlier
artifacts remain in `.h2a/reviews/lot0-s123-fix/` as historical records.

One separate pre-existing observation remains: an export-context
OccurrenceHandle reference with property `bogus` is accepted, although
DESIGN.md:128 permits only sourceOccurrence and targetOccurrence. The reference
property branch predates these changes. It lies outside the supplied S3 Gate's
occurrences-source/order correction and is preserved as a nonblocking separate
selector correction, with a concrete counterexample in both review artifacts.
This review does not assert whole-selector or production-compiler conformance.

The S2/S3/S5 additional independent expectations, retained-stash gate, twin proof
and final corpus qualification remain open. No expectation author is replaced by
an implementation-authored regression or by this review.

The strict harness different-host review is **incomplete**. Automatic approval
review rejected the external Claude-hosted launch because repository/design
transfer to that destination was not specifically authorized. No external
session launched and no retry or indirect external execution was attempted.
The built-in reviewers above provide the user's requested other-model review;
they do not satisfy the harness different-host predicate.
