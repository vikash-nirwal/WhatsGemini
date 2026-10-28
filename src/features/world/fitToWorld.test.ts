import { buildFitPrompt, editFit, fitCardOf, lastChanges, parseFit, undoFit, withFit } from "./fitToWorld";
import { applyTies, buildConnectionsPrompt, mergeSuggested, parseConnections, tiesNoteFor } from "./worldWizard";
import { withTie } from "../character/ties";
import { Character } from "../../types";

// Fitting people to a new world, and the refined mapper (#237).
const world = { name: "Ashford", premise: "A walled town in a long winter.", era: "Medieval: news travels by letter" };
const mia = { name: "Mia", description: "A barista who texts too much.", prompt: "You are Mia, cheerful and nosy. You text in lowercase with lots of emoji.", first_mes: "omg hiii", appearance: "Short, curly hair, denim jacket and sneakers.", visualTags: "young woman, curly brown hair, denim jacket" };
const reply = JSON.stringify({ name: "Mia", description: "A tavern girl who hears every rumour.", prompt: mia.prompt.replace("text in lowercase with lots of emoji", "talk fast and warm, full of gossip"), firstMessage: "*wipes the bar* Cold out, isn't it?", appearance: "Short, curly hair, a wool shawl over a tavern apron.", visualTags: "young woman, curly brown hair, wool shawl, apron" });

describe("fit to this world", () => {
  it("asks to keep who they are and change what the world changes", () => {
    const prompt = buildFitPrompt({ name: "Mia", card: fitCardOf(mia), world, ties: ["Tom is their older brother"] });
    expect(prompt).toContain("moving into a new world: Ashford");
    expect(prompt).toContain("Keep who they are");
    expect(prompt).toContain("keep their face, hair, build, skin and apparent age exactly");
    expect(prompt).toContain("- Tom is their older brother");
    expect(prompt).toContain("Opening message (first_mes): omg hiii");
  });

  it("asks for just your change with an instruction", () => {
    expect(buildFitPrompt({ name: "Mia", card: fitCardOf(mia), world, instruction: "make her a smuggler" })).toContain('Change this roleplay character as asked, and only that: "make her a smuggler"');
  });

  it("keeps only what changed, steps back with undo, and takes your edits", () => {
    const change = parseFit(reply, fitCardOf(mia));
    expect(Object.keys(change).sort()).toEqual(["appearance", "description", "first_mes", "prompt", "visualTags"]);
    let h = withFit(undefined, change, "Fit to Ashford");
    expect(lastChanges(fitCardOf(mia), h).find((c) => c.field === "first_mes")).toEqual({ field: "first_mes", before: "omg hiii", after: "*wipes the bar* Cold out, isn't it?" });
    h = withFit(h, { description: "A tavern girl and a smuggler." }, "Your change");
    expect(lastChanges(fitCardOf(mia), h).map((c) => c.field)).toEqual(["description"]);
    h = editFit(h, "description", "A tavern girl, smuggler by night.");
    expect(h.steps[1].fields.description).toBe("A tavern girl, smuggler by night.");
    expect(undoFit(h)!.steps).toHaveLength(1);
    expect(undoFit(undoFit(h))).toBeUndefined();
  });
});

describe("the relationship mapper", () => {
  const cast = [
    { key: "a", name: "Tom", description: "A blacksmith.", withYou: "" },
    { key: "b", name: "Mia", description: "A tavern girl.", about: "Cheerful and nosy.", withYou: "Old friend", withYouSet: true },
    { key: "c", name: "Ada", description: "The baker.", withYou: "" },
  ];

  it("keeps your ties, sets the closeness, and asks for how they know each other", () => {
    const prompt = buildConnectionsPrompt(world, cast, "Sam", { kept: [{ a: "a", b: "b", aToB: "your younger sister", bToA: "your older brother", story: "raised by their aunt", kept: true }], closeness: "scattered" });
    expect(prompt).toContain("Already decided (keep these; don't repeat or contradict them):\n- Mia is Tom's younger sister (raised by their aunt)");
    expect(prompt).toContain("Scattered: most of them don't know each other yet");
    expect(prompt).toContain("- Mia: A tavern girl. (Cheerful and nosy.) [to Sam: Old friend]");
    expect(prompt).toContain("<how they know each other, one short line of shared history");
  });

  it("reads the history line and merges around your ties", () => {
    const parsed = parseConnections("TIE: Tom | Ada | your rival | your rival | both bid for the mill contract\nTIE: Tom | Mia | your friend | your friend | drinking buddies", cast);
    expect(parsed.ties[0]).toEqual({ a: "a", b: "c", aToB: "your rival", bToA: "your rival", story: "both bid for the mill contract" });
    const mine = { a: "b", b: "a", aToB: "your older brother", bToA: "your younger sister", kept: true };
    const old = { a: "b", b: "c", aToB: "your friend", bToA: "your friend" };
    expect(mergeSuggested([mine, old], parsed.ties)).toEqual([mine, parsed.ties[0]]);
  });

  it("stores how they know each other, keeps it when a tie changes, and tells their chats", () => {
    const tom = { id: 1, name: "Tom", description: "", prompt: "" } as Character;
    const ada = { id: 2, name: "Ada", description: "", prompt: "" } as Character;
    const [t2, a2] = applyTies([tom, ada], [{ a: "a", b: "c", aToB: "your rival", bToA: "your rival", story: "both bid for the mill contract" }], { a: 1, c: 2 });
    expect(t2.ties).toEqual([{ withId: 2, tie: "your rival", story: "both bid for the mill contract" }]);
    expect(tiesNoteFor(t2, [t2, a2])).toContain("- Ada: your rival (both bid for the mill contract)");
    const [t3] = withTie(t2, a2, "friend", "friend");
    expect(t3.ties![0]).toEqual({ withId: 2, tie: "your friend", story: "both bid for the mill contract" });
  });
});
