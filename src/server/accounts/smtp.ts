/**
 * Real SMTP transport for the account mailer — Node's built-in `net`/`tls` only,
 * no external dependency, works offline and is fully testable against an
 * in-process mock SMTP server (see smtp.test.ts). This is the production swap
 * point `createMailerFromEnv()` documents: with SMTP env configured, the
 * confirmation / reset emails are actually DELIVERED over the wire instead of
 * logged to the console.
 *
 * Supported:
 *  - implicit TLS (SMTPS, usually port 465) and opportunistic/required STARTTLS
 *    (usually 587) — the credential + message never leave in the clear unless a
 *    trusted-relay operator explicitly opts in (`allowInsecureAuth`).
 *  - ESMTP EHLO capability parsing, AUTH LOGIN and AUTH PLAIN.
 *  - a correct RFC 5322 multipart/alternative (text + html) body with SMTP
 *    dot-stuffing and CRLF line endings.
 *
 * Kept deliberately small: one short-lived connection per message (no pooling —
 * the account flow sends at most one mail per request), a promise-based reader
 * for SMTP's multi-line replies, and a strict "no secrets over plaintext" guard.
 */
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type ConnectionOptions, type TLSSocket } from "node:tls";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import type { Mailer, OutboundMail } from "./mailer";

export type SmtpConfig = {
  host: string;
  port: number;
  /** Implicit TLS from the first byte (SMTPS, usually port 465). */
  secure: boolean;
  /**
   * When NOT `secure`: upgrade the plaintext connection with STARTTLS before
   * sending anything sensitive. Default true. A server that does not advertise
   * STARTTLS is then refused (fail closed) unless `allowInsecureAuth` is set for
   * a trusted local relay.
   */
  requireTls: boolean;
  /**
   * Allow AUTH / message delivery over an unencrypted channel. Default FALSE —
   * credentials are never put on the wire in the clear. Set true ONLY for a
   * trusted relay on a private network (a localhost / sidecar MTA), which is
   * also what the offline plaintext test exercises.
   */
  allowInsecureAuth: boolean;
  auth?: { user: string; pass: string };
  /** Envelope + From-header sender ("Name <addr@x>" or a bare address). */
  from: string;
  /** Verify the server certificate chain (default true). */
  rejectUnauthorized: boolean;
  /** Extra trusted CA (PEM) — used by the offline TLS test's self-signed cert. */
  ca?: string;
  /** Per-step socket timeout (ms). Default 20s. */
  timeoutMs: number;
};

/** A parsed SMTP reply: the status code plus every line's text. */
type SmtpReply = { code: number; lines: string[]; text: string };

export class SmtpError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "SmtpError";
    this.code = code;
  }
}

/**
 * One SMTP conversation over a single socket. Buffers incoming bytes and hands
 * out complete (multi-line) replies via `readReply()`; `command()` writes a
 * line and asserts the reply code.
 */
class SmtpConversation {
  /** The active stream — swapped from the plain socket to the TLS socket on STARTTLS. */
  private stream: Socket | TLSSocket;
  private buffer = "";
  /** Lines accumulated for the reply currently being parsed. */
  private replyLines: string[] = [];
  /** Fully parsed replies waiting to be consumed. */
  private readonly ready: SmtpReply[] = [];
  private waiter: { resolve: (r: SmtpReply) => void; reject: (e: Error) => void } | null = null;
  /** Set once the socket errors or closes early; every later read rejects with it. */
  private fatal: Error | null = null;

  constructor(
    stream: Socket | TLSSocket,
    private readonly config: SmtpConfig
  ) {
    this.stream = stream;
    this.attach(stream);
  }

  private attach(stream: Socket | TLSSocket): void {
    stream.setEncoding("utf8");
    stream.setTimeout(this.config.timeoutMs);
    stream.on("data", this.onData);
    stream.on("error", this.onError);
    stream.on("close", this.onClose);
    stream.on("timeout", this.onTimeout);
  }

  private detach(stream: Socket | TLSSocket): void {
    stream.off("data", this.onData);
    stream.off("error", this.onError);
    stream.off("close", this.onClose);
    stream.off("timeout", this.onTimeout);
  }

