import { fitNotes, noteBudgetFor } from "./promptBudget";

const note = (key: string, len: number, priority: 1 | 2 | 3 | 4 | 5) => ({ key, text: "x".repeat(len), priority });

test("everything fits: nothing dropped, order kept", () => {
  const { kept, dropped } = fitNotes([note("a", 100, 2), note("b", 100, 5)], 1000);
  expect(kept.map((n) => n.key)).toEqual(["a", "b"]);
  expect(dropped).toEqual([]);
});

test("over budget: lowest priority first, later ones first within a priority, rules never", () => {
  const notes = [note("history", 900, 1), note("ties", 900, 3), note("knows", 900, 1), note("rules", 900, 5), note("event", 900, 4)];
  const { kept, dropped } = fitNotes(notes, 2800);
  expect(dropped).toEqual(["history", "knows"]);
  expect(kept.map((n) => n.key)).toEqual(["ties", "rules", "event"]);
});

test("long notes are capped; the budget follows the model's window", () => {
  expect(fitNotes([note("big", 5000, 3)], undefined).kept[0].text.length).toBe(1800);
  expect(fitNotes([note("rule", 5000, 5)], undefined).kept[0].text.length).toBe(5000);
  expect(noteBudgetFor(8_000)).toBe(4_800);
  expect(noteBudgetFor(1_000_000)).toBe(24_000);
  expect(noteBudgetFor(2_000)).toBe(3_000);
});
