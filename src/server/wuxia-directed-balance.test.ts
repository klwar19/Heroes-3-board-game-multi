import { describe, expect, it } from "vitest";

import {
  applyAction,
  chooseComputerAction,
  computerDecisionOwner,
  createAdventureGameState,
  DEFAULT_ANIME_OPTIONS,
  observeForComputer,
  type AdventureSetupOptions,
  type BankSize,
  type GameState,
  type FactionId,
  type PlayerController,
  type PlayerId
} from "@/engine";
import { getMainHero, placeCreatureBank } from "@/engine/adventure";
import { startNeutralEncounter, startPlayerCombat } from "@/engine/adventure-reducer";
import type { CreatureBankId } from "@/data/map/creature-banks";
import { invariantViolations } from "./single-player-soak-helpers";

type Side = "few" | "pack";
type Card = { unitDefId: string; side: Side };
type Seat = { factionId: FactionId; heroDefId: string; force: Card[] };

const COMPUTER: PlayerController = { kind: "computer", difficulty: "standard", policyVersion: 1 };
const HUMAN: PlayerController = { kind: "human" };
const SEEDS = ["a", "b", "c", "d", "e", "f"];
const BANK_SEEDS = ["a", "b", "c", "d"];

const AZURE: Seat = {
  factionId: "azure_breeze",
  heroDefId: "jianxu",
  force: [
    { unitDefId: "azure_breeze.outer_disciples", side: "pack" },
    { unitDefId: "azure_breeze.spirit_crane", side: "pack" },
    { unitDefId: "azure_breeze.sect_protectors", side: "pack" },
    { unitDefId: "azure_breeze.true_inheritors", side: "few" },
    { unitDefId: "azure_breeze.core_master", side: "few" }
  ]
};
const DEMON: Seat = {
  factionId: "heavenly_demon",
  heroDefId: "shiyan",
  force: [
    { unitDefId: "heavenly_demon.blood_disciples", side: "pack" },
    { unitDefId: "heavenly_demon.shadow_wraiths", side: "pack" },
    { unitDefId: "heavenly_demon.corpse_puppets", side: "pack" },
    { unitDefId: "heavenly_demon.bone_reavers", side: "few" },
    { unitDefId: "heavenly_demon.ghost_king", side: "few" }
  ]
};
const AZURE_YULIAN: Seat = { ...AZURE, heroDefId: "yulian" };
const AZURE_QINGYUN: Seat = { ...AZURE, heroDefId: "qingyun" };
const DEMON_LUOHUN: Seat = { ...DEMON, heroDefId: "luohun" };
const DEMON_XUEDAO: Seat = { ...DEMON, heroDefId: "xuedao" };

const CASTLE: Seat = {
  factionId: "castle", heroDefId: "catherine", force: [
    { unitDefId: "castle.halberdiers", side: "pack" }, { unitDefId: "castle.griffins", side: "pack" },
    { unitDefId: "castle.crusaders", side: "pack" }, { unitDefId: "castle.zealots", side: "few" },
    { unitDefId: "castle.champions", side: "few" }
  ]
};
const NECROPOLIS: Seat = {
  factionId: "necropolis", heroDefId: "sandro", force: [
    { unitDefId: "necropolis.skeletons", side: "pack" }, { unitDefId: "necropolis.wraiths", side: "pack" },
    { unitDefId: "necropolis.vampires", side: "pack" }, { unitDefId: "necropolis.liches", side: "few" },
    { unitDefId: "necropolis.dread_knights", side: "few" }
  ]
};
const RAMPART: Seat = {
  factionId: "rampart", heroDefId: "mephala", force: [
    { unitDefId: "rampart.centaurs", side: "pack" }, { unitDefId: "rampart.elves", side: "pack" },
    { unitDefId: "rampart.pegasi", side: "pack" }, { unitDefId: "rampart.dendroids", side: "few" },
    { unitDefId: "rampart.unicorns", side: "few" }
  ]
};
const HIDDEN_LEAF: Seat = {
  factionId: "hidden_leaf", heroDefId: "naruto", force: [
    { unitDefId: "hidden_leaf.genin_squad", side: "pack" }, { unitDefId: "hidden_leaf.anbu", side: "pack" },
    { unitDefId: "hidden_leaf.jonin", side: "pack" }, { unitDefId: "hidden_leaf.giant_toad", side: "few" },
    { unitDefId: "hidden_leaf.jinchuriki", side: "few" }
  ]
};
const FUYUKI: Seat = {
  factionId: "fuyuki", heroDefId: "shirou_emiya", force: [
    { unitDefId: "fuyuki.assassins", side: "pack" }, { unitDefId: "fuyuki.lancers", side: "pack" },
    { unitDefId: "fuyuki.archers", side: "pack" }, { unitDefId: "fuyuki.casters", side: "few" },
    { unitDefId: "fuyuki.sabers", side: "few" }
  ]
};
const LITTLE_BUSTERS: Seat = {
  factionId: "little_busters", heroDefId: "riki_naoe", force: [
    { unitDefId: "little_busters.haruka", side: "pack" }, { unitDefId: "little_busters.disciplinary_committee", side: "pack" },
    { unitDefId: "little_busters.masato", side: "pack" }, { unitDefId: "little_busters.softball_club", side: "few" },
    { unitDefId: "little_busters.saya", side: "few" }
  ]
};

