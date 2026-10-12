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
 *
 * The second tab is the marching order, which is the players' sandbox: any
 * number of named layouts, any of them edited by anyone, one of them marked
 * as the order the party is keeping. Which layout a window is *showing* is
 * that window's own business, so a player trying out "Corridor" does not
 * change what everyone else is looking at -- only marking it does.
 */

import { layoutOf, MAX_WIDTH, placed, ranks } from "./formation";
import { milesPerDay, placeMember, ROLES, removeMember, setShares, slowest } from "./roster";
import { editFormation, getParty, refreshOnChange, updateParty } from "./store";
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
    const members = party.members.map(describeMember);

    return Object.assign(context, {
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
    if (game.user.isGM) this.#bindRoster();
  }

  /** The Referee's controls on the roster tab: shares, and dragging Actors between roles. */
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

    for (const list of this.element.querySelectorAll(".role[data-role]")) {
      dropZone(list, (event) => this.#onDropOnRole(event, list.dataset.role));
    }
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

    await updateParty((party) => actors.reduce((next, actor) => placeMember(next, actor.uuid, role, before), party));
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
