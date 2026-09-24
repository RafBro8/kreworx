import type { LineItemInput } from "./api";

/**
 * The arithmetic behind a quote or an invoice.
 *
 * Prices are typed in dollars because that is what somebody says out loud, and
 * held as whole cents because that is the only way a total can be trusted. The
 * conversion happens here, once, at the edge - nothing downstream ever sees a
 * fractional cent.
 */

/** "68.50" becomes 6850. Anything that is not a plain amount becomes null. */
export function centsFrom(typed: string): number | null {
  const trimmed = typed.trim().replace(/^\$/, "");
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(trimmed)) return null;
  // Two decimal places at most, so rounding the scaled value is exact.
  return Math.round(Number(trimmed) * 100);
}

/** The other direction, for putting a stored amount back in the box. */
export function dollarsFrom(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** What one line adds to the total: nothing at all when it is waived. */
export function lineTotal(item: LineItemInput): number {
  return item.waived ? 0 : Math.round(item.quantity * item.unitPriceCents);
}

export function totalOf(items: LineItemInput[]): number {
  return items.reduce((total, item) => total + lineTotal(item), 0);
}

export const emptyLine = (): LineItemInput => ({ kind: "part", description: "", quantity: 1, unitPriceCents: 0 });
