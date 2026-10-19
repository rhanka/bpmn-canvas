# Temporary business-content baseline

`tests/fixtures/brand-baseline.tsv` contains only repository path:line and
lowercase SHA-256, one row per distinct line/hash. It covered the 131 business
content rows classified by conductor arbitration at f3a54c5. Repeated matches
of the same hash on one line share a row, as in the supplied occurrence report.
The two confirmed leaks are excluded.

Lot 2 closure: the marker lexicon was externalized to generic annotation
names, the tracked-file guard reports zero live occurrences, and the baseline
is empty, so the release gate passes without an owner override. The pin file
is retained to keep the closed-to-additions proof working.

The tracked-file brand guard rejects every unlisted occurrence, including
tracked paths, new files, moved lines and replacement hashes. Diagnostics contain
only path:line and SHA-256. The separate frozen profile guard remains active.

The pin records the original baseline byte digest, row count and each approved
row digest. Removing any subset, including all rows, passes. Adding or replacing
a row fails even if the count stays the same or decreases. Any expansion requires
an explicit justified commit updating the pin and conductor authorization.

Lot 2 must externalize this business content and empty the baseline. Do not
refresh the baseline from scanner output to make a failing guard pass.

The legacy source, build and package gates derive a hash allowlist from the
committed baseline and its pin. Working rows may only shrink; editing the working
pin cannot authorize additions. The original path:line guard still rejects new
tracked occurrences even when their hashes are in this temporary allowlist.
Storage, prototype, watermark and global-hook checks keep their existing rules.

Commit messages allow these hashes only on
`workbench/functions-20261004-profile-lot0`, for commits in `main..HEAD` that are
not reachable from remote refs. Every other commit in `git log --all`, including
every commit reachable from `main`, remains strict. Missing main history fails
closed. The lot 0 history must be squashed at merge; lot 2 must empty the baseline.

`npm run prepublishOnly` blocks publication with a nonempty baseline. A specific
publication may proceed with a committed `docs/release/override-<version>.json`:

```json
{
  "owner": "Full name of the approving owner",
  "decision": "GO",
  "version": "<package.json version>",
  "date": "<publication date, YYYY-MM-DD in UTC>",
  "baselineSha256": "<SHA-256 of the exact baseline bytes>"
}
```

The file must match its committed bytes, the current package version, today's UTC
date and the current baseline digest. An uncommitted, modified or stale override
fails. An empty baseline needs no override. No override is granted by this change.
