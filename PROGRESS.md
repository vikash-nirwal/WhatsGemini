# Progress

Where the [ROADMAP.md](ROADMAP.md) work stands. ROADMAP.md says *what* and *why* for each remaining item; this file says what's done, how the work runs, and what a new session needs to know. Update it at the end of every session that changes anything (see CLAUDE.md). Commit-level detail lives in the git history.

Status values: `todo`, `in progress`, `done`, `skipped` (with a reason), `blocked` (with what it's waiting on).

## Where we stand

- **State:** image consistency is under way. #34, #35 and the SD WebUI half of #40 are committed on local `main` (not pushed). Lanes B (#36–#38) and C (#39) are still running in their worktrees. The last full local run passed: type-check, 376 unit tests, 288 UI tests and 16 screenshot tests.
- **Next up:** verify Lanes B and C, run them combined in a throwaway worktree, and merge with the user's OK. Then wire ComfyUI into `registry.ts` and image settings, add its half of #40 plus FaceID presets for the SD WebUI ControlNet, and finish #41.
- **Open questions for the user:** none.

## Remaining items

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6 | Texting mode | todo | |
| 7 | Character schedule and presence | todo | |
| 8 | Status updates | todo | Builds on #7. |
| 9 | Scene state HUD | todo | |
| 10 | Inner thoughts | todo | |
| 11 | Reactions | todo | |
| 12 | Voice | todo | |
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
| 36 | Wan with references | in progress | Lane B. Check the Singapore-region input types first. |
| 37 | OpenAI with references | in progress | Lane B. `/v1/images/edits`, `gpt-image-1-mini`. |
| 38 | fal.ai provider (Seedream 4, FLUX Kontext) | in progress | Lane B. Spike first: Indian card, browser CORS. Replicate can't be called from a browser. |
| 39 | ComfyUI provider (local) | in progress | Lane C. Needs `--enable-cors-header`; bundled workflow templates. |
| 40 | Per-character local settings | in progress | SD WebUI done (`Character.localImageSettings`). Left: ComfyUI, and FaceID presets for the ControlNet model. |
| 41 | Consistency tests | in progress | Locked line and SD payload covered. Left: per-adapter reference e2e tests after the merge. |

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
- **Consistent looks:** each character's locked look (`Character.visualTags`, drafted from the appearance) is forced into every image prompt word for word (`appearanceLock.ts`: tags for SD, "Name: …" sentences otherwise), in chat, portraits and adventure scenes. The first reference photo is the main one; "Generate reference sheet" makes front, three-quarter and side portraits. Per-character SD WebUI seed, LoRA, reference mode and ReActor face model live in `Character.localImageSettings` (`localImageSettings.ts`, applied in `generateSDImage`).
- **Known gaps:** chats whose seed messages were never flagged `isSystem` (very old ones) aren't detected as seeded; mood-portrait generation from inside a chat wasn't checked with a real image provider; `h-dvh` wasn't checked on a real iPhone.

## Decisions

Choices a later session shouldn't revisit. Add the date.

- 2026-10-20: Layout is tested with Playwright in real browsers; Jest/jsdom is for logic and component behavior only, since jsdom can't measure layout.
- 2026-10-20: Image providers are limited to ones the user can sign up for from India, or local: Wan, OpenAI, fal.ai (Seedream 4, FLUX Kontext), BFL, SD WebUI, ComfyUI. Not Gemini image models (cost) and not Qwen's own API (rejects Indian phone numbers).
- 2026-10-20: Compression is non-destructive (summaries are inserted, never replace messages).
- 2026-10-20: Screenshot tests are macOS-local (`@visual`); CI leaves them out because Linux fonts differ.

## Working notes

Facts that save the next session time.

- **Run the app:** `.claude/launch.json` has a `web` config (`npm start`, port 3000) for the browser pane.
- **Get past the login and 18+ gate without a key:** set localStorage `age_confirmed_18 = "true"` and `chat_provider = "ollama"` (a keyless provider), then reload.
- **Fake the AI in the browser pane:** with `chat_provider = "ollama"`, override `window.fetch` in the page for URLs containing `/chat/completions`: return SSE (`data: {"choices":[{"delta":{"content":"…"}}]}` then `data: [DONE]`) when the body has `stream: true`, otherwise JSON `{choices:[{message:{content}}]}`. The override is lost on reload. Prefer the Playwright fixtures for anything repeatable.
- **Browser pane caveat:** parallel sessions can share the pane's localhost:3000 storage. For layout checks, prefer Playwright, which uses its own isolated browser; a throwaway spec calling `page.screenshot` works well.
- **Seed test data:** IndexedDB database `ChatAppDB`, tables `chats`, `characters`, `worlds`, `adventures`, `settings`. Message roles are `"you"` and `"ai"`.
- **UI tests:** `npm run test:e2e` (it reuses a dev server already on port 3000, so make sure that's this checkout's). From another worktree: `E2E_PORT=3100 npx playwright test`. Use role/aria-label selectors and the geometry helpers in `e2e/layout.ts`; `e2e/fixtures.ts` seeds data and mocks the AI.
- **Visual tests:** `npm run test:visual` (refresh with `test:visual:update`). Baselines are macOS renders in `e2e/visual.spec.ts-snapshots/`; review the PNG diffs before updating them.
- **CI on GitHub:** `.github/workflows/ci.yml` runs on every push. Step logs need a signed-in account, but Playwright's `github` reporter puts each failure in the run's annotations, readable without signing in: `GET /repos/vikash-nirwal/WhatsGemini/check-runs/<job id>/annotations`. Unauthenticated API calls are limited to 60 an hour, so poll sparsely.
- **Parallel lanes from proposed session cards** don't keep the source branch, so a lane's brief should tell it to bring in the current branch first (`git merge --ff-only refs/heads/<branch>`, or reset to it while the lane branch is still empty).
- **Lockfiles:** both `package-lock.json` and `yarn.lock` exist. Use npm.

## Session log

Newest first. One or two lines per session.

- 2026-10-20: Built #34 (locked look), #35 (reference sheet, main reference) and the SD WebUI half of #40; started Lanes B (#36–#38) and C (#39).
- 2026-10-20: Planned consistent character faces in images (#34–#41) for providers usable from India and local generation; nothing built yet.
- 2026-10-20: Reviewed the app and wrote the roadmap; then, in four waves of parallel lanes, fixed the 7 logic bugs and 12 layout/mobile bugs, added Playwright UI, flow, accessibility and screenshot tests plus CI, and built 16 features (memory #1–#5, narrative tools #14–#18, #20, #21, lorebook #29, inspector #31, per-character model #32, context meter #33). Merged into `main`, pushed, CI green. Cleaned up the docs.
