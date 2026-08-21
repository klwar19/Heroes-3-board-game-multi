import type { CombatState } from "./state";

/**
 * The ONE shared "is this fight run by the optional PvE encounter director?"
 * read: a Calamity Wave assault, a Raid-Boss lair fight, or a Dungeon floor
 * fight. These three context marks are reserved for those modules.
 *
 * It lives in this LEAF module (types only) so both `combat-board-art.ts`
 * (which re-exports it, and reaches into `adventure.ts` for the bank check) and
 * the dependency-light `neutral-control.ts` can consume the SAME predicate
 * without an import cycle. Import it from `./combat-board-art` as before, or
 * from here when your module must stay a leaf.
 */
export function isPveEncounterCombat(combat: CombatState | null | undefined): boolean {
  return Boolean(
    combat?.context.kind === "neutral" &&
      (combat.context.waveAssault ||
        combat.context.raidBossId !== undefined ||
        combat.context.dungeonFloor !== undefined)
  );
}
