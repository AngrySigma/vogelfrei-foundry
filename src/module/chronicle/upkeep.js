/**
 * @file Saying what the party has eaten when a day ends.
 *
 * Physical Deterioration.md wants a meal and water every twenty-four hours,
 * and the saves for going without are the Referee's to call. This only says
 * the day is over and how much to strike off, which is the part everybody
 * forgets -- so it is spoken aloud rather than whispered.
 *
 * A day spent underground eats rations like any other, so the Chronicle and
 * the delve's return to the surface both come through here.
 */

/**
 * Announce the days that just ended.
 *
 * @param {number} days - How many days passed; nothing is said for none.
 * @returns {Promise<void>} Once the message is posted.
 */
export default async function announceUpkeep(days) {
  if (days < 1) return;
  await ChatMessage.create({
    flavor: game.i18n.localize("VF.chronicle.UpkeepFlavor"),
    content: `<p>${game.i18n.format("VF.chronicle.Upkeep", { days })}</p>
      <p class="vf-upkeep-hint">${game.i18n.localize("VF.chronicle.UpkeepHint")}</p>`,
  });
}

/**
 * Announce the months that just turned over.
 *
 * Retainers on long contracts are paid by the month, and rent on rooms and
 * town houses falls due by the month (Retainers/index.md, Lodging.md), so a
 * month boundary is a bill in a way an ordinary day is not. Like the rations
 * message this only says that it happened; who is owed what is the Referee's
 * ledger.
 *
 * @param {number} months - How many boundaries were crossed; nothing is said for none.
 * @param {string} name - What the month just begun is called, already localised.
 * @param {number} year - The year it falls in.
 * @returns {Promise<void>} Once the message is posted.
 */
export async function announceMonth(months, name, year) {
  if (months < 1) return;
  await ChatMessage.create({
    flavor: game.i18n.format("VF.chronicle.MonthFlavor", { month: name, year }),
    content: `<p>${game.i18n.localize("VF.chronicle.MonthUpkeep")}</p>`,
  });
}

/**
 * Announce a feast the party has woken up to.
 *
 * Spoken aloud, because a feast day is a fact about the world the players are
 * standing in: the market is shut, the road is full, somebody is watching.
 *
 * @param {readonly import("./calendar").Feast[]} feasts - Those falling today.
 * @param {string} date - The date, already written out.
 * @returns {Promise<void>} Once the message is posted.
 */
export async function announceFeasts(feasts, date) {
  if (!feasts.length) return;
  await ChatMessage.create({
    flavor: game.i18n.format("VF.chronicle.FeastFlavor", { date }),
    content: `<p>${feasts.map((feast) => foundry.utils.escapeHTML(feast.name)).join("</p><p>")}</p>`,
  });
}
