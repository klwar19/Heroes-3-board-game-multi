import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteSharedMap, fetchSharedMaps, saveSharedMap } from "./shared-maps";

/**
 * The browser transport for the shared map library. With no PartyKit host set
 * (the default under vitest) every call must hit the built-in `/api/maps` route
 * with the right method + body, and gracefully degrade when the server answers
 * an error. `restoreMocks: true` (vitest.config) resets the fetch spy per test.
 */

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const data = impl(url, init);
    return {
      ok: true,
      json: async () => data
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shared-maps client transport", () => {
  it("fetchSharedMaps GETs /api/maps and returns the library", async () => {
    const spy = mockFetch(() => ({ maps: [{ id: "a" }, { id: "b" }] }));
    const maps = await fetchSharedMaps();
    expect(spy).toHaveBeenCalledWith("/api/maps", expect.objectContaining({ cache: "no-store" }));
    expect(maps.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("saveSharedMap POSTs the record to /api/maps and returns the result", async () => {
    const input = { id: "m1", name: "Frontier", scenarioId: "skirmish", players: 3, tiles: [] };
    const spy = mockFetch(() => ({ ok: true, map: { ...input }, maps: [{ ...input }] }));

    const outcome = await saveSharedMap(input);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/maps");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init!.body as string)).toMatchObject({ id: "m1", players: 3 });
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.map.id).toBe("m1");
  });

  it("deleteSharedMap DELETEs /api/maps with the id and returns the remaining list", async () => {
    const spy = mockFetch(() => ({ maps: [{ id: "b" }] }));
    const remaining = await deleteSharedMap("a");
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/maps");
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(init!.body as string)).toEqual({ id: "a" });
    expect(remaining?.map((m) => m.id)).toEqual(["b"]);
  });

  it("degrades gracefully when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );
    expect(await fetchSharedMaps()).toEqual([]);
    expect(await saveSharedMap({ id: "m", name: "x", scenarioId: "skirmish", players: 2, tiles: [] })).toMatchObject({
      ok: false
    });
    expect(await deleteSharedMap("m")).toBeNull();
  });
});
