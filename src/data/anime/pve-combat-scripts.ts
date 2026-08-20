/**
 * PvE-encounter field effects (dungeon/raid-boss variant expansion §E) —
 * CONTENT only, registered into the global Forced Battle Events catalog.
 *
 * WHY A SECOND SELECTION PATH: `combatScriptsForLocation` keys scripts on the
 * fought field's LOCATION id, but every rift lair is `rift_lair` and every
 * dungeon floor is `dungeon_gate` — a location-keyed script would fire
 * identically on every boss and on every floor. So each script here carries
 * `scope: "pve-encounter"` (which keeps it out of the location path entirely)
 * and is selected by ENCOUNTER IDENTITY through `pveEncounterScriptsForCombat`
 * (src/engine/combat-scripts.ts) off the two id tables at the bottom of this
 * file. Wave assaults are deliberately excluded — they already carry their own
 * battle-event rotation.
 *
 * These scripts carry NO `requiresModule`: the PvE modules are reachable from
 * BOTH the WOG and the anime surfaces, and the combat context (raid boss /
 * dungeon floor) is itself the gate — it cannot exist with the modules off.
 */

import {
  registerCombatScriptDefinitions,
  type CombatScriptDefinition
} from "@/data/map/combat-scripts";
import type { ResolvedPveEncounterTheme } from "@/engine/state";

/** The three floor bands the Dungeon's character changes across. */
export type PveFloorBand = "shallow" | "deep" | "abyss";

export function pveFloorBand(floor: number): PveFloorBand {
  return floor <= 3 ? "shallow" : floor <= 7 ? "deep" : "abyss";
}

const script = (
  id: string,
  en: string,
  vi: string,
  summary: string,
  events: CombatScriptDefinition["events"]
): CombatScriptDefinition => ({
  id,
  name: { en, vi },
  scope: "pve-encounter",
  summary,
  events
});

