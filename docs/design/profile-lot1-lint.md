# Profile lot 1: published lint baseline and bridge (canvas side)

Lot 1 row (§14.2): owner Python pin of released `bpmn-io >= 0.2.1` with
literal upstream `11.15.0`; both sessions ship generic rule and unified
API/CLI/browser adapters. Profile target `0.3.0`. Exit gate: source/package
hashes and the supplied 394-diagram baseline; exact resolver/None/exception/
whitelist/cycle/options/phase/report checks and numeric info mapping; browser
budget from §6.5; no old workbench lint or PR amendment.

This file records the canvas side only. The 394-diagram baseline, the Python
CLI (`profile lint --json`, exit codes) and the port itself stay on the Python
side; the conductor reconciles both receipts.

## Delivered

- Dependency: exact `bpmnlint 11.15.0` in `dependencies` (no range), license
  text in `licenses/bpmnlint.LICENSE`, notice in `THIRD_PARTY_NOTICES.md`.
- `src/profile/lint-bridge.ts` is internal to the synchronous public facade
  shared by `./profile-lint`, `./profile` and `./profile/compiler`. Public
  `validate()` executes the selected rules through upstream `applyRule`;
  the resolver supplies pinned factories and configurations:
  `LINT_BASELINE`, the single rule `profile-mechanism/profile` on the only
  executable plugin `bpmnlint-plugin-profile-mechanism`, the static allowlist
  registry (pinned factories/configs only, fresh `Linter` and fresh rule
  instances per run), whole-setting replacement with profile severity records
  resetting options to empty, effective-info-over-warn transport restored by
  the adapter, unified `Report/2` merge preserving raw standard findings, the
  closed §6.5 event matrix, and a read-only moddle id index.
- `scripts/measure-lint-budget.mjs` + `docs/design/receipts/lot1-lint-browser.json`:
  incremental `profile-lint` payload 40,844 B / 13,218 B gzip against the
  150 KiB gzip budget; root and browser entries carry zero lint bytes when the
  feature is unused; no dynamic module or network load; A→B→A identical.
- Tests: `tests/profile-lint-bridge.test.mjs` (15 checks: baseline pin,
  unknown/thrown lookups, cycle, whole-setting replacement, info transport,
  error-transport warning, merge dedupe, malformed/unknown-id entries,
  unavailable evaluator, A→B→A, no mutation, event matrix, zero-lint entries,
  budget).

## Design defaults chosen (no blocking owner vote)

- Pre-evaluation failures (unknown rule/config, extends cycle, incomplete
  pairing, stage/policy mismatch) refuse with a typed code; anything arising
  during or after evaluation (rule exception, malformed custom report,
  unavailable evaluator) becomes an `adapter/lint-rule-error` integrity entry,
  per the §6.4 table.
- An empty `compiledRules` transport needs no evaluator and yields nothing;
  the evaluator is required only when subrules are selected.
- The event matrix ships as data plus a pure checker; generating it into
  downstream AI tool schemas is out of scope (§11) and consumes this table only.
- Staged-browser equivalence is proven by identical bundled code with no
  Node-only loading; a live staged run stays behind OPEN-HOOK.
