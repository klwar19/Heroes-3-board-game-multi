/**
 * Open/close state of the Options dialog (components/settings). One dialog is
 * mounted in the root layout; any button anywhere opens it with
 * `openSettings()` — optionally on a given tab.
 */

export type SettingsTab = "audio" | "display" | "graphics" | "text";

export type SettingsDialogState = { open: boolean; tab: SettingsTab };

let state: SettingsDialogState = { open: false, tab: "audio" };
const listeners = new Set<() => void>();

function set(next: SettingsDialogState): void {
  if (next.open === state.open && next.tab === state.tab) return;
  state = next;
  for (const listener of listeners) listener();
}

export function getSettingsDialogState(): SettingsDialogState {
  return state;
}

const CLOSED: SettingsDialogState = { open: false, tab: "audio" };

/** Server snapshot: always closed. */
export function getServerSettingsDialogState(): SettingsDialogState {
  return CLOSED;
}

export function subscribeSettingsDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function openSettings(tab?: SettingsTab): void {
  set({ open: true, tab: tab ?? state.tab });
}

export function closeSettings(): void {
  set({ ...state, open: false });
}

export function setSettingsTab(tab: SettingsTab): void {
  set({ ...state, tab });
}
