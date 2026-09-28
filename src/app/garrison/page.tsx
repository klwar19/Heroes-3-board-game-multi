"use client";

import dynamic from "next/dynamic";

/**
 * Garrison Wars: the lane-defence mode (single player, same-screen and online
 * duels). A canvas game with browser-stored progress, so it renders on the
 * client only; the whole simulation runs in the browser (src/engine/garrison).
 */
const GarrisonApp = dynamic(() => import("@/components/garrison/garrison-app").then((mod) => mod.GarrisonApp), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "#0d0905" }} />
});

export default function GarrisonPage() {
  return <GarrisonApp />;
}
