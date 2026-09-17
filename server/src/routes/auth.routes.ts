import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { z } from "zod";

import { SESSION_COOKIE, sessionCookieOptions, signSession } from "../auth/session";
import { env } from "../config/env";
import { COMPANY } from "../demo/northline";
import { ApiError } from "../lib/ApiError";
import { authOf, requireAuth } from "../middleware/auth";
import { Company, Customer, Job, User } from "../models";

const router = Router();

/** The job the customer card on the welcome screen opens. */
const SHOWCASE_JOB = 4471;

const ROLE_ORDER = { owner: 0, dispatcher: 1, technician: 2 } as const;

router.get("/auth/me", requireAuth, async (req, res) => {
  const auth = authOf(req);
  const [user, company] = await Promise.all([
    User.findById(auth.userId, { name: 1, role: 1, title: 1, isDemo: 1 }).lean(),
    Company.findById(auth.companyId, { name: 1, timezone: 1, isDemo: 1 }).lean(),
  ]);
  if (!user || !company) throw ApiError.unauthorized();

  res.json({
    user: { id: user._id, name: user.name, role: user.role, title: user.title ?? null },
    company: { id: company._id, name: company.name, timezone: company.timezone, isDemo: company.isDemo },
  });
});

router.post("/auth/logout", (_req, res) => {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, options);
  res.status(204).end();
});

// ---- demo mode ----------------------------------------------------------------
// Everything below exists so someone evaluating the product can see it from
// each seat in one click. With DEMO_MODE off these routes do not exist.

router.get("/auth/demo-accounts", async (_req, res) => {
  if (!env.demoMode) throw ApiError.notFound();

  const company = await Company.findOne({ slug: COMPANY.slug, isDemo: true }, { name: 1 }).lean();
  if (!company) throw new ApiError(503, "The demo is still being set up. Try again in a moment.");

  const [staff, job] = await Promise.all([
    User.find({ companyId: company._id, isDemo: true }, { name: 1, role: 1, title: 1 }).lean(),
    Job.findOne({ companyId: company._id, number: SHOWCASE_JOB }, { portalToken: 1, customerId: 1, title: 1 }).lean(),
  ]);
  const customer = job ? await Customer.findById(job.customerId, { name: 1 }).lean() : null;

  res.json({
    company: { name: company.name },
    staff: staff
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.name.localeCompare(b.name))
      .map((user) => ({ id: user._id, name: user.name, role: user.role, title: user.title ?? null })),
    customer: job && customer ? { name: customer.name, jobTitle: job.title, portalToken: job.portalToken } : null,
  });
});

const demoSignInBody = z.object({ userId: z.string().refine(isValidObjectId, "Not a valid user id") });

router.post("/auth/demo", async (req, res) => {
  if (!env.demoMode) throw ApiError.notFound();

  const parsed = demoSignInBody.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Choose someone to sign in as");

  // Only seeded demo staff can be entered this way — never a real account.
  const user = await User.findOne({ _id: parsed.data.userId, isDemo: true }, { companyId: 1, role: 1 }).lean();
  if (!user) throw ApiError.notFound("That demo account does not exist");

  const token = signSession({ userId: user._id.toString(), companyId: user.companyId.toString(), role: user.role });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(204).end();
});

export default router;
