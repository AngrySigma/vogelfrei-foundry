/**
 * @file The four damage grades a weapon can have, so a hand-made weapon can be
 *       picked from a list instead of typed as a dice formula.
 *
 * Rules: docs/Equipment/Weapons/Melee Weapons.md ("Damage")
 *
 *   Every weapon deals d8. d8 low means roll 2d8 and keep the lower; d8 high,
 *   roll 2d8 and keep the higher. d8-3 is the improvised blow: roll d8 and
 *   subtract 3, to a minimum of 1.
 *
 * The weapon still stores a formula in `system.damage`; the grade is read back
 * from it. Anything else is "custom" and keeps whatever was typed.
 */

export type WeaponDamageGrade = "improvised" | "minor" | "medium" | "great";

/** The formula each grade rolls, as the compendium writes it. */
export const WEAPON_DAMAGE: Readonly<Record<WeaponDamageGrade, string>> = {
  improvised: "max(1d8-3, 1)",
  minor: "2d8kl",
  medium: "1d8",
  great: "2d8kh",
};

/** What a new weapon deals until someone says otherwise. */
export const DEFAULT_WEAPON_DAMAGE = WEAPON_DAMAGE.medium;

const normalise = (formula: string): string =>
  formula
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/(^|[^0-9])d/g, "$11d");

/**
 * Which grade a damage formula is.
 *
 * @param formula - The weapon's `system.damage`.
 * @returns The grade, or "custom" for anything else (an empty one included).
 */
export function weaponDamageGrade(formula: string | null | undefined): WeaponDamageGrade | "custom" {
  const written = normalise(formula ?? "");
  const grades = Object.keys(WEAPON_DAMAGE) as WeaponDamageGrade[];
  return grades.find((grade) => normalise(WEAPON_DAMAGE[grade]) === written) ?? "custom";
}
