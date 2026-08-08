/**
 * @file An application for deducting currency from an actor using the Shopping Cart feature
 */
// eslint-disable-next-line no-unused-vars
import OSE from "../config";
import { formatMoney } from "../money";
import { denominationOf, pay } from "../purse";

export default class OseCharacterGpCost extends FormApplication {
  static physicalItemTypes = new Set(["item", "container", "weapon", "armor"]);

  constructor(event, preparedData, position) {
    super(event, position);
    this.object.preparedData = preparedData;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(FormApplication.defaultOptions, {
      classes: ["ose", "dialog", "gp-cost"],
      id: "sheet-gp-cost",
      template: `${OSE.systemPath()}/templates/actors/dialogs/gp-cost-dialog.html`,
      width: 240,
    });
  }

  /* -------------------------------------------- */

  /**
   * Add the Entity name into the window title
   *
   * @type {string}
   * @returns {string} - A localized window title
   */
  get title() {
    return `${this.object.name}: ${game.i18n.localize("VF.dialog.shoppingCart")}`;
  }

  /* -------------------------------------------- */

  /**
   * Construct and return the data object used to render the HTML template for this form application.
   *
   * @returns {object} - The template data
   */
  async getData() {
    const data = await foundry.utils.deepClone(this.object.preparedData);
    data.totalCost = await this.#getTotalCost(data);
    data.user = game.user;
    this.inventory = this.object.items;
    return data;
  }

  async close(options) {
    return super.close(options);
  }

  /**
   * An object that provides options to _onSubmit
   *
   * @typedef submitOptions
   * @property {boolean} preventClose - Should the application be stopped from closing?
   * @property {boolean} preventRender - Should the application be stopped from rendering?
   */

  /**
   * Override Foundry's default _onSubmit event to add our own behaviors
   *
   * @param {Event} event - The native form submit event
   * @param {submitOptions} options - Options for the _onSubmit event
   */
  // eslint-disable-next-line no-underscore-dangle
  async _onSubmit(event, { preventClose = false, preventRender = false } = {}) {
    // eslint-disable-next-line no-underscore-dangle
    super._onSubmit(event, {
      preventClose,
      preventRender,
    });
    // Pay for the cart. Prices are in brass, and a purse may be spread across
    // gold, silver and brass Items, so the whole purse is totalled in brass,
    // the price taken out of it, and the change counted back into coins.
    const totalCost = await this.#getTotalCost(await this.getData());
    const items = [...this.object.items];

    if (!items.some((item) => denominationOf(item))) {
      ui.notifications.error(game.i18n.localize("VF.error.noGP"));
      return;
    }

    const { paid, shortfall, updates } = pay(items, totalCost);
    if (!paid) {
      ui.notifications.error(game.i18n.format("VF.error.notEnoughGP", { short: formatMoney(shortfall) }));
      return;
    }

    await this.object.updateEmbeddedDocuments(
      "Item",
      updates.map(({ id, quantity }) => ({ _id: id, "system.quantity.value": quantity })),
    );

    // Mark all items in the cart as "paid for" by setting a flag
    await this.#markItemsAsPaid();

    // Close the dialog after successful transaction
    await this.close();
  }

  /**
   * This method is called upon form submission after form data is validated
   *
   * @param {Event} event - The initial triggering submission event
   * @param {object} formData - The object of validated form data with which to update the object
   * @private
   */
  async _updateObject(event, formData) {
    event.preventDefault();

    const speaker = ChatMessage.getSpeaker({ actor: this });
    const templateData = await this.getData();
    const content = await foundry.applications.handlebars.renderTemplate(
      `${OSE.systemPath()}/templates/chat/inventory-list.html`,
      templateData,
    );
    ChatMessage.create({
      content,
      speaker,
    });
    // Update the actor
    await this.object.update(formData);

    // Re-draw the updated sheet
    this.object.sheet.render(true);
  }

  // eslint-disable-next-line class-methods-use-this
  async #getTotalCost(data) {
    return data.items.reduce((total, item) => {
      const itemData = item.system;
      // Only count non-treasure physical items that haven't been paid for yet
      if (OseCharacterGpCost.physicalItemTypes.has(item.type) && !itemData.treasure && !item.flags?.ose?.paid) {
        return total + (itemData.quantity.max ? itemData.cost * itemData.quantity.value : itemData.cost);
      }

      return total;
    }, 0);
  }

  /**
   * Mark all items in the shopping cart as paid for
   * This prevents them from appearing in the cart on subsequent openings
   * Items remain in inventory but won't be counted in cart calculations
   * @private
   */
  async #markItemsAsPaid() {
    const updates = [];

    this.object.items.forEach((item) => {
      const itemData = item.system;
      // Mark all non-treasure physical items that haven't been paid for yet
      if (OseCharacterGpCost.physicalItemTypes.has(item.type) && !itemData.treasure && !item.flags?.ose?.paid) {
        updates.push({
          _id: item.id,
          "flags.ose.paid": true,
        });
      }
    });

    // Update all items in one batch
    if (updates.length > 0) {
      await this.object.updateEmbeddedDocuments("Item", updates);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("a.auto-deduct").click(() => {
      this.submit();
    });
  }
}
