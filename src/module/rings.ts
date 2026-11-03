import VF from "./config";

/**
 * Adds custom dynamic token ring option.
 * @param {foundry.canvas.tokens.TokenRingConfig} config - The TokenRingConfig to modify
 */
export function initializeTokenRing(config: foundry.canvas.tokens.TokenRingConfig) {
  config.addConfig(
    "vf-default-black-white",
    new foundry.canvas.placeables.tokens.DynamicRingData({
      label: "VF.rings.BlackWhite",
      spritesheet: `${VF.assetsPath}/rings/black-white.json`,
    }),
  );
}

/**
 * Prompts the user to select the default Vogelfrei dynamic token ring.
 * Will do nothing if the user has previously been prompted.
 */
export async function promptTokenRingSelection() {
  const selectedRing = game.settings.get("core", "dynamicTokenRing");
  if (selectedRing === "ose-default-black-white") {
    await game.settings.set("core", "dynamicTokenRing", "vf-default-black-white");
  }

  const hasPrompted = game.settings.get(game.system.id, "hasPromptedDefaultTokenRing");
  if (hasPrompted) return;

  if (
    await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("VF.dialog.TokenRingPrompt.Title"),
      },
      content: game.i18n.localize("VF.dialog.TokenRingPrompt.Content"),
    })
  ) {
    await game.settings.set("core", "dynamicTokenRing", "vf-default-black-white");
  }
  await game.settings.set(game.system.id, "hasPromptedDefaultTokenRing", true);
}
