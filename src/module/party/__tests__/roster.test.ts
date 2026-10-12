/**
 * @file Tests for the party roster's bookkeeping.
 */

import type { QuenchMethods } from "../../../e2e";
import {
  cleanShares,
  DEFAULT_SHARES,
  defaultParty,
  membersOf,
  milesPerDay,
  normaliseParty,
  type Party,
  placeMember,
  removeMember,
  setShares,
  slowest,
  type Walker,
} from "../roster";

export const key = "vogelfrei.party.roster";
export const options = { displayName: "Vogelfrei: Party Roster" };

/** Anna and Bert as players, Hans a henchman, the mule-driver a hireling. */
const party = (): Party =>
  ["Actor.anna", "Actor.bert"].reduce(
    (next, uuid) => placeMember(next, uuid, "player"),
    placeMember(placeMember(defaultParty(), "Actor.hans", "henchman"), "Actor.driver", "hireling"),
  );

const uuids = (list: { uuid: string }[]) => list.map((entry) => entry.uuid);

const walker = (name: string, perTurn: number | null, perDay: number | null, role: Walker["role"] = "player") => ({
  name,
  role,
  perTurn,
  perDay,
});

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("Shares", () => {
    it("Defaults to the book's figures for each role", () => {
      expect(DEFAULT_SHARES).deep.equal({ player: 1, henchman: 0.5, hireling: 0.2, npc: 0, vehicle: 0 });
    });

    it("Keeps a share to two decimal places and never below zero", () => {
      expect(cleanShares("0.333")).equal(0.33);
      expect(cleanShares(-1)).equal(0);
      expect(cleanShares("")).equal(0);
      expect(cleanShares("lots")).equal(0);
      expect(cleanShares(2)).equal(2);
    });
  });

  describe("Placing members", () => {
    it("Gives a newcomer its role's default share", () => {
      const roster = party();
      expect(roster.members.find((entry) => entry.uuid === "Actor.hans")?.shares).equal(0.5);
      expect(roster.members.find((entry) => entry.uuid === "Actor.driver")?.shares).equal(0.2);
    });

    it("Lists a role's members in the order they were dropped", () => {
      expect(uuids(membersOf(party(), "player"))).deep.equal(["Actor.anna", "Actor.bert"]);
    });

    it("Puts a member ahead of another of the same role", () => {
      const roster = placeMember(party(), "Actor.carl", "player", "Actor.bert");
      expect(uuids(membersOf(roster, "player"))).deep.equal(["Actor.anna", "Actor.carl", "Actor.bert"]);
    });

    it("Ignores a 'before' that holds a different role", () => {
      const roster = placeMember(party(), "Actor.carl", "player", "Actor.hans");
      expect(uuids(membersOf(roster, "player"))).deep.equal(["Actor.anna", "Actor.bert", "Actor.carl"]);
    });

    it("Moves an Actor already listed instead of listing it twice", () => {
      const roster = placeMember(party(), "Actor.hans", "player");
      expect(roster.members.filter((entry) => entry.uuid === "Actor.hans").length).equal(1);
      expect(membersOf(roster, "henchman").length).equal(0);
    });

    it("Resets the share when the role changes, and keeps it on a reorder", () => {
      const haggled = setShares(party(), "Actor.driver", 0.35);
      const reordered = placeMember(haggled, "Actor.driver", "hireling");
      expect(reordered.members.find((entry) => entry.uuid === "Actor.driver")?.shares).equal(0.35);

      const promoted = placeMember(haggled, "Actor.driver", "henchman");
      expect(promoted.members.find((entry) => entry.uuid === "Actor.driver")?.shares).equal(0.5);
    });

    it("Removes a member and leaves the rest", () => {
      const roster = removeMember(party(), "Actor.anna");
      expect(uuids(roster.members)).not.include("Actor.anna");
      expect(roster.members.length).equal(3);
    });

    it("Does not change the roster it was given", () => {
      const roster = party();
      const before = JSON.stringify(roster);
      placeMember(roster, "Actor.carl", "npc");
      removeMember(roster, "Actor.anna");
      setShares(roster, "Actor.bert", 3);
      expect(JSON.stringify(roster)).equal(before);
    });
  });

  describe("Reading a stored roster", () => {
    it("Opens an empty or missing setting as an empty roster", () => {
      expect(normaliseParty(undefined)).deep.equal(defaultParty());
      expect(normaliseParty({})).deep.equal(defaultParty());
    });

    it("Drops malformed entries and duplicates, first listing wins", () => {
      const roster = normaliseParty({
        version: 1,
        members: [
          { uuid: "Actor.anna", role: "player", shares: 1 },
          { uuid: "Actor.anna", role: "npc", shares: 0 },
          { uuid: "Actor.bert", role: "wizard", shares: 1 },
          { role: "player", shares: 1 },
          null,
          { uuid: "Actor.hans", role: "henchman", shares: "-2" },
        ],
      });
      expect(roster.version).equal(1);
      expect(roster.members).deep.equal([
        { uuid: "Actor.anna", role: "player", shares: 1 },
        { uuid: "Actor.hans", role: "henchman", shares: 0 },
      ]);
    });
  });

  describe("Pace", () => {
    it("Turns movement per Turn into miles per day, with Toughness", () => {
      expect(milesPerDay(120)).equal(24);
      expect(milesPerDay(90, 1)).equal(19);
      expect(milesPerDay(30, -3)).equal(3);
    });

    it("Never gets an overencumbered character moving, nor below a standstill", () => {
      expect(milesPerDay(0, 3)).equal(0);
      expect(milesPerDay(30, -9)).equal(0);
    });

    it("Finds the slowest member and names everyone at that pace", () => {
      const walkers = [walker("Anna", 120, 24), walker("Bert", 90, 18), walker("Hans", 90, 17, "henchman")];
      expect(slowest(walkers, "perTurn")).deep.equal({ value: 90, names: ["Bert", "Hans"] });
      expect(slowest(walkers, "perDay")).deep.equal({ value: 17, names: ["Hans"] });
    });

    it("Leaves vehicles and members without movement out", () => {
      const walkers = [walker("Anna", 120, 24), walker("Wagon", 30, 6, "vehicle"), walker("Ghost", null, null)];
      expect(slowest(walkers, "perTurn")).deep.equal({ value: 120, names: ["Anna"] });
    });

    it("Has no pace for a roster nobody counts in", () => {
      expect(slowest([], "perTurn")).equal(null);
      expect(slowest([walker("Wagon", 30, 6, "vehicle")], "perDay")).equal(null);
    });
  });
};
