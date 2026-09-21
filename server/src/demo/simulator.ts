import { env } from "../config/env";
import { dateIn, dayRange, minutesIn } from "../lib/dates";
import { Company, Job } from "../models";
import type { JobStatus } from "../models/Job";
import { notifyCompany, notifyJob } from "../realtime/io";
import { demoClock } from "./clock";
import { COMPANY } from "./northline";
import { seedDemo } from "./seedDemo";

/**
 * Walks the demo day forward.
 *
 * Every tick it works out where the fast clock has reached and moves jobs to
 * the status they would have at that moment: a crew sets off shortly before
 * their window, is on site during it, and is done after. Each change is a
 * normal status change, so the board and the customer's link both see it the
 * same way anyone else's change arrives.
 *
 * Three rules keep it from fighting the person using the demo:
 *  - it only ever moves a job forwards,
 *  - it leaves alone anything a person has touched,
 *  - and it never touches work that is blocked or waiting on a customer.
 */

/** Crews set off this long before their window opens. */
const TRAVEL_MINUTES = 20;

/** How far along the day each status is, so the simulator only moves forwards. */
const PROGRESS: Partial<Record<JobStatus, number>> = { scheduled: 0, en_route: 1, on_site: 2, done: 3 };

/** Statuses the simulator will not disturb: the customer or the parts van decides these. */
const LEAVE_ALONE: readonly JobStatus[] = ["unscheduled", "cancelled", "awaiting_approval", "parts_on_order"];

export function statusAt(demoMinutes: number, startMinutes: number, endMinutes: number): JobStatus {
  if (demoMinutes >= endMinutes) return "done";
  if (demoMinutes >= startMinutes) return "on_site";
  if (demoMinutes >= startMinutes - TRAVEL_MINUTES) return "en_route";
  return "scheduled";
}

/**
 * One step of the demo day. Called on a timer while DEMO_MODE is on.
 * Returns what it did, which is what the tests read.
 */
export async function tickDemo(now: Date = new Date()): Promise<{ moved: number; rebuilt: boolean }> {
  if (!env.demoMode) return { moved: 0, rebuilt: false };

  const company = await Company.findOne(
    { slug: COMPANY.slug, isDemo: true },
    { timezone: 1, demoCycleStartedAt: 1 },
  ).lean();
  if (!company) return { moved: 0, rebuilt: false };

  const clock = demoClock(now, company.demoCycleStartedAt);

  // The day has run its course: build a fresh one and start the hour again.
  if (clock.finished) {
    await seedDemo(now);
    notifyCompany(company._id.toString(), { jobId: "", dates: [], reason: "demo-reset" });
    return { moved: 0, rebuilt: true };
  }

  const today = dateIn(now, company.timezone);
  const { start, end } = dayRange(today, company.timezone);
  const jobs = await Job.find({
    companyId: company._id,
    scheduledStart: { $gte: start, $lt: end },
    status: { $nin: LEAVE_ALONE },
    manualOverride: { $ne: true },
  }).lean();

  let moved = 0;
  for (const job of jobs) {
    if (!job.scheduledStart || !job.scheduledEnd) continue;

    const next = statusAt(
      clock.minutes,
      minutesIn(job.scheduledStart, company.timezone),
      minutesIn(job.scheduledEnd, company.timezone),
    );
    const forwards = (PROGRESS[next] ?? 0) > (PROGRESS[job.status] ?? 0);
    if (!forwards) continue;

    const updated = await Job.updateOne(
      { _id: job._id, status: job.status },
      { $set: { status: next }, $push: { timeline: { status: next, at: now } } },
    );
    if (updated.modifiedCount === 0) continue;

    moved += 1;
    notifyCompany(company._id.toString(), { jobId: job._id.toString(), dates: [today], reason: "simulated" });
    notifyJob(job._id.toString(), { status: next });
  }

  return { moved, rebuilt: false };
}
