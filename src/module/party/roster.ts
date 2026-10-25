/**
 * @file The party roster: who travels with the party, as what, and for how
 *       many shares.
 *
 * The roster is an ordered list of world Actors, each in one of five roles.
 * Order matters only within a role -- it is the order the Referee dragged them
 * into -- so the whole roster is one list and a role's members are read off
 * it by filtering.
 *
 * Shares are what an XP split divides by. Each role fills in a default when
 * an Actor joins it, and the Referee overwrites it freely: a hireling's share
 * in particular is whatever was agreed with them.
 *
 * Foundry-free, so the bookkeeping can be checked on its own.
 */

import { defaultFormation, type Formation, normaliseFormation } from "./formation";
import { SEATS, type Seat } from "./travel";

/** The roles, in the order the window lists them. */
export const ROLES = ["player", "henchman", "hireling", "npc", "vehicle"] as const;

export type Role = (typeof ROLES)[number];

/**
 * The share an Actor gets on joining a role. A player character takes a whole
 * share and a henchman half of one; a hireling's is a matter of contract, and
 * 0.2 is only where the haggling starts. NPCs along for their own reasons and
 * vehicles take nothing.
 */
export const DEFAULT_SHARES: Readonly<Record<Role, number>> = {
  player: 1,
  henchman: 0.5,
  hireling: 0.2,
  npc: 0,
  vehicle: 0,
};

/** One Actor on the roster. */
export type RosterEntry = {
  /** The world Actor's uuid, `Actor.<id>`. */
  uuid: string;
  role: Role;
  /** Shares of an XP split. Never negative. */
  shares: number;
  /** The member this one rides in, on or behind -- see travel.ts. */
  in?: string | null;
  /** Where in it: aboard, in the team, or on the Teamster's seat. */
  seat?: Seat;
};

/** The roster as stored in the world setting. */
export type Party = {
  /**
   * 0 until the old per-Actor party flags have been read in, 1 after. See
   * store.js; nothing else looks at it.
   */
  version: number;
  members: RosterEntry[];
  /** The marching order: see formation.ts. */
  formation: Formation;
};

/** An empty roster. */
export function defaultParty(): Party {
  return { version: 0, members: [], formation: defaultFormation() };
}

/** Whether a string names a role. */
export function isRole(role: unknown): role is Role {
  return typeof role === "string" && (ROLES as readonly string[]).includes(role);
}

/**
 * A share as the roster keeps it: a finite number, at least zero, to two
 * decimal places. Anything unreadable is zero rather than an error, since it
 * comes straight out of a text box.
 *
 * @param shares - What was typed or stored.
 * @returns The share to keep.
 */
