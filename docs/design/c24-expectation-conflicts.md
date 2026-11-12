# C24 expectation conflicts

No expectation, seal, comparator, reviewed span, or original probe assertion was changed.

## Invalid XML inputs

These sealed inputs repeat an XML ID. The registered native reader reports a duplicate-ID warning; the public parser refuses it with `invalid-semantics` before consumer evaluation. The cases stop at that boundary.

| Case | Clause | Expected | Observed |
| --- | --- | --- | --- |
| A-017 | §12 L830-831, L839, L843; §10.2 L770-803 | success | invalid-semantics |
| A-018 | §12 L831, L843; §10.2 L793 | success | invalid-semantics |
| A-019 | §12 L829, L843, L844; §10.2 L770-772 | success | invalid-semantics |
| A-021 | §12 L830-831; §12.2 L886; §10.2 L791 | free-annotation | invalid-semantics |
| A-026 | §12 L829-831, L837, L844; §12.1 L870; §9.3 L712; §12.2 L888 | success | invalid-semantics |
| A-027 | §12 L858; §12.1 L870, L876; §12.2 L897 | success | invalid-semantics |
| X-015 | §12 L830-831, L843; §12.2 L886; §10.2 L770-803; §14.2 L951 | success | invalid-semantics |
| X-016 | §12 L830-831, L843; §12.2 L886; §10.2 L770-803; §14.2 L951 | success | invalid-semantics |
| X-017 | §12 L830-831, L843; §12.2 L886; §10.2 L770-803; §14.2 L951 | success | invalid-semantics |
| X-028 | §12 L829-831, L837, L844; §12.1 L870; §9.3 L712; §14.2 L954 | success | invalid-semantics |
| X-029 | §12 L858; §12.1 L870, L876 | success | invalid-semantics |

## P-006: presence and selector assertions

Clause: §12.1 L872–874. Expected: row presence consistent with migration status and zero unallowed selector branches.

- Known exception: RV-01 at the protected export API span. Observed: one source branch and its emitted counterpart; preserved unchanged.
- Newly observed: 315 rows in 13 immutable expected artifacts require absence. Observed presence remains one per row. These artifacts retain their original bytes.
- Another 29 successor rows remain in older test programs. Their case is stopped with the same presence conflict; source and distribution policy removal is independently measured.
- I-0001 and I-0002 require historical presence, but their files were already absent at the starting head. No replacement history was created.

The exact I-number presence observations are `profile-externalization-scope.json#/summary/presenceConflicts`. No literal is recorded here.

## Starting-head failures

The phase-2 fingerprint, S123 historical inventory, and RV-01 expectation binding are deferred to the conductor final pin/rebind pass. They are separate from the new conflicts above.

## Frozen scope format

The unchanged historical freeze requires the scope file to remain exactly 1391 bytes in format /1. P-005 requires format /2 with every I-number and distribution member. The required inventory necessarily changes those frozen bytes. This blocks the freeze-dependent seal checks, the first golden-independence check, and the history guard nested corpus check. Their comparators and pins remain unchanged.

## Earlier source guard

The earlier source guard pairs LX-AT-2 against the base line hash only. New injected-policy field reads and category wrappers cannot pair with those old lines. P-006 permits appended context rows; the earlier guard has no such path. Its assertion remains unchanged.

## Earlier consumer expectations

The earlier consumer campaign also checks implicit built-in looks, token tables, descriptor exports, packaged corpus data, old helper names, projection category spellings, navigation defaults and fixed formatted-output bytes. C24 requires explicit data and removal of those source/package defaults. The preserved earlier assertions therefore remain NEW failures, separately from the three starting-head failures. The exact failing assertions are identified by test ordinal and digest in the campaign docket. No earlier expected artifact or comparator was rewritten.

In particular, the sealed synthetic compatibility style data differs from the former built-in style and offset values. It cannot be substituted into earlier fixed-byte golden tests and described as their original caller data. The independent expectations remain untouched.
