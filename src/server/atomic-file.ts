import { mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Crash-safe file persistence for the server stores (accounts, rooms, shared
 * maps). A plain `writeFileSync` over the live file is NOT durable: a process
 * kill / power loss mid-write leaves a truncated JSON, the next boot's
 * `JSON.parse` throws, the loader falls back to "no snapshot" — and every
 * account/room silently vanishes. Writing the bytes to a sibling temp file and
 * `rename`-ing it over the target is atomic on the same filesystem (POSIX
 * rename; libuv maps it to MoveFileEx(REPLACE_EXISTING) on Windows), so readers
 * only ever observe the old complete file or the new complete file.
 *
 * The temp name never ends in `.json` on purpose: the room directory scanner
 * (game-room-store `readPersistedRecords`) globs `*.json`, and a half-written
 * temp file must never be picked up as a room.
 */

let tempCounter = 0;

/** Write `data` to `filePath` atomically, creating parent directories. */
export function writeFileAtomic(filePath: string, data: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  tempCounter = (tempCounter + 1) % Number.MAX_SAFE_INTEGER;
  const tempPath = join(
    dirname(filePath),
    `.${process.pid.toString(36)}-${tempCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}.tmp`
  );
  writeFileSync(tempPath, data);
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    // Never leave the orphan temp file behind on a failed rename.
    try {
      unlinkSync(tempPath);
    } catch {
      /* already gone */
    }
    throw error;
  }
}
