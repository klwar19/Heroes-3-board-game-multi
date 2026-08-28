import { describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  applyAction,
  chooseComputerAction,
  computerDecisionOwner,
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  observeForComputer,
  type AdventureSetupOptions,
  type CardId,
  type FactionId,
  type GameAction,
  type GameState,
  type PlayerController,
  type PlayerId
} from "@/engine";
import { getMainHero } from "@/engine/adventure";
import { startPlayerCombat } from "@/engine/adventure-reducer";
import { balancedPlayOptionCost } from "@/engine/card-play-cost";
import { balanceCard } from "@/engine/community-balance-cards";

const INFERNO: FactionId = "inferno";
const RIVALS = [
  "fuyuki",
  "azure_breeze",
  "heavenly_demon",
  "hidden_leaf",
  "azur_lane",
  "little_busters",
  "mgq"
] as const satisfies readonly FactionId[];
const RIVAL_FILTER = process.env.INFERNO_BINH_SIM_RIVAL as (typeof RIVALS)[number] | undefined;
const ACTIVE_RIVALS = RIVAL_FILTER && RIVALS.includes(RIVAL_FILTER) ? [RIVAL_FILTER] : RIVALS;
/** 500 total fights per rival by default; lower this only for a local smoke run. */
const RUNS_PER_TOWN = Math.max(1, Math.floor(Number(process.env.INFERNO_BINH_SIM_RUNS_PER_TOWN ?? 500)) || 500);
const COMPUTER: PlayerController = { kind: "computer", difficulty: "standard", policyVersion: 1 };
const NO_ESCAPE = new Set(["QUICK_COMBAT", "RETREAT_COMBAT", "RETREAT_FROM_COMBAT", "SURRENDER_COMBAT", "GIVE_UP_COMBAT"]);
const ATTACKER_BACKLINE = new Set([16, 17, 18, 19]);
const DEFENDER_BACKLINE = new Set([0, 1, 2, 3]);
type MgqSpirit = "sylph" | "gnome" | "undine" | "salamander";
const SPIRITS: readonly MgqSpirit[] = ["sylph", "gnome", "undine", "salamander"];

const SPELLS = [
  "spell.magic_arrow", "spell.bloodlust", "spell.inferno", "spell.lightning_bolt",
  "spell.stone_skin", "spell.cure", "spell.fortune", "spell.sorrow", "spell.slayer"
] as const;
const ABILITIES = [
  "ability.offense", "ability.armorer", "ability.archery", "ability.resistance",
  "ability.sorcery", "ability.luck"
] as const;
const ARTIFACTS = [
  "artifact.centaurs_axe", "artifact.buckler_of_the_gnoll_king",
  "artifact.breastplate_of_petrified_wood", "artifact.ogres_club_of_havoc",
  "artifact.dragon_wing_tabard"
] as const;

type UnitPick = { unitDefId: string; side: "pack" };

function cycle<T>(items: readonly T[], index: number): T {
  return items[((index % items.length) + items.length) % items.length]!;
}

function rotated<T>(items: readonly T[], start: number, count: number): T[] {
  return Array.from({ length: count }, (_, offset) => cycle(items, start + offset));
}

function lineup(factionId: FactionId, sample: number): UnitPick[] {
  const roster = coreFactionDefinitions[factionId].units
    .map((id) => coreUnitDefinitions[id])
    .filter((unit) => Boolean(unit?.pack) && !unit.summonOnly);
  const byTier = (tier: "bronze" | "silver" | "gold") => roster.filter((unit) => unit.tier === tier);
  const bronze = byTier("bronze");
  const silver = byTier("silver");
  const gold = byTier("gold");
  if (factionId !== "mgq") expect(bronze.length, `${factionId} needs a Bronze roster`).toBeGreaterThanOrEqual(3);
  expect(silver.length, `${factionId} needs two Silver units`).toBeGreaterThanOrEqual(2);
  expect(gold.length, `${factionId} needs ${factionId === "mgq" ? 3 : 2} Gold units`).toBeGreaterThanOrEqual(factionId === "mgq" ? 3 : 2);
  const picks = [
    ...(factionId === "mgq" ? [] : [cycle(bronze, sample * 3 + 2)]),
    ...rotated(silver, sample * 5, 2),
    ...rotated(gold, sample * 7, factionId === "mgq" ? 3 : 2)
  ];
  return picks.map((unit) => ({ unitDefId: unit.id, side: "pack" }));
}

