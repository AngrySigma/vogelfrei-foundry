/**
 * @file Tests for Guard, Press and Defensive Fighting.
 */
import type { QuenchMethods } from "../../../e2e";
import { stanceAc, stanceAllowed, stanceAttack } from "../stance";

export const key = "vogelfrei.actor.stance";
export const options = { displayName: "Vogelfrei: Actor: Stances" };

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("stanceAc()", () => {
    it("Gives Guard +4 with Weapon Skill and something in hand", () => {
      expect(stanceAc("guard", { weaponSkill: 1, armed: true })).equal(4);
    });

    it("Gives Guard +2 without Weapon Skill", () => {
      expect(stanceAc("guard", { weaponSkill: 0, armed: true })).equal(2);
    });

    it("Gives Guard +2 empty-handed, whatever the Weapon Skill", () => {
      expect(stanceAc("guard", { weaponSkill: 3, armed: false })).equal(2);
    });

    it("Costs a Press 4 AC", () => {
      expect(stanceAc("press", { weaponSkill: 2, armed: true })).equal(-4);
    });

    it("Gives Defensive Fighting +2 AC", () => {
      expect(stanceAc("defensive", { weaponSkill: 2, armed: true })).equal(2);
    });

    it("Is 0 with no stance", () => {
      expect(stanceAc(null, { weaponSkill: 2, armed: true })).equal(0);
    });
  });

  describe("stanceAttack()", () => {
    it("Gives a Press +2 to hit", () => {
      expect(stanceAttack("press")).equal(2);
    });

    it("Costs Defensive Fighting 4 to hit", () => {
      expect(stanceAttack("defensive")).equal(-4);
    });

    it("Leaves Guard, which makes no attack, and no stance at 0", () => {
      expect(stanceAttack("guard")).equal(0);
      expect(stanceAttack(null)).equal(0);
    });
  });

  describe("stanceAllowed()", () => {
    it("Lets anyone Guard", () => {
      expect(stanceAllowed("guard", 0)).equal(true);
    });

    it("Keeps Press and Defensive Fighting for Weapon Skill 1+", () => {
      expect(stanceAllowed("press", 0)).equal(false);
      expect(stanceAllowed("defensive", 0)).equal(false);
      expect(stanceAllowed("press", 1)).equal(true);
      expect(stanceAllowed("defensive", 1)).equal(true);
    });
  });
};
