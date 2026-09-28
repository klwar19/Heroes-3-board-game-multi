"use client";

import dynamic from "next/dynamic";

/**
 * Restia — the hidden single-player life-sim RPG mode (main menu → Modding).
 * Client-only and code-split: nothing here loads unless this route is opened.
 */
const RestiaApp = dynamic(() => import("@/restia/ui/restia-app"), {
  ssr: false,
  loading: () => (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", background: "#17110c", color: "#f6e3bd", fontFamily: "Georgia, serif" }}>
      Loading Restia…
    </div>
  )
});

export default function RestiaPage() {
  return <RestiaApp />;
}