  private onData = (chunk: string): void => {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\r\n")) !== -1) {
      const line = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const match = /^(\d{3})([ -]?)(.*)$/.exec(line);
      if (!match) {
        this.fail(new SmtpError(`Malformed SMTP reply line: ${JSON.stringify(line)}`));
        return;
      }
      this.replyLines.push(match[3]);
      // A space (or bare code) after the number ends a reply; "-" continues it.
      if (match[2] !== "-") {
        const reply: SmtpReply = {
          code: Number(match[1]),
          lines: this.replyLines.slice(),
          text: this.replyLines.join("\n")
        };
        this.replyLines = [];
        if (this.waiter) {
          const waiter = this.waiter;
          this.waiter = null;
          waiter.resolve(reply);
        } else {
          this.ready.push(reply);
        }
      }
    }
  };

  private onError = (error: Error): void => this.fail(error instanceof Error ? error : new SmtpError(String(error)));
  private onClose = (): void => this.fail(new SmtpError("SMTP connection closed before the exchange finished."));
  private onTimeout = (): void => {
    this.stream.destroy();
    this.fail(new SmtpError("SMTP connection timed out."));
  };

  private fail(error: Error): void {
    if (this.fatal) {
      return;
    }
    this.fatal = error;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter.reject(error);
    }
  }

  /** Resolve with the next complete reply (or one already buffered). */
  readReply(): Promise<SmtpReply> {
    const queued = this.ready.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    if (this.fatal) {
      return Promise.reject(this.fatal);
    }
    return new Promise<SmtpReply>((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  private write(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.write(data, (error) => (error ? reject(error) : resolve()));
    });
  }

  /** Write a command line and assert the reply's code passes `ok`. */
  async command(line: string, ok: (code: number) => boolean, label = line): Promise<SmtpReply> {
    await this.write(`${line}\r\n`);
    const reply = await this.readReply();
    if (!ok(reply.code)) {
      throw new SmtpError(`SMTP server rejected ${label}: ${reply.code} ${reply.text}`, reply.code);
    }
    return reply;
  }

  /** Send the DATA payload (already dot-stuffed) followed by the end marker. */
  async writeBody(payload: string): Promise<SmtpReply> {
    await this.write(payload);
    await this.write("\r\n.\r\n");
    const reply = await this.readReply();
    if (reply.code !== 250) {
      throw new SmtpError(`SMTP server did not accept the message: ${reply.code} ${reply.text}`, reply.code);
    }
    return reply;
  }

  /** Upgrade the plaintext socket to TLS in place (STARTTLS). */
  async upgradeToTls(): Promise<void> {
    const plain = this.stream as Socket;
    this.detach(plain);
    this.buffer = "";
    this.replyLines = [];
    const options: ConnectionOptions = {
      socket: plain,
      servername: this.config.host,
      rejectUnauthorized: this.config.rejectUnauthorized,
      ...(this.config.ca ? { ca: this.config.ca } : {})
    };
    const secured = await new Promise<TLSSocket>((resolve, reject) => {
      const tlsSocket = tlsConnect(options, () => resolve(tlsSocket));
      tlsSocket.once("error", reject);
    });
    this.stream = secured;
    this.attach(secured);
  }

  close(): void {
    try {
      this.detach(this.stream);
      this.stream.destroy();
    } catch {
      /* already gone */
    }
  }
}

/** Open a socket (plain or implicit-TLS) and wait for the 220 greeting. */
async function openConversation(config: SmtpConfig): Promise<SmtpConversation> {
  const socket: Socket | TLSSocket = config.secure
    ? tlsConnect({
        host: config.host,
        port: config.port,
        servername: config.host,
        rejectUnauthorized: config.rejectUnauthorized,
        ...(config.ca ? { ca: config.ca } : {})
      })
    : netConnect({ host: config.host, port: config.port });

  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("error", onError);
      socket.off(config.secure ? "secureConnect" : "connect", onConnect);
    };
    socket.setTimeout(config.timeoutMs);
    socket.once(config.secure ? "secureConnect" : "connect", onConnect);
    socket.once("error", onError);
  });

  const conversation = new SmtpConversation(socket, config);
  const greeting = await conversation.readReply();
  if (greeting.code !== 220) {
    conversation.close();
    throw new SmtpError(`Unexpected SMTP greeting: ${greeting.code} ${greeting.text}`, greeting.code);
  }
  return conversation;
}

