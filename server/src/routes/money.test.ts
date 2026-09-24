import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { seedDemo } from "../demo/seedDemo";
import { Company, ensureIndexes, Invoice, Job, Quote } from "../models";
import { textOfPdf } from "../pdf/text";

const app = createApp();

type DemoAccounts = { staff: { id: string; name: string }[]; customer: { portalToken: string } };

async function signInAs(name: string): Promise<string> {
  const accounts = (await request(app).get("/api/auth/demo-accounts")).body as DemoAccounts;
  const person = accounts.staff.find((candidate) => candidate.name === name)!;
  const response = await request(app).post("/api/auth/demo").send({ userId: person.id });
  return response.headers["set-cookie"]![0]!.split(";")[0]!;
}

const jobNumbered = async (number: number) => {
  const company = (await Company.findOne({ slug: "northline" }).lean())!;
  return (await Job.findOne({ companyId: company._id, number }).lean())!;
};

const LINES = [
  { kind: "part" as const, description: "Blower capacitor", quantity: 1, unitPriceCents: 68_00 },
  { kind: "labour" as const, description: "Fit and test", quantity: 1.5, unitPriceCents: 110_00 },
];

/** 68.00 + 1.5 x 110.00 */
const LINES_TOTAL = 68_00 + 165_00;

