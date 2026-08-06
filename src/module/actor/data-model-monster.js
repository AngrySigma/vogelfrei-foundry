/**
 * @file The data model for Actors of type Monster
 */
// Encumbrance schemes
import OseDataModelCharacterEncumbranceDisabled from "./data-model-classes/data-model-character-encumbrance-disabled";
import OseDataModelCharacterMove from "./data-model-classes/data-model-character-move";
import OseDataModelCharacterSpells from "./data-model-classes/data-model-character-spells";

const getItemsOfActorOfType = (actor, filterType, filterFn = null) =>
  actor.items.filter(({ type }) => type === filterType).filter(filterFn || (() => true));

export default class OseDataModelMonster extends foundry.abstract.TypeDataModel {
  prepareDerivedData() {
    this.encumbrance = new OseDataModelCharacterEncumbranceDisabled();
    this.spells = new OseDataModelCharacterSpells(this.spells, this.#spellList);
    this.config.movementAuto = false;
    this.movement = new OseDataModelCharacterMove(this.encumbrance, false, this.movement.base);
  }

  /**
   * @inheritdoc
   */
  static migrateData(source) {
    OseDataModelMonster.#migrateMonsterLanguages(source);
    OseDataModelMonster.#migrateCantrips(source);

    // biome-ignore lint/complexity/noThisInStatic: super.migrateData() correctly calls parent static method
    return super.migrateData(source);
  }

  /**
   * Use an empty array for system.languages.value
   * in order to suppress Polyglot errors.
   *
   * @param {OseDataModelMonster} source - Source data to migrate
   */
  static #migrateMonsterLanguages(source) {
    const languages = source.languages ?? {};

    // If languages.value isn't an iterable, use an empty array
    if (typeof languages?.value?.[Symbol.iterator] !== "function") {
      languages.value = [];
    }
  }

  /**
   * Ensure cantrips (level 0 spells) exist in the spells object.
   * @param {OseDataModelMonster} source - Source data to migrate
   */
  static #migrateCantrips(source) {
    const spells = source.spells ?? {};

    // If there are spells but no cantrips (level 0 spells),
    // add an empty cantrip entry.
    if (spells && !spells["0"]) {
      spells["0"] = { max: 0, value: 0 };
    }
  }

  // @todo define schema options; stuff like min/max values and so on.
  static defineSchema() {
    const { StringField, NumberField, BooleanField, ObjectField, SchemaField } = foundry.data.fields;

    return {
      spells: new ObjectField(),
      details: new ObjectField(),
      ac: new ObjectField(),
      aac: new ObjectField(),
      ws: new NumberField({ integer: true, initial: 0 }),
      bs: new NumberField({ integer: true, initial: 0 }),
      encumbrance: new SchemaField({
        value: new NumberField({ integer: false }),
        max: new NumberField({ integer: false }),
      }),
      movement: new ObjectField(),
      config: new ObjectField(),
      initiative: new SchemaField({
        value: new NumberField({ integer: false, initial: 0 }),
        mod: new NumberField({ integer: false, initial: 0 }),
      }),
      wounds: new SchemaField({
        hd: new StringField(),
        value: new NumberField({ integer: true }),
        max: new NumberField({ integer: true }),
      }),
      // Monsters and unintelligent creatures have no Stamina. The pool exists
      // so one damage pipeline serves both actor types; a max of 0 is what
      // "has no Stamina" means, and it is also the condition under which a
      // critical hit deals double damage instead of bypassing.
      stamina: new SchemaField({
        value: new NumberField({ integer: true, initial: 0 }),
        max: new NumberField({ integer: true, initial: 0 }),
      }),
      thac0: new ObjectField(),
      languages: new ObjectField(),
      saves: new SchemaField({
        breath: new SchemaField({ value: new NumberField({ integer: true }) }),
        poison: new SchemaField({ value: new NumberField({ integer: true }) }),
        paralysis: new SchemaField({
          value: new NumberField({ integer: true }),
        }),
        magic: new SchemaField({ value: new NumberField({ integer: true }) }),
        device: new SchemaField({ value: new NumberField({ integer: true }) }),
      }),
      retainer: new SchemaField({
        enabled: new BooleanField(),
        loyalty: new NumberField({ integer: true }),
        wage: new StringField(),
      }),
    };
  }

  // @todo This only needs to be public until
  //       we can ditch sharing out AC/AAC.
  // eslint-disable-next-line class-methods-use-this
  get usesAscendingAC() {
    return game.settings.get(game.system.id, "ascendingAC");
  }

  get isNew() {
    return !Object.values(this.saves).reduce((prev, curr) => prev + (Number.parseInt(curr?.value, 10) || 0), 0);
  }

  get containers() {
    return getItemsOfActorOfType(this.parent, "container", ({ system: { containerId } }) => !containerId);
  }

  get treasures() {
    return getItemsOfActorOfType(
      this.parent,
      "item",
      ({ system: { treasure, containerId } }) => treasure && !containerId,
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  get items() {
    return getItemsOfActorOfType(
      this.parent,
      "item",
      ({ system: { treasure, containerId } }) => !treasure && !containerId,
    ).sort((a, b) => a.name.localeCompare(b.name));
  }

  get weapons() {
    return getItemsOfActorOfType(this.parent, "weapon", ({ system: { containerId } }) => !containerId).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  get armor() {
    return getItemsOfActorOfType(this.parent, "armor", ({ system: { containerId } }) => !containerId).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  get abilities() {
    return getItemsOfActorOfType(this.parent, "ability", ({ system: { containerId } }) => !containerId).sort(
      (a, b) => (a.sort || 0) - (b.sort || 0),
    );
  }

  get attackPatterns() {
    return [...this.weapons, ...this.abilities]
      .sort((a, b) => {
        // Transparent attack patterns always go last.
        if (a.system.pattern !== "transparent" && b.system.pattern === "transparent") {
          return -1;
        }
        if (a.system.pattern === "transparent" && b.system.pattern !== "transparent") {
          return 1;
        }

        // White attack patterns are used for all general monster abilities.
        // Put these at the end of the colors.
        if (a.system.pattern === "white" && b.system.pattern !== "white") {
          return 1;
        }
        if (b.system.pattern === "white" && a.system.pattern !== "white") {
          return -1;
        }

        return b.type.localeCompare(a.type) || a.name.localeCompare(b.name);
      })
      .reduce((prev, curr) => {
        const { pattern } = curr.system;
        if (!prev[pattern]) prev[pattern] = [];
        prev[pattern].push(curr);
        return prev;
      }, {});
  }

  get #spellList() {
    return getItemsOfActorOfType(this.parent, "spell", ({ system: { containerId } }) => !containerId);
  }

  get isSlow() {
    return this.weapons.length === 0
      ? false
      : this.weapons.every((item) => !(item.type !== "weapon" || !item.system.slow));
  }

  get init() {
    const group = game.settings.get(game.system.id, "initiative") !== "group";

    return group ? (this.initiative.value || 0) + (this.initiative.mod || 0) : 0;
  }
}
