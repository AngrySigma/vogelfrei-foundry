/**
 * @file The entry point for the Vogelfrei system
 *       We should handle most of our setup here.
 */

import VogelfreiActorSheetCharacter from "./module/actor/character-sheet";
import { migrateCoinItems, registerCoinItemHook } from "./module/actor/coin-items";
import VogelfreiDataModelCharacter from "./module/actor/data-model-character";
import VogelfreiDataModelCharacterEncumbranceVogelfrei from "./module/actor/data-model-classes/data-model-character-encumbrance-vogelfrei";
import VogelfreiDataModelMonster from "./module/actor/data-model-monster";
import VogelfreiDataModelVehicle from "./module/actor/data-model-vehicle";
import registerActorDirectoryButton from "./module/actor/directory-button";
import VogelfreiActor from "./module/actor/entity";
import VogelfreiActorSheetMonster from "./module/actor/monster-sheet";
import { registerStanceHooks } from "./module/actor/stance-store";
import TokenRulerVF from "./module/actor/token-ruler";
import VogelfreiActorSheetVehicle from "./module/actor/vehicle-sheet";
import ChronicleApp from "./module/chronicle/chronicle-app";
import { getChronicle, registerChronicleSetting, syncWorldTime } from "./module/chronicle/store";
import { VFCombat } from "./module/combat/combat";
import VFCombatTracker from "./module/combat/combat-tracker";
import { VFCombatant } from "./module/combat/combatant";
import { VF } from "./module/config";
import registerFVTTModuleAPIs from "./module/fvttModuleAPIs";
import * as chat from "./module/helpers-chat";
import handlebarsHelpers from "./module/helpers-handlebars";
import * as macros from "./module/helpers-macros";
import * as treasure from "./module/helpers-treasure";
import VogelfreiDataModelAbility from "./module/item/data-model-ability";
import VogelfreiDataModelArmor from "./module/item/data-model-armor";
import VogelfreiDataModelContainer from "./module/item/data-model-container";
import VogelfreiDataModelItem from "./module/item/data-model-item";
import VogelfreiDataModelSpell from "./module/item/data-model-spell";
import VogelfreiDataModelWeapon from "./module/item/data-model-weapon";
import VogelfreiItem from "./module/item/entity";
import registerArmourEquipHooks from "./module/item/equip-armour";
import VogelfreiItemSheet from "./module/item/item-sheet";
import { migratePlaytestRules, registerPlaytestRulesMigration } from "./module/migrate-playtest-rules";
import registerPartyDirectoryButton from "./module/party/directory-button";
import PartyApp from "./module/party/party-app";
import { adoptLegacyParty, registerPartyHooks, registerPartySetting } from "./module/party/store";
import templates from "./module/preloadTemplates";
import * as renderList from "./module/renderList";
import { initializeTokenRing, promptTokenRingSelection } from "./module/rings";
import registerSettings from "./module/settings";
import { ensureUploadDir, registerUploadGuard } from "./module/upload-guard";

