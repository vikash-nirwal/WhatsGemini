# Progress

Where the [ROADMAP.md](ROADMAP.md) work stands. ROADMAP.md says *what* and *why* for each item; this file says *what's done*. Update it at the end of every session that changes anything (see CLAUDE.md).

Status values: `todo`, `in progress`, `done`, `skipped` (with a reason), `blocked` (with what it's waiting on).

## Where we stand

- **Current phase:** Waves 1–3 are done and merged on branch `phase-0-bug-fixes` (not pushed, no PR yet). Wave 3 merges: e30b673 (Lane B), 70ee9c8 (Lane C).
- **Next up:** Wave 4 is running: composer and narrative tools + #33 here; #31/#32 and A2/A3 in parallel sessions.
- **Open questions for the user:** none. (They chose to start Wave 3 before pushing; nothing is pushed yet.)

## Execution plan

Items run one after another within a lane, without stopping between items; a lane only pauses for a decision, a failing test it can't fix, or a merge. Lanes run in parallel only when they touch **different files**. These shared files have one writer at a time: `src/types/index.ts`, `ChatPage.tsx`, `ChatWindow.tsx`, `ChatMessage.tsx`, `MessageInput.tsx`, `promptComposition.ts`, `aiSlice.ts`, `chatSlice.ts`, `package.json`.

Parallel lanes work in their own worktree and branch and **don't edit PROGRESS.md**. They report in their commit messages and final summary, and the coordinating session (the one on `phase-0-bug-fixes`) records them here when merging. Branches are merged only with the user's OK.

**Wave 1 (now)**
- **Lane A** (coordinating session, branch `phase-0-bug-fixes`): B5, then B6. Files: chat/compression code, `ChatPage`, `ChatWindow`, `ChatMessage`, `chatSlice`, `aiSlice`, `transcript`/`chatHistoryUtils`, `AdventurePage`, `adventurePrompt`, `adventureSlice`, `types`. Stays out of `AdventureWizardPage`.
- **Lane B** (parallel session, own worktree): T1, T2, T7, then U5, U9, and the sidebar/header half of U4, each with its T3 check. Files: Playwright config, `e2e/`, `package.json`, `.github/`, `Sidebar.tsx`, `Header.tsx`, `CharacterEditorPage.tsx`, `AdventureWizardPage.tsx`.

**Wave 2** (after Wave 1 is merged)
- **Lane A:** U1, U2, U3, U6, U7, U8 and the message-bubble half of U4. They all touch the composer and chat layout, so they go in one lane, each with its T3 check.
- **Lane B:** T4 (flows) and T6 (accessibility); test files only.
- Then T5 (screenshots), once the layout fixes have landed.

**Wave 3 (done)**
- **Lane A** (coordinating session, branch `phase-0-bug-fixes`): memory, #2, #3, #1, #4, #5 in that order. Owns: `memoryExtraction.ts`, `promptComposition.ts`, `transcript.ts`, `chatHistoryUtils.ts`, `aiSlice.ts`, `chatSlice.ts`, `characterSlice.ts`, `ChatPage.tsx`, `ChatWindow.tsx`, `ChatMessage.tsx`, `ScenePanel.tsx`, `CharacterPage.tsx`, `constants.ts`.
- **Lane B** (parallel session): #29 lorebook triggers. Owns: `loreUtils.ts`, `LorebookStep.tsx`, `characterCard.ts`, `importCustomize.ts`, `ImportReviewDialog.tsx`, `WorldEditorPage.tsx`, `worldSlice.ts` and their tests.
- **Lane C** (parallel session): U10 and A1. Owns: `MessageInput.tsx`, `src/styles/` and `src/index.css`, `CharacterEditorPage.tsx` and its step files except `LorebookStep.tsx`, `e2e/a11y-baseline.json` and the visual baselines.
- **Shared-file exception:** `src/types/index.ts` may be edited by several lanes, each only adding optional fields to the interfaces its items need (Lane B: `LoreEntry`; Lane A: `Chat`, `Character`, `Message`). Conflicts there get resolved at merge.
- Parallel lanes run UI tests on their own ports: Lane B `E2E_PORT=3100`, Lane C `E2E_PORT=3200`.

**Wave 4 (now)**
- **Lane A** (coordinating session, branch `phase-0-bug-fixes`): #15, #18, #17, #16, #14, #20, #21, #33. Owns: `ChatPage.tsx`, `aiSlice.ts`, `MessageInput.tsx`, `ChatWindow.tsx`, `ChatMessage.tsx`, `ScenePanel.tsx`, `promptComposition.ts`, `transcript.ts`, `chatHistoryUtils.ts`, `chatSlice.ts`, `constants.ts`, and new files under `src/features/ai/utils/` and `src/features/chat/`.
- **Lane B** (parallel session): #31 prompt inspector and #32 per-character model. Owns: `src/features/ai/providers/*` (adapters, registry, sse, types), new `src/features/ai/requestLog.ts`, new `src/features/ai/modelResolution.ts`, a new inspector dialog component, `CharacterEditorPage.tsx` and its step files, `settingsSlice.ts`, `TextModelSettings.tsx`. It doesn't touch Lane A's files: wiring into `aiSlice.ts` / `ChatPage.tsx` (passing the character's model to `generateAIResponse`, the "Show what was sent" entry point) is done by Lane A at merge time, from the integration notes Lane B's report gives.
- **Lane C** (parallel session): A2 and A3. Owns: `src/components/molecules/form-controls/ModeToggleButton.tsx`, `ChipSelectField.tsx`, `e2e/a11y.spec.ts`, `e2e/a11y-baseline.json`.
- `src/types/index.ts`: Lane A may add `Message`/`Chat` fields, Lane B only `Character.modelOverride` (or similar). Ports: Lane B `E2E_PORT=3100`, Lane C `E2E_PORT=3200`.

**Later:** immersion (#6–#13), group chats (#22–#24), adventures (#25–#28), #30.

Each wave ends with: merge (user's OK), full unit + UI test run, PROGRESS.md update, disk report.

## Phase 0: Logic bugs

| # | Item | Status | Commit | Notes |
|---|------|--------|--------|-------|
| B1 | Mood portrait wipes custom emotions | done | 5e1176c | Not checked in the app (needs an image provider); the fix is a one-line spread. |
| B2 | Group-chat impersonate posts as first character | done | 5e1176c | Checked in the app: picked Kai, impersonated, stored `speakerId` was Kai. The composer banner names the picked speaker. |
| B3 | Compression/truncation use the global seed count | done | 5e1176c | `countSeedMessages` / `countProtectedPrefix` in `transcript.ts`; `truncateHistory` moved there and now also protects the compression summary. Tests in `transcript.test.ts`. Legacy chats whose seed messages were never flagged `isSystem` aren't detected (only the display filter in ChatWindow handles those). |
| B4 | Memory can't update or forget facts | done | 9ddde30 | Extractor replies with `- fact`, `UPDATE n: …`, `FORGET n`, `STILL TRUE: n, m` against a numbered list; pinned facts are shown separately and can't be touched. The list is kept in recency order, so the 40 cap evicts facts not mentioned for longest. Also fixed: the memory write re-reads the character first, so it no longer undoes a same-turn gallery write. Tests in `memoryExtraction.test.ts`; checked end to end in the app with a faked Ollama endpoint. |
| B5 | Compression destroys branches and history | done | b6dda41 | The summary pair is spliced into the tree after the last covered message (`insertAfterNode`, `spliceSummaryIntoConversation`); prompts use `trimToLatestSummary` inside `buildTurnContext`. Summarized messages show dimmed. Manual compress no longer eats the seed. Rewind skips summaries. Edit-and-resend now auto-compresses (B7 leftover). Checked in the app: 38 → 42 nodes, a 2-variant branch kept, 13 of 41 messages sent. Not done: an "undo compression" button (easy now; nothing is deleted). |
| B6 | Adventures skip the chat pipeline | done | 4edcbbd | Streaming, auto-compression, cast content rule, OOC/asterisks/custom style rules, hard limits (Boundaries dialog on the adventure page). `AdventureRules.safetySettings` removed (nothing set or read it). Not done: adventure long-term memory (the summary carries continuity for now; fits Phase 1); hard limits aren't in the creation wizard yet (`AdventureWizardPage` belongs to Lane B in Wave 1). Checked in the app with a faked AI. |
| B7 | Edit-and-resend drops image prompt, skips compression | done (partly) | 5e1176c | Image prompt/params kept. Auto-compression on this path moved to B5, because today's compression would delete the branch the edit just made. |

## Phase 0.5: UI tests and layout fixes

| # | Item | Status | Commit | Notes |
|---|------|--------|--------|-------|
| T1 | Playwright setup, 4 viewport projects | done | b93caf6 | `npm run test:e2e`. Projects: desktop 1280×800, tablet 768×1024, iPhone 14 (WebKit), Pixel 7. Served under `/WhatsGemini/` (the `homepage` path). `E2E_PORT` runs it from a second checkout without reusing another checkout's dev server. |
| T2 | Seed fixtures and mocked AI replies | done | 0d40c5d | `e2e/fixtures.ts` seeds IndexedDB/localStorage and mocks `**/chat/completions`; `e2e/layout.ts` has geometry helpers. |
| T3 | Layout geometry checks | done | 008aea9, 5d11cc1 | Wave 1 specs plus `e2e/composer.spec.ts` and `e2e/message-actions.spec.ts`. |
| T4 | Flow tests | done | 2cb1ce6, 5c0d2fe | 8 flows: create character, chat, regenerate + swipe, edit, continue, invite into group, adventure choice, card import. Message-action flows skip phone projects (the long-press path is covered by `message-actions.spec.ts`). |
| T5 | Screenshot tests | done | 6e79cc2 | 16 baselines (chat × 6 themes × desktop/Pixel, gallery × 4 sizes). Tagged `@visual`: `npm run test:visual` locally; `test:e2e` and CI leave them out (macOS-only baselines). |
| T6 | Accessibility scan | done | 8af8422 | `e2e/a11y.spec.ts` + `e2e/a11y-baseline.json`; only violations missing from the baseline fail. Baseline: color-contrast 49 (8 pages), button-name 4 (character editor), target-size 2 (character editor). It caught a regression from U7 (message list not focusable on touch), fixed in 91bbe8f. |
| T7 | GitHub Actions CI | done | 2ddc302 | `.github/workflows/ci.yml`. Not run on GitHub yet (nothing pushed). |
| U1 | Multi-line input overflows composer | done | 008aea9 | `min-h-14`, `items-end`, `rounded-[28px]`. |
| U2 | Composer covers latest messages | done | 008aea9, 5d11cc1 | ChatPage measures the composer (ResizeObserver) and passes `bottomInset` to ChatWindow. The list also sticks to the bottom when its content grows (fonts/images loading late on WebKit). |
| U3 | Phone composer too narrow | done | 008aea9 | Below 640px the tools sit behind "Composer options" (`menuitemcheckbox` items, same aria-labels); Send/Stop are icon-only. |
| U4 | Sidebar crowds chat at tablet width | done | 7e7bd7f, 5d11cc1 | Sidebar docks from `lg` (1024px). User bubbles lost the ⋮ menu that sat on the text and use a footer row like AI replies. |
| U5 | Mobile drawer stays open after navigating | done | 3a9c02b | Closes on every route change. `e2e/drawer.spec.ts`. |
| U6 | `100vh` wrong on phones | done | 008aea9 | `h-dvh`/`min-h-dvh` in all 16 files, and a safe-area gap under the composer. Not checked on a real iPhone. |
| U7 | Bubbles waste space on touch | done | 5d11cc1 | Touch screens: hover rows hidden; long-press or contextmenu opens a bottom sheet (`role=menu` "Message actions"). |
| U8 | Scroll button and toasts collide with composer | done | 008aea9 | Scroll button anchored above `bottomInset`; toasts at top-center below 640px. |
| U9 | Wizard step bars scroll sideways on phones | done | d6ae19e | New `WizardSteps` component: compact "Step n of m" when the row doesn't fit. `e2e/wizard.spec.ts`. |
| U10 | Terminal theme composer cramped on phones | done | b246776 | `[+]` menu below 640px from the shared `composerTools`. `e2e/terminal-composer.spec.ts`. |
| A1 | Fix the a11y baseline issues | done | 457a137, 3ba2842 | Contrast fixed in `tokens.css` for all 6 themes × 4 palettes × light/dark (579 failures → 0 across themes); rule documented in THEMING.md. Visual baselines refreshed. Baseline 55 → 2. Most visible change: Aurora dark buttons use near-black text. |
| A2 | Small touch targets in shared form controls | todo | | The 2 baseline entries left: "Hide suggestions" (16px, `ModeToggleButton.tsx`) and suggestion chips (19px, `ChipSelectField.tsx`); need ≥24px (e.g. `min-h-6`). S. |
| A3 | Run the a11y scan in every theme | todo | | `a11y.spec.ts` only covers cozy dark, so contrast in the other themes can regress unnoticed. S. |

## Phases 1–7: Features

All `todo`. Item numbers 1–33 match ROADMAP.md. Rows are added here when an item is started, so this file stays short.

| # | Item | Status | Commit | Notes |
|---|------|--------|--------|-------|
| 1 | Memory scope per chat | done | fc94df1 | `Chat.memoryScope` ("chat" = own memory, seeded as a copy of the character's). Scene panel switch; `PromptOptions.memoryOverride`. |
| 2 | Relevant memory, bigger cap | done | f6b5839 | Cap 40 → 200; each prompt gets pinned facts + the 30 most relevant (`memoryRelevance.ts`). |
| 3 | Fact categories | done | eeb0c04 | `memoryCategories` map (fact text → user/relationship/story), no migration. Grouped in the Scene panel. Not shown in the character editor's memory card yet (that file was Lane C's this wave). |
| 4 | Chapters | done | b2367eb | "End chapter" (chat menu) → titled summary + recap at the end of the conversation; Chapters list in the Scene panel with rename. Not in adventures yet. |
| 5 | Character diary | done | 04e8423 | Per-character switch (Scene panel); entry every 30 messages from memory-sharing 1:1 chats; latest entry in the prompt; "Read diary" on the Characters page. Rooms don't write entries yet. |
| 29 | Better lorebook triggers | done | e45e81b, 53fb864, eb0b4ba | New optional `LoreEntry` fields: priority, selective + secondaryKeywords (+ secondaryLogic any/all/none/not-all), sticky, scanDepth, probability (deterministic by entry id + message count). SillyTavern mapping: priority/insertion_order, selective, secondary_keys, extensions.selectiveLogic/sticky/scan_depth/probability (not `depth`, which is insertion position there). Advanced section in `LoreEntryAdvancedSettings.tsx`. Also fixed: the import AI-customize step dropped entry settings. Not mapped: cooldown, delay, regex keys, case-sensitivity, insertion position, groups. Sticky only applies to direct keyword hits. Scan depth > 10 and sticky rely on `buildTurnContext` passing the full history since the last summary - keep it that way. |
| U11 | Side panels squeeze the chat / cover the composer | done | 55ce89a | Found while checking #3: full-screen sheet on phones, overlay below 1280px, column from 1280px. `e2e/side-panel.spec.ts`. |

## Decisions

Choices made along the way that a later session shouldn't revisit. Add the date.

- 2026-10-20: Work happens on a branch per phase (`phase-0-bug-fixes` first), not directly on `main`.
- 2026-10-20: Layout is tested with Playwright in real browsers. Jest/jsdom stays for logic and component behavior only, since jsdom can't measure layout.

## Working notes

Facts that save the next session time.

- **Run the app:** `.claude/launch.json` has a `web` config (`npm start`, port 3000) for the browser pane.
- **Get past the login and 18+ gate without a key:** set localStorage `age_confirmed_18 = "true"` and `chat_provider = "ollama"` (a keyless provider), then reload.
- **Fake the AI in the browser pane:** with `chat_provider = "ollama"`, override `window.fetch` in the page for URLs containing `/chat/completions`: return SSE (`data: {"choices":[{"delta":{"content":"…"}}]}` then `data: [DONE]`) when the body has `stream: true`, else JSON `{choices:[{message:{content}}]}`. The override is lost on reload.
- **Seed test data:** IndexedDB database `ChatAppDB`, tables `chats`, `characters`, `worlds`, `adventures`, `settings`. Message roles are `"you"` and `"ai"` (not `user`/`model`). "Try a sample character" on the home screen creates character + chat 1.
- **Proposed session cards** don't keep `source_branch`, so a lane brief has to tell the lane to `git merge --ff-only refs/heads/phase-0-bug-fixes` (or reset to it) first.
- **Browser pane caveat:** a parallel session can share the pane's localhost:3000 storage (`chat_provider` kept flipping to `anthropic`). For checking layout, prefer Playwright, which runs in its own isolated browser; a throwaway spec that calls `page.screenshot` works well.
- **Visual tests:** `npm run test:visual` (refresh: `test:visual:update`). Baselines are macOS renders in `e2e/visual.spec.ts-snapshots/`; review the PNG diffs before updating them.
- **UI tests:** `npm run test:e2e` (reuses a dev server already on port 3000 - make sure it's this checkout's). From another worktree: `E2E_PORT=3100 npx playwright test`. Write new e2e tests with role/aria-label selectors and geometry helpers from `e2e/layout.ts`.
- **Lockfiles:** both `package-lock.json` and `yarn.lock` exist. Use npm (the scripts and README do).

## Session log

Newest first. One or two lines per session: what changed, and anything left half-done.

- 2026-10-20: Merged Wave 3 Lanes B (e30b673) and C (70ee9c8) with the user's OK, after checking all three lanes together in a throwaway worktree. On the merged branch: 310 unit, 152 UI (36 skipped by viewport) and 16 visual tests pass, both typechecks clean. Removed both worktrees. New leftovers: A2, A3.
- 2026-10-20: Wave 3 Lane A: memory #2 (f6b5839), #3 (eeb0c04), #1 (fc94df1), #4 (b2367eb), #5 (04e8423), plus U11 side-panel layout (55ce89a). 261 unit, 140 UI and 16 visual tests pass. Lanes B and C were proposed as cards (the app wouldn't start them directly) and the user started them.
- 2026-10-20: Merged Wave 2 Lane B (70ac633) with the user's OK and removed its worktree. Fixed the a11y regression it found (91bbe8f). Added T5 screenshot tests. On the merged branch: 238 unit tests, 116 UI tests (24 skipped by viewport) and 16 visual tests pass. New leftovers: U10, A1.
- 2026-10-20: Wave 2 Lane A: U1-U3, U6, U8 (008aea9) and U7 + U4 bubble half (5d11cc1). 238 unit and 62 UI tests pass (18 skipped by viewport). Started Wave 2 Lane B (T4, T6) in a parallel session. Told it about the new selectors (inline Copy/Edit/Delete on user bubbles, "Composer options" menu, long-press sheet).
- 2026-10-20: Merged Wave 1 Lane B (6612ae1) with the user's OK. On the merged branch: 238 unit tests, 32 UI tests pass (8 skipped by viewport), typecheck clean. Removed its worktree. Started Wave 2.
- 2026-10-20: Fixed B5 (non-destructive compression) and B6 (adventure pipeline). Started Lane B (UI tests) as a parallel session. 238 unit tests pass.
- 2026-10-20: Fixed B4 (memory updates, forgetting, recency-based eviction). 222 unit tests pass.
- 2026-10-20: Fixed B1, B2, B3 and B7 (image prompt part) in one commit on `phase-0-bug-fixes`. 211 unit tests pass, typecheck clean.
- 2026-10-20: With the user's OK, cleared about 760 MB: removed the merged `image-backup-2` worktree, `build/` and `node_modules/.cache/gh-pages`. The local branch `worktree-image-backup-2` still exists (merged in PR #1). The dev-server caches were kept.
- 2026-10-20: Reviewed the app; wrote ROADMAP.md (logic bugs, UI tests and layout bugs, 33 feature ideas). Added `.claude/launch.json`, this file, CLAUDE.md and `scripts/disk-usage.sh`. No app code changed.
