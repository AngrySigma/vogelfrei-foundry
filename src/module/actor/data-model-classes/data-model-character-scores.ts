/**
 * @file A class representing a Character's ability scores.
 */
/** A raw ability score as supplied, before its modifier is derived. */
type IncomingScore = {
  /** The ability score itself (typically 3–18). */
  value: number;

  /** Flat bonus applied to the score, separate from the derived modifier. */
  bonus: number;
};

type Scores = {
  strength: BaseScore;
  intelligence: BaseScore;
  willpower: BaseScore;
  agility: BaseScore;
  toughness: BaseScore;
  leadership: BaseScore;
};
type OptionalScores = Partial<Scores>;

/** An ability score together with its derived modifier. */
type BaseScore = IncomingScore & {
  /** Derived ability modifier (−3 to +3), looked up from `value`. */
  mod: number;
};

/**
 * A character's six ability scores. Each ability carries its raw value, bonus,
 * and derived modifier; some abilities also expose extra values computed from
 * that score (open-doors chance, literacy/languages, initiative, and the
 * Charisma-driven retainer stats).
 */
export interface CharacterScores {
  /** Strength. */
  strength: BaseScore;

  /** Intelligence, plus derived literacy and spoken-language information. */
  intelligence: BaseScore & {
    /** Localization key describing the character's literacy level. */
    literacy: string;

    /** Localization key describing how many languages the character speaks. */
    spoken: string;
  };

  /** Wisdom. */
  willpower: BaseScore;

  /** Dexterity, plus its contribution to initiative. */
  agility: BaseScore & {
    /** Initiative modifier derived from Dexterity. */
    init: number;
  };

  /** Constitution. */
  toughness: BaseScore;

  /** Charisma, plus its retainer-related values. */
  leadership: BaseScore & {
    /** Loyalty rating of the character's retainers, derived from Charisma. */
    loyalty: number;

    /** Maximum number of retainers the character can employ, derived from Charisma. */
    retain: number;

    /** Modifier to NPC reaction rolls, derived from Charisma. */
    npc: number;
  };
}

/**
 * A class representing a character's ability scores
 */
export default class OseDataModelCharacterScores implements CharacterScores {
  /**
   * Standard modifiers, from -3 to 3.
   *
   * Applied to:
   * - `strength.mod`
   * - `intelligence.mod`
   * - `willpower.mod`
   * - `agility.mod`
   * - `toughness.mod`
   * - `leadership.mod`
   * - `leadership.retain` (with a +4 modifier)
   * - `leadership.loyalty` (with a +7 modifier)
   */
  static standardAttributeMods = {
    0: -3,
    3: -3,
    4: -2,
    6: -1,
    9: 0,
    13: 1,
    16: 2,
    18: 3,
  };

  /**
   * Capped modifiers, from -2 to 2.
   *
   * Applied to:
   * - `agility.init`
   * - `leadership.npc`
   */
  static cappedAttributeMods = {
    0: -2,
    3: -2,
    4: -1,
    6: -1,
    9: 0,
    13: 1,
    16: 1,
    18: 2,
  };

  /**
   * Mapping tables for character literacy.
   * Applied to:
   * - `intelligence.literacy`
   */
  static literacyMods = {
    0: "",
    3: "VF.Illiterate",
    6: "VF.LiteracyBasic",
    9: "VF.Literate",
  };

  /**
   * Mapping tables for character's spoken languages.
   * Applied to:
   * - `intelligence.spoken`
   */
  static spokenMods = {
    0: "VF.NativeBroken",
    3: "VF.Native",
    13: "VF.NativePlus1",
    16: "VF.NativePlus2",
    18: "VF.NativePlus3",
  };

  static valueFromTable<T>(table: Record<number, T> & { 0: T }, val: number): T {
    const clampedVal = Math.max(0, Math.floor(val));

    for (let i = clampedVal; i >= 0; i -= 1) {
      if (Object.hasOwn(table, i)) {
        return table[i] ?? table[0];
      }
    }

    return table[0];
  }

  #strength: IncomingScore = { value: 0, bonus: 0 };

  #intelligence: IncomingScore = { value: 0, bonus: 0 };

  #willpower: IncomingScore = { value: 0, bonus: 0 };

  #agility: IncomingScore = { value: 0, bonus: 0 };

