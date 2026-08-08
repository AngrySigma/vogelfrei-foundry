/**
 * @file Tests for normalising the alignment field onto the three alignments.
 */
import type { QuenchMethods } from "../../../e2e";
import { ALIGNMENTS, DEFAULT_ALIGNMENT, normaliseAlignment } from "../alignment";

export const key = "vogelfrei.actor.alignment";
export const options = { displayName: "Vogelfrei: Actor: Alignment" };

export default ({ describe, it, expect }: QuenchMethods) => {
  describe("ALIGNMENTS", () => {
    it("Carries the three of Character/Alignment.md", () => {
      expect([...ALIGNMENTS]).deep.equal(["order", "neutrality", "chaos"]);
    });

    it("Starts every mortal at Neutrality", () => {
      expect(DEFAULT_ALIGNMENT).equal("neutrality");
    });
  });

  describe("normaliseAlignment(value)", () => {
    it("Leaves a stored alignment alone", () => {
      for (const alignment of ALIGNMENTS) expect(normaliseAlignment(alignment)).equal(alignment);
    });

    it("Ignores case and surrounding space", () => {
      expect(normaliseAlignment("Order")).equal("order");
      expect(normaliseAlignment("  CHAOS ")).equal("chaos");
    });

    it("Falls back to Neutrality when nothing was ever set", () => {
      // Alignment defaulted to "" for every actor made before the dropdown.
      expect(normaliseAlignment("")).equal("neutrality");
      expect(normaliseAlignment("   ")).equal("neutrality");
      expect(normaliseAlignment(undefined)).equal("neutrality");
      expect(normaliseAlignment(null)).equal("neutrality");
    });

    it("Falls back to Neutrality for anything that is not a string", () => {
      expect(normaliseAlignment(7)).equal("neutrality");
      expect(normaliseAlignment({})).equal("neutrality");
    });

    it("Reads the B/X words OSE actors carry", () => {
      expect(normaliseAlignment("Lawful")).equal("order");
      expect(normaliseAlignment("Chaotic")).equal("chaos");
      expect(normaliseAlignment("Neutral")).equal("neutrality");
    });

    it("Sends anything else to Neutrality rather than losing the dropdown", () => {
      expect(normaliseAlignment("Ambivalent")).equal("neutrality");
    });

    it("Is idempotent, so migrating twice does not drift", () => {
      for (const alignment of ALIGNMENTS) {
        expect(normaliseAlignment(normaliseAlignment(alignment))).equal(alignment);
      }
    });
  });
};
