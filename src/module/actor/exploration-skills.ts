/**
 * @file Localized, sheet-ready views of a character's skills.
 */
import type { ExplorationSkill } from "../config";

/** A character's skill targets, as stored on `actor.system.exploration`. */
export type ExplorationSkills = Partial<Record<ExplorationSkill, number>>;

/** One skill, localized and paired with the character's target number. */
export type ExplorationSkillEntry = {
  key: ExplorationSkill;
  /** The stored value, which is what the sheet input edits. */
  value: number | undefined;
  /** The number actually rolled against, after any ability modifier. */
  total: number;
  long: string;
  short: string;
  abbreviation: string;
};

export const explorationSkillKeys = (): ExplorationSkill[] =>
  Object.keys(CONFIG.OSE.exploration_skills) as ExplorationSkill[];

/**
 * The chance actually rolled against for a skill.
 *
 * Every skill is a flat x-in-6 except Open Doors, which takes the Strength
 * modifier on top: "Strength modifiers apply to the roll's chances, so having a
 * Strength modifier of +1 means there is a 2 in 6 chance" (docs/Adventuring/Skills.md).
 */
export const explorationSkillTotal = (key: ExplorationSkill, value = 0, strengthMod = 0): number =>
  key === "doors" ? value + strengthMod : value;

/**
 * How a skill is rolled at a given chance (Skills.md, "Sure things and long
 * shots"). Between 1 and 5 in 6 it is the usual d6 at or under the chance. At
 * 6 in 6 or better the roll is 2d6 and fails only on a double 6; at 0 in 6 or
 * worse it is 2d6 and succeeds only on a double 1. Either way, 1 in 36.
 */
export type SkillRollMode = "normal" | "sure" | "longShot";

export const skillRollMode = (chance: number): SkillRollMode => {
  if (chance >= 6) return "sure";
  if (chance <= 0) return "longShot";
  return "normal";
};

/** The dice a skill roll throws in a given mode. */
export const skillDice = (mode: SkillRollMode): string => (mode === "normal" ? "1d6" : "2d6");

/**
 * Whether a skill roll succeeded.
 *
 * @param mode - From skillRollMode.
 * @param faces - The die faces rolled: one for a normal roll, two otherwise.
 * @param chance - The x in "x in 6".
 * @returns True on a success.
 */
export const skillSucceeds = (mode: SkillRollMode, faces: number[], chance: number): boolean => {
  switch (mode) {
    case "sure":
      return !(faces.length >= 2 && faces.every((face) => face === 6));
    case "longShot":
      return faces.length >= 2 && faces.every((face) => face === 1);
    default:
      return (faces[0] ?? 7) <= chance;
  }
};

export const prepareExplorationSkills = (
  exploration: ExplorationSkills = {},
  strengthMod = 0,
): ExplorationSkillEntry[] =>
  explorationSkillKeys().map((key) => ({
    key,
    value: exploration[key],
    total: explorationSkillTotal(key, exploration[key] ?? 0, strengthMod),
    long: game.i18n.localize(CONFIG.OSE.exploration_skills[key]),
    short: game.i18n.localize(`VF.exploration.${key}.short`),
    abbreviation: game.i18n.localize(CONFIG.OSE.exploration_skills_short[key]),
  }));
