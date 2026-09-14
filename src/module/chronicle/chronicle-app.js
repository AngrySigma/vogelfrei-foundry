/**
 * @file The Chronicle window: what day it is, and what the party is down.
 *
 * Always available, never modal. The top is the watch track, drawn as a bar of
 * the whole day cut into however many watches this party keeps; the list below
 * is every delve the world remembers, open or not. Closing a delve's window
 * closes nothing -- the record is here until the Referee drops it.
 */
import { checksBetween, newDelve, restState, TERRAIN } from "./chronicle";
import {
  advanceDays,
  advanceWatches,
  clampWatches,
  clockRange,
  phaseOf,
  rescaleCalendar,
  setCalendar,
  watchesElapsed,
  watchName,
} from "./day";
import DelveApp from "./delve-app";
import { rollEncounterChecks } from "./encounter";
import { getChronicle, refreshOnChange, updateChronicle } from "./store";
import announceUpkeep from "./upkeep";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * A watch as it is spoken of: "Watch 3, Afternoon".
 *
 * @param {number} watch - The watch index, from zero.
 * @param {number} watchesPerDay - Watches in the day.
 * @returns {string} The localised phrase.
 */
function describeWatch(watch, watchesPerDay) {
  return game.i18n.format("VF.chronicle.WatchNamed", {
    number: watch + 1,
    name: game.i18n.localize(`VF.chronicle.time.${watchName(watch, watchesPerDay)}`),
  });
}

/**
 * How the country describes itself on a whispered check.
 *
 * @param {import("./chronicle").Chronicle} chronicle - The Chronicle.
 * @returns {object} Arguments for rollEncounterCheck.
 */
function checkFor(chronicle) {
  return {
    speaker: game.i18n.localize(`VF.chronicle.terrain.${chronicle.travel.terrain}`),
    where: game.i18n.format("VF.chronicle.AtWatch", {
      day: chronicle.day,
      watch: describeWatch(chronicle.watch, chronicle.watchesPerDay),
    }),
    chanceIn6: chronicle.travel.chanceIn6,
    distance: chronicle.travel.distance,
  };
}

/**
 * Walk the calendar forward, making every travel check the walk crossed and
 * announcing any day that ended on the way.
 *
 * @param {(chronicle: import("./chronicle").Chronicle) => import("./day").Calendar} move
 *   Where the walk ends.
 */
async function travel(move) {
  const before = getChronicle();
  await updateChronicle((chronicle) => ({ ...chronicle, ...move(chronicle) }));

  const after = getChronicle();
  const perDay = after.watchesPerDay;
  const due = checksBetween(watchesElapsed(before, perDay), watchesElapsed(after, perDay), after.travel.everyWatches);
  await rollEncounterChecks(due, checkFor(after));
  await announceUpkeep(after.day - before.day);
}

/** @this {ChronicleApp} */
async function onWatchForward() {
  await travel((chronicle) => advanceWatches(chronicle, 1, chronicle.watchesPerDay));
}

/**
 * Take back a watch. Nothing is rolled: the party is un-walking the ground.
 *
 * @this {ChronicleApp}
 */
async function onWatchBack() {
  await updateChronicle((chronicle) => ({
    ...chronicle,
    ...advanceWatches(chronicle, -1, chronicle.watchesPerDay),
  }));
}

/** @this {ChronicleApp} */
async function onDayForward() {
  await travel((chronicle) => advanceDays(chronicle, 1, chronicle.watchesPerDay));
}

/**
 * Jump to a watch by clicking it on the bar. A correction, so nothing is rolled.
 *
 * @this {ChronicleApp}
 * @param {PointerEvent} _event - The click.
 * @param {HTMLElement} target - The segment clicked.
 */
async function onSetWatch(_event, target) {
  const watch = Number(target.dataset.watch);
  if (!Number.isFinite(watch)) return;
  await updateChronicle((chronicle) => ({
    ...chronicle,
    ...setCalendar(chronicle.day, watch, chronicle.watchesPerDay),
  }));
}

/**
 * Put the calendar on a day typed into the box. A correction, so nothing is
 * rolled and no rations are announced.
 *
 * @this {ChronicleApp}
 * @param {Event} event - The change.
 */
