import fs from "fs";
import { test, expect, openChat, openRoute, sendMessage, adventureReply, headerAction } from "./fixtures";

// Story play: paste a story, take a part in it and the AI narrates and
// voices everyone else, with no Character made. And in a chat's story
// script, the story's people can be renamed and voiced by the character.

test.use({ seed: { messages: 0 } });

const systemPrompt = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

const DRAFT = {
  premise: "Lizzy Bennet meets proud Mr Darcy at a ball in Meryton.",
  beats: Array.from({ length: 14 }, (_, i) => (i === 0 ? "Lizzy overhears Darcy's insult." : `Event ${i + 1}`)),
  cast: [{ name: "Lizzy Bennet", about: "Witty second daughter." }, { name: "Darcy", about: "Proud and rich." }, { name: "Jane", about: "Lizzy's kind sister." }],
  directions: "Regency manners.",
  ending: "They marry.",
};

test("a pasted story is played as one of its own people, with more than ten beats", async ({ page, mockAI }) => {
  await openRoute(page, "/stories");
  await expect(page.getByText("No stories yet.")).toBeVisible();
  await page.getByRole("button", { name: "Play a story" }).click();

  mockAI.replyOnce(JSON.stringify(DRAFT));
  await page.getByLabel("Story to play").fill("It is a truth universally acknowledged... (a long story)");
  await page.getByRole("button", { name: "Read the story" }).click();

  // The main character is picked; pick Jane instead, and rename Lizzy.
  const parts = page.getByRole("radiogroup", { name: "Who you play" });
  await expect(parts.getByRole("radio", { name: "Lizzy Bennet" })).toHaveAttribute("aria-checked", "true");
  await parts.getByRole("radio", { name: "Jane" }).click();
  await expect(parts.getByRole("radio", { name: "Jane" })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel("Name of story character 1").fill("Eliza Bennet");
  await expect(page.getByText("14 beats")).toBeVisible();
  await page.getByPlaceholder("Name this story").fill("Meryton");

  mockAI.reply(adventureReply('**Darcy:** "She is tolerable."\n**Eliza:** "How rude."', ["Comfort Eliza", "Glare at Darcy"]));
  await page.getByRole("button", { name: "Start playing" }).click();
  await expect(page.getByText("She is tolerable.")).toBeVisible();
  await expect(page.getByText("Playing Jane")).toBeVisible();

  const prompt = systemPrompt(mockAI.requests[1].messages);
  expect(prompt).toContain("The player plays Jane, one of the story's own characters");
  expect(prompt).toContain("Premise: Eliza Bennet meets proud Mr Darcy");
  expect(prompt).toContain("Current beat: Eliza overhears Darcy's insult.");
  expect(prompt).toContain("you're on beat 1");
  expect(prompt).toContain("told in 14 beats");
  expect(prompt).not.toContain("Lizzy");

  // It lives under Stories, not Adventures.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/stories$/);
  await expect(page.getByRole("list", { name: "Stories" })).toContainText("You play Jane");
  await openRoute(page, "/adventures");
  await expect(page.getByText("Meryton")).toHaveCount(0);
});

test("in a chat, the story's people can be renamed and voiced alongside the character", async ({ page, mockAI }) => {
  await openChat(page);
  mockAI.replyOnce(JSON.stringify(DRAFT));
  await page.getByRole("button", { name: "Write the story" }).click();
  const dialog = page.getByRole("dialog", { name: "Story script" });
  await dialog.getByText("Paste a story or script").click();
  await dialog.getByLabel("Story to split into beats").fill("A long story.");
  await dialog.getByRole("button", { name: "Split into beats" }).click();
  await expect(dialog.getByLabel("Beat 14", { exact: true })).toBeVisible();

  await dialog.getByLabel("Name of story character 1").fill("Eliza Bennet");
  await dialog.getByLabel("Who plays Eliza Bennet").click();
  await page.getByRole("option", { name: "You play them" }).click();
  await dialog.getByLabel("Who plays Darcy").click();
  await page.getByRole("option", { name: /plays them$/ }).filter({ hasNotText: /^(The AI|You) / }).click();
  await dialog.getByRole("button", { name: "Save script" }).click();
  await expect(dialog).toBeHidden();

  mockAI.reply("Hello.");
  await sendMessage(page, "Good evening.");
  await expect.poll(() => mockAI.requests.length).toBeGreaterThanOrEqual(2);
  const prompt = systemPrompt(mockAI.requests[1].messages);
  expect(prompt).toContain("- Eliza Bennet (the user plays them): Witty second daughter.");
  expect(prompt).toMatch(/- Darcy \(you, \w+, play them\)/);
  expect(prompt).toContain("you voice the story's other characters (Jane)");
  expect(prompt).toContain("Current beat: Eliza overhears Darcy's insult.");
  expect(prompt).not.toContain("Lizzy");
});

// The model weighs the end of the context most, so where the story is goes
// there too; "Finish this beat" writes the rest of the beat from the story,
// sums it up as a chapter named after it and moves on.
const BRIDGE = "Mira's ticket flutters to the floor and Tom hands it back. \"Yours?\"";
const responder = (narration: string) => (req: { stream: boolean; prompt: string }) => {
  if (req.stream) return narration;
  if (req.prompt.includes("Write the rest of the current beat")) return BRIDGE;
  if (req.prompt.includes("Has the current beat")) return "no";
  return "TITLE: Unused\nRECAP: Mira and Tom met over a dropped ticket.\nSUMMARY:\nThey met on the train.";
};

test("in a chat, replies are reminded of the beat, and a beat can be finished from the story", async ({ page, mockAI }) => {
  await openChat(page);
  await page.getByRole("button", { name: "Write the story" }).click();
  const dialog = page.getByRole("dialog", { name: "Story script" });
  await dialog.getByRole("textbox", { name: "Premise", exact: true }).fill("Two strangers on a night train.");
  await dialog.getByLabel("Beat 1", { exact: true }).fill("They meet.");
  await dialog.getByLabel("What happens in beat 1").fill("Mira drops her ticket and Tom picks it up.");
  await dialog.getByRole("button", { name: "Add beat" }).click();
  await dialog.getByLabel("Beat 2", { exact: true }).fill("A storm stops the train.");
  await dialog.getByRole("button", { name: "Save script" }).click();

  mockAI.reply(responder("Hi there."));
  await sendMessage(page, "Hello.");
  await expect.poll(() => mockAI.requests.length).toBeGreaterThanOrEqual(2);
  const reply = mockAI.requests.find((r) => r.stream)!;
  expect(reply.prompt).toContain('Story: beat 1 of 2, "They meet." (Mira drops her ticket and Tom picks it up.). This reply stays inside the story');
  expect(systemPrompt(reply.messages)).toContain("What happens in it, in the story: Mira drops her ticket and Tom picks it up.");

  await page.getByRole("button", { name: "Story progress: Beat 1 of 2. Show the story" }).click();
  await page.getByRole("region", { name: "Story progress" }).getByRole("button", { name: "Finish this beat" }).click();
  const finish = page.getByRole("dialog", { name: "Finish this beat" });
  await finish.getByRole("group", { name: "Length" }).getByRole("button", { name: "Short" }).click();
  await finish.getByRole("group", { name: "Leaning on" }).getByRole("button", { name: "More dialogue" }).click();
  await finish.getByLabel("Anything you want in it (optional)").fill("Tom blushes.");
  await finish.getByRole("button", { name: "Write it" }).click();
  await expect(finish.getByLabel("The rest of the beat")).toHaveValue(BRIDGE);
  await finish.getByLabel("The rest of the beat").fill(BRIDGE + " Tom blushes.");
  await finish.getByRole("button", { name: "Add and go to the next beat" }).click();
  await expect(finish).toBeHidden();
  await expect(page.getByText("Tom blushes.").first()).toBeVisible();
  await expect(page.getByText("Chapter 1: They meet.")).toBeVisible();
  await expect(page.getByText("Mira and Tom met over a dropped ticket.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Story progress" })).toContainText("Beat 2 of 2");
  const bridge = mockAI.requests.find((r) => r.prompt.includes("Write the rest of the current beat"))!;
  expect(bridge.prompt).toContain("Mira drops her ticket and Tom picks it up.");
  expect(bridge.prompt).toContain('The next beat (don\'t start it): "A storm stops the train."');
  expect(bridge.prompt).toContain("one short paragraph");
  expect(bridge.prompt).toContain("Lean on the characters talking");
  expect(bridge.prompt).toContain("Tom blushes.");
});

