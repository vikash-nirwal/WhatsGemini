import { test, expect, openRoute } from "./fixtures";

// The world wizard (#144): the world, a cast (someone you have plus someone
// drafted for it), suggested connections you can edit, and who you are there.

test.use({ seed: { messages: 4 } });

const BRAM = { name: "Bram", description: "Lighthouse keeper", personalityTraits: ["grumpy"], prompt: "You are Bram, a grumpy lighthouse keeper.", relationship: "Stranger" };

const answer = (prompt: string) =>
  prompt.includes("Propose how they're connected")
    ? "TIE: Aria | Bram | your uncle | your niece\nYOU: Bram | The new neighbour\nYOU: Aria | Old friend"
    : JSON.stringify(BRAM);

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
    return all.filter((c) => c.worldId).map((c) => ({ name: c.name, relationship: c.relationship, ties: c.ties?.map((t: any) => t.tie) }));
  });

test("a world is made with its cast and connections, and you land in it", async ({ page, mockAI }) => {
  mockAI.reply((req) => answer(req.prompt));
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "New world" }).first().click();
  await expect(page).toHaveURL(/#\/worlds\/wizard$/);

  // Step 1 can't be skipped without a name and premise.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("alert")).toContainText("Give the world a name and a premise.");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Harbour Town");
  await page.getByRole("textbox", { name: "Premise", exact: true }).fill("A rainy port where everyone knows everyone.");
  await page.getByRole("combobox", { name: "Era or technology", exact: true }).fill("Today, phones and all");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2: Aria from My world, and Bram drafted from one line.
  await page.getByRole("group", { name: "People you already have" }).getByRole("button", { name: "Aria" }).click();
  await page.getByLabel("Someone new").fill("A grumpy lighthouse keeper");
  await page.getByRole("button", { name: "Draft" }).click();
  await expect(page.getByRole("list", { name: "Cast" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Cast" })).toContainText("Bram");
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3: suggested, then edited.
  await page.getByRole("button", { name: "Suggest connections" }).click();
  await expect(page.getByLabel("What Bram is to Aria")).toHaveValue("uncle");
  await page.getByLabel("What Bram is to Aria").fill("favourite uncle");
  await expect(page.getByLabel("Bram to you")).toHaveValue("The new neighbour");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("button", { name: "Create world" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole("button", { name: /^World: Harbour Town/ }).first()).toBeVisible();
  await expect.poll(() => charactersInDb(page)).toEqual([
    { name: "Aria", relationship: "Old friend", ties: ["your favourite uncle"] },
    { name: "Bram", relationship: "The new neighbour", ties: ["your niece"] },
  ]);
});

// Create failing partway (2026-10-31): pressing it again made a second world
// and copied everyone again. Now it carries on with what was saved.
test("trying Create again after a failure doesn't make a second world", async ({ page, mockAI }) => {
  mockAI.reply((req) => answer(req.prompt));
  await openRoute(page, "/worlds/wizard");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Harbour Town");
  await page.getByRole("textbox", { name: "Premise", exact: true }).fill("A rainy port.");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("group", { name: "People you already have" }).getByRole("button", { name: "Aria" }).click();
  await page.getByLabel("Someone new").fill("A grumpy lighthouse keeper");
  await page.getByRole("button", { name: "Draft" }).click();
  await expect(page.getByRole("list", { name: "Cast" }).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // The second person fails to save, once.
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    let people = 0;
    IDBObjectStore.prototype.add = function (...args: Parameters<typeof add>) {
      if (this.name === "characters" && ++people === 2) throw new DOMException("Disk full", "QuotaExceededError");
      return add.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Create world" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Create world" }).click();
  await expect(page).toHaveURL(/#\/$/);

  const counts = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((r) => { const q = indexedDB.open("ChatAppDB"); q.onsuccess = () => r(q.result); });
    const all = (store: string) => new Promise<any[]>((r) => { const g = db.transaction(store).objectStore(store).getAll(); g.onsuccess = () => r(g.result); });
    const [worlds, characters] = [await all("worlds"), await all("characters")];
    db.close();
    return { worlds: worlds.map((w) => w.name), people: characters.filter((c) => c.worldId).map((c) => c.name).sort() };
  });
  expect(counts).toEqual({ worlds: ["Harbour Town"], people: ["Aria", "Bram"] });
});
