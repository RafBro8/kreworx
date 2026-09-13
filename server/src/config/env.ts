import "dotenv/config";

/**
 * Every environment variable the server reads, resolved once at startup.
 *
 * Anything required is checked here rather than at the call site, so a missing
 * variable fails immediately with a readable message instead of surfacing as a
 * confusing runtime error an hour into a demo.
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
  // In production the URI must be supplied; locally it falls back to the
  // docker-compose instance so a fresh clone runs with no setup.
  mongodbUri: isProduction
    ? required("MONGODB_URI")
    : required("MONGODB_URI", "mongodb://127.0.0.1:27030/kreworx"),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5200")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
  // Render sets this on every deploy; it is how we confirm which build is live.
  commit: process.env.RENDER_GIT_COMMIT ?? null,
} as const;
