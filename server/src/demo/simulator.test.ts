import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase } from "../config/db";
import { dateIn, zonedTime } from "../lib/dates";
import { ensureIndexes, Job } from "../models";
import { Company } from "../models";
import { CYCLE_MS, DAY_END_MINUTES, STORY_START_MINUTES } from "./clock";
import { seedDemo } from "./seedDemo";
import { statusAt, tickDemo } from "./simulator";

const TZ = "America/Chicago";

/** When the current run of the demo day began. */
async function cycleStart(): Promise<number> {
  const company = await Company.findOne({ slug: "northline" }, { demoCycleStartedAt: 1 }).lean();
  return company!.demoCycleStartedAt!.getTime();
}

/** A real instant that puts the demo clock at a given minute of the day. */
async function whenClockReads(demoMinutes: number): Promise<Date> {
  const through = (demoMinutes - STORY_START_MINUTES) / (DAY_END_MINUTES - STORY_START_MINUTES);
  return new Date((await cycleStart()) + Math.min(through, 0.999) * CYCLE_MS);
}

const statusOf = async (number: number) => (await Job.findOne({ number }, { status: 1 }).lean())!.status;

describe("statusAt", () => {
  it("walks a job from scheduled to done as the day passes it", () => {
    const start = 10 * 60 + 30;
    const end = 12 * 60 + 30;

    expect(statusAt(9 * 60, start, end)).toBe("scheduled");
    expect(statusAt(start - 5, start, end)).toBe("en_route");
    expect(statusAt(start, start, end)).toBe("on_site");
    expect(statusAt(end - 1, start, end)).toBe("on_site");
    expect(statusAt(end, start, end)).toBe("done");
  });
});

describe("the demo day", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_sim_test"));
    await ensureIndexes();
  });

  beforeEach(async () => {
    await seedDemo();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  it("sends Tomas in and finishes his job as the clock passes the window", async () => {
    // Amara's job runs 10:30 to 12:30, and starts the demo en route.
    expect(await statusOf(4471)).toBe("en_route");

    await tickDemo(await whenClockReads(10 * 60 + 45));
    expect(await statusOf(4471)).toBe("on_site");

    await tickDemo(await whenClockReads(13 * 60));
    expect(await statusOf(4471)).toBe("done");
  });

  it("records each move on the timeline, so the history is real", async () => {
    await tickDemo(await whenClockReads(10 * 60 + 45));

    const job = await Job.findOne({ number: 4471 }).lean();
    expect(job!.timeline.at(-1)).toMatchObject({ status: "on_site" });
  });

  it("never moves a job backwards when the clock is behind it", async () => {
    await tickDemo(await whenClockReads(13 * 60));
    expect(await statusOf(4471)).toBe("done");

    await tickDemo(await whenClockReads(STORY_START_MINUTES));
    expect(await statusOf(4471)).toBe("done");
  });

  it("leaves work that is waiting on parts or a customer where it is", async () => {
    // #4473 is blocked on a compressor that has not arrived.
    expect(await statusOf(4473)).toBe("parts_on_order");
    await tickDemo(await whenClockReads(DAY_END_MINUTES));
    expect(await statusOf(4473)).toBe("parts_on_order");
  });

  it("stops touching a job once a person has changed it", async () => {
    const pruitt = await Job.findOne({ number: 4474 }).lean();
    await Job.updateOne({ _id: pruitt!._id }, { $set: { status: "scheduled", manualOverride: true } });

    await tickDemo(await whenClockReads(DAY_END_MINUTES));

    expect(await statusOf(4474)).toBe("scheduled");
    // Everything else still finished, so this is not the simulator sitting idle.
    expect(await statusOf(4471)).toBe("done");
  });

  it("does not disturb other days", async () => {
    const today = dateIn(new Date(), TZ);
    const tomorrow = await Job.findOne({ scheduledStart: { $gte: zonedTime(today, 24 * 60, TZ) } }).lean();

    await tickDemo(await whenClockReads(DAY_END_MINUTES));

    expect((await Job.findById(tomorrow!._id).lean())!.status).toBe(tomorrow!.status);
  });

  it("rebuilds the day once the hour it was given has run out", async () => {
    await tickDemo(await whenClockReads(12 * 60));
    await tickDemo(await whenClockReads(DAY_END_MINUTES));
    expect(await statusOf(4471)).toBe("done");

    const result = await tickDemo(new Date((await cycleStart()) + CYCLE_MS + 1000));

    expect(result.rebuilt).toBe(true);
    expect(await statusOf(4471)).toBe("en_route");
  });

  it("counts the new hour from the rebuild, so a fresh day is not instantly fast-forwarded", async () => {
    const wasStartedAt = await cycleStart();
    await tickDemo(new Date(wasStartedAt + CYCLE_MS + 1000));

    expect(await cycleStart()).toBeGreaterThan(wasStartedAt);
    // A tick moments later leaves the morning alone rather than racing to the end.
    await tickDemo(new Date((await cycleStart()) + 5000));
    expect(await statusOf(4471)).toBe("en_route");
  });

  it("reports how many jobs it moved, and moves nothing twice", async () => {
    const first = await tickDemo(await whenClockReads(11 * 60));
    expect(first.moved).toBeGreaterThan(0);

    const again = await tickDemo(await whenClockReads(11 * 60));
    expect(again.moved).toBe(0);
  });
});
