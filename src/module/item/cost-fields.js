/**
 * @file The price fields every physical Item carries.
 *
 * Four Item types (item, weapon, armor, container) all price the same way, and
 * had four copies of one `cost` line between them. They now share this.
 *
 * Prices are whole **brass pieces** — 1 gp = 50 sp = 600 bp. The coinage is not
 * decimal, so a decimal number cannot hold it: a 5 bp candle is 0.008333... gp.
 * See ../money.ts for the arithmetic and the formatter.
 *
 * The book prints two prices for most goods, City and Rural, and a dash where
 * the goods simply are not sold. `cost` is the City price — the default, and
 * the one everything that reads a single price already uses.
 */

/**
 * @returns The price fields, to be spread into a schema.
 */
export default function costFields() {
  const { NumberField, BooleanField } = foundry.data.fields;

  return {
    /** The City price, in brass pieces. */
    cost: new NumberField({ min: 0, initial: 0, integer: true }),

    /**
     * The Rural price, in brass pieces. Null where the book prints a dash:
     * the goods are city trade and no village sells them.
     */
    costRural: new NumberField({ min: 0, initial: null, integer: true, nullable: true }),

    /**
     * Whether the book printed a `+`, as in "5sp+". The price is a floor, and
     * what you actually pay depends on the quality of the thing bought.
     */
    costMinimum: new BooleanField(),
  };
}
