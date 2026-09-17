import type { CookieOptions } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { ROLES, type Role } from "../models/User";

export const SESSION_COOKIE = "kx_session";

const SESSION_DAYS = 7;

export type SessionClaims = { userId: string; companyId: string; role: Role };

/**
 * The session is a signed token in an httpOnly cookie: page scripts cannot
 * read it, and the browser sends it with every same-site API call. The API is
 * reached through the client's own domain (a Vercel rewrite), which is what
 * keeps this cookie first-party — and therefore not blocked by Safari.
 */
export function signSession(claims: SessionClaims): string {
  return jwt.sign({ cid: claims.companyId, role: claims.role }, env.jwtSecret, {
    subject: claims.userId,
    expiresIn: `${SESSION_DAYS}d`,
    algorithm: "HS256",
  });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.sub !== "string") return null;
    if (typeof payload.cid !== "string" || !ROLES.includes(payload.role)) return null;
    return { userId: payload.sub, companyId: payload.cid, role: payload.role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}
