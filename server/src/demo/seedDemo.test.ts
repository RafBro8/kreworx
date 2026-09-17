import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connectDatabase, disconnectDatabase } from "../config/db";
import { Company, Customer, ensureIndexes, Job } from "../models";
import { DEMO_SEED_VERSION, ensureDemoIsFresh, seedDemo } from "./seedDemo";

/** Whether a refresh rebuilt the data: rebuilt jobs get new ids. */
async function oseiJobId(): Promise<string> {
  return (await Job.findOne({ number: 4471 }, { _id: 1 }).lean())!._id.toString();
}

describe("keeping the demo fresh", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_seed_test"));
    await ensureIndexes();
  });

  beforeEach(async () => {
    await seedDemo();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  it("leaves a demo alone when it was built today by the current script", async () => {
    const before = await oseiJobId();
    await ensureDemoIsFresh();
    expect(await oseiJobId()).toBe(before);
  });

  it("rebuilds when the day has changed in Mokena", async () => {
    const before = await oseiJobId();
    await ensureDemoIsFresh(new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect(await oseiJobId()).not.toBe(before);
    await seedDemo();
  });

  it("rebuilds on the same day when an older script built it, so a deploy that changes the demo shows at once", async () => {
    await Company.updateOne({ slug: "northline" }, { $set: { demoSeedVersion: DEMO_SEED_VERSION - 1 } });
    await Customer.updateMany({}, { $unset: { phone: 1 } });
    const before = await oseiJobId();

    await ensureDemoIsFresh();

    expect(await oseiJobId()).not.toBe(before);
    expect((await Company.findOne({ slug: "northline" }).lean())!.demoSeedVersion).toBe(DEMO_SEED_VERSION);
    expect(await Customer.countDocuments({ phone: { $exists: true } })).toBeGreaterThan(0);
  });

  it("keeps the customer's link the same across a rebuild", async () => {
    const before = (await Job.findOne({ number: 4471 }).lean())!.portalToken;
    await Company.updateOne({ slug: "northline" }, { $set: { demoSeedVersion: 0 } });
    await ensureDemoIsFresh();
    expect((await Job.findOne({ number: 4471 }).lean())!.portalToken).toBe(before);
  });
});
