# Publishing the doinstruct SST fork

The fork is published as `@doinstruct/sst` on GitHub Packages, a drop-in for
`sst`. It is a public package (the repo is public); GitHub Packages still needs
a token to download it, that is not a secrecy boundary.

The build is upstream's own: `.goreleaser.yml` cross-compiles the CLI (with
`platform/dist` embedded), `sdk/js/scripts/release.ts` publishes one
`@doinstruct/sst-<os>-<cpu>` package per binary plus `@doinstruct/sst` with
them as `optionalDependencies`. `bin/sst.mjs` picks the binary package matching
the scope; `SST_BIN_PATH` still overrides it.

## Publish

Version scheme: `<upstream base>-doinstruct.<n>`, e.g. `4.17.1-doinstruct.1`.

```bash
git tag v4.17.1-doinstruct.1
git push doinstruct v4.17.1-doinstruct.1   # .github/workflows/publish-doinstruct.yml publishes
```

Running the workflow by hand (Actions -> publish-doinstruct -> Run workflow)
does a snapshot build and `npm publish --dry-run` only; nothing is published.

Locally (publishes nothing):

```bash
bun install
./platform/scripts/build                        # needs docker
goreleaser build --clean --snapshot --single-target
cd sdk/js && ./scripts/release.ts --dry-run
```

## Consume

Once per developer, a classic PAT with `read:packages` in `~/.npmrc`:

```ini
@doinstruct:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<PAT>
```

In the consuming workspace, `.npmrc` with `@doinstruct:registry=https://npm.pkg.github.com`
and the alias:

```json
"devDependencies": { "sst": "npm:@doinstruct/sst@4.17.1-doinstruct.1" }
```

CI: `actions/setup-node` with `registry-url: https://npm.pkg.github.com`,
`NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` and `packages: read`. Back to
vanilla: set `"sst": "4.17.1"` again and reinstall.

## Manual, once

- Package settings on `doinstruct/sst` -> Manage Actions access -> add the
  consuming repository with Read (needed for its `GITHUB_TOKEN`).
