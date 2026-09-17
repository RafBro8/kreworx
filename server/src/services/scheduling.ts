import mongoose, { type Types } from "mongoose";

import { ApiError } from "../lib/ApiError";
import { clockLabel } from "../lib/dates";
import type { AuthContext } from "../middleware/auth";
import { Company, Crew, Customer, Job } from "../models";
import type { JobStatus } from "../models/Job";

/**
 * The rules for changing a job: where it can move, who can move it, and what
 * status can follow what. Routes stay thin and every rule lives here, so the
 * board, a technician's phone and anything added later all get the same
 * answer.
 */

// ---- status transitions ------------------------------------------------------

/** What each status can become. Anything not listed is refused. */
const NEXT: Record<JobStatus, readonly JobStatus[]> = {
  unscheduled: ["cancelled"],
  scheduled: ["en_route", "cancelled"],
  en_route: ["on_site", "scheduled"],
  on_site: ["awaiting_approval", "parts_on_order", "done"],
  awaiting_approval: ["on_site", "parts_on_order", "done"],
  parts_on_order: ["scheduled", "on_site", "cancelled"],
  done: [],
  cancelled: [],
};

/** Moves a technician makes from the field. Cancelling and rebooking are office decisions. */
const FIELD_STATUSES: readonly JobStatus[] = ["en_route", "on_site", "awaiting_approval", "parts_on_order", "done"];

/** Only work that has not started can be moved on the board. */
const MOVABLE: readonly JobStatus[] = ["unscheduled", "scheduled", "parts_on_order"];

const MAX_JOB_MINUTES = 12 * 60;

export function allowedStatuses(role: AuthContext["role"], current: JobStatus): JobStatus[] {
  const next = NEXT[current];
  return role === "technician" ? next.filter((status) => FIELD_STATUSES.includes(status)) : [...next];
}

export function canReschedule(role: AuthContext["role"], current: JobStatus): boolean {
  return role !== "technician" && MOVABLE.includes(current);
}

// ---- visibility ----------------------------------------------------------------

/**
 * Loads a job the signed-in person is allowed to see. A job in another
 * company, or on another crew for a technician, is reported as not found
 * rather than forbidden: its existence is none of their business.
 */
export async function findVisibleJob(auth: AuthContext, jobId: string) {
  if (!mongoose.isValidObjectId(jobId)) throw ApiError.notFound("Job not found");

  const job = await Job.findOne({ _id: jobId, companyId: auth.companyId }).lean();
  if (!job) throw ApiError.notFound("Job not found");

  if (auth.role === "technician") {
    const onTheirCrew =
      job.crewId &&
      (await Crew.exists({ _id: job.crewId, $or: [{ leadId: auth.userId }, { memberIds: auth.userId }] }));
    if (!onTheirCrew) throw ApiError.notFound("Job not found");
  }

  return job;
}

// ---- scheduling ------------------------------------------------------------------

export type ScheduleRequest = { crewId: string; start: Date; end: Date };

/**
 * Books a job onto a crew for a time, refusing anything that would overlap
 * work that crew already has.
 *
 * The overlap check and the write run in one transaction that also bumps a
 * revision on the crew. Two dispatchers booking the same van at the same
 * moment therefore both write that crew document; MongoDB lets one commit and
 * makes the other retry, and on retry it sees the first booking and is
 * refused. Without that, both could pass the check before either saved.
 */