export function cleanShares(shares: unknown): number {
  const value = Number(shares);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Read a stored roster, dropping anything malformed and any Actor listed
 * twice -- the first listing wins. A world saved by an older build, or a
 * hand-edited setting, still opens.
 *
 * @param stored - Whatever the setting held.
 * @returns A roster safe to work with.
 */
export function normaliseParty(stored: unknown): Party {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Partial<Party>;
  const seen = new Set<string>();
  const members: RosterEntry[] = [];

  for (const entry of Array.isArray(raw.members) ? raw.members : []) {
    if (!entry || typeof entry.uuid !== "string" || !entry.uuid || seen.has(entry.uuid)) continue;
    if (!isRole(entry.role)) continue;
    seen.add(entry.uuid);
    const seated = typeof entry.in === "string" && entry.in !== entry.uuid;
    members.push({
      uuid: entry.uuid,
      role: entry.role,
      shares: cleanShares(entry.shares),
      in: seated ? entry.in : null,
      seat: seated && SEATS.includes(entry.seat as Seat) ? entry.seat : "aboard",
    });
  }

  // Anyone in a container that is not on the roster, or in a loop of
  // containers a hand-edited setting made, steps out.
  for (const entry of members) {
    if (entry.in && (!seen.has(entry.in) || encloses(members, entry.uuid, entry.in))) entry.in = null;
  }

  return {
    version: Number(raw.version) || 0,
    members,
    formation: normaliseFormation(raw.formation, inFormation(members)),
  };
}

/**
 * Who may stand in the marching order: everyone on the roster but the
 * vehicles, which follow the column rather than take a square in it.
 */
export function inFormation(members: RosterEntry[]): Set<string> {
  return new Set(members.filter((entry) => entry.role !== "vehicle").map((entry) => entry.uuid));
}

/** The members holding one role, in roster order. */
export function membersOf(party: Party, role: Role): RosterEntry[] {
  return party.members.filter((entry) => entry.role === role);
}

/**
 * Put an Actor into a role, optionally ahead of another member.
 *
 * An Actor already on the roster is moved rather than listed twice. Moving it
 * to a different role resets its shares to that role's default, since the old
 * figure was agreed for the old job; reordering it within its own role keeps
 * them.
 *
 * @param party - The roster.
 * @param uuid - The Actor joining or moving.
 * @param role - Where it goes.
 * @param before - A member to place it ahead of. Ignored unless that member
 *   holds the same role; otherwise the Actor goes to the end of the role.
 * @returns The new roster.
 */
export function placeMember(party: Party, uuid: string, role: Role, before?: string | null): Party {
  const existing = party.members.find((entry) => entry.uuid === uuid);
  const shares = existing && existing.role === role ? existing.shares : DEFAULT_SHARES[role];
  // Changing role does not take anyone off their horse.
  const entry: RosterEntry = { uuid, role, shares, in: existing?.in ?? null, seat: existing?.seat ?? "aboard" };
  const rest = party.members.filter((member) => member.uuid !== uuid);

  let index = before && before !== uuid ? rest.findIndex((m) => m.uuid === before && m.role === role) : -1;
  if (index === -1) {
    // After the last member of the role, so the role reads in drop order; or
    // at the very end if the role is empty.
    const last = rest.map((m) => m.role).lastIndexOf(role);
    index = last === -1 ? rest.length : last + 1;
  }

  return { ...party, members: [...rest.slice(0, index), entry, ...rest.slice(index)] };
}

/** Take an Actor off the roster. Whoever was in it steps out. */
export function removeMember(party: Party, uuid: string): Party {
  return {
    ...party,
    members: party.members
      .filter((entry) => entry.uuid !== uuid)
      .map((entry) => (entry.in === uuid ? { ...entry, in: null, seat: "aboard" } : entry)),
  };
}

/**
 * Whether `outer` is `inner` or holds it, at any depth.
 *
 * @param members - The roster's members.
 * @param outer - The would-be passenger.
 * @param inner - The would-be container.
 * @returns True if boarding would make a loop.
 */
function encloses(members: RosterEntry[], outer: string, inner: string): boolean {
  const byUuid = new Map(members.map((entry) => [entry.uuid, entry]));
  const seen = new Set<string>();
  for (let at: string | null | undefined = inner; at && !seen.has(at); at = byUuid.get(at)?.in) {
    if (at === outer) return true;
    seen.add(at);
  }
  return false;
}

/**
 * Put a member into a container, in a seat.
 *
 * Whether the seat suits them -- a horse in harness, a man on the box -- is
 * the caller's to check with `canSit`, since that needs the Actors. This only
 * keeps the roster sound: both must be on it, nothing may end up inside
 * itself, and the Teamster's seat holds one, so whoever had it moves aboard.
 *
 * @param party - The roster.
 * @param uuid - Who boards.
 * @param container - What they board.
 * @param seat - Where.
 * @returns The new roster, or the old one if the move makes no sense.
 */
export function board(party: Party, uuid: string, container: string, seat: Seat = "aboard"): Party {
  const has = (id: string) => party.members.some((entry) => entry.uuid === id);
  if (!has(uuid) || !has(container) || !SEATS.includes(seat)) return party;
  if (encloses(party.members, uuid, container)) return party;
  return {
    ...party,
    members: party.members.map((entry) => {
      if (entry.uuid === uuid) return { ...entry, in: container, seat };
      if (seat === "teamster" && entry.in === container && entry.seat === "teamster") {
        return { ...entry, seat: "aboard" };
      }
      return entry;
    }),
  };
}

/**
 * Put one Actor in another's place: same role, shares and seat, and whoever
 * rode in the old one rides in the new.
 *
 * @param party - The roster.
 * @param from - The Actor leaving.
 * @param to - The Actor taking its place; must not be on the roster already.
 * @returns The new roster, or the old one if either condition fails.
 */
export function replaceMember(party: Party, from: string, to: string): Party {
  const has = (id: string) => party.members.some((entry) => entry.uuid === id);
  if (!has(from) || has(to)) return party;
  return {
    ...party,
    members: party.members.map((entry) => {
      const next = entry.uuid === from ? { ...entry, uuid: to } : entry;
      return next.in === from ? { ...next, in: to } : next;
    }),
  };
}

/** Take a member out of whatever they are in. */
export function alight(party: Party, uuid: string): Party {
  return {
    ...party,
    members: party.members.map((entry) => (entry.uuid === uuid ? { ...entry, in: null, seat: "aboard" } : entry)),
  };
}

/** Change one member's shares. */
export function setShares(party: Party, uuid: string, shares: unknown): Party {
  return {
    ...party,
    members: party.members.map((entry) => (entry.uuid === uuid ? { ...entry, shares: cleanShares(shares) } : entry)),
  };
}

/**
 * Miles a day on foot, from the movement per Turn.
 *
 * Time and Movement.md: 120' a Turn is 24 miles a day, down in step to 0 for
 * the overencumbered, and "Characters apply their Toughness modifier to their
 * per-day travel distance on foot". A modifier never gets an overencumbered
 * character moving, nor takes anyone below a standstill.
 *
 * @param perTurn - Exploration movement, feet per Turn.
 * @param toughness - The Toughness modifier, for a character; 0 otherwise.
 * @returns Miles per day.
 */
export function milesPerDay(perTurn: number, toughness = 0): number {
  if (!(perTurn > 0)) return 0;
  return Math.max(0, perTurn / 5 + toughness);
}

/**
 * Who is on the roster, as what, and riding in what -- everything that
 * decides the party's day, and nothing (shares, marching order) that does not.
 *
 * @param party - The roster.
 * @returns A string that changes exactly when the membership does, in any order.
 */
export function membershipOf(party: Party): string {
  return party.members
    .map((entry) => `${entry.role}:${entry.uuid}:${entry.in ?? ""}:${entry.in ? entry.seat : ""}`)
    .sort()
    .join("|");
}
