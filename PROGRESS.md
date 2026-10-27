# Progress

What's built, what's open and what a new session needs to know. [ROADMAP.md](ROADMAP.md) holds what's left to build. Item numbers (#n) are in the code comments too, so `grep -rn "#145" src` finds a feature; the git history has the detail.

## Where we stand

- **State (2026-10-27):** every item through #233 is built, pushed and deployed (main 974ceb6, gh-pages c7e7bea); #224–#233 came from the memory reviews, not the roadmap.
- **Open:** #132 real-model tuning waits on the user's testing with their key (turn on "Keep helper replies" in Settings › Spending first, then replay them, #214). Drive backup (#54) is built but needs the user's Google OAuth client ID (steps in Settings › Data).
- **Skipped:** #135 location sharing (dropped by the user), #139 circles (became worlds, #145). Voice features and calls wait for an AI voice model (see Decisions).
- **Not tried with real models or services:** most prompts from #81 on, image providers with real keys, notifications and background sync on real phones, the in-browser model. ROADMAP.md › "Untried" lists them.

## How the work runs

- Work goes in **waves**. Within a lane, items run one after another without stopping, except for a decision, a failing test that can't be fixed, or a merge.
- Lanes run in parallel only when they touch **different files**. Agree each lane's files at the start of the wave. These shared files have one writer per wave: `ChatPage.tsx`, `ChatWindow.tsx`, `ChatMessage.tsx`, `MessageInput.tsx`, `promptComposition.ts`, `aiSlice.ts`, `chatSlice.ts`, `package.json`. `src/types/index.ts` may be shared if each lane only adds optional fields to its own interfaces.
- Parallel lanes work in their own worktree and branch, run UI tests on their own port (`E2E_PORT=3100`, `3200`, …) and **don't edit PROGRESS.md**. The coordinating session records them and wires in anything that needs its files.
- Before merging, check all lanes combined in a throwaway worktree (unit, UI and visual tests). Merge and push only with the user's OK. Each wave ends with a PROGRESS.md update and a disk report.

## What's built

A map, by area: item numbers and where the code lives. Paths are under `src/` unless they start with `e2e/` or `scripts/`.

