/**
 * @file Tests for Vogelfrei's armour class model.
 */
import type { QuenchMethods } from "../../../../e2e";
import OseDataModelCharacterAC, { ARMOUR_CLASS_VARIANTS, BASE_AC } from "../data-model-character-ac";

export const key = "vogelfrei.actor.datamodel.character.ac";
export const options = { displayName: "Vogelfrei: Actor: Data Model: Character AC" };

/** A minimal stand-in for an equipped armour Item. */
const armour = (type: string, acMelee: number, acRanged: number, acFirearm = 0) =>
  ({ system: { type, acMelee, acRanged, acFirearm } }) as never;

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("ARMOUR_CLASS_VARIANTS", () => {
    it("Carries five armour classes", () => {
      expect(ARMOUR_CLASS_VARIANTS.length).equal(5);
    });

    it("Names them melee, meleeMonster, ranged, firearm and surprised", () => {
      expect(ARMOUR_CLASS_VARIANTS.map((v) => v.key)).deep.equal([
        "melee",
        "meleeMonster",
        "ranged",
        "firearm",
        "surprised",
      ]);
    });

    it("Keeps the three a character carries about on the sheet", () => {
      expect(ARMOUR_CLASS_VARIANTS.filter((v) => v.onSheet).map((v) => v.key)).deep.equal([
        "melee",
        "ranged",
        "firearm",
      ]);
    });

    it("Marks Ranged and Firearm as answering a ranged attack", () => {
      expect(ARMOUR_CLASS_VARIANTS.filter((v) => v.ranged).map((v) => v.key)).deep.equal(["ranged", "firearm"]);
    });

    it("Opens every variant at 10", () => {
      expect(BASE_AC).equal(10);
    });
  });

  describe("An unarmoured, unskilled character", () => {
    const ac = new OseDataModelCharacterAC();

    it("Has melee AC equal to the base", () => {
      expect(ac.values.melee).equal(10);
    });

    it("Has ranged AC equal to the base", () => {
      expect(ac.values.ranged).equal(10);
    });

    it("Has firearm AC equal to the base", () => {
      expect(ac.values.firearm).equal(10);
    });

    it("Reports melee as its single value", () => {
      expect(ac.value).equal(ac.values.melee);
    });
  });

  describe("The rulebook's worked example", () => {
    // Combat Actions.md: Hans, Weapon Skill 2, Agility +2, Buff coat (Armour
    // Rating 2, firearm 0), has an Armour Class of 16.
    const hans = new OseDataModelCharacterAC([armour("light", 2, 2)], 2, 2, 0);

    it("Computes Hans' melee AC as 16", () => {
      expect(hans.values.melee).equal(16);
    });

    it("Drops Weapon Skill against a monster", () => {
      expect(hans.values.meleeMonster).equal(14);
    });

    it("Drops Weapon Skill at range", () => {
      expect(hans.values.ranged).equal(14);
    });

    it("Keeps only armour and base when surprised", () => {
      expect(hans.values.surprised).equal(12);
    });

    it("Keeps nothing but the base against a shot, a buff coat being worth nothing against a ball", () => {
      expect(hans.values.firearm).equal(10);
    });
  });

  describe("Surprise and Agility", () => {
    const surprised = (agility: number) =>
      new OseDataModelCharacterAC([armour("light", 2, 2)], agility, 2, 0).values.surprised;

    it("Ignores a positive Agility modifier", () => {
      expect(surprised(2)).equal(12);
      expect(surprised(3)).equal(12);
    });

    it("Still applies a negative Agility modifier", () => {
      // Surprise takes the benefit of being nimble, not the penalty of being clumsy.
      expect(surprised(-2)).equal(10);
    });

    it("Leaves melee AC taking the negative as normal", () => {
      const ac = new OseDataModelCharacterAC([armour("light", 2, 2)], -2, 2, 0);
      expect(ac.values.melee).equal(12);
    });
  });

  describe("Shields, which are asymmetric", () => {
    it("Gives a buckler its melee bonus only", () => {
      const ac = new OseDataModelCharacterAC([armour("shield", 2, 0)]);
      expect(ac.values.melee).equal(12);
      expect(ac.values.ranged).equal(10);
    });

    it("Gives a shield both bonuses, at different sizes", () => {
      const ac = new OseDataModelCharacterAC([armour("shield", 2, 3)]);
      expect(ac.values.melee).equal(12);
      expect(ac.values.ranged).equal(13);
    });

    it("Adds the shield to melee AC on top of body armour", () => {
      const ac = new OseDataModelCharacterAC([armour("light", 2, 2), armour("shield", 2, 3)], 2, 2, 0);
      expect(ac.values.melee).equal(18);
      expect(ac.values.ranged).equal(17);
    });
  });

  describe("The firearm rating", () => {
    it("Ignores armour with no firearm rating", () => {
      // Full harness: Armour Rating 6, firearm 0.
      const ac = new OseDataModelCharacterAC([armour("heavy", 6, 6, 0)], 2, 2, 0);
      expect(ac.values.firearm).equal(10);
    });

    it("Counts the armour's firearm rating, not its Armour Rating", () => {
      // Breastplate: 3, firearm 2.
      const ac = new OseDataModelCharacterAC([armour("medium", 3, 3, 2)]);
      expect(ac.values.firearm).equal(12);
      expect(ac.values.melee).equal(13);
    });

    it("Counts only a target of proof among shields", () => {
      const target = new OseDataModelCharacterAC([armour("shield", 2, 3, 0)]);
      const proved = new OseDataModelCharacterAC([armour("shield", 2, 3, 3)]);
      expect(target.values.firearm).equal(10);
      expect(proved.values.firearm).equal(13);
    });

    it("Adds a target of proof to the harness", () => {
      const ac = new OseDataModelCharacterAC([armour("medium", 4, 4, 4), armour("shield", 2, 3, 3)]);
      expect(ac.values.firearm).equal(17);
    });

    it("Takes no Agility, even a negative one", () => {
      expect(new OseDataModelCharacterAC([], 3, 0, 0).values.firearm).equal(10);
      expect(new OseDataModelCharacterAC([], -3, 0, 0).values.firearm).equal(10);
    });
  });

  describe("Stances", () => {
    const withStance = (stance: number) => new OseDataModelCharacterAC([armour("light", 2, 2)], 0, 2, 0, stance);

    it("Adds to melee, monster-melee and ranged AC", () => {
      const ac = withStance(4);
      expect(ac.values.melee).equal(18);
      expect(ac.values.meleeMonster).equal(16);
      expect(ac.values.ranged).equal(16);
    });

    it("Never touches the firearm AC", () => {
      expect(withStance(4).values.firearm).equal(10);
      expect(withStance(-4).values.firearm).equal(10);
    });

    it("Leaves a surprised character alone", () => {
      expect(withStance(4).values.surprised).equal(12);
    });

    it("Takes a Press away as readily as it gives a Guard", () => {
      expect(withStance(-4).values.melee).equal(10);
    });
  });

  describe("Armour Rating, for weapons' armour modifiers", () => {
    it("Counts the harness and the shield together", () => {
      const ac = new OseDataModelCharacterAC([armour("light", 1, 1), armour("shield", 2, 3)]);
      expect(ac.armourRatingMelee).equal(3);
      expect(ac.armourRatingRanged).equal(4);
    });

    it("Is 0 with nothing on", () => {
      expect(new OseDataModelCharacterAC([], 2, 2, 0).armourRatingMelee).equal(0);
    });

    it("Leaves out Agility, Weapon Skill, stance and the modifier", () => {
      const ac = new OseDataModelCharacterAC([armour("medium", 4, 4)], 3, 3, 2, 4);
      expect(ac.armourRatingMelee).equal(4);
    });
  });

  describe("Armour is a bonus, not an override", () => {
    it("Adds the Armour Rating to the base rather than replacing it", () => {
      const ac = new OseDataModelCharacterAC([armour("heavy", 6, 6)]);
      expect(ac.values.melee).equal(16);
    });

    it("Keeps melee and ranged armour contributions separate", () => {
      const ac = new OseDataModelCharacterAC([armour("light", 3, 1)]);
      expect(ac.values.melee).equal(13);
      expect(ac.values.ranged).equal(11);
    });
  });

  describe("The free-form modifier", () => {
    it("Applies to every variant", () => {
      const ac = new OseDataModelCharacterAC([], 0, 0, 3);
      expect(ac.values.melee).equal(13);
      expect(ac.values.surprised).equal(13);
      expect(ac.values.ranged).equal(13);
      expect(ac.values.firearm).equal(13);
    });

    it("Is readable and writable", () => {
      const ac = new OseDataModelCharacterAC([], 0, 0, 1);
      expect(ac.mod).equal(1);
      ac.mod = -2;
      expect(ac.mod).equal(-2);
      expect(ac.values.melee).equal(8);
    });
  });

  describe("list()", () => {
    const ac = new OseDataModelCharacterAC([armour("light", 2, 2)], 2, 2, 0);
    const list = ac.list;

    it("Returns one entry per variant", () => {
      expect(list.length).equal(ARMOUR_CLASS_VARIANTS.length);
    });

    it("Narrows to the sheet variants in sheetList", () => {
      expect(ac.sheetList.map((entry) => entry.key)).deep.equal(["melee", "ranged", "firearm"]);
    });

    it("Leaves the situational variants out of sheetList", () => {
      expect(ac.sheetList.some((entry) => ["surprised", "meleeMonster"].includes(entry.key))).equal(false);
    });

    it("Still offers every variant to the attack dialog", () => {
      expect(ac.list.map((entry) => entry.key)).deep.equal(["melee", "meleeMonster", "ranged", "firearm", "surprised"]);
    });

    it("Pairs each label with its computed value", () => {
      const melee = list.find((entry) => entry.key === "melee");
      expect(melee?.label).equal("VF.ac.melee");
      expect(melee?.value).equal(16);
    });
  });
};
