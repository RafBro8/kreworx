import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { demoPhotos } from "../demo/photos";
import { seedDemo } from "../demo/seedDemo";
import { Company, ensureIndexes, Job, Photo } from "../models";
import { MAX_PHOTOS_PER_JOB } from "../models/Photo";

const app = createApp();

type DemoAccounts = {
  staff: { id: string; name: string; role: string }[];
  customer: { name: string; portalToken: string };
};

async function signInAs(name: string): Promise<string> {
  const accounts = (await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts;
  const person = accounts.staff.find((candidate) => candidate.name === name)!;
  const response = await request(app).post("/api/auth/demo").send({ userId: person.id });
  return response.headers["set-cookie"]![0]!.split(";")[0]!;
}

const accounts = async () => (await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts;

const jobNumbered = async (number: number) => {
  const company = (await Company.findOne({ slug: "northline" }).lean())!;
  return (await Job.findOne({ companyId: company._id, number }).lean())!;
};

/** A real PNG, made the same way the demo makes them. */
const somePng = () => demoPhotos()[0]!.bytes;

describe("photos of the work", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_photos_test"));
    await ensureIndexes();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await seedDemo();
  });

  describe("what the customer is shown", () => {
    it("lists the shared photos on her job, and not the one marked for the office", async () => {
      const link = (await accounts()).customer.portalToken;
      const view = await request(app).get(`/api/portal/${link}`);

      expect(view.status).toBe(200);
      expect(view.body.photos.map((photo: { caption: string }) => photo.caption)).toEqual([
        "Cracked hot-surface ignitor",
        "Furnace model plate",
      ]);
    });

    it("never sends the bytes with the page, only a way to fetch each one", async () => {
      const link = (await accounts()).customer.portalToken;
      const body = JSON.stringify((await request(app).get(`/api/portal/${link}`)).body);

      expect(body).not.toContain("sharedWithCustomer");
      expect(body.length).toBeLessThan(6000);
    });

    it("serves a shared photo as an image", async () => {
      const link = (await accounts()).customer.portalToken;
      const [first] = (await request(app).get(`/api/portal/${link}`)).body.photos as { id: string }[];

      const image = await request(app).get(`/api/portal/${link}/photos/${first!.id}`);

      expect(image.status).toBe(200);
      expect(image.headers["content-type"]).toBe("image/png");
      expect(image.headers["cache-control"]).toContain("private");
      expect(image.body.subarray(1, 4).toString("ascii")).toBe("PNG");
    });

    it("refuses the office-only photo even though the link is a good one", async () => {
      const job = await jobNumbered(4471);
      const internal = (await Photo.findOne({ jobId: job._id, sharedWithCustomer: false }).lean())!;

      const answer = await request(app).get(`/api/portal/${job.portalToken}/photos/${internal._id.toString()}`);
      expect(answer.status).toBe(404);
    });

    it("refuses a photo that belongs to another job", async () => {
      const hers = await jobNumbered(4471);
      const elsewhere = await jobNumbered(4467);
      const theirs = (await Photo.findOne({ jobId: elsewhere._id }).lean())!;

      const answer = await request(app).get(`/api/portal/${hers.portalToken}/photos/${theirs._id.toString()}`);
      expect(answer.status).toBe(404);
    });
  });

  describe("adding one from the job", () => {
    it("takes a photo posted as the body, with its caption", async () => {
      const cookie = await signInAs("Dana Morales");
      const job = await jobNumbered(4472);

      const upload = await request(app)
        .post(`/api/jobs/${job._id.toString()}/photos?caption=New%20filter%20fitted`)
        .set("Cookie", cookie)
        .set("Content-Type", "image/png")
        .send(somePng());

      expect(upload.status).toBe(201);
      expect(upload.body).toMatchObject({ caption: "New filter fitted", contentType: "image/png" });
      expect(upload.body).not.toHaveProperty("data");

      const listed = await request(app).get(`/api/jobs/${job._id.toString()}/photos`).set("Cookie", cookie);
      expect(listed.body).toHaveLength(1);
    });

    it("keeps a photo off the customer page when it is marked office-only", async () => {
      const cookie = await signInAs("Dana Morales");
      const job = await jobNumbered(4472);

      await request(app)
        .post(`/api/jobs/${job._id.toString()}/photos?caption=Meter&share=false`)
        .set("Cookie", cookie)
        .set("Content-Type", "image/png")
        .send(somePng());

      const view = await request(app).get(`/api/portal/${job.portalToken}`);
      expect(view.body.photos).toEqual([]);
    });

    it("refuses a file that is not an image, whatever it claims to be", async () => {
      const cookie = await signInAs("Dana Morales");
      const job = await jobNumbered(4472);

      const upload = await request(app)
        .post(`/api/jobs/${job._id.toString()}/photos`)
        .set("Cookie", cookie)
        .set("Content-Type", "image/png")
        .send(Buffer.from("<html><script>alert(1)</script></html>", "utf8"));

      expect(upload.status).toBe(400);
      expect(await Photo.countDocuments({ jobId: job._id })).toBe(0);
    });

    it("stops a job collecting photos without end", async () => {
      const cookie = await signInAs("Dana Morales");
      const job = await jobNumbered(4472);
      await Photo.insertMany(
        Array.from({ length: MAX_PHOTOS_PER_JOB }, () => ({
          companyId: job.companyId,
          jobId: job._id,
          data: Buffer.from([0xff, 0xd8, 0xff]),
          contentType: "image/jpeg",
          bytes: 3,
        })),
      );

      const upload = await request(app)
        .post(`/api/jobs/${job._id.toString()}/photos`)
        .set("Cookie", cookie)
        .set("Content-Type", "image/png")
        .send(somePng());

      expect(upload.status).toBe(409);
    });
  });

  describe("who may look", () => {
    it("keeps another crew's photos away from a technician", async () => {
      const cookie = await signInAs("Petra Novak");
      const delgadoJob = await jobNumbered(4471);
      const photo = (await Photo.findOne({ jobId: delgadoJob._id }).lean())!;

      const answer = await request(app).get(`/api/photos/${photo._id.toString()}`).set("Cookie", cookie);
      expect(answer.status).toBe(404);
    });

    it("shows a technician the photos on their own job", async () => {
      const cookie = await signInAs("Tomas Delgado");
      const job = await jobNumbered(4471);
      const photo = (await Photo.findOne({ jobId: job._id }).lean())!;

      const answer = await request(app).get(`/api/photos/${photo._id.toString()}`).set("Cookie", cookie);
      expect(answer.status).toBe(200);
      expect(answer.headers["content-type"]).toBe("image/png");
    });

    it("wants a session at all", async () => {
      const job = await jobNumbered(4471);
      const photo = (await Photo.findOne({ jobId: job._id }).lean())!;
      expect((await request(app).get(`/api/photos/${photo._id.toString()}`)).status).toBe(401);
    });

    it("lets the office remove a photo that a technician elsewhere cannot touch", async () => {
      const job = await jobNumbered(4471);
      const photo = (await Photo.findOne({ jobId: job._id }).lean())!;
      const id = photo._id.toString();

      expect((await request(app).delete(`/api/photos/${id}`).set("Cookie", await signInAs("Petra Novak"))).status).toBe(404);
      expect((await request(app).delete(`/api/photos/${id}`).set("Cookie", await signInAs("Dana Morales"))).status).toBe(204);
      expect(await Photo.findById(photo._id).lean()).toBeNull();
    });
  });
});
