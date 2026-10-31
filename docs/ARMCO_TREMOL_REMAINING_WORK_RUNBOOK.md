# Armco Zoho–Tremol G03 Remaining Work Runbook

This runbook tracks the remaining work to connect the Zoho–Armco middleware to the Tremol G03 through ZFPLabServer. It is written for the current development setup and should be updated as device, network, and compliance checks are completed.

## Current verified state

- The local API starts on port `3001` and connects to PostgreSQL when Docker Desktop and the Compose database are running.
- Zoho OAuth authorization completed for the Armco Zoho Books account.
- The API retrieved invoice `WL94020` and returned a fiscal-candidate mapping for it.
- Duplicate fiscalization request protection was exercised locally: the first registration created a `Pending` record, a second POST for the same invoice returned `409 FISCALIZATION_REQUEST_ALREADY_EXISTS`, and a GET still returned `Pending`.
- The database enforces one fiscalization request per `zohoInvoiceId`. This verifies request registration deduplication only; device-level receipt deduplication and uncertain-outcome reconciliation are not yet verified.
- The current server does not connect a `FiscalDevice` to the fiscalization workflow. No CU receipt has been issued by this middleware.
- A read-only Tremol diagnostics route is now available at `/integrations/tremol/commands/:command`. It supports only `status`, `version`, `current-receipt`, and `receipt-counters`, and requires the invoice API bearer token. The route has not yet been verified against the installed CU/gateway.
- The CU site separately confirmed its gateway's ZFPLabServer port is `8000`; that gateway path still needs an approved connectivity check.

### Latest local ZFPLabServer check (31 October 2026)

- ZFPLabServer version `1.8.8` is installed on the development laptop and was launched as a desktop process. A local listener was observed on port `4444`.
- `http://127.0.0.1:4444/ReadStatus()` returned HTTP `200`, but the XML response was `<Res Code="53">` with `ClientSettingsNotInitialized` and the instruction to call `settings()` first. This confirms only that a local HTTP process answered; it does not confirm that the G03 is connected or ready.
- The laptop's current Wi-Fi address was `10.236.3.250`. A connection attempt to the separately supplied address `192.168.1.175` on port `4444` timed out. Those observations do not establish a network path to the CU or its gateway.
- The operator reported that the G03 was not connected to the laptop during these checks. Level 2 has therefore not passed. Do not guess or issue a `settings()` command: obtain the vendor instructions and confirm connection parameters and the correct host/port with the CU owner first.

These are dated, machine-specific observations. They do not replace the gateway checks below or the CU owner's confirmation of the intended ZFPLabServer endpoint. CU diagnostics, receipt issuance, Zoho write-back, and KRA/TIMS integration remain unverified.

Treat these as environment-specific observations, not a guarantee that a different machine or deployment has the same configuration.

## Safety rules

1. Do not send fiscal commands until Armco has confirmed the G03 configuration, test procedure, and operator responsibilities.
2. Use read-only device commands first. Send one command at a time and wait for its response.
3. Never automatically retry a command after a timeout or lost response if the device may have issued a receipt. Reconcile the device state first.
4. Do not expose ZFPLabServer's plain HTTP port `8000` to the public internet. Remote access must use an Armco-approved private network or secured gateway route.
5. Do not commit `.env`, tokens, passwords, encryption keys, or real credentials in `.env.example`. Keep placeholders in examples. Rotate any credential that was committed or shared if it is real.
6. A fiscal-candidate mapping is not proof of tax compliance or device readiness.

## Local development and Zoho regression check

Run these commands from the repository folder. Use separate PowerShell windows for the database/API and API requests.

### 1. Start PostgreSQL

```powershell
docker compose up -d postgres
docker compose ps
```

Wait for the `postgres` service to show healthy.

### 2. Start the API

In the first PowerShell window:

```powershell
pnpm dev
```

Keep this window open. The startup log should report port `3001`.

### 3. Check API and database health

In a second PowerShell window:

```powershell
Invoke-RestMethod -Uri 'http://localhost:3001/health/live'
Invoke-RestMethod -Uri 'http://localhost:3001/health/ready'
```

The live check should return `ok`; the readiness check should return `ready` when PostgreSQL is reachable.

### 4. Load the local API bearer token

