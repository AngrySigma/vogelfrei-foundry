import VogelfreiItemSheet from "../item/item-sheet";

export default class VogelfreiMobileItemSheet extends VogelfreiItemSheet {
  async _saveAndClose() {
    await this.submit({ preventClose: true, preventRender: true });
    await this.close({ submit: false });
  }

  async _renderOuter() {
    const html = await super._renderOuter();
    if (["ability", "spell"].includes(this.item.type)) html.addClass("mobile-large-item-editor");
    const actions = document.createElement("footer");
    actions.className = "mobile-item-actions";

    const addButton = (label: string, className: string, action: () => unknown) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className;
      button.textContent = game.i18n.localize(label);
      button.addEventListener("click", () => {
        void action();
      });
      actions.append(button);
    };

    if (this.isEditable) {
      addButton("VF.mobile.SaveAndClose", "mobile-item-save", () => this._saveAndClose());
    }
    addButton("VF.mobile.Close", "mobile-item-close", () => this.close());
    html.append(actions);
    return html;
  }

  _getHeaderButtons() {
    return [
      ...(this.isEditable
        ? [
            {
              label: game.i18n.localize("VF.mobile.SaveAndClose"),
              class: "vf-save-close",
              icon: "fa-solid fa-check",
              onclick: () => this._saveAndClose(),
            },
          ]
        : []),
      {
        label: game.i18n.localize("VF.mobile.Close"),
        class: "close",
        icon: "fa-solid fa-xmark",
        onclick: () => this.close(),
      },
    ];
  }

  static get defaultOptions() {
    return {
      ...VogelfreiItemSheet.defaultOptions,
      classes: ["vf", "sheet", "item", "mobile-item-sheet"],
      width: 450,
      height: 700,
      resizable: false,
      dragDrop: [],
    };
  }
}
