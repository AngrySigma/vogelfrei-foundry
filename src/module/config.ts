/**
 * @file System-wide configuration settings. Should be reachable elsewhere in the system at `CONFIG.OSE`
 */
import OseDataModelCharacterEncumbranceBasic from "./actor/data-model-classes/data-model-character-encumbrance-basic";
import OseDataModelCharacterEncumbranceComplete from "./actor/data-model-classes/data-model-character-encumbrance-complete";
import OseDataModelCharacterEncumbranceDetailed from "./actor/data-model-classes/data-model-character-encumbrance-detailed";
import OseDataModelCharacterEncumbranceDisabled from "./actor/data-model-classes/data-model-character-encumbrance-disabled";
import OseDataModelCharacterEncumbranceItemBased from "./actor/data-model-classes/data-model-character-encumbrance-item-based";
import OseDataModelCharacterEncumbranceVogelfrei from "./actor/data-model-classes/data-model-character-encumbrance-vogelfrei";
import { ITEM_ENCUMBRANCE_TYPES } from "./actor/encumbrance-points";

import { CLASSIC_FANTASY_CLASSES } from "./classes/classic-fantasy-classes";

/**
 * The shape of the system's global configuration object, `OSE` (exposed at
 * runtime as `CONFIG.OSE`). Most string values are localization keys to be
 * passed through `game.i18n`, not display text. Several derived unions below
 * (e.g. {@link Save}, {@link Attribute}) are keyed off this shape.
 */
export type OseConfig = typeof OSE;

/** An ability-score key: `strength`, `intelligence`, `willpower`, `agility`, `toughness`, or `leadership`. */
export type Attribute = keyof OseConfig["scores"];

/** An exploration skill key (e.g. listen at doors, open doors, forage, hunt). */
export type ExplorationSkill = keyof OseConfig["exploration_skills"];

/** How a roll is compared against its target: exact result, at or above, or at or below. */
export type RollType = keyof OseConfig["roll_type"];

/** A saving-throw category key: `poison`, `device`, `paralysis`, `breath`, or `magic`. */
export type Save = keyof OseConfig["saves_long"];

/** An armour category key: `unarmored`, `light`, `heavy`, or `shield`. */
export type Armor = keyof OseConfig["armor"];

/** An alignment key: `order`, `neutrality`, or `chaos`. */
export type Alignment = keyof OseConfig["alignments"];

/** A UI colour key used by the system's theming. */
export type Color = keyof OseConfig["colors"];

/** A weapon/item quality tag key (e.g. `melee`, `missile`, `slow`, `twohanded`). */
export type InventoryItemTag = keyof OseConfig["tags"];

/** An encumbrance-scheme key: `vogelfrei`, `basic`, `detailed`, `complete`, `disabled`, or `itembased`. */
export type EncumbranceOption = keyof OseConfig["encumbranceOptions"];

/** Which token(s) damage is applied to: the `selected`, the `targeted`, or the `originalTarget`. */
export type ApplyDamageOption = keyof OseConfig["apply_damage_options"];

