/**
 * @file Bring owned weapons and armour up to the playtest rules, once per world.
 *
 * Armour's Proof is converted to a firearm rating on load by the armour data
 * model; this pass does the rest. Every weapon or armour Item that came from
 * this system's compendia -- in the sidebar, on an actor, or on an unlinked
 * token -- takes its damage, armour modifier and ratings from the regenerated
 * pack, following renamed entries. What it cannot refresh it lists for the
 * Referee in one whispered chat message: hand-made weapons on characters still
 * on the old dice, and items whose compendium entry is gone.
 */
import { compendiumOrigin, DROPPED_ENTRIES, RENAMED_ENTRIES } from "./migrate-playtest-rules-core";

const SETTING = "playtestRulesMigrated";

/** The compendia whose entries changed, and the fields each refresh copies. */
const REFRESHED_FIELDS = {
  weapons: ["damage", "armourModifier"],
  armour: ["type", "acMelee", "acRanged", "acFirearm", "encumbrancePoints"],
};

/** Damage written the new way: d8, keep-lower, keep-higher, or d8-3. */
const NEW_DAMAGE = /^(1d8|2d8k[hl]|max\(1d8-3,\s*1\))/;

/** Register the world setting that records the pass has run. Call during init. */
export const registerPlaytestRulesMigration = () => {
  game.settings.register(game.system.id, SETTING, {
    scope: "world",
    type: Boolean,
    default: false,
    config: false,
  });
};

/**
 * Every Item a world holds: the sidebar's, each actor's, and each unlinked
 * token's own copy.
 *
 * @returns {{ item: Item, owner: string }[]} Items with a label for the report.
 */
function everyItem() {
  const found = game.items.map((item) => ({ item, owner: "" }));
  for (const actor of game.actors) {
    for (const item of actor.items) found.push({ item, owner: actor.name });
  }
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.actorLink || !token.actor) continue;
      for (const item of token.actor.items) found.push({ item, owner: `${token.name} (${scene.name})` });
    }
  }
  return found;
}

/**
 * Fetch compendium entries once each.
 *
 * @returns {(pack: string, id: string) => Promise<Item | null>} A cached lookup.
 */
function entryLookup() {
  const cache = new Map();
  return async (pack, id) => {
    const key = `${pack}.${id}`;
    if (!cache.has(key)) {
      const collection = game.packs.get(`${game.system.id}.${pack}`);
      cache.set(key, collection ? await collection.getDocument(id) : null);
    }
    return cache.get(key);
  };
}

/**
 * The update that brings one item in line with its compendium entry.
 *
 * @param {Item} item - The owned or world item.
 * @param {Item} entry - Its compendium entry, as regenerated.
 * @param {string} pack - Which of REFRESHED_FIELDS the entry is in.
 * @param {string} rawId - The id the item was imported from, before renames.
 * @returns {object | null} An update, or null when nothing differs.
 */
function refreshUpdate(item, entry, pack, rawId) {
  const update = {};
  for (const field of REFRESHED_FIELDS[pack]) {
    if (item.system[field] !== entry.system[field]) update[`system.${field}`] = entry.system[field];
  }
  const renamed = RENAMED_ENTRIES[rawId];
  if (renamed) {
    if (item.name === renamed.oldName) update.name = entry.name;
    update["_stats.compendiumSource"] = entry.uuid;
  }
  return Object.keys(update).length ? update : null;
}

/** Run the pass once per world, on the active GM's client. */
export async function migratePlaytestRules() {
  if (!game.users.activeGM?.isSelf) return;
  if (game.settings.get(game.system.id, SETTING)) return;

  const lookup = entryLookup();
  const updates = new Map();
  const refreshed = [];
  const orphaned = [];
  const handMade = [];

  for (const { item, owner } of everyItem()) {
    if (!["weapon", "armor"].includes(item.type)) continue;
    const label = owner ? `${owner}: ${item.name}` : item.name;
    const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
    const origin = compendiumOrigin(source, game.system.id);

    if (!origin || !(origin.pack in REFRESHED_FIELDS)) {
      const onCharacter = item.parent?.type === "character";
      if (item.type === "weapon" && onCharacter && !NEW_DAMAGE.test(item.system.damage ?? "")) {
        handMade.push(`${label} (${item.system.damage || "—"})`);
      }
      continue;
    }

    const rawId = source.split(".").pop();
    const entry = DROPPED_ENTRIES.has(rawId) ? null : await lookup(origin.pack, origin.id);
    if (!entry) {
      orphaned.push(label);
      continue;
    }

    const update = refreshUpdate(item, entry, origin.pack, rawId);
    if (!update) continue;
    const parent = item.parent ?? null;
    if (!updates.has(parent)) updates.set(parent, []);
    updates.get(parent).push({ _id: item.id, ...update });
    refreshed.push(label);
  }

  for (const [parent, changes] of updates) {
    if (parent) await parent.updateEmbeddedDocuments("Item", changes);
    else await Item.updateDocuments(changes);
  }

  await game.settings.set(game.system.id, SETTING, true);
  if (!refreshed.length && !orphaned.length && !handMade.length) return;

  const section = (key, entries) =>
    entries.length
      ? `<p>${game.i18n.format(key, { count: entries.length })}</p><ul>${entries.map((e) => `<li>${foundry.utils.escapeHTML(e)}</li>`).join("")}</ul>`
      : "";
  await ChatMessage.create({
    whisper: ChatMessage.getWhisperRecipients("GM"),
    speaker: { alias: game.system.title },
    content: [
      `<h3>${game.i18n.localize("VF.migration.playtest.title")}</h3>`,
      section("VF.migration.playtest.refreshed", refreshed),
      section("VF.migration.playtest.orphaned", orphaned),
      section("VF.migration.playtest.handMade", handMade),
    ].join(""),
  });
}
