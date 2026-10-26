import { test, expect, openRoute, ARIA } from "./fixtures";

// Building worlds with help (2026-10-26): AI suggestions on every field and
// filling the rest, suggested people based on the cast, relationships for
// everyone, and copies from other worlds that are their own characters.

test.use({ seed: { messages: 2 } });

const BRAM = { name: "Bram Vega", description: "Aria's older brother, a ferry pilot", personalityTraits: ["steady"], prompt: "You are Bram.", relationship: "Neighbour" };

const answer = (prompt: string) => {
  if (prompt.includes("Fill in what's missing")) return '{"premise": "A rainy port where everyone knows everyone.", "tone": "Cozy harbour drama", "era": "Today, phones and all"}';
  if (prompt.includes("Write its tone")) return "Tone: \"Salt-and-rain melancholy\"";
  if (prompt.includes("new people who")) return '[{"name": "Bram Vega", "idea": "Aria\'s older brother, a ferry pilot", "tieWith": "Aria", "tie": "older brother"}, {"name": "Mara Lin", "idea": "a barista who hears everything"}]';
  if (prompt.includes("Idea:")) return JSON.stringify(BRAM);
  return "Mock reply";
};

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
    return all.map((c) => ({ id: c.id, name: c.name, description: c.description, worldId: c.worldId, relationship: c.relationship, ties: (c.ties || []).map((t: any) => t.tie) }));
  });

test("the wizard fills fields with AI, suggests people from the cast, and makes a persona", async ({ page, mockAI }) => {
  mockAI.reply((req) => answer(req.prompt));
  await openRoute(page, "/worlds/wizard");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Harbour Town");
  await page.getByRole("button", { name: "Fill the rest with AI" }).click();
  await expect(page.getByRole("textbox", { name: "Premise", exact: true })).toHaveValue("A rainy port where everyone knows everyone.");
  await expect(page.getByRole("combobox", { name: "Era or technology", exact: true })).toHaveValue("Today, phones and all");
  // A suggestion for one field, and typing a value the list doesn't have.
  await page.getByRole("button", { name: "Suggest tone" }).click();
  await expect(page.getByRole("combobox", { name: "Tone", exact: true })).toHaveValue("Salt-and-rain melancholy");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("group", { name: "People you already have" }).getByRole("button", { name: "Aria" }).click();
  await page.getByRole("button", { name: "Suggest people" }).click();
  // The picked people go in with who they are, not just their names.
  await expect.poll(() => mockAI.requests.find((r) => r.prompt.includes("new people who"))?.prompt).toMatch(/- Aria[^\n]*: \S/);
  const suggested = page.getByRole("list", { name: "Suggested people" });
  await expect(suggested).toContainText("Bram Vega · Aria's older brother");
  await suggested.getByRole("button", { name: "Add Bram Vega" }).click();
  await expect(page.getByRole("list", { name: "Cast" })).toContainText("Bram Vega");
  await suggested.getByRole("button", { name: "Skip Mara Lin" }).click();
  await expect(suggested).toHaveCount(0);
  await page.getByRole("button", { name: "Next" }).click();
  // The suggestion's tie is already there.
  await expect(page.getByLabel("What Bram Vega is to Aria")).toHaveValue("older brother");
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("combobox", { name: "You in this world" }).click();
  await page.getByRole("option", { name: "New persona…" }).click();
  await page.getByLabel("New persona's name").fill("Sam the baker");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "You in this world" })).toHaveText("Sam the baker");
  await page.getByRole("button", { name: "Create world" }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect.poll(async () => (await charactersInDb(page)).find((c) => c.name === "Aria" && c.worldId)?.ties).toEqual(["your older brother"]);
});

