import { model, Schema, type InferSchemaType } from "mongoose";

/** A contracting business — the tenant. Every other document belongs to one. */
const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    trade: { type: String, required: true, trim: true },
    licence: { type: String, trim: true },
    timezone: { type: String, required: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: {
      city: { type: String, trim: true },
      state: { type: String, trim: true },
    },
    isDemo: { type: Boolean, default: false },
    // The local date the demo data was generated for, so it can be refreshed
    // when the day changes instead of going stale.
    demoSeededFor: { type: String },
    // Which version of the demo script built the data, so a change to the
    // script is picked up on the next deploy instead of the next day.
    demoSeedVersion: { type: Number },
  },
  { timestamps: true },
);

export type CompanyDoc = InferSchemaType<typeof companySchema>;
export const Company = model("Company", companySchema);
