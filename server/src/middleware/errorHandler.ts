import type { ErrorRequestHandler, RequestHandler } from "express";

import { env } from "../config/env";
import { ApiError } from "../lib/ApiError";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

// Express identifies the error handler by its four-argument shape, so `next`
// stays in the signature even though it is unused.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const isKnown = error instanceof ApiError;
  const status = isKnown ? error.status : 500;

  if (!isKnown) {
    console.error("Unhandled error:", error);
  }

  res.status(status).json({
    error: isKnown ? error.message : "Something went wrong on our end",
    ...(isKnown && error.details !== undefined ? { details: error.details } : {}),
    // A stack trace is useful while developing and is never sent in production.
    ...(!env.isProduction && !isKnown && error instanceof Error ? { stack: error.stack } : {}),
  });
};
