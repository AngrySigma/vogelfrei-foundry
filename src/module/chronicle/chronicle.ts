/**
 * @file The Chronicle: the party's clock, and the delves that hang off it.
 *
 * Two counters, deliberately independent.
 *
 * The **watch** track is the calendar. A watch is four hours, six to a day.
 * The watch is not a Vogelfrei rule -- the book counts Turns, Rounds and whole
 * days (docs/Adventuring/Time and Movement.md) -- it is borrowed from Hot
 * Springs Island as a bookkeeping unit for time and distance, and it exists
 * here only so that "a morning's walk" has somewhere to be written down.
 *
 * The **turn** track belongs to a delve. A Turn is ten minutes, and it is the
 * clock of the dungeon: it burns the torches and brings the wandering monsters
 * (docs/Adventuring/Dungeon Exploration.md). It never advances the calendar on
 * its own. Coming back up, the Referee moves the calendar by however many
 * watches they judge the delve to have cost, with `suggestedWatches` offering
 * an opinion and no more than that.
 *
 * Foundry-free, so the arithmetic can be checked on its own.
 */

/** Watches to the day: four hours each. */
export const WATCHES_PER_DAY = 6;

/** Hours to the watch. */
export const HOURS_PER_WATCH = 4;

/** Turns to the hour. A Turn is ten minutes. */
export const TURNS_PER_HOUR = 6;

/** Turns to the watch, for translating a delve back into calendar time. */
export const TURNS_PER_WATCH = HOURS_PER_WATCH * TURNS_PER_HOUR;

/** The hour at which the first watch of the day begins. */
export const DAY_BEGINS_AT = 6;

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

/** One watch's description. */
export type WatchDescription = { key: string; daylight: boolean };

/** The first watch, and the fallback for any index arithmetic gone wrong. */
const FIRST_WATCH: WatchDescription = { key: "dawn", daylight: true };

/** The six watches, dawn first. */
export const WATCHES: readonly WatchDescription[] = [
  FIRST_WATCH,
  { key: "midday", daylight: true },
  { key: "afternoon", daylight: true },
  { key: "dusk", daylight: false },
  { key: "night", daylight: false },
  { key: "deepNight", daylight: false },
] as const;

/**
 * What a light source is and how long it lasts, in Turns.
 *
 * Dungeon Exploration.md: candle 12 Turns, torch 6, lantern 24 per flask.
 */
/** How long a torch burns, and the stand-in for anything unpriced. */
export const TORCH_TURNS = 6;

export const LIGHT_DURATIONS: Readonly<Record<string, number>> = {
  torch: TORCH_TURNS,
  candle: 12,
  lantern: 24,
};

/**
 * XP for defeating an enemy, by Hit Dice. Advancement.md.
 *
 * The index is the effective Hit Dice; index 0 stands for the book's "<1".
 * Anything at 11 or above is worth the same 1,500.
 */
export const XP_BY_HIT_DICE: readonly number[] = [5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 1250] as const;

/** What anything of eleven Hit Dice or more is worth. */
export const MAX_HIT_DICE_XP = 1500;

/** Where the party is in the day. */
export type Calendar = { day: number; watch: number };

/** A lit light source, burning against a delve's turn count. */
export type Light = { id: string; name: string; kind: string; litOnTurn: number; turns: number };

/** An enemy defeated, counted for XP by Hit Dice rather than by a raw number. */
export type Kill = { id: string; name: string; hitDice: number; special: boolean; count: number };

/** Treasure recovered, valued in brass. */
export type Loot = { id: string; name: string; bp: number };

/** How often the Referee checks for wandering monsters, and on what. */
export type EncounterRule = { everyTurns: number; chanceIn6: number };

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
export type Chronicle = Calendar & { delves: Delve[] };

/** A fresh world: the first dawn of the first day, nothing delved yet. */
export function defaultChronicle(): Chronicle {
  return { day: 1, watch: 0, delves: [] };
}

/**
 * Which watch an index names, wrapping so that arithmetic never falls off.
 *
 * @param watch - The watch index, from any integer.
 * @returns The watch's key and whether the sun is up.
 */
export function watchOf(watch: number): { index: number } & WatchDescription {
  const index = ((Math.trunc(watch) % WATCHES_PER_DAY) + WATCHES_PER_DAY) % WATCHES_PER_DAY;
  return { index, ...(WATCHES[index] ?? FIRST_WATCH) };
}

/**
 * The hour a watch begins, as a 24-hour clock reading.
 *
 * @param watch - The watch index.
 * @returns The time of day, as "HH:00".
 */
export function clockOf(watch: number): string {
  const hour = (DAY_BEGINS_AT + watchOf(watch).index * HOURS_PER_WATCH) % 24;
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Move the calendar by whole watches, rolling the day over as it goes.
 *
 * Accepts negatives, because a Referee who clicks one watch too many should be
 * able to take it back rather than live in the evening.
 *
 * @param calendar - Where the party is now.
 * @param watches - How many watches to move, possibly negative.
 * @returns Where the party is afterwards. Never earlier than the first dawn.
 */
export function advanceWatches(calendar: Calendar, watches: number): Calendar {
  const total = (calendar.day - 1) * WATCHES_PER_DAY + calendar.watch + Math.trunc(watches);
  const floored = Math.max(0, total);
  return { day: Math.floor(floored / WATCHES_PER_DAY) + 1, watch: floored % WATCHES_PER_DAY };
}

/**
 * Move the calendar by whole days, keeping the time of day.
 *
 * @param calendar - Where the party is now.
 * @param days - How many days to move, possibly negative.
 * @returns Where the party is afterwards.
 */
export function advanceDays(calendar: Calendar, days: number): Calendar {
  return advanceWatches(calendar, Math.trunc(days) * WATCHES_PER_DAY);
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
    name: name.trim() || "Delve",
    turn: 0,
    turnsSinceRest: 0,
    turnAtLastSync: 0,
    startedOn: { day: calendar.day, watch: calendar.watch },
    encounter: { everyTurns: 2, chanceIn6: 1 },
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
 * @returns Turns remaining; zero or less means dark.
 */
export function lightRemaining(light: Light, turn: number): number {
  return light.turns - (turn - light.litOnTurn);
}

/**
 * Light a source at the current Turn.
 *
 * @param name - What to call it on the list, usually the item's name.
 * @param kind - A key of LIGHT_DURATIONS, or anything else for a custom burn.
 * @param turn - The Turn it is lit on.
 * @param id - A unique id, supplied by the caller.
 * @param turns - How long it burns; defaults to the book's duration for the kind.
 * @returns The lit source.
 */
export function lightSource(name: string, kind: string, turn: number, id: string, turns?: number): Light {
  return {
    id,
    name: name.trim() || kind,
    kind,
    litOnTurn: turn,
    turns: turns ?? LIGHT_DURATIONS[kind] ?? TORCH_TURNS,
  };
}

/**
 * Whether a wandering monster check falls due this Turn.
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
 * syncs halfway through a long delve is not billed for them twice.
 *
 * @param delve - The delve as it stands.
 * @returns A whole number of watches, rounded to the nearest.
 */
export function suggestedWatches(delve: Delve): number {
  return Math.round((delve.turn - delve.turnAtLastSync) / TURNS_PER_WATCH);
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
