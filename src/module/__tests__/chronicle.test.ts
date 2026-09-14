/**
 * @file Tests for the Chronicle's two clocks.
 */

import type { QuenchMethods } from "../../e2e";
import type { Delve } from "../chronicle/chronicle";
import {
  adjustLight,
  advanceTurns,
  checksBetween,
  DUNGEON_DISTANCE,
  defaultChronicle,
  encounterDue,
  killXP,
  LIGHT_KINDS,
  lightRemaining,
  lightSource,
  lootXP,
  newDelve,
  rest,
  restState,
  setTurn,
  suggestedWatches,
  TERRAIN,
  xpForHitDice,
} from "../chronicle/chronicle";
import {
  advanceDays,
  advanceWatches,
  clockRange,
  namingFor,
  phaseOf,
  rescaleCalendar,
  setCalendar,
  watchesElapsed,
  watchesForTurns,
  watchName,
  wrap,
} from "../chronicle/day";

export const key = "vogelfrei.chronicle";
export const options = { displayName: "Vogelfrei: Chronicle" };

/** A delve at the third watch of the third day, nothing spent yet. */
const delve = (): Delve => newDelve("The Sunken Barrow", { day: 3, watch: 2 }, "test-delve");

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("The watch track", () => {
    const names = (count: number) => Array.from({ length: count }, (_, watch) => watchName(watch, count));

    it("Names a two-watch day day and night", () => {
      expect(names(2)).deep.equal(["day", "night"]);
    });

    it("Names a four- and a six-watch day from their own namings", () => {
      expect(names(4)).deep.equal(["morning", "afternoon", "evening", "night"]);
      expect(names(6)).deep.equal(["morning", "midday", "afternoon", "evening", "night", "deadOfNight"]);
    });

    it("Names a day with no naming of its own from the next finer one, by each watch's middle", () => {
      expect(namingFor(5).length).equal(6);
      expect(names(3)).deep.equal(["morning", "evening", "night"]);
      expect(names(8)).deep.equal([
        "dawn",
        "lateMorning",
        "noon",
        "goldenHour",
        "dusk",
        "night",
        "midnight",
        "firstLight",
      ]);
    });

    it("Lets watches share a name past the finest naming", () => {
      expect(namingFor(24).length).equal(12);
      expect(names(24).filter((name) => name === "dawn").length).equal(2);
    });

    it("Colours a watch by the light at its middle", () => {
      expect(Array.from({ length: 6 }, (_, watch) => phaseOf(watch, 6))).deep.equal([
        "day",
        "day",
        "day",
        "twilight",
        "night",
        "night",
      ]);
      expect(phaseOf(0, 12)).equal("twilight");
    });

    it("Gives each watch a clock range, even where the day does not divide evenly", () => {
      expect(clockRange(0, 6)).equal("06:00–10:00");
      expect(clockRange(5, 6)).equal("02:00–06:00");
      expect(clockRange(1, 5)).equal("10:48–15:36");
    });

    it("Wraps in both directions rather than falling off", () => {
      expect(wrap(-1, 4)).equal(3);
      expect(wrap(6, 6)).equal(0);
    });

    it("Rolls the day over after the last watch, however many there are", () => {
      expect(advanceWatches({ day: 1, watch: 3 }, 1, 4)).deep.equal({ day: 2, watch: 0 });
      expect(advanceWatches({ day: 1, watch: 5 }, 1, 6)).deep.equal({ day: 2, watch: 0 });
    });

    it("Will not go back before the first dawn", () => {
      expect(advanceWatches({ day: 1, watch: 0 }, -5, 6)).deep.equal({ day: 1, watch: 0 });
    });

    it("Skips a whole day without changing the watch", () => {
      expect(advanceDays({ day: 3, watch: 1 }, 2, 12)).deep.equal({ day: 5, watch: 1 });
    });

    it("Sets a day directly, refusing day zero", () => {
      expect(setCalendar(9, 2, 6)).deep.equal({ day: 9, watch: 2 });
      expect(setCalendar(0, 2, 6)).deep.equal({ day: 1, watch: 2 });
    });

    it("Keeps the time of day when the day is cut differently", () => {
      expect(rescaleCalendar({ day: 3, watch: 3 }, 6, 12)).deep.equal({ day: 3, watch: 6 });
      expect(rescaleCalendar({ day: 3, watch: 3 }, 6, 2)).deep.equal({ day: 3, watch: 1 });
    });

    it("Counts watches from the first dawn", () => {
      expect(watchesElapsed({ day: 1, watch: 0 }, 6)).equal(0);
      expect(watchesElapsed({ day: 2, watch: 1 }, 12)).equal(13);
    });

    it("Starts a world at the first dawn with nothing underway", () => {
      expect(defaultChronicle()).deep.equal({
        day: 1,
        watch: 0,
        watchesPerDay: 6,
        delves: [],
        travel: { everyWatches: 6, chanceIn6: 1, terrain: "clear", distance: "6d6 * 40" },
      });
    });
  });

  describe("The turn track", () => {
    it("Names itself after the day when nobody names it", () => {
      expect(newDelve("", { day: 4, watch: 1 }, "x").name).equal("Delve, day 4");
      expect(newDelve("  Barrow  ", { day: 4, watch: 1 }, "x").name).equal("Barrow");
    });

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

    it("Takes Turns back, and the rest debt with them", () => {
      const back = setTurn(advanceTurns(delve(), 4), 2);
      expect(back.turn).equal(2);
      expect(back.turnsSinceRest).equal(2);
      expect(setTurn(advanceTurns(delve(), 4), -3).turn).equal(0);
    });

    it("Does not move the calendar by itself", () => {
      const deep = advanceTurns(delve(), 50);
      expect(deep.startedOn).deep.equal({ day: 3, watch: 2 });
    });
  });

  describe("Light", () => {
    it("Burns for as long, and reaches as far, as the book says", () => {
      expect(lightSource("Torch", "torch", 0, "a").turns).equal(6);
      expect(lightSource("Candle", "candle", 0, "b").turns).equal(12);
      expect(lightSource("Lantern", "lantern", 0, "c").turns).equal(24);
      expect(lightSource("Torch", "torch", 0, "a").radius).equal(30);
      expect(lightSource("Candle", "candle", 0, "b").radius).equal(10);
      expect(lightSource("Lantern", "lantern", 0, "c").radius).equal(30);
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
      expect(LIGHT_KINDS.eternal?.turns).equal(null);
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
      expect(TERRAIN.clear?.encounterIn6).equal(1);
      expect(TERRAIN.forest?.encounterIn6).equal(2);
      expect(TERRAIN.hills?.encounterIn6).equal(2);
      expect(TERRAIN.desert?.encounterIn6).equal(2);
      expect(TERRAIN.mountains?.encounterIn6).equal(3);
      expect(TERRAIN.jungle?.encounterIn6).equal(3);
      expect(TERRAIN.swamp?.encounterIn6).equal(3);
    });

    it("Gives every terrain a distance formula, in feet", () => {
      for (const [name, country] of Object.entries(TERRAIN)) {
        expect(country.distance, name).match(/^\d+d\d+ \* \d+$/);
      }
      // Open plains should start much further off than dense jungle.
      expect(TERRAIN.clear?.distance).equal("6d6 * 40");
      expect(TERRAIN.jungle?.distance).equal("2d6 * 10");
      expect(DUNGEON_DISTANCE).equal("3d6 * 10");
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
      const busy = {
        ...advanceTurns(delve(), 3),
        encounter: { everyTurns: 0, chanceIn6: 2, distance: DUNGEON_DISTANCE },
      };
      expect(encounterDue(busy)).equal(true);
    });
  });

  describe("Coming back up", () => {
    it("Suggests watches from the Turns spent, for however the day is cut", () => {
      expect(watchesForTurns(50, 6)).equal(2);
      expect(watchesForTurns(50, 12)).equal(4);
      expect(suggestedWatches(advanceTurns(delve(), 50), 6)).equal(2);
      expect(suggestedWatches(advanceTurns(delve(), 5), 6)).equal(0);
    });

    it("Bills only the Turns since the calendar last moved", () => {
      const synced = { ...advanceTurns(delve(), 74), turnAtLastSync: 50 };
      expect(suggestedWatches(synced, 6)).equal(1);
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