export const PVE_COMBAT_SCRIPT_DEFINITIONS: Record<string, CombatScriptDefinition> = {
  // ——— Dungeon, classic theme ———————————————————————————————————————————
  pve_dungeon_classic_shallow: script(
    "pve_dungeon_classic_shallow",
    "Dripping Dark",
    "Bóng Tối Rỉ Nước",
    "Dungeon floors 1–3: flavour at combat start; on round 3 the passage narrows — up to 2 Combat Obstacles on the four central spaces.",
    [
      {
        at: "combat-start",
        announce: {
          en: "The shallow dark drips around you.",
          vi: "Bóng tối tầng nông rỉ nước quanh bạn."
        },
        effects: [{ kind: "announce" }]
      },
      {
        at: "round-start",
        round: 3,
        announce: {
          en: "The passage narrows — rubble blocks the centre of the floor.",
          vi: "Lối đi thu hẹp — đá vụn chặn giữa tầng hầm."
        },
        effects: [{ kind: "place-obstacles", cells: [9, 10, 13, 14], count: 2 }]
      }
    ]
  ),
  pve_dungeon_classic_deep: script(
    "pve_dungeon_classic_deep",
    "Low Ceilings",
    "Trần Thấp",
    "Dungeon floors 4–7: every RANGED unit of the delving side fights at −1 Attack for the whole battle; on round 4 the ceiling collapses — 2 obstacles on random empty spaces.",
    [
      {
        at: "combat-start",
        announce: {
          en: "Low ceilings foul your shots: your ranged units fight at −1 Attack.",
          vi: "Trần thấp cản đường bắn: đơn vị bắn xa của bạn chịu −1 Tấn công."
        },
        effects: [
          { kind: "environment-stat", side: "attacker", unitType: "ranged", stat: "attack", amount: -1 }
        ]
      },
      {
        at: "round-start",
        round: 4,
        announce: {
          en: "The ceiling collapses — rubble scatters across the floor.",
          vi: "Trần sập — đá vụn văng khắp tầng."
        },
        effects: [{ kind: "random-obstacle", count: 2 }]
      }
    ]
  ),
  pve_dungeon_classic_abyss: script(
    "pve_dungeon_classic_abyss",
    "Abyssal Pressure",
    "Áp Lực Vực Thẳm",
    "Dungeon floors 8–10: every unit on BOTH sides fights at −1 Defense for the whole battle; on rounds 3 and 5 the pressure deals 1 effect damage to every delving unit.",
    [
      {
        at: "combat-start",
        announce: {
          en: "Nothing down here protects anyone: every unit fights at −1 Defense.",
          vi: "Dưới này không gì bảo vệ ai: mọi đơn vị chịu −1 Phòng thủ."
        },
        effects: [{ kind: "environment-stat", side: "both", stat: "defense", amount: -1 }]
      },
      {
        at: "round-start",
        round: 3,
        announce: {
          en: "Abyssal pressure crushes the delvers for 1 damage.",
          vi: "Áp lực vực thẳm nghiền đoàn thám hiểm 1 sát thương."
        },
        effects: [{ kind: "damage-pulse", side: "attacker", amount: 1 }]
      },
      {
        at: "round-start",
        round: 5,
        announce: {
          en: "Abyssal pressure crushes the delvers for 1 damage.",
          vi: "Áp lực vực thẳm nghiền đoàn thám hiểm 1 sát thương."
        },
        effects: [{ kind: "damage-pulse", side: "attacker", amount: 1 }]
      }
    ]
  ),

  // ——— Dungeon, doom theme —————————————————————————————————————————————
  pve_dungeon_doom_shallow: script(
    "pve_dungeon_doom_shallow",
    "Radiation Leak",
    "Rò Rỉ Phóng Xạ",
    "Doom dungeon floors 1–3: on round 2 a radiation leak deals 1 effect damage to every delving unit.",
    [
      {
        at: "round-start",
        round: 2,
        announce: {
          en: "A radiation leak burns the intruders for 1 damage.",
          vi: "Phóng xạ rò rỉ thiêu kẻ đột nhập 1 sát thương."
        },
        effects: [{ kind: "damage-pulse", side: "attacker", amount: 1 }]
      }
    ]
  ),
  pve_dungeon_doom_deep: script(
    "pve_dungeon_doom_deep",
    "Hell Empowers Its Own",
    "Địa Ngục Tiếp Sức",
    "Doom dungeon floors 4–7: every defending (Hell) unit fights at +1 Attack for the whole battle; on round 4 the structure collapses — 2 obstacles on random empty spaces.",
    [
      {
        at: "combat-start",
        announce: {
          en: "Hell empowers its own: every defender fights at +1 Attack.",
          vi: "Địa ngục tiếp sức cho quân mình: mọi kẻ phòng thủ +1 Tấn công."
        },
        effects: [{ kind: "environment-stat", side: "defender", stat: "attack", amount: 1 }]
      },
      {
        at: "round-start",
        round: 4,
        announce: {
          en: "Structural collapse — debris blocks the floor.",
          vi: "Kết cấu sụp đổ — mảnh vỡ chặn tầng hầm."
        },
        effects: [{ kind: "random-obstacle", count: 2 }]
      }
    ]
  ),
  pve_dungeon_doom_abyss: script(
    "pve_dungeon_doom_abyss",
    "The Furnace Mends Its Keeper",
    "Lò Lửa Hàn Gắn Chủ Nhân",
    "Doom dungeon floors 8–10: on round 3 the furnace heals 1 damage on the LAYERED warden only (never a lost health bar, never the escort); on round 5 it burns every delving unit for 1.",
    [
      {
        at: "round-start",
        round: 3,
        announce: {
          en: "The furnace mends its keeper.",
          vi: "Lò lửa hàn gắn kẻ canh giữ."
        },
        effects: [{ kind: "side-heal", side: "defender", amount: 1, bossOnly: true }]
      },
      {
        at: "round-start",
        round: 5,
        announce: {
          en: "The furnace flares — 1 damage to every intruding unit.",
          vi: "Lò lửa bùng cháy — 1 sát thương lên mỗi đơn vị đột nhập."
        },
        effects: [{ kind: "damage-pulse", side: "attacker", amount: 1 }]
      }
    ]
  ),

  // ——— Rift Lairs, per boss ————————————————————————————————————————————
  pve_lair_healing_miasma: script(
    "pve_lair_healing_miasma",
    "Healing Miasma",
    "Chướng Khí Hồi Sinh",
    "Rift Lair: on every EVEN round (2/4/6/8) the miasma heals 1 damage on the LAYERED boss only — never a lost health bar, never the escort.",
    [2, 4, 6, 8].map((round) => ({
      at: "round-start" as const,
      round,
      announce: {
        en: "A healing miasma knits the boss back together (1 damage healed).",
        vi: "Chướng khí hồi sinh vá lại trùm (hồi 1 sát thương)."
      },
      effects: [{ kind: "side-heal" as const, side: "defender" as const, amount: 1, bossOnly: true }]
    }))
  ),
  pve_lair_flooded: script(
    "pve_lair_flooded",
    "Flooded Lair",
    "Hang Ngập Nước",
    "Rift Lair: every GROUND unit of the attacking side fights at −1 Attack for the whole battle.",
    [
      {
        at: "combat-start",
        announce: {
          en: "The lair is flooded — your ground units fight at −1 Attack.",
          vi: "Hang ngập nước — đơn vị mặt đất của bạn chịu −1 Tấn công."
        },
        effects: [
          { kind: "environment-stat", side: "attacker", unitType: "ground", stat: "attack", amount: -1 }
        ]
      }
    ]
  ),
  pve_lair_ash_storm: script(
    "pve_lair_ash_storm",
    "Ash Storm",
    "Bão Tro",
    "Rift Lair: on round 3 an ash storm deals 1 effect damage to every attacking unit.",
    [
      {
        at: "round-start",
        round: 3,
        announce: {
          en: "An ash storm sweeps the lair — 1 damage to every attacking unit.",
          vi: "Bão tro quét qua hang — 1 sát thương lên mỗi đơn vị tấn công."
        },
        effects: [{ kind: "damage-pulse", side: "attacker", amount: 1 }]
      }
    ]
  ),
  pve_lair_thickening_nest: script(
    "pve_lair_thickening_nest",
    "The Nest Thickens",
    "Tổ Dày Lên",
    "Rift Lair: on round 2 the nest thickens — 3 Combat Obstacles on random empty spaces.",
    [
      {
        at: "round-start",
        round: 2,
        announce: {
          en: "The nest thickens — webbing and spawn block the field.",
          vi: "Tổ dày lên — tơ và ấu trùng chặn chiến trường."
        },
        effects: [{ kind: "random-obstacle", count: 3 }]
      }
    ]
  ),
  pve_lair_unmaking_presence: script(
    "pve_lair_unmaking_presence",
    "The God's Presence",
    "Uy Áp Thần Linh",
    "Rift Lair: every unit on BOTH sides fights at −1 Defense for the whole battle.",
    [
      {
        at: "combat-start",
        announce: {
          en: "The god's presence unmakes armour: every unit fights at −1 Defense.",
          vi: "Uy áp thần linh phá giáp: mọi đơn vị chịu −1 Phòng thủ."
        },
        effects: [{ kind: "environment-stat", side: "both", stat: "defense", amount: -1 }]
      }
    ]
  )
};

