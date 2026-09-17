import { model, Schema, type InferSchemaType } from "mongoose";

const customerSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["residential", "commercial"], required: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
  },
  { timestamps: true },
);

customerSchema.index({ companyId: 1, name: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema>;
export const Customer = model("Customer", customerSchema);
