/**
 * Neutral-side veteran tracks (Bulwark / Factory / Forge Neutral sides).
 *
 * A stack owned by the Neutral guard player, or fighting on its printed Neutral
 * side, follows `NEUTRAL_SIDE_VETERANCY_OVERRIDES` instead of the faction track
 * (whose Rune / card-draw ranks do nothing for a guard). Every claim below is
 * an observable fold (stats, granted abilities, the displayed ladder) and
 * FAILS if the Neutral-side resolution is removed; each has a CONTROL showing
 * the same unit on its player side still gets the faction track.
 */
import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { unitAbilities } from "@/data/units/abilities";
import { NEUTRAL_SIDE_VETERANCY_OVERRIDES } from "@/data/units/custom-experience-overrides";
import { hasNeutralSideRankSchedule, rankScheduleFor } from "@/data/units/experience";
import { combatUnitVeterancy } from "@/components/table/unit-veterancy";
import { makeCombatUnitFromArmy, makeCombatUnitFromNeutral } from "./adventure";
import { applyUnitCurrentSide } from "./unit-transforms";
import {
  applyNeutralRoundsRank,
  armyUnitRankInfo,
  combatUnitRankScheduleSide,
  rankMirrorXp,
  unitRankAbilityGainsAt,
  unitRankStatGainsAt
} from "./unit-experience";
import { NEUTRAL_PLAYER_ID, type CombatUnitState } from "./state";

/** A Neutral-owned guard minted like the reveal seam, folded to `rank`. */
function guard(unitDefId: string, rank: number, options: { pack?: boolean } = {}): CombatUnitState {
  const def = coreUnitDefinitions[unitDefId]!;
  const unit = makeCombatUnitFromNeutral(
    { unitDefId, tier: def.tier, ...(options.pack ? { factionPack: true } : {}) },
    "guard_1",
    0,
    "legacy"
  )!;
  if (rank > 0) unit.unitExperience = rankMirrorXp(def.tier, rank);
  applyUnitCurrentSide(unit, "legacy");
  return unit;
}

/** A player's army card of `side`, built for combat at `rank`. */
function playerCard(unitDefId: string, side: "few" | "pack" | "neutral", rank: number): CombatUnitState {
  const def = coreUnitDefinitions[unitDefId]!;
  return makeCombatUnitFromArmy(
    { id: "army_1", unitDefId, side, ...(rank > 0 ? { experience: rankMirrorXp(def.tier, rank) } : {}) },
    "p1",
    "unit_p1_1",
    0,
    "legacy"
  )!;
}

