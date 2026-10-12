/**
 * @file The Chronicle window: what day it is, and what the party is down.
 *
 * Always available, never modal. The top is the date and the watch track --
 * the track drawn as a bar of the whole day cut into however many watches
 * this party keeps, the date read off the day counter through the world
 * calendar. The list below is every delve the world remembers, open or not.
 * Closing a delve's window closes nothing -- the record is here until the
 * Referee drops it.
 *
 * The Almanac, which only the Referee sees, is where the date comes from:
 * what day one fell on, and which dates the world keeps as feasts.
 */

import PartyApp, { partyPace } from "../party/party-app";
import { refreshOnChange as refreshOnPartyChange } from "../party/store";
import { civilDate, clampEpoch, feastsOn, longestMonth, monthIndexOf, monthOrdinalOf, monthsCrossed } from "./calendar";
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
import announceUpkeep, { announceFeasts, announceMonth } from "./upkeep";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/**
 * The calendar in force, or nothing if Foundry has not built one yet.
 *
 * Only absent before `setup`, which no window can be open in; guarded anyway,
 * because everything downstream degrades to a bare day count rather than
 * throwing.
 *
 * @returns {import("./calendar").CalendarLike|null} The world calendar.
 */
function worldCalendar() {
  return game.time?.calendar ?? null;
}

/**
 * Localise a name the calendar gives, which may be a key or may be a word.
 *
 * Core's months and weekdays are `CALENDAR.GREGORIAN.*` keys; a Referee's own
 * calendar is as likely to spell them out. `localize` returns the key back
 * unchanged when it knows nothing of it, so both work.
 *
 * @param {string} name - Whatever the calendar carries.
 * @returns {string} Something to put on screen.
 */
function calendarName(name) {
  return name ? game.i18n.localize(name) : "";
}

/**
 * What a day of the count is called, and what falls on it.
 *
 * @param {import("./chronicle").Chronicle} chronicle - The Chronicle.
 * @param {number} [day] - The day to describe; the current one by default.
 * @returns {object|null} The written date and its feasts, or null without a calendar.
 */
function dateOf(chronicle, day = chronicle.day) {
  const calendar = worldCalendar();
  if (!calendar) return null;

  const epoch = clampEpoch(calendar, chronicle.epoch);
  const components = civilDate(calendar, epoch, day);
  const month = calendar.months.values[components.month];
  const weekday = calendar.days.values[components.dayOfWeek];
  const text = game.i18n.format("VF.chronicle.DateLong", {
    weekday: calendarName(weekday?.name),
    day: components.dayOfMonth + 1,
    month: calendarName(month?.name),
    year: components.year,
  });

  return {
    components,
    text,
    feasts: feastsOn(chronicle.feasts, calendar, components).map((feast) => feast.name),
  };
}

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
 * announcing what the walk ran into: days ended, months turned over, and the
 * feast the party has woken up to.
 *
 * Only the day landed on is searched for feasts. A Referee who skips a
 * fortnight may have walked past one, and being told about a saint's day a
 * week behind the party is worse than not being told.
 *
 * @param {(chronicle: import("./chronicle").Chronicle) => import("./day").Calendar} move
 *   Where the walk ends.
 */
