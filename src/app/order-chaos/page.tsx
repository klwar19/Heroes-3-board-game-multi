"use client";

import dynamic from "next/dynamic";

/**
 * Order & Chaos: the Lawful-vs-Chaos lane-defence mode (campaign, Endless
 * Siege, Chaos Raids). A canvas game with browser-stored progress, so it
 * renders on the client only; the simulation runs in the browser.
 */
const OrderChaosApp = dynamic(() => import("@/components/garrison/order-chaos/oc-app").then((mod) => mod.OrderChaosApp), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "#0d0905" }} />
});

export default function OrderChaosPage() {
  return <OrderChaosApp />;
}