/** Case-insensitive scan of the EHLO capability lines for a keyword. */
function ehloHas(reply: SmtpReply, keyword: string): boolean {
  return reply.lines.some((line) => line.toUpperCase().startsWith(keyword.toUpperCase()));
}

/** Which AUTH mechanisms the server advertised (e.g. "LOGIN", "PLAIN"). */
function advertisedAuthMechanisms(reply: SmtpReply): string[] {
  const line = reply.lines.find((entry) => entry.toUpperCase().startsWith("AUTH "));
  return line
    ? line
        .slice("AUTH ".length)
        .trim()
        .split(/\s+/)
        .map((mechanism) => mechanism.toUpperCase())
    : [];
}

/** Extract the bare `addr@domain` from a "Display Name <addr@domain>" string. */
export function bareAddress(from: string): string {
  const angled = /<([^>]+)>/.exec(from);
  return (angled ? angled[1] : from).trim();
}

/** RFC 5322 date from an epoch-ms stamp (deterministic — no `Date.now()`). */
function rfc5322Date(epochMs: number): string {
  // toUTCString → "Wed, 03 Jul 2026 10:51:00 GMT"; RFC 5322 wants a numeric zone.
  return new Date(epochMs).toUTCString().replace(/GMT$/, "+0000");
}

/** RFC 2047 encode a header value only if it carries non-ASCII characters. */
function encodeHeaderValue(value: string): string {
  // Plain ASCII (no code point >= 0x80) passes through unchanged.
  if (!/[\u0080-\uffff]/.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Base64 a body part in fixed 76-char lines (RFC 2045). */
function base64Body(value: string): string {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return encoded.replace(/(.{76})/g, "$1\r\n");
}

/**
 * Build the full RFC 5322 message (headers + multipart/alternative body) for an
 * OutboundMail. Base64 bodies sidestep line-length limits and never produce a
 * lone leading dot, but the whole payload is still dot-stuffed for correctness.
 */
export function buildMimeMessage(mail: OutboundMail, from: string): string {
  const boundary = `=_h3bg_${randomBytes(12).toString("hex")}`;
  const messageId = `<${randomBytes(16).toString("hex")}@${bareAddress(from).split("@")[1] ?? "localhost"}>`;
  const headers = [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeaderValue(mail.subject)}`,
    `Date: ${rfc5322Date(mail.sentAt)}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(mail.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Body(mail.html),
    `--${boundary}--`,
    ""
  ];
  const raw = `${headers.join("\r\n")}\r\n\r\n${body.join("\r\n")}`;
  return dotStuff(raw);
}

/** SMTP transparency: a line that begins with "." gets an extra "." (RFC 5321 §4.5.2). */
export function dotStuff(message: string): string {
  return message
    .split(/\r\n/)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

/**
 * A Mailer that delivers over real SMTP. `sendMail` returns a promise; the
 * account store guards it (a failed send is logged, never crashes the request),
 * and tests await it to assert the exchange against a mock server.
 */
export class SmtpMailer implements Mailer {
  readonly delivers = true;
  constructor(private readonly config: SmtpConfig) {}

  sendMail(mail: OutboundMail): Promise<void> {
    return this.deliver(mail);
  }

  private async deliver(mail: OutboundMail): Promise<void> {
    const conversation = await openConversation(this.config);
    try {
      const localName = safeHostname();
      let ehlo = await conversation.command(`EHLO ${localName}`, (code) => code === 250);

      let encrypted = this.config.secure;
      if (!encrypted) {
        if (ehloHas(ehlo, "STARTTLS")) {
          await conversation.command("STARTTLS", (code) => code === 220);
          await conversation.upgradeToTls();
          ehlo = await conversation.command(`EHLO ${localName}`, (code) => code === 250);
          encrypted = true;
        } else if (this.config.requireTls) {
          throw new SmtpError("SMTP server does not offer STARTTLS but TLS is required.");
        }
      }

      if (this.config.auth) {
        if (!encrypted && !this.config.allowInsecureAuth) {
          throw new SmtpError("Refusing to send SMTP credentials over an unencrypted connection.");
        }
        await this.authenticate(conversation, ehlo, this.config.auth);
      }

      await conversation.command(`MAIL FROM:<${bareAddress(this.config.from)}>`, (code) => code === 250);
      await conversation.command(`RCPT TO:<${bareAddress(mail.to)}>`, (code) => code === 250 || code === 251);
      await conversation.command("DATA", (code) => code === 354);
      await conversation.writeBody(buildMimeMessage(mail, this.config.from));
      // Best-effort polite close; a QUIT hiccup after a 250-accepted message
      // must not report the delivery as failed.
      await conversation.command("QUIT", () => true).catch(() => undefined);
    } finally {
      conversation.close();
    }
  }

  private async authenticate(
    conversation: SmtpConversation,
    ehlo: SmtpReply,
    auth: { user: string; pass: string }
  ): Promise<void> {
    const mechanisms = advertisedAuthMechanisms(ehlo);
    const prefersLogin = mechanisms.length === 0 || mechanisms.includes("LOGIN");
    if (prefersLogin) {
      await conversation.command("AUTH LOGIN", (code) => code === 334);
      await conversation.command(Buffer.from(auth.user, "utf8").toString("base64"), (code) => code === 334, "AUTH username");
      await conversation.command(Buffer.from(auth.pass, "utf8").toString("base64"), (code) => code === 235, "AUTH password");
      return;
    }
    if (mechanisms.includes("PLAIN")) {
      // RFC 4616: authzid \0 authcid \0 passwd, base64-encoded (empty authzid).
      const token = Buffer.from(`\0${auth.user}\0${auth.pass}`, "utf8").toString("base64");
      await conversation.command(`AUTH PLAIN ${token}`, (code) => code === 235, "AUTH PLAIN");
      return;
    }
    throw new SmtpError(`SMTP server offers no supported AUTH mechanism (advertised: ${mechanisms.join(", ") || "none"}).`);
  }
}

/** A syntactically valid EHLO argument even on hosts with an odd hostname. */
function safeHostname(): string {
  const name = hostname();
  return /^[A-Za-z0-9.-]+$/.test(name) ? name : "localhost";
}

/**
 * Build an SmtpConfig from the environment, or return null when SMTP is not
 * configured (host missing). Called by createMailerFromEnv.
 */
export function smtpConfigFromEnv(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const host = env.HOMM3BG_SMTP_HOST?.trim();
  if (!host) {
    return null;
  }
  const secure = parseBool(env.HOMM3BG_SMTP_SECURE) ?? false;
  const port = Number(env.HOMM3BG_SMTP_PORT) || (secure ? 465 : 587);
  const user = env.HOMM3BG_SMTP_USER?.trim();
  const pass = env.HOMM3BG_SMTP_PASS;
  const from = env.HOMM3BG_SMTP_FROM?.trim() || env.HOMM3BG_MAIL_FROM?.trim() || user || "no-reply@localhost";
  return {
    host,
    port,
    secure,
    requireTls: parseBool(env.HOMM3BG_SMTP_REQUIRE_TLS) ?? !secure,
    allowInsecureAuth: parseBool(env.HOMM3BG_SMTP_ALLOW_INSECURE_AUTH) ?? false,
    auth: user && pass ? { user, pass } : undefined,
    from,
    rejectUnauthorized: parseBool(env.HOMM3BG_SMTP_REJECT_UNAUTHORIZED) ?? true,
    timeoutMs: Number(env.HOMM3BG_SMTP_TIMEOUT_MS) || 20_000
  };
}

function parseBool(value: string | undefined): boolean | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return /^(1|true|yes|on)$/i.test(value.trim());
}
