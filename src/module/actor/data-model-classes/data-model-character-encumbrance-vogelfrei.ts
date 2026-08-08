/**
 * @file The Vogelfrei encumbrance scheme: points, not weight.
 *
 * Rules: docs/Adventuring/Time and Movement.md#encumbrance
 *
 * The arithmetic lives in ../encumbrance-points.ts; this class is the shape the
 * rest of the system expects around it. The breakpoints it reports are what
 * OseDataModelCharacterMove turns into movement rates, and they line up exactly
 * with the book's table:
 *
 *   0-1 points  unencumbered   full speed   120' turn / 40' round / 24 miles
 *     2 points  lightly        x 0.75        90' turn / 30' round / 18 miles
 *     3 points  heavily        x 0.5         60' turn / 20' round / 12 miles
 *     4 points  severely       x 0.25        30' turn / 10' round /  6 miles
 *    5+ points  overencumbered nothing        0
 */
import {
  ENCUMBRANCE_LIMIT,
  type EncumbranceBreakdown,
  type EncumbranceItem,
  encumbranceBreakdown,
  encumbranceStateLabel,
} from "../encumbrance-points";
import OseDataModelCharacterEncumbrance, { type CharacterEncumbrance } from "./data-model-character-encumbrance";

export default class OseDataModelCharacterEncumbranceVogelfrei
  extends OseDataModelCharacterEncumbrance
  implements CharacterEncumbrance
{
  /** Points at which movement stops. Doubles as the bar's full width. */
  static baseEncumbranceCap = ENCUMBRANCE_LIMIT;

  /** The machine-readable label for this encumbrance scheme. */
  static type = "vogelfrei";

  /** The human-readable label for this encumbrance scheme. */
  static localizedLabel = "VF.Setting.EncumbranceVogelfrei";

  static templateEncumbranceBar = "";

  static templateInventoryRow = "";

  #breakdown: EncumbranceBreakdown;

  /**
   * @param _max - Ignored. The limit is a rule, not a per-character number.
   * @param items - Everything the character holds, worn armour included.
   */
  constructor(_max = ENCUMBRANCE_LIMIT, items: EncumbranceItem[] = []) {
    super(OseDataModelCharacterEncumbranceVogelfrei.type, ENCUMBRANCE_LIMIT);
    this.#breakdown = encumbranceBreakdown(items);
  }

  static defineSchema() {
    // @ts-expect-error League v13 client/data/fields shadows common (only declares ShaderField)
    const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

    return new SchemaField({
      variant: new StringField({
        initial: OseDataModelCharacterEncumbranceVogelfrei.type,
      }),
      enabled: new BooleanField({ initial: true }),
      encumbered: new BooleanField({ initial: false }),
      pct: new NumberField({ integer: false, initial: 0, min: 0, max: 100 }),
      steps: new ArrayField(new NumberField()),
      value: new NumberField({ integer: false }),
      max: new NumberField({
        integer: false,
        initial: ENCUMBRANCE_LIMIT,
      }),
      atFirstBreakpoint: new BooleanField({ initial: false }),
      atSecondBreakpoint: new BooleanField({ initial: false }),
      atThirdBreakpoint: new BooleanField({ initial: false }),
      itemCount: new NumberField({ integer: true, initial: 0 }),
      itemPoints: new NumberField({ integer: true, initial: 0 }),
      oversizedPoints: new NumberField({ integer: true, initial: 0 }),
      armourPoints: new NumberField({ integer: true, initial: 0 }),
      stateLabel: new StringField({ initial: "VF.encumbrance.unencumbered" }),
    });
  }

  get value(): number {
    return this.#breakdown.points;
  }

  /** Where the points came from, for the sheet's tooltip. */
  get itemCount(): number {
    return this.#breakdown.itemCount;
  }

  get itemPoints(): number {
    return this.#breakdown.itemPoints;
  }

  get oversizedPoints(): number {
    return this.#breakdown.oversizedPoints;
  }

  get armourPoints(): number {
    return this.#breakdown.armourPoints;
  }

  /** Localization key naming the state, e.g. "Lightly Encumbered". */
  get stateLabel(): string {
    return encumbranceStateLabel(this.value);
  }

  /**
   * At the limit you stop; the base class treats `max` as a ceiling you may sit
   * on, but the fifth point is itself the thing that stops you.
   */
  get encumbered(): boolean {
    return this.value >= ENCUMBRANCE_LIMIT;
  }

  /** Bar markers at each point that costs speed: 2, 3 and 4 of 5. */
  // eslint-disable-next-line class-methods-use-this
  get steps(): number[] {
    return [2, 3, 4].map((point) => (point / ENCUMBRANCE_LIMIT) * 100);
  }

  get atFirstBreakpoint(): boolean {
    return this.value >= 2;
  }

  get atSecondBreakpoint(): boolean {
    return this.value >= 3;
  }

  get atThirdBreakpoint(): boolean {
    return this.value >= 4;
  }
}
