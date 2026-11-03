/**
 * @file The Party window: who is with the party, as what, and how fast they go.
 *
 * Five lists -- players, henchmen, hirelings, NPCs, vehicles -- filled by
 * dragging Actors in from the sidebar, or a whole folder of them at once.
 * Dragging a member from one list to another changes its role; dropping it on
 * another member puts it ahead of them. Each member carries the shares an XP
 * split divides by.
 *
 * Animals and vehicles are containers: drop a member onto a horse to ride
 * it, into a wagon's harness, onto its box as Teamster, or aboard. Anyone
 * may arrange the roster -- a player's change goes through the Referee, see
 * store.js -- but only the Referee sets shares.
 *
 * At the top is the party's pace and day: the slowest unit per Turn and per
 * day, and the most burdened one's watches, named, since "who is holding us
 * back" is the question being asked. See travel.ts.
 *
 * The second tab is the marching order, which is the players' sandbox: any
 * number of named layouts, any of them edited by anyone, one of them marked
 * as the order the party is keeping. Which layout a window is *showing* is
 * that window's own business, so a player trying out "Corridor" does not
 * change what everyone else is looking at -- only marking it does.
 */

import { layoutOf, MAX_WIDTH, placed, ranks } from "./formation";
import { ROLES, replaceMember, setShares } from "./roster";
import { editFormation, editRoster, getParty, refreshOnChange, updateParty } from "./store";
import { assess, canSit } from "./travel";
import { travellerOf } from "./traveller";
import { splitXP } from "./xp-split";

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

/** The seats each kind of container has, in the order the window shows them. */
const SEATS_OF = {
  animal: ["aboard"],
  drawn: ["team", "teamster", "aboard"],
  vessel: ["aboard"],
};

/** Encumbrance band labels, unencumbered to over. */
const BAND_LABELS = [
  "VF.encumbrance.unencumbered",
  "VF.encumbrance.light",
  "VF.encumbrance.heavy",
  "VF.encumbrance.severe",
  "VF.encumbrance.over",
];

/**
 * What the window shows of every member: its row, where it sits, and -- for
 * a horse or a wagon -- who is in it.
 *
 * @param {import("./roster").Party} party - The roster.
 * @returns {{members: object[], travel: ReturnType<typeof assess>}} The rows, and the arithmetic behind them.
 */
