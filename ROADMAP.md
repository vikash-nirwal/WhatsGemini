# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

Every numbered item is built (the last batch, #106–#112 "More lifelike characters", on 2026-10-23). New ideas get the next free numbers.

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Photos:** real vision APIs weren't tried (mocked only).
- **Status updates:** an optional picture with a status (the roadmap's original idea).
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view.
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). Image prompts per model aren't tried against real servers yet (the guides in `imagePromptGuide.ts` are a starting point).
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Texting mode and the terminal theme have no hold-to-record animation. Chat rows show the character's description, not the last message, so "🎤 Voice message" only appears on search results.
- **#81–#92 (2026-10-22):** not tried with real models: character from a photo (vision drafting), the feed's reactions and comment answers, the plan check, the gift-back pick, and whether models use the `[Secret revealed: n]` tag reliably. Ambient sound isn't tried on a phone (iPhone Safari needs a tap before audio starts; the first tap resumes it). Compare two models, gifts, plans, secrets and "On this day" are 1:1 only; rooms could follow. The feed's comments only come right after a post (no later trickle), and phones reach the feed only through the menu's status row.
- **#109–#112 (2026-10-23):** not tried with real models or the real APIs: how the dated facts and the callback read, whether models keep to the writing profile, and Open-Meteo's and Nager.Date's real responses (mocked in tests). Embedding-based memory recall through the in-browser model (#55) is still an idea; relevance is keyword-based. Preoccupations are written only while the app is open. The routine (#7) and the schedule's presence run in the user's time zone, not the character's home. Holidays come from Nager.Date, which covers about 100 countries.
- **#106–#108 (2026-10-23):** not tried with real models: how the mood note and the day's account read, whether models keep to the day log, and how the loose-texting note sounds. Slips are 1:1 only and don't show in the terminal theme or the novel view (texting mode doesn't either); a false start only happens for a reply that arrives while the chat is open. The day log needs the app open after 9 am. A mood is only known through the emotion tag, so a model that drops the tag leaves the mood to fade.
- **#93–#105 (2026-10-23):** not tried with real models: whether they use the story tags (`[Upset: …]`, `[Made up]`, `[Lie: …]`, `[Lie caught: n]`, `[Rumor raised]`) reliably and sparingly, and how the first texts, dreams, rumors, teasers and flashback endings read. First texts and rumors only happen while the app is open (no background push). Fights, lies, jealousy, inside jokes, episodes and role reversal are 1:1 only; rooms could follow. Jealousy only counts 1:1 chats, not group chats. Role reversal leaves the scene tracker, secrets and other notes out while swapped.
