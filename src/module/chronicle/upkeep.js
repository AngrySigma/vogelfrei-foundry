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
