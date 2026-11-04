import VogelfreiActorSheetCharacter from "../actor/character-sheet";
import VF from "../config";
import VogelfreiMobileCompendiumPicker from "./compendium-picker";
import VogelfreiMobileItemSheet from "./item-sheet";

type MobileItemCreateContext = {
  type: string;
  treasure?: string;
  lvl?: string;
};

export default class VogelfreiMobileCharacterSheet extends VogelfreiActorSheetCharacter {
  static get defaultOptions() {
    return {
      ...VogelfreiActorSheetCharacter.defaultOptions,
      classes: ["vf", "sheet", "actor", "character", "mobile-character-sheet"],
      template: `${VF.systemPath()}/templates/mobile/character-sheet.html`,
      width: 450,
      height: 700,
      resizable: false,
      dragDrop: [],
      scrollY: [],
    };
  }

  async getData() {
    const data = await super.getData();
    data.mobile = true;
    return data;
  }

  _getHeaderButtons() {
    return [
      {
        label: game.i18n.localize("VF.mobile.Exit"),
        class: "close",
        icon: "fa-solid fa-xmark",
        onclick: () => this.close(),
      },
    ];
  }

  activateListeners(html: JQuery) {
    super.activateListeners(html);

    html
      .find(".item-edit")
      .off("click")
      .on("click", (event) => {
        event.preventDefault();
        const item = this._getItemFromActor(event);
        if (item) void new VogelfreiMobileItemSheet(item).render(true);
      });

    html
      .find(".item-create")
      .off("click")
      .on("click", (event) => this._onMobileItemCreate(event));
    html.find(".item-organize").on("click", (event) => this._showItemOrganization(event));
  }

  _onMobileItemCreate(event: JQuery.ClickEvent) {
    event.preventDefault();
    const context = (event.currentTarget as HTMLElement).dataset as MobileItemCreateContext;
    if (!context.type) return;

    if (["ability", "spell"].includes(context.type)) {
      void this._createCustomItem(context);
      return;
    }

    new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize("VF.dialog.createItem") },
      content: "",
      buttons: [
        {
          action: "compendium",
          label: game.i18n.localize("VF.mobile.AddFromCompendium"),
          icon: "fa-solid fa-book-atlas",
          callback: () => {
            void new VogelfreiMobileCompendiumPicker(this.actor, {
              type: context.type,
              treasure: context.treasure === "true",
            }).render(true);
          },
        },
        {
          action: "custom",
          label: game.i18n.localize("VF.mobile.CreateCustom"),
          icon: "fa-solid fa-plus",
          callback: () => this._createCustomItem(context),
        },
        {
          action: "cancel",
          label: game.i18n.localize("VF.Cancel"),
          icon: "fa-solid fa-xmark",
        },
      ],
    }).render(true);
  }

  async _createCustomItem(context: MobileItemCreateContext) {
    const system: Record<string, unknown> = {};
    if (context.treasure) system.treasure = true;
    if (context.type === "spell") system.lvl = context.lvl ? Number(context.lvl) : 1;

    const [item] = await this.actor.createEmbeddedDocuments("Item", [
      {
        name: `New ${context.type.charAt(0).toUpperCase()}${context.type.slice(1)}`,
        type: context.type,
        system,
      },
    ]);
    if (item) await new VogelfreiMobileItemSheet(item).render(true);
  }

  async _showItemOrganization(event: JQuery.ClickEvent) {
    event.preventDefault();
    const item = this._getItemFromActor(event);
    if (!item) return;

    const containerId = item.system.containerId ?? "";
    const containers = this.actor.items.filter(
      (candidate: Item) => candidate.type === "container" && candidate.id !== item.id,
    );
    const content = await foundry.applications.handlebars.renderTemplate(
      `${VF.systemPath()}/templates/mobile/item-organization.html`,
      { containers, containerId },
    );

    const buttons: Record<string, unknown>[] = [
      {
        action: "up",
        label: game.i18n.localize("VF.mobile.MoveUp"),
        icon: "fa-solid fa-arrow-up",
        callback: () => this._reorderItem(item, -1),
      },
      {
        action: "down",
        label: game.i18n.localize("VF.mobile.MoveDown"),
        icon: "fa-solid fa-arrow-down",
        callback: () => this._reorderItem(item, 1),
      },
    ];

    if (containers.length || containerId) {
      buttons.push({
        action: "container",
        label: game.i18n.localize("VF.mobile.MoveToContainer"),
        icon: "fa-solid fa-suitcase",
        callback: (_event: JQuery.ClickEvent, button: HTMLButtonElement) => {
          const form = (button as HTMLButtonElement & { form: HTMLFormElement }).form;
          const formData = new foundry.applications.ux.FormDataExtended(form).object;
          return this._moveItemToContainer(item, String(formData.containerId ?? ""));
        },
      });
    }

    buttons.push({
      action: "cancel",
      label: game.i18n.localize("VF.Cancel"),
      icon: "fa-solid fa-xmark",
    });

    new foundry.applications.api.DialogV2({
      window: { title: item.name },
      content,
      buttons,
    }).render(true);
  }

  async _reorderItem(item: Item, direction: -1 | 1) {
    const containerId = item.system.containerId ?? "";
    const siblings = this.actor.items
      .filter((candidate: Item) => {
        if ((candidate.system.containerId ?? "") !== containerId) return false;
        if (containerId) return true;
        if (candidate.type !== item.type) return false;
        return item.type !== "item" || Boolean(candidate.system.treasure) === Boolean(item.system.treasure);
      })
      .sort((left: Item, right: Item) => (left.sort ?? 0) - (right.sort ?? 0));

    const index = siblings.findIndex((candidate: Item) => candidate.id === item.id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= siblings.length) return;

    [siblings[index], siblings[destination]] = [siblings[destination], siblings[index]];
    await this.actor.updateEmbeddedDocuments(
      "Item",
      siblings.map((candidate: Item, position: number) => ({ _id: candidate.id, sort: (position + 1) * 100 })),
    );
  }

  async _moveItemToContainer(item: Item, containerId: string) {
    const previousId = item.system.containerId ?? "";
    if (previousId === containerId) return;

    const previous = previousId ? this.actor.items.get(previousId) : undefined;
    const target = containerId ? this.actor.items.get(containerId) : undefined;
    if (containerId && (!target || target.type !== "container" || target.id === item.id)) return;

    const updates: Record<string, unknown>[] = [
      {
        _id: item.id,
        "system.containerId": containerId,
        ...(containerId && "equipped" in item.system ? { "system.equipped": false } : {}),
      },
    ];
    if (previous)
      updates.push({
        _id: previous.id,
        "system.itemIds": previous.system.itemIds.filter((id: string) => id !== item.id),
      });
    if (target) updates.push({ _id: target.id, "system.itemIds": [...target.system.itemIds, item.id] });

    await this.actor.updateEmbeddedDocuments("Item", updates);
  }

  async close(options = {}) {
    const actor = this.actor;
    document.body.classList.remove("vf-mobile-mode");
    await game.settings.set(game.system.id, "mobileMode", false);
    const result = await super.close(options);
    if (actor?.sheet) await actor.sheet.render(true);
    return result;
  }
}
