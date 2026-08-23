/**
 * Session signing and verification.
 *
 * Each test here corresponds to a way a cookie could be used to become
 * someone else.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  SESSION_COOKIE_OPTIONS,
  oneTimeToken,
  signSession,
  verifySession,
} from "../src/server/session.js";

const NOW = Date.UTC(2026, 3, 1, 12, 0, 0);
const HOUR = 3_600_000;

beforeAll(() => {
  process.env["ATHAR_SESSION_SECRET"] = "a".repeat(48);
});

const payload = { userId: "user-1", expiresAt: NOW + HOUR, mfaSatisfied: true };

describe("round trip", () => {
  it("verifies a session it signed", () => {
    expect(verifySession(signSession(payload), NOW)).toEqual(payload);
  });
});

describe("a tampered cookie is treated exactly like no cookie", () => {
  it("rejects a modified payload", () => {
    const token = signSession(payload);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...payload, userId: "someone-else" }),
      "utf8",
    ).toString("base64url");
    expect(verifySession(`${forged}.${mac}`, NOW)).toBeUndefined();
    expect(body).toBeTruthy();
  });

  it("rejects a modified signature", () => {
    const [body] = signSession(payload).split(".");
    expect(verifySession(`${body}.not-a-real-mac`, NOW)).toBeUndefined();
  });

  it("rejects a token with no signature at all", () => {
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    expect(verifySession(body, NOW)).toBeUndefined();
  });

  it("rejects garbage without throwing", () => {
    expect(verifySession("....", NOW)).toBeUndefined();
    expect(verifySession("", NOW)).toBeUndefined();
    expect(verifySession(undefined, NOW)).toBeUndefined();
  });

  it("rejects a signature from a different key", () => {
    const token = signSession(payload);
    process.env["ATHAR_SESSION_SECRET"] = "b".repeat(48);
    try {
      expect(verifySession(token, NOW)).toBeUndefined();
    } finally {
      process.env["ATHAR_SESSION_SECRET"] = "a".repeat(48);
    }
  });
});

describe("a cookie is not a permanent grant", () => {
  it("rejects an expired session", () => {
    expect(verifySession(signSession(payload), NOW + 2 * HOUR)).toBeUndefined();
  });

  it("rejects a session expiring exactly now", () => {
    const token = signSession({ ...payload, expiresAt: NOW });
    expect(verifySession(token, NOW)).toBeUndefined();
  });
});

describe("the secret fails closed", () => {
  it("refuses to sign without a strong secret", () => {
    const previous = process.env["ATHAR_SESSION_SECRET"];
    process.env["ATHAR_SESSION_SECRET"] = "too-short";
    try {
      expect(() => signSession(payload)).toThrow(/at least 32 characters/);
    } finally {
      process.env["ATHAR_SESSION_SECRET"] = previous;
    }
  });

  it("refuses to sign with no secret at all, rather than using a default", () => {
    const previous = process.env["ATHAR_SESSION_SECRET"];
    delete process.env["ATHAR_SESSION_SECRET"];
    try {
      expect(() => signSession(payload)).toThrow(/fail closed/);
    } finally {
      process.env["ATHAR_SESSION_SECRET"] = previous;
    }
  });
});

describe("cookie attributes cannot be weakened by a route", () => {
  it("is httpOnly, secure, and same-site", () => {
    expect(SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.secure).toBe(true);
    expect(SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
  });
});

describe("one-time tokens", () => {
  it("are unguessable and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => oneTimeToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(42);
  });
});
