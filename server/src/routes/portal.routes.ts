import { Router } from "express";

import { demoClockPayload } from "../demo/clock";
import { ApiError } from "../lib/ApiError";
import { Company, Crew, Customer, Job, Property, Quote, User } from "../models";
import { lineAmountCents, totalCents } from "../models/lineItems";

const router = Router();

/**
 * What a customer sees from the link in their text message. No session: the
 * token is the credential, so this response is built field by field from an
 * allow-list. Internal ids, notes, crew assignments and other customers' data
 * never leave the server, however the models grow later.
 */
router.get("/portal/:token", async (req, res) => {
  // Personal data behind a bearer link: keep it out of caches and search engines.
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });

  const token = req.params.token;
  if (typeof token !== "string" || token.length < 16 || token.length > 128) throw ApiError.notFound("This link has expired or is not valid");

  const job = await Job.findOne({ portalToken: token }).lean();
  if (!job || job.status === "cancelled") throw ApiError.notFound("This link has expired or is not valid");

  const [company, customer, property, crew, quote] = await Promise.all([
    Company.findById(job.companyId, { name: 1, phone: 1, timezone: 1, demoCycleStartedAt: 1 }).lean(),
    Customer.findById(job.customerId, { name: 1 }).lean(),
    Property.findById(job.propertyId, { street: 1, city: 1 }).lean(),
    job.crewId ? Crew.findById(job.crewId, { leadId: 1 }).lean() : null,
    Quote.findOne({ jobId: job._id, status: { $in: ["sent", "approved", "declined"] } }).sort({ sentAt: -1 }).lean(),
  ]);
  if (!company || !customer || !property) throw ApiError.notFound("This link has expired or is not valid");

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

export default router;
