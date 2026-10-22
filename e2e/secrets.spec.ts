import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone, messageBubble, ARIA, openDetails } from "./fixtures";

// Secrets (#81): set in the editor with when each can come out; until then
// the character hints, and a reply that tells one gets "A secret came out".

test.use({ seed: { messages: 4 } });

const systemOf = (messages: { role: string; content: string }[]) => messages.find((m) => m.role === "system")?.content || "";

const withDb = <T,>(page: Page, store: string, id: number, fields?: Record<string, unknown>) =>
  page.evaluate(
    async ({ store, id, fields }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const req = indexedDB.open("ChatAppDB");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const row: any = await new Promise((resolve) => {
        const tx = db.transaction(store, fields ? "readwrite" : "readonly");
        const s = tx.objectStore(store);
        const get = s.get(id);
        get.onsuccess = () => {
          if (fields) s.put({ ...get.result, ...fields });
          resolve(get.result);
        };
      });
      db.close();
      return row;
    },
    { store, id, fields }
  ) as Promise<T>;

const SECRETS = [
  { id: "s1", text: "She used to sing in a band", reveal: "asked" },
  { id: "s2", text: "She is afraid of the dark", reveal: "stage", stage: "dating" },
];

test("secrets are set in the editor", async ({ page }) => {
  await openRoute(page, `/characters/${ARIA.id}/edit`);
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();
  const section = page.locator("details").filter({ has: page.locator("summary", { hasText: "Secrets" }) });
  await openDetails(section);
  await section.getByRole("button", { name: "Add a secret" }).click();
  await section.getByRole("textbox", { name: "The secret" }).fill("She used to sing in a band");
  await section.getByRole("combobox", { name: "When it can come out" }).click();
  await page.getByRole("option", { name: "Only if you ask" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  expect((await withDb<any>(page, "characters", ARIA.id)).secrets).toEqual([expect.objectContaining({ text: "She used to sing in a band", reveal: "asked" })]);
});

test("a secret is hinted at, then told, and marked in the chat", async ({ page, mockAI }) => {
  mockAI.reply("*hesitates* Fine. I used to sing in a band.\n[Secret revealed: 1]");
  await openChat(page);
  await withDb(page, "characters", ARIA.id, { secrets: SECRETS });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });

  await sendMessage(page, "Have you ever been on stage?");
  await waitForReplyDone(page);
  const system = systemOf(mockAI.requests[0].messages);
  expect(system).toContain("- She is afraid of the dark");
  expect(system).toContain("1. She used to sing in a band (only if");

  const bubble = messageBubble(page, "I used to sing in a band.");
  await expect(bubble).toBeVisible();
  await expect(bubble).not.toContainText("Secret revealed");
  await expect(page.getByText("A secret came out")).toBeVisible();
  await expect.poll(async () => (await withDb<any>(page, "chats", 1)).revealedSecrets).toEqual(["s1"]);

  // Told once: it isn't offered again.
  mockAI.reply("Anyway.");
  await sendMessage(page, "That's amazing.");
  await waitForReplyDone(page);
  await expect.poll(() => mockAI.requests.filter((r) => r.stream).length).toBe(2);
  expect(systemOf(mockAI.requests.filter((r) => r.stream)[1].messages)).not.toContain("1. She used to sing in a band");
});

test("a stage secret can come out once the chat reaches that stage", async ({ page, mockAI }) => {
  await openChat(page);
  await withDb(page, "characters", ARIA.id, { secrets: [SECRETS[1]] });
  await withDb(page, "chats", 1, { stage: "dating" });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
  await sendMessage(page, "Why do you keep the lights on?");
  await waitForReplyDone(page);
  expect(systemOf(mockAI.requests[0].messages)).toContain("1. She is afraid of the dark (when the moment feels right");
  // A reply without the tag tells nothing.
  await expect(page.getByText("A secret came out")).toHaveCount(0);
});
