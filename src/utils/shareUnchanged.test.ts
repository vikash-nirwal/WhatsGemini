import { shareUnchanged } from "./shareUnchanged";

// Two equal strings that are separate copies, as two database reads give.
const copyOf = (s: string) => s.split("").join("");
const PICTURE = `data:image/jpeg;base64,${"QUJD".repeat(3000)}`;

describe("shareUnchanged", () => {
  it("reuses an unchanged picture from the previous copy", () => {
    const prev = { id: 1, name: "Aria", avatar: PICTURE, appearanceImages: [PICTURE] };
    const next = { id: 1, name: "Aria", avatar: copyOf(PICTURE), appearanceImages: [copyOf(PICTURE)], points: 3 };
    const shared = shareUnchanged(prev, next);
    expect(shared).toEqual(next);
    // The previous array itself, since nothing in it changed.
    expect(shared.appearanceImages).toBe(prev.appearanceImages);
    expect(shared.points).toBe(3);
  });

  it("takes a changed picture as it is", () => {
    const other = `data:image/jpeg;base64,${"WFla".repeat(3000)}`;
    const shared = shareUnchanged({ appearanceImages: [PICTURE] }, { appearanceImages: [PICTURE, other] });
    expect(shared.appearanceImages).toEqual([PICTURE, other]);
  });

  it("leaves short values and other kinds alone", () => {
    expect(shareUnchanged({ a: "x", n: 1 }, { a: "y", n: 2 })).toEqual({ a: "y", n: 2 });
    expect(shareUnchanged(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(shareUnchanged({ a: [1] }, { a: { b: 1 } })).toEqual({ a: { b: 1 } });
  });

  it("returns the new object when nothing could be reused", () => {
    const next = { a: "short" };
    expect(shareUnchanged({ a: "other" }, next)).toBe(next);
  });
});
