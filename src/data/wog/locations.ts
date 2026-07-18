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
 *  - Fishing Well: WoG's variable catch is a fixed pay-1-gold Attack-die gamble
 *    (a STATIC PAY_TO + ATTACK_DIE_TABLE — no dynamic menu; +1 valuables / 2 gold
 *    back / nothing). Revisitable, once per visit.
 *  - Living Skull: WoG's scripted lore is a Search/Smash CHOOSE_ONE; smashing
 *    sets a permanent per-field destruction latch (`wogSkullSmashed`) making the
 *    hex INERT for everyone. Listen (Search 1 Ability) is repeatable until smash.
 *  - Adventure Cave: an escalating repeatable fight (guarded Ⅰ→Ⅱ→Ⅲ). Each win
 *    scales the reward and re-guards one higher; cleared after the 3rd win. The
 *    whole reward/re-guard flow is engine code in `beginFieldVisit`, not a static
 *    interaction (the location carries NONE).
 *  - Altar of the Gods: pay 3 valuables → choose +1 morale / +2 hero XP /
 *    (Commanders module) +1 commander stat point. A per-round latch was
 *    deliberately NOT added — plain revisitable (1 MP), gated only by the
 *    3-valuables cost each visit.
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
  },

  /**
   * Fishing Well — pay 1 gold to gamble on one Attack die: +1 → +1 valuables,
   * 0 → 2 gold back (net even), −1 → nothing. STATIC PAY_TO + ATTACK_DIE_TABLE
   * (the Gambling Den's machinery); no dynamic menu branch. Revisitable, once
   * per visit (declining or a broke hero pays nothing).
   */
  "wog.fishing_well": {
    id: "wog.fishing_well",
    name: "Fishing Well",
    category: "revisitable",
    interaction: {
      type: "PAY_TO",
      costOptions: [{ gold: 1 }],
      interaction: {
        type: "ATTACK_DIE_TABLE",
        plus: { type: "GAIN_RESOURCES", valuables: 1 },
        zero: { type: "GAIN_RESOURCES", gold: 2 },
        minus: { type: "NONE" }
      }
    },
    implementationStatus: "implemented",
    source: wogSource
  },

  /**
   * Living Skull — CHOOSE_ONE built at visit time (needs the `wogSkullSmashed`
   * latch): listen (Search 1 Ability, repeatable) or smash (+2 gold, then INERT
   * for everyone). Once smashed, the menu is absent (no visit).
   */
  "wog.living_skull": {
    id: "wog.living_skull",
    name: "Living Skull",
    category: "revisitable",
    // engine: the listen/smash menu is built at visit time; a smashed skull
    // (field.wogSkullSmashed) offers no menu.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: wogSource
  },

  /**
   * Adventure Cave — an escalating repeatable fight. Guarded difficulty 1 is
   * stamped by the Field Override definition; the reward ladder (win 1: +3 gold,
   * win 2: Treasure die, win 3: Search 1 Artifact) and the re-guard one higher
   * (Ⅰ→Ⅱ→Ⅲ, cleared after the 3rd win) are engine code in `beginFieldVisit`
   * (`handleWogAdventureCaveVisit`, keyed off `field.wogCaveWins`) — there is no
   * static interaction.
   */
  "wog.adventure_cave": {
    id: "wog.adventure_cave",
    name: "Adventure Cave",
    category: "revisitable",
    // engine: the escalating reward/re-guard is handled in beginFieldVisit.
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: wogSource
  },

  /**
   * Altar of the Gods — pay 3 valuables → choose +1 morale / +2 hero XP /
   * (Commanders module + a commander) +1 commander stat point. Menu built at
   * visit time (the commander arm is context-filtered).
   */
  "wog.altar_of_gods": {
    id: "wog.altar_of_gods",
    name: "Altar of the Gods",
    category: "revisitable",
    // engine: the offering menu is built at visit time (commander arm filtered).
    interaction: { type: "NONE" },
    implementationStatus: "implemented",
    source: wogSource
  }
};
