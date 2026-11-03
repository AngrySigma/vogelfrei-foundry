/**
 * @file System-wide configuration settings. Should be reachable elsewhere in the system at `CONFIG.VF`
 */
import VogelfreiDataModelCharacterEncumbranceBasic from "./actor/data-model-classes/data-model-character-encumbrance-basic";
import VogelfreiDataModelCharacterEncumbranceComplete from "./actor/data-model-classes/data-model-character-encumbrance-complete";
import VogelfreiDataModelCharacterEncumbranceDetailed from "./actor/data-model-classes/data-model-character-encumbrance-detailed";
import VogelfreiDataModelCharacterEncumbranceDisabled from "./actor/data-model-classes/data-model-character-encumbrance-disabled";
import VogelfreiDataModelCharacterEncumbranceItemBased from "./actor/data-model-classes/data-model-character-encumbrance-item-based";
import VogelfreiDataModelCharacterEncumbranceVogelfrei from "./actor/data-model-classes/data-model-character-encumbrance-vogelfrei";
import { ITEM_ENCUMBRANCE_TYPES } from "./actor/encumbrance-points";
import { BARDING_POINTS } from "./party/travel";

/**
 * The shape of the system's global configuration object, `VF` (exposed at
 * runtime as `CONFIG.VF`). Most string values are localization keys to be
 * passed through `game.i18n`, not display text. Several derived unions below
 * (e.g. {@link Save}, {@link Attribute}) are keyed off this shape.
 */
export type VogelfreiConfig = typeof VF;

/** An ability-score key: `strength`, `intelligence`, `willpower`, `agility`, `toughness`, or `leadership`. */
export type Attribute = keyof VogelfreiConfig["scores"];

/** An exploration skill key (e.g. listen at doors, open doors, forage, hunt). */
export type ExplorationSkill = keyof VogelfreiConfig["exploration_skills"];

/** How a roll is compared against its target: exact result, at or above, or at or below. */
export type RollType = keyof VogelfreiConfig["roll_type"];

/** A saving-throw category key: `paralysis`, `poison`, `breath`, `device`, or `magic`, in the book's order. */
export type Save = keyof VogelfreiConfig["saves_long"];

/** An armour category key: `unarmored`, `light`, `heavy`, or `shield`. */
export type Armor = keyof VogelfreiConfig["armor"];

/** An alignment key: `order`, `neutrality`, or `chaos`. */
export type Alignment = keyof VogelfreiConfig["alignments"];

/** A UI colour key used by the system's theming. */
export type Color = keyof VogelfreiConfig["colors"];

/** A weapon/item quality tag key (e.g. `melee`, `missile`, `slow`, `twohanded`). */
export type InventoryItemTag = keyof VogelfreiConfig["tags"];

/** An encumbrance-scheme key: `vogelfrei`, `basic`, `detailed`, `complete`, `disabled`, or `itembased`. */
export type EncumbranceOption = keyof VogelfreiConfig["encumbranceOptions"];

/** Which token(s) damage is applied to: the `selected`, the `targeted`, or the `originalTarget`. */
export type ApplyDamageOption = keyof VogelfreiConfig["apply_damage_options"];

