import { addStatus, buildStatusPrompt, cleanStatus, hasUnseenStatus, liveStatuses, markSeen, statusDue, statusReplyDraft, STATUS_GAP_MS, STATUS_LIFETIME_MS } from "./statusUpdates";

const NOW = Date.UTC(2026, 9, 21, 12);
const status = (hoursAgo: number, seen = false) => ({ id: `s${hoursAgo}`, text: `status ${hoursAgo}`, createdAt: NOW - hoursAgo * 3_600_000, seen });

describe("which statuses show", () => {
  it("keeps a day's statuses and knows which are new", () => {
    const character = { statuses: [status(30), status(5, true), status(1)] };
    expect(liveStatuses(character, NOW).map((s) => s.id)).toEqual(["s5", "s1"]);
    expect(hasUnseenStatus(character, NOW)).toBe(true);
    expect(hasUnseenStatus({ statuses: markSeen(character.statuses) }, NOW)).toBe(false);
    expect(STATUS_LIFETIME_MS).toBe(24 * 3_600_000);
  });
});

describe("statusDue", () => {
  it("posts only when switched on, at most every ten hours", () => {
    expect(statusDue({ postsStatuses: false }, NOW)).toBe(false);
    expect(statusDue({ postsStatuses: true }, NOW)).toBe(true);
    expect(statusDue({ postsStatuses: true, statuses: [status(2)] }, NOW)).toBe(false);
    expect(statusDue({ postsStatuses: true, statuses: [{ ...status(0), createdAt: NOW - STATUS_GAP_MS }] }, NOW)).toBe(true);
  });
});

describe("prompt, reply and drafts", () => {
  it("builds the prompt from what they're doing and what's going on", () => {
    const prompt = buildStatusPrompt({ name: "Aria", description: "A barista", prompt: "Warm and witty." }, "at work", ["Started a pottery class"], ["Coffee time ☕"]);
    expect(prompt).toContain("Right now they're at work.");
    expect(prompt).toContain("- Started a pottery class");
    expect(prompt).toContain("don't repeat them):\n- Coffee time ☕");
  });

  it("cleans the reply", () => {
    expect(cleanStatus('Status: "Rainy shift, but the regulars made it cozy ☔"\nextra')).toBe("Rainy shift, but the regulars made it cozy ☔");
    expect(cleanStatus("  ")).toBeUndefined();
  });

  it("keeps the last ten and quotes one in a reply", () => {
    const many = Array.from({ length: 12 }, (_, i) => status(i));
    expect(addStatus(many, status(0.5))).toHaveLength(10);
    expect(statusReplyDraft({ id: "x", text: "Pottery day!", createdAt: NOW })).toBe('(Replying to your status: "Pottery day!") ');
  });
});
