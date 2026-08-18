"use client";

/* eslint-disable @next/next/no-img-element */

import { Clock3, Dices } from "lucide-react";
import { assetUrl } from "@/lib/asset-url";
import { COMBAT_TOKEN_IMAGES } from "@/data/assets/homm-assets";
import { cardLibrary } from "@/data/cards/library";
import {
  artifactSetDefinition,
  artifactSetIconImage,
  effectAppliesToUnit,
  unitAttackRollAdvantaged,
  unitAttackRollDisadvantaged,
  type ActiveEffectModifier,
  type ActiveEffectState,
  type CombatUnitState,
  type GameState
} from "@/engine";

// ---------------------------------------------------------------------------
// The battlefield card's LIVE-EFFECT icon rail (`.boardCardEffectIcons`).
//
// WHAT IT IS FOR: a Defense token and the Polish Set Artifact bonuses used to
// leave NO mark on the battlefield card — a Defense token showed only as a tiny
// shield on the initiative rail and a line of inspector text, and a set bonus
// ("rolls 2 Attack dice and keeps the higher") showed nothing at all outside the
// feed. So a player could not tell, looking at the board, which of their units
// was carrying what.
//
// WHERE IT SITS: the card's OUTER LEFT edge — the mirror of the stat-token rail
// (`.boardCardStatTokens`, outer RIGHT edge). `.boardCard` is `width: min(150px,
// 66%)` inside a centred cell, so both rails live in the cell's own slack and
// neither can cover the printed stat rail, the name plate or the HUD pill.
//
// EVERYTHING HERE IS PRESENTATION over already-public state: `unit.defenseToken`
// and `state.activeEffects` are in every seat's player view, so an icon is shown
// to every viewer, and nothing is cached — the rail is re-derived each render, so
// an icon appears and disappears exactly with its effect.
// ---------------------------------------------------------------------------

/** One icon on the rail. `image` is a raw asset path — the renderer wraps it. */
export type UnitEffectIcon = {
  /** Stable React key (an effect id, or the fixed key of a derived icon). */
  key: string;
  kind: "defense-token" | "artifact-set" | "ongoing-card" | "roll-advantage" | "roll-disadvantage";
  /** The owning set, for `artifact-set` icons (also stamped as `data-set-id`). */
  setId?: string;
  /** Asset path for image-backed icons; absent for the lucide dice glyph. */
  image?: string;
  /** Compact duration marker drawn over an ongoing card icon. */
  counter?: string;
  /** Hover/accessible text — names the source AND what it does. */
  label: string;
};

/**
 * Plain words for one modifier a set tier lays on a unit. Every branch matches a
 * modifier an `ArtifactSetTierEffect` can actually create (INITIATIVE_BONUS from
 * `select-unit`, the two roll modes, ATTACK_BONUS / DEFENSE_BONUS, FIRE_SHIELD);
 * anything else falls through to null and the effect's own name is used instead,
 * so a future set effect can never render a blank chip.
 */
function describeModifier(modifier: ActiveEffectModifier): string | null {
  switch (modifier.type) {
    case "ATTACK_ROLL_ADVANTAGE":
      return "rolls 2 Attack dice, keeps the higher";
    case "ATTACK_ROLL_DISADVANTAGE":
      return "rolls 2 Attack dice, keeps the lower";
    case "INITIATIVE_BONUS":
      return `${modifier.amount >= 0 ? "+" : ""}${modifier.amount} Initiative`;
    case "ATTACK_BONUS":
      return `${modifier.amount >= 0 ? "+" : ""}${modifier.amount} Attack`;
    case "DEFENSE_BONUS":
      return `${modifier.amount >= 0 ? "+" : ""}${modifier.amount} Defense`;
    case "FIRE_SHIELD":
      return `burns adjacent attackers for ${modifier.amount}`;
    default:
      return null;
  }
}

