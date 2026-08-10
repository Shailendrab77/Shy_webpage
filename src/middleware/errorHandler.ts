import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, getCustomerSafeMessage } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_ERROR';

  logger.error({ err, code, statusCode }, 'Request failed');

  if (env.NODE_ENV === 'production') {
    res.status(statusCode).json({
      error: getCustomerSafeMessage(err),
      code,
    });
    return;
  }

  res.status(statusCode).json({
    error: err instanceof Error ? err.message : 'Unknown error',
    code,
    details: err instanceof AppError ? err.details : undefined,
  });
};
