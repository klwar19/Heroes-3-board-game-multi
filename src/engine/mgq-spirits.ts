import { makeCombatUnitFromArmy, getMainHero } from "./adventure";
import { makeActiveEffect } from "./active-effects";
import { playerMainHeroInCombat } from "./anime-hero-grades";
import { getRuleset, unitSideRuleOverrides } from "./ruleset";
import type { GameState, MgqSpirit, PlayerId } from "./state";

export const MGQ_SPIRITS: readonly MgqSpirit[] = ["sylph", "gnome", "undine", "salamander"];

export const MGQ_SPIRIT_LABELS: Record<MgqSpirit, string> = {
  sylph: "Sylph",
  gnome: "Gnome",
  undine: "Undine",
  salamander: "Salamander"
};

export const MGQ_SPIRIT_RULES: Record<MgqSpirit, { basic: string; advanced: string }> = {
  sylph: {
    basic: "1/0/3/8 · elemental damage · no Retaliation",
    advanced: "2/0/5/15 · elemental damage · no Retaliation · your other troops gain +1 Initiative"
  },
  gnome: {
    basic: "2/2/2/4 · always rolls the Defend die",
    advanced: "3/2/4/5 · always rolls the Defend die · adjacent allies gain a Defense token"
  },
  undine: {
    basic: "2/0/4/5 · before moving, heal another friendly unit for 1",
    advanced: "3/0/7/6 · heal 2 · immune to Water Magic"
  },
  salamander: {
    basic: "3/1/3/6 · reroll every -1",
    advanced: "4/1/4/7 · roll 2 Attack dice and apply both · reroll every -1"
  }
};

/** The new Four Spirits mechanic is innate: every MGQ main hero may choose any spirit. */
export function mgqContractedSpirits(state: GameState, playerId: PlayerId): MgqSpirit[] {
  return state.players[playerId]?.factionId === "mgq" ? [...MGQ_SPIRITS] : [];
}

export function mgqCanSelectSpirit(state: GameState, playerId: PlayerId, spirit: MgqSpirit): boolean {
  return MGQ_SPIRITS.includes(spirit) && state.players[playerId]?.factionId === "mgq";
}

function firstFreeSpiritCell(state: GameState, playerId: PlayerId): number | undefined {
  const combat = state.combat;
  if (!combat) return undefined;
  const cells = playerId === combat.attackerPlayerId
    ? [16, 17, 18, 19, 12, 13, 14, 15, 9, 10, 5, 6]
    : [0, 1, 2, 3, 4, 5, 6, 7];
  const occupied = new Set(
    Object.values(combat.units).filter((unit) => unit.damage < unit.maxHealth).map((unit) => unit.position)
  );
  for (const obstacle of combat.obstacles ?? []) occupied.add(obstacle);
  for (const token of combat.battlefieldTokens ?? []) occupied.add(token.position);
  for (const wall of combat.siege?.walls ?? []) occupied.add(wall);
  if (combat.siege?.gatePosition != null) occupied.add(combat.siege.gatePosition);
  return cells.find((cell) => !occupied.has(cell));
}

/** Summon the selected basic face at levels 1–3 and advanced face at levels 4–7. */
export function seedMgqSpiritsForCombat(state: GameState): void {
  const combat = state.combat;
  if (!combat) return;
  combat.mgqSpirits = {};

  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    const player = state.players[playerId];
    if (!player || player.factionId !== "mgq" || !playerMainHeroInCombat(state, playerId)) continue;
    // Never silently fall back to Sylph: the player must make the visible
    // Four Spirits choice before battle.
    const selected = player.mgqSpirit;
    if (!selected) continue;
    const position = firstFreeSpiritCell(state, playerId);
    if (position === undefined) continue;
    const advanced = (getMainHero(state, playerId)?.level ?? 1) >= 4;
    const side = advanced ? "pack" : "few";
    const spirit = makeCombatUnitFromArmy(
      { id: `spirit_${selected}`, unitDefId: `mgq.spirit_${selected}`, side },
      playerId,
      `unit_${playerId}_spirit_${selected}`,
      position,
      getRuleset(state),
      unitSideRuleOverrides(state)
    );
    if (!spirit) continue;
    spirit.summoned = true;
    spirit.temporary = true;
    delete spirit.armyUnitId;
    combat.units[spirit.id] = spirit;
    combat.mgqSpirits[playerId] = selected;

    if (advanced && selected === "sylph") {
      for (const troop of Object.values(combat.units)) {
        if (troop.controllerId !== playerId || troop.id === spirit.id || troop.damage >= troop.maxHealth) continue;
        state.activeEffects.push(makeActiveEffect(state, {
          name: "Sylph — Wind Swiftness",
          scope: "unit",
          duration: { type: "combat" },
          polarity: "positive",
          removable: false,
          modifiers: [{ type: "INITIATIVE_BONUS", amount: 1 }]
        }, { type: "system" }, playerId, { type: "unit", unitId: troop.id }));
      }
    }
  }
}