test("in Stories, the choices follow the story, and a beat can be finished there too", async ({ page, mockAI }) => {
  await openRoute(page, "/stories/new");
  mockAI.replyOnce(JSON.stringify({ ...DRAFT, beats: [{ beat: "Lizzy overhears Darcy's insult.", events: "Darcy calls her tolerable." }, "Event 2", "Event 3"] }));
  await page.getByLabel("Story to play").fill("A story.");
  await page.getByRole("button", { name: "Read the story" }).click();
  await expect(page.getByLabel("What happens in beat 1")).toHaveValue("Darcy calls her tolerable.");

  await page.getByRole("group", { name: "Reply length" }).getByRole("button", { name: "Short" }).click();
  // The turn after a finished beat opens the next one (#239).
  const opening = responder(adventureReply("The ballroom glitters.", ["Dance", "Listen to Darcy"]));
  mockAI.reply((req) => (req.stream && req.prompt.includes("open the next one now") ? adventureReply("Days later, a letter comes.", ["Read it", "Burn it"]) : opening(req)));
  await page.getByRole("button", { name: "Start playing" }).click();
  await expect(page.getByText("The ballroom glitters.")).toBeVisible();
  const first = mockAI.requests.find((r) => r.stream)!;
  expect(systemPrompt(first.messages)).toContain("At least one of the choices moves straight toward it");
  expect(first.prompt).toContain('Story: beat 1 of 3, "Lizzy overhears Darcy\'s insult."');
  expect(systemPrompt(first.messages)).toContain("Keep it brief");

  await page.getByRole("button", { name: "Story progress: Beat 1 of 3. Show the story" }).click();
  await page.getByRole("region", { name: "Story progress" }).getByRole("button", { name: "Finish this beat" }).click();
  const finish = page.getByRole("dialog", { name: "Finish this beat" });
  await finish.getByRole("button", { name: "Write it" }).click();
  await expect(finish.getByLabel("The rest of the beat")).toHaveValue(BRIDGE);
  // Keep the whole conversation this time: no chapter.
  await finish.getByText("Sum the beat up as a chapter").click();
  await finish.getByRole("button", { name: "Add and go to the next beat" }).click();
  await expect(page.getByText(BRIDGE).first()).toBeVisible();
  await expect(page.getByText(/^Chapter 1/)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Story progress" })).toContainText("Beat 2 of 3");
  const bridge = mockAI.requests.find((r) => r.prompt.includes("Write the rest of the current beat"))!;
  expect(bridge.prompt).toContain('second person ("you")');

  // The narrator goes straight on into beat 2, with fresh choices.
  await expect(page.getByText("Days later, a letter comes.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Read it" })).toBeVisible();
  const next = mockAI.requests.find((r) => r.stream && r.prompt.includes("open the next one now"))!;
  expect(next.prompt).toContain('"Event 2"');
  expect(next.prompt).toContain('Story: beat 2 of 3, "Event 2"');
  expect(systemPrompt(next.messages)).toContain("you're on beat 2");
  expect(next.messages.map((m) => m.content).join("\n")).toContain(BRIDGE);

  // The reply length can be changed while playing: Short goes to Medium.
  await headerAction(page, "Reply length: Short");
  await headerAction(page, "Reply length: Medium");
  await headerAction(page, "Reply length: Long");
});

