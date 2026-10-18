# Releasing

Releases are cut by pushing a tag `vX.Y.Z` that points at a commit on `main`. The `release`
workflow checks that the tag matches `package.json`, runs the whole test suite, publishes to npm
with provenance, creates the GitHub Release and installs the published package in a scratch
directory.

1. Bump `version` in `package.json` in a commit on `main` and wait for `ci` to pass.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.

While the temporary brand baseline is nonempty, `prepublishOnly` refuses release unless
`docs/release/override-X.Y.Z.json` is committed and unchanged. The JSON object must contain
exactly `owner` (nonempty), `decision` (`GO`), `ownerDecisionRef` (a nonempty reference to
the owner's decision), `version` (the exact package version), `date` (today in UTC),
`baselineSha256` and `tarballSha256` (lowercase SHA-256 of the approved `npm pack
--ignore-scripts` tarball). The gate independently packs the current package into scratch
space and compares its digest before granting approval.

Single use relies on npm version immutability across all checkouts. After validating the
override and packed artifact, the gate queries `npm view <pkg>@<version> version --json`.
An already published version refuses release with `VERSION_ALREADY_PUBLISHED`. Only an
explicit registry `E404` permits publication; an unreachable registry, authentication error,
timeout or invalid response refuses with `REGISTRY_UNAVAILABLE`. The query has no retries
and a bounded timeout. Tests inject the registry query without network access.

A failed publish can retry the same exact version and tarball while the version remains
unpublished and the committed owner decision still satisfies the checks above. A stale
date, changed version or tarball, missing reference or malformed record refuses release.
The gate stores no consumption state in Git or CI and does not publish anything itself.

## npm trusted publishing

Steady state uses npm trusted publishing (OIDC): no token is stored. On npmjs.com, open the package
settings, "Trusted publisher", and attach GitHub Actions with owner `rhanka`, repository
`bpmn-canvas`, workflow `release.yml`.

The trusted publisher can only be attached once the package exists, so the very first publish
uses a one-off automation token: create it on npmjs.com (it needs the 2FA gesture), store it as the
`NPM_TOKEN` repository secret, push the first tag, attach the trusted publisher, then delete the
secret and revoke the token.

## Live demo (GitHub Pages)

`.github/workflows/pages.yml` builds `site/` (`npm run build`, `node scripts/build-demo.mjs`) and deploys it on every push
to `main`. One-time setting: repository Settings, Pages, Source = "GitHub Actions". The README links to
`https://rhanka.github.io/bpmn-canvas/` and embeds `docs/demo/*.svg` from `raw.githubusercontent.com` (absolute URLs, so
the npm page shows the same images).
