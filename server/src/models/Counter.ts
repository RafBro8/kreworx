import { model, Schema, type Types } from "mongoose";

const counterSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  key: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

counterSchema.index({ companyId: 1, key: 1 }, { unique: true });

export const Counter = model("Counter", counterSchema);

/** Each kind of document counts on its own, the way a paper book would. */
export type CounterKey = "job" | "quote" | "invoice";

/**
 * The next number of its kind for a company. A single atomic $inc, so two
 * dispatchers writing a quote at the same moment are never handed the same one.
 */
export async function nextNumber(companyId: Types.ObjectId, key: CounterKey): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { companyId, key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return counter!.seq;
}
