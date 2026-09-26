import { Router } from "express";

import { addDays, dateIn, dayRange, startOfWeek } from "../lib/dates";
import { ApiError } from "../lib/ApiError";
import { authOf, requireRole } from "../middleware/auth";
import { Company, Customer, Invoice, Job, Quote } from "../models";
import { totalCents } from "../models/lineItems";

const router = Router();

/**
 * The owner's four numbers. Totals are summed from line items with the same
 * function the invoices use, so the dashboard can never disagree with the
 * documents it is summarising.
 */
router.get("/owner/summary", requireRole("owner"), async (req, res) => {
  const auth = authOf(req);
  const company = await Company.findById(auth.companyId, { timezone: 1 }).lean();
  if (!company) throw ApiError.unauthorized();

  const today = dateIn(new Date(), company.timezone);
  const day = dayRange(today, company.timezone);
  const week = {
    start: dayRange(startOfWeek(today), company.timezone).start,
    end: dayRange(addDays(startOfWeek(today), 6), company.timezone).end,
  };
  const scoped = { companyId: auth.companyId };

  const [jobsToday, doneToday, awaiting, invoicesThisWeek] = await Promise.all([
    Job.countDocuments({ ...scoped, scheduledStart: { $gte: day.start, $lt: day.end }, status: { $ne: "cancelled" } }),
    Job.countDocuments({ ...scoped, scheduledStart: { $gte: day.start, $lt: day.end }, status: "done" }),
    Quote.find({ ...scoped, status: "sent" }, { lineItems: 1 }).lean(),
    Invoice.find({ ...scoped, status: { $ne: "void" }, issuedAt: { $gte: week.start, $lt: week.end } }, { lineItems: 1, issuedAt: 1 }).lean(),
  ]);

  const sum = (documents: { lineItems: Parameters<typeof totalCents>[0] }[]) =>
    documents.reduce((total, document) => total + totalCents(document.lineItems), 0);

  res.json({
    date: today,
    jobsToday,
    doneToday,
    quotesAwaiting: { count: awaiting.length, totalCents: sum(awaiting) },
    invoicedTodayCents: sum(invoicesThisWeek.filter((invoice) => invoice.issuedAt >= day.start && invoice.issuedAt < day.end)),
    invoicedThisWeekCents: sum(invoicesThisWeek),
  });
});

/** How many whole weeks the revenue chart looks back over. */
const CHART_WEEKS = 12;
/** The buckets a debt is sorted into, by how long the bill has been sitting there. */
const AGE_BUCKETS = [
  { key: "current", label: "0-30 days", upTo: 30 },
  { key: "thirty", label: "31-60 days", upTo: 60 },
  { key: "sixty", label: "60+ days", upTo: Infinity },
] as const;
const DAY_MS = 24 * 60 * 60_000;
/** Enough of the worst debts to start making calls from, not a full ledger. */
const CHASE_SHOWN = 8;

/**
 * The three questions an owner opens the books to answer: am I taking more
 * than I was, who has not paid me, and what is still out with a customer.
 *
 * Every total is summed from line items with the same function the documents
 * use, so this page can never quietly disagree with the paperwork behind it.
 */
