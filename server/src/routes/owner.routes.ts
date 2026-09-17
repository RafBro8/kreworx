import { Router } from "express";

import { addDays, dateIn, dayRange, startOfWeek } from "../lib/dates";
import { ApiError } from "../lib/ApiError";
import { authOf, requireRole } from "../middleware/auth";
import { Company, Invoice, Job, Quote } from "../models";
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

export default router;
