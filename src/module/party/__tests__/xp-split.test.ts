/**
 * @file Tests for dividing an XP award by shares.
 */

import type { QuenchMethods } from "../../../e2e";
import { splitXP } from "../xp-split";

export const key = "vogelfrei.party.xp-split";
export const options = { displayName: "Vogelfrei: Party XP Split" };

/** Three players, a henchman, two hirelings, an NPC and a wagon. */
const expedition = [
  { name: "Anna", shares: 1 },
  { name: "Bertram", shares: 1 },
  { name: "Clothilde", shares: 1 },
  { name: "Hans", shares: 0.5 },
  { name: "Torchbearer", shares: 0.2 },
  { name: "Mule-driver", shares: 0.2 },
  { name: "Brother Ulric", shares: 0 },
  { name: "Wagon", shares: 0 },
];

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("Splitting XP by shares", () => {
    it("Gives one line per distinct share, largest first, naming everyone on it", () => {
      const split = splitXP(1240, expedition);
      expect(split.totalShares).equal(3.9);
      expect(split.lines).deep.equal([
        { shares: 1, each: 317, names: ["Anna", "Bertram", "Clothilde"] },
        { shares: 0.5, each: 158, names: ["Hans"] },
        { shares: 0.2, each: 63, names: ["Torchbearer", "Mule-driver"] },
      ]);
    });

    it("Says what rounding down left over", () => {
      // 3 × 317 + 158 + 2 × 63 = 1235.
      expect(splitXP(1240, expedition).leftover).equal(5);
    });

    it("Names the members who take no share", () => {
      expect(splitXP(1240, expedition).unshared).deep.equal(["Brother Ulric", "Wagon"]);
    });

    it("Divides evenly when it can, with nothing left over", () => {
      const split = splitXP(300, [
        { name: "Anna", shares: 1 },
        { name: "Hans", shares: 0.5 },
      ]);
      expect(split.perShare).equal(200);
      expect(split.lines.map((line) => line.each)).deep.equal([200, 100]);
      expect(split.leftover).equal(0);
    });

    it("Works in hundredths, so a share does not lose a point to floating point", () => {
      const split = splitXP(100, [
        { name: "Hireling", shares: 0.29 },
        { name: "Other", shares: 0.71 },
      ]);
      expect(split.lines.find((line) => line.shares === 0.29)?.each).equal(29);
    });

    it("Gives a hireling on an odd share a line of their own", () => {
      const split = splitXP(1000, [
        { name: "Torchbearer", shares: 0.2 },
        { name: "Guide", shares: 0.3 },
        { name: "Porter", shares: 0.2 },
      ]);
      expect(split.lines.map((line) => line.names)).deep.equal([["Guide"], ["Torchbearer", "Porter"]]);
    });

    it("Leaves the whole award over when nobody holds a share", () => {
      const split = splitXP(500, [{ name: "Wagon", shares: 0 }]);
      expect(split.lines).deep.equal([]);
      expect(split.perShare).equal(0);
      expect(split.leftover).equal(500);
    });

    it("Takes a fractional or negative award as its whole, non-negative part", () => {
      expect(splitXP(99.9, [{ name: "Anna", shares: 1 }]).total).equal(99);
      expect(splitXP(-5, [{ name: "Anna", shares: 1 }]).total).equal(0);
    });
  });
};
