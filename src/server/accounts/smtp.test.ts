import { createServer as createNetServer, type Server as NetServer, type Socket } from "node:net";
import { createServer as createTlsServer, TLSSocket, type Server as TlsServer } from "node:tls";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SmtpMailer, buildMimeMessage, bareAddress, dotStuff, smtpConfigFromEnv, type SmtpConfig } from "./smtp";
import { buildConfirmMail, type OutboundMail } from "./mailer";
import { AccountStore } from "./account-store";

/** Poll until `predicate` is true or the timeout elapses (for fire-and-forget sends). */
async function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for the SMTP delivery.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const FIXTURES = join(process.cwd(), "src/server/accounts/__fixtures__");
const CERT = readFileSync(join(FIXTURES, "test-smtp-cert.pem"), "utf8");
const KEY = readFileSync(join(FIXTURES, "test-smtp-key.pem"), "utf8");

/**
 * A minimal in-process SMTP server that records the whole conversation. It is
 * NOT a real MTA — it exists so the mailer's protocol logic (EHLO/STARTTLS/AUTH/
 * MAIL/RCPT/DATA, dot-stuffing, TLS upgrade) is exercised end-to-end offline.
 */
type MockOptions = {
  offerStartTls?: boolean;
  /** AUTH mechanisms to advertise, or false to advertise none. */
  offerAuth?: string | false;
  /** Reject the RCPT command with a 550 (delivery-failure path). */
  rejectRcpt?: boolean;
  /** Speak TLS from the first byte (implicit TLS / SMTPS). */
  implicitTls?: boolean;
};

type MockRecord = {
  commands: string[];
  mailFrom?: string;
  rcptTo: string[];
  authUser?: string;
  authPass?: string;
  authPlain?: { user: string; pass: string };
  message?: string;
  startTlsUsed: boolean;
  /** True once the message/AUTH arrived over an encrypted stream. */
  securedWhenReceived?: boolean;
};

type MockServer = { port: number; record: MockRecord; close: () => Promise<void> };

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

async function startMockSmtp(options: MockOptions = {}): Promise<MockServer> {
  const record: MockRecord = { commands: [], rcptTo: [], startTlsUsed: false };

  const serve = (stream: Socket | TLSSocket, isSecure: boolean, greet: boolean): void => {
    let buffer = "";
    let mode: "cmd" | "data" = "cmd";
    const dataLines: string[] = [];
    let authState: "user" | "pass" | null = null;
    stream.setEncoding("utf8");
    const send = (line: string): void => {
      stream.write(`${line}\r\n`);
    };

    const handleLine = (line: string): void => {
      if (mode === "data") {
        if (line === ".") {
          record.message = dataLines.join("\r\n");
          record.securedWhenReceived = isSecure;
          mode = "cmd";
          send("250 2.0.0 Ok: queued");
        } else {
          // Reverse SMTP dot-stuffing so the recorded body matches what was built.
          dataLines.push(line.startsWith("..") ? line.slice(1) : line);
        }
        return;
      }

      record.commands.push(line);
      const upper = line.toUpperCase();

      if (authState === "user") {
        record.authUser = Buffer.from(line, "base64").toString("utf8");
        authState = "pass";
        send(`334 ${b64("Password:")}`);
        return;
      }
      if (authState === "pass") {
        record.authPass = Buffer.from(line, "base64").toString("utf8");
        authState = null;
        send("235 2.7.0 Authentication successful");
        return;
      }

      if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
        const caps = ["mock.local greets you"];
        if (options.offerStartTls && !isSecure) {
          caps.push("STARTTLS");
        }
        if (options.offerAuth) {
          caps.push(`AUTH ${options.offerAuth}`);
        }
        caps.push("SIZE 10485760");
        const wire = caps.map((cap, index) => `250${index === caps.length - 1 ? " " : "-"}${cap}`).join("\r\n");
        stream.write(`${wire}\r\n`);
        return;
      }
      if (upper === "STARTTLS") {
        record.startTlsUsed = true;
        send("220 2.0.0 Ready to start TLS");
        stream.removeListener("data", onData);
        const secure = new TLSSocket(stream as Socket, { isServer: true, cert: CERT, key: KEY });
        secure.on("error", () => undefined);
        secure.on("secure", () => serve(secure, true, false));
        return;
      }
      if (upper.startsWith("AUTH LOGIN")) {
        authState = "user";
        send(`334 ${b64("Username:")}`);
        return;
      }
      if (upper.startsWith("AUTH PLAIN")) {
        const token = line.slice("AUTH PLAIN ".length);
        const parts = Buffer.from(token, "base64").toString("utf8").split("\0");
        record.authPlain = { user: parts[1], pass: parts[2] };
        send("235 2.7.0 Authentication successful");
        return;
      }
      if (upper.startsWith("MAIL FROM")) {
        record.mailFrom = line.slice(line.indexOf(":") + 1).trim();
        send("250 2.1.0 Ok");
        return;
      }
      if (upper.startsWith("RCPT TO")) {
        if (options.rejectRcpt) {
          send("550 5.1.1 No such recipient");
          return;
        }
        record.rcptTo.push(line.slice(line.indexOf(":") + 1).trim());
        send("250 2.1.5 Ok");
        return;
      }
      if (upper === "DATA") {
        mode = "data";
        send("354 End data with <CR><LF>.<CR><LF>");
        return;
      }
      if (upper === "QUIT") {
        send("221 2.0.0 Bye");
        stream.end();
        return;
      }
      send("502 5.5.2 Command not recognized");
    };

    const onData = (chunk: string): void => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleLine(line);
      }
    };

    stream.on("data", onData);
    stream.on("error", () => undefined);
    if (greet) {
      send("220 mock.local ESMTP ready");
    }
  };

  const server: NetServer | TlsServer = options.implicitTls
    ? createTlsServer({ cert: CERT, key: KEY }, (socket) => serve(socket, true, true))
    : createNetServer((socket) => serve(socket, false, true));

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    record,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

