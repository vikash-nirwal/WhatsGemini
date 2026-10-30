import { purposeLabel, recordTokens, tagPurpose, takePurpose, tokenUsageSince } from "./tokenUsage";

afterEach(() => localStorage.clear());

test("a call's purpose is taken once, and untagged calls are other", () => {
  tagPurpose("reply");
  expect(takePurpose()).toBe("reply");
  expect(takePurpose()).toBe("other");
});

test("tokens add up per purpose over the chosen days", () => {
  const now = new Date(2026, 9, 30, 12).getTime();
  recordTokens("reply", { inputTokens: 1000, outputTokens: 100, totalTokens: 1100 }, now);
  recordTokens("reply", { inputTokens: 500, outputTokens: 50, totalTokens: 550 }, now);
  recordTokens("life:talk", { inputTokens: 3000, outputTokens: 200, totalTokens: 3200 }, now - 3 * 86_400_000);
  expect(tokenUsageSince(1, now)).toEqual([{ purpose: "reply", calls: 2, input: 1500, output: 150 }]);
  expect(tokenUsageSince(7, now).map((r) => r.purpose)).toEqual(["life:talk", "reply"]);
});

test("purposes read as words", () => {
  expect(purposeLabel("life:talk")).toBe("Characters talking to each other");
  expect(purposeLabel("life:new-thing")).toBe("new thing");
});