/** "Angelic Alliance — rolls 2 Attack dice, keeps the higher". */
function describeSetEffect(effect: ActiveEffectState): string {
  const setName = artifactSetDefinition(effect.artifactSetId ?? "")?.name ?? effect.name;
  const parts = effect.modifiers.map(describeModifier).filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `${setName} (set) — ${parts.join(", ")}` : `${setName} (set)`;
}

/**
 * Every icon this unit's LIVE state earns right now, in render order. Pure — it
 * reads state only, so an expired effect or a spent Defense token drops out of
 * the rail on the very next render.
 *
 * DELIBERATE SCOPE (what is NOT here):
 *  - Combat TOKENS (Attack / Weakness / Corrosion / Paralysis) and poison cubes
 *    already draw on the card as `TokenChips`; duplicating them would be noise.
 *  - Stat SWINGS already draw on the outer-right `.boardCardStatTokens` rail.
 *    A set bonus that is purely a stat change therefore shows twice — once as
 *    the anonymous "+1 ⚔" chip and once as its set's icon, which is the point:
 *    the chip says how much, the icon says who granted it.
 *  - PLAYER-scoped set passives (Power of the Dragon Father's "all your units
 *    suffer 1 less Spell damage") are a fold, not an active effect on a unit, so
 *    they have nothing to hang an icon on. The set status panel is their surface.
 */
export function unitEffectIcons(state: GameState, unit: CombatUnitState): UnitEffectIcon[] {
  const icons: UnitEffectIcon[] = [];

  if (unit.defenseToken) {
    icons.push({
      key: "defense-token",
      kind: "defense-token",
      image: COMBAT_TOKEN_IMAGES.defense,
      label: "Defense token — rolls the Defend die when struck (+1 Defense on a “+1”)"
    });
  }

  // Set-sourced effects, tagged at their two creation sites in the reducer. A
  // legacy snapshot's effects carry no `artifactSetId`, so nothing is drawn for
  // them — never a crash, never a wrong set.
  const setEffects = state.activeEffects.filter(
    (effect) => Boolean(effect.artifactSetId) && effectAppliesToUnit(effect, unit)
  );
  for (const effect of setEffects) {
    icons.push({
      key: effect.id,
      kind: "artifact-set",
      setId: effect.artifactSetId,
      image: artifactSetIconImage(effect.artifactSetId!),
      label: describeSetEffect(effect)
    });
  }

  // Every card-sourced ongoing effect played DIRECTLY on this unit wears a
  // small copy of that card outside the creature card. The counter is the
  // number of combat rounds still covered (or 1 for an activation-scoped
  // effect such as Forgetfulness). Cards in the public Ongoing tray and these
  // markers are derived from the same active effect, so neither can outlive the
  // other. Set effects have their own purpose-built icon above.
  const ongoingCardEffects = state.activeEffects.filter(
    (effect) =>
      !effect.artifactSetId &&
      effect.source.type === "card" &&
      effect.scope === "unit" &&
      effect.target?.type === "unit" &&
      effect.target.unitId === unit.id &&
      effect.duration.type !== "instant" &&
      effectAppliesToUnit(effect, unit)
  );
  // PLAYER- and GLOBAL-scoped card effects (Mirth's Attack-die reroll, Archery, a
  // global artifact aura…) have no single unit to sit on, so before this branch a
  // player could cast Mirth and see NOTHING on the board — no marker, no duration.
  // Show them on every unit the effect actually touches (its owner's units for a
  // player scope; both armies for a global one), reusing the same card-icon +
  // duration-counter treatment as a directly-targeted ongoing effect ("like Fire
  // Shield", user request). Set passives keep their own panel (artifactSetId
  // excluded); the per-unit `scope: "unit"` branch above never overlaps these.
  const broadScopeCardEffects = state.activeEffects.filter(
    (effect) =>
      !effect.artifactSetId &&
      effect.source.type === "card" &&
      (effect.scope === "player" || effect.scope === "global") &&
      effect.duration.type !== "instant" &&
      effectAppliesToUnit(effect, unit)
  );
  for (const effect of [...ongoingCardEffects, ...broadScopeCardEffects]) {
    const card = effect.source.type === "card" ? cardLibrary[effect.source.cardId] : undefined;
    const rounds =
      effect.expiresAtCombatRoundEnd !== undefined && state.combat
        ? Math.max(1, effect.expiresAtCombatRoundEnd - state.combat.round + 1)
        : effect.duration.type === "current-activation" || effect.duration.type === "next-activation"
          ? 1
          : undefined;
    icons.push({
      key: `ongoing-${effect.id}`,
      kind: "ongoing-card",
      image: card?.assets?.cardImage,
      counter: rounds === undefined ? undefined : String(rounds),
      label: `${card?.name ?? effect.name} — ongoing on ${unit.cardName}${
        rounds === undefined ? "" : ` (${rounds} ${rounds === 1 ? "round/activation" : "rounds"} remaining)`
      }`
    });
  }

  // A roll mode from a NON-set source (Shaman's Puppet, the Nightmare's Fear …)
  // has no set icon to wear, so it gets the generic two-dice glyph. Withheld
  // when a set icon above already carries the same modifier, so one effect can
  // never draw two icons.
  const displayedEffectCarries = (type: ActiveEffectModifier["type"]) =>
    setEffects.some((effect) => effect.modifiers.some((modifier) => modifier.type === type));
  const ongoingCarries = (type: ActiveEffectModifier["type"]) =>
    [...ongoingCardEffects, ...broadScopeCardEffects].some((effect) =>
      effect.modifiers.some((modifier) => modifier.type === type)
    );
  if (unitAttackRollAdvantaged(state, unit) && !displayedEffectCarries("ATTACK_ROLL_ADVANTAGE") && !ongoingCarries("ATTACK_ROLL_ADVANTAGE")) {
    icons.push({
      key: "roll-advantage",
      kind: "roll-advantage",
      label: "Rolls 2 Attack dice and keeps the higher"
    });
  }
  if (unitAttackRollDisadvantaged(state, unit) && !displayedEffectCarries("ATTACK_ROLL_DISADVANTAGE") && !ongoingCarries("ATTACK_ROLL_DISADVANTAGE")) {
    icons.push({
      key: "roll-disadvantage",
      kind: "roll-disadvantage",
      label: "Rolls 2 Attack dice and keeps the lower"
    });
  }

  return icons;
}

