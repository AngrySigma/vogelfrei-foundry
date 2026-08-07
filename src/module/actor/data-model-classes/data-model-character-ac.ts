/**
 * @file Vogelfrei armour class: the several static AC numbers a character
 *       carries, and the formulas that produce them.
 *
 * Vogelfrei is ascending-only and has no THAC0. A defender does not have one
 * AC but several, and the attacker picks which applies -- melee or ranged,
 * against a human or a beast, surprised or not. Each is a plain sum of the same
 * components, so they live in one table: to add, remove or change a variant,
 * edit ARMOUR_CLASS_VARIANTS and nothing else.
 *
 * Rules: docs/Encounters/Combat Actions.md#attack, docs/Equipment/Armor.md
 */

/** The parts every AC formula draws on. */
export type ArmourClassComponents = {
  /** Agility modifier, -3 to +3. */
  agility: number;

  /** Weapon Skill. Defends against opponents who fight with skill. */
  weaponSkill: number;

  /** Armour Rating of worn armour, as it applies in melee. */
  armourMelee: number;

  /** Armour Rating of worn armour, as it applies at range. */
  armourRanged: number;

  /** Melee bonus from an equipped shield, buckler or pavise. */
  shieldMelee: number;

  /** Ranged bonus from an equipped shield, buckler or pavise. */
  shieldRanged: number;

  /** Free-form modifier for anything the rules do not model: grown scales, a lost leg. */
  mod: number;
};

export type ArmourClassVariant = {
  /** Stable key, used by the attack dialog to select a variant. */
  key: string;

  /** Localization key for the label. */
  label: string;

  /** Whether this variant answers a ranged attack. Melee otherwise. */
  ranged: boolean;

  formula: (components: ArmourClassComponents) => number;
};

/** Base AC before any component is added. Melee opens lower than ranged. */
export const MELEE_BASE = 8;
export const RANGED_BASE = 11;

/**
 * Every AC a character carries. Order is the order they appear on the sheet and
 * in the attack dialog.
 */
export const ARMOUR_CLASS_VARIANTS: readonly ArmourClassVariant[] = [
  {
    key: "melee",
    label: "VF.ac.melee",
    ranged: false,
    formula: (c) => MELEE_BASE + c.agility + c.weaponSkill + c.armourMelee + c.shieldMelee + c.mod,
  },
  {
    // A dragon is not put off by a skilled blade, so Weapon Skill does not
    // defend against it.
    key: "meleeMonster",
    label: "VF.ac.meleeMonster",
    ranged: false,
    formula: (c) => MELEE_BASE + c.agility + c.armourMelee + c.shieldMelee + c.mod,
  },
  {
    key: "ranged",
    label: "VF.ac.ranged",
    ranged: true,
    formula: (c) => RANGED_BASE + c.agility + c.armourRanged + c.shieldRanged + c.mod,
  },
  {
    // An unaware target keeps only what it is wearing. Surprise takes away the
    // benefit of being nimble, not the penalty of being clumsy -- a negative
    // Agility modifier still tells against you, a positive one stops helping.
    key: "surprised",
    label: "VF.ac.surprised",
    ranged: false,
    formula: (c) => MELEE_BASE + Math.min(0, c.agility) + c.armourMelee + c.mod,
  },
  {
    key: "noShield",
    label: "VF.ac.noShield",
    ranged: false,
    formula: (c) => MELEE_BASE + c.agility + c.weaponSkill + c.armourMelee + c.mod,
  },
] as const;

type ArmourItem = {
  system: {
    type: string;
    acMelee?: number;
    acRanged?: number;
  };
};

/**
 * Assembles a character's AC numbers from their equipped armour, Agility,
 * Weapon Skill and free-form modifier.
 */
export default class OseDataModelCharacterAC {
  #armour: ArmourItem[];

  #agility: number;

  #weaponSkill: number;

  #mod: number;

  /**
   * @param armour - Equipped Items of type armor. At most one body armour and
   *   one shield are expected; equipping enforces that.
   * @param agility - The Agility modifier.
   * @param weaponSkill - The character's Weapon Skill.
   * @param mod - Free-form AC modifier.
   */
  constructor(armour: ArmourItem[] = [], agility = 0, weaponSkill = 0, mod = 0) {
    this.#armour = armour;
    this.#agility = agility;
    this.#weaponSkill = weaponSkill;
    this.#mod = mod;
  }

  #sum(isShield: boolean, field: "acMelee" | "acRanged"): number {
    return this.#armour
      .filter(({ system: { type } }) => (type === "shield") === isShield)
      .reduce((total, { system }) => total + (system[field] ?? 0), 0);
  }

  get components(): ArmourClassComponents {
    return {
      agility: this.#agility,
      weaponSkill: this.#weaponSkill,
      armourMelee: this.#sum(false, "acMelee"),
      armourRanged: this.#sum(false, "acRanged"),
      shieldMelee: this.#sum(true, "acMelee"),
      shieldRanged: this.#sum(true, "acRanged"),
      mod: this.#mod,
    };
  }

  /** Every AC value, keyed by variant. */
  get values(): Record<string, number> {
    const components = this.components;
    return Object.fromEntries(ARMOUR_CLASS_VARIANTS.map((v) => [v.key, v.formula(components)]));
  }

  /** Every AC as label/value pairs, for the sheet and the attack dialog. */
  get list(): { key: string; label: string; ranged: boolean; value: number }[] {
    const components = this.components;
    return ARMOUR_CLASS_VARIANTS.map(({ key, label, ranged, formula }) => ({
      key,
      label,
      ranged,
      value: formula(components),
    }));
  }

  /** The default AC, for anywhere that still wants a single number. */
  get value(): number {
    return this.values.melee;
  }

  get mod(): number {
    return this.#mod;
  }

  set mod(change: number) {
    this.#mod = change;
  }
}
