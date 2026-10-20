# WhatsGemini roadmap

What's still to build. Finished work is summarized in [PROGRESS.md](PROGRESS.md), and the details are in the git history. Item numbers stay the same as in earlier versions of this file, so old commits and notes still match.

Sizes: **S** = an hour or two, **M** = about a day, **L** = several days.

---

## Immersion in 1:1 chats

The app is called WhatsGemini, so lean into the messaging-app fantasy.

6. **Texting mode** (M). Optionally split a reply into several bubbles (by paragraph or line) and reveal them one at a time with typing pauses. Add read receipts and "typing…" between bubbles. This only changes display, so the stored message stays whole.
7. **Character schedule and presence** (M). Give each character a simple daily routine (asleep 1–8, work 9–5, …). The header shows "online" or "last seen", follow-ups mention what they're doing ("just got off my shift"), and an optional "realistic" setting delays replies while they're "busy". This uses the existing time awareness.
8. **Status updates** (M). Like WhatsApp Status: now and then a character posts a short status with an optional generated picture, based on their schedule and recent events. It shows as a ring on their avatar in the sidebar, and replying to a status opens the chat quoting it.
9. **Scene state HUD** (M). Next to the emotion tag, the model reports a small hidden state block: location, time of day, outfit, and a relationship meter (affection/trust). Show it as a compact strip under the header and feed it back each turn so details stay consistent. It's parsed and stripped the same way the emotion tag is.
10. **Inner thoughts** (S). Optionally the character also writes a hidden `<thoughts>` line. It renders as a tap-to-reveal spoiler and is kept out of what the model thinks it said aloud.
11. **Reactions** (S). React to a message with an emoji (a footer button, and the long-press sheet on touch screens). The character sees it ("[reacted ❤️ to: …]") and can react back to yours using a tiny tag.
12. **Voice** (M). Per-character text-to-speech with the browser's built-in Web Speech API (free, offline, no backend), a voice picker in the character editor, and a speaker button on messages. Speech-to-text dictation in the composer. Paid TTS (OpenAI/ElevenLabs) can come later through the provider registry.
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

## Consistent faces and appearance in images

Goal: the same character looks like the same person in every picture, using only providers that work from India (Wan, OpenAI, Seedream 4 and FLUX.1 Kontext through fal.ai, FLUX directly from Black Forest Labs) or that run locally (Stable Diffusion WebUI, ComfyUI). Gemini/Nano Banana is out of scope (cost), and so is Qwen's own sign-up (it rejects Indian phone numbers). Qwen-Image-Edit is still usable as open weights inside ComfyUI.

**Why faces drift today** (from the code):
- Only Gemini and the SD WebUI receive the character's reference photos. The Wan, OpenAI and GLM adapters send text only, so every picture invents a new face.
- `deriveImagePrompt` has the chat model rewrite the whole prompt, appearance included, each time, so the description slowly changes.
- Stable Diffusion gets no fixed seed per character.

The items below fix the shared parts first, then add references to each provider.

