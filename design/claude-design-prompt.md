# Prompt for Claude Design: WhatsGemini UI revamp

Paste everything below the line into Claude Design, and attach the screenshots from `design/screenshots/` (all four folders, or at least `desktop-cozy-dark` and `iphone-whatsapp-light`).

---

## What I need

Redesign the UI of **WhatsGemini**, a web app for chatting and roleplaying with AI characters as if they were real people texting you on WhatsApp. I want a **more spacious, calmer, more premium** look that still feels like a messaging app, and a structure that properly fits **every current feature and the ones coming next** (listed below). Today the app grew feature by feature, and it shows: dense sidebars, long settings lists, a header crowded with icons, and things layered on top of each other on phones.

Deliver:
1. **A design system**: spacing scale, type scale, radii, elevation, color tokens (light and dark), icon style, and the core components (listed below) with their states.
2. **Desktop (1280×800) and phone (390×844) layouts** for the key screens (listed below), in light and dark.
3. **Navigation and information architecture** for the whole app, including the new "worlds" model (see "Coming next").
4. Short notes on interaction details where they matter: long-press menus, swipe to reply, how panels open, empty states.

## The product in one paragraph

You (the user, with a persona: name, photo, About line) chat one-to-one or in groups with AI characters who have their own looks, personalities, memories, daily routines, moods and social lives. They text you first, post statuses, react, quote your messages, send photos (some view-once), forward things, share contacts, start polls in groups, change their profile, and sometimes leave you on read. You can also run text adventures (a narrator, choices, stats) in worlds with lore and maps. Everything runs in the browser; the AI is the user's own API key.

## The screenshots

Four folders, same 26 screens each: `desktop-cozy-dark`, `desktop-whatsapp-light`, `iphone-cozy-dark`, `iphone-whatsapp-light`. The names say what's on them: home, chat, chat-top, message actions (long-press sheet on phone, hover row on desktop), the chat settings panel's four tabs (Scene, Story, Memory, Chat), group chat, participants, a first text from a new character, Updates, my status, a status viewer, the status feed, a channel, starred messages, the characters gallery, the character editor (first and last step), adventures, an adventure, worlds, settings (appearance, profile), and the new-chat dialog.

"cozy" is the default theme (warm terracotta on near-black); "whatsapp" is a theme that imitates WhatsApp closely (and turns the phone layout into a WhatsApp-style home with a bottom tab bar).

## Problems to solve (seen in the screenshots)

- **Header overload.** The chat header has 7–8 icon buttons plus a ⋮ menu, with no labels; most are rarely used. Group the rare ones, keep two or three primary actions.
- **Sidebar density.** Logo block, two header icons, New chat + import, search, a status row, an Archived row, Pinned and Other chats sections and the persona footer all compete. On phones it's a drawer in most themes.
- **The chat settings panel** ("Scene & chat") holds about 40 settings across four tabs as long text-heavy switch lists. It needs a clearer hierarchy: what's per chat vs per character, what's common vs advanced, progressive disclosure.
- **Bubbles waste space**: big padding, a reserved empty strip under bubbles for hover actions in some themes, avatars beside every message in 1:1 chats.
- **Phone chat layering**: the "Context: 725 / 32.8k tokens" bar and reaction badges sit on top of messages, the composer is translucent so text bleeds through, and the jump-to-bottom button overlaps bubbles.
- **The character editor**: a six-step wizard whose last step piles up many unrelated sections (model, images, dates, secrets, wardrobe, schedule, home city, intimacy, texts-first, profile).
- **Inconsistent surfaces** across Updates, channels, starred, gallery and settings pages: each looks a little different.
- Small bugs worth designing away: the composer in a group says "Message Aria…" (should name the group or "Message the group"); in groups the first member's avatar shows the group's initials.

## Design direction

- **Spacious, not sparse**: generous line height and padding around groups of content, tighter inside a component. A clear 4/8 px spacing scale; 44 px minimum touch targets on phones.
- **Messaging first.** The chat screen is the heart: conversation in the middle, everything else one tap away but out of the way. It should be comfortable to read long roleplay messages (prose with *italic actions*) and short texts alike.
- **Calm chrome, expressive content.** Neutral surfaces; color comes from character accents, avatars, moods and media.
- **Feels like a real messaging app on phones** (WhatsApp/Telegram conventions: bottom tabs, a home list, long-press sheets, swipe to reply), and like a good desktop app on wide screens (sidebar + chat + an optional side panel).
- **Themeable.** The app has 7 color themes (cozy, neumorphic, aurora, terminal, parchment, material, whatsapp), each with light and dark and some with accent palettes. Design with **semantic tokens** (background, surface, raised, primary, muted text, border, bubble-in, bubble-out, etc.), so every theme can map to them. Show the system in the default theme plus the WhatsApp theme; note anything that must differ per theme.
- **Accessible**: WCAG AA contrast for all text tiers (much of the secondary text is 11–13 px), visible focus, reduced motion respected.

