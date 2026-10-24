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
 * Rules: docs/Encounters/Combat Actions.md#attack,
 *        docs/Equipment/Armor.md#against-a-firearm
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

  /** Melee bonus from an equipped shield or buckler. */
  shieldMelee: number;

  /** Ranged bonus from an equipped shield or buckler. */
  shieldRanged: number;

  /** Firearm rating of worn armour: what it is worth against a ball. */
  armourFirearm: number;

  /** Firearm rating of an equipped shield. Only a target of proof has one. */
  shieldFirearm: number;

  /**
   * Guard, Press or Defensive Fighting, as a change to melee and ranged AC.
   * See stance.ts. Never applies against a firearm.
   */
  stance: number;

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

  /**
   * Whether the sheet shows this number. Situational variants are false: they
   * are still offered in the attack dialog, but a defender does not carry them
   * around, and printing every one of them makes the block unreadable. A sheet
   * variant also wants an icon -- see .ac-entry[data-key] in character.scss.
   */
  onSheet: boolean;

  formula: (components: ArmourClassComponents) => number;
};

/** Base AC before any component is added. The same for every kind of attack. */
export const BASE_AC = 10;

/**
 * Every AC a character carries. Order is the order they appear on the sheet and
 * in the attack dialog.
 */
export const ARMOUR_CLASS_VARIANTS: readonly ArmourClassVariant[] = [
  {
    key: "melee",
    label: "VF.ac.melee",
    ranged: false,
    onSheet: true,
    formula: (c) => BASE_AC + c.agility + c.weaponSkill + c.armourMelee + c.shieldMelee + c.stance + c.mod,
  },
  {
    // A dragon is not put off by a skilled blade, so Weapon Skill does not
    // defend against it.
    key: "meleeMonster",
    label: "VF.ac.meleeMonster",
    ranged: false,
    onSheet: false,
    formula: (c) => BASE_AC + c.agility + c.armourMelee + c.shieldMelee + c.stance + c.mod,
  },
  {
    key: "ranged",
    label: "VF.ac.ranged",
    ranged: true,
    onSheet: true,
    formula: (c) => BASE_AC + c.agility + c.armourRanged + c.shieldRanged + c.stance + c.mod,
  },
  {
    // Against a shot nobody dodges and no swordsmanship parries: the target
    // keeps the base, its armour's firearm rating, a target of proof's, and
    // the free-form modifier. Not even a negative Agility applies, and no
    // stance -- the rule is "10 + the armour's firearm rating, and nothing
    // else". Combat Actions.md#ranged, Firearms.md#firearm-traits.
    key: "firearm",
    label: "VF.ac.firearm",
    ranged: true,
    onSheet: true,
    formula: (c) => BASE_AC + c.armourFirearm + c.shieldFirearm + c.mod,
  },
  {
    // An unaware target keeps only what it is wearing. Surprise takes away the
    // benefit of being nimble, not the penalty of being clumsy -- a negative
    // Agility modifier still tells against you, a positive one stops helping.
    //
    // Situational: the attacker picks it in the dialog, so it stays off the
    // sheet.
    key: "surprised",
    label: "VF.ac.surprised",
    ranged: false,
    onSheet: false,
    formula: (c) => BASE_AC + Math.min(0, c.agility) + c.armourMelee + c.mod,
  },
] as const;

type ArmourItem = {
  system: {
    type: string;
    acMelee?: number;
    acRanged?: number;
    acFirearm?: number;
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

  #stance: number;

  /**
   * @param armour - Equipped Items of type armor. At most one body armour and
   *   one shield are expected; equipping enforces that.
   * @param agility - The Agility modifier.
   * @param weaponSkill - The character's Weapon Skill.
   * @param mod - Free-form AC modifier.
   * @param stance - The current stance's AC change, from stanceAc().
   */
  constructor(armour: ArmourItem[] = [], agility = 0, weaponSkill = 0, mod = 0, stance = 0) {
    this.#armour = armour;
    this.#agility = agility;
    this.#weaponSkill = weaponSkill;
    this.#mod = mod;
    this.#stance = stance;
  }

  #sum(isShield: boolean, value: (system: ArmourItem["system"]) => number): number {
    return this.#armour
      .filter(({ system: { type } }) => (type === "shield") === isShield)
      .reduce((total, { system }) => total + value(system), 0);
  }

  get components(): ArmourClassComponents {
    return {
      agility: this.#agility,
      weaponSkill: this.#weaponSkill,
      armourMelee: this.#sum(false, ({ acMelee }) => acMelee ?? 0),
      armourRanged: this.#sum(false, ({ acRanged }) => acRanged ?? 0),
      shieldMelee: this.#sum(true, ({ acMelee }) => acMelee ?? 0),
      shieldRanged: this.#sum(true, ({ acRanged }) => acRanged ?? 0),
      armourFirearm: this.#sum(false, ({ acFirearm }) => acFirearm ?? 0),
      shieldFirearm: this.#sum(true, ({ acFirearm }) => acFirearm ?? 0),
      stance: this.#stance,
      mod: this.#mod,
    };
  }

  /**
   * The Armour Rating a weapon's armour modifier is capped by, in melee: the
   * worn armour and the shield together. See armour-modifier.ts.
   */
  get armourRatingMelee(): number {
    const { armourMelee, shieldMelee } = this.components;
    return armourMelee + shieldMelee;
  }

  /** As armourRatingMelee, against a bow or crossbow. */
  get armourRatingRanged(): number {
    const { armourRanged, shieldRanged } = this.components;
    return armourRanged + shieldRanged;
  }

  /** Every AC value, keyed by variant. */
  get values(): Record<string, number> {
    const components = this.components;
    return Object.fromEntries(ARMOUR_CLASS_VARIANTS.map((v) => [v.key, v.formula(components)]));
  }

  /** Every AC as label/value pairs, for the attack dialog. */
  get list(): { key: string; label: string; ranged: boolean; onSheet: boolean; value: number }[] {
    const components = this.components;
    return ARMOUR_CLASS_VARIANTS.map(({ key, label, ranged, onSheet, formula }) => ({
      key,
      label,
      ranged,
      onSheet,
      value: formula(components),
    }));
  }

  /** The ACs a character carries about with them, for the sheet. */
  get sheetList(): { key: string; label: string; ranged: boolean; onSheet: boolean; value: number }[] {
    return this.list.filter(({ onSheet }) => onSheet);
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
