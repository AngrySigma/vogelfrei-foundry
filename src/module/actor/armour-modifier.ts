/**
 * @file A weapon's armour modifier, as it lands on an attack roll.
 *
 * Rules: docs/Encounters/Combat Actions.md#attack ("Armour modifier")
 *
 *   Add the weapon's armour modifier to the attack roll, but never more than
 *   the target's Armour Rating, in either direction. Against a target with no
 *   Armour Rating it does nothing. A rapier (-2) against a padded doublet (1)
 *   takes -1; a heavy crossbow (+3) against the same doublet gains +1.
 *
 * The Armour Rating here includes the shield's bonus. Firearms carry no armour
 * modifier, and a monster's natural AC is not an Armour Rating. Foundry-free,
 * so the arithmetic can be checked on its own.
 */

/**
 * The armour modifier capped by the target's Armour Rating.
 *
 * @param modifier - The weapon's armour modifier, e.g. -2 or +3.
 * @param armourRating - The target's Armour Rating, shield included.
 * @returns What is actually added to the attack roll.
 */
export function cappedArmourModifier(modifier: number, armourRating: number): number {
  const mod = Math.trunc(Number(modifier) || 0);
  const rating = Math.max(0, Math.trunc(Number(armourRating) || 0));
  if (!mod || !rating) return 0;
  return Math.sign(mod) * Math.min(Math.abs(mod), rating);
}

/** The shape this module needs from a target actor's system data. */
type TargetSystem = {
  /** A character's AC block, which knows its Armour Rating. */
  ac?: { armourRatingMelee?: number; armourRatingRanged?: number };
  /** A monster's Armour Rating, typed by the Referee; 0 for natural AC. */
  armourRating?: number;
};

/**
 * A target's Armour Rating against one kind of attack.
 *
 * @param system - The target actor's system data.
 * @param ranged - Whether the attack is a ranged one (bow, crossbow, sling).
 * @returns The Armour Rating, shield included; 0 when there is none.
 */
export function targetArmourRating(system: TargetSystem | null | undefined, ranged: boolean): number {
  if (!system) return 0;
  const fromAc = ranged ? system.ac?.armourRatingRanged : system.ac?.armourRatingMelee;
  if (typeof fromAc === "number") return fromAc;
  return system.armourRating ?? 0;
}
