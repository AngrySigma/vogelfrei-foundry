/**
 * @file The Chronicle window: what day it is, and what the party is down.
 *
 * Always available, never modal. The calendar at the top is the whole of the
 * watch track; the list below it is every delve the world remembers, open or
 * not. Closing a delve's window closes nothing -- the record is here until the
 * Referee drops it.
 */
import {
  advanceDays,
  advanceWatches,
  checksBetween,
  clockOf,
  newDelve,
  restState,
  TERRAIN,
  watchesElapsed,
  watchOf,
} from "./chronicle";
import DelveApp from "./delve-app";
import { rollEncounterChecks } from "./encounter";
import { getChronicle, refreshOnChange, updateChronicle } from "./store";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * How the country describes itself on a whispered check.
 *
 * @param {import("./chronicle").Chronicle} chronicle - The Chronicle.
 * @returns {object} Arguments for rollEncounterCheck.
 */
function checkFor(chronicle) {
  const watch = watchOf(chronicle.watch);
  return {
    speaker: game.i18n.localize(`VF.chronicle.terrain.${chronicle.travel.terrain}`),
    where: game.i18n.format("VF.chronicle.AtWatch", {
      day: chronicle.day,
      watch: game.i18n.localize(`VF.chronicle.watch.${watch.key}`),
    }),
    chanceIn6: chronicle.travel.chanceIn6,
    distance: chronicle.travel.distance,
  };
}

/**
 * Say what the party has eaten, once a day's travel is behind them.
 *
 * Physical Deterioration.md wants a meal and water every twenty-four hours,
 * and the saves for going without are the Referee's to call. This only says
 * the day is over and how much to strike off, which is the part everybody
 * forgets -- so it is spoken aloud rather than whispered.
 *
 * @param {number} days - How many days passed.
 */
async function announceUpkeep(days) {
  if (days < 1) return;
  await ChatMessage.create({
    flavor: game.i18n.localize("VF.chronicle.UpkeepFlavor"),
    content: `<p>${game.i18n.format("VF.chronicle.Upkeep", { days })}</p>
      <p class="vf-upkeep-hint">${game.i18n.localize("VF.chronicle.UpkeepHint")}</p>`,
  });
}

/**
 * Move the calendar, and make every travel check the move crossed.
 *
 * @param {(calendar: import("./chronicle").Calendar) => import("./chronicle").Calendar} move
 *   How far to go.
 */
async function travel(move) {
  const before = getChronicle();
  await updateChronicle((chronicle) => ({ ...chronicle, ...move(chronicle) }));

  const after = getChronicle();
  const due = checksBetween(watchesElapsed(before), watchesElapsed(after), after.travel.everyWatches);
  await rollEncounterChecks(due, checkFor(after));
  await announceUpkeep(after.day - before.day);
}

/**
 * Move the calendar on by one watch.
 *
 * @this {ChronicleApp}
 */
async function onWatchForward() {
  await travel((chronicle) => advanceWatches(chronicle, 1));
}

/**
 * Take back a watch, for the click that should not have happened.
 *
 * Going backwards checks nothing: the party is un-walking the ground.
 *
 * @this {ChronicleApp}
 */
async function onWatchBack() {
  await updateChronicle((chronicle) => ({ ...chronicle, ...advanceWatches(chronicle, -1) }));
}

/**
 * Skip a whole day, keeping the time of day.
 *
 * @this {ChronicleApp}
 */
async function onDayForward() {
  await travel((chronicle) => advanceDays(chronicle, 1));
}

/**
 * Roll a travel check now, whatever the cadence says.
 *
 * @this {ChronicleApp}
 */
async function onRollTravelEncounter() {
  await rollEncounterChecks(1, checkFor(getChronicle()));
}

/**
 * Save the travel encounter rule from its boxes.
 *
 * Choosing a terrain moves the chance to the book's number for it; the box
 * stays editable, because the Referee knows which woods these are.
 *
 * @this {ChronicleApp}
 * @param {Event} event - The change that prompted the save.
 */
async function onSaveTravelRule(event) {
  const root = this.element;
  const terrain = root.querySelector('[name="terrain"]')?.value || "clear";
  const country = TERRAIN[terrain];
  const everyWatches = Math.max(1, Math.trunc(Number(root.querySelector('[name="everyWatches"]')?.value) || 1));
  const typedChance = Math.trunc(Number(root.querySelector('[name="travelChance"]')?.value) || 0);
  const typedDistance = root.querySelector('[name="travelDistance"]')?.value?.trim() || "";

  // Picking a terrain pulls in its chance and its distance; typing in either
  // box afterwards keeps what was typed.
  const pickedTerrain = event?.target?.name === "terrain";
  const chanceIn6 = Math.max(0, Math.min(6, pickedTerrain ? (country?.encounterIn6 ?? typedChance) : typedChance));
  const wanted = pickedTerrain ? (country?.distance ?? typedDistance) : typedDistance;

  if (!Roll.validate(wanted)) {
    ui.notifications?.warn(game.i18n.format("VF.chronicle.BadFormula", { formula: wanted }));
    this.render();
    return;
  }

  await updateChronicle((chronicle) => ({
    ...chronicle,
    travel: { terrain, everyWatches, chanceIn6, distance: wanted },
  }));
}

