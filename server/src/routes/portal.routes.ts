import { Router } from "express";
import { z } from "zod";

import { demoClockPayload } from "../demo/clock";
import { ApiError } from "../lib/ApiError";
import { dateIn } from "../lib/dates";
import { Company, Crew, Customer, Job, Property, Quote, User } from "../models";
import { lineAmountCents, totalCents } from "../models/lineItems";
import { notifyCompany, notifyJob } from "../realtime/io";

const router = Router();

/**
 * One message for every way a link can fail to open a job: wrong, malformed,
 * or pointing at cancelled work. Telling them apart would let someone probe
 * the token space and learn which guesses were close.
 */
const NO_SUCH_LINK = "This link has expired or is not valid";

/** Personal data behind a bearer link: keep it out of caches and search engines. */
function privateResponse(res: { set: (headers: Record<string, string>) => unknown }): void {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
}

/** The job a customer's link names, or the one refusal for every failure. */
async function jobFromToken(token: unknown) {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) throw ApiError.notFound(NO_SUCH_LINK);

  const job = await Job.findOne({ portalToken: token }).lean();
  if (!job || job.status === "cancelled") throw ApiError.notFound(NO_SUCH_LINK);
  return job;
}

/**
 * What a customer sees from the link in their text message. No session: the
 * token is the credential, so this response is built field by field from an
 * allow-list. Internal ids, notes, crew assignments and other customers' data
 * never leave the server, however the models grow later.
 */
router.get("/portal/:token", async (req, res) => {
  privateResponse(res);

  const job = await jobFromToken(req.params.token);

  const [company, customer, property, crew, quote] = await Promise.all([
    Company.findById(job.companyId, { name: 1, phone: 1, timezone: 1, demoCycleStartedAt: 1 }).lean(),
    Customer.findById(job.customerId, { name: 1 }).lean(),
    Property.findById(job.propertyId, { street: 1, city: 1 }).lean(),
    job.crewId ? Crew.findById(job.crewId, { leadId: 1 }).lean() : null,
    Quote.findOne({ jobId: job._id, status: { $in: ["sent", "approved", "declined"] } }).sort({ sentAt: -1 }).lean(),
  ]);
  if (!company || !customer || !property) throw ApiError.notFound(NO_SUCH_LINK);

  const lead = crew ? await User.findById(crew.leadId, { name: 1, title: 1, startedYear: 1 }).lean() : null;

  res.json({
    company: { name: company.name, phone: company.phone ?? null, timezone: company.timezone },
    demo: demoClockPayload(company.demoCycleStartedAt),
    customer: { firstName: customer.name.split(" ")[0] },
    job: {
      number: job.number,
      title: job.title,
      status: job.status,
      scheduledStart: job.scheduledStart,
      scheduledEnd: job.scheduledEnd,
      timeline: job.timeline.map((entry) => ({ status: entry.status, at: entry.at })),
    },
    address: { street: property.street, city: property.city },
    technician: lead
      ? {
          name: lead.name,
          title: lead.title ?? null,
          years: lead.startedYear ? new Date().getFullYear() - lead.startedYear : null,
        }
      : null,
    quote: quote
      ? {
          number: quote.number,
          status: quote.status,
          findings: quote.findings ?? null,
          sentAt: quote.sentAt,
          respondedAt: quote.respondedAt,
          validUntil: quote.validUntil,
          lineItems: quote.lineItems.map((item) => ({
            description: item.description,
            detail: item.detail ?? null,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            waived: Boolean(item.waived),
            amountCents: lineAmountCents(item),
          })),
          totalCents: totalCents(quote.lineItems),
        }
      : null,
  });
});

const decisionBody = z.object({ decision: z.enum(["approved", "declined"]) }).strict();

/**
 * The customer answering their quote - the one thing they can change.
 *
 * The token both identifies the quote and authorises the answer: the quote is
 * found through the job the link names, never from the request body, so no
 * amount of guessing at ids reaches another customer's money. The write is
 * guarded on the quote still being "sent", which is what makes a double tap -
 * or the office taking the same answer by phone at the same moment - land as
 * one answer rather than two.
 */
router.post("/portal/:token/quote", async (req, res) => {
  privateResponse(res);

  const parsed = decisionBody.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Say whether the quote is approved or declined");

  const job = await jobFromToken(req.params.token);
  const quote = await Quote.findOne({ jobId: job._id, status: "sent" }, { _id: 1 }).lean();
  if (!quote) throw ApiError.notFound("There is nothing here waiting for your answer");

  const answered = await Quote.updateOne(
    { _id: quote._id, status: "sent" },
    { $set: { status: parsed.data.decision, respondedAt: new Date(), respondedVia: "portal" } },
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

  res.status(204).end();
});

export default router;
