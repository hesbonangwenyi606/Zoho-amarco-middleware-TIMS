import { describe, expect, it, vi } from "vitest";
import { MockFiscalDevice } from "../../src/infrastructure/device/mock-fiscal-device.js";
import type { FiscalInvoiceCandidate } from "../../src/application/zoho/zoho-invoice-mapper.js";

const candidate: FiscalInvoiceCandidate = {
  zohoInvoiceId: "training-invoice-001",
  invoiceNumber: "TRAIN-001",
  customerId: "customer-1",
  customerName: "Training Customer",
  currencyCode: "KES",
  lines: [
    {
      sourceLineId: "line-1",
      itemId: "item-1",
      description: "Training item",
      quantity: "1",
      unitPrice: "100",
      lineTotal: "100",
      taxId: "tax-1",
      taxName: "VAT",
      taxType: "tax",
      taxPercentage: "16",
    },
  ],
  subtotal: "100",
  taxTotal: "16",
  total: "116",
};

describe("MockFiscalDevice", () => {
  it("returns a clearly marked test receipt without hardware access", async () => {
    const result = await new MockFiscalDevice().issueReceipt(candidate);
    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.receipt.receiptNumber).toBe("TEST-nginvoice001");
      expect(result.receipt.qrValue).toBe("TEST-QR-PLACEHOLDER:nginvoice001");
    }
  });

  it("alerts and safely retries one configured mock failure", async () => {
    const alert = vi.fn();
    const device = new MockFiscalDevice(candidate.zohoInvoiceId, alert);
    const first = await device.issueReceipt(candidate);
    const second = await device.issueReceipt(candidate);
    expect(first.kind).toBe("succeeded");
    expect(second.kind).toBe("succeeded");
    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("forced one retry"));
  });
});