function combatCard(cardId: string | undefined): cardId is CardId {
  const card = cardId ? cardLibrary[cardId] : undefined;
  return Boolean(card && card.implementationStatus === "implemented" &&
    (card.phaseLimit?.includes("combat") || card.phaseLimit?.includes("reaction")));
}

/** Six genuinely varied cards: specialty is optional and never crowds out stats/spells/ability/artifact. */
function heroHand(heroDefId: string, sample: number, salt: number): CardId[] {
  const hero = coreHeroDefinitions[heroDefId];
  const stats = Object.entries(hero.startingStats).flatMap(([stat, count]) =>
    Array.from({ length: count }, () => `stat.${stat}` as CardId)
  );
  const specialtyCount = sample % 5 === 0 ? 0 : sample % 5 === 4 ? 2 : 1;
  const specialties = hero.specialtyCardIds
    ? [hero.specialtyCardIds[1], hero.specialtyCardIds[4]].filter(combatCard).slice(0, specialtyCount)
    : [];
  const candidates: CardId[] = [
    cycle(SPELLS, sample * 3 + salt) as CardId,
    cycle(stats, sample + salt),
    (combatCard(hero.startingAbilityCardId) && hero.startingAbilityCardId !== "ability.tactics"
      ? hero.startingAbilityCardId
      : cycle(ABILITIES, sample + salt)) as CardId,
    cycle(ARTIFACTS, sample * 7 + salt) as CardId,
    ...specialties,
    cycle(SPELLS, sample * 5 + salt + 1) as CardId,
    cycle(ABILITIES, sample * 3 + salt + 1) as CardId,
    cycle(ARTIFACTS, sample * 5 + salt + 1) as CardId,
    "spell.magic_arrow"
  ];
  const hand = candidates.filter((cardId, index) => cardLibrary[cardId] && candidates.indexOf(cardId) === index).slice(0, 6);
  const fallback = [...SPELLS, ...ABILITIES, ...ARTIFACTS] as readonly CardId[];
  for (let offset = 0; hand.length < 6; offset += 1) {
    const cardId = cycle(fallback, sample + salt + offset);
    if (cardLibrary[cardId] && !hand.includes(cardId)) hand.push(cardId);
  }
  expect(hand).toHaveLength(6);
  return hand;
}

function setup(seed: string, p1Faction: FactionId, p2Faction: FactionId, sample: number): AdventureSetupOptions {
  const heroFor = (factionId: FactionId, salt: number) => cycle(coreFactionDefinitions[factionId].heroes, sample + salt);
  return {
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
    ruleset: "binh",
    rollFirstPlayer: false,
    anime: {
      ...DEFAULT_ANIME_OPTIONS,
      enabled: true,
      isekaiTowns: true,
      xianxiaTowns: true,
      cultivation: true,
      heroGrades: true,
      equipment: true,
      unitExperience: true
    },
    controllers: { p1: COMPUTER, p2: COMPUTER },
    players: [
      { id: "p1", name: `${p1Faction} AI`, factionId: p1Faction, heroDefId: heroFor(p1Faction, 0) },
      { id: "p2", name: `${p2Faction} AI`, factionId: p2Faction, heroDefId: heroFor(p2Faction, 11) }
    ]
  };
}

function configureSeat(state: GameState, playerId: PlayerId, sample: number, salt: number): void {
  const player = state.players[playerId];
  const hero = getMainHero(state, playerId)!;
  hero.level = 5;
  hero.experience = 0;
  player.army = lineup(player.factionId!, sample).map((pick, index) => ({ id: `${playerId}_sim_${index}`, ...pick }));
  player.hand = heroHand(hero.heroDefId!, sample, salt);
  player.deck = [...SPELLS, ...ABILITIES, ...ARTIFACTS] as CardId[];
  player.discard = [];
  player.canMulligan = false;
  player.needsHandRefresh = false;
  player.resources.gold = 50;
  if (player.factionId === "mgq") player.mgqSpirit = cycle(SPIRITS, sample + salt);
}

function applyOk(state: GameState, action: GameAction, actor: PlayerId): GameState {
  const result = applyAction(state, action, { computerActorPlayerId: actor });
  expect(result.errors, `${result.errors.map((error) => error.message).join("; ")} action=${JSON.stringify(action)}`).toEqual([]);
  return result.state;
}

