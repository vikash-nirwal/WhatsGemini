import { test, expect, openRoute, MockAIRequest, editorStep } from "./fixtures";

// Character from one line (#45): an idea goes to the AI in one call, the
// JSON draft fills the editor, and the user reviews and saves it as usual.

// An empty database, so the gallery shows its "Create from an idea" button
// and the new character is the only one saved.
test.use({ seed: false });

const IDEA = "grumpy pirate cook who secretly writes poetry";

const BARNABY = {
  name: "Barnaby Salt",
  description: "The Gull's grumpy cook, who hides a book of poems.",
  personalityTraits: ["grumpy", "secretly tender"],
  prompt: "You are Barnaby Salt, the cook aboard the Gull. You grumble at everyone and write poems at night.",
  scenario: "The galley of the Gull, just after a storm.",
  firstMessage: "*slams a pot down* You're late for supper.",
  alternateGreetings: ["*hides a notebook* Didn't hear you come in."],
  exampleDialogue: "User: What's for dinner?\nBarnaby Salt: *grunts* Fish. Again.",
  relationship: "Grumpy crewmate",
  appearance: "A broad man in his fifties with a salt-and-pepper beard.",
  visualTags: "fifties, broad build, salt-and-pepper beard, stained apron",
};

const MARGO = { ...BARNABY, name: "Margo Brine", prompt: "You are Margo Brine, the Gull's sharp-tongued cook." };

const isDraftRequest = (req: MockAIRequest) => req.prompt.includes("one-line idea");
const draftRequests = (requests: MockAIRequest[]) => requests.filter(isDraftRequest);

// Reads the saved characters straight from IndexedDB.
const savedCharacters = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const rows: any[] = await new Promise((resolve, reject) => {
      const req = db.transaction("characters").objectStore("characters").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows;
  });


test("draft a character from one line, edit it and save it", async ({ page, mockAI }) => {
  // The first reply isn't JSON, so the dialog shows an error with a retry.
  mockAI.replyOnce("Sorry, I'd rather not.", JSON.stringify(BARNABY));

  await openRoute(page, "/characters");
  await page.getByRole("button", { name: "Create from an idea" }).click();

  const dialog = page.getByRole("dialog", { name: "Create from an idea" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("textbox", { name: "Your idea" }).fill(IDEA);
  await dialog.getByRole("button", { name: "Draft character" }).click();

  await expect(dialog.getByRole("alert")).toContainText("wasn't a character draft");
  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(dialog).toBeHidden();

  // The idea went out, with the safe-for-work rule since no NSFW was picked.
  const sent = draftRequests(mockAI.requests);
  expect(sent).toHaveLength(2);
  expect(sent[1].prompt).toContain(`Idea: ${IDEA}`);
  expect(sent[1].prompt).toContain("Keep everything safe for work");

  // Step 1 is filled in from the draft; nothing is saved yet.
  await expect(page.getByText(`Drafted from your idea: “${IDEA}”`)).toBeVisible();
  const name = page.getByRole("textbox", { name: "Character Name" });
  await expect(name).toHaveValue(BARNABY.name);
  await expect(page.getByRole("textbox", { name: "Description (Optional)" })).toHaveValue(BARNABY.description);
  await editorStep(page, "Look");
  await expect(page.getByRole("textbox", { name: /Character Appearance/ })).toHaveValue(BARNABY.appearance);
  await expect(page.getByRole("textbox", { name: "Locked look for pictures" })).toHaveValue(BARNABY.visualTags);
  // No image provider is set up in tests, so no portrait is offered.
  await expect(page.getByRole("button", { name: "Generate portrait" })).toHaveCount(0);
  expect(await savedCharacters(page)).toHaveLength(0);

  // The user edits the draft before saving.
  await editorStep(page, "Who they are");
  await name.fill("Barnaby the Poet");
  await editorStep(page, "Personality");

  await expect(page.getByRole("textbox", { name: "Character Prompt (Personality, Style, etc.)" })).toHaveValue(BARNABY.prompt);
  await expect(page.getByRole("textbox", { name: /^Example Dialogues/ })).toHaveValue(BARNABY.exampleDialogue);
  await editorStep(page, "World and story");
  await expect(page.getByRole("textbox", { name: /^Scenario/ })).toHaveValue(BARNABY.scenario);
  await expect(page.getByRole("textbox", { name: "First Message / Greeting (Optional)" })).toHaveValue(BARNABY.firstMessage);
  await expect(page.getByRole("textbox", { name: "Alternate greeting 1" })).toHaveValue(BARNABY.alternateGreetings[0]);
  await editorStep(page, "Test and finish");
  await page.getByRole("button", { name: "Create Character" }).click();
  await expect(page).toHaveURL(/#\/characters$/);

  await expect.poll(async () => (await savedCharacters(page)).length).toBe(1);
  const [saved] = await savedCharacters(page);
  expect(saved).toMatchObject({
    name: "Barnaby the Poet",
    description: BARNABY.description,
    personalityTraits: BARNABY.personalityTraits,
    prompt: BARNABY.prompt,
    scenario: BARNABY.scenario,
    first_mes: BARNABY.firstMessage,
    alternateGreetings: BARNABY.alternateGreetings,
    mes_example: BARNABY.exampleDialogue,
    relationship: BARNABY.relationship,
    appearance: BARNABY.appearance,
    visualTags: BARNABY.visualTags,
  });
  expect(saved.contentRating).toBeUndefined();
});

test("Try another redrafts, and NSFW is only asked for once confirmed 18+", async ({ page, mockAI }) => {
  // Two drafts of Barnaby (before and after confirming 18+), then Margo.
  mockAI.replyOnce(JSON.stringify(BARNABY), JSON.stringify(BARNABY), JSON.stringify(MARGO));

  await openRoute(page, "/characters/new");
  await page.getByRole("button", { name: "Create from an idea" }).click();
  const dialog = page.getByRole("dialog", { name: "Create from an idea" });
  await dialog.getByRole("textbox", { name: "Your idea" }).fill(IDEA);

  // NSFW without the confirmation still drafts safe for work.
  await dialog.getByRole("button", { name: "NSFW" }).click();
  await dialog.getByRole("button", { name: "Draft character" }).click();
  await expect(dialog).toBeHidden();
  expect(draftRequests(mockAI.requests)[0].prompt).toContain("Keep everything safe for work");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue(BARNABY.name);

  // Change the idea's hints: confirm 18+ this time.
  await page.getByRole("button", { name: "Change idea" }).click();
  await expect(dialog.getByRole("textbox", { name: "Your idea" })).toHaveValue(IDEA);
  await dialog.getByRole("switch", { name: "Every character in this card is an adult (18 or older)" }).click();
  await dialog.getByRole("button", { name: "Draft character" }).click();
  await expect(dialog).toBeHidden();
  const adult = draftRequests(mockAI.requests)[1].prompt;
  expect(adult).not.toContain("Keep everything safe for work");
  expect(adult).toContain("clearly an adult (18 or older)");
  // The editor's own rating follows the hint, confirmation included.
  await expect(page.getByRole("switch", { name: "Every character in this card is an adult (18 or older)" })).toBeChecked();

  // Try another asks for a different character than the last draft.
  await page.getByRole("button", { name: "Try another" }).click();
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue(MARGO.name);
  const another = draftRequests(mockAI.requests)[2].prompt;
  expect(another).toContain(`different from the previous draft, ${BARNABY.name}`);
  expect(another).toContain("clearly an adult (18 or older)");
});
