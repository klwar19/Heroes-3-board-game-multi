/**
 * Gate for DECORATIVE polling loops (lobby chat/presence/invites — never the
 * room transport): a tick is skipped entirely while the tab is hidden.
 *
 * Why: every one of these polls hits a same-origin /api route, and on the
 * production host each request is a billed Vercel Edge Request. Browsers
 * throttle background-tab timers to >= 60 s but never stop them, so a
 * forgotten tab kept spending requests around the clock (the July 2026
 * edge-request spike). Every poller using this gate ALSO refreshes on
 * visibilitychange -> visible, so a hidden tab skipping ticks loses nothing —
 * the data is refetched the instant the player looks again. Server TTLs
 * (presence 120 s, invites 5 min) comfortably absorb the pause.
 */
export function pollTickAllowed(
  doc: Pick<Document, "visibilityState"> | null = typeof document === "undefined" ? null : document
): boolean {
  // No document (SSR/tests without jsdom) → never block the tick.
  return !doc || doc.visibilityState !== "hidden";
}
