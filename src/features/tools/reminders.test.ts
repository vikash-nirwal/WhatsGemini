import { Chat } from "../../types";
import { nextDueReminder, addReminder, buildReminderPrompt, cleanReminderText, describeWhen, dueReminders, fallbackReminderText, MAX_REMINDERS, newReminder, parseWhen } from "./reminders";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
// 10:00 on this device.
const now = new Date(2026, 10, 10, 10, 0, 0, 0).getTime();

describe("parseWhen", () => {
  it("reads a wait", () => {
    expect(parseWhen("20m", now)).toBe(now + 20 * MINUTE);
    expect(parseWhen("1h30m", now)).toBe(now + 90 * MINUTE);
    expect(parseWhen("in 2 hours", now)).toBe(now + 2 * HOUR);
    expect(parseWhen("90s", now)).toBe(now + 90 * 1000);
    expect(parseWhen("1 hour and 15 minutes", now)).toBe(now + 75 * MINUTE);
  });

  it("reads a clock time as the next time the clock shows it", () => {
    expect(parseWhen("18:30", now)).toBe(new Date(2026, 10, 10, 18, 30).getTime());
    expect(parseWhen("6pm", now)).toBe(new Date(2026, 10, 10, 18, 0).getTime());
    expect(parseWhen("9:00", now)).toBe(new Date(2026, 10, 11, 9, 0).getTime());
    expect(parseWhen("tomorrow 9:00", now)).toBe(new Date(2026, 10, 11, 9, 0).getTime());
    expect(parseWhen("tomorrow at 18:30", now)).toBe(new Date(2026, 10, 11, 18, 30).getTime());
  });

  it("refuses what it can't read, and waits too short or too long", () => {
    expect(parseWhen("soon", now)).toBeUndefined();
    expect(parseWhen("", now)).toBeUndefined();
    expect(parseWhen("2s", now)).toBeUndefined();
    expect(parseWhen("90d", now)).toBeUndefined();
    expect(parseWhen("25:00", now)).toBeUndefined();
  });
});

describe("describeWhen", () => {
  it("says it the way a person would", () => {
    expect(describeWhen(now + 30 * 1000, now)).toBe("in 30 seconds");
    expect(describeWhen(now + MINUTE, now)).toBe("in 1 minute");
    expect(describeWhen(now + 20 * MINUTE, now)).toBe("in 20 minutes");
    expect(describeWhen(now + 5 * HOUR, now)).toBe("at 15:00");
    expect(describeWhen(now + 23 * HOUR, now)).toBe("tomorrow at 09:00");
  });
});

describe("the reminder list", () => {
  it("keeps reminders soonest first, up to the limit", () => {
    const later = newReminder(now + HOUR, "call mum", now, 3);
    const sooner = newReminder(now + MINUTE, "pasta", now);
    expect(addReminder([later], sooner).map((r) => r.about)).toEqual(["pasta", "call mum"]);
    expect(later.by).toBe(3);
    let list = [later];
    for (let i = 0; i < MAX_REMINDERS + 5; i++) list = addReminder(list, newReminder(now + i * MINUTE, `r${i}`, now));
    expect(list).toHaveLength(MAX_REMINDERS);
  });

  it("finds what's due", () => {
    const list = [newReminder(now + MINUTE, "pasta", now), newReminder(now + HOUR, "call mum", now)];
    expect(dueReminders(list, now)).toEqual([]);
    expect(dueReminders(list, now + 2 * MINUTE).map((r) => r.about)).toEqual(["pasta"]);
    expect(dueReminders(undefined, now)).toEqual([]);
  });
});

describe("the reminder text", () => {
  const reminder = newReminder(now + 20 * MINUTE, "take the pasta off", now);

  it("asks for a text on time, or a late one", () => {
    expect(buildReminderPrompt("Aria", "Sam", reminder, reminder.at, "")).toContain("It's time now.");
    const late = buildReminderPrompt("Aria", "Sam", reminder, reminder.at + 3 * HOUR, "Sam: hi");
    expect(late).toContain("about 3 hours ago");
    expect(late).toContain("Sam: hi");
  });

  it("cleans the reply and has a plain fallback", () => {
    expect(cleanReminderText('"Pasta! Off the heat, now." [Sticker: happy]')).toBe("Pasta! Off the heat, now.");
    expect(fallbackReminderText(reminder)).toBe("Reminder: take the pasta off");
  });
});

const at0 = 1_000_000;
const chat = (id: number, reminders?: Chat["reminders"]) => ({ id, reminders }) as unknown as Chat;

describe("nextDueReminder", () => {
  it("picks the first chat with a reminder due, and its soonest one", () => {
    const chats = [
      chat(1, [newReminder(at0 + 1000, "not yet", 0)]),
      chat(2, [newReminder(at0 - 5000, "call mum", 0), newReminder(at0 - 1000, "pasta", 0)]),
      chat(3, [newReminder(at0 - 9000, "another chat", 0)]),
    ];
    const due = nextDueReminder(chats, at0);
    expect(due?.chat.id).toBe(2);
    expect(due?.reminder.about).toBe("call mum");
  });

  it("finds nothing before anything is due", () => {
    expect(nextDueReminder([chat(1, [newReminder(at0 + 1, "pasta", 0)]), chat(2)], at0)).toBeUndefined();
  });
});
