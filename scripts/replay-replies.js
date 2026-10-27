#!/usr/bin/env node
// Runs an exported helper reply log (#214; Settings > Spending > Helper
// replies > Export) through the world engine's parsers and prints how often
// each tag came back missing or malformed:
//
//   node scripts/replay-replies.js ~/Downloads/kindred-helper-replies.json
//
// With no file it replays the hand-written examples in
// src/features/ai/__replies__. The work happens in
// src/features/ai/replayFile.test.ts, under Jest, which can load the app's
// modules as they are.
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const input = process.argv[2];
const examples = path.join(root, "src/features/ai/__replies__");

let file = input && path.resolve(input);
if (!file) {
  // The examples are three arrays; one file of all of them reads the same.
  const all = fs.readdirSync(examples).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(fs.readFileSync(path.join(examples, f), "utf8")));
  file = path.join(os.tmpdir(), `kindred-replies-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(all));
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

const out = path.join(os.tmpdir(), `kindred-replay-${process.pid}.txt`);
const run = spawnSync("npx", ["react-scripts", "test", "--watchAll=false", "--silent", "src/features/ai/replayFile.test.ts"], {
  cwd: root,
  env: { ...process.env, CI: "true", REPLY_LOG: file, REPLY_LOG_OUT: out },
  encoding: "utf8",
});
if (!fs.existsSync(out)) {
  process.stderr.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  process.exit(run.status || 1);
}
process.stdout.write(fs.readFileSync(out, "utf8"));
fs.unlinkSync(out);
if (!input) fs.unlinkSync(file);
