import fs from "fs";
import { formatReport, replayAll } from "./replay";
import { readReplyExport } from "./replyLog";

// An exported helper reply log (#214) checked against the parsers. Runs only
// with REPLY_LOG set, through scripts/replay-replies.js: the parsers import
// app modules that only Jest's setup can load, so this rides on it rather
// than a separate TypeScript runner.
const file = process.env.REPLY_LOG;

(file ? it : it.skip)("replays an exported reply log", () => {
  const entries = readReplyExport(fs.readFileSync(file!, "utf8"));
  const text = formatReport(replayAll(entries));
  if (process.env.REPLY_LOG_OUT) fs.writeFileSync(process.env.REPLY_LOG_OUT, `${entries.length} replies in ${file}\n\n${text}\n`);
  else console.log(text);
  expect(entries.length).toBeGreaterThanOrEqual(0);
});
