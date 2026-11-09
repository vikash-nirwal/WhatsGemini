import { applyCastRenames, beatHeatLine, beatRange, buildBeatBridgePrompt, buildStoryReminder, storyChoicesRule, beatStamp, beatStarts, beatsMissingDetails, buildBeatCheckPrompt, buildFillDetailsPrompt, buildNextBeatPrompt, buildResplitPrompt, buildScriptDraftPrompt, keepSource, parseFillDetails, parseResplit, STORY_SOURCE_MAX, buildStoryScriptSection, cleanScript, emptyScript, extractBeatTag, makeBeat, makeCastMember, moveBeat, parseBeatCheckReply, parseScriptDraft, renameInText, stripStreamingBeatTag, unplayedVoices } from "./storyScript";
import { StoryScript } from "../../types";

const script = (overrides: Partial<StoryScript> = {}): StoryScript => ({
  ...emptyScript(),
  premise: "Two strangers share a train compartment.",
  beats: [makeBeat("They meet."), makeBeat("A storm stops the train."), makeBeat("They confess.")],
  directions: "Slow burn. No violence.",
  ending: "They get off at the same stop.",
  ...overrides,
});

describe("buildStoryScriptSection", () => {
  it("gives the current beat only, with the premise, directions and mode", () => {
    const text = buildStoryScriptSection(script({ currentBeat: 1 }));
    expect(text).toContain("Premise: Two strangers share a train compartment.");
    expect(text).toContain("always follow them): Slow burn. No violence.");
    expect(text).toContain("you're on beat 2. Current beat: A storm stops the train.");
    expect(text).not.toContain("They confess.");
    expect(text).toContain("[Beat done]");
    expect(text).toContain("Stay strictly inside this story.");
  });

  it("heads for the ending once every beat is done", () => {
    const text = buildStoryScriptSection(script({ currentBeat: 3, mode: "loose" }));
    expect(text).toContain("Every planned beat has happened. Bring the story to this ending: They get off at the same stop.");
    expect(text).not.toContain("[Beat done]");
    expect(text).toContain("improvise freely");
  });
});

describe("beat tag", () => {
  it("is stripped from the end and reported", () => {
    expect(extractBeatTag("The lights flicker out.\n[Beat done]")).toEqual({ text: "The lights flicker out.", beatDone: true });
    expect(extractBeatTag("Hi. [beat: complete]").beatDone).toBe(true);
    expect(extractBeatTag("No tag here.")).toEqual({ text: "No tag here.", beatDone: false });
  });

  it("is hidden while streaming, even half-typed", () => {
    expect(stripStreamingBeatTag("The train stops.\n[Beat do")).toBe("The train stops.");
    expect(stripStreamingBeatTag("The train stops.\n[Beat done]")).toBe("The train stops.");
    expect(stripStreamingBeatTag("Look [at this]")).toBe("Look [at this]");
  });
});

describe("moving between beats", () => {
  it("stays in range", () => {
    expect(moveBeat(script(), -1).currentBeat).toBe(0);
    expect(moveBeat(script({ currentBeat: 2 }), 1).currentBeat).toBe(3);
    expect(moveBeat(script({ currentBeat: 3 }), 1).currentBeat).toBe(3);
  });
});

describe("cleanScript", () => {
  it("drops blank beats and an empty script", () => {
    expect(cleanScript(script({ beats: [makeBeat("  "), makeBeat("They meet.")] }))?.beats.map((b) => b.text)).toEqual(["They meet."]);
    expect(cleanScript(emptyScript())).toBeUndefined();
  });
});

