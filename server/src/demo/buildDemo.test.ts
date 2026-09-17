import { describe, expect, it } from "vitest";

import { dateIn, minutesIn } from "../lib/dates";
import { totalCents } from "../models/lineItems";
import { buildDemo } from "./buildDemo";

const TZ = "America/Chicago";
// A Wednesday morning in Mokena.
const NOW = new Date("2026-09-16T15:23:00Z");
const plan = buildDemo(NOW, (number) => `token-${number}`);

const todays = plan.jobs.filter((job) => job.scheduledStart && dateIn(job.scheduledStart, TZ) === plan.today);

describe("the Northline demo", () => {
  it("is built for today in Mokena", () => {
    expect(plan.today).toBe("2026-09-16");
  });

  it("matches the dispatch design: 11 jobs today, 4 done, 3 waiting to be scheduled", () => {
    expect(todays).toHaveLength(11);
    expect(todays.filter((job) => job.status === "done")).toHaveLength(4);
    expect(plan.jobs.filter((job) => job.status === "unscheduled")).toHaveLength(3);
  });

  it("puts job #4471 at Amara Osei's, with Tomas on the way and her quote at $379", () => {
    const job = plan.jobs.find((candidate) => candidate.number === 4471)!;
    const customer = plan.customers.find((candidate) => candidate._id.equals(job.customerId))!;
    const quote = plan.quotes.find((candidate) => candidate.jobId.equals(job._id))!;

    expect(customer.name).toBe("Amara Osei");
    expect(job.crew).toBe("delgado");
    expect(job.status).toBe("en_route");
    expect(minutesIn(job.scheduledStart!, TZ)).toBe(10 * 60 + 30);
    expect(quote.status).toBe("sent");
    expect(totalCents(quote.lineItems)).toBe(379_00);
  });

  it("invoices $4,180 today", () => {
    const issuedToday = plan.invoices.filter((invoice) => dateIn(invoice.issuedAt, TZ) === plan.today);
    expect(issuedToday.reduce((sum, invoice) => sum + totalCents(invoice.lineItems), 0)).toBe(4_180_00);
  });

  it("has three quotes waiting on customers", () => {
    expect(plan.quotes.filter((quote) => quote.status === "sent")).toHaveLength(3);
  });

  it("never double-books a crew", () => {
    const scheduled = plan.jobs.filter((job) => job.crew && job.scheduledStart);
    for (const job of scheduled) {
      const overlaps = scheduled.filter(
        (other) =>
          other !== job &&
          other.crew === job.crew &&
          other.scheduledStart! < job.scheduledEnd! &&
          other.scheduledEnd! > job.scheduledStart!,
      );
      expect(overlaps, `#${job.number} overlaps`).toEqual([]);
    }
  });

  it("gives every job a unique number and token, and a property belonging to its customer", () => {
    expect(new Set(plan.jobs.map((job) => job.number)).size).toBe(plan.jobs.length);
    expect(new Set(plan.jobs.map((job) => job.portalToken)).size).toBe(plan.jobs.length);
    for (const job of plan.jobs) {
      const property = plan.properties.find((candidate) => candidate._id.equals(job.propertyId))!;
      expect(property.customerId.equals(job.customerId)).toBe(true);
    }
  });

  it("only marks work done if it has already happened", () => {
    for (const job of plan.jobs.filter((candidate) => candidate.status === "done")) {
      expect(job.scheduledStart!.getTime()).toBeLessThan(NOW.getTime());
    }
    for (const job of plan.jobs.filter((candidate) => candidate.scheduledStart && dateIn(candidate.scheduledStart, TZ) > plan.today)) {
      expect(job.status).toBe("scheduled");
    }
  });

  it("is the same business every time it is built for the same moment", () => {
    const again = buildDemo(NOW, (number) => `token-${number}`);
    const shape = (p: typeof plan) => p.jobs.map((job) => [job.number, job.title, job.crew, job.scheduledStart?.toISOString()]);
    expect(shape(again)).toEqual(shape(plan));
  });

  it("lands on weekdays either side of a Monday", () => {
    const monday = buildDemo(new Date("2026-09-14T15:00:00Z"), (number) => `t${number}`);
    const days = new Set(monday.jobs.filter((job) => job.scheduledStart).map((job) => new Date(dateIn(job.scheduledStart!, TZ)).getUTCDay()));
    expect(days.has(0)).toBe(false);
    expect(days.has(6)).toBe(false);
  });
});