router.get("/owner/money", requireRole("owner"), async (req, res) => {
  const auth = authOf(req);
  const company = await Company.findById(auth.companyId, { timezone: 1 }).lean();
  if (!company) throw ApiError.unauthorized();

  const timezone = company.timezone;
  const now = new Date();
  const today = dateIn(now, timezone);
  // Whole weeks only: a half-finished week at the left edge of a chart reads
  // as a collapse in trade rather than as Monday.
  const firstWeek = addDays(startOfWeek(today), -7 * (CHART_WEEKS - 1));
  const from = dayRange(firstWeek, timezone).start;

  const scoped = { companyId: auth.companyId };
  const live = { ...scoped, status: { $ne: "void" as const } };
  const owing = { ...scoped, status: { $in: ["sent", "overdue"] as const } };

  const [billed, openInvoices, liveQuotes, answered] = await Promise.all([
    Invoice.find({ ...live, issuedAt: { $gte: from } }, { lineItems: 1, issuedAt: 1, paidAt: 1 }).lean(),
    Invoice.find(owing, { lineItems: 1, issuedAt: 1, dueAt: 1, number: 1, customerId: 1 }).lean(),
    Quote.find({ ...scoped, status: "sent" }, { lineItems: 1 }).lean(),
    Quote.find({ ...scoped, status: { $in: ["approved", "declined"] }, respondedAt: { $gte: from } }, { lineItems: 1, status: 1 }).lean(),
  ]);

  const sum = (documents: { lineItems: Parameters<typeof totalCents>[0] }[]) =>
    documents.reduce((total, document) => total + totalCents(document.lineItems), 0);

  // ---- money in, week by week ----------------------------------------------
  // Billed is dated by when the work was invoiced, settled by when the money
  // actually arrived. They are deliberately not the same week: the gap between
  // the two lines is how long the business waits to be paid.
  const weeks = new Map<string, { billedCents: number; settledCents: number }>();
  for (let index = 0; index < CHART_WEEKS; index += 1) {
    weeks.set(addDays(firstWeek, index * 7), { billedCents: 0, settledCents: 0 });
  }
  const bump = (week: string, field: "billedCents" | "settledCents", cents: number) => {
    const row = weeks.get(week);
    if (row) row[field] += cents;
  };
  for (const invoice of billed) {
    const cents = totalCents(invoice.lineItems);
    bump(startOfWeek(dateIn(invoice.issuedAt, timezone)), "billedCents", cents);
    if (invoice.paidAt) bump(startOfWeek(dateIn(invoice.paidAt, timezone)), "settledCents", cents);
  }

  // ---- who owes, and for how long ------------------------------------------
  const ageOf = (issuedAt: Date) => Math.floor((now.getTime() - issuedAt.getTime()) / DAY_MS);
  const ageing = AGE_BUCKETS.map((bucket, index) => {
    const after = index === 0 ? -Infinity : AGE_BUCKETS[index - 1]!.upTo;
    const inBucket = openInvoices.filter((invoice) => {
      const age = ageOf(invoice.issuedAt);
      return age > after && age <= bucket.upTo;
    });
    return { key: bucket.key, label: bucket.label, count: inBucket.length, cents: sum(inBucket) };
  });

  // The oldest few, because those are the calls to make first.
  const oldest = [...openInvoices].sort((a, b) => a.issuedAt.getTime() - b.issuedAt.getTime()).slice(0, CHASE_SHOWN);
  const owedBy = await Customer.find({ _id: { $in: oldest.map((invoice) => invoice.customerId) } }, { name: 1 }).lean();
  const nameOf = new Map(owedBy.map((customer) => [String(customer._id), customer.name]));

  // ---- what is still out with a customer -----------------------------------
  const approved = answered.filter((quote) => quote.status === "approved");

  res.json({
    timezone,
    weeks: [...weeks].map(([weekStart, row]) => ({ weekStart, ...row })),
    receivable: {
      totalCents: sum(openInvoices),
      ageing,
      oldest: oldest.map((invoice) => ({
        id: String(invoice._id),
        number: invoice.number,
        customer: nameOf.get(String(invoice.customerId)) ?? null,
        daysOld: ageOf(invoice.issuedAt),
        overdue: invoice.dueAt < now,
        totalCents: totalCents(invoice.lineItems),
      })),
    },
    pipeline: {
      out: { count: liveQuotes.length, cents: sum(liveQuotes) },
      // Judged over the same window as the chart, so the rate and the revenue
      // are talking about the same stretch of time.
      won: { count: approved.length, cents: sum(approved) },
      answered: answered.length,
      weeks: CHART_WEEKS,
    },
  });
});

export default router;
