import { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface InvoiceSource { [key: string]: unknown }

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function InvoiceDetails({ source }: { source: InvoiceSource }) {
  const fields = Array.isArray(source.custom_fields) ? source.custom_fields.filter((field): field is Record<string, unknown> => typeof field === "object" && field !== null) : [];
  const find = (pattern: RegExp) => {
    const field = fields.find(field => pattern.test([field.label, field.api_name, field.placeholder].filter(Boolean).join(" ").replace(/_/g, " ")));
    return field ? text(field.value ?? field.value_formatted) : "Not provided";
  };
  const cuNumber = find(/\bcu\s*(?:invoice\s*)?(?:no\b|number\b)|control unit.*(?:no\b|number\b)/i);
  const serial = find(/serial|\bcu\s*(?:serial|s\/n)/i);
  const qr = find(/\bqr\b/i);
  const [qrImage, setQrImage] = useState("");
  const [qrError, setQrError] = useState("");
  useEffect(() => {
    let active = true;
    setQrImage("");
    setQrError("");
    if (qr !== "Not provided") {
      void QRCode.toDataURL(qr, { width: 220, margin: 2 }).then(value => { if (active) setQrImage(value); }).catch(() => { if (active) setQrError("Could not render this QR value."); });
    }
    return () => { active = false; };
  }, [qr]);
  return <section className="invoice-extra">
    <h3>Fiscal details</h3>
    <div className="detail-grid">
      <Field label="CU No." value={cuNumber} />
      <Field label="Serial No." value={serial} />
      <Field label="QR code value" value={qr} />
    </div>
    {qrImage && <figure className="invoice-qr"><img src={qrImage} width={220} height={220} alt="QR code encoding the invoice QR value" /><figcaption>QR code from the saved invoice value</figcaption></figure>}
    {qrError && <p role="alert">{qrError}</p>}
    {qr.startsWith("TEST-") && <p className="warning-text">This invoice contains a test QR placeholder.</p>}
    <p className="form-help">Fiscal values are read from Zoho invoice custom fields. Missing values appear as “Not provided”.</p>
    <h3>Invoice details</h3>
    <div className="detail-grid">{["status", "date", "due_date", "reference_number", "customer_id", "customer_name", "contact_persons", "payment_terms_label", "balance", "payment_made", "salesperson_name", "notes", "terms", "billing_address", "shipping_address"].filter(key => source[key] !== undefined && source[key] !== null && source[key] !== "").map(key => <Field key={key} label={key.replace(/_/g, " ")} value={text(source[key])} />)}</div>
    {fields.length > 0 && <><h3>All custom fields</h3><div className="detail-grid">{fields.map((field, index) => <Field key={index} label={text(field.label ?? field.api_name ?? field.customfield_id)} value={text(field.value ?? field.value_formatted)} />)}</div></>}
    <details><summary>Complete invoice data</summary><pre className="xml-response">{JSON.stringify(source, null, 2)}</pre></details>
  </section>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="detail-item"><span>{label}</span><strong className="invoice-field-value">{value}</strong></div>;
}
