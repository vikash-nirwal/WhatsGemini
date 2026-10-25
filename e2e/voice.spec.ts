import type { Page } from "@playwright/test";
import { test, expect, openChat, openRoute, sendMessage, waitForReplyDone, messageBubble, messageAction, ARIA } from "./fixtures";
import { installSpeechFakes, say, spoken } from "./speechFakes";

// Voice (#12) and voice notes (#44). The browser's speechSynthesis and
// SpeechRecognition are replaced with fakes before the app loads, so every
// project hears the same thing and nothing plays out loud. `window.__speech.spoken` records what
// was said; `window.__recognition.say(text)` is what the microphone "hears".

test.use({ seed: { messages: 3 } });

const isTouch = (page: Page) => page.evaluate(() => window.matchMedia("(hover: none)").matches);

// Changes the seeded database, then reloads so the app reads it.
const patchDb = async (page: Page, patch: { voice?: object; voiceNoteMessage?: { index: number } }) => {
  await page.evaluate(async ({ id, patch }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open("ChatAppDB");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["characters", "chats"], "readwrite");
      if (patch.voice) {
        const store = tx.objectStore("characters");
        const get = store.get(id);
        get.onsuccess = () => store.put({ ...get.result, voice: patch.voice });
      }
      if (patch.voiceNoteMessage) {
        const store = tx.objectStore("chats");
        const get = store.get(1);
        get.onsuccess = () => {
          const chat = get.result;
          chat.content[patch.voiceNoteMessage!.index].isVoiceNote = true;
          store.put(chat);
        };
      }
      tx.oncomplete = () => resolve();
    });
    db.close();
  }, { id: ARIA.id, patch });
  await page.reload();
  await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
};

const holdToRecord = async (page: Page, words: string) => {
  const button = page.getByRole("button", { name: "Hold to record a voice note" });
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByRole("status").filter({ hasText: "Recording a voice note" })).toBeVisible();
  expect(await say(page, words)).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: words })).toBeVisible();
  await page.mouse.up();
};