describe("quotes and invoices", () => {
  let mongo: MongoMemoryServer;
  let office: string;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_money_test"));
    await ensureIndexes();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await seedDemo();
    office = await signInAs("Dana Morales");
  });

  describe("writing a quote", () => {
    it("starts as a draft the customer cannot see, then goes when it is sent", async () => {
      const job = await jobNumbered(4472);

      const created = await request(app)
        .post(`/api/jobs/${job._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ findings: "Capacitor reading low.", lineItems: LINES });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ status: "draft", totalCents: LINES_TOTAL });

      // Nothing on her page yet.
      expect((await request(app).get(`/api/portal/${job.portalToken}`)).body.quote).toBeNull();

      const sent = await request(app).post(`/api/quotes/${created.body.id}/send`).set("Cookie", office);
      expect(sent.status).toBe(204);

      const portal = (await request(app).get(`/api/portal/${job.portalToken}`)).body.quote;
      expect(portal).toMatchObject({ status: "sent", totalCents: LINES_TOTAL });
    });

    it("starts blank, because a quote begins as an empty page", async () => {
      // The panel opens a new quote with nothing on it and lets the office
      // type; requiring a line here made that button impossible to press.
      const job = await jobNumbered(4472);
      const created = await request(app)
        .post(`/api/jobs/${job._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ lineItems: [] });

      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ status: "draft", totalCents: 0, lineItems: [] });

      // Empty is fine to hold, but not to send.
      const sent = await request(app).post(`/api/quotes/${created.body.id}/send`).set("Cookie", office);
      expect(sent.status).toBe(400);
    });

    it("will not issue an invoice with nothing on it", async () => {
      const job = await jobNumbered(4472);
      const response = await request(app)
        .post(`/api/jobs/${job._id.toString()}/invoice`)
        .set("Cookie", office)
        .send({ lineItems: [] });

      expect(response.status).toBe(400);
    });

    it("numbers each quote on from the last, rather than from the job", async () => {
      const company = (await Company.findOne({ slug: "northline" }).lean())!;
      const seeded = await Quote.find({ companyId: company._id }, { number: 1 }).lean();
      const highestSeeded = Math.max(...seeded.map((quote) => quote.number));

      const first = await request(app)
        .post(`/api/jobs/${(await jobNumbered(4472))._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ lineItems: LINES });
      const second = await request(app)
        .post(`/api/jobs/${(await jobNumbered(4476))._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ lineItems: LINES });

      expect(second.body.number).toBe(first.body.number + 1);
      // Quotes count on their own, past every number the script already used,
      // rather than borrowing the number of the job they belong to.
      expect(first.body.number).toBe(highestSeeded + 1);
      expect(first.body.number).not.toBe(4472);
    });

    it("refuses to change a quote once the customer has it", async () => {
      const job = await jobNumbered(4472);
      const created = await request(app)
        .post(`/api/jobs/${job._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ lineItems: LINES });
      await request(app).post(`/api/quotes/${created.body.id}/send`).set("Cookie", office);

      const edit = await request(app)
        .patch(`/api/quotes/${created.body.id}`)
        .set("Cookie", office)
        .send({ lineItems: [{ ...LINES[0]!, unitPriceCents: 5_00 }] });

      expect(edit.status).toBe(409);
      expect((await request(app).get(`/api/portal/${job.portalToken}`)).body.quote.totalCents).toBe(LINES_TOTAL);
    });

    it("will not leave two quotes waiting on the same job", async () => {
      const job = await jobNumbered(4472);
      await request(app).post(`/api/jobs/${job._id.toString()}/quote`).set("Cookie", office).send({ lineItems: LINES });

      const second = await request(app)
        .post(`/api/jobs/${job._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ lineItems: LINES });

      expect(second.status).toBe(409);
    });

    it("sends once, however many times the button is pressed", async () => {
      const created = await request(app)
        .post(`/api/jobs/${(await jobNumbered(4472))._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ lineItems: LINES });

      const [first, second] = await Promise.all([
        request(app).post(`/api/quotes/${created.body.id}/send`).set("Cookie", office),
        request(app).post(`/api/quotes/${created.body.id}/send`).set("Cookie", office),
      ]);

      expect([first.status, second.status].sort()).toEqual([204, 409]);
    });

    it("refuses a price that is not whole cents", async () => {
      const job = await jobNumbered(4472);
      const response = await request(app)
        .post(`/api/jobs/${job._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ lineItems: [{ ...LINES[0]!, unitPriceCents: 68.5 }] });

      expect(response.status).toBe(400);
      expect(await Quote.countDocuments({ jobId: job._id, status: "draft" })).toBe(0);
    });
  });

  describe("billing the work", () => {
    it("bills the approved quote without anybody retyping it", async () => {
      // 4474 has an approved quote in the demo script.
      const job = await jobNumbered(4474);
      const approved = (await Quote.findOne({ jobId: job._id, status: "approved" }).lean())!;

      const invoice = await request(app).post(`/api/jobs/${job._id.toString()}/invoice`).set("Cookie", office).send({});

      expect(invoice.status).toBe(201);
      expect(invoice.body.lineItems).toHaveLength(approved.lineItems.length);
      expect(invoice.body.status).toBe("sent");
      // The same arithmetic as the quote, because they are the same lines.
      expect(invoice.body.totalCents).toBe(
        approved.lineItems.reduce((total, item) => total + (item.waived ? 0 : Math.round(item.quantity * item.unitPriceCents)), 0),
      );
    });

    it("says so when there is nothing approved to bill", async () => {
      const job = await jobNumbered(4472);
      const response = await request(app).post(`/api/jobs/${job._id.toString()}/invoice`).set("Cookie", office).send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("no approved quote");
    });

    it("takes written-out lines when there is no quote behind the work", async () => {
      const job = await jobNumbered(4472);
      const response = await request(app)
        .post(`/api/jobs/${job._id.toString()}/invoice`)
        .set("Cookie", office)
        .send({ lineItems: LINES });

      expect(response.status).toBe(201);
      expect(response.body.totalCents).toBe(LINES_TOTAL);
    });

    it("will not bill the same job twice", async () => {
      const job = await jobNumbered(4472);
      await request(app).post(`/api/jobs/${job._id.toString()}/invoice`).set("Cookie", office).send({ lineItems: LINES });

      const again = await request(app)
        .post(`/api/jobs/${job._id.toString()}/invoice`)
        .set("Cookie", office)
        .send({ lineItems: LINES });

      expect(again.status).toBe(409);
    });

    it("marks an invoice paid once, and freezes it afterwards", async () => {
      const job = await jobNumbered(4472);
      const created = await request(app)
        .post(`/api/jobs/${job._id.toString()}/invoice`)
        .set("Cookie", office)
        .send({ lineItems: LINES });

      expect((await request(app).post(`/api/invoices/${created.body.id}/paid`).set("Cookie", office)).status).toBe(204);
      expect((await request(app).post(`/api/invoices/${created.body.id}/paid`).set("Cookie", office)).status).toBe(409);

      const edit = await request(app)
        .patch(`/api/invoices/${created.body.id}`)
        .set("Cookie", office)
        .send({ lineItems: [{ ...LINES[0]!, unitPriceCents: 1_00 }] });
      expect(edit.status).toBe(409);

      const stored = (await Invoice.findById(created.body.id).lean())!;
      expect(stored.status).toBe("paid");
      expect(stored.paidAt).not.toBeNull();
    });
  });

  describe("the printed copy", () => {
    it("hands the office a PDF named after the document", async () => {
      const job = await jobNumbered(4471);
      const quote = (await Quote.findOne({ jobId: job._id }).lean())!;

      const response = await request(app)
        .get(`/api/quotes/${quote._id.toString()}/pdf`)
        .set("Cookie", office)
        .responseType("blob");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(response.headers["content-disposition"]).toContain(`filename="Q-${quote.number}.pdf"`);
      expect(response.headers["cache-control"]).toContain("no-store");
      expect(response.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });

    it("prints the same figures the customer was shown", async () => {
      const job = await jobNumbered(4471);
      const quote = (await Quote.findOne({ jobId: job._id }).lean())!;
      const onScreen = (await request(app).get(`/api/portal/${job.portalToken}`)).body.quote;

      const pdf = await request(app)
        .get(`/api/quotes/${quote._id.toString()}/pdf`)
        .set("Cookie", office)
        .responseType("blob");

      const text = textOfPdf(pdf.body);
      expect(text).toContain("Amara Osei");
      // $379.00 on her phone, $379.00 on the paper.
      expect(text).toContain((onScreen.totalCents / 100).toFixed(2));
    });

    it("lets the customer keep a copy from her own link", async () => {
      const job = await jobNumbered(4471);

      const response = await request(app).get(`/api/portal/${job.portalToken}/quote.pdf`).responseType("blob");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("application/pdf");
      expect(textOfPdf(response.body)).toContain("Northline Mechanical");
    });

    it("has no copy to give when nothing has been sent", async () => {
      // 4472 has no quote at all in the seeded script.
      const job = await jobNumbered(4472);
      expect((await request(app).get(`/api/portal/${job.portalToken}/quote.pdf`)).status).toBe(404);
    });

    it("will not print a draft the customer has never seen", async () => {
      const job = await jobNumbered(4472);
      await request(app).post(`/api/jobs/${job._id.toString()}/quote`).set("Cookie", office).send({ lineItems: LINES });

      // The draft exists, but it is not a document she has been sent.
      expect((await request(app).get(`/api/portal/${job.portalToken}/quote.pdf`)).status).toBe(404);
    });

    it("keeps one business's paperwork off another's printer", async () => {
      const rival = await Company.create({ name: "Rival Print", slug: "rival-print", trade: "Heating", timezone: "America/Chicago" });
      const theirQuote = await Quote.create({
        companyId: rival._id, number: 1, jobId: rival._id, customerId: rival._id, status: "sent",
        lineItems: [{ kind: "fee", description: "Theirs", quantity: 1, unitPriceCents: 100 }],
      });

      const response = await request(app).get(`/api/quotes/${theirQuote._id.toString()}/pdf`).set("Cookie", office);
      expect(response.status).toBe(404);
    });

    it("is not something a technician can pull", async () => {
      const tomas = await signInAs("Tomas Delgado");
      const job = await jobNumbered(4471);
      const quote = (await Quote.findOne({ jobId: job._id }).lean())!;

      expect((await request(app).get(`/api/quotes/${quote._id.toString()}/pdf`).set("Cookie", tomas)).status).toBe(403);
    });
  });

  describe("the money page", () => {
    it("lists what is owed and what is waiting, with the job and the customer", async () => {
      const response = await request(app).get("/api/money").set("Cookie", office);

      expect(response.status).toBe(200);
      const quote = (response.body.quotes as { customer: string; job: { number: number } | null; totalCents: number }[])
        .find((row) => row.job?.number === 4471)!;
      expect(quote.customer).toBe("Amara Osei");
      expect(quote.totalCents).toBe(379_00);

      expect(response.body.invoices.length).toBeGreaterThan(0);
      expect(response.body.invoices.every((row: { status: string }) => row.status !== "void")).toBe(true);
    });
  });

  describe("who may write it", () => {
    it("keeps the money away from technicians", async () => {
      const tomas = await signInAs("Tomas Delgado");
      const job = await jobNumbered(4471);

      expect((await request(app).get("/api/money").set("Cookie", tomas)).status).toBe(403);
      expect(
        (await request(app).post(`/api/jobs/${job._id.toString()}/quote`).set("Cookie", tomas).send({ lineItems: LINES })).status,
      ).toBe(403);
    });

    it("never writes a document onto another business's job", async () => {
      const rival = await Company.create({ name: "Rival Money", slug: "rival-money", trade: "Heating", timezone: "America/Chicago" });
      const now = new Date();
      const theirJob = await Job.create({
        companyId: rival._id, number: 1, customerId: rival._id, propertyId: rival._id, title: "Theirs", status: "scheduled",
        scheduledStart: now, scheduledEnd: new Date(now.getTime() + 3_600_000), estimatedMinutes: 60, requestedAt: now,
        portalToken: "rival-money-token-000000001",
      });

      const response = await request(app)
        .post(`/api/jobs/${theirJob._id.toString()}/quote`)
        .set("Cookie", office)
        .send({ lineItems: LINES });

      expect(response.status).toBe(404);
      expect(await Quote.countDocuments({ jobId: theirJob._id })).toBe(0);
    });
  });
});
