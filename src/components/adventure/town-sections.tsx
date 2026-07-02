"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ChevronsUp, Star } from "lucide-react";

import { cardLibrary } from "@/data/cards/library";
import { buildingTimingLabel, describeBuildingEffect } from "@/data/towns/describe";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import type { TownBuildingDefinition } from "@/data/factions/types";
import {
  applyRecruitGoldDiscount,
  inCombatPrep,
  legionVoucherDiscount,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerState,
  type TownState
} from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { actionKey, formatCost } from "@/components/table/utils";

/**
 * Shared town-window building blocks. The classic TownPanel (PC-art building
 * list) and the board-game TownBoardView both compose these, so the recruit
 * basket, the building effect/use panels and the hero hire row behave — and
 * stay tested — identically in either view.
 */

// ---------------------------------------------------------------------------
// Building effect / use panels
// ---------------------------------------------------------------------------

/**
 * The active "use" actions belonging to one building: Spell Book → Mage Guild,
 * Blacksmith → the artifact smith, USE_TOWN_BUILDING → its own id, and the
 * City Hall's round-start OPTION_CHOICE surfaced on the building itself.
 */
export function activeBuildingActions(
  state: GameState,
  viewerPlayerId: PlayerId,
  legalActions: LegalAction[],
  buildingId: string
): LegalAction[] {
  const building = coreBuildingDefinitions[buildingId];
  if (!building) {
    return [];
  }
  if (building.effect?.type === "RESOURCE_ROUND_CHOICE") {
    return state.pendingChoice?.type === "OPTION_CHOICE" &&
      state.pendingChoice.context === "city-hall" &&
      state.pendingChoice.playerId === viewerPlayerId
      ? legalActions.filter((legal) => legal.action.type === "CHOOSE_OPTION")
      : [];
  }
  return legalActions.filter((legal) => {
    const action = legal.action;
    if (action.type === "USE_TOWN_BUILDING" || action.type === "THIEVES_GUILD_ACTION") {
      return action.buildingId === buildingId;
    }
    if (action.type === "SPELL_BOOK_ACTION") {
      return building.effect?.type === "MAGE_GUILD";
    }
    if (action.type === "BLACKSMITH_ACTION") {
      return building.effect?.type === "ARTIFACT_SMITH";
    }
    if (action.type === "MAGIC_UNIVERSITY_ACTION") {
      return building.effect?.type === "MAGIC_UNIVERSITY";
    }
    return false;
  });
}

/**
 * Dwellings and the Citadel are structural; every other built building with an
 * effect earns an in-place effect / use panel.
 */
export function hasBuildingEffectPanel(building: TownBuildingDefinition): boolean {
  const type = building.effect?.type;
  return Boolean(
    type && type !== "UNLOCK_RECRUIT_TIER" && type !== "UNLOCK_REINFORCE" && type !== "NOT_IMPLEMENTED"
  );
}

