import type { Types } from "mongoose";
import mongoose from "mongoose";
import { z } from "zod";

import { ApiError } from "../lib/ApiError";
import type { AuthContext } from "../middleware/auth";
import { Invoice, Job, Quote } from "../models";
import { nextNumber } from "../models/Counter";
import { LINE_ITEM_KINDS, totalCents, type LineItem } from "../models/lineItems";
import { notifyCompany, notifyJob } from "../realtime/io";

/**
 * Writing the money down.
 *
 * Two rules run through all of this. A document that has left the building
 * cannot be quietly edited - once a customer has been sent a quote, changing
 * its price behind the link would be indefensible, so a sent quote is frozen
 * and a paid invoice is frozen. And every total is summed from line items by
 * `totalCents`, the same function the portal and the owner's dashboard use, so
 * no two screens can ever disagree about what something costs.
 */

/** Two weeks, which is what the demo's seeded quotes and invoices use. */
const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;

export const lineItemInput = z.object({
  kind: z.enum(LINE_ITEM_KINDS),
  description: z.string().trim().min(1).max(120),
  detail: z.string().trim().max(140).optional(),
  // Quantities are hours or counts; a quarter of an hour is as fine as it gets.
  quantity: z.number().min(0).max(9999),
  // Whole cents only, which is what stops a total drifting by a fraction.
  unitPriceCents: z.int().min(0).max(100_000_000),
  waived: z.boolean().optional(),
});

export const documentInput = z.object({
  findings: z.string().trim().max(2000).optional(),
  // A draft starts empty, because a quote begins as a blank page and the
  // office fills it in. What may not be empty is a document that leaves the
  // building, which is checked when it is sent or issued rather than here.
  lineItems: z.array(lineItemInput).max(40),
});

export type DocumentInput = z.infer<typeof documentInput>;

/** The job a document hangs off, scoped to the signed-in business. */
async function jobOf(auth: AuthContext, jobId: string) {
  if (!mongoose.isValidObjectId(jobId)) throw ApiError.notFound("Job not found");
  const job = await Job.findOne({ _id: jobId, companyId: auth.companyId }).lean();
  if (!job) throw ApiError.notFound("Job not found");
  return job;
}

function asObjectId(id: string, what: string): Types.ObjectId {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound(`${what} not found`);
  return new mongoose.Types.ObjectId(id);
}

// ---- quotes ----------------------------------------------------------------

export async function createQuote(auth: AuthContext, jobId: string, input: DocumentInput) {
  const job = await jobOf(auth, jobId);

  // One live quote at a time. A declined one can be followed by a better
  // offer; an unanswered one should be edited rather than duplicated.
  const open = await Quote.findOne({ jobId: job._id, status: { $in: ["draft", "sent"] } }, { _id: 1 }).lean();
  if (open) throw ApiError.conflict("This job already has a quote waiting");

  const quote = await Quote.create({
    companyId: auth.companyId,
    number: await nextNumber(auth.companyId, "quote"),
    jobId: job._id,
    customerId: job.customerId,
    status: "draft",
    findings: input.findings,
    lineItems: input.lineItems,
  });

  notifyCompany(auth.companyId.toString(), { jobId: job._id.toString(), dates: [], reason: "quote" });
  return quote;
}

export async function updateQuote(auth: AuthContext, quoteId: string, input: DocumentInput) {
  const quote = await Quote.findOne({ _id: asObjectId(quoteId, "Quote"), companyId: auth.companyId }).lean();
  if (!quote) throw ApiError.notFound("Quote not found");
  if (quote.status !== "draft") {
    throw ApiError.conflict("This quote has already gone to the customer. Write a new one instead.");
  }

  await Quote.updateOne(
    { _id: quote._id, status: "draft" },
    { $set: { findings: input.findings ?? null, lineItems: input.lineItems } },
  );

  notifyCompany(auth.companyId.toString(), { jobId: quote.jobId.toString(), dates: [], reason: "quote" });
  return { ...quote, ...input };
}

export async function sendQuote(auth: AuthContext, quoteId: string) {
  const quote = await Quote.findOne({ _id: asObjectId(quoteId, "Quote"), companyId: auth.companyId }).lean();
  if (!quote) throw ApiError.notFound("Quote not found");
  if (quote.status !== "draft") throw ApiError.conflict("This quote has already been sent");
  if (quote.lineItems.length === 0) throw ApiError.badRequest("A quote needs at least one line");

  const sentAt = new Date();
  const sent = await Quote.updateOne(
    { _id: quote._id, status: "draft" },
    { $set: { status: "sent", sentAt, validUntil: new Date(sentAt.getTime() + FORTNIGHT_MS) } },
  );
  if (sent.modifiedCount === 0) throw ApiError.conflict("This quote has already been sent");

  notifyCompany(auth.companyId.toString(), { jobId: quote.jobId.toString(), dates: [], reason: "quote" });
  // The customer's page is watching; the quote appears there the moment it goes.
  notifyJob(quote.jobId.toString(), { status: "quote" });
}

