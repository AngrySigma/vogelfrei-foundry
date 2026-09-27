/**
 * @file A real date hung off the day counter.
 *
 * The Chronicle counts days from one, and that stays the number everything
 * else is written against: a delve began on day 3, rations are struck off per
 * day, the watch track cuts day N into its watches. Nothing below replaces
 * that count. It only says what day 47 is *called* -- Tuesday, the 16th of
 * April, 1487 -- by walking the counter forward from the day the campaign
 * opened.
 *
 * The months, their lengths, the leap years and the names of the weekdays all
 * come from Foundry's own `CalendarData` (`game.time.calendar`), which v14
 * ships and which a module or a world script may replace by assigning
 * `CONFIG.time.worldCalendarConfig` during `init`. That is deliberate: a
 * calendar is a setting decision, the rulebook makes none, and there is no
 * reason for this system to grow a second implementation of leap years.
 *
 * Two conventions worth stating, because they are choices and not facts.
 *
 * A Chronicle day begins at daybreak, not at midnight -- `DAY_BEGINS_AT` in
 * day.ts -- so a party's "day 47" runs from six in the morning through to six
 * the next. The *date* of day 47 is therefore the date its daybreak fell on,
 * and it does not tick over in the middle of the night watch. That is how a
 * table reckons it and how the day counter already behaves.
 *
 * `watchSeconds`, by contrast, gives the true instant a watch begins, which
 * for the small-hours watches lies past midnight and so on the following
 * date. That is the number written through to `game.time.worldTime`, where
 * the honest hour matters more than the tidy date.
 *
 * One trap, worth writing down because it cost a day of dates. `CalendarData`
 * carries an `isLeapYear()` and a separate leap flag inside
 * `timeToComponents()`, and on Foundry 14.365 the two do not agree: the
 * decomposition treats the year *before* each leap year as the leap one
 * (`_decomposeTimeYears` counts `leapStart - 1` ordinary years before the
 * first interval instead of `leapStart`). Asking `isLeapYear()` how long
 * February runs and then handing the answer to `componentsToTime()` puts
 * roughly a quarter of all years one day out.
 *
 * So nothing here calls `isLeapYear()`. The leap flag is read back out of
 * `timeToComponents()` -- the one function that decides what every date on
 * screen says -- and `dateSeconds` is built as its inverse by construction.
 * Whatever the calendar believes about leap years, it agrees with itself.
 *
 * Foundry-free, like the rest of the Chronicle's arithmetic: everything here
 * takes a calendar rather than reaching for one.
 */

import { clampWatches, DAY_BEGINS_AT, wrap } from "./day";

/** Hours the day is named on. day.ts reads a 24-hour clock whatever the calendar says. */
const NAMING_HOURS = 24;

/** A month, as `CalendarData` describes one. */
export type CalendarMonth = {
  name: string;
  abbreviation?: string;
  ordinal: number;
  days: number;
  leapDays?: number | null;
};

/** A weekday, as `CalendarData` describes one. */
export type CalendarWeekday = { name: string; abbreviation?: string; ordinal: number };

/** A moment pulled apart. `month` and `dayOfWeek` are indices; `dayOfMonth` and `day` count from zero. */
export type TimeComponents = {
  year: number;
  day: number;
  month: number;
  dayOfMonth: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  second: number;
  leapYear: boolean;
};

/**
 * As much of Foundry's `CalendarData` as the Chronicle needs.
 *
 * Structural on purpose, so the arithmetic can be checked against a plain
 * object and so a Referee's replacement calendar is used without ceremony.
 */
export type CalendarLike = {
  months: { values: readonly CalendarMonth[] };
  days: {
    values: readonly CalendarWeekday[];
    daysPerYear: number;
    hoursPerDay: number;
    minutesPerHour: number;
    secondsPerMinute: number;
  };
  componentsToTime(components: Partial<TimeComponents>): number;
  timeToComponents(time: number): TimeComponents;
};

/** The date day one falls on. `month` is a month's ordinal; `day` counts from one. */
export type Epoch = { year: number; month: number; day: number };

/** A date that is somebody's, named and marked when the party lands on it. */
export type Feast = { id: string; name: string; month: number; day: number };

/**
 * When a fresh world opens: the first of March, 1487.
 *
 * The rulebook sets no date, so this is only a place to start -- early spring
 * of an early-Renaissance year, the roads passable again and the campaigning
 * season opening. The Referee moves it in the Almanac.
 */
export const DEFAULT_EPOCH: Epoch = { year: 1487, month: 3, day: 1 };

/**
 * Seconds in one day of this calendar.
 *
 * @param calendar - The calendar in force.
 * @returns Seconds from one midnight to the next.
 */
export function secondsPerDay(calendar: CalendarLike): number {
  const { hoursPerDay, minutesPerHour, secondsPerMinute } = calendar.days;
  return hoursPerDay * minutesPerHour * secondsPerMinute;
}

/**
 * How long a month runs, in the year it is asked about.
 *
 * @param month - The month.
 * @param leapYear - Whether the year is a leap year.
 * @returns Days in the month.
 */
