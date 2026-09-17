import { model, Schema, type InferSchemaType } from "mongoose";

const equipmentSchema = new Schema(
  {
    kind: { type: String, required: true, trim: true },
    make: { type: String, trim: true },
    model: { type: String, trim: true },
    installedYear: { type: Number },
  },
  { _id: false },
);

/**
 * Where the work happens. Split from the customer because one customer can
 * own several addresses, and the history that matters — what is installed,
 * what was fixed — belongs to the building, not the person.
 */
const propertySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    zip: { type: String, required: true, trim: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    accessNotes: { type: String, trim: true },
    equipment: [equipmentSchema],
  },
  { timestamps: true },
);

export type PropertyDoc = InferSchemaType<typeof propertySchema>;
export const Property = model("Property", propertySchema);
