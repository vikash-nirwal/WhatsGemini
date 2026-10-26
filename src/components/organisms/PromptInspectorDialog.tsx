import React, { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { lastDroppedNotes, NOTE_NAMES } from "src/features/ai/utils/promptBudget";
import { FaCopy } from "react-icons/fa";
import { toast } from "sonner";
import Modal from "src/components/molecules/Modal";
import { Button } from "src/components/atoms/button";
import { Select } from "src/components/molecules/form-controls";
import {
  LoggedRequest,
  findRequestForReply,
  formatRequestForCopy,
  getRequestLog,
  roleLabel,
  splitPostHistoryNote,
  splitSystemSections,
  subscribeRequestLog,
} from "src/features/ai/requestLog";
import { estimateHistoryTokens, estimateTokens } from "src/features/ai/utils/tokenEstimator";

interface PromptInspectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // Which request to open on. A "Show what was sent" action on a chat
  // message passes the message's text as `replyText`; with neither, the
  // newest request is shown. The viewer can switch to any logged request.
  requestId?: string;
  replyText?: string;
}

const useRequestLog = () => useSyncExternalStore(subscribeRequestLog, getRequestLog);

const formatTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const requestLabel = (r: LoggedRequest) =>
  `${formatTime(r.startedAt)} · ${r.kind === "chat" ? "chat" : "one-shot"} · ${r.provider} / ${r.model}${r.status === "error" ? " · failed" : r.status === "pending" ? " · waiting" : ""}`;

// "~1,234 tokens" - estimates, since there's no tokenizer in the app.
const tokens = (n: number) => `~${n.toLocaleString()} token${n === 1 ? "" : "s"}`;

// The first line of a section, shortened, as its title in the list.
const sectionTitle = (text: string) => {
  const first = text.split("\n")[0];
  return first.length > 80 ? `${first.slice(0, 77)}…` : first;
};

const Block: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="flex flex-col gap-2">
    <h3 className="text-sm font-semibold text-foreground">
      {title}
      {hint && <span className="ml-2 font-normal text-muted-foreground">{hint}</span>}
    </h3>
    {children}
  </section>
);

const Pre: React.FC<{ children: React.ReactNode; label?: string }> = ({ children, label }) => (
  <pre aria-label={label} className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
    {children}
  </pre>
);

// The prompt inspector (#31): exactly what the app sent to the model for one
// call, so a character that misbehaves can be debugged from its real prompt
// instead of guessed at. Reads the in-memory request log, which only holds
// calls made since the page was loaded.
const PromptInspectorDialog: React.FC<PromptInspectorDialogProps> = ({ isOpen, onClose, requestId, replyText }) => {
  const log = useRequestLog();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // Each opening starts again from what the caller asked for, so reopening
  // from a different message doesn't keep an earlier choice.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedId(requestId ?? (replyText ? findRequestForReply(replyText)?.id : undefined));
  }, [isOpen, requestId, replyText]);

  const entry = log.find((r) => r.id === selectedId) ?? (replyText && !selectedId ? undefined : log[0]);
  const sections = useMemo(() => splitSystemSections(entry?.systemInstruction), [entry]);
  const { prompt, postHistoryNote } = useMemo(() => splitPostHistoryNote(entry?.prompt || ""), [entry]);

  const copy = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(formatRequestForCopy(entry));
      toast.success("Request copied.");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  const samplers = Object.entries(entry?.samplers || {}).filter(([, v]) => v != null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="What was sent"
      subtitle="The exact prompt of a recent request. Token counts are estimates; only requests made since this page was opened are kept."
      size="lg"
    >
      {log.length === 0 ? (
        <p className="text-sm text-muted-foreground">No requests yet. Send a message, then open this again.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <Select aria-label="Request" value={entry?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
                {!entry && <option value="">Choose a request</option>}
                {log.map((r) => (
                  <option key={r.id} value={r.id}>
                    {requestLabel(r)}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!entry}>
              <FaCopy aria-hidden /> Copy
            </Button>
          </div>

          {!entry ? (
            <p className="text-sm text-muted-foreground">
              This reply's request isn't in the log any more (it only keeps the last few, and is cleared on reload). Pick another one above.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Model</dt>
                <dd className="text-foreground break-all">{entry.provider} / {entry.model}</dd>
                {entry.temperature != null && (
                  <>
                    <dt className="text-muted-foreground">Temperature</dt>
                    <dd className="text-foreground">{entry.temperature}</dd>
                  </>
                )}
                {samplers.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Samplers</dt>
                    <dd className="text-foreground">{samplers.map(([k, v]) => `${k} ${v}`).join(", ")}</dd>
                  </>
                )}
                {entry.usage && (
                  <>
                    <dt className="text-muted-foreground">Usage</dt>
                    <dd className="text-foreground">
                      {entry.usage.inputTokens.toLocaleString()} in, {entry.usage.outputTokens.toLocaleString()} out (reported by the provider)
                    </dd>
                  </>
                )}
              </dl>

              {/* The prompt budget (#187): notes left out of the latest prompt. */}
              {entry.id === log[0]?.id && lastDroppedNotes().keys.length > 0 && (
                <p role="note" aria-label="Left out to fit" className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  Left out to fit the model: {lastDroppedNotes().keys.map((k) => NOTE_NAMES[k] || k).join(", ")}.
                </p>
              )}
              <Block title="System prompt" hint={entry.systemInstruction ? `${sections.length} sections, ${tokens(estimateTokens(entry.systemInstruction))}` : "none"}>
                {sections.length > 0 && (
                  <ol className="flex flex-col gap-1.5" aria-label="System prompt sections">
                    {sections.map((section, i) => (
                      <li key={i}>
                        <details className="rounded-md border border-border bg-muted/40">
                          <summary className="flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-xs">
                            <span className="min-w-0 truncate text-foreground">{sectionTitle(section)}</span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">{tokens(estimateTokens(section))}</span>
                          </summary>
                          <pre className="whitespace-pre-wrap break-words border-t border-border px-3 py-2 font-mono text-xs text-foreground">{section}</pre>
                        </details>
                      </li>
                    ))}
                  </ol>
                )}
              </Block>

              <Block
                title="History"
                hint={entry.history.length === 0 ? "none" : `${entry.history.length} messages, ${tokens(estimateHistoryTokens(entry.history.map((m) => m.text)))}`}
              >
                {entry.history.length > 0 && (
                  <ol className="flex flex-col gap-1.5" aria-label="History">
                    {entry.history.map((m, i) => (
                      <li key={i} className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                        <div className="mb-1 font-semibold text-muted-foreground">{roleLabel(m.role)}</div>
                        <div className="whitespace-pre-wrap break-words text-foreground">{m.text}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </Block>

              <Block title="Final prompt" hint={tokens(estimateTokens(prompt))}>
                <Pre label="Final prompt">{prompt}</Pre>
              </Block>

              {postHistoryNote && (
                <Block title="Post-history note" hint={tokens(estimateTokens(postHistoryNote))}>
                  <Pre label="Post-history note">{postHistoryNote}</Pre>
                </Block>
              )}

              <Block title="Reply" hint={entry.response ? tokens(estimateTokens(entry.response)) : undefined}>
                {entry.status === "pending" && <p className="text-sm text-muted-foreground">Waiting for the reply…</p>}
                {entry.status === "error" && <p className="text-sm text-destructive">Failed: {entry.error}</p>}
                {entry.status === "done" && <Pre label="Reply">{entry.response || "(empty)"}</Pre>}
              </Block>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};

export default PromptInspectorDialog;
