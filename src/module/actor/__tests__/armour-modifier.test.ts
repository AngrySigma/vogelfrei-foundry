/**
 * @file Tests for a weapon's armour modifier, capped by Armour Rating.
 */
import type { QuenchMethods } from "../../../e2e";
import { cappedArmourModifier, targetArmourRating } from "../armour-modifier";

export const key = "vogelfrei.actor.armourModifier";
export const options = { displayName: "Vogelfrei: Actor: Armour Modifier" };

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("cappedArmourModifier()", () => {
    it("Follows the book's examples against a padded doublet (1)", () => {
      // Combat Actions.md: a rapier (-2) takes -1; a heavy crossbow (+3) gains +1.
      expect(cappedArmourModifier(-2, 1)).equal(-1);
      expect(cappedArmourModifier(3, 1)).equal(1);
    });

    it("Applies in full when the armour is heavier than the modifier", () => {
      expect(cappedArmourModifier(-2, 6)).equal(-2);
      expect(cappedArmourModifier(3, 4)).equal(3);
    });

    it("Does nothing against a target with no Armour Rating", () => {
      expect(cappedArmourModifier(-2, 0)).equal(0);
      expect(cappedArmourModifier(3, 0)).equal(0);
    });

    it("Does nothing for a weapon with no modifier", () => {
      expect(cappedArmourModifier(0, 6)).equal(0);
    });

    it("Treats junk as nothing", () => {
      expect(cappedArmourModifier(Number.NaN, 4)).equal(0);
      expect(cappedArmourModifier(2, -3)).equal(0);
    });
  });

  describe("targetArmourRating()", () => {
    const character = { ac: { armourRatingMelee: 3, armourRatingRanged: 4 } };

    it("Reads a character's melee rating, shield included", () => {
      expect(targetArmourRating(character, false)).equal(3);
    });

    it("Reads a character's ranged rating, shield included", () => {
      expect(targetArmourRating(character, true)).equal(4);
    });

    it("Reads a monster's typed Armour Rating", () => {
      expect(targetArmourRating({ ac: {}, armourRating: 2 }, false)).equal(2);
    });

    it("Gives a monster with natural AC no Armour Rating", () => {
      expect(targetArmourRating({ ac: {} }, false)).equal(0);
    });

    it("Is 0 with no target", () => {
      expect(targetArmourRating(null, false)).equal(0);
    });
  });
};
