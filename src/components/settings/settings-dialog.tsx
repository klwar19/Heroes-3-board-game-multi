"use client";

/**
 * Options entry points: SettingsHost (mounted once in the root layout — applies
 * the page-wide preferences and shows the dialog) and SettingsButton (the gear
 * used on the main menu, the map-setup room and every in-game table). The
 * dialog body (settings-panel.tsx) loads on first open, so no route pays for
 * it up front.
 */
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Settings } from "lucide-react";
import {
  getServerSettingsDialogState,
  getSettingsDialogState,
  openSettings,
  subscribeSettingsDialog,
  type SettingsTab,
} from "@/lib/settings-dialog";
import { usePreferencesRuntime } from "./preferences-runtime";

const SettingsDialog = dynamic(() => import("./settings-panel"), { ssr: false });

/** Mounted once in the root layout: applies preferences and hosts the dialog. */
export function SettingsHost() {
  usePreferencesRuntime();
  const { open, tab } = useSyncExternalStore(subscribeSettingsDialog, getSettingsDialogState, getServerSettingsDialogState);
  if (!open || typeof document === "undefined") return null;
  return createPortal(<SettingsDialog tab={tab} />, document.body);
}

/** The gear button that opens Options. `compact` = icon-only round button. */
export function SettingsButton({ className, compact = false, tab }: { className?: string; compact?: boolean; tab?: SettingsTab }) {
  return (
    <button
      aria-haspopup="dialog"
      aria-label="Options"
      className={`optionsOpenButton${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => openSettings(tab)}
      title="Options — sound, display, graphics, text"
      type="button"
    >
      <Settings aria-hidden="true" />
      {compact ? null : <span>Options</span>}
    </button>
  );
}
