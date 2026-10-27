# Kindred roadmap

What's left to build. What's built is mapped in [PROGRESS.md](PROGRESS.md); the details are in the git history. Item numbers never change; new ideas take the next free number (next: #224).

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

## Open

- **#132 Real-model tuning pass (S, blocked on the user).** The user uses the app with their own key, with "Keep helper replies" on (Settings › Spending), and exports them; Claude replays them (#214) and fixes the prompts and parsers that slip. See "Untried" below for what to watch.

## Untried

Built and unit/UI-tested with mocks, never with the real thing.

- **Chat tags:** `[Re:]`, `[Fwd:]`, `[Contact:]`, `[Poll:]`, `[Group name:]`, `[Sticker:]`, `[Secret revealed: n]`, story tags (`[Upset:]`, `[Made up]`, `[Lie:]`, `[Lie caught: n]`, `[Rumor raised]`). Chat replies aren't in the reply log yet, so these need reading by hand.
- **Helper prompts:** first texts, dreams, rumors, statuses and the feed, channels, profile changes, letters, day logs, preoccupations, recaps, character drafts (also from a photo); all the world prompts (talk with TIE / SHARED / NEW / GOAL / PERSON lines, events, life events, newcomers, reputation, introductions, secrets, storylines, factions, plans, world turns, the catch-up story, aftermath, goal AGAINST lines). The weights behind #211 and the prompt budget's priorities are first guesses.
- **Services:** image providers with real keys (Wan from Singapore, fal.ai uploads and safety flags, OpenAI `input_fidelity`/`image[]`, ComfyUI node names, SD WebUI), vision APIs, Open-Meteo and Nager.Date, Google Drive backup (needs the user's OAuth client ID), the in-browser model (needs a GPU) and the embedding download.
- **Devices:** notifications in the installed app, Android Chrome and an iPhone Home Screen app; Android background sync; voice on real phones and Windows; ambient sound on iPhone; `h-dvh` on a real iPhone.

## Ideas not built

Leftovers worth picking up alongside related work.

- **Worlds:** anniversaries of one-off events; factions grouping the map; god-mode truths, events and storylines reaching letters and the feed; southern-hemisphere seasons.
- **Chat:** gifts, plans, secrets, "On this day", fights, lies, jealousy, inside jokes, episodes, role reversal and compare two models in group chats (1:1 only today); sending view-once photos yourself; search inside a chat; a hold-to-record animation in texting mode and the terminal theme.
- **Background life:** everything runs only while the app is open (the service worker can't call the AI); routines run in your time zone, not the character's home.
- **Code:** the 11 personal background jobs still keep their logic in components (only the world engine moved to `features/world/engine/`); an InstantID preset for SD WebUI; paid TTS (after voice is back on the table).
- **Tests:** swipe-to-reply has no UI test; fix the flaky specs listed in PROGRESS.md › Working notes.
