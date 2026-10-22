# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

## Romance and immersion

75. **Private albums** (S–M). Each character's album of the pictures they've sent you, blurred until tapped. Some unlock only at a higher relationship stage (#70), and a character can send you something from their album on a special occasion (#47).
76. **Mood-aware voice** (S). Read-aloud and calls change rate, pitch and pauses with the reply's emotion: slower and softer when tender, quicker when excited. Browser voices only; no paid TTS needed.
79. **Scenario cards** (S). Ready-made starters (date night, a weekend away, a reunion after months apart, a rainy night in) that set the scene, outfit, backdrop and opening line in one tap. You can save your own.
80. **Time skips** (S). A "Later that night..." / "The next morning..." button: the app writes a short transition, moves the scene tracker's time and place on, and the story continues from there.

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Photos:** real vision APIs weren't tried (mocked only).
- **Status updates:** an optional picture with a status (the roadmap's original idea).
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view.
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). Image prompts per model aren't tried against real servers yet (the guides in `imagePromptGuide.ts` are a starting point).
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Texting mode and the terminal theme have no hold-to-record animation. Chat rows show the character's description, not the last message, so "🎤 Voice message" only appears on search results.
