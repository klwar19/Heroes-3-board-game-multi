/** Ordered Attack-die results from the Battlefield Conditions reference table. */
export type BattlefieldConditionDie = -1 | 0 | 1;
export type BattlefieldConditionId =
  | "dense-fog" | "raining-ash" | "scorching-earth"
  | "sinking-mud" | "clear-skies" | "rocky-terrain"
  | "fey-trickery" | "tail-wind" | "perfect-conditions";

export type BattlefieldConditionDefinition = {
  id: BattlefieldConditionId;
  name: string;
  summary: string;
  dice: readonly [BattlefieldConditionDie, BattlefieldConditionDie];
};

export const BATTLEFIELD_CONDITIONS: readonly BattlefieldConditionDefinition[] = [
  { id: "dense-fog", name: "Dense Fog", summary: "Fog banks roll in and lift between rounds; while the fog is thick, all ranged Units gain disadvantage.", dice: [-1, -1] },
  { id: "raining-ash", name: "Raining Ash", summary: "All flying Units gain −2 Initiative.", dice: [-1, 0] },
  { id: "scorching-earth", name: "Scorching Earth", summary: "All silver and golden Units start Combat with 1 damage token.", dice: [-1, 1] },
  { id: "sinking-mud", name: "Sinking Mud", summary: "All ground Units move one space less.", dice: [0, -1] },
  { id: "clear-skies", name: "Clear Skies", summary: "No effect.", dice: [0, 0] },
  { id: "rocky-terrain", name: "Rocky Terrain", summary: "All ground Units gain a Defense token.", dice: [0, 1] },
  { id: "fey-trickery", name: "Fey Trickery", summary: "Players activate their Units in ascending order of Unit Initiative.", dice: [1, -1] },
  { id: "tail-wind", name: "Tail Wind", summary: "Flying Units gain +1 Movement.", dice: [1, 0] },
  { id: "perfect-conditions", name: "Perfect Conditions", summary: "All ranged Units gain advantage.", dice: [1, 1] },
];

export function getBattlefieldCondition(id: BattlefieldConditionId): BattlefieldConditionDefinition {
  return BATTLEFIELD_CONDITIONS.find(condition => condition.id === id)!;
}

export function battlefieldConditionForDice(
  dice: readonly [BattlefieldConditionDie, BattlefieldConditionDie],
): BattlefieldConditionDefinition {
  return BATTLEFIELD_CONDITIONS.find(condition => condition.dice[0] === dice[0] && condition.dice[1] === dice[1])!;
}

export function formatBattlefieldConditionDie(face: BattlefieldConditionDie): string {
  return face === 1 ? "+1" : String(face);
}
