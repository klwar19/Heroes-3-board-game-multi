import { cardLibrary } from "@/data/cards/library";
import { unitImmuneToSpellSchoolsByEffect } from "./active-effects";
import {
  getBattlefieldCoordinates,
  getBattlefieldPositions,
  getHexRowPositions,
  getOrthogonalNeighbors,
  isHexPosition
} from "./battlefield";
import { deathRippleReachesUnit, getEffectiveCardEffectForState } from "./effects";
import {
  areaAround,
  unitAtCell,
  unitInCells,
  unitOccupiesCell,
  unitsAdjacent
} from "./hex-footprint";
import { hexPcSpellArea, hexPcSpellBlast } from "./hex-spell-areas";
import {
  getAttackKind,
  isUnitAlive,
  spellAbilitiesSuppressed,
  standingSpellPower,
  wallKindOfEffectType,
  wallPlacementCells
} from "./legal-actions";
import { bladeDanceSplashFor } from "./little-busters-specialties";
import { chainHexHopPreview } from "./chain-lightning-hex";
import {
  cellBehindTarget,
  chainLightningReachable,
  findUnitBehindTarget,
  unitIgnoresCardDamage
} from "./reducer";
import { parseFortificationTargetId } from "./siege";
import type {
  CardDefinition,
  CardLibrary,
  CombatState,
  CombatUnitState,
  EffectDefinition,
  GameAction,
  GameState,
  PlayerId,
  TargetRef,
  UnitId
} from "./state";
import {
  getFlatDamageFollowUps,
  getLineAttackAbility,
  getSecondAttackAbility,
  getSecondAttackCandidates,
  getSelfAdjacentSecondAttackAbility,
  getUnitAbilityDefinitions,
  unitImmuneToSpellSchools
} from "./unit-abilities";

/**
 * "Who will be affected" read of one targeted action, for the board's hover
 * highlight. Display only: it never changes what an action does.
 *
 * Every geometry here is the one the reducer resolves with (areaAround /
 * unitInCells / unitsAdjacent / cellBehindTarget / chainLightningReachable and
 * the unit-ability follow-up readers), so a two-hex creature counts when ANY of
 * its hexes is in the area and a line through a two-hex target continues past
 * its second hex. It reads public board state only — never a hand, a face-down
 * trap or a future die: a follow-up that a die face, a kill, the Power still to
 * be paid or a later pick decides is reported as `possibleUnitIds`, not as a hit.
 */
export type ActionTargetPreview = {
  /** The unit(s) the action is aimed at (the attacked unit, the Spell's target, the blast's centre). */
  primaryUnitIds: UnitId[];
  /** Other units the action will affect: splash, area, line, all-adjacent sweeps (friend or foe). */
  splashUnitIds: UnitId[];
  /** Units a later pick, a die face, a kill or the Power paid decides between (may be affected). */
  possibleUnitIds: UnitId[];
  /** Board cells an area / line / space effect covers ([] for unit-only actions). */
  cells: number[];
  /**
   * The side acting (the attacker's controller, else the action's player): a
   * unit it controls that the action hits is friendly fire.
   */
  actingControllerId: PlayerId;
};

type ConcreteEffect = Exclude<EffectDefinition, { type: "CHOOSE_ONE" }>;

class PreviewBuilder {
  private readonly primary = new Set<UnitId>();
  private readonly splash = new Set<UnitId>();
  private readonly possible = new Set<UnitId>();
  private readonly area = new Set<number>();

  addPrimary(ids: Iterable<UnitId>): void {
    for (const id of ids) this.primary.add(id);
  }

  addSplash(ids: Iterable<UnitId>): void {
    for (const id of ids) this.splash.add(id);
  }

  addPossible(ids: Iterable<UnitId>): void {
    for (const id of ids) this.possible.add(id);
  }

  addCells(cells: Iterable<number>): void {
    for (const cell of cells) this.area.add(cell);
  }

  build(actingControllerId: PlayerId): ActionTargetPreview {
    // A unit reads once, at its strongest certainty.
    const splash = [...this.splash].filter((id) => !this.primary.has(id));
    const possible = [...this.possible].filter((id) => !this.primary.has(id) && !this.splash.has(id));
    return {
      primaryUnitIds: [...this.primary],
      splashUnitIds: splash,
      possibleUnitIds: possible,
      cells: [...this.area].sort((left, right) => left - right),
      actingControllerId
    };
  }
}

