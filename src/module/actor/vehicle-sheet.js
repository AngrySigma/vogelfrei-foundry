/**
 * @file The sheet for Actors of type Vehicle: what it is, how it moves, and
 *       what it carries.
 */
import OSE from "../config";

export default class OseActorSheetVehicle extends foundry.appv1.sheets.ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(foundry.appv1.sheets.ActorSheet.defaultOptions, {
      classes: ["ose", "sheet", "vehicle", "actor"],
      template: `${OSE.systemPath()}/templates/actors/vehicle-sheet.html`,
      width: 460,
      height: 520,
      resizable: true,
    });
  }

  async getData() {
    const data = await super.getData();
    data.system = this.actor.system;
    data.config = CONFIG.OSE;
    data.owner = this.actor.isOwner;
    data.editable = this.isEditable;
    data.holds = this.actor.system.holds.map((item) => ({
      id: item.id,
      name: item.name,
      img: item.img,
      quantity: item.system.quantity?.value || 1,
      kind: item.system.encumbrance ?? "normal",
    }));
    data.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.actor.system.details.biography,
      { async: true },
    );
    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;

    html.find(".item-edit").click((event) => {
      this.actor.items.get(event.currentTarget.closest("[data-item-id]").dataset.itemId)?.sheet.render(true);
    });
    html.find(".item-delete").click((event) => {
      this.actor.items.get(event.currentTarget.closest("[data-item-id]").dataset.itemId)?.delete();
    });
    html.find('input[name="quantity"]').change((event) => {
      const item = this.actor.items.get(event.currentTarget.closest("[data-item-id]").dataset.itemId);
      item?.update({ "system.quantity.value": Math.max(0, Number.parseInt(event.currentTarget.value, 10) || 0) });
    });
  }
}
