import { MongoMemoryServer } from "mongodb-memory-server";
import Stripe from "stripe";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { env } from "../config/env";
import { seedDemo } from "../demo/seedDemo";
import { Company, ensureIndexes, Invoice, Job } from "../models";
import { setStripeClientForTests } from "../services/payments";

const app = createApp();

const SECRET = "whsec_test_secret_for_signature_checks";

/** A Stripe client that signs like the real one but talks to nothing. */
const offlineStripe = new Stripe("sk_test_not_a_real_key");

const jobNumbered = async (number: number) => {
  const company = (await Company.findOne({ slug: "northline" }).lean())!;
  return (await Job.findOne({ companyId: company._id, number }).lean())!;
};

/** The body Stripe would send, signed the way Stripe signs it. */
function signed(body: unknown) {
  const payload = JSON.stringify(body);
  return {
    payload,
    signature: offlineStripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }),
  };
}

const sessionEvent = (invoiceId: string, overrides: Record<string, unknown> = {}) => ({
  id: `evt_${Math.random().toString(36).slice(2)}`,
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_123",
      metadata: { invoiceId },
      client_reference_id: invoiceId,
      payment_status: "paid",
      ...overrides,
    },
  },
});

describe("taking a card", () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri("kreworx_stripe_test"));
    await ensureIndexes();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
    setStripeClientForTests(null);
  });

  beforeEach(async () => {
    await seedDemo();
    // The keys are read once at startup, so the tests set them for the run.
    Object.assign(env.stripe as { secretKey: string | null; webhookSecret: string | null }, {
      secretKey: "sk_test_not_a_real_key",
      webhookSecret: SECRET,
    });
    setStripeClientForTests(offlineStripe);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("the webhook", () => {
    it("marks the invoice paid when Stripe says the session completed", async () => {
      const job = await jobNumbered(4466);
      const invoice = (await Invoice.findOne({ jobId: job._id }).lean())!;
      await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "sent", paidAt: null } });

      const { payload, signature } = signed(sessionEvent(invoice._id.toString()));
      const response = await request(app)
        .post("/api/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("stripe-signature", signature)
        .send(payload);

      expect(response.status).toBe(200);
      const after = (await Invoice.findById(invoice._id).lean())!;
      expect(after.status).toBe("paid");
      expect(after.paidAt).not.toBeNull();
    });

    it("refuses an unsigned claim that an invoice was paid", async () => {
      const job = await jobNumbered(4466);
      const invoice = (await Invoice.findOne({ jobId: job._id }).lean())!;
      await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "sent", paidAt: null } });

      // Exactly the body Stripe would send - but from somebody who does not
      // have the signing secret.
      const response = await request(app)
        .post("/api/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("stripe-signature", "t=1,v1=deadbeef")
        .send(JSON.stringify(sessionEvent(invoice._id.toString())));

      expect(response.status).toBe(400);
      expect((await Invoice.findById(invoice._id).lean())!.status).toBe("sent");
    });

    it("refuses a body signed with the wrong secret", async () => {
      const job = await jobNumbered(4466);
      const invoice = (await Invoice.findOne({ jobId: job._id }).lean())!;
      await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "sent", paidAt: null } });

      const payload = JSON.stringify(sessionEvent(invoice._id.toString()));
      const signature = offlineStripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_elses" });

      const response = await request(app)
        .post("/api/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("stripe-signature", signature)
        .send(payload);

      expect(response.status).toBe(400);
      expect((await Invoice.findById(invoice._id).lean())!.status).toBe("sent");
    });

    it("pays an invoice once, however many times Stripe delivers the event", async () => {
      const job = await jobNumbered(4466);
      const invoice = (await Invoice.findOne({ jobId: job._id }).lean())!;
      await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "sent", paidAt: null } });

      const { payload, signature } = signed(sessionEvent(invoice._id.toString()));
      const deliver = () =>
        request(app)
          .post("/api/stripe/webhook")
          .set("Content-Type", "application/json")
          .set("stripe-signature", signature)
          .send(payload);

      expect((await deliver()).status).toBe(200);
      const firstPaidAt = (await Invoice.findById(invoice._id).lean())!.paidAt;

      // Stripe retries until it is acknowledged, and can deliver twice anyway.
      expect((await deliver()).status).toBe(200);
      const secondPaidAt = (await Invoice.findById(invoice._id).lean())!.paidAt;

      expect(secondPaidAt).toEqual(firstPaidAt);
    });

    it("leaves a bank debit alone until the money actually arrives", async () => {
      const job = await jobNumbered(4466);
      const invoice = (await Invoice.findOne({ jobId: job._id }).lean())!;
      await Invoice.updateOne({ _id: invoice._id }, { $set: { status: "sent", paidAt: null } });

      const { payload, signature } = signed(
        sessionEvent(invoice._id.toString(), { payment_status: "unpaid" }),
      );
      const response = await request(app)
        .post("/api/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("stripe-signature", signature)
        .send(payload);

      // Acknowledged, so Stripe stops retrying - but not treated as settled.
      expect(response.status).toBe(200);
      expect((await Invoice.findById(invoice._id).lean())!.status).toBe("sent");
    });

    it("shrugs at an event about something it does not know", async () => {
      const { payload, signature } = signed(sessionEvent("6000000000000000000000aa"));
      const response = await request(app)
        .post("/api/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("stripe-signature", signature)
        .send(payload);

      expect(response.status).toBe(200);
    });
  });

  describe("starting a payment", () => {
    it("has nothing to charge for when the visit has no invoice", async () => {
      const job = await jobNumbered(4472);
      const response = await request(app).post(`/api/portal/${job.portalToken}/pay`).send({});

      expect(response.status).toBe(404);
    });

    it("has nothing to charge for once the invoice is settled", async () => {
      const job = await jobNumbered(4466);
      await Invoice.updateOne({ jobId: job._id }, { $set: { status: "paid", paidAt: new Date() } });

      const response = await request(app).post(`/api/portal/${job.portalToken}/pay`).send({});
      expect(response.status).toBe(404);
    });

    it("refuses a link that names no visit", async () => {
      const response = await request(app).post("/api/portal/abcdefghijklmnopqrstuvwxyz012345/pay").send({});
      expect(response.status).toBe(404);
    });
  });

  describe("with no keys configured", () => {
    beforeEach(() => {
      Object.assign(env.stripe as { secretKey: string | null; webhookSecret: string | null }, {
        secretKey: null,
        webhookSecret: null,
      });
      setStripeClientForTests(null);
    });

    it("takes no webhooks at all", async () => {
      const response = await request(app)
        .post("/api/stripe/webhook")
        .set("Content-Type", "application/json")
        .set("stripe-signature", "t=1,v1=whatever")
        .send("{}");

      expect(response.status).toBe(404);
    });

    it("tells the portal there is no card payment to be had", async () => {
      const job = await jobNumbered(4466);
      const response = await request(app).post(`/api/portal/${job.portalToken}/pay`).send({});

      expect(response.status).toBe(404);
    });

    it("says on the customer's page that the invoice cannot be paid here", async () => {
      const job = await jobNumbered(4466);
      const view = await request(app).get(`/api/portal/${job.portalToken}`);

      expect(view.body.invoice).not.toBeNull();
      expect(view.body.invoice.payable).toBe(false);
    });
  });
});