## Core components (design these with states)

Chat bubble (in/out; texting-mode split texts; read ticks ✓/✓✓; time; star; reaction badge; edit/regenerate variants "2/3"), quoted reply card, forwarded card, contact card with "Message", view-once pill (unopened/opened), poll card (options, counts, voters, your vote), status quote card, inner-thoughts reveal, voice note bubble, image and video in bubbles, room event / narration notice (centred pill), "Beat n" story divider, chapter summary card, letter card, choice chips, reply suggestions, typing indicator, composer (text, + tools menu, photo attach, mic, send, the reply-to strip, impersonate/silent modes, the context budget), chat list row (avatar with status ring, name, last-message preview with ticks, time, unread badge, muted, pinned, row menu), status ring and viewer, side panel shell with tabs, setting row (switch / select / segmented control) with title and one-line hint, collapsible setting group, dialog, bottom sheet, toast, empty state, tab bar, world switcher.

## Screens to design

**Priority 1**
1. **Chat (1:1)**, desktop and phone, with a realistic mix: actions in italics, a quoted reply, a forwarded card, a contact card, a view-once, a reaction, ticks, a long prose reply.
2. **Group chat**: speakers' names/avatars, room events, a poll.
3. **Home / chat list**: desktop sidebar and phone home (filters All / Unread / Groups, pinned, archived row, unread badges, muted).
4. **Chat settings panel**: restructure the ~40 settings (see the panel screenshots) into a clear hierarchy.
5. **Updates**: My status (post text/photo, views, likes, comments), characters' statuses (recent / viewed, "Mentioned you"), and Channels (followed list, find channels, a channel page with reactions and no composer).

**Priority 2**
6. Message actions: phone long-press sheet (reactions row + Reply, Forward, Copy, Star, Info, Edit, Regenerate, Continue, Read aloud, Translate, Start a new chat from here, Delete) and the desktop equivalent (hover toolbar or ⋮).
7. Character profile / contact info (doesn't exist yet: photo, About line, relationship, mood, their statuses, shared media, starred, settings for that character).
8. Character editor: rethink the 6-step wizard and the overloaded last step.
9. Characters gallery and New chat / New group.
10. Settings (sections: profile, text model, images, chat, appearance, privacy, safety, spending, data).

**Priority 3**
11. Adventures (gallery, an adventure with narrator turns, choices, stats) and Worlds (see below).
12. Starred messages, message info (sent/delivered/read), forward dialog, poll creation.

## Coming next (the structure must leave room for these)

- **Worlds as spaces** (the big one): the app holds several worlds (e.g. "Lisbon Nights", "Ravenmoor"), each its own space with its own characters, chats, statuses, channels and news. A **world switcher** at the top of the sidebar / phone home works like switching accounts. A character can be in several worlds with a separate memory in each. You're in every world, with a persona per world (or your default). A world can have its own **story time** (its own calendar). Other worlds keep running in the background (with a switch).
- **World creation wizard**: the world (name, premise, tone, era, places, cover, map), its cast (pick existing characters or generate new ones), how they're connected (family, friends, rivals), and who you are there.
- **Life inside a world**: characters talk to each other on their own; hidden by default, with a **"Peek"** view to read their threads read-only.
- **Blocking, both ways**: a blocked contact's look in the list and chat; when you block someone, a mutual friend may raise it with you in their chat.
- **Event invites** (accept/decline cards), **disappearing messages** (per chat), **character stickers**, a **relationship map** (who knows whom and how they feel), a **life dial** (Quiet / Normal / Lively) with an **activity log** of background activity and its cost, a **"While you were away"** catch-up, and a **"where things stand"** memory summary per character.
- No voice-call features for now.

## Constraints

- Web app: React + Tailwind + shadcn/Radix primitives; colors come from CSS custom properties (tokens), so a token-based system maps cleanly. Phones are the main way the app is used; desktop must stay first-class.
- Keep text readable for long roleplay replies (serif or a reading font is used in bubbles today; a reading-comfort setting lets users pick font and spacing).
- Keep everything that exists; reorganize, regroup and restyle rather than remove features.

## Output

The design system, then the screens in priority order (desktop + phone, light + dark for P1), an IA/navigation map including worlds, and a short list of the biggest structural changes from today with the reasoning for each.
