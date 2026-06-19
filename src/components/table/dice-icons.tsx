/**
 * Hand-drawn board-game iconography for the dice faces and treasure notices.
 * Most icons are inline SVG on `currentColor` so they take on each die face's
 * ink colour. The crossed tools use the approved transparent raster asset so
 * the shovel and pickaxe stay recognizable on the treasure die.
 */

import { assetUrl } from "@/lib/asset-url";

type IconProps = { size?: number; className?: string };

/** Experience — a heraldic pennant charged with a star (Treasure die). */
export function StarBannerIcon({ size = 22, className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 24 24" width={size}>
      {/* hanging rod */}
      <rect fill="currentColor" height="2.6" rx="1.1" width="18" x="3" y="2.4" />
      {/* banner with a fishtail (swallowtail) hem */}
      <path d="M5 5h14v13l-3.5-2.8-3.5 2.8-3.5-2.8L5 18z" fill="currentColor" />
      {/* five-pointed star, picked out in the table's green */}
      <path
        d="M12 6.8 13.0 9.43 15.8 9.56 13.62 11.33 14.35 14.04 12 12.5 9.65 14.04 10.38 11.33 8.2 9.56 11.0 9.43Z"
        fill="#5f8a63"
      />
    </svg>
  );
}

/** Search the Artifact deck — an ankh amulet / relic (Treasure die). */
export function AnkhIcon({ size = 20, className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} height={size} viewBox="0 0 24 24" width={size}>
      {/* looped head (ring with a hole) */}
      <path
        d="M12 1.8c-2.5 0-4.3 1.9-4.3 4.3 0 1.9 1.2 3.4 3 4v1.1h2.6V10.1c1.8-.6 3-2.1 3-4C16.3 3.7 14.5 1.8 12 1.8zm0 2.3c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"
        fill="currentColor"
      />
      {/* flared crossbar */}
      <path d="M4.5 11.4h15l-1.4 2.6H5.9z" fill="currentColor" />
      {/* stem */}
      <rect fill="currentColor" height="8.4" width="2.8" x="10.6" y="11.4" />
      {/* pedestal foot */}
      <path d="M8.4 19.6h7.2v2.6h-2v-1.1h-3.2v1.1h-2z" fill="currentColor" />
    </svg>
  );
}

/** Roll the Resource die — approved crossed shovel and pickaxe asset. */
export function CrossedShovelsIcon({ size = 20, className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundImage: `url(${assetUrl("/assets/ui/dice-resource-tools.webp")})`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "contain",
        filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 35%))"
      }}
    />
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
