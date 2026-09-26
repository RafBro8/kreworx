import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { SESSION_COOKIE, signSession } from "../auth/session";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { seedDemo } from "../demo/seedDemo";
import { Company, Customer, ensureIndexes, Invoice, Job, Property, Quote, User } from "../models";
import { totalCents } from "../models/lineItems";
import { answerQuote } from "../services/quotes";

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
        "Estimate - new install",
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

    it("keeps the owner's books away from a dispatcher", async () => {
      const cookie = await signInAs("Dana Morales");
      expect((await request(app).get("/api/owner/money").set("Cookie", cookie)).status).toBe(403);
    });

    it("charts whole weeks, ending with the one we are in", async () => {
      const cookie = await signInAs("Renee Castillo");
      const response = await request(app).get("/api/owner/money").set("Cookie", cookie);

      expect(response.status).toBe(200);
      const weeks = response.body.weeks as { weekStart: string; billedCents: number }[];
      expect(weeks).toHaveLength(12);
      // Every column is a Monday, seven days after the one before it.
      for (const [index, week] of weeks.entries()) {
        expect(new Date(week.weekStart + "T00:00:00Z").getUTCDay()).toBe(1);
        if (index > 0) {
          const gap = Date.parse(week.weekStart) - Date.parse(weeks[index - 1]!.weekStart);
          expect(gap).toBe(7 * 24 * 60 * 60 * 1000);
        }
      }
      // The demo has months of trade behind it, not just this morning.
      expect(weeks.filter((week) => week.billedCents > 0).length).toBeGreaterThan(8);
    });

    it("ages the debt into buckets that add up to what is owed", async () => {
      const cookie = await signInAs("Renee Castillo");
      const response = await request(app).get("/api/owner/money").set("Cookie", cookie);
      const { receivable } = response.body as {
        receivable: { totalCents: number; ageing: { key: string; count: number; cents: number }[]; oldest: { daysOld: number }[] };
      };

      const open = await Invoice.find({ status: { $in: ["sent", "overdue"] } }, { lineItems: 1 }).lean();
      expect(receivable.totalCents).toBe(open.reduce((total, invoice) => total + totalCents(invoice.lineItems), 0));
      // Nothing may fall between two buckets, or the owner is chasing a number
      // that does not match the one at the top of the page.
      expect(receivable.ageing.reduce((total, bucket) => total + bucket.cents, 0)).toBe(receivable.totalCents);
      expect(receivable.ageing.reduce((total, bucket) => total + bucket.count, 0)).toBe(open.length);
      // Worst first: that is the order you make the calls in.
      const ages = receivable.oldest.map((invoice) => invoice.daysOld);
      expect([...ages].sort((a, b) => b - a)).toEqual(ages);
    });

    it("counts only quotes still out as the pipeline", async () => {
      const cookie = await signInAs("Renee Castillo");
      const response = await request(app).get("/api/owner/money").set("Cookie", cookie);

      const stillOut = await Quote.find({ status: "sent" }, { lineItems: 1 }).lean();
      expect(response.body.pipeline.out).toEqual({
        count: stillOut.length,
        cents: stillOut.reduce((total, quote) => total + totalCents(quote.lineItems), 0),
      });
      expect(response.body.pipeline.won.count).toBeLessThanOrEqual(response.body.pipeline.answered);
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

  describe("answering a quote from the link", () => {
    const token = async () => ((await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts).customer.portalToken;

    beforeEach(async () => {
      await seedDemo();
    });

    it("lets Amara approve her quote, and says so when she opens the link again", async () => {
      const link = await token();

      const answer = await request(app).post(`/api/portal/${link}/quote`).send({ decision: "approved" });
      expect(answer.status).toBe(204);

      const after = await request(app).get(`/api/portal/${link}`);
      expect(after.body.quote).toMatchObject({ status: "approved" });
      expect(after.body.quote.respondedAt).not.toBeNull();
    });

    it("records a decline the same way", async () => {
      const link = await token();
      expect((await request(app).post(`/api/portal/${link}/quote`).send({ decision: "declined" })).status).toBe(204);
      expect((await request(app).get(`/api/portal/${link}`)).body.quote.status).toBe("declined");
    });

    it("takes one answer, however many times the button is tapped", async () => {
      const link = await token();

      // Both answers are held between reading the quote and writing to it, so
      // they genuinely overlap. Left to chance the two requests usually run
      // one after the other, and the second is simply told there is nothing
      // waiting - which is the right answer, but not the one being tested.
      let arrived = 0;
      let release!: () => void;
      const bothRead = new Promise<void>((resolve) => (release = resolve));
      const beforeWrite = async () => {
        arrived += 1;
        if (arrived >= 2) release();
        await Promise.race([bothRead, new Promise((resolve) => setTimeout(resolve, 400))]);
      };

      const outcomes = await Promise.allSettled([
        answerQuote(link, "approved", { beforeWrite }),
        answerQuote(link, "declined", { beforeWrite }),
      ]);

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
      const refused = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
      expect(refused.reason).toMatchObject({ status: 409 });

      // Whichever won, exactly one answer stands.
      const answered = (await request(app).get(`/api/portal/${link}`)).body.quote.status;
      expect(["approved", "declined"]).toContain(answered);
    });

    it("tells a second tap that arrives later there is nothing left to answer", async () => {
      const link = await token();
      expect((await request(app).post(`/api/portal/${link}/quote`).send({ decision: "approved" })).status).toBe(204);
      expect((await request(app).post(`/api/portal/${link}/quote`).send({ decision: "declined" })).status).toBe(404);
      expect((await request(app).get(`/api/portal/${link}`)).body.quote.status).toBe("approved");
    });

    it("starts the work again when the job was held waiting on her", async () => {
      const company = (await Company.findOne({ slug: "northline" }).lean())!;
      const held = (await Job.findOne({ companyId: company._id, number: 4471 }).lean())!;
      await Job.updateOne({ _id: held._id }, { $set: { status: "awaiting_approval" } });

      const answer = await request(app).post(`/api/portal/${held.portalToken}/quote`).send({ decision: "approved" });

      expect(answer.status).toBe(204);
      const moved = await request(app).get(`/api/portal/${held.portalToken}`);
      expect(moved.body.job.status).toBe("on_site");
      expect(moved.body.job.timeline.at(-1)).toMatchObject({ status: "on_site" });
    });

    it("refuses an answer to a quote nobody sent", async () => {
      const company = (await Company.findOne({ slug: "northline" }).lean())!;
      const quiet = (await Job.findOne({ companyId: company._id, number: 4472 }).lean())!;

      const answer = await request(app).post(`/api/portal/${quiet.portalToken}/quote`).send({ decision: "approved" });
      expect(answer.status).toBe(404);
    });

    it("refuses anything that is not a yes or a no", async () => {
      const link = await token();
      expect((await request(app).post(`/api/portal/${link}/quote`).send({ decision: "maybe" })).status).toBe(400);
      expect((await request(app).post(`/api/portal/${link}/quote`).send({})).status).toBe(400);
    });

    it("cannot be answered with somebody else's link, or none", async () => {
      const wrong = await request(app).post("/api/portal/abcdefghijklmnopqrstuvwxyz012345/quote").send({ decision: "approved" });
      expect(wrong.status).toBe(404);
      expect(wrong.body.error).toBe((await request(app).get("/api/portal/abc")).body.error);
    });

    it("never lets an answer reach a quote the link does not own", async () => {
      const company = (await Company.findOne({ slug: "northline" }).lean())!;
      const hers = (await Quote.findOne({ companyId: company._id, status: "sent" }).lean())!;
      const someoneElse = (await Job.findOne({ companyId: company._id, number: 4472 }).lean())!;

      // The body is ignored entirely: the quote comes from the job the token
      // names, so naming another quote changes nothing.
      const answer = await request(app)
        .post(`/api/portal/${someoneElse.portalToken}/quote`)
        .send({ decision: "approved", quoteId: hers._id.toString() });

      expect(answer.status).toBe(400);
      expect((await Quote.findById(hers._id).lean())!.status).toBe("sent");
    });
  });
});
