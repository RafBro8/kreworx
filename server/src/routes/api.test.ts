import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { SESSION_COOKIE, signSession } from "../auth/session";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { seedDemo } from "../demo/seedDemo";
import { Company, Customer, ensureIndexes, Job, Property, User } from "../models";

const app = createApp();

type DemoAccounts = {
  staff: { id: string; name: string; role: string }[];
  customer: { name: string; portalToken: string };
};

/** Signs in through the demo endpoint, exactly as the welcome screen does, and returns the cookie. */
async function signInAs(name: string): Promise<string> {
  const accounts = (await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts;
  const person = accounts.staff.find((candidate) => candidate.name === name)!;
  const response = await request(app).post("/api/auth/demo").send({ userId: person.id });
  expect(response.status).toBe(204);
  return response.headers["set-cookie"]![0]!.split(";")[0]!;
}

describe("the Kreworx API", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_api_test"));
    await ensureIndexes();
    await seedDemo();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  describe("signing in", () => {
    it("lists the demo staff in role order, with the showcase customer", async () => {
      const response = await request(app).get("/api/auth/demo-accounts");

      expect(response.status).toBe(200);
      expect(response.body.staff.map((person: { role: string }) => person.role).slice(0, 3)).toEqual(["owner", "dispatcher", "technician"]);
      expect(response.body.customer.name).toBe("Amara Osei");
    });

    it("sets an httpOnly session cookie and then knows who you are", async () => {
      const accounts = (await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts;
      const dana = accounts.staff.find((person) => person.name === "Dana Morales")!;
      const signIn = await request(app).post("/api/auth/demo").send({ userId: dana.id });

      const cookie = signIn.headers["set-cookie"]![0]!;
      expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);

      const me = await request(app).get("/api/auth/me").set("Cookie", cookie.split(";")[0]!);
      expect(me.body.user).toMatchObject({ name: "Dana Morales", role: "dispatcher" });
      expect(me.body.company).toMatchObject({ name: "Northline Mechanical", timezone: "America/Chicago" });
    });

    it("refuses a tampered or missing session", async () => {
      expect((await request(app).get("/api/auth/me")).status).toBe(401);
      const forged = `${SESSION_COOKIE}=${signSession({ userId: "000000000000000000000000", companyId: "000000000000000000000000", role: "owner" })}x`;
      expect((await request(app).get("/api/auth/me").set("Cookie", forged)).status).toBe(401);
    });

    it("will not demo-sign-in as an account that is not a demo account", async () => {
      const company = await Company.findOne({ slug: "northline" });
      const real = await User.create({ companyId: company!._id, name: "Real Person", email: "real@example.com", role: "owner" });

      expect((await request(app).post("/api/auth/demo").send({ userId: real._id.toString() })).status).toBe(404);
    });

    it("clears the cookie on sign-out", async () => {
      const response = await request(app).post("/api/auth/logout");
      expect(response.status).toBe(204);
      expect(response.headers["set-cookie"]![0]).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    });
  });

  describe("roles", () => {
    it("shows the dispatcher today's whole board: four crews and eleven jobs", async () => {
      const cookie = await signInAs("Dana Morales");
      const [crews, jobs] = await Promise.all([
        request(app).get("/api/crews").set("Cookie", cookie),
        request(app).get("/api/jobs").set("Cookie", cookie),
      ]);

      expect(crews.body.map((crew: { name: string }) => crew.name)).toEqual(["Ramirez", "Delgado", "Novak", "Whitfield"]);
      expect(jobs.body.jobs).toHaveLength(11);
      expect(jobs.body.jobs[0]).not.toHaveProperty("portalToken");
    });

    it("shows a technician only their own crew and its jobs", async () => {
      const cookie = await signInAs("Tomas Delgado");
      const [crews, jobs] = await Promise.all([
        request(app).get("/api/crews").set("Cookie", cookie),
        request(app).get("/api/jobs").set("Cookie", cookie),
      ]);

      expect(crews.body.map((crew: { name: string }) => crew.name)).toEqual(["Delgado"]);
      expect(jobs.body.jobs.map((job: { number: number }) => job.number)).toEqual([4467, 4471, 4474]);
    });

    it("gives an apprentice their lead's crew", async () => {
      const cookie = await signInAs("Jalen Brooks");
      const crews = await request(app).get("/api/crews").set("Cookie", cookie);
      expect(crews.body.map((crew: { name: string }) => crew.name)).toEqual(["Ramirez"]);
    });

    it("keeps the unscheduled queue and the owner's numbers away from technicians", async () => {
      const cookie = await signInAs("Tomas Delgado");
      expect((await request(app).get("/api/jobs/unscheduled").set("Cookie", cookie)).status).toBe(403);
      expect((await request(app).get("/api/owner/summary").set("Cookie", cookie)).status).toBe(403);
    });

    it("lists unscheduled work most urgent first", async () => {
      const cookie = await signInAs("Dana Morales");
      const response = await request(app).get("/api/jobs/unscheduled").set("Cookie", cookie);
      expect(response.body.map((job: { title: string }) => job.title)).toEqual([
        "Water heater leak",
        "Quarterly filter change",
        "Estimate — new install",
      ]);
    });

    it("gives the owner numbers that match the design", async () => {
      const cookie = await signInAs("Renee Castillo");
      const response = await request(app).get("/api/owner/summary").set("Cookie", cookie);

      expect(response.body).toMatchObject({
        jobsToday: 11,
        doneToday: 4,
        quotesAwaiting: { count: 3, totalCents: 379_00 + 6_950_00 + 940_00 },
        invoicedTodayCents: 4_180_00,
      });
      expect(response.body.invoicedThisWeekCents).toBeGreaterThanOrEqual(4_180_00);
    });

    it("rejects a malformed date rather than guessing", async () => {
      const cookie = await signInAs("Dana Morales");
      expect((await request(app).get("/api/jobs?date=yesterday").set("Cookie", cookie)).status).toBe(400);
    });
  });

  describe("tenancy", () => {
    it("never shows one business another business's jobs", async () => {
      const rival = await Company.create({ name: "Rival Heating", slug: "rival", trade: "Heating", timezone: "America/Chicago" });
      const owner = await User.create({ companyId: rival._id, name: "Rival Owner", email: "owner@rival.example", role: "owner" });
      const customer = await Customer.create({ companyId: rival._id, name: "Rival Customer", kind: "residential" });
      const property = await Property.create({ companyId: rival._id, customerId: customer._id, street: "1 Main St", city: "Joliet", state: "IL", zip: "60431", location: { lat: 41.5, lng: -88.1 } });
      const now = new Date();
      await Job.create({
        companyId: rival._id, number: 1, customerId: customer._id, propertyId: property._id, title: "Rival job", status: "scheduled",
        scheduledStart: now, scheduledEnd: new Date(now.getTime() + 3_600_000), estimatedMinutes: 60, requestedAt: now, portalToken: "rival-token-000000000001",
      });

      const rivalCookie = `${SESSION_COOKIE}=${signSession({ userId: owner._id.toString(), companyId: rival._id.toString(), role: "owner" })}`;
      const rivalJobs = await request(app).get("/api/jobs").set("Cookie", rivalCookie);
      expect(rivalJobs.body.jobs.map((job: { title: string }) => job.title)).toEqual(["Rival job"]);

      const northlineJobs = await request(app).get("/api/jobs").set("Cookie", await signInAs("Dana Morales"));
      expect(northlineJobs.body.jobs.map((job: { title: string }) => job.title)).not.toContain("Rival job");
    });

    it("rejects a session whose company does not match its user", async () => {
      const dana = await User.findOne({ name: "Dana Morales" });
      const rival = await Company.findOne({ slug: "rival" });
      const mismatched = `${SESSION_COOKIE}=${signSession({ userId: dana!._id.toString(), companyId: rival!._id.toString(), role: "owner" })}`;
      expect((await request(app).get("/api/jobs").set("Cookie", mismatched)).status).toBe(401);
    });
  });

  describe("the customer portal", () => {
    it("shows Amara her job, her technician and her quote from the link alone", async () => {
      const accounts = (await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts;
      const response = await request(app).get(`/api/portal/${accounts.customer.portalToken}`);

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toMatchObject({
        company: { name: "Northline Mechanical" },
        customer: { firstName: "Amara" },
        job: { number: 4471, status: "en_route" },
        address: { street: "45 Linden Ave", city: "Mokena" },
        technician: { name: "Tomas Delgado", title: "Lead technician" },
        quote: { status: "sent", totalCents: 379_00 },
      });
      expect(response.body.quote.lineItems.find((item: { description: string }) => item.description === "Diagnostic visit")).toMatchObject({ waived: true, amountCents: 0 });
    });

    it("leaks nothing internal through the link", async () => {
      const accounts = (await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts;
      const body = JSON.stringify((await request(app).get(`/api/portal/${accounts.customer.portalToken}`)).body);

      for (const secret of ["companyId", "customerId", "crewId", "_id", "portalToken", "Side gate code", "accessNotes", "email"]) {
        expect(body, `portal response contains ${secret}`).not.toContain(secret);
      }
    });

    it("gives the same answer for a wrong token as for a malformed one", async () => {
      const wrong = await request(app).get("/api/portal/abcdefghijklmnopqrstuvwxyz012345");
      const short = await request(app).get("/api/portal/abc");
      expect(wrong.status).toBe(404);
      expect(short.status).toBe(404);
      expect(wrong.body.error).toBe(short.body.error);
    });

    it("keeps the customer's link working when the demo is rebuilt the next day", async () => {
      const before = ((await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts).customer.portalToken;
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await seedDemo(tomorrow);
      const after = ((await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts).customer.portalToken;

      expect(after).toBe(before);
      await seedDemo();
    });
  });
});
