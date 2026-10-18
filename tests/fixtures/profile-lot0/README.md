# Independent expectation seal

The sibling `profile-parity-corpus/` directory is an immutable copy of all
`contracts/` bytes at the final resolved source commit and tree. Its pin is separate from
this directory. No upstream case, profile, manifest or provenance is rewritten.

`expectations.json` revalidates the 23 canonical mechanism expectations against
the exact R3.3 design, with per-vector line provenance. Their verdicts and
artifacts remain unchanged. It adds 61 local hand-derived lexical and schema
boundary witnesses; these have literal profile-text inputs and no canonical
path. Every vector records its
authoring method and pending independent review. The four stable-ID digests use
only the explicitly authored tuple strings recorded in that file. The authoring
utility's historical R3.1 source is preserved as `author-expectations.mjs.txt`
with revision-qualified citations. `author-r32-lexical.mjs.txt` preserves the
new literal input/verdict/derivation table. CI never runs these sources and
neither offers an update-from-actual facility. Tests assert sealed data only;
lexical acceptance does not claim schema acceptance or runtime proof.

## Local envelope and verdict mapping

The 61 vectors without `canonicalPath` are lot-0-only test data, not corpus
cases. They cannot be passed directly to a canonical corpus loader. Their
`operation` is `profile-lexical-parse` for lexical acceptance, otherwise
`profile-text-load`; their `inputArtifacts` contain a literal `profile-text`
string. They omit the canonical case's `phase`, `profileArtifact` and
`comparatorIds`. A future canonical publication must select the canonical
operation and artifact representation, set those missing fields explicitly,
and obtain reviewed comparator IDs. This lot supplies no loader or adapter.

For verdict-shape comparison only, local `{status:"ok", phase:"lexical"}`
maps to canonical `{status:"ok"}`. Local refusal verdicts map to canonical
`{status:"refused", code}` by removing `phase` and `schemaReached`.
`expectedStatus` remains `ok` or `refused:<code>`. The removed fields are local
boundary assertions: lexical refusals set `phase:"lexical"` and
`schemaReached:false`; the null schema control sets `phase:"schema"` and
`schemaReached:true`. Removing them does not establish schema acceptance for
a lexical positive control, and this mapping does not publish a corpus case.

## Step-2b extension

The first 84 vectors remain unchanged. The extension adds 127 independent
vectors: 63 static-rule checks, 26 compatibility decisions, 17 envelope/revision
checks and 21 identity transitions. These are local boundary witnesses with
literal `inputArtifacts` and exact `expectedArtifacts`, not published canonical
cases or a claim that a runtime implements these operations.

`static-rule-check` isolates the named CR rule. Its subject and typed context
are an explicit test seam: syntax overlaps are compiler preflight expectations,
not full-load precedence assertions. Profile fragments use the neutral contract
grammar. Context records such as symbol graphs, registry facts and producer
admission are fixture data, not additional profile fields. Positive controls
assert that rule only, not acceptance of a complete package. Wrong common IR
field types use the specific `profile-export-field` mapping in line 763;
output-domain type errors retain CR-11's `profile-type` mapping.

Compatibility inputs state already-verified package/registry facts and check
the ordered matrix without loading synthetic releases. Envelope tests supply
native storage/support validity at the stated boundary. Revision, projection
and identity outputs carry exact values or states. `source` on a refused output
is the caller state that must remain unchanged, never a returned candidate.
Where the design requires refusal without assigning a diagnostic code, the
verdict is exactly `{status:"refused"}`: diagnostic spelling is deliberately
outside that comparator. A provenance-bound diagnostic policy records this
limitation instead of inventing an error code.

`author-step2b.mjs` is a manual authoring tool. It reads only this fixture set,
the vendored neutral contracts and the hash-verified design passed as an
argument. It contains literal decisions and constructed expected states; it
does not evaluate any profile. Its JCS/SHA-256 calculations are fully exposed in
`step2b-digests.json`, including input values, exact canonical strings and raw
XML bytes. Support outcomes are independently constructed from the design and
the fixture's descriptor/base/recipe inputs; upstream expected outputs are not
copied. The tool never runs in CI and has no update-from-actual input.

