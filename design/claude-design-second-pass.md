# Prompt for Claude Design: WhatsGemini UI revamp, second pass

Paste everything below the line into the same Claude Design canvas ("WhatsGemini UI revamp"), so it builds on the boards it already made. No new screenshots are needed.

Before pasting, check the four answers under "Decisions". They are defaults that keep today's behaviour; change any you disagree with.

---

## What this pass is for

The first pass is strong: keep its foundations, IA, settings map, chat, Contact info, creation and world screens as they are. This pass fills the screens the brief asked for that are still missing, designs the "coming next" pieces that so far only appear as names, fixes some accessibility problems, and applies four decisions. Update existing boards in place where a fix touches them; add new boards for new screens, in the sections they belong to.

## 1. Decisions to apply

1. **No "Favourites" filter.** The app doesn't have favourites, and pinned chats already cover it. The chat list filters are All, Unread and Groups. Remove Favourites from the chat list boards, the phone home and the IA map.
2. **"Messenger" is the right name** for the WhatsApp-like theme. Keep it everywhere.
3. **Drama stays per chat.** Moods linger, fights that need making up, jealousy (notices other chats) and can lie all stay together in the chat panel's Options › Drama, as they are today. Remove Jealousy and Can lie from Contact info › Social (Social keeps Rumors). The "Drama" preset in the character editor sets the defaults that new chats with this character start with; say so in its description.
4. **Forwarding stays inside the current world.** The forward dialog's note is right. Apply the same rule to sharing a contact card.

## 2. Missing screens

Desktop is 1280×800 and phone 390×844. Show each in both the default theme (cozy) and Messenger, one light and one dark, like the first pass did for priority 1.

**Priority 1, still missing**
- **Group chat on phone**: the same content as the desktop group board (poll, room event, beat divider, members' names and avatars, "Message the group").
- **Chat panel on phone**: your notes say it is a full-screen push with a back button. Show the Scene tab, and Options with a folded group open.
- **Updates on desktop**: how Status and Channels sit in the desktop layout (list on the left, viewer or channel on the right).
- **Status viewer**: full-screen on phone, centred on desktop. Progress segments for several statuses, a photo status and a text status, Reply (opens their chat with the status quoted), Like, and comments. A "Mentioned you" status shows the mention highlighted.
- **My status**: posting a text or photo status, then your own status with views, likes and comments, and the list of who viewed it.
- **Channel page**: a character's channel or a world news channel. Posts with reactions, follower count, Follow / Unfollow, and no composer.

**Coming next, designed for real now** (each needs at least a phone board):
- **Peek**: characters in a world talk to each other on their own; Peek shows those threads read-only. Show where the switch lives (the world page and the world's chat list), a list of their threads, and one thread open: their messages, no composer, a clear "you're reading, not in this chat" state.
- **Blocking, both ways**.
  - *You block them*: "Block" in Contact info and the chat menu, a confirm sheet, then the blocked chat in the list and open (greyed, "You blocked Kai. Unblock").
  - *They block you*: their photo, About and status disappear, your messages show one grey tick, no online state.
  - *The go-between*: a mutual friend brings it up in their own chat with you. This is ordinary messages, but it may need a small notice ("Lena is talking about Kai").
- **Event invite card**: a card in a bubble with what, when and where, Accept and Decline; after answering it shows your answer and joins the chat panel's Story › Plans together.
- **Disappearing messages**: the chat panel option (off, a day, a week), the notice in the chat when it's turned on, and a small timer mark in the header or on messages.
- **Character stickers**: a sticker message in a bubble (no bubble background, larger), and where a character's sticker set can be seen (Contact info › Look).
- **"Where things stand"**: the memory paragraph at the top of Contact info › Memory, above facts by topic, with when it was last updated.
- **Activity log**: Settings › Care › Activity log. A list of background jobs (who, what, when, which world, the bolt cost marker), filters by character and world, today's total against the life dial.

## 3. Accessibility fixes

These come from checking the stylesheet against the brief (WCAG AA, 44 px touch targets, visible focus, reduced motion).
- **Timestamps in your own bubbles fail contrast.** `--text-3` on `--bubble-out` is 4.41:1 in cozy dark, 4.13:1 in cozy light and 3.50:1 in Messenger dark; AA for small text needs 4.5:1. Add a `--bubble-out-meta` token (or adjust `--bubble-out` or `--text-3`) so the meta line passes in all four themes. In cozy light, `--primary` on `--bubble-out` and on `--sunken` is also just under (4.07 and 4.27); fix it if primary is used for text there.
- **Touch targets.** On phones, icon buttons are 40 or 32 px and filter chips are 32 px. Keep the visual size if you like, but give every phone target a 44×44 px hit area, and say so in the component specs.
- **Focus.** There is no visible focus style. Add a focus ring token and show it on a button, a chip, a list row, a switch, a bubble (keyboard selection) and the composer.
- **Reduced motion.** It is described in the notes but not in the system. Add it to the foundations: which animations stop, which become fades.

## 4. Smaller fixes

- **World lore and the world wizard** sit under Adventures in the IA map. Move them to the world switcher and the Worlds page, so Adventures is only the adventure gallery and adventures.
- **Editor step 1 "Who"** should include the character's About line (shown in Contact info and the chat list), next to the tagline.
- **Contact info › Inner life › One consistent day** has a "write again" action today; show where it is.

## Output

Updated boards for everything in sections 1, 3 and 4, new boards for section 2, and the IA map and settings map updated to match. End with a short list of every board you added or changed.
