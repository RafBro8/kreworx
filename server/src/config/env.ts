import "dotenv/config";

/**
 * Every environment variable the server reads, resolved once at startup, so a
 * missing value fails at boot with a readable message rather than mid-demo.
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy server/.env.example to server/.env and fill it in.`,
    );
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === "test",
  port: Number(process.env.PORT ?? 4200),
  // Production must supply real values; locally both fall back so a fresh
  // clone runs against the docker-compose Mongo with no setup.
  mongodbUri: isProduction
    ? required("MONGODB_URI")
    : required("MONGODB_URI", "mongodb://127.0.0.1:27030/kreworx"),
  jwtSecret: isProduction
    ? required("JWT_SECRET")
    : required("JWT_SECRET", "local-development-secret-not-for-production"),
  // Demo mode enables one-click sign-in as the seeded Northline staff and
  // re-seeds the demo each day. Off unless asked for in production.
  demoMode: (process.env.DEMO_MODE ?? (isProduction ? "false" : "true")) === "true",
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5200")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
  // Render sets this on every deploy; it is how we confirm which build is live.
  commit: process.env.RENDER_GIT_COMMIT ?? null,
} as const;