describe("parseScriptDraft", () => {
  it("reads the JSON, tolerating a code fence", () => {
    const draft = parseScriptDraft('```json\n{"premise": "A heist.", "beats": ["Plan it", "", "Pull it off"], "directions": "Fast", "ending": "They escape"}\n```');
    expect(draft?.premise).toBe("A heist.");
    expect(draft?.beats.map((b) => b.text)).toEqual(["Plan it", "Pull it off"]);
    expect(draft?.ending).toBe("They escape");
  });

  it("returns nothing for a reply that isn't a plan", () => {
    expect(parseScriptDraft("Sure! Here's your story.")).toBeUndefined();
    expect(parseScriptDraft('{"premise": "", "beats": []}')).toBeUndefined();
  });
});

describe("beats on messages", () => {
  const script: StoryScript = { ...emptyScript(), beats: [makeBeat("Meet"), makeBeat("Storm")], currentBeat: 1 };

  it("stamps a reply with the current beat, and nothing once all are done", () => {
    expect(beatStamp(script)).toEqual({ beat: 2 });
    expect(beatStamp({ ...script, currentBeat: 2 })).toEqual({});
    expect(beatStamp(undefined)).toEqual({});
  });

  it("finds where each beat starts", () => {
    expect([...beatStarts([{}, { beat: 1 }, {}, { beat: 1 }, { beat: 2 }, { beat: 2 }])]).toEqual([1, 4]);
  });

  it("puts the beat tag before an adventure's choices block", () => {
    expect(buildStoryScriptSection({ ...script, currentBeat: 0 }, { beforeChoices: true })).toContain("put the tag [Beat done] on its own line just before the choices block");
  });
});

describe("beat check", () => {
  it("asks about the current beat, naming the next one as not due yet", () => {
    const text = buildBeatCheckPrompt(script({ currentBeat: 1 }), "Mira: The train shudders to a halt.");
    expect(text).toContain('The current beat is: "A storm stops the train."');
    expect(text).toContain('(not due yet): "They confess."');
    expect(text).not.toContain("They meet.");
    expect(text).toContain("Mira: The train shudders to a halt.");
  });

  it("leaves out the next beat on the last one", () => {
    expect(buildBeatCheckPrompt(script({ currentBeat: 2 }), "")).not.toContain("not due yet");
  });

  it("reads only a clear yes", () => {
    expect(parseBeatCheckReply("yes")).toBe(true);
    expect(parseBeatCheckReply('**Yes.** The storm hit.')).toBe(true);
    expect(parseBeatCheckReply("no")).toBe(false);
    expect(parseBeatCheckReply("Not yet, yes it's close")).toBe(false);
    expect(parseBeatCheckReply("yesterday")).toBe(false);
  });
});

describe("beats for long stories", () => {
  const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

  it("keeps 3 to 10 for a short story and grows with a long one", () => {
    expect(beatRange(words(300))).toEqual({ min: 3, max: 10 });
    expect(beatRange(words(6000))).toEqual({ min: 20, max: 50 });
    expect(beatRange(words(50000)).max).toBe(60);
  });

  it("asks for that many beats and the story's people", () => {
    const prompt = buildScriptDraftPrompt(words(6000));
    expect(prompt).toContain("20 to 50 beats");
    expect(prompt).toContain('"cast"');
  });

  it("reads more than ten beats and the cast", () => {
    const beats = Array.from({ length: 25 }, (_, i) => `Event ${i + 1}`);
    const draft = parseScriptDraft(JSON.stringify({ premise: "P", beats, cast: [{ name: "Mira", about: "A thief." }, "Tom", { name: "mira" }] }));
    expect(draft?.beats).toHaveLength(25);
    expect(draft?.cast?.map((c) => [c.name, c.about])).toEqual([["Mira", "A thief."], ["Tom", ""]]);
  });
});

