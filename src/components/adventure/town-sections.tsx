"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ChevronsUp, MapPin, Star } from "lucide-react";

import { cardLibrary } from "@/data/cards/library";
import { buildingTimingLabel, describeBuildingEffect } from "@/data/towns/describe";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { RESOURCE_ICONS } from "@/data/assets/homm-assets";
import { locationDefinitions } from "@/data/map/locations";
import { allTileDefinitions } from "@/data/map/tiles";
import type { TownBuildingDefinition } from "@/data/factions/types";
import {
  applyRecruitGoldDiscount,
  applyUnitSideRules,
  freeSpellBookActive,
  getRuleset,
  houseRuleEnabled,
  inCombatPrep,
  legionVoucherDiscount,
  polishArmyUnitStackCap,
  polishArmyUnitStackCost,
  polishUnitStackCapLabel,
  recruitCostWithSubstitution,
  unitSideRuleOverrides,
  type ArmyUnitState,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId,
  type PlayerState,
  type ResourceCost,
  type ResourceKind,
  type TownState
} from "@/engine";
import { assetUrl } from "@/lib/asset-url";
import { playerRecruitUnitIds, playerRecruitUnitSide, playerRecruitTierUnlocked, settlementRecruitFactions } from "@/engine/adventure";
import { actionKey, formatCost } from "@/components/table/utils";
import { useOptionalCardZoom } from "@/components/table/zoom";
import { useUnitFaceImage } from "@/components/table/polish-balance-art";
import {
  MgqGoldContractPanel,
  MgqSpiritShrinePanel,
  mgqGoldUnavailable
} from "@/components/adventure/mgq-controls";

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
  if (building.id === "mgq.spirit_shrine") {
    return legalActions.filter((legal) => legal.action.type === "SET_MGQ_SPIRIT");
  }
  if (building.effect?.type === "ASTROLOGERS_FLAT_GOLD_REINFORCE") {
    const pubDiscountIds = new Set(
      (state.players[viewerPlayerId]?.reinforcementDiscounts ?? [])
        .filter((discount) => discount.source === "pub")
        .map((discount) => discount.id)
    );
    return legalActions.filter(
      (legal) =>
        legal.action.type === "REDEEM_REINFORCEMENT_DISCOUNT" &&
        pubDiscountIds.has(legal.action.discountId)
    );
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

/**
 * Whether one building's in-place effect / use panel must be REACHABLE right
 * now — the ONE read both town views take, so neither can hide an action the
 * engine is offering.
 *
 * A BUILT building always earns its panel. An UNBUILT one earns it as soon as
 * the engine offers an action that belongs to it: the reported bug was the
 * Astrologers' "Mages" proclamation, which waives the Mage Guild for the Spell
 * Book token ("you can use it even if you do not have a Mage Guild built") — the
 * engine offered the free purchase, but both town views only ever hosted the
 * Spell Book buttons on a BUILT Mage Guild, so in town the card looked inert
 * while the same offer was clickable from the PvP prep panel. Keyed off the live
 * legal actions rather than the proclamation, so any future building waiver is
 * surfaced by construction.
 */
export function buildingPanelReachable(
  state: GameState,
  viewerPlayerId: PlayerId,
  legalActions: LegalAction[],
  building: TownBuildingDefinition
): boolean {
  if (!hasBuildingEffectPanel(building)) {
    return false;
  }
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  if (town?.buildings.includes(building.id)) {
    return true;
  }
  return activeBuildingActions(state, viewerPlayerId, legalActions, building.id).length > 0;
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
  // An UNBUILT building whose panel is open is only ever reachable because an
  // effect waived its requirement (today: the Astrologers' Mages card on the
  // Mage Guild). Say so, so nobody reads the live buttons as "already built".
  if (!town.buildings.includes(building.id)) {
    if (!hasActions) {
      return null;
    }
    return effect.type === "MAGE_GUILD" && freeSpellBookActive(state)
      ? "Not built — the Astrologers' Mages card lets you use the Spell Book token for free this round, with no Mage Guild."
      : "Not built — usable right now because an effect waives the building.";
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
      if (effect.trainingWinXp) {
        return `Automatic after a win — +${effect.trainingWinXp} XP to surviving deployed units, or +${effect.trainingWinGoldWhenXpOff ?? 0} gold while Unit Experience is off.`;
      }
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
        : "Ready — choose a School of Magic instead when you next Search the shared Spell deck.";
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
    case "MGQ_SPIRIT_SHRINE":
      return player.mgqSpirit
        ? "The selected built contract will be snapshotted at the next combat setup."
        : "Select one built Spirit contract for the next combat.";
    case "MGQ_SPIRIT_CONTRACT":
      return "Built contracts are selected from the Spirit Shrine panel.";
    case "ASTROLOGERS_FLAT_GOLD_REINFORCE":
      return hasActions
        ? "Ready this Astrologers' round — choose the unit to reinforce with the Pub discount."
        : "Available during each Astrologers' round; the Citadel is required to reinforce.";
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
        {town.buildings.includes(building.id) ? null : <small className="buildingDetailUnbuilt">not built</small>}
        {timing ? <small>{timing}</small> : null}
      </h4>
      <p className="buildingDetailText">{describeBuildingEffect(building)}</p>
      {note ? <small className="buildingDetailStatus">{note}</small> : null}
      {building.id === "mgq.spirit_shrine" ? (
        <MgqSpiritShrinePanel
          legalActions={legalActions}
          onAction={onAction}
          playerId={viewerPlayerId}
          state={state}
        />
      ) : coverBuildingId ? (
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

/** Whether the player's resources cover a single purchase's cost. */
function costAffordable(
  cost: Record<string, number | undefined>,
  resources: PlayerState["resources"]
): boolean {
  return (
    (cost.gold ?? 0) <= resources.gold &&
    (cost.buildingMaterials ?? 0) <= resources.buildingMaterials &&
    (cost.valuables ?? 0) <= resources.valuables
  );
}

const UNIT_RESOURCE_ORDER: readonly ResourceKind[] = ["gold", "buildingMaterials", "valuables"];
const UNIT_RESOURCE_LABELS: Record<ResourceKind, string> = {
  gold: "Gold",
  buildingMaterials: "Building materials",
  valuables: "Valuables"
};

/** Compact resource cost display used by each Few/Pack card in the roster. */
function UnitCost({ cost, label }: { cost: ResourceCost; label: string }) {
  const entries = UNIT_RESOURCE_ORDER
    .map((resource) => [resource, cost[resource] ?? 0] as const)
    .filter(([, amount]) => amount > 0);

  return (
    <span aria-label={`${label}: ${formatCost(cost)}`} className="unitCost" title={`${label}: ${formatCost(cost)}`}>
      {entries.length > 0 ? (
        entries.map(([resource, amount]) => (
          <span className="unitCostItem" key={resource}>
            <img alt={UNIT_RESOURCE_LABELS[resource]} src={assetUrl(RESOURCE_ICONS[resource])} />
            <b>{amount}</b>
          </span>
        ))
      ) : (
        <span className="unitCostFree">free</span>
      )}
    </span>
  );
}

/**
 * The live unit-stat house rules a printed card FACE must be read through
 * (`griffin-buff`, `marksman-buff`, `phoenix-pack-rebirth`, the Community
 * Balance unit sides). Threaded as a REQUIRED prop rather than defaulted, so a
 * new card-face surface cannot silently print the raw scan's numbers again —
 * the display drift `d95a9d71` fixed for the roster row and this card zoom
 * re-introduced.
 */
export type UnitSideRules = {
  ruleset: ReturnType<typeof getRuleset>;
  overrides: ReturnType<typeof unitSideRuleOverrides>;
};

/** Resolve {@link UnitSideRules} from a live game state. */
export function unitSideRulesFor(state: Pick<GameState, "ruleset" | "adventure" | "anime">): UnitSideRules {
  return { ruleset: getRuleset(state), overrides: unitSideRuleOverrides(state) };
}

/**
 * A recruitable unit's card art: a click-to-enlarge thumbnail so the player can
 * SEE the unit (its scan + stats) before spending the Population token on it.
 * Degrades to a static, non-zoomable image when rendered without a
 * CardZoomProvider (isolated unit tests) — the art still shows either way.
 */
function RecruitUnitView({
  unitDefId,
  side,
  sideRules
}: {
  unitDefId: string;
  side: "few" | "pack" | "neutral";
  sideRules: UnitSideRules;
}) {
  const zoom = useOptionalCardZoom();
  const def = coreUnitDefinitions[unitDefId];
  const printedSide =
    side === "pack" ? def?.pack : side === "neutral" ? def?.neutral : def?.few;
  // BINH / Community unit-stat house rules (Griffins' +1 Defense, the Pack of
  // Marksmen's 3rd Health, the Pack Phoenix Rebirth): the card the player READS
  // must show the numbers the engine will FIGHT with, exactly like the in-play
  // roster row. Without this the Pack Griffin's zoom printed "Defense 0" on a
  // BINH table where the engine mints it at 1.
  const unitSide = printedSide
    ? applyUnitSideRules(sideRules.ruleset, unitDefId, side, printedSide, sideRules.overrides)
    : printedSide;
  // Community Balance Change: four Castle unit sides are reprinted, so this
  // shared recruit/roster thumb (and its zoom) must read the balance face.
  const image = useUnitFaceImage(unitDefId, side, unitSide?.cardImage);
  const sideLabel = side === "pack" ? "Pack" : side === "neutral" ? "Neutral" : "Few";
  const thumb = image ? (
    <img alt="" aria-hidden="true" className="recruitThumbImg" loading="lazy" src={assetUrl(image)} />
  ) : (
    <span className={`recruitThumbImg fallback ${def?.tier ?? "bronze"}`} />
  );
  if (!zoom || !def || !unitSide) {
    return <span className="recruitThumb">{thumb}</span>;
  }
  return (
    <button
      aria-label={`View the ${sideLabel} ${def.name} card`}
      className="recruitThumb"
      onClick={(event) => {
        // A button inside the row's <label> must not toggle the basket checkbox.
        event.preventDefault();
        event.stopPropagation();
        zoom.zoomContent({
          title: `${sideLabel} ${def.name}`,
          image,
          subtitle: `${def.tier} ${def.type}`,
          lines: [
            `Attack ${unitSide.attack} · Defense ${unitSide.defense} · HP ${unitSide.health} · Initiative ${unitSide.initiative}`,
            `Cost: ${formatCost(unitSide.cost)}`,
            unitSide.abilityText ?? ""
          ].filter(Boolean)
        });
      }}
      title={`View the ${sideLabel} ${def.name} card`}
      type="button"
    >
      {thumb}
    </button>
  );
}

function UnitSideCard({
  unitDefId,
  side,
  cost,
  ownedSide,
  sideRules
}: {
  unitDefId: string;
  side: "few" | "pack";
  /** Recruit/reinforce cost line. Omit (Unit deck view) to show only the face. */
  cost?: ResourceCost;
  ownedSide: "few" | "pack" | "neutral" | null;
  sideRules: UnitSideRules;
}) {
  const def = coreUnitDefinitions[unitDefId];
  const unitSide = side === "pack" ? def?.pack : def?.few;
  if (!def || !unitSide) {
    return null;
  }

  const owned = ownedSide === side;
  return (
    <div className={`unitSideCard ${side} ${owned ? "owned" : "unowned"}`}>
      <RecruitUnitView side={side} sideRules={sideRules} unitDefId={unitDefId} />
      <span className="unitSideMeta">
        <span className="unitSideLabel">
          {side === "few" ? "Few" : "Pack"}
          {owned ? <span className="unitOwnedBadge">Owned</span> : null}
        </span>
        {cost ? (
          <UnitCost
            cost={cost}
            label={`${side === "few" ? "Few recruit" : "Pack reinforce"} cost for ${def.name}`}
          />
        ) : null}
      </span>
    </div>
  );
}

/**
 * Both printed sides stay visible so the roster doubles as a quick army
 * inventory. Reused by the in-game Unit deck panel (ArmyPanel) so it renders
 * the SAME full card faces as the town recruit roster; omit the costs there.
 */
export function UnitSideCards({
  unitDefId,
  fewCost,
  packCost,
  ownedSide,
  sideRules
}: {
  unitDefId: string;
  fewCost?: ResourceCost;
  packCost?: ResourceCost;
  ownedSide: "few" | "pack" | "neutral" | null;
  sideRules: UnitSideRules;
}) {
  const name = coreUnitDefinitions[unitDefId]?.name ?? unitDefId;
  return (
    <div aria-label={`${name} Few and Pack cards`} className="unitSideCards">
      <UnitSideCard cost={fewCost} ownedSide={ownedSide} side="few" sideRules={sideRules} unitDefId={unitDefId} />
      <UnitSideCard cost={packCost} ownedSide={ownedSide} side="pack" sideRules={sideRules} unitDefId={unitDefId} />
    </div>
  );
}

/**
 * Shared Stack purchase strip for Pack Groups and recruited Neutrals.
 * Always shows count/cap (bronze 3 · silver 2 · gold 1), gold cost, and a
 * clear Add Stack / Max button so the army table is obvious in the town UI.
 */
function UnitStackPurchaseControls({
  owned,
  unitName,
  tier,
  canReinforce,
  legalActions,
  resources,
  onAction
}: {
  owned: ArmyUnitState;
  unitName: string;
  tier: string;
  canReinforce: boolean;
  legalActions: LegalAction[];
  resources: PlayerState["resources"];
  onAction: (action: GameAction) => void;
}) {
  // A Stack purchase is spent gold, so it is never committed on a single click:
  // the Buy button ARMS a confirm step (naming the unit + cost), and only the
  // explicit Confirm dispatches. Cancel (or the button becoming illegal) backs
  // out with nothing spent. The AI path never renders this — it dispatches the
  // POPULATION_ACTION directly.
  const [armed, setArmed] = useState(false);
  const stackCap = polishArmyUnitStackCap(owned);
  const stackCost = polishArmyUnitStackCost(owned);
  if (!stackCost || stackCap <= 0) {
    return null;
  }
  const stackCount = owned.stacks ?? 0;
  const stackAtCap = stackCount >= stackCap;
  const affordable = costAffordable(stackCost, resources);
  const stackLegal = legalActions.find(
    (legal) =>
      legal.action.type === "POPULATION_ACTION" &&
      legal.action.purchases.length === 1 &&
      legal.action.purchases[0]?.kind === "stack" &&
      legal.action.purchases[0].armyUnitId === owned.id
  );
  const kindLabel = owned.side === "neutral" ? "Neutral" : "Pack";
  const capLabel = polishUnitStackCapLabel(owned.unitDefId);
  const goldCost = stackCost.gold ?? 0;
  const valuablesCost = stackCost.valuables ?? 0;
  const costLabel = valuablesCost > 0 ? `${goldCost} gold + ${valuablesCost} valuables` : `${goldCost} gold`;
  const shortCostLabel = valuablesCost > 0 ? `${goldCost}g + ${valuablesCost}v` : `${goldCost}g`;

  return (
    <div className="stackPurchasePanel" role="group" aria-label={`Unit Stacks for ${unitName}`}>
      <span
        className={`armyStackBadge count-${Math.min(3, stackCount)} ${stackCount > 0 ? "active" : "empty"}`}
        title={`${stackCount} of ${stackCap} Unit Stacks · +1 Attack while any remain`}
      >
        <img alt="" aria-hidden="true" src={assetUrl("/assets/ui/polish-unit-stacks-coin.webp")} />
        ×{stackCount}
      </span>
      <div className="stackPurchaseMeta">
        <strong className="stackPurchaseTitle">
          Stacks <span className="stackPurchaseKind">{kindLabel}</span>
        </strong>
        <small className="stackPurchaseCost">
          {stackCount}/{stackCap}
          {capLabel ? ` · ${capLabel}` : ""} · {costLabel} each
        </small>
        <small className="stackPurchaseHint">
          +1 Attack while stacked · each Stack is one full health bar
        </small>
      </div>
      {armed && stackLegal && !stackAtCap ? (
        <div
          aria-label={`Confirm Stack purchase for ${unitName}`}
          className="stackPurchaseConfirm"
          role="group"
        >
          <small className="stackConfirmPrompt">
            Buy a Stack for <strong>{unitName}</strong> for{" "}
            <strong className="stackConfirmCost">{costLabel}</strong>?
          </small>
          <button
            className="recruitQuick stackQuick stackConfirm"
            onClick={() => {
              onAction(stackLegal.action);
              setArmed(false);
            }}
            type="button"
          >
            Confirm
          </button>
          <button className="recruitQuick ghost stackConfirmCancel" onClick={() => setArmed(false)} type="button">
            Cancel
          </button>
        </div>
      ) : (
        <button
          aria-label={
            stackAtCap
              ? `${unitName} at max ${stackCap} Stacks`
              : `Buy Stack for ${unitName} for ${costLabel}`
          }
          className={`recruitQuick stackQuick ${stackAtCap ? "atCap" : ""} ${!stackLegal && !stackAtCap ? "blocked" : ""}`}
          disabled={!stackLegal}
          onClick={() => stackLegal && setArmed(true)}
          title={
            stackAtCap
              ? `Maximum ${stackCap} Stack${stackCap === 1 ? "" : "s"} (${capLabel || tier})`
              : !canReinforce
                ? "Build the Citadel to buy Unit Stacks"
                : !affordable
                  ? `Need ${costLabel} for this Unit Stack`
                  : `Add one full-health Stack layer · ${costLabel}`
          }
          type="button"
        >
          {stackAtCap ? `Max ${stackCap}` : `Add Stack · ${shortCostLabel}`}
        </button>
      )}
    </div>
  );
}

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
  const [freelancerPrompt, setFreelancerPrompt] = useState<{
    action: Extract<GameAction, { type: "POPULATION_ACTION" }>;
    cost: ResourceCost;
  } | null>(null);
  // The basket empties when the round advances or the seat changes
  // (state-adjustment-during-render pattern).
  const [basketKey, setBasketKey] = useState("");
  const nextBasketKey = `${state.round}|${viewerPlayerId}`;
  if (basketKey !== nextBasketKey) {
    setBasketKey(nextBasketKey);
    setRecruitIds([]);
    setReinforceIds([]);
    setFreelancerPrompt(null);
  }

  const player = state.players[viewerPlayerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === viewerPlayerId);
  const faction = player?.factionId ? coreFactionDefinitions[player.factionId] : undefined;
  // Read every printed card face through the live unit-stat house rules.
  const sideRules = unitSideRulesFor(state);
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

  const canReinforce = town.buildings.some(
    (buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === "UNLOCK_REINFORCE"
  );
  const allowCopies = houseRuleEnabled(state, "duplicate-unit-recruitment");
  const foreignFactions = settlementRecruitFactions(state, viewerPlayerId);
  const recruitRoster = playerRecruitUnitIds(state, viewerPlayerId);
  // Live snapshots may remove a selected casualty, upgrade it, or transfer a
  // settlement. Discard stale selections instead of submitting phantom slots.
  const validReinforceIds = reinforceIds.filter((id) => player.army.some((unit) =>
    unit.id === id && unit.side === "few" && recruitRoster.includes(unit.unitDefId)
  ));
  const validRecruitIds = recruitIds.filter((id) => recruitRoster.includes(id) &&
    (allowCopies || !player.army.some((unit) => unit.unitDefId === id && unit.side !== "bank"))
  );
  if (validReinforceIds.length !== reinforceIds.length) setReinforceIds(validReinforceIds);
  if (validRecruitIds.length !== recruitIds.length) setRecruitIds(validRecruitIds);
  const rosterRows = recruitRoster.flatMap((unitDefId) => {
    const copies = player.army.filter((candidate) => candidate.unitDefId === unitDefId && candidate.side !== "bank");
    if (coreUnitDefinitions[unitDefId]?.faction === "neutral" && copies.length > 0) {
      return copies.map((owned) => ({ unitDefId, owned }));
    }
    return allowCopies
      ? [{ unitDefId, owned: undefined }, ...copies.map((owned) => ({ unitDefId, owned }))]
      : [{ unitDefId, owned: copies[0] }];
  });
  const purchaseIsLegal = (kind: "recruit" | "reinforce", unitDefId: string, armyUnitId?: string) =>
    legalActions.some(({ action }) => action.type === "POPULATION_ACTION" && action.purchases.some((purchase) =>
      purchase.kind === kind && purchase.unitDefId === unitDefId && (kind === "recruit" || purchase.armyUnitId === armyUnitId)
    ));
  const polishStacksEnabled = houseRuleEnabled(state, "polish-unit-stacks");
  const hasFreelancersGuild = town.buildings.some(
    (buildingId) => coreBuildingDefinitions[buildingId]?.effect?.type === "FREELANCERS_GUILD"
  );
  const affordableRecruitCost = (cost: ResourceCost) =>
    costAffordable(cost, player.resources) ||
    (hasFreelancersGuild &&
      (["materials-first", "valuables-first"] as const).some((preference) =>
        costAffordable(recruitCostWithSubstitution(state, viewerPlayerId, cost, preference), player.resources)
      ));
  const requestPopulationPurchase = (
    action: Extract<GameAction, { type: "POPULATION_ACTION" }>,
    cost: ResourceCost
  ) => {
    const goldShortfall = Math.max(0, (cost.gold ?? 0) - player.resources.gold);
    if (hasFreelancersGuild && goldShortfall > 0 && affordableRecruitCost(cost)) {
      setFreelancerPrompt({ action, cost });
      return;
    }
    onAction(action);
  };

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
  // discount (Champions' Stables, Cove Pub). Distinct Legion pieces on the same
  // unit add together. The shown total and the affordability gate use this
  // same applyRecruitGoldDiscount, so they match the engine exactly.
  for (const unitDefId of recruitIds) {
    const recruitSideName = playerRecruitUnitSide(state, viewerPlayerId, unitDefId);
    const recruitSide = recruitSideName ? coreUnitDefinitions[unitDefId]?.[recruitSideName] : undefined;
    if (recruitSide) {
      addCost(applyRecruitGoldDiscount(state, viewerPlayerId, { kind: "recruit", unitDefId }, recruitSide.cost));
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
  const basketAffordable = affordableRecruitCost(basketCost);
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
    const action = { type: "POPULATION_ACTION", playerId: viewerPlayerId, purchases } as const;
    requestPopulationPurchase(action, basketCost);
    if ((basketCost.gold ?? 0) <= player.resources.gold) {
      setRecruitIds([]);
      setReinforceIds([]);
    }
  };

  return (
    <div className="townRecruits" aria-label="Population token basket">
      <h4 title={allowCopies ? "Each copy has its own slot, experience and upgrades." : "Each unit card exists once: recruit the Few side, later reinforce it to the Pack side — then it is complete."}>
        Population token — recruit &amp; reinforce
      </h4>
      <small className="recruitLegend">
        Buy a unit&apos;s <b>Few</b> side, or <ChevronsUp aria-hidden="true" size={11} /> <b>reinforce</b> a Few you
        already own up to its stronger <b>Pack</b> side{canReinforce ? "." : " — needs the Citadel."}
        {polishStacksEnabled ? (
          <>
            {" "}
            With Unit Stacks: at the Citadel, <b>Packs</b> and recruited <b>Neutrals</b> may buy layers (bronze max 3 /
            silver 2 / gold 1) for that side&apos;s gold + tier, plus the side&apos;s printed valuables.
          </>
        ) : null}
      </small>
      {allowCopies ? <small className="recruitLegend">Buy same unit adds a new Few slot. Reinforce each copy separately; experience and casualties belong to that copy.</small> : null}
      {foreignFactions.length > 0 ? (
        <p className="settlementRecruitSources">
          Settlement factions: <b>{foreignFactions.map((id) => coreFactionDefinitions[id]?.name ?? id).join(", ")}</b>.{" "}
          {houseRuleEnabled(state, "settlement-neutral-recruitment")
            ? "Their corresponding Neutral Unit cards are available at printed Neutral cost while you control the settlement."
            : "All faction unit tiers are available at normal cost while you control the settlement."}
        </p>
      ) : null}
      {freelancerPrompt ? (
        <div className="freelancerPaymentPrompt" role="dialog" aria-label="Freelancer's Guild payment choice">
          <strong>Freelancer&apos;s Guild — choose substitute payment</strong>
          <small>
            You are short {Math.max(0, (freelancerPrompt.cost.gold ?? 0) - player.resources.gold)} gold. Building
            materials and valuables each count as exactly 1 gold.
          </small>
          <div className="freelancerPaymentOptions">
            {(["materials-first", "valuables-first"] as const).map((preference) => {
              const paid = recruitCostWithSubstitution(state, viewerPlayerId, freelancerPrompt.cost, preference);
              const materialSubstitute = Math.max(
                0,
                (paid.buildingMaterials ?? 0) - (freelancerPrompt.cost.buildingMaterials ?? 0)
              );
              const valuableSubstitute = Math.max(
                0,
                (paid.valuables ?? 0) - (freelancerPrompt.cost.valuables ?? 0)
              );
              const label = [
                materialSubstitute > 0 ? `${materialSubstitute} material${materialSubstitute === 1 ? "" : "s"}` : "",
                valuableSubstitute > 0 ? `${valuableSubstitute} valuable${valuableSubstitute === 1 ? "" : "s"}` : ""
              ].filter(Boolean).join(" + ");
              return (
                <button
                  className="commandButton primary"
                  disabled={!costAffordable(paid, player.resources)}
                  key={preference}
                  onClick={() => {
                    onAction({ ...freelancerPrompt.action, freelancerPayment: preference });
                    setFreelancerPrompt(null);
                    setRecruitIds([]);
                    setReinforceIds([]);
                  }}
                  type="button"
                >
                  Use {label || "gold"}
                </button>
              );
            })}
            <button className="commandButton" onClick={() => setFreelancerPrompt(null)} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <MgqGoldContractPanel player={player} />
      {rosterRows.map(({ unitDefId, owned }) => {
        const unit = coreUnitDefinitions[unitDefId];
        const recruitSideName = playerRecruitUnitSide(state, viewerPlayerId, unitDefId);
        const rowKey = owned?.id ?? `recruit-${unitDefId}`;
        const copyIndex = owned ? player.army.filter((candidate) => candidate.unitDefId === unitDefId && candidate.side !== "bank").findIndex((candidate) => candidate.id === owned.id) + 1 : 0;
        const copyLabel = allowCopies && owned ? ` · Copy ${copyIndex}` : "";
        const hasCopies = player.army.some((candidate) => candidate.unitDefId === unitDefId && candidate.side !== "bank");
        if (!owned && mgqGoldUnavailable(player, unitDefId)) {
          return null;
        }
        const tierUnlocked = Boolean(unit && playerRecruitTierUnlocked(state, viewerPlayerId, unitDefId));
        const rosterOwnedSide =
          owned?.side === "few" || owned?.side === "pack" || owned?.side === "neutral" ? owned.side : null;
        const rosterRecruitRef = { kind: "recruit" as const, unitDefId };
        const rosterRecruitSide = recruitSideName ? unit?.[recruitSideName] : undefined;
        const rosterRecruitCost = rosterRecruitSide
          ? applyRecruitGoldDiscount(state, viewerPlayerId, rosterRecruitRef, rosterRecruitSide.cost)
          : {};
        const rosterPackCost =
          owned?.side === "few" && unit?.pack
            ? applyRecruitGoldDiscount(
                state,
                viewerPlayerId,
                { kind: "reinforce" as const, unitDefId, armyUnitId: owned.id },
                unit.pack.cost
              )
            : unit?.pack?.cost ?? {};
        const unitCards = unit && recruitSideName === "neutral" ? (
          <div aria-label={`${unit.name} Neutral card`} className="unitSideCards">
            <RecruitUnitView side="neutral" sideRules={sideRules} unitDefId={unitDefId} />
          </div>
        ) : unit ? (
          <UnitSideCards
            fewCost={rosterRecruitCost}
            ownedSide={rosterOwnedSide}
            packCost={rosterPackCost}
            sideRules={sideRules}
            unitDefId={unitDefId}
          />
        ) : null;
        // Stack purchases require only the owned Pack + Citadel, not that tier's
        // dwelling. Keep such a Pack visible even when its dwelling is absent.
        if (!unit) {
          return null;
        }
        // A faction unit with no recruitable Few side should not happen for a
        // real roster, but never let a unit vanish (user request: "show all
        // units even not available"): show its faces + name as display-only.
        if (!unit.few && recruitSideName !== "neutral") {
          return (
            <div className="recruitRow unitRosterRow locked" key={rowKey}>
              {unitCards}
              <Star aria-hidden="true" className={`tierStar ${unit.tier}`} size={12} />
              <span className="recruitName">{unit.name}</span>
              <small className="recruitState">not recruitable</small>
            </div>
          );
        }
        // Pack (or other non-Few): the card is complete for recruit; Stacks may still apply.
        if (owned && owned.side !== "few") {
          const canStack =
            polishStacksEnabled && (owned.side === "pack" || owned.side === "neutral") && polishArmyUnitStackCap(owned) > 0;
          return (
            <div className={`recruitRow unitRosterRow done owned-${owned.side} ${canStack ? "unitStackRow" : ""}`} key={rowKey} data-army-unit-id={owned.id}>
              {unitCards}
              <Star aria-hidden="true" className={`tierStar ${unit.tier}`} size={12} />
              <span className="recruitName">
                {unit.name}{copyLabel}
                {owned.side === "neutral" ? <span className="neutralBadge">Neutral</span> : null}
              </span>
              {canStack ? (
                <UnitStackPurchaseControls
                  canReinforce={canReinforce}
                  legalActions={legalActions}
                  onAction={onAction}
                  owned={owned}
                  resources={player.resources}
                  tier={unit.tier}
                  unitName={unit.name}
                />
              ) : (
                <small className="recruitState">{owned.side === "neutral" ? "neutral unit — cannot reinforce" : "pack — fully mustered"}</small>
              )}
            </div>
          );
        }
        // Few in the army: only the pack upgrade is on offer.
        if (owned) {
          const def = coreUnitDefinitions[owned.unitDefId];
          const checked = reinforceIds.includes(owned.id);
          const upgradable = canReinforce && tierUnlocked && Boolean(def?.pack);
          const reinforceRef = { kind: "reinforce" as const, unitDefId: owned.unitDefId, armyUnitId: owned.id };
          const reinforceCost = applyRecruitGoldDiscount(state, viewerPlayerId, reinforceRef, def?.pack?.cost ?? {});
          const reinforceLegion = legionVoucherDiscount(state, viewerPlayerId, reinforceRef);
          const reinforceAffordable = affordableRecruitCost(reinforceCost);
          return (
            <div
              className={`recruitRow unitRosterRow reinforce owned-few ${checked ? "checked" : ""} ${upgradable ? "" : "locked"}`}
              key={rowKey}
              data-army-unit-id={owned.id}
              title={upgradable ? `Reinforce ${unit.name}: Few → Pack` : undefined}
            >
              {unitCards}
              <Star aria-hidden="true" className={`tierStar ${unit.tier}`} size={12} />
              <span className="recruitName">
                {unit.name}{copyLabel} <span className="fewBadge">Few</span>
              </span>
              {upgradable ? (
                <>
                  <span className="upgradeTag" title={reinforceLegion > 0 ? `Legion voucher reserved: −${reinforceLegion} gold` : undefined}>
                    <ChevronsUp aria-hidden="true" size={12} />
                    <span>Reinforce</span>
                    <UnitCost cost={reinforceCost} label={`Reinforce cost for ${unit.name}`} />
                    {reinforceLegion > 0 ? ` · Legion −${reinforceLegion}` : ""}
                  </span>
                  {/* One-click shortcut: reinforce this owned Few straight to its
                      Pack without staging the basket. The cost is shown above and
                      the button is gated on affordability, so the "limit/info"
                      stays visible either way. */}
                  <button
                    className="recruitQuick"
                    disabled={!purchaseIsLegal("reinforce", unitDefId, owned.id) || !reinforceAffordable}
                    aria-label={allowCopies ? `Reinforce ${unit.name}${copyLabel}` : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      requestPopulationPurchase(
                        {
                          type: "POPULATION_ACTION",
                          playerId: viewerPlayerId,
                          purchases: [{ kind: "reinforce", unitDefId: owned.unitDefId, armyUnitId: owned.id }]
                        },
                        reinforceCost
                      );
                    }}
                    title={
                      reinforceAffordable
                        ? `Reinforce ${unit.name} now — ${formatCost(reinforceCost)}`
                        : "Not enough resources to reinforce"
                    }
                    type="button"
                  >
                    Reinforce
                  </button>
                  <input
                    aria-label={`Reinforce ${unit.name}${copyLabel} to a pack`}
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
            </div>
          );
        }
        const checked = recruitIds.includes(unitDefId);
        const recruitRef = { kind: "recruit" as const, unitDefId };
        const recruitCost = applyRecruitGoldDiscount(state, viewerPlayerId, recruitRef, rosterRecruitSide!.cost);
        const recruitLegion = legionVoucherDiscount(state, viewerPlayerId, recruitRef);
        const recruitAffordable = affordableRecruitCost(recruitCost);
        return (
          <div className={`recruitRow unitRosterRow ${tierUnlocked ? "" : "locked"}`} key={rowKey}>
            {unitCards}
            <Star aria-hidden="true" className={`tierStar ${unit.tier}`} size={12} />
            <span className="recruitName">
              {unit.name}{recruitSideName === "neutral" ? <span className="neutralBadge">Neutral</span> : null}
            </span>
            <small title={recruitLegion > 0 ? `Legion voucher reserved: −${recruitLegion} gold` : undefined}>
              <UnitCost cost={recruitCost} label={`Recruit cost for ${unit.name}`} />
              {recruitLegion > 0 ? ` · Legion −${recruitLegion}` : ""}
            </small>
            {tierUnlocked ? (
              <>
                {/* One-click shortcut: recruit this unit's Few into your unit deck now,
                    skipping the basket. Cost shown to the left, button gated on
                    affordability — the "limit/info" stays visible. */}
                <button
                  className="recruitQuick"
                  disabled={!purchaseIsLegal("recruit", unitDefId) || !recruitAffordable}
                  aria-label={allowCopies ? `${hasCopies ? "Buy same unit" : "Recruit"}: ${unit.name}` : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    requestPopulationPurchase(
                      {
                        type: "POPULATION_ACTION",
                        playerId: viewerPlayerId,
                        purchases: [{ kind: "recruit", unitDefId }]
                      },
                      recruitCost
                    );
                  }}
                  title={
                    recruitAffordable ? `Recruit ${unit.name} now — ${formatCost(recruitCost)}` : "Not enough resources to recruit"
                  }
                  type="button"
                >
                  {allowCopies && hasCopies ? "Buy same unit" : "Recruit"}
                </button>
                <input
                  aria-label={`Add ${unit.name} to the recruit basket`}
                  checked={checked}
                  onChange={() =>
                    setRecruitIds((current) =>
                      checked ? current.filter((id) => id !== unitDefId) : [...current, unitDefId]
                    )
                  }
                  type="checkbox"
                />
              </>
            ) : (
              /* The engine rejects a locked-tier recruit ("Build the dwelling of that
                 unit's level first"), so the row shows the requirement instead of an
                 always-failing button. The cards stay visible for planning/zoom. */
              <small className="recruitState">build the {unit.tier} dwelling first</small>
            )}
          </div>
        );
      })}
      {/* Recruited Neutrals sit outside the faction roster — dedicated Stack rows. */}
      {polishStacksEnabled && canReinforce
        ? (() => {
            const neutrals = player.army.filter(
              (owned) => owned.side === "neutral" && polishArmyUnitStackCap(owned) > 0
            );
            if (neutrals.length === 0) {
              return null;
            }
            return (
              <div className="neutralStackSection" aria-label="Recruited Neutrals — Unit Stacks">
                <span className="neutralStackSectionLabel">
                  Recruited Neutrals · Stacks (bronze 3 / silver 2 / gold 1)
                </span>
                {neutrals.map((owned) => {
                  const unit = coreUnitDefinitions[owned.unitDefId];
                  if (!unit) {
                    return null;
                  }
                  return (
                    <div className="recruitRow done unitStackRow neutralStackRow" key={`neutral-stack-${owned.id}`}>
                      <RecruitUnitView side="neutral" sideRules={sideRules} unitDefId={owned.unitDefId} />
                      <Star aria-hidden="true" className={`tierStar ${unit.tier}`} size={12} />
                      <span className="recruitName">
                        {unit.name}
                        <span className="neutralBadge">Neutral</span>
                      </span>
                      <UnitStackPurchaseControls
                        canReinforce={canReinforce}
                        legalActions={legalActions}
                        onAction={onAction}
                        owned={owned}
                        resources={player.resources}
                        tier={unit.tier}
                        unitName={unit.name}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })()
        : null}
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
  onAction,
  state
}: {
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
  state: GameState;
}) {
  const [selectedHeroDefId, setSelectedHeroDefId] = useState<string | null>(null);
  const hireActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "HIRE_SECONDARY_HERO" }> } =>
      legal.action.type === "HIRE_SECONDARY_HERO"
  );
  if (hireActions.length === 0) {
    return null;
  }
  const heroDefIds = [...new Set(hireActions.map((legal) => legal.action.heroDefId))];
  const activeHeroDefId = heroDefIds.includes(selectedHeroDefId ?? "")
    ? selectedHeroDefId!
    : heroDefIds[0];
  const locationActions = hireActions.filter((legal) => legal.action.heroDefId === activeHeroDefId);
  const slotPositions: Record<number, { left: string; top: string }> = {
    0: { left: "50%", top: "50%" },
    1: { left: "67%", top: "20%" },
    2: { left: "83%", top: "50%" },
    3: { left: "67%", top: "80%" },
    4: { left: "33%", top: "80%" },
    5: { left: "17%", top: "50%" },
    6: { left: "33%", top: "20%" }
  };
  return (
    <div className="townActions" aria-label="Hire a Secondary Hero">
      <h4 title="A Secondary Hero has 2 movement, plays no cards and never gains experience. One per player.">
        Hire a Secondary Hero — 10 gold
      </h4>
      <small className="hireHeroHint">Choose a portrait, then choose the Town or Settlement on the map.</small>
      <div className="hireHeroRoster" aria-label="Choose Secondary Hero portrait">
        {heroDefIds.map((heroDefId) => {
          const heroDef = heroDefId ? coreHeroDefinitions[heroDefId] : undefined;
          return (
            <button
              aria-pressed={heroDefId === activeHeroDefId}
              className={`commandButton hireHeroChoice${heroDefId === activeHeroDefId ? " selected" : ""}`}
              key={heroDefId}
              onClick={() => setSelectedHeroDefId(heroDefId)}
              title={`Use ${heroDef?.name ?? heroDefId}'s portrait`}
              type="button"
            >
              <HeroPortrait
                name={heroDef?.name ?? heroDefId}
                portrait={heroDef?.portrait}
                size={28}
              />
              {heroDef?.name ?? heroDefId}
            </button>
          );
        })}
      </div>
      <div className="hireLocationGrid" aria-label="Choose hire location">
        {locationActions.map((legal) => {
          const action = legal.action;
          const field = action.fieldId ? state.adventure?.fields[action.fieldId] : undefined;
          const tile = field ? state.adventure?.tiles[field.tileInstanceId] : undefined;
          const tileArt = tile ? allTileDefinitions[tile.tileDefId]?.assets?.tileImage : undefined;
          const locationName = field
            ? (locationDefinitions[field.location]?.name ?? field.location)
            : "Your Town";
          const placeName = field?.location === "settlement" ? "Controlled Settlement" : locationName;
          const heroName = coreHeroDefinitions[action.heroDefId]?.name ?? action.heroDefId;
          const markerPosition = slotPositions[field?.slot ?? 0] ?? slotPositions[0];
          return (
            <button
              aria-label={`Hire ${heroName} at ${placeName}${action.fieldId ? ` ${action.fieldId}` : ""}`}
              className="hireLocationCard"
              key={actionKey(action)}
              onClick={() => onAction(action)}
              type="button"
            >
              <span className="hireLocationThumb" aria-hidden="true">
                {tileArt ? (
                  <img alt="" draggable={false} src={assetUrl(tileArt)} />
                ) : (
                  <span className="hireLocationFallback">{field?.location === "settlement" ? "Village" : "Town"}</span>
                )}
                <span className="hireLocationMarker" style={markerPosition}>
                  <MapPin size={18} strokeWidth={3} />
                </span>
              </span>
              <span className="hireLocationText">
                <strong>{placeName}</strong>
                <small>{action.fieldId ?? "Town"}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
