/**
 * @file Where the Chronicle lives, and who is allowed to change it.
 *
 * One world-scoped setting holds the calendar and every delve. World settings
 * are pushed to every client and their `onChange` fires everywhere, so the
 * Referee's clicks reach the players' windows without a socket of our own.
 *
 * Only the Referee writes. The players' widgets are readouts: the controls are
 * absent from their templates, and `assertReferee` is the second lock behind
 * that first one.
 *
 * Note what this is not. A world setting is readable by anyone with a browser
 * console, so the Referee-only parts of the Chronicle are hidden from the
 * player's *screen*, not from a player who goes looking. That is the same
 * guarantee Foundry gives a Referee-only journal, and it is the right one for
 * a table; it is not a secret store, so nothing belongs here that would matter
 * if it leaked.
 */
import { DEFAULT_EPOCH, watchSeconds } from "./calendar";
import { defaultChronicle } from "./chronicle";
import { clampWatches, setCalendar } from "./day";

/** The setting key, under the system's namespace. */
export const SETTING = "chronicle";

/** Applications that should redraw when the Chronicle changes. */
const listeners = new Set();

/**
 * Have an application redraw whenever the Chronicle changes.
 *
 * @param {Function} application - An ApplicationV2 subclass with static instances().
 */
export function refreshOnChange(application) {
  listeners.add(application);
}

/** Redraw every open window that cares. */
function refresh() {
  for (const application of listeners) {
    for (const app of application.instances()) app.render();
  }
}

/** Register the setting. Called from `init`. */
export function registerChronicleSetting() {
  game.settings.register(game.system.id, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: defaultChronicle(),
    onChange: refresh,
  });
}

/**
 * The Chronicle as it stands.
 *
 * Defaults are merged in on every read rather than migrated, so a world saved
 * by an older build -- or by a hand-edited setting -- still opens.
 *
 * @returns {import("./chronicle").Chronicle} The calendar and its delves.
 */
export function getChronicle() {
  const stored = game.settings.get(game.system.id, SETTING) || {};
  const defaults = defaultChronicle();
  const watchesPerDay = clampWatches(stored.watchesPerDay ?? defaults.watchesPerDay);
  const merged = {
    ...defaults,
    ...stored,
    watchesPerDay,
    delves: Array.isArray(stored.delves) ? stored.delves : [],
    feasts: Array.isArray(stored.feasts) ? stored.feasts : [],
    // Nested, so a shallow spread would drop a field added after the world
    // was first saved rather than filling it in.
    travel: { ...defaults.travel, ...(stored.travel || {}) },
    // Not clamped against the calendar here: this is read at `init`, before
    // `game.time` exists. The Almanac clamps what it is given.
    epoch: { ...DEFAULT_EPOCH, ...(stored.epoch || {}) },
  };
  // A watch that no longer exists in a shorter day is brought back inside it.
  return { ...merged, ...setCalendar(merged.day, merged.watch, watchesPerDay) };
}

/**
 * Put Foundry's own world clock where the Chronicle says it is.
 *
 * One-way. The Chronicle owns the count; `game.time.worldTime` is a readout
 * of it, kept honest so that scene darkness, the core time display and any
 * module listening for `updateWorldTime` see the same moment the party does.
 * Nothing reads the world clock back: a module that moves it does not move
 * the Chronicle, and the next Chronicle write will put it back.
 *
 * The instant written is the start of the current watch, which for the
 * small-hours watches falls past midnight and so on the following date --
 * see calendar.ts on why that is right for the clock and not for the count.
 *
 * @param {import("./chronicle").Chronicle} chronicle - The Chronicle as saved.
 * @returns {Promise<void>} Once the clock agrees, or at once if it already did.
 */
export async function syncWorldTime(chronicle) {
  if (!game.user?.isGM || !game.time?.calendar) return;
  try {
    const seconds = watchSeconds(
      game.time.calendar,
      chronicle.epoch,
      chronicle.day,
      chronicle.watch,
      chronicle.watchesPerDay,
    );
    if (Math.round(game.time.worldTime) === Math.round(seconds)) return;
    await game.time.set(seconds);
  } catch (error) {
    // A replacement calendar that this arithmetic cannot walk is the
    // Referee's business, not a reason to refuse the click that moved time.
    console.warn("Vogelfrei | Could not put the world clock on the Chronicle's date.", error);
  }
}

/**
 * Refuse to write unless the user is the Referee.
 *
 * @returns {boolean} Whether the write may proceed.
 */
function assertReferee() {
  if (game.user.isGM) return true;
  ui.notifications?.warn(game.i18n.localize("VF.chronicle.RefereeOnly"));
  return false;
}

/**
 * Change the Chronicle.
 *
 * @param {(chronicle: import("./chronicle").Chronicle) => import("./chronicle").Chronicle} mutate
 *   Given a private copy, returns what the Chronicle should become.
 * @returns {Promise<void>} Once the setting is written.
 */
export async function updateChronicle(mutate) {
  if (!assertReferee()) return;
  const next = mutate(foundry.utils.deepClone(getChronicle()));
  if (!next) return;
  await game.settings.set(game.system.id, SETTING, next);
  await syncWorldTime(next);
}

/**
 * One delve by id.
 *
 * @param {string} id - The delve's id.
 * @returns {import("./chronicle").Delve|null} The delve, or null if it was dropped.
 */
export function getDelve(id) {
  return getChronicle().delves.find((delve) => delve.id === id) || null;
}

/**
 * Change one delve, leaving the rest of the Chronicle alone.
 *
 * @param {string} id - The delve's id.
 * @param {(delve: import("./chronicle").Delve) => import("./chronicle").Delve} mutate
 *   Given a private copy, returns what the delve should become.
 * @returns {Promise<void>} Once the setting is written.
 */
export async function updateDelve(id, mutate) {
  await updateChronicle((chronicle) => {
    const index = chronicle.delves.findIndex((delve) => delve.id === id);
    if (index === -1) return null;
    chronicle.delves[index] = mutate(chronicle.delves[index]) || chronicle.delves[index];
    return chronicle;
  });
}
