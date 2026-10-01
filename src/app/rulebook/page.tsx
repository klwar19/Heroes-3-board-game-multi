"use client";

import { useRouter } from "next/navigation";
import { RulebookReader } from "@/components/rulebook/rulebook-reader";

/**
 * Stand-alone Rule Book route (direct links, bookmarks). The main menu opens
 * the same reader as an overlay; closing here returns to the menu.
 */
export default function RulebookPage() {
  const router = useRouter();
  return <RulebookReader onClose={() => router.push("/menu")} />;
}
