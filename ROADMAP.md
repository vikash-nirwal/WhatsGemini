# Kindred roadmap

What's left to build. What's built is mapped in [PROGRESS.md](PROGRESS.md); the details are in the git history. Item numbers never change; new ideas take the next free number (next: #253).

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

## Open

- **#132 Real-model tuning pass (S, blocked on the user).** The user uses the app with their own key, with "Keep helper replies" on (Settings › Spending), and exports them; Claude replays them (#214) and fixes the prompts and parsers that slip. See "Untried" below for what to watch.

## Next, no input needed (planned 2026-11-08)

Buildable now with mocked tests. Waves run in order; the lanes inside a wave touch different files and can run in parallel.

**Wave 1, lane A: Stories** (storyScript.ts, StoryPlayPage, AdventurePage, StoryScriptDialog)
- **#239 The next beat opens itself (S).** After "Finish this beat" in Stories and adventures the narrator opens the next beat at once, so there are fresh Paths Ahead instead of an empty turn.
- **#240 Keep the story's text (M).** Save the pasted story with the script (`StoryScript.source`, never sent in replies, kept in backups) and add "Read the story again": fills in beat events for older scripts, or re-splits from a chosen beat on, without losing progress.
- **#241 A story as a book (S).** Export a Story or adventure as Markdown or HTML, chapters and beats as headings, reusing `storyExport.ts`.

**Wave 1, lane B: Worlds** (rhythm.ts, timeline.ts, worldMap.ts, letters and feed prompts)
- **#243 Seasons by hemisphere (S).** Southern worlds and homes get their seasons the other way round (from the world's map or the character's home latitude).
- **#244 Anniversaries (S).** A year after a one-off world event or a big chat moment on the timeline, it comes back as a memory or a mention.
- **#245 What's true reaches letters and the feed (S).** God-mode truths, announcements and storylines go into letters, posts and the feed, as they already do into replies.
- **#246 Factions on the map (M).** Pins can belong to a faction, shown by colour, with a filter.

**Wave 2: Chat** (ChatWindow, MessageInput, Header, promptComposition; one lane, these are shared files)
- **#242 Story parts in group chats (M).** Give each member a part from the story's cast; the parts nobody plays are voiced by whoever fits, under their names, as in 1:1.
- **#247 Search inside a chat (M).** Find words in a chat's messages and jump to them, branches included.
- **#248 Send a view-once photo yourself (S).**
- **#249 Routines in their own time zone (M).** Sleep, work and quiet hours follow the character's home (`CharacterHome.timeZone`), not yours.

**Wave 3**
- **#250 Group fights and inside jokes (M).** The first of the 1:1-only features in groups; the rest (gifts, plans, secrets, lies, jealousy, episodes) follow one by one. Prompts are untried, so this gains most from #132.
- **#251 Tests (S).** A UI test for swipe-to-reply; fix the known flaky specs (PROGRESS.md › Working notes).
- **#252 Background jobs out of components (L).** Move the 11 personal background jobs into `features/…/engine` like the world engine. Last, since it touches the chat files.

## Untried

Built and unit/UI-tested with mocks, never with the real thing.

- **Chat tags:** `[Re:]`, `[Fwd:]`, `[Contact:]`, `[Poll:]`, `[Group name:]`, `[Sticker:]`, `[Secret revealed: n]`, story tags (`[Upset:]`, `[Made up]`, `[Lie:]`, `[Lie caught: n]`, `[Rumor raised]`). Chat replies aren't in the reply log yet, so these need reading by hand.
- **Helper prompts:** first texts, dreams, rumors, statuses and the feed, channels, profile changes, letters, day logs, preoccupations, recaps, character drafts (also from a photo); all the world prompts (talk with TIE / SHARED / NEW / GOAL / PERSON lines, events, life events, newcomers, reputation, introductions, secrets, storylines, factions, plans, world turns, the catch-up story, aftermath, goal AGAINST lines). The weights behind #211 and the prompt budget's priorities are first guesses.
- **Services:** image providers with real keys (Wan from Singapore, fal.ai uploads and safety flags, OpenAI `input_fidelity`/`image[]`, ComfyUI node names, SD WebUI), vision APIs, Open-Meteo and Nager.Date, Google Drive backup (needs the user's OAuth client ID), the in-browser model (needs a GPU) and the embedding download.
- **Devices:** notifications in the installed app, Android Chrome and an iPhone Home Screen app; Android background sync; voice on real phones and Windows; ambient sound on iPhone; `h-dvh` on a real iPhone.

## Ideas not built

Leftovers worth picking up alongside related work.

- **Chat:** gifts, plans, secrets, "On this day", lies, jealousy, episodes, role reversal and compare two models in group chats (1:1 only today; fights and inside jokes are #250); a hold-to-record animation in texting mode and the terminal theme.
- **Background life:** everything runs only while the app is open (the service worker can't call the AI).
- **Code:** an InstantID preset for SD WebUI; paid TTS (after voice is back on the table).
