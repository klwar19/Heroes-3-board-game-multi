import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpApiMailer, HttpMailerError, httpMailerConfigFromEnv } from "./http-mailer";
import { buildConfirmMail, type OutboundMail } from "./mailer";

const CONFIRM: OutboundMail = buildConfirmMail(
  "roland@example.com",
  "https://erathia.example/api/auth/confirm?token=abc123",
  Date.UTC(2026, 6, 3, 10, 51, 0)
);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HttpApiMailer", () => {
  it("POSTs the message to the endpoint with the bearer key and Resend-shaped body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const mailer = new HttpApiMailer({
      endpoint: "https://api.resend.com/emails",
      apiKey: "re_test_key",
      from: "Erathia <no-reply@erathia.io>",
      timeoutMs: 5000
    });
    await mailer.sendMail(CONFIRM);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(init.body as string) as { from: string; to: string[]; subject: string; html: string; text: string };
    expect(body.from).toBe("Erathia <no-reply@erathia.io>");
    expect(body.to).toEqual(["roland@example.com"]);
    expect(body.subject).toBe("Confirm your Heroes III Board Game account");
    expect(body.html).toContain("https://erathia.example/api/auth/confirm?token=abc123");
    expect(body.text).toContain("https://erathia.example/api/auth/confirm?token=abc123");
  });

  it("rejects with the status when the API returns a non-2xx", async () => {
    const fetchMock = vi.fn(async () => new Response("forbidden: bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const mailer = new HttpApiMailer({
      endpoint: "https://api.resend.com/emails",
      apiKey: "re_bad",
      from: "no-reply@erathia.io",
      timeoutMs: 5000
    });

    await expect(mailer.sendMail(CONFIRM)).rejects.toBeInstanceOf(HttpMailerError);
    await expect(mailer.sendMail(CONFIRM)).rejects.toThrow(/401/);
  });

  it("wraps a network failure in an HttpMailerError", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    vi.stubGlobal("fetch", fetchMock);

    const mailer = new HttpApiMailer({ endpoint: "https://x", apiKey: "k", from: "a@b", timeoutMs: 5000 });
    await expect(mailer.sendMail(CONFIRM)).rejects.toThrow(/ECONNREFUSED|request failed/i);
  });
});

describe("httpMailerConfigFromEnv", () => {
  it("returns null without an API key", () => {
    expect(httpMailerConfigFromEnv({})).toBeNull();
  });

  it("reads the key, defaults the endpoint to Resend, and takes the sender", () => {
    const config = httpMailerConfigFromEnv({
      HOMM3BG_MAIL_API_KEY: "re_live",
      HOMM3BG_MAIL_FROM: "Erathia <no-reply@erathia.io>"
    })!;
    expect(config.apiKey).toBe("re_live");
    expect(config.endpoint).toBe("https://api.resend.com/emails");
    expect(config.from).toBe("Erathia <no-reply@erathia.io>");
  });

  it("accepts the RESEND_API_KEY alias and a custom endpoint URL", () => {
    const config = httpMailerConfigFromEnv({
      HOMM3BG_RESEND_API_KEY: "re_alias",
      HOMM3BG_MAIL_API_URL: "https://api.mailchannels.net/tx/v1/send"
    })!;
    expect(config.apiKey).toBe("re_alias");
    expect(config.endpoint).toBe("https://api.mailchannels.net/tx/v1/send");
  });
});
