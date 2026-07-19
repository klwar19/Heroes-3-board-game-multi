"use client";

/* eslint-disable @next/next/no-img-element */

import { ChevronsUp, Crown, Layers, Lock, Sparkles, Swords, X } from "lucide-react";

import { assetUrl } from "@/lib/asset-url";
import { factionUiLexicon } from "@/data/faction-theme";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { UnitDefinition, UnitSideDefinition } from "@/data/factions/types";
import { unitAbilities } from "@/data/units/abilities";
import {
  MAX_UNIT_RANK,
  RANK_ABILITY_TRACK_LABELS,
  UNIT_RANK_NAMES,
  UNIT_RANK_THRESHOLDS,
  unitRankAbilityIcon,
  unitRankBadgeImage,
  type RankAbilityTrackId
} from "@/data/units/experience";
import {
  applyUnitSideRules,
  armyUnitRankInfo,
  getRuleset,
  unitSideRuleOverrides,
  type ArmyUnitState,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";

export function armyUnitPrintedSide(
  def: UnitDefinition | undefined,
  side: ArmyUnitState["side"]
): UnitSideDefinition | undefined {
  if (!def) return undefined;
  return side === "few" ? def.few : side === "pack" ? def.pack : (def.neutral ?? def.pack);
}

function statReadout(label: string, base: number, bonus: number) {
  return (
    <span className={bonus > 0 ? "boosted" : ""} key={label}>
      {label} {base}
      {bonus > 0 ? ` → ${base + bonus}` : ""}
    </span>
  );
}

function formatStatDelta(delta: { attack: number; defense: number; health: number; initiative: number }): string {
  const parts: string[] = [];
  if (delta.attack) parts.push(`+${delta.attack} Attack`);
  if (delta.defense) parts.push(`+${delta.defense} Defense`);
  if (delta.health) parts.push(`+${delta.health} Health`);
  if (delta.initiative) parts.push(`+${delta.initiative} Initiative`);
  return parts.join(" · ") || "—";
}

function RankBadgeIcon({ rank }: { rank: number }) {
  const image = unitRankBadgeImage(rank);
  if (image) {
    return <img alt="" aria-hidden="true" className="unitRankBadgeArt" src={assetUrl(image)} />;
  }
  return <>{rank >= MAX_UNIT_RANK ? "★" : rank >= 3 ? "⚔" : "^".repeat(rank)}</>;
}

/**
 * Unit Experience Board — each rank is clearly either STATS or ABILITY.
 * Gold units do not get more abilities; budget is 1 / 2 / 3 by path rarity.
 */
export function UnitExperienceWindow({
  state,
  playerId,
  legalActions = [],
  onAction,
  onClose
}: {
  state: GameState;
  playerId: PlayerId;
  legalActions?: LegalAction[];
  onAction?: (action: GameAction) => void;
  onClose: () => void;
}) {
  const player = state.players[playerId];
  const lexicon = factionUiLexicon(player?.factionId);
  if (!player) return null;
  const ruleset = getRuleset(state);
  const sideOverrides = unitSideRuleOverrides(state);
  const rankSteps = Array.from({ length: MAX_UNIT_RANK }, (_, i) => i + 1);

  return (
    <div className={`heroSystemBackdrop theme-${lexicon.register}`} onMouseDown={onClose}>
      <section
        aria-label={lexicon.experienceBoard}
        aria-modal="true"
        className="heroSystemModal unitXpWindow"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <small>{player.name} · live army-card veterancy</small>
            <h2>{lexicon.experienceBoard}</h2>
          </div>
          <button aria-label="Close unit experience board" className="heroSystemClose" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>
        <p className="unitXpSources">
          Each rank grants <strong>either stats or one ability</strong> — never both. Paths have 1, 2, or (rare) 3
          abilities; gold units do not get more. XP from won fights you survived, or {lexicon.train} (2 gold → +1 XP).
          Reinforce halves XP; Stacks cost 1 XP; Quick Combat trains nobody.
        </p>
        <div className="unitXpList">
          {player.army.map((unit) => {
            const def = coreUnitDefinitions[unit.unitDefId];
            const rankInfo = armyUnitRankInfo(unit);
            if (!def || !rankInfo) return null;
            const printed = armyUnitPrintedSide(def, unit.side);
            const side = printed
              ? applyUnitSideRules(ruleset, unit.unitDefId, unit.side, printed, sideOverrides)
              : undefined;
            const thresholds = UNIT_RANK_THRESHOLDS[def.tier] ?? UNIT_RANK_THRESHOLDS.gold;
            const maxXp = thresholds[MAX_UNIT_RANK - 1];
            const xpPercent = Math.min(100, (rankInfo.experience / maxXp) * 100);
            const stackAttack =
              sideOverrides.polishUnitStacks && unit.side === "pack" && (unit.stacks ?? 0) > 0 ? 1 : 0;
            const baseAttack = (side?.attack ?? 0) + (unit.permanentAttackBonus ?? 0) + stackAttack;
            const drillAction = legalActions.find(
              (legal) => legal.action.type === "DRILL_UNIT" && legal.action.armyUnitId === unit.id
            );
            const populationActions = legalActions.filter(
              (legal) =>
                legal.action.type === "POPULATION_ACTION" &&
                legal.action.purchases.some((purchase) => purchase.armyUnitId === unit.id)
            );
            const reinforceAction = populationActions.find(
              (legal) =>
                legal.action.type === "POPULATION_ACTION" &&
                legal.action.purchases.some((purchase) => purchase.kind === "reinforce")
            );
            const stackAction = populationActions.find(
              (legal) =>
                legal.action.type === "POPULATION_ACTION" &&
                legal.action.purchases.some((purchase) => purchase.kind === "stack")
            );
            const trackLabel =
              RANK_ABILITY_TRACK_LABELS[rankInfo.trackId as RankAbilityTrackId] ?? rankInfo.trackId;

            return (
              <article aria-label={`${def.name} experience detail`} className="unitXpEntry" key={unit.id}>
                {side?.cardImage ? (
                  <img alt="" className="unitXpThumb" loading="lazy" src={assetUrl(side.cardImage)} />
                ) : (
                  <span aria-hidden="true" className="unitXpThumb fallback" />
                )}
                <div className="unitXpBody">
                  <div className="unitXpHeadRow">
                    <span className={`tierDot ${def.tier}`} />
                    <strong>
                      {unit.side === "few" ? "Few" : unit.side === "neutral" ? "Neutral" : "Pack of"} {def.name}
                    </strong>
                    {rankInfo.rank > 0 ? (
                      <span className={`unitRankBadge rank-${rankInfo.rank}`}>
                        <RankBadgeIcon rank={rankInfo.rank} />
                      </span>
                    ) : null}
                    <em>{rankInfo.rank > 0 ? rankInfo.rankName : "Recruit"}</em>
                    <span className="unitXpTrackTag">{trackLabel}</span>
                    <span className="unitXpBudgetTag" title="Ability ranks on this path (not by tier)">
                      {rankInfo.abilityBudget} {rankInfo.abilityBudget === 1 ? "ability" : "abilities"}
                    </span>
                    <b>
                      {rankInfo.experience} / {maxXp} XP
                    </b>
                  </div>
                  <div aria-label={`${def.name}: ${rankInfo.experience} of ${maxXp} XP`} className="armyXpTrack">
                    <span className="armyXpFill" style={{ width: `${xpPercent}%` }} />
                    {thresholds.map((threshold, index) => (
                      <span
                        className={`armyXpMilestone ${rankInfo.rank > index ? "reached" : ""}`}
                        key={threshold}
                        style={{ left: `${(threshold / maxXp) * 100}%` }}
                      >
                        <i>{index + 1}</i>
                        <small>{threshold}</small>
                      </span>
                    ))}
                  </div>
                  {side ? (
                    <div className="unitXpStats" aria-label={`${def.name} live folded stats`}>
                      {statReadout("A", baseAttack, rankInfo.bonus.attack)}
                      {statReadout("D", side.defense, rankInfo.bonus.defense)}
                      {statReadout("HP", side.health, rankInfo.bonus.health)}
                      {statReadout("I", side.initiative, rankInfo.bonus.initiative)}
                    </div>
                  ) : null}
                  {rankInfo.rankAbilityIds.length > 0 ? (
                    <div className="unitXpActiveAbilities" aria-label="Active rank abilities">
                      {rankInfo.rankAbilityIds.map((id) => {
                        const ability = unitAbilities[id];
                        if (!ability) return null;
                        return (
                          <span className="unitXpActiveChip" key={id}>
                            <img alt="" src={assetUrl(unitRankAbilityIcon(id))} />
                            <b>{ability.name}</b>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="unitXpRanks">
                    {rankSteps.map((rank) => {
                      const kind = rankInfo.stepKindByRank[rank] ?? "stats";
                      const abilityIds = rankInfo.abilitiesByRank[rank] ?? [];
                      const statDelta = rankInfo.statGainsByRank[rank] ?? {
                        attack: 0,
                        defense: 0,
                        health: 0,
                        initiative: 0
                      };
                      const reached = rankInfo.rank >= rank;
                      const next = !reached && rankInfo.rank === rank - 1;
                      return (
                        <div
                          className={`unitXpRank kind-${kind} ${reached ? "reached" : next ? "next" : "locked"}`}
                          key={rank}
                        >
                          <span className="unitXpRankIcon" aria-hidden="true">
                            {reached ? <Crown size={13} /> : next ? <Swords size={13} /> : <Lock size={12} />}
                          </span>
                          <b>
                            {rank} · {UNIT_RANK_NAMES[rank]}
                          </b>
                          <span className={`unitXpKindPill kind-${kind}`}>
                            {kind === "stats" ? "STATS" : "ABILITY"}
                          </span>
                          <small>
                            at {thresholds[rank - 1]} XP
                            {next ? ` · ${thresholds[rank - 1] - rankInfo.experience} to go` : reached ? " · reached" : ""}
                          </small>
                          {kind === "stats" ? (
                            <span className="unitXpRankGains">{formatStatDelta(statDelta)}</span>
                          ) : (
                            abilityIds.map((abilityId) => {
                              const ability = unitAbilities[abilityId];
                              if (!ability) {
                                return (
                                  <span className="unitXpElite locked" key={abilityId}>
                                    (ability already on card — next fallback applied)
                                  </span>
                                );
                              }
                              return (
                                <span
                                  className={`unitXpElite ${reached ? "active" : "locked"}`}
                                  key={abilityId}
                                >
                                  <img
                                    alt=""
                                    aria-hidden="true"
                                    className="unitXpAbilityIcon"
                                    src={assetUrl(unitRankAbilityIcon(abilityId))}
                                  />
                                  <b>{ability.name}</b>
                                  {reached ? " · ACTIVE" : " · locked"}
                                  <small>{ability.text}</small>
                                </span>
                              );
                            })
                          )}
                          {kind === "ability" && abilityIds.length === 0 ? (
                            <span className="unitXpRankGains">
                              {reached
                                ? "All path abilities already printed on this unit"
                                : "Ability rank (see path)"}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {onAction && (drillAction || reinforceAction || stackAction) ? (
                    <div className="armyUnitActions">
                      {drillAction ? (
                        <button onClick={() => onAction(drillAction.action)} type="button">
                          <Sparkles size={13} /> {lexicon.train} · 2 gold → +1 XP
                        </button>
                      ) : null}
                      {reinforceAction ? (
                        <button onClick={() => onAction(reinforceAction.action)} type="button">
                          <ChevronsUp size={13} /> Reinforce to Pack (halves XP)
                        </button>
                      ) : null}
                      {stackAction ? (
                        <button onClick={() => onAction(stackAction.action)} type="button">
                          <Layers size={13} /> Increase Stack (−1 XP)
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
          {player.army.length === 0 ? (
            <p className="unitXpEmpty">No units in the {lexicon.army} yet — recruits appear here as they train.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
