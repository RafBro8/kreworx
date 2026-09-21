import { createServer } from "node:http";

import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/db";
import { env } from "./config/env";
import { ensureDemoIsFresh } from "./demo/seedDemo";
import { tickDemo } from "./demo/simulator";
import { ensureIndexes } from "./models";
import { closeRealtime, createRealtime } from "./realtime/io";

async function main(): Promise<void> {
  await connectDatabase();
  await ensureIndexes();
  await ensureDemoIsFresh();

  // Checked hourly so a long-running instance rolls the demo over to the new
  // day on its own; on the free plan the check on boot usually gets there first.
  // Walks the demo day forward: crews set off, arrive and finish while someone
  // is watching, rather than the board standing still.
  const simulation = setInterval(() => {
    tickDemo().catch((error: unknown) => console.error("Demo tick failed:", error));
  }, 20_000);
  simulation.unref();

  const demoTimer = setInterval(() => {
    ensureDemoIsFresh().catch((error: unknown) => console.error("Demo refresh failed:", error));
  }, 60 * 60 * 1000);
  demoTimer.unref();

  const server = createServer(createApp());
  createRealtime(server);

  server.listen(env.port, () => {
    console.log(`Kreworx API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  // Render replaces instances by sending SIGTERM; closing cleanly avoids
  // dropping in-flight requests and leaving sockets half-open.
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, shutting down`);
    await closeRealtime();
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  console.error("Failed to start Kreworx API:", error);
  process.exit(1);
});
