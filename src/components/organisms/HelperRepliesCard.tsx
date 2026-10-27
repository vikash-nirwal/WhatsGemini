import React, { useEffect, useState } from "react";
import { SettingsCard, SettingsCardHeader, SettingsRow } from "src/components/molecules/settings-card";
import ToggleSwitch from "src/components/atoms/ToggleSwitch";
import { Button } from "src/components/atoms/button";
import { clearReplyLog, exportReplyLog, loadReplyLog, onReplyLog, replyLogOn, ReplyLogEntry, setReplyLogOn } from "src/features/ai/replyLog";
import { replayAll, ReplayReport } from "src/features/ai/replay";

// Helper replies (#214): keep what the background helpers answered, on this
// device, and check how often the world engine's parsers could read it - so
// a model that keeps dropping TIE: or GOAL: lines shows up as a number.
const HelperRepliesCard = () => {
  const [on, setOn] = useState(replyLogOn);
  const [entries, setEntries] = useState<ReplyLogEntry[]>([]);
  const [report, setReport] = useState<ReplayReport | undefined>();
  useEffect(() => {
    let live = true;
    const refresh = () => void loadReplyLog().then((list) => live && setEntries(list));
    refresh();
    const stop = onReplyLog(refresh);
    return () => {
      live = false;
      stop();
    };
  }, []);

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportReplyLog(entries)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `kindred-helper-replies-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <SettingsCard>
      <div className="px-5 pt-5">
        <SettingsCardHeader title="Helper replies" hint="What the background helpers answered, to check how well your models keep to the formats" />
      </div>
      <SettingsRow label="Keep them" hint="The last 30 replies of each kind, with their prompts, on this device only. Off by default." align="start">
        <ToggleSwitch
          checked={on}
          onChange={(v) => {
            setReplyLogOn(v);
            setOn(v);
          }}
          label={<span className="sr-only">Keep helper replies</span>}
        />
      </SettingsRow>
      <SettingsRow label={<span data-testid="helper-replies-count">{entries.length} {entries.length === 1 ? "reply" : "replies"} kept</span>} align="start">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setReport(replayAll(entries))} disabled={!entries.length}>Check them</Button>
          <Button type="button" variant="outline" onClick={download} disabled={!entries.length}>Export</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setReport(undefined);
              void clearReplyLog();
            }}
            disabled={!entries.length}
          >
            Clear
          </Button>
        </div>
      </SettingsRow>
      {report && (
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full text-left text-[12.5px]" aria-label="Helper reply check">
            <thead className="text-[11px] uppercase tracking-[0.06em] text-subtle">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Kind</th>
                <th className="py-1.5 pr-3 font-semibold">Read</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Parsed</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Missing</th>
                <th className="py-1.5 text-right font-semibold">Malformed</th>
              </tr>
            </thead>
            <tbody>
              {report.kinds.flatMap((k) =>
                k.checks
                  .filter((c) => c.parsed + c.missing + c.malformed > 0)
                  .map((c, i) => (
                    <tr key={`${k.kind}-${c.id}`} className={i === 0 ? "border-t border-border" : ""}>
                      <td className="py-1.5 pr-3 align-top text-foreground">{i === 0 ? `${k.label} (${k.replies})` : ""}</td>
                      <td className="py-1.5 pr-3 align-top text-muted-foreground">
                        {c.label}
                        {c.optional && <span className="text-subtle"> · optional</span>}
                        {c.examples.length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-subtle">Examples</summary>
                            {c.examples.map((ex, j) => (
                              <pre key={j} className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-[11.5px] text-foreground">{`${ex.status}${ex.model ? ` · ${ex.model}` : ""}\n${ex.reply}`}</pre>
                            ))}
                          </details>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right align-top tabular-nums">{c.parsed}</td>
                      <td className="py-1.5 pr-3 text-right align-top tabular-nums">{c.missing}</td>
                      <td className={`py-1.5 text-right align-top tabular-nums ${c.malformed ? "font-semibold text-destructive" : ""}`}>{c.malformed}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
          {report.unchecked.length > 0 && <p className="mt-2 text-[12px] text-subtle">Not checked (nothing parses them): {report.unchecked.map((u) => `${u.kind} (${u.replies})`).join(", ")}</p>}
        </div>
      )}
    </SettingsCard>
  );
};

export default HelperRepliesCard;
