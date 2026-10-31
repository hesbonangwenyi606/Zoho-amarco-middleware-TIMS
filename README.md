# Zoho Amarco Middleware

This service connects Zoho Books invoices to a fiscalization workflow for Armco. It reads invoice data from Zoho, records a fiscalization request in its database, and provides a safe MOCK mode for development.

## What it does today

- Connects to Zoho Books using OAuth.
- Reads invoice details and prepares an invoice for fiscalization.
- Saves each fiscalization request and prevents a second request for the same Zoho invoice.
- In `MOCK` mode, waits about 30 seconds and returns a **test** receipt number and placeholder QR value. It can simulate a one-time failure and retry.
- Can write the test status, receipt number, QR value, and timestamp to Zoho invoice custom fields when configured.
- Provides health endpoints and uses PostgreSQL or SQL Server through Prisma.

## What it does not do yet

The real Tremol G03 adapter is not implemented. The middleware does not currently send receipts to the G03 or KRA, and MOCK receipts are not tax receipts. Do not set `FISCAL_MODE=LIVE` for real invoices. Device diagnostics and read-only checks still need to be connected and verified as part of the device integration.

## How the flow works

1. The middleware gets invoice data from Zoho Books.
2. It checks and maps the invoice for fiscalization.
3. It creates a pending request and blocks duplicates.
4. In `MOCK` mode, it simulates processing and saves a test receipt.
5. If Zoho custom-field write-back is configured, it updates the invoice with the test result.

## Run locally

You need Node.js 24 or later, pnpm, a configured database, and Zoho OAuth credentials. Keep real credentials in your local `.env`; never commit that file.

```powershell
pnpm install
pnpm db:generate:postgresql
pnpm dev
```

Configure environment variables using [.env.example](.env.example). For the detailed MOCK walkthrough, database migration steps, and PowerShell API commands, see [Level 1 MOCK test](docs/LEVEL_1_MOCK_TEST.md).

The API starts on port `3001` by default. Check it with:

```powershell
Invoke-RestMethod 'http://localhost:3001/health/live'
Invoke-RestMethod 'http://localhost:3001/health/ready'
```

## Main API routes

Invoice routes require `Authorization: Bearer <INVOICE_API_BEARER_TOKEN>`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/integrations/zoho/organizations` | List connected Zoho organizations |
| `GET` | `/integrations/zoho/invoices/:invoiceId` | Read an invoice |
| `GET` | `/integrations/zoho/invoices/:invoiceId/fiscal-candidate` | Preview the invoice data prepared for fiscalization |
| `POST` | `/integrations/zoho/invoices/:invoiceId/fiscalization-requests` | Register a fiscalization request |
| `GET` | `/integrations/zoho/fiscalization-requests/:requestId` | Check request status and receipt |
| `POST` | `/integrations/zoho/fiscalization-requests/:requestId/retry-writeback` | Retry writing a saved result to Zoho; does not issue another receipt |
| `GET` | `/integrations/zoho/authorize` | Start Zoho OAuth authorization |
| `GET` | `/integrations/zoho/callback` | Handle the Zoho OAuth callback |

## MOCK safety

- Use training invoices only. Their invoice numbers must start with `MOCK_INVOICE_NUMBER_PREFIX`.
- `MOCK` is for development and is rejected in production.
- MOCK produces placeholder test data and does not contact the device or KRA.
- A process restart can interrupt a pending MOCK request; this timer-based workflow is not a durable production queue.
- Leave fiscalization disabled until you are deliberately running the MOCK test. Do not use LIVE mode until the real-device integration and the required business checks are complete.

See [CU connection guide](docs/CU_CONNECTION_GUIDE.md) and [remaining work runbook](docs/ARMCO_TREMOL_REMAINING_WORK_RUNBOOK.md) for device setup and project status.
