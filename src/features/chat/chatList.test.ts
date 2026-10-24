import { lastPreview, splitArchived, unreadCount } from "./chatList";
import { Message } from "../../types";

const msg = (role: "you" | "ai", timestamp: number, extra: Partial<Message> = {}): Message => ({ role, txt: `${role} at ${timestamp}`, timestamp, ...extra } as Message);

describe("a WhatsApp chat list (#115)", () => {
  it("counts replies since you last looked", () => {
    const content = [msg("you", 1), msg("ai", 2), msg("ai", 5), msg("ai", 6, { isSystem: true })];
    expect(unreadCount({ content, readAt: 3 })).toBe(1);
    expect(unreadCount({ content, readAt: 10 })).toBe(0);
  });

  it("without a read time, counts only the texts they sent first since you wrote", () => {
    expect(unreadCount({ content: [msg("you", 1), msg("ai", 2)] })).toBe(0);
    expect(unreadCount({ content: [msg("you", 1), msg("ai", 2), msg("ai", 9, { notes: ["texted-first"] }), msg("ai", 12, { notes: ["texted-first"] })] })).toBe(2);
    expect(unreadCount({ content: [] })).toBe(0);
  });

  it("previews the last message in one plain line", () => {
    expect(lastPreview({ content: [msg("you", 1, { txt: "*waves* **hi** there" })] })).toEqual({ text: "waves hi there", fromYou: true, speakerId: undefined });
    expect(lastPreview({ content: [msg("ai", 1, { txt: "", images: ["local:1"], speakerId: 4 })] })).toEqual({ text: "📷 Photo", fromYou: false, speakerId: 4 });
    expect(lastPreview({ content: [msg("ai", 1, { isVoiceNote: true })] })?.text).toBe("🎤 Voice message");
    expect(lastPreview({ content: [msg("ai", 1, { txt: "x".repeat(200) })] })?.text).toHaveLength(90);
    expect(lastPreview({ content: [msg("you", 1, { isNarration: true })] })).toBeUndefined();
  });

  it("keeps archived chats out of the list unless searching", () => {
    const items = [{ chat: { archived: true } }, { chat: {} }];
    expect(splitArchived(items, false)).toEqual({ shown: [items[1]], archived: [items[0]] });
    expect(splitArchived(items, true)).toEqual({ shown: items, archived: [] });
  });
});
