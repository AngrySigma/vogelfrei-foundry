/**
 * @file What a character has to spend, and what is left after spending it.
 *
 * Coins are Items whose quantity is a number of that coin: forty Gold Pieces
 * are one Item with a quantity of forty. A purse is therefore spread across up
 * to three Items, and its worth is their sum in brass.
 *
 * OSE assumed a single "GP" Item and a decimal price, so it could subtract a
 * cost from a quantity directly. Vogelfrei's coinage is not decimal, so paying
 * means totalling the purse in brass, taking the price out, and counting the
 * change back into coins.
 *
 * Foundry-free, so the arithmetic can be checked on its own.
 */
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

/**
 * What a character is carrying, in brass.
 *
 * @param items - Everything the character holds.
 * @returns The purse total in brass pieces.
 */
export function purseValue(items: CoinItem[] = []): number {
  return items.reduce((total, item) => {
    const coin = denominationOf(item);
    if (!coin) return total;
    return total + Math.max(0, Math.floor(item.system?.quantity?.value ?? 0)) * COIN_VALUE[coin];
  }, 0);
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
  /** What each coin Item's quantity should become. Empty when nothing was paid. */
  updates: { id: string; quantity: number }[];
};

/**
 * Pay a price out of a purse, and count the change back into coins.
 *
 * The change is made in the largest coins it will go into, so a character does
 * not walk out of a shop carrying nine hundred brass. Coins the character does
 * not have an Item for cannot be given as change -- their worth stays in the
 * smallest coin the character does carry.
 *
 * @param items - Everything the character holds.
 * @param price - What is being paid, in brass.
 * @returns Whether it could be paid, and what the coin Items should become.
 */
export function pay(items: CoinItem[] = [], price = 0): Payment {
  const owed = Math.max(0, Math.round(Number(price) || 0));
  const before = purseValue(items);

  if (owed > before) {
    return { paid: false, before, after: before, shortfall: owed - before, updates: [] };
  }

  const after = before - owed;

  // One Item per denomination takes the change. Where a character somehow has
  // two Gold Pieces stacks, the first holds the coins and the rest go to zero.
  const purses = new Map<Denomination, string[]>();
  for (const item of items) {
    const coin = denominationOf(item);
    if (!coin || !item.id) continue;
    purses.set(coin, [...(purses.get(coin) ?? []), item.id]);
  }

  const change = splitCoins(after);
  // Worth that has no coin Item to sit in falls to the next coin down.
  let carried = 0;
  const held: Record<Denomination, number> = { gp: 0, sp: 0, bp: 0 };

  for (const coin of ["gp", "sp", "bp"] as Denomination[]) {
    const amount = change[coin] * COIN_VALUE[coin] + carried;
    if (purses.has(coin)) {
      held[coin] = Math.floor(amount / COIN_VALUE[coin]);
      carried = amount - held[coin] * COIN_VALUE[coin];
    } else {
      carried = amount;
    }
  }

  const updates: { id: string; quantity: number }[] = [];
  for (const [coin, ids] of purses) {
    for (const [index, id] of ids.entries()) {
      updates.push({ id, quantity: index === 0 ? held[coin] : 0 });
    }
  }

  return { paid: true, before, after, shortfall: 0, updates };
}
