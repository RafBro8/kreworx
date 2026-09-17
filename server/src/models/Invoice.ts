import { model, Schema, type InferSchemaType } from "mongoose";

import { lineItemSchema } from "./lineItems";

const invoiceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    number: { type: Number, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    status: { type: String, enum: ["sent", "paid", "overdue", "void"], required: true },
    lineItems: { type: [lineItemSchema], required: true },
    issuedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

invoiceSchema.index({ companyId: 1, number: 1 }, { unique: true });
invoiceSchema.index({ companyId: 1, issuedAt: 1 });

export type InvoiceDoc = InferSchemaType<typeof invoiceSchema>;
export const Invoice = model("Invoice", invoiceSchema);
