#!/usr/bin/env node
// The embedded build (#263): Kindred for running inside a host app's page.
// Runs `react-scripts build` with REACT_APP_EMBEDDED=1 and PUBLIC_URL=. (every
// asset path relative, so it works from any origin and path), then writes
// build/embedded.json. The version and commit go into the bundle too, for
// the bridge's `ready` message (docs/embedding.md).
//
// Version: <package.json version>+<YYYYMMDDHHMM UTC>.<short commit>.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
// GitHub Actions checks out a detached commit; GITHUB_SHA is the same one.
const commit = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
const short = commit.slice(0, 7);
try {
  if (git("status", "--porcelain")) console.warn(`build-embedded: the working tree has uncommitted changes; the build says ${short} anyway.`);
} catch {
  // Not a git checkout: nothing to warn about.
}

const now = new Date();
now.setUTCSeconds(0, 0);
const pad = (n) => String(n).padStart(2, "0");
const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
const version = `${pkg.version}+${stamp}.${short}`;
const built = now.toISOString().replace(/\.\d{3}Z$/, "Z");

const bin = join(root, "node_modules", ".bin", process.platform === "win32" ? "react-scripts.cmd" : "react-scripts");
const result = spawnSync(bin, ["build"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    REACT_APP_EMBEDDED: "1",
    REACT_APP_EMBEDDED_VERSION: version,
    REACT_APP_EMBEDDED_COMMIT: commit,
    PUBLIC_URL: ".",
    // The service worker isn't registered when embedded; no need for a map
    // of the sources either in a copy that's shipped inside another app.
    GENERATE_SOURCEMAP: "false",
  },
});
if (result.status !== 0) process.exit(result.status ?? 1);

const info = { name: "kindred-embedded", version, commit, built, bridge: 1 };
writeFileSync(join(root, "build", "embedded.json"), `${JSON.stringify(info, null, 2)}\n`);
console.log(`build-embedded: wrote build/embedded.json (${version})`);
