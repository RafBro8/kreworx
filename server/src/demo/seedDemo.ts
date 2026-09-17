import { randomBytes } from "node:crypto";

import type { Types } from "mongoose";

import { env } from "../config/env";
import { dateIn } from "../lib/dates";
import { Company, Counter, Crew, Customer, Invoice, Job, Property, Quote, User } from "../models";
import { buildDemo } from "./buildDemo";
import { COMPANY, CREWS, STAFF, staffEmail } from "./northline";

/**
 * Writes the Northline demo into the database.
 *
 * Staff and crews are updated in place, so their ids — and therefore anyone's
 * signed-in session — survive a refresh. Everything operational (customers,
 * jobs, quotes, invoices) is replaced wholesale. Portal links are carried over
 * by job number, so a customer link someone saved yesterday still opens.
 *
 * Only documents belonging to the demo company are ever touched.
 */
export async function seedDemo(now: Date = new Date()): Promise<{ companyId: Types.ObjectId; today: string; jobs: number }> {
  const company = await Company.findOneAndUpdate(
    { slug: COMPANY.slug },
    { $set: { ...COMPANY, isDemo: true } },
    { upsert: true, returnDocument: "after" },
  );
  const companyId = company!._id;

  const userIds = new Map<string, Types.ObjectId>();
  for (const person of STAFF) {
    const user = await User.findOneAndUpdate(
      { email: staffEmail(person.key) },
      { $set: { companyId, name: person.name, role: person.role, title: person.title, startedYear: person.startedYear, isDemo: true } },
      { upsert: true, returnDocument: "after" },
    );
    userIds.set(person.key, user!._id);
  }

  const crewIds = new Map<string, Types.ObjectId>();
  for (const [index, crew] of CREWS.entries()) {
    const saved = await Crew.findOneAndUpdate(
      { companyId, name: crew.name },
      { $set: { van: crew.van, leadId: userIds.get(crew.lead), memberIds: crew.members.map((key) => userIds.get(key)), sortOrder: index } },
      { upsert: true, returnDocument: "after" },
    );
    crewIds.set(crew.key, saved!._id);
  }

  const previousTokens = new Map(
    (await Job.find({ companyId }, { number: 1, portalToken: 1 }).lean()).map((job) => [job.number, job.portalToken]),
  );
  const plan = buildDemo(now, (number) => previousTokens.get(number) ?? randomBytes(24).toString("base64url"));

  const scoped = { companyId };
  await Promise.all([
    Customer.deleteMany(scoped),
    Property.deleteMany(scoped),
    Job.deleteMany(scoped),
    Quote.deleteMany(scoped),
    Invoice.deleteMany(scoped),
  ]);

  await Customer.insertMany(plan.customers.map(({ key: _key, ...customer }) => ({ ...customer, companyId })));
  await Property.insertMany(plan.properties.map((property) => ({ ...property, companyId })));
  await Job.insertMany(
    plan.jobs.map(({ crew, ...job }) => ({ ...job, companyId, crewId: crew ? crewIds.get(crew) : null })),
  );
  await Quote.insertMany(plan.quotes.map((quote) => ({ ...quote, companyId })));
  await Invoice.insertMany(plan.invoices.map((invoice) => ({ ...invoice, companyId })));

  // New jobs created through the app pick up numbering after the seeded ones.
  const highest = Math.max(...plan.jobs.map((job) => job.number));
  await Counter.updateOne({ companyId, key: "job" }, { $set: { seq: highest } }, { upsert: true });

  await Company.updateOne({ _id: companyId }, { $set: { demoSeededFor: plan.today } });

  return { companyId, today: plan.today, jobs: plan.jobs.length };
}

let refreshing: Promise<void> | null = null;

/**
 * Re-seeds when the demo was built for a different day than today in Mokena,
 * so the board always shows this week rather than the week it was deployed.
 * Cheap when nothing is due: one indexed lookup.
 */
export function ensureDemoIsFresh(now: Date = new Date()): Promise<void> {
  if (!env.demoMode) return Promise.resolve();

  // Concurrent callers share the one refresh in flight rather than racing it.
  refreshing ??= (async () => {
    try {
      const company = await Company.findOne({ slug: COMPANY.slug }, { demoSeededFor: 1 }).lean();
      if (company?.demoSeededFor === dateIn(now, COMPANY.timezone)) return;
      const result = await seedDemo(now);
      console.log(`Demo refreshed for ${result.today}: ${result.jobs} jobs`);
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}
