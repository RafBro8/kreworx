import type { RequestHandler } from "express";
import { isValidObjectId, Types } from "mongoose";

import { SESSION_COOKIE, verifySession } from "../auth/session";
import { ApiError } from "../lib/ApiError";
import { User } from "../models";
import type { Role } from "../models/User";

export type AuthContext = {
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  role: Role;
  name: string;
};

declare global {
  // Express's own extension point for request properties.
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Reads the session cookie if there is one. The user is looked up on every
 * request rather than trusted from the token, so a deleted user or a changed
 * role takes effect immediately instead of when the token expires.
 */
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string") return next();

  const claims = verifySession(token);
  if (!claims || !isValidObjectId(claims.userId)) return next();

  const user = await User.findById(claims.userId, { companyId: 1, role: 1, name: 1 }).lean();
  if (user && user.companyId.toString() === claims.companyId) {
    req.auth = { userId: user._id, companyId: user.companyId, role: user.role, name: user.name };
  }
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.auth ? undefined : ApiError.unauthorized());
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());
    next(roles.includes(req.auth.role) ? undefined : ApiError.forbidden());
  };
}

/** For handlers behind requireAuth, where the session is guaranteed. */
export function authOf(req: Express.Request): AuthContext {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth;
}
