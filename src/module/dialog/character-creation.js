/**
 * @file The Character Creator application.
 *
 * Rolls a starting array: 3d6 six times, in order. An array whose modifiers sum
 * below zero is flagged rather than discarded -- a player may want to keep it --
 * and one pair of scores may be swapped afterwards.
 *
 * It sets ability scores and nothing else. Class, Wounds, Stamina and skills all
 * need class data the system does not carry yet.
 */
import OseDataModelCharacterScores from "../actor/data-model-classes/data-model-character-scores";
import OSE from "../config";

/** The six abilities, in the order they are rolled and displayed. */
const ABILITIES = ["strength", "intelligence", "willpower", "agility", "toughness", "leadership"];

/** The modifier a score confers, from the same table the character sheet uses. */
export const scoreModifier = (value) =>
  OseDataModelCharacterScores.valueFromTable(OseDataModelCharacterScores.standardAttributeMods, value);

/**
 * An array is playable when its modifiers do not sum below zero.
 *
 * @param {Record<string, number>} scores - Ability scores keyed by ability.
 * @returns {boolean} Whether the array is worth keeping.
 */
export const arrayIsValid = (scores) =>
  Object.values(scores).reduce((total, value) => total + scoreModifier(value), 0) >= 0;

export default class OseCharacterCreator extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(FormApplication.defaultOptions, {
      classes: ["ose", "dialog", "creator"],
      id: "character-creator",
      template: `${OSE.systemPath()}/templates/actors/dialogs/character-creation.html`,
      width: 300,
    });
  }

  get title() {
    return `${this.object.name}: ${game.i18n.localize("VF.dialog.generator")}`;
  }

  /**
   * The flag holding a player's outstanding array.
   *
   * The array belongs to the player, not the character. Binding it to the actor
   * would stop nothing: a player who dislikes a roll can close the dialog and
   * generate a different character. Held here, the same array comes back --
   * whichever character they open the generator on -- until they accept it.
   */
  static FLAG = "pendingRoll";

  /** Rolled scores, keyed by ability. Empty until the first roll. */
  scores = {};

  /** The ability awaiting a partner to swap with, if any. */
  pendingSwap = null;

  /** One swap of one pair is allowed per array. */
  swapUsed = false;

  constructor(...args) {
    super(...args);
    const pending = game.user?.getFlag(game.system.id, OseCharacterCreator.FLAG);
    if (pending?.scores) {
      this.scores = { ...pending.scores };
      this.swapUsed = Boolean(pending.swapUsed);
    }
  }

  /** Remember the array against the player until it is accepted. */
  async #persist() {
    await game.user?.setFlag(game.system.id, OseCharacterCreator.FLAG, {
      scores: this.scores,
      swapUsed: this.swapUsed,
    });
  }

  getData() {
    const data = foundry.utils.deepClone(this.object);
    data.user = game.user;
    data.config = CONFIG.OSE;

    const rolled = Object.keys(this.scores).length > 0;
    data.rolled = rolled;
    data.scores = ABILITIES.map((key) => ({
      key,
      label: game.i18n.localize(`VF.scores.${key}.long`),
      value: this.scores[key] ?? null,
      mod: rolled ? scoreModifier(this.scores[key]) : 0,
      pending: this.pendingSwap === key,
    }));
    data.modifierSum = data.scores.reduce((total, { mod }) => total + mod, 0);
    data.isValid = !rolled || data.modifierSum >= 0;
    data.canSwap = rolled && !this.swapUsed;
    data.swapUsed = this.swapUsed;
    // A playable array is kept. Rerolling exists to escape one that sums below
    // zero, not to fish for a better set once you already have a legal one.
    data.canReroll = !rolled || !data.isValid;
    return data;
  }

  /** Roll 3d6 for each ability, in order, replacing any previous array. */
  async rollArray() {
    const rolls = {};
    for (const key of ABILITIES) {
      const roll = new Roll("3d6");
      // eslint-disable-next-line no-await-in-loop
      await roll.evaluate();
      rolls[key] = roll.total;
    }
    this.scores = rolls;
    this.pendingSwap = null;
    this.swapUsed = false;
    await this.#persist();
    // Post every array as it is rolled, so a reroll is visible rather than
    // merely prevented. The flag stops the casual dodge; the chat log is what
    // a Referee can actually check.
    await this.#announce("VF.dialog.rolledArray");
    this.render();
  }

  /**
   * Swap two scores. The first click marks an ability, the second exchanges
   * them and spends the single allowed swap.
   *
   * @param {string} key - The ability that was clicked.
   */
  swap(key) {
    if (this.swapUsed || !this.scores[key]) return;

    if (this.pendingSwap === null) {
      this.pendingSwap = key;
    } else if (this.pendingSwap === key) {
      this.pendingSwap = null;
    } else {
      const other = this.pendingSwap;
      [this.scores[key], this.scores[other]] = [this.scores[other], this.scores[key]];
      this.pendingSwap = null;
      this.swapUsed = true;
      this.#persist();
    }
    this.render();
  }

  /**
   * Post the current array to chat.
   *
   * @param {string} titleKey - Localization key for the message title.
   */
  async #announce(titleKey) {
    const summary = ABILITIES.map((key) => ({
      label: game.i18n.localize(`VF.scores.${key}.long`),
      value: this.scores[key],
      mod: scoreModifier(this.scores[key]),
    }));
    const content = await foundry.applications.handlebars.renderTemplate(
      `${OSE.systemPath()}/templates/chat/roll-creation.html`,
      {
        title: game.i18n.localize(titleKey),
        scores: summary,
        modifierSum: summary.reduce((total, { mod }) => total + mod, 0),
      },
    );
    await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: this.object }) });
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find("button.roll-array").click((ev) => {
      ev.preventDefault();
      if (Object.keys(this.scores).length > 0 && arrayIsValid(this.scores)) return;
      this.rollArray();
    });

    html.find(".score-row").click((ev) => {
      const { score } = ev.currentTarget.dataset;
      this.swap(score);
    });
  }

  /**
   * Write the array onto the actor. Ability scores only.
   *
   * @param {Event} event - The submission event.
   */
  // eslint-disable-next-line no-underscore-dangle
  async _updateObject(event) {
    event.preventDefault();
    if (Object.keys(this.scores).length === 0) return;

    await this.object.update({
      system: {
        scores: Object.fromEntries(ABILITIES.map((key) => [key, { value: this.scores[key] }])),
      },
    });

    // The array is spent: the next generator opens fresh.
    await game.user?.unsetFlag(game.system.id, OseCharacterCreator.FLAG);
    await this.#announce("VF.dialog.generator");

    this.object.sheet.render(true);
  }
}
