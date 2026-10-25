# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

Items up to #129 are built (the last batch, #113–#129 "Your own WhatsApp", on 2026-10-24). New ideas get the next free numbers.

## Your own WhatsApp, part 2 (#130–#142, picked 2026-10-25)

Picked by the user from the ideas after #113–#129. No voice features until the app has an AI voice model (see PROGRESS.md › Decisions).

- **#132 Real-model tuning pass (S).** The user tries #81 onward and the latest fixes with their own key and reports what's off; Claude fixes it. Watch: how often the tags (`[Re:]`, `[Fwd:]`, `[Contact:]`, `[Poll:]`, `[Group name:]`, story tags) are used, the helper prompts' output, statuses keeping to the timeline, group rounds.
- **#133 Blocking, both ways (L).** Either side can block the other.
  - *They block you:* after a bad enough fight (#97), a character blocks you. Their photo, About and status disappear for you, your messages get one grey tick and no reply, and you can't see when they're online. To make up you go through someone who knows you both (a group, or a character who knows them, #74).
  - *You block them:* "Block" in a chat's menu. Their messages and statuses stop reaching you and they can't text first. Now and then they reach out to a contact you have in common (someone who knows you both) and ask them to put in a word. That contact brings it up in your own chat with them: they pass on the request and talk it through with you, why you might or might not unblock, in their own voice and from what they know of both sides (memory, the fight, what the blocked character told them). Unblocking is always your call, from the chat's menu or Settings.
- **#138 Relationship map (M).** A picture of who knows whom (#74), the room feelings between them (#24), and how each bond with you has changed.
- **#139 Circles.** Folded into worlds (#145): the world is the circle.

## Worlds (#143–#147, picked 2026-10-25)

The user's idea, replacing circles: the app holds several worlds, each its own space with its own people, chats, news and social life; you switch between them like accounts. Decisions (asked one by one, 2026-10-25): a character can join several worlds with separate memory in each; you're part of every world, with a persona per world or your default; other worlds keep running, with a per-world switch; worlds can have optional story time; the existing Worlds gallery becomes the world manager.

- **#143 Worlds as spaces (L).** A world selector at the top of the sidebar (and in the phone home's title row). The selected world scopes the chat list, Updates (statuses, channels), starred messages, the relationship map (#138) and blocking (#133). Every chat in a world gets the world's premise, tone, lore and places automatically. Existing characters and chats go into a default world ("My world"), so nothing disappears. The Worlds gallery becomes the world manager (create, edit, switch); adventures keep picking worlds as now.
  - *Membership:* a character can join several worlds. The card (look, personality, voice, prompt) is shared; memory, statuses, day log, relationships, gifts, letters, plans and the rest are per world. Likely build: a linked copy per world, card edits synced to every copy.
  - *You:* part of every world. A world can set your persona there; without one, your default persona.
- **#144 World creation wizard (L).** (1) The world: name, premise, tone, era or technology (a medieval world can "text" by letter, same app), places, cover, optional map. (2) The cast: pick existing characters, generate new ones that fit (each drafted like "character from one line"), or both. (3) How they're connected: families, friends, rivals, coworkers, proposed by the model and editable; they become the "who knows whom" links (#74) and starting relationships. (4) Who you are here: a persona for this world, or the default.
- **#145 Life inside a world (L).** Replaces circles (#139): characters in the same world talk to each other on their own, following "who knows whom" (a big world doesn't mean everyone talks to everyone). Each exchange is one helper call, at most 10 messages by default (adjustable per world). Hidden by default; a Peek switch shows their threads read-only. Members' prompts get a note on recent talk; it feeds statuses, contacts (#128), blocking (#133) and group invites.
- **#146 Worlds keep running (M).** Background life (texts first, statuses, channels, talk between characters, profile changes) runs in every world, not only the one on screen; each world has a "keep living while I'm elsewhere" switch (on by default, assumed). Notifications and toasts say which world they're from; the life dial (#131) and activity log cover all worlds.
- **#147 Story time (M).** Optional per world: its own calendar and date ("Year 312, harvest month"), moving with real time or by time skips; prompts, schedules, statuses and "While you were away" (#130) use it instead of your clock.

## Reset (#158, the user's request, 2026-10-25)

- **#158 Reset a character or a world (M).** A Reset button for a character and for a world puts it back to how it started: a character loses every memory and fact, the "where things stand" paragraph, statuses, day logs, letters, first texts, moods, diaries and the rest of what built up (its card stays: name, look, personality, prompt); a world loses its progress (story time, news, talk between characters). Confirmed first; can't be undone. Before the part 2 and worlds deploy.

## UI revamp (#148–#157, picked 2026-10-25)

A calmer, more spacious UI from the Claude Design canvas "WhatsGemini UI revamp" (https://claude.ai/artifact/M3jbFgiyZEipQ2G5PS5HSt, 59 boards after two passes; its stylesheet is saved as `design/canvas-system.css`, and the briefs are in `design/`). The canvas shows cozy and Messenger, light and dark; the other five themes map onto the same tokens. Decisions (2026-10-25): no "Favourites" filter; the WhatsApp theme is called "Messenger"; all Drama settings stay per chat; forwarding and contact cards stay inside one world. Keep every feature: regroup and restyle, don't remove.

**Wave 1 (#148–#151) is built** (2026-10-25; see PROGRESS.md). Left from it for later items: the life dial and presets in Contact info's "Their life" (with #131), Block and Clear chat there (with #133), search inside a chat (not built yet), and docking the composer below the messages instead of floating it (#152–#156 can pick it up).

**Wave 2: the other screens**
- **#152 Updates (M).** Status list (yours, recent, viewed, "Mentioned you"), the status viewer (phone and desktop), posting your status and its views, likes and comments, channels (following, find, a channel page with reactions and no composer).
- **#153 Message actions (M).** The phone long-press sheet (lifted bubble over a scrim, reactions row, Reply / Forward / Copy / Star tiles, then the action list) and the desktop hover toolbar; swipe to reply as in the interaction notes.
- **#154 Character creation (L).** Quick create (one line and an optional photo give a draft preview, then chat) and the non-linear six-step editor (Who, Look, Personality, World and story, Their life with presets, Test) with a live preview and an Advanced group.
- **#155 Characters, new chat and settings (M).** The characters gallery, new chat / new group, and Settings regrouped as You, AI, Chat and look, Care (desktop and phone).
- **#156 Smaller screens (M).** Starred messages, message info, forward, poll creation, the adventures gallery and an adventure.

**Wave 3: with the features they belong to**
- **#157 Worlds UI (M, with #143 and #144).** The world rail and phone switcher, the Worlds page and the world wizard.
- The canvas's boards for Peek (#145), blocking (#133), event invites (#134), disappearing messages (#136), stickers (#137), the activity log (#131), "where things stand" (#142) and "While you were away" (#130) are built with those items; they get no numbers of their own.

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
