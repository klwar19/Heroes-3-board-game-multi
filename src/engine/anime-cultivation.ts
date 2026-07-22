/**
 * Anime Cultivation & Heavenly Tribulation (`anime.cultivation`, plan §5.6).
 *
 * This is the LEAF read-layer for the per-hero Cultivation Realm track: it
 * imports only `./state` (types), `./anime` (the module gate) and `./events`
 * (feed events), so BOTH heavy modules that consume its grants — `adventure.ts`
 * (hand limit, level-up advance, the Tribulation visit steps) and `permanents.ts`
 * (documented cross-check) — can import it with no import cycle. The main-hero
 * lookup is inlined here for the same reason (getMainHero lives in adventure.ts,
 * which imports this module) — a small, deliberate duplication mirroring how
 * `effectiveHandLimit` inlines the permanent bonus to dodge the same cycle.
 *
 * Default OFF ⇒ every helper returns 0/false and stamps nothing, so a
 * module-off table and every legacy snapshot are byte-identical.
 *
 * ADAPTATIONS from the plan (documented at the plan doc too):
 *  - No Elixir Pills yet ⇒ the "consume a Foundation Pill" alternative path to
 *    realm 1 is NOT wired — only the hero-level threshold advances the realm.
 *  - No Secret Realm banks / Dungeon yet ⇒ Core Formation's "≥1 Secret Realm
 *    won" becomes "≥1 CREATURE BANK won" (the mod-agnostic `player.bankWins`).
 */

import { appendEvent } from "./events";
import { animeModuleEnabled } from "./anime";
import { factionVisualRegister, type FactionVisualRegister } from "@/data/faction-theme";
import type { GameState, HeroState, PlayerId } from "./state";

export type CultivationRealm = 0 | 1 | 2 | 3;
export type CultivationRealmLabel = { en: string; vi: string };
export type CultivationRealmRegisterKey = FactionVisualRegister | "modao";

/** Presentation-only realm names by faction family; mechanics still read 0–3. */
export const CULTIVATION_REALM_REGISTERS: Record<CultivationRealmRegisterKey, Record<CultivationRealm, CultivationRealmLabel>> = {
  classic: {
    0: { en: "Novice", vi: "Tập Sự" },
    1: { en: "Adept", vi: "Thành Thạo" },
    2: { en: "Master", vi: "Bậc Thầy" },
    3: { en: "Archmage", vi: "Đại Pháp Sư" }
  },
  anime: {
    0: { en: "Awakened", vi: "Thức Tỉnh" },
    1: { en: "Adept", vi: "Tinh Anh" },
    2: { en: "Ascendant", vi: "Thăng Hoa" },
    3: { en: "Transcendent", vi: "Siêu Việt" }
  },
  wuxia: {
    0: { en: "Qi Refinement", vi: "Luyện Khí" },
    1: { en: "Foundation", vi: "Trúc Cơ" },
    2: { en: "Core Formation", vi: "Kim Đan" },
    3: { en: "Nascent Soul", vi: "Nguyên Anh" }
  },
  modao: {
    0: { en: "Blood Refinement", vi: "Luyện Huyết" },
    1: { en: "Demon Foundation", vi: "Ma Cơ" },
    2: { en: "Demon Core", vi: "Ma Đan" },
    3: { en: "Devil Soul", vi: "Ma Anh" }
  }
};

/** Backwards-compatible wuxia ladder for callers that do not own faction context. */
export const CULTIVATION_REALMS = CULTIVATION_REALM_REGISTERS.wuxia;

export function cultivationRealmRegisterKey(factionId: string | undefined): CultivationRealmRegisterKey {
  return factionId === "heavenly_demon" ? "modao" : factionVisualRegister(factionId);
}

export function cultivationRealmLabel(state: GameState, playerId: PlayerId, realm: CultivationRealm): CultivationRealmLabel {
  const register = cultivationRealmRegisterKey(state.players[playerId]?.factionId);
  return CULTIVATION_REALM_REGISTERS[register][realm];
}

/** Hero level that automatically reaches Foundation (realm 1). */
export const FOUNDATION_LEVEL = 3;
/** Hero level (WITH a bank win) that automatically reaches Core Formation (realm 2). */
export const CORE_FORMATION_LEVEL = 5;
/** Creature-bank wins required (adaptation of "≥1 Secret Realm won") for realm 2. */
export const CORE_FORMATION_BANK_WINS = 1;
/** Hero level required to be OFFERED the Heavenly Tribulation (realm 2 → 3). */
export const NASCENT_SOUL_LEVEL = 7;

