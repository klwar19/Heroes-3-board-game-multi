/* eslint-disable @next/next/no-img-element */
/**
 * Azure Dragon claw on the map card tray + frost under the grip.
 *
 * Glow = tight drop-shadow on the claw only (follows painted alpha — no
 * rectangular light frame). Frost = oval-masked rim under the talons.
 * Never put a full-width linear mask on the claw (that squared the glow).
 * Decorative only.
 */
import { assetUrl } from "@/lib/asset-url";

const CLAW_SRC = "/assets/ui/ornate/azure-claw.webp";
const FROST_RIM_SRC = "/assets/ui/ornate/azure-frost-rim.webp";

export function AzureClawChill() {
  const claw = assetUrl(CLAW_SRC);
  const frostRim = assetUrl(FROST_RIM_SRC);

  return (
    <div aria-hidden className="azureClawChrome" data-testid="azure-claw-chill">
      {/* Frost under the grip — radial mask only (no strip/box). */}
      <img alt="" className="azureClawFrostRim" draggable={false} src={frostRim} />

      {/* Claw — silhouette chill glow via drop-shadow. No mask-image. */}
      <img alt="" className="azureClawHand" draggable={false} src={claw} />
    </div>
  );
}
