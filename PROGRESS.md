# Progress

Where the [ROADMAP.md](ROADMAP.md) work stands. ROADMAP.md says *what* and *why* for each item; this file says *what's done*. Update it at the end of every session that changes anything (see CLAUDE.md).

Status values: `todo`, `in progress`, `done`, `skipped` (with a reason), `blocked` (with what it's waiting on).

## Where we stand

- **Current phase:** Wave 2, on branch `phase-0-bug-fixes` (not pushed, no PR yet). Wave 1 is done and merged (6612ae1).
- **Next up:** Wave 2 Lane A (U1, U2, U3, U6, U7, U8, bubble half of U4) here; Wave 2 Lane B (T4, T6) in a parallel session.
- **Open questions for the user:** none yet.

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

**Wave 3: features.** Lanes are picked at the start of the wave from the files each item touches. Likely groups:
- Memory: #1, #2, #3, then #4 (needs B5), #5.
- Composer and narrative tools: #15, #17, #18, #16, #14, #20, #21.
- Mostly self-contained: #29 (lorebook), #31 (prompt inspector), #33 (context meter), #32 (per-character model).
- Later: immersion (#6–#13), group chats (#22–#24), adventures (#25–#28), #30.

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
| T3 | Layout geometry checks | todo | | Added alongside each U fix. |
| T4 | Flow tests | todo | | |
| T5 | Screenshot tests | todo | | |
| T6 | Accessibility scan | todo | | |
| T7 | GitHub Actions CI | done | 2ddc302 | `.github/workflows/ci.yml`. Not run on GitHub yet (nothing pushed). |
| U1 | Multi-line input overflows composer | todo | | |
| U2 | Composer covers latest messages | todo | | |
| U3 | Phone composer too narrow | todo | | |
| U4 | Sidebar crowds chat at tablet width | in progress | 7e7bd7f | Sidebar/header half done: sidebar docks from `lg` (1024px), drawer below. Message-bubble menu overlap is Wave 2 Lane A. |
| U5 | Mobile drawer stays open after navigating | done | 3a9c02b | Closes on every route change. `e2e/drawer.spec.ts`. |
| U6 | `100vh` wrong on phones | todo | | |
| U7 | Bubbles waste space on touch | todo | | |
| U8 | Scroll button and toasts collide with composer | todo | | |
| U9 | Wizard step bars scroll sideways on phones | done | d6ae19e | New `WizardSteps` component: compact "Step n of m" when the row doesn't fit. `e2e/wizard.spec.ts`. |

## Phases 1–7: Features

All `todo`. Item numbers 1–33 match ROADMAP.md. Rows are added here when an item is started, so this file stays short.

| # | Item | Status | Commit | Notes |
|---|------|--------|--------|-------|

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
- **UI tests:** `npm run test:e2e` (reuses a dev server already on port 3000 - make sure it's this checkout's). From another worktree: `E2E_PORT=3100 npx playwright test`. Write new e2e tests with role/aria-label selectors and geometry helpers from `e2e/layout.ts`.
- **Lockfiles:** both `package-lock.json` and `yarn.lock` exist. Use npm (the scripts and README do).

## Session log

Newest first. One or two lines per session: what changed, and anything left half-done.

- 2026-10-20: Merged Wave 1 Lane B (6612ae1) with the user's OK. On the merged branch: 238 unit tests, 32 UI tests pass (8 skipped by viewport), typecheck clean. Removed its worktree. Started Wave 2.
- 2026-10-20: Fixed B5 (non-destructive compression) and B6 (adventure pipeline). Started Lane B (UI tests) as a parallel session. 238 unit tests pass.
- 2026-10-20: Fixed B4 (memory updates, forgetting, recency-based eviction). 222 unit tests pass.
- 2026-10-20: Fixed B1, B2, B3 and B7 (image prompt part) in one commit on `phase-0-bug-fixes`. 211 unit tests pass, typecheck clean.
- 2026-10-20: With the user's OK, cleared about 760 MB: removed the merged `image-backup-2` worktree, `build/` and `node_modules/.cache/gh-pages`. The local branch `worktree-image-backup-2` still exists (merged in PR #1). The dev-server caches were kept.
- 2026-10-20: Reviewed the app; wrote ROADMAP.md (logic bugs, UI tests and layout bugs, 33 feature ideas). Added `.claude/launch.json`, this file, CLAUDE.md and `scripts/disk-usage.sh`. No app code changed.
