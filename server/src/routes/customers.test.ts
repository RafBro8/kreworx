import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { seedDemo } from "../demo/seedDemo";
import { Company, Customer, ensureIndexes, Job, Property, User } from "../models";

const app = createApp();

type DemoAccounts = { staff: { id: string; name: string }[] };

async function signInAs(name: string): Promise<string> {
  const accounts = (await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts;
  const person = accounts.staff.find((candidate) => candidate.name === name)!;
  const response = await request(app).post("/api/auth/demo").send({ userId: person.id });
  return response.headers["set-cookie"]![0]!.split(";")[0]!;
}

type Row = { id: string; name: string; kind: string; towns: string[]; properties: number; jobs: number; lastVisit: string | null; billedCents: number };

describe("the customer book", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_customers_test"));
    await ensureIndexes();
    await seedDemo();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  describe("the list", () => {
    it("names everyone the business works for, in alphabetical order", async () => {
      const cookie = await signInAs("Dana Morales");
      const response = await request(app).get("/api/customers").set("Cookie", cookie);

      expect(response.status).toBe(200);
      const names = (response.body as Row[]).map((row) => row.name);
      expect(names.length).toBeGreaterThan(5);
      expect(names).toEqual([...names].sort());
      expect(names).toContain("Amara Osei");
    });

    it("counts each customer's work and what they have been billed", async () => {
      const cookie = await signInAs("Dana Morales");
      const rows = (await request(app).get("/api/customers").set("Cookie", cookie)).body as Row[];
      const amara = rows.find((row) => row.name === "Amara Osei")!;

      expect(amara).toMatchObject({ kind: "residential", towns: ["Mokena"], properties: 1 });
      expect(amara.jobs).toBeGreaterThan(0);

      // Brightway has been invoiced, so its total is real money rather than zero.
      const brightway = rows.find((row) => row.name === "Brightway Dental")!;
      expect(brightway.kind).toBe("commercial");
      expect(brightway.billedCents).toBeGreaterThan(0);
    });

    it("finds a customer by name or by the town they are in", async () => {
      const cookie = await signInAs("Dana Morales");
      const byName = (await request(app).get("/api/customers?q=osei").set("Cookie", cookie)).body as Row[];
      const byTown = (await request(app).get("/api/customers?q=Tinley").set("Cookie", cookie)).body as Row[];

      expect(byName.map((row) => row.name)).toEqual(["Amara Osei"]);
      expect(byTown.length).toBeGreaterThan(0);
      expect(byTown.every((row) => row.towns.some((town) => town.includes("Tinley")))).toBe(true);
    });

    it("treats a search term as text, not as a pattern", async () => {
      const cookie = await signInAs("Dana Morales");
      // A lone "(" is an invalid regular expression: taken literally it simply
      // matches nobody, rather than bringing the route down.
      const response = await request(app).get("/api/customers?q=%28").set("Cookie", cookie);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe("one customer", () => {
    const amara = async (cookie: string) => {
      const rows = (await request(app).get("/api/customers").set("Cookie", cookie)).body as Row[];
      return rows.find((row) => row.name === "Amara Osei")!;
    };

    it("gives the address, the equipment in it and the way in", async () => {
      const cookie = await signInAs("Dana Morales");
      const response = await request(app).get(`/api/customers/${(await amara(cookie)).id}`).set("Cookie", cookie);

      expect(response.status).toBe(200);
      expect(response.body.properties).toHaveLength(1);
      expect(response.body.properties[0]).toMatchObject({ street: "45 Linden Ave", city: "Mokena" });
      expect(response.body.properties[0].accessNotes).toContain("Side gate");
      expect(response.body.properties[0].equipment[0]).toMatchObject({ kind: "Gas furnace", make: "Goodman" });
    });

    it("lists the work newest first, with the money against each visit", async () => {
      const cookie = await signInAs("Dana Morales");
      const body = (await request(app).get(`/api/customers/${(await amara(cookie)).id}`).set("Cookie", cookie)).body;

      const jobs = body.jobs as { number: number; scheduledStart: string | null; quote: { totalCents: number } | null }[];
      expect(jobs.length).toBeGreaterThan(0);

      const dated = jobs.filter((job) => job.scheduledStart).map((job) => job.scheduledStart!);
      expect(dated).toEqual([...dated].sort().reverse());

      const today = jobs.find((job) => job.number === 4471)!;
      expect(today.quote).toMatchObject({ totalCents: 379_00 });
    });

    it("refuses an id from another business", async () => {
      const cookie = await signInAs("Dana Morales");
      const rival = await Company.create({ name: "Rival Air", slug: "rival-air", trade: "Heating", timezone: "America/Chicago" });
      const theirs = await Customer.create({ companyId: rival._id, name: "Their Customer", kind: "residential" });

      const response = await request(app).get(`/api/customers/${theirs._id.toString()}`).set("Cookie", cookie);
      expect(response.status).toBe(404);
    });

    it("says not found rather than falling over on nonsense", async () => {
      const cookie = await signInAs("Dana Morales");
      expect((await request(app).get("/api/customers/not-an-id").set("Cookie", cookie)).status).toBe(404);
    });
  });

  describe("who may open it", () => {
    it("keeps the book away from technicians", async () => {
      const cookie = await signInAs("Tomas Delgado");
      expect((await request(app).get("/api/customers").set("Cookie", cookie)).status).toBe(403);
    });

    it("wants a session at all", async () => {
      expect((await request(app).get("/api/customers")).status).toBe(401);
    });

    it("never shows one business another business's customers", async () => {
      const cookie = await signInAs("Dana Morales");
      const rival = await Company.create({ name: "Rival Heat", slug: "rival-heat", trade: "Heating", timezone: "America/Chicago" });
      const owner = await User.create({ companyId: rival._id, name: "Rival Owner", email: "owner@rivalheat.example", role: "owner" });
      const customer = await Customer.create({ companyId: rival._id, name: "Zzz Rival Customer", kind: "commercial" });
      const property = await Property.create({
        companyId: rival._id, customerId: customer._id, street: "9 Rival Rd", city: "Joliet", state: "IL", zip: "60431",
        location: { lat: 41.5, lng: -88.1 },
      });
      const now = new Date();
      await Job.create({
        companyId: rival._id, number: 1, customerId: customer._id, propertyId: property._id, title: "Rival job", status: "scheduled",
        scheduledStart: now, scheduledEnd: new Date(now.getTime() + 3_600_000), estimatedMinutes: 60, requestedAt: now,
        portalToken: "rival-heat-token-0000000001",
      });

      const rows = (await request(app).get("/api/customers").set("Cookie", cookie)).body as Row[];
      expect(rows.map((row) => row.name)).not.toContain("Zzz Rival Customer");
      expect(rows.some((row) => row.towns.includes("Joliet"))).toBe(false);
      expect(owner.companyId.toString()).toBe(rival._id.toString());
    });
  });
});
