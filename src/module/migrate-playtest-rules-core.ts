/**
 * @file The Foundry-free half of the playtest-rules migration: what an old
 *       armour's Proof is worth as a firearm rating, and which compendium
 *       entry an owned item came from.
 *
 * The rulebook replaced Proof with a plain firearm rating per armour, turned
 * every weapon's damage into d8 variants and gave weapons an armour modifier
 * (Armor.md, Melee Weapons.md). Items already on characters carry the old
 * numbers; migrate-playtest-rules.js puts them right.
 */

/**
 * Proof as it was (Armor.md before the playtest rules): none ignored the
 * rating, partial kept half of it rounded down, full kept all of it. Used for
 * armour that did not come from the compendium, so has nothing to refresh from.
 *
 * @param proof - "none", "partial" or "full".
 * @param rating - The armour's ranged rating, which is what Proof applied to.
 * @returns The equivalent firearm rating.
 */
export function proofToFirearmRating(proof: string | undefined, rating: number | undefined): number {
  const value = Math.max(0, Math.trunc(Number(rating) || 0));
  switch (proof) {
    case "full":
      return value;
    case "partial":
      return Math.floor(value / 2);
    default:
      return 0;
  }
}

/**
 * Compendium entries the rulebook renamed. Ids are hashed from pack and name
 * (tools/build-packs/generate.py), so a rename is a new id; an item that came
 * from the old one is refreshed from its successor.
 */
export const RENAMED_ENTRIES: Readonly<Record<string, { id: string; oldName: string }>> = {
  // Wams -> Padded doublet
  me5hnjIfGmCFGkPd: { id: "fdxbjuuYGyWASQ9R", oldName: "Wams" },
  // Full plate -> Full harness
  "0MuMbmjthVEWulhY": { id: "yacfTlk4bjgDbMTC", oldName: "Full plate" },
  // Jewelry -> Jewellery
  omcy6zfmIs4fKbVo: { id: "ve2lMgP61mzpszEd", oldName: "Jewelry" },
};

/**
 * Compendium entries the rulebook dropped. The Pavise is now cover
 * (Combat Actions.md#cover), not a shield.
 */
export const DROPPED_ENTRIES: ReadonlySet<string> = new Set([
  // Pavise
  "tVNwZxrgLcb4WZbJ",
]);

/** Where an item came from in this system's compendia. */
export type CompendiumOrigin = { pack: string; id: string };

const SOURCE = /^Compendium\.([^.]+)\.([^.]+)\.(?:Item\.)?([A-Za-z0-9]{16})$/;

/**
 * The pack and id an item was imported from, if it was one of this system's.
 *
 * @param source - `_stats.compendiumSource`, or the older `flags.core.sourceId`.
 * @param systemId - This system's id; other packages' compendia are ignored.
 * @returns The origin, with renamed entries already followed; null otherwise.
 */
export function compendiumOrigin(source: string | null | undefined, systemId: string): CompendiumOrigin | null {
  const match = SOURCE.exec(source ?? "");
  const [, system, pack, id] = match ?? [];
  if (!system || !pack || !id || system !== systemId) return null;
  return { pack, id: RENAMED_ENTRIES[id]?.id ?? id };
}