function assertFormation(state: GameState, seed: string): void {
  const combat = state.combat!;
  const adjacent = (left: number, right: number) => {
    const [leftRow, leftColumn] = [Math.floor(left / 4), left % 4];
    const [rightRow, rightColumn] = [Math.floor(right / 4), right % 4];
    return Math.abs(leftRow - rightRow) + Math.abs(leftColumn - rightColumn) === 1;
  };
  for (const playerId of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (playerId === "neutrals") continue;
    const backline = playerId === combat.attackerPlayerId ? ATTACKER_BACKLINE : DEFENDER_BACKLINE;
    const ranged = Object.values(combat.units).filter((unit) =>
      unit.controllerId === playerId && unit.type === "ranged" && Boolean(unit.armyUnitId) &&
      unit.position >= 0 && unit.damage < unit.maxHealth
    );
    for (const unit of ranged) {
      expect(backline.has(unit.position), `${seed}: ranged ${unit.cardName} exposed at ${unit.position}`).toBe(true);
      const inCorner = unit.position % 4 === 0 || unit.position % 4 === 3;
      const screened = Object.values(combat.units).some((candidate) =>
        candidate.controllerId === playerId && candidate.id !== unit.id && candidate.type !== "ranged" &&
        candidate.position >= 0 && candidate.damage < candidate.maxHealth && adjacent(candidate.position, unit.position)
      );
      expect(inCorner || screened, `${seed}: ranged unit is neither in a corner nor screened by a melee ally`).toBe(true);
    }
  }
}

function runBattle(seed: string, p1Faction: FactionId, p2Faction: FactionId, sample: number) {
  let state = createAdventureGameState(setup(seed, p1Faction, p2Faction, sample));
  configureSeat(state, "p1", sample, 0);
  configureSeat(state, "p2", sample, 11);
  const attacker = getMainHero(state, "p1")!;
  const defender = getMainHero(state, "p2")!;
  startPlayerCombat(state, attacker, defender, defender.spaceId ?? "0,0");
  expect(state.ruleset).toBe("binh");
  state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p1" }, "p1");
  state = applyOk(state, { type: "ACCEPT_COMBAT", playerId: "p2" }, "p2");

  let formationChecked = false;
  let decisions = 0;
  const defendedUnits: string[] = [];
  for (; decisions < 10_000 && !state.combat?.outcome && (state.combat?.round ?? 0) <= 200; decisions += 1) {
    if (!formationChecked && state.phase === "combat" && state.combat?.round === 1) {
      assertFormation(state, seed);
      formationChecked = true;
    }
    const playerId = computerDecisionOwner(state);
    expect(playerId, `${seed}: no decision owner in ${state.phase}`).toBeTruthy();
    const observation = observeForComputer(state, playerId!);
    const legalActions = observation.legalActions.filter((entry) => {
      if (NO_ESCAPE.has(entry.action.type)) return false;
      if (entry.action.type === "PLAY_CARD" || entry.action.type === "PLAY_REACTION") {
        const entryCardId = entry.action.cardId;
        if (entry.action.type === "PLAY_REACTION" && entry.action.asPowerBoost) return false;
        if (entry.action.type === "PLAY_REACTION" && entry.action.cardId === "stat.power") return false;
        const card = balanceCard(state, entry.action.cardId);
        const option = card?.effect.type === "CHOOSE_ONE" && entry.action.optionIndex !== undefined
          ? card.effect.options[entry.action.optionIndex]
          : undefined;
        const powerOnly = option?.trigger?.event === "SPELL_CAST_STARTED" ||
          (option?.effect.type === "ADD_SPELL_POWER");
        if (entry.action.type === "PLAY_REACTION" && (entry.action.cardId === "ability.sorcery" || powerOnly)) return false;
        const cost = balancedPlayOptionCost(state, entry.action as Extract<GameAction, { type: "PLAY_CARD" }>);
        // Power payments need a second interactive card/mode picker. Leave the
        // AI the artifact's ordinary option in this headless benchmark.
        if (cost?.powerCost) return false;
        if ((cost?.discardCards ?? 0) > state.players[playerId!].hand.filter((cardId) => cardId !== entryCardId).length) return false;
      }
      return true;
    });
    expect(legalActions.length, `${seed}: no proper fight action for ${playerId}`).toBeGreaterThan(0);
    const decision = chooseComputerAction({ ...observation, legalActions });
    let action = decision?.action ?? legalActions[0]!.action;
    // PLAY_CARD offers are templates when an option has a discard price. The
    // live UI opens a picker; this headless driver supplies the same payment.
    if ((action.type === "PLAY_CARD" || action.type === "PLAY_REACTION") && !(action.costCardIds?.length)) {
      const cost = balancedPlayOptionCost(state, action as Extract<GameAction, { type: "PLAY_CARD" }>);
      const count = cost?.discardCards ?? 0;
      if (count > 0) {
        const playedCardId = action.cardId;
        action = {
          ...action,
          costCardIds: state.players[playerId!].hand.filter((cardId) => cardId !== playedCardId).slice(0, count)
        };
      }
    }
    if (action.type === "DEFEND_UNIT") {
      expect(state.combat?.units[action.unitId]?.defendedLastActivation, `${seed}: AI tried to defend twice in a row`).not.toBe(true);
      defendedUnits.push(action.unitId);
    }
    state = applyOk(state, action, playerId!);
  }
  expect(decisions, `${seed}: probable policy cycle`).toBeLessThan(10_000);
  expect(formationChecked, `${seed}: combat never reached its settled formation`).toBe(true);
  const mgqId = p1Faction === "mgq" ? "p1" : p2Faction === "mgq" ? "p2" : null;
  const mgqOpponent = mgqId === "p1" ? "p2" : mgqId === "p2" ? "p1" : null;
  if (mgqId && mgqOpponent) {
    expect(state.combat!.mgqSpirits?.[mgqId], `${seed}: level-5 MGQ spirit was not summoned`).toBeTruthy();
  }
  const littleBustersId = p1Faction === "little_busters" ? "p1" : p2Faction === "little_busters" ? "p2" : null;
  if (littleBustersId) {
    expect(Object.values(state.combat!.units).some((unit) => unit.controllerId === littleBustersId && unit.heroUnit), `${seed}: Little Busters hero unit missing`).toBe(true);
  }
  return {
    winnerId: state.combat!.outcome?.winnerPlayerId ?? null,
    rounds: state.combat!.round,
    decisions,
    cardsPlayed: state.eventLog.filter((event) => event.type === "CARD_PLAYED").length,
    spellsCast: state.eventLog.filter((event) => event.type === "SPELL_CAST_RESOLVED").length,
    defends: defendedUnits.length,
    littleBustersCounters: Object.values(state.combat!.littleBustersCountersUsed ?? {}).flat().length
  };
}

