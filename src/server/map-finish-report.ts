import { MAPS_SINGLETON_ID } from "./map-registry";
import { recordSharedMapFinishedGame } from "./shared-map-store";

/** Persist a completion to whichever map catalog backend this app uses. */
export async function recordDesignedMapFinish(
  mapId: string,
  matchId: string,
  reportKey?: string
): Promise<void> {
  const rawHost = (process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (!rawHost) {
    recordSharedMapFinishedGame(mapId, matchId);
    return;
  }
  if (!reportKey) throw new Error("Map completion reporting is not configured.");
  const protocol = /^(localhost|127\.0\.0\.1)(:|$)/.test(rawHost) ? "http" : "https";
  const response = await fetch(
    `${protocol}://${rawHost}/parties/maps/${encodeURIComponent(MAPS_SINGLETON_ID)}/finished`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-homm3bg-report-key": reportKey },
      body: JSON.stringify({ mapId, matchId, finishedAt: Date.now() })
    }
  );
  if (!response.ok) throw new Error(`map catalog answered HTTP ${response.status}`);
}
