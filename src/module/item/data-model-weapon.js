/**
 * @file The data model for Items of type Weapon
 */
import { countedItems, DEFAULT_ITEM_ENCUMBRANCE, ITEM_ENCUMBRANCE_TYPES } from "../actor/encumbrance-points";
import costFields from "./cost-fields";
import { DEFAULT_WEAPON_DAMAGE, weaponDamageGrade } from "./weapon-damage";
export default class OseDataModelWeapon extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { SchemaField, StringField, NumberField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;
    return {
      // A dice formula. The sheet offers the four grades of weapon-damage.ts
      // and keeps anything else as typed.
      damage: new StringField({ initial: DEFAULT_WEAPON_DAMAGE }),
      description: new StringField(),
      tags: new ArrayField(new ObjectField()),
      equipped: new BooleanField(),
      save: new StringField(),
      range: new SchemaField({
        short: new NumberField({ integer: true, min: 0, initial: 0 }),
        medium: new NumberField({ integer: true, min: 0, initial: 0 }),
        long: new NumberField({ integer: true, min: 0, initial: 0 }),
      }),
      bonus: new NumberField({}),
      /**
       * The weapon's armour modifier (Melee Weapons.md, Armour column): a
       * rapier -2, a heavy crossbow +3. Added to the attack against an
       * armoured target, capped by its Armour Rating; see armour-modifier.ts.
       */
      armourModifier: new NumberField({ integer: true, initial: 0 }),
      /**
       * Weapon length, 0-5, as the melee table gives it. A cestus is 0, a pike
       * is 5. Combat Actions.md makes the difference in reach a modifier on the
       * attack roll -- the shorter weapon takes -2 -- so carrying it here is
       * what lets that be wired up.
       */
      length: new NumberField({ integer: true, min: 0, initial: 0 }),
      /**
       * Length when gripped in both hands, for the weapons the book gives two
       * of ("Spear (1/2H)", length 4/5). Null where the grip makes no odds.
       */
      lengthTwoHanded: new NumberField({ integer: true, min: 0, initial: null, nullable: true }),
      pattern: new StringField(),
      missile: new BooleanField(),
      melee: new BooleanField({ initial: true }),
      slow: new BooleanField(),
      counter: new SchemaField({
        value: new NumberField({ integer: true, min: 0, initial: 0 }),
        max: new NumberField({ integer: true, min: 0, initial: 0 }),
      }),
      ...costFields(),
      containerId: new StringField(),
      quantity: new SchemaField({
        value: new NumberField({ min: 0 }),
        max: new NumberField({ min: 0 }),
      }),
      weight: new NumberField({ min: 0 }),
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

  get #missileTag() {
    if (!this.missile) return null;
    return [
      CONFIG.OSE.auto_tags.missile,
      {
        label: `${this.range.short}/${this.range.medium}/${this.range.long}`,
        icon: "fa-bullseye",
      },
    ];
  }

  get #meleeTag() {
    if (!this.melee) return null;
    return CONFIG.OSE.auto_tags.melee;
  }

  get #slowTag() {
    if (!this.slow) return null;
    return CONFIG.OSE.auto_tags.slow;
  }

  get #armourTag() {
    if (!this.armourModifier) return null;
    const value = this.armourModifier > 0 ? `+${this.armourModifier}` : `\u2212${-this.armourModifier}`;
    return { label: game.i18n.format("VF.items.ArmourModifierTag", { value }), icon: "fa-shield-alt" };
  }

  get #saveTag() {
    if (!this.save) return null;

    return {
      label: CONFIG.OSE.saves_long[this.save],
      icon: "fa-skull",
    };
  }

  get manualTags() {
    if (!this.tags) return null;

    const tagNames = new Set(Object.values(CONFIG.OSE.auto_tags).map(({ label }) => label));
    return this.tags.filter(({ value }) => !tagNames.has(value));
  }

  /**
   * Icons that display in the inventory grid's weapon row, under "Qualities"
   *
   * @returns {Array} - An array of qualities that display in the "Qualities" column on an Actor's Inventory sheet
   */
  get qualities() {
    return [
      ...this.autoTags
        .filter((t) => !!t.image)
        .map((t) => ({
          ...t,
          title: t.label,
        })),
      ...this.manualTags,
    ];
  }

  /** The damage as the book writes it ("d8 low"), or the formula if it is no grade. */
  get #damageLabel() {
    const grade = weaponDamageGrade(this.damage);
    return grade === "custom" ? (this.damage ?? "") : game.i18n.localize(`VF.weaponDamage.${grade}.short`);
  }

  get autoTags() {
    const tagNames = Object.values(CONFIG.OSE.auto_tags);

    const autoTags = this.tags.map(({ value }) => tagNames.find(({ label }) => value === label));

    return [
      { label: this.#damageLabel, icon: "fa-tint" },
      this.#meleeTag,
      this.#missileTag,
      this.#slowTag,
      this.#armourTag,
      ...autoTags,
      this.#saveTag,
    ]
      .flat()
      .filter((t) => !!t);
  }
}
