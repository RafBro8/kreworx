import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config/env";
import { loadSession } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth.routes";
import demoRoutes from "./routes/demo.routes";
import healthRoutes from "./routes/health.routes";
import ownerRoutes from "./routes/owner.routes";
import portalRoutes from "./routes/portal.routes";
import scheduleRoutes from "./routes/schedule.routes";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  if (!env.isTest) {
    app.use(morgan(env.isProduction ? "combined" : "dev"));
  }

  // The API lives under /api so the same host could serve the built client
  // later without the two fighting over paths.
  app.use("/api", healthRoutes);
  app.use("/api", loadSession, authRoutes, portalRoutes, scheduleRoutes, ownerRoutes, demoRoutes);

  // Render's URL is a demo link people will paste into a browser; give them
  // something other than a 404 when they do.
  app.get("/", (_req, res) => {
    res.json({ name: "Kreworx API", docs: "/api/health" });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
