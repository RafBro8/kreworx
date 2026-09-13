import type { Server as HttpServer } from "node:http";

import { Server as SocketServer } from "socket.io";

import { env } from "../config/env";

let io: SocketServer | null = null;

/**
 * Dispatch is a live board — a job moving on one screen has to move on every
 * other screen without a refresh. The socket server is created here at startup
 * so later features can just call `emit()` without threading a reference
 * through every service.
 */
export function createRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: env.clientOrigins, credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("disconnect", () => {
      // Rooms are joined per tenant and per role once auth lands in stage 2.
    });
  });

  return io;
}

export function emit(event: string, payload: unknown): void {
  // Emitting before the server exists is not an error — tests and scripts run
  // plenty of code paths with no socket server attached.
  io?.emit(event, payload);
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
