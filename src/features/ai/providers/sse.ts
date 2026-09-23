// Minimal server-sent-events reader for the streaming chat endpoints
// (OpenAI-style Chat Completions and Anthropic Messages). Hands each event's
// `data:` payload to `onData` as it arrives; "[DONE]" (OpenAI's terminator)
// is filtered out. Multi-line data fields are joined with "\n" per the spec.
export const readSseStream = async (
  response: Response,
  onData: (data: string) => void,
  signal?: AbortSignal
): Promise<void> => {
  if (!response.body) throw new Error("Streaming is not supported by this browser.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines: string[] = [];

  const flushEvent = () => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    if (data.trim() !== "[DONE]") onData(data);
  };

  const handleLine = (rawLine: string) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      flushEvent();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
    // event:, id:, retry: and ":" comments carry nothing these APIs need -
    // Anthropic repeats the event type inside the JSON payload itself.
  };

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer) handleLine(buffer);
    flushEvent();
  } finally {
    reader.releaseLock();
  }
};
