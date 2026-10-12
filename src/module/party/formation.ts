/**
 * @file Marching order: the party's named layouts, and which one it is keeping.
 *
 * A layout is a grid of squares a fixed number wide, front rank first, read
 * left to right. It is stored as one flat list in that reading order, with
 * empty squares as null, so "who is third" has exactly one answer and changing
 * the width re-wraps the same order into narrower or wider ranks.
 *
 * Layouts are the players' to arrange -- "Default", "Corridor", "3-squares",
 * whatever they like -- and the active one is the order the party is keeping
 * right now, so the Referee can see it at a glance. Nothing reflows a layout
 * when the passage changes: the players pick the layout that fits.
 *
 * Every change is an operation (`FormationOp`) applied by `applyFormationOp`,
 * because players do not write the setting themselves: they send the
 * operation to the Referee's client, which applies it. Keeping the operations
 * to this closed set is what stops a player from editing the roster that way.
 *
 * Foundry-free, so the bookkeeping can be checked on its own.
 */

/** The widest a layout may be. Past this it is a battle line, not a marching order. */
export const MAX_WIDTH = 6;

/** The longest a layout name may be. */
export const MAX_NAME = 40;

/** At most this many layouts, so a stuck drag cannot fill the setting. */
export const MAX_LAYOUTS = 12;

/** At most this many squares in one layout: 20 members, with room for gaps. */
export const MAX_SLOTS = 60;

export type Layout = {
  id: string;
  name: string;
  /** Squares per rank. */
  width: number;
  /** Actor uuids in reading order, front rank first; null is an empty square. */
  slots: (string | null)[];
};

export type Formation = {
  layouts: Layout[];
  /** The id of the layout the party is keeping. */
  active: string;
};

export type FormationOp =
  | { type: "place"; layout: string; uuid: string; index: number }
  | { type: "clear"; layout: string; index: number }
  | { type: "add"; id: string; name: string; width: number }
  | { type: "remove"; layout: string }
  | { type: "rename"; layout: string; name: string }
  | { type: "width"; layout: string; width: number }
  | { type: "activate"; layout: string };

/** The layout every party starts with: two abreast, nobody placed. */
export function defaultFormation(): Formation {
  return { layouts: [{ id: "default", name: "Default", width: 2, slots: [] }], active: "default" };
}

/** A width as a layout keeps it: a whole number from 1 to MAX_WIDTH. */
export function cleanWidth(width: unknown): number {
  const value = Math.floor(Number(width));
  if (!Number.isFinite(value)) return 2;
  return Math.min(MAX_WIDTH, Math.max(1, value));
}

/** A name as a layout keeps it: trimmed, capped, never blank. */
function cleanName(name: unknown, fallback: string): string {
  const trimmed = typeof name === "string" ? name.trim().slice(0, MAX_NAME) : "";
  return trimmed || fallback;
}

/** Drop the empty squares at the back, which hold nothing and only lengthen the grid. */
function trimmed(slots: (string | null)[]): (string | null)[] {
  let end = slots.length;
  while (end > 0 && !slots[end - 1]) end -= 1;
  return slots.slice(0, end);
}

/**
 * Read a stored formation, keeping only Actors that may stand in it.
 *
 * Anyone struck off the roster, or listed as a vehicle, leaves every layout
 * here -- their square becomes empty, so nobody else shifts up. An Actor
 * placed twice keeps its first square.
 *
 * @param stored - Whatever the setting held.
 * @param allowed - The uuids that may be placed.
 * @returns A formation safe to work with, always with at least one layout.
 */
export function normaliseFormation(stored: unknown, allowed: ReadonlySet<string>): Formation {
  const raw = (stored && typeof stored === "object" ? stored : {}) as Partial<Formation>;
  const layouts: Layout[] = [];
  const ids = new Set<string>();

  for (const layout of Array.isArray(raw.layouts) ? raw.layouts : []) {
    if (!layout || typeof layout.id !== "string" || !layout.id || ids.has(layout.id)) continue;
    if (layouts.length >= MAX_LAYOUTS) break;
    ids.add(layout.id);

    const seen = new Set<string>();
    const slots = (Array.isArray(layout.slots) ? layout.slots : []).slice(0, MAX_SLOTS).map((uuid) => {
      if (typeof uuid !== "string" || !allowed.has(uuid) || seen.has(uuid)) return null;
      seen.add(uuid);
      return uuid;
    });

    layouts.push({
      id: layout.id,
      name: cleanName(layout.name, "Layout"),
      width: cleanWidth(layout.width),
      slots: trimmed(slots),
    });
  }

  const [first] = layouts;
  if (!first) return defaultFormation();
  const active = layouts.some((layout) => layout.id === raw.active) ? (raw.active as string) : first.id;
  return { layouts, active };
}

