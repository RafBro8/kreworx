import { Types } from "mongoose";

import { addDays, dateIn, weekday, zonedTime } from "../lib/dates";
import type { JobStatus } from "../models/Job";
import type { LineItem } from "../models/lineItems";
import {
  at,
  BACKLOG,
  COMPANY,
  CREWS,
  CUSTOMERS,
  HALVORSEN_QUOTE,
  LINDQVIST_QUOTE,
  OKONKWO_QUOTE,
  OSEI_QUOTE,
  PRUITT_QUOTE,
  TEMPLATES,
  TODAY,
  town,
  TRAN_QUOTE,
  type CrewKey,
} from "./northline";

/**
 * Turns the Northline script into documents for a given moment.
 *
 * Pure apart from the token generator it is handed: the same `now` always
 * builds the same business, which is what lets the tests pin exact numbers.
 * Nothing here touches the database - `seedDemo` owns that.
 */

const TZ = COMPANY.timezone;
const PAST_WORKING_DAYS = 3;
const FUTURE_WORKING_DAYS = 4;
const DAY_OPENS = at("7:30");
const DAY_CLOSES = at("16:30");

export type TimelineEntry = { status: JobStatus; at: Date };

export type PlannedJob = {
  _id: Types.ObjectId;
  number: number;
  customerId: Types.ObjectId;
  propertyId: Types.ObjectId;
  crew: CrewKey | null;
  title: string;
  description?: string;
  priority: "normal" | "high" | "urgent";
  status: JobStatus;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  estimatedMinutes: number;
  schedulingNote?: string;
  requestedAt: Date;
  portalToken: string;
  timeline: TimelineEntry[];
};

export type PlannedQuote = {
  _id: Types.ObjectId;
  number: number;
  jobId: Types.ObjectId;
  customerId: Types.ObjectId;
  status: "sent" | "approved";
  findings: string;
  lineItems: LineItem[];
  sentAt: Date;
  respondedAt: Date | null;
  validUntil: Date;
};

export type PlannedInvoice = {
  _id: Types.ObjectId;
  number: number;
  jobId: Types.ObjectId;
  customerId: Types.ObjectId;
  status: "sent" | "paid";
  lineItems: LineItem[];
  issuedAt: Date;
  dueAt: Date;
  paidAt: Date | null;
};

export type DemoPlan = {
  today: string;
  customers: { _id: Types.ObjectId; key: string; name: string; kind: "residential" | "commercial"; phone: string }[];
  properties: {
    _id: Types.ObjectId;
    customerId: Types.ObjectId;
    street: string;
    city: string;
    state: string;
    zip: string;
    location: { lat: number; lng: number };
    accessNotes?: string;
    equipment: { kind: string; make: string; model: string; installedYear: number }[];
  }[];
  jobs: PlannedJob[];
  quotes: PlannedQuote[];
  invoices: PlannedInvoice[];
};

