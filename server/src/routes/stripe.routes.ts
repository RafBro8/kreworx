import express, { Router } from "express";

import { env } from "../config/env";
import { ApiError } from "../lib/ApiError";
import { settleFromSession, stripeClient } from "../services/payments";

const router = Router();

/**
 * What Stripe tells us, and why it is believed.
 *
 * This endpoint is public - it has to be, Stripe calls it from the internet -
 * so the signature is the whole of the security. Without verifying it, anybody
 * who guessed the URL could post "invoice paid" and be believed. The body must
 * therefore stay raw: parsing it to JSON first would change the bytes the
 * signature was computed over.
 *
 * Stripe retries until it gets a 2xx and may send the same event twice, so
 * everything downstream is written to be safe to repeat.
 */
router.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const stripe = stripeClient();
  const secret = env.stripe.webhookSecret;
  if (!stripe || !secret) throw ApiError.notFound("This server is not taking card payments");

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") throw ApiError.badRequest("Unsigned");

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);
  } catch {
    // Deliberately terse: a bad signature is either a misconfiguration or
    // somebody probing, and neither deserves a helpful explanation.
    throw ApiError.badRequest("Bad signature");
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await settleFromSession(event.data.object as Parameters<typeof settleFromSession>[0]);
  }

  // Anything else is acknowledged and ignored, so Stripe stops retrying it.
  res.json({ received: true });
});

export default router;