export async function scheduleJob(
  auth: AuthContext,
  jobId: string,
  request: ScheduleRequest,
  // Test seam: runs after the overlap check and before the save, so a test can
  // hold two bookings at exactly the point where a race would do damage.
  hooks: { beforeSave?: () => Promise<void> } = {},
) {
  if (auth.role === "technician") throw ApiError.forbidden("Only the office can move jobs");
  if (!mongoose.isValidObjectId(request.crewId)) throw ApiError.badRequest("Choose a crew");

  const minutes = (request.end.getTime() - request.start.getTime()) / 60_000;
  if (!(minutes > 0)) throw ApiError.badRequest("A job has to end after it starts");
  if (minutes > MAX_JOB_MINUTES) throw ApiError.badRequest("A single visit cannot run longer than 12 hours");

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const job = await Job.findOne({ _id: jobId, companyId: auth.companyId }).session(session);
      if (!job) throw ApiError.notFound("Job not found");
      if (!canReschedule(auth.role, job.status)) {
        throw ApiError.conflict(`This job is ${job.status.replace("_", " ")} — change its status before moving it`);
      }

      // Taking a write on the crew is what makes concurrent bookings for it conflict.
      const crew = await Crew.findOneAndUpdate(
        { _id: request.crewId, companyId: auth.companyId },
        { $inc: { scheduleRevision: 1 } },
        { session, returnDocument: "after" },
      );
      if (!crew) throw ApiError.badRequest("That crew does not exist");

      const clash = await Job.findOne({
        companyId: auth.companyId,
        crewId: crew._id,
        _id: { $ne: job._id },
        status: { $nin: ["cancelled", "unscheduled"] },
        scheduledStart: { $lt: request.end },
        scheduledEnd: { $gt: request.start },
      })
        .session(session)
        .lean();

      if (clash) {
        const [company, customer] = await Promise.all([
          Company.findById(auth.companyId, { timezone: 1 }).session(session).lean(),
          Customer.findById(clash.customerId, { name: 1 }).session(session).lean(),
        ]);
        const zone = company?.timezone ?? "UTC";
        throw ApiError.conflict(
          `${crew.name} already has #${clash.number} ${clash.title}${customer ? ` for ${customer.name}` : ""} from ${clockLabel(clash.scheduledStart!, zone)} to ${clockLabel(clash.scheduledEnd!, zone)}`,
          { clashingJob: { id: clash._id, number: clash.number } },
        );
      }

      await hooks.beforeSave?.();

      const now = new Date();
      const becomesScheduled = job.status === "unscheduled";
      job.crewId = crew._id;
      job.scheduledStart = request.start;
      job.scheduledEnd = request.end;
      job.estimatedMinutes = minutes;
      if (becomesScheduled) {
        job.status = "scheduled";
        job.schedulingNote = undefined;
        job.timeline.push({ status: "scheduled", at: now });
      }
      await job.save({ session });
    });
  } finally {
    await session.endSession();
  }
}

/** Takes a job off the board and back into the unscheduled queue. */
export async function unscheduleJob(auth: AuthContext, jobId: string) {
  if (auth.role === "technician") throw ApiError.forbidden("Only the office can move jobs");

  const updated = await Job.findOneAndUpdate(
    { _id: jobId, companyId: auth.companyId, status: { $in: ["scheduled", "parts_on_order"] } },
    { $set: { status: "unscheduled", crewId: null, scheduledStart: null, scheduledEnd: null } },
    { returnDocument: "after" },
  );
  if (updated) return;

  const exists = await Job.exists({ _id: jobId, companyId: auth.companyId });
  if (!exists) throw ApiError.notFound("Job not found");
  throw ApiError.conflict("Only a job that has not started can go back to the queue");
}

// ---- status ----------------------------------------------------------------------

/**
 * Moves a job to its next status and records it on the timeline.
 *
 * `expected` is the status the person was looking at when they clicked. The
 * update only applies if the job is still in that state, so a technician
 * marking a job done cannot silently overwrite a dispatcher who cancelled it
 * a second earlier; the loser gets a 409 and a fresh look.
 */
export async function changeStatus(auth: AuthContext, jobId: string, expected: JobStatus, next: JobStatus) {
  const job = await findVisibleJob(auth, jobId);

  if (job.status !== expected) {
    throw ApiError.conflict(`This job was changed to ${job.status.replace("_", " ")} while you were looking at it`);
  }
  if (!allowedStatuses(auth.role, job.status).includes(next)) {
    throw ApiError.conflict(`A job that is ${job.status.replace("_", " ")} cannot be marked ${next.replace("_", " ")}`);
  }
  if (next === "en_route" && (!job.crewId || !job.scheduledStart)) {
    throw ApiError.conflict("Schedule the job onto a crew before sending anyone");
  }

  const updated = await Job.updateOne(
    { _id: job._id as Types.ObjectId, companyId: auth.companyId, status: expected },
    { $set: { status: next }, $push: { timeline: { status: next, at: new Date() } } },
  );
  if (updated.modifiedCount === 0) {
    throw ApiError.conflict("This job was changed by someone else while you were looking at it");
  }
}
