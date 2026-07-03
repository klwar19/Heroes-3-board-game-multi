/**
 * Pluggable mailer — the "mail linking" seam. The account store never talks to
 * a mail transport directly; it holds a `Mailer` and calls `sendMail`. This
 * makes the confirmation/reset flow fully testable (assert the captured link)
 * and lets production swap in real SMTP by configuration, not a code change —
 * the same "one interface, swappable backend" shape as the room transport.
 *
 * Shipped implementations:
 *  - CaptureMailer — keeps sent messages in memory; the default in dev/CI/tests
 *    so a confirmation link is observable (and so nothing is silently "sent" to
 *    nowhere).
 *  - ConsoleMailer — logs the link to stdout (useful for a real dev server).
 *  - SmtpMailer (smtp.ts) — a real, zero-dependency SMTP client. Configured with
 *    HOMM3BG_SMTP_* it DELIVERS the confirmation/reset mail over the wire.
 *  - HttpApiMailer (http-mailer.ts) — a real HTTP email-API client (Resend-shaped
 *    by default) for serverless hosts where outbound SMTP is blocked.
 *
 * `createMailerFromEnv` picks the transport from the environment (see below).
 * Both real transports are exercised offline — the SMTP one against an in-process
 * mock server, the HTTP one against a stubbed fetch — so they meet CLAUDE.md
 * rule 1 (the code runs and a test fails if the logic is removed).
 */
import { SmtpMailer, smtpConfigFromEnv } from "./smtp";
import { HttpApiMailer, httpMailerConfigFromEnv } from "./http-mailer";

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** A machine tag so tests/dev can find the relevant mail without parsing. */
  kind: "confirm" | "reset";
  /** The action link embedded in the mail (also parseable from text/html). */
  link: string;
  /** Epoch ms the mail was produced. */
  sentAt: number;
};

export interface Mailer {
  sendMail(mail: OutboundMail): Promise<void> | void;
}

/** In-memory mailer: the store's default. Tests/dev read `outbox`. */
export class CaptureMailer implements Mailer {
  readonly outbox: OutboundMail[] = [];
  sendMail(mail: OutboundMail): void {
    this.outbox.push(mail);
  }
  /** Most recent mail of a kind sent to an address (the live confirm/reset link). */
  latestFor(to: string, kind: OutboundMail["kind"]): OutboundMail | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i -= 1) {
      const mail = this.outbox[i];
      if (mail.to === to && mail.kind === kind) {
        return mail;
      }
    }
    return undefined;
  }
  clear(): void {
    this.outbox.length = 0;
  }
}

/** Logs to stdout — for a real dev server where you read the link off the console. */
export class ConsoleMailer implements Mailer {
  sendMail(mail: OutboundMail): void {
    console.log(`[mail:${mail.kind}] to=${mail.to} link=${mail.link}`);
  }
}

/**
 * Build the mailer for the running server from env.
 *
 * `HOMM3BG_MAIL_TRANSPORT` picks the transport explicitly:
 *  - "capture" — in-memory (dev echo / tests).
 *  - "console" — log the link to stdout (`next dev`).
 *  - "smtp"    — real SMTP; needs HOMM3BG_SMTP_HOST (+ port/user/pass/from).
 *  - "http" / "resend" — real HTTP API; needs HOMM3BG_MAIL_API_KEY (+ from).
 *
 * With it UNSET, a real transport is auto-selected when its config is present:
 * SMTP if HOMM3BG_SMTP_HOST is set, otherwise the HTTP API if a key is set,
 * otherwise the console mailer (so a bare `next dev` still shows the link). A
 * transport explicitly requested but left unconfigured falls back to the console
 * with a warning rather than silently dropping mail.
 */
export function createMailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  const transport = env.HOMM3BG_MAIL_TRANSPORT?.trim().toLowerCase();
  if (transport === "capture") {
    return new CaptureMailer();
  }
  if (transport === "console") {
    return new ConsoleMailer();
  }
  if (transport === "http" || transport === "resend") {
    const config = httpMailerConfigFromEnv(env);
    if (config) {
      return new HttpApiMailer(config);
    }
    console.warn("[mail] HTTP transport requested but HOMM3BG_MAIL_API_KEY is missing — falling back to console.");
    return new ConsoleMailer();
  }
  if (transport === "smtp") {
    const config = smtpConfigFromEnv(env);
    if (config) {
      return new SmtpMailer(config);
    }
    console.warn("[mail] SMTP transport requested but HOMM3BG_SMTP_HOST is missing — falling back to console.");
    return new ConsoleMailer();
  }

  // No explicit choice: use whichever real transport is configured.
  const smtp = smtpConfigFromEnv(env);
  if (smtp) {
    return new SmtpMailer(smtp);
  }
  const http = httpMailerConfigFromEnv(env);
  if (http) {
    return new HttpApiMailer(http);
  }
  // Default: log the link so a dev running `next dev` can follow it.
  return new ConsoleMailer();
}

/** Human copy for the two mails, with the link woven into text and html. */
export function buildConfirmMail(to: string, link: string, sentAt: number): OutboundMail {
  const subject = "Confirm your Heroes III Board Game account";
  const text =
    `Welcome to the Erathia server!\n\n` +
    `Confirm your account by opening this link:\n${link}\n\n` +
    `If you did not create an account you can ignore this email.`;
  const html =
    `<p>Welcome to the Erathia server!</p>` +
    `<p>Confirm your account by opening this link:</p>` +
    `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` +
    `<p>If you did not create an account you can ignore this email.</p>`;
  return { to, subject, text, html, kind: "confirm", link, sentAt };
}

export function buildResetMail(to: string, link: string, sentAt: number): OutboundMail {
  const subject = "Reset your Heroes III Board Game password";
  const text =
    `A password reset was requested for your account.\n\n` +
    `Set a new password with this link:\n${link}\n\n` +
    `If you did not request this you can ignore this email; your password is unchanged.`;
  const html =
    `<p>A password reset was requested for your account.</p>` +
    `<p>Set a new password with this link:</p>` +
    `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>` +
    `<p>If you did not request this you can ignore this email; your password is unchanged.</p>`;
  return { to, subject, text, html, kind: "reset", link, sentAt };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