export function monthLength(month: CalendarMonth, leapYear: boolean): number {
  const length = leapYear ? (month.leapDays ?? month.days) : month.days;
  return Math.max(1, Math.trunc(Number(length) || 0));
}

/**
 * Where a month sits in the calendar's own order.
 *
 * Months carry an `ordinal` and are stored in an array, and the two need not
 * agree; a date is typed as an ordinal and read back as an index, so the
 * translation happens here rather than at every call.
 *
 * @param calendar - The calendar in force.
 * @param ordinal - The month's ordinal, as a human types it.
 * @returns An index into `months.values`, clamped into the year.
 */
export function monthIndexOf(calendar: CalendarLike, ordinal: number): number {
  const months = calendar.months.values;
  if (!months.length) return 0;
  const wanted = Math.trunc(Number(ordinal) || 0);
  const found = months.findIndex((month) => month.ordinal === wanted);
  if (found !== -1) return found;
  return Math.min(months.length - 1, Math.max(0, wanted - 1));
}

/**
 * A month's ordinal, from the index a set of components carries.
 *
 * @param calendar - The calendar in force.
 * @param index - An index into `months.values`.
 * @returns The ordinal, or the index plus one if the calendar has no such month.
 */
export function monthOrdinalOf(calendar: CalendarLike, index: number): number {
  return calendar.months.values[index]?.ordinal ?? Math.trunc(index) + 1;
}

/**
 * How far into its year a date falls.
 *
 * @param calendar - The calendar in force.
 * @param leapYear - The leap flag, as `timeToComponents` reports it for the year.
 * @param index - The month's index in `months.values`.
 * @param dayOfMonth - The day of the month, from one.
 * @returns The day of the year, from zero.
 */
export function dayOfYear(calendar: CalendarLike, leapYear: boolean, index: number, dayOfMonth: number): number {
  const months = calendar.months.values;
  let day = 0;
  for (let before = 0; before < index; before += 1) {
    const month = months[before];
    if (month) day += monthLength(month, leapYear);
  }
  const chosen = months[index];
  const length = chosen ? monthLength(chosen, leapYear) : 31;
  return day + Math.min(length, Math.max(1, Math.trunc(Number(dayOfMonth) || 1))) - 1;
}

/** How many times the solve below will nudge itself before settling for a walk. */
const SEARCH_STEPS = 8;

/** How far the walk will clamp, which only ever needs a day or two. */
const CLAMP_STEPS = 4;

/**
 * Where a reading sits against a date, for ordering.
 *
 * @param a - Year, month index, day of the month.
 * @param b - The same.
 * @returns Negative if a is earlier, positive if later, zero if the same day.
 */
