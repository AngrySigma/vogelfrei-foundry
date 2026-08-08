/**
 * @file Normalising the alignment field onto the three Vogelfrei alignments.
 *
 * Character/Alignment.md: "The three alignments are Order, Neutrality, and
 * Chaos." Alignment used to be a free-text box, so actors carry whatever was
 * typed into it -- most often nothing, sometimes a B/X word inherited from OSE.
 * A dropdown cannot show a value that is not one of its options, so anything
 * unrecognised lands on Neutrality, which is where every mortal starts anyway.
 */

/** The stored alignment keys, in the order they appear in the dropdown. */
export const ALIGNMENTS = ["order", "neutrality", "chaos"] as const;

export type Alignment = (typeof ALIGNMENTS)[number];

export const DEFAULT_ALIGNMENT: Alignment = "neutrality";

/**
 * Words that meant Order or Chaos before the dropdown, including B/X's Lawful
 * and Chaotic. Matched on the start of the stored value, case-insensitively.
 */
const LEGACY_PREFIXES: readonly [string, Alignment][] = [
  ["law", "order"],
  ["order", "order"],
  ["orderly", "order"],
  ["chao", "chaos"],
];

/**
 * @param value - Whatever is stored in `details.alignment`.
 * @returns One of the three alignment keys. Never undefined.
 */
export function normaliseAlignment(value: unknown): Alignment {
  if (typeof value !== "string") return DEFAULT_ALIGNMENT;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return DEFAULT_ALIGNMENT;
  if ((ALIGNMENTS as readonly string[]).includes(trimmed)) return trimmed as Alignment;

  const legacy = LEGACY_PREFIXES.find(([prefix]) => trimmed.startsWith(prefix));
  return legacy ? legacy[1] : DEFAULT_ALIGNMENT;
}
