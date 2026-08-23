import argon2 from "argon2";

/**
 * argon2id at deliberately unhurried settings. Sign-in is not a hot path, and
 * these are children's and teachers' accounts.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB — OWASP's floor for argon2id
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 10) throw new Error("password must be at least 10 characters");
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // A malformed stored hash is a failed verification, never a crash that
    // reveals which accounts have unusual credentials.
    return false;
  }
}

/** True when a stored hash was made with weaker settings and should be upgraded. */
export function needsRehash(hash: string): boolean {
  return !hash.startsWith("$argon2id$") || !hash.includes(`m=${OPTIONS.memoryCost}`);
}
