import pino from "pino";

/**
 * Server logger. All sensitive paths get scrubbed at emit time via pino's
 * `redact` config (auth headers, cookies, API keys, tokens, passwords).
 * Body content is also redacted at well-known keys so a careless
 * `logger.info({ req })` doesn't leak a registration payload's password or
 * an LLM message that contains an email.
 *
 * Free-form fields (chat content, document text) MUST NOT be logged anywhere
 * — the redact list catches passwords/tokens but not arbitrary user content.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-api-key",
      "req.headers.x-customer-key",
      "res.headers.set-cookie",
      "req.body.password",
      "req.body.newPassword",
      "req.body.email",
      "req.body.customer.email",
      "req.body.customer.password",
      "req.body.messages",
      "req.body.query",
      "*.apiKey",
      "*.password",
      "*.token",
      "*.email",
    ],
    censor: "[REDACTED]",
  },
});
