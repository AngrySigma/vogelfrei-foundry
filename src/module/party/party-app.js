/**
 * @file The Party window: who is with the party, as what, and how fast they go.
 *
 * Five lists -- players, henchmen, hirelings, NPCs, vehicles -- filled by
 * dragging Actors in from the sidebar, or a whole folder of them at once.
 * Dragging a member from one list to another changes its role; dropping it on
 * another member puts it ahead of them. Each member carries the shares an XP
 * split divides by.
 *
 * The Referee edits; players see the same window without the controls, and
 * `updateParty` refuses them a second time behind that.
 *
 * At the top is the party's pace: the slowest member per Turn and per day,
 * named, since "who is holding us back" is the question being asked.
 */
import { milesPerDay, placeMember, ROLES, removeMember, setShares, slowest } from "./roster";
import { getParty, refreshOnChange, updateParty } from "./store";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * Format a share for display: "1", "0.5", "0.25", never "0.50".
 *
 * @param {number} shares - The share.
 * @returns {string} The share as text.
 */
function formatShares(shares) {
  return String(Math.round(shares * 100) / 100);
}

/**
 * What the window shows of one member.
 *
 * @param {import("./roster").RosterEntry} entry - The roster entry.
 * @returns {object} Its row, and the figures the pace is worked out from.
 */
function describeMember(entry) {
  const actor = fromUuidSync(entry.uuid);
  if (!actor) {
    return {
      uuid: entry.uuid,
      role: entry.role,
      missing: true,
      name: game.i18n.localize("VF.party.Missing"),
      img: "icons/svg/hazard.svg",
      shares: formatShares(entry.shares),
      walker: { name: "", role: entry.role, perTurn: null, perDay: null },
    };
  }

  const perTurn = Number(actor.system?.movement?.base);
  const hasMovement = Number.isFinite(perTurn);
  const toughness = actor.type === "character" ? Number(actor.system?.scores?.toughness?.mod) || 0 : 0;
  const perDay = hasMovement ? milesPerDay(perTurn, toughness) : null;
  const encumbrance = actor.type === "character" ? actor.system?.encumbrance?.stateLabel : null;

  return {
    uuid: entry.uuid,
    role: entry.role,
    missing: false,
    name: actor.name,
    img: actor.img,
    canOpen: actor.testUserPermission(game.user, "LIMITED"),
    shares: formatShares(entry.shares),
    perTurn: hasMovement ? perTurn : null,
    perDay,
    encumbrance: encumbrance ? game.i18n.localize(encumbrance) : null,
    walker: { name: actor.name, role: entry.role, perTurn: hasMovement ? perTurn : null, perDay },
  };
}

/**
 * Every world Actor in a folder and the folders inside it.
 *
 * @param {Folder} folder - An Actor folder.
 * @returns {Actor[]} Its Actors, depth first.
 */
function actorsInFolder(folder) {
  return [...folder.contents, ...folder.children.flatMap((child) => actorsInFolder(child.folder))];
}

/**
 * The world Actor a drop names, if it can go on the roster.
 *
 * A token's own Actor stands for the world Actor behind it. A compendium
 * Actor cannot be listed -- there is nobody in the world to point at until it
 * is imported.
 *
 * @param {string} uuid - The dropped Actor's uuid.
 * @returns {Promise<Actor|null>} The world Actor, or null.
 */
async function worldActor(uuid) {
  const actor = await fromUuid(uuid);
  if (!actor) return null;
  if (actor.pack) {
    ui.notifications.warn(game.i18n.localize("VF.party.ImportFirst"));
    return null;
  }
  return actor.isToken ? (game.actors.get(actor.id) ?? null) : actor;
}

/** Open a member's sheet. */
async function onOpenSheet(_event, target) {
  const actor = await fromUuid(target.closest("[data-uuid]").dataset.uuid);
  actor?.sheet.render(true);
}

