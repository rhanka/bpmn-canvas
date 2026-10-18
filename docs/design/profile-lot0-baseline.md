# Profile lot 0: steps 1 and 2

The accepted source baseline is `e9f5f8961ac63f7163003c0960cb20c4080147a3` on
`workbench/functions-20261004-profile-lot0`. The conductor's reconciliation
receipt is preserved with a dated delegated-execution closure record in
`tests/fixtures/profile-lot0/reconciliation.md`.
Its SHA-256 is `3e4b21a044667efc3b3b015f9b0f7fbfc2694390530aa0a4e516423ab558c4fb`.
The fix4 ref is `e9f5f89`; its identity is verified, and the reference-model
change is already committed once in that base. The reconciliation gate under
DESIGN §14.1 is **closed**:
`gateState: "closed"`, `blocksIndependentSteps: false`.
On 2026-10-15, the conductor, with git execution delegated by the owner, dropped
`stash@{0}` after re-verifying its diff against `e9f5f89`. This closure session
independently verified both reference-model diffs: 2049 bytes each, SHA-256
`94a746a6ca13c68882af01d22bcb3529a4e72ceea96bdcea24daa221d13f1a12`.
`git stash list` is empty. Object
`2116408888bcbb1105560f1af6e088bdef2dd2af` still exists as a dangling commit.
The explicit closure receipt and old/new reseal hashes are in
`receipts/lot0-reconciliation-closed.json`. The two unrelated untracked paths
listed in the frozen inputs are excluded from every staging operation.

R3.3 is the authority, SHA-256
`48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f`.
All 46 entries in `MANIFEST-R33.sha256` were verified before revalidation.
Its SHA-256 is `dbdbdbb8a61e87e76ea8e198561b86ffa1bbe86ea71a09261ab70ca31ef43dd3`.
Current provenance of the form `DESIGN.md:line` refers to those R3.3 bytes.
`design-provenance.json` pins the exact text and SHA-256 of every cited line,
extracted after checking the complete authority digest. The verifier pins this
excerpt ledger independently of the expectation seal and can check it again
against supplied authority bytes. Tests bind the exact citations to each
canonical case and each local outcome class, including positive controls;
a citation to the wrong rule fails even after a consistent byte reseal.
The earlier receipt and archived authoring utility retain explicit R3.1 history;
the R3.2 receipt records that adoption and revalidation. The R3.3 successor
`receipts/lot0-r33-seal.json` records all 45 matrix reviews, seven changed
verdicts, and the preserved verdicts of the two other disputed schema cases.
The R3.2 manifest, authoring scripts and receipts remain historical records.

The eleven section-16 defaults and three section-16.3 subchoices are ratified.
Approval of these choices does not establish implementation or parity. The
lexical refusal codes `profile-json`, `profile-json-duplicate-key`,
`profile-unicode` and `profile-number` are normative in R3.3 section 2.1.1.
The recursive source-order walk determines the first failure: key decoding,
Unicode, duplicate, colon, value; only then remaining tokens and final JSON
grammar. All lexical checks precede schema. There is no fixed code ranking.

The corpus source is the read-only `contracts/` tree at
`cb46b3b8f893996a83c056f31f8aa92aa2364bd3`. Its 198 files are vendored byte for
byte beneath `tests/fixtures/profile-parity-corpus/`, preserving the source
directory structure. The manifest is
`profile-parity-corpus/1/manifest.json`, SHA-256
`01b81fd9fb69f110a7f302631d6da92126bcb1672c67bea3ea68ff802df39faf`.
The vendored set is every regular file under `contracts/`: 21 mechanism
artifacts, 176 cases and the manifest. The upstream manifest covers the 176
cases; it does not cover the mechanism directory. No executable comparator
mentioned by the manifest lives under `contracts/`, so none is imported.
The separate final pin covers every vendored file's path, raw digest and
length, including profile artifacts not covered by the upstream case manifest.
The resolution keys are the resolved commit above and contracts tree
`0c6bf891f147079e175a46d0d34f42ff308d235c`. The accepted annotated tag
`profile-corpus-v1.0.0` and tag object
`dfb8a986933dd86ad176022df13efecb6c73b325` are metadata only.
`receipts/lot0-corpus-pin-final.json` records release acceptance and every old/new
provenance reseal; the 198 vendored blobs and all expectations are unchanged.
The old G0 mirror and comparator remain unchanged.

`tests/profile-corpus.test.mjs` reads only local bytes through Node builtins.
It checks the complete inventory, canonical manifest and every referenced
artifact. Mutation witnesses reject byte changes, missing and extra files,
manifest changes, unpinned revisions, wrong lengths, escaping and duplicate
paths, symbolic links and hard links. It never executes a reference comparator,
profile loader, compiler, interpreter, network operation or another runtime.

`tests/fixtures/profile-lot0/expectations.json` contains independently authored
mechanism expectations with normative line provenance and derivations. All 23
canonical verdicts and artifacts remain unchanged after R3.3 revalidation.
Numeric derivations now explicitly use the converted binary64 value, including
fractional spellings that round to unsafe integers. Sixty-one local hand-derived
lexical and schema-boundary witnesses supplement the immutable canonical cases.
They cover each code, all six competing code pairs in both source orders,
key-check order, nested traversal, trailing data after the walk, final whitespace
grammar, lexical-before-schema and lexical acceptance boundaries. Literal
canonical strings were authored directly; a separate SHA-256 utility processed
four explicitly authored allocator strings. The utility imports only filesystem
and crypto builtins. It has no profile or codec imports. All expected bytes are
sealed before any new profile evaluation. Tests only read expectations and
compare them to canonical artifacts; there is no regeneration from actuals.
Local positive lexical verdicts do not claim full-profile schema acceptance.
The lexically valid null control instead expects a schema refusal. No profile
text loader, compiler, interpreter or reference validator is run here.

The copied support fixture preserves the R3.1 pre-authored one-Process,
two-Process, imported-ID and atomic-refusal evidence. Vendoring that fixture
does not turn it into new independently reviewed runtime proof. Comparator IDs
are pinned as source metadata; executable comparator qualification belongs to
step 3 and is not implemented here.

The scan scope, existing hashed lexicon and scanner digest are frozen in
`profile-externalization-scope.json`. There are no notice exceptions. No
additional external lexicon or accepted consumer release artifact was supplied;
those facts remain explicit in the receipt. Complete source occurrence removal
belongs to the later externalization lot.

The source commit adds 151 compatibility cases and two lexical cases, plus
the public matrix and verdict contracts. The original 41 payload files are
byte-identical; only their manifest changed. All 486 sealed vectors retain
their inputs, expected artifacts, verdicts and expectation seal. The 45 local
compatibility vectors agree with their newly published counterparts after
mapping artifact roles (`input` to `matrixInput`, `output` to `outcome`).
`receipts/lot0-corpus-v1-revendor.json` records every vector and all byte reseals;
historical receipt test results remain evidence of their original campaigns,
with corpus provenance refreshed by this receipt. Final tag acceptance remains
a separate explicit commit.

The source commit does not contain a complete step-2 corpus: compiler outcomes
for both full profiles, effective authority tables, full C/N outputs and reports,
adversarial supports/grid/sorting cases, envelopes, snapshots, Layout/RenderData,
idMaps and compatible final bytes still require canonical publication and both
lanes' agreement. The immutable vendor tree is not extended with local inventions.
The receipt distinguishes the sealed subset from this remaining acceptance
scope. Steps 3 onward remain unstarted.
