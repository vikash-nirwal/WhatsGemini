# Progress

Where the [ROADMAP.md](ROADMAP.md) work stands. ROADMAP.md says *what* and *why* for each remaining item; this file says what's done, how the work runs, and what a new session needs to know. Update it at the end of every session that changes anything (see CLAUDE.md). Commit-level detail lives in the git history.

Status values: `todo`, `in progress`, `done`, `skipped` (with a reason), `blocked` (with what it's waiting on).

## Where we stand

- **State:** image consistency (#34–#41) is merged, pushed and deployed. Texting mode (#6), inner thoughts (#10) and reactions (#11) are pushed and deployed too. The spending dashboard (#42), notifications (#43), voice (#12), voice notes (#44) and character from one line (#45) are committed to local `main`, not pushed. The last full local run passed: type-check, 624 unit tests, 417 UI tests and 16 screenshot tests.
- **Next up:** the new ideas #46–#56 (#42–#45 and #12 are done), one per fresh session in table order, then the other 12 items. The image providers were only tested against mocked servers; checking them with real keys and a real ComfyUI is a follow-up in ROADMAP.md.
- **Open questions for the user:** none.
- **How this run works:** each item gets its own fresh session in this checkout (no worktree), committing to local `main` when its tests pass; nothing is pushed or deployed until the user says so.

## Remaining items

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7 | Character schedule and presence | todo | |
| 8 | Status updates | todo | Builds on #7. |
| 9 | Scene state HUD | todo | |
| 13 | Chat backdrops | todo | |
| 19 | Anti-repetition guard | todo | |
| 22 | More than one reply per message | todo | |
| 23 | Built-in narrator member | todo | |
| 24 | Character-to-character relationships | todo | |
| 25 | Stats, inventory and quest log | todo | |
| 26 | Skill checks | todo | After #25. |
| 27 | Persona character sheet | todo | With #26. |
| 28 | Attach a World to normal chats | todo | |
| 30 | Relationship that evolves | todo | |
| 46 | "Previously on…" | todo | New ideas continue here; built one per session, in order. |
| 57 | Story script | todo | Right after #46. |
| 47 | Dates that matter | todo | |
| 48 | Send them a photo | todo | |
| 49 | Event deck | todo | |
| 50 | Wardrobe | todo | |
| 51 | Relationship timeline | todo | |
| 52 | Mini-games | todo | |
| 53 | Branch map | todo | |
| 54 | Backup to Google Drive | todo | Needs the user's Google OAuth client ID to test. |
| 55 | Free local model in the browser | todo | Adds the WebLLM dependency. |
| 56 | Phone calls | todo | Builds on #12 and #44 (`src/features/voice/`). |

Smaller follow-ups are listed at the end of ROADMAP.md.

## How the work runs

- Work goes in **waves**. Within a lane, items run one after another without stopping, except for a decision, a failing test that can't be fixed, or a merge.
- Lanes run in parallel only when they touch **different files**. Agree each lane's files at the start of the wave. These shared files have one writer per wave: `ChatPage.tsx`, `ChatWindow.tsx`, `ChatMessage.tsx`, `MessageInput.tsx`, `promptComposition.ts`, `aiSlice.ts`, `chatSlice.ts`, `package.json`. `src/types/index.ts` may be shared if each lane only adds optional fields to its own interfaces.
- Parallel lanes work in their own worktree and branch, run UI tests on their own port (`E2E_PORT=3100`, `3200`, …) and **don't edit PROGRESS.md**. The coordinating session records them and wires in anything that needs its files.
- Before merging, check all lanes combined in a throwaway worktree (unit, UI and visual tests). Merge and push only with the user's OK. Each wave ends with a PROGRESS.md update and a disk report.

## What's built

One line per area. Pointers for when you need to work on it again.

- **Compression** never deletes: the summary pair is spliced into the conversation tree after the last covered message (`spliceSummaryIntoConversation`), and prompts send the seed plus the newest summary onward (`trimToLatestSummary` in `buildTurnContext`). The seed and summary are protected from truncation (`countProtectedPrefix`).
- **Memory:** extraction can add, update (`UPDATE n:`), forget and reconfirm facts. The list is kept in recency order with a cap of 200, and each prompt gets pinned facts plus the 30 most relevant (`memoryRelevance.ts`). Facts are categorized (`memoryCategories`, keyed by fact text). A chat can keep its own memory (`Chat.memoryScope`).
- **Chapters** ("End chapter") are titled summaries with a recap (`Message.chapterTitle`/`chapterRecap`). **Diary:** per-character switch, an entry every 30 messages from memory-sharing 1:1 chats only, latest entry in the prompt.
- **Narrative tools:** Write my reply, Surprise me, author's note presets, reply suggestions (`narrativeTools.ts`); slash commands including real dice and narration lines (`slashCommands.ts`, `Message.isNarration`); story export to Markdown (`storyExport.ts`); bookmarks (`Message.bookmarked`).
- **Lorebook:** priority, secondary keywords with any/all/none/not-all logic, sticky, scan depth and a deterministic trigger chance, mapped to SillyTavern card fields. Scan depth above 10 and sticky need `buildTurnContext` to pass the full history since the last summary, so don't cut it to the last 10 messages.
- **Models:** each character can pin its provider, model, temperature and samplers (`Character.modelOverride`, `resolveTurnModel`). The prompt inspector shows exactly what was sent for any reply (`requestLog.ts`, in memory only, last 20).
- **Adventures** stream, compress, follow the cast's content rating and the roleplay style, and have per-adventure hard limits.
- **Layout and mobile:** the composer grows with the text and collapses its tools behind "+" on phones; touch screens get a long-press action sheet; side panels are a sheet, an overlay or a column depending on width; `h-dvh` everywhere; toasts at the top.
- **Accessibility:** every theme meets WCAG AA contrast. The axe baseline is empty, so any violation fails the scan.
- **Consistent looks:** each character's locked look (`Character.visualTags`, drafted from the appearance) is forced into every image prompt word for word (`appearanceLock.ts`: tags for SD, "Name: …" sentences otherwise), in chat, portraits and adventure scenes. The first reference photo is the main one; "Generate reference sheet" makes front, three-quarter and side portraits.
- **Reference photos per provider:** Wan uses a separate reference model (`wan_reference_model`, default wan2.7-image, which retries once if wan2.5-i2i-preview rejects a request), OpenAI GPT image models use `/v1/images/edits`, fal.ai (`falImageAdapter.ts`) runs Seedream / FLUX Kontext / PuLID and uploads photos to fal's storage. Shared helpers are in `referenceImages.ts`.
- **ComfyUI** (`comfyuiAdapter.ts`, `src/features/ai/comfyui/`, `ComfyUISettings.tsx`): bundled templates (SDXL FaceID, FLUX Kontext GGUF, txt2img, ReActor) or an imported workflow; settings in localStorage `comfyui_settings`. Needs ComfyUI started with `--enable-cors-header`.
- **Per-character local settings** (`Character.localImageSettings`, `localImageSettings.ts`): seed, LoRA, trigger word, reference mode and ReActor face model, applied in `generateSDImage` and the ComfyUI adapter (where the mode picks the template). The SD WebUI ControlNet gets the preprocessor that matches its model (`controlnetModuleFor`), with FaceID presets in Settings.
- **Messaging feel:** texting mode (`settings.textingMode`, `textingMode.ts`) splits a reply into texts by paragraph or line and reveals a new one text by text in ChatWindow (`reveal` state), with read ticks on your messages; display only. Inner thoughts (`Character.innerThoughts`, switch in the Scene panel) and reactions (`Message.reaction` from you, `Message.characterReaction` from the character, `roleplayStyle.characterReactions`) are control tags parsed in `messageTags.ts`, like the emotion tag; reactions reach the model as a note before your next message (`buildChatHistory`).
- **Spending (#42):** `src/features/spending/spending.ts` keeps a ledger per month and provider plus the monthly limit, in localStorage (`spending_ledger`, `spending_budget`, `spending_warned`) so the budget check can read it synchronously; it goes out with the settings export and full backup and is merged (larger entry wins) on import. `spendingAdapters.ts` wraps every chat, image and video adapter in `registry.ts` (outside `withRequestLog`), so every paid call is checked and recorded with no caller involved; streamed replies without usage are estimated from text length, pictures and videos without usage use `FLAT_IMAGE_PRICING`/`FLAT_VIDEO_PRICING` in `constants.ts`. Ollama, SD WebUI and ComfyUI are never recorded or blocked. UI: Settings › Spending (`SpendingSettings.tsx`); toasts at 80% and 100% and on a blocked call come from `SpendingAlerts.tsx`, mounted in `App.tsx`. Per-chat `totalCostEstimate` is unchanged and doesn't include the flat picture prices.
- **Notifications (#43):** `src/features/notifications/notifications.ts` decides what to show (`buildNotificationContent`: generic "New message" with the app lock on, or for NSFW chats in discreet mode; no portrait for NSFW chats with blurred media) and shows it only when the switch is on, permission is granted and the tab is hidden, through the service worker's `showNotification` when one is active, else `new Notification`. The switch is localStorage `notifications_enabled` (not exported: the permission is per browser), in Settings › Chat (`NotificationSettings.tsx`). ChatPage calls `useChatNotifier` after saving a reply or a follow-up; clicks route through `useNotificationClicks` (App.tsx) and the worker's `notificationclick` (`service-worker.ts`).
- **Voice (#12) and voice notes (#44):** `src/features/voice/`: `speech.ts` (browser `speechSynthesis`: `toSpokenText` drops *actions*, control tags and the image-context tag; speech is queued in sentence pieces under 200 characters for Chrome's cut-off; one app-wide "what's speaking" store keyed by message id, read with `useSpeakingFor`), `recognition.ts` (`SpeechRecognition`/`webkitSpeechRecognition`, continuous with interim results), `voiceNotes.ts` (the roll, `fitsVoiceNote`, the "(voice note)" mark). Voice settings are `Character.voice` (voice URI plus name and language for fallback on other devices, rate, pitch, `voiceNotes` off/sometimes/often), edited in `CharacterEditorPage/VoiceSection.tsx`. "Read aloud" is in ChatMessage's hover footer, long-press sheet and the terminal row. ChatPage rolls a voice note before each reply (shows "recording audio..."), keeps it only if the reply fits (≤600 spoken characters, no media, no refusal) and stores `Message.isVoiceNote`; `VoiceNote.tsx` plays it at play time. The composer has Dictate (a tool) and a hold-to-record button (empty draft only; Space/Enter held works too; letting go far away cancels); your voice notes reach the model as "(voice note) …" through `promptTextFor` in `buildChatHistory` and the prompt. Nothing voice-related shows where an API is missing (Firefox has no recognition). Playwright's Chromium and WebKit both have recognition on localhost, so the composer's record button shows in every project. `e2e/voice.spec.ts` has the speech fakes.
- **Character from one line (#45):** `src/features/character/characterDraft.ts` builds the one-call prompt (`buildCharacterDraftPrompt`: SFW unless NSFW is picked, confirmed 18+ and the idea has no minor indicators, per `draftAllowsNsfw`; art style; "Try another" names the previous draft to avoid) and parses the JSON reply defensively (`parseCharacterDraft`: fences, chatter, trailing commas, raw newlines, other key spellings, wrong types; name and personality required, else `CharacterDraftError`). It runs through `generateAssistText({ background: true })`, so the helper model when one is set. UI: `CharacterEditorPage/IdeaDraftSection.tsx` (a card on step 1 of a new character plus the idea dialog; Try another, Change idea, and Generate portrait only when the image provider is usable); the gallery's empty state opens it with `state.fromIdea`. The draft only fills the editor's fields; saving is the usual Create Character. `addCharacter` now keeps every field (it used to drop greetings, rating, locked look, voice and model on create and import).
- **Known gaps:** character drafts were only tested with a mocked model, not a real one's JSON; none of the image providers was tried with a real key or a real ComfyUI; chats whose seed messages were never flagged `isSystem` (very old ones) aren't detected as seeded; mood-portrait generation from inside a chat wasn't checked with a real image provider; `h-dvh` wasn't checked on a real iPhone; notifications weren't tried on a real device or in the installed app.

## Decisions

Choices a later session shouldn't revisit. Add the date.

- 2026-10-20: Layout is tested with Playwright in real browsers; Jest/jsdom is for logic and component behavior only, since jsdom can't measure layout.
- 2026-10-20: Image providers are limited to ones the user can sign up for from India, or local: Wan, OpenAI, fal.ai (Seedream 4, FLUX Kontext), BFL, SD WebUI, ComfyUI. Not Gemini image models (cost) and not Qwen's own API (rejects Indian phone numbers).
- 2026-10-20: Compression is non-destructive (summaries are inserted, never replace messages).
- 2026-10-20: Screenshot tests are macOS-local (`@visual`); CI leaves them out because Linux fonts differ.

## Working notes

Facts that save the next session time.

- **Fake image providers in UI tests:** `e2e/image-references.spec.ts` mocks fal.ai, OpenAI, Wan and ComfyUI with `page.route`; `e2e/comfyui.ts` has a ComfyUI mock and a harness that runs the adapter's source in a browser. `openRoute` seeds the database again, so patch IndexedDB after opening a route and then reload.
- **Run the app:** `.claude/launch.json` has a `web` config (`npm start`, port 3000) for the browser pane.
- **Get past the login and 18+ gate without a key:** set localStorage `age_confirmed_18 = "true"` and `chat_provider = "ollama"` (a keyless provider), then reload.
- **Fake the AI in the browser pane:** with `chat_provider = "ollama"`, override `window.fetch` in the page for URLs containing `/chat/completions`: return SSE (`data: {"choices":[{"delta":{"content":"…"}}]}` then `data: [DONE]`) when the body has `stream: true`, otherwise JSON `{choices:[{message:{content}}]}`. The override is lost on reload. Prefer the Playwright fixtures for anything repeatable.
- **Browser pane caveat:** parallel sessions can share the pane's localhost:3000 storage. For layout checks, prefer Playwright, which uses its own isolated browser; a throwaway spec calling `page.screenshot` works well.
- **Seed test data:** IndexedDB database `ChatAppDB`, tables `chats`, `characters`, `worlds`, `adventures`, `settings`. Message roles are `"you"` and `"ai"`.
- **UI tests:** `npm run test:e2e` (it reuses a dev server already on port 3000, so make sure that's this checkout's). From another worktree: `E2E_PORT=3100 npx playwright test`. Use role/aria-label selectors and the geometry helpers in `e2e/layout.ts`; `e2e/fixtures.ts` seeds data and mocks the AI.
- **Visual tests:** `npm run test:visual` (refresh with `test:visual:update`). Baselines are macOS renders in `e2e/visual.spec.ts-snapshots/`; review the PNG diffs before updating them.
- **CI on GitHub:** `.github/workflows/ci.yml` runs on every push. Step logs need a signed-in account, but Playwright's `github` reporter puts each failure in the run's annotations, readable without signing in: `GET /repos/vikash-nirwal/WhatsGemini/check-runs/<job id>/annotations`. Unauthenticated API calls are limited to 60 an hour, so poll sparsely.
- **Parallel lanes from proposed session cards** don't keep the source branch, so a lane's brief should tell it to bring in the current branch first (`git merge --ff-only refs/heads/<branch>`, or reset to it while the lane branch is still empty).
- **Notifications in Playwright:** grant with `permissions: ["notifications"]`, but read it through `navigator.permissions.query`: the headless Chromium shell reports `Notification.permission` as "denied" and WebKit as "default" even after a grant. Mobile WebKit (the iphone project) has no Notification API at all. `e2e/notifications.spec.ts` has the fakes (hidden tab, recorded notifications).
- **Lockfiles:** both `package-lock.json` and `yarn.lock` exist. Use npm.

## Session log

Newest first. One or two lines per session.

- 2026-10-20: Built character from one line (#45): idea dialog with rating and art-style hints, one JSON draft filling the editor, Try another, optional portrait. Fixed `addCharacter` dropping newer fields (alternate greetings, content rating, locked look, voice, model) when creating or importing a character.
- 2026-10-20: Built voice (#12) and voice notes (#44) together: per-character browser voices with a picker and preview, Read aloud, dictation, character voice notes decided by the app, and hold-to-record. The terminal theme's Pixel chat screenshot changed on purpose (the new `[say]` action wraps each reply's action row, plus the `[●]` record link) and its baseline was updated; the other chat screenshots gained the mic buttons within their 1% tolerance and were left as they were.

- 2026-10-20: Built notifications (#43): Settings switch, privacy-aware content, service worker or page notification, click opens the chat. The iphone UI project only checks the Settings explanation, since mobile WebKit has no Notification API.
- 2026-10-20: Built the spending dashboard and monthly limit (#42): ledger in localStorage, adapter wrappers in the registry, Settings › Spending, warning or hard stop. Added the Spending page to the axe scan in every theme.
- 2026-10-20: Pushed and deployed image consistency. Built texting mode (#6), inner thoughts (#10) and reactions (#11) here, one after another: all three change `ChatMessage.tsx`.
- 2026-10-20: Image consistency: built #34, #35, #40 and #41 here; Lane B built #36–#38 (spike: fal.ai is callable from a browser, Wan's Singapore region takes image-only input for wan2.5-i2i-preview), Lane C built #39. Merged into local `main` after a combined check.
- 2026-10-20: Planned consistent character faces in images (#34–#41) for providers usable from India and local generation; nothing built yet.
- 2026-10-20: Reviewed the app and wrote the roadmap; then, in four waves of parallel lanes, fixed the 7 logic bugs and 12 layout/mobile bugs, added Playwright UI, flow, accessibility and screenshot tests plus CI, and built 16 features (memory #1–#5, narrative tools #14–#18, #20, #21, lorebook #29, inspector #31, per-character model #32, context meter #33). Merged into `main`, pushed, CI green. Cleaned up the docs.
