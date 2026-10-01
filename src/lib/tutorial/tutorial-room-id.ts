/** Room ids starting with this prefix are served by the local tutorial room. */
export const TUTORIAL_ROOM_PREFIX = "tutorial-";

/** The one tutorial table (progress is per browser, see tutorial-preference.ts). */
export const TUTORIAL_ROOM_ID = "tutorial-sandro";

export function isTutorialRoomId(roomId: string | null | undefined): boolean {
  return typeof roomId === "string" && roomId.startsWith(TUTORIAL_ROOM_PREFIX);
}
