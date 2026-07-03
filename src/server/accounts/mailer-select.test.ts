import { describe, expect, it } from "vitest";
import { CaptureMailer, ConsoleMailer, createMailerFromEnv } from "./mailer";
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
});
