import { model, Schema, type InferSchemaType } from "mongoose";

/** A van and the people in it — one lane on the dispatch board. */
const crewSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true },
    van: { type: String, required: true, trim: true },
    leadId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    sortOrder: { type: Number, default: 0 },
    // Bumped inside every booking transaction for this crew. Nothing reads it;
    // writing it is what makes two simultaneous bookings for one van conflict.
    scheduleRevision: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type CrewDoc = InferSchemaType<typeof crewSchema>;
export const Crew = model("Crew", crewSchema);
