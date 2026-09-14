/**
 * @file The Chronicle: the party's clock, and the delves that hang off it.
 *
 * Two counters, deliberately independent.
 *
 * The **watch** track is the calendar, and lives in day.ts. The watch is not a
 * Vogelfrei rule -- the book counts Turns, Rounds and whole days
 * (docs/Adventuring/Time and Movement.md) -- it is borrowed from Hot Springs
 * Island as a bookkeeping unit for time and distance.
 *
 * The **turn** track belongs to a delve. A Turn is ten minutes, and it is the
 * clock of the dungeon: it burns the torches and brings the random encounters
 * (docs/Adventuring/Dungeon Exploration.md). It never advances the calendar on
 * its own. Coming back up, the Referee moves the calendar by however many
 * watches they judge the delve to have cost, with `suggestedWatches` offering
 * an opinion and no more than that.
 *
 * Foundry-free, so the arithmetic can be checked on its own.
 */

import { type Calendar, DEFAULT_WATCHES_PER_DAY, watchesForTurns } from "./day";

export type { Calendar } from "./day";

/** Turns to the hour. A Turn is ten minutes. */
export const TURNS_PER_HOUR = 6;

/**
 * Turns of exploration before a rest is owed.
 *
 * Dungeon Exploration.md: "After five Turns of exploration, Characters must
 * rest for one Turn. A party that presses on without resting suffers a -1
 * penalty to attack and damage rolls until it rests for a full Turn."
 */
export const TURNS_BEFORE_REST = 5;

/** Brass pieces to one experience point: treasure is worth 1 XP per silver. */
export const BP_PER_XP = 12;

/** How long a torch burns, and the stand-in for anything unpriced. */
export const TORCH_TURNS = 6;

/** How far a light reaches, and how long it lasts. */
export type LightKind = { turns: number | null; radius: number };

/**
 * What a light source is, how far it shows, and how long it lasts.
 *
 * Dungeon Exploration.md: candle 10' for 12 Turns, torch 30' for 6, lantern
 * 30' for 24 per flask. `eternal` is not from the book -- it is the enchanted
 * lamp, the luminous fungus, the hole in the ceiling -- and burns for null,
 * meaning never; its reach is assumed to be a torch's.
 */
export const LIGHT_KINDS: Readonly<Record<string, LightKind>> = {
  torch: { turns: TORCH_TURNS, radius: 30 },
  candle: { turns: 12, radius: 10 },
  lantern: { turns: 24, radius: 30 },
  eternal: { turns: null, radius: 30 },
};

/**
 * How far apart an encounter begins underground. Encounter Distance.md.
 *
 * The formula is in feet, so the roll is the answer.
 */
export const DUNGEON_DISTANCE = "3d6 * 10";

/**
 * XP for defeating an enemy, by Hit Dice. Advancement.md.
 *
 * The index is the effective Hit Dice; index 0 stands for the book's "<1".
 * Anything at 11 or above is worth the same 1,500.
 */
export const XP_BY_HIT_DICE: readonly number[] = [5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 1250] as const;

/** What anything of eleven Hit Dice or more is worth. */
export const MAX_HIT_DICE_XP = 1500;

/** A lit light source, burning against a delve's turn count. */
export type Light = {
  id: string;
  name: string;
  kind: string;
  litOnTurn: number;
  turns: number | null;
  radius: number;
};

/** An enemy defeated, counted for XP by Hit Dice rather than by a raw number. */
export type Kill = { id: string; name: string; hitDice: number; special: boolean; count: number };

/** Treasure recovered, valued in brass. */
export type Loot = { id: string; name: string; bp: number };

/** How often the Referee checks for a random encounter, and on what. */
export type EncounterRule = { everyTurns: number; chanceIn6: number; distance: string };

/**
 * How often the Referee checks while travelling, and where.
 *
 * The book makes one check a day (Wilderness Travel.md), which is six
 * watches; dangerous country is meant to warrant more.
 */
export type TravelEncounterRule = { everyWatches: number; chanceIn6: number; terrain: string; distance: string };

/** A kind of country: how often something is met in it, and how far off. */
export type TerrainKind = { encounterIn6: number; distance: string };

/**
 * Terrain: the chance of an encounter in it, and how far away it starts.
 *
 * The chances are the book's (Wilderness Travel.md). The distances are not --
 * the book gives a flat 3d6x10' with "up to threefold in open terrain", which
 * is far too tight for open plains and far too uniform everywhere else. These
 * are adapted from the d20 3.5 encounter distance table, picking the middling
 * variant where it offers several, and every one of them is meant to be
 * overwritten in the window: the Referee knows which woods these are.
 *
 * Mountains are the awkward case in any such table. 4d10x10' is a compromise
 * between meeting someone around a boulder and seeing them across a valley;
 * if it matters, rule it rather than roll it.
 *
 * The same book table carries a chance of getting lost, which nothing here
 * uses yet.
 */
