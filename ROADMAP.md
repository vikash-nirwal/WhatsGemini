# WhatsGemini roadmap

Status: draft for review. Nothing here is implemented yet. Order: Phase 0 (logic bugs), then Phase 0.5 (UI tests and layout fixes), then the feature phases.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.
Each item says what changes and why it matters for roleplay. Strike out, reorder or comment on anything; we start from the top once you're happy with it.

---

## Phase 0: Bug fixes (do first)

Every one of these was confirmed by reading the code, not guessed.

| # | Bug | Where | Fix | Size |
|---|-----|-------|-----|------|
| B1 | Generating a missing mood portrait from inside a chat **deletes the character's custom emotions**. The update rebuilds `emotionPortraits` as `{ enabled, images }`, so `customEmotions` is lost. | `src/pages/ChatPage.tsx:259` | Spread the existing `emotionPortraits` before overwriting `images`. | S |
| B2 | **Impersonating in a group chat always posts as the first character**, even when you picked a different speaker in the composer. | `src/pages/ChatPage.tsx:679` | Use `forcedSpeakerId ?? characterData.id`, and have the composer's banner name the picked speaker. | S |
| B3 | Compression and history truncation protect the first N messages, where **N is the global "initial messages" count**, not this chat's own seed. A chat that opened with a character greeting (no hidden seed messages) keeps its first N real messages pinned forever. `truncateHistory` also applies that offset to the already-filtered history list, so it can point at the wrong messages. | `src/features/ai/utils/chatHistoryUtils.ts:81`, `:132` | Count the chat's own leading `isSystem` seed messages. Pass that count into `truncateHistory` explicitly. Add tests. | S |
| B4 | **Memory can't change its mind.** The extractor is told to "state the new version" when a fact changes, but `mergeMemory` only appends, so "Lives in Paris" and "Moved to Berlin" both stay forever. Eviction is oldest-first, which throws out the most foundational facts first (names, how you met). | `src/features/ai/utils/memoryExtraction.ts:63` | Let the extractor return `UPDATE: old => new` and `FORGET: old` lines and apply them. Evict the least recently reinforced facts instead of the oldest. Add tests. | M |
| B5 | **Compression is destructive.** `updateMessages` throws away the branch tree, so every swipe and alternate branch is lost, and the summarized messages disappear from the screen. You can't scroll back and reread your own story. | `src/features/chatSlice.ts:141` (used by auto and manual compress) | Keep the messages and the tree. Store the summary on the chat with a pointer to the last message it covers. The prompt builder sends summary + messages after it. The UI shows older messages dimmed under an "Earlier (summarized)" divider. Once compression is non-destructive, also run it on the edit-and-resend path (left over from B7). | L |
| B6 | **Adventures skip most of the chat pipeline**: replies don't stream; there's no compression or memory, so a long adventure silently loses its plot once the history cap trims the start; the narrator gets no content rating, hard limits or roleplay style; `AdventureRules.safetySettings` is declared but never read. | `src/pages/AdventurePage.tsx:170`, `src/types/index.ts:285` | Pass a `streamKey`; reuse auto-compression (after B5); add the cast's content rule, hard limits and style section to the narrator prompt; read the safety override or delete the field. | M |
| B7 | When you edit your last message and get a new reply, the new reply doesn't keep its image prompt or params (so "redraw" starts over), and auto-compression doesn't run on that path. | `src/pages/ChatPage.tsx:798` | Copy `imagePrompt`/`imageParams` onto the new reply. Running `autoCompressChat` on this path waits for B5: today compression throws away the branch tree, so it would delete the variant the edit just created. | S |

Suggested order: B1, B2, B3, B7 as one quick commit; then B4; then B5; then B6 (it builds on B5).

---

## Phase 0.5: UI tests, then layout and mobile fixes

I reproduced these in the running app at desktop (800px pane), tablet (768×1024) and phone (375×812) sizes. The UI test suite comes first, so every fix below lands with a test that would have caught it.

### T: UI test suite

The existing Jest tests run in jsdom, which has no layout engine, so they can't see overlap, clipping or overflow. Layout needs a real browser.

