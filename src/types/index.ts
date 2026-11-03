/**
 * @file Public type surface for `@vogelfrei/types`.
 *
 * This declaration-only entrypoint re-exports types directly from the system's
 * TypeScript sources. Relative paths let rollup-plugin-dts inline the symbols
 * in the shipped declarations.
 */

export type { default as CharacterAC } from "../module/actor/data-model-classes/data-model-character-ac";
export type { CharacterEncumbrance } from "../module/actor/data-model-classes/data-model-character-encumbrance";
export type { CharacterMove } from "../module/actor/data-model-classes/data-model-character-move";
export type { CharacterScores } from "../module/actor/data-model-classes/data-model-character-scores";
export type { CharacterSpells } from "../module/actor/data-model-classes/data-model-character-spells";
export type { ExplorationSkills } from "../module/actor/exploration-skills";
export type {
  ApplyDamageOption,
  Armor,
  Attribute,
  Color,
  EncumbranceOption,
  ExplorationSkill,
  InventoryItemTag,
  RollType,
  Save,
  VogelfreiConfig,
} from "../module/config";