/**
 * The rail itself. Renders NOTHING (no wrapper element at all) for a unit with
 * no defense token and no tagged effect, so an ordinary battlefield card keeps
 * exactly the DOM it has always had.
 *
 * LIMIT: the rail is `pointer-events: none` (like its `.boardCardStatTokens`
 * sibling) so it can never swallow a click meant for the battlefield cell it
 * hangs in — which also means the browser does not fire the native `title`
 * tooltip on hover. The `title` is kept as the element's accessible text (and
 * the DOM contract the tests pin); the icon itself is the at-a-glance signal and
 * the unit inspector stays the full text surface.
 */
export function UnitEffectIcons({ state, unit }: { state: GameState; unit: CombatUnitState }) {
  const icons = unitEffectIcons(state, unit);
  if (icons.length === 0) {
    return null;
  }
  return (
    <span aria-label={`${unit.cardName} live effects`} className="boardCardEffectIcons">
      {icons.map((icon) => (
        <span
          className={`boardEffectIcon ${icon.kind}`}
          data-effect-kind={icon.kind}
          {...(icon.setId ? { "data-set-id": icon.setId } : {})}
          key={icon.key}
          title={icon.label}
        >
          {icon.image ? (
            <img alt="" aria-hidden="true" draggable={false} loading="lazy" src={assetUrl(icon.image)} />
          ) : icon.kind === "ongoing-card" ? (
            <Clock3 aria-hidden="true" size={10} />
          ) : (
            <Dices aria-hidden="true" size={10} />
          )}
          {icon.counter ? <b className="boardEffectCounter">{icon.counter}</b> : null}
        </span>
      ))}
    </span>
  );
}
