import { redirect } from "next/navigation";

/**
 * The old standalone Single Player screen is retired: the main menu's own
 * Single Player submenu (Scenario, Campaign, Garrison Wars, Back) is the only
 * one. Old links and bookmarks land there.
 */
export default function SinglePlayerPage() {
  redirect("/menu?view=singlePlayer");
}
