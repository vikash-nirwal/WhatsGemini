# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

## Living characters

58. **Characters talk while you're away** (M). Two characters who share a room (or who know each other) have a short conversation between your visits, shaped by their room relationships (#24). You can read it later ("Aria and Kai talked while you were gone"), and they may bring it up with you. Runs on the helper model, at most once per pair per day, with a switch per room.
60. **Character arc suggestions** (S). Every so often the helper model reads what has happened and suggests a small update to the character's personality or description ("Aria has become more open about her past"). You accept or dismiss it, like the relationship suggestion (#30). Nothing changes without your OK.
61. **Letters** (S–M). After you've been away a few days, a character can write a longer letter instead of a chat bubble. Letters collect in their own inbox (per character, readable from the chat), and you can reply to one. A per-character switch, off by default.

## Worlds and stories

66. **World map** (M). Generate a map picture for a World with the image provider (or upload one), and pin its places on it. The scene tracker's location (#9) and an adventure's current place show as a "you are here" marker.
68. **Co-writing mode** (M). Write a story together instead of roleplaying: you and the character take turns adding paragraphs to one shared text, shown as a document rather than bubbles. The character can suggest what happens next, and the text exports like a story (#20).
69. **Group chat locations** (S). The scene tracker for rooms: where the group is, who's present, and members leaving or arriving as the story moves. Members who aren't present don't reply until they come back.

## Practical

67. **Language practice mode** (S). Per chat: the character replies in the language you're learning, and gently corrects mistakes in your messages in a small note under each one. Tap any reply to translate it. The language and level are set in the Scene panel.

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Photos:** real vision APIs weren't tried (mocked only).
- **Status updates:** an optional picture with a status (the roadmap's original idea).
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view.
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). Image prompts per model aren't tried against real servers yet (the guides in `imagePromptGuide.ts` are a starting point).
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Texting mode and the terminal theme have no hold-to-record animation. Chat rows show the character's description, not the last message, so "🎤 Voice message" only appears on search results.
