import type { Server as HttpServer } from "node:http";

import { Server as SocketServer } from "socket.io";

import { env } from "../config/env";
import { companyRoom, jobRoom, verifyTicket } from "./tickets";

let io: SocketServer | null = null;

/**
 * Dispatch is a live board: a job moving on one screen has to move on every
 * other screen without a refresh.
 *
 * Events carry no job data, only "this changed". Each client then reloads
 * through the API, which already decides what that person is allowed to see -
 * so a technician cannot learn about another crew's work by listening, and
 * there is one set of permission rules rather than two.
 */
export function createRealtime(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: { origin: env.clientOrigins, credentials: true },
    // Render's proxy handles websockets; polling stays as the fallback.
    transports: ["websocket", "polling"],
  });

  io.use((socket, next) => {
    const ticket = verifyTicket((socket.handshake.auth as { ticket?: unknown } | undefined)?.ticket);
    if (!ticket) return next(new Error("Not allowed"));

    socket.join(ticket.kind === "staff" ? companyRoom(ticket.companyId) : jobRoom(ticket.jobId));
    next();
  });

  return io;
}

/** Tells one business that something on its board moved. */
export function notifyCompany(companyId: string, payload: { jobId: string; dates: string[]; reason: string }): void {
  // Emitting before the server exists is not an error: tests and scripts run
  // plenty of code paths with no socket server attached.
  io?.to(companyRoom(companyId)).emit("board:changed", payload);
}

/** Tells whoever has one customer's link that their job moved on. */
export function notifyJob(jobId: string, payload: { status: string }): void {
  io?.to(jobRoom(jobId)).emit("job:changed", payload);
}

export async function closeRealtime(): Promise<void> {
  if (!io) return;
  await io.close();
  io = null;
}
