import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { env } from "../config/env";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { seedDemo } from "../demo/seedDemo";
import { Company, Crew, ensureIndexes, Job } from "../models";

const app = createApp();

async function signIn(name: string): Promise<string> {
  const accounts = (await request(app).get("/api/auth/demo-accounts")).body as { staff: { id: string; name: string }[] };
  const person = accounts.staff.find((candidate) => candidate.name === name)!;
  const response = await request(app).post("/api/auth/demo").send({ userId: person.id });
  return response.headers["set-cookie"]![0]!.split(";")[0]!;
}

describe("resetting the demo", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_demo_test"));
    await ensureIndexes();
  });

  beforeEach(async () => {
    await seedDemo();
  });

  afterEach(() => {
    (env as { demoMode: boolean }).demoMode = true;
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  it("undoes what a visitor did to the shared demo", async () => {
    const owner = await signIn("Renee Castillo");
    const pruitt = await Job.findOne({ number: 4474 }).lean();
    const novak = await Crew.findOne({ name: "Novak" }).lean();

    // A visitor cancels one job and drags another to a different van.
    await request(app).patch(`/api/jobs/${pruitt!._id.toString()}/status`).set("Cookie", owner).send({ from: "scheduled", to: "cancelled" });
    const moved = await Job.findOneAndUpdate({ number: 4476 }, { $set: { crewId: novak!._id } });
    expect(moved).not.toBeNull();

    const response = await request(app).post("/api/demo/reset").set("Cookie", owner);

    expect(response.status).toBe(204);
    expect((await Job.findOne({ number: 4474 }).lean())!.status).toBe("scheduled");
    expect(await Job.countDocuments({ status: "cancelled" })).toBe(0);
  });

  it("is the owner's button, not everyone's", async () => {
    expect((await request(app).post("/api/demo/reset").set("Cookie", await signIn("Dana Morales"))).status).toBe(403);
    expect((await request(app).post("/api/demo/reset").set("Cookie", await signIn("Tomas Delgado"))).status).toBe(403);
    expect((await request(app).post("/api/demo/reset")).status).toBe(401);
  });

  it("does not exist outside a demo deployment", async () => {
    const owner = await signIn("Renee Castillo");
    (env as { demoMode: boolean }).demoMode = false;

    expect((await request(app).post("/api/demo/reset").set("Cookie", owner)).status).toBe(404);
  });

  it("refuses to rebuild a company that is not flagged as a demo", async () => {
    const owner = await signIn("Renee Castillo");
    await Company.updateOne({ slug: "northline" }, { $set: { isDemo: false } });

    const response = await request(app).post("/api/demo/reset").set("Cookie", owner);

    expect(response.status).toBe(403);
    await Company.updateOne({ slug: "northline" }, { $set: { isDemo: true } });
  });

  it("collapses two people pressing it at once into one rebuild", async () => {
    const owner = await signIn("Renee Castillo");
    const before = await Job.countDocuments({});

    const [first, second] = await Promise.all([
      request(app).post("/api/demo/reset").set("Cookie", owner),
      request(app).post("/api/demo/reset").set("Cookie", owner),
    ]);

    expect([first.status, second.status]).toEqual([204, 204]);
    expect(await Job.countDocuments({})).toBe(before);
  });
});
