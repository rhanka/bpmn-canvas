# Finding #24: sealed externalization expectations (block B, lot 5)

This directory seals what the block B implementation of finding #24 must satisfy: the occurrence
ledger of every hard-coded business policy of the base tree and of its npm distribution, the shape of
the injected business data that replaces those policies, the expectations of the legacy adapter for
every consumer, the substitution vectors between two neutral data sets, and the exact assertions the
acceptance probes must satisfy once green.

## Authorship and status

- Spec author: Opus (`claude-opus-5-5`), owner exception for this seal.
- Independent reviewer: gpt-6-astra, max effort. First review: REWORK (2 BLOCKER, 4 MAJOR, 1 MINOR) on
  the seal with SHA-256 `d432a1d5cb3a727debc7d51dffa2fd1446a30d64a5c97d645108dd1b58777ff5` (90 cases,
  2173 line groups). The single seal fix round produced the seal
  `0b17ff222da3332f06e622dc787cbe9c42d9c4050a53a58a27e1b7156dfb1d8c` and the integration micro-reseal of
  block B the seal `e47a3328828d3d6a77370a83d8704657a00301136b83261e7cb9ebf11dbf225f` (section "Integration
  micro-reseal"). The next revision restored one folded classification code point (section "Unicode literal
  restoration") and bound six more reviewed occurrences in three files eligible by exact path (section
  "Reviewed occurrences", "Exact-path relink"): the seal
  `c3e99dc5e8544a6de0e04423516fcd28fcd7d16ac004ef010e526ccb4af0898b`. The next revision sealed one reviewed
  allowance of the selector-branch rule, for a technical key of a block B module (section "Reviewed
  selector-branch allowance"), and rebound seven reviewed records of three lot-5 files (section "Reviewed
  occurrences", "Lot-5 CR-10 rebind"): the seal `682ac140cef29f74c0092a8f6b1e64f77e8959b1b1f003dce893da7b56cfe746`.
  The next revision relocated three base rows of `src/react/workshop.tsx` whose lines a block B edit changed, the
  residual of the I1 scan (section "Reviewed occurrences", "Relocated base rows"): the seal
  `7f15b3512dd4ccd7b9e355f0b834a65adbdba654f2c52996011b84e741cb27ac`. This revision is the block B final spec pass
  after the fix round (section "Reviewed occurrences", "Final spec rebind"): it rebinds the reviewed records and the
  reviewed allowance RA-01 to the bytes that the fix round and the lot-3 and lot-4 reseals left, reviews eleven
  occurrences of two block B tests eligible by exact path (one new token, RV-13) and retires the three relocated
  rows, whose base lines the fix round restored; its digest is `seal.json`, pinned by
  `tests/x24-externalization-seal.test.mjs`.
  `docs/design/receipts/block-b-x24-history-guard.json`, `docs/design/receipts/block-b-x24-unicode-literals-fix.json`,
  `docs/design/receipts/block-b-x24-p006-selector-allowance.json`, `docs/design/receipts/block-b-x24-i1-relocated-rows.json`
  and `docs/design/receipts/block-b-x24-final-spec-rebind.json` record the old and new values of every file each of
  the five rounds changes; the second also records the old and new values of the exact-path relink (`relinks`).
- Authorities, in precedence order: DESIGN.md R3.3 (SHA-256
  `48139f5fd5bd789eacbf271081a95432c54d8361b1e52404e3443a25fa65782f`), the block B seal harmonization
  (section 3.4, X24, and section 7, hygiene residual HY-1), the review findings. Clause references are
  `§section Lline` or `DESIGN.md:line`.
- Base: commit `05f737885bd44fddea84bf1b4d55ae5428704855`, tree `94f58f93ce56ce61e35976aa8d91d12a71f786b9`,
  package `@sentropic/bpmn-canvas` 0.4.0 as packed by `npm pack --dry-run` after `npm ci && npm run build`.
- Production code is written later by another model, against these files, without changing them.
- Independence: no block B implementation was read or run. No expected value comes from the output of a
  product module, codec, layout, renderer, exporter or command; nothing was updated from actual output.
  Expected values are read from the cited base lines and DESIGN clauses, or computed by
  `derive/arith.mjs`, a hand re-implementation of the legacy formulas parametrised by the injected data.
  The strengthened probe was dry-run at the base with a scope file built from the sealed ledger, its
  classifier test skipped and no product module loaded (logic check only, see "Probe expectations").

## Fix round

| Finding | Correction | Evidence |
| --- | --- | --- |
| BLOCKER 1, literals in public files | Every lexicon literal is matched by hash only, including the fixed code fragments formerly written as escaped regular expressions; rule prose, masked paths and cases carry no scanned literal; the probe keeps its original classifier assertion in a literal-free form proven equal to the base lines. | Seal test "no ledger field and no sealed file equals or contains a scanned literal" (rules R1 to R4 with witnesses), case L-006. |
| BLOCKER 2, line groups | One ledger row per match with its column span: 3381 I-numbers instead of 2173 line groups; repeated literals of one line are separate rows; member occurrences are listed one by one (2445) with the rows that explain them. | `derive/base-check.mjs` rescans every base file and recomputes every row, `derive/ledger.mjs` the whole ledger (reviewer commands); the seal test "the ledger has one row per occurrence" checks every row against its rule, its lexicon entry and the literal set. |
| MAJOR 3, rescan | `derive/scan.mjs` (lexicon format `x24-scan-lexicon/2`) decodes escapes, joins `+` chains over any number of lines, folds constant template substitutions and decodes JSON strings; the probe enumerates the actual pack list; no path is excluded; zero-list and selector-branch exceptions are span- and hash-bound records of the scope file, limited by sealed kinds and allowances. | Seal test "the pinned scanner finds escaped, concatenated and template forms and selector branches"; `probe-expectations.json#/rescan`. |
| MAJOR 4, prose comparators | `derive/comparators.mjs` gives every comparator id executable semantics; it and the modules it relies on are pinned by SHA-256 in `seal.json#/executables` and `manifest.json#/executables`. | Seal test "the pinned comparators accept the sealed values and reject wrong outputs": 103 cases accept their sealed values and 459 wrong observations are rejected. |
| MAJOR 5, coverage | Exports seal complete draw.io cells (vertex and edge geometry), Sparx models (shapes, bounds, waypoints) and reference pages; the full layout, the facts descriptor and the static, preview and workshop surfaces have their own cases; unchanged inputs are asserted (`x24-state/1`); every leaf field of the three data sets is varied once (`dimension-coverage.json`). | Groups A, R and X; "Dimension coverage". |
| MAJOR 6, refusal stage | Two roles matching one text refuse `profile-ambiguous-notion` at recognition (§2.3 L154, S-009); overlapping prefixes are admitted at load (S-024) and unambiguous texts classify (S-025); the load-time overlap rule is removed (§2.4.1 L182). | Seal test "the data sets are admissible ...". |
| MINOR 7, import hygiene | Helper imports are read from tokens: any statement position, comments and line breaks, static and re-export declarations, dynamic `import()`, `require` (also as a member), `eval`, `Function`, `createRequire`, process hooks, computed global access and code-loading module names. | Seal test "derivation helpers import no ...": 27 forbidden witnesses, 9 allowed controls. |
| Harmonization 3.4 | `business-policy/1` is explicit compatibility data of the legacy adapter, never a projection of a compiled profile; its recognition semantics are the twin ones (leading trim of DESIGN.md:152, exact code-point prefix, Unicode 15.0.0 full upper case from the lot-0 `unicode-case/1` table, read by digest in `derive/arith.mjs`). Profile-path consumers evaluate the compiled profile (X-020 to X-023). | `policy/business-policy-1.schema.json#/$comment`, "Injected business data". |
| Harmonization 7, HY-1 | The private legacy descriptor type name entry is hash-only, like every other literal entry. | `lexicon.json`, rule R1. |

The branch commits made before this round still carry literals; by the conductor's history rule they
never leave the branch and are replaced by the block B squash. This round rewrites no history.

## Integration micro-reseal

Two findings of the block B integration, after the seal was replayed onto the integration branch:

| Finding | Correction | Evidence |
| --- | --- | --- |
| Test history guard (`tests/test-history-guard.test.mjs`, "should reject test Git object reads"): the seal test and the probe defined a Git helper with an `(args, options)` signature and read objects computed from the ledger (the base tree listing and its blobs), outside main and the closed published allowance. Such objects do not exist on a fresh squash or on main. | The guard is unchanged. The seal test reads no Git object and imports no process module: the hygiene matches `literal-set.json`, a hashed record per distinct ledger literal; the witnesses use synthetic literals added to a copy of the lexicon; the base probe lines are bound by digest and span; the base-dependent recomputations are the reviewer commands `derive/base-check.mjs`, `derive/literal-set.mjs` and `derive/ledger.mjs` (section "Commands"). The probe keeps one Git call, the index listing `git ls-files`, through the allowed rest-parameter wrapper; it reads the two base markers it materializes from tracked occurrences with their literal SHA-256, which stay in the tree after the migration (`probe-expectations.json#/probe1/literalSource`). | Guard 14/14. Seal test "no ledger field ...": 0 hits with the hashed set; equivalence of hashed and text matching checked on every sealed string and on 2457 synthetic contexts around every base literal (0 differences, recorded in the receipt). `derive/base-check.mjs`: 3381 rows, 189 literals, 17 base branch rows, 0 failures. |
| History rule I1, zero-literal scan of the tree (strict `derive/scan.mjs` over `git ls-files`, every occurrence paired with a ledger row): 596 unmatched occurrences, all in files of the block B lot 3, lot 4 and lot 5 seals, none in an x24 file. | Each occurrence was classified by token. Class (b), 567 occurrences of 12 tokens: generic words, published legacy API values and homographs; each token is reviewed in `lexicon.json#/reviewed` with its justification (section "Reviewed occurrences") and its occurrences are bound by path SHA-256, file SHA-256 and span, so the strict scan no longer reports them; no entry, matcher or hash leaves the lexicon. Class (a), 29 occurrences of 2 business tokens in lot-5 files: not reviewed, listed with their positions; their removal belongs to the lot-5 seals (section "Reviewed occurrences"). | `derive/reviewed.mjs`: 3972 occurrences, 3376 paired, 567 reviewed, 29 unmatched (class a). Seal test "every reviewed record ...". |

Lot-5 relink. The 29 class (a) occurrences were removed by the integration micro-reseal of the JS lot-5
seal (`docs/design/receipts/block-b-lot5-reseal.json`): the `en` text of the palette entry
`reference-create` of the neutral UI profile became the neutral label "Reserved band" and the file name of
the import-attributes witness of the lot-5 seal test became `neutral-descriptors.json`; the profile, case
and manifest digests they feed were re-derived. `derive/reviewed.mjs --write` then rebound the reviewed
records of the 97 lot-5 files whose bytes changed (their file SHA-256, and the spans of three records of the
lot-5 README, whose lines moved); no token, class, file set or count changed. `ledger.json` changes only by
`inputs.lexicon` (derived by hand and byte-identical to the normative `derive/ledger.mjs` recomputation on a
checkout of the base commit), the cases L-001 to L-004, L-006, P-005 and P-006 and `manifest.json` only by
the digests of `lexicon.json` and `ledger.json`. I1 after the relink: 3943 occurrences, 3376 paired, 567
reviewed, 0 unmatched. This seal supersedes the intermediate seal of this round,
`39d766b4ba9783efb159e9d1838a5317ab6c624f1b15d1cec1008b0fe54c4125` (I1: 29 unmatched of class (a)).

## Unicode literal restoration

The lot-3 Unicode audit of the block B seals (section 5 of its report) found one code point folded by the
marker rename of the fix round. DESIGN.md:152 requires classification vectors with "empty, leading NBSP/BOM,
U+0085, mixed case and astral characters"; the third vector, written with a leading U+00A0 at the first seal,
started with U+0020 since that rename. No classify text led with U+00A0 any more, so a recogniser whose leading
trim omits U+00A0 passed A-001. The other vectors of DESIGN.md:152 (leading U+FEFF, U+0085, U+200B and
U+1D400, the empty text, mixed case) were intact.

| Item | Change |
| --- | --- |
| Restored vector | Index 2 of the classification vectors: U+00A0 in place of U+0020 before the synthetic application marker. No other code point and no business literal is restored; the renamed markers stay synthetic. |
| Source | `derive/author-cases.mjs` writes the vector block in ASCII, every non-ASCII code point as a braced escape (U+00A0, U+FEFF, U+0085, U+200B, U+00DF, U+1D400); the other values of the block are unchanged. |
| Cases | The eight cases that read the block, A-001 to A-004 and X-001 to X-004, change at index 2 only: `text` in the vectors and results and, in X-001, `displayName` (the text of an unrecognised vector). Recognition, roles, kinds, names and the X `differences` are unchanged. |
| Discrimination | Under the legacy-shaped synthetic set the role trim is `ecma262-2024-start`, which removes U+00A0, so the vector is recognised as the application role: a trim omitting U+00A0 now changes row 2 of A-001, A-002 and A-003 (before: no row); the flat kind of A-004 does not depend on it. X-001 to X-004 read neutral A and B, which do not recognise the synthetic legacy markers: there the vector is unrecognised under any trim, as at the first seal; these cases reject W-X1, and the wrong trims of W-A1 are rejected in group A. |
| Derived files | `manifest.json` (the eight case digests) and `seal.json`. `dimension-coverage.json` and the clause table regenerate byte-identical. |

The seal test checks permanently that each of the eight cases carries vectors led by U+00A0, U+FEFF, U+0085,
U+200B and an astral code point and the empty text, and that A-001 rejects each wrong trim named by W-A1 (one
omitting U+00A0 or U+FEFF, one taking U+0085 or U+200B). The eight cases were re-derived by hand with an
uncommitted standalone Node helper written from DESIGN.md:152 and the operation catalogue (built-in modules
only; no module of `src/` or `dist/` and no derivation helper of this seal): it reproduces the old sealed values
from the old vectors and the eight regenerated cases byte for byte from the restored ones.
`docs/design/receipts/block-b-x24-unicode-literals-fix.json` records the old and new values, the old and new
digest of every changed file and the rows each wrong trim changes before and after.

## Reviewed selector-branch allowance

Conflict. The selector-branch rule of P-006 (`probe-expectations.json#/rescan/selectorBranch`) reports one
branch of block B that no sealed allowance covers: a bare object-literal key (use `key`) at
`src/profile/lot4-export.ts:834`, columns 4 to 12, entry LX-TH-3, literal SHA-256
`fe6d3468cf5c74d8ec2a95b40f2e05338c37a4202f8fad692d2b64a9cf9b468a` (token RV-01), file SHA-256
`ff95aa59219e256e290e13039df70d2fb1e80d049404c27567c03d0ba4da5363`. The RV-01 record binds this span for the I1
scan, but the selector-branch rule ignores the records; the two base allowances name base rows of other modules,
and this file has no base row. The other branches the rule finds in `src/` at block B head `cb7999f` are the
fifteen base inject rows of `baseBranchRows`, which the code removes, and the two branches of the base
allowances.

Ruling: technical. The key belongs to the request object that the lot-4 pre-normalize lint passes to
`runLintSync`: it is the optional caller witness of the upstream lint settings (rule name to severity and
options) of the exported interface `LintRunRequest` (`src/profile/lint-bridge.ts:223`, base row I-0960), and
its value is the same-named property of the `compileLintPolicy` result (`src/profile/lint-contracts.ts:47`,
I-0965), compiled from the validation table of the injected profile. `runLintSync` refuses any other value
(`lint-config-incomplete`, `src/profile/lint-bridge.ts:265-267`) and executes its own compilation
(`src/profile/lint-bridge.ts:273-289`). Reasons:

- DESIGN.md:729 and 837, the clauses the rule enforces: look names are legacy aliases of injected compatibility
  data, generic code uses opaque theme ids and never classifies from the selected look. The key is none of the
  shapes the rule targets (a comparison operand, a case label, a key of a table indexed by look names: W-A10,
  W-R5): it names a field, no theme id or look name flows through it, and nothing is classified from it.
- DESIGN.md:859, the last row of the inventory (L825-859): the inventory removes business dispatch inferred from
  names (the name heuristic of navigation, the look and marker dispatch of L830-837); no row lists the lint
  request vocabulary, and this key infers nothing from a name, since its value is compared by deep equality
  with the compiled record.
- DESIGN.md:865-870: a JS row is checked against the package declarations too. Both declarations are
  byte-identical on main (`63a9258`) and ship in its package declarations (`dist/**`; their modules export them,
  the `./profile` and `./profile-lint` entries do not re-export them); they carry no policy value
  (L870, no residual policy through a secondary entry), only a typed slot for data compiled from the injected
  profile. A declaration published on main is not renamed by a seal (OPEN-LEGACY, DESIGN.md:899).
- DESIGN.md:872: generic words are reviewed as context matches; LX-TH-3 is an entry of kind context and RV-01 is
  the review of this token in this exact file.
- DESIGN.md:874: an exception is exact, reviewed and narrowly anchored, with no wildcard exemption.
- Base precedent: the same key in the same lint call shape is the base allowance I-0969 (`src/profile/validate.ts`,
  rule R-093); the base keeps every occurrence of the token in the two declaration modules as the context-generic
  rows I-0960 to I-0968 of the same rule.

Allowance. `probe-expectations.json#/rescan/selectorBranch/reviewedAllowances` holds RA-01: the reviewed token
RV-01, the module, its file SHA-256, the span, the use, entry and literal, `count` 1, the backing rows I-0960
and I-0965 of rule R-093 and the reason. `reviewedAllowanceRule` gives its semantics and `exceptionRule` names
it: a scope selector branch exception whose row is `RA-01` binds one branch of the module (in `src/`, or in a
package member attributed to it) only while the module file keeps the sealed SHA-256 with the branch at the
sealed span, the RV-01 record binds that span at those bytes and the scope rows I-0960 and I-0965 have status
retained-context; at most one branch per scanned file. Any byte change of the module voids RA-01, and its
branches count again. The two base allowances, the entries, the scan rule, the scanner and the five assertions of
P-006 are unchanged: every other branch still counts.

Files. The round also carries the X24 rebind that the lot-5 CR-10 seal left pending (section "Reviewed
occurrences", "Lot-5 CR-10 rebind"). Changed: `probe-expectations.json` (RA-01, its rule, the exception rule
and the scope format text), the selector-branch check of the probe, `lexicon.json` (seven rebound records),
`ledger.json` (`inputs.lexicon` only), the cases L-001 to L-004, L-006, P-001, P-005 and P-006 (the digests of
`lexicon.json`, `ledger.json` and `probe-expectations.json` only), `manifest.json` (their digests),
`derive/seal.mjs` (authorities, status, previous seals), this README, `seal.json` and the seal test (pinned
digest, receipt chain, RA-01 checks). `literal-set.json`, `classification-rules.json`, `dimension-coverage.json`,
the clause table and the other 103 cases are byte-identical.
`docs/design/receipts/block-b-x24-p006-selector-allowance.json` records the old and new values.

Final spec rebind. The block B fix round moved the key from line 834 to line 867 of `src/profile/lot4-export.ts`
(file SHA-256 `7001eb0ec1176015a694b2fe9a39489cc90ef99ad8ab6c5fb68927cf27cbaf9d`). The line is byte-identical: the
key keeps columns 4 to 12 in the same request object of the same `runLintSync` call of the lot-4 pre-normalize lint,
its value is still the same-named property of the `compileLintPolicy` result, and it is still the only look selector
branch of the module. The two declarations it belongs to are unchanged (`src/profile/lint-bridge.ts:223`,
`src/profile/lint-contracts.ts:47`). RA-01 keeps its reviewed token, use, entry, literal, count, backing rows and
reason; only `sha256`, `line` and `endLine` change (section "Reviewed occurrences", "Final spec rebind"). In the
build of this tree the package member attributed to the module carries the branch at
`dist/profile/lot4-export.js:886`, columns 8 to 16 (a scope exception of the code, not a seal value).

## Gate summary

| Item | Count |
| --- | --- |
| Occurrence rows (I-numbers), one per match | 3381 (path 28, raw 3353), 0 unmatched |
| Distribution member rows (D-numbers) | 203 (71 carry occurrences, 132 clean); 2445 member occurrences, 0 unexplained |
| Module rows (M-numbers) | 15 |
| Classification rules | 184, hand-audited, first match |
| Pinned legacy values | 11 fields, SHA-256 only |
| Cases | 111: L 6, S 28, A 29, R 10, X 31, P 7 |
| Comparator witnesses | 103 accepted, 459 rejected |
| Hashed literal set | 189 distinct ledger literals (`literal-set.json`) |
| Integration scan I1 | 598 reviewed occurrences of 13 tokens in 185 files (`lexicon.json#/reviewed`) and no relocated base row (`lexicon.json#/relocated`); every other occurrence of the tracked tree pairs with a ledger row or is unmatched; at the final spec pass (block B head `20370d3` with this round): 3974 occurrences, 3376 paired, 0 relocated, 598 reviewed, 0 unmatched (counts at each relink: sections "Integration micro-reseal" and "Reviewed occurrences") |
| Relocated base rows | 0 (RL-01 to RL-03, rows I-1427, I-1462 and I-1464 of `src/react/workshop.tsx`, retired by the final spec pass: the three occurrences pair with their base rows again) |
| Selector-branch allowances | 2 base (rows I-0757, I-0969), 1 reviewed (RA-01, `src/profile/lot4-export.ts:867`) |

## Contents

| Path | Role |
| --- | --- |
| `lexicon.json` | Scan lexicon (`x24-scan-lexicon/4`): 37 entries in 14 families, scan forms and keys, every literal by hash; the reviewed occurrences (`reviewed`) and the relocated base rows (`relocated`, none current) of the integration scan. |
| `literal-set.json` | Hashed literal set of the seal hygiene: one record per distinct ledger literal (SHA-256, length, entry, edge classes, prefilter). |
| `classification-rules.json` | 184 first-match rules giving each occurrence its category, consumer, current policy, target and disposition; 15 module rows. |
| `ledger.json` | The occurrence ledger: base, inputs, summary, targets, files, modules, occurrences, distribution members. |
| `legacy-values.json` | Canonical SHA-256 of each base business value, with its source lines; values are not copied. |
| `policy/business-policy-1.schema.json` | Syntax of the injected business data (`business-policy/1`). |
| `policy/policy-neutral-a.json`, `policy/policy-neutral-b.json` | The two neutral data sets of the substitution group. |
| `policy/policy-legacy-synthetic.json` | Synthetic data in the legacy shape, used by the legacy adapter group. |
| `inputs/` | Synthetic BPMN, draw.io, layout-model and facts-descriptor inputs. |
| `cases/` | 111 `profile-parity-corpus/1` cases. |
| `manifest.json` | Corpus manifest: comparators, pinned executables, file digests, case index (group, consumer, clauses, the wrong implementation each case rejects, data sets read). |
| `comparators.json` | Comparator ids and their summaries; the semantics are `derive/comparators.mjs`. |
| `dimension-coverage.json` | For every leaf field of the three data sets: its single mutation and the cases whose outputs change. |
| `probe-expectations.json` | Exact assertions of the two acceptance probes, the post-migration rescan rules and the seal hygiene rules. |
| `derive/` | Derivation helpers and pinned executables (Node, built-in modules only). |
| `seal.json` | SHA-256 and byte length of every file above, of the sealed files outside this directory and of the pinned executables. |

Sealed files outside this directory: `tests/profile-externalization.probe.mjs` (strengthened probes) and
`docs/design/block-b-x24-expectations.md` (clause to case table, generated by `derive/clause-table.mjs`).
`tests/x24-externalization-seal.test.mjs` verifies the seal and pins the digest of `seal.json`.

## Method

### Occurrence ledger

Scope. Every path of the base tree (797 tracked files) and every member of the package (`npm pack
--dry-run --json --ignore-scripts`, 203 members, including built `dist/`). The two sets are scanned
separately: an occurrence row belongs to a tracked file, a member record to a package member.

Lexicon. `lexicon.json` holds the families of DESIGN §12 rows L825-859 and the symbols listed at §12.1
L872: role markers, classification API, private descriptor names, metrics tables and the ambient
decomposition, the attachment retarget, navigation heuristics, the legacy layout type vocabulary and
reserved labels, presentation geometry and colours, export styles and decoding, palette data, look
selectors and token tables, private identifiers, protected brand words and escaped markers. Entries marked
`audit` were added while reading every hit of the base. Every literal is matched through the SHA-256 of its
normalised key: regular expressions of a generic shape with hashed keys, fixed-length windows with hashed
texts (a polynomial rolling hash is only the prefilter), and the hash-only brand helper
`tests/helpers/brand.mjs`. A regular expression without hashes is a structural pattern that names no
literal (runs of advance-width digits, the default token table name shape, escaped brackets). No scanned
literal, nor an escaped, split or concatenated form of one, is written in this repository's seal files.
Format `x24-scan-lexicon/3` adds the reviewed occurrences of the integration scan (section "Reviewed
occurrences"); the entries, matchers and hashes are those of format /2. Format `x24-scan-lexicon/4` adds the
relocated base rows of the integration scan (section "Reviewed occurrences", "Relocated base rows"); the
entries, matchers, hashes and reviewed records are those of format /3, and the pinned scanner does not read
the relocated rows.

Forms. Each text is scanned as its path (line 0) and line by line (`raw`). JavaScript, TypeScript and JSON
files are also scanned as `token`: every constant string with escapes decoded (`\xHH`, `\uHHHH`,
`\u{H..}`), constant fragments joined across `+` on any number of lines and constant template
substitutions folded, nested templates included; a non-constant part splits the constant (dynamic policy is
covered by the two-profile runs, DESIGN §12.1 L874). Markup, CSS and percent escapes are decoded in the
`decoded` form. A token or decoded match that overlaps a raw match of the same entry is the raw occurrence.
Text members are decoded as UTF-8, binary members (containing NUL) as latin1.

Occurrences. One row per match: matches of one entry are leftmost-longest and never overlap; two entries
may match the same span. A row records `id` (stable I-number), `file` (masked path), `line` (0 for the
path), `column`, `endLine`, `endColumn` (0-based UTF-16 offsets, end exclusive), `form`, `entry`, `family`,
`literal` (SHA-256 of the exact matched text), `key` (SHA-256 of its normalised key), `lineSha256`, `rule`,
`category`, `consumer`, `policy` (current hard-coded policy, prose without literal), `targetRef` (a key of
`ledger.json#/targets`: the injected-data target and the legacy-adapter mapping), `disposition` and
`designRefs`. A masked path replaces every hashed literal it contains by `{<entry>:<first 8 hex digits of
its SHA-256>}`; `ledger.json#/files` maps each masked path to the SHA-256 of the real path, the git blob
id, the file SHA-256, byte length, line count and binary flag.

Distribution. Each member is attributed to its sources: tracked file, ESM module or declaration (from
`src/`), generated CSS module, data URI extracted from CSS, copied file, generated corpus, third-party asset
or metadata, browser bundle and source map. Source maps are decoded (Base64 VLQ): their `mappings` are
never scanned as text; `file`, `sources` and `names` are. A bundle occurrence is attributed through the map
to its original source; one attributed to `node_modules/<package>` is third-party and allowed only for the
(package, entry) pairs of `probe-expectations.json#/rescan/thirdPartyAllowlist`. Every member occurrence
lists the rows that explain it (same entry and literal, or same entry for the folded metrics tables of
entry `explainBy: entry`) or its third-party package: 0 unexplained.

Classification. The first rule of `classification-rules.json` whose path (on the masked path), kind,
lines, families, entries, keys and forms match an occurrence gives its row fields. Each rule was audited by
listing all its occurrences at the base and reading the lines; an occurrence that no rule matches fails
the build. Counts by family: theme 1592, descriptor 559, presentation 483, type-vocabulary 158, marker
140, attachment 88, export-style 85, classification-api 82, navigation 81, metrics 71, palette 41,
private 1. By disposition: test-input 1310, inject 600, doc-update 356, neutral-successor 344, replace
261, context-generic 175, history-record 161, legacy-api 148, remove 21, retain-notice 5. The disposition
vocabulary is `classification-rules.json#/vocabulary/disposition`.

### Commands

Normative recomputation (comparator `x24-ledger/1`), in a checkout of the base commit with this directory
present, after `npm ci && npm run build`:

```
git ls-tree -r --name-only -z 05f737885bd44fddea84bf1b4d55ae5428704855 > files.lst
npm pack --dry-run --json --ignore-scripts > pack.json
node tests/fixtures/x24-externalization/expectations/derive/ledger.mjs --files files.lst --pack pack.json \
  --base 05f737885bd44fddea84bf1b4d55ae5428704855 --tree 94f58f93ce56ce61e35976aa8d91d12a71f786b9 --out ledger.json
cmp ledger.json tests/fixtures/x24-externalization/expectations/ledger.json
node tests/fixtures/x24-externalization/expectations/derive/legacy-values.mjs --files files.lst --out legacy-values.json
cmp legacy-values.json tests/fixtures/x24-externalization/expectations/legacy-values.json
node tests/fixtures/x24-externalization/expectations/derive/policies.mjs
node tests/fixtures/x24-externalization/expectations/derive/inputs.mjs
node tests/fixtures/x24-externalization/expectations/derive/author-cases.mjs
node tests/fixtures/x24-externalization/expectations/derive/clause-table.mjs
node tests/fixtures/x24-externalization/expectations/derive/seal.mjs   # prints the digest of seal.json
```

`--root <dir>` reads the tracked files from a checkout or an extracted tree of the base (`git archive
<base>`) and `--pack-root <dir>` the members from the directory where the base was built. The seal author ran
this recomputation in the fix round (ledger, legacy pins, data sets, inputs and cases byte-identical to the
sealed files) and again in the integration micro-reseal on a checkout of the base commit whose 203 built
members carry the sealed digests: the ledger differs from the fix-round ledger only by `inputs` (the
digests of `lexicon.json` and `derive/scan.mjs`).

Base-dependent checks of the seal test before the micro-reseal, now reviewer commands (the test campaign
reads no Git object), from the repository root with `files.lst` as above:

```
node tests/fixtures/x24-externalization/expectations/derive/literal-set.mjs --files files.lst --root <base> --out literal-set.json
cmp literal-set.json tests/fixtures/x24-externalization/expectations/literal-set.json
node tests/fixtures/x24-externalization/expectations/derive/base-check.mjs --files files.lst --root <base>
```

`derive/base-check.mjs` recomputes every occurrence row from the base files, the hashed literal set, the
look selector branches of the base `src/` files (`probe-expectations.json#/rescan/selectorBranch/baseBranchRows`),
the base probe lines and the materialization of the literal-free probe call, and the history rows of the
materialized literals; it checks every relocated row of `lexicon.json#/relocated` whose post-base line the
current tree (the repository root) still holds against the base line of its row (section "Reviewed
occurrences", "Relocated base rows"); it prints counts and exits 1 on any failure.

Integration zero-literal scan (history rule I1) and reviewed bindings, from the repository root of the
integration tree:

```
git ls-files -z > tracked.lst
node tests/fixtures/x24-externalization/expectations/derive/reviewed.mjs --files tracked.lst           # scan only
node tests/fixtures/x24-externalization/expectations/derive/reviewed.mjs --files tracked.lst --write   # rebind
```

The first form prints the counts (paired, relocated, reviewed, unmatched) and every unmatched occurrence
(masked position, form, entry, literal digest prefix) and exits 1 if one remains; `--write` rewrites the
bindings of `lexicon.json#/reviewed` from the current eligible files, never the relocated rows, and is
followed by a regeneration of `ledger.json` (its `inputs` name the lexicon digest), the cases, the clause table
and `seal.json`.

Cross-check of a structural entry with grep (raw form only; hashed entries exist only in
`derive/scan.mjs`): `git grep -n -I -P -e '<pattern>' <base> --` lists the lines carrying its raw hits.
PCRE and ECMAScript differ on a few constructs; `derive/scan.mjs` is normative.

### Legacy value pins

`derive/legacy-values.mjs` reads the cited base lines as text with a small literal tokenizer (no import or
execution of those sources) and records, per field of the legacy `business-policy/1` record, the canonical
SHA-256 and the source spans: `classification`, `attachment.applicationHost`, `metrics.tables`,
`navigation`, `presentation.layout`, `presentation.looks`, `presentation.legacyOptions`,
`presentation.exportStyles.drawio`, `presentation.exportStyles.decode`, `presentation.palette`,
`exportFacts`. Where the base holds one value twice, the helper checks that both copies agree. The private
integration runs case L-005 with its own record.

### Cases

`derive/author-cases.mjs` writes every case, `dimension-coverage.json` and `manifest.json`. Each case is a
`profile-parity-corpus/1` record `{caseId, operation, phase, profileArtifact, inputArtifacts,
commandArtifact?, expectedArtifacts, expectedStatus, comparatorIds}`. Its first input artifact has role
`clause`: it cites DESIGN R3.3 (digest and clauses) and is provenance only, never passed to the operation.
Expected status is `success` or `refused:<code>`; no expected output is empty. A text vector of the form
`{concat: [...]}` names base literals by ledger row (`{literal: <I-number>, sha256}`); the harness
materializes it from the base tree at the row's span, or from a tracked occurrence with the row's literal
SHA-256 (the probes, `probe-expectations.json#/probe1/literalSource`). The manifest case index names the group, consumer,
clauses, the wrong implementation (`W-*`) the case rejects and the data sets the outputs read.

### Literal-free seal

`probe-expectations.json#/sealHygiene` fixes four rules over every file of `seal.json`, the seal test and the
reseal receipts `docs/design/receipts/block-b-x24-history-guard.json`,
`docs/design/receipts/block-b-x24-unicode-literals-fix.json`,
`docs/design/receipts/block-b-x24-p006-selector-allowance.json`,
`docs/design/receipts/block-b-x24-i1-relocated-rows.json` and
`docs/design/receipts/block-b-x24-final-spec-rebind.json`. The literal set is `literal-set.json`:
one hashed record per distinct exact text of the ledger occurrences, derived by `derive/literal-set.mjs`
from the base tree at each row's span and checked against the row's literal SHA-256. A record holds the
SHA-256 and the length of the text, the entry of its first row, the word class of its first and last unit and,
from four units, the low 16 bits of its base-257 polynomial hash; `derive/literals.mjs` slides a window of
each length over a string, uses the prefilter, then decides by SHA-256. A shorter literal has no prefilter
(it would spell the literal) and is tested at whole-token windows only, which is all R3 needs. The text is
never written and the seal test needs no Git object; the seal author checked that hashed and text matching
give the same hits on every string the hygiene scans and on synthetic contexts around every base literal.

- R1: the relaxed scan of `derive/scan.mjs` (every hashed and brand matcher applied everywhere, contexts
  ignored; structural patterns in their scope) finds no occurrence.
- R2: no literal of four or more UTF-16 units occurs anywhere.
- R3: no literal of any length occurs as a whole token (an end of the literal that is a word character is
  not adjacent to another word character).
- R4: no string field or key of `ledger.json` equals or contains a literal (R2, R3), nor does the
  concatenation of the string fields of any occurrence row or member occurrence (a literal split across
  adjacent fields).

R2 and R3 apply to the text of each file, to every decoded string and key of a JSON file, to every constant
string of a JavaScript file and to every regular-expression source of the lexicon and rules with its escape
backslashes removed; 40- and 64-digit hexadecimal runs (object ids, digests) are blanked first. A literal of
fewer than four units inside a longer word is not an occurrence (the matchers of those entries are
token-bounded); as a whole token it is one. No exception is recorded. The seal test applies the rules with
`derive/literals.mjs` and proves they bite, on synthetic literals hashed as the sealed records are: a literal
copied into rule prose, a field equal to a literal, a literal split across two fields, a short literal as a
whole token, a literal in a file key, a literal escaped in JSON, concatenated or folded in a script, written
in prose, or escaped in a regular expression source; and a hashed record and a text record of one literal
give the same hits.

### Derivation helpers

Helpers import only `node:fs`, `node:path`, `node:crypto`, each other and the hash-only brand helper.
The seal test reads their imports from tokens and fails on any other module, a dynamic `import()`,
`require`, `eval`, `Function`, `createRequire`, a process hook, computed global access or a code-loading
module name, wherever and however it is written.

### Reviewed occurrences

The history rule I1 of the block B integration scans the tracked tree with `derive/scan.mjs` (strict mode)
and pairs every occurrence with a ledger row; `derive/reviewed.mjs` is that scan. At the integration it
reported 596 unmatched occurrences, all in the sealed files of the lot-3, lot-4 and lot-5 expectations and
their clause tables. Each was classified by token (one exact literal: entry and literal SHA-256):

- (a) a business literal used with its business meaning: never reviewed; it must leave the file that
  carries it, replaced by its category or a digest;
- (b) a generic word or phrase, a published legacy API value that the base ledger retains as legacy API
  and that a block B legacy adapter case reproduces, or a homograph: reviewed in `lexicon.json#/reviewed`.

A reviewed record binds its token's occurrences in one eligible file (by prefix, the lot-3, lot-4 and lot-5
expectation trees and their three clause tables; by exact path, `src/profile/lot4-export.ts`,
`tests/profile-lot3-golden-independence.test.mjs`, `docs/design/receipts/block-b-lot3-unicode-literals-fix.json`,
`tests/profile-bfix-f2.test.mjs` and `tests/profile-workshop-prop.test.mjs`)
by path SHA-256, file SHA-256 and span; the strict scan does not report a bound occurrence, and reports it
again as soon as one byte of the file, its path or the span changes. The relaxed scan of the seal hygiene
and the selector-branch rule ignore the records; a record has no effect on the zero-list rescan of `src/`
and of the package, since no package member is eligible and the only eligible `src/` file binds a token of
entry LX-TH-3, which is not a zero-list entry. No entry, matcher or hash of the lexicon is removed or
narrowed. The seal test checks that every record binds exactly its token's occurrences in its file at the
bound bytes; after a reseal of a bound file, `derive/reviewed.mjs --write` rebinds and the derived files
are regenerated (section "Commands"). The selector-branch rule reads one record only through the reviewed
allowance RA-01, which names the RV-01 record of `src/profile/lot4-export.ts` and one of its spans (section
"Reviewed selector-branch allowance"); without such an allowance a record binds no branch.

Class (b), 598 occurrences of 13 tokens in 185 files (third-party counts: whole word, any case, in the
packages installed from the lockfile):

| Token | Entry | Literal SHA-256 | Class | Occurrences (files) | Justification |
| --- | --- | --- | --- | --- | --- |
| RV-01 | LX-TH-3 | `fe6d3468cf5c74d8ec2a95b40f2e05338c37a4202f8fad692d2b64a9cf9b468a` | generic-word | 153 (49) | Lower-case form of an English adjective that the base library also uses as a look selector name; the entry is of kind context (generic word reviewed as a context match, DESIGN.md:872). In the lot-3, lot-4 and lot-5 sealed files it qualifies the upstream lint rules and settings in prose, names legacy theme ids and compatibility alias records of the lot-4 neutral profiles (the injected form of DESIGN.md:837: theme ids and compatibilityAliases of kind theme), the legacy-name inputs of the lot-4 legacy theme cases, and appears in the vendored Python lot-4 and lot-5 records. Whole word in 178 files of 57 installed third-party packages. The base keeps 124 context-generic rows of it (for example I-0757 and I-0969, the two allowances of the selector-branch rule). In the block B source src/profile/lot4-export.ts (2 occurrences, one line) it is the key of the request that the lot-4 pre-normalize lint passes to runLintSync and the read of the same-named property of the compileLintPolicy result: the upstream lint settings (rule name to severity and options) of the exported interface LintRunRequest (src/profile/lint-bridge.ts:223, base row I-0960) and of the result type of compileLintPolicy (src/profile/lint-contracts.ts:47, I-0965). Both declarations are byte-identical on main (63a9258), ship in its package declarations (dist/**) and are kept by the base as context-generic rows of rule R-093; a declaration published on main is not renamed. |
| RV-02 | LX-TH-3 | `ef6691545d2c5523efed00424407cb261aeb0037d165ca5792f7f8bac3381362` | generic-word | 186 (101) | Capitalized form of the word of RV-01. In the lot-5 synthetic documents, envelopes and cases it is the name of one of two input sets (an ordinary option name next to another one), and in lot 4 it is the exact-name negative vector of the legacy alias cases and of their vendored Python copies. The base rows of this exact form are context-generic or history-record (I-0294, I-0418, I-0452, I-0453, I-2516, I-2605, I-2607). |
| RV-03 | LX-TH-2 | `ca8c522af0a0dfc10c8747ed205c4a650df4ccb350adbd450bbce753f6385c51` | legacy-api-value | 86 (25) | An English adjective that is a published look name of the legacy 0.3 and 0.4 API: the base retains it as legacy API (I-1417, I-1421, I-1575, I-1589, I-1594). In lot 4 it is legacy compatibility data: the old name of an alias record, a legacy theme id, the id and file name of a legacy theme case and of its main render artifacts, and prose; it never selects behaviour in library code (the selector-branch rule of src/ and the package is unchanged). Whole word in 5 files of 4 installed third-party packages. |
| RV-04 | LX-TH-4 | `6cdfd271da635d491e37a2b4a1044b306e6e9e039aeadee95bb355efadf8cb33` | generic-word | 57 (23) | An English adjective; the entry is of kind context (generic word reviewed as a context match). In lot 4 it names an injected legacy theme id, the main render artifacts of a legacy theme case and prose about caller-supplied tokens. Whole word in 458 files of 78 installed third-party packages; the base keeps 28 context-generic rows of it. In the block B test tests/profile-bfix-f2.test.mjs (4 occurrences, review findings 2 and 28) it is the first word of a synthetic draw.io serializer version value: the second-profile value that writerOptions and a serializer record inject, which the written mxfile header must carry; it names no look and selects no theme. |
| RV-05 | LX-TH-1 | `ba29297b6c4f8486cb3f92f5ff09f93ca5e16ceb198d9b5e159aa0ca47f94033` | legacy-api-value | 51 (29) | An English noun that is a published look name of the legacy API: the base retains it as legacy API (I-1416, I-1419, I-1420, I-1574, I-1578, I-1585, I-1592). In lot 4 it is the old name of a compatibility alias record, a legacy-name input, the id and file name of a legacy theme case, the occurrence key of a synthetic band stripe in the export and render records and in their vendored Python copies, and prose about the legacy look. Whole word in 20 files of 9 installed third-party packages. |
| RV-06 | LX-TH-1 | `7482e374b5bddc0a48ea3b3430de633b7938e3045e64aebca2574a50a53a5719` | generic-word | 4 (4) | Capitalized form of the noun of RV-05, used in lot 4 as the occurrence key of a synthetic band stripe of a foreign layout record, in its derivation text and in their vendored Python copies. The base retains this exact form as legacy API in 21 rows (for example I-0463, I-0475). |
| RV-07 | LX-DS-4 | `e604f8c97caaadb4c15db94f28d54802722aeba64e375071e4d1eeb1a3cc68fa` | homograph | 13 (4) | A short binding name of the vendored Python lot-4 neutral profiles (the bind, read, write and loss steps of their export recipes) and of the Python derivation text that the lot-4 index quotes; it coincides with the private descriptor prefix of the entry, whose matcher and hash stay unchanged. Whole word in 12 files of 5 installed third-party packages. The vendored files are byte copies of the twin seal (cross-parity) and cannot carry another name. |
| RV-08 | LX-PL-1 | `75f02da68647be51e5a675b5fc5b9a521d589a09d50103ed5e227cccc3d02056` | generic-word | 11 (7) | A two-word English phrase that the lot-3 and lot-5 discrimination texts, clause notes and vendored Python clause note use to describe the wrong implementation that updates one input set silently. The base has a single row of it (I-1064, rule R-123, disposition remove, the palette updater in src/); the block B occurrences are prose only. The block B lot-3 transaction reseal (1aa0d6f) appended one sentence after the phrase to the discrimination text of l3-tx-io-set-selection-required in the lot-3 README, index and authoring script (the single InputSet control of the C recipe): the phrase keeps its columns and its meaning there; the final spec pass reviewed the three changed lines and rebound them. |
| RV-09 | LX-AT-2 | `3cc838aabc52939c80e95e5036de2835c01cad9569b33364be0744be9692cc58` | legacy-api-value | 7 (4) | A refusal code of the published legacy exporter: the base retains it as legacy API (I-0769, rule R-066). Lot 4 seals the closed refusal-code set of the legacy adapter (legacy-adapter manifest, two legacy-adapter cases and the derivation list of the export cases), which must reproduce the legacy codes exactly (OPEN-LEGACY, DESIGN section 12.2). |
| RV-10 | LX-MT-4 | `8088da219c162b1c3733594fe2015156ee7b84042ea821ad552e9448e8cbbcdd` | generic-word | 21 (8) | The name of a Unicode normalization form. In the lot-3 README, index and authoring script (14 occurrences) it names, in discrimination texts, comments and the Unicode restoration note, a normalizing candidate that l3-id-stable-vectors, l3-id-unicode-names and l3-n-unicode-names reject; it is written in the lot-5 README, clause index and field-group discrimination text that reject a normalizing candidate match. In the lot-3 golden-independence test tests/profile-lot3-golden-independence.test.mjs (3 occurrences) it is the label and the String.prototype.normalize argument of one named wrong normalization, and one label of the list whose wrong candidates must change the sealed ID list of l3-id-stable-vectors; in the lot-3 reseal receipt docs/design/receipts/block-b-lot3-unicode-literals-fix.json (1 occurrence) it names the form whose witness is the decomposed twin added at index 1 of that list. The policy of the entry is the ambient width fallback of the base text metrics (I-0750, rule R-034), not the mention of the form. Whole word in 6 files of 3 installed third-party packages. |
| RV-11 | LX-MK-5 | `c587ed01690ac075254788e77d8a5c068cf756579ef25db134984655add8d778` | homograph | 1 (1) | A JavaScript slicing fragment of the lot-3 authoring script that takes the tail of the command list; the policy of the entry is the marker-length body extraction of the base sources (I-0570, I-0573, I-0911, I-0916). |
| RV-12 | LX-MK-1 | `44328fb796413802ec7f238f64c1663ee88c2b91f00a408bd44b32c5ada8372c` | homograph | 1 (1) | A JavaScript array literal of the lot-5 sequence authoring script that holds one element variable in a relabel option; it shares the normalized key of the document-role marker (a bracketed word, any case), whose matcher and hash stay unchanged. No ledger row has this exact form, and the file writes no annotation text with it. |
| RV-13 | LX-NV-1 | `e40ce9d32fa2483ea41f0596a7ded974c5ba269f1fe540f5d0955d54778d2284` | legacy-api-value | 7 (1) | Published API name: the optional target resolver prop of the published workshop props (BpmnWorkshopProps), which the block B fix of review finding 17 restored after a rename (OPEN-LEGACY, DESIGN.md:899 and the OPEN register row DESIGN.md:927: existing callers keep the published API; a published name is not renamed). The base ledger keeps its declaration and its documentation comment in src/react/workshop.tsx as legacy-api rows of rule R-144 (I-1428, I-1430), its read in the click handler of the base line of the name fallback as a row of rule R-147 (I-1463, disposition inject), the README mention (I-0026) and the browser harness of the original test (I-1682); at the block B head these five occurrences are back on their base lines and pair with their base rows, so no reviewed record binds them. In the block B regression test tests/profile-workshop-prop.test.mjs (7 occurrences) it is the prop name that the test requires in the published declarations and in the browser harness: a comment, two test titles, two assertion patterns and two assertion messages. No business classification reads it; the name-based target heuristic of the navigation family (DESIGN.md:859) is carried by other tokens. |

Class (a), 29 occurrences of 2 tokens, all in lot-5 files, not reviewed and left to the lot-5 seals
(positions at the integration scan, removed since by the lot-5 micro-reseal):

| Entry | Literal SHA-256 | Category | Occurrences (positions in `tests/fixtures/lot5-ui/expectations/` unless noted) |
| --- | --- | --- | --- |
| LX-TV-2 | `98cc55b3b63327804dc2ce99bde1bd014a599cd687820b5dfd56ee27a5816fb8` | Reserved band and template label of the private profile (type-vocabulary family, DESIGN.md:834), case variant; no base row; also 12 occurrences in the lot-5 fixtures of the Python twin | 28: `README.md:535:17`, `author/lot5-profile.mjs:414:61`, `fixtures/ui-neutral-profile.json:8005:20`, `cases/surfaces-001-palette-plain-en.json`, `cases/surfaces-002-palette-contrast-en.json` and `cases/surfaces-004-palette-locale-fr-ca.json` (each `14:498` and `65:515`), and line 1 of the 19 profiles of `fixtures/variants/` |
| LX-DS-2 | `37bb91b5340ccc62195bb5c612571bc4b7799d8217cd48b8face008142e2e07c` | Private semantic descriptor file stem (descriptor family, DESIGN.md:853) in a forbidden-import witness string | 1: `tests/lot5-ui-expectations.test.mjs:132:74` |

The label is a value of the lot-5 neutral UI profile, whose digest every lot-5 envelope carries, and the twin
carries it too; its replacement by a neutral label (its category) is a reseal of both lot-5 seals, applied
identically to both libraries, and the file stem of the witness is part of the same lot-5 reseal. After it,
`derive/reviewed.mjs --write` rebinds the lot-5 records. Done for the JS lot-5 seal (section "Integration
micro-reseal", "Lot-5 relink"): the strict scan reports none of these occurrences any more; the occurrences
of the Python twin belong to its own lot-5 micro-reseal, with the same neutral values.

Exact-path relink. On the integration tree at block B head `450627b`, the I1 scan reported 9 unmatched
occurrences. Six are class (b) occurrences of the tokens RV-01 and RV-10 in three block B files that no
eligible prefix covers: RV-01 twice on one line of `src/profile/lot4-export.ts`, RV-10 three times in
`tests/profile-lot3-golden-independence.test.mjs` and once in
`docs/design/receipts/block-b-lot3-unicode-literals-fix.json` (justifications in the table). Each file was
made eligible by its exact path, not by a prefix, and `derive/reviewed.mjs --write` bound the six
occurrences (RV-01 from 151 to 153, RV-10 from 17 to 21); no other record, token, entry, matcher or hash
changed. The earlier RV-10 count of the table, 3, predated the 14 lot-3 occurrences of the lot-3 Unicode
restoration, bound by the rebind of its merge (`7ae80cf`). The three other occurrences are not reviewed:
they are base rows of the navigation family in `src/react/workshop.tsx` (entry LX-NV-1: I-1427, disposition
legacy-api; I-1462 and I-1464, disposition inject) whose lines an identifier rename after the base
(`dc183c2`) changed, so that their line SHA-256 (and, for I-1464, the column) no longer pair; a business
literal is never reviewed, and their resolution belongs to that source file. I1 after the relink: 3958
occurrences, 3368 paired, 587 reviewed, 3 unmatched (those three rows). No bound file is a path of the base
tree (183 of 183 checked against its listing) and the ledger scans base files only, so no record changes a
ledger row: `ledger.json` changes only by `inputs.lexicon`, the cases L-001 to L-004, L-006, P-005 and
P-006 and `manifest.json` only by the digests of `lexicon.json` and `ledger.json`, then `seal.json`.

Lot-5 CR-10 rebind. The lot-5 seal round `ef9e781` (CR-10 compile refusals) changed three bound files of the
lot-5 tree after the exact-path relink, `README.md`, `clauses.json` and `manifest.json`, and its commit notes the
pending X24 rebind; the seal test then failed on their file SHA-256. `derive/reviewed.mjs --write` rebound the
seven records of the tokens RV-01, RV-08 and RV-10 in these three files: their file SHA-256 and the lines of the
spans that moved; forms, columns, token counts, classes and the file set are unchanged. The three files are
block B files, not base paths, so no ledger row depends on them: `ledger.json` changes only by `inputs.lexicon`
(edited by hand; the normative recomputation on a checkout of the base commit was not rerun in this round), the
cases L-001 to L-004, L-006, P-005 and P-006 and `manifest.json` only by digests. I1 after the rebind: 3958
occurrences, 3368 paired, 587 reviewed, 3 unmatched (the three navigation rows of `src/react/workshop.tsx`
above, unchanged).

Relocated base rows. At block B head `62e482b` the I1 scan still reported these three occurrences of
`src/react/workshop.tsx`. Each was located by its span and classified by its digests, never by its text:

| Occurrence | Entry | Literal SHA-256 | Base row (base span) | Rule | Category, consumer | Disposition | Class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 110:39-57 | LX-NV-1 | `b53d4d24c992e14758e03a07e1d82aafc2c6e796f2f20c260e5ad409022908a4` | I-1427 (108:39-57) | R-144 | navigation, workshop | legacy-api | (a) business literal of the base |
| 326:30-48 | LX-NV-1 | `b53d4d24c992e14758e03a07e1d82aafc2c6e796f2f20c260e5ad409022908a4` | I-1462 (320:30-48) | R-147 | navigation, workshop | inject | (a) business literal of the base |
| 326:94-114 | LX-NV-1 | `5a43428137bd7b3fa58c487b2eacbbf249149c96301bd969e521bf03408ae0f6` | I-1464 (320:95-115) | R-147 | navigation, workshop | inject | (a) business literal of the base |

The ledger has them. `src/react/workshop.tsx` has the same bytes at the base commit and on main `63a9258`
(git blob `dfd6dbd7dafea8785a64e22e2c759f7c2a3db8d4`); `derive/base-check.mjs` on an extracted tree of the base
commit recomputes all 3381 rows, these three included (797 files, 189 literals, 17 base branch rows, 0
failures), and the I1 pairing of an extracted tree of main pairs its 3379 occurrences with 3379 rows (0
unmatched). The block B commit `dc183c2`, after main, renamed the navigation identifier of the rows I-0026,
I-1428, I-1430, I-1463 and I-1682 (entry LX-NV-1, literal SHA-256 `e40ce9d32fa2483ea41f0596a7ded974c5ba269f1fe540f5d0955d54778d2284`)
to a neutral name. In `src/react/workshop.tsx` it edited the base lines 108, 120 and 320; lines 108 and 320 also
carry I-1427, I-1462 and I-1464. The I1 pairing key binds a row to the SHA-256 of its base line and to its
columns, so these three occurrences stopped pairing: their line digests changed, and the columns of I-1464 moved
by -1 (the new name is one unit shorter and precedes it). Nothing else changed: each post-base line is the base
line with the span of the renamed row replaced by a 12-unit identifier that no lexicon entry matches, the span of
the row itself is untouched, and the later commit `8a7a7e7` only moved the lines (+2 and +6). The cause is this
single pairing rule, not a scan rule of the ledger. Its scope at `62e482b`: 37 base files changed after the
base, 13 of them carry rows (233 rows); 222 of these rows pair, 8 lost their literal (the five rows of the
renamed identifier and the three rows of the two base probe lines rewritten literal-free by this seal) and 3
lost their line, the occurrences above. No other occurrence of the tracked tree is unpaired, and no base occurrence is
missing from the ledger.

A business literal is never reviewed, and a new row at the post-base position would count the base occurrence
twice and break the base recomputation of the ledger. The three rows keep their I-numbers, fields, rules and
dispositions; `lexicon.json#/relocated` (format `x24-scan-lexicon/4`) adds one relocated row per base row,
RL-01 to RL-03: the post-base position and line SHA-256 of the same occurrence, the classification of the base
row repeated, the edit (commit `dc183c2`, the replaced row, the post-base columns and SHA-256 of the
replacement) and the tree and file bytes at which the record was verified (`62e482b`, file SHA-256
`e3688a753bc11938da31c13e618faa417fb1207b6e1df15855a4dd568ee2d7eb`). The I1 scan (`derive/reviewed.mjs`) and the
probe rescan (`probe-expectations.json#/probe2/trackedRescan`) pair an occurrence with its base row through the
record's key exactly as through the base key, one occurrence per row at most; the line number is not part of
the key, and a change of the post-base line voids it, so that the occurrence is reported again. The migration
obligations stand: the code injects I-1462 and I-1464 (status injected, absent after the migration) and keeps
I-1427 as an opaque legacy key or removes it; the probe now holds these occurrences to their base rows instead
of leaving them to appended rows, whose disposition the scope file chooses. `derive/base-check.mjs` checks each
record against the base line of its row (the base line with the replaced span substituted is the post-base
line, and the record's span holds the row's literal); the seal test checks each record against its base row
and, wherever the current file still holds its line, against the occurrence and the replacement at their
columns. I1 after the relocation: 3958 occurrences, 3368 paired, 3 relocated, 587 reviewed, 0 unmatched.
Retired by the final spec pass: the block B fix of review finding 17 restored lines 110, 122 and 326 of
`src/react/workshop.tsx` to their base bytes (the renamed identifier is back), so the three occurrences pair with
I-1427, I-1462 and I-1464 through the base key and the post-base lines of RL-01 to RL-03 no longer exist; the records
were removed (`lexicon.json#/relocated/rows` is empty), since a record left in place would pair the renamed lines
again, and any later edit of these lines is reported by the I1 scan.

Final spec rebind. The block B fix round (merges `35eea4d` to `5cd3fa2`) and the lot-3 transaction reseal (`1aa0d6f`)
changed the bytes of five bound files (11 records), and the lot-4 twin-applied field reseal of this pass (review
finding 20) changed four more bound lot-4 files (16 records). Each changed record was compared with its bound bytes,
found in the history by their SHA-256, span by span (form, columns, line span and the text of the spanned lines):

| Records | Files (tokens) | Outcome |
| --- | --- | --- |
| 19 | `src/profile/lot4-export.ts` (RV-01); the lot-3 README, authoring script and index (RV-01, RV-10, RV-11); `tests/profile-lot3-golden-independence.test.mjs` (RV-10); the lot-4 README (RV-01, RV-03 to RV-05) and index (RV-01 to RV-07) | moved lines only: every bound span sits on a byte-identical line at the same columns; rebound mechanically |
| 5 | the lot-4 `seal.json` (RV-01, RV-03 to RV-05) and `derive/lot4-vendor.mjs` (RV-01) | same spans, bytes changed elsewhere in the file; rebound mechanically |
| 3 | the lot-3 README, index and authoring script (RV-08) | the spanned line changed: the lot-3 transaction reseal appended a sentence after the phrase to the discrimination text of `l3-tx-io-set-selection-required` (the single InputSet control of the C recipe); the phrase keeps its columns and its meaning; reviewed again as class (b), with the justification of RV-08 extended |

No bound span disappeared and no token, class or file left the records. RA-01 moved with its line (section "Reviewed
selector-branch allowance", "Final spec rebind"). The fix round also added two block B tests whose eleven occurrences
no ledger row and no eligible path covered; both were made eligible by exact path: four occurrences of the token of
RV-04 in `tests/profile-bfix-f2.test.mjs` (a synthetic serializer version value of a second profile) and seven
occurrences of the published workshop prop name in `tests/profile-workshop-prop.test.mjs` (new token RV-13, class
legacy-api-value, "published API name"). That prop name is back on its base lines in `src/react/workshop.tsx`, the
README and the browser harness of its original test (`tests/browser/page-workshop.mjs`): these five occurrences pair
with their base rows I-1428, I-1430, I-1463, I-0026 and I-1682, so no record binds them (a reviewed record never binds
an occurrence that pairs with a ledger row). I1 after the rebind: 3974 occurrences, 3376 paired, 0 relocated, 598
reviewed, 0 unmatched. No bound file is a path of the base tree, so no ledger row changes: `ledger.json` changes only
by `inputs.lexicon`, the cases L-001 to L-004, L-006, P-001, P-005 and P-006 and `manifest.json` only by digests.
No zero-list entry is among the new bindings, and the zero-list scope (tracked `src/` files and the actual pack
members) holds no occurrence that a base row or a base member record does not explain.

## Injected business data: `business-policy/1`

One closed record (every object `additionalProperties: false`, no `null`), read by every legacy consumer of
the ledger. It is the explicit external compatibility data of DESIGN §12.2 L887 and L899, supplied by the
caller to the legacy adapter; it is never projected from a compiled profile, so recognition keeps a single
authority: profile-path consumers evaluate the compiled profile itself (harmonization section 3.4). No
consumer holds a default for any field; an absent optional section means "not supplied".

| Section | Content | Readers |
| --- | --- | --- |
| `classification` | `annotationRoles[]` (0 to 2): `role` (`document`, `application`), `prefix` (nonempty), `trim` (`none`, `ecma262-2024-start`), `labelCase` (`none`, `upper`); `insertSeparator`. | render, layout, exporters, importers, UI, transactions |
| `attachment` | `applicationHost {type, mode}`: a native type and `exact` or `assignable` (BPMN subtype); `nonActivityHost`: only `preserve-report`. | render, layout, exporters, transactions |
| `metrics` | `id`, `unit` `per-mille-em`, `firstCodePoint` 32, `regular[95]`, `bold[95]`, `fallback`, `lineHeight`, `aliases[] {from, to}`, `license`, `attribution`. | layout, render |
| `navigation` | `mode`: `called-element`, `legacy-default`, or `legacy-rules` with nonempty unique `rules[]` from `called-element`, `name-equal`, `section-equal`, `name-overlap`. | workshop, UI |
| `presentation` | `looks[]` (alias, renderer `upstream`/`annotated`/`recolor`, flat, palette, paletteFloor, markerSelectors, tokens), `legacyOptions {flatDrawing?, annotatedPalette?}`, `layout` (band and node sizes, fonts, label widths, application badge, document, lane header width, pool strip), `exportStyles {drawio, decode}`, `palette {entries[]}`. | render, static, workshop, UI, layout, exporters, importers |
| `exportFacts` | `descriptorId`, `extensionType`, `namespaceFamily`, `properties` (the six fact names read by the legacy exporters) of the injected facts descriptor. | exporters |

Recognition semantics are those of the profile mechanism: a role is recognised when the text, after the
role's leading trim (`ecma262-2024-start` trims exactly the set of DESIGN.md:152), starts with its prefix
(code-point comparison, case-sensitive); `labelCase: upper` applies Unicode 15.0.0 full upper case (the
lot-0 `unicode-case/1` table) to display and export names only, never to recognition or stored text.

Admission (operation `x24.policy.validate`, phase `load`) follows the profile text stages and codes of
DESIGN §2.1-§2.4 in the order lexical, schema, static:

- lexical (§2.1.1 L85-101): `profile-number`, `profile-json-duplicate-key`, `profile-unicode`;
- schema: closed records, required sections, enums, nonempty prefix, 95-entry tables, `preserve-report`
  only, nonempty unique navigation rules from the enum, known node slots and decode kinds, all six fact
  names, tokens present exactly on `annotated` and `recolor` looks: `profile-schema`;
- static: duplicate role, alias source, look alias or node-size kind: `profile-symbol` (CR-05, L190); an
  alias `from` that is not one code point outside U+0020-U+007E, or a `to` that is not one code point
  inside it: `profile-type` (L702, L857).

Overlapping role prefixes are admitted (S-024): §2.4.1 L182 allows no static rule beyond the tables. A text
matching both roles is refused at recognition with `profile-ambiguous-notion` (§2.3 L154; S-009 records
`{status, code, stage: "recognize", vector}`); texts matching one role or none classify normally (S-025).

An admitted record yields `{status: "ok", id, canonicalSha256, sections}`: the canonical SHA-256 of the
parsed record (keys sorted by UTF-16 code units, no whitespace, ECMAScript number and string serialisation)
and its sorted section names other than `policyVersion` and `id`. The record is never normalised.

Data sets. Neutral A and neutral B differ in every section: markers (`[Aid]`/`[Folio]` against
`[Note]`/`[Leaf]`), trim and label case, application host (`bpmn:Activity` assignable against `bpmn:Task`
exact), metrics (tables, fallback, line height, aliases), navigation (native against injected rules), looks,
layout geometry, export styles, decoding, palette and facts descriptor (`inputs/x24-facts-descriptor.json`
against `inputs/x24-facts-descriptor-b.json`). The legacy-shaped synthetic set has the shape of the private
legacy record with synthetic values: the base markers' shape, a distinct-per-code-point width ramp
(regular `400+i`, bold `500+i`, fallback 999, five aliases), looks under synthetic aliases, the legacy
option keys, and geometry that differs from the base wherever the shape allows; where a value coincides
with the base, group X discriminates it. The profile path cases (X-020 to X-023) use the lot-0 neutral
profiles `neutral/1` and `neutral-grid/1`, pinned by digest.

## Operation catalogue

Each operation is a harness entry point the implementation provides; its output is compared by the
comparators below. Base line references cite the legacy behaviour the adapter keeps.

- `x24.inventory` (L-001 to L-004): the recomputation above; comparator `x24-ledger/1`.
- `x24.legacy.values` (L-005): run by the private integration with its legacy record; `x24-legacy-values/1`.
- `x24.seal.literals` (L-006): the hygiene rules R1 to R4; `x24-seal-literals/1`.
- `x24.policy.validate` (S): admission above.
- `x24.classify` (S-009, S-025, A-001, R-007, X-001): per text `{text, document, application, role,
  displayName, layoutName}`. `displayName`: the role's trim, the prefix, then every following WhiteSpace or
  LineTerminator removed, trailing text kept, label case applied; unrecognised text unchanged. `layoutName`:
  both ends trimmed when the role trim is `ecma262-2024-start`, prefix removed, both ends trimmed again,
  label case applied; `null` when unrecognised. Without a policy nothing is recognised or stripped.
- `x24.classify.kind` (A-002 to A-004, X-002 to X-004): kind of a `bpmn:TextAnnotation` under a renderer
  family: `annotated`: `document`, `application` or `null`; `recolor`: `doc`, `app` or `annotation`; `flat`:
  `document` for the document role, otherwise `application`.
- `x24.layout.input` (A-005, R-001, X-005): the legacy layout model `{processes: [{id, name, lanes: [{name,
  nodes}], connections}], diagnostics}` with neutral node records `{kind, id, text, application?, subtype?,
  attachedTo?, direction?}` and connections `{source, target, kind, label?}`. A document annotation becomes a
  `document` node whose text is its layout name (its id when empty), attached to its host. A document or
  data link to a host that is not an activity is preserved and reported as `{code:
  "attachment-host-not-activity", severity: "warn", artifact, host, connection}`; it is never retargeted.
- `x24.layout.size` (A-006, X-006): badge size, minimum host width, document height, node size and label box
  of the legacy swimlane layout with every constant read from `presentation.layout` and `metrics`; badge
  eligibility of the task, subprocess and call slots is that of `bpmn:Task`, `bpmn:SubProcess` and
  `bpmn:CallActivity` under `attachment.applicationHost`.
- `x24.layout.process` (A-023, X-025): the full legacy layout of `inputs/layout-process.json`: pool, lanes,
  node boxes, badges, labels and edges with their points and label boxes.
- `x24.metrics` (A-007, R-003, X-007): text width and wrapping: per code point in order, the width of
  U+0020-U+007E from the table, of an aliased code point from its alias target, otherwise `fallback`; each
  code point adds `w·size/1000` to a running sum. No ambient decomposition.
- `x24.render.badges` (A-008, X-008): badge row, badge box and document text box of the annotated look.
- `x24.render.attachment` (A-009, X-009): `{aidsOf: {host: [annotations]}, hidden: [shapes..., links...]}`:
  an application annotation associated, in either direction, with an eligible host is listed under that
  host and hidden with its association; one associated only with non-hosts stays visible.
- `x24.transactions.follow` (A-010, X-010): for command `elements.move`, `{moved}`: the shapes, then the
  application annotations of each eligible host in association order, without duplicates.
- `x24.transactions.autolayout` (A-022, X-024): for command `bpmnCanvas.autoLayout`, `{changes: [{element,
  bounds} | {element, waypoints}]}` for the application annotations of each host in incoming-then-outgoing
  link order: the i-th recognised annotation moves to the badge box shifted by `i·(w + appBadge.gap)`; its
  link runs from the badge top centre to `host bottom − appBadge.linkInset`, reversed when it starts at the host.
- `x24.tokens.resolve` (A-011, A-012, X-011): look tokens with host overrides: undefined overrides dropped;
  `stroke` names every line key; `fill` names `taskFill`; explicit overrides win; `link` without `docLink`
  aligns `docLink`; `laneFill` without `laneHeaderFill` aligns `laneHeaderFill`; an unnamed `taskFillEnd`
  becomes `shade(taskFill, 0.95)` when `taskFill` differs from the look value. A recolour look also yields
  `labelText = text` unless named, and `named`.
- `x24.theme.select` (A-013, R-005, X-012): per request `{look?, tokens?, options?}`, `{status, renderer,
  modelerModules, viewerModules, paletteFloor, markerSelectors, tokens?, named?}`. The look is found by alias
  in `presentation.looks`; an unknown alias refuses `profile-symbol`; no request means the upstream renderer,
  no module, palette floor 0 and no marker selector. Module names: `annotated-renderer`, `annotated-follow`,
  `annotated-palette`, `recolor-renderer`, `flat-renderer`. `options.drawing` equal to
  `legacyOptions.flatDrawing` forces flat drawing; `options.palette` equal to `legacyOptions.annotatedPalette`
  adds the annotated palette. Option values are compared with injected data, never with literals.
- `x24.palette` (A-014, X-013): palette entries built from `presentation.palette.entries`: `{id, group,
  className, title, html, create}`; `create` is `{tool: "connect"}` or `{type, name?, text?, isExpanded?}`
  where `text` is the role prefix, the insert separator and an empty body.
- `x24.navigation` (A-015, A-016, R-002, X-014): legacy modes take `{click, diagrams, activeId}` and return
  `{target}`; `legacy-rules` applies only the injected rules in their order. `called-element` takes the
  navigation index of DESIGN §8.1 L623 and returns `{kind: "current" | "open" | "chooser" | "none" |
  "refused", ...}` with `reference-dangling` and `navigation-view-missing`; names never matter.
- `x24.export.reference`, `x24.export.sparx`, `x24.export.drawio` (A-017 to A-019, A-021) and
  `x24.export.legacy` (A-024, A-025, A-029, R-009, R-010, X-015 to X-017, X-026, X-031): the legacy reference
  pages (nodes with boxes, labels, lanes, applications, called processes; connections with points; order),
  the Sparx interchange model (process, lanes, elements, connectors; diagram shapes with bounds and edges
  with waypoints and labels) and the draw.io pages (every cell: id, value, style, parent, vertex geometry
  `{x, y, width, height}` rounded as the base serialiser does, edge source, target and points, page size),
  with facts read through the injected descriptor and `exportFacts`. Typed base refusals are kept (§12.2
  L886): `free-annotation`, `unattached-annotation`, `unsupported-element`, `missing-endpoint`,
  `element-without-di`, `missing-semantics`, `invalid-semantics`, `unknown-semantics-version` (facts of
  another version of the injected namespace family), and `profile-symbol` for a descriptor that is not the
  one `exportFacts` names; each with the ids of the refused elements and unchanged inputs. The legacy exporters produce no capability or loss record; those belong to
  the new export mapping of lot 4.
- `x24.import.drawio` (A-020, X-018, X-019, X-027): decoded pages `{id, name, nodes, edges}` with shape kinds
  and role insertion from `exportStyles.decode`; the first vertex whose shape no rule decodes refuses
  `unsupported-shape` with its cell id.
- `x24.surface.static`, `x24.surface.preview` (A-026, A-027, X-028, X-029): the static viewer and the
  read-only preview of `inputs/surface.bpmn` per look request: `{renderer, flat, recolorModule, elements}`
  with, per element, its drawer kind, hidden flag, badges (annotation, name, box), labels, document band and
  text box, or recolour fill and stroke; unchanged inputs.
- `x24.surface.workshop` (A-028, X-030): the workshop format options (`{id, selection}` per format, through
  `x24.theme.select`) and its navigation results.
- `x24.package.surface` (R-004, R-008): assertions on `{packageExports}`, `distMembers`, `ioExports`,
  `codecPackagesWithoutInjection` and `browserExports`.
- `x24.ui.create-process-io` (R-006): creating Process IO with several IO sets refuses
  `io-set-selection-required` unless a set is named (DESIGN §7.1 L547, §16 item 8).
- `x24.profile.recognize`, `.label`, `.create`, `.bindings` (X-020 to X-023): the profile path with the lot-0
  neutral profiles: recognised notions per element, render label (`stripPrefix`, `case`), the created
  annotation of the create recipe (allocated id, text), and the render bindings `{id, notion, theme, glyph,
  tokens, label?}` of every recognised element.
- `x24.probe.classification`, `x24.probe.scope`, `x24.probe.rescan` (P): the probes below.

## Comparators

`derive/comparators.mjs` (pinned with `canonical.mjs`, `scan.mjs`, `literals.mjs`, `sourcemap.mjs` and the
brand helper in `seal.json#/executables`) gives each id its semantics; `compareCase(case, observation)`
runs a case's comparators. An observation is `{status, artifacts: {<role>: json}}`, or `{runs: {a, b}}` for a
substitution. Zero tolerance (DESIGN.md:961).

- `x24-exact-json/1`: exact status, exactly the expected artifact roles (none omitted, none extra), each
  canonically equal (array order significant, absent members absent).
- `x24-refusal/1`: the exact code, the refusal record (code, ids, stage, vector when listed) canonically
  equal, only the refusal and state artifacts present (no partial output).
- `x24-substitution/1`: one run per data set, each with exactly one `results` artifact equal to `results-a`
  or `results-b`; the RFC 6901 pointers at which the two observed results differ equal `differences`. Only
  X-019 has an empty difference set: both neutral data sets refuse the legacy-marked draw.io input on its
  first vertex.
- `x24-assertions/1`: each `{pointer, op, value}` holds on the run's only artifact, `subject`; a pointer
  selecting nothing fails, so an absent subject never satisfies a negative assertion.
- `x24-state/1`: the state artifact reports every input unchanged.
- `x24-ledger/1`: the recomputed ledger has the SHA-256 of the sealed one and the section summary equals.
- `x24-legacy-values/1`: each field of the private legacy record hashes to its pin.
- `x24-scan/1`, `x24-seal-literals/1`: the reported counts equal the expected ones.

The seal test proves the comparators bite: every case with a single expected outcome accepts its sealed
values, and 459 wrong observations are rejected (wrong status; each artifact omitted; an extra artifact; a
changed id, number or state; an added diagnostic; a changed refusal code or ids; swapped or altered
substitution runs; a missing result); the assertion cases reject an absent subject and a falsified value.

## Dimension coverage

`dimension-coverage.json` lists every leaf field of the three data sets with one mutation (a boolean
negated, a number moved, an enum switched, a string extended) and the A, R, X and P cases whose expected
outputs change when the cases are re-derived with that single field mutated. Every non-exempt field changes
at least one case. Exempt fields name their reason: record version and identity, metrics metadata, schema
constants, a field ignored by its own renderer, document sizes not read from `nodeSizes`, the type of a
connect-tool entry, and list identity keys.

## Consumer coverage

| Consumer | Legacy adapter (A, R) | Substitution A against B (X) | Other |
| --- | --- | --- | --- |
| render | A-001 to A-004, A-007 to A-009, A-011 to A-013, A-026, A-027, R-005, R-007 | X-001 to X-004, X-007 to X-009, X-011, X-012, X-020, X-021, X-023, X-028, X-029 | S-009, S-025, P-001 to P-003 |
| layout | A-001, A-005 to A-007, A-023, R-001, R-003, R-007 | X-001, X-005 to X-007, X-025 | S-009, S-025 |
| transactions | A-010, A-022, R-006 | X-010, X-020, X-022, X-024 | - |
| UI | A-011, A-012, A-014, R-002, R-006 | X-011, X-013, X-020, X-022 | - |
| exporters | A-001, A-017 to A-019, A-021, A-024, A-025, A-029, R-007, R-009, R-010 | X-001, X-015 to X-017, X-026, X-031 | S-009, S-025 |
| importers | A-020 | X-018, X-019, X-027 | - |
| static | A-013, A-026, R-005 | X-012, X-023, X-028 | - |
| preview (assistant) | A-027 | X-029 | - |
| workshop | A-013, A-015, A-016, A-028, R-002, R-005 | X-012, X-014, X-030 | - |
| descriptor | R-004 | - | - |
| package surface | R-004, R-008 | - | L-002, P-007 |
| all (inventory, admission, hygiene, scope) | - | - | L-001, L-003 to L-006, S, P-004 to P-006 |

## Probe expectations

`tests/profile-externalization.probe.mjs` keeps the original assertions and adds the sealed ones
(`probe-expectations.json`, cases P-001 to P-007):

1. "J5 #24 should require injected data for business classification". Base lines 1-4 are kept verbatim.
   The original assertion (base lines 5, 8 and 9: the document classifier imported from
   `dist/internal/annotations.js`, called with the base document marker followed by " example", expected
   `false`, with its message line) is kept in a literal-free form: the export is found by the SHA-256 of
   its name and the argument is materialized from ledger row I-2933, whose text the probe takes from a
   tracked occurrence with the row's literal SHA-256 (`probe-expectations.json#/probe1/literalSource`: the
   materialized markers keep history-record rows, present after the migration). `derive/base-check.mjs`
   proves the call equal to the original by materializing the templates of
   `probe-expectations.json#/probe1/original` from the base rows and comparing them with base lines 5 and 8;
   the seal test binds the rows to the template positions and line digests and checks lines 1-4 and the
   message line by digest. The three classifier exports then take an optional `business-policy/1` record:
   without it they recognise and strip nothing (P-002), with each sealed record they return exactly P-003.
   The probe reads no Git object: its only Git call is the index listing `git ls-files`.
2. "J5 #24 should inventory occurrences and distribution members". The original assertions (base lines
   13-17) are kept verbatim. `docs/design/profile-externalization-scope.json` becomes
   `profile-externalization-scope/2`: it pins `ledger.json` by digest, carries every sealed row with
   unchanged fields plus `postMigration {status, evidence}`, appends rows `I-P0001` upwards so that every
   post-migration occurrence of a tracked file is a row (a reviewed occurrence of `lexicon.json#/reviewed` is
   not reported; an occurrence on the post-base line of a relocated row of `lexicon.json#/relocated` pairs with
   that base row), writes no scanned literal (relaxed scan, the hashed literal set of the base occurrences and
   the texts of the current ones), lists the actual pack members with digests and
   occurrences matching a rescan, and declares its exceptions. The zero-list rescan of the pack members and
   tracked `src/` files allows only allowlisted third-party code and exceptions of the sealed kinds
   (`third-party-notice`, `legacy-token-api`), each bound to one occurrence by file SHA-256, exact span,
   entry and literal and backed by a base row of its kind with the required status. Look selector branches
   are allowed only through exceptions bound to one branch and to a sealed allowance: one of the two base
   allowances (generic context keys of base rows) or the reviewed allowance RA-01 (a generic context key of a
   block B module without a base row, anchored to its file SHA-256, span and token; section "Reviewed
   selector-branch allowance"). At the base the probe fails for the expected reasons only: rows still present that block B
   injects, replaces or removes, zero-list occurrences, the fifteen base look branches and the private
   descriptor member.

## Clause index

| DESIGN section | Lines cited | Cases |
| --- | --- | --- |
| §1 | 34 | L-004, L-006, R-007, X-001, P-001, P-006 |
| §2.1 | 48 | S-001 to S-005, S-013 |
| §2.1.1 | 85-101 | S-021 to S-023 |
| §2.2 | 115, 115-116 | A-001, X-021 |
| §2.3 | 146, 152, 154 | S-006, S-007, S-009, S-024, S-025, A-001, X-001, X-020 |
| §2.4 | 163 | X-022 |
| §2.4.1 | 182, 190 | S-008, S-009, S-016, S-017, S-019, S-024, A-025 |
| §3.2 | 276-281 | X-022 |
| §7.1 | 547 | R-006 |
| §8.1 | 606, 615, 623 | A-013, A-015, A-025, A-028, R-002, R-004, X-014 |
| §8.2 | 627-635 | A-010, A-022, X-010 |
| §8.3 | 649, 651, 655, 659 | A-014, R-006, X-013, X-022 |
| §9.1 | 671 | X-023 |
| §9.3 | 698, 698-700, 700, 702, 712 | S-014, S-015, A-007 to A-012, A-022, A-026, R-003, X-007 to X-009, X-011, X-021 to X-024, X-028 |
| §9.4 | 721 | S-019, A-006, A-023, X-006, X-025 |
| §9.5 | 729 | L-005, S-017, S-018, A-011 to A-013, R-005, X-012 |
| §10.2 | 770-803, 770-772, 791, 793 | A-017 to A-019, A-021, A-024, X-015 to X-017, X-019, X-026, X-031 |
| §12 | 821-859 and its rows | L-001, L-004, L-006, S, A, R, X and P cases (table in `docs/design/block-b-x24-expectations.md`) |
| §12.1 | 863, 865-870, 870, 872, 872-874, 874, 876 | L-001, L-002, L-004, L-006, A-026 to A-028, X-028 to X-030, P-004 to P-007 |
| §12.2 | 880-897, 882, 886, 887, 888, 895, 896, 897, 899 | L-003, L-005, S-011, A-002 to A-005, A-009, A-021, A-026, A-027, A-029, R-001, R-002, R-004, R-005, R-007 to R-010, X-015 to X-017, X-019, P-002, P-006 |
| §13 | 916 | S-011, R-001 |
| §14.2 | 951, 954 | X-001, X-005, X-015 to X-017, X-020, X-024, X-025, X-028, P-003 |
| §16 item 5 | 1148 | L-005 |
| §16 item 8 | 1154 | R-006 |

The line-by-line table is `docs/design/block-b-x24-expectations.md`; every case cites at least one clause.

## Plausible wrong implementations

Each case rejects the implementation named in `manifest.json#/cases/*/discriminates`.

- W-L1: an inventory of families, modules or line groups instead of one row per match, or one that drops
  the token, decoded or path forms or the hashed entries.
- W-L2: a distribution inventory taken from the tracked tree rather than the package members (missing
  generated CSS, extracted data URIs, bundles and maps), or scanning source-map mappings as text.
- W-L3: module dispositions that keep a built-in look path or the private descriptor export.
- W-L4: unmatched occurrences accepted, a brand occurrence reviewed as context, or a private row without
  disposition.
- W-L5: a legacy adapter fed with re-typed or approximate values (rounded widths, another separator).
- W-L6: a seal or scope file that writes a scanned literal, escaped, split or concatenated.
- W-S1: a loader that accepts unknown fields or normalises the record, changing its digest.
- W-S2: a validator that coerces or defaults instead of refusing (null, empty prefix, unknown trim,
  duplicate role, short table, retarget mode, empty or unknown navigation rules, missing section, alias
  outside or inside the table, duplicate alias, look or node size, unknown node slot, upstream look with
  tokens, unknown decode kind, missing fact name).
- W-S3: lexical failures reported as `profile-schema` or accepted (1e400 as Infinity, last duplicate key
  wins, lone surrogate kept).
- W-S4: overlapping prefixes refused at load, or an ambiguous text resolved by array order instead of
  refused at recognition.
- W-A1: built-in markers, a two-sided or wrong trim (trimming U+0085 or U+200B, not trimming U+00A0 or
  U+FEFF), case-insensitive or anywhere-in-text matching, or the display and layout names confused.
- W-A2: kinds keyed by look name or by literal markers; the flat look returning a neutral kind.
- W-A3: layout input reading literal markers, keeping prefixes in node text or retargeting links.
- W-A4: node, badge or document sizes from built-in constants, or a badge on an ineligible host.
- W-A5: built-in width tables, ambient decomposition, widths per UTF-16 unit, or `(Σw)·size/1000` instead
  of the running sum of `w·size/1000`.
- W-A6: badge layout with built-in geometry.
- W-A7: attachment accepting any host, reading associations in one direction only, or hiding orphans.
- W-A8: move-follow with a built-in recogniser or following annotations of non-hosts.
- W-A9: built-in token defaults or wrong derivation rules (fan-out, alignment, shading, label text).
- W-A10: a per-look switch or table keyed by look names, or legacy options compared with literals.
- W-A11: built-in palette entries.
- W-A12: legacy default navigation without trimming, case folding or skipping the shown diagram.
- W-A13: navigation rules applied in a fixed set or order regardless of the injected rules.
- W-A14 to W-A16: reference page, Sparx or draw.io export from built-in markers, styles, offsets, header
  widths or geometry.
- W-A17: draw.io import with built-in shape rules or marker insertion.
- W-A18: an export that drops or guesses an annotation recognised by no role instead of refusing.
- W-A19: auto-layout badge placement with a built-in recogniser, gap or link inset.
- W-A20: a full layout with built-in band, lane, node, badge or label geometry.
- W-A21: exporters reading facts from a built-in descriptor or property names.
- W-A22: an exporter that accepts a descriptor other than the injected one.
- W-A23 to W-A25: static viewer, preview or workshop surfaces with built-in looks, kinds, badges, tokens
  or format options.
- W-A26: facts of another version of the injected namespace family read or ignored instead of refused.
- W-R1: the retarget to an earlier activity kept, or the link dropped silently.
- W-R2: navigation falling back to names or section numbers.
- W-R3: ambient canonical decomposition kept for widths.
- W-R4: the private descriptor still exported, shipped or forced into codecs.
- W-R5: built-in look names still selectable without injected looks.
- W-R6: Process IO added silently to the initial IO set.
- W-R7: an implicit default policy recognising markers without injected data.
- W-R8: the browser entry still exporting default token tables or palette action ids.
- W-R9: facts of another namespace version accepted under either neutral data set.
- W-X1 to W-X25: a consumer that still reads one business value from code instead of the injected data
  (classification, kinds, layout input and sizes, metrics, badges, attachment, follow, tokens, theme
  selection, palette, navigation, exports, imports, profile recognition, labels, creation, bindings,
  auto-layout, full layout, facts, surfaces): its two runs then differ where the sealed results agree or
  agree where they differ.
- W-P1 to W-P7: a weakened probe, classification without policy, an ignored policy, a weakened scope check,
  altered or missing scope rows, a residual zero-list literal or look branch, or a package list that
  differs from the members.

## Design decisions (DESIGN default taken where a point would block)

1. Report of a preserved invalid relation (§12 L855): DESIGN asks to preserve endpoints and report without
   naming a code. x24 defines the warning `attachment-host-not-activity` with the record of R-001; a
   warning, because the document is preserved.
2. Codes: admission reuses the profile text codes (§2.1, §2.1.1, CR-05, §2.3 L154); the legacy exporters
   and decoder keep their typed base refusals (§12.2 L886, §10.2 L791); navigation uses §8.1 L623 codes; IO
   sets use §7.1 L547.
3. No default look (§9.5 L729, §12 L837, §12.2 L899): without a requested look the upstream renderer
   applies, with no injected palette floor or marker selector. Existing callers stay on their release until
   they migrate (§16 item 5) and then request their look.
4. Legacy option values of the look API are opaque keys resolved through `presentation.legacyOptions`,
   consistent with the selector-branch rule of the probe.
5. Label case (§2.2 L116, §9.3 L702) applies to display and export names only; recognition and inserted or
   stored text are never cased. Upper case is Unicode 15.0.0 full case from the lot-0 table.
6. Legacy layout kinds are generic slots; badge eligibility derives from their native types and
   `applicationHost`.
7. Widths accumulate per code point (base behaviour); an astral code point counts once; aliases replace
   ambient decomposition (§12 L857, §9.3 L702).
8. Token scanner: DESIGN §12.1 L874 asks for a pinned AST or token scanner; `derive/scan.mjs` is a pinned
   token scanner (its digest is in `seal.json#/executables` and `ledger.json#/inputs`), because a
   derivation helper may not import a compiler, loader or parser.
9. `nonActivityHost` admits only `preserve-report`; a retarget value is refused at load, because an
   explicit retarget is a migration that needs its own approval (§13 L905, L916; §16 items 1 and 6).
10. The stroke fan-out key list of the legacy token API is generic legacy-adapter code (rule R-184,
    `legacy-api`); post-migration it is allowed only through span-bound exceptions of kind
    `legacy-token-api`. The default token tables are injected.
11. The legacy default navigation algorithm is kept only behind `navigation.mode: legacy-default`.
12. Ambiguity is a recognition outcome (§2.3 L154), not a load rule (§2.4.1 L182): overlapping prefixes are
    admitted; only a text that matches both roles refuses.
13. `business-policy/1` is never projected from a compiled profile (one authority per path; harmonization
    section 3.4).
14. Literal containment: R2 from four UTF-16 units, R3 for every literal as a whole token, digests blanked
    (see "Literal-free seal").
15. The original classifier assertion of probe 1 is kept in a literal-free form whose equality with the
    base lines is proven mechanically, because the base lines carry a business marker and a classifier name
    and the seal files may carry none.
16. Post-migration exceptions are records of the scope file bound to a file SHA-256 and an exact span;
    the seal only fixes their kinds, entries, keys, backing rows and allowances (DESIGN §12.1 L874: exact,
    reviewed, narrowly anchored).
17. No test reads a Git object of the base: the base commit is a branch commit that a fresh squash and main
    never carry, and the test history guard refuses such reads. The seal keeps hashes only (`literal-set.json`,
    line digests) and moves the recomputations from base texts to reviewer commands (`derive/base-check.mjs`,
    `derive/literal-set.mjs`, `derive/ledger.mjs`), which read a checkout or an extracted tree of the base.
18. Occurrences of the integration scan in other block B seals, and in three block B files eligible by
    exact path, are reviewed token by token and bound to exact files and spans (DESIGN §12.1 L872: generic words are context matches; L874: exact, reviewed,
    narrowly anchored); a business literal is never reviewed, and no path prefix exempts anything.
19. A selector branch of a block B module without a base row is allowed only by a reviewed allowance bound to
    its reviewed record, its module's file SHA-256, its span and its token, and backed by the base rows of the
    published declarations it belongs to (DESIGN §12.1 L872, L874). RA-01 is ruled technical (a key of a
    declaration published on main; no look name compared, used as a key or selected; section "Reviewed
    selector-branch allowance"). A business key is never allowed: the code removes or injects it.
20. A base occurrence whose line a block B edit changed after the base, without touching its span, keeps its
    base row: it is relocated by an exact record of the lexicon (the row, the post-base columns and line SHA-256,
    the edit), never reviewed and never given a second row; its rule and disposition stand, and the I1 scan and
    the probe rescan pair it with its row through the record (DESIGN §12.1 L863, L874; section "Reviewed
    occurrences", "Relocated base rows").
21. A relocated row whose base line a later block B edit restores byte for byte is retired: its occurrence pairs
    with its base row through the base key, and a record left in place would pair the edited line again. A name of
    the published API that a block B fix restores is never reviewed where it sits on its base line (it pairs with
    its base row); only its occurrences in block B files eligible by exact path are reviewed, as class
    legacy-api-value (DESIGN.md:899 and 927, OPEN-LEGACY; §12.1 L874; section "Reviewed occurrences", "Final spec
    rebind").

## UNSEALED

| Id | Point | Owner | DESIGN default applied here |
| --- | --- | --- | --- |
| U-1 | Explicit legacy retarget of document and data links to an earlier activity of the flow | Owner, OPEN-MIGRATION (§13 L916; §16 items 1 and 6 keep each concrete migration under its own approval) | Retarget removed, endpoints preserved, relation reported (R-001); a retarget value refused in `business-policy/1` (S-011). |
| U-2 | Legacy business values of the private record: markers, metrics tables, looks and tokens, legacy options, layout geometry, export styles, decoding, palette, navigation mode, facts descriptor package | Private integration (data it owns) | Supplied explicitly as injected data (§9.5 L729, §12.2 L899, §16 item 5); pinned here by canonical SHA-256 only (`legacy-values.json`, L-005), values never copied. |
| U-3 | Width-alias table of the legacy record equivalent to the base ambient decomposition | Private integration | Explicit alias table, fallback width otherwise; no ambient decomposition (§12 L857, §9.3 L702, R-003). |
| U-4 | Composite glyphs and templates of the legacy looks (document wave, badge composites, flat shapes) | Conductor and render/export sessions, OPEN-RENDER-PRIMITIVES (§9.3 L717, §13 L924) | Supported explicit glyphs only, unsupported composites disabled; this seal pins geometry inputs, element kinds and module selection, not rendered pixels. |
| U-5 | Native transaction adapter staging (§8.2) | Canvas session and conductor, OPEN-HOOK (§13 L923) | Not exercised; A-010, A-022, X-010 and X-024 pin the legacy follow and auto-layout changes only. |
| U-6 | Optional properties panel | Owner, OPEN-PANEL (§13 L925, §16 item 5) | Untouched; no case depends on it. |
| U-7 | Release pins keeping existing callers on their release | Conductor, OPEN-LEGACY ratified by §16 item 5 (L899, L927) | Not a seal value; the seal only requires no business default in the new package. |

`seal.json#/unsealed` repeats this list.

## Hand checks

Legacy-shaped synthetic set (regular width `400+i`, bold `500+i` for code point `32+i`, fallback 999,
line height 1.2, badge chrome 29, margin 9, minimum width 78, gap 5, link inset 19):

- Text width of `A` at size 12: index 33, width 433, `433·12/1000 = 5.196` (A-007).
- Bold text width of `Approve order` at size 11: bold widths sum to 7389; the running sum of `w·11/1000`
  is `81.27900000000001`, not `7389·11/1000 = 81.279` (A-007, W-A5).
- `Í` aliases to `I` (441): `5.292`; `ñ`, the no-break space U+00A0 and `𝐀` take the fallback: `11.988`
  (A-007, R-003).
- Badge size of `CRM` on a host 120 wide: bold `C`, `R`, `M` = 535, 550, 545, text width `19.56`, wanted
  `19.56 + 29 = 48.56`; maximum width `max(78, 120 − 2·9) = 102`; width `min(102, max(78, 49)) = 78`;
  `48.56 ≤ 78`, so `[78, 28]` (A-006).
- Document height of `Spec`: one line, `(19 + 11·1.2 + 3) / 0.75 = 46.93`, ceiling 47, minimum 48, so 48;
  of `A much longer document title that wraps`: three lines at width 108, `(19 + 39.6 + 3) / 0.75 =
  82.13`, so 83 (A-006).
- Label box of `Ok?` at size 11 within 120: `14.883 + 4`, so 19; `11·1.2 + 2`, so 16 (A-006).
- Auto-layout (A-022): participant offset (100, 50); the second application badge moves to
  `210 + 1·(80 + 5) + 100 = 395`; its link ends at `78 + 80 + 50 − 19 = 189`.

## Verification

```
node --test --test-timeout=900000 tests/x24-externalization-seal.test.mjs
node --test --test-timeout=900000 tests/profile-externalization.probe.mjs   # red until block B lands
```

The seal test checks every sealed byte and executable (`seal.json`, whose digest it pins), the helper
imports, the case format, the comparator witnesses, every ledger row against its rule, its lexicon entry
and the hashed literal set, the literal-free rules with their witnesses, the scanner witnesses, the reviewed
records against the bytes of their files, the relocated rows against their base rows and the current file, the
admission of the data sets, the DESIGN.md:152 classification vectors and the wrong trims A-001 rejects, the
binding of the probes' original assertions to the base lines and the chain of the reseal receipts. It reads no Git object (the test history
guard, `tests/test-history-guard.test.mjs`, refuses object reads outside main and its closed allowance) and
imports no process module. The base-dependent recomputations are the reviewer commands of section
"Commands":

```
node tests/fixtures/x24-externalization/expectations/derive/base-check.mjs --files files.lst --root <base>
node tests/fixtures/x24-externalization/expectations/derive/reviewed.mjs --files tracked.lst
```
