/**
 * @file Keeps a character to one suit of armour and one shield at a time.
 *
 * A character may wear one armour and carry one shield. Rather than refusing
 * the second equip and leaving the player to work out what to take off,
 * equipping unequips whatever occupied the slot -- which is how gear actually
 * gets swapped at the table.
 */

const isShield = (item: { system?: { type?: string } }) => item.system?.type === "shield";

/**
 * Register the hook. Body armour and shields occupy separate slots, so one of
 * each may be equipped at once.
 */
export default function registerArmourEquipHooks() {
  Hooks.on("updateItem", async (item: any, changes: any, _options: unknown, userId: string) => {
    // Only the user who made the change should issue the follow-up updates,
    // or every connected client would race to do the same work.
    if (userId !== game.user?.id) return;
    if (item.type !== "armor" || changes?.system?.equipped !== true) return;

    const actor = item.parent;
    if (!actor) return;

    const displaced = actor.items.filter(
      (other: any) =>
        other.id !== item.id &&
        other.type === "armor" &&
        other.system.equipped &&
        isShield(other) === isShield(item),
    );
    if (displaced.length === 0) return;

    await actor.updateEmbeddedDocuments(
      "Item",
      displaced.map((other: any) => ({ _id: other.id, "system.equipped": false })),
    );
  });
}
