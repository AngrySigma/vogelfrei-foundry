/**
 * @file Tests for Vogelfrei money, counted in brass pieces.
 *
 * Rules: 1 gp = 50 sp = 600 bp, therefore 1 sp = 12 bp.
 */
import type { QuenchMethods } from "../../e2e";
import { BP_PER_GP, BP_PER_SP, formatMoney, parseMoney, parseMoneyPair, splitCoins } from "../money";

export const key = "vogelfrei.money";
export const options = { displayName: "Vogelfrei: Money" };

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("The coinage", () => {
    it("Puts twelve brass in a silver", () => {
      expect(BP_PER_SP).equal(12);
    });

    it("Puts fifty silver in a gold", () => {
      expect(BP_PER_GP).equal(600);
      expect(BP_PER_GP / BP_PER_SP).equal(50);
    });
  });

  describe("Reading a price", () => {
    it("Reads each denomination", () => {
      expect(parseMoney("5bp").bp).equal(5);
      expect(parseMoney("15sp").bp).equal(180);
      expect(parseMoney("2gp").bp).equal(1200);
    });

    it("Allows a space before the unit, as some tables have", () => {
      expect(parseMoney("1000 sp").bp).equal(12000);
    });

    it("Reads a dash as not sold here", () => {
      for (const dash of ["-", " - ", "—", ""]) expect(parseMoney(dash).bp).equal(null);
    });

    it("Keeps the 'or more' marker", () => {
      expect(parseMoney("5sp+")).deep.equal({ bp: 60, minimum: true });
      expect(parseMoney("5sp").minimum).equal(false);
    });

    it("Refuses a denomination the game does not have", () => {
      // A typo in the rules should be loud, not guessed at.
      expect(() => parseMoney("5zz")).to.throw();
    });

    it("Splits a cell holding both prices", () => {
      expect(parseMoneyPair("1sp / 5bp")).deep.equal([
        { bp: 12, minimum: false },
        { bp: 5, minimum: false },
      ]);
      expect(parseMoneyPair("2gp+ / -")).deep.equal([
        { bp: 1200, minimum: true },
        { bp: null, minimum: false },
      ]);
    });
  });

  describe("Writing a price", () => {
    it("Uses the largest coins it can", () => {
      expect(formatMoney(24000)).equal("40 gp");
      expect(formatMoney(180)).equal("15 sp");
      expect(formatMoney(5)).equal("5 bp");
    });

    it("Names only the coins the price contains", () => {
      expect(formatMoney(1250)).equal("2 gp 4 sp 2 bp");
      expect(formatMoney(601)).equal("1 gp 1 bp");
      expect(formatMoney(612)).equal("1 gp 1 sp");
    });

    it("Writes nothing as nothing, not as a blank", () => {
      expect(formatMoney(0)).equal("0 bp");
    });

    it("Writes goods that are not sold as a dash", () => {
      expect(formatMoney(null)).equal("—");
    });

    it("Carries the 'or more' marker through", () => {
      expect(formatMoney({ bp: 60, minimum: true })).equal("5 sp+");
    });
  });

  describe("Splitting into coins", () => {
    it("Agrees with the written form", () => {
      expect(splitCoins(1250)).deep.equal({ gp: 2, sp: 4, bp: 2 });
      expect(splitCoins(600)).deep.equal({ gp: 1, sp: 0, bp: 0 });
    });

    it("Loses nothing, at any price", () => {
      for (let bp = 0; bp < 2000; bp += 7) {
        const coins = splitCoins(bp);
        expect(coins.gp * BP_PER_GP + coins.sp * BP_PER_SP + coins.bp).equal(bp);
      }
    });
  });

  describe("The prices in the book", () => {
    // Every one must land on a whole number of brass; that is the whole reason
    // the field is stored in brass rather than in decimal gold.
    const prices = ["10000sp", "5bp", "1gp", "135000sp", "6sp", "2bp", "75sp", "1sp", "180000sp"];

    it("All come to whole brass pieces", () => {
      for (const price of prices) {
        const { bp } = parseMoney(price);
        expect(Number.isInteger(bp)).equal(true);
      }
    });
  });
};
