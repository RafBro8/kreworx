import mongoose from "mongoose";

import { env } from "./env";

/**
 * Mongoose buffers operations until it connects, so the app can start serving
 * before the database is up. We still await the first connection at boot: a
 * server that answers /health while its database is unreachable is worse than
 * one that refuses to start.
 */
export async function connectDatabase(uri: string = env.mongodbUri): Promise<typeof mongoose> {
  mongoose.set("strictQuery", true);

  // Indexes are built explicitly per model at startup rather than implicitly on
  // first use, because autoIndex hides index conflicts instead of reporting them.
  const connection = await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10_000,
  });

  return connection;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function databaseState(): { name: string | null; ready: boolean } {
  return {
    name: mongoose.connection.name ?? null,
    ready: mongoose.connection.readyState === 1,
  };
}