/**
 * Start a delve, named from the input beside the button.
 *
 * @this {ChronicleApp}
 */
async function onCreateDelve() {
  const input = this.element.querySelector('input[name="delveName"]');
  // An empty box is fine: newDelve names it after the day, so a delve can be
  // started in one click and named later if it turns out to deserve one.
  const name = input?.value?.trim() ?? "";

  const id = foundry.utils.randomID();
  await updateChronicle((chronicle) => ({
    ...chronicle,
    delves: [...chronicle.delves, newDelve(name, chronicle, id)],
  }));

  if (input) input.value = "";
  DelveApp.open(id);
}

/**
 * Open a delve's own window.
 *
 * @this {ChronicleApp}
 * @param {PointerEvent} _event - The click.
 * @param {HTMLElement} target - The button clicked.
 */
function onOpenDelve(_event, target) {
  const { delveId } = target.closest("[data-delve-id]")?.dataset ?? {};
  if (delveId) DelveApp.open(delveId);
}

/**
 * Drop a delve, after asking. The record and its window both go.
 *
 * @this {ChronicleApp}
 * @param {PointerEvent} _event - The click.
 * @param {HTMLElement} target - The button clicked.
 */
async function onDropDelve(_event, target) {
  const { delveId } = target.closest("[data-delve-id]")?.dataset ?? {};
  if (!delveId) return;

  const delve = getChronicle().delves.find((entry) => entry.id === delveId);
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("VF.chronicle.DropDelve") },
    content: `<p>${game.i18n.format("VF.chronicle.DropDelveConfirm", { name: delve?.name ?? "" })}</p>`,
  });
  if (!confirmed) return;

  for (const app of DelveApp.instances()) {
    if (app.delveId === delveId) await app.close();
  }
  await updateChronicle((chronicle) => ({
    ...chronicle,
    delves: chronicle.delves.filter((entry) => entry.id !== delveId),
  }));
}

export default class ChronicleApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vf-chronicle",
    classes: ["vogelfrei", "vf-chronicle"],
    window: {
      title: "VF.chronicle.Title",
      icon: "fa-solid fa-hourglass-half",
      resizable: true,
    },
    position: { width: 340, height: "auto" },
    actions: {
      watchForward: onWatchForward,
      watchBack: onWatchBack,
      dayForward: onDayForward,
      createDelve: onCreateDelve,
      openDelve: onOpenDelve,
      dropDelve: onDropDelve,
      rollTravelEncounter: onRollTravelEncounter,
    },
  };

  static PARTS = {
    main: { template: "/systems/vogelfrei/dist/templates/apps/chronicle.hbs" },
  };

  /** Open the Chronicle, or bring it forward if it is already up. */
  static show() {
    const [existing] = [...ChronicleApp.instances()];
    if (existing) {
      existing.bringToFront();
      return existing;
    }
    return new ChronicleApp().render(true);
  }

  /** @inheritDoc */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const input of this.element.querySelectorAll(
      '[name="terrain"], [name="everyWatches"], [name="travelChance"]',
    )) {
      input.addEventListener("change", onSaveTravelRule.bind(this));
    }
  }

  /** @inheritDoc */
  async _prepareContext() {
    const chronicle = getChronicle();
    const watch = watchOf(chronicle.watch);

    return {
      isReferee: game.user.isGM,
      calendar: {
        day: chronicle.day,
        ordinal: watch.index + 1,
        label: `VF.chronicle.watch.${watch.key}`,
        daylight: watch.daylight,
        icon: watch.daylight ? "fa-sun" : "fa-moon",
        clock: clockOf(chronicle.watch),
      },
      delves: chronicle.delves.map((delve) => ({
        id: delve.id,
        name: delve.name,
        turn: delve.turn,
        penalised: restState(delve).penalised,
      })),
      // The Referee's half: where they are, how often it is checked, and on what.
      travel: game.user.isGM
        ? {
            ...chronicle.travel,
            terrains: Object.entries(TERRAIN).map(([key, { encounterIn6, distance }]) => ({
              key,
              encounterIn6,
              distance,
              label: `VF.chronicle.terrain.${key}`,
              selected: key === chronicle.travel.terrain,
            })),
          }
        : null,
    };
  }
}

refreshOnChange(ChronicleApp);
