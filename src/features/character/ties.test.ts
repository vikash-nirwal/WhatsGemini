import { tiesOf, withTie, withoutTie } from "./ties";
import { Character } from "../../types";

const aria = { id: 1, name: "Aria", prompt: "x" } as Character;
const lena = { id: 2, name: "Lena", prompt: "x", knowsAbout: [3] } as Character;

describe("relationships between characters", () => {
  it("sets both sides, as each sees the other, and they know each other", () => {
    const [a, l] = withTie(aria, lena, "older sister", "your little sister");
    expect(a.ties).toEqual([{ withId: 2, tie: "your older sister" }]);
    expect(l.ties).toEqual([{ withId: 1, tie: "your little sister" }]);
    expect(a.knowsAbout).toEqual([2]);
    expect(l.knowsAbout).toEqual([3, 1]);
    expect(tiesOf(a, [a, l])).toEqual([{ other: l, toMe: "older sister", toThem: "little sister" }]);
  });

  it("edits in place and removes both ways, keeping that they know each other", () => {
    const [a1, l1] = withTie(aria, lena, "sister", "sister");
    const [a2, l2] = withTie(a1, l1, "rival", "rival");
    expect(a2.ties).toEqual([{ withId: 2, tie: "your rival" }]);
    const [a3, l3] = withoutTie(a2, l2);
    expect(a3.ties).toBeUndefined();
    expect(l3.ties).toBeUndefined();
    expect(a3.knowsAbout).toEqual([2]);
  });
});
