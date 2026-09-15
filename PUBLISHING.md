# Publishing the doinstruct SST fork

This fork is consumed as a private npm package from **GitHub Packages**, not
from npmjs.org. Nothing else about SST changes: `@doinstruct/sst` is a drop-in
alias for `sst`.

## Package layout

| Package | Contents |
| --- | --- |
| `@doinstruct/sst` | the JS SDK (`dist/`) plus the `bin/sst.mjs` launcher |
| `@doinstruct/sst-darwin-arm64` | the CLI binary for that platform |
| `@doinstruct/sst-darwin-x64` | " |
| `@doinstruct/sst-linux-arm64` | " |
| `@doinstruct/sst-linux-x64` | " |

The platform packages are `optionalDependencies` of `@doinstruct/sst` with an
`os`/`cpu` field, so a package manager installs exactly one of them.
`bin/sst.mjs` derives the binary package name from its own package name, so the
scoped build looks for `@doinstruct/sst-<platform>-<arch>`. `SST_BIN_PATH` still
overrides everything.

Each CLI binary `go:embed`s `platform/dist`, which is built by
`platform/scripts/build`. A binary built without it is broken at runtime, so
never skip that step.

## Version scheme

`4.17.1-doinstruct.N` — the upstream base version this fork is cut from, plus a
monotonic fork counter. It can never be confused with an upstream release, and
it sorts below the next upstream version (4.17.2). Because it is a semver
prerelease, npm requires an explicit dist-tag; the release script passes
`--tag latest`.

Bump `N` for every publish. Rebase the fork onto a newer upstream and the base
changes with it (`4.18.0-doinstruct.1`).

## How to publish a new version

Publishing runs in CI, from `.github/workflows/publish-doinstruct.yml` on the
default branch. Two triggers:

1. **Manual dispatch** (Actions -> publish-doinstruct -> Run workflow). Takes a
   `version` and a `dry_run` flag that defaults to **true**. Use the dry run to
   inspect the tarballs (they are uploaded as a build artifact) before shipping.
2. **Tag push** matching `v*-doinstruct.*`. This always publishes for real:

   ```bash
   git tag v4.17.1-doinstruct.1
   git push doinstruct v4.17.1-doinstruct.1
   ```

   Upstream `vX.Y.Z` tags do not match and never trigger a publish.

### Locally

```bash
bun install
./platform/scripts/build                       # builds platform/dist (needs docker)
SST_VERSION=4.17.1-doinstruct.1 bun run build:binaries
bun run release:doinstruct -- --dry-run        # packs to dist/packages, publishes nothing
```

Drop `--dry-run` to publish for real; that needs a `~/.npmrc` with a token that
has `write:packages` (see below). Useful env vars: `SST_TARGETS`
(default `darwin/arm64,darwin/amd64,linux/arm64,linux/amd64`), `SST_SCOPE`,
`SST_REGISTRY`, `SST_NPM_TAG`.

## How a developer installs it

GitHub Packages requires authentication even for reading, so each developer
needs a classic PAT with the `read:packages` scope once:

```bash
# ~/.npmrc
@doinstruct:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<PAT with read:packages>
```

Then in the consuming workspace (`apps/backend` in the platform monorepo), the
dependency is an alias:

```jsonc
// package.json
"devDependencies": {
  "sst": "npm:@doinstruct/sst@4.17.1-doinstruct.1"
}
```

and the workspace needs the scope mapping so the lockfile resolves:

```ini
# apps/backend/.npmrc
@doinstruct:registry=https://npm.pkg.github.com
```

Everything else is unchanged: `node_modules/.bin/sst`, `npx sst deploy`, the
`sst` import in code.

## How CI installs it

`actions/setup-node` already points at GitHub Packages in
`.github/workflows/backend-deploy.yml`:

```yaml
- uses: actions/setup-node@v4
  with:
    registry-url: "https://npm.pkg.github.com"
# ...
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The only requirement is that the workflow's `GITHUB_TOKEN` has
`packages: read`, and that the package is visible to the consuming repository
(see "Manual steps" below).

## How to get back to vanilla sst

Revert the alias:

```jsonc
"devDependencies": { "sst": "4.17.1" }
```

Delete `apps/backend/.npmrc` if nothing else in that workspace is scoped to
`@doinstruct`, run `npm install`, and commit the lockfile. No code changes are
needed; the fork carries no API differences. Note that the fork's bootstrap
changes may already have run against your AWS accounts — see the fork's
bootstrap revert script before switching back.

## Manual steps that cannot be automated

- Grant the consuming repository read access to the packages: GitHub ->
  `doinstruct/sst` -> Packages -> package -> Package settings -> Manage Actions
  access -> add `doinstruct/platform` with **Read**.
- Each developer creates their own `read:packages` PAT (GitHub does not issue
  org-wide read tokens for npm).
- `doinstruct/sst` is a public fork, so packages published from it are public.
  They still require a token to download, but do not treat them as a secret
  boundary.
