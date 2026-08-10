import pino from 'pino';
import { env } from '../config/env.js';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'whatsapp-payout-agent',
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-admin-api-key"]',
      'accessToken',
      'token',
      'password',
      'privateKey',
      'credentials',
      'apiKey',
      '*.accessToken',
      '*.privateKey',
    ],
    remove: true,
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
});

export type Logger = typeof logger;

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
