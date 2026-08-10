import { z } from 'zod';

export const agentIntentSchema = z.enum([
  'payout_request',
  'payout_status',
  'provide_customer_id',
  'provide_amount',
  'cancel_request',
  'help',
  'unknown',
]);

export const missingFieldSchema = z.enum(['amount', 'customerId', 'requestCode']);

/**
 * Structured LLM output. Backend validates with Zod before any side effects.
 * The LLM must NEVER modify Google Sheets or approve payouts.
 */
export const agentExtractionSchema = z.object({
  intent: agentIntentSchema,
  customerId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  amount: z
    .number()
    .finite()
    .positive()
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? null : v)),
  requestCode: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional()
    .transform((v) => (v ? v.toUpperCase() : null)),
  missingFields: z.array(missingFieldSchema).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  clarificationNeeded: z.boolean().default(false),
  rawNotes: z.string().optional(),
});

export type AgentExtractionParsed = z.infer<typeof agentExtractionSchema>;

export const whatsappWebhookPayloadSchema = z.object({
  object: z.string().optional(),
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  messaging_product: z.string().optional(),
                  metadata: z
                    .object({
                      display_phone_number: z.string().optional(),
                      phone_number_id: z.string().optional(),
                    })
                    .optional(),
                  contacts: z
                    .array(
                      z.object({
                        wa_id: z.string().optional(),
                        profile: z.object({ name: z.string().optional() }).optional(),
                      }),
                    )
                    .optional(),
                  messages: z
                    .array(
                      z.object({
                        from: z.string(),
                        id: z.string(),
                        timestamp: z.string().optional(),
                        type: z.string().optional(),
                        text: z.object({ body: z.string() }).optional(),
                      }),
                    )
                    .optional(),
                  statuses: z.array(z.unknown()).optional(),
                })
                .passthrough(),
              field: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});
