/**
 * @file The system-level sheet for items of any type
 */
import OSE from "../config";
import { formatMoney, parseMoney } from "../money";

/**
 * Price fields, which are stored as whole brass pieces but written and read as
 * coins: "15 sp", "2 gp 4 sp". See ../money.ts.
 */
const MONEY_FIELDS = ["system.cost", "system.costRural"];

/**
 * Extend the basic ItemSheet with some very simple modifications
 */
export default class OseItemSheet extends foundry.appv1.sheets.ItemSheet {
  /**
   * Extend and override the default options used by the Simple Item Sheet
   *
   * @returns {object}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(foundry.appv1.sheets.ItemSheet.defaultOptions, {
      classes: ["ose", "sheet", "item"],
      width: 520,
      height: 390,
      resizable: true,
      tabs: [
        {
          navSelector: ".tabs",
          contentSelector: ".sheet-body",
          initial: "description",
        },
      ],
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get template() {
    const path = `${OSE.systemPath()}/templates/items`;
    return `${path}/${this.item.type}-sheet.html`;
  }

  /**
   * Prepare data for rendering the Item sheet
   * The prepared data object contains both the actor data as well as additional sheet options
   *
   * @returns {object} Data for the Handlebars template
   */
  async getData() {
    const { data } = super.getData();
    data.editable = this.document.sheet.isEditable;
    data.config = {
      ...CONFIG.OSE,
      encumbrance: game.settings.get(game.system.id, "encumbranceOption"),
    };
    data.enriched = {
      description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        this.item.system?.description || "",
        { async: true },
      ),
    };
    // Prices go into their boxes as coins rather than as a raw brass count --
    // "2000 sp" is a suit of plate; "24000" is a number nobody recognises.
    const { cost, costRural, costMinimum } = this.item.system ?? {};
    data.money = {
      cost: formatMoney({ bp: cost ?? 0, minimum: Boolean(costMinimum) }),
      costRural: formatMoney({ bp: costRural ?? null, minimum: Boolean(costMinimum) }),
    };
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Read the price boxes back as coins before the document sees them. The
   * fields hold brass pieces, but what was typed is something like "15sp" or a
   * dash, which would otherwise cast to NaN.
   *
   * @param {Event} event - The form submission event
   * @param {object} formData - The submitted form data
   * @returns {Promise} The updated document
   * @override
   */
  async _updateObject(event, formData) {
    const submitted = { ...formData };

    for (const field of MONEY_FIELDS) {
      if (!(field in submitted)) continue;

      const written = submitted[field];
      // A number already in the box is a brass count; leave it be.
      if (written === "" || written === null || typeof written === "number") continue;

      try {
        const { bp, minimum } = parseMoney(String(written));
        submitted[field] = bp;
        // The marker belongs to the price, and either box may carry it.
        if (minimum) submitted["system.costMinimum"] = true;
      } catch {
        ui.notifications?.warn(game.i18n.format("VF.items.CostUnreadable", { value: written }));
        delete submitted[field];
      }
    }

    return super._updateObject(event, submitted);
  }

  /* -------------------------------------------- */

  /**
   * Activate event listeners using the prepared sheet HTML
   *
   * @param {JQuery} html - The prepared HTML object ready to be rendered into the DOM
   */
  activateListeners(html) {
    html.find('input[data-action="add-tag"]').keypress((ev) => {
      if (ev.which === 13) {
        const value = $(ev.currentTarget).val();
        const values = value.split(",");
        this.object.pushManualTag(values);
      }
    });
    html.find(".tag-delete").click((ev) => {
      const value = ev.currentTarget.parentElement.dataset.tag;
      this.object.popManualTag(value);
    });
    html.find("a.melee-toggle").click(() => {
      this.object.update({ "system.melee": !this.object.system.melee });
    });

    html.find("a.missile-toggle").click(() => {
      this.object.update({ "system.missile": !this.object.system.missile });
    });

    super.activateListeners(html);
  }
}
