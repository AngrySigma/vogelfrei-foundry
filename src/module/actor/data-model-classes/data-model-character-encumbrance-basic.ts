/**
 * @file The legacy "Basic" weight-based encumbrance scheme.
 */
import VogelfreiDataModelCharacterEncumbrance, { type CharacterEncumbrance } from "./data-model-character-encumbrance";

// import { VF } from '../../config';

/**
 * A set of options for configuring the
 * Basic encumbrance scheme
 */
type Options = {
  significantTreasure: number;
};

/**
 * @todo Add template path for encumbrance bar
 * @todo Add template path for inventory item row
 */
export default class VogelfreiDataModelCharacterEncumbranceBasic
  extends VogelfreiDataModelCharacterEncumbrance
  implements CharacterEncumbrance
{
  static templateEncumbranceBar = "";

  static templateInventoryRow = "";

  /**
   * The machine-readable label for this encumbrance scheme
   */
  static type = "basic";

  /**
   * The human-readable label for this encumbrance scheme
   */
  static localizedLabel = "VF.Setting.EncumbranceBasic";

  /**
   * The base value for the amount of treasure that slows a character down
   */
  static significantTreasure = 800;

  /**
   * A map of strings to numbers indicating how heavy a set of armor is.
   * The heavier the armor, the slower you move.
   */
  static armorWeight = {
    unarmored: 0,
    light: 1,
    heavy: 2,
  };

  #weight;

  #treasureEncumbrance;

  #heaviestArmor;

  constructor(
    max = VogelfreiDataModelCharacterEncumbrance.baseEncumbranceCap,
    items: Item[] = [],
    options: Options = {} as Options,
  ) {
    super(VogelfreiDataModelCharacterEncumbranceBasic.type, max);
    this.#treasureEncumbrance =
      options?.significantTreasure || VogelfreiDataModelCharacterEncumbranceBasic.significantTreasure;

    this.#weight = items.reduce(
      (acc: number, { type, system: { treasure, quantity, weight } }: Item) =>
        type !== "item" || !treasure ? acc : acc + quantity.value * weight,
      0,
    );

    this.#heaviestArmor = items.reduce((heaviest, { type, system: { type: armorType, equipped } }) => {
      if (type !== "armor" || !equipped) return heaviest;
      if (armorType === "light" && heaviest === VogelfreiDataModelCharacterEncumbranceBasic.armorWeight.unarmored)
        return VogelfreiDataModelCharacterEncumbranceBasic.armorWeight.light;
      if (armorType === "heavy") return VogelfreiDataModelCharacterEncumbranceBasic.armorWeight.heavy;
      return heaviest;
    }, VogelfreiDataModelCharacterEncumbranceBasic.armorWeight.unarmored);
  }

  static defineSchema() {
    // @ts-expect-error League v13 client/data/fields shadows common (only declares ShaderField)
    const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

    return new SchemaField({
      variant: new StringField({
        initial: VogelfreiDataModelCharacterEncumbranceBasic.type,
      }),
      enabled: new BooleanField({ initial: true }),
      encumbered: new BooleanField({ initial: false }),
      overTreasureThreshold: new BooleanField({ initial: false }),
      overSignificantTreasureThreshold: new BooleanField({ initial: false }),
      pct: new NumberField({ integer: false, initial: 0, min: 0, max: 100 }),
      steps: new ArrayField(new NumberField()),
      value: new NumberField({ integer: false }),
      max: new NumberField({
        integer: false,
        initial: VogelfreiDataModelCharacterEncumbrance.baseEncumbranceCap,
      }),
      atFirstBreakpoint: new BooleanField({ initial: false }),
      atSecondBreakpoint: new BooleanField({ initial: false }),
      atThirdBreakpoint: new BooleanField({ initial: false }),
    });
  }

  get steps() {
    return [(100 * this.#treasureEncumbrance) / this.max];
  }

  get overTreasureThreshold() {
    return this.value >= this.#treasureEncumbrance;
  }

  get value() {
    return this.#weight;
  }

  get overSignificantTreasureThreshold() {
    return this.value >= this.#treasureEncumbrance;
  }

  get atThirdBreakpoint() {
    return (
      this.#heaviestArmor === VogelfreiDataModelCharacterEncumbranceBasic.armorWeight.heavy &&
      this.value >= this.#treasureEncumbrance
    );
  }

  get atSecondBreakpoint() {
    const isHeavy = this.#heaviestArmor === VogelfreiDataModelCharacterEncumbranceBasic.armorWeight.heavy;
    const isLightWithTreasure =
      this.#heaviestArmor === VogelfreiDataModelCharacterEncumbranceBasic.armorWeight.light &&
      this.value >= this.#treasureEncumbrance;
    return isHeavy || isLightWithTreasure;
  }

  get atFirstBreakpoint() {
    return (
      this.#heaviestArmor === VogelfreiDataModelCharacterEncumbranceBasic.armorWeight.light ||
      this.overSignificantTreasureThreshold
    );
  }
}