Set `INVOICE_API_BEARER_TOKEN` in the private `.env` file. Then run:

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^INVOICE_API_BEARER_TOKEN=' } | Select-Object -First 1
if (-not $line) { throw 'INVOICE_API_BEARER_TOKEN is missing from .env' }
$token = ($line -split '=', 2)[1].Trim().Trim('"')
```

Do not paste or log `$token`.

### 5. Verify Zoho reads

Use an invoice ID that belongs to the organization configured in the private `.env`:

```powershell
$invoiceId = 'YOUR_ZOHO_INVOICE_RECORD_ID'
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:3001/integrations/zoho/invoices/$invoiceId" -Headers $headers
Invoke-RestMethod -Uri "http://localhost:3001/integrations/zoho/invoices/$invoiceId/fiscal-candidate" -Headers $headers
```

Confirm the returned invoice ID and invoice number match the Zoho document. Review the candidate's line count, quantities, unit prices, line totals, currency, tax metadata, subtotal, tax total, and total. The current mapper checks required shape and values, but it does not establish KRA/Tremol tax compliance or verify the device's configured VAT classes.

### 6. Verify duplicate request protection (optional local database write)

This step creates one **Pending** fiscalization record in the local middleware database. It does not change Zoho Books and does not send a device command. Use an invoice for which a request has not already been registered.

```powershell
$uri = "http://localhost:3001/integrations/zoho/invoices/$invoiceId/fiscalization-requests"
$first = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers
$first.request
```

Repeat the same POST. It should return HTTP `409` with code `FISCALIZATION_REQUEST_ALREADY_EXISTS`. PowerShell may display non-2xx response bodies as an exception; inspect the response body without sharing credentials. The database's unique constraint is the final protection against concurrent duplicate registration.

If the first request succeeds, verify its status:

```powershell
$requestId = $first.request.id
Invoke-RestMethod -Uri "http://localhost:3001/integrations/zoho/fiscalization-requests/$requestId" -Headers $headers
```

The expected status is `Pending`. There is no supported cleanup endpoint; do not delete database records or volumes just to repeat this check. Use a different controlled invoice or ask the maintainer for a safe test-data reset plan.

## Gateway and CU access checklist

The G03 is at the Armco site; `localhost` refers only to the computer where a command is run. Ask the gateway/device owner or Armco IT for:

- Gateway PC hostname and LAN IP address.
- Confirmation that ZFPLabServer is installed as a service and which version is installed (the brief specifies v1.5.7 or later).
- Confirmation that the G03 is connected, has a fixed/reachable LAN address, and ZFPLabServer is configured to use it.
- A successful `ReadStatus` result from the ZFPLabServer test page on the gateway PC.
- Armco-approved VPN/private network access from the development machine to the gateway.
- Confirmation of the CU mode (Type C/ERP), firmware, service-contract expiry, invoice-number range, clock, and programmed VAT rates.
- The approved test window, test invoice/account, operator, and recovery procedure.

Do not put gateway credentials in a chat, source file, or command history. Request a secure handoff method from Armco IT.

### Check network reachability

After connecting to the approved Armco VPN/private network, replace the placeholder with the supplied gateway IP:

```powershell
$gatewayIp = 'GATEWAY_IP'
Test-NetConnection $gatewayIp -Port 8000
```

Proceed only if Armco IT confirms port `8000` is intentionally reachable from your machine. If the check fails, ask IT to diagnose VPN routing/firewall policy; do not open the port publicly.

### Run read-only ZFPLabServer checks

Run these on the gateway PC itself first, or from a machine with approved network access. The CU site has confirmed the test page uses `http://localhost:8000`; commands such as `ReadStatus()` and `ReadVersion()` still need verification against the installed ZFPLabServer version/manual before use.

```powershell
$zfp = 'http://localhost:8000'
Start-Process $zfp
(Invoke-WebRequest -Uri "$zfp/ReadStatus()" -TimeoutSec 10).Content
(Invoke-WebRequest -Uri "$zfp/ReadVersion()" -TimeoutSec 10).Content
(Invoke-WebRequest -Uri "$zfp/ReadLastAndTotalReceiptNum()" -TimeoutSec 10).Content
```

Send commands one at a time. Save timestamps, command names, status/result codes, and sanitized errors in the engineering log. Do not record tokens, passwords, or unrestricted customer invoice data. If status is unclear, stop and use the vendor-documented `ReadStatus`/diagnostic procedure; do not guess at recovery commands such as canceling a receipt.

