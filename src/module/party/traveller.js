/**
 * @file What the travel arithmetic needs from each roster member's Actor.
 *
 * Kept apart from the window so the Referee's side of a player's roster edit
 * can check a seat without drawing anything.
 */
import { milesPerDay } from "./roster";

/**
 * How a member moves.
 *
 * A character listed as a vehicle is the old way of keeping a wagon -- a
 * character sheet with a human's legs -- and is left out of the pace until it
 * is turned into a real vehicle.
 *
 * @param {Actor|null} actor - The member's Actor.
 * @param {import("./roster").Role} role - Its role on the roster.
 * @returns {import("./travel").TravellerKind} Its kind.
 */
export function kindOf(actor, role) {
  if (!actor) return "other";
  if (actor.type === "vehicle") return actor.system.isDrawn ? "drawn" : "vessel";
  if (actor.type === "monster" && actor.system.burden?.enabled) return "animal";
  if (role === "vehicle") return "other";
  return "walker";
}

/**
 * One member, as the travel arithmetic sees it.
 *
 * @param {import("./roster").RosterEntry} entry - The roster entry.
 * @param {Actor|null} [actor] - Its Actor, if already looked up.
 * @returns {import("./travel").Traveller} The member's figures.
 */
export function travellerOf(entry, actor = fromUuidSync(entry.uuid)) {
  const kind = kindOf(actor, entry.role);
  const base = { uuid: entry.uuid, name: actor?.name ?? "", kind, in: entry.in ?? null, seat: entry.seat ?? "aboard" };
  if (!actor) return base;
  const system = actor.system;

  if (kind === "drawn") return { ...base, cargoPoints: system.cargo?.points ?? 0, axles: system.axles ?? 0 };
  if (kind === "vessel") return { ...base, milesPerDay: system.milesPerDay ?? null };
  if (kind === "animal") {
    return {
      ...base,
      points: system.burden.points ?? 0,
      basePerTurn: Number(system.movement?.base) || null,
      speedFactor: system.burden.speedFactor ?? 1,
    };
  }

  const perTurn = Number(system?.movement?.base);
  const hasMovement = Number.isFinite(perTurn);
  const toughness = actor.type === "character" ? Number(system?.scores?.toughness?.mod) || 0 : 0;
  // Only the points scheme has the book's breakpoints; OSE's weights do not.
  const points =
    actor.type === "character" && system.encumbrance?.variant === "vogelfrei" ? system.encumbrance.value : null;
  return {
    ...base,
    points,
    perTurn: hasMovement ? perTurn : null,
    perDay: hasMovement ? milesPerDay(perTurn, toughness) : null,
  };
}
