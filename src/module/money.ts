/**
 * @file Vogelfrei money, counted in brass pieces.
 *
 * Rules: docs/Equipment — 1 gp = 50 sp = 600 bp, therefore 1 sp = 12 bp.
 *
 * The coinage is not decimal, so no single decimal number holds it exactly: a
 * five-brass candle is 0.008333... gp. Everything is therefore stored as a
 * whole number of brass pieces, the smallest coin, and formatted for display.
 * This module is deliberately free of Foundry so the arithmetic can be checked
 * on its own.
 */

/** Brass pieces to the silver piece. */
export const BP_PER_SP = 12;

/** Brass pieces to the gold piece. 1 gp = 50 sp. */
export const BP_PER_GP = 600;

/** The denominations, largest first, as they are written in the book. */
export const DENOMINATIONS: readonly { unit: "gp" | "sp" | "bp"; bp: number }[] = [
  { unit: "gp", bp: BP_PER_GP },
  { unit: "sp", bp: BP_PER_SP },
  { unit: "bp", bp: 1 },
] as const;

/** A price as the book prints it. */
export type Money = {
  /** Whole brass pieces. Null when the goods are simply not sold here. */
  bp: number | null;
  /**
   * Whether the book printed a `+`, as in "5sp+" — the price is a floor and
   * the real cost depends on the quality of the thing bought.
   */
  minimum: boolean;
};

/** Nothing for sale: the book prints a dash. */
export const UNAVAILABLE: Money = { bp: null, minimum: false };

/**
 * Denominations the book actually uses. `cp` is not among them, but appears
 * once — see PRICE_ERRATA.
 */
const UNITS: Readonly<Record<string, number>> = {
  gp: BP_PER_GP,
  sp: BP_PER_SP,
  bp: 1,
};

/**
 * Prices in the rulebook that do not parse, and what they are read as.
 *
 * These are book errata, not parser features. Each one should be fixed in
 * ~/tabletop/vogelfrei and removed from here; the list exists so that a typo
 * in the rules is loud and attributable rather than silently absorbed.
 *
 * - `5cp` (Miscellaneous.md, Pipe, rural): Vogelfrei has no copper piece. Every
 *   neighbouring entry is priced in brass, so it is read as 5bp.
 */
export const PRICE_ERRATA: Readonly<Record<string, string>> = {
  "5cp": "5bp",
};

/** A number, optional space, a unit, and an optional "or more" marker. */
const PRICE = /^(\d+)\s*(gp|sp|bp)\s*(\+?)$/i;

/** The dashes the book uses for "not sold here", including the HTML entity. */
const DASHES = new Set(["-", "–", "—", "&mdash;", "&ndash;", ""]);

/**
 * Read one price as the book writes it: "15sp", "5 bp", "2gp+", or a dash.
 *
 * @param text - The cell contents.
 * @returns The price in brass pieces, or UNAVAILABLE for a dash.
 * @throws If the text is neither a dash nor a price this module recognises.
 */
export function parseMoney(text: string): Money {
  const trimmed = String(text ?? "").trim();
  if (DASHES.has(trimmed)) return UNAVAILABLE;

  const corrected = PRICE_ERRATA[trimmed.toLowerCase()] ?? trimmed;
  const match = PRICE.exec(corrected);
  if (!match) throw new Error(`Unreadable price ${JSON.stringify(text)}`);

  const [, amount, unit, plus] = match;
  return {
    bp: Number(amount) * UNITS[unit.toLowerCase()],
    minimum: plus === "+",
  };
}

/**
 * Read a cell holding both prices, as "1sp / 5bp" or "2gp+ / -". Some tables
 * give City and Rural their own columns; others fold them into one cell.
 *
 * @param text - The cell contents.
 * @returns City price first, rural second.
 */
export function parseMoneyPair(text: string): [Money, Money] {
  const [city = "", rural = ""] = String(text ?? "").split("/");
  return [parseMoney(city), parseMoney(rural)];
}

/**
 * Write a price the way the book does: the largest coins first, and no coin
 * mentioned that the price does not contain.
 *
 * @param money - Brass pieces, or a Money.
 * @returns Something like "2 gp 4 sp 2 bp". A price of nothing is "0 bp", and
 *   goods that are not sold give a dash.
 */
export function formatMoney(money: Money | number | null): string {
  const value = typeof money === "number" ? { bp: money, minimum: false } : (money ?? UNAVAILABLE);
  if (value.bp === null || !Number.isFinite(value.bp)) return "—";

  const negative = value.bp < 0;
  let remaining = Math.abs(Math.round(value.bp));

  const parts: string[] = [];
  for (const { unit, bp } of DENOMINATIONS) {
    const count = Math.floor(remaining / bp);
    if (count > 0) parts.push(`${count} ${unit}`);
    remaining -= count * bp;
  }

  const written = parts.length > 0 ? parts.join(" ") : "0 bp";
  return `${negative ? "-" : ""}${written}${value.minimum ? "+" : ""}`;
}

/**
 * Split a price into its coins, for a sheet that wants three boxes rather than
 * one string.
 *
 * @param bp - Whole brass pieces.
 * @returns How many of each coin the price comes to.
 */
export function splitCoins(bp: number): { gp: number; sp: number; bp: number } {
  let remaining = Math.max(0, Math.round(Number(bp) || 0));

  const gp = Math.floor(remaining / BP_PER_GP);
  remaining -= gp * BP_PER_GP;

  const sp = Math.floor(remaining / BP_PER_SP);
  remaining -= sp * BP_PER_SP;

  return { gp, sp, bp: remaining };
}
