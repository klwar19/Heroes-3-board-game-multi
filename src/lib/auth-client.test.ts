import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSocketTokenCache, fetchSocketToken } from "./auth-client";

describe("socket ticket cache", () => {
  beforeEach(() => clearSocketTokenCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent requests and reuses an unexpired ticket", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: "one", expiresAt: Date.now() + 600_000 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await Promise.all([fetchSocketToken(), fetchSocketToken()])).toEqual(["one", "one"]);
    expect(await fetchSocketToken()).toBe("one");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes inside the safety margin", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "old", expiresAt: Date.now() + 30_000 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "new", expiresAt: Date.now() + 600_000 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchSocketToken()).toBe("old");
    expect(await fetchSocketToken()).toBe("new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not repopulate the cache when logout clears an in-flight mint", async () => {
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })));
    const pending = fetchSocketToken();
    clearSocketTokenCache();
    resolveResponse(new Response(JSON.stringify({ token: "stale", expiresAt: Date.now() + 600_000 })));
    await expect(pending).resolves.toBeUndefined();
  });
});
