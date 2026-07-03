import { describe, expect, it } from "vitest";
import { CaptureMailer, ConsoleMailer, createMailerFromEnv, shouldAutoConfirmAccounts } from "./mailer";
import { SmtpMailer } from "./smtp";
import { HttpApiMailer } from "./http-mailer";

describe("createMailerFromEnv — transport selection", () => {
  it("honours an explicit capture / console choice", () => {
    expect(createMailerFromEnv({ HOMM3BG_MAIL_TRANSPORT: "capture" })).toBeInstanceOf(CaptureMailer);
    expect(createMailerFromEnv({ HOMM3BG_MAIL_TRANSPORT: "console" })).toBeInstanceOf(ConsoleMailer);
  });

  it("defaults to the console mailer when nothing is configured", () => {
    expect(createMailerFromEnv({})).toBeInstanceOf(ConsoleMailer);
  });

  it("auto-selects SMTP when a host is set, HTTP when only an API key is set", () => {
    expect(createMailerFromEnv({ HOMM3BG_SMTP_HOST: "smtp.erathia.io" })).toBeInstanceOf(SmtpMailer);
    expect(createMailerFromEnv({ HOMM3BG_MAIL_API_KEY: "re_key" })).toBeInstanceOf(HttpApiMailer);
  });

  it("prefers SMTP over HTTP when both are configured", () => {
    const mailer = createMailerFromEnv({ HOMM3BG_SMTP_HOST: "smtp.erathia.io", HOMM3BG_MAIL_API_KEY: "re_key" });
    expect(mailer).toBeInstanceOf(SmtpMailer);
  });

  it("honours an explicit smtp / http request", () => {
    expect(createMailerFromEnv({ HOMM3BG_MAIL_TRANSPORT: "smtp", HOMM3BG_SMTP_HOST: "smtp.erathia.io" })).toBeInstanceOf(
      SmtpMailer
    );
    expect(createMailerFromEnv({ HOMM3BG_MAIL_TRANSPORT: "resend", HOMM3BG_MAIL_API_KEY: "re_key" })).toBeInstanceOf(
      HttpApiMailer
    );
  });

  it("falls back to console (never silently drops mail) when a requested transport is unconfigured", () => {
    expect(createMailerFromEnv({ HOMM3BG_MAIL_TRANSPORT: "smtp" })).toBeInstanceOf(ConsoleMailer);
    expect(createMailerFromEnv({ HOMM3BG_MAIL_TRANSPORT: "http" })).toBeInstanceOf(ConsoleMailer);
  });

  it("marks which transports actually DELIVER mail", () => {
    expect(new CaptureMailer().delivers).toBe(false);
    expect(new ConsoleMailer().delivers).toBe(false);
    expect(createMailerFromEnv({ HOMM3BG_SMTP_HOST: "smtp.erathia.io" }).delivers).toBe(true);
    expect(createMailerFromEnv({ HOMM3BG_MAIL_API_KEY: "re_key" }).delivers).toBe(true);
  });
});

describe("shouldAutoConfirmAccounts — the no-mailer confirmation policy", () => {
  it("production with NO delivering mailer auto-confirms (players are never stranded)", () => {
    expect(shouldAutoConfirmAccounts(false, { NODE_ENV: "production" })).toBe(true);
  });

  it("CONTROL: a delivering mailer keeps real email verification in production", () => {
    expect(shouldAutoConfirmAccounts(true, { NODE_ENV: "production" })).toBe(false);
  });

  it("dev/test without a mailer still requires confirmation (the link is observable locally)", () => {
    expect(shouldAutoConfirmAccounts(false, { NODE_ENV: "test" })).toBe(false);
    expect(shouldAutoConfirmAccounts(false, {})).toBe(false);
  });

  it("HOMM3BG_REQUIRE_EMAIL_CONFIRMATION overrides in both directions", () => {
    expect(shouldAutoConfirmAccounts(true, { NODE_ENV: "production", HOMM3BG_REQUIRE_EMAIL_CONFIRMATION: "0" })).toBe(true);
    expect(shouldAutoConfirmAccounts(false, { NODE_ENV: "production", HOMM3BG_REQUIRE_EMAIL_CONFIRMATION: "1" })).toBe(false);
  });
});