function livingUnits(combat: CombatState): CombatUnitState[] {
  return Object.values(combat.units).filter(isUnitAlive);
}

/** The centre space of a unit / space target (a unit's head), as the resolvers read it. */
function targetCentre(combat: CombatState, target: TargetRef): number | undefined {
  if (target.type === "space") return target.position;
  if (target.type === "unit") return combat.units[target.unitId]?.position;
  return undefined;
}

/**
 * Whether a card's area damage lands on `unit` at all: dealAreaCardDamage and
 * the area picks skip a unit that ignores this card's damage (Spell / Specialty
 * immunity, Orb of Inhibition).
 */
function cardDamageReaches(state: GameState, unit: CombatUnitState, card: CardDefinition): boolean {
  return !unitIgnoresCardDamage(state, unit, card);
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

/**
 * A declared attack: the defender, plus the printed post-attack follow-ups of
 * the attacker (reducer: applyAfterAttackSplash + the post-attack follow-up
 * table — Magog / Cerberi flat splash, Liches' Death Cloud, Gold Dragons' line,
 * Hydras' extra attack, attack-all-adjacent), each read with the reducer's own
 * candidate helper against the attacker's position at the moment it strikes.
 */
function previewAttack(
  state: GameState,
  combat: CombatState,
  attacker: CombatUnitState,
  defender: CombatUnitState,
  followUps: boolean,
  builder: PreviewBuilder
): void {
  builder.addPrimary([defender.id]);
  if (!followUps || !isUnitAlive(attacker)) return;

  const units = livingUnits(combat);
  const others = (unit: CombatUnitState) => unit.id !== attacker.id && unit.id !== defender.id;
  const enemyOfAttacker = (unit: CombatUnitState) => unit.controllerId !== attacker.controllerId;
  // The first-attack-only follow-ups check `attacksThisActivation === 1` right
  // after this attack counts itself, i.e. 0 now.
  const firstAttack = (attacker.attacksThisActivation ?? 0) === 0;
  const attackKind = getAttackKind(attacker, defender, combat);

  // Blade Dance (activation effect): every OTHER enemy beside the attacker,
  // gated on the attack die — certain only when even the lowest face qualifies.
  if (bladeDanceSplashFor(state, attacker, 1) > 0) {
    const ids = units
      .filter((unit) => others(unit) && enemyOfAttacker(unit) && unitsAdjacent(combat, unit, attacker))
      .map((unit) => unit.id);
    if (bladeDanceSplashFor(state, attacker, -1) > 0) builder.addSplash(ids);
    else builder.addPossible(ids);
  }

  const abilities = getUnitAbilityDefinitions(attacker).filter(
    (ability) => ability.implementationStatus === "implemented"
  );

  // AFTER_ATTACK_SPLASH (Chakra Burst around self — friend and foe, the melee
  // target included; Full Barrage around the target — enemies only).
  for (const ability of abilities) {
    if (ability.effect?.type !== "AFTER_ATTACK_SPLASH") continue;
    const { around, enemiesOnly } = ability.effect;
    const anchor = around === "target" ? defender : attacker;
    builder.addSplash(
      units
        .filter(
          (unit) =>
            unit.id !== attacker.id &&
            (around !== "target" || unit.id !== defender.id) &&
            (!enemiesOnly || enemyOfAttacker(unit)) &&
            unitsAdjacent(combat, unit, anchor)
        )
        .map((unit) => unit.id)
    );
  }

  // Flat-damage splashes (Magogs beside the target, Cerberi beside self, Kyrie,
  // Wakamo's marked target). One candidate = the mandatory hit; several = a pick.
  // Wakamo's arm needs the attack to deal damage, which the die decides.
  const unconditional = new Set(
    getFlatDamageFollowUps(combat, { attacker, defender, attackKind, damage: 0 }).map((entry) => entry.abilityId)
  );
  for (const followUp of getFlatDamageFollowUps(combat, { attacker, defender, attackKind, damage: 1 })) {
    const living = followUp.candidateUnitIds.filter((id) => {
      const unit = combat.units[id];
      return unit !== undefined && isUnitAlive(unit);
    });
    if (living.length === 1 && unconditional.has(followUp.abilityId)) builder.addSplash(living);
    else builder.addPossible(living);
  }

  // Liches' Death Cloud (and its kin): a second attack on a unit adjacent to the
  // target — friends and the attacker itself included unless enemies-only.
  const secondAttack = firstAttack ? getSecondAttackAbility(attacker) : null;
  if (secondAttack && !(secondAttack.requiresNonAdjacentTarget && unitsAdjacent(combat, attacker, defender))) {
    const candidates = getSecondAttackCandidates(combat, attacker, defender, secondAttack.enemiesOnly);
    if (candidates.length === 1 && !secondAttack.optional && secondAttack.onRoll === undefined) {
      builder.addSplash(candidates);
    } else {
      builder.addPossible(candidates);
    }
  }

  // Gold Dragons' line / breath: the unit directly behind the target (friend or
  // foe), continuing past a two-hex target's second hex.
  const lineAttack = getLineAttackAbility(attacker);
  if (lineAttack && (lineAttack.enemyOnly || firstAttack)) {
    const behindCell = cellBehindTarget(attacker, defender, false, combat);
    const behind = findUnitBehindTarget(combat, attacker, defender);
    if (behindCell !== null) builder.addCells([behindCell]);
    if (behind && (!lineAttack.enemyOnly || behind.controllerId !== attacker.controllerId)) {
      builder.addSplash([behind.id]);
    }
  }

  // Hydras (one more enemy beside the Hydra) / Cove Ayssids (only after a kill).
  const selfAdjacent = firstAttack ? getSelfAdjacentSecondAttackAbility(attacker) : null;
  if (selfAdjacent) {
    const candidates = units
      .filter((unit) => others(unit) && enemyOfAttacker(unit) && unitsAdjacent(combat, unit, attacker))
      .map((unit) => unit.id);
    if (candidates.length === 1 && !selfAdjacent.requiresTargetRemoved) builder.addSplash(candidates);
    else builder.addPossible(candidates);
  }

  // Attack all adjacent (Magic Elementals — friends too — / Cerberi sweeps).
  if (firstAttack) {
    for (const ability of abilities) {
      if (ability.effect?.type !== "SECOND_ATTACK_ALL_ADJACENT_TO_SELF") continue;
      const includeAllies = ability.effect.includeAllies === true;
      builder.addSplash(
        units
          .filter(
            (unit) =>
              others(unit) &&
              (includeAllies || enemyOfAttacker(unit)) &&
              unitsAdjacent(combat, unit, attacker)
          )
          .map((unit) => unit.id)
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Cards (Spells and Hero Specialty plays)
// ---------------------------------------------------------------------------

/** Units standing (any of their hexes) in `cells` whom the card's damage reaches. */
function cardDamageUnitsIn(
  state: GameState,
  combat: CombatState,
  card: CardDefinition,
  cells: ReadonlySet<number>
): CombatUnitState[] {
  return livingUnits(combat).filter(
    (unit) => unitInCells(combat, unit, cells) && cardDamageReaches(state, unit, card)
  );
}

function previewCard(
  state: GameState,
  combat: CombatState,
  playerId: PlayerId,
  card: CardDefinition,
  effect: ConcreteEffect,
  target: TargetRef,
  /** Whether the action is a PLAY_CARD (else a CAST_SPELL); both resolve the printed picks alike. */
  _viaPlayCard: boolean,
  builder: PreviewBuilder
): void {
  const units = livingUnits(combat);
  const enemies = units.filter((unit) => unit.controllerId !== playerId);
  const centre = targetCentre(combat, target);

  switch (effect.type) {
    // Xyron's Inferno / Zeestral Storm Circuit (applyAreaAllAdjacentPlay): the
    // ring around the centre body (a two-hex centre is ringed as a whole), plus
    // the centre unless excluded; Zeestral VI spares the caster's own units.
    case "AREA_DAMAGE_ALL_ADJACENT": {
      if (centre === undefined) return;
      const centreUnit =
        target.type === "unit" ? combat.units[target.unitId] : unitAtCell(combat, centre, units);
      // Hex battlefield: Xyron's Inferno / Adelaide VI take their PC area.
      const blast =
        hexPcSpellBlast(combat, card.id, centreUnit ?? centre) ??
        areaAround(combat, centreUnit ?? centre, effect.includeCenter !== false);
      builder.addCells(blast);
      for (const unit of cardDamageUnitsIn(state, combat, card, blast)) {
        const isCentre = unitOccupiesCell(combat, unit, centre);
        if (effect.adjacentEnemiesOnly && !isCentre && unit.controllerId === playerId) continue;
        if (isCentre) builder.addPrimary([unit.id]);
        else builder.addSplash([unit.id]);
      }
      return;
    }

    // Frost Ring / meteor-family picks (resolveAreaPickDamage + applyAdjacentPicks):
    // the centre body when included, then the ring's candidates — all hit when
    // no more stand than the picks, otherwise the caster picks.
    case "AREA_DAMAGE_PICK_ADJACENT": {
      if (centre === undefined) return;
      const centreBody = unitAtCell(combat, centre, units);
      // Hex battlefield (Frost Ring spell + Adelaide / Glacius): the PC ring,
      // every unit in it hit — no picks (resolveAreaPickDamage).
      const pcArea = hexPcSpellArea(combat, card.id);
      const hitsCentre = pcArea ? pcArea.includeCentre : effect.includeCenter;
      const radius = pcArea?.radius ?? 1;
      if (hitsCentre && centreBody) builder.addPrimary([centreBody.id]);
      const ring = areaAround(combat, centreBody ?? centre, false, radius);
      builder.addCells(ring);
      if (hitsCentre) builder.addCells(areaAround(combat, centreBody ?? centre, true, radius));
      const candidates = units
        .filter(
          (unit) =>
            unit !== centreBody && unitInCells(combat, unit, ring) && cardDamageReaches(state, unit, card)
        )
        .map((unit) => unit.id);
      if (pcArea) {
        builder.addSplash(candidates);
        return;
      }
      if (effect.adjacentPicks <= 0) return;
      // Both routes (PLAY_CARD and the CAST_SPELL resolver) pass the printed minimum.
      const minPicks = effect.minAdjacentPicks;
      const allHit = candidates.length <= (minPicks !== undefined ? Math.max(0, minPicks) : effect.adjacentPicks);
      if (allHit) builder.addSplash(candidates);
      else builder.addPossible(candidates);
      return;
    }

    // Inferno / Meteor Shower (applyInfernoDiceOutcome / resolveMeteorShowerSpell):
    // the chosen space and its neighbouring cells, friend or foe.
    case "INFERNO":
    case "METEOR_SHOWER_SPELL": {
      if (target.type !== "space") return;
      // Hex battlefield: their PC area around the centre body (hex-spell-areas.ts).
      const blast =
        hexPcSpellBlast(combat, card.id, unitAtCell(combat, target.position, units) ?? target.position) ??
        new Set<number>([target.position, ...getOrthogonalNeighbors(target.position)]);
      builder.addCells(blast);
      for (const unit of cardDamageUnitsIn(state, combat, card, blast)) {
        if (unitOccupiesCell(combat, unit, target.position)) builder.addPrimary([unit.id]);
        else builder.addSplash([unit.id]);
      }
      return;
    }

    // Fireball ("select 2 adjacent places"): the target, then an optional pick of
    // one unit beside it that is not immune to the Spell's school.
    case "AREA_DAMAGE_ADJACENT": {
      if (target.type !== "unit") return;
      const primary = combat.units[target.unitId];
      if (!primary) return;
      builder.addPrimary([primary.id]);
      // Hex battlefield: the PC Fireball area — every unit in it is hit, no pick.
      const pcBlast = hexPcSpellBlast(combat, card.id, primary);
      if (pcBlast) {
        builder.addCells(pcBlast);
        builder.addSplash(
          cardDamageUnitsIn(state, combat, card, pcBlast)
            .filter((unit) => unit.id !== primary.id)
            .map((unit) => unit.id)
        );
        return;
      }
      builder.addPossible(
        units
          .filter(
            (unit) =>
              unit.id !== primary.id &&
              unitsAdjacent(combat, unit, primary) &&
              !unitImmuneToSpellSchoolsByEffect(state, unit, card.spellSchools) &&
              (spellAbilitiesSuppressed(state) || !unitImmuneToSpellSchools(unit, card.spellSchools))
          )
          .map((unit) => unit.id)
      );
      return;
    }

    // Chain Lightning: the selected unit, then the units closest to it (the
    // reducer's own reach set — public distances). A power-scaled Spell's bolt
    // count is only known once its Power is paid, so the reach is "possible"
    // unless a fixed-bolt specialty has a bolt for every reachable unit.
    case "CHAIN_LIGHTNING": {
      if (target.type !== "unit") return;
      builder.addPrimary([target.unitId]);
      const primary = combat.units[target.unitId];
      if (primary && isHexPosition(primary.position)) {
        // Hex: the PC hop chain (chain-lightning-hex.ts, the reducer's rule) —
        // units every routing strikes are hit, a tie (the caster's pick) and
        // bolts a lower Power may not have are possible.
        const ladders = effect.damages ? [effect.damages] : Object.values(effect.damagesByPower ?? {});
        const hopCounts = ladders.map((ladder) => ladder.slice(1).filter((value) => value > 0).length);
        const most = Math.max(0, ...hopCounts);
        const least = Math.min(most, ...hopCounts);
        const others = units.filter((unit) => unit.id !== primary.id && isHexPosition(unit.position));
        const { sure, possible } = chainHexHopPreview(combat, primary, others, most);
        builder.addSplash(sure.slice(0, least).map((unit) => unit.id));
        builder.addPossible([...sure.slice(least), ...possible].map((unit) => unit.id));
        return;
      }
      const reachable = chainLightningReachable(state, target.unitId);
      if (effect.damagesByPower || !effect.damages) {
        builder.addPossible(reachable);
        return;
      }
      const bolts = effect.damages.slice(1).filter((value) => value > 0).length;
      if (bolts === 0) return;
      if (reachable.length <= bolts) builder.addSplash(reachable);
      else builder.addPossible(reachable);
      return;
    }

    // Tarnum's Dragons IV: every unit on the target's line (hex: its hex row;
    // 4x5: its column), friend or foe.
    case "DAMAGE_BATTLEFIELD_LINE": {
      if (centre === undefined) return;
      const { row, column } = getBattlefieldCoordinates(centre);
      const line = isHexPosition(centre)
        ? getHexRowPositions(row)
        : getBattlefieldPositions("grid").filter((position) => getBattlefieldCoordinates(position).column === column);
      builder.addCells(line);
      if (target.type === "unit") builder.addPrimary([target.unitId]);
      builder.addSplash(
        units
          .filter((unit) =>
            (isHexPosition(centre)
              ? line.includes(unit.position)
              : getBattlefieldCoordinates(unit.position).column === column) && cardDamageReaches(state, unit, card)
          )
          .map((unit) => unit.id)
      );
      return;
    }

    case "DAMAGE_ALL_ENEMY_UNITS":
      builder.addSplash(enemies.filter((unit) => cardDamageReaches(state, unit, card)).map((unit) => unit.id));
      return;

    case "SLOW_ALL_ENEMIES":
      builder.addSplash(enemies.map((unit) => unit.id));
      return;

    case "DAMAGE_ENEMY_UNITS_BY_GRADE": {
      const grades = new Set(effect.grades);
      builder.addSplash(
        enemies.filter((unit) => grades.has(unit.grade) && cardDamageReaches(state, unit, card)).map((unit) => unit.id)
      );
      return;
    }

    // Death Ripple: enemies up to the grade the paid Power reaches — certain at
    // the caster's standing Power, possible with more Power still to be paid.
    case "DEATH_RIPPLE_SPELL": {
      const standing = standingSpellPower(state, playerId, card);
      for (const unit of enemies) {
        if (!cardDamageReaches(state, unit, card)) continue;
        if (deathRippleReachesUnit(effect, unit, standing)) builder.addSplash([unit.id]);
        else if (deathRippleReachesUnit(effect, unit, Number.POSITIVE_INFINITY)) builder.addPossible([unit.id]);
      }
      return;
    }

    case "DAMAGE_CHOSEN_ENEMIES": {
      const ids = enemies.map((unit) => unit.id);
      if (ids.length <= effect.count) builder.addSplash(ids);
      else builder.addPossible(ids);
      return;
    }

    // Wall tokens (Force Field / Fire Wall / Luna's Fire Wall / Ladybird Wall):
    // on the hex board every hex the wall will cover — the base run the offer
    // checked (wallPlacementCells; an Expert cast may still add a third hex at
    // resolution). The 4×5 grid shows the one space as before.
    case "PLACE_FORCE_FIELD":
    case "PLACE_FIRE_WALL":
    case "PLACE_FIRE_WALL_FIXED":
    case "PLACE_ARTIFACT_WALL": {
      if (target.type !== "space") return;
      const kind = wallKindOfEffectType(effect.type);
      const cells = kind ? wallPlacementCells(combat, kind, target.position) : null;
      builder.addCells(cells ?? [target.position]);
      return;
    }

    default:
      previewPlainTarget(combat, target, builder);
  }
}

/** A single-target action: the unit aimed at, or the chosen space. */
function previewPlainTarget(combat: CombatState, target: TargetRef | undefined, builder: PreviewBuilder): void {
  if (!target) return;
  if (target.type === "unit") {
    if (combat.units[target.unitId]) builder.addPrimary([target.unitId]);
    return;
  }
  if (target.type === "space") {
    builder.addCells([target.position]);
  }
}

/**
 * The units (and cells) `action` would affect, or null when it is not a
 * targeted combat action. Pure: reads `state`, never changes it.
 */
export function previewActionTargets(
  state: GameState,
  action: GameAction,
  cards: CardLibrary = cardLibrary
): ActionTargetPreview | null {
  const combat = state.combat;
  if (!combat) return null;
  const builder = new PreviewBuilder();
  let actingControllerId: PlayerId;

  switch (action.type) {
    case "ATTACK_UNIT":
    case "MOVE_AND_ATTACK_UNIT": {
      const attacker = combat.units[action.attackerId];
      const defender = combat.units[action.defenderId];
      if (!attacker || !defender) return null;
      actingControllerId = attacker.controllerId;
      // Move-and-attack strikes from its destination (same footprint, new head).
      const striker =
        action.type === "MOVE_AND_ATTACK_UNIT" ? { ...attacker, position: action.destination } : attacker;
      // A printed follow-up attack (Death Cloud) never chains follow-ups of its own.
      const followUps = action.type === "MOVE_AND_ATTACK_UNIT" || !action.abilityAttack;
      previewAttack(state, combat, striker, defender, followUps, builder);
      break;
    }
    case "CAST_SPELL":
    case "PLAY_CARD": {
      actingControllerId = action.playerId;
      const card = cards[action.cardId];
      const target = action.target;
      if (!card || !target || target.type === "none") return null;
      const effect =
        action.type === "CAST_SPELL" && card.effect.type !== "CHOOSE_ONE"
          ? card.effect
          : getEffectiveCardEffectForState(state, card, action.optionIndex);
      if (!effect) {
        previewPlainTarget(combat, target, builder);
        break;
      }
      previewCard(state, combat, action.playerId, card, effect, target, action.type === "PLAY_CARD", builder);
      break;
    }
    case "CHOOSE_ABILITY_TARGET": {
      // A Wall/Gate pick (pseudo-id) is not a unit.
      if (parseFortificationTargetId(action.targetUnitId)) return null;
      if (!combat.units[action.targetUnitId]) return null;
      actingControllerId = action.playerId;
      builder.addPrimary([action.targetUnitId]);
      break;
    }
    case "USE_ACTIVE_EFFECT":
    case "USE_UNIT_ABILITY":
      actingControllerId = action.playerId;
      previewPlainTarget(combat, action.target, builder);
      break;
    // Polish Set-Artifact powers aimed at one unit.
    case "USE_ARTIFACT_SET_POWER":
    case "SELECT_ARTIFACT_SET_UNIT":
      if (!action.unitId || !combat.units[action.unitId]) return null;
      actingControllerId = action.playerId;
      builder.addPrimary([action.unitId]);
      break;
    default:
      return null;
  }

  const preview = builder.build(actingControllerId);
  return preview.primaryUnitIds.length === 0 &&
    preview.splashUnitIds.length === 0 &&
    preview.possibleUnitIds.length === 0 &&
    preview.cells.length === 0
    ? null
    : preview;
}
