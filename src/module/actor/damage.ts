/**
 * @file The Wounds/Stamina damage pipeline.
 *
 * Kept free of any Foundry dependency so it can be reasoned about and tested
 * on its own. `OseActor#applyDamage` is a thin wrapper that reads the actor's
 * pools, calls {@link applyDamageToPools}, and writes the result back.
 *
 * Rules: docs/Adventuring/Hazards/Damage.md and
 * docs/Encounters/Combat Actions.md#critical-hits in the Vogelfrei rulebook.
 */

/** A target's two damage pools, as read off the actor. */
export type DamagePools = {
  /** Current Wounds. May be negative: a character at or below 0 is dying. */
  wounds: number;

  /** Maximum Wounds. Healing never carries a target above this. */
  woundsMax: number;

  /** Current Stamina. Always 0 for monsters and unintelligent creatures. */
  stamina: number;

  /** Maximum Stamina. 0 means the creature has no Stamina pool at all. */
  staminaMax: number;
};

/** The pools after damage or healing, ready to write back to the actor. */
export type DamageOutcome = {
  wounds: number;
  stamina: number;
};

export type DamageOptions = {
  /**
   * A natural 20. Damage bypasses Stamina and lands directly on Wounds; against
   * a target that has no Stamina left it doubles instead.
   */
  critical?: boolean;
};

/**
 * Apply damage (or healing, when `damage` is negative) to a target's pools.
 *
 * Ordinary damage depletes Stamina first and only overflows into Wounds once
 * Stamina is gone. Any Wounds lost cost an equal amount of Stamina alongside
 * them, to a minimum of 0 — so a wound always strips readiness with it.
 *
 * A critical hit skips Stamina and lands on Wounds directly, still taking the
 * matching bite out of Stamina, so the target pays the total twice over. If the
 * target has no Stamina to lose — every monster, and any character already at
 * 0 — the critical deals double damage to Wounds instead.
 *
 * Healing restores Wounds only, never Stamina, and never above maximum:
 * Stamina comes back with rest, not with a Cleric.
 *
 * Wounds are deliberately not floored at 0. A character driven below zero rolls
 * `1d4 + (Wounds below zero)` for a critical injury, so the negative matters.
 *
 * @param pools - The target's current Wounds and Stamina.
 * @param damage - Damage to deal. Negative values heal Wounds.
 * @param options - Whether this was a critical hit.
 * @returns The updated pools.
 */
export function applyDamageToPools(
  { wounds, woundsMax, stamina, staminaMax }: DamagePools,
  damage: number,
  { critical = false }: DamageOptions = {},
): DamageOutcome {
  const clampStamina = (value: number) =>
    Math.max(0, Math.min(staminaMax, value));

  if (!Number.isFinite(damage) || damage === 0) {
    return { wounds, stamina: clampStamina(stamina) };
  }

  // Healing restores Wounds only, capped at maximum. Stamina is untouched.
  if (damage < 0) {
    return {
      wounds: Math.min(woundsMax, wounds - damage),
      stamina: clampStamina(stamina),
    };
  }

  const currentStamina = clampStamina(stamina);

  if (critical) {
    // No Stamina left to bypass -- monsters, or anyone already at 0.
    if (currentStamina === 0) {
      return { wounds: wounds - damage * 2, stamina: 0 };
    }
    // Straight to Wounds, and the coupling takes the same from Stamina.
    return {
      wounds: wounds - damage,
      stamina: clampStamina(currentStamina - damage),
    };
  }

  const absorbed = Math.min(currentStamina, damage);
  const overflow = damage - absorbed;

  // The coupling: Wounds lost cost an equal amount of Stamina. After absorbing,
  // Stamina is already 0 whenever there is overflow, so this is a no-op in the
  // ordinary case -- but it keeps the rule in one place rather than implied.
  const stackedLoss = currentStamina - absorbed - overflow;

  return {
    wounds: wounds - overflow,
    stamina: clampStamina(stackedLoss),
  };
}
