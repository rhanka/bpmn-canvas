# Profile lot 2: compiler, codec, externalization and native boundary (canvas side)

Lot 2 row (§14.2): both libraries ship load/compile/evaluate, descriptor
context, closed refs, pure codec/results and the native bridge; the twin
supplies the generated profile, derived schemas and docs. Exit gate:
neutral-profile
substitution, malicious/unknown AST negatives, compatibility cross-product,
brand/source/distribution occurrence inventory with identical compiler
outcomes; no production dependency on unpublished API.

This file records the canvas side only. The generated profile bundle
(named by the twin), derived schemas/docs and the Python twin stay outside
this checkout; the conductor reconciles both receipts.

## Delivered

- `src/profile/compiler.ts`: strict `loadProfile` (lexical codes before
  schema before compiler checks), `compileProfile` (CR-01–CR-14 static checks:
  capabilities, value/selector/bounds/symbol/authority/identity/lint/
  presentation/UI/export/migration/fallback/phase rules), and immutable
  snapshot evaluation (`evaluatePredicate`, `selectHandles`, `evaluateValue`).
  Recipe planning and application belong to lot 3 (C/N).
- `src/profile/unicode-case.ts`: pinned `15.0.0` full default case table
  loader plus applicator. The `case` operator uses only this injected table;
  platform case methods are banned in `src/profile/**` by test. Block A
  vendors the twin-published `contracts/unicode-case/15.0.0/` contract
  byte-for-byte into `tests/fixtures/unicode-case-15.0.0/` with an offline
  hash pin; the Final_Sigma context rule runs on pure Cased /
  Case_Ignorable data with no other exception.
- `src/profile/descriptor-context.ts`: injected digest-pinned packages only,
  unique ids, caller-declared required pins, single-context digest check.
- `src/profile/native-bridge.ts`: read-only native-JSON import preview
  (strict parse, descriptor validation, presentation extraction, import base
  revision) and the portable XML sidecar manifest (identity, sorted bindings,
  semantic revision; no exporter-name guessing).
- Byte-stability fixtures `tests/fixtures/profile-native/stable.bpmn` and
  `stable-task.bpmn`: load → unrelated rename → save keeps extension values
  and ids stable with the same injected descriptors.
- §12 externalization: marker lexicon replaced by generic annotation names
  across sources, fixtures, tests and docs; `tests/fixtures/brand-baseline.tsv`
  is empty so the release gate passes without an owner override (pin retained
  for the closed-to-additions proof).
- Reused lot 0 seams unchanged: `profile-c14n/2`, `stable-id/1`,
  compatibility matrix, envelope, `PureResult/1`, `Result/1`, `Report/2`,
  `Snapshot/1`.
- Tests: `tests/profile-compiler.test.mjs` (load/compile/substitution/
  negatives/predicates/selectors/values/malicious/bounds),
  `tests/profile-case-policy.test.mjs` (source ban, stub load, full-mapping
  vectors, U+0264 pending vector, compiler wiring),
  `tests/profile-descriptor-context.test.mjs`,
  `tests/profile-native-stability.test.mjs` (two fixtures, preview, manifest).

## Design defaults chosen (no blocking owner vote)

- A missing case table refuses `profile-resource-missing`; a non-`15.0.0`
  manifest refuses at table load; lower-mode sigma follows the injected
  Final_Sigma context rule; lone surrogates pass through unmapped.
- Marker literals remain as explicit compatibility data until compiled
  profile recognition replaces the dispatch in a later lot.
- The canonical-comparator privacy test allows exactly `./profile-lint`,
  `./profile` and `./profile/compiler`, which share the synchronous public
  facade. The canonical comparator remains private.
