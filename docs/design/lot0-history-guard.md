# Test history guard scope

The test history guard is a best-effort lint over test sources. It resolves
child_process bindings through lexical const chains: named, default and
namespace imports, the global require helper and the direct createRequire
helper with literal or unresolved specifiers (an unresolved specifier is
treated as a potential child_process module), literal property access and
string-literal element access, non-rest object destructuring, and literal
call spreads.
An unresolved executable or command is rejected outside the controlled
Git wrapper. Direct call, apply and bind on a resolved process API, and
direct Reflect.apply with a resolved process API target, are rejected.
Shell execution mentioning Git through exec/execSync command strings,
shell-enabled process options, or direct shell launchers, and Git revision
input through cat-file --batch* or --stdin on any subcommand, are rejected.

HEAD, main, uniquely resolved main commit identifiers and the closed published
allowance (07be09e and 45aa690) remain permitted. Corpus provenance identifiers
are data and do not authorize local Git object reads.

Known limits / out of scope. The following families are not modelled and stay
out of scope by design:
- Computed member access on process modules or APIs, including the same
  technique applied to stdin-mode arguments.
- Indirect invocation beyond the direct forms, including Function.prototype
  dispatch and aliased Reflect.apply helpers.
- Aliased module loaders: require aliases and createRequire import aliases;
  only the global require and the directly named createRequire helper resolve.
- Rest destructuring of process modules.
- Reassigned or otherwise mutable aliases outside the const-only resolver.
- Intermediate launchers such as env, whose arguments are not unwrapped to
  the resulting shell or Git command.
- Git configuration and repository-location injection through options or the
  environment, including GIT_CONFIG_*, GIT_DIR and GIT_OBJECT_DIRECTORY.
- Low-level or out-of-process paths: process.binding, worker_threads with
  evaluated code, and node -e payloads.
- Direct object-store reads that bypass process execution, such as fs plus
  zlib reads under .git/objects.
- Generated sources: files written and then executed are not tracked across
  the write/execute boundary.

This lint does not model every possible JavaScript execution path. The
authoritative check is the full test run on a fresh squash without branch
objects and, after merge, CI on main where branch objects never exist.
Passing the lint or the focused Git shim tests does not replace that run.

Applying the unresolved-executable rule also requires existing non-Git test
runners to name their executable literally. Node workers and temporary shim
scripts run through the literal node executable; the preparation helper uses
literal npm and npx executables and a controlled Git wrapper.

The successor receipt is receipts/lot0-history-guard-2.json. It records the
adversarial checks, verification results and explicit old/new byte seals.