function describeMembers(party) {
  const actors = new Map(party.members.map((entry) => [entry.uuid, fromUuidSync(entry.uuid)]));
  const travellers = party.members.map((entry) => travellerOf(entry, actors.get(entry.uuid)));
  const travel = assess(travellers);
  const nameOf = (uuid) => actors.get(uuid)?.name ?? game.i18n.localize("VF.party.Missing");

  const members = party.members.map((entry, index) => {
    const actor = actors.get(entry.uuid);
    const { kind } = travellers[index];
    const figures = travel.members.get(entry.uuid);
    const row = {
      uuid: entry.uuid,
      role: entry.role,
      kind,
      shares: formatShares(entry.shares),
      in: entry.in ? { uuid: entry.in, name: nameOf(entry.in), seat: `VF.party.seat.${entry.seat}` } : null,
    };
    if (!actor) {
      return { ...row, missing: true, name: nameOf(entry.uuid), img: "icons/svg/hazard.svg" };
    }

    // A walker shows its sheet's own state; an animal or wagon its load with
    // riders and team, which only the roster knows.
    let load = null;
    if (kind === "walker" && actor.type === "character") load = actor.system?.encumbrance?.stateLabel ?? null;
    if (kind === "animal" && figures?.band !== null) load = BAND_LABELS[figures.band];
    const seats = (SEATS_OF[kind] ?? []).map((seat) => ({
      seat,
      label: `VF.party.seat.${seat}`,
      occupants: party.members
        .filter((other) => other.in === entry.uuid && (other.seat ?? "aboard") === seat)
        .map((other) => ({ uuid: other.uuid, name: nameOf(other.uuid) })),
    }));

    return {
      ...row,
      missing: false,
      name: actor.name,
      img: actor.img,
      canOpen: actor.testUserPermission(game.user, "LIMITED"),
      perTurn: figures?.perTurn ?? null,
      points: kind === "walker" ? null : (figures?.points ?? null),
      load: load ? game.i18n.localize(load) : null,
      seats,
    };
  });

  return { members, travel };
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

/**
 * What the formation tab shows: the layouts as tabs of their own, the one
 * being viewed as a grid, and whoever is not yet placed in it.
 *
 * @param {import("./roster").Party} party - The roster.
 * @param {string|null} viewing - The layout this window is showing.
 * @returns {object} The formation part's context.
 */
function describeFormation(party, viewing) {
  const { formation } = party;
  const layout = layoutOf(formation, viewing) ?? layoutOf(formation, formation.active);
  const people = new Map(
    party.members
      .filter((entry) => entry.role !== "vehicle")
      .map((entry) => {
        const actor = fromUuidSync(entry.uuid);
        return [
          entry.uuid,
          { uuid: entry.uuid, name: actor?.name ?? "?", img: actor?.img ?? "icons/svg/mystery-man.svg" },
        ];
      }),
  );
  const inLayout = new Set(placed(layout));

  return {
    layouts: formation.layouts.map((entry) => ({
      id: entry.id,
      name: entry.name,
      width: entry.width,
      viewing: entry.id === layout.id,
      active: entry.id === formation.active,
    })),
    layout: {
      id: layout.id,
      name: layout.name,
      width: layout.width,
      maxWidth: MAX_WIDTH,
      active: layout.id === formation.active,
      removable: formation.layouts.length > 1,
    },
    ranks: ranks(layout).map((rank) =>
      rank.map(({ index, uuid }) => ({ index, number: index + 1, person: uuid ? people.get(uuid) : null })),
    ),
    bench: [...people.values()].filter((person) => !inLayout.has(person.uuid)),
    nobody: people.size === 0,
  };
}

/** Show another layout in this window, without changing anyone else's. */
function onViewLayout(_event, target) {
  this.viewing = target.dataset.layout;
  this.render({ parts: ["formation"] });
}

/** Mark the layout on show as the one the party is keeping. */
async function onActivateLayout(_event, target) {
  await editFormation({ type: "activate", layout: target.closest("[data-layout]").dataset.layout });
}

/** Add a layout, starting from the current order, and show it. */
async function onAddLayout() {
  const input = this.element.querySelector('input[name="newLayout"]');
  const id = foundry.utils.randomID();
  const width = Number(this.element.querySelector('input[name="layoutWidth"]')?.value) || 2;
  // Set first, so the redraw the new layout causes already shows it.
  this.viewing = id;
  await editFormation({ type: "add", id, name: input?.value ?? "", width });
}

/** Drop the layout on show. */
async function onRemoveLayout(_event, target) {
  const { layout } = target.closest("[data-layout]").dataset;
  const name = getParty().formation.layouts.find((entry) => entry.id === layout)?.name ?? "";
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("VF.formation.RemoveLayout") },
    content: `<p>${game.i18n.format("VF.formation.RemoveConfirm", { name: foundry.utils.escapeHTML(name) })}</p>`,
  });
  if (!confirmed) return;
  this.viewing = null;
  await editFormation({ type: "remove", layout });
}

/** Step someone off their square, back to the bench. */
async function onClearSquare(_event, target) {
  const square = target.closest("[data-index]");
  const layout = target.closest("[data-layout]").dataset.layout;
  await editFormation({ type: "clear", layout, index: Number(square.dataset.index) });
}

/** Strike a member off the roster. */
async function onRemoveMember(_event, target) {
  const { uuid } = target.closest("[data-uuid]").dataset;
  await editRoster({ type: "remove", uuid });
}