export const TERRAIN: Readonly<Record<string, TerrainKind>> = {
  clear: { encounterIn6: 1, distance: "6d6 * 40" },
  forest: { encounterIn6: 2, distance: "2d8 * 10" },
  hills: { encounterIn6: 2, distance: "2d10 * 10" },
  desert: { encounterIn6: 2, distance: "6d6 * 20" },
  mountains: { encounterIn6: 3, distance: "4d10 * 10" },
  jungle: { encounterIn6: 3, distance: "2d6 * 10" },
  swamp: { encounterIn6: 3, distance: "2d8 * 10" },
};

/** One expedition underground, with its own clock. */
export type Delve = {
  id: string;
  name: string;
  turn: number;
  turnsSinceRest: number;
  /** The turn at which the calendar was last moved on this delve's account. */
  turnAtLastSync: number;
  startedOn: Calendar;
  encounter: EncounterRule;
  lights: Light[];
  kills: Kill[];
  loot: Loot[];
};

/** Everything the Chronicle remembers. */
export type Chronicle = Calendar & { watchesPerDay: number; delves: Delve[]; travel: TravelEncounterRule };

/** A fresh world: the first dawn of the first day, nothing delved yet. */
export function defaultChronicle(): Chronicle {
  return {
    day: 1,
    watch: 0,
    watchesPerDay: DEFAULT_WATCHES_PER_DAY,
    delves: [],
    travel: {
      everyWatches: DEFAULT_WATCHES_PER_DAY,
      chanceIn6: TERRAIN.clear?.encounterIn6 ?? 1,
      terrain: "clear",
      distance: TERRAIN.clear?.distance ?? DUNGEON_DISTANCE,
    },
  };
}

/**
 * How many checks fall due between one point on a clock and a later one.
 *
 * Counting rather than testing the endpoint, because one click can cross
 * several checks: an hour underground is six Turns, and a skipped day is six
 * watches. Testing only where we landed would quietly swallow the rest.
 *
 * @param from - The count before moving.
 * @param to - The count after moving.
 * @param every - The cadence; anything below one is read as one.
 * @returns How many checks the interval contains.
 */
export function checksBetween(from: number, to: number, every: number): number {
  const cadence = Math.max(1, Math.trunc(every));
  return Math.max(0, Math.floor(to / cadence) - Math.floor(from / cadence));
}

/**
 * Begin a delve.
 *
 * The wandering monster defaults are the book's ordinary dungeon: a check
 * every second Turn, on a 1 in 6. Both are meant to be changed per area.
 *
 * @param name - What the party calls the place.
 * @param calendar - When they went in, recorded for the log.
 * @param id - A unique id, supplied by the caller so this stays deterministic.
 * @returns The new delve, at turn zero.
 */
export function newDelve(name: string, calendar: Calendar, id: string): Delve {
  return {
    id,
    name: name.trim() || `Delve, day ${calendar.day}`,
    turn: 0,
    turnsSinceRest: 0,
    turnAtLastSync: 0,
    startedOn: { day: calendar.day, watch: calendar.watch },
    encounter: { everyTurns: 2, chanceIn6: 1, distance: DUNGEON_DISTANCE },
    lights: [],
    kills: [],
    loot: [],
  };
}

/**
 * Spend Turns exploring.
 *
 * @param delve - The delve as it stands.
 * @param turns - How many Turns to spend.
 * @returns The delve afterwards. Rest debt accrues; nothing else moves.
 */
export function advanceTurns(delve: Delve, turns = 1): Delve {
  const spent = Math.max(0, Math.trunc(turns));
  return { ...delve, turn: delve.turn + spent, turnsSinceRest: delve.turnsSinceRest + spent };
}

/**
 * Take the Turn of rest the party is owed.
 *
 * The Turn still passes -- torches burn through a rest -- but the debt clears.
 *
 * @param delve - The delve as it stands.
 * @returns The delve one Turn later, rested.
 */
export function rest(delve: Delve): Delve {
  return { ...delve, turn: delve.turn + 1, turnsSinceRest: 0 };
}

/**
 * Whether a rest is owed, and whether the party is already paying for skipping it.
 *
 * @param delve - The delve as it stands.
 * @returns Owed at five Turns; penalised past them.
 */
export function restState(delve: Delve): { owed: boolean; penalised: boolean } {
  return {
    owed: delve.turnsSinceRest >= TURNS_BEFORE_REST,
    penalised: delve.turnsSinceRest > TURNS_BEFORE_REST,
  };
}

/**
 * Turns of light left in a source, which may be negative once it has gone out.
 *
 * @param light - The lit source.
 * @param turn - The delve's current Turn.
 * @returns Turns remaining; zero or less means dark, Infinity means eternal.
 */
export function lightRemaining(light: Light, turn: number): number {
  if (light.turns === null) return Number.POSITIVE_INFINITY;
  return light.turns - (turn - light.litOnTurn);
}

