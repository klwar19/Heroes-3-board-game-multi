/**
 * Wake of Gods single-hex map locations (`wog.newObjects`).
 *
 * Registered into `locationDefinitions` so a Field Override carve always
 * resolves. Placement is gated by the wog package (`wog.enabled &&
 * wog.newObjects`) / designer pins — see `src/data/wog/field-overrides.ts`.
 *
 * FO REDESIGN WAVE 4 (2026-08-19, docs/field-override-redesign-plan.md): every
 * object below gained a new arm or a new price, and the Fishing Well left its
 * static interaction entirely — so ALL SEVEN now carry `interaction: NONE` and
 * build their menu in `buildWogFieldVisitStep` / a dedicated `beginFieldVisit`
 * branch.
 *
 * All seven carry `interaction: NONE`: their visit MENUS are built dynamically
 * in `beginFieldVisit` (`buildWogFieldVisitStep`), because each arm is
 * context-filtered against live state (commander presence, controlled Towns,
 * hand Artifacts) exactly like a City-Hall choice — a static LocationInteraction
 * cannot express that. Every menu arm is a wired VisitStep leaf, so there is no
 * decorative text (CLAUDE.md §1/§2).
 *
 * Board-adaptation notes (deliberate, leading with the limits):
 *  - Emerald Tower: WoG enchants a creature stack; here it TRAINS the WOG
 *    commander (a commander stat point), the hero (experience) or — with the Unit
 *    Experience rule on — ONE army unit card (pay 4 gold for +2 unit XP; the arm
 *    is absent with the rule off or an empty army). No creature enchant arm.
 *  - Mirror of the Home-Way: WoG's full Town-Portal price/movement table is
 *    reduced to TWO fares by destination band — 1 gold to a Town/Settlement on a
 *    starting or Ⅱ–Ⅲ tile, 3 gold to a Ⅳ+/centre one (subterranean, sea and an
 *    unresolvable tile are priced at the dearer tier). One PAY_TO arm per fare.
 *  - Junk Merchant: WoG's 32-artifact fixed trade table is reduced to
 *    tier-priced sells (minor 2 / major 3 / relic 4), a per-card TRADE-IN (swap a
 *    hand Artifact for the face-up top of that tier's Artifact discard + 1 gold;
 *    nothing leaves the game), a once-per-player MYSTERY CRATE (pay 5 gold, one
 *    Attack die: +1 → Search (1) Artifact + 2 gold back, 0 → Search (1) Artifact,
 *    −1 → just the 2 gold back) plus the paid Artifact search.
 *  - Fishing Well: WoG's variable catch is a STREAK ladder — pay 1 gold, once per
 *    player per GAME ROUND; catch 1 → +1 valuables, a second consecutive round →
 *    +2 valuables, a third → one Treasure die AND the well runs dry for EVERYONE
 *    (`wogWellDry`, mirroring the smashed skull). A skipped round restarts the
 *    streak at 1. Revisitable; the whole menu is dynamic.
 *  - Living Skull: WoG's scripted lore is a Search/Smash CHOOSE_ONE; smashing
 *    sets a permanent per-field destruction latch (`wogSkullSmashed`) AND leaves
 *    an angry spirit guarding the hex at Ⅱ. Whoever beats that spirit collects one
 *    Search (1) Ability, and the hex is then inert for everyone forever. Listen
 *    (Search 1 Ability) is repeatable until the smash.
 *  - Adventure Cave: an escalating repeatable fight (guarded Ⅰ→Ⅱ→Ⅲ). Each win
 *    scales the reward and re-guards one higher; cleared after the 3rd win. The
 *    2nd win places a FIXED Stack Token (the player picks the card and the stat)
 *    on a token-free army unit card, falling back to a Treasure die when no card
 *    is eligible. The whole reward/re-guard flow is engine code in
 *    `beginFieldVisit`, not a static interaction (the location carries NONE).
 *  - Altar of the Gods: pay 3 valuables → choose +1 morale / +2 hero XP /
 *    (Commanders module) +1 commander stat point. A per-round latch was
 *    deliberately NOT added — plain revisitable (1 MP), gated only by the
 *    3-valuables cost each visit. A GREATER SACRIFICE arm (only with ≥2 army unit
 *    cards, so it can never strand an army) permanently removes one chosen unit
 *    card — the CARD leaves the game, a Pack does not flip — for either +1
 *    commander stat point AND +1 morale (Commanders module) or +4 hero XP.
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
   * Fishing Well — pay 1 gold to fish, once per player per GAME ROUND. The catch
   * grows with that player's CONSECUTIVE-round streak (1 → +1 valuables, 2 → +2
   * valuables, 3 → one Treasure die AND the well runs dry for everyone). Built
   * at visit time (`buildWogFieldVisitStep` + `ADVANCE_FISHING_STREAK`), because
   * the payout depends on live per-player field state — hence NONE here, not the
   * old static PAY_TO + ATTACK_DIE_TABLE.
   */
  "wog.fishing_well": {
    id: "wog.fishing_well",
    name: "Fishing Well",
    category: "revisitable",
    // engine: the streak-priced fishing menu is built at visit time; a dry well
    // (field.wogWellDry) and a player who already fished this round get no menu.
    interaction: { type: "NONE" },
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
