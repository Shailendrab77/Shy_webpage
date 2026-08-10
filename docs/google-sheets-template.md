# Sheets setup template

Create a Google Spreadsheet with two tabs named exactly:

## Customers

| Customer ID | Customer Name | WhatsApp Number | Active | Payout Enabled | Maximum Payout | Created At |
| ----------- | ------------- | --------------- | ------ | -------------- | -------------: | ---------- |
| CUST001     | John Doe      | 919876543210    | TRUE   | TRUE           |          50000 | 2026-08-01 |

## PayoutRequests

| Request Code | Customer ID | Customer Name | WhatsApp Number | Amount | Status  | Created At | Updated At | Source   | Conversation ID | Source Message ID |
| ------------ | ----------- | ------------- | --------------- | -----: | ------- | ---------- | ---------- | -------- | --------------- | ----------------- |
| (empty initially — the app appends rows) |||||

Optional eleventh column `Source Message ID` is used for idempotency. If omitted, the app still works using the in-memory idempotency store; including it makes duplicate protection survive process restarts.
