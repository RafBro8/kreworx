import { Router } from "express";

import { env } from "../config/env";
import { seedDemo } from "../demo/seedDemo";
import { ApiError } from "../lib/ApiError";
import { authOf, requireRole } from "../middleware/auth";
import { Company } from "../models";

const router = Router();

let resetting: Promise<unknown> | null = null;

/**
 * Puts the demo business back to this morning.
 *
 * The demo is shared: anyone evaluating it can move jobs around, and the next
 * visitor sees what they left behind. Rather than wait for the daily rebuild,
 * the owner can undo it here. Only ever touches a company flagged as a demo,
 * so this cannot be pointed at a real business.
 */
router.post("/demo/reset", requireRole("owner"), async (req, res) => {
  if (!env.demoMode) throw ApiError.notFound();

  const auth = authOf(req);
  const company = await Company.findById(auth.companyId, { isDemo: 1 }).lean();
  if (!company?.isDemo) throw ApiError.forbidden("This is not a demo company");

  // Two people pressing the button together share one rebuild.
  resetting ??= seedDemo().finally(() => {
    resetting = null;
  });
  await resetting;

  res.status(204).end();
});

export default router;
