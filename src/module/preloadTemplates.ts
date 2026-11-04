/**
 * @file A file that manages preloading our system templates
 */
import VF from "./config";

const preloadHandlebarsTemplates = async () => {
  const templatePaths = [
    // Character Sheets
    `${VF.systemPath()}/templates/actors/character-sheet.html`,
    `${VF.systemPath()}/templates/actors/monster-sheet.html`,
    `${VF.systemPath()}/templates/actors/vehicle-sheet.html`,
    // Character Sheets Partials
    `${VF.systemPath()}/templates/actors/partials/character-header.html`,
    `${VF.systemPath()}/templates/actors/partials/character-attributes-tab.html`,
    `${VF.systemPath()}/templates/actors/partials/character-encumbrance.html`,
    `${VF.systemPath()}/templates/actors/partials/character-abilities-tab.html`,
    `${VF.systemPath()}/templates/actors/partials/character-spells-tab.html`,
    `${VF.systemPath()}/templates/actors/partials/character-inventory-tab.html`,
    `${VF.systemPath()}/templates/actors/partials/actor-item-summary.html`,
    `${VF.systemPath()}/templates/actors/partials/character-notes-tab.html`,
    `${VF.systemPath()}/templates/actors/partials/monster-header.html`,
    `${VF.systemPath()}/templates/actors/partials/monster-attributes-tab.html`,
    // Mobile Character Sheet
    `${VF.systemPath()}/templates/mobile/character-stats.html`,
    // Item Display
    `${VF.systemPath()}/templates/actors/partials/item-auto-tags-partial.html`,
    `${VF.systemPath()}/templates/apps/pending-rolls.html`,
    // Combat Tab
    `${VF.systemPath()}/templates/sidebar/combat-tracker-combatant.hbs`,
    `${VF.systemPath()}/templates/apps/combat-set-groups.hbs`,
    // Chronicle
    `${VF.systemPath()}/templates/apps/chronicle.hbs`,
    `${VF.systemPath()}/templates/apps/delve.hbs`,
    // Party
    `${VF.systemPath()}/templates/apps/party.hbs`,
    `${VF.systemPath()}/templates/apps/formation.hbs`,
  ];
  return foundry.applications.handlebars.loadTemplates(templatePaths);
};

export default preloadHandlebarsTemplates;
