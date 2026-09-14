/**
 * @file The day, cut into watches.
 *
 * A watch is a share of the day, not a number of hours. Six is the usual cut,
 * and Hot Springs Island is where the idea comes from, but a party that knows
 * the country keeps shorter watches and covers the same ground in more of
 * them -- so the count per day is a setting, and nothing here assumes it
 * divides twenty-four evenly.
 *
 * What a watch is *called* comes from a handful of fixed ways of naming the
 * day, coarse to fine. For any count of watches the finest naming that is at
 * least as fine as the watches is used, and each watch takes the name of the
 * period its middle falls in. That way a two-watch day is day and night, a
 * twelve-watch day has a witching hour, and a seven-watch day needs no table
 * of its own.
 *
 * Foundry-free, so the arithmetic can be checked on its own.
 */

/** Watches in a day unless the Referee says otherwise. */
export const DEFAULT_WATCHES_PER_DAY = 6;

/** The most watches a day may be cut into; past this they stop meaning much. */
export const MAX_WATCHES_PER_DAY = 24;

/** The hour the first watch of the day begins. */
export const DAY_BEGINS_AT = 6;

/** Turns in a day: a Turn is ten minutes. */
export const TURNS_PER_DAY = 144;

/** Where the party is in the calendar. */
export type Calendar = { day: number; watch: number };

/** How light it is: what colours a watch, not what names it. */
export type Phase = "day" | "twilight" | "night";

/**
 * Ways of naming the day, coarse to fine.
 *
 * Every naming starts at DAY_BEGINS_AT and cuts the day into equal periods, so
 * a naming is just its list of names. Keys are localised under
 * VF.chronicle.time.*.
 */
export const DAY_NAMINGS: readonly (readonly string[])[] = [
  ["day"],
  ["day", "night"],
  ["morning", "afternoon", "evening", "night"],
  ["morning", "midday", "afternoon", "evening", "night", "deadOfNight"],
  [
    "dawn",
    "morning",
    "lateMorning",
    "noon",
    "afternoon",
    "goldenHour",
    "dusk",
    "evening",
    "night",
    "midnight",
    "witchingHour",
    "firstLight",
  ],
] as const;

/**
 * Make a watch count sensible.
 *
 * @param watchesPerDay - Whatever was stored or typed.
 * @returns A whole number between one and MAX_WATCHES_PER_DAY.
 */
export function clampWatches(watchesPerDay: number): number {
  const whole = Math.trunc(Number(watchesPerDay));
  if (!Number.isFinite(whole) || whole < 1) return DEFAULT_WATCHES_PER_DAY;
  return Math.min(whole, MAX_WATCHES_PER_DAY);
}

/**
 * The naming to use for a day of this many watches.
 *
 * The coarsest one that still gives every watch a name of its own; past the
 * finest there is, watches start sharing names and that is fine.
 *
 * @param watchesPerDay - Watches in the day.
 * @returns The list of period names.
 */
export function namingFor(watchesPerDay: number): readonly string[] {
  const count = clampWatches(watchesPerDay);
  const fits = DAY_NAMINGS.find((naming) => naming.length >= count);
  return fits ?? (DAY_NAMINGS[DAY_NAMINGS.length - 1] as readonly string[]);
}

/**
 * The hour of the day at the middle of a watch.
 *
 * @param watch - The watch index, from zero.
 * @param watchesPerDay - Watches in the day.
 * @returns An hour from 0 up to 24, possibly fractional.
 */
export function middleHour(watch: number, watchesPerDay: number): number {
  const count = clampWatches(watchesPerDay);
  return (DAY_BEGINS_AT + ((watch + 0.5) * 24) / count) % 24;
}

/**
 * What a watch is called.
 *
 * Integer arithmetic on purpose: the middle of watch `w` of `n` sits in period
 * floor((2w + 1) * periods / 2n), and no floating point is needed to find it.
 *
 * @param watch - The watch index, from zero.
 * @param watchesPerDay - Watches in the day.
 * @returns The period name's key.
 */
export function watchName(watch: number, watchesPerDay: number): string {
  const count = clampWatches(watchesPerDay);
  const naming = namingFor(count);
  const index = Math.floor(((2 * wrap(watch, count) + 1) * naming.length) / (2 * count));
  return naming[index] ?? naming[0] ?? "day";
}

/**
 * How light it is in the middle of a watch.
 *
 * @param watch - The watch index, from zero.
 * @param watchesPerDay - Watches in the day.
 * @returns Day, twilight or night.
 */
