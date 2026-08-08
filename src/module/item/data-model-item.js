/**
 * @file The data model for Items of type Ability
 */
import { countedItems, DEFAULT_ITEM_ENCUMBRANCE, ITEM_ENCUMBRANCE_TYPES } from "../actor/encumbrance-points";
import costFields from "./cost-fields";
export default class OseDataModelItem extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;
    return {
      treasure: new BooleanField(),
      description: new StringField(),
      tags: new ArrayField(new ObjectField()),
      equipped: new BooleanField(),
      ...costFields(),
      containerId: new StringField(),
      quantity: new SchemaField({
        value: new NumberField({ min: 0, initial: 1 }),
        max: new NumberField({ min: 0, initial: 0 }),
      }),
      weight: new NumberField({ min: 0, initial: 0 }),
      itemslots: new NumberField({ min: 0, initial: 0 }),
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

  get cumulativeWeight() {
    return this.weight * this.quantity.value;
  }

  get cumulativeCost() {
    return this.cost * this.quantity.value;
  }

  get cumulativeItemslots() {
    return Math.ceil(this.itemslots * this.quantity.value);
  }

  static migrateData(source) {
    if (source.details?.description && !source.description) source.description = source.details.description;
    return source;
  }

  get manualTags() {
    if (!this.tags) return null;

    const tagNames = new Set(Object.values(CONFIG.OSE.auto_tags).map(({ label }) => label));
    return this.tags
      .filter(({ value }) => !tagNames.has(value))
      .map(({ title, value }) => ({ title, value, label: value }));
  }

  get autoTags() {
    const tagNames = Object.values(CONFIG.OSE.auto_tags);

    const autoTags = this.tags.map(({ value }) => tagNames.find(({ label }) => value === label));

    return [...autoTags, ...this.manualTags].flat().filter((t) => !!t);
  }

  get isCoinsOrGems() {
    if (!this.treasure) return false;

    if (this.tags?.some((t) => t.value === "gem" || t.value === "gems" || t.value === "coin" || t.value === "coins")) {
      return true;
    }

    if (!this.parent?.name) return false;

    const itemName = this.parent.name.toLowerCase();
    if (itemName.endsWith(" coins")) return true;

    const coins = [
      "cp",
      "sp",
      "ep",
      "gp",
      "pp",
      game.i18n.localize("VF.items.gp.short").toLowerCase(),
      game.i18n.localize("VF.items.gp.long").toLowerCase(),
      "[00.01] copper (cp)",
      "[00.10] silver (sp)",
      "[00.50] electrum (ep)",
      "[01.00] gold (gp)",
      "[10.00] platinum (pp)",
    ];

    return coins.includes(itemName);
  }
}