describe("renaming the story's people", () => {
  it("replaces whole names only, and the first name on its own", () => {
    expect(renameInText("Elizabeth Bennet meets Darcy. Elizabeth laughs. Elizabethan dress.", "Elizabeth Bennet", "Lily Bennet")).toBe("Lily Bennet meets Darcy. Lily laughs. Elizabethan dress.");
    expect(renameInText("Tom's hat; Tommy's too.", "Tom", "Sam")).toBe("Sam's hat; Tommy's too.");
  });

  it("rewrites the script for every changed name", () => {
    const mira = makeCastMember("Mira", "Mira is a thief.");
    const s = script({ premise: "Mira robs a train.", beats: [makeBeat("Mira hides.")], cast: [mira] });
    const renamed = applyCastRenames({ ...s, cast: [{ ...mira, name: "Nadia" }] }, [mira]);
    expect(renamed.premise).toBe("Nadia robs a train.");
    expect(renamed.beats[0].text).toBe("Nadia hides.");
    expect(renamed.cast?.[0]).toMatchObject({ name: "Nadia", about: "Nadia is a thief." });
  });
});

describe("the story's people in the prompt", () => {
  const cast = [{ ...makeCastMember("Darcy", "Proud."), playedBy: "character" as const }, { ...makeCastMember("Lizzy", "Witty."), playedBy: "user" as const }, makeCastMember("Jane", "Kind.")];

  it("lets the chat's character voice the others, by name", () => {
    const text = buildStoryScriptSection(script({ cast }), { characterName: "Ari" });
    expect(text).toContain("- Darcy (you, Ari, play them): Proud.");
    expect(text).toContain("- Lizzy (the user plays them): Witty.");
    expect(text).toContain("you voice the story's other characters (Jane)");
    expect(text).toContain("**Jane:**");
    expect(text).toContain("Never speak or act for Lizzy");
  });

  it("only lists them for a narrator", () => {
    const text = buildStoryScriptSection(script({ cast }), { beforeChoices: true });
    expect(text).toContain("- Jane: Kind.");
    expect(text).not.toContain("**Jane:**");
  });

  it("keeps the cast through cleaning, dropping blank names", () => {
    expect(cleanScript(script({ cast: [makeCastMember(" Jane "), makeCastMember(" ")] }))?.cast?.map((c) => c.name)).toEqual(["Jane"]);
  });
});

// Story parts in group chats (#242).
describe("the story's people in a group chat", () => {
  const members = { 1: "Ari", 2: "Bo", 3: "Cy" };
  const darcy = { ...makeCastMember("Darcy", "Proud."), playedById: 2 };
  const lizzy = { ...makeCastMember("Lizzy", "Witty."), playedBy: "user" as const };
  const jane = makeCastMember("Jane", "Kind.");
  const kitty = makeCastMember("Kitty", "Silly.");
  const cast = [darcy, lizzy, jane, kitty];
  const forMember = (selfId: number, name: string) => buildStoryScriptSection(script({ cast }), { characterName: name, room: true, selfId, members });

  it("tells the member who plays a part that it's theirs", () => {
    const text = forMember(2, "Bo");
    expect(text).toContain("- Darcy (you, Bo, play them): Proud.");
    expect(text).toContain("- Lizzy (the user plays them): Witty.");
    expect(text).toContain("Leave Jane, Kitty to the others in the group");
    expect(text).toContain("Never speak or act for Lizzy, the user's part.");
    expect(text).not.toContain("**");
  });

  it("gives each unplayed part to one member, those without a part first", () => {
    expect(unplayedVoices(cast, members)).toEqual(new Map([[jane.id, 1], [kitty.id, 3]]));
    const ari = forMember(1, "Ari");
    expect(ari).toContain("- Darcy (Bo plays them): Proud.");
    expect(ari).toContain("- Kitty (Cy voices them): Silly.");
    expect(ari).toContain("Besides yourself, you voice Jane whenever the scene needs them");
    expect(ari).toContain("**Jane:**");
    expect(ari).toContain("Leave Darcy, Kitty to the others in the group");
    expect(forMember(3, "Cy")).toContain("you voice Kitty whenever");
  });

  it("shares parts among everyone when every member has one", () => {
    const all = [{ ...darcy, playedById: 1 }, { ...jane, playedById: 2 }, { ...kitty, playedById: 3 }, makeCastMember("Mary"), makeCastMember("Lydia")];
    expect([...unplayedVoices(all, members).values()]).toEqual([1, 2]);
  });

  it("treats a part whose player left, or an old 1:1 character part, as unplayed", () => {
    const old = [{ ...darcy, playedById: 9 }, { ...jane, playedBy: "character" as const }];
    expect(unplayedVoices(old, { 1: "Ari", 2: "Bo" })).toEqual(new Map([[darcy.id, 1], [jane.id, 2]]));
  });

  it("keeps the parts through renames", () => {
    const renamed = applyCastRenames(script({ premise: "Darcy sulks.", cast: [{ ...darcy, name: "Fitz" }] }), [darcy]);
    expect(renamed.premise).toBe("Fitz sulks.");
    expect(renamed.cast?.[0]).toMatchObject({ name: "Fitz", playedById: 2 });
  });
});

