import { describe, expect, it } from "vitest";
import { fiscalDetails } from "../../frontend/src/fiscal-details";

describe("automatic fiscal preview", () => {
  it("fills missing values for each invoice in development with explicit test identifiers", () => {
    const first = fiscalDetails({ invoice_id: "123", date: "2026-10-31" }, true);
    const second = fiscalDetails({ invoice_id: "456" }, true);
    expect(first.cu).toBe("TEST-CU-123");
    expect(second.cu).toBe("TEST-CU-456");
    expect(first.serial).toBe("TEST-PREVIEW-DEVICE");
    expect(JSON.parse(first.qr)).toMatchObject({
      invoiceId: "123",
      type: "TEST_PREVIEW_NOT_A_TAX_RECEIPT",
    });
    expect(first.generated).toBe(true);
    expect(first.isTest).toBe(true);
  });
  it("keeps saved values and recognizes Zoho custom field hashes", () => {
    const result = fiscalDetails(
      {
        invoice_id: "123",
        custom_field_hash: {
          cf_cu_number: "CU-9",
          cf_cu_serial_no: "SN-9",
          cf_qr_code: "saved-qr",
        },
      },
      true,
    );
    expect(result).toMatchObject({
      cu: "CU-9",
      serial: "SN-9",
      qr: "saved-qr",
      generated: false,
      isTest: false,
    });
  });
  it("never generates missing identifiers in production or without an invoice ID", () => {
    expect(fiscalDetails({ invoice_id: "123" })).toMatchObject({
      cu: "",
      serial: "",
      qr: "",
      generated: false,
    });
    expect(fiscalDetails({}, true).generated).toBe(false);
  });
});
