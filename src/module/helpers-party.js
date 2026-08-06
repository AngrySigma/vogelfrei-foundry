/**
 * @file Helper functions for managing the Party Sheet
 */
import OsePartySheet from "./party/party-sheet";

/**
 * Add a button to the actor sheet to open the Party Sheet
 *
 * @param {foundry.applications.sidebar.tabs.ActorDirectory} object - The actor directory object
 */
export const addControl = (object) => {
  const html = object.element;
  if (html?.querySelector("button.ose-party-sheet")) {
    // If the button already exists, do not add it again
    return;
  }

  const control = document.createElement("button");
  control.className = "ose-party-sheet";
  control.type = "button";
  control.title = game.i18n.localize("OSE.dialog.partysheet");
  const icon = document.createElement("i");
  icon.className = "fas fa-users";
  control.append(icon);

  const searchToggle = html.querySelector(".toggle-search-mode");
  if (searchToggle) {
    control.addEventListener("click", (ev) => {
      ev.preventDefault();
      Hooks.call("OSE.Party.showSheet");
    });

    searchToggle.parentNode.insertBefore(control, searchToggle);
  }
};

export const update = (actor) => {
  const partyFlag = actor.getFlag(game.system.id, "party");

  if (!partyFlag) {
    return;
  }

  OsePartySheet.partySheet.render();
};
