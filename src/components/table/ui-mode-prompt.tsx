"use client";

/**
 * Pre-game UI-mode chooser + the table-menu toggle.
 *
 * `UiModePrompt` is mounted on every table branch (setup lobby, Battle-Test
 * setup, adventure map, combat), so the question is asked BEFORE the game
 * begins in the normal flow, and a mid-game joiner still gets asked once. It
 * renders only while the per-browser preference is unset; answering it is a
 * forced pick (no dismiss-without-choice), exactly like the helper-coach
 * lobby prompt it is modeled on. The device-detected mode is only a
 * "Recommended" badge — the player always decides.
 *
 * `UiModeToggle` is the always-available switch in the table menu (which is
 * the "Menu" tab in phone mode), so a wrong pick is never sticky.
 */
import { Monitor, Smartphone } from "lucide-react";
import { useUiModePreference, type UiMode } from "@/lib/ui-mode-preference";

export function UiModePrompt() {
  const { preference, recommended, setPreference, ready } = useUiModePreference();

  if (!ready || preference !== null) {
    return null;
  }

  const option = (value: UiMode) => {
    const isRecommended = recommended === value;
    return (
      <button
        className={`uiModeOption ${isRecommended ? "recommended" : ""}`}
        onClick={() => setPreference(value)}
        type="button"
      >
        <span className="uiModeOptionIcon" aria-hidden="true">
          {value === "phone" ? <Smartphone size={26} /> : <Monitor size={26} />}
        </span>
        <span className="uiModeOptionText">
          <strong>{value === "phone" ? "Phone mode" : "Computer mode"}</strong>
          <small>
            {value === "phone"
              ? "Full-screen panels with a bottom tab bar — map, hand, army and menus each get the whole screen."
              : "The classic desktop table — everything laid out side by side."}
          </small>
        </span>
        {isRecommended ? <span className="uiModeRecommended">Recommended for this device</span> : null}
      </button>
    );
  };

  return (
    <div
      className="uiModeBackdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Choose your screen layout"
      onMouseDown={(event) => {
        // Clicking the backdrop does NOT dismiss without a choice — force a pick.
        event.stopPropagation();
      }}
    >
      <section className="uiModeCard" onMouseDown={(event) => event.stopPropagation()}>
        <span className="uiModeEyebrow">Before the game begins</span>
        <h2 className="uiModeTitle">How are you playing?</h2>
        <p className="uiModeLede">
          Pick the layout for this device. Phone mode reorganizes the table into full-screen tabs so
          nothing is squeezed or hidden; Computer mode keeps the classic desktop table.
        </p>
        <div className="uiModeOptions">
          {/* Recommended option first so the primary action is the top/left one. */}
          {recommended === "phone" ? (
            <>
              {option("phone")}
              {option("computer")}
            </>
          ) : (
            <>
              {option("computer")}
              {option("phone")}
            </>
          )}
        </div>
        <small className="uiModeFoot">
          Saved in this browser only — switch anytime with the 📱/💻 button in the table menu.
        </small>
      </section>
    </div>
  );
}

/** Compact mode switch for the table menu / phone Menu tab. */
export function UiModeToggle() {
  const { uiMode, setPreference, ready } = useUiModePreference();

  if (!ready) {
    return null;
  }

  const phone = uiMode === "phone";
  return (
    <button
      aria-pressed={phone}
      className={`uiModeToggle ${phone ? "phone" : ""}`}
      onClick={() => setPreference(phone ? "computer" : "phone")}
      title={
        phone
          ? "Phone layout is ON — switch back to the classic computer layout"
          : "Switch to the phone layout (full-screen tabs for map, hand, army and menus)"
      }
      type="button"
    >
      {phone ? <Smartphone aria-hidden="true" size={13} /> : <Monitor aria-hidden="true" size={13} />}
      <span>{phone ? "Phone UI" : "Computer UI"}</span>
    </button>
  );
}
