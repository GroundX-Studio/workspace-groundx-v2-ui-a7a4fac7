import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers.x-api-key",
    "req.headers.x-customer-key",
    "res.headers.set-cookie",
    "*.apiKey",
    "*.password",
    "*.token",
  ],
});
