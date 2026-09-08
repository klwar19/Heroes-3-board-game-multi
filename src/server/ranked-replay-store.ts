import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { writeFileAtomic } from "@/server/atomic-file";
import { PostgrestClient } from "@/server/accounts/postgrest";
import { supabaseConfigFromEnv } from "@/server/accounts/account-store-instance";
import {
  RANKED_REPLAY_MAX_BYTES,
  RANKED_REPLAY_MAX_ACTIONS,
  rankedReplayEnabled,
  type RankedReplay,
} from "@/server/ranked-replay";

export const RANKED_REPLAYS_TABLE = "homm3bg_ranked_replays";
export const RANKED_REPLAY_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const BUILTIN_MAX_FILES = 200;
const BUILTIN_MAX_TOTAL_BYTES = 250 * 1024 * 1024;

export type RankedReplayStoreOutcome = { stored: boolean; reason?: string };

export function validRankedReplay(matchId: string, replay: RankedReplay): boolean {
  if (!replay || replay.format !== "homm3bg-ranked-replay-v1" || replay.matchId !== matchId) return false;
  const bytes = new TextEncoder().encode(JSON.stringify(replay)).byteLength;
  return (
    replay.entries.length <= RANKED_REPLAY_MAX_ACTIONS &&
    bytes <= RANKED_REPLAY_MAX_BYTES &&
    replay.byteLength === bytes
  );
}

function safeReplayFileName(matchId: string): string {
  return `${encodeURIComponent(matchId).replace(/%/g, "_").slice(0, 220)}.json`;
}

function pruneBuiltinReplayDir(directory: string, nowMs = Date.now()): void {
  try {
    const root = resolve(directory);
    const oldestAllowedMtime = nowMs - RANKED_REPLAY_RETENTION_MS;
    const files = readdirSync(root)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        const path = resolve(root, name);
        if (!path.startsWith(`${root}${sep}`) && path !== root) return null;
        const stats = statSync(path);
        return { path, mtimeMs: stats.mtimeMs, bytes: stats.size };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    let keptBytes = 0;
    let keptFiles = 0;
    for (const file of files) {
      if (file.mtimeMs < oldestAllowedMtime) {
        unlinkSync(file.path);
        continue;
      }
      keptBytes += file.bytes;
      if (keptFiles >= BUILTIN_MAX_FILES || keptBytes > BUILTIN_MAX_TOTAL_BYTES) {
        unlinkSync(file.path);
        continue;
      }
      keptFiles += 1;
    }
  } catch {
    // Retention is best-effort; a failed cleanup must never affect a match.
  }
}

/** Store once at match completion; never called on the live per-action path. */
export async function storeRankedReplay(
  matchId: string,
  replay: RankedReplay,
  env: Record<string, string | undefined> = process.env,
): Promise<RankedReplayStoreOutcome> {
  if (!rankedReplayEnabled(env.HOMM3BG_RANKED_REPLAY_ENABLED)) {
    return { stored: false, reason: "disabled" };
  }
  if (!validRankedReplay(matchId, replay)) return { stored: false, reason: "invalid" };

  const config = supabaseConfigFromEnv(env);
  if (config) {
    const db = new PostgrestClient(config.url, config.serviceRoleKey);
    // Retain only the rolling seven-day training window. This deletes replay
    // payloads, not homm3bg_matches, so match-result idempotency and players'
    // cumulative W/L/MMR remain intact. Cleanup is best-effort: an unavailable
    // cleanup query must not discard the newly completed match.
    try {
      const cutoff = new Date(Date.now() - RANKED_REPLAY_RETENTION_MS).toISOString();
      await db.delete(RANKED_REPLAYS_TABLE, {}, {
        filters: [`recorded_at=lt.${encodeURIComponent(cutoff)}`],
        returnRepresentation: false,
      });
    } catch (error) {
      console.error("[ranked-replay] failed to prune expired Supabase replays:", error);
    }
    // Keep the database write small too. Expanding the edge upload and then
    // posting 16 MB of JSON to PostgREST would only move the same request-size
    // failure one hop downstream. Training exports decode this private column.
    const compressedPayload = gzipSync(JSON.stringify(replay)).toString("base64");
    const inserted = await db.insert<{ match_id: string }>(
      RANKED_REPLAYS_TABLE,
      {
        match_id: matchId,
        recorded_at: replay.finishedAt ?? new Date().toISOString(),
        schema_version: replay.schemaVersion,
        engine_signature: replay.engineSignature,
        action_count: replay.entries.length,
        byte_length: replay.byteLength,
        truncated: replay.truncated,
        payload: null,
        payload_gzip_base64: compressedPayload,
      },
      { ignoreDuplicates: true },
    );
    return { stored: inserted.length > 0, ...(inserted.length ? {} : { reason: "duplicate" }) };
  }

  const directory = env.HOMM3BG_REPLAY_DIR ?? join(tmpdir(), "homm3bg-ranked-replays");
  const path = join(directory, safeReplayFileName(matchId));
  // Prune before the duplicate check as a retried report may be the only write
  // reaching a quiet installation for some time.
  pruneBuiltinReplayDir(directory);
  if (existsSync(path)) return { stored: false, reason: "duplicate" };
  writeFileAtomic(path, JSON.stringify(replay));
  pruneBuiltinReplayDir(directory);
  return { stored: true };
}
