import { createServer } from "node:http";

/**
 * Local protocol simulator for development. It is intentionally bound to
 * loopback and serves only the four read commands supported by the client.
 */
const rawPort = process.env["FAKE_ZFPLABSERVER_PORT"] ?? "4445";
const port = Number(rawPort);

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error("FAKE_ZFPLABSERVER_PORT must be an integer between 1 and 65535.");
}

const simulatedResponses: Readonly<Record<string, string>> = {
  "/ReadStatus()":
    '<Res Code="0"><Res Name="Status" Value="SIMULATED_READY" Type="String" /><Res Name="Simulator" Value="true" Type="Boolean" /></Res>',
  "/ReadVersion()":
    '<Res Code="0"><Res Name="Version" Value="FAKE-G03-1.0" Type="String" /><Res Name="Simulator" Value="true" Type="Boolean" /></Res>',
  "/ReadCurrentReceiptInfo()":
    '<Res Code="0"><Res Name="ReceiptOpen" Value="SIMULATED_NONE" Type="String" /><Res Name="Simulator" Value="true" Type="Boolean" /></Res>',
  "/ReadLastAndTotalReceiptNum()":
    '<Res Code="0"><Res Name="LastReceiptNum" Value="SIMULATED-0" Type="String" /><Res Name="TotalReceiptNum" Value="SIMULATED-0" Type="String" /><Res Name="Simulator" Value="true" Type="Boolean" /></Res>',
};

const server = createServer((request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Fake-ZFPLabServer", "true");

  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok", simulator: true }));
    return;
  }

  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Fake ZFPLabServer accepts GET requests only.");
    return;
  }

  const body = request.url ? simulatedResponses[request.url] : undefined;

  if (!body) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Unsupported fake command.");
    return;
  }

  response.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
  response.end(body);
  console.info(`Fake ZFPLabServer: ${request.url}`);
});

server.listen(port, "127.0.0.1", () => {
  console.info(`Fake ZFPLabServer listening on http://127.0.0.1:${port}`);
  console.info("Loopback only. Read commands are simulated; no G03 or KRA is contacted.");
});

function stop(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
