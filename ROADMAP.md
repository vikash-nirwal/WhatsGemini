# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

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
- **Status updates:** an optional picture with a status (the roadmap's original idea); the status row on phones and in the collapsed sidebar.
- **Story script:** use it in adventures too (the narrator following the user's beats); show which beat a message belongs to.
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view; the terminal theme only offers ❤️ as a reaction; the inner-thoughts switch is only in a 1:1 chat's Scene panel (rooms have none yet).
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). ComfyUI prompts could use tag style for SDXL templates.
- **Accessibility:** `/settings/image` isn't in the axe scan yet and has three violations: an unnamed ToggleSwitch, unlabeled portrait-size inputs, and the selected provider pill's contrast.
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Voice notes aren't shown as "🎤 Voice message" in the sidebar's chat list, and texting mode/terminal theme have no hold-to-record animation.
- **CI:** the GitHub actions in `ci.yml` target Node 20 (a deprecation warning); move them to newer major versions.
