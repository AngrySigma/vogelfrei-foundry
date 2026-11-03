/**
 * @file The legacy "Detailed" weight-based encumbrance scheme.
 */
import VogelfreiDataModelCharacterEncumbrance, { type CharacterEncumbrance } from "./data-model-character-encumbrance";

// import { VF } from '../../config';

/**
 * @todo Add template path for encumbrance bar
 * @todo Add template path for inventory item row
 */
export default class VogelfreiDataModelCharacterEncumbranceDetailed
  extends VogelfreiDataModelCharacterEncumbrance
  implements CharacterEncumbrance
{
  static templateEncumbranceBar = "";

  static templateInventoryRow = "";

  /**
   * The machine-readable label for this encumbrance scheme
   */
  static type = "detailed";

  /**
   * The human-readable label for this encumbrance scheme
   */
  static localizedLabel = "VF.Setting.EncumbranceDetailed";

  /**
   * The weight (in coins) to add to the total weight value if the character has adventuring gear
   */
  static gearWeight = 80;

  #weight = 0;

  #hasAdventuringGear;

  constructor(max = VogelfreiDataModelCharacterEncumbrance.baseEncumbranceCap, items: Item[] = []) {
    super(VogelfreiDataModelCharacterEncumbranceDetailed.type, max);
    this.#hasAdventuringGear = items.some((i: Item) => i.type === "item" && !i.system.treasure);
    this.#weight =
      items.reduce((acc, { type, system: { treasure, quantity, weight } }: Item) => {
        if (type === "spell" || type === "ability") return acc;

        let value = acc;

        if (type === "item" && treasure) value += quantity.value * weight;
        if (["weapon", "armor", "container"].includes(type)) value += weight;

        return value;
      }, 0) + (this.#hasAdventuringGear ? VogelfreiDataModelCharacterEncumbranceDetailed.gearWeight : 0);
  }

  static defineSchema() {
    // @ts-expect-error League v13 client/data/fields shadows common (only declares ShaderField)
    const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

    return new SchemaField({
      variant: new StringField({
        initial: VogelfreiDataModelCharacterEncumbranceDetailed.type,
      }),
      enabled: new BooleanField({ initial: true }),
      encumbered: new BooleanField({ initial: false }),
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

  // eslint-disable-next-line class-methods-use-this
  get steps() {
    return Object.values(VogelfreiDataModelCharacterEncumbrance.encumbranceSteps);
  }

  get value(): number {
    return this.#weight;
  }
}
