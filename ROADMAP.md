# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

## Deeper characters

81. **Secrets** (M). In the editor, a character gets a few secrets, each with when it can come out: a relationship stage (#70), a trust level (#9/#71) or only if asked. The character hints at them and reveals one once its condition is met; a small "A secret came out" note marks the moment.
82. **Gifts** (S–M). Give the character something (a few ideas, or your own words). They react, remember it and may mention it later; gifts collect in a "Given" list on the character, and they may give you something back on a special date (#47).
83. **"On this day"** (S). A year, a month or 100 days after your first chat or a big moment (a chapter), the character remembers it unprompted.
84. **Shared plans** (S–M). Things you and the character agree to do become a short list in the Scene panel; the character remembers them, brings them up when the day comes, and ticks them off when they happen.

## Group life

85. **Character feed** (M). Statuses (#8) grow into a small feed: characters post, the others react and comment in character (shaped by #24), and you can like and reply.

## More control over the story

88. **Compare two models** (S–M). Generate the next reply with two models side by side and keep the one you like.

## Atmosphere and comfort

89. **Ambient sound** (M). Soft background sound matching the scene (rain, café, fireplace, sea, city at night), picked from the tracked location or backdrop, with a volume control. Generated in the browser: no downloads, no cost.
91. **Reading comfort** (S). A dyslexia-friendly font, a high-contrast option and line spacing, next to the font size.

## Creating characters

92. **Character from a photo** (S). Upload a picture; a vision model drafts the appearance, the locked look and a starting personality to edit. Joins "character from one line" (#45).

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Photos:** real vision APIs weren't tried (mocked only).
- **Status updates:** an optional picture with a status (the roadmap's original idea).
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view.
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). Image prompts per model aren't tried against real servers yet (the guides in `imagePromptGuide.ts` are a starting point).
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Texting mode and the terminal theme have no hold-to-record animation. Chat rows show the character's description, not the last message, so "🎤 Voice message" only appears on search results.
