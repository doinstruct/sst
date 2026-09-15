#!/usr/bin/env bun
/**
 * Publishes the doinstruct fork of the SST npm package to GitHub Packages.
 *
 * Adapted from ./release.ts (the upstream npmjs.org release). Differences:
 *   - every package is scoped (@doinstruct/sst, @doinstruct/sst-darwin-arm64),
 *     because GitHub Packages only accepts packages scoped to the repo owner
 *   - publishConfig pins the registry to npm.pkg.github.com
 *   - supports --dry-run (npm pack + npm publish --dry-run, publishes nothing)
 *
 * Expects dist/artifacts.json + dist/metadata.json, i.e. run
 * `bun run build:binaries` (or goreleaser) first.
 */
import { $ } from "bun";
import fs from "fs/promises";
import path from "path";

// dist/metadata.json and dist/artifacts.json are produced at build time by
// `bun run build:binaries`, so they are read at runtime rather than imported —
// a static import would not typecheck on a clean checkout.
const DIST = path.resolve(import.meta.dir, "../../../dist");

type Metadata = { version: string };
type Artifact = { name: string; path: string; goos: string; goarch: string; type: string };

async function readDist<T>(file: string): Promise<T> {
  const target = path.join(DIST, file);
  if (!(await Bun.file(target).exists()))
    throw new Error(
      `${target} not found - run \`bun run build:binaries\` (or goreleaser) first`,
    );
  return Bun.file(target).json() as Promise<T>;
}

const metafile = await readDist<Metadata>("metadata.json");
const artifacts = await readDist<Artifact[]>("artifacts.json");

// every path below is relative to sdk/js
process.chdir(path.resolve(import.meta.dir, ".."));

// package.json is rewritten for the publish and restored verbatim afterwards
const originalPkgJson = await Bun.file("package.json").text();
const pkg = JSON.parse(originalPkgJson) as {
  name: string;
  license: string;
};

const SCOPE = process.env.SST_SCOPE ?? "@doinstruct";
const REGISTRY = process.env.SST_REGISTRY ?? "https://npm.pkg.github.com";
const REPO_URL =
  process.env.SST_REPO_URL ?? "git+https://github.com/doinstruct/sst.git";
const DRY_RUN = process.argv.includes("--dry-run");
// npm refuses to publish a prerelease version (4.17.1-doinstruct.N) without an
// explicit dist-tag. "latest" is what we want: the fork is the only thing in
// this package, so `@doinstruct/sst` with no version should resolve to it.
const TAG = process.env.SST_NPM_TAG ?? "latest";
const PACK_DIR = path.resolve(import.meta.dir, "../../../dist/packages");

const nextPkg = JSON.parse(originalPkgJson);
nextPkg.name = `${SCOPE}/${pkg.name}`;
nextPkg.version = metafile.version;
nextPkg.repository = { type: "git", url: REPO_URL };
nextPkg.publishConfig = { registry: REGISTRY };
nextPkg.optionalDependencies = {};

console.log(
  `${DRY_RUN ? "[dry run] " : ""}publishing ${nextPkg.name}@${nextPkg.version} to ${REGISTRY}`,
);

await fs.rm("dist", { recursive: true, force: true });
await $`bun run build`;
if (DRY_RUN) await fs.mkdir(PACK_DIR, { recursive: true });

const cpus: Record<string, string> = {
  arm64: "arm64",
  amd64: "x64",
  "386": "x86",
};

const tmp = "tmp";
const binaryPackages: string[] = [];
for (const artifact of artifacts) {
  if (artifact.type !== "Binary") continue;
  const os = artifact.goos === "windows" ? "win32" : artifact.goos;
  const cpu = cpus[artifact.goarch];
  if (!os || !cpu)
    throw new Error(`Invalid artifact: ${JSON.stringify(artifact)}`);
  const name = `${SCOPE}/${pkg.name}-${os}-${cpu}`;
  const dir = path.join(tmp, `${pkg.name}-${os}-${cpu}`);
  const binary = path.basename(artifact.path);
  await fs.mkdir(path.join(dir, "bin"), { recursive: true });
  await fs.cp(path.join("../../", artifact.path), path.join(dir, "bin", binary));
  await Bun.write(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name,
        version: nextPkg.version,
        license: nextPkg.license,
        repository: nextPkg.repository,
        publishConfig: nextPkg.publishConfig,
        os: [os],
        cpu: [cpu],
      },
      null,
      2,
    ),
  );
  nextPkg.optionalDependencies[name] = nextPkg.version;
  binaryPackages.push(dir);
}

async function ship(dir: string) {
  if (DRY_RUN) {
    await $`npm pack --pack-destination ${PACK_DIR}`.cwd(dir);
    await $`npm publish --tag ${TAG} --dry-run`.cwd(dir);
    return;
  }
  await $`npm publish --tag ${TAG}`.cwd(dir);
}

try {
  for (const dir of binaryPackages) await ship(dir);
  await Bun.write("package.json", JSON.stringify(nextPkg, null, 2));
  await fs.cp("../../README.md", "README.md");
  await ship(".");
} finally {
  await Bun.write("package.json", originalPkgJson);
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm("README.md", { force: true });
}

console.log(
  DRY_RUN
    ? `dry run complete, tarballs in ${PACK_DIR}`
    : `published ${nextPkg.name}@${nextPkg.version}`,
);
