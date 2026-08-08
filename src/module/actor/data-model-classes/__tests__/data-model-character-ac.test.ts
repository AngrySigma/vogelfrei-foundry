/**
 * @file Tests for Vogelfrei's armour class model.
 */
import type { QuenchMethods } from "../../../../e2e";
import OseDataModelCharacterAC, {
  ARMOUR_CLASS_VARIANTS,
  MELEE_BASE,
  RANGED_BASE,
} from "../data-model-character-ac";

export const key = "vogelfrei.actor.datamodel.character.ac";
export const options = { displayName: "Vogelfrei: Actor: Data Model: Character AC" };

/** A minimal stand-in for an equipped armour Item. */
const armour = (type: string, acMelee: number, acRanged: number) =>
  ({ system: { type, acMelee, acRanged } }) as never;

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("ARMOUR_CLASS_VARIANTS", () => {
    it("Carries four armour classes", () => {
      expect(ARMOUR_CLASS_VARIANTS.length).equal(4);
    });

    it("Names them melee, meleeMonster, ranged and surprised", () => {
      expect(ARMOUR_CLASS_VARIANTS.map((v) => v.key)).deep.equal([
        "melee",
        "meleeMonster",
        "ranged",
        "surprised",
      ]);
    });

    it("Keeps only the two a character carries about on the sheet", () => {
      expect(ARMOUR_CLASS_VARIANTS.filter((v) => v.onSheet).map((v) => v.key)).deep.equal(["melee", "ranged"]);
    });

    it("Marks only Ranged as answering a ranged attack", () => {
      expect(ARMOUR_CLASS_VARIANTS.filter((v) => v.ranged).map((v) => v.key)).deep.equal(["ranged"]);
    });

    it("Opens melee at 8 and ranged at 11", () => {
      expect(MELEE_BASE).equal(8);
      expect(RANGED_BASE).equal(11);
    });
  });

  describe("An unarmoured, unskilled character", () => {
    const ac = new OseDataModelCharacterAC();

    it("Has melee AC equal to the melee base", () => {
      expect(ac.values.melee).equal(8);
    });

    it("Has ranged AC equal to the ranged base", () => {
      expect(ac.values.ranged).equal(11);
    });

    it("Reports melee as its single value", () => {
      expect(ac.value).equal(ac.values.melee);
    });
  });

  describe("The rulebook's worked example", () => {
    // Combat Actions.md: Hans, Weapon Skill 2, Agility +2, Light Armour (AR 2),
    // has an Armour Class of 14.
    const hans = new OseDataModelCharacterAC([armour("light", 2, 2)], 2, 2, 0);

    it("Computes Hans' melee AC as 14", () => {
      expect(hans.values.melee).equal(14);
    });

    it("Drops Weapon Skill against a monster", () => {
      expect(hans.values.meleeMonster).equal(12);
    });

    it("Uses the ranged base at range", () => {
      expect(hans.values.ranged).equal(15);
    });

    it("Keeps only armour and base when surprised", () => {
      expect(hans.values.surprised).equal(10);
    });
  });

  describe("Surprise and Agility", () => {
    const surprised = (agility: number) =>
      new OseDataModelCharacterAC([armour("light", 2, 2)], agility, 2, 0).values.surprised;

    it("Ignores a positive Agility modifier", () => {
      expect(surprised(2)).equal(10);
      expect(surprised(3)).equal(10);
    });

    it("Still applies a negative Agility modifier", () => {
      // Surprise takes the benefit of being nimble, not the penalty of being clumsy.
      expect(surprised(-2)).equal(8);
    });

    it("Leaves melee AC taking the negative as normal", () => {
      const ac = new OseDataModelCharacterAC([armour("light", 2, 2)], -2, 2, 0);
      expect(ac.values.melee).equal(10);
    });
  });

  describe("Shields, which are asymmetric", () => {
    it("Gives a buckler its melee bonus only", () => {
      const ac = new OseDataModelCharacterAC([armour("shield", 2, 0)]);
      expect(ac.values.melee).equal(10);
      expect(ac.values.ranged).equal(11);
    });

    it("Gives a shield both bonuses, at different sizes", () => {
      const ac = new OseDataModelCharacterAC([armour("shield", 2, 3)]);
      expect(ac.values.melee).equal(10);
      expect(ac.values.ranged).equal(14);
    });

    it("Gives a pavise its ranged bonus only", () => {
      const ac = new OseDataModelCharacterAC([armour("shield", 0, 5)]);
      expect(ac.values.melee).equal(8);
      expect(ac.values.ranged).equal(16);
    });

    it("Adds the shield to melee AC on top of body armour", () => {
      const ac = new OseDataModelCharacterAC([armour("light", 2, 2), armour("shield", 2, 3)], 2, 2, 0);
      expect(ac.values.melee).equal(16);
      expect(ac.values.ranged).equal(18);
    });
  });

  describe("Armour is a bonus, not an override", () => {
    it("Adds the Armour Rating to the base rather than replacing it", () => {
      const ac = new OseDataModelCharacterAC([armour("heavy", 6, 6)]);
      expect(ac.values.melee).equal(14);
    });

    it("Keeps melee and ranged armour contributions separate", () => {
      const ac = new OseDataModelCharacterAC([armour("light", 3, 1)]);
      expect(ac.values.melee).equal(11);
      expect(ac.values.ranged).equal(12);
    });
  });

  describe("The free-form modifier", () => {
    it("Applies to every variant", () => {
      const ac = new OseDataModelCharacterAC([], 0, 0, 3);
      expect(ac.values.melee).equal(11);
      expect(ac.values.surprised).equal(11);
      expect(ac.values.ranged).equal(14);
    });

    it("Is readable and writable", () => {
      const ac = new OseDataModelCharacterAC([], 0, 0, 1);
      expect(ac.mod).equal(1);
      ac.mod = -2;
      expect(ac.mod).equal(-2);
      expect(ac.values.melee).equal(6);
    });
  });

  describe("list()", () => {
    const ac = new OseDataModelCharacterAC([armour("light", 2, 2)], 2, 2, 0);
    const list = ac.list;

    it("Returns one entry per variant", () => {
      expect(list.length).equal(ARMOUR_CLASS_VARIANTS.length);
    });

    it("Narrows to the sheet variants in sheetList", () => {
      expect(ac.sheetList.map((entry) => entry.key)).deep.equal(["melee", "ranged"]);
    });

    it("Leaves the situational variants out of sheetList", () => {
      expect(ac.sheetList.some((entry) => ["surprised", "meleeMonster"].includes(entry.key))).equal(false);
    });

    it("Still offers every variant to the attack dialog", () => {
      expect(ac.list.map((entry) => entry.key)).deep.equal(["melee", "meleeMonster", "ranged", "surprised"]);
    });

    it("Pairs each label with its computed value", () => {
      const melee = list.find((entry) => entry.key === "melee");
      expect(melee?.label).equal("VF.ac.melee");
      expect(melee?.value).equal(14);
    });
  });
};
