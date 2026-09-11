/**
 * @file Rolling a random encounter check, in secret.
 *
 * Both clocks check the same way and differ only in what they call the
 * interval, so the roll lives here rather than twice over.
 *
 * The result is whispered to the Referee. The book has it this way for the
 * neighbouring rolls -- listening at doors and searching are "rolled by the
 * Referee in secret" (docs/Adventuring/Dungeon Exploration.md) -- and a check
 * the players can see is a check they can count.
 */
import { DUNGEON_DISTANCE } from "./chronicle";

/**
 * How far apart the party and whatever it just met begin.
 *
 * The formula is in feet and differs by where they are: a corridor is not a
 * plain. Nothing about the party changes it -- walking without a light does
 * not keep anything at arm's length.
 *
 * @param {string} formula - A dice expression in feet.
 * @returns {Promise<string>} A sentence about the distance, ready for the message.
 */
async function rollDistance(formula) {
  const expression = Roll.validate(formula) ? formula : DUNGEON_DISTANCE;
  const roll = await new Roll(expression).evaluate();
  return game.i18n.format("VF.chronicle.Distance", {
    distance: Math.max(0, Math.round(roll.total)),
    formula: expression,
  });
}

/**
 * Make one check and whisper what it turned up.
 *
 * @param {object} options - What is being checked.
 * @param {string} options.speaker - Who the message is from: the delve, or the terrain.
 * @param {string} options.where - A phrase for the flavour line: "Turn 12", "Day 3, Dusk".
 * @param {number} options.chanceIn6 - The encounter happens on this or less, on a d6.
 * @param {string} [options.distance] - The distance formula, in feet, for where they are.
 * @returns {Promise<boolean>} Whether something was met.
 */
export async function rollEncounterCheck({ speaker, where, chanceIn6, distance = DUNGEON_DISTANCE }) {
  const chance = Math.max(0, Math.min(6, Math.trunc(chanceIn6)));
  const roll = await new Roll("1d6").evaluate();
  const met = roll.total <= chance;

  const lines = [
    `<p class="vf-encounter ${met ? "met" : "clear"}">${game.i18n.localize(
      met ? "VF.chronicle.EncounterMet" : "VF.chronicle.EncounterClear",
    )}</p>`,
  ];
  // Only roll the distance when there is something to be distant from.
  if (met) lines.push(`<p class="vf-distance">${await rollDistance(distance)}</p>`);

  await ChatMessage.create({
    speaker: { alias: speaker },
    flavor: game.i18n.format("VF.chronicle.EncounterFlavor", { where, chance }),
    content: lines.join(""),
    rolls: [roll],
    whisper: ChatMessage.getWhisperRecipients("GM"),
  });

  return met;
}

/**
 * Make several checks in a row, for a move that crossed more than one.
 *
 * @param {number} count - How many checks fell due.
 * @param {object} options - As for rollEncounterCheck.
 * @returns {Promise<void>} Once every check has been rolled.
 */
export async function rollEncounterChecks(count, options) {
  for (let index = 0; index < count; index += 1) {
    // Deliberately in sequence: the messages should read in the order the
    // checks happened, not in whatever order the promises settle.
    // eslint-disable-next-line no-await-in-loop
    await rollEncounterCheck(options);
  }
}