import "./e2e";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async () => {
  CONFIG.VF = VF;

  // Give modules a chance to add encumbrance schemes
  // They can do so by adding their encumbrance schemes
  // to CONFIG.VF.encumbranceOptions
  Hooks.call("vf-setup-encumbrance");

  if (game.system.id === "vogelfrei-dev") {
    CONFIG.debug = {
      ...CONFIG.debug,
      combat: true,
    };
  }

  // Register custom system settings
  registerSettings();
  registerChronicleSetting();
  registerPartySetting();
  registerUploadGuard();
  registerStanceHooks();
  registerPlaytestRulesMigration();

  CONFIG.Combat.documentClass = VFCombat;
  CONFIG.Combatant.documentClass = VFCombatant;
  const isGroupInitiative = game.settings.get(game.system.id, "initiative") === "group";
  CONFIG.Combat.initiative = {
    decimals: 2,
    formula: isGroupInitiative ? VFCombat.GROUP_FORMULA : VFCombat.FORMULA,
  };

  CONFIG.Combat.fallbackTurnMarker = "icons/svg/circle.svg";
  CONFIG.ui.combat = VFCombatTracker;
  CONFIG.Token.rulerClass = TokenRulerVF;

  game.vf = {
    rollItemMacro: macros.rollItemMacro,
    rollTableMacro: macros.rollTableMacro,
  };
  // Macros created by earlier Vogelfrei releases used the old API name.
  game.ose = game.vf;

  registerPartyHooks();
  registerPartyDirectoryButton();

  // Custom Handlebars helpers
  handlebarsHelpers();

  // Register APIs of Foundry VTT Modules we explicitly support that provide custom hooks
  registerFVTTModuleAPIs();
  registerArmourEquipHooks();
  registerCoinItemHook();
  registerActorDirectoryButton();

  CONFIG.Actor.documentClass = VogelfreiActor;
  CONFIG.Item.documentClass = VogelfreiItem;

  CONFIG.Actor.dataModels = {
    character: VogelfreiDataModelCharacter,
    monster: VogelfreiDataModelMonster,
    vehicle: VogelfreiDataModelVehicle,
  };
  CONFIG.Item.dataModels = {
    weapon: VogelfreiDataModelWeapon,
    armor: VogelfreiDataModelArmor,
    item: VogelfreiDataModelItem,
    spell: VogelfreiDataModelSpell,
    ability: VogelfreiDataModelAbility,
    container: VogelfreiDataModelContainer,
  };

  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet(game.system.id, VogelfreiActorSheetCharacter, {
    types: ["character"],
    makeDefault: true,
    label: "VF.SheetClassCharacter",
  });
  foundry.documents.collections.Actors.registerSheet(game.system.id, VogelfreiActorSheetMonster, {
    types: ["monster"],
    makeDefault: true,
    label: "VF.SheetClassMonster",
  });
  foundry.documents.collections.Actors.registerSheet(game.system.id, VogelfreiActorSheetVehicle, {
    types: ["vehicle"],
    makeDefault: true,
    label: "VF.SheetClassVehicle",
  });

  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet(game.system.id, VogelfreiItemSheet, {
    makeDefault: true,
    label: "VF.SheetClassItem",
  });

  await templates();
});

/**
 * This function runs after game data has been requested and loaded from the servers, so entities exist
 */
Hooks.once("setup", () => {
  // Localize CONFIG objects once up-front
  ["saves_short", "saves_long", "scores", "armor", "colors", "tags"].forEach((o) => {
    CONFIG.VF[o] = Object.entries(CONFIG.VF[o]).reduce((obj, e) => {
      obj[e[0]] = game.i18n.localize(e[1]);
      return obj;
    }, {});
  });

  // Custom languages
  const languages = game.settings.get(game.system.id, "languages");
  if (languages !== "") {
    const langArray = languages.split(",").map((s) => s.trim());
    CONFIG.VF.languages = langArray;
  }
});

Hooks.once("ready", async () => {
  Hooks.on("hotbarDrop", (_bar, data, slot) => {
    if (["Macro", "RollTable", "Item"].includes(data.type)) {
      macros.createVogelfreiMacro(data, slot);
      // Returning false to stop the rest of hotbarDrop handling.
      return false;
    }
    // Any other type of drop can continue to be handled normally.
    return true;
  });

  await adoptVogelfreiEncumbrance();
  await migrateCoinItems();
  await migratePlaytestRules();
  await syncWorldTime(getChronicle());
  await adoptLegacyParty();
  await promptTokenRingSelection();
  await ensureUploadDir();
});

/**
 * Move a world off whichever legacy weight scheme it was created with, once.
 *
 * Settings store the value a world was made with, so raising the registered
 * default leaves existing worlds weighing coins: the new per-item fields show
 * up, but movement keeps coming from weight and nothing the player does to
 * their inventory changes it. Runs once per world and then leaves the setting
 * alone, so a Referee who deliberately picks a weight scheme keeps it.
 */
async function adoptVogelfreiEncumbrance() {
  if (!game.user.isGM) return;
  if (game.settings.get(game.system.id, "encumbranceSchemeAdopted")) return;

  await game.settings.set(game.system.id, "encumbranceSchemeAdopted", true);

  const current = game.settings.get(game.system.id, "encumbranceOption");
  if (current === VogelfreiDataModelCharacterEncumbranceVogelfrei.type) return;

  await game.settings.set(game.system.id, "encumbranceOption", VogelfreiDataModelCharacterEncumbranceVogelfrei.type);
  ui.notifications?.info(game.i18n.localize("VF.messages.EncumbranceAdopted"));
}

/**
 * @param {Application} app
 * @param {HTMLElement} html
 */
Hooks.on("renderSettings", async (_app, html) => {
  const gamesystem = html.querySelector("section.info");
  const template = `${VF.systemPath()}/templates/chat/license.html`;
  const rendered = await foundry.applications.handlebars.renderTemplate(template);
  gamesystem.insertAdjacentHTML("afterend", rendered);
});

