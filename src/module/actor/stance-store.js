/**
 * @file Where a character's stance is kept: an actor flag, cleared by the
 *       Referee's client when the Round it was taken in is over.
 *
 * The numbers are in stance.ts. Combat Actions.md: Guard, Press and Defensive
 * Fighting all last "until the end of the Round", so whoever owns the actor
 * sets the flag, and the active GM -- who owns everything -- clears it when
 * the combat moves on to the next Round or ends.
 */
import { STANCE_KINDS } from "./stance";

const FLAG = "stance";

/**
 * The stance an actor is in, if any.
 *
 * @param {Actor} actor - The actor.
 * @returns {import("./stance").StanceKind | null} The stance, or null.
 */
export const currentStance = (actor) => {
  const kind = actor?.flags?.[game.system.id]?.[FLAG]?.kind;
  return STANCE_KINDS.includes(kind) ? kind : null;
};

/**
 * Put an actor into a stance for the rest of this Round.
 *
 * @param {Actor} actor - The actor.
 * @param {import("./stance").StanceKind} kind - The stance.
 * @returns {Promise<Actor>} The updated actor.
 */
export const setStance = (actor, kind) =>
  actor.setFlag(game.system.id, FLAG, {
    kind,
    combatId: game.combat?.id ?? null,
    round: game.combat?.round ?? null,
  });

/**
 * Drop an actor's stance.
 *
 * @param {Actor} actor - The actor.
 * @returns {Promise<Actor> | undefined} The updated actor, if it had one.
 */
export const clearStance = (actor) => (currentStance(actor) ? actor.unsetFlag(game.system.id, FLAG) : undefined);

/**
 * Clear the stance of every actor in a combat. Run on the active GM only, so
 * it happens once, by someone allowed to write every actor.
 *
 * @param {Combat} combat - The combat whose Round is over.
 * @returns {Promise<void>}
 */
const clearCombatStances = async (combat) => {
  if (!game.users.activeGM?.isSelf) return;
  const actors = new Set(combat.combatants.map((c) => c.actor).filter(Boolean));
  await Promise.all([...actors].map(clearStance));
};

/** Register the hooks that end a stance with its Round. Call during init. */
export const registerStanceHooks = () => {
  Hooks.on("updateCombat", (combat, changed) => {
    if ("round" in changed) clearCombatStances(combat);
  });
  Hooks.on("deleteCombat", (combat) => clearCombatStances(combat));
};
