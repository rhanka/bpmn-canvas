The opt-in `profile` and `profile/compiler` package subpaths expose the lot-2
profile facade. `profile-lint` aliases that facade. The raw lint transport is
internal; callers use `validate(compiled, envelope, {phase, readinessPolicy})`.

`loadProfile`, `compileProfile`, `evaluatePredicate`, `select`, descriptor
context creation and native import preview return `PureResult` synchronously.
Success carries `payload` and `diagnostics`; refusal carries `code` and
`diagnostics`. No host crypto service is needed in the browser.

`validate` is a synchronous `Result/1`: success carries operation, identity,
unchanged base/revision, the full `Report/2`, and `payload: {ok, counts}`.
Counts contain info, warn and error. Refusals expose no candidate payload or
committed revision. The compiled handle retains admitted rule and registry
data privately; a reconstructed handle refuses. Rules, selectors and rule
bindings execute against the original native source, and reports retain the
literal standard findings alongside declarative findings.

The host supplies `CompilerInputs`: schema bytes, the compiler rule-table pin,
base bytes with their identity and hash domain, descriptor bytes and pins,
capability signatures, and any resource asset bag. Load verifies those inputs
before returning an immutable admitted handle. Compile receives the matching
registry and any extension codec configuration as data. This facade introduces
no editor transaction,
completion, normalization, layout or export implementation. The default XML
entry points retain their separate release behavior.
