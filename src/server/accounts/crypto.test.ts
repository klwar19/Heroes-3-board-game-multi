import { describe, expect, it } from "vitest";
import { generateAccountId, generateToken, hashPassword, hashToken, verifyPassword } from "./crypto";

describe("account crypto", () => {
  it("hashes and verifies a password (round-trip)", () => {
    const stored = hashPassword("correct horse battery 7");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery 7", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("hunter2!");
    expect(verifyPassword("hunter3!", stored)).toBe(false);
    // The stored form never contains the plaintext.
    expect(stored).not.toContain("hunter2");
  });

  it("uses a fresh salt so identical passwords hash differently", () => {
    const a = hashPassword("same-password-1");
    const b = hashPassword("same-password-1");
    expect(a).not.toBe(b);
    // ...yet both still verify.
    expect(verifyPassword("same-password-1", a)).toBe(true);
    expect(verifyPassword("same-password-1", b)).toBe(true);
  });

  it("verifyPassword returns false on a malformed stored string instead of throwing", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$bad")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });

  it("generates high-entropy, unique tokens and stable digests", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
    // Digest is deterministic for the same input, differs across inputs, and is
    // NOT the raw token (so a stored digest can't be replayed as the link).
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(hashToken(b));
    expect(hashToken(a)).not.toBe(a);
  });

  it("mints distinct account ids", () => {
    expect(generateAccountId()).not.toBe(generateAccountId());
    expect(generateAccountId().startsWith("u_")).toBe(true);
  });
});