async function onSetDay(event) {
  const day = Number(event.target.value);
  await updateChronicle((chronicle) => ({
    ...chronicle,
    ...setCalendar(day, chronicle.watch, chronicle.watchesPerDay),
  }));
}

/**
 * Cut the day into a different number of watches, keeping the time of day.
 *
 * A travel check set to once a day stays once a day; any other cadence is the
 * Referee's own number and is left as they set it.
 *
 * @this {ChronicleApp}
 * @param {Event} event - The change.
 */
async function onSetWatchesPerDay(event) {
  const next = clampWatches(Number(event.target.value));
  await updateChronicle((chronicle) => {
    const previous = chronicle.watchesPerDay;
    if (next === previous) return null;
    const onceADay = chronicle.travel.everyWatches === previous;
    return {
      ...chronicle,
      ...rescaleCalendar(chronicle, previous, next),
      watchesPerDay: next,
      travel: { ...chronicle.travel, everyWatches: onceADay ? next : chronicle.travel.everyWatches },
    };
  });
}

/** @this {ChronicleApp} */
async function onRollTravelEncounter() {
  await rollEncounterChecks(1, checkFor(getChronicle()));
}

/**
 * Save the travel encounter rule from its boxes.
 *
 * Picking a terrain pulls in its chance and distance; typing in either box
 * afterwards keeps what was typed.
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

  const pickedTerrain = event?.target?.name === "terrain";
  const chanceIn6 = Math.max(0, Math.min(6, pickedTerrain ? (country?.encounterIn6 ?? typedChance) : typedChance));
  const distance = pickedTerrain ? (country?.distance ?? typedDistance) : typedDistance;

  if (!Roll.validate(distance)) {
    ui.notifications?.warn(game.i18n.format("VF.chronicle.BadFormula", { formula: distance }));
    this.render();
    return;
  }

  await updateChronicle((chronicle) => ({
    ...chronicle,
    travel: { terrain, everyWatches, chanceIn6, distance },
  }));
}

/**
 * Start a delve. An empty name is fine: newDelve names it after the day.
 *
 * @this {ChronicleApp}
 */
async function onCreateDelve() {
  const input = this.element.querySelector('input[name="delveName"]');
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
    position: { width: 360, height: "auto" },
    actions: {
      watchForward: onWatchForward,
      watchBack: onWatchBack,
      dayForward: onDayForward,
      setWatch: onSetWatch,
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
    const on = (selector, handler) =>
      this.element.querySelector(selector)?.addEventListener("change", handler.bind(this));

    on('[name="day"]', onSetDay);
    on('[name="watchesPerDay"]', onSetWatchesPerDay);
    for (const input of this.element.querySelectorAll(
      '[name="terrain"], [name="everyWatches"], [name="travelChance"], [name="travelDistance"]',
    )) {
      input.addEventListener("change", onSaveTravelRule.bind(this));
    }
  }

  /** @inheritDoc */
  async _prepareContext() {
    const chronicle = getChronicle();
    const perDay = chronicle.watchesPerDay;
    const isReferee = game.user.isGM;

    return {
      isReferee,
      calendar: {
        day: chronicle.day,
        watchesPerDay: perDay,
        phase: phaseOf(chronicle.watch, perDay),
        watch: describeWatch(chronicle.watch, perDay),
      },
      segments: Array.from({ length: perDay }, (_, index) => ({
        index,
        current: index === chronicle.watch,
        tooltip: `${describeWatch(index, perDay)} · ${clockRange(index, perDay)}`,
      })),
      delves: chronicle.delves.map((delve) => ({
        id: delve.id,
        name: delve.name,
        turn: delve.turn,
        penalised: restState(delve).penalised,
      })),
      // The Referee's half: where they are, how often it is checked, and on what.
      travel: isReferee
        ? {
            ...chronicle.travel,
            terrains: Object.keys(TERRAIN).map((key) => ({
              key,
              label: `VF.chronicle.terrain.${key}`,
              selected: key === chronicle.travel.terrain,
            })),
          }
        : null,
    };
  }
}

refreshOnChange(ChronicleApp);