/**
 * Rift-Lair scripts keyed by the boss's DEF id (never by theme: a boss id
 * already belongs to exactly one theme, and a DESIGNER lair may place any boss
 * in any themed game — a theme-keyed table would silently drop its script).
 * A boss with no entry fights clean.
 */
export const PVE_LAIR_SCRIPT_IDS: Record<string, readonly string[]> = {
  abyss_kraken: ["pve_lair_flooded"],
  calamity_dragon: ["pve_lair_ash_storm"],
  avatar_of_erebos: ["pve_lair_unmaking_presence"],
  lich_archon: ["pve_lair_healing_miasma"],
  mother_demon: ["pve_lair_thickening_nest"]
};

/** Dungeon scripts by frozen theme and floor band. */
export const PVE_FLOOR_SCRIPT_IDS: Record<
  ResolvedPveEncounterTheme,
  Record<PveFloorBand, readonly string[]>
> = {
  classic: {
    shallow: ["pve_dungeon_classic_shallow"],
    deep: ["pve_dungeon_classic_deep"],
    abyss: ["pve_dungeon_classic_abyss"]
  },
  doom: {
    shallow: ["pve_dungeon_doom_shallow"],
    deep: ["pve_dungeon_doom_deep"],
    abyss: ["pve_dungeon_doom_abyss"]
  }
};

// Register into the global catalog at module load (mirrors the anime scripts).
registerCombatScriptDefinitions(PVE_COMBAT_SCRIPT_DEFINITIONS);
