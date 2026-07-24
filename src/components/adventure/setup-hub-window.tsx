"use client";

/**
 * The Setup Hub popup shell: one portal window used by all four hub boxes
 * (Game mode / Heroes & Draft / Map / Advanced settings). Sits at z-index 110
 * — deliberately BELOW the hero-info popup (120) and the WOG/Anime mod
 * windows (130), which open from inside it and must stack on top. Backdrop
 * click, the ✕ button and Escape close it; Escape defers while a stacked
 * dialog (hero info / mod options) is open so it only closes the topmost.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function SetupHubWindow({
  label,
  eyebrow,
  title,
  onClose,
  className,
  children
}: {
  /** Accessible dialog label (also the default title). */
  label: string;
  /** Small kicker line above the title. */
  eyebrow?: string;
  title?: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      // A dialog stacked ABOVE this window (hero info, mod options) owns the
      // Escape — closing both at once would throw the player back two levels.
      if (document.querySelector(".heroInfoBackdrop, .wogWindowBackdrop")) {
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    sectionRef.current?.focus();
  }, []);

  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div className="setupHubBackdrop" onMouseDown={onClose}>
      <section
        aria-label={label}
        aria-modal="true"
        className={`setupHubWindow${className ? ` ${className}` : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
        ref={sectionRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="setupHubWindowHead">
          <div>
            {eyebrow ? <span className="setupHubWindowEyebrow">{eyebrow}</span> : null}
            <h3>{title ?? label}</h3>
          </div>
          <button aria-label={`Close ${label}`} className="setupHubWindowClose" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>
        <div className="setupHubWindowBody">{children}</div>
      </section>
    </div>,
    document.body
  );
}
