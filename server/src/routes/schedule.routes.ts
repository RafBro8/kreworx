import { Router } from "express";
import type { Types } from "mongoose";
import { z } from "zod";

import { demoClockPayload } from "../demo/clock";
import { dateIn, dayRange } from "../lib/dates";
import { ApiError } from "../lib/ApiError";
import { authOf, requireAuth, requireRole, type AuthContext } from "../middleware/auth";
import { Company, Crew, Customer, Invoice, Job, Property, Quote, User } from "../models";
import { JOB_STATUSES } from "../models/Job";
import { totalCents } from "../models/lineItems";
import {
  allowedStatuses,
  canReschedule,
  changeStatus,
  findVisibleJob,
  scheduleJob,
  unscheduleJob,
} from "../services/scheduling";

const router = Router();

router.use(["/crews", "/jobs"], requireAuth);

/**
 * A technician sees their own crew and its work, nothing else; the office
 * sees everything in the company. Every query below is also filtered by
 * company, so no role can ever read another business's data.
 */
async function visibleCrewIds(auth: AuthContext): Promise<Types.ObjectId[] | null> {
  if (auth.role !== "technician") return null;
  const crews = await Crew.find(
    { companyId: auth.companyId, $or: [{ leadId: auth.userId }, { memberIds: auth.userId }] },
    { _id: 1 },
  ).lean();
  return crews.map((crew) => crew._id);
}

router.get("/crews", async (req, res) => {
  const auth = authOf(req);
  const crewIds = await visibleCrewIds(auth);

  const crews = await Crew.find({ companyId: auth.companyId, ...(crewIds && { _id: { $in: crewIds } }) })
    .sort({ sortOrder: 1 })
    .lean();
  const people = await User.find(
    { _id: { $in: crews.flatMap((crew) => [crew.leadId, ...crew.memberIds]) } },
    { name: 1, title: 1 },
  ).lean();
  const person = (id: Types.ObjectId) => {
    const found = people.find((candidate) => candidate._id.equals(id));
    return found ? { id: found._id, name: found.name, title: found.title ?? null } : null;
  };

  res.json(
    crews.map((crew) => ({
      id: crew._id,
      name: crew.name,
      van: crew.van,
      lead: person(crew.leadId),
      members: crew.memberIds.map(person).filter(Boolean),
    })),
  );
});

type JobLean = Awaited<ReturnType<typeof findJobs>>[number];

function findJobs(filter: Record<string, unknown>) {
  return Job.find(filter, { portalToken: 0, timeline: 0, description: 0 }).sort({ scheduledStart: 1, number: 1 }).lean();
}

/** Attaches the customer's name and the street to each job, in two queries rather than one per job. */
async function withCustomers(jobs: JobLean[]) {
  const [customers, properties] = await Promise.all([
    Customer.find({ _id: { $in: jobs.map((job) => job.customerId) } }, { name: 1, kind: 1 }).lean(),
    Property.find({ _id: { $in: jobs.map((job) => job.propertyId) } }, { street: 1, city: 1, location: 1 }).lean(),
  ]);

  return jobs.map((job) => {
    const customer = customers.find((candidate) => candidate._id.equals(job.customerId));
    const property = properties.find((candidate) => candidate._id.equals(job.propertyId));
    return {
      id: job._id,
      number: job.number,
      title: job.title,
      status: job.status,
      priority: job.priority,
      crewId: job.crewId,
      scheduledStart: job.scheduledStart,
      scheduledEnd: job.scheduledEnd,
      estimatedMinutes: job.estimatedMinutes,
      schedulingNote: job.schedulingNote ?? null,
      requestedAt: job.requestedAt,
      customer: customer ? { name: customer.name, kind: customer.kind } : null,
      address: property ? { street: property.street, city: property.city } : null,
      // The map needs to know where the work is.
      location: property?.location ? { lat: property.location.lat, lng: property.location.lng } : null,
    };
  });
}

const dayQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
    .optional(),
});

router.get("/jobs", async (req, res) => {
  const auth = authOf(req);
  const parsed = dayQuery.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid date");

  const company = await Company.findById(auth.companyId, { timezone: 1, demoCycleStartedAt: 1 }).lean();
  if (!company) throw ApiError.unauthorized();

  // "Today" is today where the business is, not where the server is.
  const date = parsed.data.date ?? dateIn(new Date(), company.timezone);
  const { start, end } = dayRange(date, company.timezone);
  const crewIds = await visibleCrewIds(auth);

  const jobs = await findJobs({
    companyId: auth.companyId,
    scheduledStart: { $gte: start, $lt: end },
    status: { $ne: "cancelled" },
    ...(crewIds && { crewId: { $in: crewIds } }),
  });

  res.json({ date, timezone: company.timezone, demo: demoClockPayload(company.demoCycleStartedAt), jobs: await withCustomers(jobs) });
});

