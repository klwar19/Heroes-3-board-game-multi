/**
 * Wake of Gods COMMANDER ARTIFACTS (`wog.artifacts` + `wog.commanders`, Task 2).
 *
 * Eight authentic WoG "commander artifacts" — items worn by the commander, not
 * the hero — adapted to the board game as PERMANENT slot bindings. Each artifact
 * prints its slot ("weapon" | "armor" | "trinket"); a card is acquired from the
 * shared Artifact decks like any other and then BOUND onto the player's commander
 * (BIND_COMMANDER_ARTIFACT). Binding is permanent — no unbind, no swap — and
 * survives the commander's death and revival. One artifact per slot.
 *
 * SINGLE SOURCE OF TRUTH: `COMMANDER_ARTIFACT_SPECS` (keyed by card id) carries
 * the slot AND the exact wired combat effect. The card definitions below are
 * GENERATED from it (so the card's BIND slot always matches the spec), and the
 * engine reads the SAME registry:
 *   - makeCommanderCombatUnit folds the flat stats (attack/defense/health/
 *     initiative) and appends the ability ids (Might die, line-attack);
 *   - commanderCastPower adds the cast-Power bonus (pendant);
 *   - finalizeCommandersAfterCombat honours the free-revive flag (helm).
 * Every field here is engine-consumed — no decorative data (CLAUDE.md §2).
 *
 * ADAPTATION / LIMITS (lead with these, CLAUDE.md §4):
 *   - WoG's per-victory INCREMENTAL bonuses are NOT modeled — each artifact grants
 *     a FIXED printed bonus.
 *   - Bow of Seeking and Slava's Ring of Power are NOT shipped (no clean engine
 *     arm for their WoG behaviours yet).
 *   - Binding is permanent by design; commander-scope rules (main-hero fights
 *     only) are unchanged.
 *
 * These join the shared Artifact deck(s) ONLY when ALL THREE of `wog.enabled`,
 * `wog.artifacts` and `wog.commanders` are on (dead cards without a commander) —
 * see `wogCommanderArtifact*Ids` consumed by `makeSharedDecks`. The definitions
 * live in the card library ALWAYS so lookups resolve.
 *
 * ART: all eight ship with real card faces (`public/assets/wog/artifacts/<slug>.webp`)
 * and slot icons (`public/assets/wog/artifacts/icons/<slug>.webp`).
 */

import type { CardLibrary, CardDefinition, CommanderArtifactSlot } from "@/engine/state";
import { wogArtifactArtPath } from "./artifacts";

const wogCommanderArtifactSource = {
  product: "Heroes III: In the Wake of Gods (fan expansion) — board-game adaptation",
  credit:
    "Original board-game adaptation of the WoG COMMANDER artifacts (items worn by the commander). WoG's per-victory incremental bonuses are NOT modeled — each artifact grants the fixed printed bonus; the text describes exactly the engine-wired effect. Bow of Seeking and Slava's Ring of Power are not shipped.",
  url: "https://www.vault.acidcave.net/download.php?id=72"
} as const;

/** The wired per-artifact effect. All bonuses are folded/appended by the engine. */
export interface CommanderArtifactSpec {
  cardId: string;
  /** Art slug under public/assets/wog/artifacts. */
  slug: string;
  name: string;
  slot: CommanderArtifactSlot;
  tier: "minor" | "major" | "relic";
  /** Plain-words wired effect line (printed on the card AND the UI chip). */
  effectText: string;
  /** Flat stat bonuses folded into makeCommanderCombatUnit beside the grade values. */
  attack?: number;
  defense?: number;
  health?: number;
  initiative?: number;
  /**
   * Unit ability ids appended to the commander's combat unit (like the combos).
   * Sword → `commander-might-1` (rides the Damage-grade Might dice machinery);
   * Ring → `dragon-line-attack-3` (the Gold-Dragon / Factory-Mechanics line-attack arm).
   */
  abilityIds?: readonly string[];
  /** Command cast Power +N (pendant), added in commanderCastPower. */
  castPowerBonus?: number;
  /** Helm: a commander that dies in combat revives FREE at combat end. */
  reviveFree?: boolean;
}

