import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Types } from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { addDays, dateIn, zonedTime } from "../lib/dates";
import { seedDemo } from "../demo/seedDemo";
import { Crew, ensureIndexes, Job, User } from "../models";
import { scheduleJob } from "../services/scheduling";

const app = createApp();
const TZ = "America/Chicago";

const cookies = new Map<string, string>();

async function as(name: string): Promise<string> {
  const cached = cookies.get(name);
  if (cached) return cached;
  const accounts = (await request(app).get("/api/auth/demo-accounts")).body as { staff: { id: string; name: string }[] };
  const person = accounts.staff.find((candidate) => candidate.name === name)!;
  const response = await request(app).post("/api/auth/demo").send({ userId: person.id });
  const cookie = response.headers["set-cookie"]![0]!.split(";")[0]!;
  cookies.set(name, cookie);
  return cookie;
}

const today = () => dateIn(new Date(), TZ);
/** An ISO instant for a wall-clock time today in Mokena. */
const at = (clock: string, date = today()) => {
  const [hours, minutes] = clock.split(":").map(Number) as [number, number];
  return zonedTime(date, hours * 60 + minutes, TZ).toISOString();
};

async function jobId(number: number): Promise<string> {
  return (await Job.findOne({ number }, { _id: 1 }).lean())!._id.toString();
}

async function crewId(name: string): Promise<string> {
  return (await Crew.findOne({ name }, { _id: 1 }).lean())!._id.toString();
}

