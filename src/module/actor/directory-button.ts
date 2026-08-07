/**
 * @file Adds a "Generate Character" button beside Create Actor in the sidebar.
 *
 * Foundry's own Create Actor makes an empty sheet and leaves you to fill it in.
 * This creates the character and opens the generator on it in one step, so the
 * roller is reachable without knowing to hover a portrait.
 */
import OseCharacterCreator from "../dialog/character-creation";
import OsePendingRolls from "../dialog/pending-rolls";

/** Ask for a name, create the character, and open the generator on it. */
async function generateCharacter() {
  const name = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("VF.dialog.generateCharacter") },
    content: `<div class="form-group">
        <label>${game.i18n.localize("VF.dialog.characterName")}</label>
        <input type="text" name="name" autofocus />
      </div>`,
    ok: {
      label: game.i18n.localize("VF.dialog.generator"),
      icon: "fas fa-dice",
      callback: (_event: Event, button: HTMLButtonElement) =>
        (button.form?.elements.namedItem("name") as HTMLInputElement)?.value ?? "",
    },
    // Closing the dialog should back out quietly, not raise.
    rejectClose: false,
  });

  // null means dismissed; an empty string means they left the name blank.
  if (name === null || name === undefined) return;

  const actor = await Actor.implementation.create({
    name: String(name).trim() || game.i18n.localize("VF.dialog.newCharacter"),
    type: "character",
  });
  if (actor) new OseCharacterCreator(actor).render(true);
}

/**
 * Register the sidebar button. Re-runs on every directory render, so it guards
 * against adding itself twice.
 */
export default function registerActorDirectoryButton() {
  Hooks.on("renderActorDirectory", (_app: unknown, html: HTMLElement | JQuery) => {
    const root = html instanceof HTMLElement ? html : (html as JQuery)?.[0];
    if (!root) return;
    if (!game.user?.can("ACTOR_CREATE")) return;

    const actions = root.querySelector(".directory-header .header-actions");
    if (!actions || actions.querySelector(".vf-generate-character")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "vf-generate-character";
    const icon = document.createElement("i");
    icon.className = "fa fa-dice";
    icon.toggleAttribute("inert", true);
    const label = document.createElement("span");
    label.textContent = game.i18n.localize("VF.dialog.generateCharacter");
    button.append(icon, label);
    button.addEventListener("click", () => {
      generateCharacter();
    });

    // Sits next to Create Actor rather than replacing it -- an empty actor is
    // still the right thing when you are statting an NPC from a book.
    actions.append(button);

    // Referees also get at the outstanding arrays, to release one when a
    // rewrite has been agreed.
    if (game.user?.isGM && !actions.querySelector(".vf-pending-rolls-btn")) {
      const pending = document.createElement("button");
      pending.type = "button";
      pending.className = "vf-pending-rolls-btn";
      const pendingIcon = document.createElement("i");
      pendingIcon.className = "fa fa-dice-d20";
      pendingIcon.toggleAttribute("inert", true);
      const pendingLabel = document.createElement("span");
      pendingLabel.textContent = game.i18n.localize("VF.dialog.pendingRolls");
      pending.append(pendingIcon, pendingLabel);
      pending.addEventListener("click", () => {
        new OsePendingRolls().render(true);
      });
      actions.append(pending);
    }
  });
}
