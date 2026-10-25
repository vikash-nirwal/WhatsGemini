import { addStatus, buildStatusPrompt, cleanStatus, hasUnseenStatus, liveStatuses, markSeen, statusDue, mentionsUser, nowLine, STATUS_GAP_MS, STATUS_LIFETIME_MS, photoStatusDue, statusPhotoScene } from "./statusUpdates";

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

  it("keeps the last ten", () => {
    const many = Array.from({ length: 12 }, (_, i) => status(i));
    expect(addStatus(many, status(0.5))).toHaveLength(10);
  });

  it("can mention you (#129)", () => {
    expect(buildStatusPrompt({ name: "Aria", description: "", prompt: "" }, undefined, [], [], undefined, undefined, undefined, undefined, "Sam")).toContain("mention Sam in it as @Sam");
    expect(mentionsUser("Coffee with @Sam ☕", "Sam")).toBe(true);
    expect(mentionsUser("Coffee with @sam!", "Sam")).toBe(true);
    expect(mentionsUser("Coffee with Samantha", "Sam")).toBe(false);
  });
});

describe("photo statuses (#118)", () => {
  it("come every other status, with the switch on", () => {
    expect(photoStatusDue({ statusPhotos: true, statuses: [] })).toBe(true);
    expect(photoStatusDue({ statusPhotos: true, statuses: [{ id: "a", text: "x", createdAt: 1, image: "data:x" }] })).toBe(false);
    expect(photoStatusDue({ statusPhotos: true, statuses: [{ id: "a", text: "x", createdAt: 1 }] })).toBe(true);
    expect(photoStatusDue({ statuses: [] })).toBe(false);
  });

  it("describe a phone photo that fits the status", () => {
    expect(statusPhotoScene("Aria", "Rainy cafe shift")).toContain('Aria posts a photo with their status: "Rainy cafe shift"');
  });
});

describe("statuses keep to the timeline", () => {
  it("know the time and the latest messages, which have already happened", () => {
    const at = new Date(2026, 9, 21, 19, 5).getTime();
    const prompt = buildStatusPrompt({ name: "Ravi", description: "", prompt: "" }, undefined, [], [], undefined, undefined, undefined, undefined, undefined, { now: at, userName: "Sam", recentChat: "Sam: see you at the café at 5\nRavi: on my way!\nSam: that was fun" });
    expect(prompt).toContain(nowLine(at));
    expect(prompt).toContain("Their latest messages with Sam (all of this has already happened):\nSam: see you at the café at 5");
    expect(prompt).toContain("Never post about a plan, trip or meeting as still ahead");
    expect(nowLine(at)).toMatch(/^It's Wednesday, /);
  });
});