**Chat core**
- Prompt building: `features/ai/utils/promptComposition.ts`, `promptBudget.ts` (priorities for what fits), `promptNotes.ts`; models per character (`Character.modelOverride`, `resolveTurnModel`); prompt inspector (`requestLog.ts`, last 20, memory only).
- ChatPage layout: `pages/ChatPage.tsx` sends and handles turns; after-reply work in `pages/chat/useBackgroundUpdates.ts` (memory, diary, suggestions, relationship/growth/stage checks) and `useReplyEffects.ts` (beats, scene state, games, reactions, photos, narrator). Scene panel tabs in `components/organisms/scene-panel/<Name>Tab.tsx`.
- Memory: extraction with add/update/forget (`memoryExtraction.ts`), relevance (`memoryRelevance.ts`, pinned + 30 most relevant, cap 200), categories, dates (#109 `memoryTime.ts`), recall by meaning (`features/memory/semanticRecall.ts`), per-chat memory (`Chat.memoryScope`), condensing (#207). With "where things stand", the facts the conversation just touched still go in (#225 `selectMentionedFacts`). Past 150 facts, the 40 least recently touched fold into up to 8 lines on the helper model, keeping the earliest date (#232 `features/memory/condense.ts`, `condenseJob.ts`), instead of falling off at the cap.
- Memory across places (#228, #229 `features/memory/sharedMoments.ts`): a group's new facts go into each member's own memory, labelled with the group; an adventure set in a world gives each cast member the facts naming them, and finishing it goes on the timeline. Big 1:1 moments (label and stage changes, fights and making up, gifts, blocks) go on the timeline as private entries (#230 `features/world/chatMoments.ts`).
- Compression never deletes: summaries are spliced into the tree (`spliceSummaryIntoConversation`), prompts send seed + newest summary onward (`trimToLatestSummary`), undo removes the pair.
- Lorebook (SillyTavern fields), chapters, narrative tools (`narrativeTools.ts`, `slashCommands.ts`, `storyExport.ts`), story script (#57), recap (#46), branch map (#53), fork (#86), what-if and flashbacks (#102, #104), point of view (#101), episodes (#103), role reversal (#105), co-writing (#68), language practice (#67), choice moments (#87), event deck (#49), mini-games (#52), scenario cards and time skips (#79, #80).
- Messaging feel: texting mode (`textingMode.ts`), control tags (`messageTags.ts`: emotion, thoughts, reactions, stickers, story tags `storyTags.ts`), texting slips (#108), anti-repetition (#19), moods that carry over (#106), mood tint (#90), mood timeline (#51).
- Relationship: stages and meters (#70–#72 `relationshipStages.ts`), evolution (#30), intimacy and who knows whom (#73, #74 `intimacy.ts`), growth (#60), fights, lies, jealousy, inside jokes, rumors (#96–#100), secrets (#81), gifts (#82), plans (#84 `sharedPlans.ts`), dates that matter (#47), on this day (#83).
- Groups: turns and flow (`roomTurns.ts`, `roomFlow.ts`), locations (#69), events and polls (#124 `groupLife.ts`), off-screen talk (#58 `offscreenTalk.ts`, `OffscreenTalker.tsx`), groups of theirs (#202 `theirGroup.ts`, `runTheirGroup.ts`).

**Your own WhatsApp (#113–#141)**
- Messenger theme (#113, `tokens.css`), phone shell (#114 `usePhoneShell.ts`), chat list (#115 `chatList.ts`), your profile and statuses (#116–#118 `features/status/myStatuses.ts`), starred (#120), message info (#121), view-once (#122), forwarding (#123), profile changes (#125), left on read (#126), channels (#127 `features/channels/channels.ts`), shared contacts (#128), status mentions (#129), replies to status comments (`features/status/replyToComment.ts`), statuses in 1:1 replies: their own recent ones with reactions and comments, and yours they've seen with your exchange under it (#233 `features/status/statusNote.ts`).
- Blocking (#133 `blocking.ts`), event invites (#134 `invites.ts`), disappearing messages (#136), stickers (#137), relationship map (#138 `features/character/relationshipMap.ts`), status duration (#140), "where things stand" (#142).

**Their life between messages**
- They text first and dreams (#93, #94 `firstTexts.ts`, `dreams.ts`), statuses and feed (#8, #85 `statusUpdates.ts`, `statusFeed.ts`), letters (#61), day log (#107), preoccupations (#110), bad days (#95), schedule and presence (#7), real-world home, weather and holidays (#112 `realWorld.ts`), writing style (#111).
- Life dial and activity log (#131 `features/life/lifeDial.ts`, `activityLog.ts`), while you were away (#130 `away.ts`), catch-up and Simulate a day (#191, #193 `ticks.ts`), reset (#158 `reset.ts`), background chores on the in-browser model (`onDevice.ts`), Android background sync (`backgroundSync.ts`, `service-worker.ts`: notices only, it can't run the AI).
- One scheduler for all 13 background jobs (#209 `features/life/scheduler.ts`: `registerJob`, one queue, one timer set for the next due check, `fairOrder` turns between worlds).

**Worlds**
- Spaces and switching (#143 `currentWorld.ts`, `hooks/useWorld.ts`), wizard (#144), worlds keep running (#146 `worldPrefs.ts` `livingIn`), story time (#147 `storyTime.ts`), timeline with audiences and what each knows (#161, #203, #204 `timeline.ts`, `knowledge.ts`), hearsay (#206), one time and place (#205 `sceneNow.ts`), world brief (`worldBrief.ts`), god mode (#160), pulse (`pulse.ts`), Peek (`pages/PeekPage.tsx`), export, import and share links (#172 `worldFile.ts`, `importWorld.ts`), live map (#66 `worldMap.ts`).
- World engine (#209): thunks in `features/world/engine/` (`worldJobs.ts` `worldLifeCheck` runs every world job; `worldTalkTurn.ts`; `pickNextTalk.ts`; `worldTurnJob.ts`; `catchUpJob.ts`; `shared.ts` `afterTalk`, `tellTheNews`; `state.ts` `engineState`, which drops the dead). `WorldTalker.tsx` and `WorldEventWatcher.tsx` only register them.
- Per-world switches, all off by default (`worldPrefs.ts` `featureOn`, toggles in `WorldLifeControls.tsx`): events (#162 `worldEvents.ts`, `startEvent.ts`), drift (#163), arrivals and life events (#164 `worldLife.ts`), places (#165, #177, #183 `places.ts`), reputation (#166), introductions (#167), secrets (#170, #184), goals (#208, #221 `goals.ts`), one call per world turn (#212, #213 `worldTurn.ts`, `catchUp.ts`), people around them (#218 `extras.ts`). Storylines (#169 `worldArcs.ts`), factions (#171), group plans (#168, #184, #195 `groupPlans.ts`) have no switch.
- Talk between characters (#145, #159, #181 `worldTalk.ts`), talk that fits the era and place (#216 `talkMedium.ts`), numbers under the story with reasons (#211, #217 `bonds.ts`), events with consequences (#219 `aftermath.ts`), canon (#220 `canon.ts` `worldContext`), seasons and traditions (#222 `rhythm.ts`), uneven pace (#223 `activity.ts`), news texts (#178 `news.ts`, `shareNews.ts`), the world as it is now in replies to you: canon, season, places, their mood and bonds, people around (#226 `worldNow.ts`), one fact in one note: a reply's life, knows, history and canon notes skip what another already says, and a character isn't told their own chat's moments back (#231 `knowledge.ts` `echoesOwnNotes`), talks kept per pair (#224), time skips and undo (`passWorldTime.ts`, `timeSkipUndo.ts`).
- Call limits and quiet hours per world (#192), notifications and digest for world happenings (#194).

**Characters and images**
- Editor steps, quick create, from one line or a photo (#45, #92, #154 `characterDraft.ts`), life presets (`lifePresets.ts`), wardrobe (#50), private albums (#75), schedule.
- Images: locked look in every prompt (`appearanceLock.ts`), reference photos per provider (`referenceImages.ts`), prompt guides per model (`imagePromptGuide.ts`), toning down (`imageTone.ts`), no names to image models (`hideNames.ts`), fal.ai catalog (`falCatalog.ts`), ComfyUI (`comfyuiAdapter.ts`), SD WebUI (`sdWebuiUtils.ts`), per-character local settings (#40), reference sheet.

**App-wide**
- Spending limit (#42 `features/spending/`), notifications (#43), voice and voice notes (#12, #44), calls (#56), in-browser model (#55 `webllmAdapter.ts`), backups (manual zip, daily, Drive: `services/backupService.ts`, `features/backup/autoBackup.ts`, `services/driveBackup.ts`; worlds, timelines and world switches included, #215), helper reply log and replay (#214 `features/ai/replyLog.ts`, `replay.ts`, `scripts/replay-replies.js`), adventures (`features/adventure/`).
- Themes and tokens: `styles/tokens.css`, `styles/THEMING.md`; the revamp canvas's own values in `design/canvas-system.css`. Every theme meets WCAG AA; the axe baseline is empty.

## Decisions

Choices a later session shouldn't revisit.

- Layout is tested with Playwright in real browsers; Jest/jsdom is for logic and component behaviour only.
- Image providers: only ones the user can sign up for from India, or local (Wan, OpenAI, fal.ai, BFL, SD WebUI, ComfyUI). Not Gemini image models (cost) or Qwen's own API.
- Compression is non-destructive. Screenshot tests (`@visual`) are macOS-local; CI leaves them out.
- (user) No new voice features or calls until the app has an AI voice model.
- (user) Worlds: a character can join several worlds with separate memory; the user is in every world (a persona per world, else the default); other worlds keep running unless switched off; story time is optional per world.
- (user) Background world features each sit behind a per-world switch, **off by default**. Exceptions decided 2026-10-27: the canon check, seasons and uneven pace (#220, #222, #223) need none.
- Memory bridges (#228–#230): a freeform adventure (no world) and a what-if, "this chat only" or disappearing-messages chat stay apart; group facts are copied to members, not moved.
- (user) UI revamp: no "Favourites" filter; the WhatsApp theme is shown as "Messenger" (stored id `whatsapp`); Drama settings stay per chat; forwarding and contact cards stay inside one world.
- (user) Character names never go to image models; SD WebUI still uses the name to pick its local face model.
- Skipped SillyTavern lorebook fields: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups.
- For overnight runs: push and deploy once all suites and CI pass, decide small open questions and note them here.

## Working notes

Facts that save the next session time.

- **Run the app:** `.claude/launch.json` has a `web` config (`npm start`, port 3000). Past the gates without a key: localStorage `age_confirmed_18 = "true"` and `chat_provider = "ollama"`, then reload. Fake the AI in the browser pane by overriding `window.fetch` for `/chat/completions` (SSE when `stream: true`, else JSON); the override is lost on reload.
- **Seed data:** IndexedDB `ChatAppDB`, tables `chats`, `characters`, `worlds`, `adventures`, `settings` (timelines are settings rows `world_timeline_<id|mine>`). Message roles are `"you"` and `"ai"`.
- **Every file in `src` must type-check and lint, even unimported ones:** an error puts CRA's overlay over every page and every UI test fails. Run `npx tsc --noEmit -p .` and `npx eslint` on changed files before a UI run, and don't add half-finished files during one. Jest here has no `advanceTimersByTimeAsync`.
- **UI tests:** `npm run test:e2e` reuses a dev server on port 3000, so make sure it's this checkout's. Elsewhere use `E2E_PORT=3100 npx playwright test`. From a scratch worktree pass `--shard=n/4` (file arguments don't match there; a shard takes about 5 minutes). Run full suites one at a time: two at once make timing tests fail.
- **UI test helpers:** `e2e/fixtures.ts` seeds data and mocks the AI; `openRoute` seeds again, so patch IndexedDB after opening a route and reload. `openDetails(section)` opens collapsed editor sections. The app's `Select` is Radix: click it, then pick `getByRole("option")`. Playwright lint errors from `testing-library/prefer-screen-queries` are expected.
- **Fakes:** image providers in `e2e/image-references.spec.ts` and `e2e/comfyui.ts`; notifications in `e2e/notifications.spec.ts` (read the grant through `navigator.permissions.query`; the iphone project has no Notification API).
- **Toasts in UI tests:** sonner pauses a toast under the pointer; move the mouse away after clicking near the top (see `chatAction` in `e2e/chapters.spec.ts`).
- **Known flaky tests:** `group-plans.spec.ts:50` and `group-chats.spec.ts:96` (fail alone now and then, before 2026-10-27 too), `important-dates.spec.ts` (once, tablet), the terminal-theme `@visual` screenshot (needs the placeholder frozen).
- **Visual tests:** `npm run test:visual` (`test:visual:update` to refresh); baselines are macOS renders; review the PNG diffs first.
- **CI:** `.github/workflows/ci.yml` on every push; failures are readable without signing in at `GET /repos/vikash-nirwal/WhatsGemini/check-runs/<job id>/annotations` (60 unauthenticated calls an hour).
- **Playwright browsers are shared by every project on this Mac;** if they vanish, `npx playwright install chromium webkit`.
- **Unit tests:** Jest can't load Radix's switch, so component tests mock `ToggleSwitch` (see `VoiceSection.test.tsx`). Check the "Test Suites:" line: a suite that fails to load doesn't show in the test count.
- **Saves:** use `patchCharacter` / `patchWorld` (re-read, change only the given fields, queued) from background work; `updateChatOptions` is atomic (`dbService.patchChat`). Timeline writes are queued per world (`editTimeline`).
- **Lorebook:** scan depth above 10 and sticky need `buildTurnContext` to pass the full history since the last summary.
- **ChatPage render order:** `scene` is built before `activePersona` is declared; anything it computes during render must not touch later `const`s.
- **Helper reply kinds:** every kind in `REPLY_KINDS` needs a good example in `features/ai/__replies__/`, or the replay test fails. The world talk prompt's "Write a text conversation between" wording is matched by UI test mocks; keep it for texts.
- **Lanes from session cards** don't keep the source branch; a lane's brief should bring it in first (`git merge --ff-only refs/heads/<branch>`).
- **Lockfiles:** both exist; use npm.

## Session log

Newest first. Older sessions are in the git history.

- 2026-10-27: Statuses and their comments reach 1:1 replies (#233).
- 2026-10-27: Memory for less context and better recall: one fact in one note (#231), condensing old facts instead of dropping them at the cap (#232).
- 2026-10-27: Reviewed how memory moves between chats, groups, adventures and worlds. Fixed world talks kept per holder, not per pair (#224); recall skipped once "where things stand" existed (#225); replies missing the world's state (#226); pinned group facts dropped first (#227); "you texted" for letters and in-person talks. Built memory bridges #228–#230. Pushed and deployed.
- 2026-10-27: Reviewed the world engine and built #209–#223 (#214 and #215 as parallel lanes), fixed fal.ai's "At least one image URL is required" fallback, kept names out of image prompts, and fixed the scheduler waking up to 10 s late. Deployed twice. Trimmed PROGRESS.md and ROADMAP.md and removed the finished revamp's design briefs and screenshots.
