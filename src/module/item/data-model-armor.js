/**
 * @file The data model for Items of type Armor
 */
import { DEFAULT_ITEM_ENCUMBRANCE, ITEM_ENCUMBRANCE_TYPES, countedItems } from "../actor/encumbrance-points";
export default class OseDataModelArmor extends foundry.abstract.TypeDataModel {
  static ArmorTypes = {
    unarmored: "VF.armor.unarmored",
    light: "VF.armor.light",
    medium: "VF.armor.medium",
    heavy: "VF.armor.heavy",
    shield: "VF.armor.shield",
  };

  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;
    return {
      type: new StringField({
        initial: "light",
        choices: Object.keys(OseDataModelArmor.ArmorTypes),
      }),
      // Bonuses added to AC, not replacements for it. Body armour sets both to
      // its Armour Rating; shields are asymmetric -- a buckler helps only in
      // melee, a pavise only at range, a shield both by different amounts.
      acMelee: new NumberField({ integer: true, initial: 0 }),
      acRanged: new NumberField({ integer: true, initial: 0 }),
      description: new StringField(),
      tags: new ArrayField(new ObjectField()),
      equipped: new BooleanField(),
      cost: new NumberField({ min: 0, initial: 0 }),
      containerId: new StringField(),
      quantity: new SchemaField({
        value: new NumberField({ min: 0, initial: 0 }),
        max: new NumberField({ min: 0, initial: 0 }),
      }),
      weight: new NumberField({ min: 0, initial: 0 }),
      itemslots: new NumberField({ min: 0, initial: 1 }),
encumbrance: new StringField({
        initial: DEFAULT_ITEM_ENCUMBRANCE,
        choices: [...ITEM_ENCUMBRANCE_TYPES],
      }),
      stackSize: new NumberField({ min: 0, integer: true, initial: 0 }),
    };
  }

  /**
   * How many countable items this row is worth under the Vogelfrei point
   * scheme, after stacking. Oversized and non-encumbering rows still report a
   * count -- the sheet shows what kind they are alongside it.
   */
  get encumbranceCount() {
    const held = this.quantity?.value ?? 0;
    return held > 0 ? countedItems(held, this.stackSize) : 1;
  }

  get manualTags() {
    if (!this.tags) return null;

    const tagNames = new Set(Object.values(CONFIG.OSE.auto_tags).map(({ label }) => label));
    return this.tags
      .filter(({ value }) => !tagNames.has(value))
      .map(({ title, value }) => ({
        title,
        value,
        label: value,
      }));
  }

  get autoTags() {
    const tagNames = Object.values(CONFIG.OSE.auto_tags);

    const autoTags = this.tags.map(({ value }) => tagNames.find(({ label }) => value === label));

    return [{ label: OseDataModelArmor.ArmorTypes[this.type], icon: "fa-tshirt" }, ...autoTags, ...this.manualTags]
      .flat()
      .filter((t) => !!t);
  }
}
