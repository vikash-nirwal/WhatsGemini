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

// #184: a dated plan gets a reminder the day before, and if its day passes
// without "It happened", how it went is written anyway.
test("a dated plan reminds the group and resolves on its own", async ({ page, mockAI }) => {
  await page.clock.install({ time: new Date(2026, 9, 24, 10, 0, 0) });
  mockAI.reply((req) =>
    req.prompt.includes("Tomorrow is the plan") ? "tomorrow!! bring blankets"
      : req.prompt.includes("made a plan: Bonfire on the beach") ? "The fire wouldn't light until Kai found dry wood, then everyone stayed till dawn."
      : "Mock reply"
  );
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Make a plan" }).click();
  const dialog = page.getByRole("dialog", { name: "Make a plan" });
  await dialog.getByRole("textbox", { name: "The plan" }).fill("Bonfire on the beach");
  await dialog.getByLabel("Day").fill("2026-10-25");
  await dialog.getByRole("checkbox", { name: "Aria is in" }).check();
  await dialog.getByRole("checkbox", { name: "Kai is in" }).check();
  await dialog.getByRole("button", { name: "Start the group chat" }).click();
  await expect(page).toHaveURL(/#\/chat\/\d+$/);

  await page.clock.fastForward(65_000);
  await expect(page.getByText("tomorrow!! bring blankets").first()).toBeVisible({ timeout: 15_000 });

  await page.clock.fastForward(2 * 24 * 3_600_000);
  await expect(page.getByRole("region", { name: "Group plan" })).toContainText("done", { timeout: 15_000 });
  await expect(page.getByText("How it went: The fire wouldn't light", { exact: false })).toBeVisible();
});

// #195: a dated plan goes into your calendar as a file.
test("a dated plan can be added to your calendar", async ({ page }) => {
  await openRoute(page, "/worlds");
  await page.getByRole("button", { name: "Make a plan" }).click();
  const dialog = page.getByRole("dialog", { name: "Make a plan" });
  await dialog.getByRole("textbox", { name: "The plan" }).fill("Bonfire on the beach");
  await dialog.getByLabel("Day").fill("2026-10-31");
  await dialog.getByRole("checkbox", { name: "Aria is in" }).check();
  await dialog.getByRole("checkbox", { name: "Kai is in" }).check();
  await dialog.getByRole("button", { name: "Start the group chat" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("region", { name: "Group plan" }).getByRole("button", { name: "Add to calendar" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("bonfire-on-the-beach.ics");
  const text = require("fs").readFileSync((await download.path())!, "utf8");
  expect(text).toContain("DTSTART;VALUE=DATE:20261031");
});