/** Live status / where-to-use note shown under a built building's effect text. */
export function buildingPanelNote(
  state: GameState,
  player: PlayerState,
  town: TownState,
  building: TownBuildingDefinition,
  hasActions: boolean
): string | null {
  const effect = building.effect;
  if (!effect) {
    return null;
  }
  const usedThisRound = (player.buildingUsedRound?.[building.id] ?? 0) === state.round;
  switch (effect.type) {
    case "RESOURCE_ROUND_CHOICE":
      return hasActions
        ? "Choose this round's bonus:"
        : effect.options.length > 1
          ? "Pick one of these at the start of each Resource round."
          : "Collected at the start of each Resource round.";
    case "COMBAT_CUBES": {
      const cubes = town.factionCubes?.[building.id] ?? 0;
      const bonus = effect.spend === "spell-power" ? "+1 Power per cube (max 1 per spell)" : "+1 attack or defense per cube";
      return `${cubes} of ${effect.max} faction cube${cubes === 1 ? "" : "s"} stored — remove them during any combat for ${bonus}.`;
    }
    case "HALL_OF_VALHALLA":
      return usedThisRound
        ? "Already used this round — offered again next round."
        : `Ready — offered in combat when one of your units attacks (+${effect.amount} attack, once per round).`;
    case "FREELANCERS_GUILD":
      return "Always on — the bonus applies automatically.";
    case "MAGIC_UNIVERSITY":
      // Tracked by its own once-per-round flag, not the generic
      // buildingUsedRound token — read it directly for the status line.
      if (hasActions) {
        return null;
      }
      return player.magicUniversityUsedRound === state.round
        ? "Already used this round — available again next round."
        : "Pick a School of Magic to dig your deck for that spell.";
    case "MAGE_GUILD":
    case "ARTIFACT_SMITH":
    case "COVER_OF_DARKNESS":
    case "CASTLE_GATE":
      if (hasActions) {
        return null;
      }
      return usedThisRound
        ? "Already used this round."
        : "Becomes available on your turn (token and resources permitting).";
    default:
      // Round / turn-start automatic effects (City Hall, Brotherhood, Mystic
      // Pond, Saplings, Necromancy Amplifier, Portal, Mana Vortex…).
      return "Resolves automatically at the listed time — watch for its prompt.";
  }
}

/**
 * In-place effect / use panel for one built building: the exact effect, a live
 * status line, and any action it offers right now (Spell Book, Blacksmith,
 * Castle Gate, Cover of Darkness's card picker, the City Hall choice).
 */
