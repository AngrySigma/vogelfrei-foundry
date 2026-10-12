/**
 * @file A button beside the Actors directory's search box that opens the Party window.
 */
import PartyApp from "./party-app";

/**
 * Add the button. Re-runs on every directory activation, so it guards against
 * adding itself twice.
 *
 * @param {foundry.applications.sidebar.tabs.ActorDirectory} directory - The Actors directory.
 */
function addButton(directory) {
  const html = directory.element;
  if (!html || html.querySelector("button.vf-party-button")) return;

  const searchToggle = html.querySelector(".toggle-search-mode");
  if (!searchToggle) return;

  const button = document.createElement("button");
  button.className = "vf-party-button";
  button.type = "button";
  button.dataset.tooltip = game.i18n.localize("VF.party.Title");
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-users";
  button.append(icon);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    PartyApp.show();
  });

  searchToggle.parentNode.insertBefore(button, searchToggle);
}

export default function registerPartyDirectoryButton() {
  Hooks.on("activateActorDirectory", addButton);
}