async function travel(move) {
  const before = getChronicle();
  const wasDated = dateOf(before);
  await updateChronicle((chronicle) => ({ ...chronicle, ...move(chronicle) }));

  const after = getChronicle();
  const perDay = after.watchesPerDay;
  const due = checksBetween(watchesElapsed(before, perDay), watchesElapsed(after, perDay), after.travel.everyWatches);
  await rollEncounterChecks(due, checkFor(after));

  const days = after.day - before.day;
  await announceUpkeep(days);

  const isDated = dateOf(after);
  const calendar = worldCalendar();
  if (!calendar || !wasDated || !isDated) return;

  const months = monthsCrossed(calendar, wasDated.components, isDated.components);
  await announceMonth(
    months,
    calendarName(calendar.months.values[isDated.components.month]?.name),
    isDated.components.year,
  );
  if (days > 0) await announceFeasts(feastsOn(after.feasts, calendar, isDated.components), isDated.text);
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
 * Say which date day one fell on.
 *
 * The count does not move: the party is still on day 47, it is just a
 * different 47th day. Nothing is rolled and nothing is announced -- this is
 * the Referee writing the campaign's first page, not time passing.
 *
 * @this {ChronicleApp}
 */
async function onSetEpoch() {
  const calendar = worldCalendar();
  if (!calendar) return;

  const root = this.element;
  const read = (name) => Number(root.querySelector(`[name="${name}"]`)?.value);
  const epoch = clampEpoch(calendar, { year: read("epochYear"), month: read("epochMonth"), day: read("epochDay") });
  await updateChronicle((chronicle) => ({ ...chronicle, epoch }));
}

/**
 * Write a date into the world's almanac.
 *
 * @this {ChronicleApp}
 */
async function onAddFeast() {
  const calendar = worldCalendar();
  if (!calendar) return;

  const root = this.element;
  const input = root.querySelector('[name="feastName"]');
  const name = input?.value?.trim() ?? "";
  if (!name) {
    ui.notifications?.warn(game.i18n.localize("VF.chronicle.NameTheFeast"));
    return;
  }

  const index = monthIndexOf(calendar, Number(root.querySelector('[name="feastMonth"]')?.value));
  const month = calendar.months.values[index];
  const longest = month ? longestMonth(month) : 31;
  const day = Math.min(longest, Math.max(1, Math.trunc(Number(root.querySelector('[name="feastDay"]')?.value) || 1)));

  const feast = { id: foundry.utils.randomID(), name, month: monthOrdinalOf(calendar, index), day };
  await updateChronicle((chronicle) => ({ ...chronicle, feasts: [...chronicle.feasts, feast] }));
  if (input) input.value = "";
}

/**
 * Strike a date out of the almanac. No confirmation: it is a name and a date.
 *
 * @this {ChronicleApp}
 * @param {PointerEvent} _event - The click.
 * @param {HTMLElement} target - The button clicked.
 */
async function onDropFeast(_event, target) {
  const { feastId } = target.closest("[data-feast-id]")?.dataset ?? {};
  if (!feastId) return;
  await updateChronicle((chronicle) => ({
    ...chronicle,
    feasts: chronicle.feasts.filter((feast) => feast.id !== feastId),
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
      openParty: () => PartyApp.show(),
      addFeast: onAddFeast,
      dropFeast: onDropFeast,
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
    for (const input of this.element.querySelectorAll('[name="epochYear"], [name="epochMonth"], [name="epochDay"]')) {
      input.addEventListener("change", onSetEpoch.bind(this));
    }
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
    const calendar = worldCalendar();
    const date = dateOf(chronicle);
    const epoch = calendar ? clampEpoch(calendar, chronicle.epoch) : chronicle.epoch;

    // Months, for the two dropdowns.
    const months = (calendar?.months.values ?? []).map((month, index) => ({
      ordinal: monthOrdinalOf(calendar, index),
      label: calendarName(month.name),
    }));

    // The longest any month of this calendar runs. The day boxes are capped
    // there rather than at 31, which is only the answer for one calendar, and
    // a date past the end of its own month is clamped when it is saved.
    const maxDay = (calendar?.months.values ?? []).reduce(
      (longest, month) => Math.max(longest, longestMonth(month)),
      1,
    );

    return {
      isReferee,
      party: partyPace(),
      calendar: {
        day: chronicle.day,
        watchesPerDay: perDay,
        phase: phaseOf(chronicle.watch, perDay),
        watch: describeWatch(chronicle.watch, perDay),
        date: date?.text ?? "",
        feasts: date?.feasts ?? [],
      },
      // The Referee's almanac: where the count is anchored, and what the
      // world keeps. Absent for players, who only ever see the date itself.
      almanac:
        isReferee && calendar
          ? {
              year: epoch.year,
              day: epoch.day,
              maxDay,
              months: months.map((month) => ({ ...month, selected: month.ordinal === epoch.month })),
              feastMonths: months,
              feasts: chronicle.feasts.map((feast) => ({
                ...feast,
                when: game.i18n.format("VF.chronicle.FeastOn", {
                  day: feast.day,
                  month: months.find((month) => month.ordinal === feast.month)?.label ?? feast.month,
                }),
              })),
            }
          : null,
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
// The party line shows the pace, which moves whenever someone's load does.
refreshOnPartyChange(ChronicleApp);
