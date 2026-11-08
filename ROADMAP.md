# Kindred roadmap

What's left to build. What's built is mapped in [PROGRESS.md](PROGRESS.md); the details are in the git history. Item numbers never change; new ideas take the next free number (next: #261).

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

## Next: 18+ stories, more

Built on #253–#256 (18+ stories, intensity, intimate beats, limits and tone down; see PROGRESS.md). The user asked for these on 2026-11-08.

- **#257 Stay in this moment (S).** A toggle in the story's menu and progress panel: the narrator holds the current scene and doesn't move toward the next beat (the reminder and `storyChoicesRule` say so), and the beat check is skipped; "Move on" turns it off.
- **#258 Paths Ahead with a tempo (S).** In an NSFW story with intensity above fade, the choices cover leaning in, slowing down or pulling back, and the plot (`storyChoicesRule`), so there's always a way to steer an intimate scene, not only forward.
- **#259 Pictures for 18+ stories (M).** A story confirmed adult (#253) counts for "Off for 18+" in `imageSafetyFor`, so its scene pictures work as a chat's do; a short look per story person (`StoryCastMember.look`, editable in `StoryCastEditor`) goes into scene prompts so people look the same from picture to picture. No names to image models, as everywhere (`hideNames`).
- **#260 Privacy for 18+ stories (S).** NSFW stories follow "show NSFW characters" and blur on the Stories page (`StoryPlayGalleryPage`), discreet mode hides their titles and premises, and "Export as a book" can use a plain title.

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

- **Chat:** gifts, plans, secrets, "On this day", lies, jealousy, episodes, role reversal and compare two models in group chats (1:1 only today; fights and inside jokes are #250); a hold-to-record animation in texting mode and the terminal theme.
- **Background life:** everything runs only while the app is open (the service worker can't call the AI).
- **Code:** an InstantID preset for SD WebUI; paid TTS (after voice is back on the table).
