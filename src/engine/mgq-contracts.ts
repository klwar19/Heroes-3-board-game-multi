import { coreUnitDefinitions } from "@/data/factions/units";
import type { GameState, PlayerState } from "./state";

export const MGQ_GOLD_CONTRACT_LIMIT = 3;

export function isMgqGoldUnit(unitDefId: string): boolean {
  const def = coreUnitDefinitions[unitDefId];
  return def?.faction === "mgq" && def.tier === "gold";
}

export function mgqGoldRoster(): string[] {
  return Object.values(coreUnitDefinitions)
    .filter((definition) => definition.faction === "mgq" && definition.tier === "gold")
    .map((definition) => definition.id)
    .sort();
}

/**
 * New games choose exactly three identities during setup. `undefined` is retained
 * as the legacy-save sentinel: snapshots made before the setup picker keep the
 * old fill-on-first-recruit behavior instead of becoming unusable after reload.
 */
export function mgqGoldContractAllows(player: PlayerState, unitDefId: string): boolean {
  if (!isMgqGoldUnit(unitDefId)) return true;
  const picks = player.mgqGoldContracts;
  if (player.mgqGoldContractSetupRequired === undefined) {
    return Boolean(picks?.includes(unitDefId)) || (picks?.length ?? 0) < MGQ_GOLD_CONTRACT_LIMIT;
  }
  return picks?.length === MGQ_GOLD_CONTRACT_LIMIT && picks.includes(unitDefId);
}

/** Legacy-save compatibility only; new games commit both setup choices at once. */
export function recordMgqGoldContract(player: PlayerState, unitDefId: string): void {
  if (!isMgqGoldUnit(unitDefId)) return;
  if (player.mgqGoldContractSetupRequired !== undefined) return;
  const picks = player.mgqGoldContracts ?? [];
  if (!picks.includes(unitDefId)) {
    player.mgqGoldContracts = [...picks, unitDefId].slice(0, MGQ_GOLD_CONTRACT_LIMIT);
  }
}

function validSetupPicks(player: PlayerState): string[] {
  return [...new Set(player.mgqGoldContracts ?? [])].filter(isMgqGoldUnit).slice(0, MGQ_GOLD_CONTRACT_LIMIT);
}

function contractPairs(existing: string[]): [string, string, string][] {
  const roster = mgqGoldRoster();
  const available = roster.filter((unitDefId) => !existing.includes(unitDefId));
  const triples: [string, string, string][] = [];
  if (existing.length === 2) {
    return available.map((unitDefId) => [existing[0]!, existing[1]!, unitDefId]);
  }
  if (existing.length === 1) {
    for (let first = 0; first < available.length; first += 1) {
      for (let second = first + 1; second < available.length; second += 1) {
        triples.push([existing[0]!, available[first]!, available[second]!]);
      }
    }
    return triples;
  }
  for (let first = 0; first < available.length; first += 1) {
    for (let second = first + 1; second < available.length; second += 1) {
      for (let third = second + 1; third < available.length; third += 1) {
        triples.push([available[first]!, available[second]!, available[third]!]);
      }
    }
  }
  return triples;
}

/** Open the next mandatory setup picker, if one is owed and no other window is open. */
export function ensureMgqGoldContractSetupChoice(state: GameState): boolean {
  if (state.mode !== "adventure" || state.setupLobby || state.pendingChoice || state.reactionWindow || state.combat) {
    return false;
  }
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (player?.factionId !== "mgq" || !player.mgqGoldContractSetupRequired) continue;
    const existing = validSetupPicks(player);
    if (existing.length === MGQ_GOLD_CONTRACT_LIMIT) {
      player.mgqGoldContracts = existing;
      player.mgqGoldContractSetupRequired = false;
      continue;
    }
    const pairs = contractPairs(existing);
    state.pendingChoice = {
      id: `choice_mgq_gold_${state.eventLog.length + 1}_${playerId}`,
      type: "OPTION_CHOICE",
      playerId,
      prompt: "Gold Contract — choose exactly three Gold Companions for this game.",
      options: pairs.map(([first, second, third]) => ({
        label: `${coreUnitDefinitions[first]?.name ?? first} + ${coreUnitDefinitions[second]?.name ?? second} + ${coreUnitDefinitions[third]?.name ?? third}`
      })),
      context: "mgq-gold-contract",
      mgqGoldContract: { pairs },
      returnPhase: state.phase
    };
    state.phase = "choice";
    state.priorityPlayerId = playerId;
    return true;
  }
  return false;
}

/** Validate and atomically commit one setup trio, then advance to another MGQ seat. */
export function resolveMgqGoldContractSetupChoice(
  state: GameState,
  playerId: string,
  optionIndex: number
): void {
  const choice = state.pendingChoice;
  const player = state.players[playerId];
  const pair = choice?.type === "OPTION_CHOICE" ? choice.mgqGoldContract?.pairs[optionIndex] : undefined;
  if (
    choice?.type !== "OPTION_CHOICE" ||
    choice.context !== "mgq-gold-contract" ||
    choice.playerId !== playerId ||
    !player ||
    player.factionId !== "mgq" ||
    !player.mgqGoldContractSetupRequired ||
    !pair ||
    new Set(pair).size !== MGQ_GOLD_CONTRACT_LIMIT ||
    !pair.every(isMgqGoldUnit)
  ) {
    throw new Error("That Gold Contract trio cannot be selected.");
  }
  player.mgqGoldContracts = [...pair];
  player.mgqGoldContractSetupRequired = false;
  // Custom setups can request Gold starting units before this picker exists.
  // Contract resolution is the authoritative roster cut: only the three chosen
  // physical Gold cards may remain in either current or recorded starting army.
  player.army = player.army.filter((unit) => !isMgqGoldUnit(unit.unitDefId) || pair.includes(unit.unitDefId));
  player.startingArmy = player.startingArmy.filter(
    (unit) => !isMgqGoldUnit(unit.unitDefId) || pair.includes(unit.unitDefId)
  );
  state.pendingChoice = null;
  state.phase = choice.returnPhase;
  state.priorityPlayerId = null;
  ensureMgqGoldContractSetupChoice(state);
}