export function BuildingDetailPanel({
  state,
  viewerPlayerId,
  legalActions,
  onAction,
  building
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  building: TownBuildingDefinition;
}) {
  /** Cover of Darkness: hand-card indices picked for the discard. */
  const [coverPicks, setCoverPicks] = useState<number[]>([]);
  const player = state.players[viewerPlayerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  if (!player || !town) {
    return null;
  }

  const actions = activeBuildingActions(state, viewerPlayerId, legalActions, building.id);
  const note = buildingPanelNote(state, player, town, building, actions.length > 0);
  const timing = buildingTimingLabel(building);
  const isCover = building.effect?.type === "COVER_OF_DARKNESS";
  const coverAction = isCover ? actions.find((legal) => legal.action.type === "USE_TOWN_BUILDING") : undefined;
  // Pull the id out where the type is narrowed so the click closure below
  // keeps it (TS widens action property access inside closures).
  const coverBuildingId = coverAction?.action.type === "USE_TOWN_BUILDING" ? coverAction.action.buildingId : null;

  const submitCoverOfDarkness = (buildingId: string) => {
    const cardIds = coverPicks.map((index) => player.hand[index]).filter(Boolean);
    onAction({
      type: "USE_TOWN_BUILDING",
      playerId: viewerPlayerId,
      buildingId,
      optionIndex: 0,
      cardIds
    });
    setCoverPicks([]);
  };

  return (
    <div className="townActions townBuildingDetail" aria-label={`${building.name} effect`}>
      <h4>
        {building.name}
        {timing ? <small>{timing}</small> : null}
      </h4>
      <p className="buildingDetailText">{describeBuildingEffect(building)}</p>
      {note ? <small className="buildingDetailStatus">{note}</small> : null}
      {coverBuildingId ? (
        <div className="coverPicker">
          <small>Pick 1–2 cards to discard, then draw that many:</small>
          <div className="coverPickerCards">
            {player.hand.map((cardId, index) => {
              const picked = coverPicks.includes(index);
              return (
                <label key={`${cardId}-${index}`}>
                  <input
                    checked={picked}
                    disabled={!picked && coverPicks.length >= 2}
                    onChange={() =>
                      setCoverPicks((current) =>
                        picked ? current.filter((value) => value !== index) : [...current, index]
                      )
                    }
                    type="checkbox"
                  />
                  {cardLibrary[cardId]?.name ?? cardId}
                </label>
              );
            })}
            <button
              className="commandButton primary"
              disabled={coverPicks.length === 0}
              onClick={() => submitCoverOfDarkness(coverBuildingId)}
              type="button"
            >
              Discard {coverPicks.length || ""} and draw
            </button>
          </div>
        </div>
      ) : (
        actions.map((legal) => (
          <button className="commandButton" key={actionKey(legal.action)} onClick={() => onAction(legal.action)} type="button">
            {legal.label}
          </button>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Population token: the recruit & reinforce basket
// ---------------------------------------------------------------------------

/**
 * The Population-token basket: recruit each unit's Few side once, reinforce an
 * owned Few to its Pack side (with the Citadel), everything priced through the
 * same applyRecruitGoldDiscount the engine charges. Blocked mid-combat except
 * in this player's own pre-battle preparation window.
 */
export function TownRecruitSection({
  state,
  viewerPlayerId,
  legalActions,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const [recruitIds, setRecruitIds] = useState<string[]>([]);
  const [reinforceIds, setReinforceIds] = useState<string[]>([]);
  // The basket empties when the round advances or the seat changes
  // (state-adjustment-during-render pattern).
  const [basketKey, setBasketKey] = useState("");
  const nextBasketKey = `${state.round}|${viewerPlayerId}`;
  if (basketKey !== nextBasketKey) {
    setBasketKey(nextBasketKey);
    setRecruitIds([]);
    setReinforceIds([]);
  }

  const player = state.players[viewerPlayerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  if (!player || !town || !faction) {
    return null;
  }

  // Recruiting is blocked mid-combat — except in this player's own pre-battle
  // preparation window, where spending town actions before the fight is the
  // whole point (recruits join the army in time to deploy).
  if (!player.townTokens.population || (state.combat && !inCombatPrep(state, viewerPlayerId))) {
    return null;
  }
  const canPopulate = legalActions.some((legal) => legal.action.type === "POPULATION_ACTION");

  const unlockedTiers = new Set(
    town.buildings
      .map((buildingId) => coreBuildingDefinitions[buildingId]?.effect)
      .flatMap((effect) => (effect?.type === "UNLOCK_RECRUIT_TIER" ? [effect.tier] : []))
  );
  const canReinforce = town.buildings.some(
    (buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === "UNLOCK_REINFORCE"
  );

  const basketCost: Record<string, number> = {};
  const addCost = (cost: Record<string, number | undefined>) => {
    for (const [resource, amount] of Object.entries(cost)) {
      if (amount) {
        basketCost[resource] = (basketCost[resource] ?? 0) + amount;
      }
    }
  };
  // Each unit's cost carries the TOTAL gold discount the engine will charge for
  // it: a Legion voucher reserved for that unit STACKS with the building/location
  // discount (Champions' Stables, Cove Pub). Two Legion pieces on the same unit
  // still take the larger. The shown total and the affordability gate use this
  // same applyRecruitGoldDiscount, so they match the engine exactly.
  for (const unitDefId of recruitIds) {
    const few = coreUnitDefinitions[unitDefId]?.few;
    if (few) {
      addCost(applyRecruitGoldDiscount(state, viewerPlayerId, { kind: "recruit", unitDefId }, few.cost));
    }
  }
  for (const armyUnitId of reinforceIds) {
    const armyUnit = player.army.find((candidate) => candidate.id === armyUnitId);
    const pack = armyUnit ? coreUnitDefinitions[armyUnit.unitDefId]?.pack : undefined;
    if (armyUnit && pack) {
      addCost(
        applyRecruitGoldDiscount(
          state,
          viewerPlayerId,
          { kind: "reinforce", unitDefId: armyUnit.unitDefId, armyUnitId },
          pack.cost
        )
      );
    }
  }
  const basketAffordable =
    (basketCost.gold ?? 0) <= player.resources.gold &&
    (basketCost.buildingMaterials ?? 0) <= player.resources.buildingMaterials &&
    (basketCost.valuables ?? 0) <= player.resources.valuables;
  const basketSize = recruitIds.length + reinforceIds.length;

  const submitBasket = () => {
    const purchases: { kind: "recruit" | "reinforce"; unitDefId: string; armyUnitId?: string }[] = [];
    for (const unitDefId of recruitIds) {
      purchases.push({ kind: "recruit", unitDefId });
    }
    for (const armyUnitId of reinforceIds) {
      const armyUnit = player.army.find((candidate) => candidate.id === armyUnitId);
      if (armyUnit) {
        purchases.push({ kind: "reinforce", unitDefId: armyUnit.unitDefId, armyUnitId });
      }
    }
    onAction({ type: "POPULATION_ACTION", playerId: viewerPlayerId, purchases });
    setRecruitIds([]);
    setReinforceIds([]);
  };

  return (
    <div className="townRecruits" aria-label="Population token basket">
      <h4 title="Each unit card exists once: recruit the Few side, later reinforce it to the Pack side — then it is complete.">
        Population token — recruit &amp; reinforce
      </h4>
      <small className="recruitLegend">
        Buy a unit&apos;s <b>Few</b> side, or <ChevronsUp aria-hidden="true" size={11} /> <b>reinforce</b> a Few you
        already own up to its stronger <b>Pack</b> side{canReinforce ? "." : " — needs the Citadel."}
      </small>
      {faction.units.map((unitDefId) => {
        const unit = coreUnitDefinitions[unitDefId];
        if (!unit?.few || !unlockedTiers.has(unit.tier)) {
          return null;
        }
        const owned = player.army.find((candidate) => candidate.unitDefId === unitDefId);
        // Pack (or recruited neutral): the card is complete, nothing to buy.
        if (owned && owned.side !== "few") {
          return (
            <div className="recruitRow done" key={unitDefId}>
              <Star aria-hidden="true" className={`tierStar ${unit.tier}`} size={12} />
              <span className="recruitName">{unit.name}</span>
              <small className="recruitState">pack — fully mustered</small>
            </div>
          );
        }
        // Few in the army: only the pack upgrade is on offer.
        if (owned) {
          const def = coreUnitDefinitions[owned.unitDefId];
          const checked = reinforceIds.includes(owned.id);
          const upgradable = canReinforce && Boolean(def?.pack);
          const reinforceRef = { kind: "reinforce" as const, unitDefId: owned.unitDefId, armyUnitId: owned.id };
          const reinforceCost = applyRecruitGoldDiscount(state, viewerPlayerId, reinforceRef, def?.pack?.cost ?? {});
          const reinforceLegion = legionVoucherDiscount(state, viewerPlayerId, reinforceRef);
          return (
            <label
              className={`recruitRow reinforce ${checked ? "checked" : ""} ${upgradable ? "" : "locked"}`}
              key={unitDefId}
              title={upgradable ? `Reinforce ${unit.name}: Few → Pack` : undefined}
            >
              <Star aria-hidden="true" className={`tierStar ${unit.tier}`} size={12} />
              <span className="recruitName">
                {unit.name} <span className="fewBadge">Few</span>
              </span>
              {upgradable ? (
                <>
                  <span className="upgradeTag" title={reinforceLegion > 0 ? `Legion voucher reserved: −${reinforceLegion} gold` : undefined}>
                    <ChevronsUp aria-hidden="true" size={12} /> Pack {formatCost(reinforceCost)}
                    {reinforceLegion > 0 ? ` · Legion −${reinforceLegion}` : ""}
                  </span>
                  <input
                    aria-label={`Reinforce ${unit.name} to a pack`}
                    checked={checked}
                    onChange={() =>
                      setReinforceIds((current) =>
                        checked ? current.filter((id) => id !== owned.id) : [...current, owned.id]
                      )
                    }
                    type="checkbox"
                  />
                </>
              ) : (
                <small className="recruitState">few in army{canReinforce ? "" : " — build the Citadel to reinforce"}</small>
              )}
            </label>
          );
        }
        const checked = recruitIds.includes(unitDefId);
        const recruitRef = { kind: "recruit" as const, unitDefId };
        const recruitCost = applyRecruitGoldDiscount(state, viewerPlayerId, recruitRef, unit.few.cost);
        const recruitLegion = legionVoucherDiscount(state, viewerPlayerId, recruitRef);
        return (
          <label className="recruitRow" key={unitDefId}>
            <Star aria-hidden="true" className={`tierStar ${unit.tier}`} size={12} />
            <span className="recruitName">{unit.name}</span>
            <small title={recruitLegion > 0 ? `Legion voucher reserved: −${recruitLegion} gold` : undefined}>
              {formatCost(recruitCost)}
              {recruitLegion > 0 ? ` · Legion −${recruitLegion}` : ""}
            </small>
            <input
              checked={checked}
              onChange={() =>
                setRecruitIds((current) =>
                  checked ? current.filter((id) => id !== unitDefId) : [...current, unitDefId]
                )
              }
              type="checkbox"
            />
          </label>
        );
      })}
      {basketSize > 0 ? (
        <div className="basketFooter">
          <small>
            Total: {formatCost(basketCost as Record<"gold" | "buildingMaterials" | "valuables", number>)}
            {basketAffordable ? "" : " — not enough resources"}
          </small>
          <button
            className="commandButton primary"
            disabled={!basketAffordable || !canPopulate}
            onClick={submitBasket}
            type="button"
          >
            Buy {basketSize}
          </button>
        </div>
      ) : (
        <small className="basketHint">
          Recruit and reinforce as much as you can afford — the window stays open until your hero moves after a
          purchase.
        </small>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hire a Secondary Hero
// ---------------------------------------------------------------------------

/**
 * A hero's board-art portrait, with a graceful fallback. Some heroes ship
 * without a portrait asset (or the file 404s); rather than render a broken
 * image we show a round initial badge. Selection never depends on the
 * portrait: the surrounding button always carries the hero's name and click.
 */
export function HeroPortrait({
  portrait,
  name,
  size,
  style
}: {
  portrait: string | undefined;
  name: string;
  size: number;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const base: React.CSSProperties = { width: size, height: size, borderRadius: "50%", flex: "0 0 auto", ...style };

  if (portrait && !failed) {
    return (
      <img
        alt=""
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={assetUrl(portrait)}
        style={{ ...base, objectFit: "cover" }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        ...base,
        display: "inline-grid",
        placeItems: "center",
        background: "rgba(170, 130, 70, 0.25)",
        border: "1px solid rgba(170, 130, 70, 0.5)",
        color: "#e8d9b8",
        fontWeight: 700,
        fontSize: Math.max(10, Math.round(size * 0.5)),
        lineHeight: 1
      }}
    >
      {initial}
    </span>
  );
}

/** The tavern row: hire a Secondary Hero for 10 gold (one per player). */
export function HireHeroesSection({
  legalActions,
  onAction
}: {
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const hireActions = legalActions.filter((legal) => legal.action.type === "HIRE_SECONDARY_HERO");
  if (hireActions.length === 0) {
    return null;
  }
  return (
    <div className="townActions" aria-label="Hire a Secondary Hero">
      <h4 title="A Secondary Hero has 2 movement, plays no cards and never gains experience. One per player.">
        Hire a Secondary Hero — 10 gold
      </h4>
      <div className="hireHeroRow">
        {hireActions.map((legal) => {
          const action = legal.action;
          const heroDefId = action.type === "HIRE_SECONDARY_HERO" ? action.heroDefId : "";
          const heroDef = heroDefId ? coreHeroDefinitions[heroDefId] : undefined;
          return (
            <button
              className="commandButton"
              key={actionKey(action)}
              onClick={() => onAction(action)}
              title={`Appears at your town as ${heroDef?.name ?? heroDefId} (10 gold)`}
              type="button"
            >
              <HeroPortrait
                name={heroDef?.name ?? heroDefId}
                portrait={heroDef?.portrait}
                size={18}
                style={{ marginRight: 4, verticalAlign: "middle" }}
              />
              {heroDef?.name ?? heroDefId}
            </button>
          );
        })}
      </div>
    </div>
  );
}
