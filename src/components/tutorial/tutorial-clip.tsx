"use client";

import { useEffect, useRef } from "react";
import { Play, X } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import css from "./tutorial-clip.module.css";

/**
 * The "watch how" pop-up: a small looping, muted clip recorded from the real
 * app on the scripted tutorial game (scripts/tutorial/record-clips.mjs), in the
 * player's own layout (computer or phone), so what it shows is exactly what the
 * player will see and can copy. Clips are tiny webm files that only load when
 * the pop-up opens.
 */
export function TutorialClip({
  src,
  title,
  phone,
  onClose,
  closeLabel = "Close clip",
  replayLabel = "Replay",
}: {
  src: string;
  title: string;
  phone: boolean;
  onClose: () => void;
  closeLabel?: string;
  replayLabel?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div aria-label={`How to: ${title}`} className={css.window} data-phone={phone ? "true" : undefined} role="dialog">
      <header className={css.bar}>
        <Play aria-hidden size={12} />
        <span className={css.title}>{title}</span>
        <button
          aria-label={replayLabel}
          title={replayLabel}
          className={css.tool}
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.currentTime = 0;
            void video.play().catch(() => undefined);
          }}
          type="button"
        >
          ↺
        </button>
        <button aria-label={closeLabel} className={css.tool} onClick={onClose} title={closeLabel} type="button">
          <X aria-hidden size={14} />
        </button>
      </header>
      <video
        autoPlay
        className={css.video}
        loop
        muted
        playsInline
        preload="auto"
        ref={videoRef}
        src={assetUrl(src)}
      />
    </div>
  );
}
