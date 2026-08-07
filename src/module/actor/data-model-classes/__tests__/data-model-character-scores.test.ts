/**
 * @file Tests for the class represening a character's ability scores
 */
import type { QuenchMethods } from "../../../../e2e";
import OseDataModelCharacterScores from "../data-model-character-scores";

export const key = "ose.actor.datamodel.character.scores";
export const options = {
  displayName: "OSE: Actor: Data Model: Character Ability Scores",
};

export default ({ describe, it, expect }: QuenchMethods) => {
  // An array from 0-
  const scoreSpread = Array.from({ length: 21 }, (_el, idx) => idx);
  const scoreKeys = ["strength", "intelligence", "willpower", "agility", "toughness", "leadership"];
  const tables = [
    OseDataModelCharacterScores.standardAttributeMods,
    OseDataModelCharacterScores.cappedAttributeMods,
    OseDataModelCharacterScores.literacyMods,
    OseDataModelCharacterScores.spokenMods,
  ];
  const fromTable = (tableKey: number, score: number) =>
    OseDataModelCharacterScores.valueFromTable(tables[tableKey], score);
  const numberToScores = (number: number) =>
    Object.fromEntries(scoreKeys.map((scoreKey) => [scoreKey, { value: number, bonus: 0 }]));

  const buildTestCases = (score: number, scoreKey: string, mod: string, table: number) => {
    const scoresToUse = numberToScores(score);
    const scoresObj = new OseDataModelCharacterScores(scoresToUse);
    return it(`${score}`, () => {
      expect(scoresObj[scoreKey][mod]).to.equal(fromTable(table, score));
    });
  };
  const buildTestCasesWithModifiers = (score: number, scoreKey: string, mod: string, table: number, added: number) => {
    const scoresToUse = numberToScores(score);
    const scoresObj = new OseDataModelCharacterScores(scoresToUse);
    return it(`${score}`, () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      expect(scoresObj[scoreKey][mod]).to.equal(fromTable(table, score) + added);
    });
  };

  const spreadToModTests = (name: string) =>
    scoreKeys.map((scoreKey) =>
      describe(`${name}: ${scoreKey}`, () => scoreSpread.map((score) => buildTestCases(score, scoreKey, "mod", 0))),
    );

  describe("Standard attribute modifiers", () => spreadToModTests("Attribute"));

  describe("Intelligence modifiers", () => {
    describe("Literacy", () => scoreSpread.map((score) => buildTestCases(score, "intelligence", "literacy", 2)));
    describe("Spoken Languages", () => scoreSpread.map((score) => buildTestCases(score, "intelligence", "spoken", 3)));
  });

  describe("Agility modifiers", () => {
    describe("Initiative", () => scoreSpread.map((score) => buildTestCases(score, "agility", "init", 1)));
  });

  describe("Leadership modifiers", () => {
    describe("NPC Reaction", () => scoreSpread.map((score) => buildTestCases(score, "leadership", "npc", 1)));
    describe("Loyalty", () => scoreSpread.map((score) => buildTestCasesWithModifiers(score, "leadership", "retain", 0, 4)));
    describe("Number of Retainers", () =>
      scoreSpread.map((score) => buildTestCasesWithModifiers(score, "leadership", "loyalty", 0, 7)));
  });
};
