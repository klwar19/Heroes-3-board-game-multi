/**
 * Ninefold Realms Forced Battle Events — CONTENT only.
 *
 * The Forced Battle Event *mechanism* is global (`src/data/map/combat-scripts.ts`
 * registry + `src/engine/combat-scripts.ts` engine hook). This file only
 * registers anime/xianxia combat scripts into that catalog, keyed off the anime
 * location a fight happens on. See `docs/anime-mod-plan.md` §3.12.
 *
 * V1: only Bí Cảnh (Secret Realm) carries a guard among the current anime kinds,
 * so it is the only location with shipped scripts. Future guarded content
 * (isekai lairs, campaign set-pieces) attaches the same way — as data.
 */

import {
  registerCombatScriptDefinitions,
  type CombatScriptDefinition
} from "@/data/map/combat-scripts";

export const ANIME_COMBAT_SCRIPT_DEFINITIONS: Record<string, CombatScriptDefinition> = {
  /**
   * Linh Vụ (Spirit Mist) — a combat-start environment. The Secret Realm's
   * spirit mist smothers ranged sightlines: every RANGED unit (both sides)
   * fights at −1 Attack for the whole battle. Wired as a combat-long stat
   * modifier read live at attack resolution.
   */
  bi_canh_spirit_mist: {
    id: "bi_canh_spirit_mist",
    name: { en: "Spirit Mist", vi: "Linh Vụ" },
    locationId: "anime.bi_canh",
    requiresModule: "enabled",
    summary:
      "Combat-start: a spirit mist blankets the Secret Realm — every RANGED unit (both sides) fights at −1 Attack for the whole battle.",
    events: [
      {
        at: "combat-start",
        announce: {
          en: "Bí Cảnh — Linh Vụ (Spirit Mist) rolls across the field: every ranged unit fights at −1 Attack this battle.",
          vi: "Bí Cảnh — Linh Vụ dâng lên khắp trận: mọi đơn vị bắn xa chịu −1 Tấn công suốt trận."
        },
        effects: [
          {
            kind: "environment-stat",
            side: "both",
            unitType: "ranged",
            stat: "attack",
            amount: -1
          }
        ]
      }
    ]
  },

  /**
   * Địa Mạch Trào Dâng (Earthvein Surge) — a round-start (round 2) pulse. The
   * realm resists intruders: 1 effect damage to every unit of the ATTACKER's
   * (the fought hero's) side. Wired as effect damage through the normal removal
   * path (the applyElementalScourge precedent).
   */
  bi_canh_earthvein_surge: {
    id: "bi_canh_earthvein_surge",
    name: { en: "Earthvein Surge", vi: "Địa Mạch Trào Dâng" },
    locationId: "anime.bi_canh",
    requiresModule: "enabled",
    summary:
      "Round 2: the realm's earthvein surges, dealing 1 effect damage to every unit of the intruding (attacker) side.",
    events: [
      {
        at: "round-start",
        round: 2,
        announce: {
          en: "Bí Cảnh — Địa Mạch Trào Dâng (Earthvein Surge): the realm resists intruders, searing every attacking unit for 1 damage.",
          vi: "Bí Cảnh — Địa Mạch Trào Dâng: bí cảnh phản kháng, thiêu đốt mỗi đơn vị tấn công 1 sát thương."
        },
        effects: [{ kind: "damage-pulse", side: "attacker", amount: 1 }]
      }
    ]
  }
};

// Register into the global catalog at module load (mirrors field-overrides).
registerCombatScriptDefinitions(ANIME_COMBAT_SCRIPT_DEFINITIONS);

// Re-export helpers so existing imports from this path keep working.
export {
  getCombatScriptDefinition,
  listCombatScriptDefinitions,
  combatScriptsForLocation,
  type CombatScriptDefinition,
  type CombatScriptEffect,
  type CombatScriptEvent
} from "@/data/map/combat-scripts";
