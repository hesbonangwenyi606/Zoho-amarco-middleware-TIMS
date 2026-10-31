/**
 * Minimal Zoho Books invoice client.
 *
 * This integration retrieves invoices and can write configured custom fields
 * for the explicitly enabled MOCK flow. It does not perform live fiscalization.
 */

import { parseZohoBooksApiDomain } from "./api-domain.js";

export interface ZohoAccessTokenProvider {
  getAccessToken(): Promise<{
    accessToken: string;
    apiDomain: string;
    scopes: string;
  }>;
}

export type ZohoBooksTransport = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface ZohoInvoice {
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly currencyCode: string | null;
  /**
   * Keep the original validated invoice object available for the next
   * mapping step. Mapping and fiscal calculations belong elsewhere.
   */
  readonly source: Readonly<Record<string, unknown>>;
}

export interface ZohoBooksOrganization {
  readonly organizationId: string;
  readonly name: string;
  readonly userRole: string | null;
}

export interface ZohoBooksClientOptions {
  readonly tokenProvider: ZohoAccessTokenProvider;
  readonly organizationId?: string;
  readonly transport?: ZohoBooksTransport;
}

export interface ZohoInvoiceCustomFieldUpdate {
  readonly customfield_id: string;
  readonly value: string;
}

export class ZohoBooksApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly providerMessage?: string,
  ) {
    super(message);
    this.name = "ZohoBooksApiError";
  }
}

