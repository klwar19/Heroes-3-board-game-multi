/**
 * Polish Random Artifacts — roll + access override used by every Artifact
 * acquisition path (shared-deck Search, dig, black market, events, Pandora
 * Search upgrade). Lives in its own module so adventure.ts and
 * adventure-reducer.ts can both call it without an import cycle.
 */
import { ATTACK_DIE_FACES } from "./battlefield";
import { appendEvent, eventSeedNumber } from "./events";
import { houseRuleEnabled } from "./house-rules";
import {
  polishArtifactAccessAfterRoll,
  polishArtifactBandFromHeroLevel,
  polishArtifactBandFromTileGroup,
  type PolishArtifactBand
} from "./polish-house-rules";
import { bakeEntropy, createSeededRandom } from "./random";
import type { GameState, HeroState, PlayerId } from "./state";

/** Whether this shared-deck id is an Artifact deck (split or legacy). */
export function isArtifactSharedDeckId(deckId: string): boolean {
  return (
    deckId === "artifacts" ||
    deckId === "artifacts-minor" ||
    deckId === "artifacts-major" ||
    deckId === "artifacts-relic"
  );
}

/**
 * Whether `deckId` is currently allowed under the live polishArtifactAccess
 * override (or always when the rule is off / no override).
 */
export function polishArtifactDeckAllowed(state: GameState, deckId: string): boolean {
  const access = state.adventure?.polishArtifactAccess;
  if (!access || !houseRuleEnabled(state, "polish-random-artifacts")) {
    return true;
  }
  if (deckId === "artifacts" || deckId === "artifacts-minor") {
    return access.minor;
  }
  if (deckId === "artifacts-major") {
    return access.major;
  }
  if (deckId === "artifacts-relic") {
    return access.relic;
  }
  return true;
}

/** Whether a given artifact *tier* is allowed under the live override. */
export function polishArtifactTierAllowed(
  state: GameState,
  tier: "minor" | "major" | "relic" | string | undefined
): boolean {
  const access = state.adventure?.polishArtifactAccess;
  if (!access || !houseRuleEnabled(state, "polish-random-artifacts")) {
    return true;
  }
  const t = tier ?? "minor";
  if (t === "major") return access.major;
  if (t === "relic") return access.relic;
  return access.minor;
}

/**
 * Polish Random Artifacts: roll one Attack die and set adventure.polishArtifactAccess
 * + polishRandomArtifactDie. No-op when the rule is off, split decks are off, or
 * an override is already set (unless `force`).
 *
 * Returns the die face, or null when the rule did not roll.
 */
export function maybeApplyPolishRandomArtifactRoll(
  state: GameState,
  playerId: PlayerId,
  hero: HeroState | null | undefined,
  bandSource: "tile" | "level",
  force = false
): number | null {
  if (!houseRuleEnabled(state, "polish-random-artifacts")) {
    return null;
  }
  if (!houseRuleEnabled(state, "split-decks") || !state.decks["artifacts-minor"]) {
    return null;
  }
  const adventure = state.adventure;
  if (!adventure) {
    return null;
  }
  if (adventure.polishArtifactAccess && !force) {
    return adventure.polishRandomArtifactDie ?? null;
  }

  let band: PolishArtifactBand;
  if (bandSource === "level") {
    band = polishArtifactBandFromHeroLevel(hero?.level ?? 1);
  } else {
    const field = hero?.spaceId ? adventure.fields[hero.spaceId] : undefined;
    const tile = field?.tileInstanceId ? adventure.tiles[field.tileInstanceId] : undefined;
    band = polishArtifactBandFromTileGroup(tile?.group);
  }

  const random = createSeededRandom(
    bakeEntropy(`${state.seed}-polish-random-artifact-${eventSeedNumber(state)}`)
  );
  const dieFace = ATTACK_DIE_FACES[random.nextInt(0, ATTACK_DIE_FACES.length - 1)]!;
  const access = polishArtifactAccessAfterRoll(band, dieFace);
  adventure.polishArtifactAccess = access;
  adventure.polishRandomArtifactDie = dieFace;
  appendEvent(state, {
    type: "ADVENTURE_DICE_ROLLED",
    playerId,
    dice: "attack",
    results: [dieFace === 1 ? "+1" : dieFace === -1 ? "−1" : "0"],
    attackRolls: [dieFace]
  });
  return dieFace;
}

/** Band for a field visit (tile the visitor stands on / the field's tile). */
export function polishArtifactBandForField(
  state: GameState,
  fieldId: string | undefined
): PolishArtifactBand {
  const adventure = state.adventure;
  if (!adventure || !fieldId) {
    return "starting";
  }
  const field = adventure.fields[fieldId];
  const tile = field?.tileInstanceId ? adventure.tiles[field.tileInstanceId] : undefined;
  return polishArtifactBandFromTileGroup(tile?.group);
}

/** Clear the Polish Random Artifacts access override after an acquisition ends. */
export function clearPolishArtifactAccess(state: GameState): void {
  if (state.adventure) {
    state.adventure.polishArtifactAccess = null;
    state.adventure.polishRandomArtifactDie = null;
  }
}
