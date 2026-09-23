import { ApiError } from "../lib/ApiError";
import { dateIn } from "../lib/dates";
import { Company, Job, Quote } from "../models";
import { notifyCompany, notifyJob } from "../realtime/io";

/**
 * One message for every way a customer's link can fail to open a job: wrong,
 * malformed, or pointing at cancelled work. Telling them apart would let
 * somebody probe the token space and learn which guesses were close.
 */
export const NO_SUCH_LINK = "This link has expired or is not valid";

/** The job a customer's link names, or the one refusal for every failure. */
export async function jobFromToken(token: unknown) {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) throw ApiError.notFound(NO_SUCH_LINK);

  const job = await Job.findOne({ portalToken: token }).lean();
  if (!job || job.status === "cancelled") throw ApiError.notFound(NO_SUCH_LINK);
  return job;
}

export type Decision = "approved" | "declined";

/**
 * The customer answering their quote - the one thing they can change.
 *
 * The token both identifies the quote and authorises the answer: the quote is
 * found through the job the link names, never from the request body, so no
 * amount of guessing at ids reaches another customer's money.
 *
 * The write is guarded on the quote still being "sent". That is what makes a
 * double tap - or the office taking the same answer by phone at the same
 * moment - land as one answer rather than two, and `hooks.beforeWrite` is how
 * a test holds both answers between reading and writing to prove it.
 */
export async function answerQuote(
  token: unknown,
  decision: Decision,
  hooks: { beforeWrite?: () => Promise<void> } = {},
): Promise<void> {
  const job = await jobFromToken(token);

  const quote = await Quote.findOne({ jobId: job._id, status: "sent" }, { _id: 1 }).lean();
  if (!quote) throw ApiError.notFound("There is nothing here waiting for your answer");

  await hooks.beforeWrite?.();

  const answered = await Quote.updateOne(
    { _id: quote._id, status: "sent" },
    { $set: { status: decision, respondedAt: new Date(), respondedVia: "portal" } },
  );
  if (answered.modifiedCount === 0) throw ApiError.conflict("This quote has already been answered");

  // A job parked at "awaiting approval" is waiting on precisely this. The
  // technician is still standing in the property either way, so it goes back
  // to on site; what changed is whether the work is authorised.
  //
  // Deliberately no manualOverride: the customer answering is part of the
  // day, not someone overruling it, and setting it would strand the job on
  // site for the rest of the demo instead of letting it finish.
  const resumed = job.status === "awaiting_approval";
  if (resumed) {
    await Job.updateOne(
      { _id: job._id, status: "awaiting_approval" },
      { $set: { status: "on_site" }, $push: { timeline: { status: "on_site", at: new Date() } } },
    );
  }

  const company = await Company.findById(job.companyId, { timezone: 1 }).lean();
  const dates = job.scheduledStart && company ? [dateIn(job.scheduledStart, company.timezone)] : [];
  const jobId = job._id.toString();

  notifyCompany(job.companyId.toString(), { jobId, dates, reason: "quote" });
  notifyJob(jobId, { status: resumed ? "on_site" : job.status });
}
