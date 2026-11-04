import VF from "../config";

type PickerOptions = {
  type: string;
  treasure?: boolean;
};

type PickerEntry = {
  id: string;
  name: string;
  img: string;
  pack: string;
  packLabel: string;
};

export default class VogelfreiMobileCompendiumPicker extends foundry.appv1.api.Application {
  constructor(actor: Actor, options: PickerOptions) {
    super();
    this.actor = actor;
    this.itemType = options.type;
    this.treasure = options.treasure ?? false;
  }

  actor: Actor;
  itemType: string;
  treasure: boolean;

  static get defaultOptions() {
    return {
      ...foundry.appv1.api.Application.defaultOptions,
      classes: ["vf", "mobile-compendium-picker"],
      template: `${VF.systemPath()}/templates/mobile/compendium-picker.html`,
      title: game.i18n.localize("VF.mobile.AddFromCompendium"),
      width: 450,
      height: 700,
      resizable: false,
    };
  }

  async getData() {
    const entries: PickerEntry[] = [];

    for (const pack of game.packs) {
      if (pack.documentName !== "Item" || !pack.visible) continue;
      const index = await pack.getIndex();
      for (const rawEntry of index) {
        const entry = rawEntry as { _id?: string; name?: string; img?: string; type?: string };
        if (!entry._id || entry.type !== this.itemType) continue;
        entries.push({
          id: entry._id,
          name: entry.name ?? "",
          img: entry.img ?? "icons/svg/item-bag.svg",
          pack: pack.collection,
          packLabel: pack.metadata.label,
        });
      }
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    return { entries };
  }

  activateListeners(html: JQuery) {
    super.activateListeners(html);

    const filter = () => {
      const query = String(html.find(".compendium-search").val() ?? "")
        .trim()
        .toLocaleLowerCase();
      for (const element of html.find(".compendium-entry")) {
        const name = String((element as HTMLElement).dataset.name ?? "").toLocaleLowerCase();
        (element as HTMLElement).hidden = !name.includes(query);
      }
    };

    html.find(".compendium-search").on("input", filter);
    html.find(".compendium-add").on("click", async (event) => {
      event.preventDefault();
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true;

      try {
        const pack = game.packs.get(button.dataset.pack ?? "");
        const document = await pack?.getDocument(button.dataset.entryId ?? "");
        if (!(document instanceof Item)) throw new Error("The selected compendium entry is not an Item.");

        const itemData = document.toObject() as Record<string, unknown>;
        const system: Record<string, unknown> = {
          ...(itemData.system as Record<string, unknown>),
          containerId: "",
        };
        if (this.treasure) system.treasure = true;
        if (document.type === "container") system.itemIds = [];
        itemData.system = system;
        delete itemData._id;

        await this.actor.createEmbeddedDocuments("Item", [itemData]);
        await this.close();
      } catch (error) {
        button.disabled = false;
        throw error;
      }
    });
  }
}
