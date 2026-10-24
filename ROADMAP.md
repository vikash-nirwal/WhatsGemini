# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

Every numbered item is built (the last batch, #106–#112 "More lifelike characters", on 2026-10-23). New ideas get the next free numbers.

## Your own WhatsApp (#113–#129, picked 2026-10-24)

The app should feel like the user's own WhatsApp account, with characters living a social life around it. The user asked to leave out calls (no Calls tab, no missed calls, no characters calling).

**Look and shell**
- **#113 WhatsApp-style theme (M).** A color theme as close to WhatsApp as possible, light and dark: teal/green header, the beige chat wallpaper with a doodle pattern (an original pattern, not WhatsApp's asset), green and white bubbles with tails, blue read ticks, a round composer with a green send button, WhatsApp-like chat list rows. No WhatsApp logo.
- **#114 Phone-style shell (M).** On phones, bottom tabs for Chats and Updates (statuses, channels), and your profile behind your avatar at the top.
- **#115 A WhatsApp chat list (M).** Unread counts, pinned, muted and archived chats (an "Archived" row), and the last message's preview with ticks.

**You take part**
- **#116 Your profile (S).** A photo and an About line on your persona, shown in the shell; characters know your About.
- **#117 Your own statuses (M).** Post a text or photo status. Characters see it ("Seen by"), like or comment, and some reply in your direct messages.
- **#118 Photo statuses (M).** A character's status can carry a picture drawn with their locked look (the old follow-up).

**Messages**
- **#119 Quoted replies (M).** Swipe (or a menu item) to reply to a message with a quote; characters can quote yours too.
- **#120 Starred messages (S).** Bookmarks shown as stars, with a Starred messages list per chat and across chats.
- **#121 Message info (S).** When a message was sent, delivered and read.
- **#122 View-once photos (S).** A character can send a photo that opens once and then shows "Opened".
- **#123 Forwarded (S).** Characters pass things along (a meme, a quote, a song) marked "Forwarded".

**Their social life**
- **#124 Group events and polls (M).** "Aria added Ben", "Ben changed the group name"; polls in group chats that members vote in.
- **#125 Profile changes (S).** Characters change their About line or profile photo now and then; the chat shows it.
- **#126 Left on read (M).** Depending on mood and schedule, a character reads your message and answers later, sometimes with an excuse.
- **#127 Channels (M).** Follow-only feeds from a character or a world (a band's news, a town paper about your story); you can react but not reply.
- **#128 Shared contacts (M).** A character sends you someone's contact card; opening it starts a chat with a character drafted on the spot.
- **#129 Status mentions (S).** Characters mention you in statuses, and replies to a status show as a quoted card in the chat.

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Photos:** real vision APIs weren't tried (mocked only).
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view.
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). Image prompts per model aren't tried against real servers yet (the guides in `imagePromptGuide.ts` are a starting point).
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Texting mode and the terminal theme have no hold-to-record animation. Chat rows show the character's description, not the last message, so "🎤 Voice message" only appears on search results.
- **#81–#92 (2026-10-22):** not tried with real models: character from a photo (vision drafting), the feed's reactions and comment answers, the plan check, the gift-back pick, and whether models use the `[Secret revealed: n]` tag reliably. Ambient sound isn't tried on a phone (iPhone Safari needs a tap before audio starts; the first tap resumes it). Compare two models, gifts, plans, secrets and "On this day" are 1:1 only; rooms could follow. The feed's comments only come right after a post (no later trickle), and phones reach the feed only through the menu's status row.
- **#109–#112 (2026-10-23):** not tried with real models or the real APIs: how the dated facts and the callback read, whether models keep to the writing profile, and Open-Meteo's and Nager.Date's real responses (mocked in tests). Embedding-based memory recall through the in-browser model (#55) is still an idea; relevance is keyword-based. Preoccupations are written only while the app is open. The routine (#7) and the schedule's presence run in the user's time zone, not the character's home. Holidays come from Nager.Date, which covers about 100 countries.
- **#106–#108 (2026-10-23):** not tried with real models: how the mood note and the day's account read, whether models keep to the day log, and how the loose-texting note sounds. Slips are 1:1 only and don't show in the terminal theme or the novel view (texting mode doesn't either); a false start only happens for a reply that arrives while the chat is open. The day log needs the app open after 9 am. A mood is only known through the emotion tag, so a model that drops the tag leaves the mood to fade.
- **#93–#105 (2026-10-23):** not tried with real models: whether they use the story tags (`[Upset: …]`, `[Made up]`, `[Lie: …]`, `[Lie caught: n]`, `[Rumor raised]`) reliably and sparingly, and how the first texts, dreams, rumors, teasers and flashback endings read. First texts and rumors only happen while the app is open (no background push). Fights, lies, jealousy, inside jokes, episodes and role reversal are 1:1 only; rooms could follow. Jealousy only counts 1:1 chats, not group chats. Role reversal leaves the scene tracker, secrets and other notes out while swapped.
