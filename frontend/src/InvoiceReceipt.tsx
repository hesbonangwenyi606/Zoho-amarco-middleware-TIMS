import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { InvoiceSource } from "./InvoiceDetails";
import { fiscalDetails } from "./fiscal-details";
import "./receipt.css";

function value(input: unknown, fallback = "—"): string {
  return typeof input === "string" && input.trim()
    ? input
    : typeof input === "number"
      ? String(input)
      : fallback;
}
function record(input: unknown): InvoiceSource {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as InvoiceSource)
    : {};
}

export function InvoiceReceipt({ source }: { source: InvoiceSource }) {
  const fields = Array.isArray(source.custom_fields) ? source.custom_fields.map(record) : [];
  const field = (pattern: RegExp) => {
    const found = fields.find((item) =>
      pattern.test(
        [item.label, item.api_name, item.placeholder]
          .map((item) => value(item, ""))
          .join(" ")
          .replace(/_/g, " "),
      ),
    );
    return found ? value(found.value ?? found.value_formatted) : "—";
  };
  const fiscal = fiscalDetails(source, import.meta.env.DEV);
  const cu = fiscal.cu || "—";
  const serial = fiscal.serial || "—";
  const qr = fiscal.qr || "—";
  const fiscalDate = fiscal.date || "—";
  const [qrImage, setQrImage] = useState<{ value: string; url: string } | null>(null);
  const [qrError, setQrError] = useState("");
  useEffect(() => {
    let active = true;
    setQrError("");
    if (qr !== "—")
      void QRCode.toDataURL(qr, { width: 240, margin: 1 })
        .then((url) => {
          if (active) setQrImage({ value: qr, url });
        })
        .catch(() => {
          if (active) setQrError("QR code could not be rendered");
        });
    return () => {
      active = false;
    };
  }, [qr]);
  const address = record(source.billing_address);
  const lines = Array.isArray(source.line_items) ? source.line_items.map(record) : [];
  const currency = value(source.currency_code, "KES");
  const money = (input: unknown) => {
    if (input === undefined || input === null || input === "") return "—";
    const amount = Number(input);
    return Number.isFinite(amount)
      ? amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "—";
  };
  const isTest = fiscal.isTest;
  return (
    <div className="receipt-preview">
      <div className="receipt-toolbar">
        <strong>Invoice print preview</strong>
        <button className="secondary-button" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>
      <div className="receipt-scroll">
        <article className="armco-receipt" aria-label="Printable Armco invoice">
          <header className="receipt-header">
            <div className="receipt-armco">
              ARM<span>C</span>O
            </div>
            <div>
              <h2>ARMCO (K) LIMITED</h2>
              <h1>INVOICE</h1>
            </div>
            <div className="receipt-toshiba">TOSHIBA</div>
          </header>
          {isTest && <div className="receipt-test">TEST / MOCK — NOT A TAX RECEIPT</div>}
          <div className="receipt-parties">
            <section>
              <h3>CUSTOMER</h3>
              <p>{value(source.customer_name)}</p>
              <p>
                {[
                  address.address,
                  address.street2,
                  address.city,
                  address.state,
                  address.zip,
                  address.country,
                ]
                  .map((item) => value(item, ""))
                  .filter(Boolean)
                  .join("\n") || "Address not provided"}
              </p>
              <p className="receipt-pin">
                {value(
                  source.gst_no ?? source.vat_reg_no ?? source.tax_reg_no ?? source.customer_tax_id,
                  "Customer PIN not provided",
                )}
              </p>
            </section>
            <section>
              <p>
                Head Office | Emirates Business Park,
                <br />
                off Eastern Bypass Slip Road
                <br />
                Showroom | Shamsteel Court, Muthithi Road
                <br />
                Next to Unga House,
                <br />
                P.O. Box 47167-00100, Nairobi
                <br />
                PIN Number: P000595344Z
              </p>
              <p>
                Switch Board +254 20 8002221/2/3
                <br />
                Mobile: (+254) 726-22-9999 / 733-22-9999
              </p>
              <p>
                Sales Email: sales@armcokenya.com
                <br />
                General Enquiries: info@armcokenya.com
                <br />
                Service Queries: service@armcokenya.com
              </p>
            </section>
          </div>
          <p className="receipt-cu-heading">
            CU Invoice Number: <strong>{cu}</strong>
          </p>
          <table className="receipt-meta">
            <thead>
              <tr>
                {[
                  "Document No",
                  "Invoice date",
                  "GRN",
                  "Delivery date",
                  "Customer / purchase order no",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{value(source.invoice_number)}</td>
                <td>{value(source.date)}</td>
                <td>{field(/\bgrn\b/i)}</td>
                <td>{value(source.delivery_date, field(/delivery date/i))}</td>
                <td>{value(source.reference_number, field(/purchase order|customer order/i))}</td>
              </tr>
            </tbody>
          </table>
          <table className="receipt-items">
            <thead>
              <tr>
                {[
                  "Stock code",
                  "Description",
                  "Warehouse",
                  "HS Code",
                  "Delivery qty",
                  "Unit price",
                  "Discount",
                  "Gross Amount",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>{value(line.sku ?? line.item_code)}</td>
                  <td>{value(line.description, value(line.name))}</td>
                  <td>{value(line.warehouse_name ?? line.warehouse_id)}</td>
                  <td>{value(line.hsn_or_sac ?? line.hs_code)}</td>
                  <td>{value(line.quantity)}</td>
                  <td>{money(line.rate)}</td>
                  <td>{value(line.discount)}</td>
                  <td>{money(line.item_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="receipt-notes">{value(source.notes, "")}</div>
          <div className="receipt-bottom">
            <div>
              <div className="receipt-signature">
                Customer Signature (and rubber stamp)............................Date...........
              </div>
              <h3>Terms &amp; Conditions:</h3>
              <div className="receipt-terms">
                {value(source.terms, "Terms not provided on this invoice.")}
              </div>
            </div>
            <div>
              <div className="receipt-totals">
                {[
                  [`Net Amount (${currency})`, source.sub_total],
                  [`Total discount (${currency})`, source.discount_total],
                  [`Total Tax (${currency})`, source.tax_total],
                  [`Total Amount (${currency})`, source.total],
                ].map(([label, amount], index) => (
                  <div key={index}>
                    <span>{String(label)}</span>
                    <strong>{money(amount)}</strong>
                  </div>
                ))}
              </div>
              <div className="receipt-control">
                <div>
                  <h3>Control Unit Info</h3>
                  <dl>
                    <dt>Date Time:</dt>
                    <dd>{fiscalDate}</dd>
                    <dt>CU Serial No:</dt>
                    <dd>{serial}</dd>
                    <dt>CU Number:</dt>
                    <dd>{cu}</dd>
                  </dl>
                </div>
                <div className="receipt-qr">
                  {qrImage?.value === qr ? (
                    <img
                      src={qrImage.url}
                      alt="Invoice control unit QR code"
                      width="130"
                      height="130"
                    />
                  ) : (
                    <span>{qrError || (qr === "—" ? "QR not provided" : "Preparing QR…")}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <footer className="receipt-footer">www.armcokenya.com</footer>
        </article>
      </div>
    </div>
  );
}
