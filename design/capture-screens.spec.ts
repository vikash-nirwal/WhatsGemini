import type { Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { test, expect, openRoute, headerAction } from "./fixtures";

// Throwaway: screenshots of every main screen for a design revamp.
const OUT = path.resolve(__dirname, "../design/screenshots");
// The real clock: a fake one freezes the entrance animations.
const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;

const characters = [
  { id: 1, name: "Aria", description: "A warm, witty mechanic who restores old bikes in a Lisbon garage.", prompt: "You are Aria: warm, witty and curious.", relationship: "Close friend", accent: ["#10B981", "#0EA5A0"], about: "Grease, coffee, repeat ☕", tags: ["Slice of life", "Friendly"],
    statuses: [{ id: "st-a1", text: "Finally got the '74 Vespa to purr. Garage karaoke with @Sam tonight 🎤", createdAt: NOW - 2 * HOUR, mentionsYou: true, likes: [2], comments: [{ id: "c1", from: 2, text: "It still sounds like a cat in a blender.", at: NOW - 100 * MIN }] }] },
  { id: 2, name: "Kai", description: "A dry, sarcastic pilot who pretends not to care.", prompt: "You are Kai: dry, sarcastic and practical.", relationship: "Rival", accent: ["#6366F1", "#8B5CF6"], about: "Flying, not talking.",
    statuses: [{ id: "st-k1", text: "Delayed in Porto. Again. The airport café knows my order now.", createdAt: NOW - 5 * HOUR, seen: true }] },
  { id: 3, name: "Lena", description: "Aria's older sister, a night-shift nurse with a soft spot for stray cats.", prompt: "You are Lena, a nurse.", relationship: "New friend", accent: ["#F59E0B", "#EF4444"], about: "Night shift survivor 🌙" },
  { id: 4, name: "Marco", description: "A café owner who knows everyone's business.", prompt: "You are Marco.", relationship: "Acquaintance", accent: ["#0EA5E9", "#22D3EE"] },
];

const ariaChat = [
  { id: "a1", role: "ai", speakerId: 1, txt: "*wipes her hands on a rag* You're late. The coffee's cold and the Vespa still won't start.", timestamp: NOW - 3 * HOUR },
  { id: "a2", role: "you", txt: "Traffic was awful. Did you try the spark plug?", timestamp: NOW - 3 * HOUR + 2 * MIN },
  { id: "a3", role: "ai", speakerId: 1, txt: "Twice. It's the carburettor, I'd bet my favourite wrench on it. Hand me the 10mm?", timestamp: NOW - 3 * HOUR + 4 * MIN, emotion: "playful" },
  { id: "a4", role: "you", txt: "Here. Also, my sister's coming to Lisbon next week 😬", timestamp: NOW - 3 * HOUR + 6 * MIN, characterReaction: { emoji: "😮", speakerId: 1 } },
  { id: "a5", role: "ai", speakerId: 1, txt: "Oh no, the famous Priya? You've told me so much about her. Bring her by, I'll pretend the garage is always this tidy.", timestamp: NOW - 3 * HOUR + 7 * MIN, replyTo: { id: "a4", text: "Here. Also, my sister's coming to Lisbon next week 😬", from: "you" }, bookmarked: true },
  { id: "a6", role: "ai", speakerId: 1, txt: "this is literally us 😂", timestamp: NOW - 2 * HOUR, forward: { text: "Why did the mechanic sleep under the car? He wanted to wake up oily." } },
  { id: "a7", role: "you", txt: "Terrible. I love it.", timestamp: NOW - 2 * HOUR + MIN },
  { id: "a8", role: "ai", speakerId: 1, txt: "If you need someone to show your sister around while you work, my sister Lena's off on Thursday.", timestamp: NOW - 90 * MIN, contactCard: { name: "Lena", about: "my sister, a night-shift nurse", characterId: 3 } },
  { id: "a9", role: "ai", speakerId: 1, txt: "just for you 🙈", timestamp: NOW - 80 * MIN, viewOnce: true, viewedOnce: true },
  { id: "a10", role: "you", txt: "Karaoke at nine? I'm bringing snacks.", timestamp: NOW - 20 * MIN },
  { id: "a11", role: "ai", speakerId: 1, txt: "Nine it is. Bring the spicy ones, Kai pretends he hates them but he eats the whole bag.", timestamp: NOW - 18 * MIN, emotion: "happy" },
];

const groupChat = [
  { id: "g0", role: "ai", txt: "You added Lena", isRoomEvent: true, timestamp: NOW - 6 * HOUR },
  { id: "g1", role: "ai", speakerId: 1, txt: "Okay crew, karaoke tonight. Non-negotiable.", timestamp: NOW - 2 * HOUR },
  { id: "g2", role: "ai", speakerId: 2, txt: "I'm negotiating.", timestamp: NOW - 2 * HOUR + MIN },
  { id: "g3", role: "ai", txt: 'Aria changed the group name to "Garage Gremlins"', isRoomEvent: true, timestamp: NOW - 2 * HOUR + 2 * MIN },
  { id: "g4", role: "you", txt: "", timestamp: NOW - 100 * MIN, poll: { question: "What do we eat after?", options: ["Pizza", "Bifanas", "Whatever Kai complains least about"], votes: [{ voter: 1, name: "Aria", option: 1, at: NOW - 99 * MIN }, { voter: 2, name: "Kai", option: 2, at: NOW - 98 * MIN }, { voter: 3, name: "Lena", option: 1, at: NOW - 97 * MIN }, { voter: "you", option: 1, at: NOW - 96 * MIN }] } },
  { id: "g5", role: "ai", speakerId: 3, txt: "Bifanas, obviously. I've had hospital food all week.", timestamp: NOW - 95 * MIN },
  { id: "g6", role: "ai", speakerId: 2, txt: "For the record, I voted for peace.", timestamp: NOW - 94 * MIN },
];

const seed = async (page: Page) => {
  await page.evaluate(async ({ characters, ariaChat, groupChat, NOW, HOUR, MIN }) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open("ChatAppDB");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["characters", "chats", "adventures", "worlds", "settings"], "readwrite");
      const chars = tx.objectStore("characters");
      chars.clear();
      characters.forEach((c: any) => chars.put(c));
      const chats = tx.objectStore("chats");
      chats.clear();
      chats.put({ id: 1, title: "Aria", timestamp: NOW - 18 * MIN, content: ariaChat, characterIds: [1], readAt: NOW, pinned: true });
      chats.put({ id: 2, title: "Garage Gremlins", timestamp: NOW - 94 * MIN, content: groupChat, characterIds: [1, 2, 3], readAt: NOW - 96 * MIN, scenario: "A rainy Friday night in Aria's garage in Lisbon." });
      chats.put({ id: 3, title: "Lena", timestamp: NOW - 40 * MIN, content: [{ id: "l1", role: "ai", speakerId: 3, txt: "Hey! Aria gave me your number. She says your sister's visiting? I know the best pastéis in town 🥐", timestamp: NOW - 40 * MIN, notes: ["texted-first"] }], characterIds: [3] });
      chats.put({ id: 4, title: "Kai", timestamp: NOW - 26 * HOUR, content: [{ id: "k1", role: "you", txt: "Good flight?", timestamp: NOW - 27 * HOUR }, { id: "k2", role: "ai", speakerId: 2, txt: "Turbulence. Bad coffee. Five stars.", timestamp: NOW - 26 * HOUR }], characterIds: [2], readAt: NOW, muted: true });
      chats.put({ id: 5, title: "Marco", timestamp: NOW - 5 * 24 * HOUR, content: [{ id: "m1", role: "ai", speakerId: 4, txt: "Your usual table is free, by the way.", timestamp: NOW - 5 * 24 * HOUR }], characterIds: [4], readAt: NOW, archived: true });
      const worlds = tx.objectStore("worlds");
      worlds.clear();
      worlds.put({ id: 1, name: "Lisbon Nights", premise: "Modern-day Lisbon: tram bells, tiled walls, a garage full of half-fixed bikes and the friends who hang around it.", tone: "Warm slice of life", tags: ["Modern", "Cozy"] });
      worlds.put({ id: 2, name: "Ravenmoor", premise: "A misty port town where the lighthouse keeper keeps more than ships safe.", tone: "Gothic mystery", tags: ["Fantasy", "Mystery"] });
      const settings = tx.objectStore("settings");
      settings.put({ key: "my_statuses", value: [{ id: "my-1", text: "Sunset at the pier 🌅", createdAt: NOW - 90 * MIN, views: [{ characterId: 1, at: NOW - 80 * MIN }, { characterId: 3, at: NOW - 60 * MIN }], likes: [{ characterId: 1, at: NOW - 79 * MIN }], comments: [{ id: "mc1", from: 1, text: "Looks amazing! Which pier?", at: NOW - 75 * MIN }] }] });
      settings.put({ key: "channels", value: [{ id: "character-1", kind: "character", refId: 1, followedAt: NOW - 3 * 24 * HOUR, lastReadAt: NOW - 30 * HOUR, posts: [
        { id: "cp-1", text: "Shop's open late all week: bring your sad bikes, I'll make them happy. 🔧", at: NOW - 30 * HOUR },
        { id: "cp-2", text: "Restoration diary, day 12: the '74 Vespa runs. I may have cried a little.", at: NOW - 3 * HOUR, yourReaction: "❤️" },
      ] }, { id: "world-1", kind: "world", refId: 1, followedAt: NOW - 2 * 24 * HOUR, posts: [{ id: "cp-3", text: "Tram 28 diverted on Saturday for the Santo António festivities. Sardines expected everywhere.", at: NOW - 6 * HOUR }] }] });
      const adv = tx.objectStore("adventures");
      adv.clear();
      adv.put({ id: 1, title: "The Sunken Archive", timestamp: NOW - 24 * HOUR, characterIds: [1, 2], premise: "A flooded library hides a map to the old city.", status: "active", worldId: 2, content: [
        { id: "ad-0", role: "ai", txt: "Rain hammers the door of the sunken archive. A lantern flickers inside, and somewhere below, water drips onto stone.", timestamp: NOW - 24 * HOUR, choices: [{ id: "c1", label: "Push the door open" }, { id: "c2", label: "Knock three times" }, { id: "c3", label: "Circle round to the back" }] },
      ] });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { characters, ariaChat, groupChat, NOW, HOUR, MIN });
};

