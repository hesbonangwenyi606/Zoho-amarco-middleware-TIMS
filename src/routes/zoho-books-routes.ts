import { Router } from "express";
import type { ZohoInvoiceService } from "../application/zoho/zoho-invoice-service.js";
import {
  ZohoBooksApiError,
  ZohoBooksScopeError,
  type ZohoBooksClient,
} from "../integrations/zoho/books-client.js";
import type { PrepareFiscalizationRequestService } from "../application/fiscalization/prepare-fiscalization-request.js";
import { DuplicateZohoInvoiceError } from "../application/fiscalization/fiscalization-errors.js";
import type { FiscalizationRepository } from "../application/fiscalization/fiscalization-repository.js";
import type { FiscalizationService } from "../application/fiscalization/fiscalization-service.js";

/**
 * Read-only HTTP endpoints for retrieving and mapping Zoho Books invoices.
 *
 * Neither endpoint can fiscalize an invoice or send commands to the
 * Tremol device.
 */
export function createZohoBooksRouter(
  booksClient: ZohoBooksClient | undefined,
  invoiceService?: ZohoInvoiceService,
  prepareFiscalizationRequestService?: PrepareFiscalizationRequestService,
  fiscalizationRepository?: FiscalizationRepository,
  mockFiscalizationService?: FiscalizationService,
  mockWriteBack?: (
    invoiceId: string,
    receiptNumber: string,
    qrValue: string,
    issuedAt: Date,
  ) => Promise<void>,
): Router {
  const router = Router();

  router.get("/organizations", async (req, res, next) => {
    if (!booksClient) {
      res.status(503).json({
        error: {
          code: "ZOHO_BOOKS_UNAVAILABLE",
          message: "Zoho Books organization lookup is not configured.",
        },
      });
      return;
    }

    try {
      const organizations = await booksClient.listOrganizations();
      res.status(200).json({ organizations });
    } catch (error: unknown) {
      if (error instanceof ZohoBooksScopeError) {
        res.status(403).json({
          error: {
            code: "ZOHO_BOOKS_SCOPE_REQUIRED",
            message: "Reconnect Zoho and grant the organization settings read permission.",
          },
        });
        return;
      }
      if (error instanceof ZohoBooksApiError) {
        req.log.warn({ upstreamStatus: error.status }, "Zoho Books organization request failed");
        res.status(502).json({
          error: {
            code: "ZOHO_BOOKS_UPSTREAM_ERROR",
            message: "Zoho Books could not complete the organization lookup.",
          },
        });
        return;
      }
      next(error);
    }
  });

  router.get("/invoices/:invoiceId/fiscal-candidate", async (req, res, next) => {
    if (!invoiceService) {
      res.status(503).json({
        error: {
          code: "ZOHO_INVOICE_SERVICE_UNAVAILABLE",
          message: "Zoho invoice mapping is not configured.",
        },
      });
      return;
    }

    const invoiceId =
      typeof req.params["invoiceId"] === "string" ? req.params["invoiceId"].trim() : "";

    if (!invoiceId) {
      res.status(400).json({
        error: {
          code: "INVALID_INVOICE_ID",
          message: "A valid invoice ID is required.",
        },
      });
      return;
    }

    try {
      const result = await invoiceService.getFiscalInvoiceCandidate(invoiceId);

      if (!result.success) {
        req.log.warn({ errorCount: result.errors.length }, "Zoho invoice could not be mapped");

        res.status(502).json({
          error: {
            code: "ZOHO_INVOICE_MAPPING_FAILED",
            message:
              "The retrieved Zoho invoice could not be mapped to the internal invoice format.",
          },
          details: result.errors,
        });
        return;
      }

      res.status(200).json({
        candidate: result.candidate,
      });
    } catch (error: unknown) {
      if (error instanceof ZohoBooksApiError) {
        req.log.warn({ upstreamStatus: error.status }, "Zoho Books invoice request failed");

        res.status(502).json({
          error: {
            code: "ZOHO_BOOKS_UPSTREAM_ERROR",
            message: "Zoho Books could not complete the invoice request.",
          },
        });
        return;
      }

      next(error);
    }
  });

  router.get("/invoices/:invoiceId", async (req, res, next) => {
    if (!booksClient) {
      res.status(503).json({
        error: {
          code: "ZOHO_BOOKS_UNAVAILABLE",
          message: "Zoho Books invoice retrieval is not configured.",
        },
      });
      return;
    }

    const invoiceId =
      typeof req.params["invoiceId"] === "string" ? req.params["invoiceId"].trim() : "";

    if (!invoiceId) {
      res.status(400).json({
        error: {
          code: "INVALID_INVOICE_ID",
          message: "A valid invoice ID is required.",
        },
      });
      return;
    }

    try {
      const invoice = await booksClient.getInvoice(invoiceId);
      res.status(200).json({ invoice });
    } catch (error: unknown) {
      if (error instanceof ZohoBooksApiError) {
        req.log.warn({ upstreamStatus: error.status }, "Zoho Books invoice request failed");

        res.status(502).json({
          error: {
            code: "ZOHO_BOOKS_UPSTREAM_ERROR",
            message: "Zoho Books could not complete the invoice request.",
          },
        });
        return;
      }

      next(error);
    }
  });

  router.post("/invoices/:invoiceId/fiscalization-requests", async (req, res, next) => {
    if (!prepareFiscalizationRequestService) {
      res.status(503).json({
        error: {
          code: "FISCALIZATION_REQUEST_SERVICE_UNAVAILABLE",
          message: "Fiscalization request preparation is not configured.",
        },
      });
      return;
    }

    const invoiceId =
      typeof req.params["invoiceId"] === "string" ? req.params["invoiceId"].trim() : "";

    if (!invoiceId) {
      res.status(400).json({
        error: {
          code: "INVALID_INVOICE_ID",
          message: "A valid invoice ID is required.",
        },
      });
      return;
    }

    try {
      const result = await prepareFiscalizationRequestService.prepare(invoiceId);

      if (result.kind === "mapping-failed") {
        req.log.warn(
          { errorCount: result.errors.length },
          "Zoho invoice could not be mapped for fiscalization request",
        );

        res.status(422).json({
          error: {
            code: "ZOHO_INVOICE_MAPPING_FAILED",
            message: "The Zoho invoice could not be mapped to the internal invoice format.",
          },
          details: result.errors,
        });
        return;
      }

      if (result.kind === "mock-invoice-not-allowed") {
        res.status(403).json({
          error: {
            code: "MOCK_TRAINING_INVOICE_REQUIRED",
            message: "MOCK accepts only training invoice numbers with the configured prefix.",
          },
        });
        return;
      }

      res.status(201).json({
        request: {
          id: result.record.id,
          zohoInvoiceId: result.record.zohoInvoiceId,
          status: result.record.status,
          createdAt: result.record.createdAt,
          updatedAt: result.record.updatedAt,
        },
      });

      if (mockFiscalizationService) {
        const timer = setTimeout(() => {
          void mockFiscalizationService
            .processPending(result.record.id, result.candidate)
            .then((record) => {
              req.log.info(
                { requestId: record.id, status: record.status },
                "MOCK fiscalization finished",
              );
              if (record.status === "Succeeded" && record.receipt && mockWriteBack) {
                void (async () => {
                  for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                      await mockWriteBack(
                        record.zohoInvoiceId,
                        record.receipt!.receiptNumber,
                        record.receipt!.qrValue ?? "",
                        record.receipt!.issuedAt,
                      );
                      return;
                    } catch (error) {
                      const permanentZohoError =
                        error instanceof ZohoBooksScopeError ||
                        (error instanceof ZohoBooksApiError &&
                          error.status >= 400 &&
                          error.status < 500);
                      if (permanentZohoError) {
                        req.log.error(
                          { requestId: record.id, err: error },
                          "Zoho rejected MOCK custom-field write-back; fix the reported Zoho error before retrying",
                        );
                        return;
                      }
                      req.log.warn(
                        { requestId: record.id, attempt, err: error },
                        "MOCK Zoho write-back failed; retrying transient failure",
                      );
                      if (attempt === 3) {
                        req.log.error(
                          { requestId: record.id, err: error },
                          "MOCK Zoho write-back exhausted retries; operator action required",
                        );
                      }
                    }
                  }
                })();
              }
            })
            .catch((error: unknown) => {
              req.log.error(
                { requestId: result.record.id, err: error },
                "MOCK fiscalization failed",
              );
            });
        }, 30_000);
        timer.unref();
      }
    } catch (error: unknown) {
      if (error instanceof DuplicateZohoInvoiceError) {
        res.status(409).json({
          error: {
            code: "FISCALIZATION_REQUEST_ALREADY_EXISTS",
            message: "A fiscalization request has already been registered for this Zoho invoice.",
          },
        });
        return;
      }

      if (error instanceof ZohoBooksApiError) {
        req.log.warn(
          { upstreamStatus: error.status },
          "Zoho Books invoice request failed during fiscalization preparation",
        );

        res.status(502).json({
          error: {
            code: "ZOHO_BOOKS_UPSTREAM_ERROR",
            message: "Zoho Books could not complete the invoice request.",
          },
        });
        return;
      }

      next(error);
    }
  });

  /**
   * Retries only the Zoho custom-field write-back for a completed MOCK request.
   * It never reprocesses the fiscal device or creates another fiscalization record.
   */
  router.post("/fiscalization-requests/:requestId/retry-writeback", async (req, res, next) => {
    if (!fiscalizationRepository || !mockWriteBack) {
      res.status(503).json({
        error: {
          code: "MOCK_WRITEBACK_UNAVAILABLE",
          message: "MOCK Zoho write-back is not configured.",
        },
      });
      return;
    }

    const requestId =
      typeof req.params["requestId"] === "string" ? req.params["requestId"].trim() : "";
    if (!requestId) {
      res.status(400).json({
        error: {
          code: "INVALID_FISCALIZATION_REQUEST_ID",
          message: "A valid fiscalization request ID is required.",
        },
      });
      return;
    }

    try {
      const record = await fiscalizationRepository.findById(requestId);
      if (!record) {
        res.status(404).json({
          error: {
            code: "FISCALIZATION_REQUEST_NOT_FOUND",
            message: "The fiscalization request was not found.",
          },
        });
        return;
      }
      if (record.status !== "Succeeded" || !record.receipt) {
        res.status(409).json({
          error: {
            code: "FISCALIZATION_RECEIPT_NOT_AVAILABLE",
            message: "Only a succeeded request with a saved receipt can retry Zoho write-back.",
          },
        });
        return;
      }

      await mockWriteBack(
        record.zohoInvoiceId,
        record.receipt.receiptNumber,
        record.receipt.qrValue ?? "",
        record.receipt.issuedAt,
      );
      res.status(200).json({
        message: "Zoho custom fields updated from the saved MOCK receipt.",
        requestId: record.id,
        zohoInvoiceId: record.zohoInvoiceId,
      });
    } catch (error: unknown) {
      if (error instanceof ZohoBooksScopeError) {
        req.log.warn(
          { requiredScope: error.requiredScope, grantedScopes: error.grantedScopes },
          "Zoho reauthorization is required",
        );
        res.status(403).json({
          error: {
            code: "ZOHO_BOOKS_SCOPE_REQUIRED",
            message: "Reconnect Zoho and grant invoice update permission, then retry this write-back.",
          },
        });
        return;
      }
      if (error instanceof ZohoBooksApiError) {
        req.log.error({ requestId, err: error }, "Zoho custom-field write-back retry failed");
        res.status(502).json({
          error: {
            code: "ZOHO_CUSTOM_FIELD_WRITEBACK_FAILED",
            message: "Zoho rejected the custom-field update. Check the server log for its reason.",
          },
        });
        return;
      }
      next(error);
    }
  });

  /**
   * Returns the current state of a registered fiscalization request.
   *
   * This endpoint is read-only. It never claims or processes a request
   * and never sends commands to the fiscal device.
   */
  router.get("/fiscalization-requests/:requestId", async (req, res, next) => {
    if (!fiscalizationRepository) {
      res.status(503).json({
        error: {
          code: "FISCALIZATION_REPOSITORY_UNAVAILABLE",
          message: "Fiscalization request lookup is not configured.",
        },
      });
      return;
    }

    const requestId =
      typeof req.params["requestId"] === "string" ? req.params["requestId"].trim() : "";

    if (!requestId) {
      res.status(400).json({
        error: {
          code: "INVALID_FISCALIZATION_REQUEST_ID",
          message: "A valid fiscalization request ID is required.",
        },
      });
      return;
    }

    try {
      const record = await fiscalizationRepository.findById(requestId);

      if (!record) {
        res.status(404).json({
          error: {
            code: "FISCALIZATION_REQUEST_NOT_FOUND",
            message: "The fiscalization request was not found.",
          },
        });
        return;
      }

      res.status(200).json({
        request: {
          id: record.id,
          zohoInvoiceId: record.zohoInvoiceId,
          status: record.status,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          receipt: record.receipt,
          failure: record.failure,
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
