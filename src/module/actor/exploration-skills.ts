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
