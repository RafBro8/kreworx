import express, { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import { ApiError } from "../lib/ApiError";
import { authOf, requireAuth } from "../middleware/auth";
import { Job, Photo } from "../models";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_JOB, PHOTO_TYPES } from "../models/Photo";
import { notifyCompany, notifyJob } from "../realtime/io";
import { findVisibleJob } from "../services/scheduling";

const router = Router();

router.use(["/jobs", "/photos"], requireAuth);

/**
 * A declared content type is just a claim, and the claim is what decides how a
 * browser will later treat these bytes. Checking the file's own signature
 * means an upload cannot be labelled as an image and served back as something
 * a browser would run.
 */
function sniff(bytes: Buffer): (typeof PHOTO_TYPES)[number] | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

const uploadQuery = z.object({
  caption: z.string().trim().max(140).optional(),
  // Query strings carry text, so the flag arrives as one.
  share: z.enum(["true", "false"]).optional(),
});

/**
 * Adding a photo to a job.
 *
 * The body is the image itself rather than a multipart form: there is exactly
 * one file, the browser has already shrunk it, and taking it raw means no
 * upload-parsing dependency and no temporary files on disk. The caption rides
 * along in the query string.
 */
router.post(
  "/jobs/:id/photos",
  express.raw({ type: [...PHOTO_TYPES], limit: MAX_PHOTO_BYTES }),
  async (req, res) => {
    const auth = authOf(req);
    const job = await findVisibleJob(auth, req.params.id as string);

    const parsed = uploadQuery.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest("That caption is too long");

    const bytes = req.body as unknown;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw ApiError.badRequest("Send the photo as the body of the request");
    if (bytes.length > MAX_PHOTO_BYTES) throw ApiError.badRequest("That photo is too large");

    const contentType = sniff(bytes);
    if (!contentType) throw ApiError.badRequest("That file is not a JPEG, PNG or WebP image");

    const already = await Photo.countDocuments({ jobId: job._id });
    if (already >= MAX_PHOTOS_PER_JOB) {
      throw ApiError.conflict(`A job holds up to ${MAX_PHOTOS_PER_JOB} photos`);
    }

    const photo = await Photo.create({
      companyId: auth.companyId,
      jobId: job._id,
      data: bytes,
      contentType,
      bytes: bytes.length,
      caption: parsed.data.caption || undefined,
      takenById: auth.userId,
      sharedWithCustomer: parsed.data.share !== "false",
    });

    const jobId = job._id.toString();
    notifyCompany(auth.companyId.toString(), { jobId, dates: [], reason: "photo" });
    if (photo.sharedWithCustomer) notifyJob(jobId, { status: job.status });

    res.status(201).json(describe(photo));
  },
);

/** The photos on a job, oldest first - the order they were taken in. */
router.get("/jobs/:id/photos", async (req, res) => {
  const auth = authOf(req);
  const job = await findVisibleJob(auth, req.params.id as string);

  // Never `data`: a list of photos is a list of captions and ids, and pulling
  // the bytes here would send every image on every refresh of the panel.
  const photos = await Photo.find({ jobId: job._id }, { data: 0 }).sort({ createdAt: 1 }).lean();
  res.json(photos.map(describe));
});

/** The bytes themselves, for an <img> on a staff screen. */
router.get("/photos/:id", async (req, res) => {
  const auth = authOf(req);
  const photo = await findPhoto(req.params.id as string);

  // Scoped by company first, then by whether this person can see the job -
  // the same rule the board uses, so a technician cannot read another crew's
  // photos by holding an id.
  if (!photo.companyId.equals(auth.companyId)) throw ApiError.notFound("Photo not found");
  await findVisibleJob(auth, photo.jobId.toString());

  sendImage(res, photo);
});

router.delete("/photos/:id", async (req, res) => {
  const auth = authOf(req);
  const photo = await findPhoto(req.params.id as string);
  if (!photo.companyId.equals(auth.companyId)) throw ApiError.notFound("Photo not found");

  const job = await findVisibleJob(auth, photo.jobId.toString());

  // The office tidies up; a technician can take back their own photo but not
  // somebody else's.
  const office = auth.role === "owner" || auth.role === "dispatcher";
  const theirs = photo.takenById?.equals(auth.userId) ?? false;
  if (!office && !theirs) throw ApiError.forbidden("Only the person who took a photo can remove it");

  await Photo.deleteOne({ _id: photo._id });
  notifyCompany(auth.companyId.toString(), { jobId: job._id.toString(), dates: [], reason: "photo" });
  res.status(204).end();
});

// ---- shared with the portal route -----------------------------------------

export type PhotoSummary = {
  id: string;
  caption: string | null;
  contentType: string;
  bytes: number;
  sharedWithCustomer: boolean;
  takenAt: Date;
};

/** What a photo looks like in JSON: everything except the photo. */
export function describe(photo: {
  _id: unknown;
  caption?: string | null;
  contentType: string;
  bytes: number;
  sharedWithCustomer?: boolean | null;
  createdAt?: Date;
}): PhotoSummary {
  return {
    id: String(photo._id),
    caption: photo.caption ?? null,
    contentType: photo.contentType,
    bytes: photo.bytes,
    sharedWithCustomer: photo.sharedWithCustomer !== false,
    takenAt: photo.createdAt ?? new Date(),
  };
}

/**
 * Photos never change once taken, so they can sit in the browser's cache.
 * "private" keeps them out of any cache in between, which matters because the
 * customer's copy is reached with a link rather than a login.
 */
export function sendImage(res: express.Response, photo: { data: unknown; contentType: string }): void {
  const bytes = toBuffer(photo.data);
  res.set({
    "Content-Type": photo.contentType,
    "Cache-Control": "private, max-age=3600, immutable",
    "X-Robots-Tag": "noindex",
    "Content-Length": String(bytes.length),
  });
  res.end(bytes);
}

/**
 * Mongoose hands a stored Buffer back as a BSON Binary once the document has
 * been through .lean(), so the bytes have to be unwrapped before they can be
 * written to a response.
 */
function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  const wrapped = (value as { buffer?: unknown } | null)?.buffer;
  if (wrapped instanceof Uint8Array) return Buffer.from(wrapped);
  throw new Error("Stored photo is not readable as bytes");
}

export async function findPhoto(id: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound("Photo not found");
  const photo = await Photo.findById(id).lean();
  if (!photo) throw ApiError.notFound("Photo not found");
  return photo;
}

export default router;
