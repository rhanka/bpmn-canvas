---
status: selection-failed
review-author:
  host: codex
  model: gpt-6.1-sol
  effort: high
target-ref: c1002e88cdeb3d6fafe466b7926a8b498ba5f25c plus the seven staged implementation paths
target-diff-sha256: f8bed265784488c0a5149b42a1d7764c7e254599e78d8724e83b9565c1242983
observed-failure: No live h2a peer sessions were discovered and ANTHROPIC_BASE_URL was not configured. Two eligible distinct Claude-hosted model candidates could not be resolved from a live catalog. No review legs were dispatched and no consensus verdict is claimed.
legs: []
---

The author model and effort above are the explicit task metadata, not an
attestation of routing. The target digest covers the exact bytes returned by
`git diff HEAD --no-ext-diff`, after staging the implementation and before
adding this review record.

The implementation changes only the brand predicates in the legacy source,
build, packed-file and tracked-file gates. Existing storage, prototype,
watermark, colour and source-map mapping checks retain their original logic.
The original path:line baseline guard still runs independently.

The new neutral-probe regressions cover hash filtering, working baseline
expansion and pin edits, history boundaries at main and remote refs, and
publication refusal/override/empty-baseline behavior. Overrides must be committed
and match the package version, current UTC date and baseline digest.

The history gate intentionally remains red for these two occurrences, both
reachable from main and origin/main:

| path:line | sha256 |
| --- | --- |
| git/07be09e21d852beb592314d50e0370e883c9b842:1 | 583423608eda0cb63146a67a6ad655858bc511ba6f0d4fd742c0d898b684295a |
| git/45aa6903174462e8dd95137971510f28ba5b4a19:7 | 32ed8e0a3026bc02976abc70f27ddfe1f149b8f4dc5dad00a1451dd7e86e42e9 |

The conductor's rule explicitly forbids exempting main history. Resolving those
historical occurrences requires a separate owner decision; this change neither
rewrites history nor broadens the exception.
