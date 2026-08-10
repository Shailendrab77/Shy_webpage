import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

/**
 * Simple API-key auth for administrative endpoints.
 * Expect header: x-admin-api-key
 */
export const requireAdminApiKey: RequestHandler = (req, res, next) => {
  const provided = req.header('x-admin-api-key');
  if (!provided || provided !== env.ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};
