import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import localApiToken from "virtual:local-api-token";
import { InvoiceDetails, type InvoiceSource } from "./InvoiceDetails";

type Page = "overview" | "invoice" | "device";
type HealthResult = "checking" | "online" | "offline";
interface InvoiceOption { invoiceId: string; invoiceNumber: string | null; customerName: string | null }

interface Candidate {
  zohoInvoiceId: string;
  invoiceNumber: string | null;
  customerName: string | null;
  currencyCode: string;
  lines: Array<{
    description: string | null;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    taxName: string | null;
    taxPercentage: string | null;
  }>;
  subtotal: string;
  taxTotal: string;
  total: string;
}

interface FiscalRequest {
  id: string;
  zohoInvoiceId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  receipt?: { receiptNumber: string; qrValue: string; issuedAt: string } | null;
  failure?: { code?: string; message?: string } | null;
}

interface ApiErrorPayload {
  error?: { code?: string; message?: string };
}

type DiagnosticName = "status" | "version" | "current-receipt" | "receipt-counters";
interface Diagnostic {
  resultCode?: number;
  responseXml?: string;
  error?: string;
  loading?: boolean;
}

const diagnosticLabels: Array<{ name: DiagnosticName; label: string; hint: string }> = [
  { name: "status", label: "Device status", hint: "ReadStatus" },
  { name: "version", label: "Server and device version", hint: "ReadVersion" },
  { name: "current-receipt", label: "Current receipt", hint: "ReadCurrentReceiptInfo" },
  { name: "receipt-counters", label: "Receipt counters", hint: "ReadLastAndTotalReceiptNum" },
];

async function apiRequest<T>(path: string, token = "", init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(path, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload as ApiErrorPayload | null;
    const code = error?.error?.code;
    const message = error?.error?.message ?? `Request failed with HTTP ${response.status}.`;
    throw new Error(code ? `${code}: ${message}` : message);
  }

  return payload as T;
}

function money(value: string, currency: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
  }
}

function shortDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Icon({ name }: { name: "overview" | "invoice" | "device" | "arrow" | "check" | "shield" }) {
  const common = { width: 19, height: 19, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "overview") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
  if (name === "invoice") return <svg {...common}><path d="M6 3.5h8l4 4V21H6z"/><path d="M14 3.5V8h4M9 12h6M9 16h6"/></svg>;
  if (name === "device") return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h4M7 13h9"/></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  return <svg {...common}><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></svg>;
}

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [token, setToken] = useState(localApiToken);
  const [apiHealth, setApiHealth] = useState<HealthResult>("checking");
  const [databaseHealth, setDatabaseHealth] = useState<HealthResult>("checking");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [invoicePage, setInvoicePage] = useState(0);
  const [hasMoreInvoices, setHasMoreInvoices] = useState(false);
  const [invoiceListBusy, setInvoiceListBusy] = useState(false);
  const [invoiceListError, setInvoiceListError] = useState("");
  const invoiceListGeneration = useRef(0);
  const [trainingPrefix, setTrainingPrefix] = useState("TRAIN");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [invoiceSource, setInvoiceSource] = useState<InvoiceSource | null>(null);
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [fiscalRequest, setFiscalRequest] = useState<FiscalRequest | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [pollCount, setPollCount] = useState(0);
  const [diagnostics, setDiagnostics] = useState<Partial<Record<DiagnosticName, Diagnostic>>>({});
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const healthTimer = useRef<number | undefined>(undefined);

  const refreshHealth = useCallback(async () => {
    const [live, ready] = await Promise.allSettled([
      apiRequest<{ status: string }>("/health/live"),
      apiRequest<{ status: string }>("/health/ready"),
    ]);
    setApiHealth(live.status === "fulfilled" && live.value.status === "ok" ? "online" : "offline");
    setDatabaseHealth(ready.status === "fulfilled" && ready.value.status === "ready" ? "online" : "offline");
  }, []);

  useEffect(() => {
    void refreshHealth();
    healthTimer.current = window.setInterval(() => void refreshHealth(), 20_000);
    return () => window.clearInterval(healthTimer.current);
  }, [refreshHealth]);

  const loadInvoiceOptions = useCallback(async (page: number, generation: number) => {
    setInvoiceListBusy(true);
    setInvoiceListError("");
    try {
      const result = await apiRequest<{ invoices: InvoiceOption[]; page: number; hasMore: boolean }>(`/integrations/zoho/invoices?page=${page}`, token.trim());
      if (generation !== invoiceListGeneration.current) return;
      setInvoiceOptions(previous => page === 1 ? result.invoices : [...new Map([...previous, ...result.invoices].map(invoice => [invoice.invoiceId, invoice])).values()]);
      setInvoicePage(result.page);
      setHasMoreInvoices(result.hasMore);
    } catch (error) {
      if (generation === invoiceListGeneration.current) setInvoiceListError(error instanceof Error ? error.message : "Could not list invoices.");
    } finally {
      if (generation === invoiceListGeneration.current) setInvoiceListBusy(false);
    }
  }, [token]);

  useEffect(() => {
    const generation = ++invoiceListGeneration.current;
    setInvoiceOptions([]);
    setInvoicePage(0);
    setHasMoreInvoices(false);
    setInvoiceListError("");
    setInvoiceListBusy(false);
    if (token.trim()) void loadInvoiceOptions(1, generation);
    return () => { invoiceListGeneration.current++; };
  }, [token, loadInvoiceOptions]);

  const loadCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token.trim()) {
      setCandidateError("Enter the API bearer token in the top bar first.");
      return;
    }
    if (!invoiceId.trim()) {
      setCandidateError("Enter the Zoho invoice record ID.");
      return;
    }
    setCandidateBusy(true);
    setCandidateError("");
    setCandidate(null);
    setInvoiceSource(null);
    setFiscalRequest(null);
    setRequestError("");
    try {
      const [result, invoiceResult] = await Promise.all([apiRequest<{ candidate: Candidate }>(
        `/integrations/zoho/invoices/${encodeURIComponent(invoiceId.trim())}/fiscal-candidate`,
        token.trim(),
      ), apiRequest<{ invoice: { source: InvoiceSource } }>(`/integrations/zoho/invoices/${encodeURIComponent(invoiceId.trim())}`, token.trim())]);
      setCandidate(result.candidate);
      setInvoiceSource(invoiceResult.invoice.source);
    } catch (error) {
      setCandidateError(error instanceof Error ? error.message : "Could not load the invoice.");
    } finally {
      setCandidateBusy(false);
    }
  };

  const createMockRequest = async () => {
    if (!candidate || !token.trim()) return;
    const prefix = trainingPrefix.trim();
    if (!prefix || !candidate.invoiceNumber?.startsWith(prefix)) {
      setRequestError(`This invoice number must start with the configured training prefix (${prefix || "enter prefix"}).`);
      return;
    }
    const approved = window.confirm(
      `Create a MOCK fiscalization request for ${candidate.invoiceNumber}? Confirm the API is running with FISCAL_MODE=MOCK and this is a training invoice. This creates test data only; it does not issue a real G03 receipt or contact KRA.`,
    );
    if (!approved) return;

    setRequestBusy(true);
    setRequestError("");
    setFiscalRequest(null);
    setPollCount(0);
    try {
      const result = await apiRequest<{ request: FiscalRequest }>(
        `/integrations/zoho/invoices/${encodeURIComponent(candidate.zohoInvoiceId)}/fiscalization-requests`,
        token.trim(),
        { method: "POST" },
      );
      setFiscalRequest(result.request);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Could not create the request.");
    } finally {
      setRequestBusy(false);
    }
  };

  const refreshFiscalRequest = useCallback(async (id: string) => {
    try {
      const result = await apiRequest<{ request: FiscalRequest }>(
        `/integrations/zoho/fiscalization-requests/${encodeURIComponent(id)}`,
        token.trim(),
      );
      setFiscalRequest(result.request);
      setRequestError("");
      setPollCount((count) => count + 1);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Could not refresh request status.");
    }
  }, [token]);

  useEffect(() => {
    if (!fiscalRequest || !["Pending", "InProgress"].includes(fiscalRequest.status) || pollCount >= 18) return;
    const timer = window.setTimeout(() => void refreshFiscalRequest(fiscalRequest.id), 5_000);
    return () => window.clearTimeout(timer);
  }, [fiscalRequest, pollCount, refreshFiscalRequest]);

  const runDiagnostics = async () => {
    if (!token.trim()) {
      setDiagnostics({});
      return;
    }
    setDiagnosticsBusy(true);
    setDiagnostics({});
    for (const item of diagnosticLabels) {
      setDiagnostics((current) => ({ ...current, [item.name]: { loading: true } }));
      try {
        const result = await apiRequest<{ resultCode: number; responseXml: string }>(
          `/integrations/tremol/commands/${item.name}`,
          token.trim(),
        );
        setDiagnostics((current) => ({
          ...current,
          [item.name]: { resultCode: result.resultCode, responseXml: result.responseXml },
        }));
      } catch (error) {
        setDiagnostics((current) => ({
          ...current,
          [item.name]: { error: error instanceof Error ? error.message : "Read command failed." },
        }));
      }
    }
    setDiagnosticsBusy(false);
  };

  const title = page === "overview" ? "Overview" : page === "invoice" ? "Invoice workspace" : "Device diagnostics";
  const trainingInvoice = Boolean(candidate?.invoiceNumber?.startsWith(trainingPrefix.trim()));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">A</div><div><strong>Armco</strong><span>Fiscal Hub</span></div></div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="navigation" aria-label="Main navigation">
          <button className={page === "overview" ? "nav-item active" : "nav-item"} onClick={() => setPage("overview")}><Icon name="overview" />Overview</button>
          <button className={page === "invoice" ? "nav-item active" : "nav-item"} onClick={() => setPage("invoice")}><Icon name="invoice" />Invoice testing</button>
          <button className={page === "device" ? "nav-item active" : "nav-item"} onClick={() => setPage("device")}><Icon name="device" />Device diagnostics</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="safe-card"><div className="safe-icon"><Icon name="shield" /></div><strong>Safe testing</strong><p>Live fiscal receipt commands are unavailable in this dashboard.</p><span className="safe-status"><i /> MOCK / READ-ONLY</span></div>
        <div className="sidebar-footer">Middleware console <span>v1.0</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Armco workspace</span><b>/</b><strong>{title}</strong></div>
          <div className="topbar-right">
            <div className="token-field">
              <span className="token-label">API TOKEN</span>
              <input aria-label="API bearer token" type={showToken ? "text" : "password"} placeholder="Paste local bearer token" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" />
              <button className="text-button" onClick={() => setShowToken((value) => !value)}>{showToken ? "Hide" : "Show"}</button>
              {token && <button className="text-button clear-token" onClick={() => setToken("")}>Clear</button>}
            </div>
            <span className="token-note">Held in memory only</span>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div><div className="eyebrow">ZOHO BOOKS · TREMOL G03</div><h1>{title}</h1><p>Monitor the invoice workflow and run safe local diagnostics.</p></div>
            <div className="environment-pill"><span className="environment-dot" /> DEVELOPMENT</div>
          </div>

          <div className="safety-banner"><span className="banner-icon"><Icon name="shield" /></span><div><strong>Development console — no live receipt issuance</strong><p>MOCK requests create test records only. Device diagnostics use read-only commands.</p></div><span className="banner-tag">SAFE MODE</span></div>

          {page === "overview" && <>
            <section className="stat-grid" aria-label="System status">
              <StatusCard label="Middleware API" value={apiHealth === "online" ? "Online" : apiHealth === "checking" ? "Checking" : "Offline"} detail="Local API · port 3001" status={apiHealth} icon={<Icon name="overview" />} />
              <StatusCard label="Database" value={databaseHealth === "online" ? "Ready" : databaseHealth === "checking" ? "Checking" : "Unavailable"} detail="Readiness endpoint" status={databaseHealth} icon={<Icon name="check" />} />
              <StatusCard label="Fiscal device" value={Object.values(diagnostics).some((entry) => entry?.resultCode === 0) ? "Responding" : "Not checked"} detail="Read-only diagnostics" status={Object.values(diagnostics).some((entry) => entry?.resultCode === 0) ? "online" : "checking"} icon={<Icon name="device" />} />
            </section>
            <section className="section-block">
              <div className="section-heading"><div><span className="eyebrow">GET STARTED</span><h2>What would you like to do?</h2></div><span className="section-note">Choose a safe workflow</span></div>
              <div className="action-grid">
                <button className="action-card" onClick={() => setPage("invoice")}><span className="action-icon violet"><Icon name="invoice" /></span><span className="action-text"><strong>Preview an invoice</strong><small>Load a Zoho invoice and inspect its fiscal candidate mapping.</small><span className="action-link">Open invoice workspace <Icon name="arrow" /></span></span></button>
                <button className="action-card" onClick={() => setPage("device")}><span className="action-icon mint"><Icon name="device" /></span><span className="action-text"><strong>Check device diagnostics</strong><small>Run the supported read-only commands against ZFPLabServer.</small><span className="action-link">Open diagnostics <Icon name="arrow" /></span></span></button>
              </div>
            </section>
            <section className="section-block lower-grid">
              <div className="panel"><div className="panel-heading"><div><span className="eyebrow">CURRENT SCOPE</span><h2>Available now</h2></div><span className="status-pill green"><i /> Ready for testing</span></div><ul className="feature-list"><li><span className="list-check"><Icon name="check" /></span>Zoho invoice retrieval and candidate mapping</li><li><span className="list-check"><Icon name="check" /></span>Duplicate request protection and status tracking</li><li><span className="list-check"><Icon name="check" /></span>MOCK receipt flow for training invoices</li><li><span className="list-check"><Icon name="check" /></span>Read-only ZFPLabServer diagnostics</li></ul></div>
              <div className="panel next-panel"><div className="eyebrow">NEXT PHASE</div><h2>Live device integration</h2><p>Receipt issuing, device setup, and KRA/TIMS verification require the device owner and vendor-approved protocol.</p><div className="pending-tag"><span /> Not enabled</div></div>
            </section>
          </>}

          {page === "invoice" && <section className="workspace-grid">
            <div className="panel invoice-search-panel"><div className="panel-heading"><div><span className="eyebrow">ZOHO BOOKS</span><h2>Invoice candidate</h2><p>Enter the Zoho invoice record ID to retrieve and map it.</p></div><span className="step-number">01</span></div>
              <div className="lookup-form">
                <label htmlFor="invoice-picker">Select a Zoho invoice</label>
                <div className="input-with-action">
                  <select id="invoice-picker" value={invoiceOptions.some(invoice => invoice.invoiceId === invoiceId) ? invoiceId : ""} disabled={!token.trim() || invoiceOptions.length === 0} onChange={event => { setInvoiceId(event.target.value); setCandidate(null); setFiscalRequest(null); }}>
                    <option value="">{invoiceListBusy && invoiceOptions.length === 0 ? "Loading invoices..." : !token.trim() ? "Enter an API token first" : invoiceOptions.length === 0 ? "No invoices available" : "Choose an invoice..."}</option>
                    {invoiceOptions.map(invoice => <option key={invoice.invoiceId} value={invoice.invoiceId}>{[invoice.invoiceId, invoice.invoiceNumber, invoice.customerName].filter(Boolean).join(" | ")}</option>)}
                  </select>
                  <button type="button" className="secondary-button" disabled={invoiceListBusy || !token.trim()} onClick={() => void loadInvoiceOptions(1, invoiceListGeneration.current)}>Refresh</button>
                  {hasMoreInvoices && <button type="button" className="secondary-button" disabled={invoiceListBusy} onClick={() => void loadInvoiceOptions(invoicePage + 1, invoiceListGeneration.current)}>{invoiceListBusy ? "Loading..." : "Load more"}</button>}
                </div>
                {invoiceListError && <div className="inline-alert error-alert" role="alert">{invoiceListError}</div>}
              </div>
              <form onSubmit={loadCandidate} className="lookup-form"><label htmlFor="invoice-id">Zoho invoice record ID</label><div className="input-with-action"><input id="invoice-id" placeholder="e.g. 1462401000015947001" value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} /><button className="primary-button" disabled={candidateBusy || !token.trim()}>{candidateBusy ? <Spinner /> : "Load invoice"}</button></div><div className="form-help">Uses the Zoho Books invoice ID, not the invoice number printed on the document.</div></form>
              {candidateError && <div className="inline-alert error-alert">{candidateError}</div>}
              {!candidate && !candidateBusy && <div className="empty-state"><div className="empty-icon"><Icon name="invoice" /></div><strong>No invoice loaded</strong><p>Enter an invoice record ID above to inspect customer, lines, tax metadata, and totals.</p></div>}
              {candidate && <div className="candidate-content">
                <div className="invoice-title-row"><div><span className="eyebrow">CANDIDATE LOADED</span><h3>{candidate.invoiceNumber || "Unnumbered invoice"}</h3><p>{candidate.customerName || "Customer not supplied"}</p></div><span className="status-pill green"><i /> Mapping ready</span></div>
                <div className="detail-grid"><Detail label="Zoho invoice ID" value={candidate.zohoInvoiceId} /><Detail label="Currency" value={candidate.currencyCode} /><Detail label="Line items" value={String(candidate.lines.length)} /></div>
                <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>QTY</th><th>UNIT PRICE</th><th>LINE TOTAL</th></tr></thead><tbody>{candidate.lines.map((line, index) => <tr key={`${candidate.zohoInvoiceId}-${index}`}><td><strong>{line.description || "Unnamed item"}</strong><small>{line.taxName || "Tax metadata unavailable"}{line.taxPercentage ? ` · ${line.taxPercentage}%` : ""}</small></td><td>{line.quantity}</td><td>{money(line.unitPrice, candidate.currencyCode)}</td><td>{money(line.lineTotal, candidate.currencyCode)}</td></tr>)}</tbody></table></div>
                <div className="totals"><div><span>Subtotal</span><strong>{money(candidate.subtotal, candidate.currencyCode)}</strong></div><div><span>Tax total</span><strong>{money(candidate.taxTotal, candidate.currencyCode)}</strong></div><div className="grand-total"><span>Total</span><strong>{money(candidate.total, candidate.currencyCode)}</strong></div></div>
                {invoiceSource && <InvoiceDetails source={invoiceSource} />}
                <div className="mock-request-box"><div className="mock-box-copy"><span className="eyebrow">OPTIONAL · MOCK ONLY</span><strong>Create a training request</strong><p>Checks the server prefix before creating. The server must be running with <code>FISCAL_MODE=MOCK</code>.</p><label htmlFor="training-prefix">Configured training invoice prefix</label><input id="training-prefix" value={trainingPrefix} onChange={(event) => setTrainingPrefix(event.target.value)} /></div><button className="secondary-button" onClick={() => void createMockRequest()} disabled={requestBusy || !trainingInvoice || !token.trim()}>{requestBusy ? <Spinner /> : "Create MOCK request"}</button></div>
                {!trainingInvoice && <div className="form-help warning-text">Invoice number must start with the prefix above. The server checks its own configured prefix too.</div>}
                {requestError && <div className="inline-alert error-alert">{requestError}</div>}
                {fiscalRequest && <div className="request-result"><div className="request-result-top"><div><span className="eyebrow">FISCALIZATION REQUEST</span><strong>{fiscalRequest.status}</strong></div><span className={`request-status ${fiscalRequest.status.toLowerCase()}`}>{fiscalRequest.status}</span></div><div className="request-id">Request ID <code>{fiscalRequest.id}</code></div><p>Updated {shortDate(fiscalRequest.updatedAt)}</p>{fiscalRequest.receipt && <div className="receipt-result"><Detail label="Test receipt number" value={fiscalRequest.receipt.receiptNumber} /><Detail label="QR placeholder" value={fiscalRequest.receipt.qrValue} /><Detail label="Issued at" value={shortDate(fiscalRequest.receipt.issuedAt)} /></div>}{fiscalRequest.failure && <div className="inline-alert error-alert">{fiscalRequest.failure.message || fiscalRequest.failure.code || "Request failed."}</div>}{["Pending", "InProgress"].includes(fiscalRequest.status) && <div className="poll-line"><Spinner /> Checking status automatically{pollCount >= 18 ? <button className="text-button" onClick={() => { setPollCount(0); void refreshFiscalRequest(fiscalRequest.id); }}>Check again</button> : null}</div>}</div>}
              </div>}
            </div>
            <aside className="side-column"><div className="panel note-panel"><span className="note-symbol">i</span><h3>Mapping is not tax approval</h3><p>The candidate preview validates data shape. It does not verify KRA PIN, HS codes, VAT class compliance, or G03 readiness.</p></div><div className="panel note-panel muted-note"><div className="eyebrow">DUPLICATE PROTECTION</div><h3>One request per invoice</h3><p>If a request already exists, the API returns a duplicate conflict. The dashboard will show that server error instead of making a second request.</p></div></aside>
          </section>}

          {page === "device" && <section className="device-page">
            <div className="panel device-intro"><div><span className="eyebrow">READ-ONLY OPERATIONS</span><h2>ZFPLabServer diagnostics</h2><p>Each check calls a fixed read command and runs sequentially. No receipt or configuration commands are available here.</p></div><button className="primary-button" onClick={() => void runDiagnostics()} disabled={diagnosticsBusy || !token.trim()}>{diagnosticsBusy ? <><Spinner /> Running checks</> : "Run diagnostics"}</button></div>
            {!token.trim() && <div className="inline-alert info-alert">Enter the API bearer token in the top bar to run device checks.</div>}
            <div className="diagnostic-grid">{diagnosticLabels.map((item) => { const result = diagnostics[item.name]; return <article className="panel diagnostic-card" key={item.name}><div className="diagnostic-top"><div className="diagnostic-icon"><Icon name="device" /></div><span className={result?.resultCode === 0 ? "status-pill green" : result?.error ? "status-pill red" : result?.loading ? "status-pill amber" : "status-pill neutral"}><i />{result?.loading ? "Running" : result?.resultCode === 0 ? "Responded" : result?.error ? "Needs attention" : "Not run"}</span></div><h3>{item.label}</h3><code className="command-name">{item.hint}()</code>{result?.responseXml && <pre className="xml-response">{result.responseXml}</pre>}{result?.error && <div className="diagnostic-error">{result.error}</div>}{result?.loading && <div className="diagnostic-loading"><Spinner /> Waiting for device response</div>}</article>; })}</div>
            <div className="inline-alert info-alert"><strong>Using the fake G03?</strong> Set the API's <code>TREMOL_ZFPLABSERVER_BASE_URL</code> to <code>http://127.0.0.1:4445</code> and start <code>pnpm.cmd fake:tremol</code> in another terminal. Simulated responses are clearly marked.</div>
            <div className="inline-alert warning-alert"><strong>Current device status:</strong> the laptop's earlier <code>ClientSettingsNotInitialized</code> result means the real ZFPLabServer still needs vendor-approved configuration. Do not guess its <code>settings()</code> command.</div>
          </section>}

          <footer className="page-footer"><span>Armco Fiscal Hub · Internal development tool</span><span>Live fiscal receipt issue is not enabled</span></footer>
        </div>
      </main>
    </div>
  );
}

function StatusCard({ label, value, detail, status, icon }: { label: string; value: string; detail: string; status: HealthResult; icon: ReactNode }) {
  return <article className="panel status-card"><div className="status-card-top"><span>{label}</span><div className="status-card-icon">{icon}</div></div><strong className="status-value">{value}</strong><div className="status-detail"><span className={`health-dot ${status}`} />{detail}</div></article>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="detail-item"><span>{label}</span><strong title={value}>{value}</strong></div>;
}

function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}
