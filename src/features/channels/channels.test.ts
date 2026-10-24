import { addChannelPost, buildCharacterChannelPrompt, buildWorldChannelPrompt, channelId, channelName, channelPostDue, CHANNEL_GAP_MS, cleanChannelPost, crowdReactions, unreadPosts } from "./channels";

describe("channels (#127)", () => {
  it("are named after their character or world", () => {
    expect(channelId("character", 3)).toBe("character-3");
    expect(channelName("character", { name: "Aria" })).toBe("Aria's channel");
    expect(channelName("world", { name: "Ravenmoor" })).toBe("Ravenmoor News");
  });

  it("post every six hours or so, keep thirty, and count what's new", () => {
    expect(channelPostDue({}, CHANNEL_GAP_MS)).toBe(true);
    expect(channelPostDue({ lastPostAt: 1000 }, 1000 + CHANNEL_GAP_MS - 1)).toBe(false);
    let posts = [] as { id: string; text: string; at: number }[];
    for (let i = 0; i < 35; i++) posts = addChannelPost(posts, { id: String(i), text: "x", at: i });
    expect(posts).toHaveLength(30);
    expect(unreadPosts({ posts, lastReadAt: 30 })).toBe(4);
  });

  it("have steady crowd reactions per post", () => {
    expect(crowdReactions("cp-a")).toEqual(crowdReactions("cp-a"));
    expect(Object.values(crowdReactions("cp-b")).every((n) => n > 3)).toBe(true);
  });

  it("ask for a post in the channel's own voice", () => {
    expect(buildCharacterChannelPrompt({ name: "Aria", description: "Mechanic.", prompt: "" }, ["Old post"], { dayLog: "Fixed a bus." })).toContain("Their last posts (don't repeat them):\n- Old post");
    expect(buildWorldChannelPrompt({ name: "Ravenmoor", premise: "A misty port town." }, ["The Docks"], [])).toContain("Places: The Docks");
    expect(cleanChannelPost('"Big news today!"')).toBe("Big news today!");
  });
});
