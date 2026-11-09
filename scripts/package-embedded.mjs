#!/usr/bin/env node
// Packs the embedded build (#265) for a release: build/ zipped with its files
// at the zip's root, and the manifest the release carries next to it.
//
//   node scripts/package-embedded.mjs [out dir]   (default: dist-embedded)
//
// Writes <out>/kindred-embedded.zip and <out>/kindred-embedded.json, and
// prints the release tag. Run `npm run build:embedded` first; sign the
// manifest with scripts/sign-embedded.mjs afterwards, without changing a byte.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, "build");
const out = resolve(process.argv[2] || join(root, "dist-embedded"));

let info;
try {
  info = JSON.parse(readFileSync(join(build, "embedded.json"), "utf8"));
} catch {
  console.error("package-embedded: build/embedded.json is missing; run `npm run build:embedded` first.");
  process.exit(1);
}
if (info.name !== "kindred-embedded" || !info.version || !info.commit || !info.built || info.bridge !== 1) {
  console.error("package-embedded: build/embedded.json isn't an embedded build's.");
  process.exit(1);
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(build);

// Every entry dated as the build, so the same build zips the same way.
const date = new Date(info.built);
const zip = new JSZip();
for (const file of files) zip.file(relative(build, file).split(sep).join("/"), readFileSync(file), { date, createFolders: false });
const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 }, platform: "UNIX" });

mkdirSync(out, { recursive: true });
const zipName = "kindred-embedded.zip";
writeFileSync(join(out, zipName), bytes);

const manifest = {
  name: "kindred-embedded",
  version: info.version,
  commit: info.commit,
  built: info.built,
  bridge: info.bridge,
  zip: { name: zipName, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") },
};
writeFileSync(join(out, "kindred-embedded.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const tag = `embedded-${info.version.replace(/\+/g, "-")}`;
console.log(`package-embedded: ${files.length} files, ${bytes.length} bytes, sha256 ${manifest.zip.sha256}`);
console.log(`package-embedded: tag ${tag}`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\nversion=${info.version}\n`, { flag: "a" });
