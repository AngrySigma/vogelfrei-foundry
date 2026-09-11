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
import { defaultChronicle } from "./chronicle";

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
  return {
    ...defaultChronicle(),
    ...stored,
    delves: Array.isArray(stored.delves) ? stored.delves : [],
  };
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