  #toughness: IncomingScore = { value: 0, bonus: 0 };

  #leadership: IncomingScore = { value: 0, bonus: 0 };

  /**
   * The constructor
   *
   * @param {object} scores - An object containing the six primary ability scores.
   * @param {string} scores.strength - The character's strength
   * @param {string} scores.intelligence - The character's intelligence
   * @param {string} scores.willpower - The character's wisdom
   * @param {string} scores.agility - The character's dexterity
   * @param {string} scores.toughness - The character's constitution
   * @param {string} scores.leadership - The character's charisma
   */
  constructor({ strength, intelligence, willpower, agility, toughness, leadership }: OptionalScores = {}) {
    this.#strength = strength ?? { value: 0, bonus: 0 };
    this.#intelligence = intelligence ?? { value: 0, bonus: 0 };
    this.#willpower = willpower ?? { value: 0, bonus: 0 };
    this.#agility = agility ?? { value: 0, bonus: 0 };
    this.#toughness = toughness ?? { value: 0, bonus: 0 };
    this.#leadership = leadership ?? { value: 0, bonus: 0 };
  }

  get strength() {
    return {
      value: this.#strength.value,
      bonus: this.#strength.bonus,
      mod: this.#strMod,
    };
  }

  set strength(change) {
    this.#strength = {
      ...this.#strength,
      ...change,
    };
  }

  get #strMod(): number {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.standardAttributeMods,
      this.#strength.value,
    ) as number;
  }


  get intelligence() {
    return {
      value: this.#intelligence.value,
      bonus: this.#intelligence.bonus,
      mod: this.#intMod,
      literacy: this.#intLiteracyMod,
      spoken: this.#intSpokenLanguagesMod,
    };
  }

  set intelligence(change) {
    this.#intelligence = {
      ...this.#intelligence,
      ...change,
    };
  }

  get #intMod(): number {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.standardAttributeMods,
      this.#intelligence.value,
    ) as number;
  }

  get #intLiteracyMod(): string {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.literacyMods,
      this.#intelligence.value,
    ) as string;
  }

  get #intSpokenLanguagesMod(): string {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.spokenMods,
      this.#intelligence.value,
    ) as string;
  }

  get willpower() {
    return {
      value: this.#willpower.value,
      bonus: this.#willpower.bonus,
      mod: this.#wisMod,
    };
  }

  set willpower(change) {
    this.#willpower = {
      ...this.#willpower,
      ...change,
    };
  }

  get #wisMod(): number {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.standardAttributeMods,
      this.#willpower.value,
    ) as number;
  }

  get agility() {
    return {
      value: this.#agility.value,
      bonus: this.#agility.bonus,
      mod: this.#dexMod,
      init: this.#dexInitMod,
    };
  }

  set agility(change) {
    this.#agility = {
      ...this.#agility,
      ...change,
    };
  }

  get #dexMod(): number {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.standardAttributeMods,
      this.#agility.value,
    ) as number;
  }

  get #dexInitMod(): number {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.cappedAttributeMods,
      this.#agility.value,
    ) as number;
  }

  get toughness() {
    return {
      value: this.#toughness.value,
      bonus: this.#toughness.bonus,
      mod: this.#conMod,
    };
  }

  set toughness(change) {
    this.#toughness = {
      ...this.#toughness,
      ...change,
    };
  }

  get #conMod(): number {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.standardAttributeMods,
      this.#toughness.value,
    ) as number;
  }

  get leadership() {
    return {
      value: this.#leadership.value,
      bonus: this.#leadership.bonus,
      mod: this.#chaMod,
      loyalty: this.#chaLoyaltyMod,
      retain: this.#chaRetainMod,
      npc: this.#chaReactionMod,
    };
  }

  set leadership(change) {
    this.#leadership = {
      ...this.#leadership,
      ...change,
    };
  }

  get #chaMod(): number {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.standardAttributeMods,
      this.#leadership.value,
    ) as number;
  }

  get #chaReactionMod(): number {
    return OseDataModelCharacterScores.valueFromTable(
      OseDataModelCharacterScores.cappedAttributeMods,
      this.#leadership.value,
    ) as number;
  }

  get #chaRetainMod(): number {
    return this.#chaMod + 4;
  }

  get #chaLoyaltyMod(): number {
    return this.#chaMod + 7;
  }
}
