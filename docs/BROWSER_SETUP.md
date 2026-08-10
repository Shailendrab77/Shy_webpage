# Run the WhatsApp Payout Agent in your browser

This project is a **Node.js backend**. You do **not** open the TypeScript files directly in Chrome.
You install Node.js, start the server, then open the demo page in your browser.

---

## Part A — Download the code

### Option 1: Download ZIP from GitHub

1. Open the pull request or branch:
   - PR: https://github.com/Shailendrab77/Shy_webpage/pull/2
   - Branch: `cursor/whatsapp-payout-agent-3fba`
2. On GitHub: **Code → Download ZIP**
   - Or open:  
     `https://github.com/Shailendrab77/Shy_webpage/archive/refs/heads/cursor/whatsapp-payout-agent-3fba.zip`
3. Extract the ZIP to a folder, for example:
   - Windows: `C:\Users\<you>\whatsapp-payout-agent`
   - Mac/Linux: `~/whatsapp-payout-agent`

### Option 2: Clone with Git

```bash
git clone -b cursor/whatsapp-payout-agent-3fba https://github.com/Shailendrab77/Shy_webpage.git whatsapp-payout-agent
cd whatsapp-payout-agent
```

---

## Part B — Install Node.js (required)

1. Download Node.js **20 LTS or newer** from https://nodejs.org/
2. Install it (include “Add to PATH” on Windows).
3. Open a terminal:
   - Windows: **Command Prompt** or **PowerShell**
   - Mac: **Terminal**
   - Linux: your shell
4. Verify:

```bash
node -v
npm -v
```

You should see versions printed (Node `v20+`).

---

## Part C — Install project dependencies

In the project folder:

```bash
cd whatsapp-payout-agent
npm install
```

Wait until it finishes without errors.

---

## Part D — Create your `.env` file (minimum for browser demo)

1. Copy the example file:

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env
```

**Mac/Linux:**
```bash
cp .env.example .env
```

2. Open `.env` in Notepad / VS Code and set at least:

```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
LLM_PROVIDER=heuristic
ADMIN_API_KEY=change-me-to-a-strong-secret
WHATSAPP_VERIFY_TOKEN=local-verify-token
```

Notes:

- `LLM_PROVIDER=heuristic` = **no OpenAI key needed** for the browser demo.
- Google Sheets and WhatsApp Cloud API are **optional** for the browser demo.
- Without Sheets credentials, the app uses an in-memory demo customer:
  - Customer ID: `CUST001`
  - WhatsApp: `919876543210`
  - Max payout: `50000`

---

## Part E — Start the server

```bash
npm run dev
```

You should see a log like:

```text
WhatsApp Payout Request Agent listening
port: 3000
```

Leave this terminal window open.

---

## Part F — Open in your browser

1. Open Chrome / Edge / Firefox.
2. Go to:

```text
http://localhost:3000/
```

3. You will see the **PayoutDesk** chat demo.
4. Keep phone number as `919876543210`.
5. Try messages:

| You type | Expected |
| --- | --- |
| `I want a payout of 5000` | Success with `PAY-10001` |
| `I need a payout` then `5000` | Multi-turn create |
| `What's my payout status?` | Shows latest status |
| `help` | Help text |

Also check:

```text
http://localhost:3000/health
```

---

## Part G — (Optional) Connect Google Sheets

Only needed if you want real spreadsheet storage.

1. Create a Google Cloud project.
2. Enable **Google Sheets API**.
3. Create a **service account** and download the JSON key.
4. Create a Google Sheet with tabs `Customers` and `PayoutRequests`  
   (see `docs/google-sheets-template.md`).
5. Share the sheet with the service-account email (Editor).
6. Put values in `.env`:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=your_sheet_id_from_url
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

7. Restart `npm run dev`.

---

## Part H — (Optional) Connect OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Restart the server.

---

## Part I — (Optional) Connect real WhatsApp Cloud API

1. Create a Meta Developer app → add WhatsApp.
2. Get:
   - Access token
   - Phone number ID
   - Verify token (you choose)
3. Put them in `.env`:

```env
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_API_VERSION=v21.0
```

4. Expose your local server with a tunnel (ngrok example):

```bash
ngrok http 3000
```

5. In Meta webhook settings:
   - Callback URL: `https://<ngrok-id>.ngrok.io/webhook`
   - Verify token: same as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to `messages`

6. Message your WhatsApp Business number from the customer phone.

---

## Part J — Useful commands

```bash
npm run dev       # start with auto-reload
npm test          # run tests
npm run build     # compile TypeScript
npm start         # run compiled build (after build)
```

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `node` not found | Reinstall Node.js and reopen terminal |
| Browser shows “refused to connect” | Start server with `npm run dev` first |
| Port already in use | Change `PORT=3001` in `.env`, open `http://localhost:3001/` |
| Agent says temporary error | Check terminal logs; Sheets credentials may be invalid |
| Customer not verified | Use phone `919876543210` or add your customer to Sheets |
| `npm install` fails | Use Node 20+, delete `node_modules`, run `npm install` again |

---

## Important

- Opening `index.html` as a file (`file:///...`) will **not** work correctly.
- Always use `http://localhost:3000/` while the Node server is running.
- The browser demo talks to `POST /demo/message` and uses the same agent/backend as WhatsApp.