/**
 * Turn a character standing in for a wagon into a real vehicle: same name,
 * picture, folder, owners and cargo, and its place on the roster. The old
 * character is left where it is, for the Referee to delete.
 */
async function onMakeVehicle(_event, target) {
  const { uuid } = target.closest("[data-uuid]").dataset;
  const old = fromUuidSync(uuid);
  if (!old || !game.user.isGM) return;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("VF.party.MakeVehicle") },
    content: `<p>${game.i18n.format("VF.party.MakeVehicleConfirm", { name: foundry.utils.escapeHTML(old.name) })}</p>`,
  });
  if (!confirmed) return;

  const vehicle = await Actor.implementation.create({
    name: old.name,
    type: "vehicle",
    img: old.img,
    folder: old.folder?.id ?? null,
    ownership: old.toObject().ownership,
  });
  // Containers first, so what was in them can be put back in by new id.
  const items = old.items.map((item) => item.toObject());
  const created = await vehicle.createEmbeddedDocuments(
    "Item",
    items.map(({ _id, ...item }) => ({ ...item, system: { ...item.system, containerId: "" } })),
  );
  const newId = new Map(items.map((item, index) => [item._id, created[index]?.id]));
  const nesting = items
    .map((item, index) => {
      const update = { _id: created[index]?.id };
      const container = newId.get(item.system.containerId);
      if (container) update["system.containerId"] = container;
      if (Array.isArray(item.system.itemIds)) {
        update["system.itemIds"] = item.system.itemIds.map((id) => newId.get(id)).filter(Boolean);
      }
      return update;
    })
    .filter((update) => update._id && Object.keys(update).length > 1);
  if (nesting.length) await vehicle.updateEmbeddedDocuments("Item", nesting);

  await updateParty((party) => replaceMember(party, uuid, vehicle.uuid));
  ui.notifications.info(game.i18n.format("VF.party.MadeVehicle", { name: old.name }));
  vehicle.sheet.render(true);
}

/** Take someone off their horse, out of the wagon or off the ship. */
async function onAlight(_event, target) {
  await editRoster({ type: "alight", uuid: target.closest("[data-occupant]").dataset.occupant });
}

/**
 * The party's pace and day: the slowest top-level unit per Turn and per day,
 * and the most burdened one's watches, each with who sets it.
 *
 * @param {ReturnType<typeof assess>} [travel] - Worked out already; the roster's own by default.
 * @returns {{perTurn: object|null, perDay: object|null, watches: object|null}} Each a value and names, or null.
 */
export function partyPace(travel = describeMembers(getParty()).travel) {
  const named = (limit) => (limit ? { value: limit.value, names: limit.names.join(", ") } : null);
  return { perTurn: named(travel.perTurn), perDay: named(travel.perDay), watches: named(travel.watches) };
}

/**
 * How many watches the party's day holds, set by its most burdened unit.
 *
 * @returns {{value: number, names: string}|null} Watches per day and who sets it, or null if nobody counts.
 */
export function partyWatches() {
  return partyPace().watches;
}

/**
 * Ask for an award, divide it by the roster's shares, and post the result.
 *
 * Nothing is written to any sheet: the message says what each share is worth
 * and who holds it, and the players add it themselves. A deleted Actor still
 * on the roster is left out, since there is nobody to name.
 */
