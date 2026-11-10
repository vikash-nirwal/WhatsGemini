import { lookupSources } from "./anthropicAdapter";
import { cleanLookupText, UNREADABLE, webLookupPrompt } from "./types";

describe("lookupSources", () => {
  it("lists each page a search found once", () => {
    const blocks = [
      { type: "text", text: "Let me look." },
      { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.example/1", title: "One" }, { type: "web_search_result", url: "https://b.example/2", title: "Two" }] },
      { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.example/1", title: "One again" }] },
      { type: "text", text: "Spain won." },
    ];
    expect(lookupSources(blocks)).toEqual([{ url: "https://a.example/1", title: "One" }, { url: "https://b.example/2", title: "Two" }]);
  });

  it("skips a search that failed", () => {
    expect(lookupSources([{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "unavailable" } }])).toEqual([]);
  });
});

describe("the lookup prompt", () => {
  it("asks for facts on a search and a summary of a link", () => {
    expect(webLookupPrompt({ kind: "search", query: "who won the 2026 world cup" })).toContain("who won the 2026 world cup");
    expect(webLookupPrompt({ kind: "open", query: "https://example.com/post" })).toContain("https://example.com/post");
  });

  it("treats a page that couldn't be read as nothing", () => {
    expect(cleanLookupText(` ${UNREADABLE} `)).toBe("");
    expect(cleanLookupText("  Spain won.  ")).toBe("Spain won.");
  });
});
