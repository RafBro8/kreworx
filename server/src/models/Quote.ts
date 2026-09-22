import { model, Schema, type InferSchemaType } from "mongoose";

import { lineItemSchema } from "./lineItems";

const quoteSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    number: { type: Number, required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    status: { type: String, enum: ["draft", "sent", "approved", "declined"], required: true },
    // "What we found": the diagnosis in plain English, above the prices.
    findings: { type: String, trim: true },
    lineItems: { type: [lineItemSchema], required: true },
    sentAt: { type: Date, default: null },
    respondedAt: { type: Date, default: null },
    // How the answer arrived. The office can always take a yes over the phone,
    // so the board should not claim someone tapped a button when they did not.
    respondedVia: { type: String, enum: ["portal", "office"], default: null },
    validUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

quoteSchema.index({ companyId: 1, number: 1 }, { unique: true });
quoteSchema.index({ companyId: 1, status: 1 });

export type QuoteDoc = InferSchemaType<typeof quoteSchema>;
export const Quote = model("Quote", quoteSchema);
