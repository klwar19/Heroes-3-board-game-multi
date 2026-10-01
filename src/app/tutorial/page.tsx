"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingScreen } from "@/components/menu/loading-screen";
import { setTutorialLanguage, type TutorialLanguage } from "@/lib/tutorial/tutorial-preference";
import { TUTORIAL_ROOM_ID } from "@/lib/tutorial/tutorial-room-id";

/**
 * Shareable front door for the guided tutorial (/tutorial, optional
 * ?lang=en|vi|pl). No account needed: the tutorial table runs in the browser,
 * so a first-time visitor is playing within seconds.
 */
export default function TutorialEntryPage() {
  const router = useRouter();
  useEffect(() => {
    const lang = new URLSearchParams(window.location.search).get("lang");
    if (lang === "en" || lang === "vi" || lang === "pl") setTutorialLanguage(lang as TutorialLanguage);
    router.replace(`/?room=${encodeURIComponent(TUTORIAL_ROOM_ID)}`);
  }, [router]);
  return <LoadingScreen title="Summoning Sandro…" />;
}
