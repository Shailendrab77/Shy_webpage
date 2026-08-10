import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  ADMIN_API_KEY: z.string().min(8).default('change-me-to-a-strong-secret'),

  MAX_PAYOUT_AMOUNT: z.coerce.number().positive().default(100_000),
  MIN_PAYOUT_AMOUNT: z.coerce.number().positive().default(1),
  REQUEST_CODE_PREFIX: z.string().min(1).default('PAY'),
  REQUEST_CODE_START: z.coerce.number().int().positive().default(10_001),
  ALLOW_PAYOUT_CANCELLATION: booleanFromString.default(true),
  DUPLICATE_REQUEST_WINDOW_MINUTES: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),

  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional().default(''),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional().default(''),
  GOOGLE_PRIVATE_KEY: z.string().optional().default(''),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_SHEETS_CUSTOMERS_RANGE: z.string().default('Customers!A:G'),
  GOOGLE_SHEETS_PAYOUTS_RANGE: z.string().default('PayoutRequests!A:J'),

  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(''),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_API_BASE_URL: z.string().url().default('https://graph.facebook.com'),

  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LLM_PROVIDER: z.enum(['openai', 'heuristic']).default('openai'),

  CONVERSATION_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = parsed.data;
  if (env.GOOGLE_PRIVATE_KEY) {
    env.GOOGLE_PRIVATE_KEY = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  return env;
}

export const env = parseEnv(process.env);

export function isGoogleSheetsConfigured(config: Env = env): boolean {
  const hasSpreadsheet = Boolean(config.GOOGLE_SHEETS_SPREADSHEET_ID);
  const hasJsonFile = Boolean(config.GOOGLE_APPLICATION_CREDENTIALS);
  const hasInlineCreds =
    Boolean(config.GOOGLE_SERVICE_ACCOUNT_EMAIL) && Boolean(config.GOOGLE_PRIVATE_KEY);
  return hasSpreadsheet && (hasJsonFile || hasInlineCreds);
}

export function isWhatsAppConfigured(config: Env = env): boolean {
  return Boolean(
    config.WHATSAPP_ACCESS_TOKEN &&
      config.WHATSAPP_PHONE_NUMBER_ID &&
      config.WHATSAPP_VERIFY_TOKEN,
  );
}

export function isOpenAiConfigured(config: Env = env): boolean {
  return config.LLM_PROVIDER === 'openai' && Boolean(config.OPENAI_API_KEY);
}
