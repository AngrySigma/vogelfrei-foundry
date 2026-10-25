/**
 * @file Vogelfrei encumbrance, counted in points rather than weighed in coins.
 *
 * Rules: docs/Adventuring/Time and Movement.md#encumbrance
 *
 * A character carries things, and past a certain number of things they slow
 * down. Nothing is weighed: every ordinary item counts as one, small things
 * stack, some things are too big to count as one and take a point on their own,
 * and worn armour costs points by how heavy it is rather than by being carried.
 *
 * This module is deliberately free of Foundry: it takes plain descriptions of
 * items and returns numbers, so the arithmetic can be checked on its own.
 */

/** How an item counts. */
export type ItemEncumbrance =
  /** One item, like everything else. */
  | "normal"
  /** Too small to bother with: a ring, a piece of chalk. Counts for nothing. */
  | "none"
  /** Too big to carry as one of many: a shield, a polearm, a full sack. */
  | "oversized";

export const ITEM_ENCUMBRANCE_TYPES: readonly ItemEncumbrance[] = ["normal", "none", "oversized"] as const;

export const DEFAULT_ITEM_ENCUMBRANCE: ItemEncumbrance = "normal";

/**
 * Items carried per point of encumbrance, before Strength. Time and
 * Movement.md: one point per 5 + Strength modifier items -- 2 for Strength 3,
 * 8 for Strength 18. The first batch is free: with no modifier the sixth item
 * earns the first point, the eleventh the second, and so on.
 */
export const ITEMS_PER_POINT = 5;

/**
 * How many items make one encumbrance point for a given Strength.
 *
 * @param strengthMod - The Strength modifier, -3 to +3.
 * @returns Items per point; never below 1.
 */
export function itemsPerPoint(strengthMod = 0): number {
  return Math.max(1, ITEMS_PER_POINT + Math.trunc(Number(strengthMod) || 0));
}

/** Points at which a character stops moving altogether. */
export const ENCUMBRANCE_LIMIT = 5;

/**
 * Points contributed by worn body armour, by armour type. Light armour is free;
 * anything heavier is felt. A shield is not worn, it is carried, so it takes no
 * points here and is counted as an oversized item instead.
 *
 * This is the fallback. Armor.md gives each harness its own Enc figure -- a
 * proved full harness costs 3 -- and an armour Item carrying one in
 * `encumbrancePoints` uses that instead.
 */
export const ARMOUR_POINTS: Readonly<Record<string, number>> = {
  unarmored: 0,
  light: 0,
  medium: 1,
  heavy: 2,
  shield: 0,
};

/**
 * The encumbrance states, in order. Each names the movement multiplier the
 * character sheet applies; see OseDataModelCharacterMove.
 */
export const ENCUMBRANCE_STATES: readonly { maxPoints: number; label: string }[] = [
  { maxPoints: 1, label: "VF.encumbrance.unencumbered" },
  { maxPoints: 2, label: "VF.encumbrance.light" },
  { maxPoints: 3, label: "VF.encumbrance.heavy" },
  { maxPoints: 4, label: "VF.encumbrance.severe" },
  { maxPoints: Number.POSITIVE_INFINITY, label: "VF.encumbrance.over" },
] as const;

/** The shape this module needs from a Foundry Item. */
export type EncumbranceItem = {
  /** The Foundry Item type: `item`, `weapon`, `armor`, `container`, `spell`, `ability`. */
  type: string;
  /** The Item's id, which contained items name in `containerId`. */
  id?: string | null;
  system: {
    /** The container this item is in, if any. */
    containerId?: string;
    /**
     * For a container that bears its own load, like a handcart: how many of
     * the carrier's points its contents may take off them. 0 for a sack.
     */
    relief?: number;
    encumbrance?: string;
    /** How many of this item make one countable item. 0 or 1 means each counts. */
    stackSize?: number;
    quantity?: { value?: number };
    equipped?: boolean;
    /** Armour category, for Items of type `armor`. */
    type?: string;
    /** Armor.md's Enc column, for Items of type `armor`. Null means "by type". */
    encumbrancePoints?: number | null;
  };
};

/** Coins per regular item. Time and Movement.md: "100 coins count as one regular item." */
export const COINS_PER_ITEM = 100;

/** Item types that are physical enough to be carried at all. */
const CARRIED_TYPES = new Set(["item", "weapon", "armor", "container"]);

/**
 * How many countable items a stack amounts to. Twenty arrows with a stack size
 * of twenty are one item; twenty-one are two.
 *
 * @param quantity - How many are held.
 * @param stackSize - How many make one item. 0 or 1 means no stacking.
 * @returns The number of items this stack counts as, never below zero.
 */
export function countedItems(quantity = 1, stackSize = 0): number {
  const held = Math.max(0, Math.floor(Number(quantity) || 0));
  if (held === 0) return 0;

  const stack = Math.floor(Number(stackSize) || 0);
  if (stack <= 1) return held;

  return Math.ceil(held / stack);
}

/**
 * Points earned by carrying a number of ordinary items. The first batch is
 * free, and every batch after that costs a point. Oversized items are not
 * counted here: they are +1 each whatever the Strength.
 *
 * @param itemCount - Countable items carried.
 * @param strengthMod - The Strength modifier, which sets the batch size.
 * @returns Encumbrance points, never below zero.
 */
export function pointsFromItemCount(itemCount: number, strengthMod = 0): number {
  const batch = itemsPerPoint(strengthMod);
  if (!Number.isFinite(itemCount) || itemCount < batch + 1) return 0;
  return Math.floor((itemCount - 1) / batch);
}

