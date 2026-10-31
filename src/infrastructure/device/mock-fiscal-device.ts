import type {
  FiscalDevice,
  FiscalDeviceResult,
} from "../../application/fiscalization/fiscal-device.js";
import type { FiscalInvoiceCandidate } from "../../application/zoho/zoho-invoice-mapper.js";

/**
 * A deterministic training adapter. It performs no network or hardware I/O.
 * An optional invoice ID allows one controlled failure to exercise alert/retry
 * handling without ever issuing a real fiscal receipt.
 */
export class MockFiscalDevice implements FiscalDevice {
  private readonly failedOnce = new Set<string>();

  constructor(
    private readonly failOnceForInvoiceId?: string,
    private readonly alert: (message: string) => void = (message) => console.warn(message),
  ) {}

  async issueReceipt(invoice: FiscalInvoiceCandidate): Promise<FiscalDeviceResult> {
    if (
      invoice.zohoInvoiceId === this.failOnceForInvoiceId &&
      !this.failedOnce.has(invoice.zohoInvoiceId)
    ) {
      this.failedOnce.add(invoice.zohoInvoiceId);
      this.alert(`MOCK device forced one retry for invoice ${invoice.zohoInvoiceId}`);
      // The mock can safely retry because it has no hardware side effects.
      this.alert(`MOCK retrying invoice ${invoice.zohoInvoiceId}`);
    }

    const suffix = invoice.zohoInvoiceId.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || "TRAINING";
    return {
      kind: "succeeded",
      receipt: {
        receiptNumber: `TEST-${suffix}`,
        issuedAt: new Date(),
        qrValue: `TEST-QR-PLACEHOLDER:${suffix}`,
      },
    };
  }
}
