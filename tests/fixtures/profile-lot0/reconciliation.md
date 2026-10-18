# Lot-0 precondition §14.1 — reconciliation receipt (conductor, 2026-10-15)

- Repository: ~/src/bpmn-canvas, branch workbench/functions-20261004.
- Before: HEAD 237d9af; uncommitted change to src/io/reference-model.ts; stash@{0} "On pivot/01-moddle-io: pivot-lot1-fix4 WIP, paused on owner stop", base a2cbd65 (ancestor of HEAD).
- Identity check (conductor): the sha256 of `git diff stash@{0}^ stash@{0} -- src/io/reference-model.ts` equals the sha256 of the diff in commit e9f5f89 for the same file: 94a746a6ca13c68882af01d22bcb3529a4e72ceea96bdcea24daa221d13f1a12.
- Decision (conductor): commit the change alone. Result: e9f5f8961ac63f7163003c0960cb20c4080147a3, parent 237d9af, "fix: collaboration artifact ownership and canonical association endpoints", no attribution trailer, not pushed.
- Tests reported by bpmn-canvas:
  - typecheck exit 0;
  - with the change, the a2cbd65 files + colored + legend pass 602/602;
  - without it (237d9af), the three a2cbd65 files fail 21 of 560;
  - full suite 1380/1382, and the 2 browser tests that failed under parallel contention pass when rerun alone.
- Remaining: stash@{0} is kept and is a byte-identical duplicate of e9f5f89 for this file. Its fate is an owner decision (pending). It does not block lot 0.
- Working tree after the commit: untracked tmp/ and docs/design/0.3.1-layout-on-load.md only (untouched).
- Baseline for lot 0: e9f5f89.

## Disposition update — delegated conductor execution, 2026-10-15

The historical conductor receipt above is preserved. Its retained-stash status
is superseded by this dated closure record. The owner delegated git execution
to the conductor, who dropped `stash@{0}` after re-verifying that its
`src/io/reference-model.ts` diff equals the diff committed in `e9f5f89`.
Both diffs are 2049 bytes; SHA-256:
`94a746a6ca13c68882af01d22bcb3529a4e72ceea96bdcea24daa221d13f1a12`.

This closure session independently verified:

- `git stash list` exits 0 with empty output.
- `git cat-file -t 2116408888bcbb1105560f1af6e088bdef2dd2af` returns `commit`.
- `git fsck --no-reflogs` reports `dangling commit 2116408888bcbb1105560f1af6e088bdef2dd2af`.
- `git diff 2116408888bcbb1105560f1af6e088bdef2dd2af^ 2116408888bcbb1105560f1af6e088bdef2dd2af -- src/io/reference-model.ts`
  and `git diff e9f5f89^ e9f5f89 -- src/io/reference-model.ts` have the identical
  digest and length recorded above.

Under DESIGN §14.1, `gateState: "closed"`, `blocksIndependentSteps: false`.
The accepted baseline remains `e9f5f89`. This session performed read-only stash
verification. The explicit receipt and old/new reseal hashes are recorded in
`docs/design/receipts/lot0-reconciliation-closed.json`.