function setup(seed: string, p1: Seat, p2: Seat, p2Computer = true): AdventureSetupOptions {
  return {
    seed,
    scenarioId: "skirmish",
    playerCount: 2,
    sessionMode: "single-player",
    ruleset: "binh",
    rollFirstPlayer: false,
    anime: { ...DEFAULT_ANIME_OPTIONS, enabled: true, xianxiaTowns: true, cultivation: true, equipment: true },
    controllers: { p1: COMPUTER, p2: p2Computer ? COMPUTER : HUMAN },
    players: [
      { id: "p1", name: p1.heroDefId, factionId: p1.factionId, heroDefId: p1.heroDefId },
      { id: "p2", name: p2.heroDefId, factionId: p2.factionId, heroDefId: p2.heroDefId }
    ]
  };
}

function setForce(state: GameState, playerId: PlayerId, force: Card[]): void {
  const player = state.players[playerId];
  player.army = force.map((card, index) => ({ id: `${playerId}_balance_${index}`, ...card }));
  player.hand = [];
  player.deck = [];
  player.discard = [];
  player.canMulligan = false;
  player.needsHandRefresh = false;
  player.townTokens = { build: false, population: false, spellBook: false };
}

const NO_ESCAPE = new Set<string>([
  "QUICK_COMBAT", "RETREAT_COMBAT", "RETREAT_FROM_COMBAT", "SURRENDER_COMBAT", "GIVE_UP_COMBAT"
]);

type FightResult = { winnerId: PlayerId; rounds: number; events: GameState["eventLog"]; steps: number };

/** Standard policy on the real reducer, with only non-battle exits removed. */
function fightToOutcome(initial: GameState): FightResult {
  let state = initial;
  const violations: string[] = [];
  for (let steps = 0; steps < 1200; steps += 1) {
    const outcome = state.combat?.outcome;
    if (outcome) {
      expect(violations).toEqual([]);
      return { winnerId: outcome.winnerPlayerId, rounds: state.combat!.round, events: state.eventLog, steps };
    }
    const playerId = computerDecisionOwner(state);
    expect(playerId, `no decision owner at phase=${state.phase} round=${state.combat?.round}`).toBeTruthy();
    const observation = observeForComputer(state, playerId!);
    const legalActions = observation.legalActions.filter((entry) => !NO_ESCAPE.has(entry.action.type));
    if (
      legalActions.length === 0 &&
      state.combat?.context.kind === "neutral" &&
      observation.legalActions.every((entry) => entry.action.type === "RETREAT_FROM_COMBAT")
    ) {
      // The bank survived the neutral-combat round limit and the hero has no
      // movement left to extend it. Count that forced withdrawal as a bank win;
      // taking the escape action would erase the combat before its balance
      // outcome can be recorded.
      expect(violations).toEqual([]);
      return { winnerId: state.combat.defenderPlayerId, rounds: state.combat.round, events: state.eventLog, steps };
    }
    expect(
      legalActions.length,
      `no battlefield action for ${playerId}; offered=${observation.legalActions.map((entry) => entry.action.type).join(",")}`
    ).toBeGreaterThan(0);
    const decision = chooseComputerAction({ ...observation, legalActions });
    const action = decision?.action ?? legalActions[0]!.action;
    const result = applyAction(state, action, { computerActorPlayerId: playerId! });
    expect(result.errors, `${action.type}: ${result.errors.map((error) => error.message).join("; ")}`).toEqual([]);
    state = result.state;
    violations.push(...invariantViolations(state, `directed fight step ${steps}`).filter((problem) => !problem.includes(" gold=")));
  }
  throw new Error("Directed fight reached the 1200-action safety limit.");
}