34. **Locked appearance line** (M). Every character gets a short, fixed list of visual traits (face shape, eyes, hair, skin, build, distinguishing marks, usual outfit), drafted once by the AI from the appearance text and editable in the character editor. Image prompts insert it word for word for every character in the picture; the chat model only writes the scene (pose, place, action, expression). This works for every provider, including text-only ones. Files: `imageGeneration.ts`, `adventurePrompt.ts`, the character editor, `Character.visualTags` (or similar).
35. **Reference sheet and main reference** (M). A "Generate reference sheet" action makes a neutral front, three-quarter and side portrait with whichever provider is set up, and lets you mark one photo as the main reference. Providers that take a single image get the main one; multi-image providers get the sheet. The same sheet can serve as LoRA training images (#40).
36. **Wan with references** (S–M). When a character has reference photos, send them to a Wan model that accepts reference images (for example `wan2.5-i2i-preview`, which edits or fuses up to about 3 images with subject consistency) on the same DashScope key and endpoint; keep the text-only model otherwise. Check first: the docs list different input types for the Singapore (international) region than for Beijing, and the request schema, on the [Wan 2.5 image edit reference](https://www.alibabacloud.com/help/en/model-studio/wan2-5-image-edit-api-reference). File: `wanAdapter.ts`.
37. **OpenAI with references** (S). Use `/v1/images/edits` with the character's reference images for `gpt-image-1` and the cheaper `gpt-image-1-mini` (about $0.005–0.011 per image at low/medium quality, plus input-image tokens). Replace the outdated comment in `openaiImageAdapter.ts`, which says references aren't possible. Confirm the input-image limit for the mini model in the API reference.
38. **fal.ai provider: Seedream 4 and FLUX.1 Kontext** (M). One new image adapter for fal.ai's queue API with a short model list:
    - Seedream 4 edit: multi-reference (reportedly up to 14 images), about $0.03 per image.
    - FLUX.1 Kontext pro (about $0.04) or dev (about $0.01): edits from one reference.
    - Optionally a FLUX face-ID model (PuLID) if available there.

    **Spike first (about an hour):** check that fal.ai accepts an Indian card, and that its REST API can be called straight from the browser (CORS), since the app has no server. Fallbacks: BFL's own API for FLUX Kontext (about $0.04 pro / $0.08 max), or another host of Seedream. Replicate is out: its API doesn't allow browser calls. Files: new `falImageAdapter.ts`, `registry.ts`, image settings.
39. **ComfyUI provider (local, free)** (L). A new image adapter for a local ComfyUI: submit a workflow (`POST /prompt`), poll `/history/{id}`, fetch `/view`. ComfyUI must be started with `--enable-cors-header`.

    The app ships a few workflow templates with placeholders for the prompt, reference image(s), seed, size, checkpoint and LoRA:
    - (a) SDXL / Illustrious / Pony + IP-Adapter FaceID or InstantID, with an optional character LoRA;
    - (b) FLUX.1 Kontext dev (GGUF) or Qwen-Image-Edit from one reference image;
    - (c) an optional ReActor face-swap pass.

    You can also import your own workflow JSON and map its nodes to the placeholders. Settings: URL, template, checkpoint.

    Hardware: SDXL + FaceID runs on about 8 GB of VRAM; FLUX Kontext dev needs about 12 GB (less with heavier GGUF quantization). Apple Silicon works through PyTorch MPS, but it's slow for FLUX. FLUX.1 dev weights are licensed for non-commercial use, which is fine for personal use.
40. **Per-character local settings** (S). For SD WebUI and ComfyUI: a fixed seed, a LoRA (file name, weight, trigger word) and a reference mode (FaceID/InstantID, ReActor, img2img, none) per character, instead of only app-wide.
    - The SD WebUI's ControlNet default (`ip-adapter_sd15`) should offer FaceID presets.
    - The ReActor face model name is currently guessed from the character's first name in `sdWebuiUtils.ts`; make it an explicit setting.
    - A short guide in the app: train a LoRA from the reference sheet with Kohya or OneTrainer (about 15–30 images, under an hour on a mid-range GPU).
41. **Consistency check in the tests** (S). Unit tests that every image path receives the locked appearance line and the reference images; mocked-provider e2e tests per adapter (Wan, OpenAI, fal, ComfyUI) that check the request carries the references.

**Suggested order:** #34 and #35 first, since they help every provider. Then #36 and #37 (the services you can already use), the #38 spike before building it, and #39 and #40 for local generation. As parallel lanes:
- Lane A: #34, #35, #41, in the prompt code and character editor.
- Lane B: #36, #37, #38, in the provider adapters and image settings.
- Lane C: #39, #40, in the ComfyUI adapter and local settings; its `registry.ts` line is added at merge.

Prices are approximate (late 2026) and change; check each provider's pricing page.

## Smaller follow-ups

Leftovers noted while building the finished items. Pick them up alongside related work.

- **Memory:** show fact groups in the character editor's memory card (only the Scene panel groups them today).
- **Chapters and diary:** "End chapter" in adventures; diary entries from group chats.
- **Lorebook:** SillyTavern fields not mapped yet: cooldown, delay, regex keys, case-sensitive matching, insertion position, groups. Sticky only applies to direct keyword hits, not recursive ones.
- **Compression:** an "Undo compression" action (cheap, since nothing is deleted any more).
- **Adventures:** long-term memory; hard limits in the creation wizard.
- **CI:** the GitHub actions in `ci.yml` target Node 20 (a deprecation warning); move them to newer major versions.
