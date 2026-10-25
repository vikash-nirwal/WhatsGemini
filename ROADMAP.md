# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

Items up to #129 are built (the last batch, #113–#129 "Your own WhatsApp", on 2026-10-24). New ideas get the next free numbers.

## Your own WhatsApp, part 2 (#130–#142, picked 2026-10-25)

Picked by the user from the ideas after #113–#129. No voice features until the app has an AI voice model (see PROGRESS.md › Decisions).

- **#130 While you were away (M).** When the app opens after hours closed, fill in what would plausibly have happened meanwhile, within each job's own limits: texts first, statuses, channel posts, profile changes, timestamped in the past.
- **#131 Life dial and activity log (M).** One setting (Quiet / Normal / Lively) that scales every background job's frequency, and a log of what each job did, when, and its estimated cost.
- **#132 Real-model tuning pass (S).** The user tries #81 onward and the latest fixes with their own key and reports what's off; Claude fixes it. Watch: how often the tags (`[Re:]`, `[Fwd:]`, `[Contact:]`, `[Poll:]`, `[Group name:]`, story tags) are used, the helper prompts' output, statuses keeping to the timeline, group rounds.
- **#133 Blocking, both ways (L).** Either side can block the other.
  - *They block you:* after a bad enough fight (#97), a character blocks you. Their photo, About and status disappear for you, your messages get one grey tick and no reply, and you can't see when they're online. To make up you go through someone who knows you both (a group, or a character who knows them, #74).
  - *You block them:* "Block" in a chat's menu. Their messages and statuses stop reaching you and they can't text first. Now and then they reach out to a contact you have in common (someone who knows you both) and ask them to put in a word. That contact brings it up in your own chat with them: they pass on the request and talk it through with you, why you might or might not unblock, in their own voice and from what they know of both sides (memory, the fight, what the blocked character told them). Unblocking is always your call, from the chat's menu or Settings.
- **#134 Event invites (M).** A character sends an invite card (what, when, where) that you accept or decline; it joins shared plans (#84) and they bring it up before and after.
- **#136 Disappearing messages (S).** Per chat, messages vanish after a day or a week; the character knows it's on.
- **#137 Character stickers (M).** A small sticker set per character, drawn once with their locked look; they send one now and then instead of an emoji.
- **#138 Relationship map (M).** A picture of who knows whom (#74), the room feelings between them (#24), and how each bond with you has changed.
- **#139 Circles (L).** You set up circles of characters (a name, the members, how they know each other: "old school friends", "coworkers who can't stand the boss"), and members talk to each other on their own.
  - *When:* a background job, like the others: now and then two members, or the whole circle, have a short exchange about their own lives, plans among themselves, or you. Only while they're awake, a few a day at most, with the time and recent events so nothing goes stale.
  - *Cost limit:* each exchange is one helper call and at most **10 messages** by default, adjustable per circle (the user's choice, to keep API costs down). The life dial (#131) scales how often they happen.
  - *What you see:* hidden by default, as on WhatsApp: you learn of it indirectly (a member brings it up, a status or comment refers to it, a rumor reaches you). A per-circle "Peek" switch shows their threads read-only (confirmed by the user, 2026-10-25).
  - *How it feeds back:* each member's prompt gets a short note on recent circle talk; members comment on each other's statuses and share each other's contacts (#128); blocking (#133) uses circle members as the mutual contacts; the relationship map (#138) draws circles; now and then the circle invites you into a group chat ("we're planning Friday, you in?").
- **#140 How long a status lasts (S).** A status lasts one "day", and the user sets how long a day is: a number field, 1 to 24 hours, default 24 (Settings). Everything follows it: the status rings, Updates, your own statuses, and the Feed ("All posts"), which today still shows expired statuses (the user's call, 2026-10-25).
- **#141 Texting mode everywhere (S).** Replies split into separate texts in the terminal theme and the novel view too (today only the normal chat view).
- **#142 "Where things stand" memory paragraph (M).** The memory update (every 12 messages) also writes, in the same helper call, one short paragraph from all the character's facts and the recent conversation: what's true now, what already happened (finished plans read as finished), what's coming. Replies get that paragraph instead of the 30 word-matched facts, so memory works by meaning, not shared words.
  - The fact list stays the source of truth (Memory tab: edit, pin, date); pinned facts are still sent word for word; with no paragraph yet (or a failed one), replies fall back to the 30-fact list.
  - Rewritten with each memory update and when you come back to a chat after a long gap; not per reply (cost).
  - 1:1 chats, group chats (from the group's own memory) and adventures.

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **#113–#129 (2026-10-24):** not tried with real models or a real image provider: whether models use the new tags (`[Re: …]`, `[Fwd: …]`, `[Contact: …]`, `[Group name: …]`, `[Poll: …]`), the status, channel, About and poll-vote helper prompts, and photo statuses and profile photos. Swipe-to-reply has no UI test. Channels, your statuses' private replies and profile changes only happen while the app is open. You can't send view-once photos yourself yet. The phone shell is WhatsApp-theme only.

- **Photos:** real vision APIs weren't tried (mocked only).
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). Image prompts per model aren't tried against real servers yet (the guides in `imagePromptGuide.ts` are a starting point).
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Texting mode and the terminal theme have no hold-to-record animation. Chat rows show the character's description, not the last message, so "🎤 Voice message" only appears on search results.
- **#81–#92 (2026-10-22):** not tried with real models: character from a photo (vision drafting), the feed's reactions and comment answers, the plan check, the gift-back pick, and whether models use the `[Secret revealed: n]` tag reliably. Ambient sound isn't tried on a phone (iPhone Safari needs a tap before audio starts; the first tap resumes it). Compare two models, gifts, plans, secrets and "On this day" are 1:1 only; rooms could follow. The feed's comments only come right after a post (no later trickle), and phones reach the feed only through the menu's status row.
- **#109–#112 (2026-10-23):** not tried with real models or the real APIs: how the dated facts and the callback read, whether models keep to the writing profile, and Open-Meteo's and Nager.Date's real responses (mocked in tests). Embedding-based memory recall through the in-browser model (#55) is still an idea; relevance is keyword-based. Preoccupations are written only while the app is open. The routine (#7) and the schedule's presence run in the user's time zone, not the character's home. Holidays come from Nager.Date, which covers about 100 countries.
- **#106–#108 (2026-10-23):** not tried with real models: how the mood note and the day's account read, whether models keep to the day log, and how the loose-texting note sounds. Slips are 1:1 only and don't show in the terminal theme or the novel view (texting mode doesn't either); a false start only happens for a reply that arrives while the chat is open. The day log needs the app open after 9 am. A mood is only known through the emotion tag, so a model that drops the tag leaves the mood to fade.
- **#93–#105 (2026-10-23):** not tried with real models: whether they use the story tags (`[Upset: …]`, `[Made up]`, `[Lie: …]`, `[Lie caught: n]`, `[Rumor raised]`) reliably and sparingly, and how the first texts, dreams, rumors, teasers and flashback endings read. First texts and rumors only happen while the app is open (no background push). Fights, lies, jealousy, inside jokes, episodes and role reversal are 1:1 only; rooms could follow. Jealousy only counts 1:1 chats, not group chats. Role reversal leaves the scene tracker, secrets and other notes out while swapped.
