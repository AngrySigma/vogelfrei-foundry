/**
 * @file Guard, Press and Defensive Fighting: the stances a character takes for
 *       one Round, trading attack for defence or the other way about.
 *
 * Rules: docs/Encounters/Combat Actions.md#guard,
 *        docs/Encounters/Combat Actions.md#press-and-defensive-fighting
 *
 * Every stance lasts to the end of the Round it was taken in, and none of them
 * touches the firearm AC: no guard parries a ball. Foundry-free, so the numbers
 * can be checked on their own; the actor flag that records the stance lives in
 * stance-store.js.
 */

export type StanceKind = "guard" | "press" | "defensive";

export const STANCE_KINDS: readonly StanceKind[] = ["guard", "press", "defensive"] as const;

/** What a character brings to a stance. */
export type StanceContext = {
  /** Weapon Skill. Press and Defensive Fighting need 1+; Guard is better with it. */
  weaponSkill: number;
  /** Whether a weapon or shield is at hand. Guard's +4 needs one. */
  armed: boolean;
};

/**
 * The stance's change to the character's own melee and ranged AC.
 *
 * Guard: +2, or +4 with Weapon Skill 1+ and a weapon or shield at hand.
 * Press: -4. Defensive Fighting: +2.
 *
 * @param kind - The stance, or nothing.
 * @param context - The character's Weapon Skill and whether they are armed.
 * @returns The AC change; 0 with no stance.
 */
export function stanceAc(kind: StanceKind | null | undefined, { weaponSkill, armed }: StanceContext): number {
  switch (kind) {
    case "guard":
      return weaponSkill >= 1 && armed ? 4 : 2;
    case "press":
      return -4;
    case "defensive":
      return 2;
    default:
      return 0;
  }
}

/**
 * The stance's change to the character's melee attack roll. Guard makes no
 * attack at all, so it has none to change.
 *
 * @param kind - The stance, or nothing.
 * @returns The attack modifier; 0 with no stance.
 */
export function stanceAttack(kind: StanceKind | null | undefined): number {
  switch (kind) {
    case "press":
      return 2;
    case "defensive":
      return -4;
    default:
      return 0;
  }
}

/**
 * Whether a character may take a stance at all. Press and Defensive Fighting
 * need Weapon Skill 1+; anyone may Guard.
 *
 * @param kind - The stance.
 * @param weaponSkill - The character's Weapon Skill.
 * @returns True when the stance is open to them.
 */
export function stanceAllowed(kind: StanceKind, weaponSkill: number): boolean {
  return kind === "guard" || weaponSkill >= 1;
}
