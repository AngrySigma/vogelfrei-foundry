/**
 * @file Tests for the weapon damage grades.
 */
import type { QuenchMethods } from "../../../e2e";
import { DEFAULT_WEAPON_DAMAGE, WEAPON_DAMAGE, weaponDamageGrade } from "../weapon-damage";

export const key = "vogelfrei.item.weaponDamage";
export const options = { displayName: "Vogelfrei: Item: Weapon Damage Grades" };

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("weaponDamageGrade()", () => {
    it("Reads back each grade's own formula", () => {
      expect(weaponDamageGrade(WEAPON_DAMAGE.improvised)).equal("improvised");
      expect(weaponDamageGrade(WEAPON_DAMAGE.minor)).equal("minor");
      expect(weaponDamageGrade(WEAPON_DAMAGE.medium)).equal("medium");
      expect(weaponDamageGrade(WEAPON_DAMAGE.great)).equal("great");
    });

    it("Ignores spacing, case and a missing 1", () => {
      expect(weaponDamageGrade("d8")).equal("medium");
      expect(weaponDamageGrade("2D8KL")).equal("minor");
      expect(weaponDamageGrade("max(1d8-3,1)")).equal("improvised");
    });

    it("Calls anything else custom", () => {
      expect(weaponDamageGrade("1d6")).equal("custom");
      expect(weaponDamageGrade("2d8kh+1")).equal("custom");
      expect(weaponDamageGrade("")).equal("custom");
      expect(weaponDamageGrade(undefined)).equal("custom");
    });

    it("Gives a new weapon medium damage", () => {
      expect(weaponDamageGrade(DEFAULT_WEAPON_DAMAGE)).equal("medium");
    });
  });

  describe("WEAPON_DAMAGE", () => {
    it("Rolls every grade in Foundry, never below 1", async () => {
      for (const formula of Object.values(WEAPON_DAMAGE)) {
        const roll = await new Roll(formula).evaluate();
        expect(roll.total).within(1, 8);
      }
    });
  });
};