/**
 * Light a source at the current Turn.
 *
 * @param name - What to call it on the list, usually the item's name.
 * @param kind - A key of LIGHT_KINDS, or anything else to burn like a torch.
 * @param turn - The Turn it is lit on.
 * @param id - A unique id, supplied by the caller.
 * @param turns - How long it burns; defaults to the book's duration for the kind.
 * @returns The lit source.
 */
export function lightSource(name: string, kind: string, turn: number, id: string, turns?: number | null): Light {
  const fromKind = LIGHT_KINDS[kind] ?? LIGHT_KINDS.torch;
  return {
    id,
    name: name.trim() || kind,
    kind,
    litOnTurn: turn,
    turns: turns === undefined ? (fromKind?.turns ?? null) : turns,
    radius: fromKind?.radius ?? 30,
  };
}

/**
 * Add or take away Turns of fuel from something already burning.
 *
 * A half-full flask is poured in, a torch is found to be shorter than it
 * looked. Eternal sources ignore it; there is nothing to top up.
 *
 * @param light - The lit source.
 * @param turns - Turns to add, or negative to take away.
 * @returns The source with its burn adjusted. Never below nothing.
 */
export function adjustLight(light: Light, turns: number): Light {
  if (light.turns === null) return light;
  return { ...light, turns: Math.max(0, light.turns + Math.trunc(turns)) };
}

/**
 * Whether a random encounter check falls due this Turn.
 *
 * Turn zero is the party standing in the doorway, so nothing is due there.
 *
 * @param delve - The delve as it stands.
 * @returns Whether the Referee owes a check.
 */
export function encounterDue(delve: Delve): boolean {
  const every = Math.max(1, Math.trunc(delve.encounter.everyTurns));
  return delve.turn > 0 && delve.turn % every === 0;
}

/**
 * How many watches the surface should be moved on this delve's account.
 *
 * Only the Turns since the calendar was last moved count, so a Referee who
 * syncs halfway through a long delve is not billed for them twice. A watch is
 * a share of the day, so how many Turns it holds depends on how the day is cut.
 *
 * @param delve - The delve as it stands.
 * @param watchesPerDay - Watches in the day.
 * @returns A whole number of watches, rounded to the nearest.
 */
export function suggestedWatches(delve: Delve, watchesPerDay: number): number {
  return watchesForTurns(delve.turn - delve.turnAtLastSync, watchesPerDay);
}

/**
 * Put the Turn count somewhere else, for the click that should not have happened.
 *
 * Rest debt moves with it -- taking back two Turns takes back two Turns of
 * exploring -- but never below nothing. Nothing is rolled: undoing is not
 * living through it again.
 *
 * @param delve - The delve as it stands.
 * @param turn - The Turn it should be.
 * @returns The delve on that Turn.
 */
export function setTurn(delve: Delve, turn: number): Delve {
  const target = Math.max(0, Math.trunc(Number(turn) || 0));
  const moved = target - delve.turn;
  return {
    ...delve,
    turn: target,
    turnsSinceRest: Math.max(0, delve.turnsSinceRest + moved),
    turnAtLastSync: Math.min(delve.turnAtLastSync, target),
  };
}

/**
 * XP for one defeated enemy, by Hit Dice. Advancement.md.
 *
 * "Monsters with special abilities count as one Hit Die more, and classed
 * characters count as one Hit Die more than their level."
 *
 * @param hitDice - The enemy's Hit Dice; anything below 1 is the book's "<1".
 * @param special - Whether it has special abilities, worth a Hit Die.
 * @returns The XP award for a single enemy.
 */
export function xpForHitDice(hitDice: number, special = false): number {
  const effective = Math.max(0, Math.floor(Number(hitDice) || 0)) + (special ? 1 : 0);
  return XP_BY_HIT_DICE[effective] ?? MAX_HIT_DICE_XP;
}

/**
 * XP earned by defeating things on this delve.
 *
 * @param delve - The delve as it stands.
 * @returns Total XP from the kill list.
 */
export function killXP(delve: Delve): number {
  return delve.kills.reduce(
    (total, kill) => total + xpForHitDice(kill.hitDice, kill.special) * Math.max(0, Math.trunc(kill.count)),
    0,
  );
}

/**
 * XP the recovered treasure is worth -- once it is out.
 *
 * Advancement.md: "Treasure is calculated for XP only after it has been
 * returned to a secure location. One silver piece worth of treasure is worth 1
 * Experience Point." Nothing here knows whether the party got out alive, which
 * is why the widget labels this as pending rather than earned.
 *
 * @param delve - The delve as it stands.
 * @returns Total XP the loot would be worth, at 1 per silver.
 */
export function lootXP(delve: Delve): number {
  return Math.floor(delve.loot.reduce((total, entry) => total + Math.max(0, entry.bp), 0) / BP_PER_XP);
}
