# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

## Immersion in 1:1 chats

The app is called WhatsGemini, so lean into the messaging-app fantasy.

7. **Character schedule and presence** (M). Give each character a simple daily routine (asleep 1–8, work 9–5, …). The header shows "online" or "last seen", follow-ups mention what they're doing ("just got off my shift"), and an optional "realistic" setting delays replies while they're "busy". This uses the existing time awareness.
8. **Status updates** (M). Like WhatsApp Status: now and then a character posts a short status with an optional generated picture, based on their schedule and recent events. It shows as a ring on their avatar in the sidebar, and replying to a status opens the chat quoting it.
9. **Scene state HUD** (M). Next to the emotion tag, the model reports a small hidden state block: location, time of day, outfit, and a relationship meter (affection/trust). Show it as a compact strip under the header and feed it back each turn so details stay consistent. It's parsed and stripped the same way the emotion tag is.
13. **Chat backdrops** (S). Generate or upload a background image for a chat from its setting tags or scenario, shown subtly behind the bubbles.

## Story tools

19. **Anti-repetition guard** (M). Long roleplays drift into repeated phrases and openings. Detect n-grams the last few replies keep reusing and add a one-turn "avoid these phrases" directive. Optionally show a small indicator when it kicks in.

## Group chats

22. **More than one reply per message** (M). Today exactly one character answers each message. Add a "natural" turn mode: a cheap helper call reads the last exchange and picks who would naturally respond (possibly two in a row, possibly nobody). The mode can be *round-robin*, *natural* or *everyone*, with a cap on how long a chain can run.
23. **Built-in narrator member** (S). A toggleable narrator in rooms that describes the scene between characters' lines. It can build on the `/narrate` line type (`Message.isNarration`).
24. **Character-to-character relationships** (M). Per-room notes like "Aria resents Kai". Each speaker sees only its own relationships, so friction in the group is written in.

## Adventures as games

25. **Stats, inventory and quest log** (L). The narrator keeps a structured state block (HP, gold, items, active quests), parsed like the choices block and shown in a side panel. The player can't type items into existence because the state is authoritative.
26. **Skill checks** (M). Choices can carry a difficulty ("Pick the lock (DC 14)"). The app rolls the dice (reuse `rollDice` from `slashCommands.ts`), shows the result, and tells the narrator success or failure before it writes.
27. **Persona character sheet** (M). Optional stats and skills on a persona, used by checks.
28. **Attach a World to normal chats** (S). Worlds are adventure-only today. Let a 1:1 chat or room attach a World so its lore and premise apply there too.

## Characters

30. **Relationship that evolves** (S). Periodically suggest an update to the character's "relationship" field from what's happened ("strangers" → "reluctant allies"). You approve each change; nothing is rewritten automatically.

## More ideas (added 2026-10-20)

Built one at a time: #46, then #57, then #47 onward.

46. **"Previously on…"** (S). Opening a chat after a few days away shows a short recap built from the chapter summaries and recent messages, dismissable, and never sent to the model.
57. **Story script** (M–L). Built right after #46. Before a chat, room or adventure starts, the user can write the story the AI must stay inside: a premise, an ordered list of story beats, directions (tone, pacing, must / must-never, the ending), or paste a whole script that the AI splits into beats for review. Each reply gets the premise, the directions and only the current beat. The model works toward it and reports reaching it with a hidden tag (like the emotion tag). Off-script turns are played along briefly, then steered back. Directions stay pinned through compression. A "Beat 2 of 6" strip lets the user mark a beat done, skip it, go back or edit the script. Strict or loose mode. Scripts can be saved as templates and reused with other characters.
47. **Dates that matter** (S). Birthdays, anniversaries and "the day we met" are picked up from memory or set by hand; on the day, the character mentions it or reaches out first.
48. **Send them a photo** (S–M). Attach a picture to a message; on models that accept images the character sees it and reacts. Elsewhere it's described by a vision-capable helper model, or the user is told it can't be seen.
49. **Event deck** (S). A "Draw an event" action that adds a random twist to the scene ("a stranger knocks", "the power goes out"), from a built-in deck you can edit, as a one-turn directive.
50. **Wardrobe** (S–M). A few named outfits per character. Picking one swaps the outfit part of the locked look (#34), so pictures change clothes without changing the face.
51. **Relationship timeline** (S). A small chart of mood and affection over time, from the emotion tags (and #9's meter once it exists), in the Scene panel.
52. **Mini-games** (M). 20 Questions, Would You Rather and Truth or Dare, started from the composer; the character plays in character, and the app keeps score where there is one.
53. **Branch map** (M). A visual tree of the conversation's branches and variants, to see and jump between storylines.
54. **Backup to Google Drive** (M). An encrypted backup to your own Drive (app-data folder), restorable on another device. Needs a Google OAuth client ID that you create once; the app still has no server.
55. **Free local model in the browser** (M). A small model run on your GPU with WebLLM: no key, no cost, as a fallback chat provider. Adds a large dependency, downloaded on first use only.
56. **Phone calls** (L). A call screen with a timer: you talk, the character answers out loud, hands-free. Builds on #12 and #44.

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Memory:** show fact groups in the character editor's memory card (only the Scene panel groups them today).
- **Chapters and diary:** "End chapter" in adventures; diary entries from group chats.
- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Compression:** an "Undo compression" action (cheap, since nothing is deleted any more).
- **Adventures:** long-term memory; hard limits in the creation wizard.
- **Messaging feel:** texting mode isn't used by the terminal theme or the novel view; the terminal theme only offers ❤️ as a reaction; the inner-thoughts switch is only in a 1:1 chat's Scene panel (rooms have none yet).
- **Image providers:** try each with a real key: Wan from a Singapore workspace, fal.ai uploads and its safety flags, OpenAI's `input_fidelity` and `image[]` fields, and the ComfyUI templates' node names against a real server. An InstantID preset for the SD WebUI ControlNet (it needs two units). ComfyUI prompts could use tag style for SDXL templates.
- **Accessibility:** `/settings/image` isn't in the axe scan yet and has three violations: an unnamed ToggleSwitch, unlabeled portrait-size inputs, and the selected provider pill's contrast.
- **Notifications:** not tried on a real device: the installed app's service-worker path (`showNotification` and its `notificationclick`), Android Chrome, and an iPhone Home Screen app. Portraits saved to a local folder (`local:`) show the app icon instead of the avatar.
- **Voice:** not tried with real voices or a real microphone: Android Chrome's continuous recognition (it can repeat earlier words; `readTranscript` rebuilds from all results to cope), iPhone Safari (needs Siri and dictation on), and voices on Windows. Paid TTS (OpenAI, ElevenLabs) could come later through the provider registry. Voice notes aren't shown as "🎤 Voice message" in the sidebar's chat list, and texting mode/terminal theme have no hold-to-record animation.
- **CI:** the GitHub actions in `ci.yml` target Node 20 (a deprecation warning); move them to newer major versions.
