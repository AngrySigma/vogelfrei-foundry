/**
 * @file Tests for Vogelfrei encumbrance, counted in points.
 *
 * Rules: docs/Adventuring/Time and Movement.md#encumbrance
 */
import type { QuenchMethods } from "../../../e2e";
import {
  ARMOUR_POINTS,
  ENCUMBRANCE_LIMIT,
  ITEMS_PER_POINT,
  countedItems,
  encumbranceBreakdown,
  encumbranceStateLabel,
  pointsFromItemCount,
} from "../encumbrance-points";

export const key = "vogelfrei.actor.encumbrance";
export const options = { displayName: "Vogelfrei: Actor: Encumbrance Points" };

/** A plain carried item. */
const item = (system: Record<string, unknown> = {}) =>
  ({ type: "item", system: { quantity: { value: 1 }, ...system } }) as never;

/** A suit of body armour. */
const armour = (type: string, equipped = true) =>
  ({ type: "armor", system: { type, equipped, quantity: { value: 1 } } }) as never;

/** A shield, which is held rather than worn, and is oversized. */
const shield = () =>
  ({
    type: "armor",
    system: { type: "shield", equipped: true, encumbrance: "oversized", quantity: { value: 1 } },
  }) as never;

const many = (count: number, make: () => unknown) => Array.from({ length: count }, make) as never[];

