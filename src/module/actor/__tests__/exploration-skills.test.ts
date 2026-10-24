/**
 * @file Tests for skill rolls at the extremes: sure things and long shots.
 */
import type { QuenchMethods } from "../../../e2e";
import { skillDice, skillRollMode, skillSucceeds } from "../exploration-skills";

export const key = "vogelfrei.actor.explorationSkills";
export const options = { displayName: "Vogelfrei: Actor: Skill Rolls" };

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("skillRollMode()", () => {
    it("Rolls the usual d6 between 1 and 5 in 6", () => {
      for (const chance of [1, 2, 3, 4, 5]) expect(skillRollMode(chance)).equal("normal");
    });

    it("Makes 6 in 6 or better a sure thing", () => {
      expect(skillRollMode(6)).equal("sure");
      expect(skillRollMode(8)).equal("sure");
    });

    it("Makes 0 in 6 or worse a long shot", () => {
      expect(skillRollMode(0)).equal("longShot");
      expect(skillRollMode(-2)).equal("longShot");
    });

    it("Throws 2d6 at either extreme and 1d6 otherwise", () => {
      expect(skillDice("normal")).equal("1d6");
      expect(skillDice("sure")).equal("2d6");
      expect(skillDice("longShot")).equal("2d6");
    });
  });

  describe("skillSucceeds()", () => {
    it("Succeeds on a d6 at or under the chance", () => {
      expect(skillSucceeds("normal", [3], 3)).equal(true);
      expect(skillSucceeds("normal", [4], 3)).equal(false);
    });

    it("Fails a sure thing only on a double 6", () => {
      expect(skillSucceeds("sure", [6, 6], 6)).equal(false);
      expect(skillSucceeds("sure", [6, 5], 6)).equal(true);
      expect(skillSucceeds("sure", [1, 1], 6)).equal(true);
    });

    it("Succeeds at a long shot only on a double 1", () => {
      expect(skillSucceeds("longShot", [1, 1], 0)).equal(true);
      expect(skillSucceeds("longShot", [1, 2], 0)).equal(false);
      expect(skillSucceeds("longShot", [6, 6], 0)).equal(false);
    });

    it("Has 1 in 36 either way", () => {
      const faces = [1, 2, 3, 4, 5, 6];
      const pairs = faces.flatMap((a) => faces.map((b) => [a, b]));
      expect(pairs.filter((p) => !skillSucceeds("sure", p, 6)).length).equal(1);
      expect(pairs.filter((p) => skillSucceeds("longShot", p, 0)).length).equal(1);
    });
  });
};
