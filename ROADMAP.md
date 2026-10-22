# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

Every numbered item is built (the last batch, #81–#92, on 2026-10-22). New ideas get the next free numbers.

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