`step2b-provenance-policy.json` pins each new vector's complete citation set.
The verifier independently pins that policy and the combined exact excerpts,
so a byte reseal cannot legitimize a missing citation or a table header.
The new receipt records the separate old/new seal-file hashes, payload digest,
family counts and exact design coverage. Independent review and runtime parity
remain separate gates.

## Provenance evidence

`design-provenance.json` records the exact UTF-8 text (without LF) and digest
of all cited R3.3 lines, including the original 26. Extraction checked the full DESIGN SHA-256 before
selecting one-based lines. Its independent verifier pin and the freeze seal
bind these excerpts; per-case assertions bind their supporting rules to the
hand-derived expectations. `verifyDesignProvenance` also accepts the complete
authority bytes to repeat the source-hash and line-text comparison. Offline
tests need only the pinned excerpts and never a checkout-specific source path.

`expectations.seal.json` binds those expected bytes. `freeze.seal.json` binds the
input ledger, distinct parent identities, raw companion manifest, prerequisite
receipt and the static rule table. Neither receipt implies interpreter execution.

Canonical-source publication remains a separate dependency. The upstream
support fixture's original bytes remain unchanged. The new local support
witnesses record their independent derivations and do not relabel the upstream
expectations or claim runtime execution.

## Step-4 extension

The first 211 vectors and the step-2b citation policy remain unchanged. Step 4
adds 180 independent local vectors: 19 snapshot, 32 render contract, 15 render
digest, 24 result union, 30 report, 44 lint contract and 16 export loss cases.
All are pending independent review. They are authored data for future boundary
tests, not a runtime implementation or a published final parity corpus.

`author-step4.mjs` is a standalone manual authoring tool with only Node fs and
crypto imports. It computes JCS/SHA-256 and assembles literal expected data.
It does not load a profile implementation, run a compiler, evaluate recipes,
execute lint, lay out a document or serialize terminal export bytes. Its
56 digest calculations are exposed in `step4-digests.json`. The twenty policy
tables are derived from complete explicit settings in the two neutral profile
sources and the pinned recommended manifest, not copied from generated tables.

`step4-inputs.json` holds shared immutable values. An artifact with `fixture`
and `key` references that exact top-level value; this representation also applies
to expected artifacts and is covered by the freeze seal. An artifact with only
`fixture` addresses the whole JSON document. Literal replacement records are
test-seam instructions over those shared values; dot/bracket paths name fields,
`omit` removes the named field, and host/context facts are supplied separately.
They are not a new production patch language. No runner or adapter is supplied.

Success of a local boundary check means that named check only. Supplied native
storage, glyph admission, region bounds, graph IDs and descriptor validation
are explicit preconditions where the neutral slice cannot establish them.
The two-theme local package is a constructed neutral fixture, not a published
release. Nonempty archived DI is covered at the hashing/preservation seam;
complete native DI/DC schema validation still needs the full descriptor set.
Generated port and cascading-removal report vectors consume supplied final
records and do not execute normalization or projection.

Report artifacts carry the exact canonical JSON string, SHA-256 and structured
record. Fixture diagnostic codes in coordinate/sort cases are supplied entries,
not invented adapter mappings. Named adapter/loss cases assert only codes
assigned by the design. A bare refused verdict deliberately leaves unspecified
diagnostic spelling outside the comparator. Result timing records and side
effect assertions are expected contracts, not measured asynchronous behavior.
Session-local transaction/history tokens are supplied opaque fixture values.

`step4-provenance-policy.json` pins complete per-case citation sets alongside
the unchanged step-2b policy. The combined exact design excerpts are pinned
independently by the existing verifier. Canonical source publication, Python
differential/null-order agreement, full descriptor validation, actual upstream
lint execution, browser transaction proof and terminal byte qualification remain
deferred. No production profile code is introduced by this extension.

## R3.3 reseal

The active expectation payload, input pins, compiler-rule citations and all three
provenance policies now cite DESIGN R3.3. The earlier authoring scripts, manifest
and receipts remain historical R3.2 records. `author-r33.mjs` records the independent
literal decisions; `r33-matrix-review.json` records all 45 matrix reviews, the
additional envelope citation, and each old/new verdict. Seven verdicts change;
two other disputed schema/source cases retain their refusal with new provenance.
The successor receipt is `docs/design/receipts/lot0-r33-seal.json`.