describe("each beat's events from the story", () => {
  it("are read from the draft, with plain lines still accepted", () => {
    const draft = parseScriptDraft(JSON.stringify({ premise: "P", beats: [{ beat: "They meet", events: "Mira drops her ticket; Tom picks it up and says 'Yours?'" }, "The storm"] }));
    expect(draft?.beats.map((b) => [b.text, b.details])).toEqual([["They meet", "Mira drops her ticket; Tom picks it up and says 'Yours?'"], ["The storm", undefined]]);
  });

  it("go into the prompt and the beat check with the current beat", () => {
    const s = script({ beats: [makeBeat("They meet.", "Mira drops her ticket."), makeBeat("A storm.")] });
    expect(buildStoryScriptSection(s)).toContain("What happens in it, in the story: Mira drops her ticket.");
    expect(buildBeatCheckPrompt(s, "")).toContain("Mira drops her ticket.");
  });

  it("survive cleaning, and an empty one is dropped", () => {
    const cleaned = cleanScript(script({ beats: [makeBeat("A", " Details "), { ...makeBeat("B"), details: "  " }] }));
    expect(cleaned?.beats.map((b) => b.details)).toEqual(["Details", undefined]);
  });
});

describe("keeping replies on the story", () => {
  const s = script({ beats: [makeBeat("They meet.", "Mira drops her ticket."), makeBeat("A storm.")] });

  it("reminds the model of the beat after the conversation, firmly in strict mode", () => {
    expect(buildStoryReminder(s)).toBe('Story: beat 1 of 2, "They meet." (Mira drops her ticket.). This reply stays inside the story and moves the scene toward that beat with the story\'s own events, people and lines; no new plot, people or twists.');
    expect(buildStoryReminder({ ...s, mode: "loose" })).toContain("Keep the scene moving toward it.");
    expect(buildStoryReminder({ ...s, currentBeat: 2 })).toContain("bring it to its ending: They get off at the same stop.");
    expect(buildStoryReminder(script({ beats: [] }))).toBeUndefined();
  });

  it("makes suggested moves carry the story on", () => {
    expect(storyChoicesRule(s, "choices")).toBe('The story is heading for its next event: "They meet." (Mira drops her ticket.). At least one of the choices moves straight toward it, and all of them stay inside the story.');
    expect(storyChoicesRule({ ...s, mode: "loose" })).not.toContain("all of them");
    expect(storyChoicesRule(undefined)).toBeUndefined();
  });
});

describe("finishing a beat", () => {
  it("asks for the rest of the current beat, stopping before the next", () => {
    const s = script({ beats: [makeBeat("They meet.", "Mira drops her ticket."), makeBeat("A storm.")] });
    const prompt = buildBeatBridgePrompt(s, "Tom: Hello.", { playerName: "Tom" });
    expect(prompt).toContain('The current beat is: "They meet."');
    expect(prompt).toContain("Mira drops her ticket.");
    expect(prompt).toContain('The next beat (don\'t start it): "A storm."');
    expect(prompt).toContain("third person");
    expect(prompt).toContain("(the user is Tom)");
    expect(prompt).toContain("Tom: Hello.");
    expect(buildBeatBridgePrompt(s, "", { secondPerson: true })).toContain('second person ("you")');
  });
});