describe("Inferno vs anime/wuxia towns — BINH battle simulation", () => {
  it("runs 500 proper, diverse, level-5 battles per town", { timeout: 1_800_000 }, () => {
    const report: Record<string, unknown> = {};
    let totalCards = 0;
    let totalSpells = 0;
    let totalDefends = 0;
    let totalLittleBustersCounters = 0;
    for (const rival of ACTIVE_RIVALS) {
      const results = Array.from({ length: RUNS_PER_TOWN }, (_, sample) => {
        const swapped = sample % 2 === 1;
        return runBattle(
          `inferno-binh-${rival}-${sample}`,
          swapped ? rival : INFERNO,
          swapped ? INFERNO : rival,
          sample
        );
      });
      totalCards += results.reduce((sum, result) => sum + result.cardsPlayed, 0);
      totalSpells += results.reduce((sum, result) => sum + result.spellsCast, 0);
      totalDefends += results.reduce((sum, result) => sum + result.defends, 0);
      totalLittleBustersCounters += results.reduce((sum, result) => sum + result.littleBustersCounters, 0);
      report[rival] = {
        battles: results.length,
        infernoWins: results.filter((result, sample) => result.winnerId === (sample % 2 === 1 ? "p2" : "p1")).length,
        draws: results.filter((result) => result.winnerId === null).length,
        averageRounds: results.reduce((sum, result) => sum + result.rounds, 0) / results.length,
        averageDecisions: results.reduce((sum, result) => sum + result.decisions, 0) / results.length,
        cardsPlayed: results.reduce((sum, result) => sum + result.cardsPlayed, 0),
        spellsCast: results.reduce((sum, result) => sum + result.spellsCast, 0),
        defends: results.reduce((sum, result) => sum + result.defends, 0),
        littleBustersCounters: results.reduce((sum, result) => sum + result.littleBustersCounters, 0)
      };
    }
    expect(totalCards, "diverse hero cards should be played").toBeGreaterThan(0);
    expect(totalSpells, "level-5 heroes should cast spells").toBeGreaterThan(0);
    expect(totalDefends, "AI should defend when tactically appropriate").toBeGreaterThan(0);
    if (ACTIVE_RIVALS.includes("little_busters")) {
      expect(totalLittleBustersCounters, "retired Little Busters paid counters must never be offered").toBe(0);
    }
    console.info("INFERNO_ANIME_WUXIA_BINH_SIMULATION", JSON.stringify({ runsPerTown: RUNS_PER_TOWN, report }, null, 2));
  });
});