The API now wires the read-command client to authenticated routes. Network reachability and successful read responses still need to be verified in the intended CU environment. The current laptop response `ClientSettingsNotInitialized` means the service needs vendor-approved configuration before the read checks can pass; do not guess the `settings()` payload.

### Read-only middleware routes

Set the optional values in the private `.env` on the machine that can reach ZFPLabServer, then restart the API:

```dotenv
TREMOL_ZFPLABSERVER_BASE_URL=http://127.0.0.1:4444
TREMOL_TIMEOUT_MS=5000
```

Use the gateway's confirmed address and port when the middleware runs on a different computer. Do not assume the middleware laptop's `localhost` is the CU gateway. These routes use `INVOICE_API_BEARER_TOKEN` and expose only four fixed read commands:

```powershell
Invoke-RestMethod 'http://localhost:3001/integrations/tremol/commands/status' -Headers $headers
Invoke-RestMethod 'http://localhost:3001/integrations/tremol/commands/version' -Headers $headers
Invoke-RestMethod 'http://localhost:3001/integrations/tremol/commands/current-receipt' -Headers $headers
Invoke-RestMethod 'http://localhost:3001/integrations/tremol/commands/receipt-counters' -Headers $headers
```

Run one request at a time with the CU owner present. A nonzero result such as `ClientSettingsNotInitialized` is a stop condition; get the vendor-approved settings procedure before proceeding. The route does not expose receipt-issuing or device-configuration commands.

## Implementation work after read-only connectivity

Complete each stage and review its result before moving to the next:

1. **Verify read-only diagnostics:** use the exact installed ZFPLabServer and CU with the operator; resolve service initialization and network access using vendor/IT-approved instructions.
2. **Fiscal data validation:** agree on customer KRA PIN validation, item HS codes, units, quantity/price precision, discounts, VAT-class mapping, rounding, supported currencies, invoice states, and credit/debit note rules. Confirm requirements with Armco and the appropriate tax/device specialists.
3. **Controlled device tests:** follow the vendor demo and Armco-approved test procedure with an operator present. Record device model/firmware, ZFPLabServer version, command, result codes, and printed output. Do not test on a live business invoice without approval.
4. **Receipt flow:** only after protocol and data verification, implement serialized open/sell/close commands and documented cancel behavior. Persist CU receipt number and QR only after confirmed success. On timeout or lost response, set an uncertain outcome and reconcile; never blindly issue again.
5. **Zoho write-back:** agree on custom fields for CU receipt number, QR, and fiscal status. Update Zoho only from a confirmed CU result; make write-back idempotent and auditable.
6. **Operations:** define queue ownership, retries, alerts, daily Z-report responsibility, device downtime, 24-hour blocks, service-contract monitoring, and manual fallback. Secure any Zoho-to-gateway route with an Armco-approved tunnel/reverse proxy and strong authentication; never expose ZFPLabServer directly.
7. **KRA/TIMS:** verify the applicable integration and legal/operational requirements separately. A working G03 connection alone does not prove KRA reporting or compliance.

## Go/no-go checklist for any live fiscalization

Do not enable receipt commands until every item below is confirmed and recorded:

- Correct G03 identity, firmware, mode, network setup, and service status.
- Official protocol/SDK and ZFPLabServer behavior verified for the installed version.
- Invoice number range, date/time, VAT classes/rates, HS codes, and client PIN behavior confirmed.
- Duplicate, explicit rejection, open-receipt, timeout, lost-response, and database-save failure paths rehearsed.
- CU-to-Zoho write-back fields and reconciliation owner agreed.
- Z-report owner/schedule, support escalation, service contract, and fallback process agreed.
- Armco authorizes the test invoice, test window, and operator; test output is checked before production use.
- Secrets are held outside Git and logs; remote access is private and authenticated.

## Git checkpoint before gateway code changes

The current working tree has uncommitted changes. Before creating a checkpoint:

```powershell
git status --short
git diff -- .env.example
git diff --stat
```

Replace credential-like values in `.env.example` with placeholders before committing. Confirm `.env` is ignored and untracked, inspect all staged changes, and rotate any real credentials that were exposed. Commit only after reviewing the sanitized diff and confirming the intended branch.

## Handoff notes

Keep a short record for each completed step:

| Date/time | Machine or environment | Check/command | Result code/status | Evidence location | Owner/next action |
|---|---|---|---|---|---|
| | | | | | |

Do not put access tokens, passwords, full customer records, or private keys in this table.
