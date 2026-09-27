import { Router } from "express";

import { ApiError } from "../lib/ApiError";
import { contains } from "../lib/contains";
import { dateIn } from "../lib/dates";
import { authOf, requireAuth, requireRole } from "../middleware/auth";
import { Company, Customer, Job, Property } from "../models";

const router = Router();

/**
 * Search is an office tool, for the same reason the customer book is.
 *
 * A technician gets the jobs on their own crew from their own day; being able
 * to type a stranger's surname and read their address is a different thing.
 */
router.use("/search", requireAuth, requireRole("owner", "dispatcher"));

/** Short enough to stay quick, long enough to be worth showing. */
const PER_KIND = 6;
/** One letter matches half the book, so the client is told to wait for two. */
const SHORTEST = 2;

/**
 * One box over the jobs and the people.
 *
 * The office knows a job by its number, a customer by their name and a house
 * by its street, and which of those someone has in their head changes by the
 * hour. So all three go in one box and the answer says which kind each hit is.
 */
router.get("/search", async (req, res) => {
  const auth = authOf(req);
  const query = String(req.query.q ?? "").trim();
  if (query.length < SHORTEST) {
    res.json({ query, jobs: [], customers: [] });
    return;
  }

  const company = await Company.findById(auth.companyId, { timezone: 1 }).lean();
  if (!company) throw ApiError.unauthorized();

  const scoped = { companyId: auth.companyId };
  const term = contains(query);
  // "4471" should find job #4471 before it finds a phone number containing it.
  const asNumber = /^\d+$/.test(query) ? Number(query) : null;

  const [byPerson, byAddress] = await Promise.all([
    Customer.find(
      { ...scoped, $or: [{ name: term }, { phone: term }, { email: term }] },
      { name: 1, kind: 1, phone: 1 },
    )
      .limit(PER_KIND)
      .lean(),
    // Half the time the office knows the house rather than who owns it.
    Property.find({ ...scoped, $or: [{ street: term }, { city: term }] }, { customerId: 1, street: 1, city: 1 })
      .limit(PER_KIND)
      .lean(),
  ]);

  // Somebody typing a surname wants that customer's work, not only a job whose
  // title happens to contain it - "Osei" has to find her no-heat call even
  // though her name appears nowhere in the words of it.
  const matchedPeople = [...new Set([...byPerson, ...byAddress.map((property) => ({ _id: property.customerId }))].map((row) => String(row._id)))];

  const jobs = await Job.find(
    {
      ...scoped,
      $or: [
        { title: term },
        ...(asNumber === null ? [] : [{ number: asNumber }]),
        ...(matchedPeople.length > 0 ? [{ customerId: { $in: matchedPeople } }] : []),
      ],
    },
    { number: 1, title: 1, status: 1, scheduledStart: 1, customerId: 1, propertyId: 1 },
  )
    .sort({ scheduledStart: -1 })
    .limit(PER_KIND)
    .lean();

  // A job is not recognisable as a number and a title alone; it needs whose it
  // is and where.
  const [jobCustomers, jobProperties, addressOwners] = await Promise.all([
    Customer.find({ _id: { $in: jobs.map((job) => job.customerId) } }, { name: 1 }).lean(),
    Property.find({ _id: { $in: jobs.map((job) => job.propertyId) } }, { street: 1, city: 1 }).lean(),
    Customer.find({ _id: { $in: byAddress.map((property) => property.customerId) } }, { name: 1, kind: 1, phone: 1 }).lean(),
  ]);

  const nameOf = new Map(jobCustomers.map((customer) => [String(customer._id), customer.name]));
  const placeOf = new Map(jobProperties.map((property) => [String(property._id), property]));

  // Somebody found by both their name and their street is one person.
  const people = new Map<string, { _id: unknown; name: string; kind: string; phone?: string | null }>();
  for (const customer of [...byPerson, ...addressOwners]) people.set(String(customer._id), customer);
  const streetOf = new Map<string, string>();
  for (const property of byAddress) streetOf.set(String(property.customerId), `${property.street}, ${property.city}`);

  res.json({
    query,
    jobs: jobs.map((job) => {
      const place = placeOf.get(String(job.propertyId));
      return {
        id: String(job._id),
        number: job.number,
        title: job.title,
        status: job.status,
        customer: nameOf.get(String(job.customerId)) ?? null,
        where: place ? `${place.street}, ${place.city}` : null,
        // The board shows one day at a time, so a link to a job has to carry
        // the day it is on or it lands on today and the job is not there.
        date: job.scheduledStart ? dateIn(job.scheduledStart, company.timezone) : null,
      };
    }),
    customers: [...people.values()].slice(0, PER_KIND).map((customer) => ({
      id: String(customer._id),
      name: customer.name,
      kind: customer.kind,
      // Whichever of the two made them a match is the useful second line.
      detail: streetOf.get(String(customer._id)) ?? customer.phone ?? null,
    })),
  });
});

export default router;