function compareDates(a: readonly number[], b: readonly number[]): number {
  for (let part = 0; part < a.length; part += 1) {
    const difference = (a[part] ?? 0) - (b[part] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Midnight opening a written date.
 *
 * Built as the inverse of `timeToComponents` rather than out of
 * `componentsToTime` alone: guess, read the guess back, and step by however
 * many days the reading is out. The leap flag comes from the reading, so the
 * month lengths used here are the same ones the calendar will use when it
 * takes the answer apart again -- which is the whole point, given that
 * `isLeapYear` will say otherwise.
 *
 * The solve lands exactly on any date the calendar can hold. The walk after
 * it settles the ones it cannot: the twenty-ninth of a February in a year
 * Foundry has quietly sized at 365 days, and the last day of such a year.
 * What comes back is the latest day that is not after the date asked for, so
 * a feast written on the twenty-ninth is kept on the twenty-eighth in the
 * years that have no twenty-ninth, and never spills into March.
 *
 * @param calendar - The calendar in force.
 * @param date - Year, month ordinal and day of the month.
 * @returns Seconds from the calendar's own zero.
 */
export function dateSeconds(calendar: CalendarLike, date: Epoch): number {
  const perDay = secondsPerDay(calendar);
  const year = Math.trunc(Number(date.year) || 0);
  const index = monthIndexOf(calendar, date.month);
  const target = [year, index, Math.max(1, Math.trunc(Number(date.day) || 1))];
  const reading = (time: number) => {
    const at = calendar.timeToComponents(time);
    return [at.year, at.month, at.dayOfMonth + 1];
  };

  let time = calendar.componentsToTime({ year, day: 0 });
  for (let step = 0; step < SEARCH_STEPS; step += 1) {
    const at = calendar.timeToComponents(time);
    const wanted = dayOfYear(calendar, at.leapYear, index, date.day);
    const yearLength = at.leapYear ? calendar.days.daysPerYear + 1 : calendar.days.daysPerYear;
    const drift = (year - at.year) * yearLength + (wanted - at.day);
    if (drift === 0) return time;
    time += drift * perDay;
  }

  for (let back = 0; back < CLAMP_STEPS && compareDates(reading(time), target) > 0; back += 1) time -= perDay;
  for (let on = 0; on < CLAMP_STEPS && compareDates(reading(time + perDay), target) <= 0; on += 1) time += perDay;
  return time;
}

/**
 * Midnight opening the day the campaign began.
 *
 * @param calendar - The calendar in force.
 * @param epoch - The date day one falls on.
 * @returns Seconds from the calendar's own zero.
 */
export function epochSeconds(calendar: CalendarLike, epoch: Epoch): number {
  return dateSeconds(calendar, epoch);
}

/**
 * Daybreak on a given day of the count.
 *
 * @param calendar - The calendar in force.
 * @param epoch - The date day one falls on.
 * @param day - The day of the count, from one.
 * @returns Seconds from the calendar's own zero.
 */
export function daybreakSeconds(calendar: CalendarLike, epoch: Epoch, day: number): number {
  const perDay = secondsPerDay(calendar);
  const elapsed = Math.max(0, Math.trunc(Number(day) || 1) - 1);
  return epochSeconds(calendar, epoch) + elapsed * perDay + Math.round((perDay * DAY_BEGINS_AT) / NAMING_HOURS);
}

/**
 * The instant a watch begins.
 *
 * Past midnight for the small-hours watches, and deliberately not wrapped:
 * this is the number the world clock wants, and two in the morning genuinely
 * belongs to the next date even though the party still calls it tonight.
 *
 * @param calendar - The calendar in force.
 * @param epoch - The date day one falls on.
 * @param day - The day of the count, from one.
 * @param watch - The watch index, from zero.
 * @param watchesPerDay - Watches in the day.
 * @returns Seconds from the calendar's own zero.
 */
export function watchSeconds(
  calendar: CalendarLike,
  epoch: Epoch,
  day: number,
  watch: number,
  watchesPerDay: number,
): number {
  const perDay = secondsPerDay(calendar);
  const count = clampWatches(watchesPerDay);
  return daybreakSeconds(calendar, epoch, day) + Math.round((wrap(watch, count) * perDay) / count);
}

/**
 * What a day of the count is called.
 *
 * Taken at daybreak, so the date belongs to the whole Chronicle day and does
 * not turn over halfway through the night watch.
 *
 * @param calendar - The calendar in force.
 * @param epoch - The date day one falls on.
 * @param day - The day of the count, from one.
 * @returns The date pulled apart.
 */
export function civilDate(calendar: CalendarLike, epoch: Epoch, day: number): TimeComponents {
  return calendar.timeToComponents(daybreakSeconds(calendar, epoch, day));
}

/**
 * The feasts kept on a date, in the order they were written down.
 *
 * @param feasts - Every feast the world keeps.
 * @param calendar - The calendar in force.
 * @param components - The date to test.
 * @returns Those that fall on it; usually none.
 */
export function feastsOn(
  feasts: readonly Feast[],
  calendar: CalendarLike,
  components: TimeComponents,
): readonly Feast[] {
  const ordinal = monthOrdinalOf(calendar, components.month);
  const dayOfMonth = components.dayOfMonth + 1;
  return feasts.filter((feast) => Math.trunc(feast.month) === ordinal && Math.trunc(feast.day) === dayOfMonth);
}

/**
 * How many month boundaries a stretch of time crossed.
 *
 * Counted rather than tested, because a single click can skip a month: a
 * fortnight's ride forward from the twentieth lands in the next one, and a
 * Referee who types a day far ahead may cross several.
 *
 * @param calendar - The calendar in force.
 * @param before - The date beforehand.
 * @param after - The date afterwards.
 * @returns Boundaries crossed; zero or fewer if time did not move forward.
 */
export function monthsCrossed(calendar: CalendarLike, before: TimeComponents, after: TimeComponents): number {
  const perYear = calendar.months.values.length || 1;
  return after.year * perYear + after.month - (before.year * perYear + before.month);
}

/**
 * The longest a month ever runs, leap year or not.
 *
 * Used when clamping a date the Referee typed, so that a feast on the
 * twenty-ninth of February can be written down in a year that has no such
 * day. It simply lands on the twenty-eighth when that year comes around.
 *
 * @param month - The month.
 * @returns Its greatest length in days.
 */
export function longestMonth(month: CalendarMonth): number {
  return Math.max(monthLength(month, false), monthLength(month, true));
}

/**
 * Put a written date back inside the calendar, so a typed month or day sticks.
 *
 * @param calendar - The calendar in force.
 * @param epoch - Whatever was typed or stored.
 * @returns A date the calendar recognises.
 */
export function clampEpoch(calendar: CalendarLike, epoch: Partial<Epoch> | null | undefined): Epoch {
  const source = epoch ?? DEFAULT_EPOCH;
  const index = monthIndexOf(calendar, Number(source.month ?? DEFAULT_EPOCH.month));
  const month = calendar.months.values[index];
  const year = Math.trunc(Number(source.year));
  const day = Math.trunc(Number(source.day));
  const length = month ? longestMonth(month) : 31;
  return {
    year: Number.isFinite(year) ? year : DEFAULT_EPOCH.year,
    month: monthOrdinalOf(calendar, index),
    day: Number.isFinite(day) ? Math.min(length, Math.max(1, day)) : DEFAULT_EPOCH.day,
  };
}
