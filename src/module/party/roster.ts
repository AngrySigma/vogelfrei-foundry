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
    members.push({ uuid: entry.uuid, role: entry.role, shares: cleanShares(entry.shares) });
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
  const entry: RosterEntry = { uuid, role, shares };
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

/** Take an Actor off the roster. */
export function removeMember(party: Party, uuid: string): Party {
  return { ...party, members: party.members.filter((entry) => entry.uuid !== uuid) };
}

/** Change one member's shares. */
export function setShares(party: Party, uuid: string, shares: unknown): Party {
  return {
    ...party,
    members: party.members.map((entry) => (entry.uuid === uuid ? { ...entry, shares: cleanShares(shares) } : entry)),
  };
}

/** What the slowest-member check needs to know about each member. */
export type Walker = {
  name: string;
  role: Role;
  /** Exploration movement in feet per Turn, or null if the Actor has none. */
  perTurn: number | null;
  /** Overland travel in miles per day, or null if the Actor has none. */
  perDay: number | null;
};

/** A pace, and every member moving at exactly it. */
export type Pace = { value: number; names: string[] };

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
 * Who holds the party back.
 *
 * Time and Movement.md: "Any group of Characters moves at the speed of the
 * slowest group member." The slowest per Turn and the slowest per day can be
 * different people, since Toughness counts only on the road, so each is found
 * separately.
 *
 * Vehicles are left out until they have movement of their own worth trusting
 * -- today a wagon is a character sheet with a human's legs. A member without
 * a figure is skipped rather than read as standing still.
 *
 * @param walkers - Every member, with its movement.
 * @param pace - Which figure to compare.
 * @returns The slowest figure and everyone moving at it, or null if nobody counts.
 */
export function slowest(walkers: Walker[], pace: "perTurn" | "perDay"): Pace | null {
  const counted = walkers.filter(
    (walker) => walker.role !== "vehicle" && typeof walker[pace] === "number" && Number.isFinite(walker[pace]),
  );
  if (counted.length === 0) return null;

  const value = Math.min(...counted.map((walker) => walker[pace] as number));
  return { value, names: counted.filter((walker) => walker[pace] === value).map((walker) => walker.name) };
}
