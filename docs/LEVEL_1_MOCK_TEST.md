# Level 1: MOCK fiscalization

MOCK is for training invoices only. It never calls ZFPLabServer, the G03, or KRA. It stores a `TEST-…` receipt and placeholder QR in the middleware database. It can optionally write these test values to four Zoho invoice custom fields.

## Configure

1. Create a training invoice in the intended Zoho Books test/training organization. Its invoice number must begin with `TRAIN-` (or the prefix configured in `MOCK_INVOICE_NUMBER_PREFIX`). Do not use WL94020 or another live business invoice.
2. Set `FISCAL_MODE=MOCK` in the private `.env`. Keep `NODE_ENV=development`; the app refuses MOCK in production.
3. Apply the new PostgreSQL column migration to the development database:

   ```powershell
   pnpm.cmd exec prisma migrate deploy --schema prisma/postgresql/schema.prisma
   pnpm.cmd exec prisma generate --schema prisma/postgresql/schema.prisma
   ```

4. To test one retry, set `MOCK_FAIL_ONCE_FOR_INVOICE_ID` to the training invoice's Zoho record ID. The mock logs the simulated failure and retry; it has no device side effects.
5. For Zoho write-back, create invoice custom fields for fiscal status, CU number, QR value, and fiscalized time. Put their field IDs in the four `ZOHO_*_FIELD_ID` variables shown in `.env.example`. Reauthorize Zoho at `/integrations/zoho/authorize` to grant `ZohoBooks.invoices.UPDATE`. If IDs are missing, local MOCK still works but Zoho write-back stays off.
6. Restart the API after changing `.env`.

## Exercise it

```powershell
$base = 'http://localhost:3001'
$line = Get-Content .env | Where-Object { $_ -match '^INVOICE_API_BEARER_TOKEN=' } | Select-Object -First 1
$token = ($line -split '=', 2)[1].Trim().Trim('"')
$headers = @{ Authorization = "Bearer $token" }
$invoiceId = 'TRAINING_ZOHO_RECORD_ID'

$created = Invoke-RestMethod -Method Post `
  -Uri "$base/integrations/zoho/invoices/$invoiceId/fiscalization-requests" `
  -Headers $headers
$requestId = $created.request.id
$created.request

do {
  Start-Sleep -Seconds 30
  $current = Invoke-RestMethod `
    -Uri "$base/integrations/zoho/fiscalization-requests/$requestId" `
    -Headers $headers
  $current.request | ConvertTo-Json -Depth 10
} while ($current.request.status -in @('Pending', 'InProgress'))
```

Expected result: status `Succeeded`, receipt number starts with `TEST-`, and `qrValue` starts with `TEST-QR-PLACEHOLDER:`. A second POST for the same invoice returns duplicate protection and does not create another result. When write-back is configured, the four Zoho fields contain the test status, test number, placeholder QR, and timestamp. A forced failure should produce warning logs and then a successful test result.

This implementation uses a development-process 30-second timer. It is not a durable worker: a process restart can leave a request Pending. Do not use it as production queue/retry infrastructure. Do not enable `LIVE`; real receipt issuance is not implemented.
