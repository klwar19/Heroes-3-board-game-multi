import { describe, expect, it } from "vitest";
import { AccountError } from "./types";
import {
  normalizeEmail,
  normalizeNicknameKey,
  validateContact,
  validateEmail,
  validateNickname,
  validatePassword
} from "./validation";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof AccountError ? error.code : "UNEXPECTED";
  }
  return "NO_THROW";
}

describe("account validation", () => {
  it("accepts and trims a valid nickname", () => {
    expect(validateNickname("  Sir  Christian ")).toBe("Sir Christian");
  });

  it("rejects nicknames that are too short, too long, or badly shaped", () => {
    expect(codeOf(() => validateNickname("ab"))).toBe("NICKNAME_INVALID");
    expect(codeOf(() => validateNickname("x".repeat(21)))).toBe("NICKNAME_INVALID");
    expect(codeOf(() => validateNickname("-leading"))).toBe("NICKNAME_INVALID");
    expect(codeOf(() => validateNickname("bad$char"))).toBe("NICKNAME_INVALID");
    expect(codeOf(() => validateNickname(42))).toBe("NICKNAME_INVALID");
  });

  it("normalizes the nickname uniqueness key (case + whitespace fold)", () => {
    expect(normalizeNicknameKey("Sir  Christian")).toBe(normalizeNicknameKey("sir christian"));
  });

  it("validates and lower-cases emails", () => {
    expect(validateEmail("  Binh@Example.COM ")).toBe("binh@example.com");
    expect(normalizeEmail(" A@B.io ")).toBe("a@b.io");
    expect(codeOf(() => validateEmail("no-at-sign"))).toBe("EMAIL_INVALID");
    expect(codeOf(() => validateEmail("a@b"))).toBe("EMAIL_INVALID");
    expect(codeOf(() => validateEmail("a b@c.io"))).toBe("EMAIL_INVALID");
  });

  it("enforces password strength (length + variety)", () => {
    expect(validatePassword("letters1")).toBe("letters1");
    expect(codeOf(() => validatePassword("short1"))).toBe("PASSWORD_WEAK");
    expect(codeOf(() => validatePassword("aaaaaaaa"))).toBe("PASSWORD_WEAK"); // no non-letter
    expect(codeOf(() => validatePassword("12345678"))).toBe("PASSWORD_WEAK"); // no letter
  });

  it("cleans contact fields and rejects malformed ones", () => {
    expect(validateContact({ discord: "  Binh#1234 ", extra: "ignored" } as unknown)).toEqual({ discord: "Binh#1234" });
    expect(validateContact(null)).toEqual({});
    expect(codeOf(() => validateContact({ discord: "x".repeat(201) }))).toBe("CONTACT_INVALID");
    expect(codeOf(() => validateContact({ note: 5 }))).toBe("CONTACT_INVALID");
  });
});
