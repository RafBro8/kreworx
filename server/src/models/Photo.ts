import { model, Schema, type InferSchemaType } from "mongoose";

/** What the API will take, and what it will hand back. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** A generous ceiling for a photo the browser has already shrunk. */
export const MAX_PHOTO_BYTES = 4_000_000;

/** Enough to document a visit; few enough that one job cannot fill the database. */
export const MAX_PHOTOS_PER_JOB = 12;

/**
 * Photos of the work, stored in MongoDB rather than an object store.
 *
 * A visit's photos are small, few, and always read alongside the job they
 * belong to, so keeping them here buys one backup, one connection string and
 * no third-party account - which matters more for this system than the
 * per-byte cost of a bucket. The 16MB document ceiling is the hard limit on
 * that choice; MAX_PHOTO_BYTES keeps a long way clear of it.
 */
const photoSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    data: { type: Buffer, required: true },
    contentType: { type: String, enum: PHOTO_TYPES, required: true },
    bytes: { type: Number, required: true, min: 1, max: MAX_PHOTO_BYTES },
    caption: { type: String, trim: true, maxlength: 140 },
    takenById: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Not every photo is for the customer: a picture of the meter cupboard is
    // for the office. The portal only ever serves the ones marked to share.
    sharedWithCustomer: { type: Boolean, default: true },
  },
  { timestamps: true },
);

photoSchema.index({ companyId: 1, jobId: 1, createdAt: 1 });

export type PhotoDoc = InferSchemaType<typeof photoSchema>;
export const Photo = model("Photo", photoSchema);
