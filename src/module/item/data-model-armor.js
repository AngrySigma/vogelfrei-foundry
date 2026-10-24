/**
 * @file The data model for Items of type Armor
 */
import { countedItems, DEFAULT_ITEM_ENCUMBRANCE, ITEM_ENCUMBRANCE_TYPES } from "../actor/encumbrance-points";
import { proofToFirearmRating } from "../migrate-playtest-rules-core";
import costFields from "./cost-fields";
export default class OseDataModelArmor extends foundry.abstract.TypeDataModel {
  static ArmorTypes = {
    unarmored: "VF.armor.unarmored",
    light: "VF.armor.light",
    medium: "VF.armor.medium",
    heavy: "VF.armor.heavy",
    shield: "VF.armor.shield",
  };

  /**
   * Armour saved before the playtest rules carries a Proof grade instead of a
   * firearm rating. Convert it on load, so every copy -- on a sheet, in a
   * token, in a compendium -- reads right before anything refreshes it.
   *
   * @param {object} source - The stored system data.
   * @returns {object} The data, migrated.
   */
  static migrateData(source) {
    if (source && "proof" in source && source.acFirearm === undefined) {
      source.acFirearm = proofToFirearmRating(source.proof, source.acRanged);
    }
    return source;
  }

  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;
    return {
      type: new StringField({
        initial: "light",
        choices: Object.keys(OseDataModelArmor.ArmorTypes),
      }),
      // Bonuses added to AC, not replacements for it. Body armour sets both to
      // its Armour Rating; shields are asymmetric -- a buckler helps only in
      // melee, a target in both by different amounts.
      acMelee: new NumberField({ integer: true, initial: 0 }),
      acRanged: new NumberField({ integer: true, initial: 0 }),
      // Armor.md, Firearm column: what the armour is worth against a ball.
      // Only a firearm looks at this; everything else meets the rating above.
      acFirearm: new NumberField({ integer: true, initial: 0 }),
      // The Enc column of Armor.md: points the harness costs while worn, or a
      // shield while carried. Null falls back to the points for its type.
      encumbrancePoints: new NumberField({ integer: true, min: 0, initial: null, nullable: true }),
      description: new StringField(),
      tags: new ArrayField(new ObjectField()),
      equipped: new BooleanField(),
      ...costFields(),
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

    const firearm = this.acFirearm
      ? { label: game.i18n.format("VF.armor.firearm.tag", { value: this.acFirearm }), icon: "fa-crosshairs" }
      : null;

    return [
      { label: OseDataModelArmor.ArmorTypes[this.type], icon: "fa-tshirt" },
      firearm,
      ...autoTags,
      ...this.manualTags,
    ]
      .flat()
      .filter((t) => !!t);
  }
}
