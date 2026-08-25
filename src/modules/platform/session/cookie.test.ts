import { beforeEach, describe, expect, it } from "vitest";
import { decodeSession, encodeSession, SESSION_TTL_SECONDS, type SessionClaims } from "./cookie";

const NOW = new Date("2026-08-23T10:00:00Z");

function claims(over: Partial<SessionClaims> = {}): SessionClaims {
  const iat = Math.floor(NOW.getTime() / 1000);
  return { sid: "s1", uid: "u1", org: "org_a", v: 1, iat, exp: iat + SESSION_TTL_SECONDS, ...over };
}

beforeEach(() => {
  process.env.SESSION_SECRET = "a".repeat(48);
  delete process.env.SESSION_SECRET_PREVIOUS;
});

describe("session cookies", () => {
  it("round-trips claims", () => {
    const decoded = decodeSession(encodeSession(claims()), NOW);
    expect(decoded.ok && decoded.claims.uid).toBe("u1");
  });

  it("rejects a tampered payload", () => {
    const token = encodeSession(claims());
    const [payload, signature] = token.split(".") as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ ...claims(), org: "org_b" }),
    ).toString("base64url");
    expect(decodeSession(`${forged}.${signature}`, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(decodeSession(`${payload}.${"x".repeat(43)}`, NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("rejects an expired cookie", () => {
    const token = encodeSession(claims());
    const later = new Date(NOW.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    expect(decodeSession(token, later)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a malformed cookie without throwing", () => {
    expect(decodeSession("nonsense", NOW).ok).toBe(false);
    expect(decodeSession("a.b.c", NOW).ok).toBe(false);
  });

  it("still verifies cookies signed with the previous secret during rotation", () => {
    process.env.SESSION_SECRET = "b".repeat(48);
    const oldToken = (() => {
      process.env.SESSION_SECRET = "a".repeat(48);
      const t = encodeSession(claims());
      process.env.SESSION_SECRET = "b".repeat(48);
      return t;
    })();

    expect(decodeSession(oldToken, NOW).ok).toBe(false);
    process.env.SESSION_SECRET_PREVIOUS = "a".repeat(48);
    expect(decodeSession(oldToken, NOW).ok).toBe(true);
  });

  it("refuses to sign with a weak secret", () => {
    process.env.SESSION_SECRET = "short";
    expect(() => encodeSession(claims())).toThrow(/at least 32/);
  });
});