| # | What | Size |
|---|------|------|
| T1 | **Playwright setup** (`@playwright/test`), with `npm run test:e2e` and `test:e2e:update`. Four viewport projects: desktop Chromium 1280×800, tablet 768×1024, iPhone (WebKit, so iOS Safari quirks show up) and Pixel (Chromium). | S |
| T2 | **Fixtures**: seed IndexedDB (`ChatAppDB`) and localStorage before each test (age gate, a keyless provider, sample characters and a long chat). **Mock the AI**: intercept provider requests with `page.route` and stream canned replies, so tests run offline, cost nothing and are deterministic. | M |
| T3 | **Layout checks**, asserting geometry instead of pixels, so they don't flake. The text box stays inside the composer at 1–10 lines. The last message is never covered by the composer. Pages never scroll sideways. The header title keeps a minimum width. Tap targets are at least 40px on phones. The drawer closes on navigation. Dialogs fit the screen. | M |
| T4 | **Flow tests**: create a character, start a chat, send a message and get the mocked reply, regenerate and swipe, edit, Continue, invite into a group chat, play an adventure choice, import a card. | M |
| T5 | **Screenshot tests** (`toHaveScreenshot`) for a small set of key screens across the 6 themes and 4 viewports, with timestamps masked. Kept deliberately small, because large screenshot suites become noise. | S |
| T6 | **Accessibility scan** with `@axe-core/playwright` on the main pages. | S |
| T7 | **CI**: a GitHub Actions workflow running unit and UI tests on every push and PR. The repo has no CI today. | S |

Jest and React Testing Library stay for component behavior (composer modes, mention picker, message actions); Playwright covers layout and full flows.

### U: Layout and mobile bugs

| # | Bug (seen in the app) | Cause | Fix | Size |
|---|-----|-------|-----|------|
| U1 | **Multi-line input overflows the composer.** With 6 lines, the text box is 120px tall but the composer bar stays 56px, so text spills above the bar and off the bottom of the screen. | The composer row has a fixed `h-14 rounded-full` (`src/components/organisms/MessageInput.tsx:652`). | Use `min-h-14` and `items-end` so the buttons stay at the bottom, and a smaller corner radius once it grows past one line. | S |
| U2 | **The composer covers the latest messages** once it grows (multiple lines, or the impersonate/silent/speaker banners). | The composer floats (`absolute bottom-6`, `src/pages/ChatPage.tsx:1255`) over a message list with a fixed `pb-32` (`src/components/organisms/ChatWindow.tsx:436`). | Measure the composer with a `ResizeObserver` and set the list's bottom padding from it, or dock the composer in the layout instead of floating it over the list. Keep the view pinned to the bottom when it grows. | M |
| U3 | **The phone composer is unusable.** Four icon buttons plus Send leave the text box about 40px wide, so text wraps one letter per line over the context bar. | All tools sit inline at every width. | On phones, put image/impersonate/silent/settings behind one "+" button (or a row that appears while typing), make Send icon-only, and let the text box take the full width. | M |
| U4 | **At tablet width the sidebar crowds the chat.** At 768px the 300px sidebar is always open; the header title shrinks to "A..", nine header icons are crammed together, and the message menu (⋮) sits on top of the message text. | The sidebar's "always docked" breakpoint is `md` (768px), and the header's icon row only collapses below `md`. | Dock the sidebar from `lg` (1024px) up and use the drawer below that. Collapse header actions into the "more" menu by available space, not a fixed breakpoint. Reserve space for the bubble menu instead of overlaying it. | M |
| U5 | **The mobile drawer stays open after navigating** with back/forward or a link outside the sidebar, and it covers the new page. | It only closes from its own link handlers. | Close it on every route change (`useLocation` effect). | S |
| U6 | **Viewport height is wrong on phones.** `h-screen` (`100vh`) is used in 15 files, including the app shell and the chat page. On iOS Safari and Android Chrome, `100vh` includes the area behind the browser toolbars, so the bottom of the page (the composer) can sit under them, and the keyboard covers the input. | `h-screen` in `src/App.tsx`, `src/pages/ChatPage.tsx` and 13 other files. | Switch to `h-dvh` (with a `100vh` fallback), and add `env(safe-area-inset-bottom)` padding under the composer. The viewport meta already asks the keyboard to resize the layout, so `dvh` lets that take effect. Verify on the WebKit test project. | S |
| U7 | **Message bubbles waste space on phones.** Each bubble keeps an empty strip at the bottom for hover-only actions, and the ⋮ and trash icons are always visible. | Desktop hover layout reused on touch. | On touch devices, hide inline actions and show them on long-press (as an action sheet: copy, edit, regenerate, continue, delete). Drop the reserved strip. | M |
| U8 | **The floating "scroll to bottom" button and toasts collide with the composer.** The button is `fixed bottom-24 right-6` (`ChatWindow.tsx:544`) and toasts are bottom-right (`src/App.tsx:250`); both overlap a tall composer and the phone Send button. | Fixed offsets that don't know the composer's height. | Anchor both above the measured composer height (shares the U2 measurement); show toasts at the top on phones. | S |
| U9 | **The wizard step bars scroll sideways on phones** (character editor and adventure wizard), with later steps cut off at the edge and no sign there are more. | Every step label is shown at every width. | On phones, show "Step 2 of 6 · Personality" with a progress bar instead of the full row. | S |

