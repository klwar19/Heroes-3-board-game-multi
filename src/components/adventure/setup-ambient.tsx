/* eslint-disable @next/next/no-img-element */
/**
 * Ambient atmosphere for the map-setup lobby: Warcraft III–style Sentinels
 * wisps floating over the (static) Gold Dragon backdrop.
 *
 * Decorative only — pointer-events: none, aria-hidden. Does NOT touch the
 * dragon art or backdrop (clip/wing layers caused frame artifacts).
 */
import { assetUrl } from "@/lib/asset-url";

/** Floating WC3-style wisps. Kept few for cost. */
const SETUP_WISPS = 6;
/** Tiny spirit motes (fairy dust) around the glade. */
const SETUP_MOTES = 10;

const WISP_SRC = "/assets/ui/ornate/wc3-wisp.webp";

export function SetupAmbientFx() {
  const wispSrc = assetUrl(WISP_SRC);
  return (
    <div aria-hidden className="setupAmbient" data-testid="setup-ambient">
      {/* WC3 Sentinels wisps — bright white core + teal ray starburst. */}
      <div className="setupWisps">
        {Array.from({ length: SETUP_WISPS }, (_, i) => (
          <span className={`setupWisp setupWisp${i + 1}`} key={`w${i}`}>
            <img alt="" className="setupWispImg" draggable={false} src={wispSrc} />
          </span>
        ))}
      </div>

      {/* Fine teal/gold motes. */}
      <div className="setupMotes">
        {Array.from({ length: SETUP_MOTES }, (_, i) => (
          <span className={`setupMote setupMote${i + 1}`} key={`m${i}`} />
        ))}
      </div>
    </div>
  );
}
