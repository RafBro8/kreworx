import { Router } from "express";

import { databaseState } from "../config/db";
import { env } from "../config/env";

const router = Router();

const startedAt = Date.now();

/**
 * Render pings this to decide whether a deploy is live, and we read it by hand
 * to confirm which commit is running and which database it is talking to.
 */
router.get("/health", (_req, res) => {
  const database = databaseState();

  res.json({
    status: database.ready ? "ok" : "degraded",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    commit: env.commit?.slice(0, 7) ?? null,
    demoMode: env.demoMode,
    database: {
      connected: database.ready,
      // The database name is a useful check when several environments share a
      // cluster, but it is not something production needs to advertise.
      ...(env.isProduction ? {} : { name: database.name }),
    },
  });
});

export default router;