Suggested order: T1 and T2, then U1–U3 (the composer) with their T3 checks, then U4–U6, then U7–U9, then T4–T7.

---

## Phase 1: Memory and continuity

Long roleplays mostly fall apart on continuity, so this phase gives the most back.

1. **Memory scope per chat** (M). Memory is stored on the character today, so a "what-if" chat started from an alternate greeting leaks facts into your main story with that character. Add a per-chat choice: *shared with this character* (current behavior) or *this chat only*. Rooms already keep their own memory, so this reuses that path.
2. **Relevant memory instead of all memory** (M). Every fact goes into every prompt, and the cap is 40. Score facts by keyword overlap with recent messages plus recency, send the top N plus pinned facts, and raise the cap a lot (200+). This is the same idea the lorebook already uses.
3. **Fact categories** (S). Tag facts as *about you*, *relationship* or *story*. Show them grouped in the Scene panel, and let the extractor pick the category.
4. **Chapters** (M). Add an "End chapter" action that writes a titled summary ("Ch. 3: The masquerade") and starts a fresh context. A "Story so far" view lists the chapters. Builds on B5.
5. **Character diary** (M). Every so often, in the background, the character writes a short first-person diary entry about recent events and how it feels about you. You can read it from the character page. It's fun on its own and doubles as rich, in-voice memory.

---

## Phase 2: Immersion in 1:1 chats

The app is called WhatsGemini, so lean into the messaging-app fantasy.

6. **Texting mode** (M). Optionally split a reply into several bubbles (by paragraph or line) and reveal them one at a time with typing pauses. Add read receipts and "typing…" between bubbles. This only changes display, so the stored message stays whole.
7. **Character schedule and presence** (M). Give each character a simple daily routine (asleep 1–8, work 9–5, …). The header shows "online" or "last seen", follow-ups mention what they're doing ("just got off my shift"), and an optional "realistic" setting delays replies while they're "busy". This uses the existing time awareness.
8. **Status updates** (M). Like WhatsApp Status: now and then a character posts a short status with an optional generated picture, based on their schedule and recent events. It shows as a ring on their avatar in the sidebar, and replying to a status opens the chat quoting it.
9. **Scene state HUD** (M). Next to the emotion tag, the model reports a small hidden state block: location, time of day, outfit, and a relationship meter (affection/trust). Show it as a compact strip under the header and feed it back each turn so details stay consistent. It's parsed and stripped the same way the emotion tag is.
10. **Inner thoughts** (S). Optionally the character also writes a hidden `<thoughts>` line. It renders as a tap-to-reveal spoiler and is kept out of what the model thinks it said aloud.
11. **Reactions** (S). Long-press a message to react with an emoji. The character sees it ("[reacted ❤️ to: …]") and can react back to yours using a tiny tag.
12. **Voice** (M). Per-character text-to-speech with the browser's built-in Web Speech API (free, offline, no backend), a voice picker in the character editor, and a speaker button on messages. Speech-to-text dictation in the composer. Paid TTS (OpenAI/ElevenLabs) can come later through the provider registry.
13. **Chat backdrops** (S). Generate or upload a background image for a chat from its setting tags or scenario, shown subtly behind the bubbles.

