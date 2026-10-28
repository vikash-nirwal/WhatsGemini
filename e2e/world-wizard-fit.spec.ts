import { test, expect, openRoute } from "./fixtures";

// The world wizard's AI help (#237): someone joining from another world is
// fitted to it (reviewed, edited, undone), anyone can be changed with an
// instruction, and the mapper keeps your connections and says how people
// know each other.

test.use({ seed: { messages: 4 } });

const BRAM = { name: "Bram", description: "Lighthouse keeper", personalityTraits: ["grumpy"], prompt: "You are Bram, a grumpy lighthouse keeper.", relationship: "Stranger" };
const FITTED = { name: "Aria", description: "A herbalist at the edge of Ashford.", prompt: "You are Aria, warm and curious; you speak plainly, as people did then.", firstMessage: "*sets down a basket of herbs* You're new here.", appearance: "Long dark hair, a wool cloak over a linen dress." };
const SMUGGLER = { ...FITTED, description: "A herbalist who smuggles salt past the guards." };

const charactersInDb = (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const all: any[] = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").getAll();
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return all.filter((c) => c.worldId);
  });

test("a joining person is fitted to the world, changed with AI, and connected with history", async ({ page, mockAI }) => {
  let suggestions = 0;
  mockAI.reply((req) => {
    if (req.prompt.includes("Propose how they're connected")) {
      suggestions++;
      return suggestions === 1
        ? "TIE: Aria | Bram | your uncle | your niece | he taught her to read the tides\nYOU: Aria | Old friend"
        : "TIE: Aria | Bram | your rival | your rival | a feud over the well";
    }
    if (req.prompt.includes('Change this roleplay character as asked, and only that: "make her a smuggler"')) return JSON.stringify(SMUGGLER);
    if (req.prompt.includes("is moving into a new world: Ashford")) return JSON.stringify(FITTED);
    return JSON.stringify(BRAM);
  });
  await openRoute(page, "/worlds/wizard");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Ashford");
  await page.getByRole("textbox", { name: "Premise", exact: true }).fill("A walled town in a long winter.");
  await page.getByRole("combobox", { name: "Era or technology", exact: true }).fill("Medieval: news travels by letter");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("group", { name: "People you already have" }).getByRole("button", { name: "Aria" }).click();
  const aria = page.getByRole("group", { name: "Change Aria with AI" });
  await aria.getByRole("button", { name: "Fit to Ashford" }).click();
  const changed = page.getByRole("list", { name: "What changed for Aria" });
  await expect(changed.getByLabel("Opening message for Aria")).toHaveValue("*sets down a basket of herbs* You're new here.");
  await expect(changed.getByLabel("In a line for Aria")).toHaveValue("A herbalist at the edge of Ashford.");
  // Your own edit to what came back.
  await changed.getByLabel("Look and clothes for Aria").fill("Long dark hair, a fur-lined cloak.");

  // Then a change of your own, and undoing it.
  await aria.getByRole("button", { name: "Change with AI" }).click();
  await aria.getByLabel("What to change about Aria").fill("make her a smuggler");
  await aria.getByRole("button", { name: "Change", exact: true }).click();
  await expect(changed.getByLabel("In a line for Aria")).toHaveValue("A herbalist who smuggles salt past the guards.");
  await aria.getByRole("button", { name: /^Undo your change/ }).click();
  await expect(changed.getByLabel("In a line for Aria")).toHaveValue("A herbalist at the edge of Ashford.");

  await page.getByLabel("Someone new").fill("A grumpy lighthouse keeper");
  await page.getByRole("button", { name: "Draft" }).click();
  await expect(page.getByRole("list", { name: "Cast" })).toContainText("Bram");
  await page.getByRole("button", { name: "Next" }).click();

  // Connections, closely knit, with how they know each other; your edit
  // stays when you suggest again.
  await page.getByLabel("How connected").click();
  await page.getByRole("option", { name: "Close-knit" }).click();
  await page.getByRole("button", { name: "Suggest connections" }).click();
  await expect(page.getByLabel("How Aria and Bram know each other")).toHaveValue("he taught her to read the tides");
  await page.getByLabel("How Aria and Bram know each other").fill("he taught her to read the tides, and the stars");
  await page.getByRole("button", { name: "Suggest again" }).click();
  await expect.poll(() => suggestions).toBe(2);
  const ask = mockAI.requests.filter((r) => r.prompt.includes("Propose how they're connected")).pop()!.prompt;
  expect(ask).toContain("Already decided (keep these");
  expect(ask).toContain("A close-knit place");
  await expect(page.getByLabel("How Aria and Bram know each other")).toHaveValue("he taught her to read the tides, and the stars");
  await expect(page.getByLabel("What Bram is to Aria")).toHaveValue("uncle");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create world" }).click();
  await expect(page).toHaveURL(/#\/$/);

  const saved = await charactersInDb(page);
  const ariaHere = saved.find((c) => c.name === "Aria");
  expect(ariaHere).toMatchObject({ description: "A herbalist at the edge of Ashford.", first_mes: "*sets down a basket of herbs* You're new here.", appearance: "Long dark hair, a fur-lined cloak." });
  expect(ariaHere.ties).toEqual([{ withId: saved.find((c) => c.name === "Bram").id, tie: "your uncle", story: "he taught her to read the tides, and the stars" }]);
});
