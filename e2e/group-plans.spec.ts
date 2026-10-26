import { test, expect, openRoute } from "./fixtures";

// Group plans (#168): a plan with a few people gets its own group chat;
// "It happened" writes up how it went, and each of them remembers it.

test.use({ seed: { messages: 2, room: true } });

const memoryOf = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate(async (name) => {
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
    return all.find((c) => c.name === name)?.memory || [];
  }, name);

test("make a plan, chat about it, and everyone remembers how it went", async ({ page, mockAI }) => {
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Make a plan" }).click();
  const dialog = page.getByRole("dialog", { name: "Make a plan" });
  await dialog.getByRole("textbox", { name: "The plan" }).fill("Bonfire on the beach");
  await dialog.getByRole("textbox", { name: "When" }).fill("Saturday night");
  await dialog.getByRole("checkbox", { name: "Aria is in" }).check();
  await expect(dialog.getByRole("button", { name: "Start the group chat" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Kai is in" }).check();
  await dialog.getByRole("button", { name: "Start the group chat" }).click();

  await expect(page).toHaveURL(/#\/chat\/\d+$/);
  const bar = page.getByRole("region", { name: "Group plan" });
  await expect(bar).toContainText("Bonfire on the beach · Saturday night");

  mockAI.reply((req) => (req.prompt.includes("made a plan: Bonfire on the beach") ? "It rained, so Aria and Kai dragged everyone to the boathouse and Kai burned the marshmallows." : "Mock reply"));
  await bar.getByRole("button", { name: "It happened" }).click();
  await page.getByRole("textbox", { name: "How it went" }).fill("it rained");
  await page.getByRole("button", { name: "Write it up" }).click();
  await expect(bar).toContainText("done");
  await expect(page.getByText("How it went: It rained, so Aria and Kai dragged everyone", { exact: false })).toBeVisible();
  expect(mockAI.requests.find((r) => r.prompt.includes("made a plan"))!.prompt).toContain("says it went: it rained");
  await expect.poll(() => memoryOf(page, "Kai")).toContainEqual(expect.stringContaining("Bonfire on the beach with"));
});