function baseConfig(port: number, overrides: Partial<SmtpConfig> = {}): SmtpConfig {
  return {
    host: "localhost",
    port,
    secure: false,
    requireTls: false,
    allowInsecureAuth: true,
    from: "Erathia Server <no-reply@erathia.io>",
    rejectUnauthorized: false,
    timeoutMs: 5000,
    ...overrides
  };
}

/** Decode the base64 MIME parts back to plaintext to inspect the body. */
function decodeMimeBodies(raw: string): string {
  const lines = raw.split("\r\n");
  let out = "";
  let phase: "idle" | "await-blank" | "collecting" = "idle";
  let pending = "";
  for (const line of lines) {
    if (/^Content-Transfer-Encoding:\s*base64/i.test(line)) {
      phase = "await-blank";
      continue;
    }
    if (phase === "await-blank") {
      if (line === "") {
        phase = "collecting";
      }
      continue;
    }
    if (phase === "collecting") {
      if (line.startsWith("--")) {
        out += Buffer.from(pending, "base64").toString("utf8");
        pending = "";
        phase = "idle";
      } else {
        pending += line;
      }
    }
  }
  if (pending) {
    out += Buffer.from(pending, "base64").toString("utf8");
  }
  return out;
}

const servers: MockServer[] = [];
afterEach(async () => {
  while (servers.length) {
    await servers.pop()!.close();
  }
});

async function mock(options?: MockOptions): Promise<MockServer> {
  const server = await startMockSmtp(options);
  servers.push(server);
  return server;
}

const CONFIRM: OutboundMail = buildConfirmMail(
  "roland@example.com",
  "https://erathia.example/api/auth/confirm?token=abc123",
  Date.UTC(2026, 6, 3, 10, 51, 0)
);