// The pasted story is kept with the script (#240), never sent in replies,
// and can be read again: to fill in beat events, or to split the rest anew.
test("a story's text is kept, and it can be read again without losing progress", async ({ page, mockAI }) => {
  const STORY = "SOURCE-TEXT: Lizzy goes to the ball, Darcy insults her, Wickham charms her, Darcy proposes.";
  await openRoute(page, "/stories/new");
  mockAI.replyOnce(JSON.stringify({ ...DRAFT, beats: [{ beat: "Lizzy overhears Darcy's insult.", events: "Darcy calls her tolerable." }, "Wickham charms her.", "Event 3"] }));
  await page.getByLabel("Story to play").fill(STORY);
  await page.getByRole("button", { name: "Read the story" }).click();
  await expect(page.getByText("3 beats")).toBeVisible();
  mockAI.reply(responder(adventureReply("The ballroom glitters.", ["Dance", "Listen to Darcy"])));
  await page.getByRole("button", { name: "Start playing" }).click();
  await expect(page.getByText("The ballroom glitters.")).toBeVisible();
  for (const r of mockAI.requests.filter((r) => r.stream)) expect(r.messages.map((m) => m.content).join("\n")).not.toContain("SOURCE-TEXT");

  await headerAction(page, "Story script: beat 1 of 3");
  const dialog = page.getByRole("dialog", { name: "Story script" });
  await dialog.getByText("Read the story again").click();
  await expect(dialog.getByText("2 beats have none yet.")).toBeVisible();

  mockAI.replyOnce(JSON.stringify({ beats: [{ beat: 2, events: "Wickham tells Lizzy a sad tale about Darcy." }, { beat: 3, events: "Darcy proposes badly." }] }));
  await dialog.getByRole("button", { name: "Fill in beat events" }).click();
  await expect(dialog.getByLabel("What happens in beat 2")).toHaveValue("Wickham tells Lizzy a sad tale about Darcy.");
  await expect(dialog.getByLabel("What happens in beat 1")).toHaveValue("Darcy calls her tolerable.");
  const fill = mockAI.requests[mockAI.requests.length - 1];
  expect(fill.prompt).toContain("SOURCE-TEXT");
  expect(fill.prompt).toContain("2. Wickham charms her. (needs events)");

  mockAI.replyOnce(JSON.stringify({ beats: [{ beat: "Wickham lies.", events: "He blames Darcy." }, "Darcy proposes.", "Lizzy refuses."] }));
  await dialog.getByLabel("Split again from beat").click();
  await page.getByRole("option", { name: "2", exact: true }).click();
  await dialog.getByRole("button", { name: "Split again" }).click();
  await expect(dialog.getByLabel("Beat 4", { exact: true })).toHaveValue("Lizzy refuses.");
  await expect(dialog.getByLabel("Beat 1", { exact: true })).toHaveValue("Lizzy overhears Darcy's insult.");
  await expect(dialog.getByLabel("Beat 2", { exact: true })).toHaveValue("Wickham lies.");
  expect(mockAI.requests[mockAI.requests.length - 1].prompt).toContain("from where beat 1 ends");
  await dialog.getByRole("button", { name: "Save script" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Story progress: Beat 1 of 4. Show the story" })).toBeVisible();

  // Still saved with the story, and still kept out of the next reply.
  const saved = await page.evaluate(
    () =>
      new Promise<string | undefined>((resolve) => {
        const open = indexedDB.open("ChatAppDB");
        open.onsuccess = () => {
          const req = open.result.transaction("adventures").objectStore("adventures").getAll();
          req.onsuccess = () => resolve(req.result[0]?.storyScript?.source);
        };
      })
  );
  expect(saved).toBe(STORY);
  const before = mockAI.requests.length;
  await page.getByRole("button", { name: "Dance" }).click();
  await expect.poll(() => mockAI.requests.slice(before).some((r) => r.stream)).toBe(true);
  for (const r of mockAI.requests.filter((r) => r.stream)) expect(r.messages.map((m) => m.content).join("\n")).not.toContain("SOURCE-TEXT");
});

// A story as a book (#241): chapters and beats as headings, the player's
// turns set apart, the choices and summaries left out.
test("a story exports as a book, in Markdown and as a web page", async ({ page, mockAI }) => {
  await openRoute(page, "/stories/new");
  mockAI.replyOnce(JSON.stringify({ ...DRAFT, beats: ["Lizzy overhears Darcy's insult.", "Wickham charms her.", "Event 3"] }));
  await page.getByLabel("Story to play").fill("A story.");
  await page.getByRole("button", { name: "Read the story" }).click();
  await page.getByPlaceholder("Name this story").fill("Meryton Ball");
  mockAI.reply((req) => {
    if (req.stream && req.prompt.includes("open the next one now")) return adventureReply("Days later, Wickham calls.", ["Hear him out", "Send him away"]);
    if (req.stream && req.prompt.includes("Glare at Darcy")) return adventureReply("Darcy looks away.", ["Leave", "Stay"]);
    return responder(adventureReply("The ballroom glitters.", ["Glare at Darcy", "Dance"]))(req);
  });
  await page.getByRole("button", { name: "Start playing" }).click();
  await page.getByRole("button", { name: "Glare at Darcy" }).click();
  await expect(page.getByText("Darcy looks away.")).toBeVisible();

  await page.getByRole("button", { name: "Story progress: Beat 1 of 3. Show the story" }).click();
  await page.getByRole("region", { name: "Story progress" }).getByRole("button", { name: "Finish this beat" }).click();
  const finish = page.getByRole("dialog", { name: "Finish this beat" });
  await finish.getByRole("button", { name: "Write it" }).click();
  await expect(finish.getByLabel("The rest of the beat")).toHaveValue(BRIDGE);
  await finish.getByRole("button", { name: "Add and go to the next beat" }).click();
  await expect(page.getByText("Days later, Wickham calls.")).toBeVisible();

  let download = page.waitForEvent("download");
  await headerAction(page, "Export as a book (Markdown)");
  let file = await download;
  expect(file.suggestedFilename()).toBe("meryton-ball.md");
  const md = fs.readFileSync((await file.path())!, "utf8");
  expect(md).toContain("# Meryton Ball");
  expect(md).toContain("_Lizzy Bennet meets proud Mr Darcy at a ball in Meryton._");
  expect(md).toContain("## Chapter 1: Lizzy overhears Darcy's insult.");
  expect(md).toContain("### Lizzy overhears Darcy's insult.");
  expect(md).toContain("> **Lizzy Bennet:** Glare at Darcy");
  expect(md).toContain("Mira's ticket flutters to the floor");
  expect(md.indexOf("## Chapter 2")).toBeLessThan(md.indexOf("### Wickham charms her."));
  expect(md.indexOf("### Wickham charms her.")).toBeLessThan(md.indexOf("Days later, Wickham calls."));
  expect(md).not.toContain("Hear him out");
  expect(md).not.toContain("CHOICES");
  expect(md).not.toContain("SUMMARY");

  download = page.waitForEvent("download");
  await headerAction(page, "Export as a book (web page)");
  file = await download;
  expect(file.suggestedFilename()).toBe("meryton-ball.html");
  const html = fs.readFileSync((await file.path())!, "utf8");
  expect(html).toContain("<title>Meryton Ball</title>");
  expect(html).toContain("<h2>Chapter 1: Lizzy overhears Darcy's insult.</h2>");
  expect(html).toContain('<p class="player"><strong>Lizzy Bennet:</strong> Glare at Darcy</p>');
  expect(html).not.toContain("<script");
});