describe("Neutral-side veteran tracks — combat fold", () => {
  it("a Neutral Yeti guard's R1 is +1 Attack; CONTROL: a player's Pack Yeti R1 is still +1 HP", () => {
    const base = guard("bulwark.yetis", 0);
    const ranked = guard("bulwark.yetis", 1);
    expect(ranked.controllerId).toBe(NEUTRAL_PLAYER_ID);
    expect(ranked.unitRank).toBe(1);
    expect(ranked.attack).toBe(base.attack + 1);
    expect(ranked.maxHealth).toBe(base.maxHealth);
    // A mid-combat printed-side recompute re-folds the SAME track.
    applyUnitCurrentSide(ranked, "legacy");
    expect(ranked.attack).toBe(base.attack + 1);
    expect(ranked.maxHealth).toBe(base.maxHealth);

    const packBase = playerCard("bulwark.yetis", "pack", 0);
    const packRanked = playerCard("bulwark.yetis", "pack", 1);
    expect(packRanked.attack).toBe(packBase.attack);
    expect(packRanked.maxHealth).toBe(packBase.maxHealth + 1);
  });

  it("an Elite Neutral Jotunn swaps the inert Rune ranks for Skyward Guard / Ageing Breath / Ice Bolt; CONTROL: player Pack keeps Rune Bolt", () => {
    const elite = guard("bulwark.jotunns", 3);
    expect(elite.abilities).toEqual(expect.arrayContaining(["veteran-flying-guard", "ntv-ageing-breath", "veteran-ice-bolt"]));
    expect(elite.abilities).not.toContain("town-jotunn-rune-hide");
    expect(elite.abilities).not.toContain("town-jotunn-rune-bolt");

    const pack = playerCard("bulwark.jotunns", "pack", 3);
    expect(pack.abilities).toEqual(expect.arrayContaining(["town-jotunn-rune-hide", "town-jotunn-rune-bolt"]));
    expect(pack.abilities).not.toContain("veteran-ice-bolt");
  });

  it("a Neutral-owned Random Town PACK guard also follows the Neutral-side track (Mammoths R1: +1 HP, not Rune Mend)", () => {
    const base = guard("bulwark.mammoths", 0, { pack: true });
    const ranked = guard("bulwark.mammoths", 1, { pack: true });
    expect(ranked.variant).toBe("pack");
    expect(ranked.maxHealth).toBe(base.maxHealth + 1);
    expect(ranked.abilities).not.toContain("town-mammoth-rune-mend");

    // CONTROL: the same Pack card in a player's army takes the faction Rune Mend.
    const packBase = playerCard("bulwark.mammoths", "pack", 0);
    const packRanked = playerCard("bulwark.mammoths", "pack", 1);
    expect(packRanked.abilities).toContain("town-mammoth-rune-mend");
    expect(packRanked.maxHealth).toBe(packBase.maxHealth);
  });

  it("Neutral Rank-Up field guards fold the Neutral-side track (Kobolds by round 5: +1 HP and Bone Wall, not +2 HP / Guarded Stance)", () => {
    const def = coreUnitDefinitions["bulwark.kobolds"]!;
    const base = makeCombatUnitFromNeutral({ unitDefId: def.id, tier: def.tier }, "g", 0, "legacy")!;
    const ranked = makeCombatUnitFromNeutral({ unitDefId: def.id, tier: def.tier }, "g", 0, "legacy")!;
    applyNeutralRoundsRank(ranked, 5);
    expect(ranked.unitRank).toBe(2);
    expect(ranked.maxHealth).toBe(base.maxHealth + 1);
    expect(ranked.abilities).toContain("ntv-bone-wall");
    expect(ranked.abilities).not.toContain("veteran-guarded-stance");
    // CONTROL: the faction track pays +2 HP at R1 and Guarded Stance at R2.
    expect(unitRankStatGainsAt(def.id, def.tier, 1).health).toBe(2);
    expect(unitRankAbilityGainsAt(def.id, 2)).toEqual(["veteran-guarded-stance"]);
  });

  it("a player's recruited Neutral-side card uses the Neutral-side track in combat; CONTROL: its Pack side does not", () => {
    const neutralCard = playerCard("bulwark.snow_elves", "neutral", 2);
    expect(neutralCard.abilities).toContain("ntv-first-volley");
    expect(neutralCard.abilities).not.toContain("town-snow-elf-rune-strike");
    const packCard = playerCard("bulwark.snow_elves", "pack", 2);
    expect(packCard.abilities).toContain("town-snow-elf-rune-strike");
    expect(packCard.abilities).not.toContain("ntv-first-volley");
  });

  it("track selection: Neutral owner or printed Neutral side → neutral; a player's won bank card stays on its faction track", () => {
    expect(combatUnitRankScheduleSide({ controllerId: NEUTRAL_PLAYER_ID, variant: "pack" })).toBe("neutral");
    expect(combatUnitRankScheduleSide({ controllerId: "p1", variant: "neutral" })).toBe("neutral");
    expect(combatUnitRankScheduleSide({ controllerId: "p1", variant: "neutral", bankUnit: true })).toBe("faction");
    expect(combatUnitRankScheduleSide({ controllerId: "p1", variant: "few" })).toBe("faction");
    // Units without a Neutral-side track resolve identically on either track.
    expect(rankScheduleFor("neutral.boars", "neutral")).toBe(rankScheduleFor("neutral.boars"));
  });
});

