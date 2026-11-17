import VogelfreiMobileCharacterSheet from "./character-sheet";
import registerMobileRollResults from "./roll-results";

let activeSheet: VogelfreiMobileCharacterSheet | undefined;

const resolutionErrors = new Set(["ERROR.RESOLUTION.Screen", "ERROR.RESOLUTION.Scale", "ERROR.RESOLUTION.Window"]);

export const suppressResolutionNotifications = (notifications: typeof ui.notifications) => {
  const error = notifications.error.bind(notifications);
  notifications.error = (message: string | object, options?: { console?: boolean }) => {
    if (!resolutionErrors.has(String(message))) return error(message, options);
    const notification = error(message, { ...options, console: false });
    notifications.remove(notification);
    return notification;
  };
};

export const openMobileCharacterSheet = async (actor: Actor) => {
  await game.settings.set(game.system.id, "mobileMode", true);

  if (!activeSheet || activeSheet.actor.id !== actor.id) {
    activeSheet = new VogelfreiMobileCharacterSheet(actor);
  }

  document.body.classList.add("vf-mobile-mode");
  await actor.sheet?.close();
  return activeSheet.render(true);
};

const registerMobileMode = () => {
  registerMobileRollResults();

  Hooks.once("ready", () => {
    // Notifications do not exist during init. Touching them there aborts
    // system registration, leaving Foundry's generic actor sheets active.
    suppressResolutionNotifications(ui.notifications);
    if (!game.settings.get(game.system.id, "mobileMode")) return;
    const actor = game.user?.character;
    if (actor?.type === "character") void openMobileCharacterSheet(actor);
  });
};

export default registerMobileMode;