const THEMES: { name: string; storage: Record<string, string> }[] = [
  { name: "cozy-dark", storage: {} },
  { name: "whatsapp-light", storage: { color_theme: "whatsapp", theme: "light" } },
];

for (const theme of THEMES) {
  test.describe(theme.name, () => {
    test.use({
      seed: { messages: 2, room: true, adventure: true },
      localStorageOverrides: {
        ...theme.storage,
        whatsgemini_user_personas: JSON.stringify([{ id: "p1", name: "Sam", bio: "A night-shift baker who loves old cars.", about: "Flour everywhere" }]),
        whatsgemini_active_persona_id: "p1",
        texting_mode: "true",
      },
    });

    test("screens", async ({ page, mockAI }, testInfo) => {
      test.setTimeout(240_000);
      mockAI.reply("Mock reply");
      const dir = path.join(OUT, `${testInfo.project.name}-${theme.name}`);
      fs.mkdirSync(dir, { recursive: true });
      let n = 0;
      const shot = async (name: string) => {
        await page.waitForTimeout(500);
        n += 1;
        await page.screenshot({ path: path.join(dir, `${String(n).padStart(2, "0")}-${name}.png`) });
      };
      const phone = (page.viewportSize()?.width || 0) < 1024;
      await openRoute(page, "/characters");
      await expect(page.getByText("Aria").first()).toBeVisible({ timeout: 30_000 });
      await seed(page);

      // Home
      await page.goto("./#/");
      await page.reload();
      await page.waitForTimeout(1200);
      await shot("home");
      if (phone && theme.name === "cozy-dark") {
        const menu = page.locator("header").first().getByRole("button", { name: "Open menu" });
        if (await menu.isVisible()) { await menu.click(); await shot("chat-list-drawer"); await page.keyboard.press("Escape"); await page.mouse.click(390, 400).catch(() => {}); }
      }

      // 1:1 chat
      await page.goto("./#/chat/1");
      await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
      await shot("chat");
      await page.getByRole("region", { name: "Messages" }).evaluate((el) => (el.scrollTop = 0));
      await shot("chat-top");
      if (phone) {
        await page.locator('[data-slot="message-bubble"]').filter({ hasText: "carburettor" }).dispatchEvent("contextmenu");
        await shot("message-actions");
        await page.keyboard.press("Escape");
      } else {
        await page.locator('[data-slot="message-bubble"]').filter({ hasText: "Nine it is" }).hover();
        await shot("message-hover-actions");
      }
      await headerAction(page, "Scene & chat settings");
      await page.getByRole("tab", { name: "Chat", exact: true }).click();
      await shot("panel-chat-tab");
      await page.getByRole("tab", { name: "Scene", exact: true }).click();
      await shot("panel-scene-tab");
      await page.getByRole("tab", { name: "Story", exact: true }).click();
      await shot("panel-story-tab");
      await page.getByRole("tab", { name: "Memory", exact: true }).click();
      await shot("panel-memory-tab");
      await page.getByRole("button", { name: "Close scene panel" }).click();

      // Group chat
      await page.goto("./#/chat/2");
      await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
      await shot("group-chat");
      await headerAction(page, "Participants");
      await shot("group-participants");
      await page.getByRole("button", { name: "Close participants panel" }).click();

      // A first text from someone new
      await page.goto("./#/chat/3");
      await expect(page.getByLabel("Message input")).toBeVisible({ timeout: 30_000 });
      await shot("first-text-chat");

      // Updates, statuses, channels
      await page.goto("./#/updates");
      await page.waitForTimeout(800);
      await shot("updates");
      await page.getByRole("button", { name: "View my status" }).click();
      await page.getByText(/Seen by/).first().click();
      await shot("my-status");
      await page.keyboard.press("Escape");
      await page.getByRole("region", { name: "Recent updates" }).getByRole("button").first().click();
      await shot("status-viewer");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "All posts" }).click();
      await shot("status-feed");
      await page.keyboard.press("Escape");
      await page.goto("./#/channels/character-1");
      await page.waitForTimeout(800);
      await shot("channel");
      await page.goto("./#/starred");
      await page.waitForTimeout(800);
      await shot("starred");

      // Characters, editor
      await page.goto("./#/characters");
      await page.waitForTimeout(1000);
      await shot("characters");
      await page.goto("./#/characters/1/edit");
      await expect(page.getByRole("textbox", { name: "Character Name" })).toHaveValue("Aria", { timeout: 30_000 });
      await shot("editor-step1");
      for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next" }).click();
      await page.waitForTimeout(500);
      await shot("editor-last-step");

      // Adventures, worlds
      await page.goto("./#/adventures");
      await page.waitForTimeout(1000);
      await shot("adventures");
      await page.goto("./#/adventures/1");
      await page.waitForTimeout(1500);
      await shot("adventure");
      await page.goto("./#/worlds");
      await page.waitForTimeout(1000);
      await shot("worlds");

      // Settings
      await page.goto("./#/settings/appearance");
      await page.waitForTimeout(1000);
      await shot("settings-appearance");
      await page.goto("./#/settings/profile");
      await page.waitForTimeout(800);
      await shot("settings-profile");

      // New chat
      await page.goto("./#/");
      await page.waitForTimeout(800);
      const newChat = page.getByRole("button", { name: "New chat" }).locator("visible=true").first();
      if (await newChat.isVisible().catch(() => false)) {
        await newChat.click();
        await shot("new-chat");
      }
    });
  });
}
