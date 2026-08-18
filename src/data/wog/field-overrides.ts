/**
 * Wake of Gods adventure-map object CONTENT (`wog.newObjects`).
 *
 * The Field Override *mechanism* is global (`src/data/map/field-overrides.ts` +
 * `src/engine/field-overrides.ts`). This file only registers the WoG single-hex
 * objects into that catalog, mirroring the Anime content package
 * (`src/data/anime/field-overrides.ts`).
 *
 * These are board-ADAPTED readings of real WoG scripted objects — the printed
 * `summary` states EXACTLY what the engine runs (CLAUDE.md §1/§2). The per-object
 * simplifications are named in `src/data/wog/locations.ts` and in the CLAUDE.md
 * "WOG New Objects" bullet: WoG's Emerald Tower enchanted creatures (here it
 * trains the WOG commander, the hero, or one army unit card), the Mirror of the
 * Home-Way's full Town-Portal price table (here two fares by destination band),
 * the Junk Merchant's 32-artifact trade table (here tier-priced sells, a
 * discard-top trade-in, a once-per-player mystery crate and a 4-gold search), the
 * Fishing Well's variable catch (here a consecutive-round streak ladder that
 * fishes the well out on the third catch), the Living Skull's scripted lore (here
 * a Search/Smash choice whose smash latches the hex silent and leaves a Ⅱ spirit
 * guarding it), the Adventure Cave's dungeon crawl (here an escalating Ⅰ→Ⅱ→Ⅲ
 * guard ladder with a scaling reward), and the God's-Altar sacrifice table (here a
 * pay-3-valuables blessing choice plus a card-for-boon greater sacrifice).
 *
 * FO REDESIGN WAVE 4 (2026-08-19, docs/field-override-redesign-plan.md) is the
 * source of every "new arm / new price" above; the machine truth is
 * `buildWogFieldVisitStep` + `src/engine/wog-objects.test.ts`.
 *
 * ART: all kinds ship with real hex art on disk
 * (`public/assets/wog/field-overrides/<slug>.webp`, 512×512) — no glyph
 * placeholder registry needed (art wins over glyph, pinned in
 * `field-overrides.test.ts`).
 */

import {
  registerFieldOverrideDefinitions,
  type FieldOverrideDefinition
} from "@/data/map/field-overrides";

const art = (slug: string) => `/assets/wog/field-overrides/${slug}.webp`;

/**
 * The seven WoG override kinds. Every kind is package `"wog"`: it joins pool
 * draws / the designer palette ONLY when `wog.enabled && wog.newObjects` (the
 * package gate in `fieldOverridePackageAllowed`), and a designer pin of a wog
 * kind auto-enables the module at setup (`customMapHasWogFieldOverridePins`).
 */
