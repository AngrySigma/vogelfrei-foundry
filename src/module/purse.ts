/**
 * @file What a character has to spend, and what is left after spending it.
 *
 * Coins are three numbers on the character -- gold, silver and brass -- not
 * Items. A handful of coin is not a thing you pick up and describe; it is a
 * count, and Time and Movement.md weighs it as one: 100 coins are one item.
 *
 * Vogelfrei's coinage is not decimal, so paying means totalling the purse in
 * brass, taking the price out, and counting the change back into coins.
 *
 * Coin Items -- how OSE, and this system before 0.5, kept money -- are still
 * recognised, so an old character's gold can be folded into the purse.
 *
 * Foundry-free, so the arithmetic can be checked on its own.
 */
import { COINS_PER_ITEM } from "./actor/encumbrance-points";
import { BP_PER_GP, BP_PER_SP, splitCoins } from "./money";

/** A coin, as the book names it. */
export type Denomination = "gp" | "sp" | "bp";

/** Brass to each coin. */
export const COIN_VALUE: Readonly<Record<Denomination, number>> = {
  gp: BP_PER_GP,
  sp: BP_PER_SP,
  bp: 1,
};

/**
 * The names a coin Item may go by. Matched case-insensitively against the Item
 * name, so "Gold Pieces", "gp" and "GP" all find the same purse.
 */
const COIN_NAMES: Readonly<Record<Denomination, readonly string[]>> = {
  gp: ["gp", "gold piece", "gold pieces", "gold"],
  sp: ["sp", "silver piece", "silver pieces", "silver"],
  bp: ["bp", "brass piece", "brass pieces", "brass"],
};

/** The shape this module needs from a Foundry Item. */
export type CoinItem = {
  id?: string;
  name?: string;
  type?: string;
  system?: { treasure?: boolean; quantity?: { value?: number } };
};

/**
 * Which coin an Item is, if it is one.
 *
 * @param item - The Item to identify.
 * @returns The denomination, or null when the Item is not money.
 */
export function denominationOf(item: CoinItem): Denomination | null {
  if (!item?.system?.treasure) return null;

  const name = String(item.name ?? "")
    .trim()
    .toLowerCase();
  if (!name) return null;

  for (const [coin, aliases] of Object.entries(COIN_NAMES) as [Denomination, readonly string[]][]) {
    if (aliases.includes(name)) return coin;
  }
  return null;
}

/** A purse: how many of each coin. */
export type Coins = Record<Denomination, number>;

export const EMPTY_PURSE: Readonly<Coins> = { gp: 0, sp: 0, bp: 0 };

const whole = (value: unknown): number => Math.max(0, Math.floor(Number(value) || 0));

/**
 * A purse read defensively: missing, negative or fractional counts become
 * whole non-negative numbers.
 *
 * @param coins - The purse as stored.
 * @returns A purse with every denomination present.
 */
export function normalisePurse(coins: Partial<Coins> | null | undefined): Coins {
  return { gp: whole(coins?.gp), sp: whole(coins?.sp), bp: whole(coins?.bp) };
}

/**
 * What a purse is worth, in brass.
 *
 * @param coins - The purse.
 * @returns The purse total in brass pieces.
 */
export function purseValue(coins: Partial<Coins> | null | undefined): number {
  const purse = normalisePurse(coins);
  return purse.gp * COIN_VALUE.gp + purse.sp * COIN_VALUE.sp + purse.bp;
}

/**
 * How many coins, of whatever kind. A gold piece weighs what a brass one does.
 *
 * @param coins - The purse.
 * @returns The number of coins.
 */
export function coinCount(coins: Partial<Coins> | null | undefined): number {
  const purse = normalisePurse(coins);
  return purse.gp + purse.sp + purse.bp;
}

/**
 * How many regular items a purse counts as: one for every full hundred coins.
 * A part-hundred counts for nothing -- ten coins are not a load.
 *
 * @param coins - The purse.
 * @returns Regular items for encumbrance.
 */
export function coinItems(coins: Partial<Coins> | null | undefined): number {
  return Math.floor(coinCount(coins) / COINS_PER_ITEM);
}

/**
 * Coin Items folded into a purse: what they add up to, and which Items they
 * were, so the caller can delete them once their worth is in the purse.
 *
 * @param items - Everything the character holds.
 * @param purse - The purse to add to.
 * @returns The purse with every coin Item counted in, and the Items' ids.
 */
export function foldCoinItems(items: CoinItem[] = [], purse: Partial<Coins> = EMPTY_PURSE) {
  const coins = normalisePurse(purse);
  const ids: string[] = [];
  for (const item of items) {
    const coin = denominationOf(item);
    if (!coin) continue;
    coins[coin] += whole(item.system?.quantity?.value);
    if (item.id) ids.push(item.id);
  }
  return { coins, ids };
}

export type Payment = {
  /** Whether the purse covered the price. */
  paid: boolean;
  /** The purse before paying, in brass. */
  before: number;
  /** What is left after paying, in brass. Unchanged when the purse fell short. */
  after: number;
  /** How much was short, in brass. Zero when the purse covered it. */
  shortfall: number;
  /** The purse after paying. Unchanged when the purse fell short. */
  coins: Coins;
};

/**
 * Pay a price out of a purse, and count the change back into coins.
 *
 * The change is made in the largest coins it will go into, so a character does
 * not walk out of a shop carrying nine hundred brass.
 *
 * @param purse - The coins the character carries.
 * @param price - What is being paid, in brass.
 * @returns Whether it could be paid, and what the purse becomes.
 */
export function pay(purse: Partial<Coins> | null | undefined, price = 0): Payment {
  const owed = Math.max(0, Math.round(Number(price) || 0));
  const coins = normalisePurse(purse);
  const before = purseValue(coins);

  if (owed > before) {
    return { paid: false, before, after: before, shortfall: owed - before, coins };
  }

  const after = before - owed;
  return { paid: true, before, after, shortfall: 0, coins: splitCoins(after) };
}
