/**
 * @file Dividing an XP award by the roster's shares.
 *
 * The answer is read out, never written: the split names what each share is
 * worth and who holds it, and the players put it on their own sheets. So the
 * result is grouped by share -- everyone on one share gets the same line --
 * because uneven shares are the part nobody wants to work out at the table.
 *
 * Shares are kept to two decimal places (roster.ts), so the arithmetic is done
 * in hundredths of a share, in integers: 0.29 of 100 XP is 29, not the 28 a
 * floating-point 28.999... would floor to.
 *
 * Foundry-free, so the arithmetic can be checked on its own.
 */

/** What the split needs to know about each member. */
export type Shareholder = { name: string; shares: number };

/** Everyone holding one share value, and what each of them gets. */
export type ShareLine = { shares: number; each: number; names: string[] };

export type XPSplit = {
  total: number;
  /** The sum of every member's shares. */
  totalShares: number;
  /** XP per whole share, unrounded. 0 when nobody holds a share. */
  perShare: number;
  /** One line per distinct share value, largest first. */
  lines: ShareLine[];
  /** XP lost to rounding each member down. */
  leftover: number;
  /** Members with no share, named so their absence is visibly on purpose. */
  unshared: string[];
};

/** A share in integer hundredths. */
const hundredths = (shares: number): number => Math.max(0, Math.round((Number(shares) || 0) * 100));

/**
 * Divide an award.
 *
 * @param total - The XP to divide. Fractions and negatives are taken as their whole, non-negative part.
 * @param members - Everyone on the roster, with their shares.
 * @returns Each share value's line, what rounding left over, and who got nothing.
 */
export function splitXP(total: number, members: Shareholder[]): XPSplit {
  const award = Math.max(0, Math.floor(Number(total) || 0));
  const totalHundredths = members.reduce((sum, member) => sum + hundredths(member.shares), 0);

  const byShare = new Map<number, string[]>();
  const unshared: string[] = [];
  for (const member of members) {
    const share = hundredths(member.shares);
    if (share === 0) {
      unshared.push(member.name);
      continue;
    }
    byShare.set(share, [...(byShare.get(share) ?? []), member.name]);
  }

  const lines = [...byShare.entries()]
    .sort(([a], [b]) => b - a)
    .map(([share, names]) => ({
      shares: share / 100,
      each: Math.floor((award * share) / totalHundredths),
      names,
    }));

  const paid = lines.reduce((sum, line) => sum + line.each * line.names.length, 0);

  return {
    total: award,
    totalShares: totalHundredths / 100,
    perShare: totalHundredths > 0 ? (award * 100) / totalHundredths : 0,
    lines,
    // With nobody to pay, the whole award is left over.
    leftover: award - paid,
    unshared,
  };
}