export const OSE = {
  /** Path for system dist */
  systemPath(): string {
    return `${this.systemRoot}/dist`;
  },
  /** Root path for OSE system */
  get systemRoot(): string {
    return `/systems/${game.system.id}`;
  },
  /** Path for system assets */
  get assetsPath(): string {
    return `${this.systemRoot}/assets`;
  },
  /**
   * The encumbrance scheme currently selected in world settings, resolved to
   * its data-model class. Falls back to the disabled scheme if unset.
   */
  get encumbrance() {
    const variant = game.settings.get(game.system.id, "encumbranceOption") as keyof typeof OSE.encumbranceOptions;
    return this.encumbranceOptions[variant] || this.encumbranceOptions.disabled;
  },
  /** Character class definitions, grouped by rules setting (e.g. classic fantasy). */
  classes: {
    classic: CLASSIC_FANTASY_CLASSES,
  },
  /** The available encumbrance schemes, keyed by setting value to their data-model class. */
  encumbranceOptions: {
    basic: OseDataModelCharacterEncumbranceBasic,
    detailed: OseDataModelCharacterEncumbranceDetailed,
    complete: OseDataModelCharacterEncumbranceComplete,
    disabled: OseDataModelCharacterEncumbranceDisabled,
    itembased: OseDataModelCharacterEncumbranceItemBased,
    vogelfrei: OseDataModelCharacterEncumbranceVogelfrei,
  },
  /**
   * How an Item counts towards encumbrance, as localization keys. See
   * ITEM_ENCUMBRANCE_TYPES for what each one means.
   */
  item_encumbrance: Object.fromEntries(
    ITEM_ENCUMBRANCE_TYPES.map((kind) => [kind, `VF.itemEncumbrance.${kind}`]),
  ) as Record<(typeof ITEM_ENCUMBRANCE_TYPES)[number], string>,
  /** Full ability-score names, as localization keys, keyed by ability. */
  scores: {
    strength: "VF.scores.strength.long",
    intelligence: "VF.scores.intelligence.long",
    agility: "VF.scores.agility.long",
    willpower: "VF.scores.willpower.long",
    toughness: "VF.scores.toughness.long",
    leadership: "VF.scores.leadership.long",
  },
  /** Abbreviated ability-score names, as localization keys, keyed by ability. */
  scores_short: {
    strength: "VF.scores.strength.short",
    intelligence: "VF.scores.intelligence.short",
    agility: "VF.scores.agility.short",
    willpower: "VF.scores.willpower.short",
    toughness: "VF.scores.toughness.short",
    leadership: "VF.scores.leadership.short",
  },
  /** Full exploration skill names, as localization keys, keyed by skill. */
  exploration_skills: {
    architecture: "VF.exploration.architecture.long",
    bushcraft: "VF.exploration.bushcraft.long",
    climbing: "VF.exploration.climbing.long",
    languages: "VF.exploration.languages.long",
    search: "VF.exploration.search.long",
    sleightOfHand: "VF.exploration.sleightOfHand.long",
    stealth: "VF.exploration.stealth.long",
    tinkering: "VF.exploration.tinkering.long",
    doors: "VF.exploration.doors.long",
  },
  /** Abbreviated exploration skill names, as localization keys, keyed by skill. */
  exploration_skills_short: {
    architecture: "VF.exploration.architecture.abrev",
    bushcraft: "VF.exploration.bushcraft.abrev",
    climbing: "VF.exploration.climbing.abrev",
    languages: "VF.exploration.languages.abrev",
    search: "VF.exploration.search.abrev",
    sleightOfHand: "VF.exploration.sleightOfHand.abrev",
    stealth: "VF.exploration.stealth.abrev",
    tinkering: "VF.exploration.tinkering.abrev",
    doors: "VF.exploration.doors.abrev",
  },
  /** Comparison operators shown for a roll's target: equal, at-or-above, at-or-below. */
  roll_type: {
    result: "=",
    above: "≥",
    below: "≤",
  },
  /** Abbreviated saving-throw names, as localization keys, keyed by save category. */
  saves_short: {
    poison: "VF.saves.poison.short",
    device: "VF.saves.device.short",
    paralysis: "VF.saves.paralysis.short",
    breath: "VF.saves.breath.short",
    magic: "VF.saves.magic.short",
  },
  /** Full saving-throw names, as localization keys, keyed by save category. */
  saves_long: {
    poison: "VF.saves.poison.long",
    device: "VF.saves.device.long",
    paralysis: "VF.saves.paralysis.long",
    breath: "VF.saves.breath.long",
    magic: "VF.saves.magic.long",
  },
  /**
   * The three alignments, as localization keys. Character/Alignment.md: "The
   * three alignments are Order, Neutrality, and Chaos." Neutrality is where
   * every mortal starts.
   */
  alignments: {
    order: "VF.alignment.order",
    neutrality: "VF.alignment.neutrality",
    chaos: "VF.alignment.chaos",
  },
  /** Armour category names, as localization keys, keyed by category. */
  armor: {
    unarmored: "VF.armor.unarmored",
    light: "VF.armor.light",
    medium: "VF.armor.medium",
    heavy: "VF.armor.heavy",
    shield: "VF.armor.shield",
  },
  /** Targeting modes for applying damage, keyed by mode. */
  apply_damage_options: {
    selected: "selected",
    targeted: "targeted",
    originalTarget: "originalTarget",
  },
  /** Named UI colours, as localization keys, keyed by colour. */
  colors: {
    green: "VF.colors.green",
    red: "VF.colors.red",
    yellow: "VF.colors.yellow",
    purple: "VF.colors.purple",
    blue: "VF.colors.blue",
    orange: "VF.colors.orange",
    white: "VF.colors.white",
  },
  /** The languages a character may know, as display names. */
  languages: [
    "Common",
    "Lawful",
    "Chaotic",
    "Neutral",
    "Bugbear",
    "Doppelgänger",
    "Dragon",
    "Dwarvish",
    "Elvish",
    "Gargoyle",
    "Gnoll",
    "Gnomish",
    "Goblin",
    "Halfling",
    "Harpy",
    "Hobgoblin",
    "Kobold",
    "Lizard Man",
    "Medusa",
    "Minotaur",
    "Ogre",
    "Orcish",
    "Pixie",
  ],
  /** Weapon/item quality tag labels, as localization keys, keyed by tag. */
  tags: {
    melee: "VF.items.Melee",
    missile: "VF.items.Missile",
    slow: "VF.items.Slow",
    twohanded: "VF.items.TwoHanded",
    blunt: "VF.items.Blunt",
    brace: "VF.items.Brace",
    splash: "VF.items.Splash",
    reload: "VF.items.Reload",
    charge: "VF.items.Charge",
  },
  /** Display metadata (label, image, icon) for each item tag, derived on access. */
  auto_tags: {
    get melee() {
      return {
        label: CONFIG.OSE.tags.melee,
        image: `${CONFIG.OSE.assetsPath}/melee.png`,
        icon: "fa-sword",
      };
    },
    get missile() {
      return {
        label: CONFIG.OSE.tags.missile,
        image: `${CONFIG.OSE.assetsPath}/missile.png`,
        icon: "fa-bow-arrow",
      };
    },
    get slow() {
      return {
        label: CONFIG.OSE.tags.slow,
        image: `${CONFIG.OSE.assetsPath}/slow.png`,
        icon: "fa-weight-hanging",
      };
    },
    get twohanded() {
      return {
        label: CONFIG.OSE.tags.twohanded,
        image: `${CONFIG.OSE.assetsPath}/twohanded.png`,
        icon: "fa-hands-holding",
      };
    },
    get blunt() {
      return {
        label: CONFIG.OSE.tags.blunt,
        image: `${CONFIG.OSE.assetsPath}/blunt.png`,
        icon: "fa-hammer-crash",
      };
    },
    get brace() {
      return {
        label: CONFIG.OSE.tags.brace,
        image: `${CONFIG.OSE.assetsPath}/brace.png`,
        icon: "fa-block-brick",
      };
    },
    get splash() {
      return {
        label: CONFIG.OSE.tags.splash,
        image: `${CONFIG.OSE.assetsPath}/splash.png`,
        icon: "fa-burst",
      };
    },
    get reload() {
      return {
        label: CONFIG.OSE.tags.reload,
        image: `${CONFIG.OSE.assetsPath}/reload.png`,
        icon: "fa-gear",
      };
    },
    get charge() {
      return {
        label: CONFIG.OSE.tags.charge,
        image: `${CONFIG.OSE.assetsPath}/charge.png`,
        icon: "fa-person-running",
      };
    },
  },
  /** Icon/image path for each item tag, derived on access. */
  tag_images: {
    get melee() {
      return `${CONFIG.OSE.assetsPath}/melee.png`;
    },
    get missile() {
      return "fa-bow-arrow";
    },
    get slow() {
      return `${CONFIG.OSE.assetsPath}/slow.png`;
    },
    get twohanded() {
      return `${CONFIG.OSE.assetsPath}/twohanded.png`;
    },
    get blunt() {
      return `${CONFIG.OSE.assetsPath}/blunt.png`;
    },
    get brace() {
      return `${CONFIG.OSE.assetsPath}/brace.png`;
    },
    get splash() {
      return `${CONFIG.OSE.assetsPath}/splash.png`;
    },
    get reload() {
      return `${CONFIG.OSE.assetsPath}/reload.png`;
    },
    get charge() {
      return `${CONFIG.OSE.assetsPath}/charge.png`;
    },
  },
  /**
   * Monster saving-throw target numbers, keyed by the minimum Hit Dice for the
   * row, then by save category (`d`/`w`/`p`/`b`/`s`).
   */
  monster_saves: {
    0: {
      d: 14,
      w: 15,
      p: 16,
      b: 17,
      s: 18,
    },
    1: {
      d: 12,
      w: 13,
      p: 14,
      b: 15,
      s: 16,
    },
    4: {
      d: 10,
      w: 11,
      p: 12,
      b: 13,
      s: 14,
    },
    7: {
      d: 8,
      w: 9,
      p: 10,
      b: 10,
      s: 12,
    },
    10: {
      d: 6,
      w: 7,
      p: 8,
      b: 8,
      s: 10,
    },
    13: {
      d: 4,
      w: 5,
      p: 6,
      b: 5,
      s: 8,
    },
    16: {
      d: 2,
      w: 3,
      p: 4,
      b: 3,
      s: 6,
    },
    19: {
      d: 2,
      w: 2,
      p: 2,
      b: 2,
      s: 4,
    },
    22: {
      d: 2,
      w: 2,
      p: 2,
      b: 2,
      s: 2,
    },
  },
  /** Monster THAC0 (attack value), keyed by the minimum Hit Dice for the row. */
  monster_thac0: {
    0: 20,
    1: 19,
    2: 18,
    3: 17,
    4: 16,
    5: 15,
    6: 14,
    7: 13,
    9: 12,
    10: 11,
    12: 10,
    14: 9,
    16: 8,
    18: 7,
    20: 6,
    22: 5,
  },
};

export default OSE;
