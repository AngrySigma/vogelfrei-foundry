/**
 * @file Tests for the party roster's bookkeeping.
 */

import type { QuenchMethods } from "../../../e2e";
import {
  alight,
  board,
  cleanShares,
  DEFAULT_SHARES,
  defaultParty,
  membershipOf,
  membersOf,
  milesPerDay,
  normaliseParty,
  type Party,
  placeMember,
  removeMember,
  replaceMember,
  setShares,
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
        { uuid: "Actor.anna", role: "player", shares: 1, in: null, seat: "aboard" },
        { uuid: "Actor.hans", role: "henchman", shares: 0, in: null, seat: "aboard" },
      ]);
    });
  });

  describe("Riding in things", () => {
    /** The party, with a wagon and a horse on it. */
    const train = () => placeMember(placeMember(party(), "Actor.wagon", "vehicle"), "Actor.bess", "vehicle");

    it("Boards a member into a container, in a seat", () => {
      const roster = board(train(), "Actor.bess", "Actor.wagon", "team");
      expect(roster.members.find((entry) => entry.uuid === "Actor.bess")).include({ in: "Actor.wagon", seat: "team" });
    });

    it("Refuses anything off the roster, and loops", () => {
      const roster = board(train(), "Actor.anna", "Actor.wagon");
      expect(board(roster, "Actor.wagon", "Actor.anna")).equal(roster);
      expect(board(roster, "Actor.anna", "Actor.anna")).equal(roster);
      expect(board(roster, "Actor.ghost", "Actor.wagon")).equal(roster);
    });

    it("Seats one Teamster, moving the last one aboard", () => {
      let roster = board(train(), "Actor.driver", "Actor.wagon", "teamster");
      roster = board(roster, "Actor.hans", "Actor.wagon", "teamster");
      const seat = (uuid: string) => roster.members.find((entry) => entry.uuid === uuid)?.seat;
      expect(seat("Actor.hans")).equal("teamster");
      expect(seat("Actor.driver")).equal("aboard");
    });

    it("Steps the passengers out when their container leaves the roster", () => {
      const roster = removeMember(board(train(), "Actor.anna", "Actor.wagon"), "Actor.wagon");
      expect(roster.members.find((entry) => entry.uuid === "Actor.anna")?.in).equal(null);
    });

    it("Keeps a member seated through a change of role, and lets them alight", () => {
      const roster = placeMember(board(train(), "Actor.anna", "Actor.bess"), "Actor.anna", "npc");
      expect(roster.members.find((entry) => entry.uuid === "Actor.anna")?.in).equal("Actor.bess");
      expect(alight(roster, "Actor.anna").members.find((entry) => entry.uuid === "Actor.anna")?.in).equal(null);
    });

    it("Puts a new Actor in an old one's place, passengers and all", () => {
      const roster = replaceMember(board(train(), "Actor.anna", "Actor.wagon"), "Actor.wagon", "Actor.cart");
      expect(roster.members.find((entry) => entry.uuid === "Actor.cart")?.role).equal("vehicle");
      expect(roster.members.find((entry) => entry.uuid === "Actor.anna")?.in).equal("Actor.cart");
      expect(replaceMember(roster, "Actor.cart", "Actor.anna")).equal(roster);
    });

    it("Unseats a stored member whose container is gone or loops", () => {
      const roster = normaliseParty({
        members: [
          { uuid: "Actor.anna", role: "player", shares: 1, in: "Actor.gone" },
          { uuid: "Actor.a", role: "vehicle", shares: 0, in: "Actor.b" },
          { uuid: "Actor.b", role: "vehicle", shares: 0, in: "Actor.a" },
        ],
      });
      expect(roster.members.find((entry) => entry.uuid === "Actor.anna")?.in).equal(null);
      expect(roster.members.filter((entry) => entry.in).length).lessThan(2);
    });
  });

  describe("Miles and membership", () => {
    it("Turns movement per Turn into miles per day, with Toughness", () => {
      expect(milesPerDay(120)).equal(24);
      expect(milesPerDay(90, 1)).equal(19);
      expect(milesPerDay(30, -3)).equal(3);
      expect(milesPerDay(0, 3)).equal(0);
      expect(milesPerDay(30, -9)).equal(0);
    });

    it("Sees joins, leaves and role changes in the membership, but not shares or order", () => {
      const before = membershipOf(party());
      expect(membershipOf(setShares(party(), "Actor.anna", 3))).equal(before);
      expect(membershipOf(placeMember(party(), "Actor.bert", "player", "Actor.anna"))).equal(before);
      expect(membershipOf(placeMember(party(), "Actor.hans", "hireling"))).not.equal(before);
      expect(membershipOf(removeMember(party(), "Actor.bert"))).not.equal(before);
      expect(membershipOf(placeMember(party(), "Actor.carl", "player"))).not.equal(before);
    });

    it("Sees someone climb onto a horse or into a wagon", () => {
      const roster = placeMember(party(), "Actor.bess", "vehicle");
      expect(membershipOf(board(roster, "Actor.anna", "Actor.bess"))).not.equal(membershipOf(roster));
    });
  });
};
