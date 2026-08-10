# Architecture Proposal

## Current repo state (before this work)

The repository was a Vite “Shy Webpage” scaffold (`index.html`, `src/main.js`, Vite config). It has been replaced with the WhatsApp Payout Request Agent.

## Proposed architecture

```text
WhatsApp Cloud API
       │
       ▼
Express /webhook  ──► ConversationOrchestrator
                           │
           ┌───────────────┼────────────────┐
           ▼               ▼                ▼
      PayoutAgent     PayoutService    ConversationStore
   (LLM → Zod JSON)  (deterministic)   (memory → Redis later)
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
        CustomerRepository    PayoutRepository
                 │                   │
                 └─────────┬─────────┘
                           ▼
                   Google Sheets today
                   PostgreSQL later
```

### Safety boundary

| Layer | Allowed | Forbidden |
| --- | --- | --- |
| AI Agent | Intent + field extraction | Sheets writes, approvals, status decisions |
| Backend | Validation, codes, Sheets I/O, WhatsApp replies | Trusting free-form LLM text for side effects |

Initial payout status is always **`Pending`** unless backend/admin code changes it.

## Folder structure

See repository `src/` layout. Responsibilities are split by domain: `agent`, `payout`, `customers`, `googleSheets`, `whatsapp`, `state`, `admin`.

## Dependencies

**Runtime:** express, zod, dotenv, googleapis, openai, pino, pino-http, helmet, cors, express-rate-limit  

**Dev:** typescript, tsx, vitest, supertest, @types/*

## Environment variables

Documented in `.env.example` (WhatsApp, Google Sheets, OpenAI, business rules, admin key, logging).

## Google Sheets setup requirements

1. Cloud project + Sheets API  
2. Service account + shared spreadsheet  
3. Tabs: `Customers`, `PayoutRequests` (see `docs/google-sheets-template.md`)  
4. Spreadsheet ID + credentials in env — never committed  

## WhatsApp setup requirements

1. Meta app with WhatsApp product  
2. Phone number ID + access token + verify token  
3. Webhook `GET/POST /webhook` publicly reachable  
4. Subscribe to `messages`

## Implementation plan (completed)

1. Scaffold TypeScript/Express project  
2. Domain types + Zod env config + logger/errors  
3. Repository interfaces + Sheets/in-memory adapters  
4. Amount parsing, validation, request codes, payout service  
5. Agent + conversation orchestrator + idempotency  
6. WhatsApp webhook/service + admin routes + security middleware  
7. Tests for the required scenarios  
8. README + `.env.example` + sheet template docs  
