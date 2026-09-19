import { Router } from "express";
import { z } from "zod";

import { env } from "../config/env";
import { ApiError } from "../lib/ApiError";
import { Job } from "../models";
import { signTicket } from "../realtime/tickets";

const router = Router();

const ticketBody = z.object({ portalToken: z.string().min(16).max(128).optional() }).strict();

/**
 * Hands out a pass for opening a socket, to whoever is already allowed in:
 * signed-in staff get their company's board, and someone holding a customer
 * link gets that one job. Anyone else gets nothing.
 */
router.post("/realtime/ticket", async (req, res) => {
  const parsed = ticketBody.safeParse(req.body ?? {});
  if (!parsed.success) throw ApiError.badRequest("Invalid request");

  const url = env.publicApiUrl || null;

  // A customer link wins over a session: someone at the office looking at what
  // a customer sees is asking to watch that job, not their own board. Without
  // this, opening the portal in a browser that happens to be signed in would
  // subscribe to the wrong thing and the page would never update.
  if (parsed.data.portalToken) {
    const job = await Job.findOne({ portalToken: parsed.data.portalToken }, { _id: 1, status: 1 }).lean();
    if (job && job.status !== "cancelled") {
      return res.json({ ticket: signTicket({ kind: "portal", jobId: job._id.toString() }), url });
    }
  }

  if (req.auth) {
    const ticket = signTicket({
      kind: "staff",
      userId: req.auth.userId.toString(),
      companyId: req.auth.companyId.toString(),
    });
    return res.json({ ticket, url });
  }

  throw ApiError.unauthorized("Sign in to continue");
});

export default router;
