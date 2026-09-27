/**
 * @file Coin Items become coin counts.
 *
 * Money used to be kept as Items -- "Gold Pieces" with a quantity -- and a
 * character's purse is now three numbers (see ../purse.ts). Anything that
 * still arrives as a coin Item, whether an old character in an existing world
 * or a stack dragged in from an old compendium, is counted into the purse and
 * never becomes an Item.
 */
import { denominationOf, foldCoinItems } from "../purse";

/**
 * Count an actor's coin Items into its purse, then delete them.
 *
 * @param {Actor} actor - A character.
 * @returns {Promise<boolean>} Whether anything was moved.
 */
export async function moveCoinItemsIntoPurse(actor) {
  if (actor?.type !== "character") return false;

  const { coins, ids } = foldCoinItems([...actor.items], actor.system.coins);
  if (ids.length === 0) return false;

  await actor.update({ "system.coins": coins });
  await actor.deleteEmbeddedDocuments("Item", ids);
  return true;
}

/**
 * Move every world character's coin Items into its purse. Safe to run on every
 * load: once the Items are gone there is nothing left to move.
 *
 * @returns {Promise<void>}
 */
export async function migrateCoinItems() {
  if (!game.user.isGM) return;

  let moved = 0;
  for (const actor of game.actors) {
    if (await moveCoinItemsIntoPurse(actor)) moved += 1;
  }
  if (moved) ui.notifications?.info(game.i18n.format("VF.purse.migrated", { count: moved }));
}

/**
 * Stop coin Items being created on a character, and put their coins in its
 * purse instead. Covers a drop from a compendium, the sidebar, or another
 * actor alike.
 */
export function registerCoinItemHook() {
  Hooks.on("preCreateItem", (item, _data, _options, userId) => {
    const actor = item.parent;
    if (actor?.type !== "character" || userId !== game.user.id) return true;
    if (!denominationOf(item)) return true;

    const { coins } = foldCoinItems([item], actor.system.coins);
    actor.update({ "system.coins": coins });
    return false;
  });
}