/** The layout with an id, or undefined. */
export function layoutOf(formation: Formation, id: string): Layout | undefined {
  return formation.layouts.find((layout) => layout.id === id);
}

/** The Actors placed in a layout, front to back. */
export function placed(layout: Layout): string[] {
  return layout.slots.filter((uuid): uuid is string => Boolean(uuid));
}

/**
 * The layout cut into ranks for drawing, with one empty rank behind the last
 * so there is always somewhere to drop the next person.
 *
 * @param layout - The layout.
 * @returns Ranks front first, each `width` squares of uuid-or-null with their reading-order index.
 */
export function ranks(layout: Layout): { index: number; uuid: string | null }[][] {
  const filled = Math.ceil(layout.slots.length / layout.width);
  return Array.from({ length: filled + 1 }, (_, rank) =>
    Array.from({ length: layout.width }, (_, file) => {
      const index = rank * layout.width + file;
      return { index, uuid: layout.slots[index] ?? null };
    }),
  );
}

/** Replace one layout, leaving the rest. */
function withLayout(formation: Formation, id: string, change: (layout: Layout) => Layout): Formation {
  return {
    ...formation,
    layouts: formation.layouts.map((layout) => (layout.id === id ? change(layout) : layout)),
  };
}

/**
 * Put an Actor on a square.
 *
 * Moving someone already in the layout onto an occupied square swaps the two,
 * so a drag never pushes anyone out. Someone coming in from outside the layout
 * takes the square, and whoever stood there steps out of the layout.
 */
function place(layout: Layout, uuid: string, index: number): Layout {
  const target = Math.floor(index);
  if (!(target >= 0 && target < MAX_SLOTS)) return layout;

  const slots = [...layout.slots];
  while (slots.length <= target) slots.push(null);

  const from = slots.indexOf(uuid);
  if (from !== -1) slots[from] = slots[target] ?? null;
  slots[target] = uuid;
  return { ...layout, slots: trimmed(slots) };
}

/**
 * Apply one change to the formation.
 *
 * Anything that does not make sense -- an unknown layout, a square off the
 * grid, an Actor not allowed to stand in it, removing the last layout -- is
 * ignored rather than refused, and the formation comes back as it was.
 *
 * @param formation - The formation.
 * @param op - The change.
 * @param allowed - The uuids that may be placed.
 * @returns The new formation.
 */
export function applyFormationOp(formation: Formation, op: FormationOp, allowed: ReadonlySet<string>): Formation {
  switch (op?.type) {
    case "place":
      if (!allowed.has(op.uuid) || !layoutOf(formation, op.layout)) return formation;
      return withLayout(formation, op.layout, (layout) => place(layout, op.uuid, op.index));

    case "clear":
      return withLayout(formation, op.layout, (layout) => ({
        ...layout,
        slots: trimmed(layout.slots.map((uuid, index) => (index === op.index ? null : uuid))),
      }));

    case "add": {
      if (typeof op.id !== "string" || !op.id || layoutOf(formation, op.id)) return formation;
      if (formation.layouts.length >= MAX_LAYOUTS) return formation;
      // Starts with the active layout's people in their order, gaps closed up,
      // so a new layout is a rearrangement rather than a blank to fill.
      const from = layoutOf(formation, formation.active);
      const layout: Layout = {
        id: op.id,
        name: cleanName(op.name, `Layout ${formation.layouts.length + 1}`),
        width: cleanWidth(op.width),
        slots: from ? placed(from) : [],
      };
      // Not made active: drawing up a new order is not the same as adopting it.
      return { ...formation, layouts: [...formation.layouts, layout] };
    }

    case "remove": {
      if (formation.layouts.length <= 1 || !layoutOf(formation, op.layout)) return formation;
      const layouts = formation.layouts.filter((layout) => layout.id !== op.layout);
      const active = formation.active === op.layout ? (layouts[0]?.id ?? formation.active) : formation.active;
      return { layouts, active };
    }

    case "rename":
      return withLayout(formation, op.layout, (layout) => ({ ...layout, name: cleanName(op.name, layout.name) }));

    case "width":
      // The same reading order, wrapped to the new width.
      return withLayout(formation, op.layout, (layout) => ({ ...layout, width: cleanWidth(op.width) }));

    case "activate":
      return layoutOf(formation, op.layout) ? { ...formation, active: op.layout } : formation;

    default:
      return formation;
  }
}
