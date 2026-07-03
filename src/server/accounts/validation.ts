/**
 * Pure, isomorphic account-input validation. No Node APIs — the client can run
 * the exact same checks for instant feedback, and the store runs them again as
 * the authority (never trust the client). Each failure carries a specific
 * `AccountErrorCode` so the UI shows the owner-required distinct messages.
 */
import { AccountError, type AccountContact } from "./types";

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
export const CONTACT_FIELD_MAX = 200;

/** Letters, digits, and a few name-safe separators; must start alphanumeric. */
const NICKNAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/;
// Deliberately pragmatic email shape: one @, no spaces, a dotted domain. Real
// deliverability is proven by the confirmation link, not by a regex.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Case-fold + collapse internal whitespace: the nickname uniqueness key. */
export function normalizeNicknameKey(nickname: string): string {
  return nickname.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Trim + lower-case: the email uniqueness key and stored form. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Returns the cleaned display nickname or throws NICKNAME_INVALID. */
export function validateNickname(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new AccountError("NICKNAME_INVALID", "Nickname is required.");
  }
  const nickname = raw.trim().replace(/\s+/g, " ");
  if (nickname.length < NICKNAME_MIN) {
    throw new AccountError("NICKNAME_INVALID", `Nickname must be at least ${NICKNAME_MIN} characters.`);
  }
  if (nickname.length > NICKNAME_MAX) {
    throw new AccountError("NICKNAME_INVALID", `Nickname must be at most ${NICKNAME_MAX} characters.`);
  }
  if (!NICKNAME_RE.test(nickname)) {
    throw new AccountError(
      "NICKNAME_INVALID",
      "Nickname may use letters, numbers, spaces and . _ - and must start with a letter or number."
    );
  }
  return nickname;
}

/** Returns the normalised email or throws EMAIL_INVALID. */
export function validateEmail(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new AccountError("EMAIL_INVALID", "Email is required.");
  }
  const email = normalizeEmail(raw);
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    throw new AccountError("EMAIL_INVALID", "Enter a valid email address.");
  }
  return email;
}

/** Returns the password unchanged (after checks) or throws PASSWORD_WEAK. */
export function validatePassword(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new AccountError("PASSWORD_WEAK", "Password is required.");
  }
  if (raw.length < PASSWORD_MIN) {
    throw new AccountError("PASSWORD_WEAK", `Password must be at least ${PASSWORD_MIN} characters.`);
  }
  if (raw.length > PASSWORD_MAX) {
    throw new AccountError("PASSWORD_WEAK", `Password must be at most ${PASSWORD_MAX} characters.`);
  }
  // Require a little variety without being obnoxious: at least one letter AND
  // one non-letter, so "password" passes but "aaaaaaaa"/"12345678" do not.
  if (!/[A-Za-z]/.test(raw) || !/[^A-Za-z]/.test(raw)) {
    throw new AccountError("PASSWORD_WEAK", "Password must include at least one letter and one number or symbol.");
  }
  return raw;
}

/** Validates + trims the optional contact block or throws CONTACT_INVALID. */
export function validateContact(raw: unknown): AccountContact {
  if (raw == null) {
    return {};
  }
  if (typeof raw !== "object") {
    throw new AccountError("CONTACT_INVALID", "Contact details are malformed.");
  }
  const input = raw as Record<string, unknown>;
  const contact: AccountContact = {};
  for (const key of ["discord", "facebook", "note"] as const) {
    const value = input[key];
    if (value == null || value === "") {
      continue;
    }
    if (typeof value !== "string") {
      throw new AccountError("CONTACT_INVALID", `Contact ${key} must be text.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > CONTACT_FIELD_MAX) {
      throw new AccountError("CONTACT_INVALID", `Contact ${key} is too long.`);
    }
    if (trimmed) {
      contact[key] = trimmed;
    }
  }
  return contact;
}
