/**
 * Wake of Gods single-hex map locations (`wog.newObjects`).
 *
 * Registered into `locationDefinitions` so a Field Override carve always
 * resolves. Placement is gated by the wog package (`wog.enabled &&
 * wog.newObjects`) / designer pins — see `src/data/wog/field-overrides.ts`.
 *
 * All three carry `interaction: NONE`: their visit MENUS are built dynamically
 * in `beginFieldVisit` (`buildWogFieldVisitStep`), because each arm is
 * context-filtered against live state (commander presence, controlled Towns,
 * hand Artifacts) exactly like a City-Hall choice — a static LocationInteraction
 * cannot express that. Every menu arm is a wired VisitStep leaf, so there is no
 * decorative text (CLAUDE.md §1/§2).
 *
 * Board-adaptation notes (deliberate, leading with the limits):
 *  - Emerald Tower: WoG enchants a creature stack; here it TRAINS the WOG
 *    commander (a commander stat point) or the hero (experience) — no creature
 *    enchant arm.
 *  - Mirror of the Home-Way: WoG's full Town-Portal price/movement table is
 *    reduced to a flat pay-2-gold Town/Settlement teleport.
 *  - Junk Merchant: WoG's 32-artifact fixed trade table is reduced to
 *    tier-priced sells (minor 2 / major 3 / relic 4) plus a paid Artifact search.
 */

import type { LocationDefinition } from "@/data/map/types";

const wogSource = {
  product: "Heroes III: In the Wake of Gods (fan expansion) — board-game adaptation",
  credit:
    "Original board-game adaptation for this repository. WoG's Emerald Tower creature-enchanting, the Mirror of the Home-Way's full Town-Portal price table, and the Junk Merchant's 32-artifact trade table are NOT modeled — each object reuses existing wired arms and the summary describes exactly the engine behaviour.",
  url: "https://www.vault.acidcave.net/download.php?id=72"
} as const;

/**
 * WoG location definitions. Keys are the stable location ids stamped on
 * `MapFieldState.location` after a Field Override carve.
 */
export const wogLocationDefinitions: Record<string, LocationDefinition> = {
  /**
   * Emerald Tower — commander/hero training tower. The guard (difficulty 3) is
   * stamped by the Field Override definition, not this interaction; the visit
   * menu is appended in `beginFieldVisit` (there is no static interaction).
   */
  "wog.emerald_tower": {
    id: "wog.emerald_tower",
    name: "Emerald Tower",
    category: "revisitable",
    // engine: the training menu is built at visit time (buildWogFieldVisitStep);
    // there is no static interaction. Revisitable (1 MP, no cube).
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: wogSource
  },

  /**
   * Mirror of the Home-Way — pay-2-gold Town/Settlement teleport. The
   * destination CHOOSE_ONE (Town-Portal `TELEPORT_HERO` machinery) is built at
   * visit time; with no reachable Town the pay arm is absent.
   */
  "wog.mirror_home_way": {
    id: "wog.mirror_home_way",
    name: "Mirror of the Home-Way",
    category: "revisitable",
    // engine: the pay-and-teleport menu is built at visit time.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: wogSource
  },

  /**
   * Junk Merchant — sell a hand Artifact by tier, or pay 4 gold to Search (1)
   * the Artifact deck. Menu built at visit time (per-artifact sell arms).
   */
  "wog.junk_merchant": {
    id: "wog.junk_merchant",
    name: "Junk Merchant",
    category: "revisitable",
    // engine: the sell/search menu is built at visit time.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: wogSource
  }
};