router.get("/jobs/unscheduled", requireRole("owner", "dispatcher"), async (req, res) => {
  const auth = authOf(req);
  const jobs = await findJobs({ companyId: auth.companyId, status: "unscheduled" });

  const urgency = { urgent: 0, high: 1, normal: 2 } as const;
  const ordered = (await withCustomers(jobs)).sort(
    (a, b) => urgency[a.priority] - urgency[b.priority] || a.requestedAt.getTime() - b.requestedAt.getTime(),
  );
  res.json(ordered);
});

// ---- one job ---------------------------------------------------------------------
// Declared after /jobs/unscheduled so that path is never read as a job id.

router.get("/jobs/:id", async (req, res) => {
  const auth = authOf(req);
  const job = await findVisibleJob(auth, req.params.id as string);

  const [customer, property, crew, quote, invoice] = await Promise.all([
    Customer.findById(job.customerId, { name: 1, kind: 1, phone: 1, email: 1 }).lean(),
    Property.findById(job.propertyId).lean(),
    job.crewId ? Crew.findById(job.crewId, { name: 1, van: 1 }).lean() : null,
    Quote.findOne({ jobId: job._id }, { number: 1, status: 1, lineItems: 1 }).sort({ createdAt: -1 }).lean(),
    Invoice.findOne({ jobId: job._id }, { number: 1, status: 1, lineItems: 1 }).sort({ issuedAt: -1 }).lean(),
  ]);
  const office = auth.role !== "technician";

  res.json({
    id: job._id,
    number: job.number,
    title: job.title,
    description: job.description ?? null,
    status: job.status,
    priority: job.priority,
    scheduledStart: job.scheduledStart,
    scheduledEnd: job.scheduledEnd,
    estimatedMinutes: job.estimatedMinutes,
    schedulingNote: job.schedulingNote ?? null,
    requestedAt: job.requestedAt,
    crew: crew ? { id: crew._id, name: crew.name, van: crew.van } : null,
    customer: customer
      ? { name: customer.name, kind: customer.kind, phone: customer.phone ?? null, email: customer.email ?? null }
      : null,
    property: property
      ? {
          street: property.street,
          city: property.city,
          state: property.state,
          zip: property.zip,
          accessNotes: property.accessNotes ?? null,
          equipment: property.equipment.map(({ kind, make, model, installedYear }) => ({ kind, make, model, installedYear })),
        }
      : null,
    timeline: job.timeline.map((entry) => ({ status: entry.status, at: entry.at })),
    quote: quote ? { number: quote.number, status: quote.status, totalCents: totalCents(quote.lineItems) } : null,
    invoice: invoice ? { number: invoice.number, status: invoice.status, totalCents: totalCents(invoice.lineItems) } : null,
    // The office can open exactly what the customer sees; a technician has no need to.
    portalToken: office ? job.portalToken : null,
    actions: {
      statuses: allowedStatuses(auth.role, job.status),
      reschedule: canReschedule(auth.role, job.status),
      unschedule: office && ["scheduled", "parts_on_order"].includes(job.status),
    },
  });
});

const scheduleBody = z
  .object({
    crewId: z.string().min(1, "Choose a crew"),
    start: z.iso.datetime({ offset: true, message: "Start must be a date and time" }),
    end: z.iso.datetime({ offset: true, message: "End must be a date and time" }),
  })
  .strict();

router.patch("/jobs/:id/schedule", requireRole("owner", "dispatcher"), async (req, res) => {
  const parsed = scheduleBody.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid schedule");

  await scheduleJob(authOf(req), req.params.id as string, {
    crewId: parsed.data.crewId,
    start: new Date(parsed.data.start),
    end: new Date(parsed.data.end),
  });
  res.status(204).end();
});

router.post("/jobs/:id/unschedule", requireRole("owner", "dispatcher"), async (req, res) => {
  await unscheduleJob(authOf(req), req.params.id as string);
  res.status(204).end();
});

const statusBody = z
  .object({
    from: z.enum(JOB_STATUSES),
    to: z.enum(JOB_STATUSES),
  })
  .strict();

router.patch("/jobs/:id/status", async (req, res) => {
  const parsed = statusBody.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Say which status the job is moving from and to");

  await changeStatus(authOf(req), req.params.id as string, parsed.data.from, parsed.data.to);
  res.status(204).end();
});

export default router;
