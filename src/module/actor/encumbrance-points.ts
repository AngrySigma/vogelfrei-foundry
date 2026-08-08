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
 * Items carried per point of encumbrance. The first five are free -- the sixth
 * item is what earns the first point, the eleventh the second, and so on.
 */
export const ITEMS_PER_POINT = 5;

/** Points at which a character stops moving altogether. */
export const ENCUMBRANCE_LIMIT = 5;

/**
 * Points contributed by worn body armour, by armour type. Light armour is free;
 * anything heavier is felt. A shield is not worn, it is carried, so it takes no
 * points here and is counted as an oversized item instead.
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
  system: {
    encumbrance?: string;
    /** How many of this item make one countable item. 0 or 1 means each counts. */
    stackSize?: number;
    quantity?: { value?: number };
    equipped?: boolean;
    /** Armour category, for Items of type `armor`. */
    type?: string;
  };
};

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
 * Points earned by carrying a number of ordinary items. The first five are
 * free, and every five after that costs a point.
 *
 * @param itemCount - Countable items carried.
 * @returns Encumbrance points, never below zero.
 */
export function pointsFromItemCount(itemCount: number): number {
  if (!Number.isFinite(itemCount) || itemCount < ITEMS_PER_POINT + 1) return 0;
  return Math.floor((itemCount - 1) / ITEMS_PER_POINT);
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
  /** Ordinary items carried, after stacking. */
  itemCount: number;
  /** Points from the ordinary item count. */
  itemPoints: number;
  /** Points from oversized items, one each. */
  oversizedPoints: number;
  /** Points from worn armour. */
  armourPoints: number;
};

/**
 * The whole calculation, item by item.
 *
 * @param items - Everything the character holds, including worn armour.
 * @returns The point total and where each part of it came from.
 */
export function encumbranceBreakdown(items: EncumbranceItem[] = []): EncumbranceBreakdown {
  let itemCount = 0;
  let oversizedPoints = 0;
  let armourPoints = 0;

  for (const item of items) {
    if (!CARRIED_TYPES.has(item.type)) continue;

    if (isWornArmour(item)) {
      armourPoints += ARMOUR_POINTS[item.system.type ?? ""] ?? 0;
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

  const itemPoints = pointsFromItemCount(itemCount);

  return {
    points: itemPoints + oversizedPoints + armourPoints,
    itemCount,
    itemPoints,
    oversizedPoints,
    armourPoints,
  };
}

/**
 * @param points - Total encumbrance points.
 * @returns The localization key naming the state those points put you in.
 */
export function encumbranceStateLabel(points: number): string {
  const state = ENCUMBRANCE_STATES.find(({ maxPoints }) => points <= maxPoints);
  return (state ?? ENCUMBRANCE_STATES[ENCUMBRANCE_STATES.length - 1]).label;
}
