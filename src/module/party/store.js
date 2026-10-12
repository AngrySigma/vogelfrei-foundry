/**
 * @file Where the party roster lives, and who is allowed to change it.
 *
 * One world-scoped setting, as with the Chronicle: world settings reach every
 * client and their `onChange` fires everywhere, so the Referee's edits redraw
 * the players' windows without a socket of our own. Only the Referee writes
 * the roster -- the players' copy is a readout.
 *
 * The marching order is the exception: it is the players' to arrange. They
 * cannot write a world setting, so a player's change is sent to the active
 * Referee's client as a `User#query`, which applies it. Only formation
 * operations travel that way, so a player still cannot touch the roster.
 * With no Referee connected there is nobody to apply it, and the player is
 * told so.
 */
import { applyFormationOp } from "./formation";
import { defaultParty, inFormation, normaliseParty, placeMember, removeMember } from "./roster";

/** The setting key, under the system's namespace. */
export const SETTING = "party";

/** The query a player's formation change travels as. */
export const FORMATION_QUERY = "vogelfrei.formation";

/**
 * Writes in flight, one after another. Two players dragging at once would
 * otherwise both read the same roster and the second write would undo the
 * first.
 */
let writes = Promise.resolve();

/** Applications that should redraw when the roster, or one of its Actors, changes. */
const listeners = new Set();

/**
 * Have an application redraw whenever the roster changes.
 *
 * @param {Function} application - An ApplicationV2 subclass with static instances().
 */
export function refreshOnChange(application) {
  listeners.add(application);
}

/** Redraw every open window that cares. */
export function refresh() {
  for (const application of listeners) {
    for (const app of application.instances()) app.render();
  }
}

/** Register the setting. Called from `init`. */
export function registerPartySetting() {
  CONFIG.queries[FORMATION_QUERY] = onFormationQuery;
  game.settings.register(game.system.id, SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: defaultParty(),
    onChange: refresh,
  });
}

/**
 * The roster as it stands.
 *
 * @returns {import("./roster").Party} The roster, cleaned of anything malformed.
 */
export function getParty() {
  return normaliseParty(game.settings.get(game.system.id, SETTING));
}

/**
 * Change the roster. Refused, with a notice, for anyone but the Referee.
 *
 * @param {(party: import("./roster").Party) => import("./roster").Party|null} mutate
 *   Given a private copy, returns what the roster should become, or null to leave it.
 * @returns {Promise<void>} Once the setting is written.
 */
export async function updateParty(mutate) {
  if (!game.user.isGM) {
    ui.notifications?.warn(game.i18n.localize("VF.party.RefereeOnly"));
    return;
  }
  writes = writes
    .then(async () => {
      const next = mutate(foundry.utils.deepClone(getParty()));
      if (next) await game.settings.set(game.system.id, SETTING, next);
    })
    .catch((error) => console.error("Vogelfrei | Could not save the party.", error));
  await writes;
}

/**
 * Apply a formation change to the roster.
 *
 * @param {import("./roster").Party} party - The roster.
 * @param {import("./formation").FormationOp} op - The change.
 * @returns {import("./roster").Party} The roster with the new formation.
 */
function withFormationOp(party, op) {
  return { ...party, formation: applyFormationOp(party.formation, op, inFormation(party.members)) };
}

/**
 * Change the marching order, from anyone.
 *
 * The Referee writes directly. A player's change goes to the active Referee,
 * who applies it; the setting's change then redraws everyone's window,
 * including the sender's.
 *
 * @param {import("./formation").FormationOp} op - The change.
 * @returns {Promise<void>} Once it is applied, or refused.
 */
export async function editFormation(op) {
  if (game.user.isGM) {
    await updateParty((party) => withFormationOp(party, op));
    return;
  }

  const referee = game.users.activeGM;
  if (!referee) {
    ui.notifications?.warn(game.i18n.localize("VF.formation.NeedsReferee"));
    return;
  }
  try {
    await referee.query(FORMATION_QUERY, op, { timeout: 10_000 });
  } catch (error) {
    console.error("Vogelfrei | The Referee did not apply a formation change.", error);
    ui.notifications?.warn(game.i18n.localize("VF.formation.NotApplied"));
  }
}

/**
 * Receive a player's formation change. Registered on every client, but only
 * the active Referee is ever asked, and anyone else refuses.
 *
 * @param {import("./formation").FormationOp} op - The change.
 * @returns {Promise<boolean>} True once applied.
 */
async function onFormationQuery(op) {
  if (!game.user.isGM) throw new Error("Only a Referee applies formation changes");
  await updateParty((party) => withFormationOp(party, op));
  return true;
}

/**
 * Read in the party OSE kept, once.
 *
 * OSE marked membership with a `party` flag on each character. A world that
 * used it opens with those characters already on the roster, as players; the
 * flags are left where they are, since nothing reads them any more.
 *
 * Runs on the first Referee's `ready` and records that it has, so a roster
 * the Referee has since emptied stays empty.
 *
 * @returns {Promise<void>} Once the roster is written, or at once if there is nothing to do.
 */
export async function adoptLegacyParty() {
  if (!game.user.isGM || game.users.activeGM !== game.user) return;
  const party = getParty();
  if (party.version >= 1) return;

  let next = { ...party, version: 1 };
  for (const actor of game.actors) {
    if (actor.getFlag(game.system.id, "party") === true) next = placeMember(next, actor.uuid, "player");
  }
  await game.settings.set(game.system.id, SETTING, next);
}

/**
 * Keep the roster honest as Actors come and go.
 *
 * A deleted Actor is struck off, by the active Referee only so it happens
 * once. Any change to a member -- Wounds, encumbrance, name, portrait --
 * redraws the window, since it shows them.
 */
export function registerPartyHooks() {
  Hooks.on("deleteActor", (actor) => {
    if (game.users.activeGM !== game.user) return;
    if (!getParty().members.some((entry) => entry.uuid === actor.uuid)) return;
    updateParty((party) => removeMember(party, actor.uuid));
  });

  const redrawIfMember = (document) => {
    const actor = document.documentName === "Actor" ? document : document.parent;
    if (actor?.documentName !== "Actor") return;
    if (getParty().members.some((entry) => entry.uuid === actor.uuid)) refresh();
  };
  Hooks.on("updateActor", redrawIfMember);
  // Picking up or dropping gear changes encumbrance, and so movement.
  Hooks.on("createItem", redrawIfMember);
  Hooks.on("updateItem", redrawIfMember);
  Hooks.on("deleteItem", redrawIfMember);
}
