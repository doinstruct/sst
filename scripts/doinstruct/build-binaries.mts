#!/usr/bin/env bun
/**
 * Cross-compiles the SST CLI for the platforms the doinstruct fork ships and
 * writes `dist/artifacts.json` + `dist/metadata.json` in the same shape
 * goreleaser produces, so `sdk/js/scripts/release-doinstruct.ts` can consume
 * them unchanged.
 *
 * We do not run goreleaser here: everything goreleaser adds on top of the
 * cross-compile matrix (GitHub release, AUR, homebrew, nfpm, changelog) is
 * unwanted for a private fork, and the matrix itself is a handful of
 * `go build` invocations.
 *
 * Version resolution, in order:
 *   1. $SST_VERSION
 *   2. the exact git tag on HEAD, with a leading "v" stripped
 *   3. a snapshot version: 0.0.0-<unix seconds>
 */
import { $ } from "bun";
import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve(import.meta.dir, "../..");
const DIST = path.join(ROOT, "dist");

const TARGETS = (
  process.env.SST_TARGETS ??
  "darwin/arm64,darwin/amd64,linux/arm64,linux/amd64"
)
  .split(",")
  .map((t) => t.trim())
  .filter(Boolean)
  .map((t) => {
    const [goos, goarch] = t.split("/");
    if (!goos || !goarch) throw new Error(`Invalid target: ${t}`);
    return { goos, goarch };
  });

async function resolveVersion() {
  if (process.env.SST_VERSION) return process.env.SST_VERSION;
  const tag = (await $`git describe --tags --exact-match`.nothrow().quiet())
    .stdout.toString()
    .trim();
  if (tag) return tag.replace(/^v/, "");
  return `0.0.0-${Math.floor(Date.now() / 1000)}`;
}

const version = await resolveVersion();
console.log(`building sst ${version} for ${TARGETS.length} target(s)`);

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });

const artifacts: unknown[] = [];
for (const { goos, goarch } of TARGETS) {
  const name = goos === "windows" ? "sst.exe" : "sst";
  const rel = path.join("dist", `sst_${goos}_${goarch}`, name);
  const out = path.join(ROOT, rel);
  console.log(`  -> ${goos}/${goarch}`);
  await $`go build -trimpath -buildvcs=false -ldflags=${`-s -w -X main.version=${version}`} -o ${out} ./cmd/sst`
    .cwd(ROOT)
    .env({
      ...process.env,
      CGO_ENABLED: "0",
      GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "auto",
      GOOS: goos,
      GOARCH: goarch,
    });
  artifacts.push({
    name,
    path: rel,
    goos,
    goarch,
    type: "Binary",
  });
}

await Bun.write(
  path.join(DIST, "artifacts.json"),
  JSON.stringify(artifacts, null, 2),
);
await Bun.write(
  path.join(DIST, "metadata.json"),
  JSON.stringify({ project_name: "sst", version, tag: `v${version}` }, null, 2),
);

console.log(`wrote ${path.join(DIST, "artifacts.json")}`);
