#!/usr/bin/env node
// Signs an embedded release's manifest (#265): an Ed25519 signature of the
// file's exact bytes, base64 on one line (no newline), written to
// <manifest>.sig. Node's own crypto; no packages.
//
//   KINDRED_EMBED_SIGNING_KEY="$(cat key.pem)" node scripts/sign-embedded.mjs <manifest>
//   node scripts/sign-embedded.mjs <manifest> --key-file <PKCS#8 PEM file>
//
// The key never goes into the repository: in GitHub Actions it's the
// KINDRED_EMBED_SIGNING_KEY secret.
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const keyFlag = args.indexOf("--key-file");
const keyFile = keyFlag >= 0 ? args[keyFlag + 1] : undefined;
const manifestPath = args.find((a, i) => !a.startsWith("--") && (keyFlag < 0 || i !== keyFlag + 1));
if (!manifestPath) {
  console.error("usage: node scripts/sign-embedded.mjs <manifest> [--key-file <PEM>]");
  process.exit(2);
}

const pem = keyFile ? readFileSync(keyFile, "utf8") : process.env.KINDRED_EMBED_SIGNING_KEY;
if (!pem || !pem.trim()) {
  console.error("sign-embedded: no key (set KINDRED_EMBED_SIGNING_KEY or pass --key-file).");
  process.exit(1);
}

let key;
try {
  key = createPrivateKey({ key: pem, format: "pem" });
} catch (err) {
  console.error(`sign-embedded: the key isn't a readable PEM private key (${err.message}).`);
  process.exit(1);
}
if (key.asymmetricKeyType !== "ed25519") {
  console.error(`sign-embedded: the key is ${key.asymmetricKeyType}, not Ed25519.`);
  process.exit(1);
}

const bytes = readFileSync(manifestPath);
const signature = sign(null, bytes, key).toString("base64");
writeFileSync(`${manifestPath}.sig`, signature);

// The public half, raw and in base64, to check it against the one the host pins.
const raw = createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
console.log(`sign-embedded: signed ${manifestPath} (${bytes.length} bytes); public key ${raw}`);
