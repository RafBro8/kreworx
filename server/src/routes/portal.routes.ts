import { Router } from "express";
import { z } from "zod";

import { demoClockPayload } from "../demo/clock";
import { ApiError } from "../lib/ApiError";
import { Company, Crew, Customer, Photo, Property, Quote, User } from "../models";
import { lineAmountCents, totalCents } from "../models/lineItems";
import { answerQuote, jobFromToken, NO_SUCH_LINK } from "../services/quotes";
import { describe as describePhoto, findPhoto, sendImage } from "./photos.routes";

const router = Router();

/** Personal data behind a bearer link: keep it out of caches and search engines. */
function privateResponse(res: { set: (headers: Record<string, string>) => unknown }): void {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
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

  const [company, customer, property, crew, quote, photos] = await Promise.all([
    Company.findById(job.companyId, { name: 1, phone: 1, timezone: 1, demoCycleStartedAt: 1 }).lean(),
    Customer.findById(job.customerId, { name: 1 }).lean(),
    Property.findById(job.propertyId, { street: 1, city: 1 }).lean(),
    job.crewId ? Crew.findById(job.crewId, { leadId: 1 }).lean() : null,
    Quote.findOne({ jobId: job._id, status: { $in: ["sent", "approved", "declined"] } }).sort({ sentAt: -1 }).lean(),
    // Only what the crew marked to share, and never the bytes: those come one
    // at a time from the route below, so the page loads before the pictures do.
    Photo.find({ jobId: job._id, sharedWithCustomer: { $ne: false } }, { data: 0 }).sort({ createdAt: 1 }).lean(),
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
    photos: photos.map((photo) => {
      const { sharedWithCustomer: _shared, ...summary } = describePhoto(photo);
      return summary;
    }),
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

/** The customer answering their quote. The rules are in the service. */
router.post("/portal/:token/quote", async (req, res) => {
  privateResponse(res);

  const parsed = decisionBody.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Say whether the quote is approved or declined");

  await answerQuote(req.params.token, parsed.data.decision);
  res.status(204).end();
});

/**
 * One photo from the job the link names.
 *
 * The id alone is not enough: the photo has to belong to this job and be one
 * the crew marked to share, so a guessed id reaches nothing, and an internal
 * photo stays internal even though the customer holds a valid link.
 */
router.get("/portal/:token/photos/:id", async (req, res) => {
  const job = await jobFromToken(req.params.token);
  const photo = await findPhoto(req.params.id as string);

  if (!photo.jobId.equals(job._id) || photo.sharedWithCustomer === false) throw ApiError.notFound("Photo not found");

  sendImage(res, photo);
});

export default router;