test("Read aloud speaks a reply in the character's voice, without the actions, and stops", async ({ page, mockAI }) => {
  await installSpeechFakes(page);
  mockAI.reply("*smiles softly* I'm right here, always.");
  await openChat(page);
  await patchDb(page, { voice: { voiceURI: "test-bruno", voiceName: "Test Bruno", lang: "en-GB", rate: 1.3 } });

  await sendMessage(page, "Are you there?");
  await expect(messageBubble(page, "I'm right here, always.")).toBeVisible();
  await waitForReplyDone(page);

  await messageAction(page, "I'm right here, always.", "Read aloud");
  await expect.poll(() => spoken(page)).toEqual([{ text: "I'm right here, always.", voice: "test-bruno", rate: 1.3, pitch: 1 }]);

  // While it speaks, the same action stops it.
  await messageAction(page, "I'm right here, always.", "Stop reading");
  await expect.poll(() => page.evaluate(() => (window as any).__speech.cancels)).toBeGreaterThan(0);
  if (!(await isTouch(page))) {
    // Back to "Read aloud" once it has stopped (#149: in the More menu).
    const bubble = messageBubble(page, "I'm right here, always.");
    await bubble.hover();
    await bubble.getByRole("button", { name: "More message actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Read aloud" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("a character with voice notes on replies with a playable voice note, one bubble even in texting mode", async ({ page, mockAI }) => {
  await installSpeechFakes(page);
  // Every roll comes up "yes" (still a different number each time, since
  // message ids are made from it too).
  await page.addInitScript(() => {
    let n = 0;
    Math.random = () => 0.05 + ((n++ * 0.0137) % 0.3);
  });
  await page.addInitScript(() => localStorage.setItem("texting_mode", "true"));
  mockAI.reply("*laughs* Okay, okay.\n\nI'll be there at eight.");
  await openChat(page);
  await patchDb(page, { voice: { voiceURI: "test-alice", voiceName: "Test Alice", lang: "en-US", voiceNotes: "often" } });

  await sendMessage(page, "Dinner tonight?");
  const note = page.getByRole("group", { name: /^Voice note, 0:0\d$/ });
  await expect(note).toBeVisible();
  await waitForReplyDone(page);
  await expect(page.locator('[data-slot="text-bubble"]')).toHaveCount(0);
  await expect(note.getByText("I'll be there at eight.")).toBeHidden();

  await note.getByRole("button", { name: "Show transcript" }).click();
  await expect(note.getByText("I'll be there at eight.")).toBeVisible();

  await note.getByRole("button", { name: "Play voice note" }).click();
  await expect.poll(() => spoken(page)).toEqual([{ text: "Okay, okay. I'll be there at eight.", voice: "test-alice", rate: 1, pitch: 1 }]);
  await expect(note.getByRole("button", { name: "Stop voice note" })).toBeVisible();
  await page.evaluate(() => (window as any).__speech.finish());
  await expect(note.getByRole("button", { name: "Play voice note" })).toBeVisible();
});

test("hold to record sends a voice note the character sees as one", async ({ page, mockAI }) => {
  await installSpeechFakes(page);
  mockAI.reply("Don't worry about it.");
  await openChat(page);

  await holdToRecord(page, "running late, sorry");
  const mine = page.getByRole("group", { name: /^Voice note/ });
  await expect(mine).toBeVisible();
  await expect(messageBubble(page, "Don't worry about it.")).toBeVisible();
  await expect.poll(() => mockAI.requests.length).toBe(1);
  expect(mockAI.requests[0].prompt).toContain("(voice note) running late, sorry");
});

test("dictation types what you say into the box", async ({ page }) => {
  await installSpeechFakes(page);
  await openChat(page);
  const input = page.getByLabel("Message input");
  await input.fill("Hey,");

  const inline = page.getByRole("button", { name: "Dictate" });
  if (await inline.isVisible()) {
    await inline.click();
  } else {
    await page.getByRole("button", { name: "Composer options" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Dictate" }).click();
  }
  await expect(page.getByText("Listening — speak and your words appear in the box.")).toBeVisible();
  expect(await say(page, "how was work")).toBe(true);
  await expect(input).toHaveValue("Hey, how was work");
  await page.getByRole("button", { name: "Stop dictating" }).click();
  await expect(page.getByText(/Listening/)).toBeHidden();
  await expect(input).toHaveValue("Hey, how was work");
});

test("pick a voice, speed and voice notes in the character editor, with a preview", async ({ page }) => {
  await installSpeechFakes(page);
  await openRoute(page, "/characters/1/edit");
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  const section = page.locator("details").filter({ has: page.locator("summary", { hasText: "Voice" }) });
  await expect(section.locator("summary")).toContainText("Browser default, voice notes off");

  await section.locator("summary").click();
  await section.getByRole("combobox", { name: "Voice" }).click();
  await page.getByRole("option", { name: "Test Bruno (en-GB)" }).click();
  await section.getByRole("slider", { name: "Speed" }).fill("1.5");
  await section.getByRole("button", { name: "Often" }).click();
  await section.getByRole("button", { name: "Preview" }).click();
  await expect.poll(() => spoken(page)).toEqual([{ text: "Hi, I'm Aria. This is how I sound.", voice: "test-bruno", rate: 1.5, pitch: 1 }]);
  await expect(section.locator("summary")).toContainText("Test Bruno, voice notes often");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Character saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
  await expect(section.locator("summary")).toContainText("Test Bruno, voice notes often");
});

test.describe("without speech APIs (like Firefox)", () => {
  test("no voice controls show, and a voice note shows its transcript", async ({ page }) => {
    await installSpeechFakes(page, { synthesis: false, recognition: false });
    await openChat(page);
    await patchDb(page, { voiceNoteMessage: { index: 2 } });

    const note = page.getByRole("group", { name: /^Voice note/ });
    await expect(note.getByText("Aria message 3: how was your day?")).toBeVisible();
    await expect(note.getByRole("button", { name: "Play voice note" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Hold to record a voice note" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Dictate" })).toHaveCount(0);
    if (!(await isTouch(page))) {
      await messageBubble(page, "Aria message 1").hover();
      await expect(page.getByRole("button", { name: "Read aloud" })).toHaveCount(0);
    }
  });
});

test("a voice note found by search says it's a voice message", async ({ page }) => {
  await openChat(page);
  await patchDb(page, { voiceNoteMessage: { index: 1 } });
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
  await page.getByLabel("Search chats and messages").fill("fine, thanks");
  await expect(page.getByText("🎤 Voice message:", { exact: false }).first()).toBeVisible();
});
