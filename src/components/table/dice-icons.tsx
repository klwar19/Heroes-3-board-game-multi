/**
 * Hand-drawn board-game iconography for the dice faces and treasure notices.
 * Everything is inline SVG on `currentColor` so the icons take on each die
 * face's ink colour (dark on the parchment Resource die, deep brown on the
 * gold Treasure die). Stylised to read like the printed symbols — these are
 * original art for the fan project, not scans.
 */

type IconProps = { size?: number; className?: string };

/** Half an Experience Level — an upward chevron over a level bar (Treasure die). */
export function ExperienceIcon({ size = 20, className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M12 3 4 11h4v3h8v-3h4z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <rect fill="currentColor" height="3" rx="1" width="12" x="6" y="17" />
    </svg>
  );
}

/** Search the Artifact deck — a classic key (Treasure die). */
export function ArtifactIcon({ size = 20, className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 24 24" width={size}>
      <circle cx="8" cy="8" fill="none" r="4.4" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="8" cy="8" fill="currentColor" r="1.5" />
      <path d="M11 11 20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      <path d="M16.5 16.5 19 14M18.5 18.5 21 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

/** A single small die showing five pips (Treasure die: roll one Resource die). */
export function DieFaceIcon({ size = 20, className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 24 24" width={size}>
      <rect fill="none" height="17" rx="4" stroke="currentColor" strokeWidth="2" width="17" x="3.5" y="3.5" />
      <circle cx="8" cy="8" fill="currentColor" r="1.5" />
      <circle cx="16" cy="8" fill="currentColor" r="1.5" />
      <circle cx="12" cy="12" fill="currentColor" r="1.5" />
      <circle cx="8" cy="16" fill="currentColor" r="1.5" />
      <circle cx="16" cy="16" fill="currentColor" r="1.5" />
    </svg>
  );
}

/** Two dice (Treasure die: roll two Resource dice, choose one). */
export function DoubleDieIcon({ size = 22, className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 24 24" width={size}>
      <rect fill="currentColor" height="13" opacity="0.45" rx="3" width="13" x="2.5" y="8.5" />
      <rect fill="none" height="13" rx="3" stroke="currentColor" strokeWidth="1.7" width="13" x="2.5" y="8.5" />
      <rect fill="var(--die-paper, #f3e7c8)" height="13" rx="3" stroke="currentColor" strokeWidth="1.7" width="13" x="8.5" y="2.5" />
      <circle cx="12" cy="6" fill="currentColor" r="1.2" />
      <circle cx="18" cy="6" fill="currentColor" r="1.2" />
      <circle cx="12" cy="12" fill="currentColor" r="1.2" />
      <circle cx="18" cy="12" fill="currentColor" r="1.2" />
    </svg>
  );
}

/** Treasure chest — for the visit notice and the treasure symbol. */
export function TreasureChestIcon({ size = 22, className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M3 9a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v1H3z"
        fill="currentColor"
        opacity="0.9"
      />
      <rect fill="currentColor" height="9" rx="1.5" width="18" x="3" y="10" />
      <rect fill="var(--chest-band, rgba(0,0,0,0.35))" height="9" width="3" x="10.5" y="10" />
      <rect fill="var(--chest-lock, #ffe08a)" height="3.5" rx="0.8" width="3" x="10.5" y="12" />
      <path d="M3 10h18" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.1" />
    </svg>
  );
}
