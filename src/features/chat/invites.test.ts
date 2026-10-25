import { buildInviteAnswerNote, extractInvite, stripStreamingInvite } from "./invites";

describe("event invites (#134)", () => {
  it("reads an invite at the end of a reply", () => {
    expect(extractInvite("Come with me!\n[Invite: Jazz at Hot Clube | Friday 22:00 | Praça da Alegria]")).toEqual({
      text: "Come with me!",
      invite: { what: "Jazz at Hot Clube", when: "Friday 22:00", where: "Praça da Alegria" },
    });
    expect(extractInvite("No invite here.")).toEqual({ text: "No invite here." });
    expect(stripStreamingInvite("Come!\n[Invite: Jazz at")).toBe("Come!");
  });

  it("tells them how you answered their latest invite", () => {
    const msgs = [{ role: "ai", txt: "x", invite: { what: "Jazz", when: "Fri", answer: "accepted" as const } }];
    expect(buildInviteAnswerNote(msgs as any, "Aria", "Sam")).toBe("Sam accepted Aria's invite to Jazz (Fri). It's a plan now.");
    expect(buildInviteAnswerNote([{ role: "ai", txt: "x", invite: { what: "Jazz" } }] as any, "Aria", "Sam")).toBeUndefined();
  });
});