describe("SmtpMailer — protocol over a mock server", () => {
  it("delivers a message over plaintext: MAIL FROM, RCPT TO and the body reach the server", async () => {
    const server = await mock({ offerAuth: false });
    const mailer = new SmtpMailer(baseConfig(server.port));

    await mailer.sendMail(CONFIRM);

    expect(server.record.mailFrom).toBe("<no-reply@erathia.io>");
    expect(server.record.rcptTo).toEqual(["<roland@example.com>"]);
    expect(server.record.commands).toContain("DATA");
    expect(server.record.commands).toContain("QUIT");
    const body = decodeMimeBodies(server.record.message ?? "");
    expect(body).toContain("https://erathia.example/api/auth/confirm?token=abc123");
    // The From/To/Subject headers are present in the raw message.
    expect(server.record.message).toContain("From: Erathia Server <no-reply@erathia.io>");
    expect(server.record.message).toContain("To: roland@example.com");
    expect(server.record.message).toContain("Subject: Confirm your Heroes III Board Game account");
  });

  it("authenticates with AUTH LOGIN (base64 user + pass reach the server)", async () => {
    const server = await mock({ offerAuth: "LOGIN" });
    const mailer = new SmtpMailer(baseConfig(server.port, { auth: { user: "postmaster", pass: "s3cret-pw" } }));

    await mailer.sendMail(CONFIRM);

    expect(server.record.authUser).toBe("postmaster");
    expect(server.record.authPass).toBe("s3cret-pw");
    expect(server.record.rcptTo).toEqual(["<roland@example.com>"]);
  });

  it("authenticates with AUTH PLAIN when the server only offers PLAIN", async () => {
    const server = await mock({ offerAuth: "PLAIN" });
    const mailer = new SmtpMailer(baseConfig(server.port, { auth: { user: "mailer@erathia.io", pass: "hunter2!" } }));

    await mailer.sendMail(CONFIRM);

    expect(server.record.authPlain).toEqual({ user: "mailer@erathia.io", pass: "hunter2!" });
  });

  it("upgrades with STARTTLS and delivers over the encrypted channel", async () => {
    const server = await mock({ offerStartTls: true, offerAuth: "LOGIN" });
    const mailer = new SmtpMailer(
      baseConfig(server.port, {
        requireTls: true,
        allowInsecureAuth: false,
        rejectUnauthorized: true,
        ca: CERT,
        auth: { user: "postmaster", pass: "tls-only-pw" }
      })
    );

    await mailer.sendMail(CONFIRM);

    expect(server.record.startTlsUsed).toBe(true);
    // AUTH + message were received only AFTER the TLS upgrade.
    expect(server.record.authUser).toBe("postmaster");
    expect(server.record.authPass).toBe("tls-only-pw");
    expect(server.record.securedWhenReceived).toBe(true);
    expect(decodeMimeBodies(server.record.message ?? "")).toContain("token=abc123");
  });

  it("connects over implicit TLS (SMTPS) and delivers", async () => {
    const server = await mock({ implicitTls: true, offerAuth: "LOGIN" });
    const mailer = new SmtpMailer(
      baseConfig(server.port, {
        secure: true,
        requireTls: false,
        allowInsecureAuth: false,
        rejectUnauthorized: true,
        ca: CERT,
        auth: { user: "postmaster", pass: "smtps-pw" }
      })
    );

    await mailer.sendMail(CONFIRM);

    expect(server.record.securedWhenReceived).toBe(true);
    expect(server.record.rcptTo).toEqual(["<roland@example.com>"]);
    expect(server.record.authPass).toBe("smtps-pw");
  });

  it("rejects the send when the server refuses the recipient (RCPT 550)", async () => {
    const server = await mock({ offerAuth: false, rejectRcpt: true });
    const mailer = new SmtpMailer(baseConfig(server.port));

    await expect(mailer.sendMail(CONFIRM)).rejects.toThrow(/550|recipient/i);
    expect(server.record.message).toBeUndefined();
  });

  it("fails closed when TLS is required but the server does not offer STARTTLS", async () => {
    const server = await mock({ offerStartTls: false, offerAuth: false });
    const mailer = new SmtpMailer(baseConfig(server.port, { requireTls: true }));

    await expect(mailer.sendMail(CONFIRM)).rejects.toThrow(/STARTTLS|TLS is required/i);
  });

  it("refuses to send credentials over an unencrypted channel by default", async () => {
    const server = await mock({ offerAuth: "LOGIN" });
    const mailer = new SmtpMailer(
      baseConfig(server.port, { requireTls: false, allowInsecureAuth: false, auth: { user: "postmaster", pass: "x" } })
    );

    await expect(mailer.sendMail(CONFIRM)).rejects.toThrow(/unencrypted/i);
    expect(server.record.authUser).toBeUndefined();
  });
});

