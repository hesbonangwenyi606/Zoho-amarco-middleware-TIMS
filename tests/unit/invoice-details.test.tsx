import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceDetails } from "../../frontend/src/InvoiceDetails";

describe("invoice fiscal details", () => {
  it("shows saved CU, serial and QR fields, including additional custom fields", () => {
    const html = renderToStaticMarkup(
      <InvoiceDetails
        source={{
          custom_fields: [
            { label: "CU No.", value: "CU-123" },
            { api_name: "cf_serial_no", value: "SN-456" },
            { label: "QR Code", value: "TEST-QR-PLACEHOLDER:123" },
            { label: "Branch", value: "Nairobi" },
          ],
        }}
      />,
    );
    expect(html).toContain("CU-123");
    expect(html).toContain("SN-456");
    expect(html).toContain("TEST-QR-PLACEHOLDER:123");
    expect(html).toContain("test QR placeholder");
    expect(html).toContain("Nairobi");
  });

  it("shows absent fiscal values without inventing identifiers", () => {
    const html = renderToStaticMarkup(<InvoiceDetails source={{ invoice_id: "123" }} />);
    expect(html.match(/Not provided/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).not.toContain("<img");
  });

  it("escapes custom field content", () => {
    const html = renderToStaticMarkup(
      <InvoiceDetails
        source={{ custom_fields: [{ label: "CU No.", value: "<script>bad</script>" }] }}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