describe("finishing a beat, the reader's way", () => {
  const s = script({ beats: [makeBeat("They meet.")], cast: [makeCastMember("Mira", "A thief.")] });

  it("takes the length, the leaning and the reader's wishes, with the story's people and directions", () => {
    const prompt = buildBeatBridgePrompt(s, "", { length: "long", focus: "dialogue", direction: "Mira lies about her name." });
    expect(prompt).toContain("4 to 7 paragraphs");
    expect(prompt).toContain("Lean on the characters talking");
    expect(prompt).toContain("The reader's wishes for this passage (follow them, inside the story): Mira lies about her name.");
    expect(prompt).toContain("- Mira: A thief.");
    expect(prompt).toContain("The author's directions (always follow them): Slow burn. No violence.");
    expect(prompt).toContain("Show, don't tell");
  });

  it("is a short paragraph when asked, and medium by default", () => {
    expect(buildBeatBridgePrompt(s, "", { length: "short" })).toContain("one short paragraph");
    expect(buildBeatBridgePrompt(s, "")).toContain("2 or 3 paragraphs");
    expect(buildBeatBridgePrompt(s, "")).not.toContain("reader's wishes");
  });
});

describe("opening the next beat (#239)", () => {
  it("names the new beat, or heads for the ending once all are done", () => {
    expect(buildNextBeatPrompt(script({ currentBeat: 1 }))).toContain('open the next one now, "A storm stops the train."');
    expect(buildNextBeatPrompt(script({ currentBeat: 1 }))).toContain("choices block");
    expect(buildNextBeatPrompt(script({ currentBeat: 3 }))).toContain("toward the story's ending (They get off at the same stop.)");
  });
});

describe("keeping the story's text (#240)", () => {
  const story = "Mira boards the night train. Tom sits across from her. A storm stops the train. They talk till dawn.";
  const s = script({ source: story, beats: [makeBeat("They meet.", "Mira drops her ticket."), makeBeat("A storm stops the train."), makeBeat("They confess.")], currentBeat: 1 });

  it("is kept through cleaning, capped, and never sent in replies", () => {
    expect(cleanScript(s)?.source).toBe(story);
    expect(keepSource("x".repeat(STORY_SOURCE_MAX + 50))).toHaveLength(STORY_SOURCE_MAX);
    const many = { ...s, source: "SECRET-SOURCE " + story };
    expect(buildStoryScriptSection(many)).not.toContain("SECRET-SOURCE");
    expect(buildStoryReminder(many)).not.toContain("SECRET-SOURCE");
    expect(buildBeatCheckPrompt(many, "")).not.toContain("SECRET-SOURCE");
    expect(buildBeatBridgePrompt(many, "")).not.toContain("SECRET-SOURCE");
    expect(storyChoicesRule(many)).not.toContain("SECRET-SOURCE");
    expect(buildNextBeatPrompt(many)).not.toContain("SECRET-SOURCE");
  });

  it("fills in missing beat events only, keeping beats and progress", () => {
    expect(beatsMissingDetails(s)).toEqual([1, 2]);
    const prompt = buildFillDetailsPrompt(s);
    expect(prompt).toContain("2. A storm stops the train. (needs events)");
    expect(prompt).toContain("1. They meet.\n");
    expect(prompt).toContain(story);
    const filled = parseFillDetails('{"beats": [{"beat": 1, "events": "Overwrite?"}, {"beat": 2, "events": "The train halts in the snow."}]}', s);
    expect(filled?.beats.map((b) => b.details)).toEqual(["Mira drops her ticket.", "The train halts in the snow.", undefined]);
    expect(filled?.beats.map((b) => b.id)).toEqual(s.beats.map((b) => b.id));
    expect(filled?.currentBeat).toBe(1);
    expect(parseFillDetails("no idea", s)).toBeUndefined();
  });

  it("re-splits from a chosen beat on, keeping the beats before it and where the story is", () => {
    const prompt = buildResplitPrompt(s, 1);
    expect(prompt).toContain("1. They meet.");
    expect(prompt).not.toContain("2. A storm");
    expect(prompt).toContain("from where beat 1 ends");
    expect(prompt).toContain(story);
    const next = parseResplit('{"beats": [{"beat": "The train stops.", "events": "Snow."}, "They talk till dawn."]}', s, 1);
    expect(next?.beats.map((b) => b.text)).toEqual(["They meet.", "The train stops.", "They talk till dawn."]);
    expect(next?.beats[0].id).toBe(s.beats[0].id);
    expect(next?.currentBeat).toBe(1);
    expect(parseResplit('{"beats": []}', s, 1)).toBeUndefined();
    expect(parseResplit('{"beats": ["One"]}', { ...s, currentBeat: 3 }, 0)?.currentBeat).toBe(1);
  });
});

