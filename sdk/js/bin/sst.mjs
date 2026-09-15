#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import path from "path";
import { execFileSync } from "child_process";

let resolved = process.env.SST_BIN_PATH;

if (!resolved) {
  // Derive the binary package name from our own package name so that a scoped
  // republish (e.g. "@doinstruct/sst") looks for "@doinstruct/sst-darwin-arm64"
  // instead of the unscoped upstream package. For the unscoped upstream
  // package this is exactly the old behaviour.
  const { name: pkgName } = require("../package.json");
  const scope = pkgName.startsWith("@") ? `${pkgName.split("/")[0]}/` : "";
  const base = pkgName.replace(/^@[^/]+\//, "");
  const name = `${scope}${base}-${process.platform}-${process.arch}`;
  const binary = process.platform === "win32" ? "sst.exe" : "sst";

  try {
    resolved = require.resolve(path.join(name, "bin", binary));
  } catch (ex) {
    console.error(
      `It seems that your package manager failed to install the right version of the SST CLI for your platform. You can try manually installing the "${name}" package.`,
    );
    process.exit(1);
  }
}

process.on("SIGINT", () => {});

try {
  execFileSync(resolved, process.argv.slice(2), {
    stdio: "inherit",
  });
} catch (ex) {
  process.exit(1);
}
