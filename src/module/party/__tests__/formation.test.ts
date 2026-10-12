/**
 * @file Tests for the marching order's layouts.
 */

import type { QuenchMethods } from "../../../e2e";
import {
  applyFormationOp,
  defaultFormation,
  type Formation,
  type FormationOp,
  type Layout,
  layoutOf,
  MAX_WIDTH,
  normaliseFormation,
  placed,
  ranks,
} from "../formation";

export const key = "vogelfrei.party.formation";
export const options = { displayName: "Vogelfrei: Party Formation" };

const allowed = new Set(["A", "B", "C", "D", "E", "F"]);

/** A B C in front, D E F behind, three abreast. */
const sixAbreast = (): Formation => ({
  layouts: [{ id: "default", name: "Default", width: 3, slots: ["A", "B", "C", "D", "E", "F"] }],
  active: "default",
});

const apply = (formation: Formation, ...ops: FormationOp[]) =>
  ops.reduce((next, op) => applyFormationOp(next, op, allowed), formation);

const slots = (formation: Formation, id = "default") => layoutOf(formation, id)?.slots;

/** A layout known to exist. */
const layoutIn = (formation: Formation, id = "default") => layoutOf(formation, id) as Layout;

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("Reading a stored formation", () => {
    it("Starts every party with one empty Default layout, marching", () => {
      expect(normaliseFormation(undefined, allowed)).deep.equal(defaultFormation());
    });

    it("Empties the square of anyone no longer allowed, without shifting the rest up", () => {
      const formation = normaliseFormation(sixAbreast(), new Set(["A", "C", "D"]));
      expect(slots(formation)).deep.equal(["A", null, "C", "D"]);
    });

    it("Keeps an Actor placed twice on its first square only", () => {
      const stored = { layouts: [{ id: "x", name: "X", width: 2, slots: ["A", "B", "A"] }], active: "x" };
      expect(slots(normaliseFormation(stored, allowed), "x")).deep.equal(["A", "B"]);
    });

    it("Falls back to the first layout when the active one is gone", () => {
      const stored = { layouts: [{ id: "x", name: "X", width: 2, slots: [] }], active: "missing" };
      expect(normaliseFormation(stored, allowed).active).equal("x");
    });

    it("Keeps a width between 1 and the maximum", () => {
      const stored = { layouts: [{ id: "x", name: "X", width: 99, slots: [] }], active: "x" };
      expect(layoutOf(normaliseFormation(stored, allowed), "x")?.width).equal(MAX_WIDTH);
    });
  });

  describe("Ranks", () => {
    it("Cuts the reading order into ranks front first, with an empty rank behind", () => {
      const drawn = ranks(layoutIn(sixAbreast())).map((rank) => rank.map((square) => square.uuid));
      expect(drawn).deep.equal([
        ["A", "B", "C"],
        ["D", "E", "F"],
        [null, null, null],
      ]);
    });

    it("Re-wraps the same order when the width changes", () => {
      const narrowed = apply(sixAbreast(), { type: "width", layout: "default", width: 2 });
      const drawn = ranks(layoutIn(narrowed)).map((rank) => rank.map((square) => square.uuid));
      expect(drawn.slice(0, 3)).deep.equal([
        ["A", "B"],
        ["C", "D"],
        ["E", "F"],
      ]);
    });
  });

  describe("Placing people", () => {
    it("Swaps two people already in the layout", () => {
      expect(slots(apply(sixAbreast(), { type: "place", layout: "default", uuid: "A", index: 4 }))).deep.equal([
        "E",
        "B",
        "C",
        "D",
        "A",
        "F",
      ]);
    });

    it("Moves someone onto an empty square, leaving theirs empty", () => {
      const formation = apply(sixAbreast(), { type: "place", layout: "default", uuid: "F", index: 7 });
      expect(slots(formation)).deep.equal(["A", "B", "C", "D", "E", null, null, "F"]);
    });

    it("Puts a newcomer on a square and steps its occupant out", () => {
      const start = apply(sixAbreast(), { type: "clear", layout: "default", index: 5 });
      const formation = apply(start, { type: "place", layout: "default", uuid: "F", index: 0 });
      expect(slots(formation)).deep.equal(["F", "B", "C", "D", "E"]);
    });

    it("Ignores anyone not allowed, and squares off the grid", () => {
      const formation = sixAbreast();
      expect(apply(formation, { type: "place", layout: "default", uuid: "Wagon", index: 0 })).deep.equal(formation);
      expect(apply(formation, { type: "place", layout: "default", uuid: "A", index: -1 })).deep.equal(formation);
      expect(apply(formation, { type: "place", layout: "default", uuid: "A", index: 999 })).deep.equal(formation);
    });

    it("Clears a square and trims the empty squares at the back", () => {
      const formation = apply(sixAbreast(), { type: "clear", layout: "default", index: 5 });
      expect(slots(formation)).deep.equal(["A", "B", "C", "D", "E"]);
      expect(placed(layoutIn(formation))).deep.equal(["A", "B", "C", "D", "E"]);
    });
  });

  describe("Layouts", () => {
    it("Adds a layout from the active order with the gaps closed, and does not adopt it", () => {
      const gapped = apply(sixAbreast(), { type: "clear", layout: "default", index: 1 });
      const formation = apply(gapped, { type: "add", id: "corridor", name: "Corridor", width: 1 });
      expect(slots(formation, "corridor")).deep.equal(["A", "C", "D", "E", "F"]);
      expect(layoutOf(formation, "corridor")?.width).equal(1);
      expect(formation.active).equal("default");
    });

    it("Will not add a layout under an id already taken", () => {
      const formation = sixAbreast();
      expect(apply(formation, { type: "add", id: "default", name: "Again", width: 2 })).deep.equal(formation);
    });

    it("Renames a layout, and keeps the old name for a blank one", () => {
      const renamed = apply(sixAbreast(), { type: "rename", layout: "default", name: "  Road  " });
      expect(layoutOf(renamed, "default")?.name).equal("Road");
      expect(layoutOf(apply(renamed, { type: "rename", layout: "default", name: " " }), "default")?.name).equal("Road");
    });

    it("Marks a layout as the one the party keeps", () => {
      const formation = apply(
        sixAbreast(),
        { type: "add", id: "corridor", name: "Corridor", width: 1 },
        { type: "activate", layout: "corridor" },
      );
      expect(formation.active).equal("corridor");
      expect(apply(formation, { type: "activate", layout: "missing" }).active).equal("corridor");
    });

    it("Removes a layout, moving the march to another if it was the active one, but never the last", () => {
      const two = apply(
        sixAbreast(),
        { type: "add", id: "corridor", name: "Corridor", width: 1 },
        { type: "activate", layout: "corridor" },
      );
      const one = apply(two, { type: "remove", layout: "corridor" });
      expect(one.layouts.map((layout) => layout.id)).deep.equal(["default"]);
      expect(one.active).equal("default");
      expect(apply(one, { type: "remove", layout: "default" })).deep.equal(one);
    });

    it("Ignores an operation it does not know", () => {
      const formation = sixAbreast();
      expect(apply(formation, { type: "editRoster" } as unknown as FormationOp)).deep.equal(formation);
    });
  });
};
