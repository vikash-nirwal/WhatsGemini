import { test, expect, openChat, openContactInfo, sendMessage, waitForReplyDone, ARIA, KAI } from "./fixtures";

// Relationships between characters, from Contact info: who they are to each
// other, both ways; replies know it.

test.use({ seed: { messages: 4, room: true } });

const tiesInDb = (page: import("@playwright/test").Page, id: number) =>
  page.evaluate(async (id) => {
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
    return c.ties || [];
  }, id);

test("a relationship is added in Contact info, reaches the reply, and can be changed or removed", async ({ page, mockAI }) => {
  mockAI.reply("Mock reply");
  await openChat(page);
  await openContactInfo(page);
  await page.getByRole("button", { name: "Add a relationship" }).click();
  const form = page.getByRole("group", { name: "Relationship" });
  await form.getByRole("combobox", { name: "Who" }).click();
  await page.getByRole("option", { name: "Kai" }).click();
  await form.getByLabel("Kai is Aria's").fill("older brother");
  await form.getByLabel("Aria is Kai's").fill("little sister");
  await form.getByRole("button", { name: "Save" }).click();
  const list = page.getByRole("list", { name: "Aria's relationships" });
  await expect(list).toContainText("Kai · older brother");
  await expect(list).toContainText("Aria is Kai's little sister");
  await expect.poll(() => tiesInDb(page, KAI.id)).toEqual([{ withId: ARIA.id, tie: "your little sister" }]);

  await page.getByRole("button", { name: "Close contact info" }).click();
  await sendMessage(page, "how's your brother?");
  await waitForReplyDone(page);
  const system = mockAI.requests.filter((r) => r.stream).pop()!.messages.find((m) => m.role === "system")?.content || "";
  expect(system).toContain("- Kai: your older brother");

  await openContactInfo(page);
  await page.getByRole("button", { name: "Edit Aria and Kai" }).click();
  await page.getByRole("group", { name: "Relationship" }).getByLabel("Kai is Aria's").fill("ex");
  await page.getByRole("group", { name: "Relationship" }).getByRole("button", { name: "Save" }).click();
  await expect(list).toContainText("Kai · ex");
  await page.getByRole("button", { name: "Remove Aria and Kai" }).click();
  await expect(page.getByRole("list", { name: "Aria's relationships" })).toHaveCount(0);
  await expect.poll(() => tiesInDb(page, ARIA.id)).toEqual([]);
});
