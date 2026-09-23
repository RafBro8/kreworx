import { Router } from "express";
import mongoose from "mongoose";

import { ApiError } from "../lib/ApiError";
import { authOf, requireAuth, requireRole } from "../middleware/auth";
import { Crew, Customer, Invoice, Job, Property, Quote } from "../models";
import { totalCents } from "../models/lineItems";

const router = Router();

/**
 * The customer book is the office's, not the van's.
 *
 * A technician sees the jobs on their own crew and the notes attached to them,
 * which is what they need at the door. Browsing every customer a business has
 * ever had - with their phone numbers, their gate codes and what they have
 * spent - is a different thing, and it belongs to the people who answer the
 * phone.
 */
router.use("/customers", requireAuth, requireRole("owner", "dispatcher"));

/** Case-insensitive "contains", with anything regex-special treated literally. */
function contains(term: string): RegExp {
  return new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/**
 * Everyone this business works for.
 *
 * Assembled from four reads rather than a join per customer: a contractor's
 * whole book is a few hundred rows at most, and pulling each collection once
 * keeps the shape of the answer obvious. If it ever grows past that, this is
 * the place to reach for an aggregation.
 */
router.get("/customers", async (req, res) => {
  const auth = authOf(req);
  const scoped = { companyId: auth.companyId };
  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const [customers, properties, jobs, invoices] = await Promise.all([
    Customer.find(scoped).sort({ name: 1 }).lean(),
    Property.find(scoped, { customerId: 1, city: 1 }).lean(),
    Job.find({ ...scoped, status: { $ne: "cancelled" } }, { customerId: 1, status: 1, scheduledStart: 1 }).lean(),
    Invoice.find({ ...scoped, status: { $ne: "void" } }, { customerId: 1, lineItems: 1 }).lean(),
  ]);

  const byCustomer = <T extends { customerId: unknown }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = String(row.customerId);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
  };

  const propertiesOf = byCustomer(properties);
  const jobsOf = byCustomer(jobs);
  const invoicesOf = byCustomer(invoices);

  const rows = customers.map((customer) => {
    const id = customer._id.toString();
    const theirProperties = propertiesOf.get(id) ?? [];
    const theirJobs = jobsOf.get(id) ?? [];
    const visits = theirJobs
      .filter((job) => job.status === "done" && job.scheduledStart)
      .map((job) => job.scheduledStart!)
      .sort((a, b) => b.getTime() - a.getTime());

    return {
      id,
      name: customer.name,
      kind: customer.kind,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
      // One town for most, a list for the few with property in several.
      towns: [...new Set(theirProperties.map((property) => property.city))].sort(),
      properties: theirProperties.length,
      jobs: theirJobs.length,
      lastVisit: visits[0] ?? null,
      billedCents: (invoicesOf.get(id) ?? []).reduce((total, invoice) => total + totalCents(invoice.lineItems), 0),
    };
  });

  // Searching by address matters as much as by name: half the time the office
  // knows the house, not who owns it.
  const matching = search
    ? rows.filter((row) => contains(search).test(row.name) || row.towns.some((town) => contains(search).test(town)))
    : rows;

  res.json(matching);
});

/**
 * One customer: who they are, what they own, and everything done for them.
 *
 * This is the answer to "the technician who arrives next year needs to know
 * what the last one found", so the history goes back as far as it goes, newest
 * first, with the money beside each visit.
 */
router.get("/customers/:id", async (req, res) => {
  const auth = authOf(req);
  const id = req.params.id as string;
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound("Customer not found");

  const customer = await Customer.findOne({ _id: id, companyId: auth.companyId }).lean();
  if (!customer) throw ApiError.notFound("Customer not found");

  const [properties, jobs] = await Promise.all([
    Property.find({ companyId: auth.companyId, customerId: customer._id }).sort({ street: 1 }).lean(),
    Job.find({ companyId: auth.companyId, customerId: customer._id }).sort({ scheduledStart: -1, requestedAt: -1 }).lean(),
  ]);

  const jobIds = jobs.map((job) => job._id);
  const [invoices, quotes, crews] = await Promise.all([
    Invoice.find({ companyId: auth.companyId, jobId: { $in: jobIds } }, { jobId: 1, number: 1, status: 1, lineItems: 1 }).lean(),
    Quote.find({ companyId: auth.companyId, jobId: { $in: jobIds } }, { jobId: 1, number: 1, status: 1, lineItems: 1 }).lean(),
    Crew.find({ companyId: auth.companyId }, { name: 1, van: 1 }).lean(),
  ]);

  const invoiceOf = new Map(invoices.map((invoice) => [String(invoice.jobId), invoice]));
  const quoteOf = new Map(quotes.map((quote) => [String(quote.jobId), quote]));
  const crewOf = new Map(crews.map((crew) => [String(crew._id), crew]));
  const propertyOf = new Map(properties.map((property) => [String(property._id), property]));

  res.json({
    id: customer._id.toString(),
    name: customer.name,
    kind: customer.kind,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
    properties: properties.map((property) => ({
      id: property._id.toString(),
      street: property.street,
      city: property.city,
      state: property.state,
      zip: property.zip,
      accessNotes: property.accessNotes ?? null,
      equipment: property.equipment.map((item) => ({
        kind: item.kind,
        make: item.make ?? null,
        model: item.model ?? null,
        installedYear: item.installedYear ?? null,
      })),
    })),
    jobs: jobs.map((job) => {
      const invoice = invoiceOf.get(String(job._id));
      const quote = quoteOf.get(String(job._id));
      const crew = job.crewId ? crewOf.get(String(job.crewId)) : undefined;
      const property = propertyOf.get(String(job.propertyId));

      return {
        id: job._id.toString(),
        number: job.number,
        title: job.title,
        status: job.status,
        scheduledStart: job.scheduledStart,
        requestedAt: job.requestedAt,
        street: property?.street ?? null,
        crew: crew ? { name: crew.name, van: crew.van } : null,
        invoice: invoice ? { number: invoice.number, status: invoice.status, totalCents: totalCents(invoice.lineItems) } : null,
        quote: quote ? { number: quote.number, status: quote.status, totalCents: totalCents(quote.lineItems) } : null,
      };
    }),
    billedCents: invoices
      .filter((invoice) => invoice.status !== "void")
      .reduce((total, invoice) => total + totalCents(invoice.lineItems), 0),
  });
});

export default router;
