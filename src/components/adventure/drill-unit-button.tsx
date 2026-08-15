"use client";

import { Coins, Dumbbell } from "lucide-react";

import {
  unitDrillGoldCost,
  unitDrillLimit,
  unitDrillMovementCost,
  unitDrillsUsedThisRound,
  type ArmyUnitState,
  type GameAction,
  type GameState,
  type PlayerId
} from "@/engine";

export function DrillUnitButton({
  state,
  playerId,
  unit,
  unitName,
  action,
  onAction
}: {
  state: GameState;
  playerId: PlayerId;
  unit: ArmyUnitState;
  unitName: string;
  action: GameAction;
  onAction: (action: GameAction) => void;
}) {
  const cost = unitDrillGoldCost(unit);
  const limit = unitDrillLimit(state, playerId);
  const used = unitDrillsUsedThisRound(state, playerId);
  const remaining = Math.max(0, limit - used);
  const movementCost = unitDrillMovementCost(state, playerId) ?? 0;
  const pricing =
    unit.side === "neutral"
      ? "recruited Neutral rate"
      : unit.side === "bank"
        ? "Creature Bank card rate"
        : `${cost === 1 ? "bronze" : cost === 2 ? "silver" : "gold/azure"} rate`;
  const locationRule = movementCost
    ? "This field also costs 1 movement. Towns, Settlements and Random Towns waive that movement cost."
    : "No movement cost at a Town, Settlement or Random Town.";
  const tip = `Drill ${unitName}: pay ${cost} gold to gain +1 persistent unit XP. ${pricing}; ${remaining} of ${limit} Drill ${limit === 1 ? "use" : "uses"} remaining this round. ${locationRule}`;

  return (
    <button
      aria-label={`Drill ${unitName}: pay ${cost} gold${movementCost ? " and 1 movement" : ""} for 1 unit experience`}
      className="drillUnitButton"
      data-tip={tip}
      onClick={() => onAction(action)}
      title={tip}
      type="button"
    >
      <span aria-hidden="true" className="drillUnitButtonIcon">
        <Dumbbell size={19} strokeWidth={2.6} />
      </span>
      <span className="drillUnitButtonText">
        <strong>Drill unit</strong>
        <small>Gain +1 unit XP{movementCost ? " · costs 1 MP here" : " · no MP here"}</small>
      </span>
      <span className="drillUnitButtonCost" title={`${cost} gold`}>
        <Coins aria-hidden="true" size={15} />
        <b>{cost}</b>
        <small>gold</small>
      </span>
    </button>
  );
}
