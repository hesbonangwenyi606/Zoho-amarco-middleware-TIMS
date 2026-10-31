import type { InvoiceSource } from "./InvoiceDetails";

function text(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
}

/** Preview values are local display data, never fiscal-device output or Zoho updates. */
export function fiscalDetails(source: InvoiceSource, preview = false) {
  const fields = Array.isArray(source.custom_fields)
    ? source.custom_fields.filter(
        (item): item is InvoiceSource => typeof item === "object" && item !== null,
      )
    : [];
  const hash =
    typeof source.custom_field_hash === "object" && source.custom_field_hash !== null
      ? (source.custom_field_hash as InvoiceSource)
      : {};
  const candidates = [
    ...fields.map((field) => ({
      name: [field.label, field.api_name, field.placeholder].map(text).join(" ").replace(/_/g, " "),
      value: text(field.value) || text(field.value_formatted),
    })),
    ...Object.entries(hash).map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value: text(value),
    })),
  ];
  const find = (pattern: RegExp) =>
    candidates.find((field) => field.value && pattern.test(field.name))?.value ?? "";
  let cu = find(/\bcu\s*(?:invoice\s*)?(?:no\b|number\b)|control unit.*(?:no\b|number\b)/i);
  let serial = find(/serial|\bcu\s*s\/n/i);
  let qr = find(/\bqr\b/i);
  let date = find(/fiscalized at|fiscal.*date|cu.*date/i);
  const invoiceId = text(source.invoice_id);
  const generated = preview && !!invoiceId && (!cu || !serial || !qr);
  if (generated) {
    cu ||= `TEST-CU-${invoiceId}`;
    serial ||= "TEST-PREVIEW-DEVICE";
    date ||= text(source.date);
    qr ||= JSON.stringify({
      type: "TEST_PREVIEW_NOT_A_TAX_RECEIPT",
      invoiceId,
      cuNumber: cu,
      serialNumber: serial,
      date,
    });
  }
  const isTest =
    generated ||
    [cu, serial, qr, find(/fiscal.*status/i)].some((value) => /test|mock|train/i.test(value));
  return { cu, serial, qr, date, isTest, generated };
}
