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
 *    nowhere). Also what the store uses when no SMTP is configured.
 *  - ConsoleMailer — logs to stdout (useful for a real dev server).
 *
 * SMTP is intentionally NOT implemented here: a real transport needs a network
 * server we cannot exercise in this repo's offline test suite, so shipping it
 * untested would violate CLAUDE.md rule 1. `createMailerFromEnv` documents the
 * exact swap point; wiring nodemailer/Resend there is the production task.
 */

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
 * Build the mailer for the running server from env. Today this returns a
 * ConsoleMailer (real link on the server console) or a CaptureMailer; a future
 * `SMTP_URL`/Resend branch plugs in here with zero changes elsewhere.
 */
export function createMailerFromEnv(): Mailer {
  if (process.env.HOMM3BG_MAIL_TRANSPORT === "capture") {
    return new CaptureMailer();
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