describe("changing jobs", () => {
  let mongo: MongoMemoryReplSet;

  beforeAll(async () => {
    // A replica set, because booking a crew runs in a transaction.
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await connectDatabase(mongo.getUri("kreworx_actions_test"));
    await ensureIndexes();
  });

  beforeEach(async () => {
    // Staff and crews keep their ids across a reseed, so cached sessions stay valid.
    await seedDemo();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  describe("job details", () => {
    it("gives the dispatcher everything needed to send someone: access notes, equipment, the quote and the customer's link", async () => {
      const response = await request(app).get(`/api/jobs/${await jobId(4471)}`).set("Cookie", await as("Dana Morales"));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        number: 4471,
        status: "en_route",
        crew: { name: "Delgado", van: "VAN 08" },
        customer: { name: "Amara Osei", phone: expect.stringMatching(/^\(708\) 555-01\d\d$/) },
        property: { street: "45 Linden Ave", accessNotes: "Side gate code 4471. Dog is friendly." },
        quote: { status: "sent", totalCents: 379_00 },
        actions: { statuses: ["on_site", "scheduled"], reschedule: false, unschedule: false },
      });
      expect(response.body.property.equipment[0]).toMatchObject({ kind: "Gas furnace", make: "Goodman" });
      expect(response.body.portalToken).toEqual(expect.any(String));
    });

    it("shows a technician their own job without the customer link, and only field actions", async () => {
      const response = await request(app).get(`/api/jobs/${await jobId(4471)}`).set("Cookie", await as("Tomas Delgado"));

      expect(response.body.portalToken).toBeNull();
      expect(response.body.actions).toEqual({ statuses: ["on_site"], reschedule: false, unschedule: false });
    });

    it("treats another crew's job as not found for a technician", async () => {
      const response = await request(app).get(`/api/jobs/${await jobId(4470)}`).set("Cookie", await as("Tomas Delgado"));
      expect(response.status).toBe(404);
    });

    it("answers a malformed id with 404, not a server error", async () => {
      const response = await request(app).get("/api/jobs/not-an-id").set("Cookie", await as("Dana Morales"));
      expect(response.status).toBe(404);
    });
  });

  describe("scheduling", () => {
    it("books the urgent leak into Novak's gap and takes it out of the queue", async () => {
      const dana = await as("Dana Morales");
      const leak = await jobId(4477);

      const response = await request(app)
        .patch(`/api/jobs/${leak}/schedule`)
        .set("Cookie", dana)
        .send({ crewId: await crewId("Novak"), start: at("12:30"), end: at("14:00") });
      expect(response.status).toBe(204);

      const detail = (await request(app).get(`/api/jobs/${leak}`).set("Cookie", dana)).body;
      expect(detail).toMatchObject({ status: "scheduled", crew: { name: "Novak" }, schedulingNote: null, estimatedMinutes: 90 });
      expect(detail.timeline.at(-1).status).toBe("scheduled");

      const queue = (await request(app).get("/api/jobs/unscheduled").set("Cookie", dana)).body;
      expect(queue.map((job: { number: number }) => job.number)).not.toContain(4477);
    });

    it("refuses a double-booking and says exactly what is in the way", async () => {
      const response = await request(app)
        .patch(`/api/jobs/${await jobId(4478)}/schedule`)
        .set("Cookie", await as("Dana Morales"))
        .send({ crewId: await crewId("Novak"), start: at("9:00"), end: at("10:30") });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe("Novak already has #4469 Duct cleaning for Marisol Arenas from 8:00 AM to 10:00 AM");
      expect(response.body.details.clashingJob.number).toBe(4469);
    });

    it("allows a job to start the minute the previous one ends", async () => {
      const response = await request(app)
        .patch(`/api/jobs/${await jobId(4478)}/schedule`)
        .set("Cookie", await as("Dana Morales"))
        .send({ crewId: await crewId("Novak"), start: at("10:00"), end: at("11:00") });
      expect(response.status).toBe(204);
    });

    it("lets a job move within its own slot without clashing with itself", async () => {
      const response = await request(app)
        .patch(`/api/jobs/${await jobId(4474)}/schedule`)
        .set("Cookie", await as("Dana Morales"))
        .send({ crewId: await crewId("Delgado"), start: at("13:30"), end: at("15:00") });
      expect(response.status).toBe(204);
    });

    it("rejects times that make no sense", async () => {
      const dana = await as("Dana Morales");
      const job = await jobId(4478);
      const crew = await crewId("Novak");

      const backwards = await request(app).patch(`/api/jobs/${job}/schedule`).set("Cookie", dana).send({ crewId: crew, start: at("15:00"), end: at("14:00") });
      expect(backwards.status).toBe(400);

      const marathon = await request(app).patch(`/api/jobs/${job}/schedule`).set("Cookie", dana).send({ crewId: crew, start: at("6:00"), end: at("6:00", addDays(today(), 1)) });
      expect(marathon.status).toBe(400);

      const garbage = await request(app).patch(`/api/jobs/${job}/schedule`).set("Cookie", dana).send({ crewId: crew, start: "tomorrow", end: "later" });
      expect(garbage.status).toBe(400);
    });

    it("will not move a job that is already under way", async () => {
      const response = await request(app)
        .patch(`/api/jobs/${await jobId(4471)}/schedule`)
        .set("Cookie", await as("Dana Morales"))
        .send({ crewId: await crewId("Novak"), start: at("16:00"), end: at("17:00") });
      expect(response.status).toBe(409);
    });

    it("does not let a technician rearrange the board", async () => {
      const response = await request(app)
        .patch(`/api/jobs/${await jobId(4474)}/schedule`)
        .set("Cookie", await as("Tomas Delgado"))
        .send({ crewId: await crewId("Delgado"), start: at("16:00"), end: at("17:00") });
      expect(response.status).toBe(403);
    });

    it("will not book onto a crew that is not in the company", async () => {
      const response = await request(app)
        .patch(`/api/jobs/${await jobId(4478)}/schedule`)
        .set("Cookie", await as("Dana Morales"))
        .send({ crewId: new Types.ObjectId().toString(), start: at("16:00"), end: at("17:00") });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("That crew does not exist");
    });

    it("refuses the second of two bookings that both checked the slot before either saved", async () => {
      const dana = await User.findOne({ name: "Dana Morales" }).lean();
      const auth = { userId: dana!._id, companyId: dana!.companyId, role: "dispatcher" as const, name: dana!.name };
      const whitfield = await crewId("Whitfield");
      const slot = { crewId: whitfield, start: new Date(at("17:00")), end: new Date(at("18:00")) };

      // Each booking waits here until the other has also passed its check, or
      // until a short timeout. Without the crew write both would arrive and
      // both would save; with it, the second is held back until the first
      // commits, then retries and finds the slot taken.
      let arrived = 0;
      let release!: () => void;
      const bothChecked = new Promise<void>((resolve) => (release = resolve));
      const beforeSave = async () => {
        arrived += 1;
        if (arrived >= 2) release();
        await Promise.race([bothChecked, new Promise((resolve) => setTimeout(resolve, 400))]);
      };

      const outcomes = await Promise.allSettled([
        scheduleJob(auth, await jobId(4478), slot, { beforeSave }),
        scheduleJob(auth, await jobId(4479), slot, { beforeSave }),
      ]);

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
      const refusal = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
      expect(refusal.reason).toMatchObject({ status: 409 });
      expect(await Job.countDocuments({ crewId: whitfield, scheduledStart: slot.start })).toBe(1);
    });

    it("books exactly one of five jobs when they are all dropped into the same slot at once", async () => {
      const dana = await as("Dana Morales");
      const whitfield = await crewId("Whitfield");
      const tomorrow = await Job.find({ status: "scheduled", scheduledStart: { $gte: new Date(at("0:00", addDays(today(), 1))) } }, { _id: 1 })
        .limit(5)
        .lean();
      expect(tomorrow).toHaveLength(5);

      // Whitfield is free after 3 PM today; everyone races for 5 to 6.
      const results = await Promise.all(
        tomorrow.map((job) =>
          request(app).patch(`/api/jobs/${job._id.toString()}/schedule`).set("Cookie", dana).send({ crewId: whitfield, start: at("17:00"), end: at("18:00") }),
        ),
      );

      expect(results.map((result) => result.status).sort()).toEqual([204, 409, 409, 409, 409]);
      const booked = await Job.countDocuments({ crewId: whitfield, scheduledStart: new Date(at("17:00")) });
      expect(booked).toBe(1);
    });

    it("sends a scheduled job back to the queue, but not one that has started", async () => {
      const dana = await as("Dana Morales");

      expect((await request(app).post(`/api/jobs/${await jobId(4474)}/unschedule`).set("Cookie", dana)).status).toBe(204);
      const pruitt = await Job.findOne({ number: 4474 }).lean();
      expect(pruitt).toMatchObject({ status: "unscheduled", crewId: null, scheduledStart: null });

      expect((await request(app).post(`/api/jobs/${await jobId(4471)}/unschedule`).set("Cookie", dana)).status).toBe(409);
    });
  });

  describe("status", () => {
    it("lets Tomas mark himself on site, which the customer's link shows straight away", async () => {
      const tomas = await as("Tomas Delgado");
      const osei = await Job.findOne({ number: 4471 }).lean();

      const response = await request(app).patch(`/api/jobs/${osei!._id.toString()}/status`).set("Cookie", tomas).send({ from: "en_route", to: "on_site" });
      expect(response.status).toBe(204);

      const portal = (await request(app).get(`/api/portal/${osei!.portalToken}`)).body;
      expect(portal.job.status).toBe("on_site");
      expect(portal.job.timeline.at(-1).status).toBe("on_site");
    });

    it("keeps cancelling an office decision", async () => {
      const pruitt = await jobId(4474);
      const refused = await request(app).patch(`/api/jobs/${pruitt}/status`).set("Cookie", await as("Tomas Delgado")).send({ from: "scheduled", to: "cancelled" });
      expect(refused.status).toBe(409);

      const allowed = await request(app).patch(`/api/jobs/${pruitt}/status`).set("Cookie", await as("Dana Morales")).send({ from: "scheduled", to: "cancelled" });
      expect(allowed.status).toBe(204);
    });

    it("refuses a jump that skips the work, like scheduled straight to done", async () => {
      const response = await request(app)
        .patch(`/api/jobs/${await jobId(4474)}/status`)
        .set("Cookie", await as("Dana Morales"))
        .send({ from: "scheduled", to: "done" });
      expect(response.status).toBe(409);
      expect(response.body.error).toBe("A job that is scheduled cannot be marked done");
    });

    it("does not let a stale screen overwrite a newer change", async () => {
      const osei = await jobId(4471);
      await request(app).patch(`/api/jobs/${osei}/status`).set("Cookie", await as("Tomas Delgado")).send({ from: "en_route", to: "on_site" });

      // The dispatcher's panel still says en route.
      const stale = await request(app).patch(`/api/jobs/${osei}/status`).set("Cookie", await as("Dana Morales")).send({ from: "en_route", to: "scheduled" });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe("This job was changed to on site while you were looking at it");
    });

    it("does not let a technician touch another crew's job", async () => {
      const response = await request(app)
        .patch(`/api/jobs/${await jobId(4470)}/status`)
        .set("Cookie", await as("Tomas Delgado"))
        .send({ from: "on_site", to: "done" });
      expect(response.status).toBe(404);
    });
  });
});
