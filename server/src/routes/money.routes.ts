import { Router } from "express";
import mongoose from "mongoose";

import { ApiError } from "../lib/ApiError";
import { authOf, requireAuth, requireRole } from "../middleware/auth";
import { Customer, Invoice, Job, Quote } from "../models";
import {
  createInvoice,
  createQuote,
  describeDocument,
  documentInput,
  markInvoicePaid,
  sendQuote,
  updateInvoice,
  updateQuote,
} from "../services/money";

const router = Router();

/**
 * The money is the office's. A technician records what they did; what it costs
 * and who has paid is decided by the people who answer the phone.
 */
router.use(["/money", "/quotes", "/invoices"], requireAuth, requireRole("owner", "dispatcher"));

/**
 * Everything owed and everything waiting, in one read.
 *
 * The page needs both kinds of document side by side, and a contractor's open
 * paperwork is a short list, so it comes back whole rather than paged.
 */
router.get("/money", async (req, res) => {
  const auth = authOf(req);
  const scoped = { companyId: auth.companyId };

  const [quotes, invoices] = await Promise.all([
    Quote.find({ ...scoped, status: { $ne: "draft" } }).sort({ sentAt: -1 }).lean(),
    Invoice.find({ ...scoped, status: { $ne: "void" } }).sort({ issuedAt: -1 }).lean(),
  ]);
  const drafts = await Quote.find({ ...scoped, status: "draft" }).sort({ createdAt: -1 }).lean();

  const all = [...drafts, ...quotes, ...invoices];
  const [jobs, customers] = await Promise.all([
    Job.find({ ...scoped, _id: { $in: all.map((document) => document.jobId) } }, { number: 1, title: 1, customerId: 1 }).lean(),
    Customer.find(scoped, { name: 1 }).lean(),
  ]);

  const jobOf = new Map(jobs.map((job) => [String(job._id), job]));
  const customerOf = new Map(customers.map((customer) => [String(customer._id), customer]));

  const withContext = (document: (typeof all)[number]) => {
    const job = jobOf.get(String(document.jobId));
    return {
      ...describeDocument(document),
      job: job ? { number: job.number, title: job.title } : null,
      customer: customerOf.get(String(document.customerId))?.name ?? null,
    };
  };

  res.json({
    quotes: [...drafts, ...quotes].map(withContext),
    invoices: invoices.map(withContext),
  });
});

/**
 * The job and customer a document belongs to. Mongoose types the two models
 * separately, so each lookup is written out rather than shared through one
 * helper that would have to be cast to compile.
 */
async function contextFor(jobId: unknown) {
  const job = await Job.findById(jobId, { number: 1, title: 1, customerId: 1 }).lean();
  const customer = job ? await Customer.findById(job.customerId, { name: 1 }).lean() : null;
  return {
    job: job ? { id: String(job._id), number: job.number, title: job.title } : null,
    customer: customer?.name ?? null,
  };
}

function validId(id: string, what: string): string {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound(`${what} not found`);
  return id;
}

router.get("/quotes/:id", async (req, res) => {
  const auth = authOf(req);
  const quote = await Quote.findOne({ _id: validId(req.params.id as string, "Quote"), companyId: auth.companyId }).lean();
  if (!quote) throw ApiError.notFound("Quote not found");

  res.json({ ...describeDocument(quote), ...(await contextFor(quote.jobId)), editable: quote.status === "draft" });
});

router.get("/invoices/:id", async (req, res) => {
  const auth = authOf(req);
  const invoice = await Invoice.findOne({ _id: validId(req.params.id as string, "Invoice"), companyId: auth.companyId }).lean();
  if (!invoice) throw ApiError.notFound("Invoice not found");

  res.json({
    ...describeDocument(invoice),
    ...(await contextFor(invoice.jobId)),
    editable: invoice.status !== "paid" && invoice.status !== "void",
  });
});

// ---- writing ---------------------------------------------------------------

router.use(["/jobs/:id/quote", "/jobs/:id/invoice"], requireAuth, requireRole("owner", "dispatcher"));

router.post("/jobs/:id/quote", async (req, res) => {
  const parsed = documentInput.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("A quote needs at least one line, each with a price in whole cents");

  const quote = await createQuote(authOf(req), req.params.id as string, parsed.data);
  res.status(201).json(describeDocument(quote));
});

router.patch("/quotes/:id", async (req, res) => {
  const parsed = documentInput.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("A quote needs at least one line, each with a price in whole cents");

  await updateQuote(authOf(req), req.params.id as string, parsed.data);
  res.status(204).end();
});

router.post("/quotes/:id/send", async (req, res) => {
  await sendQuote(authOf(req), req.params.id as string);
  res.status(204).end();
});

router.post("/jobs/:id/invoice", async (req, res) => {
  // An empty body means "bill the approved quote", which is the usual case.
  const hasBody = req.body && typeof req.body === "object" && "lineItems" in req.body;
  const parsed = hasBody ? documentInput.safeParse(req.body) : null;
  if (parsed && !parsed.success) throw ApiError.badRequest("Each line needs a description and a price in whole cents");

  const invoice = await createInvoice(authOf(req), req.params.id as string, parsed?.data ?? null);
  res.status(201).json(describeDocument(invoice));
});

router.patch("/invoices/:id", async (req, res) => {
  const parsed = documentInput.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Each line needs a description and a price in whole cents");

  await updateInvoice(authOf(req), req.params.id as string, parsed.data);
  res.status(204).end();
});

router.post("/invoices/:id/paid", async (req, res) => {
  await markInvoicePaid(authOf(req), req.params.id as string);
  res.status(204).end();
});

export default router;
