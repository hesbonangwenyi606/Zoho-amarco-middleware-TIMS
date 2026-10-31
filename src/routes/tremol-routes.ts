import { Router } from "express";
import {
  TremolDeviceError,
  TremolHttpError,
  TremolProtocolError,
  type TremolReadCommand,
  type TremolZfpLabServerClient,
} from "../infrastructure/device/tremol-zfplabserver-client.js";

const readCommands: Readonly<Record<string, TremolReadCommand>> = {
  status: "ReadStatus()",
  version: "ReadVersion()",
  "current-receipt": "ReadCurrentReceiptInfo()",
  "receipt-counters": "ReadLastAndTotalReceiptNum()",
};

/**
 * Read-only diagnostics for the configured ZFPLabServer.
 * Receipt-issuing and device-configuration commands are intentionally not routed.
 */
export function createTremolRouter(client?: TremolZfpLabServerClient): Router {
  const router = Router();

  router.get("/commands/:command", async (req, res) => {
    const commandName = req.params["command"];
    const command = typeof commandName === "string" ? readCommands[commandName] : undefined;

    if (!command) {
      res.status(404).json({
        error: {
          code: "TREMOL_READ_COMMAND_NOT_FOUND",
          message: "Supported read commands are status, version, current-receipt, and receipt-counters.",
        },
      });
      return;
    }

    if (!client) {
      res.status(503).json({
        error: {
          code: "TREMOL_CLIENT_UNAVAILABLE",
          message: "ZFPLabServer is not configured. Set TREMOL_ZFPLABSERVER_BASE_URL and restart the API.",
        },
      });
      return;
    }

    try {
      const result = await client.executeRead(command);
      res.status(200).json({
        command: commandName,
        status: result.status,
        resultCode: result.resultCode,
        responseXml: result.body,
      });
    } catch (error: unknown) {
      if (error instanceof TremolDeviceError) {
        req.log.warn({ command: commandName, resultCode: error.resultCode }, "Tremol read command returned an error");
        res.status(502).json({
          error: {
            code: "TREMOL_DEVICE_COMMAND_FAILED",
            message: "ZFPLabServer or the fiscal device rejected the read command.",
            resultCode: error.resultCode,
          },
        });
        return;
      }

      if (error instanceof TremolHttpError) {
        req.log.warn({ command: commandName, upstreamStatus: error.status }, "ZFPLabServer HTTP request failed");
        res.status(502).json({
          error: {
            code: "TREMOL_SERVER_HTTP_ERROR",
            message: "ZFPLabServer returned an HTTP error.",
            upstreamStatus: error.status,
          },
        });
        return;
      }

      if (error instanceof TremolProtocolError) {
        req.log.warn({ command: commandName }, "ZFPLabServer response did not match the expected XML protocol");
        res.status(502).json({
          error: {
            code: "TREMOL_PROTOCOL_ERROR",
            message: error.message,
          },
        });
        return;
      }

      if (error instanceof Error && error.name === "TimeoutError") {
        req.log.warn({ command: commandName }, "ZFPLabServer read command timed out");
        res.status(504).json({
          error: {
            code: "TREMOL_READ_TIMEOUT",
            message: "ZFPLabServer did not respond before the configured timeout.",
          },
        });
        return;
      }

      req.log.warn({ command: commandName }, "Could not reach ZFPLabServer");
      res.status(502).json({
        error: {
          code: "TREMOL_CONNECTION_FAILED",
          message: "The middleware could not reach ZFPLabServer.",
        },
      });
    }
  });

  return router;
}