export function phaseOf(watch: number, watchesPerDay: number): Phase {
  const hour = middleHour(wrap(watch, watchesPerDay), watchesPerDay);
  if (hour >= 8 && hour < 17) return "day";
  if ((hour >= 5 && hour < 8) || (hour >= 17 && hour < 21)) return "twilight";
  return "night";
}

/**
 * When a watch starts and ends, as clock readings, for a tooltip.
 *
 * @param watch - The watch index, from zero.
 * @param watchesPerDay - Watches in the day.
 * @returns The range, as "HH:MM–HH:MM".
 */
export function clockRange(watch: number, watchesPerDay: number): string {
  const count = clampWatches(watchesPerDay);
  const minutes = (24 * 60) / count;
  const start = DAY_BEGINS_AT * 60 + wrap(watch, count) * minutes;
  return `${clock(start)}–${clock(start + minutes)}`;
}

/**
 * Minutes since midnight, as a 24-hour reading.
 *
 * @param minutes - Minutes, possibly past a day.
 * @returns "HH:MM".
 */
function clock(minutes: number): string {
  const total = Math.round(minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A watch index brought back into the day.
 *
 * @param watch - Any integer.
 * @param watchesPerDay - Watches in the day.
 * @returns An index from zero to watchesPerDay - 1.
 */
export function wrap(watch: number, watchesPerDay: number): number {
  const count = clampWatches(watchesPerDay);
  return ((Math.trunc(watch) % count) + count) % count;
}

/**
 * Watches since the first dawn.
 *
 * @param calendar - Where the party is.
 * @param watchesPerDay - Watches in the day.
 * @returns Whole watches elapsed.
 */
export function watchesElapsed(calendar: Calendar, watchesPerDay: number): number {
  return (calendar.day - 1) * clampWatches(watchesPerDay) + calendar.watch;
}

/**
 * Move the calendar by whole watches, rolling the day over as it goes.
 *
 * @param calendar - Where the party is now.
 * @param watches - How many watches to move, possibly negative.
 * @param watchesPerDay - Watches in the day.
 * @returns Where the party is afterwards. Never earlier than the first dawn.
 */
export function advanceWatches(calendar: Calendar, watches: number, watchesPerDay: number): Calendar {
  const count = clampWatches(watchesPerDay);
  const total = Math.max(0, watchesElapsed(calendar, count) + Math.trunc(watches));
  return { day: Math.floor(total / count) + 1, watch: total % count };
}

/**
 * Move the calendar by whole days, keeping the watch.
 *
 * @param calendar - Where the party is now.
 * @param days - How many days to move, possibly negative.
 * @param watchesPerDay - Watches in the day.
 * @returns Where the party is afterwards.
 */
export function advanceDays(calendar: Calendar, days: number, watchesPerDay: number): Calendar {
  return advanceWatches(calendar, Math.trunc(days) * clampWatches(watchesPerDay), watchesPerDay);
}

/**
 * Put the calendar on a given day and watch, without walking there.
 *
 * @param day - The day, from one.
 * @param watch - The watch, from zero.
 * @param watchesPerDay - Watches in the day.
 * @returns A calendar that is valid for that many watches.
 */
export function setCalendar(day: number, watch: number, watchesPerDay: number): Calendar {
  const whole = Math.trunc(Number(day));
  return { day: Number.isFinite(whole) && whole >= 1 ? whole : 1, watch: wrap(watch, watchesPerDay) };
}

/**
 * Keep the time of day when the day is cut into a different number of watches.
 *
 * The watch that contains the start of the old one is chosen, so a party
 * setting out at dawn is still setting out at dawn.
 *
 * @param calendar - Where the party is.
 * @param from - Watches per day before.
 * @param to - Watches per day after.
 * @returns The same moment, in the new watches.
 */
export function rescaleCalendar(calendar: Calendar, from: number, to: number): Calendar {
  const before = clampWatches(from);
  const after = clampWatches(to);
  return { day: calendar.day, watch: Math.floor((wrap(calendar.watch, before) * after) / before) };
}

/**
 * How many watches a stretch underground took, to the nearest.
 *
 * @param turns - Turns spent.
 * @param watchesPerDay - Watches in the day.
 * @returns Whole watches.
 */
export function watchesForTurns(turns: number, watchesPerDay: number): number {
  return Math.round((Math.max(0, turns) * clampWatches(watchesPerDay)) / TURNS_PER_DAY);
}