---

## Phase 3: Narrative tools

14. **Slash commands** (M) in the composer:
    - `/roll 2d6+1`: real dice, with the result shown as a chip and handed to the model as an out-of-character fact so it can't fudge the roll.
    - `/timeskip 3 hours`: a scene-break divider plus a directive.
    - `/scene the rooftop at night`: moves the scene (a divider, and the scenario is updated).
    - `/narrate …`: a narrator line that is neither you nor the character.
    - `/ooc …`, `/image …`, `/summarize`.
15. **Write my reply** (S). One button drafts your next message in your persona's voice, for you to edit before sending. This is the generative version of Impersonate.
16. **Reply suggestions** (S, optional toggle). Three short tappable reply ideas under the latest message, like adventure choices but for chats.
17. **Author's note presets** (S). One-tap chips: *slow burn*, *more dialogue*, *more description*, *faster pace*, *raise the stakes*, *lighthearted*. They fill the author's note with tested wording.
18. **"Surprise me"** (S). Inject a one-turn directive for an unexpected but fitting plot event, so you don't have to write it yourself.
19. **Anti-repetition guard** (M). Long roleplays drift into repeated phrases and openings. Detect n-grams the last few replies keep reusing and add a one-turn "avoid these phrases" directive. Optionally show a small indicator when it kicks in.
20. **Readable story export** (S). Export a chat as formatted Markdown or HTML (names, images, scene breaks) to reread or share. The current export is raw JSON, which is only good for backups.
21. **Bookmarks** (S). Star key moments and jump to them from the Scene panel.

---

## Phase 4: Group chats

22. **More than one reply per message** (M). Today exactly one character answers each message. Add a "natural" turn mode: a cheap helper call reads the last exchange and picks who would naturally respond (possibly two in a row, possibly nobody). The mode can be *round-robin*, *natural* or *everyone*, with a cap on how long a chain can run.
23. **Built-in narrator member** (S). A toggleable narrator in rooms that describes the scene between characters' lines.
24. **Character-to-character relationships** (M). Per-room notes like "Aria resents Kai". Each speaker sees only its own relationships, so friction in the group is written in.

---

## Phase 5: Adventures as games

25. **Stats, inventory and quest log** (L). The narrator keeps a structured state block (HP, gold, items, active quests), parsed like the choices block and shown in a side panel. The player can't type items into existence because the state is authoritative.
26. **Skill checks** (M). Choices can carry a difficulty ("Pick the lock (DC 14)"). The app rolls the dice, shows the result, and tells the narrator success or failure before it writes.
27. **Persona character sheet** (M). Optional stats and skills on a persona, used by checks.
28. **Attach a World to normal chats** (S). Worlds are adventure-only today. Let a 1:1 chat or room attach a World so its lore and premise apply there too.

---

## Phase 6: Characters and lore

29. **Better lorebook triggers** (M): per-entry priority, secondary keys (fire only when both match), "sticky for N messages" after triggering, a per-entry scan depth, and an optional trigger chance. These map to fields SillyTavern cards already carry, so imported cards behave as their authors meant.
30. **Relationship that evolves** (S). Periodically suggest an update to the character's "relationship" field from what's happened ("strangers" → "reluctant allies"). You approve each change; nothing is rewritten automatically.

---

## Phase 7: Tuning and quality

31. **Prompt inspector** (S). "Show what was sent" on any reply: system prompt sections, matched lore, memory, author's note, and token counts per section. This is the best tool there is for making characters behave.
32. **Model and sampler per character** (M). A character can pin its own model, temperature or preset, for example a creative model for one character and a cheaper one for others.
33. **Context meter that matches reality** (S). The pre-send token estimate ignores room context. Build it with the same room context that is actually sent.

---

## Recommended first batch after Phase 0

If you'd rather not go phase by phase, these give the most roleplay value per hour:
**#2 Relevant memory**, **#14 Slash commands (dice + timeskip)**, **#15 Write my reply**, **#31 Prompt inspector**, **#6 Texting mode**, **#22 Natural group turns**.