/** Small seeded PRNG, so generated days are stable rather than reshuffled each boot. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function workingDays(from: string, count: number, direction: 1 | -1): string[] {
  const days: string[] = [];
  let cursor = from;
  while (days.length < count) {
    cursor = addDays(cursor, direction);
    const day = weekday(cursor);
    if (day !== 0 && day !== 6) days.push(cursor);
  }
  return direction === -1 ? days.reverse() : days;
}

function roundUpToHalfHour(minutes: number): number {
  return Math.ceil(minutes / 30) * 30;
}

export function buildDemo(now: Date, tokenFor: (jobNumber: number) => string): DemoPlan {
  const random = mulberry32(4471);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const time = (date: string, clock: string | number) => zonedTime(date, typeof clock === "number" ? clock : at(clock), TZ);

  const today = dateIn(now, TZ);
  const pastDays = workingDays(today, PAST_WORKING_DAYS, -1);
  const futureDays = workingDays(today, FUTURE_WORKING_DAYS, 1);
  const [threeBack, twoBack, yesterday] = pastDays as [string, string, string];

  // ---- customers and their properties ----------------------------------
  const customerIds = new Map<string, Types.ObjectId>();
  const propertyIds = new Map<string, Types.ObjectId>();
  const customers: DemoPlan["customers"] = [];
  const properties: DemoPlan["properties"] = [];

  for (const [index, customer] of CUSTOMERS.entries()) {
    const customerId = new Types.ObjectId();
    const propertyId = new Types.ObjectId();
    customerIds.set(customer.key, customerId);
    propertyIds.set(customer.key, propertyId);

    const centre = town(customer.town);
    // 555-0100 to 555-0199 is set aside for fiction, so these numbers ring nobody.
    const phone = `(708) 555-01${String(10 + index).padStart(2, "0")}`;
    customers.push({ _id: customerId, key: customer.key, name: customer.name, kind: customer.kind, phone });
    properties.push({
      _id: propertyId,
      customerId,
      street: customer.street,
      city: customer.town,
      state: "IL",
      zip: centre.zip,
      // Up to about a mile from the town centre.
      location: {
        lat: Number((centre.lat + (random() - 0.5) * 0.03).toFixed(5)),
        lng: Number((centre.lng + (random() - 0.5) * 0.04).toFixed(5)),
      },
      accessNotes: customer.accessNotes,
      equipment: customer.equipment,
    });
  }

  const idsFor = (customerKey: string) => ({
    customerId: customerIds.get(customerKey)!,
    propertyId: propertyIds.get(customerKey)!,
  });

  // ---- jobs --------------------------------------------------------------
  type Draft = Omit<PlannedJob, "number" | "portalToken"> & { customerKey: string; day: string; invoice?: { lineItems: LineItem[]; paid: boolean } };
  const drafts: Draft[] = [];

  /** Timeline for a job that ran as planned, from booking to finish. */
  const completedTimeline = (requestedAt: Date, start: Date, end: Date): TimelineEntry[] => [
    { status: "scheduled", at: requestedAt },
    { status: "en_route", at: new Date(start.getTime() - 20 * 60_000) },
    { status: "on_site", at: new Date(start.getTime() + 3 * 60_000) },
    { status: "done", at: new Date(end.getTime() - 8 * 60_000) },
  ];

  const scheduledDraft = (options: {
    day: string;
    crew: CrewKey;
    customerKey: string;
    title: string;
    startMinutes: number;
    minutes: number;
    status: JobStatus;
    description?: string;
    lineItems?: LineItem[];
  }): Draft => {
    const start = time(options.day, options.startMinutes);
    const end = time(options.day, options.startMinutes + options.minutes);
    const requestedAt = time(addDays(options.day, -(2 + Math.floor(random() * 5))), at("9:00") + Math.floor(random() * 8) * 30);
    const done = options.status === "done";
    return {
      _id: new Types.ObjectId(),
      ...idsFor(options.customerKey),
      customerKey: options.customerKey,
      day: options.day,
      crew: options.crew,
      title: options.title,
      description: options.description,
      priority: "normal",
      status: options.status,
      scheduledStart: start,
      scheduledEnd: end,
      estimatedMinutes: options.minutes,
      requestedAt,
      timeline: done ? completedTimeline(requestedAt, start, end) : [{ status: "scheduled", at: requestedAt }],
      invoice: done && options.lineItems ? { lineItems: options.lineItems, paid: random() < 0.7 } : undefined,
    };
  };

  const minutesOf = (instant: Date, day: string) => Math.round((instant.getTime() - time(day, 0).getTime()) / 60_000);

  /**
   * Fills the gaps in one crew's day with everyday work, working forward from
   * opening time and stepping around anything already scripted into that day.
   */
  const fillCrewDay = (day: string, crew: CrewKey, status: JobStatus, target: number) => {
    const booked = drafts
      .filter((draft) => draft.day === day && draft.crew === crew)
      .map((draft) => [minutesOf(draft.scheduledStart!, day), minutesOf(draft.scheduledEnd!, day)] as const);
    const usedToday = new Set(drafts.filter((draft) => draft.day === day).map((draft) => draft.customerKey));

    let cursor = DAY_OPENS;
    let added = booked.length;
    while (added < target) {
      const template = pick(TEMPLATES);
      const minutes = roundUpToHalfHour(template.minutes);
      const clash = booked.find(([start, end]) => cursor < end && cursor + minutes > start);
      if (clash) {
        cursor = clash[1] + 30;
        continue;
      }
      if (cursor + minutes > DAY_CLOSES) break;

      const candidates = CUSTOMERS.filter((customer) => !usedToday.has(customer.key) && !BACKLOG.some((job) => job.customer === customer.key));
      if (candidates.length === 0) break;
      const customer = pick(candidates);
      usedToday.add(customer.key);

      drafts.push(scheduledDraft({ day, crew, customerKey: customer.key, title: template.title, startMinutes: cursor, minutes, status, lineItems: template.lineItems }));
      booked.push([cursor, cursor + minutes]);
      cursor += minutes + 30;
      added += 1;
    }
  };

  // Scripted visits on earlier days that today's story depends on.
  const oseiDiagnosis = scheduledDraft({ day: yesterday, crew: "delgado", customerKey: "osei", title: "No heat - diagnostic", startMinutes: at("13:00"), minutes: 90, status: "done", description: "Furnace locking out after three ignition attempts." });
  const halvorsenDiagnosis = scheduledDraft({ day: twoBack, crew: "whitfield", customerKey: "halvorsen", title: "AC not starting", startMinutes: at("10:00"), minutes: 90, status: "done" });
  const lindqvistEstimate = scheduledDraft({ day: threeBack, crew: "whitfield", customerKey: "lindqvist", title: "Estimate - furnace replacement", startMinutes: at("14:00"), minutes: 60, status: "done" });
  const okonkwoEstimate = scheduledDraft({ day: twoBack, crew: "novak", customerKey: "okonkwo", title: "Estimate - humidifier", startMinutes: at("13:30"), minutes: 60, status: "done" });
  drafts.push(oseiDiagnosis, halvorsenDiagnosis, lindqvistEstimate, okonkwoEstimate);

  for (const day of pastDays) {
    for (const crew of CREWS) fillCrewDay(day, crew.key, "done", 3);
  }

  // Today, exactly as scripted.
  const todayDrafts = TODAY.map((job) => {
    const start = time(today, job.start);
    const end = time(today, job.end);
    const requestedAt = time(addDays(today, -3), "10:00");
    const draft: Draft = {
      _id: new Types.ObjectId(),
      ...idsFor(job.customer),
      customerKey: job.customer,
      day: today,
      crew: job.crew,
      title: job.title,
      description: job.description,
      priority: job.priority ?? "normal",
      status: job.status,
      scheduledStart: start,
      scheduledEnd: end,
      estimatedMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
      requestedAt,
      timeline: [{ status: "scheduled", at: requestedAt }, ...job.events.map((event) => ({ status: event.status, at: time(today, event.at) }))],
      invoice: job.invoice,
    };
    return { number: job.number, draft };
  });

  const backlogDrafts = BACKLOG.map((job) => {
    const requestedAt = time(today, job.requestedAt);
    const draft: Draft = {
      _id: new Types.ObjectId(),
      ...idsFor(job.customer),
      customerKey: job.customer,
      day: today,
      crew: null,
      title: job.title,
      priority: job.priority,
      status: "unscheduled",
      scheduledStart: null,
      scheduledEnd: null,
      estimatedMinutes: job.minutes,
      schedulingNote: job.note,
      requestedAt,
      timeline: [],
    };
    return { number: job.number, draft };
  });

  const futureStart = drafts.length;
  for (const day of futureDays) {
    for (const crew of CREWS) fillCrewDay(day, crew.key, "scheduled", 2 + Math.floor(random() * 2));
  }

  // Number earlier work below today's scripted range and later work above it,
  // so #4471 is Amara Osei's job whatever day the demo is built on.
  const byStart = (a: Draft, b: Draft) => a.scheduledStart!.getTime() - b.scheduledStart!.getTime() || (a.crew ?? "").localeCompare(b.crew ?? "");
  const past = drafts.slice(0, futureStart).sort(byStart);
  const future = drafts.slice(futureStart).sort(byStart);
  const firstToday = Math.min(...TODAY.map((job) => job.number));
  const lastScripted = Math.max(...TODAY.map((job) => job.number), ...BACKLOG.map((job) => job.number));

  const numbered: { number: number; draft: Draft }[] = [
    ...past.map((draft, index) => ({ number: firstToday - past.length + index, draft })),
    ...todayDrafts,
    ...backlogDrafts,
    ...future.map((draft, index) => ({ number: lastScripted + 1 + index, draft })),
  ];

  const jobs: PlannedJob[] = numbered.map(({ number, draft }) => {
    const { customerKey: _customerKey, day: _day, invoice: _invoice, ...job } = draft;
    return { ...job, number, portalToken: tokenFor(number) };
  });

  const jobByNumber = new Map(jobs.map((job) => [job.number, job]));
  const jobFor = (draft: Draft) => jobs.find((job) => job._id.equals(draft._id))!;

  // ---- invoices for finished work ------------------------------------------
  const invoices: PlannedInvoice[] = numbered
    .filter(({ draft }) => draft.status === "done" && draft.invoice)
    .map(({ number, draft }) => {
      const doneAt = draft.timeline.find((entry) => entry.status === "done")!.at;
      const issuedAt = new Date(doneAt.getTime() + 15 * 60_000);
      return {
        _id: new Types.ObjectId(),
        number,
        jobId: draft._id,
        customerId: draft.customerId,
        status: draft.invoice!.paid ? "paid" : "sent",
        lineItems: draft.invoice!.lineItems,
        issuedAt,
        dueAt: new Date(issuedAt.getTime() + 14 * 24 * 60 * 60_000),
        paidAt: draft.invoice!.paid ? new Date(issuedAt.getTime() + 40 * 60_000) : null,
      };
    });

  // ---- quotes ---------------------------------------------------------------
  const quote = (job: PlannedJob, content: { findings: string; lineItems: LineItem[] }, sentAt: Date, respondedAt: Date | null): PlannedQuote => ({
    _id: new Types.ObjectId(),
    number: job.number,
    jobId: job._id,
    customerId: job.customerId,
    status: respondedAt ? "approved" : "sent",
    findings: content.findings,
    lineItems: content.lineItems,
    sentAt,
    respondedAt,
    validUntil: new Date(sentAt.getTime() + 14 * 24 * 60 * 60_000),
  });

  const quotes: PlannedQuote[] = [
    quote(jobByNumber.get(4471)!, OSEI_QUOTE, time(today, "9:58"), null),
    quote(jobByNumber.get(4473)!, HALVORSEN_QUOTE, time(twoBack, "12:40"), time(twoBack, "18:05")),
    quote(jobByNumber.get(4474)!, PRUITT_QUOTE, time(twoBack, "16:20"), time(yesterday, "8:10")),
    quote(jobByNumber.get(4475)!, TRAN_QUOTE, time(threeBack, "11:00"), time(twoBack, "9:45")),
    quote(jobFor(lindqvistEstimate), LINDQVIST_QUOTE, time(threeBack, "16:10"), null),
    quote(jobFor(okonkwoEstimate), OKONKWO_QUOTE, time(twoBack, "15:30"), null),
  ];

  return { today, customers, properties, jobs, quotes, invoices };
}
