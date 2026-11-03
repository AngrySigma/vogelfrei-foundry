/**
 * @file Wire up system settings.
 */
import type { ApplyDamageOption, EncumbranceOption } from "./config";

/**
 * Perform setting registration.
 */
const registerSettings = () => {
  game.settings.register(game.system.id, "initiative", {
    name: game.i18n.localize("VF.Setting.Initiative"),
    hint: game.i18n.localize("VF.Setting.InitiativeHint"),
    default: "group",
    scope: "world",
    type: String,
    requiresReload: true,
    config: true,
    choices: {
      individual: "VF.Setting.InitiativeIndividual",
      group: "VF.Setting.InitiativeGroup",
    },
  });

  game.settings.register(game.system.id, "rerollInitiative", {
    name: game.i18n.localize("VF.Setting.RerollInitiative"),
    hint: game.i18n.localize("VF.Setting.RerollInitiativeHint"),
    default: "reset",
    scope: "world",
    type: String,
    config: true,
    choices: {
      keep: "VF.Setting.InitiativeKeep",
      reset: "VF.Setting.InitiativeReset",
      reroll: "VF.Setting.InitiativeReroll",
    },
  });

  game.settings.register(game.system.id, "ascendingAC", {
    name: game.i18n.localize("VF.Setting.AscendingAC"),
    hint: game.i18n.localize("VF.Setting.AscendingACHint"),
    default: false,
    scope: "world",
    type: Boolean,
    config: true,
  });

  game.settings.register(game.system.id, "morale", {
    name: game.i18n.localize("VF.Setting.Morale"),
    hint: game.i18n.localize("VF.Setting.MoraleHint"),
    default: false,
    scope: "world",
    type: Boolean,
    config: true,
  });

  game.settings.register(game.system.id, "encumbranceOption", {
    name: game.i18n.localize("VF.Setting.Encumbrance"),
    hint: game.i18n.localize("VF.Setting.EncumbranceHint"),
    default: "vogelfrei",
    scope: "world",
    type: String,
    config: true,
    requiresReload: true,
    choices: Object.values(CONFIG.VF.encumbranceOptions).reduce((obj, enc) => {
      obj[enc.type] = enc.localizedLabel;
      return obj;
    }, {}) as SettingConfig<EncumbranceOption>["choices"],
  });

  // A world stores the value it was created with, so changing the default
  // above does nothing to worlds that already exist -- they stay on whichever
  // legacy weight scheme they were made with, which is not how Vogelfrei counts.
  // Flip those once, then never touch the setting again.
  game.settings.register(game.system.id, "encumbranceSchemeAdopted", {
    scope: "world",
    type: Boolean,
    default: false,
    config: false,
  });

  game.settings.register(game.system.id, "encumbranceItemStrengthMod", {
    name: game.i18n.localize("VF.Setting.EncumbranceItemStrengthMod"),
    hint: game.i18n.localize("VF.Setting.EncumbranceItemStrengthModHint"),
    default: false,
    scope: "world",
    type: Boolean,
    config: true,
  });

  game.settings.register(game.system.id, "significantTreasure", {
    name: game.i18n.localize("VF.Setting.SignificantTreasure"),
    hint: game.i18n.localize("VF.Setting.SignificantTreasureHint"),
    default: 800,
    scope: "world",
    type: Number,
    config: true,
  });

  game.settings.register(game.system.id, "languages", {
    name: game.i18n.localize("VF.Setting.Languages"),
    hint: game.i18n.localize("VF.Setting.LanguagesHint"),
    default: "",
    scope: "world",
    type: String,
    config: true,
  });
  game.settings.register(game.system.id, "applyDamageOption", {
    name: game.i18n.localize("VF.Setting.applyDamageOption"),
    hint: game.i18n.localize("VF.Setting.applyDamageOptionHint"),
    default: "selected",
    scope: "world",
    type: String,
    config: true,
    choices: {
      selected: game.i18n.localize("VF.Setting.damageSelected"),
      targeted: game.i18n.localize("VF.Setting.damageTarget"),
      originalTarget: game.i18n.localize("VF.Setting.damageOriginalTarget"),
    },
  });
  game.settings.register(game.system.id, "invertedCtrlBehavior", {
    name: game.i18n.localize("VF.Setting.InvertedCtrlBehavior"),
    hint: game.i18n.localize("VF.Setting.InvertedCtrlBehaviorHint"),
    default: false,
    scope: "world",
    type: Boolean,
    config: true,
  });
  game.settings.register(game.system.id, "ignoreAttackBonusOnDamageRoll", {
    name: game.i18n.localize("VF.Setting.ignoreAttackBonusOnDamageRoll"),
    hint: game.i18n.localize("VF.Setting.ignoreAttackBonusOnDamageRollHint"),
    default: false,
    scope: "world",
    type: Boolean,
    config: true,
    requiresReload: true,
  });
  game.settings.register(game.system.id, "hasPromptedDefaultTokenRing", {
    default: false,
    scope: "client",
    type: Boolean,
  });
};

declare global {
  namespace ClientSettings {
    interface Values {
      "vogelfrei.initiative": "individual" | "group";
      "vogelfrei.rerollInitiative": "keep" | "reset" | "reroll";
      "vogelfrei.ascendingAC": boolean;
      "vogelfrei.morale": boolean;
      "vogelfrei.encumbranceOption": EncumbranceOption;
      "vogelfrei.encumbranceSchemeAdopted": boolean;
      "vogelfrei.significantTreasure": number;
      "vogelfrei.languages": string;
      "vogelfrei.applyDamageOption": ApplyDamageOption;
      "vogelfrei.ignoreAttackBonusOnDamageRoll": boolean;
      "vogelfrei.hasPromptedDefaultTokenRing": boolean;
    }
  }
}

export default registerSettings;
