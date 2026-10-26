import type { Page } from "@playwright/test";
import { test, expect, openRoute, openContactInfo, ARIA, KAI } from "./fixtures";

// Secrets between characters (#170): someone starts hiding something from a
// person in their life; a friend of theirs lets it slip to you; in the
// contact info of the one it's kept from, you can tell them.

test.use({ seed: { messages: 2, room: true } });

const NOW = new Date(2026, 9, 21, 10, 0, 0).getTime();

const put = (page: Page, store: string, value: Record<string, unknown>) =>
  page.evaluate(async ({ store, value }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const os = db.transaction(store, "readwrite").objectStore(store);
      const get = os.get(value.id as number);
      get.onsuccess = () => {
        os.put({ ...(get.result || {}), ...value });
        os.transaction.oncomplete = () => resolve();
      };
    });
    db.close();
  }, { store, value });

test("a friend lets a secret slip, and you tell the one it's kept from", async ({ page, mockAI }) => {
  await page.addInitScript(() => {
    localStorage.setItem("world_prefs", JSON.stringify({ "1": { secrets: true } }));
    let n = 0;
    Math.random = () => 0.01 + ((n++ * 0.0137) % 0.2);
  });
  await page.clock.install({ time: NOW });
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await page.getByRole("button", { name: "Switch to Harbour Town" }).click();
  await put(page, "characters", { id: ARIA.id, worldId: 1, ties: [{ withId: KAI.id, tie: "your brother" }] });
  await put(page, "characters", { id: KAI.id, worldId: 1, ties: [{ withId: ARIA.id, tie: "your sister" }] });
  await put(page, "characters", { id: 3, name: "Cleo", prompt: "You are Cleo, Aria's best friend.", description: "Aria's best friend.", worldId: 1, ties: [{ withId: ARIA.id, tie: "your best friend" }] });
  await put(page, "chats", { id: 3, title: "Cleo", timestamp: NOW, content: [], characterIds: [3], worldId: 1 });
  await put(page, "chats", { id: 4, title: "Kai", timestamp: NOW, content: [], characterIds: [KAI.id], worldId: 1 });
  mockAI.reply((req) =>
    req.prompt.includes("Invent a secret")
      ? "SECRET: Aria sold their late father's boat without telling Kai.\nGOSSIP: ok don't tell anyone but Aria sold the boat. Kai has no idea"
      : "Mock reply"
  );
  await page.reload();
  await page.clock.fastForward(65_000);
  await expect(page.getByText("Cleo texted you")).toBeVisible({ timeout: 15_000 });
  expect(mockAI.requests.find((r) => r.prompt.includes("Invent a secret"))!.prompt).toContain("Invent a secret Aria is now keeping from Kai");

  await openRoute(page, "/chat/4");
  await openContactInfo(page);
  const known = page.getByRole("region", { name: "Secrets you know" });
  await expect(known).toContainText("Aria sold their late father's boat without telling Kai.");
  await expect(known).toContainText("heard from Cleo");
  await known.getByRole("button", { name: "Tell Kai" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByRole("region", { name: "Secrets you know" })).toHaveCount(0);
  await expect(page.getByText("You told Kai what Aria was hiding").first()).toBeVisible();
});

// #184: a secret kept long enough can come out on its own.
test("an old secret comes out, and the one it was kept from knows", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("world_prefs", JSON.stringify({ "1": { secrets: true } }));
    let n = 0;
    Math.random = () => 0.01 + ((n++ * 0.0137) % 0.2);
  });
  await page.clock.install({ time: NOW });
  await openRoute(page, "/worlds/new");
  await page.locator("#world-name").fill("Harbour Town");
  await page.locator("#world-premise").fill("A rainy port where everyone knows everyone.");
  await page.getByRole("button", { name: "Create World" }).click();
  await put(page, "worlds", { id: 1, lastSecretAt: NOW });
  await put(page, "characters", { id: ARIA.id, worldId: 1, keptSecrets: [{ id: "s1", fromId: KAI.id, text: "Aria sold their late father's boat.", at: NOW - 10 * 86_400_000 }] });
  await put(page, "characters", { id: KAI.id, worldId: 1 });
  await page.reload();
  await page.clock.fastForward(65_000);
  await openRoute(page, "/worlds/1/timeline");
  await expect(page.getByRole("list", { name: "World timeline" })).toContainText(/Aria confessed to Kai|slipped out in front of Kai|Kai found out what Aria was hiding/, { timeout: 15_000 });
  const kaiMemory = await page.evaluate(async (id) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const c: any = await new Promise((resolve) => {
      const get = db.transaction("characters").objectStore("characters").get(id);
      get.onsuccess = () => resolve(get.result);
    });
    db.close();
    return c.memory || [];
  }, KAI.id);
  expect(kaiMemory.join(" ")).toContain("Aria sold their late father's boat.");
});
