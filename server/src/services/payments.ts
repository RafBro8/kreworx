import Stripe from "stripe";
import type { Types } from "mongoose";

import { env } from "../config/env";
import { ApiError } from "../lib/ApiError";
import { Invoice } from "../models";
import { totalCents } from "../models/lineItems";
import { notifyCompany, notifyJob } from "../realtime/io";
import { jobFromToken } from "./quotes";

/**
 * Taking a card, in test mode.
 *
 * Stripe Checkout rather than card fields of our own: the customer goes to a
 * page Stripe hosts, so no card number ever reaches this server or the client,
 * and there is no publishable key to manage. What comes back is a webhook, and
 * that webhook is the only thing that marks an invoice paid - not the browser
 * returning from the payment page, which anybody could forge by visiting the
 * success URL.
 *
 * Payments are optional. With no keys configured the portal never offers to
 * take one and everything else works exactly as before.
 */

let client: Stripe | null = null;

/** The Stripe client, or null when this deployment takes no payments. */
export function stripeClient(): Stripe | null {
  if (!env.stripe.secretKey) return null;
  client ??= new Stripe(env.stripe.secretKey);
  return client;
}

export const paymentsConfigured = () => Boolean(env.stripe.secretKey && env.stripe.webhookSecret);

/** Test seam: the webhook tests verify real signatures against a known secret. */
export function setStripeClientForTests(replacement: Stripe | null): void {
  client = replacement;
}

/**
 * The page the customer pays on.
 *
 * The amount is taken from the stored invoice, never from the request - a
 * price that arrives from a browser is a price somebody can change.
 */
export async function startCheckout(token: unknown, origin: string): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw ApiError.notFound("This business is not set up to take card payments");

  const job = await jobFromToken(token);
  const invoice = await Invoice.findOne({ jobId: job._id, status: { $in: ["sent", "overdue"] } })
    .sort({ issuedAt: -1 })
    .lean();
  if (!invoice) throw ApiError.notFound("There is nothing to pay on this visit");

  const amount = totalCents(invoice.lineItems);
  if (amount <= 0) throw ApiError.badRequest("This invoice has nothing to pay");

  const back = `${origin}/portal/${encodeURIComponent(String(token))}`;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    // One line for the invoice as a whole. The itemisation lives on the portal
    // and in the PDF; Stripe only needs to know what is being charged.
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: { name: `Invoice INV-${invoice.number}` },
        },
      },
    ],
    // What the webhook uses to find its way back to our invoice.
    client_reference_id: invoice._id.toString(),
    metadata: { invoiceId: invoice._id.toString(), companyId: invoice.companyId.toString() },
    success_url: `${back}?paid=1`,
    cancel_url: back,
  });

  if (!session.url) throw new Error("Stripe returned a session with no URL");
  return session.url;
}

/**
 * Marking an invoice paid because Stripe said so.
 *
 * Guarded on the invoice not already being paid, which is what makes this safe
 * to run twice - and it will run twice, because Stripe retries a webhook until
 * it is acknowledged and may deliver the same event more than once.
 */
export async function settleFromSession(session: {
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
  payment_status?: string | null;
}): Promise<{ settled: boolean; invoiceId: string | null }> {
  const invoiceId = session.metadata?.invoiceId ?? session.client_reference_id ?? null;
  if (!invoiceId) return { settled: false, invoiceId: null };

  // "unpaid" arrives for a session that completed but whose money has not: a
  // bank debit, say. That one settles later, on its own event.
  if (session.payment_status === "unpaid") return { settled: false, invoiceId };

  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) return { settled: false, invoiceId };

  const paid = await Invoice.updateOne(
    { _id: invoice._id, status: { $ne: "paid" } },
    { $set: { status: "paid", paidAt: new Date() } },
  );
  if (paid.modifiedCount === 0) return { settled: false, invoiceId };

  const jobId = invoice.jobId.toString();
  notifyCompany(invoice.companyId.toString(), { jobId, dates: [], reason: "invoice" });
  notifyJob(jobId, { status: "paid" });

  return { settled: true, invoiceId };
}

/** What the portal needs to know about money owed, if anything is. */
export async function outstandingInvoice(jobId: Types.ObjectId) {
  const invoice = await Invoice.findOne({ jobId, status: { $ne: "void" } }).sort({ issuedAt: -1 }).lean();
  if (!invoice) return null;

  return {
    number: invoice.number,
    status: invoice.status,
    totalCents: totalCents(invoice.lineItems),
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt ?? null,
    /** Whether this deployment can actually take the money. */
    payable: invoice.status !== "paid" && paymentsConfigured(),
  };
}