Hooks.on("renderChatLog", (_app, html) => VogelfreiItem.chatListeners(html));
Hooks.on("getChatLogEntryContext", chat.addChatMessageContextOptions);
Hooks.on("getChatMessageContextOptions", chat.addChatMessageContextOptions);
Hooks.on("renderChatMessageHTML", chat.addChatMessageButtons);
Hooks.on("renderRollTableSheet", treasure.augmentTable);
/**
 * @param {VFCombatTracker} app - The combat tracker application
 * @param {HTMLElement} html - The HTML element of the combat tracker
 */
Hooks.on("renderCombatTracker", (app, html) => app.renderGroups(html instanceof HTMLElement ? html : html[0]));
/**
 * @param {foundry.documents.CombatantGroup} combatantGroup - The combatant group being updated
 */
Hooks.on("updateCombatantGroup", async (combatantGroup) => {
  await combatantGroup.parent?.onUpdateCombatantGroup();
});
/** @param {VFCombatant} combatant */
Hooks.on("createCombatant", (combatant) => {
  if (game.settings.get(game.system.id, "initiative") !== "group" || !game.user.isGM) {
    return;
  }
  combatant.assignGroup();
});

/**
 * @param {Application} app - The actor sheet application
 * @param {HTMLElement|JQuery} html - Sheet root (v1 hooks may still pass jQuery)
 */
Hooks.on("renderActorSheet", (app, html) => {
  if (!app?.object?.isOwnerOrObserver) return;

  // ContextMenu no longer accepts jQuery roots (deprecated since Foundry v13).
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!(root instanceof HTMLElement)) return;

  new foundry.applications.ux.ContextMenu(
    root,
    ".item",
    [
      {
        name: "VF.Show",
        icon: "<i class='fas fa-eye'></i>",
        callback: (el) => {
          const id = el.dataset?.itemId;
          const item = app.actor?.items?.get(id);
          if (item) {
            item.show();
          }
        },
      },
      {
        name: "VF.items.Equip",
        icon: "<i class='fas fa-hand'></i>",
        condition: (el) => {
          if (app.actor?.type !== "character" || !app.object?.sheet?.isEditable) {
            return false;
          }

          const id = el.dataset?.itemId;
          const item = app.actor?.items?.get(id);
          return ["item", "armor", "weapon", "treasure", "container"].includes(item?.type);
        },
        callback: async (el) => {
          const id = el.dataset?.itemId;
          const item = app.actor?.items?.get(id);
          if (item) {
            await item.update({
              system: {
                equipped: !item.system.equipped,
              },
            });
          }
        },
      },
      {
        name: "VF.Edit",
        icon: "<i class='fas fa-edit'></i>",
        condition: () => !!app.object?.sheet?.isEditable,
        callback: (el) => {
          const id = el.dataset?.itemId;
          const item = app.actor?.items?.get(id);
          if (item) {
            item.sheet.render(true);
          }
        },
      },
      {
        name: "VF.Delete",
        icon: "<i class='fas fa-trash'></i>",
        condition: () => !!app.object?.sheet?.isEditable,
        callback: (el) => {
          const id = el.dataset?.itemId;
          const item = app.actor?.items?.get(id);
          if (item) {
            app._promptRemoveItemFromActor(item);
          }
        },
      },
    ],
    {
      jQuery: false,
    },
  );
});

Hooks.on("renderCompendium", renderList.RenderCompendium);
Hooks.on("activateItemDirectory", renderList.RenderItemDirectory);

/**
 * Put the Chronicle on the token toolbar, for everyone.
 *
 * Players get the window too -- it is the party's clock, and a torch burning
 * down in front of them is the point of keeping one. What their copy leaves
 * out is decided inside the window, not here.
 *
 * @param {Record<string, object>} controls - The scene control configurations.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!controls.tokens) return;
  controls.tokens.tools.chronicle = {
    name: "chronicle",
    title: "VF.chronicle.Open",
    icon: "fa-solid fa-hourglass-half",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => ChronicleApp.show(),
  };
  controls.tokens.tools.party = {
    name: "party",
    title: "VF.party.Title",
    icon: "fa-solid fa-users",
    order: Object.keys(controls.tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => PartyApp.show(),
  };
});
Hooks.once("initializeDynamicTokenRingConfig", initializeTokenRing);
