/**
 * @file Tests for the Foundry-free half of the playtest-rules migration.
 */
import type { QuenchMethods } from "../../e2e";
import { compendiumOrigin, proofToFirearmRating, RENAMED_ENTRIES } from "../migrate-playtest-rules-core";

export const key = "vogelfrei.migratePlaytestRules";
export const options = { displayName: "Vogelfrei: Migration: Playtest Rules" };

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("proofToFirearmRating()", () => {
    it("Gives unproved armour no firearm rating", () => {
      expect(proofToFirearmRating("none", 6)).equal(0);
      expect(proofToFirearmRating(undefined, 6)).equal(0);
    });

    it("Gives partial proof half, rounded down", () => {
      expect(proofToFirearmRating("partial", 3)).equal(1);
      expect(proofToFirearmRating("partial", 6)).equal(3);
    });

    it("Gives full proof the whole rating", () => {
      expect(proofToFirearmRating("full", 4)).equal(4);
    });
  });

  describe("compendiumOrigin()", () => {
    it("Reads a modern compendium source", () => {
      expect(compendiumOrigin("Compendium.vogelfrei.weapons.Item.AAAAAAAAAAAAAAAA", "vogelfrei")).deep.equal({
        pack: "weapons",
        id: "AAAAAAAAAAAAAAAA",
      });
    });

    it("Reads the older sourceId form", () => {
      expect(compendiumOrigin("Compendium.vogelfrei.armour.AAAAAAAAAAAAAAAA", "vogelfrei")?.pack).equal("armour");
    });

    it("Follows a renamed entry to its successor", () => {
      // Wams became Padded doublet.
      const wams = RENAMED_ENTRIES.me5hnjIfGmCFGkPd;
      expect(compendiumOrigin("Compendium.vogelfrei.armour.Item.me5hnjIfGmCFGkPd", "vogelfrei")?.id).equal(wams?.id);
    });

    it("Ignores other packages' compendia, world items and junk", () => {
      expect(compendiumOrigin("Compendium.ose.weapons.Item.AAAAAAAAAAAAAAAA", "vogelfrei")).equal(null);
      expect(compendiumOrigin("Item.AAAAAAAAAAAAAAAA", "vogelfrei")).equal(null);
      expect(compendiumOrigin(null, "vogelfrei")).equal(null);
    });
  });
};