/** Strike a member off the roster. */
async function onRemoveMember(_event, target) {
  const { uuid } = target.closest("[data-uuid]").dataset;
  await updateParty((party) => removeMember(party, uuid));
}

/**
 * The party's pace: the slowest member per Turn and per day, by name.
 *
 * @param {object[]} [members] - Described members; the roster's own by default.
 * @returns {{perTurn: object|null, perDay: object|null}} Each a value and the names holding it, or null.
 */
export function partyPace(members = getParty().members.map(describeMember)) {
  const pace = (key) => {
    const found = slowest(
      members.map((member) => member.walker),
      key,
    );
    return found ? { value: found.value, names: found.names.join(", ") } : null;
  };
  return { perTurn: pace("perTurn"), perDay: pace("perDay") };
}

export default class PartyApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vf-party",
    classes: ["vogelfrei", "vf-party"],
    window: {
      title: "VF.party.Title",
      icon: "fa-solid fa-users",
      resizable: true,
    },
    position: { width: 380, height: "auto" },
    actions: {
      openSheet: onOpenSheet,
      removeMember: onRemoveMember,
    },
  };

  static PARTS = {
    roster: { template: "/systems/vogelfrei/dist/templates/apps/party.hbs" },
  };

  /** Open the Party window, or bring it forward if it is already up. */
  static show() {
    const [existing] = [...PartyApp.instances()];
    if (existing) {
      existing.bringToFront();
      return existing;
    }
    return new PartyApp().render(true);
  }

  /** @inheritDoc */
  async _prepareContext() {
    const party = getParty();
    const isReferee = game.user.isGM;
    const members = party.members.map(describeMember);

    return {
      isReferee,
      empty: members.length === 0,
      pace: partyPace(members),
      roles: ROLES.map((role) => {
        const list = members.filter((member) => member.role === role);
        const total = list.reduce((sum, member) => sum + Number(member.shares), 0);
        return {
          role,
          label: `VF.party.role.${role}`,
          members: list,
          count: list.length,
          shares: formatShares(total),
        };
      }),
    };
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    if (!game.user.isGM) return;

    for (const input of this.element.querySelectorAll('input[name="shares"]')) {
      input.addEventListener("change", (event) => {
        const { uuid } = event.currentTarget.closest("[data-uuid]").dataset;
        updateParty((party) => setShares(party, uuid, event.currentTarget.value));
      });
    }

    for (const member of this.element.querySelectorAll(".member[draggable]")) {
      member.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: member.dataset.uuid }));
        event.dataTransfer.effectAllowed = "move";
      });
    }

    for (const list of this.element.querySelectorAll(".role[data-role]")) {
      list.addEventListener("dragover", (event) => {
        event.preventDefault();
        list.classList.add("drop-target");
      });
      list.addEventListener("dragleave", (event) => {
        if (!list.contains(event.relatedTarget)) list.classList.remove("drop-target");
      });
      list.addEventListener("drop", (event) => {
        list.classList.remove("drop-target");
        this.#onDrop(event, list.dataset.role);
      });
    }
  }

  /**
   * An Actor, a roster member or a folder of Actors dropped onto a role.
   *
   * @param {DragEvent} event - The drop.
   * @param {import("./roster").Role} role - The role it landed in.
   */
  async #onDrop(event, role) {
    event.preventDefault();
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const before = event.target.closest(".member[data-uuid]")?.dataset.uuid ?? null;

    let actors = [];
    if (data?.type === "Actor" && data.uuid) {
      const actor = await worldActor(data.uuid);
      if (actor) actors = [actor];
    } else if (data?.type === "Folder" && data.uuid) {
      const folder = await fromUuid(data.uuid);
      if (folder?.type === "Actor") actors = actorsInFolder(folder);
    }
    if (actors.length === 0) return;

    await updateParty((party) => actors.reduce((next, actor) => placeMember(next, actor.uuid, role, before), party));
  }
}

refreshOnChange(PartyApp);
