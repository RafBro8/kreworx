import jwt from "jsonwebtoken";

import { env } from "../config/env";

/**
 * A short-lived pass for opening a socket.
 *
 * The browser reaches the API through the client's own domain, so the session
 * cookie is first-party there. The socket cannot go the same way - that route
 * does not carry WebSockets - so it connects to the API host directly, where
 * the cookie would be third-party and blocked. Instead the page asks for one
 * of these with its cookie and hands it over on connect.
 *
 * It lives a minute: long enough to connect, short enough that a ticket in a
 * log or a URL is worthless by the time anyone reads it.
 */

const TICKET_SECONDS = 60;

export type Ticket =
  | { kind: "staff"; userId: string; companyId: string }
  | { kind: "portal"; jobId: string };

export function signTicket(ticket: Ticket): string {
  return jwt.sign({ ...ticket, use: "socket" }, env.jwtSecret, {
    expiresIn: TICKET_SECONDS,
    algorithm: "HS256",
  });
}

export function verifyTicket(token: unknown): Ticket | null {
  if (typeof token !== "string") return null;
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    if (typeof payload === "string" || payload.use !== "socket") return null;
    if (payload.kind === "staff" && typeof payload.userId === "string" && typeof payload.companyId === "string") {
      return { kind: "staff", userId: payload.userId, companyId: payload.companyId };
    }
    if (payload.kind === "portal" && typeof payload.jobId === "string") {
      return { kind: "portal", jobId: payload.jobId };
    }
    return null;
  } catch {
    return null;
  }
}

/** Everyone in one business sees the same board. */
export const companyRoom = (companyId: string) => `company:${companyId}`;
/** One customer's link, and nothing else. */
export const jobRoom = (jobId: string) => `job:${jobId}`;
