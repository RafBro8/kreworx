import { model, Schema, type InferSchemaType } from "mongoose";

export const ROLES = ["owner", "dispatcher", "technician"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Staff who sign in. Customers are deliberately not users: they reach their
 * job through a private link and never have a password to forget.
 */
const userSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    title: { type: String, trim: true },
    phone: { type: String, trim: true },
    startedYear: { type: Number },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
