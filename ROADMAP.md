# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

## Immersion in 1:1 chats

The app is called WhatsGemini, so lean into the messaging-app fantasy.

7. **Character schedule and presence** (M). Give each character a simple daily routine (asleep 1–8, work 9–5, …). The header shows "online" or "last seen", follow-ups mention what they're doing ("just got off my shift"), and an optional "realistic" setting delays replies while they're "busy". This uses the existing time awareness.
8. **Status updates** (M). Like WhatsApp Status: now and then a character posts a short status with an optional generated picture, based on their schedule and recent events. It shows as a ring on their avatar in the sidebar, and replying to a status opens the chat quoting it.
13. **Chat backdrops** (S). Generate or upload a background image for a chat from its setting tags or scenario, shown subtly behind the bubbles.

## Group chats

22. **More than one reply per message** (M). Today exactly one character answers each message. Add a "natural" turn mode: a cheap helper call reads the last exchange and picks who would naturally respond (possibly two in a row, possibly nobody). The mode can be *round-robin*, *natural* or *everyone*, with a cap on how long a chain can run.
23. **Built-in narrator member** (S). A toggleable narrator in rooms that describes the scene between characters' lines. It can build on the `/narrate` line type (`Message.isNarration`).
24. **Character-to-character relationships** (M). Per-room notes like "Aria resents Kai". Each speaker sees only its own relationships, so friction in the group is written in.

## Adventures as games

25. **Stats, inventory and quest log** (L). The narrator keeps a structured state block (HP, gold, items, active quests), parsed like the choices block and shown in a side panel. The player can't type items into existence because the state is authoritative.
26. **Skill checks** (M). Choices can carry a difficulty ("Pick the lock (DC 14)"). The app rolls the dice (reuse `rollDice` from `slashCommands.ts`), shows the result, and tells the narrator success or failure before it writes.
27. **Persona character sheet** (M). Optional stats and skills on a persona, used by checks.


## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Memory:** show fact groups in the character editor's memory card (only the Scene panel groups them today).
- **Chapters and diary:** "End chapter" in adventures; diary entries from group chats.
- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Compression:** an "Undo compression" action (cheap, since nothing is deleted any more).
- **Adventures:** long-term memory; hard limits in the creation wizard.
- **Photos:** editing or regenerating keeps the photo off the edited message; real vision APIs weren't tried (mocked only).
- **Story script:** use it in adventures too (the narrator following the user's beats); show which beat a message belongs to.
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view; the terminal theme only offers ❤️ as a reaction; the inner-thoughts switch is only in a 1:1 chat's Scene panel (rooms have none yet).
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). ComfyUI prompts could use tag style for SDXL templates.
- **Accessibility:** `/settings/image` isn't in the axe scan yet and has three violations: an unnamed ToggleSwitch, unlabeled portrait-size inputs, and the selected provider pill's contrast.
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Voice notes aren't shown as "🎤 Voice message" in the sidebar's chat list, and texting mode/terminal theme have no hold-to-record animation.
- **CI:** the GitHub actions in `ci.yml` target Node 20 (a deprecation warning); move them to newer major versions.
