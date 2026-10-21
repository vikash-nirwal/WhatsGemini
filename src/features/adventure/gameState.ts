import { AdventureGameState, AdventureRules, Message } from "../../types";
import { AI } from "../../utils/constants";

// Adventures as games (#25): the app, not the narrator, keeps the player's
// HP, gold, items and quests. Each turn the narrator sees the current state
// and reports only what changed, in a block like the choices block; the app
// applies the changes. So the state is authoritative: typing "I pull out a
// laser sword" can't put one in the inventory.

export const STATS_START = "<<<STATS";
export const STATS_END = "STATS>>>";

export const STARTING_GAME_STATE: AdventureGameState = { hp: 10, maxHp: 10, gold: 0, items: [], quests: [] };

// What an adventure starts with, from its rules (set in the wizard).
export const startingGameState = (rules: AdventureRules | undefined): AdventureGameState => {
  if (!rules?.startingHp && !rules?.startingGold && !rules?.startingItems?.length) return STARTING_GAME_STATE;
  const hp = Math.max(1, Math.round(rules.startingHp || STARTING_GAME_STATE.hp));
  return { hp, maxHp: hp, gold: Math.max(0, Math.round(rules.startingGold || 0)), items: (rules.startingItems || []).filter((i) => i.trim()), quests: [] };
};

// The state after the latest narrator turn on the active path. Regenerating
// or going back a turn rewinds it with the story, since it lives on messages.
export const currentGameState = (content: Message[], start: AdventureGameState = STARTING_GAME_STATE): AdventureGameState => {
  for (let i = content.length - 1; i >= 0; i--) {
    const state = content[i].role === AI ? content[i].gameState : undefined;
    if (state) return state;
  }
  return start;
};

export const describeGameState = (state: AdventureGameState): string => {
  const active = state.quests.filter((q) => !q.done).map((q) => q.title);
  const done = state.quests.filter((q) => q.done).map((q) => q.title);
  return [
    `HP ${state.hp}/${state.maxHp}`,
    `gold ${state.gold}`,
    `items: ${state.items.length > 0 ? state.items.join(", ") : "none"}`,
    `active quests: ${active.length > 0 ? active.join("; ") : "none"}`,
    ...(done.length > 0 ? [`finished quests: ${done.join("; ")}`] : []),
  ].join("\n");
};

export const buildGameStateDirective = (state: AdventureGameState): string =>
  `The app keeps the player's stats, inventory and quests, and this is the truth:
${describeGameState(state)}
The player has only these items and this much gold. If they try to use or spend something they don't have, it isn't there: narrate that.
When this turn changes any of it, put a block just before the choices block, one change per line, in exactly this format:
${STATS_START}
hp: -3
gold: +10
gain: rusty key
lose: torch
quest: Find the lost map
quest done: Find the lost map
${STATS_END}
Use only the lines you need. Leave the block out when nothing changed. Never mention the block in your narration.${state.hp <= 0 ? "\nThe player is at 0 HP: they're defeated or knocked out. Narrate that, and offer only ways to recover or start over." : ""}`;

// Pulls the block out of a reply (anywhere in it), so it's never shown.
export const extractStatsBlock = (rawText: string): { text: string; lines?: string[] } => {
  const start = rawText.indexOf(STATS_START);
  if (start === -1) return { text: rawText };
  const end = rawText.indexOf(STATS_END, start);
  const block = rawText.slice(start + STATS_START.length, end === -1 ? undefined : end);
  const text = (rawText.slice(0, start).trimEnd() + "\n\n" + (end === -1 ? "" : rawText.slice(end + STATS_END.length).trimStart())).trim();
  const lines = block.split("\n").map((l) => l.replace(/^[\s*-]+/, "").trim()).filter(Boolean);
  return { text, lines: lines.length > 0 ? lines : undefined };
};

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Applies the narrator's changes. Returns the new state and a short label for
// each change that took effect, shown under the narration. A change that
// doesn't fit the state (losing an item you don't have) is dropped.
export const applyStatChanges = (state: AdventureGameState, lines: string[]): { state: AdventureGameState; changes: string[] } => {
  const next: AdventureGameState = { ...state, items: [...state.items], quests: state.quests.map((q) => ({ ...q })) };
  const changes: string[] = [];
  for (const line of lines) {
    const match = line.match(/^(max hp|hp|gold|gain|lose|quest done|quest)\s*:\s*(.+)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim().replace(/[.;]+$/, "");
    if (key === "hp" || key === "gold" || key === "max hp") {
      const delta = Number(value.replace(/\s+/g, ""));
      if (!Number.isFinite(delta) || delta === 0) continue;
      if (key === "hp") {
        const hp = Math.max(0, Math.min(next.maxHp, next.hp + Math.round(delta)));
        if (hp !== next.hp) changes.push(`${hp > next.hp ? "+" : "−"}${Math.abs(hp - next.hp)} HP`);
        next.hp = hp;
      } else if (key === "max hp") {
        next.maxHp = Math.max(1, next.maxHp + Math.round(delta));
        next.hp = Math.min(next.hp, next.maxHp);
        changes.push(`${delta > 0 ? "+" : "−"}${Math.abs(Math.round(delta))} max HP`);
      } else {
        const gold = Math.max(0, next.gold + Math.round(delta));
        if (gold !== next.gold) changes.push(`${gold > next.gold ? "+" : "−"}${Math.abs(gold - next.gold)} gold`);
        next.gold = gold;
      }
    } else if (key === "gain") {
      next.items.push(value);
      changes.push(`+ ${value}`);
    } else if (key === "lose") {
      const i = next.items.findIndex((item) => sameName(item, value));
      if (i === -1) continue;
      next.items.splice(i, 1);
      changes.push(`− ${value}`);
    } else if (key === "quest") {
      if (next.quests.some((q) => sameName(q.title, value))) continue;
      next.quests.push({ title: value });
      changes.push(`New quest: ${value}`);
    } else {
      const quest = next.quests.find((q) => sameName(q.title, value) && !q.done);
      if (quest) quest.done = true;
      else next.quests.push({ title: value, done: true });
      changes.push(`Quest done: ${value}`);
    }
  }
  return { state: next, changes };
};
