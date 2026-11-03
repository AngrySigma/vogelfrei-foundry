/**
 * @file Tests for the party's pace and day once some of it rides or drives.
 *
 * Rules: docs/Adventuring/Time and Movement.md#movement and #mounts
 */

import type { QuenchMethods } from "../../../e2e";
import { activeWatches, animalOwnPoints, assess, band, canSit, type Traveller } from "../travel";

export const key = "vogelfrei.party.travel";
export const options = { displayName: "Vogelfrei: Party Travel" };

/** A person on foot with some points, moving as their sheet says. */
const walker = (name: string, points: number | null, perTurn = 120, extra: Partial<Traveller> = {}): Traveller => ({
  uuid: `Actor.${name}`,
  name,
  kind: "walker",
  points,
  perTurn,
  perDay: perTurn / 5,
  ...extra,
});

/** A horse: 240' unladen. */
const horse = (name: string, points = 0, extra: Partial<Traveller> = {}): Traveller => ({
  uuid: `Actor.${name}`,
  name,
  kind: "animal",
  points,
  basePerTurn: 240,
  ...extra,
});

const wagon = (name: string, cargoPoints = 0, axles = 2): Traveller => ({
  uuid: `Actor.${name}`,
  name,
  kind: "drawn",
  cargoPoints,
  axles,
});

const inside = (traveller: Traveller, container: string, seat: Traveller["seat"] = "aboard"): Traveller => ({
  ...traveller,
  in: `Actor.${container}`,
  seat,
});

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("Bands", () => {
    it("Reads the walker's and the animal's tables", () => {
      expect([0, 1, 2, 3, 4, 5, 9].map((points) => band(points, "walker"))).deep.equal([0, 0, 1, 2, 3, 4, 4]);
      expect([10, 11, 15, 16, 20, 25, 26].map((points) => band(points, "animal"))).deep.equal([0, 1, 1, 2, 2, 3, 4]);
    });

    it("Gives four active watches down to none", () => {
      expect([0, 1, 2, 3, 4].map(activeWatches)).deep.equal([4, 3, 2, 1, 0]);
    });

    it("Counts an animal's own load: items by fives, barding, mule and pony", () => {
      expect(animalOwnPoints(9)).equal(1);
      expect(animalOwnPoints(10, 1, "chain")).equal(5);
      expect(animalOwnPoints(10, 0, "none", -5)).equal(0);
      expect(animalOwnPoints(0, 0, "none", 6)).equal(6);
    });
  });

  describe("Walkers", () => {
    it("Moves at the slowest and keeps the most burdened member's day", () => {
      const result = assess([walker("anna", 0), walker("bert", 3, 60), walker("hans", 3, 60)]);
      expect(result.perTurn).deep.equal({ value: 60, names: ["bert", "hans"] });
      expect(result.watches).deep.equal({ value: 4, names: ["bert", "hans"] });
    });

    it("Leaves out members with no points or movement", () => {
      const result = assess([walker("anna", 1), { uuid: "Actor.ghost", name: "ghost", kind: "walker" }]);
      expect(result.watches).deep.equal({ value: 6, names: ["anna"] });
      expect(assess([]).watches).equal(null);
    });
  });

  describe("Riders", () => {
    it("Stops counting a rider's own legs and load", () => {
      const result = assess([walker("anna", 4, 30), horse("bess"), inside(walker("bert", 0), "bess")]);
      expect(result.perTurn).deep.equal({ value: 30, names: ["anna"] });
      const mounted = assess([inside(walker("anna", 4, 30), "bess"), horse("bess")]);
      expect(mounted.perTurn?.names).deep.equal(["bess"]);
    });

    it("Weighs each rider as 5 points plus their load", () => {
      // 3 + 5 + 4 = 12: lightly encumbered, 180'.
      const result = assess([horse("bess", 3), inside(walker("anna", 4), "bess")]);
      expect(result.members.get("Actor.bess")).include({ points: 12, perTurn: 180, perDay: 36, watches: 5 });
    });

    it("Halves a mule", () => {
      const result = assess([horse("moll", 0, { speedFactor: 0.5 })]);
      expect(result.perTurn?.value).equal(120);
    });
  });

  describe("Drawn vehicles", () => {
    it("Splits the load past 10 an axle across the team", () => {
      // Cargo 26 and three passengers at 5 + 0: 41, less 20 for two axles,
      // is 21, or 11 each for two horses: lightly encumbered.
      const result = assess([
        wagon("cart", 26),
        inside(horse("bess"), "cart", "team"),
        inside(horse("jack"), "cart", "team"),
        ...["anna", "bert", "carl"].map((name) => inside(walker(name, 0), "cart")),
      ]);
      expect(result.members.get("Actor.bess")?.points).equal(11);
      expect(result.members.get("Actor.cart")).include({ points: 21, perTurn: 180, watches: 5 });
      expect(result.perTurn).deep.equal({ value: 180, names: ["cart"] });
    });

    it("Takes 5 off each animal for a Teamster, who rides as a passenger", () => {
      // 20 cargo + 5 for the Teamster, less 10: 15 on one horse, less 5 is 10.
      const result = assess([
        wagon("cart", 20, 1),
        inside(horse("bess"), "cart", "team"),
        inside(walker("hans", 0), "cart", "teamster"),
      ]);
      expect(result.members.get("Actor.bess")?.points).equal(10);
      expect(result.watches).deep.equal({ value: 6, names: ["cart"] });
    });

    it("Goes nowhere without a team", () => {
      const result = assess([wagon("cart"), walker("anna", 0)]);
      expect(result.perTurn).deep.equal({ value: 0, names: ["cart"] });
      expect(result.watches).deep.equal({ value: 6, names: ["anna"] });
    });

    it("Counts a team's animals only through the wagon", () => {
      const result = assess([wagon("cart"), inside(horse("bess"), "cart", "team")]);
      expect(result.perTurn?.names).deep.equal(["cart"]);
    });
  });

  describe("Vessels", () => {
    const ship: Traveller = { uuid: "Actor.ship", name: "ship", kind: "vessel", milesPerDay: 60 };

    it("Sails on its own speed, carries anything, and never sets the day", () => {
      const result = assess([ship, inside(wagon("cart"), "ship"), inside(walker("anna", 4, 30), "ship")]);
      expect(result.perDay).deep.equal({ value: 60, names: ["ship"] });
      expect(result.perTurn).equal(null);
      expect(result.watches).equal(null);
    });

    it("Lets a vessel's passengers off when it is struck off", () => {
      const result = assess([inside(walker("anna", 1), "ship")]);
      expect(result.watches).deep.equal({ value: 6, names: ["anna"] });
    });
  });

  describe("Seats", () => {
    it("Puts riders on animals, teams in harness and anyone in a hold", () => {
      expect(canSit("animal", "aboard", "walker")).equal(true);
      expect(canSit("animal", "aboard", "animal")).equal(false);
      expect(canSit("drawn", "team", "animal")).equal(true);
      expect(canSit("drawn", "team", "walker")).equal(false);
      expect(canSit("drawn", "teamster", "walker")).equal(true);
      expect(canSit("vessel", "aboard", "drawn")).equal(true);
      expect(canSit("vessel", "team", "animal")).equal(false);
      expect(canSit("walker", "aboard", "walker")).equal(false);
    });
  });
};
