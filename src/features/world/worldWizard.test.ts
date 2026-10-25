import { applyTies, buildConnectionsPrompt, castIdea, parseConnections, tiesNoteFor } from "./worldWizard";
import { Character } from "../../types";

const world = { name: "Harbour Town", premise: "A rainy port.", era: "Medieval, news travels by letter" };
const cast = [
  { key: "a", name: "Aria", withYou: "" },
  { key: "k", name: "Kai", withYou: "" },
  { key: "m", name: "Mara", withYou: "" },
];

describe("world wizard (#144)", () => {
  it("drafts new people to fit the world and asks for connections in a fixed format", () => {
    expect(castIdea("A lighthouse keeper", world)).toContain("Harbour Town: A rainy port. Era and technology: Medieval");
    const prompt = buildConnectionsPrompt(world, cast, "Sam");
    expect(prompt).toContain("- Kai");
    expect(prompt).toContain("YOU: <name> | <what they are to Sam");
  });

  it("parses ties and bonds with you, skipping unknown names, repeats and junk", () => {
    const reply = [
      "Here you go:",
      "TIE: Aria | Kai | your older brother | your little sister",
      "- TIE: kai | aria | your sister | your brother",
      "TIE: Aria | Zed | your friend | your friend",
      "TIE: Mara | Kai | \"your rival at the shipyard\"",
      "YOU: Mara | Neighbour",
      "YOU: Nobody | Friend",
    ].join("\n");
    expect(parseConnections(reply, cast)).toEqual({
      ties: [
        { a: "a", b: "k", aToB: "your older brother", bToA: "your little sister" },
        { a: "m", b: "k", aToB: "your rival at the shipyard", bToA: "your rival at the shipyard" },
      ],
      withYou: { m: "Neighbour" },
    });
  });

  it("gives both sides the tie and lets them know each other, and puts it in the prompt", () => {
    const chars = [{ id: 1, name: "Aria" }, { id: 2, name: "Kai", knowsAbout: [1] }] as Character[];
    const changed = applyTies(chars, [{ a: "a", b: "k", aToB: "your older brother", bToA: "your little sister" }], { a: 1, k: 2 });
    expect(changed).toEqual([
      { id: 1, name: "Aria", ties: [{ withId: 2, tie: "your older brother" }], knowsAbout: [2] },
      { id: 2, name: "Kai", knowsAbout: [1], ties: [{ withId: 1, tie: "your little sister" }] },
    ]);
    expect(tiesNoteFor(changed[0], changed)).toContain("- Kai: your older brother");
    expect(tiesNoteFor(chars[0], chars)).toBeUndefined();
  });
});
