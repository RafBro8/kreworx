import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { SESSION_COOKIE, signSession } from "../auth/session";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { seedDemo } from "../demo/seedDemo";
import { Company, Customer, ensureIndexes, Job, User } from "../models";

const app = createApp();

type Hit = { id: string; number?: number; title?: string; name?: string; detail?: string | null; date?: string | null };

let mongo: MongoMemoryServer;
let office: string;
let technician: string;

async function cookieFor(role: "owner" | "dispatcher" | "technician"): Promise<string> {
  const user = await User.findOne({ role }).lean();
  return `${SESSION_COOKIE}=${signSession({
    userId: String(user!._id),
    companyId: String(user!.companyId),
    role,
  })}`;
}

const search = (query: string, cookie: string) =>
  request(app).get(`/api/search?q=${encodeURIComponent(query)}`).set("Cookie", cookie);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri());
  await ensureIndexes();
  await seedDemo();
  office = await cookieFor("dispatcher");
  technician = await cookieFor("technician");
}, 120_000);

afterAll(async () => {
  await disconnectDatabase();
  await mongo.stop();
});

describe("one box over the jobs and the people", () => {
  it("finds a job by its number, and says which day to look on", async () => {
    const response = await search("4471", office);

    expect(response.status).toBe(200);
    const job = (response.body.jobs as Hit[]).find((hit) => hit.number === 4471)!;
    expect(job.title).toBe("No heat - priority");
    // Without the date the link lands on today and the job is not there.
    expect(job.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("finds a customer by name and a house by its street", async () => {
    const byName = await search("Osei", office);
    expect((byName.body.customers as Hit[]).map((hit) => hit.name)).toContain("Amara Osei");

    const byStreet = await search("Linden", office);
    const found = (byStreet.body.customers as Hit[]).find((hit) => hit.name === "Amara Osei")!;
    // Matched on the address, so the address is the line worth showing.
    expect(found.detail).toMatch(/Linden/);
  });

  it("finds a customer's work by their name, not only by the words in it", async () => {
    const response = await search("Osei", office);

    // Her name is nowhere in "No heat - priority", but it is her call and a
    // dispatcher typing her surname is looking for exactly that.
    const titles = (response.body.jobs as Hit[]).map((hit) => hit.title);
    expect(titles.length).toBeGreaterThan(0);
    const customer = await Customer.findOne({ name: "Amara Osei" }).lean();
    const hers = await Job.find({ customerId: customer!._id }, { _id: 1 }).lean();
    const ids = hers.map((job) => String(job._id));
    for (const hit of response.body.jobs as Hit[]) expect(ids).toContain(hit.id);
  });

  it("counts somebody found twice as one person", async () => {
    // Her name and her street both match "a", so she must not appear twice.
    const response = await search("Amara Osei", office);
    const names = (response.body.customers as Hit[]).map((hit) => hit.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("waits for a second letter rather than returning half the book", async () => {
    const response = await search("a", office);

    expect(response.status).toBe(200);
    expect(response.body.jobs).toEqual([]);
    expect(response.body.customers).toEqual([]);
  });

  it("treats a regex as the characters somebody typed", async () => {
    // A search box that compiles its input is a search box that can be made to
    // hang the server.
    const response = await search(".*", office);

    expect(response.status).toBe(200);
    expect(response.body.jobs).toEqual([]);
    expect(response.body.customers).toEqual([]);
  });

  it("is the office's, not the van's", async () => {
    expect((await search("Osei", technician)).status).toBe(403);
  });

  it("never reaches into another business", async () => {
    const rival = await Company.create({ name: "Rival Air", slug: "rival-search", trade: "Heating", timezone: "America/Chicago" });
    await Customer.create({ companyId: rival._id, name: "Amara Osei", kind: "residential", phone: "(708) 555-0900" });

    const response = await search("Osei", office);
    const found = response.body.customers as Hit[];

    // The name matches in both books; only ours may come back.
    expect(found.length).toBeGreaterThan(0);
    const ids = found.map((hit) => hit.id);
    const theirs = await Customer.find({ companyId: rival._id }, { _id: 1 }).lean();
    for (const customer of theirs) expect(ids).not.toContain(String(customer._id));
  });
});
