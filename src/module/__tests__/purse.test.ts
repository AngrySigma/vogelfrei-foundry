/**
 * @file Tests for paying out of a purse spread across three coins.
 */
import type { QuenchMethods } from "../../e2e";
import { COIN_VALUE, denominationOf, pay, purseValue } from "../purse";

export const key = "vogelfrei.purse";
export const options = { displayName: "Vogelfrei: Purse" };

/** A stack of coins, as an Item. */
const coin = (id: string, name: string, quantity: number) =>
  ({ id, name, type: "item", system: { treasure: true, quantity: { value: quantity } } }) as never;

/** Two gold, four silver and two brass: 1250 bp. */
const purse = () => [coin("g", "GP", 2), coin("s", "SP", 4), coin("b", "BP", 2)];

const byId = (updates: { id: string; quantity: number }[]) => [...updates].sort((a, b) => a.id.localeCompare(b.id));

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("Recognising money", () => {
    it("Knows each coin by its short and long name", () => {
      expect(denominationOf(coin("a", "GP", 1))).equal("gp");
      expect(denominationOf(coin("a", "Gold Pieces", 1))).equal("gp");
      expect(denominationOf(coin("a", "silver", 1))).equal("sp");
      expect(denominationOf(coin("a", "Brass Piece", 1))).equal("bp");
    });

    it("Does not mistake goods for money", () => {
      const rope = { id: "r", name: "Rope", system: { treasure: false, quantity: { value: 1 } } };
      expect(denominationOf(rope as never)).equal(null);
    });

    it("Wants the treasure flag, not just the name", () => {
      const fake = { id: "f", name: "GP", system: { treasure: false, quantity: { value: 1 } } };
      expect(denominationOf(fake as never)).equal(null);
    });
  });

  describe("What the purse is worth", () => {
    it("Adds the coins up in brass", () => {
      expect(purseValue(purse())).equal(1250);
      expect(COIN_VALUE.gp).equal(600);
    });

    it("Is empty when there is no money", () => {
      expect(purseValue([])).equal(0);
    });
  });

  describe("Paying", () => {
    it("Takes the price out and counts the change back", () => {
      const { paid, after, updates } = pay(purse(), 180);
      expect(paid).equal(true);
      expect(after).equal(1070);
      // 1 gp, 39 sp, 2 bp -- the change is made in the largest coins it goes into.
      expect(byId(updates)).deep.equal([
        { id: "b", quantity: 2 },
        { id: "g", quantity: 1 },
        { id: "s", quantity: 39 },
      ]);
    });

    it("Empties the purse when the price is exactly what is in it", () => {
      const { paid, after } = pay(purse(), 1250);
      expect(paid).equal(true);
      expect(after).equal(0);
    });

    it("Refuses a price the purse cannot cover, and touches nothing", () => {
      const { paid, shortfall, after, updates } = pay(purse(), 1251);
      expect(paid).equal(false);
      expect(shortfall).equal(1);
      expect(after).equal(1250);
      expect(updates).deep.equal([]);
    });

    it("Keeps the worth in the smallest coin the character actually carries", () => {
      // No silver Item, so no silver change: it stays as brass.
      const { after, updates } = pay([coin("g", "GP", 2), coin("b", "BP", 50)], 100);
      expect(after).equal(1150);
      expect(byId(updates)).deep.equal([
        { id: "b", quantity: 550 },
        { id: "g", quantity: 1 },
      ]);
    });

    it("Never loses or invents a brass piece", () => {
      for (const price of [0, 1, 11, 12, 13, 599, 600, 601, 1249, 1250]) {
        const { updates } = pay(purse(), price);
        const worth = updates.reduce((total, { id, quantity }) => {
          const value = id === "g" ? 600 : id === "s" ? 12 : 1;
          return total + quantity * value;
        }, 0);
        expect(worth).equal(1250 - price);
      }
    });
  });
};