export const COMMANDER_ARTIFACT_SPECS: Record<string, CommanderArtifactSpec> = {
  // ---- Weapon ------------------------------------------------------------
  "wog.artifact.axe_of_smashing": {
    cardId: "wog.artifact.axe_of_smashing",
    slug: "axe_of_smashing",
    name: "Axe of Smashing",
    slot: "weapon",
    tier: "major",
    effectText: "+2 Attack.",
    attack: 2
  },
  "wog.artifact.sword_of_sharpness": {
    cardId: "wog.artifact.sword_of_sharpness",
    slug: "sword_of_sharpness",
    name: "Sword of Sharpness",
    slot: "weapon",
    tier: "major",
    // Rides the existing Damage-grade Might-dice machinery: one extra attack die
    // (a "+1" raises the attack, at most one "−1" lowers it) on every attack.
    effectText: 'rolls +1 Might attack die on every attack (a "+1" raises the Attack).',
    abilityIds: ["commander-might-1"]
  },
  // ---- Armor -------------------------------------------------------------
  "wog.artifact.hardened_shield": {
    cardId: "wog.artifact.hardened_shield",
    slug: "hardened_shield",
    name: "Hardened Shield",
    slot: "armor",
    tier: "minor",
    effectText: "+1 Defense.",
    defense: 1
  },
  "wog.artifact.mithril_mail": {
    cardId: "wog.artifact.mithril_mail",
    slug: "mithril_mail",
    name: "Mithril Mail",
    slot: "armor",
    tier: "major",
    effectText: "+2 Health.",
    health: 2
  },
  "wog.artifact.helm_of_immortality": {
    cardId: "wog.artifact.helm_of_immortality",
    slug: "helm_of_immortality",
    name: "Helm of Immortality",
    slot: "armor",
    tier: "relic",
    effectText: "if the commander dies in combat it revives FREE at combat end (death never persists, no gold).",
    reviveFree: true
  },
  // ---- Trinket -----------------------------------------------------------
  "wog.artifact.boots_of_haste": {
    cardId: "wog.artifact.boots_of_haste",
    slug: "boots_of_haste",
    name: "Boots of Haste",
    slot: "trinket",
    tier: "minor",
    effectText: "+1 Initiative.",
    initiative: 1
  },
  "wog.artifact.pendant_of_sorcery": {
    cardId: "wog.artifact.pendant_of_sorcery",
    slug: "pendant_of_sorcery",
    name: "Pendant of Sorcery",
    slot: "trinket",
    tier: "major",
    effectText: "command cast Power +1.",
    castPowerBonus: 1
  },
  "wog.artifact.dragon_eye_ring": {
    cardId: "wog.artifact.dragon_eye_ring",
    slug: "dragon_eye_ring",
    name: "Dragon Eye Ring",
    slot: "trinket",
    tier: "relic",
    // Reuses the Gold-Dragon / Factory-Mechanics SECOND_ATTACK_BEHIND_TARGET arm
    // (`dragon-line-attack-3`): after the commander's attack a full separate
    // attack at attack 3 strikes the unit directly behind the target.
    effectText: "the commander's attacks also strike the space directly behind the target (a separate attack 3 hit that never provokes retaliation).",
    abilityIds: ["dragon-line-attack-3"]
  }
};

export const COMMANDER_ARTIFACT_SPEC_LIST: readonly CommanderArtifactSpec[] =
  Object.values(COMMANDER_ARTIFACT_SPECS);

const slotLabel: Record<CommanderArtifactSlot, string> = {
  weapon: "weapon",
  armor: "armor",
  trinket: "trinket"
};

