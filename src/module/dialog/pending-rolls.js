/**
 * @file Referee view of outstanding character-generation arrays.
 *
 * An array a player has rolled but not accepted follows them until they do, so
 * closing the generator cannot buy a fresh one. That is the point, but it needs
 * an override: a Referee who agrees to a rewrite has to be able to release one.
 */
import OseCharacterCreator, { scoreModifier } from "./character-creation";
import OSE from "../config";

const ABILITIES = ["strength", "intelligence", "willpower", "agility", "toughness", "leadership"];

export default class OsePendingRolls extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(FormApplication.defaultOptions, {
      classes: ["ose", "dialog", "pending-rolls"],
      id: "vf-pending-rolls",
      title: game.i18n.localize("VF.dialog.pendingRolls"),
      template: `${OSE.systemPath()}/templates/apps/pending-rolls.html`,
      width: 420,
      height: "auto",
    });
  }

  getData() {
    const rows = game.users
      .map((user) => ({ user, pending: user.getFlag(game.system.id, OseCharacterCreator.FLAG) }))
      .filter(({ pending }) => pending?.scores && Object.keys(pending.scores).length > 0)
      .map(({ user, pending }) => {
        const scores = ABILITIES.map((key) => ({
          key,
          short: game.i18n.localize(`VF.scores.${key}.short`),
          value: pending.scores[key],
          mod: scoreModifier(pending.scores[key]),
        }));
        return {
          userId: user.id,
          name: user.name,
          colour: user.color?.css ?? user.color,
          scores,
          modifierSum: scores.reduce((total, { mod }) => total + mod, 0),
          swapUsed: Boolean(pending.swapUsed),
        };
      });
    return { rows, any: rows.length > 0 };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='release']").click(async (ev) => {
      ev.preventDefault();
      const { userId } = ev.currentTarget.dataset;
      const user = game.users.get(userId);
      if (!user) return;
      await user.unsetFlag(game.system.id, OseCharacterCreator.FLAG);
      ui.notifications?.info(game.i18n.format("VF.dialog.releasedFor", { name: user.name }));
      this.render();
    });

    html.find("[data-action='release-all']").click(async (ev) => {
      ev.preventDefault();
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("VF.dialog.releaseAll") },
        content: `<p>${game.i18n.localize("VF.dialog.confirmReleaseAll")}</p>`,
        rejectClose: false,
      });
      if (!confirmed) return;
      for (const user of game.users) {
        // eslint-disable-next-line no-await-in-loop
        await user.unsetFlag(game.system.id, OseCharacterCreator.FLAG);
      }
      this.render();
    });
  }

  // The list is read-only apart from the release buttons.
  // eslint-disable-next-line no-underscore-dangle, class-methods-use-this
  async _updateObject() {}
}