test("the world editor manages its cast: copies stand alone, people are suggested, everyone can be connected", async ({ page, mockAI }) => {
  mockAI.reply((req) => answer(req.prompt));
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port.");
  await page.getByRole("button", { name: "Create World" }).click();
  await expect(page).toHaveURL(/#\/worlds$/);
  const worldId = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve) => { const req = indexedDB.open("ChatAppDB"); req.onsuccess = () => resolve(req.result); });
    const all: any[] = await new Promise((resolve) => { const get = db.transaction("worlds").objectStore("worlds").getAll(); get.onsuccess = () => resolve(get.result); });
    db.close();
    return all.find((w) => w.name === "Harbour Town").id;
  });
  await openRoute(page, `/worlds/${worldId}/edit`);
  const card = page.locator('[aria-label="Cast and relationships"]');
  await card.getByRole("button", { name: "From another world" }).click();
  await page.getByRole("button", { name: "Add Aria" }).click();
  await page.keyboard.press("Escape");
  await expect(card.getByRole("list", { name: "People in Harbour Town" })).toContainText("Aria");

  // The copy is its own: editing it leaves the original alone.
  const copyId = (await charactersInDb(page)).find((c) => c.name === "Aria" && c.worldId)!.id;
  await openRoute(page, `/characters/${copyId}/edit`);
  await page.getByRole("textbox", { name: "Description (Optional)" }).fill("Runs the harbour garage.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  const after = await charactersInDb(page);
  expect(after.find((c) => c.id === copyId)?.description).toBe("Runs the harbour garage.");
  expect(after.find((c) => c.id === ARIA.id)?.description).not.toBe("Runs the harbour garage.");

  // Suggested people, then a connection set by hand.
  await openRoute(page, `/worlds/${worldId}/edit`);
  // Someone new, from a line.
  await card.getByLabel("Someone new").fill("A grumpy lighthouse keeper");
  // Tied to someone already there: the draft knows, and the tie is saved.
  await card.getByRole("combobox", { name: "Connected to" }).click();
  await page.getByRole("option", { name: "Aria" }).click();
  await card.getByLabel("What they are to Aria").fill("older brother");
  await card.getByRole("button", { name: "Create", exact: true }).click();
  await expect(card.getByRole("list", { name: "People in Harbour Town" })).toContainText("Bram Vega");
  expect(mockAI.requests.some((r) => r.prompt.includes("A grumpy lighthouse keeper") && r.prompt.includes("They are Aria's older brother"))).toBe(true);
  await expect(card.getByRole("list", { name: "Connections in Harbour Town" })).toContainText("Bram Vega is Aria's older brother");
  await card.getByRole("button", { name: "Delete Bram Vega" }).click();
  await page.getByRole("button", { name: /^(Confirm|OK|Delete)$/ }).click();
  await expect(card.getByRole("list", { name: "People in Harbour Town" })).not.toContainText("Bram Vega");

  await card.getByRole("button", { name: "Suggest people" }).click();
  await card.getByRole("list", { name: "Suggested people" }).getByRole("button", { name: "Add Bram Vega" }).click();
  await expect(card.getByRole("list", { name: "People in Harbour Town" })).toContainText("Bram Vega");
  await expect(card.getByRole("list", { name: "Connections in Harbour Town" })).toContainText("Bram Vega is Aria's older brother");
  await card.getByRole("button", { name: "Edit Aria and Bram Vega" }).click();
  await card.getByLabel("What Bram Vega is to Aria").fill("best friend");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByRole("list", { name: "Connections in Harbour Town" })).toContainText("Bram Vega is Aria's best friend");

  // Deleting a copy deletes only that copy.
  await card.getByRole("button", { name: "Delete Aria" }).click();
  await page.getByRole("button", { name: /^(Confirm|OK|Delete)$/ }).click();
  await expect.poll(async () => (await charactersInDb(page)).filter((c) => c.name === "Aria").length).toBe(1);
});

test("in the wizard, someone new can be tied to someone in the cast", async ({ page, mockAI }) => {
  mockAI.reply((req) => answer(req.prompt));
  await openRoute(page, "/worlds/wizard");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Harbour Town");
  await page.getByRole("textbox", { name: "Premise", exact: true }).fill("A rainy port.");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("group", { name: "People you already have" }).getByRole("button", { name: "Aria" }).click();
  await page.getByLabel("Someone new").fill("A ferry pilot");
  await page.getByRole("combobox", { name: "Connected to" }).click();
  await page.getByRole("option", { name: "Aria" }).click();
  await page.getByLabel("What they are to Aria").fill("older brother");
  await page.getByRole("button", { name: "Draft", exact: true }).click();
  await expect(page.getByRole("list", { name: "Cast" })).toContainText("Bram Vega");
  expect(mockAI.requests.some((r) => r.prompt.includes("They are Aria's older brother"))).toBe(true);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByLabel("What Bram Vega is to Aria")).toHaveValue("older brother");
});

const patchAria = (page: import("@playwright/test").Page, fields: Record<string, unknown>) =>
  page.evaluate(async ({ id, fields }) => {
    const db: IDBDatabase = await new Promise((resolve) => { const req = indexedDB.open("ChatAppDB"); req.onsuccess = () => resolve(req.result); });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("characters", "readwrite");
      const store = tx.objectStore("characters");
      const get = store.get(id);
      get.onsuccess = () => store.put({ ...get.result, ...fields });
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, { id: ARIA.id, fields });

const copyOfAria = async (page: import("@playwright/test").Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve) => { const req = indexedDB.open("ChatAppDB"); req.onsuccess = () => resolve(req.result); });
    const all: any[] = await new Promise((resolve) => { const get = db.transaction("characters").objectStore("characters").getAll(); get.onsuccess = () => resolve(get.result); });
    db.close();
    const copy = all.find((c) => c.name === "Aria" && c.worldId);
    return copy ? { memory: copy.memory, statuses: copy.statuses } : undefined;
  });

test("someone pulled into another world comes with their memories, or fresh", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openRoute(page, "/");
  await patchAria(page, { memory: ["You hate mornings"], statuses: [{ id: "s", text: "garage day", createdAt: Date.now() }] });
  await page.reload();
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await openRoute(page, "/characters");
  await page.getByRole("button", { name: "From another world" }).click();
  const dialog = page.getByRole("dialog", { name: "Add someone to Harbour Town" });
  await dialog.getByRole("radio", { name: /Their memories/ }).click();
  await expect(dialog).toContainText("1 facts");
  await dialog.getByRole("button", { name: "Add Aria" }).click();
  await expect.poll(() => copyOfAria(page)).toEqual({ memory: ["You hate mornings"], statuses: undefined });
});

test("in the wizard, each person pulled in can bring their memories", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openRoute(page, "/");
  await patchAria(page, { memory: ["You hate mornings"] });
  await page.reload();
  await openRoute(page, "/worlds/wizard");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Harbour Town");
  await page.getByRole("textbox", { name: "Premise", exact: true }).fill("A rainy port.");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("group", { name: "People you already have" }).getByRole("button", { name: "Aria" }).click();
  await page.getByRole("switch", { name: "Aria brings their memories" }).click();
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create world" }).click();
  await expect.poll(async () => (await copyOfAria(page))?.memory).toEqual(["You hate mornings"]);
});
