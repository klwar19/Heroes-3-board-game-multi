"use client";

/* eslint-disable @next/next/no-img-element */

import { ChevronsUp, Crown, Layers, Lock, Sparkles, Swords, X } from "lucide-react";

import { assetUrl } from "@/lib/asset-url";
import { factionUiLexicon } from "@/data/faction-theme";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { UnitDefinition, UnitSideDefinition } from "@/data/factions/types";
import { unitAbilities } from "@/data/units/abilities";
import { MAX_UNIT_RANK, UNIT_RANK_NAMES, UNIT_RANK_THRESHOLDS } from "@/data/units/experience";
import {
  applyUnitSideRules,
  armyUnitRankInfo,
  getRuleset,
  unitRankStatBonuses,
  unitSideRuleOverrides,
  type ArmyUnitState,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";

/** The printed side an army card currently shows (recruited Neutrals included). */
export function armyUnitPrintedSide(
  def: UnitDefinition | undefined,
  side: ArmyUnitState["side"]
): UnitSideDefinition | undefined {
  if (!def) {
    return undefined;
  }
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

/**
 * Unit Experience Board — a pop-up window (portal shell shared with the Hero
 * Grade / Hero Equipment windows) detailing every army card's veterancy:
 * current XP on the tier's REAL thresholds, the exact stat package each rank
 * adds (rank-by-rank deltas, not just the cumulative total), the live folded
 * stats the engine fights with, and the signature Elite ability with its full
 * rules text (active at rank 3, locked below). Engine-backed controls (Drill /
 * Reinforce to Pack / Stack layer) ride the SAME legal-action offers as the
 * roster rows — the window never invents an action. Read-only without
 * onAction (opponent info). Themed per faction register (classic/anime/wuxia).
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
  if (!player) {
    return null;
  }
  const ruleset = getRuleset(state);
  const sideOverrides = unitSideRuleOverrides(state);

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
          Cards earn XP by winning a combat they were deployed in and survived — guard fights pay the Field
          Difficulty, Creature Banks pay the Stacked count (minimum 2), PvP wins pay 2 — or by {lexicon.train}
          {" "}at your own Town (2 gold → +1 XP, once per turn). Reinforcing Few→Pack halves a card&apos;s XP and each
          bought Stack layer costs 1 XP; Quick Combat trains nobody.
        </p>
        <div className="unitXpList">
          {player.army.map((unit) => {
            const def = coreUnitDefinitions[unit.unitDefId];
            const rankInfo = armyUnitRankInfo(unit);
            if (!def || !rankInfo) {
              return null;
            }
            const printed = armyUnitPrintedSide(def, unit.side);
            const side = printed
              ? applyUnitSideRules(ruleset, unit.unitDefId, unit.side, printed, sideOverrides)
              : undefined;
            const thresholds = UNIT_RANK_THRESHOLDS[def.tier] ?? UNIT_RANK_THRESHOLDS.gold;
            const maxXp = thresholds[2];
            const xpPercent = Math.min(100, (rankInfo.experience / maxXp) * 100);
            const stackAttack =
              sideOverrides.polishUnitStacks && unit.side === "pack" && (unit.stacks ?? 0) > 0 ? 1 : 0;
            const baseAttack = (side?.attack ?? 0) + (unit.permanentAttackBonus ?? 0) + stackAttack;
            const elite = rankInfo.eliteAbilityId ? unitAbilities[rankInfo.eliteAbilityId] : null;
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
                        {rankInfo.rank >= MAX_UNIT_RANK ? "⚔" : "^".repeat(rankInfo.rank)}
                      </span>
                    ) : null}
                    <em>{rankInfo.rank > 0 ? rankInfo.rankName : "Recruit"}</em>
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
                    <div className="unitXpStats" aria-label={`${def.name} live stats`}>
                      {statReadout("A", baseAttack, rankInfo.bonus.attack)}
                      {statReadout("D", side.defense, rankInfo.bonus.defense)}
                      {statReadout("HP", side.health, rankInfo.bonus.health)}
                      {statReadout("I", side.initiative, rankInfo.bonus.initiative)}
                    </div>
                  ) : null}
                  <div className="unitXpRanks">
                    {([1, 2, 3] as const).map((rank) => {
                      const cumulative = unitRankStatBonuses(def.tier, rank);
                      const previous = unitRankStatBonuses(def.tier, rank - 1);
                      const gains: string[] = [];
                      if (cumulative.attack > previous.attack) gains.push(`+${cumulative.attack - previous.attack} Attack`);
                      if (cumulative.defense > previous.defense) gains.push(`+${cumulative.defense - previous.defense} Defense`);
                      if (cumulative.health > previous.health) gains.push(`+${cumulative.health - previous.health} Health`);
                      if (cumulative.initiative > previous.initiative)
                        gains.push(`+${cumulative.initiative - previous.initiative} Initiative`);
                      const reached = rankInfo.rank >= rank;
                      const next = !reached && rankInfo.rank === rank - 1;
                      return (
                        <div
                          className={`unitXpRank ${reached ? "reached" : next ? "next" : "locked"}`}
                          key={rank}
                        >
                          <span className="unitXpRankIcon" aria-hidden="true">
                            {reached ? <Crown size={13} /> : next ? <Swords size={13} /> : <Lock size={12} />}
                          </span>
                          <b>
                            {rank} · {UNIT_RANK_NAMES[rank]}
                          </b>
                          <small>
                            at {thresholds[rank - 1]} XP
                            {next ? ` · ${thresholds[rank - 1] - rankInfo.experience} to go` : reached ? " · reached" : ""}
                          </small>
                          <span className="unitXpRankGains">{gains.join(" · ")}</span>
                          {rank === MAX_UNIT_RANK && elite ? (
                            <span className={`unitXpElite ${rankInfo.eliteActive ? "active" : "locked"}`}>
                              <Sparkles aria-hidden="true" size={12} />
                              <b>{elite.name}</b>
                              {rankInfo.eliteActive ? " · ACTIVE" : " · locked"}
                              <small>{elite.text}</small>
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