describe("AccountStore → SmtpMailer (the account flow delivers a real email)", () => {
  it("register() sends the confirmation link over SMTP to the registered address", async () => {
    const server = await mock({ offerAuth: false });
    const store = new AccountStore({
      mailer: new SmtpMailer(baseConfig(server.port)),
      baseUrl: "https://erathia.example"
    });

    const { confirmation } = store.register({ nickname: "Roland", email: "roland@erathia.io", password: "swordsman1" });

    // The store fires the send in the background; wait for the mock to receive it.
    await waitUntil(() => server.record.message !== undefined);
    const token = new URL(confirmation!.link).searchParams.get("token")!;
    expect(token).toBeTruthy();
    expect(server.record.rcptTo).toEqual(["<roland@erathia.io>"]);
    expect(decodeMimeBodies(server.record.message ?? "")).toContain(token);
  });
});

describe("buildMimeMessage", () => {
  it("builds a multipart/alternative message with both text and html parts", () => {
    const message = buildMimeMessage(CONFIRM, "Erathia Server <no-reply@erathia.io>");
    expect(message).toContain("MIME-Version: 1.0");
    expect(message).toContain("multipart/alternative");
    expect(message).toMatch(/Content-Type: text\/plain; charset=utf-8/);
    expect(message).toMatch(/Content-Type: text\/html; charset=utf-8/);
    // Uses CRLF line endings.
    expect(message.includes("\r\n")).toBe(true);
    // Deterministic Date derived from sentAt (not Date.now()).
    expect(message).toContain("Date: Fri, 03 Jul 2026 10:51:00 +0000");
  });

  it("never emits a raw single-dot line (base64 bodies are transparent)", () => {
    const message = buildMimeMessage(CONFIRM, "no-reply@erathia.io");
    for (const line of message.split("\r\n")) {
      if (line.startsWith(".")) {
        expect(line.startsWith("..")).toBe(true);
      }
    }
  });
});

describe("dotStuff (SMTP transparency, RFC 5321 §4.5.2)", () => {
  it("doubles a leading dot and leaves other lines untouched", () => {
    const stuffed = dotStuff([".hidden", "..already", "normal", ".", "text.with.dots"].join("\r\n"));
    expect(stuffed.split("\r\n")).toEqual(["..hidden", "...already", "normal", "..", "text.with.dots"]);
  });
});

describe("bareAddress", () => {
  it("extracts the address from a display-name form", () => {
    expect(bareAddress("Erathia Server <no-reply@erathia.io>")).toBe("no-reply@erathia.io");
    expect(bareAddress("plain@erathia.io")).toBe("plain@erathia.io");
  });
});

describe("smtpConfigFromEnv", () => {
  it("returns null when no host is configured", () => {
    expect(smtpConfigFromEnv({})).toBeNull();
  });

  it("derives sensible defaults (STARTTLS required on 587, implicit TLS on 465)", () => {
    const submission = smtpConfigFromEnv({ HOMM3BG_SMTP_HOST: "smtp.erathia.io" })!;
    expect(submission.port).toBe(587);
    expect(submission.secure).toBe(false);
    expect(submission.requireTls).toBe(true);

    const smtps = smtpConfigFromEnv({ HOMM3BG_SMTP_HOST: "smtp.erathia.io", HOMM3BG_SMTP_SECURE: "1" })!;
    expect(smtps.port).toBe(465);
    expect(smtps.secure).toBe(true);
  });

  it("reads credentials and sender", () => {
    const config = smtpConfigFromEnv({
      HOMM3BG_SMTP_HOST: "smtp.erathia.io",
      HOMM3BG_SMTP_USER: "postmaster@erathia.io",
      HOMM3BG_SMTP_PASS: "pw",
      HOMM3BG_SMTP_FROM: "Erathia <no-reply@erathia.io>"
    })!;
    expect(config.auth).toEqual({ user: "postmaster@erathia.io", pass: "pw" });
    expect(config.from).toBe("Erathia <no-reply@erathia.io>");
  });
});