// ---- invoices --------------------------------------------------------------

export async function createInvoice(auth: AuthContext, jobId: string, input: DocumentInput | null) {
  const job = await jobOf(auth, jobId);

  const existing = await Invoice.findOne({ jobId: job._id, status: { $ne: "void" } }, { _id: 1 }).lean();
  if (existing) throw ApiError.conflict("This job has already been invoiced");

  // With no lines given, bill exactly what the customer approved. That is the
  // common case, and retyping an approved quote is how totals drift apart.
  // An invoice is issued the moment it is made - there is no draft state for
  // it - so unlike a quote it has to say something from the start.
  let lineItems: LineItem[] | undefined = input?.lineItems?.length ? input.lineItems : undefined;
  if (input && input.lineItems.length === 0) throw ApiError.badRequest("An invoice needs at least one line");
  if (!lineItems) {
    const approved = await Quote.findOne({ jobId: job._id, status: "approved" }).sort({ respondedAt: -1 }).lean();
    if (!approved) throw ApiError.badRequest("There is no approved quote to bill, so the lines have to be written out");
    lineItems = approved.lineItems;
  }

  const issuedAt = new Date();
  const invoice = await Invoice.create({
    companyId: auth.companyId,
    number: await nextNumber(auth.companyId, "invoice"),
    jobId: job._id,
    customerId: job.customerId,
    status: "sent",
    lineItems,
    issuedAt,
    dueAt: new Date(issuedAt.getTime() + FORTNIGHT_MS),
  });

  notifyCompany(auth.companyId.toString(), { jobId: job._id.toString(), dates: [], reason: "invoice" });
  return invoice;
}

export async function updateInvoice(auth: AuthContext, invoiceId: string, input: DocumentInput) {
  const invoice = await Invoice.findOne({ _id: asObjectId(invoiceId, "Invoice"), companyId: auth.companyId }).lean();
  if (!invoice) throw ApiError.notFound("Invoice not found");
  if (invoice.status === "paid" || invoice.status === "void") {
    throw ApiError.conflict("A settled invoice cannot be changed");
  }

  await Invoice.updateOne({ _id: invoice._id, status: invoice.status }, { $set: { lineItems: input.lineItems } });
  notifyCompany(auth.companyId.toString(), { jobId: invoice.jobId.toString(), dates: [], reason: "invoice" });
  return { ...invoice, lineItems: input.lineItems };
}

/**
 * Marking an invoice settled by hand - the cheque, the bank transfer, the cash
 * on the doorstep. Card payments arrive in their own stage and will set this
 * same field from a Stripe webhook rather than from a button.
 */
export async function markInvoicePaid(auth: AuthContext, invoiceId: string) {
  const invoice = await Invoice.findOne({ _id: asObjectId(invoiceId, "Invoice"), companyId: auth.companyId }).lean();
  if (!invoice) throw ApiError.notFound("Invoice not found");
  if (invoice.status === "void") throw ApiError.conflict("A void invoice cannot be paid");

  const paid = await Invoice.updateOne(
    { _id: invoice._id, status: { $ne: "paid" } },
    { $set: { status: "paid", paidAt: new Date() } },
  );
  if (paid.modifiedCount === 0) throw ApiError.conflict("This invoice is already settled");

  notifyCompany(auth.companyId.toString(), { jobId: invoice.jobId.toString(), dates: [], reason: "invoice" });
}

/** What both documents look like in JSON, including the total nobody retypes. */
export function describeDocument(document: {
  _id: unknown;
  number: number;
  jobId: unknown;
  status: string;
  lineItems: Parameters<typeof totalCents>[0];
  findings?: string | null;
  sentAt?: Date | null;
  respondedAt?: Date | null;
  validUntil?: Date | null;
  issuedAt?: Date;
  dueAt?: Date;
  paidAt?: Date | null;
}) {
  return {
    id: String(document._id),
    number: document.number,
    jobId: String(document.jobId),
    status: document.status,
    findings: document.findings ?? null,
    lineItems: document.lineItems.map((item) => ({
      kind: item.kind,
      description: item.description,
      detail: item.detail ?? null,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      waived: Boolean(item.waived),
    })),
    totalCents: totalCents(document.lineItems),
    sentAt: document.sentAt ?? null,
    respondedAt: document.respondedAt ?? null,
    validUntil: document.validUntil ?? null,
    issuedAt: document.issuedAt ?? null,
    dueAt: document.dueAt ?? null,
    paidAt: document.paidAt ?? null,
  };
}