/** Movement, exactly as OseDataModelCharacterMove derives it from breakpoints. */
const feetPerTurn = (points: number, base = 120) => {
  if (points >= ENCUMBRANCE_LIMIT) return 0;
  if (points >= 4) return base * 0.25;
  if (points >= 3) return base * 0.5;
  if (points >= 2) return base * 0.75;
  return base;
};

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("The item ladder", () => {
    it("Leaves the first five items free", () => {
      for (const count of [0, 1, 5]) expect(pointsFromItemCount(count)).equal(0);
    });

    it("Charges a point at six, two at eleven, three at sixteen", () => {
      expect(pointsFromItemCount(6)).equal(1);
      expect(pointsFromItemCount(11)).equal(2);
      expect(pointsFromItemCount(16)).equal(3);
    });

    it("Holds each point until the next five are gathered", () => {
      expect(pointsFromItemCount(10)).equal(1);
      expect(pointsFromItemCount(15)).equal(2);
      expect(pointsFromItemCount(20)).equal(3);
    });

    it("Counts five items to a point", () => {
      expect(ITEMS_PER_POINT).equal(5);
    });
  });

  describe("Stacking", () => {
    it("Counts each one separately without a stack size", () => {
      expect(countedItems(3, 0)).equal(3);
      expect(countedItems(3, 1)).equal(3);
    });

    it("Makes three rations one item, and four rations two", () => {
      expect(countedItems(3, 3)).equal(1);
      expect(countedItems(4, 3)).equal(2);
      expect(countedItems(6, 3)).equal(2);
      expect(countedItems(7, 3)).equal(3);
    });

    it("Makes twenty arrows one item, and twenty-one two", () => {
      expect(countedItems(20, 20)).equal(1);
      expect(countedItems(21, 20)).equal(2);
      expect(countedItems(40, 20)).equal(2);
    });

    it("Counts nothing when none are held", () => {
      expect(countedItems(0, 20)).equal(0);
    });
  });

  describe("How an item counts", () => {
    it("Charges a point for the sixth ordinary item", () => {
      expect(encumbranceBreakdown(many(5, item)).points).equal(0);
      expect(encumbranceBreakdown(many(6, item)).points).equal(1);
    });

    it("Never charges for a non-encumbering item, however many", () => {
      expect(encumbranceBreakdown(many(20, () => item({ encumbrance: "none" }))).points).equal(0);
    });

    it("Charges a point for each oversized item", () => {
      expect(encumbranceBreakdown([item({ encumbrance: "oversized" })]).points).equal(1);
      expect(encumbranceBreakdown(many(3, () => item({ encumbrance: "oversized" }))).points).equal(3);
    });

    it("Counts oversized items separately from the ordinary tally", () => {
      const carried = [...many(5, item), item({ encumbrance: "oversized" })];
      expect(encumbranceBreakdown(carried).itemCount).equal(5);
      expect(encumbranceBreakdown(carried).points).equal(1);
    });

    it("Ignores anything that is not carried at all", () => {
      const spells = many(30, () => ({ type: "spell", system: {} }));
      expect(encumbranceBreakdown(spells).points).equal(0);
    });
  });

  describe("Armour", () => {
    it("Charges nothing for light, one for medium, two for heavy", () => {
      expect(encumbranceBreakdown([armour("light")]).points).equal(0);
      expect(encumbranceBreakdown([armour("medium")]).points).equal(1);
      expect(encumbranceBreakdown([armour("heavy")]).points).equal(2);
      expect(encumbranceBreakdown([armour("unarmored")]).points).equal(0);
    });

    it("Keeps worn armour out of the carried tally", () => {
      // Time and Movement.md: worn clothing, armour and jewelry do not count.
      expect(encumbranceBreakdown([armour("heavy")]).itemCount).equal(0);
    });

    it("Treats armour in the pack as a carried item, not as armour", () => {
      const packed = encumbranceBreakdown([armour("heavy", false)]);
      expect(packed.armourPoints).equal(0);
      expect(packed.itemCount).equal(1);
    });

    it("Treats a shield as carried rather than worn, so its oversize counts", () => {
      expect(encumbranceBreakdown([shield()]).points).equal(1);
      expect(encumbranceBreakdown([shield()]).armourPoints).equal(0);
    });

    it("Carries the armour table the rules name", () => {
      expect(ARMOUR_POINTS.light).equal(0);
      expect(ARMOUR_POINTS.medium).equal(1);
      expect(ARMOUR_POINTS.heavy).equal(2);
    });
  });

  describe("A whole character", () => {
    // Eleven odds and ends, a shield in hand, and a suit of heavy armour.
    const loaded = encumbranceBreakdown([...many(11, item), shield(), armour("heavy")]);

    it("Adds the three sources together", () => {
      expect(loaded.itemCount).equal(11);
      expect(loaded.itemPoints).equal(2);
      expect(loaded.oversizedPoints).equal(1);
      expect(loaded.armourPoints).equal(2);
      expect(loaded.points).equal(5);
    });

    it("Stops them moving at five points", () => {
      expect(loaded.points).least(ENCUMBRANCE_LIMIT);
      expect(feetPerTurn(loaded.points)).equal(0);
    });
  });

  describe("Encumbrance states", () => {
    it("Names each band", () => {
      expect(encumbranceStateLabel(0)).equal("VF.encumbrance.unencumbered");
      expect(encumbranceStateLabel(1)).equal("VF.encumbrance.unencumbered");
      expect(encumbranceStateLabel(2)).equal("VF.encumbrance.light");
      expect(encumbranceStateLabel(3)).equal("VF.encumbrance.heavy");
      expect(encumbranceStateLabel(4)).equal("VF.encumbrance.severe");
      expect(encumbranceStateLabel(5)).equal("VF.encumbrance.over");
      expect(encumbranceStateLabel(12)).equal("VF.encumbrance.over");
    });
  });

  describe("The movement table those points drive", () => {
    // Time and Movement.md#movement, read across: feet per turn, feet per
    // combat round, miles per day.
    const table: [number, number, number, number][] = [
      [0, 120, 40, 24],
      [1, 120, 40, 24],
      [2, 90, 30, 18],
      [3, 60, 20, 12],
      [4, 30, 10, 6],
      [5, 0, 0, 0],
      [8, 0, 0, 0],
    ];

    for (const [points, turn, round, miles] of table) {
      it(`Moves ${turn}' per turn at ${points} points`, () => {
        expect(feetPerTurn(points)).equal(turn);
        // The move model derives these two from the turn rate.
        expect(feetPerTurn(points) / 3).equal(round);
        expect(feetPerTurn(points) / 5).equal(miles);
      });
    }
  });
};
