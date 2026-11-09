#!/usr/bin/env node
// Checks an embedded release (#265) the way a host app does: the manifest's
// Ed25519 signature against a public key, then the zip's size and SHA-256
// against the manifest.
//
//   node scripts/verify-embedded.mjs <manifest> <public key> [zip]
//
// The public key is the raw 32 bytes in base64 (as hosts pin it), or a file
// holding that or a PEM public key. The signature is read from <manifest>.sig;
// the zip defaults to the manifest's zip name beside it, and is skipped if
// it isn't there. Exits 0 when everything matches.
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [manifestPath, keyArg, zipArg] = process.argv.slice(2);
if (!manifestPath || !keyArg) {
  console.error("usage: node scripts/verify-embedded.mjs <manifest> <public key | key file> [zip]");
  process.exit(2);
}

const fail = (why) => {
  console.error(`verify-embedded: FAILED: ${why}`);
  process.exit(1);
};

const keyText = existsSync(keyArg) ? readFileSync(keyArg, "utf8").trim() : keyArg.trim();
let publicKey;
try {
  if (keyText.includes("-----BEGIN")) publicKey = createPublicKey({ key: keyText, format: "pem" });
  else {
    const raw = Buffer.from(keyText, "base64");
    if (raw.length !== 32) fail(`a raw Ed25519 public key is 32 bytes, this one is ${raw.length}`);
    publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") }, format: "jwk" });
  }
} catch (err) {
  fail(`the public key can't be read (${err.message})`);
}
if (publicKey.asymmetricKeyType !== "ed25519") fail(`the key is ${publicKey.asymmetricKeyType}, not Ed25519`);

const bytes = readFileSync(manifestPath);
const sigPath = `${manifestPath}.sig`;
if (!existsSync(sigPath)) fail(`no signature at ${sigPath}`);
const signature = Buffer.from(readFileSync(sigPath, "utf8").trim(), "base64");
if (signature.length !== 64) fail(`an Ed25519 signature is 64 bytes, this one is ${signature.length}`);
if (!verify(null, bytes, publicKey, signature)) fail("the signature doesn't match the manifest and key");
console.log("verify-embedded: signature OK");

let manifest;
try {
  manifest = JSON.parse(bytes.toString("utf8"));
} catch {
  fail("the manifest isn't JSON");
}
if (manifest.name !== "kindred-embedded") fail(`unexpected name ${manifest.name}`);
if (manifest.bridge !== 1) fail(`bridge version ${manifest.bridge}, expected 1`);
console.log(`verify-embedded: ${manifest.name} ${manifest.version} (commit ${manifest.commit}, built ${manifest.built}, bridge ${manifest.bridge})`);

const zipPath = zipArg || join(dirname(manifestPath), manifest.zip?.name || "kindred-embedded.zip");
if (!existsSync(zipPath)) {
  if (zipArg) fail(`no zip at ${zipPath}`);
  console.log("verify-embedded: no zip beside the manifest; checked the signature only");
  process.exit(0);
}
const zip = readFileSync(zipPath);
if (zip.length !== manifest.zip.size) fail(`zip is ${zip.length} bytes, the manifest says ${manifest.zip.size}`);
const sha = createHash("sha256").update(zip).digest("hex");
if (sha !== manifest.zip.sha256) fail(`zip SHA-256 is ${sha}, the manifest says ${manifest.zip.sha256}`);
console.log(`verify-embedded: zip OK (${zip.length} bytes, sha256 ${sha})`);
