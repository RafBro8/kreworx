import { Schema } from "mongoose";

export const LINE_ITEM_KINDS = ["part", "labour", "fee"] as const;

/**
 * Money is stored as whole cents. A total is a sum of integers, so an invoice
 * can never come out a fraction of a cent off from its own line items.
 */
export const lineItemSchema = new Schema(
  {
    kind: { type: String, enum: LINE_ITEM_KINDS, required: true },
    description: { type: String, required: true, trim: true },
    detail: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPriceCents: {
      type: Number,
      required: true,
      validate: { validator: Number.isInteger, message: "Prices are whole cents" },
    },
    // A waived line still shows what it would have cost, so the customer sees
    // what they are being let off, but it adds nothing to the total.
    waived: { type: Boolean, default: false },
  },
  { _id: false },
);

export type LineItem = {
  kind: (typeof LINE_ITEM_KINDS)[number];
  description: string;
  detail?: string | null;
  quantity: number;
  unitPriceCents: number;
  waived?: boolean | null;
};

export function lineAmountCents(item: LineItem): number {
  return item.waived ? 0 : Math.round(item.quantity * item.unitPriceCents);
}

export function totalCents(items: readonly LineItem[]): number {
  return items.reduce((sum, item) => sum + lineAmountCents(item), 0);
}
