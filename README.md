# Zoho Amarco Middleware

This service provides Armco with a Zoho Books invoice integration and a tracked fiscalization workflow. The middleware foundation and Level 1 MOCK workflow are implemented, including safe test receipts, duplicate protection, status tracking, and optional Zoho custom-field updates.

## Delivered capabilities

- Connects to Zoho Books using OAuth.
- Reads invoice details and prepares an invoice for fiscalization.
- Saves each fiscalization request and prevents a second request for the same Zoho invoice.
- In `MOCK` mode, simulates processing and returns a **test** receipt number and placeholder QR value. It can simulate a one-time failure and retry.
- Can write the test status, receipt number, QR value, and timestamp to Zoho invoice custom fields when configured.
- Provides health endpoints and uses PostgreSQL or SQL Server through Prisma.

## Deployment status

The middleware and Level 1 MOCK workflow are ready for development and training use. Live fiscalization is a separate commissioning phase: the real Tremol G03 adapter, device diagnostics, and end-to-end verification with the device and applicable KRA/TIMS requirements remain to be completed. MOCK receipts are test data, not tax receipts. Do not use `FISCAL_MODE=LIVE` for real invoices until that work is complete and approved.

## How the flow works

1. The middleware retrieves invoice data from Zoho Books and prepares the fiscalization candidate.
2. It records a pending request and prevents duplicate requests for the same invoice.
3. In `MOCK` mode, it simulates processing and saves a test receipt after about 30 seconds.
4. If configured, it writes the test result back to Zoho Books.
5. The real-device path will replace the simulator after device setup and protocol verification.

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

Invoice and Tremol routes require `Authorization: Bearer <INVOICE_API_BEARER_TOKEN>`.

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
| `GET` | `/integrations/tremol/commands/status` | Read G03/ZFPLabServer status |
| `GET` | `/integrations/tremol/commands/version` | Read device/server version |
| `GET` | `/integrations/tremol/commands/current-receipt` | Read current receipt information |
| `GET` | `/integrations/tremol/commands/receipt-counters` | Read last and total receipt numbers |

## MOCK safety

- Use training invoices only. Their invoice numbers must start with `MOCK_INVOICE_NUMBER_PREFIX`.
- `MOCK` is for development and is rejected in production.
- MOCK produces placeholder test data and does not contact the device or KRA.
- Tremol routes are read-only and require `TREMOL_ZFPLABSERVER_BASE_URL`; they do not configure the device or issue receipts.
- A process restart can interrupt a pending MOCK request; this timer-based workflow is not a durable production queue.
- Leave fiscalization disabled until you are deliberately running the MOCK test. Do not use LIVE mode until the real-device integration and the required business checks are complete.

See [CU connection guide](docs/CU_CONNECTION_GUIDE.md) and [remaining work runbook](docs/ARMCO_TREMOL_REMAINING_WORK_RUNBOOK.md) for device setup and project status.
To exercise the read-only device diagnostics without hardware, follow [Test with the local fake G03](docs/FAKE_G03_TEST.md).