/** Whether the Cultivation module is on (implies anime master enabled). */
export function cultivationEnabled(state: Pick<GameState, "anime">): boolean {
  return animeModuleEnabled(state, "cultivation");
}

/** The player's MAIN hero (inlined to keep this a leaf — see the file header). */
function mainHeroOf(state: GameState, playerId: PlayerId): HeroState | null {
  for (const hero of Object.values(state.heroes)) {
    if (hero.controllerId === playerId && hero.kind === "main") {
      return hero;
    }
  }
  return null;
}

/**
 * The Cultivation Realm the player's grants read from — their MAIN hero's realm
 * (0 when unstamped / no hero / module off). Every player-scoped grant (hand
 * limit, spell Power, combat reroll) keys off this, consistent with how the
 * per-player permanents are read.
 */
export function cultivationRealmOf(state: GameState, playerId: PlayerId): CultivationRealm {
  if (!cultivationEnabled(state)) {
    return 0;
  }
  return mainHeroOf(state, playerId)?.cultivationRealm ?? 0;
}

/** Realm 1 Foundation grant: +1 hand limit. Folded at every hand-limit aggregation site. */
export function cultivationHandLimitBonus(state: GameState, playerId: PlayerId): number {
  return cultivationRealmOf(state, playerId) >= 1 ? 1 : 0;
}

/** Realm 3 Nascent Soul grant: +1 Power on the player's spell casts. */
export function cultivationSpellPowerBonus(state: GameState, playerId: PlayerId): number {
  return cultivationRealmOf(state, playerId) >= 3 ? 1 : 0;
}

/**
 * Realm 2 Core Formation grant: 1 free Attack-die reroll per combat. Returns 1
 * while the player's main hero is at realm ≥ 2 (the per-combat spent flag lives
 * on combatStats.cultivationRerollUsed, checked at the reroll-source assembly).
 */
export function cultivationCombatRerollBonus(state: GameState, playerId: PlayerId): number {
  return cultivationRealmOf(state, playerId) >= 2 ? 1 : 0;
}

/**
 * Advance the player's MAIN hero through the AUTOMATIC realms (1 Foundation /
 * 2 Core Formation) the moment their thresholds are met. Called on hero level-up
 * and on a Creature-Bank win. Realm 3 (Nascent Soul) is NEVER automatic — it
 * needs a won Heavenly Tribulation — so this caps advancement at realm 2 and
 * never touches a realm-3 hero. Idempotent: it advances one realm at a time and
 * only while `current < target`, so each realm's feed event fires exactly once
 * (including a jump, e.g. reaching level 5 + a bank win while still realm 0).
 */
export function maybeAdvanceCultivationRealm(state: GameState, playerId: PlayerId): void {
  if (!cultivationEnabled(state)) {
    return;
  }
  const hero = mainHeroOf(state, playerId);
  if (!hero) {
    return;
  }
  const current = hero.cultivationRealm ?? 0;
  if (current >= 3) {
    return;
  }
  const bankWins = state.players[playerId]?.bankWins ?? 0;
  let target: 0 | 1 | 2 = 0;
  if (hero.level >= FOUNDATION_LEVEL) {
    target = 1;
  }
  if (hero.level >= CORE_FORMATION_LEVEL && bankWins >= CORE_FORMATION_BANK_WINS) {
    target = 2;
  }
  let realm = current;
  while (realm < target) {
    realm += 1;
    hero.cultivationRealm = realm as 1 | 2;
    appendEvent(state, {
      type: "CULTIVATION_REALM_ADVANCED",
      playerId,
      heroId: hero.id,
      realm: realm as 1 | 2
    });
  }
}

/**
 * Whether the Heavenly Tribulation (realm 2 → 3) may be OFFERED to `playerId`
 * right now — module on, MAIN hero on the map at Core Formation (realm 2) with
 * level ≥ 7, no Tribulation won yet, and not already attempted this turn. The
 * caller additionally gates on "no other exclusive interaction open".
 */
export function tribulationAvailable(state: GameState, playerId: PlayerId): boolean {
  if (!cultivationEnabled(state)) {
    return false;
  }
  const hero = mainHeroOf(state, playerId);
  if (!hero || hero.spaceId === null) {
    return false;
  }
  return (
    (hero.cultivationRealm ?? 0) === 2 &&
    hero.level >= NASCENT_SOUL_LEVEL &&
    !hero.tribulationWon &&
    hero.tribulationAttemptedRound !== state.round
  );
}
