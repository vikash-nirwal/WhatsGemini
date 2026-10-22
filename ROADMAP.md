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

## Practical

67. **Language practice mode** (S). Per chat: the character replies in the language you're learning, and gently corrects mistakes in your messages in a small note under each one. Tap any reply to translate it. The language and level are set in the Scene panel.

## Romance and immersion

70. **Relationship stages** (M). A visible ladder per chat: strangers, flirting, dating, intimate, committed. The stage is in the prompt and shapes how forward the character is willing to be, so a relationship builds instead of jumping ahead. The story moves it up or down (suggested like #30, accepted by you), and it can be set by hand.
71. **Custom meters** (S). The scene HUD's affection and trust (#9) become meters you choose per chat (tension, desire, jealousy, comfort, ...). Each reply updates them in the state block, and the character acts on them.
72. **Boldness** (S). A per-chat slider for how forward the character is, from shy and needing to be coaxed to bold and making the first move. Separate from intensity, which is how much gets described.
73. **Intimacy profile** (S–M). A structured part of the character editor: love language, likes and dislikes, how they flirt, how they act when jealous, their experience; and the same on a persona. Only sent to the model when the scene heads that way (by relationship stage, #70, or the scene's mood), so it doesn't bloat every prompt.
74. **Characters know about each other** (M). When you're seeing more than one character, they can know: Aria notices you've been talking to Kai a lot, gets jealous or curious, and brings it up. A per-character switch picks who knows about whom; what they know comes from the other chats' memory and recent activity, not their full transcripts.
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
