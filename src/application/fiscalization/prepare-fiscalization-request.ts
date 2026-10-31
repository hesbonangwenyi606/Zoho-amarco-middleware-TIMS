import { randomUUID } from "node:crypto";

import type { RegisterFiscalizationRequestService } from "./register-fiscalization-request.js";
import type { FiscalizationRecord } from "../../domain/fiscalization/fiscalization-record.js";
import type { ZohoInvoiceService } from "../zoho/zoho-invoice-service.js";
import type { InvoiceMappingResult, FiscalInvoiceCandidate } from "../zoho/zoho-invoice-mapper.js";

/**
 * Result of preparing a fiscalization request.
 *
 * A registered request is still Pending. It has not been sent to
 * the fiscal device and does not mean a fiscal receipt exists.
 */
export type PrepareFiscalizationRequestResult =
  | {
      readonly kind: "mapping-failed";
      readonly errors: Extract<InvoiceMappingResult, { success: false }>["errors"];
    }
  | { readonly kind: "mock-invoice-not-allowed" }
  | {
      readonly kind: "registered";
      readonly record: FiscalizationRecord;
      readonly candidate: FiscalInvoiceCandidate;
    };

export class PrepareFiscalizationRequestService {
  constructor(
    private readonly invoiceService: Pick<ZohoInvoiceService, "getFiscalInvoiceCandidate">,
    private readonly registrationService: Pick<RegisterFiscalizationRequestService, "register">,
    private readonly generateId: () => string = randomUUID,
    private readonly mockInvoiceAllowed?: (candidate: FiscalInvoiceCandidate) => boolean,
  ) {}

  async prepare(invoiceId: string): Promise<PrepareFiscalizationRequestResult> {
    const mapping = await this.invoiceService.getFiscalInvoiceCandidate(invoiceId);

    if (!mapping.success) {
      return {
        kind: "mapping-failed",
        errors: mapping.errors,
      };
    }

    if (this.mockInvoiceAllowed && !this.mockInvoiceAllowed(mapping.candidate)) {
      return { kind: "mock-invoice-not-allowed" };
    }

    const record = await this.registrationService.register({
      id: this.generateId(),
      invoice: mapping.candidate,
    });

    return {
      kind: "registered",
      record,
      candidate: mapping.candidate,
    };
  }
}