describe("Neutral-side veteran tracks — displayed ladders", () => {
  it("army-card rank info (XP window / AI strength) reads the Neutral-side track for a Neutral card; CONTROL: Pack card reads the faction track", () => {
    const xp = rankMirrorXp("bronze", 2);
    const neutralInfo = armyUnitRankInfo({ unitDefId: "bulwark.snow_elves", side: "neutral", experience: xp })!;
    expect(neutralInfo.trackId).toBe("neutral-veterancy");
    expect(neutralInfo.abilitiesByRank[2]).toEqual(["ntv-first-volley"]);
    expect(neutralInfo.bonus.initiative).toBe(1);

    const packInfo = armyUnitRankInfo({ unitDefId: "bulwark.snow_elves", side: "pack", experience: xp })!;
    expect(packInfo.trackId).not.toBe("neutral-veterancy");
    expect(packInfo.abilitiesByRank[2]).toEqual(["town-snow-elf-rune-strike"]);
    expect(packInfo.bonus.initiative).toBe(0);
  });

  it("the combat card ladder of an Elite Neutral Jotunn shows Ice Bolt; CONTROL: a player's Pack Jotunn shows Rune Bolt", () => {
    const view = combatUnitVeterancy(guard("bulwark.jotunns", 3))!;
    expect(view.trackLabel).toBe("Wild veteran");
    expect(view.ladder[2]!.abilities.map((ability) => ability.id)).toEqual(["veteran-ice-bolt"]);
    expect(view.ladder[2]!.text).toContain("Ice Bolt");

    const control = combatUnitVeterancy(playerCard("bulwark.jotunns", "pack", 3))!;
    expect(control.ladder[2]!.abilities.map((ability) => ability.id)).toEqual(["town-jotunn-rune-bolt"]);
  });
});

describe("Neutral-side veteran tracks — registry guardrails", () => {
  // Rewards a Neutral-owned stack can never use: Runes, faction cubes, the
  // owner's hand/discard/deck, Spell casting, or player resources.
  const PLAYER_ONLY_MECHANIC = /rune|draw|recover|gold|bounty|spell-channel|crystal-burst|cube/;
  const PLAYER_ONLY_EFFECTS = new Set(["ON_ATTACK_DIE_DRAW", "DRAW_ON_DEFEAT_SIDE_OR_LAYER", "SPELL_SCHOOL_POWER_AURA", "COMMANDER_CAST"]);

  it("covers every Bulwark / Factory / Forge unit with a printed Neutral side, and nothing without one", () => {
    const expected = Object.values(coreUnitDefinitions)
      .filter((def) => ["bulwark", "factory", "forge"].includes(def.faction) && def.neutral)
      .map((def) => def.id)
      .sort();
    expect(Object.keys(NEUTRAL_SIDE_VETERANCY_OVERRIDES).sort()).toEqual(expected);
    for (const id of expected) expect(hasNeutralSideRankSchedule(id), id).toBe(true);
  });

  it("every Neutral-side reward is implemented, non-empty at every rank, and usable without player resources", () => {
    for (const unitDefId of Object.keys(NEUTRAL_SIDE_VETERANCY_OVERRIDES)) {
      const def = coreUnitDefinitions[unitDefId]!;
      const schedule = rankScheduleFor(unitDefId, "neutral");
      for (const rank of [1, 2, 3, 4] as const) {
        const step = schedule[rank];
        const gains = unitRankStatGainsAt(unitDefId, def.tier, rank, undefined, "neutral");
        const statTotal = gains.attack + gains.defense + gains.health + gains.initiative;
        const abilities = unitRankAbilityGainsAt(unitDefId, rank, undefined, "neutral");
        expect(statTotal + abilities.length, `${unitDefId} R${rank}`).toBeGreaterThan(0);
        if (step.kind === "stats") {
          expect(step.stats, `${unitDefId} R${rank} names its exact stats`).toBeDefined();
          continue;
        }
        expect(abilities, `${unitDefId} R${rank} resolves its own reward`).toHaveLength(1);
        for (const abilityId of step.choices) {
          const ability = unitAbilities[abilityId];
          expect(ability, abilityId).toBeTruthy();
          expect(ability!.implementationStatus, abilityId).toBe("implemented");
          const effect = ability!.effect as { type?: string; mechanic?: string } | undefined;
          expect(PLAYER_ONLY_EFFECTS.has(effect?.type ?? ""), `${unitDefId} → ${abilityId}`).toBe(false);
          expect(PLAYER_ONLY_MECHANIC.test(effect?.mechanic ?? ""), `${unitDefId} → ${abilityId}`).toBe(false);
        }
      }
    }
  });
});