export const WOG_FIELD_OVERRIDE_DEFINITIONS: Record<string, FieldOverrideDefinition> = {
  /**
   * Emerald Tower — WoG's commander-training tower (board-adapted). Guarded
   * (difficulty 3); after the win the visit opens a City-Hall-style CHOOSE_ONE:
   * pay 3 gold for a commander stat point (only with the Commanders module on
   * and a commander), pay 2 gold for +1 hero experience, pay 4 gold to drill one
   * chosen army unit card for +2 unit XP (Unit Experience rule on and a non-empty
   * army only — wave 4), or leave. Menu built dynamically in `beginFieldVisit`
   * (context-filtered arms).
   */
  emerald_tower: {
    id: "emerald_tower",
    locationId: "wog.emerald_tower",
    name: "Emerald Tower",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    guard: 3,
    implementationStatus: "implemented",
    summary:
      "Guarded (Ⅲ). After the win: pay 3 gold for +1 commander stat point (Commanders module only), 2 gold for +1 hero experience, or 4 gold to teach one chosen army unit card +2 unit XP (Unit Experience rule only).",
    image: art("emerald_tower")
  },

  /**
   * Mirror of the Home-Way — WoG's Town-Portal-for-a-price object (board-
   * adapted). Visit: teleport the hero to one of your Towns / Settlements (the
   * visitor picks when several are reachable), else leave. Wave 4 prices the jump
   * by the DESTINATION's tile band — 1 gold to a starting/far tile, 3 gold to a
   * near/center (or subterranean/sea/unresolvable) one — so there is one PAY_TO
   * arm per reachable fare. The teleport reuses the Town-Portal `TELEPORT_HERO`
   * destination machinery. With no reachable Town no pay arm is offered.
   */
  mirror_home_way: {
    id: "mirror_home_way",
    locationId: "wog.mirror_home_way",
    name: "Mirror of the Home-Way",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Teleport your Hero to one of your Towns or Settlements (Town-Portal style), priced by the destination's tile band: 1 gold to a starting/Ⅱ–Ⅲ tile, 3 gold to a Ⅳ+/centre/underground/sea one.",
    image: art("mirror_home_way")
  },

  /**
   * Junk Merchant — WoG's weak-artifact buyer (board-adapted). Visit: sell one
   * Artifact card from your hand for tier-priced gold (minor 2 / major 3 /
   * relic 4), or pay 4 gold to Search (1) the Artifact deck, or leave. Sold
   * cards leave the game (Trading-Post sell semantics). The sell arm is absent
   * with no Artifact in hand. Wave 4 adds: a per-card TRADE-IN (swap that hand
   * Artifact for the face-up TOP of the discard pile it belongs to, plus 1 gold —
   * nothing leaves the game; absent when that discard is empty), and a MYSTERY
   * CRATE once per player per game (`fieldClaimedBy`): pay 5 gold, then one
   * Attack die decides (+1 Search (1) Artifact + 2 gold back / 0 Search (1)
   * Artifact / −1 the 2 gold only). The crate's latch is the FIRST step inside
   * its PAY_TO, so it closes on every die face but never on a Decline.
   */
  junk_merchant: {
    id: "junk_merchant",
    locationId: "wog.junk_merchant",
    name: "Junk Merchant",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Sell a hand Artifact for gold by tier (minor 2 / major 3 / relic 4); trade one in for the face-up top card of that tier's Artifact discard plus 1 gold; pay 4 gold to Search (1) the Artifact deck; or once per player pay 5 gold for a mystery crate (Attack die: +1 → Search (1) Artifact + 2 gold, 0 → Search (1) Artifact, −1 → 2 gold back).",
    image: art("junk_merchant")
  },

  /**
   * Fishing Well — WoG's variable-catch well (board-adapted). Wave 4 replaced the
   * static pay-1-gold Attack-die gamble with a STREAK LADDER built at visit time
   * (`buildWogFieldVisitStep` + `ADVANCE_FISHING_STREAK`): pay 1 gold to fish,
   * once per player per GAME ROUND (`fieldRoundClaims`); the catch is +1
   * valuables on the first round, +2 on a second consecutive round, and on a
   * third one Treasure die AND `field.wogWellDry` — the well is then inert for
   * EVERYONE (mirroring the smashed skull). A skipped round restarts at 1.
   * Revisitable (1 MP), no guard; the location carries NONE.
   */
  fishing_well: {
    id: "fishing_well",
    locationId: "wog.fishing_well",
    name: "Fishing Well",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Pay 1 gold to fish, once per player per game round: the catch grows with your consecutive-round streak — 1 valuables, then 2 valuables, then a Treasure die, which fishes the well out for everyone.",
    image: art("fishing_well")
  },

  /**
   * Living Skull — WoG's talking skull (board-adapted). A CHOOSE_ONE built
   * dynamically: "listen to its secret" (Search (1) the Ability deck,
   * repeatable) OR "smash it" (+2 gold, then the field is INERT for EVERYONE —
   * a one-shot destruction latch, `field.wogSkullSmashed`). No guard,
   * revisitable until smashed. Menu built in `buildWogFieldVisitStep`. Wave 4:
   * the smash ALSO stamps an angry spirit at Ⅱ (inside `SMASH_WOG_SKULL`, so latch
   * and guard cannot desync); whoever beats it gets one Search (1) Ability from a
   * dedicated `beginFieldVisit` branch, and the hex is inert for good after that.
   */
  living_skull: {
    id: "living_skull",
    locationId: "wog.living_skull",
    name: "Living Skull",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Choose: listen for a Search (1) of the Ability deck (repeatable), or smash it for 2 gold — which silences it for everyone forever and leaves an angry spirit guarding the hex at Ⅱ; whoever beats that spirit gains a Search (1) Ability and the hex then goes inert for good.",
    image: art("living_skull")
  },

  /**
   * Adventure Cave — WoG's escalating dungeon (board-adapted). Guarded Ⅰ on
   * first entry; each WIN pays a reward that scales with the win count (1st: +3
   * gold, 2nd — wave 4 — a FIXED Stack Token of the player's chosen stat onto a
   * chosen token-free army unit card, falling back to the old Treasure die when no
   * card is eligible, 3rd: Search (1) the Artifact deck) and RE-GUARDS
   * the hex one difficulty higher (Ⅰ→Ⅱ→Ⅲ). After the 3rd win it is cleared for
   * good. Handled by a dedicated branch in `beginFieldVisit`
   * (`handleWogAdventureCaveVisit`); `field.wogCaveWins` counts the wins.
   */
  adventure_cave: {
    id: "adventure_cave",
    locationId: "wog.adventure_cave",
    name: "Adventure Cave",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    guard: 1,
    implementationStatus: "implemented",
    summary:
      "Escalating fight (guarded Ⅰ→Ⅱ→Ⅲ). Each win pays a bigger reward (+3 gold; then a fixed Stack Token of your chosen stat on a chosen army unit card without one — a Treasure die when none is eligible; then Search (1) Artifact) and re-guards one higher; cleared after the 3rd win.",
    image: art("adventure_cave")
  },

  /**
   * Altar of the Gods — WoG's God's-Altar sacrifice (board-adapted). Pay 3
   * valuables, then choose a blessing: +1 morale, +2 hero experience, or — only
   * with the Commanders module on AND a commander present — +1 commander stat
   * point. Revisitable (1 MP), no guard. Menu built in `buildWogFieldVisitStep`.
   * Wave 4 adds a GREATER SACRIFICE arm, offered only with ≥2 army unit cards so
   * it can never strand an army: permanently remove one chosen unit card (the CARD
   * leaves the game — a Pack does NOT flip to Few), then take +1 commander stat
   * point AND +1 morale (Commanders module + a commander) or +4 hero experience.
   */
  altar_of_gods: {
    id: "altar_of_gods",
    locationId: "wog.altar_of_gods",
    name: "Altar of the Gods",
    package: "wog",
    tileGroups: ["far", "near", "center", "subterranean"],
    terrain: "land",
    implementationStatus: "implemented",
    summary:
      "Pay 3 valuables, then choose a blessing: +1 morale, +2 hero experience, or +1 commander stat point (Commanders module only). Or make a greater sacrifice (needs 2+ army unit cards): remove one chosen unit card from the game for +1 commander stat point AND +1 morale (Commanders module) or +4 hero experience.",
    image: art("altar_of_gods")
  }
};

/** Every wog override kind id (pool/palette membership + tests). */
export const WOG_FIELD_OVERRIDE_KIND_IDS: readonly string[] = Object.keys(
  WOG_FIELD_OVERRIDE_DEFINITIONS
);

/** The location ids the seven kinds carve (dynamic-menu gate in beginFieldVisit). */
export const WOG_FIELD_OVERRIDE_LOCATION_IDS: ReadonlySet<string> = new Set(
  Object.values(WOG_FIELD_OVERRIDE_DEFINITIONS).map((def) => def.locationId)
);

// Register into the global catalog at module load.
registerFieldOverrideDefinitions(WOG_FIELD_OVERRIDE_DEFINITIONS);
