import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceReceipt } from "../../frontend/src/InvoiceReceipt";

describe("printable invoice", () => {
  it("renders invoice data and fiscal identifiers in the reference layout", () => {
    const html = renderToStaticMarkup(
      <InvoiceReceipt
        source={{
          invoice_number: "INV-42",
          date: "2026-10-31",
          customer_name: "Example customer",
          billing_address: { address: "Example Road", city: "Nairobi" },
          currency_code: "KES",
          sub_total: 1000,
          tax_total: 160,
          total: 1160,
          terms: "Payment due in 30 days",
          line_items: [
            { sku: "SKU-1", description: "Fridge", quantity: 1, rate: 1000, item_total: 1000 },
          ],
          custom_fields: [
            { label: "CU Invoice Number", value: "CU-42" },
            { label: "CU Serial No", value: "SN-99" },
          ],
        }}
      />,
    );
    for (const value of [
      "INV-42",
      "Example customer",
      "Example Road",
      "SKU-1",
      "Fridge",
      "1,160.00",
      "CU-42",
      "SN-99",
      "Payment due in 30 days",
      "Control Unit Info",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain("NOT A TAX RECEIPT");
  });

  it("marks mock fiscal values and does not borrow identifiers from the sample", () => {
    const html = renderToStaticMarkup(
      <InvoiceReceipt source={{ custom_fields: [{ label: "CU Number", value: "TEST-42" }] }} />,
    );
    expect(html).toContain("NOT A TAX RECEIPT");
    expect(html).toContain("QR not provided");
    expect(html).not.toContain("0110162170000102221");
  });
});
