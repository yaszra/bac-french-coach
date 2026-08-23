import pino from "pino";

/**
 * Structured logs, with a redaction list that treats a child's data as the
 * default rather than the exception. Nothing here ever carries recitation audio,
 * password hashes, session tokens or raw email addresses.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "credential.passwordHash",
      "mfaSecret",
      "token",
      "cookie",
      "headers.cookie",
      "headers.authorization",
      "email",
      "*.email",
      "audio",
      "audioBytes",
    ],
    censor: "[redacted]",
  },
  base: { service: "itqan" },
});

export type RequestLogContext = {
  readonly requestId: string;
  readonly organizationId?: string;
  readonly userId?: string;
  readonly route?: string;
};

export function requestLogger(context: RequestLogContext) {
  return logger.child(context);
}
