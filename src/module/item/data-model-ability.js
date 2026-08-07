/**
 * @file The data model for Items of type Ability
 */
import OseTags from "../helpers-tags";

export default class OseDataModelAbility extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const { StringField, NumberField, BooleanField, ArrayField, ObjectField } = foundry.data.fields;
    return {
      save: new StringField(),
      pattern: new StringField(),
      requirements: new StringField(),
      // Abilities are how extra skills are added, so a new one arrives ready to
      // roll as one: 1d6 at or below the character's chance, which every skill
      // starts at 1 in 6. Anything else is a couple of edits away.
      roll: new StringField({ initial: "1d6" }),
      rollType: new StringField({ initial: "below" }),
      rollTarget: new NumberField({ integer: true, initial: 1 }),
      blindroll: new BooleanField(),
      description: new StringField(),
      tags: new ArrayField(new ObjectField()),
    };
  }

  get #rollTag() {
    if (!this.roll) return null;

    const rollLabel = game.i18n.localize("VF.items.Roll");

    const rollFormula = OseTags.rollTagFormula({
      actor: this.parent?.actor,
      data: this._source,
    });

    const rollTarget = OseTags.rollTagTarget({
      rollType: this.rollType,
      rollTarget: this.rollTarget,
    });

    return {
      label: `${rollLabel} ${rollFormula}${rollTarget}`,
    };
  }

  get #saveTag() {
    if (!this.save) return null;

    return {
      label: CONFIG.OSE.saves_long[this.save],
      icon: "fa-skull",
    };
  }

  get manualTags() {
    return this.tags || [];
  }

  get autoTags() {
    return [
      ...(this.requirements?.split(",").map((req) => ({ label: req.trim() })) || []),
      this.#rollTag,
      this.#saveTag,
    ].filter((t) => !!t);
  }
}
