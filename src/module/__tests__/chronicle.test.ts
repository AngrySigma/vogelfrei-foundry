/**
 * @file Tests for the Chronicle's two clocks.
 */

import type { QuenchMethods } from "../../e2e";
import type { Delve } from "../chronicle/chronicle";
import {
  advanceDays,
  advanceTurns,
  advanceWatches,
  clockOf,
  defaultChronicle,
  encounterDue,
  killXP,
  lightRemaining,
  lightSource,
  lootXP,
  newDelve,
  rest,
  restState,
  suggestedWatches,
  TURNS_PER_WATCH,
  watchOf,
  xpForHitDice,
} from "../chronicle/chronicle";

export const key = "vogelfrei.chronicle";
export const options = { displayName: "Vogelfrei: Chronicle" };

/** A delve at the third watch of the third day, nothing spent yet. */
const delve = (): Delve => newDelve("The Sunken Barrow", { day: 3, watch: 2 }, "test-delve");

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("The watch track", () => {
    it("Names the six watches, dawn first", () => {
      expect(watchOf(0).key).equal("dawn");
      expect(watchOf(5).key).equal("deepNight");
    });

    it("Wraps in both directions rather than falling off", () => {
      expect(watchOf(6).key).equal("dawn");
      expect(watchOf(-1).key).equal("deepNight");
    });

    it("Knows whether the sun is up", () => {
      expect(watchOf(2).daylight).equal(true);
      expect(watchOf(3).daylight).equal(false);
    });

    it("Puts a clock on each watch, four hours apart from dawn", () => {
      expect(clockOf(0)).equal("06:00");
      expect(clockOf(3)).equal("18:00");
      expect(clockOf(5)).equal("02:00");
    });

    it("Rolls the day over on the sixth watch", () => {
      expect(advanceWatches({ day: 1, watch: 5 }, 1)).deep.equal({ day: 2, watch: 0 });
    });

    it("Takes a watch back, and the day with it", () => {
      expect(advanceWatches({ day: 2, watch: 0 }, -1)).deep.equal({ day: 1, watch: 5 });
    });

    it("Will not go back before the first dawn", () => {
      expect(advanceWatches({ day: 1, watch: 0 }, -5)).deep.equal({ day: 1, watch: 0 });
    });

    it("Skips a whole day without changing the hour", () => {
      expect(advanceDays({ day: 4, watch: 3 }, 1)).deep.equal({ day: 5, watch: 3 });
    });

    it("Starts a world at the first dawn with nothing underway", () => {
      expect(defaultChronicle()).deep.equal({
        day: 1,
        watch: 0,
        delves: [],
        travel: { everyWatches: 6, chanceIn6: 1, terrain: "clear" },
      });
    });

    it("Counts watches from the first dawn", () => {
      expect(watchesElapsed({ day: 1, watch: 0 })).equal(0);
      expect(watchesElapsed({ day: 3, watch: 2 })).equal(14);
    });
  });

  describe("The turn track", () => {
    it("Records when the party went in", () => {
      expect(delve().startedOn).deep.equal({ day: 3, watch: 2 });
      expect(delve().turn).equal(0);
    });

    it("Owes a rest after five Turns, and penalises a sixth", () => {
      expect(restState(advanceTurns(delve(), 4))).deep.equal({ owed: false, penalised: false });
      expect(restState(advanceTurns(delve(), 5))).deep.equal({ owed: true, penalised: false });
      expect(restState(advanceTurns(delve(), 6))).deep.equal({ owed: true, penalised: true });
    });

    it("Spends the Turn it rests for", () => {
      const rested = rest(advanceTurns(delve(), 6));
      expect(rested.turn).equal(7);
      expect(restState(rested)).deep.equal({ owed: false, penalised: false });
    });

    it("Does not move the calendar by itself", () => {
      const deep = advanceTurns(delve(), 50);
      expect(deep.startedOn).deep.equal({ day: 3, watch: 2 });
    });
  });

  describe("Light", () => {
    it("Burns for as long as the book says", () => {
      expect(lightSource("Torch", "torch", 0, "a").turns).equal(6);
      expect(lightSource("Candle", "candle", 0, "b").turns).equal(12);
      expect(lightSource("Lantern", "lantern", 0, "c").turns).equal(24);
    });

    it("Counts down from the Turn it was lit, not from zero", () => {
      const torch = lightSource("Torch", "torch", 2, "a");
      expect(lightRemaining(torch, 2)).equal(6);
      expect(lightRemaining(torch, 7)).equal(1);
      expect(lightRemaining(torch, 8)).equal(0);
    });

    it("Takes an explicit duration, for the flask that was already half used", () => {
      expect(lightSource("Half a flask", "lantern", 0, "a", 11).turns).equal(11);
    });

    it("Never runs an eternal source down", () => {
      expect(LIGHT_KINDS.eternal).equal(null);
      const lamp = lightSource("Enchanted lamp", "eternal", 3, "a");
      expect(lamp.turns).equal(null);
      expect(lightRemaining(lamp, 9999)).equal(Number.POSITIVE_INFINITY);
      expect(adjustLight(lamp, -5)).deep.equal(lamp);
    });

    it("Takes fuel in and out, but never below nothing", () => {
      const torch = lightSource("Torch", "torch", 0, "a");
      expect(adjustLight(torch, 2).turns).equal(8);
      expect(adjustLight(torch, -2).turns).equal(4);
      expect(adjustLight(torch, -99).turns).equal(0);
    });
  });

  describe("Random encounters", () => {
    it("Takes each terrain's chance from the book", () => {
      expect(TERRAIN.clear).equal(1);
      expect(TERRAIN.forest).equal(2);
      expect(TERRAIN.hills).equal(2);
      expect(TERRAIN.desert).equal(2);
      expect(TERRAIN.mountains).equal(3);
      expect(TERRAIN.jungle).equal(3);
      expect(TERRAIN.swamp).equal(3);
    });

    it("Counts every check an interval crosses, not just the one it lands on", () => {
      expect(checksBetween(0, 6, 2)).equal(3);
      expect(checksBetween(1, 7, 2)).equal(3);
      expect(checksBetween(0, 12, 6)).equal(2);
    });

    it("Crosses nothing standing still, or going backwards", () => {
      expect(checksBetween(5, 5, 2)).equal(0);
      expect(checksBetween(7, 3, 2)).equal(0);
    });

    it("Reads a cadence of zero as one rather than dividing by it", () => {
      expect(checksBetween(0, 6, 0)).equal(6);
    });
  });

  describe("When a check falls due", () => {
    it("Owes nothing in the doorway", () => {
      expect(encounterDue(delve())).equal(false);
    });

    it("Falls due on the cadence, and only on it", () => {
      const underway = advanceTurns(delve(), 1);
      expect(encounterDue(underway)).equal(false);
      expect(encounterDue(advanceTurns(delve(), 2))).equal(true);
      expect(encounterDue(advanceTurns(delve(), 4))).equal(true);
    });

    it("Survives a cadence of zero rather than dividing by it", () => {
      const busy = { ...advanceTurns(delve(), 3), encounter: { everyTurns: 0, chanceIn6: 2 } };
      expect(encounterDue(busy)).equal(true);
    });
  });

  describe("Coming back up", () => {
    it("Suggests a watch for every twenty-four Turns", () => {
      expect(TURNS_PER_WATCH).equal(24);
      expect(suggestedWatches(advanceTurns(delve(), 50))).equal(2);
      expect(suggestedWatches(advanceTurns(delve(), 5))).equal(0);
    });

    it("Bills only the Turns since the calendar last moved", () => {
      const synced = { ...advanceTurns(delve(), 74), turnAtLastSync: 50 };
      expect(suggestedWatches(synced)).equal(1);
    });
  });

  describe("Experience", () => {
    it("Pays by Hit Dice, per Advancement.md", () => {
      expect(xpForHitDice(0)).equal(5);
      expect(xpForHitDice(1)).equal(10);
      expect(xpForHitDice(5)).equal(100);
      expect(xpForHitDice(11)).equal(1500);
      expect(xpForHitDice(40)).equal(1500);
    });

    it("Counts special abilities as a Hit Die more", () => {
      expect(xpForHitDice(5, true)).equal(250);
    });

    it("Totals the kill list", () => {
      const scored = {
        ...delve(),
        kills: [
          { id: "a", name: "Goblin", hitDice: 1, special: false, count: 4 },
          { id: "b", name: "Ghoul", hitDice: 2, special: true, count: 1 },
        ],
      };
      expect(killXP(scored)).equal(90);
    });

    it("Values treasure at one XP per silver, and keeps the change", () => {
      const carried = {
        ...delve(),
        loot: [
          { id: "x", name: "Silver candlesticks", bp: 600 },
          { id: "y", name: "Loose brass", bp: 7 },
        ],
      };
      expect(lootXP(carried)).equal(50);
    });
  });
};