/** Generate the card definition for one spec (single-source with the registry). */
function buildCommanderArtifactCard(spec: CommanderArtifactSpec): CardDefinition {
  return {
    id: spec.cardId,
    name: spec.name,
    kind: "artifact",
    timing: "instant",
    artifactTier: spec.tier,
    tags: [
      "artifact",
      spec.tier,
      "wog",
      `Commander artifact — ${slotLabel[spec.slot]}. Bind permanently to your commander: ${spec.effectText} Binding removes this card from the game.`
    ],
    effect: {
      type: "CHOOSE_ONE",
      options: [
        {
          label: `Bind to your commander — ${slotLabel[spec.slot]} slot`,
          mapOnly: true,
          cost: { removeSelf: true },
          effect: { type: "BIND_COMMANDER_ARTIFACT", slot: spec.slot }
        }
      ]
    },
    assets: {
      cardImage: wogArtifactArtPath(spec.slug),
      imageAlt: `${spec.name} commander artifact card`
    },
    implementationStatus: "implemented",
    source: wogCommanderArtifactSource
  };
}

export const wogCommanderArtifactCards: CardLibrary = Object.fromEntries(
  COMMANDER_ARTIFACT_SPEC_LIST.map((spec) => [spec.cardId, buildCommanderArtifactCard(spec)])
);

// ---------------------------------------------------------------------------
// Aggregation — the single reader for a commander's bound artifacts. Engine
// helpers (makeCommanderCombatUnit / commanderCastPower / the helm check) call
// this so the wired behaviour is derived in ONE place.
// ---------------------------------------------------------------------------

export interface CommanderArtifactBonuses {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
  abilityIds: string[];
  castPowerBonus: number;
  reviveFree: boolean;
}

/** Sum the wired bonuses of every artifact bound onto a commander. */
export function aggregateCommanderArtifactBonuses(
  artifacts: Partial<Record<CommanderArtifactSlot, string>> | undefined
): CommanderArtifactBonuses {
  const totals: CommanderArtifactBonuses = {
    attack: 0,
    defense: 0,
    health: 0,
    initiative: 0,
    abilityIds: [],
    castPowerBonus: 0,
    reviveFree: false
  };
  if (!artifacts) {
    return totals;
  }
  for (const cardId of Object.values(artifacts)) {
    if (!cardId) {
      continue;
    }
    const spec = COMMANDER_ARTIFACT_SPECS[cardId];
    if (!spec) {
      continue;
    }
    totals.attack += spec.attack ?? 0;
    totals.defense += spec.defense ?? 0;
    totals.health += spec.health ?? 0;
    totals.initiative += spec.initiative ?? 0;
    totals.castPowerBonus += spec.castPowerBonus ?? 0;
    if (spec.reviveFree) {
      totals.reviveFree = true;
    }
    if (spec.abilityIds) {
      totals.abilityIds.push(...spec.abilityIds);
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Deck-join id lists by tier. `makeSharedDecks` appends these to the matching
// shared Artifact deck ONLY when `wog.enabled && wog.artifacts && wog.commanders`
// (mirroring the Task-1 join); the split-deck variants use the per-tier lists and
// the legacy single deck uses the combined list. Any OFF ⇒ byte-identical decks.
// ---------------------------------------------------------------------------

function idsForTier(tier: CommanderArtifactSpec["tier"]): string[] {
  return COMMANDER_ARTIFACT_SPEC_LIST.filter((spec) => spec.tier === tier).map((spec) => spec.cardId);
}

export const wogCommanderArtifactMinorIds: readonly string[] = idsForTier("minor");
export const wogCommanderArtifactMajorIds: readonly string[] = idsForTier("major");
export const wogCommanderArtifactRelicIds: readonly string[] = idsForTier("relic");

/** Every commander-artifact id, in tier order (legacy single-deck join). */
export const wogCommanderArtifactCardIds: readonly string[] = [
  ...wogCommanderArtifactMinorIds,
  ...wogCommanderArtifactMajorIds,
  ...wogCommanderArtifactRelicIds
];
