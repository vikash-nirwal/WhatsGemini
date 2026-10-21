# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Memory:** show fact groups in the character editor's memory card (only the Scene panel groups them today).
- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Photos:** real vision APIs weren't tried (mocked only).
- **Status updates:** an optional picture with a status (the roadmap's original idea).
- **Story script:** use it in adventures too (the narrator following the user's beats); show which beat a message belongs to.
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view; the terminal theme only offers ❤️ as a reaction.
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). Image prompts per model aren't tried against real servers yet (the guides in `imagePromptGuide.ts` are a starting point).
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Voice notes aren't shown as "🎤 Voice message" in the sidebar's chat list, and texting mode/terminal theme have no hold-to-record animation.
