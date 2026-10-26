# Kindred roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

Items up to #129 are built (the last batch, #113–#129 "Your own WhatsApp", on 2026-10-24). New ideas get the next free numbers.

## Your own WhatsApp, part 2 (#130–#142, picked 2026-10-25)

Picked by the user from the ideas after #113–#129. No voice features until the app has an AI voice model (see PROGRESS.md › Decisions).

- **#132 Real-model tuning pass (S).** The user tries #81 onward and the latest fixes with their own key and reports what's off; Claude fixes it. Watch: how often the tags (`[Re:]`, `[Fwd:]`, `[Contact:]`, `[Poll:]`, `[Group name:]`, story tags) are used, the helper prompts' output, statuses keeping to the timeline, group rounds.
- **#139 Circles.** Folded into worlds (#145): the world is the circle.

## Worlds (#143–#147, picked 2026-10-25)

The user's idea, replacing circles: the app holds several worlds, each its own space with its own people, chats, news and social life; you switch between them like accounts. Decisions (asked one by one, 2026-10-25): a character can join several worlds with separate memory in each; you're part of every world, with a persona per world or your default; other worlds keep running, with a per-world switch; worlds can have optional story time; the existing Worlds gallery becomes the world manager.


## Reset (#158, the user's request, 2026-10-25)


## UI revamp (#148–#157, picked 2026-10-25)

A calmer, more spacious UI from the Claude Design canvas "WhatsGemini UI revamp" (https://claude.ai/artifact/M3jbFgiyZEipQ2G5PS5HSt, 59 boards after two passes; its stylesheet is saved as `design/canvas-system.css`, and the briefs are in `design/`). The canvas shows cozy and Messenger, light and dark; the other five themes map onto the same tokens. Decisions (2026-10-25): no "Favourites" filter; the WhatsApp theme is called "Messenger"; all Drama settings stay per chat; forwarding and contact cards stay inside one world. Keep every feature: regroup and restyle, don't remove.

**Wave 1 (#148–#151) is built** (2026-10-25; see PROGRESS.md). Left from it for later items: the life dial and presets in Contact info's "Their life" (with #131), Block and Clear chat there (with #133), search inside a chat (not built yet), and docking the composer below the messages instead of floating it (#152–#156 can pick it up).

**Wave 2: the other screens**

**Wave 3: with the features they belong to**
- The canvas's boards for Peek (#145), blocking (#133), event invites (#134), disappearing messages (#136), stickers (#137), the activity log (#131), "where things stand" (#142) and "While you were away" (#130) are built with those items; they get no numbers of their own.


## World review fixes (#173–#186, picked 2026-10-26)

From the world mechanics review (https://claude.ai/artifact/E4TKJjHKExRF8qTYiVWheK); the user asked for all of them. Built in this order.

- **#175 World pulse and notices (Q1).** A feed of the last day's happenings in the current world at the top of Chats, each one tap from where it happened; notices for new events and chapters.
- **#176 World-made group chats talk (B4).** Plan, family/faction and place chats are made with members talking while you're away.
- **#177 Places fill up (B3).** With places on, each resident gets a usual spot that fits them; new schedules are written with the world's places.
- **#178 Characters text you the news (I3).** A notable happening (event, chapter, life event) can make one or two people close to it text you about it.
- **#179 World history remembered (I2).** A short digest of the world's timeline goes into chat prompts and the background world brief.
- **#180 Passing time ages the world (I1).** A long world-wide gap writes a life event per resident, moves the storyline on and lets ties drift.
- **#181 Strangers become friends (I4).** Untied residents talk as acquaintances; a few good talks make them friends (a first tie).
- **#182 Living world preset (Q2).** One tap on a world card turns on a sensible set of living-world features.
- **#183 Your place in the world (I5).** Where you are in a world: set by scenes at a place; people there may run into you; in their prompts.
- **#184 Plans and secrets resolve (I6).** Plans get a date, a reminder the day before and an outcome if the day passes; secrets can come out on their own.
- **#185 Factions drive what happens (I7).** Events and storylines can name groups; rival groups get a talk topic about each other; drift weighs groups.
- **#186 One clock per world (I8).** Where a world keeps its own calendar, background prompts keep the time of day but drop the real weekday.

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **#159–#172 (2026-10-26):** not tried with real models: the talk topics, the TIE line, event, life-event, newcomer, reputation, introduction, secret, storyline and faction prompts. All of it only runs while the app is open. God-mode truths, events and storylines don't reach letters or the feed's reactions yet. Factions don't cluster the map; plans, factions and storylines have no switch (you start them yourself).


- **#113–#129 (2026-10-24):** not tried with real models or a real image provider: whether models use the new tags (`[Re: …]`, `[Fwd: …]`, `[Contact: …]`, `[Group name: …]`, `[Poll: …]`), the status, channel, About and poll-vote helper prompts, and photo statuses and profile photos. Swipe-to-reply has no UI test. Channels, your statuses' private replies and profile changes only happen while the app is open. You can't send view-once photos yourself yet. The phone shell is WhatsApp-theme only.

- **Photos:** real vision APIs weren't tried (mocked only).
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). Image prompts per model aren't tried against real servers yet (the guides in `imagePromptGuide.ts` are a starting point).
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Texting mode and the terminal theme have no hold-to-record animation. Chat rows show the character's description, not the last message, so "🎤 Voice message" only appears on search results.
- **#81–#92 (2026-10-22):** not tried with real models: character from a photo (vision drafting), the feed's reactions and comment answers, the plan check, the gift-back pick, and whether models use the `[Secret revealed: n]` tag reliably. Ambient sound isn't tried on a phone (iPhone Safari needs a tap before audio starts; the first tap resumes it). Compare two models, gifts, plans, secrets and "On this day" are 1:1 only; rooms could follow. The feed's comments only come right after a post (no later trickle), and phones reach the feed only through the menu's status row.
- **#109–#112 (2026-10-23):** not tried with real models or the real APIs: how the dated facts and the callback read, whether models keep to the writing profile, and Open-Meteo's and Nager.Date's real responses (mocked in tests). Embedding-based memory recall through the in-browser model (#55) is still an idea; relevance is keyword-based. Preoccupations are written only while the app is open. The routine (#7) and the schedule's presence run in the user's time zone, not the character's home. Holidays come from Nager.Date, which covers about 100 countries.
- **#106–#108 (2026-10-23):** not tried with real models: how the mood note and the day's account read, whether models keep to the day log, and how the loose-texting note sounds. Slips are 1:1 only and don't show in the terminal theme or the novel view (texting mode doesn't either); a false start only happens for a reply that arrives while the chat is open. The day log needs the app open after 9 am. A mood is only known through the emotion tag, so a model that drops the tag leaves the mood to fade.
- **#93–#105 (2026-10-23):** not tried with real models: whether they use the story tags (`[Upset: …]`, `[Made up]`, `[Lie: …]`, `[Lie caught: n]`, `[Rumor raised]`) reliably and sparingly, and how the first texts, dreams, rumors, teasers and flashback endings read. First texts and rumors only happen while the app is open (no background push). Fights, lies, jealousy, inside jokes, episodes and role reversal are 1:1 only; rooms could follow. Jealousy only counts 1:1 chats, not group chats. Role reversal leaves the scene tracker, secrets and other notes out while swapped.