export class ZohoBooksScopeError extends Error {
  constructor(
    readonly requiredScope: string,
    readonly grantedScopes: string,
  ) {
    super(`The connected Zoho account has not granted ${requiredScope}.`);
    this.name = "ZohoBooksScopeError";
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Zoho invoice response is missing a valid ${field}.`);
  }

  return value.trim();
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function hasScope(grantedScopes: string, requiredScope: string): boolean {
  return grantedScopes.split(/[\s,]+/).some((scope) => scope === requiredScope);
}

function validateApiDomain(value: string): URL {
  const url = parseZohoBooksApiDomain(value);

  if (url === null) {
    throw new Error("Zoho returned an invalid API domain.");
  }

  return url;
}

function parseInvoiceResponse(value: unknown, requestedInvoiceId: string): ZohoInvoice {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Zoho returned an invalid invoice response.");
  }

  const envelope = value as Record<string, unknown>;
  const invoiceValue = envelope["invoice"];

  if (typeof invoiceValue !== "object" || invoiceValue === null || Array.isArray(invoiceValue)) {
    throw new Error("Zoho response does not contain a valid invoice.");
  }

  const invoice = invoiceValue as Record<string, unknown>;
  const invoiceId = requiredText(invoice["invoice_id"], "invoice ID");

  if (invoiceId !== requestedInvoiceId) {
    throw new Error("Zoho returned an invoice with an unexpected ID.");
  }

  return {
    invoiceId,
    invoiceNumber: optionalText(invoice["invoice_number"]),
    customerId: optionalText(invoice["customer_id"]),
    customerName: optionalText(invoice["customer_name"]),
    currencyCode: optionalText(invoice["currency_code"]),
    source: invoice,
  };
}

export class ZohoBooksClient {
  private readonly tokenProvider: ZohoAccessTokenProvider;
  private readonly organizationId: string;
  private readonly transport: ZohoBooksTransport;

  constructor(options: ZohoBooksClientOptions) {
    this.tokenProvider = options.tokenProvider;
    this.organizationId = options.organizationId?.trim() ?? "";
    this.transport = options.transport ?? fetch;
  }

  /** Lists organizations visible to the connected Zoho user. */
  async listOrganizations(): Promise<ZohoBooksOrganization[]> {
    const token = await this.tokenProvider.getAccessToken();

    if (!token.accessToken.trim()) {
      throw new Error("Zoho access token provider returned an empty token.");
    }

    if (!hasScope(token.scopes, "ZohoBooks.settings.READ")) {
      throw new ZohoBooksScopeError("ZohoBooks.settings.READ", token.scopes);
    }

    const apiDomain = validateApiDomain(token.apiDomain);
    const organizationsUrl = new URL("/books/v3/organizations", apiDomain);
    const response = await this.transport(organizationsUrl, {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${token.accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new ZohoBooksApiError(
        `Zoho Books organization request failed with HTTP status ${response.status}.`,
        response.status,
      );
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new Error("Zoho Books returned invalid JSON for organizations.");
    }

    if (typeof responseBody !== "object" || responseBody === null || Array.isArray(responseBody)) {
      throw new Error("Zoho returned an invalid organizations response.");
    }

    const organizations = (responseBody as Record<string, unknown>)["organizations"];
    if (!Array.isArray(organizations)) {
      throw new Error("Zoho response does not contain a valid organizations list.");
    }

    return organizations.map((value) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("Zoho returned an invalid organization entry.");
      }
      const organization = value as Record<string, unknown>;
      return {
        organizationId: requiredText(organization["organization_id"], "organization ID"),
        name: requiredText(organization["name"], "organization name"),
        userRole: optionalText(organization["user_role"]),
      };
    });
  }

  /**
   * Fetches one invoice from Zoho Books.
   *
   * This method never returns or logs the OAuth access token.
   */
  async getInvoice(invoiceIdInput: string): Promise<ZohoInvoice> {
    const invoiceId = invoiceIdInput.trim();

    if (!invoiceId) {
      throw new Error("Zoho invoice ID is required.");
    }

    if (!this.organizationId) {
      throw new Error("Zoho Books organization ID is required for invoice retrieval.");
    }

    const token = await this.tokenProvider.getAccessToken();

    if (!token.accessToken.trim()) {
      throw new Error("Zoho access token provider returned an empty token.");
    }

    if (!hasScope(token.scopes, "ZohoBooks.invoices.READ")) {
      throw new ZohoBooksScopeError("ZohoBooks.invoices.READ", token.scopes);
    }

    const apiDomain = validateApiDomain(token.apiDomain);
    const invoiceUrl = new URL(`/books/v3/invoices/${encodeURIComponent(invoiceId)}`, apiDomain);

    invoiceUrl.searchParams.set("organization_id", this.organizationId);

    const response = await this.transport(invoiceUrl, {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${token.accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new ZohoBooksApiError(
        `Zoho Books invoice request failed with HTTP status ${response.status}.`,
        response.status,
      );
    }

    let responseBody: unknown;

    try {
      responseBody = await response.json();
    } catch {
      throw new Error("Zoho Books returned invalid JSON for the invoice.");
    }

    return parseInvoiceResponse(responseBody, invoiceId);
  }

  /** Updates only the named invoice custom fields (ZohoBooks.invoices.UPDATE). */
  async updateInvoiceCustomFields(
    invoiceIdInput: string,
    fields: readonly ZohoInvoiceCustomFieldUpdate[],
  ): Promise<void> {
    const invoiceId = invoiceIdInput.trim();
    if (!invoiceId || fields.length === 0)
      throw new Error("Invoice ID and custom fields are required.");
    const token = await this.tokenProvider.getAccessToken();
    if (!hasScope(token.scopes, "ZohoBooks.invoices.UPDATE")) {
      throw new ZohoBooksScopeError("ZohoBooks.invoices.UPDATE", token.scopes);
    }
    // Use the standard invoice update endpoint with only custom_fields in the
    // payload. Zoho's dedicated customfields endpoint is returning a malformed
    // JSON error for a valid documented array in this organization's API.
    const url = new URL(
      `/books/v3/invoices/${encodeURIComponent(invoiceId)}`,
      validateApiDomain(token.apiDomain),
    );
    url.searchParams.set("organization_id", this.organizationId);
    const requestBody = JSON.stringify({ custom_fields: fields });
    const response = await this.transport(url, {
      method: "PUT",
      headers: {
        Authorization: `Zoho-oauthtoken ${token.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: requestBody,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      let providerMessage: string | undefined;
      try {
        const errorBody: unknown = await response.json();
        if (typeof errorBody === "object" && errorBody !== null && !Array.isArray(errorBody)) {
          const message = (errorBody as Record<string, unknown>)["message"];
          if (typeof message === "string") providerMessage = message;
        }
      } catch {
        // Keep the HTTP status useful even when Zoho returns a non-JSON error.
      }
      throw new ZohoBooksApiError(
        `Zoho Books invoice update failed with HTTP status ${response.status}.`,
        response.status,
        providerMessage,
      );
    }
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      (body as Record<string, unknown>)["code"] !== 0
    ) {
      throw new Error("Zoho Books did not confirm the invoice custom-field update.");
    }
  }
}
