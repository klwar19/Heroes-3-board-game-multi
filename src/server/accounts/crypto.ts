/**
 * Password hashing, one-time tokens and session tokens — all on Node's built-in
 * `crypto` (scrypt + randomBytes + SHA-256 + timing-safe compare). No external
 * dependency, works offline, fully testable. This is the security-sensitive
 * core; keep it small and audited.
 *
 * Storage forms:
 *  - Passwords: `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>` — self-describing so
 *    parameters can be raised later without a migration flag.
 *  - Tokens (confirm/reset/session): a raw high-entropy token is emailed / put
 *    in the cookie; only its SHA-256 digest is stored. A store dump therefore
 *    cannot be replayed to confirm, reset or impersonate.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

// scrypt cost parameters. N=16384 is a sensible interactive default; r/p as
// recommended. Encoded into the hash so we can raise them without ambiguity.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/** Hash a plaintext password into the self-describing storage string. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Verify a plaintext password against a stored hash string (constant time). */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }
  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/**
 * A URL-safe, high-entropy token for email links and session cookies. 32 bytes
 * ≈ 256 bits — not guessable. Returned raw (to email / set as a cookie); store
 * `hashToken(raw)` instead of the raw value.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex digest — the at-rest form of any token we store. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** A short, opaque account id. */
export function generateAccountId(): string {
  return `u_${randomBytes(9).toString("base64url")}`;
}
