import { AdventureChoice, PersonaSkill, SkillCheck, UserProfile } from "../../types";
import { rollDice } from "../chat/slashCommands";

// Skill checks (#26): a risky suggested action carries a difficulty, like
// "Pick the lock [Dexterity DC 14]". Picking it, the app rolls a d20 plus the
// persona's skill (#27) and tells the narrator whether it worked, so the dice
// decide, not the narrator.

// Common skills a persona sheet can start from.
export const BASIC_SKILLS: PersonaSkill[] = ["Strength", "Dexterity", "Intelligence", "Charisma", "Perception", "Stealth"].map((name) => ({ name, modifier: 0 }));

export const buildSkillCheckDirective = (persona: Pick<UserProfile, "skills"> | undefined): string => {
  const skills = (persona?.skills || []).filter((s) => s.name.trim());
  return `When a suggested action is risky or uncertain, end its line with a skill check in square brackets, like "Pick the lock [Dexterity DC 14]". Difficulty runs from DC 5 (easy) to DC 20 (very hard); safe actions have no check.${
    skills.length > 0 ? ` Use the player's own skills where they fit: ${skills.map((s) => s.name.trim()).join(", ")}.` : ""
  } Never roll dice yourself: the app rolls and tells you whether the check succeeded, and you narrate that outcome.`;
};

// A choice's trailing "[Skill DC n]" or "(DC n)", taken off its label.
export const parseChoiceCheck = (choice: AdventureChoice): AdventureChoice => {
  const match = choice.label.match(/\s*[[(]\s*(?:([A-Za-z][A-Za-z ]{0,30}?)\s*,?\s+)?DC\s*(\d{1,2})\s*[\])]\s*$/i);
  if (!match || match.index === undefined) return choice;
  const dc = Number(match[2]);
  if (dc < 1 || dc > 30) return choice;
  const skill = match[1]?.trim();
  return { ...choice, label: choice.label.slice(0, match.index).trim(), check: { dc, ...(skill ? { skill } : {}) } };
};

export const skillModifier = (persona: Pick<UserProfile, "skills"> | undefined, skill: string | undefined): number => {
  if (!skill) return 0;
  return persona?.skills?.find((s) => s.name.trim().toLowerCase() === skill.trim().toLowerCase())?.modifier || 0;
};

// A natural 20 always works and a natural 1 always fails, as at the table.
export const rollCheck = (check: { skill?: string; dc: number }, persona: Pick<UserProfile, "skills"> | undefined, random: () => number = Math.random): SkillCheck =>
  resolveCheck(rollD20(random), check, persona);

export const describeCheck = (check: SkillCheck): string => {
  const mod = check.modifier ? ` ${check.modifier > 0 ? "+" : "−"} ${Math.abs(check.modifier)} = ${check.total}` : "";
  return `${check.skill ? `${check.skill} ` : ""}${check.roll}${mod} vs DC ${check.dc}: ${check.success ? "success" : "failure"}`;
};

// A typed action has no difficulty attached, so the app rolls the d20 before
// sending it and the narrator decides whether the action needs a check at
// all, which skill and how hard, then tags its choice. The app reads the tag
// to show the roll on the player's turn.
export const rollD20 = (random: () => number = Math.random): number => rollDice("1d20", random)!.rolls[0];

export const buildTypedCheckNote = (roll: number, persona: Pick<UserProfile, "skills"> | undefined): string => {
  const skills = (persona?.skills || []).filter((s) => s.name.trim());
  const mods = skills.length > 0 ? ` The player's skill modifiers: ${skills.map((s) => `${s.name.trim()} ${s.modifier >= 0 ? "+" : ""}${s.modifier}`).join(", ")}; any other skill is +0.` : " The player has no skill modifiers (+0).";
  return `(Dice for this action, if it needs them: the d20 came up ${roll}. If the action is risky or uncertain, pick the skill it needs and a DC from 5 to 20 by how hard it is, not by the roll. Add the skill modifier;${mods} A 20 always succeeds and a 1 always fails; otherwise it succeeds when the total meets the DC. Narrate that outcome, and put a line ${CHECK_TAG_EXAMPLE} just before the choices block. If the action isn't risky, ignore the dice and add no line.)`;
};

const CHECK_TAG_EXAMPLE = "[Check: <Skill> DC <n>]";

// The narrator's [Check: Skill DC n] tag for a typed action, taken out of the text.
export const extractCheckTag = (text: string): { text: string; check?: { skill?: string; dc: number } } => {
  const match = text.match(/\[\s*Check:\s*(?:([A-Za-z][A-Za-z ]{0,30}?)\s+)?DC\s*(\d{1,2})\s*\]/i);
  if (!match || match.index === undefined) return { text };
  const stripped = (text.slice(0, match.index).trimEnd() + "\n\n" + text.slice(match.index + match[0].length).trimStart()).trim();
  const skill = match[1]?.trim();
  return { text: stripped, check: { dc: Number(match[2]), ...(skill ? { skill } : {}) } };
};

// A rolled d20 against a check: the persona's skill added, natural 20s and 1s as at the table.
export const resolveCheck = (roll: number, check: { skill?: string; dc: number }, persona: Pick<UserProfile, "skills"> | undefined): SkillCheck => {
  const modifier = skillModifier(persona, check.skill);
  const total = roll + modifier;
  return { ...check, roll, modifier, total, success: roll === 20 ? true : roll === 1 ? false : total >= check.dc };
};

// What the narrator reads for the player's turn: their action plus how the roll went.
export const withCheckNote = (text: string, check: SkillCheck | undefined): string =>
  check
    ? `${text}\n\n(Skill check${check.skill ? `, ${check.skill}` : ""}: rolled ${check.roll}${check.modifier ? ` ${check.modifier > 0 ? "+" : "-"} ${Math.abs(check.modifier)} = ${check.total}` : ""} against DC ${check.dc}. ${check.success ? "Success" : "Failure"}: narrate the outcome as a ${check.success ? "success" : "failure"}.)`
    : text;