async function onSplitXP() {
  const total = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("VF.party.xp.Title") },
    content: `<div class="form-group">
        <label>${game.i18n.localize("VF.party.xp.Total")}</label>
        <input type="number" name="total" min="0" step="1" autofocus />
      </div>`,
    ok: {
      label: game.i18n.localize("VF.party.xp.Split"),
      icon: "fa-solid fa-scale-balanced",
      callback: (_event, button) => button.form.elements.total.valueAsNumber,
    },
    rejectClose: false,
  });
  if (!(total > 0)) return;

  const shareholders = getParty()
    .members.map((entry) => ({ actor: fromUuidSync(entry.uuid), shares: entry.shares }))
    .filter(({ actor }) => actor)
    .map(({ actor, shares }) => ({ name: actor.name, shares }));
  const split = splitXP(total, shareholders);

  const number = (value) => value.toLocaleString(game.i18n.lang, { maximumFractionDigits: 1 });
  const names = (list) => list.map((name) => foundry.utils.escapeHTML(name)).join(", ");
  const lines = split.lines.map(
    (line) =>
      `<li>${game.i18n.format("VF.party.xp.Line", {
        shares: formatShares(line.shares),
        each: number(line.each),
        names: names(line.names),
      })}</li>`,
  );

  let content = `<ul class="vf-xp-split">${lines.join("")}</ul>`;
  if (split.lines.length === 0) content = `<p>${game.i18n.localize("VF.party.xp.NobodyShares")}</p>`;
  if (split.leftover > 0 && split.lines.length > 0) {
    content += `<p class="vf-xp-note">${game.i18n.format("VF.party.xp.Leftover", { leftover: number(split.leftover) })}</p>`;
  }
  if (split.unshared.length > 0) {
    content += `<p class="vf-xp-note">${game.i18n.format("VF.party.xp.Unshared", { names: names(split.unshared) })}</p>`;
  }

  await ChatMessage.create({
    flavor: game.i18n.format("VF.party.xp.Flavor", {
      total: number(split.total),
      shares: formatShares(split.totalShares),
      perShare: number(split.perShare),
    }),
    content,
  });
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
    position: { width: 400, height: "auto" },
    actions: {
      openSheet: onOpenSheet,
      removeMember: onRemoveMember,
      alight: onAlight,
      makeVehicle: onMakeVehicle,
      splitXP: onSplitXP,
      viewLayout: onViewLayout,
      activateLayout: onActivateLayout,
      addLayout: onAddLayout,
      removeLayout: onRemoveLayout,
      clearSquare: onClearSquare,
    },
  };

  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    roster: { template: "/systems/vogelfrei/dist/templates/apps/party.hbs" },
    formation: { template: "/systems/vogelfrei/dist/templates/apps/formation.hbs" },
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "roster", icon: "fa-solid fa-users" },
        { id: "formation", icon: "fa-solid fa-chess-board" },
      ],
      initial: "roster",
      labelPrefix: "VF.party.tab",
    },
  };

  /** The layout this window is showing; null means the active one. */
  viewing = null;

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
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const party = getParty();
    const isReferee = game.user.isGM;
    const { members, travel } = describeMembers(party);

    return Object.assign(context, {
      isReferee,
      empty: members.length === 0,
      pace: partyPace(travel),
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
      formation: describeFormation(party, this.viewing),
    });
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    const tab = partContext.tabs?.[partId];
    if (tab) partContext.tab = tab;
    return partContext;
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#bindFormation();
    this.#bindRoster();
  }

  /**
   * The roster tab's controls: dragging Actors between roles and into seats,
   * for everyone, and shares for the Referee.
   */
  #bindRoster() {
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

    for (const chip of this.element.querySelectorAll(".occupant[data-occupant]")) {
      chip.addEventListener("dragstart", (event) => {
        event.stopPropagation();
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: chip.dataset.occupant }));
        event.dataTransfer.effectAllowed = "move";
      });
    }

    for (const list of this.element.querySelectorAll(".role[data-role]")) {
      dropZone(list, (event) => this.#onDropOnRole(event, list.dataset.role));
    }

    for (const zone of this.element.querySelectorAll(".seat[data-seat]")) {
      dropZone(zone, (event) => this.#onDropOnSeat(event, zone.closest("[data-uuid]").dataset.uuid, zone.dataset.seat));
    }
  }

  /**
   * A member dropped into a seat: onto a horse, into harness, onto the box.
   * Only members can sit; an Actor straight from the sidebar joins the roster
   * first, as a vehicle if it is one and as an NPC otherwise.
   *
   * @param {DragEvent} event - The drop.
   * @param {string} container - The container's uuid.
   * @param {import("./travel").Seat} seat - The seat.
   */
  async #onDropOnSeat(event, container, seat) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Actor" || !data.uuid) return;
    const actor = await worldActor(data.uuid);
    if (!actor || actor.uuid === container) return;

    const party = getParty();
    const holder = party.members.find((entry) => entry.uuid === container);
    let entry = party.members.find((member) => member.uuid === actor.uuid);
    const role = entry?.role ?? (actor.type === "vehicle" || actor.system?.burden?.enabled ? "vehicle" : "npc");
    const kind = (member, who) => travellerOf(member, who).kind;
    if (!holder || !canSit(kind(holder, fromUuidSync(container)), seat, kind({ uuid: actor.uuid, role }, actor))) {
      ui.notifications.warn(game.i18n.localize("VF.party.CannotSit"));
      return;
    }

    if (!entry) {
      await editRoster({ type: "place", uuids: [actor.uuid], role });
      entry = { uuid: actor.uuid };
    }
    await editRoster({ type: "board", uuid: entry.uuid, container, seat });
  }

  /** Everyone's controls on the formation tab: names, widths, and dragging people onto squares. */
  #bindFormation() {
    const root = this.element.querySelector(".vf-formation[data-layout]");
    if (!root) return;
    const { layout } = root.dataset;

    root.querySelector('input[name="layoutName"]')?.addEventListener("change", (event) => {
      editFormation({ type: "rename", layout, name: event.currentTarget.value });
    });
    root.querySelector('input[name="layoutWidth"]')?.addEventListener("change", (event) => {
      editFormation({ type: "width", layout, width: event.currentTarget.value });
    });
    root.querySelector('input[name="newLayout"]')?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      onAddLayout.call(this);
    });

    for (const person of root.querySelectorAll(".person[data-uuid]")) {
      person.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Actor", uuid: person.dataset.uuid }));
        event.dataTransfer.effectAllowed = "move";
      });
    }

    for (const square of root.querySelectorAll(".square[data-index]")) {
      dropZone(square, async (event) => {
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        if (data?.type !== "Actor" || !data.uuid) return;
        // A token's Actor, or the world Actor itself, stands for its roster entry.
        const actor = await worldActor(data.uuid);
        if (!actor) return;
        await editFormation({ type: "place", layout, uuid: actor.uuid, index: Number(square.dataset.index) });
      });
    }

    const bench = root.querySelector(".bench");
    if (bench) {
      dropZone(bench, async (event) => {
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        const index = getParty()
          .formation.layouts.find((entry) => entry.id === layout)
          ?.slots.indexOf(data?.uuid);
        if (index === undefined || index === -1) return;
        await editFormation({ type: "clear", layout, index });
      });
    }
  }

  /**
   * An Actor, a roster member or a folder of Actors dropped onto a role.
   *
   * @param {DragEvent} event - The drop.
   * @param {import("./roster").Role} role - The role it landed in.
   */
  async #onDropOnRole(event, role) {
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

    await editRoster({ type: "place", uuids: actors.map((actor) => actor.uuid), role, before });
  }
}

/**
 * Make an element accept drops, highlighting it while something hovers.
 *
 * @param {HTMLElement} element - The drop target.
 * @param {(event: DragEvent) => void} onDrop - Called with the drop.
 */
function dropZone(element, onDrop) {
  element.addEventListener("dragover", (event) => {
    event.preventDefault();
    element.classList.add("drop-target");
  });
  element.addEventListener("dragleave", (event) => {
    if (!element.contains(event.relatedTarget)) element.classList.remove("drop-target");
  });
  element.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    element.classList.remove("drop-target");
    onDrop(event);
  });
}

refreshOnChange(PartyApp);
