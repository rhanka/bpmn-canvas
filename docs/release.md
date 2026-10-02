# Releasing

Releases are cut by pushing a tag `vX.Y.Z` that points at a commit on `main`. The `release`
workflow checks that the tag matches `package.json`, runs the whole test suite, publishes to npm
with provenance, creates the GitHub Release and installs the published package in a scratch
directory.

1. Bump `version` in `package.json` in a commit on `main` and wait for `ci` to pass.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.

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