export const VF = {
  /** Path for system dist */
  systemPath(): string {
    return `${this.systemRoot}/dist`;
  },
  /** Root path for the Vogelfrei system */
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
    const variant = game.settings.get(game.system.id, "encumbranceOption") as keyof typeof VF.encumbranceOptions;
    return this.encumbranceOptions[variant] || this.encumbranceOptions.disabled;
  },
  /** The available encumbrance schemes, keyed by setting value to their data-model class. */
  encumbranceOptions: {
    basic: VogelfreiDataModelCharacterEncumbranceBasic,
    detailed: VogelfreiDataModelCharacterEncumbranceDetailed,
    complete: VogelfreiDataModelCharacterEncumbranceComplete,
    disabled: VogelfreiDataModelCharacterEncumbranceDisabled,
    itembased: VogelfreiDataModelCharacterEncumbranceItemBased,
    vogelfrei: VogelfreiDataModelCharacterEncumbranceVogelfrei,
  },
  /**
   * How an Item counts towards encumbrance, as localization keys. See
   * ITEM_ENCUMBRANCE_TYPES for what each one means.
   */
  item_encumbrance: Object.fromEntries(
    ITEM_ENCUMBRANCE_TYPES.map((kind) => [kind, `VF.itemEncumbrance.${kind}`]),
  ) as Record<(typeof ITEM_ENCUMBRANCE_TYPES)[number], string>,
  /** Barding an animal can wear, as localization keys. Time and Movement.md#mounts */
  barding: Object.fromEntries(Object.keys(BARDING_POINTS).map((kind) => [kind, `VF.burden.barding.${kind}`])),
  /** How a vehicle moves: pulled by a team, or by sail and oar. */
  propulsion: { drawn: "VF.vehicle.propulsion.drawn", self: "VF.vehicle.propulsion.self" },
  /** Where a vehicle goes. */
  medium: { land: "VF.vehicle.medium.land", water: "VF.vehicle.medium.water" },
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
  /**
   * Abbreviated saving-throw names, as localization keys, keyed by save
   * category. Order is the book's -- Paralyze, Poison, Breath, Device, Magic --
   * and it is a rule, not a layout: an effect that fits two categories is
   * saved against as the leftmost (Class and Career.md). Every list of saves
   * on a sheet follows it.
   */
  saves_short: {
    paralysis: "VF.saves.paralysis.short",
    poison: "VF.saves.poison.short",
    breath: "VF.saves.breath.short",
    device: "VF.saves.device.short",
    magic: "VF.saves.magic.short",
  },
  /** Full saving-throw names, as localization keys, keyed by save category. */
  saves_long: {
    paralysis: "VF.saves.paralysis.long",
    poison: "VF.saves.poison.long",
    breath: "VF.saves.breath.long",
    device: "VF.saves.device.long",
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
  /**
   * The dice a Wounds or Stamina die may be, smallest first. Class and
   * Career.md: Stamina runs 1d2 to 1d4; Wounds are 1d8 for a Warrior.
   */
  dice: ["1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "1d12", "1d20"],
  /** Social Status, as localization keys: what a character's family was. */
  statuses: {
    brass: "VF.status.brass",
    silver: "VF.status.silver",
    gold: "VF.status.gold",
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
  ammunition: {
    arrow: "VF.ammunition.arrow",
    bolt: "VF.ammunition.bolt",
    slingBullet: "VF.ammunition.slingBullet",
    firearm: "VF.ammunition.firearm",
  },
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
        label: CONFIG.VF.tags.melee,
        image: `${CONFIG.VF.assetsPath}/melee.png`,
        icon: "fa-sword",
      };
    },
    get missile() {
      return {
        label: CONFIG.VF.tags.missile,
        image: `${CONFIG.VF.assetsPath}/missile.png`,
        icon: "fa-bow-arrow",
      };
    },
    get slow() {
      return {
        label: CONFIG.VF.tags.slow,
        image: `${CONFIG.VF.assetsPath}/slow.png`,
        icon: "fa-weight-hanging",
      };
    },
    get twohanded() {
      return {
        label: CONFIG.VF.tags.twohanded,
        image: `${CONFIG.VF.assetsPath}/twohanded.png`,
        icon: "fa-hands-holding",
      };
    },
    get blunt() {
      return {
        label: CONFIG.VF.tags.blunt,
        image: `${CONFIG.VF.assetsPath}/blunt.png`,
        icon: "fa-hammer-crash",
      };
    },
    get brace() {
      return {
        label: CONFIG.VF.tags.brace,
        image: `${CONFIG.VF.assetsPath}/brace.png`,
        icon: "fa-block-brick",
      };
    },
    get splash() {
      return {
        label: CONFIG.VF.tags.splash,
        image: `${CONFIG.VF.assetsPath}/splash.png`,
        icon: "fa-burst",
      };
    },
    get reload() {
      return {
        label: CONFIG.VF.tags.reload,
        image: `${CONFIG.VF.assetsPath}/reload.png`,
        icon: "fa-gear",
      };
    },
    get charge() {
      return {
        label: CONFIG.VF.tags.charge,
        image: `${CONFIG.VF.assetsPath}/charge.png`,
        icon: "fa-person-running",
      };
    },
  },
  /** Icon/image path for each item tag, derived on access. */
  tag_images: {
    get melee() {
      return `${CONFIG.VF.assetsPath}/melee.png`;
    },
    get missile() {
      return "fa-bow-arrow";
    },
    get slow() {
      return `${CONFIG.VF.assetsPath}/slow.png`;
    },
    get twohanded() {
      return `${CONFIG.VF.assetsPath}/twohanded.png`;
    },
    get blunt() {
      return `${CONFIG.VF.assetsPath}/blunt.png`;
    },
    get brace() {
      return `${CONFIG.VF.assetsPath}/brace.png`;
    },
    get splash() {
      return `${CONFIG.VF.assetsPath}/splash.png`;
    },
    get reload() {
      return `${CONFIG.VF.assetsPath}/reload.png`;
    },
    get charge() {
      return `${CONFIG.VF.assetsPath}/charge.png`;
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
    // Monsters and NPCs.md stops at "19+", every save 2. Earlier versions
    // carried on to 22 with Spells at 4 in between; the book has no such row.
    19: {
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

export default VF;