/**
 * Whether this item is worn rather than carried. Worn body armour does not
 * count among the things you are carrying -- it costs points by its type
 * instead. A shield is held in the hand, so it is carried like anything else.
 *
 * @param item - The item to judge.
 * @returns True when the item is worn armour.
 */
function isWornArmour(item: EncumbranceItem): boolean {
  return item.type === "armor" && item.system.type !== "shield" && Boolean(item.system.equipped);
}

export type EncumbranceBreakdown = {
  /** Total encumbrance points. */
  points: number;
  /** Points a handcart or the like takes off, already left out of `points`. */
  reliefPoints: number;
  /** Ordinary items carried, after stacking, the purse included. */
  itemCount: number;
  /** Of those, how many the purse accounts for. */
  coinItems: number;
  /** Points from the ordinary item count. */
  itemPoints: number;
  /** Points from oversized items, one each. */
  oversizedPoints: number;
  /** Points from worn armour. */
  armourPoints: number;
};

/**
 * The items held, at any depth, in a container that bears its own load,
 * and how much relief those containers give between them.
 *
 * @param items - Everything the character holds.
 * @returns The contained items and the total relief.
 */
function borneLoad(items: EncumbranceItem[]): { contained: Set<EncumbranceItem>; relief: number } {
  const byId = new Map(items.filter((item) => item.id).map((item) => [item.id as string, item]));
  const bearers = new Set(
    items.filter((item) => item.type === "container" && (item.system.relief ?? 0) > 0).map((item) => item.id),
  );
  const contained = new Set<EncumbranceItem>();
  for (const item of items) {
    // Walk up through sacks in the cart; a loop of containers stops at once.
    const seen = new Set<string>();
    let parent = item.system.containerId;
    while (parent && !seen.has(parent)) {
      if (bearers.has(parent)) {
        contained.add(item);
        break;
      }
      seen.add(parent);
      parent = byId.get(parent)?.system.containerId;
    }
  }
  const relief = items
    .filter((item) => bearers.has(item.id))
    .reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.system.relief) || 0)), 0);
  return { contained, relief };
}

/** One pass over the items: the breakdown before any relief. */
function tally(items: EncumbranceItem[], coinItems: number, strengthMod: number) {
  let itemCount = coinItems;
  let oversizedPoints = 0;
  let armourPoints = 0;

  for (const item of items) {
    if (!CARRIED_TYPES.has(item.type)) continue;

    if (isWornArmour(item)) {
      armourPoints += item.system.encumbrancePoints ?? ARMOUR_POINTS[item.system.type ?? ""] ?? 0;
      continue;
    }

    // A shield the book gives an Enc figure -- a target is +1, a target of
    // proof +2 -- costs exactly that, worn or slung, instead of counting as
    // an item.
    if (item.type === "armor" && item.system.type === "shield" && item.system.encumbrancePoints) {
      oversizedPoints += item.system.encumbrancePoints;
      continue;
    }

    // Weapons and armour are created with a quantity of 0 -- they are one of
    // themselves, not a pile -- so a missing or zero quantity means "one of
    // it". A positive quantity is a real count and stacks as usual.
    const held = item.system.quantity?.value ?? 0;
    const counted = held > 0 ? countedItems(held, item.system.stackSize) : 1;
    const kind = item.system.encumbrance ?? DEFAULT_ITEM_ENCUMBRANCE;

    if (kind === "none") continue;
    if (kind === "oversized") oversizedPoints += counted;
    else itemCount += counted;
  }

  const itemPoints = pointsFromItemCount(itemCount, strengthMod);
  return { points: itemPoints + oversizedPoints + armourPoints, itemCount, itemPoints, oversizedPoints, armourPoints };
}

/**
 * The whole calculation, item by item.
 *
 * A container that bears its own load -- a handcart -- takes up to its
 * relief off the total, counted the carrier's own way, so a weak character
 * fits less in it than a strong one and an oversized item in it is a point
 * like any other. It never takes off more than its contents add: what the
 * carrier holds themselves, the cart included, still counts in full.
 *
 * @param items - Everything the character holds, including worn armour.
 * @param coins - How many coins the character carries, of any kind. Every
 *   full hundred is one regular item; a part-hundred counts for nothing.
 * @param strengthMod - The Strength modifier: how many items make a point.
 * @returns The point total and where each part of it came from.
 */
export function encumbranceBreakdown(items: EncumbranceItem[] = [], coins = 0, strengthMod = 0): EncumbranceBreakdown {
  const coinItems = Math.floor(Math.max(0, Math.floor(Number(coins) || 0)) / COINS_PER_ITEM);
  const full = tally(items, coinItems, strengthMod);
  const { contained, relief } = borneLoad(items);
  if (contained.size === 0 || relief === 0) return { ...full, coinItems, reliefPoints: 0 };

  const bare = tally(
    items.filter((item) => !contained.has(item)),
    coinItems,
    strengthMod,
  );
  const points = Math.max(full.points - relief, bare.points);
  return { ...full, coinItems, points, reliefPoints: full.points - points };
}

/**
 * @param points - Total encumbrance points.
 * @returns The localization key naming the state those points put you in.
 */
export function encumbranceStateLabel(points: number): string {
  const state = ENCUMBRANCE_STATES.find(({ maxPoints }) => points <= maxPoints);
  return (state ?? ENCUMBRANCE_STATES[ENCUMBRANCE_STATES.length - 1]).label;
}