function pvp(seed: string, attacker: Seat, defender: Seat): FightResult {
  let state = createAdventureGameState(setup(seed, attacker, defender));
  setForce(state, "p1", attacker.force);
  setForce(state, "p2", defender.force);
  const attackingHero = getMainHero(state, "p1")!;
  const defendingHero = getMainHero(state, "p2")!;
  startPlayerCombat(state, attackingHero, defendingHero, defendingHero.spaceId ?? "0,0");
  // Both preparation windows are real, but there is deliberately nothing to
  // buy in this controlled-force benchmark.
  for (const playerId of ["p1", "p2"] as const) {
    const result = applyAction(state, { type: "ACCEPT_COMBAT", playerId }, { computerActorPlayerId: playerId });
    expect(result.errors).toEqual([]);
    state = result.state;
  }
  return fightToOutcome(state);
}

function bank(seed: string, seat: Seat, bankId: CreatureBankId, size: BankSize): FightResult {
  const state = createAdventureGameState({
    ...setup(seed, seat, CASTLE, false),
    houseRules: { "polish-bank-sizes": true }
  });
  setForce(state, "p1", seat.force);
  const hero = getMainHero(state, "p1")!;
  // Keep the full controlled army but use a low-level hero so the engine cannot
  // replace the requested tactical sample with guaranteed Quick Combat.
  hero.level = 1;
  hero.spaceId = "directed-bank";
  state.adventure!.fields["directed-bank"] = {
    spaceId: "directed-bank", tileInstanceId: "directed", slot: 0, location: "blocked_field",
    blackCube: false, flagOwnerId: null, everFlagged: false, settlementResource: null
  };
  const field = placeCreatureBank(state, "directed-bank", bankId)!;
  field.bankSize = size;
  startNeutralEncounter(state, hero, field);
  return fightToOutcome(state);
}

describe("cultivation towns — directed PvP balance", () => {
  it("resolves matched real-card battles against cultivation, classic, and anime towns", { timeout: 300_000 }, () => {
    const azureHeroes = [AZURE, AZURE_YULIAN, AZURE_QINGYUN];
    const demonHeroes = [DEMON, DEMON_LUOHUN, DEMON_XUEDAO];
    const internal: Array<[string, Seat, Seat]> = azureHeroes.flatMap((azure) =>
      demonHeroes.flatMap((demon): Array<[string, Seat, Seat]> => [
        [`${azure.heroDefId}-${demon.heroDefId}`, azure, demon],
        [`${demon.heroDefId}-${azure.heroDefId}`, demon, azure]
      ])
    );
    const externalOneWay: Array<[string, Seat, Seat]> = [
      ["azure-castle", AZURE, CASTLE], ["azure-necropolis", AZURE, NECROPOLIS],
      ["azure-hidden-leaf", AZURE, HIDDEN_LEAF], ["demon-rampart", DEMON, RAMPART],
      ["demon-fuyuki", DEMON, FUYUKI], ["demon-little-busters", DEMON, LITTLE_BUSTERS]
    ];
    const external: Array<[string, Seat, Seat]> = externalOneWay.flatMap(([name, cultivation, opponent]) => [
      [name, cultivation, opponent],
      [`${name}-reverse`, opponent, cultivation]
    ] as Array<[string, Seat, Seat]>);
    const matchups = [...internal, ...external];
    const report = matchups.map(([name, attacker, defender]) => {
      const results = SEEDS.map((seed) => pvp(`directed-${name}-${seed}`, attacker, defender));
      return {
        name,
        attackerFaction: attacker.factionId,
        attackerHero: attacker.heroDefId,
        defenderFaction: defender.factionId,
        defenderHero: defender.heroDefId,
        attackerWins: results.filter((result) => result.winnerId === "p1").length,
        fights: results.length,
        averageRounds: results.reduce((sum, result) => sum + result.rounds, 0) / results.length,
        mechanicEvents: results.reduce((sum, result) => sum + result.events.filter((event) => event.type === "HERO_SKILL_USED").length, 0)
      };
    });
    console.info("WUXIA_DIRECTED_PVP", JSON.stringify(report, null, 2));
    expect(report.every((entry) => entry.fights === SEEDS.length)).toBe(true);
    expect(report.reduce((sum, entry) => sum + entry.mechanicEvents, 0)).toBeGreaterThan(0);
    expect(report.every((entry) => entry.averageRounds >= 1 && entry.averageRounds < 20)).toBe(true);
    const externalResults = report.slice(internal.length);
    const cultivationExternalWins = externalResults.reduce((sum, entry) => {
      const cultivationAttacks = entry.attackerFaction === "azure_breeze" || entry.attackerFaction === "heavenly_demon";
      return sum + (cultivationAttacks ? entry.attackerWins : entry.fights - entry.attackerWins);
    }, 0);
    const externalFights = externalResults.reduce((sum, entry) => sum + entry.fights, 0);
    expect(cultivationExternalWins, "cultivation towns should neither collapse nor sweep the diverse reference field").toBeGreaterThanOrEqual(Math.floor(externalFights * 0.3));
    expect(cultivationExternalWins, "cultivation towns should neither collapse nor sweep the diverse reference field").toBeLessThanOrEqual(Math.ceil(externalFights * 0.7));
  });
});

