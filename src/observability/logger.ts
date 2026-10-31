import pino from "pino";

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.url",
      "req.originalUrl",
      "req.query",
      "*.password",
      "*.access_token",
      "*.refresh_token",
    ],
    censor: "[REDACTED]",
  },
});
