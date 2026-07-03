/**
 * HTTP-API mail transport — for deployments where outbound SMTP ports are
 * blocked (Vercel and most serverless hosts) so the `SmtpMailer` cannot connect.
 * It POSTs the message to a JSON email API. The default shape matches Resend
 * (`POST https://api.resend.com/emails`, `Authorization: Bearer <key>`,
 * `{from,to,subject,html,text}`), which SendGrid-v3-lite, Mailchannels and
 * Postmark-compatible gateways also accept; the URL and key are configurable.
 *
 * Uses the global `fetch` (Node 18+ / Next runtime) — no dependency — so it is
 * tested offline by stubbing fetch (see http-mailer.test.ts).
 */
import type { Mailer, OutboundMail } from "./mailer";

export type HttpMailerConfig = {
  /** Full endpoint URL (default Resend's). */
  endpoint: string;
  /** Bearer API key. */
  apiKey: string;
  /** From-header sender ("Name <addr@x>" or a bare address). */
  from: string;
  /** Request timeout (ms). Default 20s. */
  timeoutMs: number;
};

export class HttpMailerError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "HttpMailerError";
    this.status = status;
  }
}

export class HttpApiMailer implements Mailer {
  constructor(private readonly config: HttpMailerConfig) {}

  sendMail(mail: OutboundMail): Promise<void> {
    return this.deliver(mail);
  }

  private async deliver(mail: OutboundMail): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new HttpMailerError(
          `Email API rejected the ${mail.kind} message (${response.status}): ${detail.slice(0, 300)}`,
          response.status
        );
      }
      // Drain the body so the connection is released; content is not needed.
      await response.text().catch(() => "");
    } catch (error) {
      if (error instanceof HttpMailerError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new HttpMailerError("Email API request timed out.");
      }
      throw new HttpMailerError(`Email API request failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Build an HttpMailerConfig from the environment, or null when no HTTP email API
 * is configured (no API key present).
 */
export function httpMailerConfigFromEnv(env: Record<string, string | undefined> = process.env): HttpMailerConfig | null {
  const apiKey = (env.HOMM3BG_MAIL_API_KEY ?? env.HOMM3BG_RESEND_API_KEY)?.trim();
  if (!apiKey) {
    return null;
  }
  const endpoint = env.HOMM3BG_MAIL_API_URL?.trim() || "https://api.resend.com/emails";
  const from = env.HOMM3BG_MAIL_FROM?.trim() || env.HOMM3BG_SMTP_FROM?.trim() || "no-reply@localhost";
  return {
    endpoint,
    apiKey,
    from,
    timeoutMs: Number(env.HOMM3BG_MAIL_TIMEOUT_MS) || 20_000
  };
}
