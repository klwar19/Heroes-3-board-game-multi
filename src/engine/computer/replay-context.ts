import type { GameAction, GameState } from "../state";
import type { PolicyAction } from "./replay-model";

/** Public rule switches only. Kept dependency-free for offline replay training. */
export function replayConditions(state: GameState): string {
  const experience = Boolean(state.adventure?.unitExperience) ||
    Boolean(state.mode === "combat-sandbox" && state.wog?.enabled && state.wog.unitExperience) ||
    Boolean(state.anime?.enabled && state.anime.unitExperience);
  return [state.ruleset ?? "default", `commander:${Boolean(state.wog?.enabled && state.wog.commanders)}`,
    `xp:${experience}`, `book:${Boolean(state.adventure?.spellBook)}`].join(",");
}

/** Decision-time facts, shared by capture and live AI. No private enemy cards. */
export function replayDecisionFacts(state: GameState, playerId: string, action: GameAction): {
  conditions: string; situation: string; action: PolicyAction;
} {
  const player = state.players[playerId];
  const commander = player?.commander;
  const army = (player?.army ?? []).map(unit =>
    `${unit.unitDefId}:${unit.side}:xp${unit.experience ?? 0}`).sort();
  const hero = Object.values(state.heroes ?? {}).find(h => h.controllerId === playerId && h.kind === "main");
  const book = [...(player?.spellBook ?? [])].sort();
  const commanderChoice = action.type.startsWith("COMMANDER_") || action.type === "REVIVE_COMMANDER" || action.type === "FORGE_COMMANDER_ARTIFACT";
  const drill = action.type === "DRILL_UNIT" ? player?.army.find(unit => unit.id === action.armyUnitId) : undefined;
  const spellChoice = /SPELL|CARD|REACTION/.test(action.type);
  const situation = JSON.stringify({
    commander: commander ? [commander.slug, Boolean(commander.dead),
      // grades is optional on legacy snapshots (commanderGradesOf defaults it).
      Object.entries(commander.grades ?? {}).sort(([a], [b]) => a.localeCompare(b))] : null,
    level: hero?.level ?? 0,
    army: commanderChoice ? undefined : army,
    drill: drill ? [drill.unitDefId, drill.side, drill.experience ?? 0] : undefined,
    book: spellChoice ? book : undefined,
    // Hand identities are actor-owned; these distinguish spell/card combinations.
    hand: spellChoice ? [...(player?.hand ?? [])].sort() : undefined,
    enemy: state.combat ? Object.values(state.combat.units)
      .filter(unit => unit.controllerId !== playerId && unit.position >= 0 && unit.damage < unit.maxHealth)
      .map(unit => [unit.unitDefId, unit.maxHealth - unit.damage]).sort() : undefined,
  });
  let described: PolicyAction = { ...action };
  if ("armyUnitId" in action && action.armyUnitId) {
    const unit = player?.army.find(u => u.id === action.armyUnitId);
    if (unit) described = { ...described, unitDefId: unit.unitDefId };
  }
  if (action.type === "MOVE_HERO" || action.type === "MOVE_HERO_PATH") {
    const destination = action.type === "MOVE_HERO" ? action.to : action.path.at(-1);
    const field = destination ? state.adventure?.fields[destination] : undefined;
    if (field) described = { ...described,
      objective: `${field.location ?? "terrain"}:${field.resource ?? "none"}:${field.flagOwnerId === playerId ? "owned" : "unowned"}`,
    };
  }
  if ("target" in action && action.target && "type" in action.target && action.target.type === "unit") {
    const target = state.combat?.units[action.target.unitId];
    if (target) described = { ...described,
      tacticalTarget: `${target.controllerId === playerId ? "ally" : "enemy"}:${target.unitDefId}:${target.damage > 0 ? "damaged" : "healthy"}`,
    };
  }
  return { conditions: replayConditions(state), situation, action: described };
}
