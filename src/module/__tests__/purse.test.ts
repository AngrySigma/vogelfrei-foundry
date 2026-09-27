/**
 * @file Tests for the purse: three coin counts, what they are worth, what they
 *       weigh, and paying out of them.
 */
import type { QuenchMethods } from "../../e2e";
import { COIN_VALUE, coinCount, coinItems, denominationOf, foldCoinItems, pay, purseValue } from "../purse";

export const key = "vogelfrei.purse";
export const options = { displayName: "Vogelfrei: Purse" };

/** A stack of coins, as an Item -- the way money used to be kept. */
const coin = (id: string, name: string, quantity: number) =>
  ({ id, name, type: "item", system: { treasure: true, quantity: { value: quantity } } }) as never;

/** Two gold, four silver and two brass: 1250 bp. */
const purse = () => ({ gp: 2, sp: 4, bp: 2 });

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("Recognising coin Items", () => {
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

    it("Folds coin Items into the purse and names them for deletion", () => {
      const rope = { id: "r", name: "Rope", system: { treasure: false, quantity: { value: 1 } } } as never;
      const { coins, ids } = foldCoinItems([coin("g", "GP", 3), coin("b", "BP", 7), rope], { gp: 1, sp: 2, bp: 0 });
      expect(coins).deep.equal({ gp: 4, sp: 2, bp: 7 });
      expect(ids).deep.equal(["g", "b"]);
    });
  });

  describe("What the purse is worth", () => {
    it("Adds the coins up in brass", () => {
      expect(purseValue(purse())).equal(1250);
      expect(COIN_VALUE.gp).equal(600);
    });

    it("Is empty when there is no money", () => {
      expect(purseValue({})).equal(0);
      expect(purseValue(null)).equal(0);
    });
  });

  describe("What the purse weighs", () => {
    // Time and Movement.md: 100 coins count as one regular item.
    it("Counts every coin alike, whatever it is made of", () => {
      expect(coinCount({ gp: 50, sp: 30, bp: 20 })).equal(100);
      expect(coinItems({ gp: 50, sp: 30, bp: 20 })).equal(1);
    });

    it("Counts an empty purse as nothing", () => {
      expect(coinItems({})).equal(0);
    });

    it("Counts only full hundreds", () => {
      expect(coinItems({ bp: 10 })).equal(0);
      expect(coinItems({ bp: 99 })).equal(0);
      expect(coinItems({ bp: 101 })).equal(1);
      expect(coinItems({ sp: 199 })).equal(1);
      expect(coinItems({ sp: 200 })).equal(2);
    });

    it("Ignores negative and fractional counts", () => {
      expect(coinCount({ gp: -5, sp: 2.7 })).equal(2);
    });
  });

  describe("Paying", () => {
    it("Takes the price out and counts the change back", () => {
      const { paid, after, coins } = pay(purse(), 180);
      expect(paid).equal(true);
      expect(after).equal(1070);
      // 1 gp, 39 sp, 2 bp -- the change is made in the largest coins it goes into.
      expect(coins).deep.equal({ gp: 1, sp: 39, bp: 2 });
    });

    it("Empties the purse when the price is exactly what is in it", () => {
      const { paid, after, coins } = pay(purse(), 1250);
      expect(paid).equal(true);
      expect(after).equal(0);
      expect(coins).deep.equal({ gp: 0, sp: 0, bp: 0 });
    });

    it("Refuses a price the purse cannot cover, and touches nothing", () => {
      const { paid, shortfall, after, coins } = pay(purse(), 1251);
      expect(paid).equal(false);
      expect(shortfall).equal(1);
      expect(after).equal(1250);
      expect(coins).deep.equal(purse());
    });

    it("Never loses or invents a brass piece", () => {
      for (const price of [0, 1, 11, 12, 13, 599, 600, 601, 1249, 1250]) {
        expect(purseValue(pay(purse(), price).coins)).equal(1250 - price);
      }
    });
  });
};
