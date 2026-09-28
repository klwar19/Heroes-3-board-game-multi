/**
 * The Restia mode is hidden behind the main menu's "Modding" icon and a simple
 * password (a soft gate, not security). Kept dependency-free so the main menu
 * can import it without pulling the game into its bundle.
 */
export const RESTIA_PASSWORD = "1234";
const UNLOCK_KEY = "restia:unlocked";

export function isRestiaUnlocked(): boolean {
  try {
    return window.sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function unlockRestia(password: string): boolean {
  if (password.trim() !== RESTIA_PASSWORD) return false;
  try {
    window.sessionStorage.setItem(UNLOCK_KEY, "1");
  } catch {
    // Storage blocked: the unlock still counts for this page view.
  }
  return true;
}
