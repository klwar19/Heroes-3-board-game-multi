import { appendEvent } from "./events";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { createSeededRandom } from "./random";
import { animeFactionPenaltyTitle } from "@/data/anime/faction-penalties";
import type { GameState, PlayerId } from "./state";

const FOUR_GOLD_FACTIONS = new Set(["fuyuki", "azure_breeze", "heavenly_demon"]);
const HAND_LIMIT_FACTIONS = new Set(["hidden_leaf", "mgq"]);

function spendAvailable(state: GameState, playerId: PlayerId, cost: { gold?: number; buildingMaterials?: number }): { gold: number; buildingMaterials: number } {
  const player = state.players[playerId];
  if (!player) return { gold: 0, buildingMaterials: 0 };
  const gold = Math.min(cost.gold ?? 0, player.resources.gold);
  const buildingMaterials = Math.min(cost.buildingMaterials ?? 0, player.resources.buildingMaterials);
  player.resources.gold -= gold;
  player.resources.buildingMaterials -= buildingMaterials;
  if (gold > 0 || buildingMaterials > 0) {
    appendEvent(state, {
      type: "RESOURCES_SPENT",
      playerId,
      cost: { ...(gold > 0 ? { gold } : {}), ...(buildingMaterials > 0 ? { buildingMaterials } : {}) }
    });
  }
  return { gold, buildingMaterials };
}

/** Applies the faction's mandatory penalty after every automatic income source. */
export function applyAnimeFactionResourceRoundPenalty(state: GameState, playerId: PlayerId): void {
  const player = state.players[playerId];
  if (!player?.factionId) return;

  // Each town names its own penalty (single source of truth in the data table),
  // so the notice reads per-town — never a shared "Otherworld Penalty".
  const title = animeFactionPenaltyTitle(player.factionId);
  if (!title) return;

  if (FOUR_GOLD_FACTIONS.has(player.factionId)) {
    const paid = spendAvailable(state, playerId, { gold: 4 });
    appendEvent(state, {
      type: "EVENT_NOTE",
      playerId,
      message: `${title} — ${paid.gold} gold lost${paid.gold < 4 ? " (all available gold)" : ""}.`
    });
    return;
  }

  if (HAND_LIMIT_FACTIONS.has(player.factionId)) {
    // ROUND-SCOPED, non-cumulative: the hand limit falls by 1 for THIS Resource
    // round only, then reverts to normal. `startAdventureRound` clears the loss
    // at the top of every round, so it never stacks to −2/−3 across the game.
    player.otherworldHandLimitLoss = 1;
    appendEvent(state, {
      type: "EVENT_NOTE",
      playerId,
      message: `${title} — hand limit reduced by 1 for this Resource round.`
    });
    return;
  }

  if (player.factionId === "little_busters") {
    const paid = spendAvailable(state, playerId, { gold: 5, buildingMaterials: 1 });
    appendEvent(state, {
      type: "EVENT_NOTE",
      playerId,
      message: `${title} — ${paid.gold} gold and ${paid.buildingMaterials} building material paid${paid.gold < 5 || paid.buildingMaterials < 1 ? " (all available resources)" : ""}.`
    });
  }
}
/** One random real Azur Lane army card suffers 1 damage at combat start. */
export function applyAzurLaneCombatStartPenalty(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;
  const done = combat.azurLaneMaintenanceDone ?? [];
  const title = animeFactionPenaltyTitle("azur_lane") ?? "Fleet Maintenance";
  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (playerId === "neutrals" || done.includes(playerId) || state.players[playerId]?.factionId !== "azur_lane") continue;
    done.push(playerId);
    combat.azurLaneMaintenanceDone = done;
    const candidates = Object.values(combat.units)
      .filter((unit) =>
        unit.controllerId === playerId &&
        Boolean(unit.armyUnitId) &&
        !unit.commanderSlug &&
        !unit.summoned &&
        !unit.temporary &&
        unit.damage < unit.maxHealth
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    if (candidates.length === 0) {
      appendEvent(state, {
        type: "EVENT_NOTE",
        playerId,
        message: `${title} — no deployed Azur Lane army unit could suffer the damage.`
      });
      continue;
    }
    const random = createSeededRandom(`${state.seed}#azur-lane-maintenance#${combat.id}#${playerId}`);
    const unit = random.pick(candidates);
    unit.damage += 1;
    markUnitRemovedIfNeeded(state, unit);
    appendEvent(state, {
      type: "EVENT_NOTE",
      playerId,
      message: `${title} — ${unit.cardName} suffers 1 damage at combat start.`
    });
  }
}
