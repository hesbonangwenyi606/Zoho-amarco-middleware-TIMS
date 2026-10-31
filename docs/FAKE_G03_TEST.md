# Test with the local fake G03

The fake ZFPLabServer lets you exercise the middleware's **read-only diagnostics backend** without a physical Tremol G03. It binds to `127.0.0.1` only, returns clearly marked simulated XML, and never contacts a CU or KRA.

It does not simulate fiscal receipt issuance. The middleware has no live receipt-issuing adapter yet.

## 1. Start the fake server

Open PowerShell in the project folder and run:

```powershell
pnpm.cmd fake:tremol
```

It listens on `http://127.0.0.1:4445`. Keep this window open. In another PowerShell window, confirm the simulator is up:

```powershell
Invoke-RestMethod 'http://127.0.0.1:4445/health'
```

Expected response includes `status: ok` and `simulator: true`.

## 2. Point the middleware at the fake

In a new PowerShell window, set the URL for that window only and start the API:

```powershell
$env:TREMOL_ZFPLABSERVER_BASE_URL = 'http://127.0.0.1:4445'
$env:TREMOL_TIMEOUT_MS = '5000'
pnpm.cmd dev
```

The API inherits these settings. This does not edit `.env`. If the API is already running, stop it with `Ctrl+C` first, then start it from this configured window.

## 3. Call the diagnostics endpoint

In another PowerShell window, load the local bearer token without printing it:

```powershell
$base = 'http://localhost:3001'
$line = Get-Content .env | Where-Object { $_ -match '^INVOICE_API_BEARER_TOKEN=' } | Select-Object -First 1
if (-not $line) { throw 'INVOICE_API_BEARER_TOKEN is missing from .env' }
$token = ($line -split '=', 2)[1].Trim().Trim('"')
$headers = @{ Authorization = "Bearer $token" }
```

Run one read at a time:

```powershell
Invoke-RestMethod "$base/integrations/tremol/commands/status" -Headers $headers
Invoke-RestMethod "$base/integrations/tremol/commands/version" -Headers $headers
Invoke-RestMethod "$base/integrations/tremol/commands/current-receipt" -Headers $headers
Invoke-RestMethod "$base/integrations/tremol/commands/receipt-counters" -Headers $headers
```

Each should return `resultCode: 0` and XML containing `SIMULATED` values. The fake-server window should log the read command. Unsupported commands return `404`; non-GET methods return `405`.

## 4. Stop the fake

Press `Ctrl+C` in the fake-server window. Remove the temporary environment variable by closing the PowerShell window, or run:

```powershell
Remove-Item Env:TREMOL_ZFPLABSERVER_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:TREMOL_TIMEOUT_MS -ErrorAction SilentlyContinue
```

Use the real ZFPLabServer URL only after the CU owner/vendor confirms the connection parameters. Fake responses are not evidence that the physical device is connected, configured, KRA compliant, or ready to issue receipts.
