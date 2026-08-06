/**
 * @file Contains tests for the Wounds/Stamina damage pipeline
 */
// eslint-disable-next-line prettier/prettier, import/no-cycle
import type { QuenchMethods } from "../../../e2e";
import { applyDamageToPools } from "../damage";

export const key = "vogelfrei.actor.damage";
export const options = {
  displayName: "Vogelfrei: Actor: Damage",
};

/** A character-shaped target: has a Stamina pool. */
const character = (wounds: number, stamina: number, woundsMax = 10, staminaMax = 4) =>
  ({ wounds, woundsMax, stamina, staminaMax });

/** A monster-shaped target: no Stamina at all. */
const monster = (wounds: number, woundsMax = 10) =>
  ({ wounds, woundsMax, stamina: 0, staminaMax: 0 });

export default ({ describe, it, assert }: QuenchMethods) => {
  describe("applyDamageToPools()", () => {
    describe("ordinary damage", () => {
      it("Depletes Stamina before Wounds", () => {
        const r = applyDamageToPools(character(10, 4), 3);
        assert.equal(r.stamina, 1);
        assert.equal(r.wounds, 10);
      });

      it("Exactly empties Stamina without touching Wounds", () => {
        const r = applyDamageToPools(character(10, 4), 4);
        assert.equal(r.stamina, 0);
        assert.equal(r.wounds, 10);
      });

      it("Overflows into Wounds once Stamina is gone", () => {
        const r = applyDamageToPools(character(10, 4), 6);
        assert.equal(r.stamina, 0);
        assert.equal(r.wounds, 8);
      });

      it("Applies wholly to Wounds when Stamina is already empty", () => {
        const r = applyDamageToPools(character(10, 0), 3);
        assert.equal(r.stamina, 0);
        assert.equal(r.wounds, 7);
      });

      it("Drives Wounds below zero rather than flooring at zero", () => {
        // A character at 2 Wounds taking 4 reaches -2, which is the number the
        // critical injury roll (1d4 + Wounds below zero) depends on.
        const r = applyDamageToPools(character(2, 0), 4);
        assert.equal(r.wounds, -2);
      });

      it("Leaves a monster's Wounds to absorb everything", () => {
        const r = applyDamageToPools(monster(10), 5);
        assert.equal(r.wounds, 5);
        assert.equal(r.stamina, 0);
      });
    });

    describe("critical hits", () => {
      it("Bypasses Stamina and lands on Wounds", () => {
        const r = applyDamageToPools(character(10, 4), 3, { critical: true });
        assert.equal(r.wounds, 7);
      });

      it("Still costs an equal amount of Stamina", () => {
        const r = applyDamageToPools(character(10, 4), 3, { critical: true });
        assert.equal(r.stamina, 1);
      });

      it("Cannot drive Stamina below zero", () => {
        // The rulebook's worked case: 1 Stamina, 3 Wounds, critical for 2
        // leaves the target on 1 Wound and 0 Stamina.
        const r = applyDamageToPools(character(3, 1), 2, { critical: true });
        assert.equal(r.wounds, 1);
        assert.equal(r.stamina, 0);
      });

      it("Doubles against a target with no Stamina left", () => {
        const r = applyDamageToPools(character(10, 0), 3, { critical: true });
        assert.equal(r.wounds, 4);
      });

      it("Doubles against a monster", () => {
        const r = applyDamageToPools(monster(10), 3, { critical: true });
        assert.equal(r.wounds, 4);
        assert.equal(r.stamina, 0);
      });
    });

    describe("healing", () => {
      it("Restores Wounds", () => {
        const r = applyDamageToPools(character(4, 0), -3);
        assert.equal(r.wounds, 7);
      });

      it("Never carries Wounds above maximum", () => {
        const r = applyDamageToPools(character(9, 0), -5);
        assert.equal(r.wounds, 10);
      });

      it("Never restores Stamina -- that takes rest, not a Cleric", () => {
        const r = applyDamageToPools(character(4, 1), -3);
        assert.equal(r.stamina, 1);
      });

      it("Lifts a dying character back out of negative Wounds", () => {
        const r = applyDamageToPools(character(-2, 0), -5);
        assert.equal(r.wounds, 3);
      });
    });

    describe("degenerate input", () => {
      it("Zero damage changes nothing", () => {
        const r = applyDamageToPools(character(7, 2), 0);
        assert.equal(r.wounds, 7);
        assert.equal(r.stamina, 2);
      });

      it("Non-numeric damage changes nothing", () => {
        const r = applyDamageToPools(character(7, 2), Number.NaN);
        assert.equal(r.wounds, 7);
        assert.equal(r.stamina, 2);
      });

      it("Clamps Stamina that starts above its maximum", () => {
        const r = applyDamageToPools(character(10, 99), 0);
        assert.equal(r.stamina, 4);
      });
    });
  });
};