describe("cultivation towns — Creature Bank balance", () => {
  it("fights escalating Crypt, Naga Bank, and Dragon Utopia guards", { timeout: 300_000 }, () => {
    const cases: Array<[CreatureBankId, BankSize]> = [["crypt", 1], ["naga_bank", 2], ["dragon_utopia", 3]];
    const cultivationHeroes = [AZURE, AZURE_YULIAN, AZURE_QINGYUN, DEMON, DEMON_LUOHUN, DEMON_XUEDAO];
    const report = cultivationHeroes.flatMap((seat) => cases.map(([bankId, size]) => {
      const results = BANK_SEEDS.map((seed) => bank(`directed-${seat.factionId}-${bankId}-${seed}`, seat, bankId, size));
      return {
        factionId: seat.factionId,
        heroDefId: seat.heroDefId,
        bankId,
        size,
        wins: results.filter((result) => result.winnerId === "p1").length,
        fights: results.length,
        averageRounds: results.reduce((sum, result) => sum + result.rounds, 0) / results.length,
        mechanicEvents: results.reduce((sum, result) => sum + result.events.filter((event) => event.type === "HERO_SKILL_USED").length, 0)
      };
    }));
    console.info("WUXIA_DIRECTED_BANKS", JSON.stringify(report, null, 2));
    expect(report).toHaveLength(cultivationHeroes.length * cases.length);
    expect(report.every((entry) => entry.fights === BANK_SEEDS.length)).toBe(true);
    expect(report.reduce((sum, entry) => sum + entry.mechanicEvents, 0)).toBeGreaterThan(0);
    expect(report.every((entry) => entry.averageRounds >= 1 && entry.averageRounds < 30)).toBe(true);
    const easy = report.filter((entry) => entry.bankId === "crypt");
    const middle = report.filter((entry) => entry.bankId === "naga_bank");
    const apex = report.filter((entry) => entry.bankId === "dragon_utopia");
    expect(easy.every((entry) => entry.wins === entry.fights), "the reference army should reliably clear an easy bank").toBe(true);
    expect(middle.reduce((sum, entry) => sum + entry.wins, 0), "the middle bank should produce both wins and losses").toBeGreaterThan(0);
    expect(middle.reduce((sum, entry) => sum + entry.wins, 0), "the middle bank should produce both wins and losses").toBeLessThan(middle.reduce((sum, entry) => sum + entry.fights, 0));
    expect(apex.every((entry) => entry.wins === 0), "a mixed reference army should not trivialize the apex bank").toBe(true);
  });
});
