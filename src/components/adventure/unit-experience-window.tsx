"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronsUp, Crown, Layers, Lock, Sparkles, Swords, X } from "lucide-react";

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

function RankBadgeIcon({ rank, large = false }: { rank: number; large?: boolean }) {
  const image = unitRankBadgeImage(rank);
  if (image) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className={`unitRankBadgeArt${large ? " large" : ""}`}
        src={assetUrl(image)}
      />
    );
  }
  return <>{rank >= MAX_UNIT_RANK ? "★" : rank >= 3 ? "⚔" : "^".repeat(rank)}</>;
}

function sideLabel(side: ArmyUnitState["side"]): string {
  return side === "few" ? "Few" : side === "neutral" ? "Neutral" : "Pack of";
}

/**
 * Unit Experience Board — pick ONE army card, then open a large per-unit panel.
 * Each rank is clearly either STATS or ABILITY (never both).
 */
export function UnitExperienceWindow({
  state,
  playerId,
  legalActions = [],
  onAction,
  onClose,
  initialArmyUnitId = null
}: {
  state: GameState;
  playerId: PlayerId;
  legalActions?: LegalAction[];
  onAction?: (action: GameAction) => void;
  onClose: () => void;
  /** Open straight on this army card (e.g. clicked from the army list). */
  initialArmyUnitId?: string | null;
}) {
  const player = state.players[playerId];
  const lexicon = factionUiLexicon(player?.factionId);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(initialArmyUnitId);
  // Re-anchor on a NEW initial unit (render-phase adjustment — no effect needed:
  // the parent remounts the window per open, so this only fires on a real change).
  const [lastInitialUnitId, setLastInitialUnitId] = useState(initialArmyUnitId);
  if (lastInitialUnitId !== initialArmyUnitId) {
    setLastInitialUnitId(initialArmyUnitId);
    setSelectedUnitId(initialArmyUnitId);
  }

  const ruleset = getRuleset(state);
  const sideOverrides = unitSideRuleOverrides(state);
  const rankSteps = Array.from({ length: MAX_UNIT_RANK }, (_, i) => i + 1);
  const army = useMemo(() => player?.army ?? [], [player]);

  const selectedUnit = useMemo(
    () => (selectedUnitId ? army.find((unit) => unit.id === selectedUnitId) ?? null : null),
    [army, selectedUnitId]
  );

  const detail = useMemo(() => {
    if (!selectedUnit) return null;
    const unit = selectedUnit;
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
      sideOverrides.polishUnitStacks &&
      (unit.side === "pack" || unit.side === "neutral") &&
      (unit.stacks ?? 0) > 0
        ? 1
        : 0;
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
    return {
      unit,
      def,
      rankInfo,
      side,
      thresholds,
      maxXp,
      xpPercent,
      baseAttack,
      drillAction,
      reinforceAction,
      stackAction,
      trackLabel
    };
  }, [selectedUnit, ruleset, sideOverrides, legalActions]);

  if (!player) return null;

  return (
    <div className={`heroSystemBackdrop theme-${lexicon.register}`} onMouseDown={onClose}>
      <section
        aria-label={lexicon.experienceBoard}
        aria-modal="true"
        className={`heroSystemModal unitXpWindow${detail ? " unitXpDetailOpen" : ""}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <small>
              {player.name} · {detail ? "unit veterancy detail" : "pick a unit card"}
            </small>
            <h2>
              {detail
                ? `${sideLabel(detail.unit.side)} ${detail.def.name}`
                : lexicon.experienceBoard}
            </h2>
          </div>
          <div className="unitXpHeaderActions">
            {detail ? (
              <button
                aria-label="Back to unit list"
                className="unitXpBack"
                onClick={() => setSelectedUnitId(null)}
                type="button"
              >
                <ArrowLeft size={18} /> All units
              </button>
            ) : null}
            <button aria-label="Close unit experience board" className="heroSystemClose" onClick={onClose} type="button">
              <X size={20} />
            </button>
          </div>
        </header>

        {!detail ? (
          <>
            <p className="unitXpSources">
              Click a unit to open its full rank board. Each rank grants <strong>either stats or one ability</strong> —
              never both. Paths have 1, 2, or (rare) 3 abilities. XP from won fights you survived, or {lexicon.train}{" "}
              (2 gold → +1 XP). Reinforce halves XP; Stacks cost 1 XP; Quick Combat trains nobody.
            </p>
            <div className="unitXpPicker" aria-label="Army unit list">
              {army.map((unit) => {
                const def = coreUnitDefinitions[unit.unitDefId];
                const rankInfo = armyUnitRankInfo(unit);
                if (!def || !rankInfo) return null;
                const printed = armyUnitPrintedSide(def, unit.side);
                const side = printed
                  ? applyUnitSideRules(ruleset, unit.unitDefId, unit.side, printed, sideOverrides)
                  : undefined;
                const thresholds = UNIT_RANK_THRESHOLDS[def.tier] ?? UNIT_RANK_THRESHOLDS.gold;
                const maxXp = thresholds[MAX_UNIT_RANK - 1];
                return (
                  <button
                    aria-label={`Open ${sideLabel(unit.side)} ${def.name} experience board`}
                    className="unitXpPickerCard"
                    key={unit.id}
                    onClick={() => setSelectedUnitId(unit.id)}
                    type="button"
                  >
                    {side?.cardImage ? (
                      <img alt="" className="unitXpPickerArt" loading="lazy" src={assetUrl(side.cardImage)} />
                    ) : (
                      <span aria-hidden="true" className="unitXpPickerArt fallback" />
                    )}
                    <span className="unitXpPickerMeta">
                      <span className={`tierDot ${def.tier}`} />
                      <strong>
                        {sideLabel(unit.side)} {def.name}
                      </strong>
                      {rankInfo.rank > 0 ? (
                        <span className={`unitRankBadge rank-${rankInfo.rank}`}>
                          <RankBadgeIcon large rank={rankInfo.rank} />
                        </span>
                      ) : null}
                      <em>{rankInfo.rank > 0 ? rankInfo.rankName : "Recruit"}</em>
                      <b>
                        {rankInfo.experience}/{maxXp} XP
                      </b>
                    </span>
                  </button>
                );
              })}
              {army.length === 0 ? (
                <p className="unitXpEmpty">No units in the {lexicon.army} yet — recruits appear here as they train.</p>
              ) : null}
            </div>
          </>
        ) : (
          <div className="unitXpDetail" aria-label={`${detail.def.name} experience detail`}>
            <div className="unitXpDetailHero">
              {detail.side?.cardImage ? (
                <img alt="" className="unitXpDetailArt" src={assetUrl(detail.side.cardImage)} />
              ) : (
                <span aria-hidden="true" className="unitXpDetailArt fallback" />
              )}
              <div className="unitXpDetailSummary">
                <div className="unitXpHeadRow">
                  <span className={`tierDot ${detail.def.tier}`} />
                  <strong>
                    {sideLabel(detail.unit.side)} {detail.def.name}
                  </strong>
                  {detail.rankInfo.rank > 0 ? (
                    <span className={`unitRankBadge rank-${detail.rankInfo.rank} large`}>
                      <RankBadgeIcon large rank={detail.rankInfo.rank} />
                    </span>
                  ) : null}
                  <em>{detail.rankInfo.rank > 0 ? detail.rankInfo.rankName : "Recruit"}</em>
                  <span className="unitXpTrackTag">{detail.trackLabel}</span>
                  <span className="unitXpBudgetTag" title="Ability ranks on this path (not by tier)">
                    {detail.rankInfo.abilityBudget}{" "}
                    {detail.rankInfo.abilityBudget === 1 ? "ability" : "abilities"}
                  </span>
                  <b>
                    {detail.rankInfo.experience} / {detail.maxXp} XP
                  </b>
                </div>
                <div
                  aria-label={`${detail.def.name}: ${detail.rankInfo.experience} of ${detail.maxXp} XP`}
                  className="armyXpTrack large"
                >
                  <span className="armyXpFill" style={{ width: `${detail.xpPercent}%` }} />
                  {detail.thresholds.map((threshold, index) => (
                    <span
                      className={`armyXpMilestone ${detail.rankInfo.rank > index ? "reached" : ""}`}
                      key={threshold}
                      style={{ left: `${(threshold / detail.maxXp) * 100}%` }}
                    >
                      <i>{index + 1}</i>
                      <small>{threshold}</small>
                    </span>
                  ))}
                </div>
                {detail.side ? (
                  <div className="unitXpStats large" aria-label={`${detail.def.name} live folded stats`}>
                    {statReadout("A", detail.baseAttack, detail.rankInfo.bonus.attack)}
                    {statReadout("D", detail.side.defense, detail.rankInfo.bonus.defense)}
                    {statReadout("HP", detail.side.health, detail.rankInfo.bonus.health)}
                    {statReadout("I", detail.side.initiative, detail.rankInfo.bonus.initiative)}
                  </div>
                ) : null}
                {detail.rankInfo.rankAbilityIds.length > 0 ? (
                  <div className="unitXpActiveAbilities" aria-label="Active rank abilities">
                    {detail.rankInfo.rankAbilityIds.map((id) => {
                      const ability = unitAbilities[id];
                      if (!ability) return null;
                      return (
                        <span className="unitXpActiveChip large" key={id}>
                          <img alt="" src={assetUrl(unitRankAbilityIcon(id, detail.unit.unitDefId))} />
                          <b>{ability.name}</b>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                {onAction && (detail.drillAction || detail.reinforceAction || detail.stackAction) ? (
                  <div className="armyUnitActions">
                    {detail.drillAction ? (
                      <button onClick={() => onAction(detail.drillAction!.action)} type="button">
                        <Sparkles size={16} /> {lexicon.train} · 2 gold → +1 XP
                      </button>
                    ) : null}
                    {detail.reinforceAction ? (
                      <button onClick={() => onAction(detail.reinforceAction!.action)} type="button">
                        <ChevronsUp size={16} /> Reinforce to Pack (halves XP)
                      </button>
                    ) : null}
                    {detail.stackAction ? (
                      <button onClick={() => onAction(detail.stackAction!.action)} type="button">
                        <Layers size={16} /> Increase Stack (−1 XP)
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="unitXpRanks large">
              {rankSteps.map((rank) => {
                const kind = detail.rankInfo.stepKindByRank[rank] ?? "stats";
                const abilityIds = detail.rankInfo.abilitiesByRank[rank] ?? [];
                const statDelta = detail.rankInfo.statGainsByRank[rank] ?? {
                  attack: 0,
                  defense: 0,
                  health: 0,
                  initiative: 0
                };
                const reached = detail.rankInfo.rank >= rank;
                const next = !reached && detail.rankInfo.rank === rank - 1;
                return (
                  <div
                    className={`unitXpRank kind-${kind} ${reached ? "reached" : next ? "next" : "locked"}`}
                    key={rank}
                  >
                    <span className="unitXpRankIcon" aria-hidden="true">
                      {reached ? <Crown size={20} /> : next ? <Swords size={20} /> : <Lock size={18} />}
                    </span>
                    <b>
                      {rank} · {UNIT_RANK_NAMES[rank]}
                    </b>
                    <span className={`unitXpKindPill kind-${kind}`}>
                      {kind === "stats" ? "STATS" : "ABILITY"}
                    </span>
                    <small>
                      at {detail.thresholds[rank - 1]} XP
                      {next
                        ? ` · ${detail.thresholds[rank - 1] - detail.rankInfo.experience} to go`
                        : reached
                          ? " · reached"
                          : ""}
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
                          <span className={`unitXpElite ${reached ? "active" : "locked"}`} key={abilityId}>
                            <img
                              alt=""
                              aria-hidden="true"
                              className="unitXpAbilityIcon"
                              src={assetUrl(unitRankAbilityIcon(abilityId, detail.unit.unitDefId))}
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
          </div>
        )}
      </section>
    </div>
  );
}
