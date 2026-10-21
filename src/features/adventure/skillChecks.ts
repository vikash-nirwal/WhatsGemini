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
export const rollCheck = (check: { skill?: string; dc: number }, persona: Pick<UserProfile, "skills"> | undefined, random: () => number = Math.random): SkillCheck => {
  const roll = rollDice("1d20", random)!.rolls[0];
  const modifier = skillModifier(persona, check.skill);
  const total = roll + modifier;
  const success = roll === 20 ? true : roll === 1 ? false : total >= check.dc;
  return { ...check, roll, modifier, total, success };
};

export const describeCheck = (check: SkillCheck): string => {
  const mod = check.modifier ? ` ${check.modifier > 0 ? "+" : "−"} ${Math.abs(check.modifier)} = ${check.total}` : "";
  return `${check.skill ? `${check.skill} ` : ""}${check.roll}${mod} vs DC ${check.dc}: ${check.success ? "success" : "failure"}`;
};

// What the narrator reads for the player's turn: their action plus how the roll went.
export const withCheckNote = (text: string, check: SkillCheck | undefined): string =>
  check
    ? `${text}\n\n(Skill check${check.skill ? `, ${check.skill}` : ""}: rolled ${check.roll}${check.modifier ? ` ${check.modifier > 0 ? "+" : "-"} ${Math.abs(check.modifier)} = ${check.total}` : ""} against DC ${check.dc}. ${check.success ? "Success" : "Failure"}: narrate the outcome as a ${check.success ? "success" : "failure"}.)`
    : text;