describe("intimate beats (#255)", () => {
  const script = (current: number): StoryScript => ({
    premise: "",
    beats: [{ id: "a", text: "They meet" }, { id: "b", text: "The night together", intimate: true }],
    directions: "",
    mode: "strict",
    currentBeat: current,
  });

  it("says whether the current beat is an intimate one, only in an 18+ story", () => {
    expect(buildStoryReminder(script(1), { adult: true })).toContain("one of the story's intimate beats");
    expect(buildStoryReminder(script(0), { adult: true })).toContain("keep to the plot");
    expect(buildStoryReminder(script(1))).not.toContain("intimate");
  });

  it("says nothing when no beat is marked", () => {
    expect(beatHeatLine({ ...script(0), beats: [makeBeat("One")] })).toBeUndefined();
  });

  it("keeps the mark through cleaning", () => {
    expect(cleanScript(script(0))!.beats[1].intimate).toBe(true);
    expect(cleanScript(script(0))!.beats[0]).not.toHaveProperty("intimate");
  });

  it("leans on intimacy and carries the content rule only when the story is 18+", () => {
    const adult = buildBeatBridgePrompt(script(1), "x", { focus: "intimacy", adult: true, content: "Content: adults only.", toneDown: ["gore"] });
    expect(adult).toContain("closeness between the characters");
    expect(adult).toContain("Content: adults only.");
    expect(adult).toContain("intimate beats");
    expect(adult).toContain("soften them or leave them out: gore");
    const sfw = buildBeatBridgePrompt(script(1), "x", { focus: "intimacy" });
    expect(sfw).not.toContain("closeness between the characters");
    expect(sfw).toContain("Mix what happens");
  });
});

describe("the user's changes to the story (#261)", () => {
  const s = script({ instructions: "  Mira is secretly a prince.  ", cast: [makeCastMember("Mira", "A thief.")] });

  it("go into every reply and into finishing a beat, as winning over the story", () => {
    const line = "The user's changes to this story (always follow them; where the story says otherwise, these win): Mira is secretly a prince.";
    expect(buildStoryScriptSection(s)).toContain(line);
    expect(buildBeatBridgePrompt(s, "")).toContain(line);
    expect(buildStoryScriptSection(script())).not.toContain("The user's changes");
  });

  it("are kept tidy, survive renames, and count as a script on their own", () => {
    expect(cleanScript(s)?.instructions).toBe("Mira is secretly a prince.");
    expect(cleanScript({ ...emptyScript(), instructions: "Set it in winter." })?.instructions).toBe("Set it in winter.");
    expect(cleanScript({ ...emptyScript(), instructions: "   " })).toBeUndefined();
    const renamed = applyCastRenames({ ...s, cast: [{ ...s.cast![0], name: "Kai" }] }, s.cast);
    expect(renamed.instructions).toContain("Kai is secretly a prince.");
  });
});
