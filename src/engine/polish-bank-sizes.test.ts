import { describe, expect, it } from "vitest";
import {
  buildPolishCreatureBankReward,
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  type CreatureBankId,
} from "@/data/map/creature-banks";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  polishBankMaxSize,
  polishBankRewardScale,
  polishBankSizeForAttackRolls,
  type BankSize,
  type GameAction,
  type GameEvent,
  type GameState,
  type LegalAction,
  type PendingChoice,
  type PlayerVisibleState,
} from "./index";
import { buildCreatureBankCombatUnits } from "./adventure";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { chooseComputerAction } from "./computer/policy";
import { getUnitAbilityDefinitions } from "./unit-abilities";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function placeFarTileAwaitingRotation({
  enabled = true,
  openings = 0,
  pile,
}: {
  enabled?: boolean;
  openings?: number;
  pile?: CreatureBankId[];
} = {}): GameState {
  let state = createAdventureGameState({
    seed: `polish-bank-${enabled}-${openings}-${pile?.length ?? "full"}`,
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: true,
    houseRules: { "polish-bank-sizes": enabled },
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.heroes.hero_p1.spaceId = "h:7:2";
  state.heroes.hero_p1.movementPoints = 3;
  state.adventure!.farTilesOpenedByPlayer = { p1: openings };
  if (pile) {
    state.adventure!.creatureBankTokensFar = [...pile];
  }
  state.adventure!.farTileScriptedDraws = ["F1"];
  state = apply(state, {
    type: "PLACE_TILE",
    playerId: "p1",
    heroId: "hero_p1",
    supplyIndex: 0,
    centerRow: 6,
    centerCol: 4,
  });
  expect(state.adventure!.pendingTileChoice?.tileInstanceId).toBeTruthy();
  return state;
}

function finishRotation(state: GameState): GameState {
  const rotation = getLegalActions(state, "p1").find((legal) => legal.action.type === "SET_TILE_ROTATION");
  expect(rotation, "the revealed Far tile should be waiting for rotation").toBeTruthy();
  return apply(state, rotation!.action);
}

function choosePolishBank(state: GameState, optionIndex: number): GameState {
  const choice = bankChoice(state);
  return apply(state, {
    type: "CHOOSE_OPTION",
    playerId: "p1",
    choiceId: choice.id,
    optionIndex,
  });
}

function bankChoice(state: GameState): Extract<PendingChoice, { type: "OPTION_CHOICE" }> {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-creature-bank") {
    throw new Error("expected the Polish Creature Bank placement choice");
  }
  return choice;
}

describe("Polish bank size roll", () => {
  it("maps every possible one/two-die sum to size I-IV (v1.2 sheet: −2 OR +2 → Ⅳ)", () => {
    // The sheet's gold row reads "−2 or +2": BOTH extreme sums pay the largest
    // bank, so the two-die distribution is Ⅰ 2/9, Ⅱ 3/9, Ⅲ 2/9, Ⅳ 2/9.
    expect(polishBankSizeForAttackRolls([-1, -1])).toBe(4);
    expect(polishBankSizeForAttackRolls([-1, 0])).toBe(1);
    expect(polishBankSizeForAttackRolls([0, 0])).toBe(2);
    expect(polishBankSizeForAttackRolls([0, 1])).toBe(3);
    expect(polishBankSizeForAttackRolls([1, 1])).toBe(4);

    expect(polishBankSizeForAttackRolls([-1])).toBe(1);
    expect(polishBankSizeForAttackRolls([0])).toBe(2);
    expect(polishBankSizeForAttackRolls([1])).toBe(3);
  });

  it("first Far (Ⅱ–Ⅲ) opening rolls ONE Attack die per candidate; later openings roll two", () => {
    const first = placeFarTileAwaitingRotation({ openings: 0 });
    const firstRolls = first.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.results[0]?.startsWith("Bank "),
    );
    expect(firstRolls).toHaveLength(2);
    // One die each — size Ⅳ is unreachable on the first Far bank.
    expect(
      firstRolls.every(
        (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.attackRolls?.length === 1,
      ),
    ).toBe(true);
    const firstTile = first.adventure!.tiles[first.adventure!.pendingTileChoice!.tileInstanceId];
    expect(firstTile.reservedBankOptions).toHaveLength(2);
    expect(
      firstTile.reservedBankOptions?.every((candidate) => candidate.size >= 1 && candidate.size <= 3),
    ).toBe(true);

    const second = placeFarTileAwaitingRotation({ openings: 1 });
    const secondRolls = second.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.results[0]?.startsWith("Bank "),
    );
    expect(secondRolls).toHaveLength(2);
    expect(
      secondRolls.every(
        (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.attackRolls?.length === 2,
      ),
    ).toBe(true);
  });
});

describe("Polish Creature Bank offer", () => {
  it("chooses between two sized candidates before rotation, then consumes only the chosen id", () => {
    let state = placeFarTileAwaitingRotation();
    const pileBefore = [...state.adventure!.creatureBankTokensFar!];
    const choice = bankChoice(state);
    const candidates = choice.creatureBank?.candidates ?? [];
    expect(candidates).toHaveLength(2);
    expect(choice.creatureBank?.preRotation).toBe(true);
    expect(choice.options).toHaveLength(2);
    expect(choice.options[0].label).toMatch(/^A · .+ · size I{1,3}V?$/);
    expect(choice.options[1].label).toMatch(/^B · .+ · size I{1,3}V?$/);

    const selected = candidates[1];
    const unchosen = candidates[0];
    state = choosePolishBank(state, 1);
    expect(state.pendingChoice).toBeNull();
    expect(state.adventure!.creatureBankTokensFar).toEqual(pileBefore);
    const rotatingTile = state.adventure!.tiles[state.adventure!.pendingTileChoice!.tileInstanceId];
    expect(rotatingTile.reservedBankOptions).toEqual([selected]);

    state = finishRotation(state);
    const field = Object.values(state.adventure!.fields).find(
      (candidate) => candidate.tileInstanceId === rotatingTile.id && candidate.location === "creature_bank",
    )!;
    expect(field.bankId).toBe(selected.bankId);
    expect(field.bankSize).toBe(selected.size);
    expect(state.adventure!.creatureBankTokensFar).toHaveLength(pileBefore.length - 1);
    expect(state.adventure!.creatureBankTokensFar).not.toContain(selected.bankId);
    expect(state.adventure!.creatureBankTokensFar).toContain(unchosen.bankId);
  });

  it("has no decline option; a one-token pile reserves that sole bank automatically", () => {
    expect(bankChoice(placeFarTileAwaitingRotation()).options).toHaveLength(2);

    let state = placeFarTileAwaitingRotation({ pile: ["crypt"] });
    expect(state.pendingChoice).toBeNull();
    const tile = state.adventure!.tiles[state.adventure!.pendingTileChoice!.tileInstanceId];
    expect(tile.reservedBankOptions).toEqual([expect.objectContaining({ bankId: "crypt" })]);
    state = finishRotation(state);
    expect(Object.values(state.adventure!.fields).some((field) => field.bankId === "crypt")).toBe(true);
  });

  it("CONTROL: rule off preserves the original single-peek, two-option flow", () => {
    const awaiting = placeFarTileAwaitingRotation({ enabled: false });
    const tile = awaiting.adventure!.tiles[awaiting.adventure!.pendingTileChoice!.tileInstanceId];
    expect(tile.reservedBankId).toBe(awaiting.adventure!.creatureBankTokensFar!.at(-1));
    expect(tile.reservedBankOptions).toBeUndefined();
    expect(
      awaiting.eventLog.some(
        (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.results[0]?.startsWith("Bank "),
      ),
    ).toBe(false);

    const choice = bankChoice(finishRotation(awaiting));
    expect(choice.options).toHaveLength(2);
    expect(choice.creatureBank?.candidates).toBeUndefined();
  });
});

describe("Polish bank size combat and AI", () => {
  it("replaces random Stack Tokens with 0/1/2/3 layers, capped per guard by its unit's tier", () => {
    const state = createAdventureGameState({
      seed: "bank-size-deterministic-layers",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true },
    });

    for (const size of [1, 2, 3, 4] as const) {
      const { units, stackedCount } = buildCreatureBankCombatUnits(state, "crypt", size);
      expect(units).toHaveLength(4);
      // The bank card is rankless in play, but layers follow the Unit Stack
      // coin caps of the unit NAMED on it, punching one above the army caps
      // with an absolute maximum of 3 (bronze 3 / silver 3 / gold+azure 2):
      // the Crypt's bronze Skeletons/Zombies/Wraiths and silver Vampires all
      // carry the full size-Ⅳ 3 layers.
      const expectedLayers = () => Math.min(size - 1, 3);
      expect(units.map((unit) => unit.bankStacks)).toEqual(
        units.map(() => expectedLayers())
      );
      expect(units.every((unit) => unit.stackToken === undefined)).toBe(true);
      expect(units.every((unit) => {
        const base = CREATURE_BANK_UNIT_SIDES[unit.unitDefId!];
        return unit.attack === base.attack + (size > 1 ? 1 : 0);
      })).toBe(true);
      // Combat stackedCount = classic full-stack X for feed (0 at Ⅰ, 4 at Ⅱ+).
      // Size Ⅲ/Ⅳ gold base layers are applied in buildPolishCreatureBankReward.
      expect(stackedCount).toBe(size === 1 ? 0 : 4);
    }
  });

  it("caps gold and azure guards at 2 layers without changing their rankless in-play status", () => {
    const state = createAdventureGameState({
      seed: "bank-size-tier-caps",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true },
    });

    // Dragon Utopia: Black Dragons (gold) + Gold/Faerie/Crystal Dragons
    // (azure — counted as gold for Stacks). Bank guards punch one above the
    // army caps, so its best guard carries 2 layers and the whole BANK tops
    // out at size Ⅲ: a stored size Ⅳ clamps to Ⅲ (2 layers each, reward
    // full-stack X=4). The guards keep the bank card's
    // rankless in-play identity (bankUnit, no stackToken; targeting/tier
    // gates are pinned in creature-bank-combat.test.ts, unchanged by the cap).
    const utopia = buildCreatureBankCombatUnits(state, "dragon_utopia", 4);
    expect(utopia.units.map((unit) => unit.bankStacks)).toEqual([2, 2, 2, 2]);
    expect(utopia.units.every((unit) => unit.bankUnit === true)).toBe(true);
    expect(utopia.units.every((unit) => unit.stackToken === undefined)).toBe(true);
    expect(utopia.stackedCount).toBe(4);

    // The Pyramid's Gold/Diamond Golems are gold-tier: size Ⅲ is its max and
    // pays full-stack X=4 with 2 layers on every card.
    const pyramid = buildCreatureBankCombatUnits(state, "pyramid", 3);
    expect(pyramid.units.map((unit) => unit.bankStacks)).toEqual([2, 2, 2, 2]);
    expect(pyramid.stackedCount).toBe(4);

    // Size Ⅰ still means zero layers everywhere — the cap never ADDS a layer.
    const small = buildCreatureBankCombatUnits(state, "dragon_utopia", 1);
    expect(small.units.every((unit) => unit.bankStacks === 0)).toBe(true);
  });

  it("clamps each bank's possible size to its best guard's bank-layer cap", () => {
    // 1 + max bank-guard layer cap among the four guards (guards punch one
    // above the army caps): all-gold/azure → Ⅲ, any silver or bronze guard →
    // the full Ⅳ.
    expect(polishBankMaxSize("dragon_utopia")).toBe(3);
    expect(polishBankMaxSize("pyramid")).toBe(3);
    expect(polishBankMaxSize("naga_bank")).toBe(3);
    expect(polishBankMaxSize("medusa_stores")).toBe(4);
    expect(polishBankMaxSize("derelict_ship")).toBe(4);
    expect(polishBankMaxSize("crypt")).toBe(4);
    expect(polishBankMaxSize("imp_cache")).toBe(4);
  });

  it("clamps the rolled size at the reveal offer, before the player chooses", () => {
    // Force both candidates to be all-gold/azure banks and scan every stored
    // candidate against its own roll: the stored size must equal
    // min(rolled size, bank max), so a Ⅳ roll on a Dragon Utopia shows Ⅲ.
    const state = placeFarTileAwaitingRotation({
      openings: 0,
      pile: ["dragon_utopia", "pyramid", "naga_bank"],
    });
    const rollEvents = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> =>
        event.type === "ADVENTURE_DICE_ROLLED" && Boolean(event.results[0]?.startsWith("Bank "))
    );
    const tile = Object.values(state.adventure!.tiles).find((candidate) => candidate.reservedBankOptions?.length);
    expect(tile?.reservedBankOptions?.length).toBeGreaterThan(0);
    expect(rollEvents.length).toBe(tile!.reservedBankOptions!.length);
    for (const [index, option] of tile!.reservedBankOptions!.entries()) {
      const rolled = polishBankSizeForAttackRolls(rollEvents[index]!.attackRolls ?? []);
      expect(option.size).toBe(Math.min(rolled, polishBankMaxSize(option.bankId as CreatureBankId)));
      expect(option.size).toBeLessThanOrEqual(3);
    }
  });

  it("peels full bank-card health layers with carryover and keeps the same ability until the last layer", () => {
    const state = createAdventureGameState({
      seed: "bank-size-layer-damage",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true },
    });
    const unit = buildCreatureBankCombatUnits(state, "imp_cache", 4).units[0]!;
    const base = CREATURE_BANK_UNIT_SIDES[unit.unitDefId!];
    expect(unit.bankStacks).toBe(3);
    expect(unit.attack).toBe(base.attack + 1);
    expect(getUnitAbilityDefinitions(unit).map((ability) => ability.id)).toContain("bank-familiar-power-drain");

    unit.damage = unit.maxHealth * 2 + 1;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.bankStacks).toBe(1);
    expect(unit.damage).toBe(1);
    expect(unit.attack).toBe(base.attack + 1);
    expect(getUnitAbilityDefinitions(unit).map((ability) => ability.id)).toContain("bank-familiar-power-drain");

    unit.damage = unit.maxHealth;
    markUnitRemovedIfNeeded(state, unit);
    expect(unit.bankStacks).toBe(0);
    expect(unit.damage).toBe(0);
    expect(unit.attack).toBe(base.attack);
    expect(getUnitAbilityDefinitions(unit).map((ability) => ability.id)).not.toContain("bank-familiar-power-drain");
    expect(state.eventLog.filter((event) => event.type === "BANK_STACK_LOST")).toHaveLength(3);
  });

  it("CONTROL: rule off keeps the original random-stat token system", () => {
    const state = createAdventureGameState({
      seed: "bank-size-standard-control",
      difficulty: "impossible",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": false },
    });
    const { units } = buildCreatureBankCombatUnits(state, "crypt", 4);
    expect(units.every((unit) => unit.bankStacks === undefined)).toBe(true);
  });

  it("AI prefers the larger beatable candidate and the easier one when both are dangerous", () => {
    const decide = (state: GameState, candidates: { bankId: string; size: BankSize }[]) => {
      const choice: Extract<PendingChoice, { type: "OPTION_CHOICE" }> = {
        id: "bank-ai",
        type: "OPTION_CHOICE",
        playerId: "p1",
        prompt: "Choose a bank",
        options: candidates.map((candidate) => ({ label: candidate.bankId })),
        context: "place-creature-bank",
        creatureBank: { fieldId: "tile", tier: "far", candidates, tileInstanceId: "tile", preRotation: true },
        returnPhase: "map",
      };
      state.pendingChoice = choice;
      const legalActions: LegalAction[] = choice.options.map((option, optionIndex) => ({
        label: option.label,
        action: { type: "CHOOSE_OPTION", playerId: "p1", choiceId: choice.id, optionIndex },
      }));
      return chooseComputerAction({
        playerId: "p1",
        state: state as unknown as PlayerVisibleState,
        legalActions,
      });
    };

    const strong = createAdventureGameState({ seed: "bank-ai-strong", rollFirstPlayer: false });
    const baseArmy = [...strong.players.p1.army];
    strong.players.p1.army = Array.from({ length: 5 }, (_, copy) =>
      baseArmy.map((unit, index) => ({ ...unit, id: `${unit.id}_${copy}_${index}` })),
    ).flat();
    const larger = decide(strong, [
      { bankId: "imp_cache", size: 2 },
      { bankId: "imp_cache", size: 4 },
    ]);
    expect((larger?.action as Extract<GameAction, { type: "CHOOSE_OPTION" }>).optionIndex).toBe(1);

    const weak = createAdventureGameState({ seed: "bank-ai-weak", rollFirstPlayer: false });
    weak.players.p1.army = [];
    const easier = decide(weak, [
      { bankId: "dragon_utopia", size: 1 },
      { bankId: "dragon_utopia", size: 2 },
    ]);
    expect((easier?.action as Extract<GameAction, { type: "CHOOSE_OPTION" }>).optionIndex).toBe(0);
    expect(CREATURE_BANKS.dragon_utopia).toBeTruthy();
  });
});

describe("Polish bank size rewards (all banks × all sizes)", () => {
  /**
   * Size Ⅰ = base only (stackedX 0). Size Ⅱ = full 4-stack extras.
   * Size Ⅲ/Ⅳ = size Ⅱ + 1/2 base GOLD layers (never valuables).
   * Unit banks: Few / Pack+1/2/3 stacks; empower only from size Ⅱ.
   */
  it("maps size → scale and pays every bank correctly at every legal size", () => {
    expect(polishBankRewardScale(1)).toEqual({
      stackedX: 0,
      extraBaseGoldLayers: 0,
      unitStacks: 0,
      empower: false,
    });
    expect(polishBankRewardScale(2)).toEqual({
      stackedX: 4,
      extraBaseGoldLayers: 0,
      unitStacks: 1,
      empower: true,
    });
    expect(polishBankRewardScale(3)).toEqual({
      stackedX: 4,
      extraBaseGoldLayers: 1,
      unitStacks: 2,
      empower: true,
    });
    expect(polishBankRewardScale(4)).toEqual({
      stackedX: 4,
      extraBaseGoldLayers: 2,
      unitStacks: 3,
      empower: true,
    });

    const bankIds = Object.keys(CREATURE_BANKS) as CreatureBankId[];
    expect(bankIds).toHaveLength(12);

    for (const bankId of bankIds) {
      const maxSize = polishBankMaxSize(bankId);
      for (const size of [1, 2, 3, 4] as const) {
        const effective = Math.min(size, maxSize) as BankSize;
        const scale = polishBankRewardScale(effective);
        const reward = buildPolishCreatureBankReward(bankId, effective);
        const { stackedX: x, extraBaseGoldLayers: layers } = scale;

        switch (bankId) {
          case "imp_cache":
            expect(reward).toEqual({ type: "GAIN_RESOURCES", gold: 3 * (1 + layers) + x });
            break;
          case "crypt":
            expect(reward).toEqual({ type: "GAIN_RESOURCES", gold: 6 * (1 + layers) + 2 * x });
            break;
          case "dwarven_treasury":
            expect(reward).toEqual({ type: "GAIN_RESOURCES", gold: 7 * (1 + layers) + 3 * x });
            break;
          case "naga_bank":
            // Extra base layers add gold only — valuables stay at base + X.
            expect(reward).toEqual({
              type: "GAIN_RESOURCES",
              gold: 6 * (1 + layers) + 6 * x,
              valuables: 2 + x,
            });
            break;
          case "cyclops_stockpile":
            // No gold in base → size Ⅲ/Ⅳ match size Ⅱ.
            expect(reward).toEqual({
              type: "GAIN_RESOURCES",
              buildingMaterials: 8 + 2 * x,
              valuables: 2 + x,
            });
            break;
          case "medusa_stores": {
            // Size Ⅰ collapses to a lone GAIN_RESOURCES (no stack choices).
            if (x === 0) {
              expect(reward).toEqual({
                type: "GAIN_RESOURCES",
                gold: 6 * (1 + layers),
                valuables: 1,
              });
            } else {
              expect(reward.type).toBe("SEQUENCE");
              if (reward.type !== "SEQUENCE") break;
              expect(reward.interactions[0]).toEqual({
                type: "GAIN_RESOURCES",
                gold: 6 * (1 + layers),
                valuables: 1,
              });
              expect(reward.interactions.slice(1)).toHaveLength(x);
            }
            break;
          }
          case "shipwreck":
            expect(reward).toEqual(
              x > 0
                ? {
                    type: "SEQUENCE",
                    interactions: [
                      { type: "GAIN_MORALE", amount: 1 },
                      { type: "GAIN_RESOURCES", gold: 5 * (1 + layers) + 2 * x },
                      { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: x },
                    ],
                  }
                : {
                    type: "SEQUENCE",
                    interactions: [
                      { type: "GAIN_MORALE", amount: 1 },
                      { type: "GAIN_RESOURCES", gold: 5 },
                    ],
                  },
            );
            break;
          case "derelict_ship":
            expect(reward).toEqual(
              x > 0
                ? {
                    type: "SEQUENCE",
                    interactions: [
                      { type: "GAIN_MORALE", amount: 1 },
                      { type: "GAIN_RESOURCES", gold: 7 * (1 + layers) + 2 * x },
                      { type: "SEARCH_SHARED_DECK", deckId: "spells", count: x },
                    ],
                  }
                : {
                    type: "SEQUENCE",
                    interactions: [
                      { type: "GAIN_MORALE", amount: 1 },
                      { type: "GAIN_RESOURCES", gold: 7 },
                    ],
                  },
            );
            break;
          case "pyramid":
            // No gold base — size Ⅲ/Ⅳ match size Ⅱ.
            expect(reward).toEqual(
              x > 0
                ? {
                    type: "SEQUENCE",
                    interactions: [
                      { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 },
                      { type: "REMOVE_THEN_SEARCH_REPEAT", times: x, searchCount: 5 },
                    ],
                  }
                : { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 },
            );
            break;
          case "dragon_utopia": {
            expect(reward.type).toBe("SEQUENCE");
            if (reward.type !== "SEQUENCE") break;
            expect(reward.interactions[0]).toEqual({
              type: "GAIN_RESOURCES",
              gold: 40 * (1 + layers),
            });
            expect(reward.interactions[1]).toEqual({
              type: "SEARCH_SHARED_DECK",
              deckId: "artifacts",
              count: 3,
            });
            expect(reward.interactions.slice(2)).toHaveLength(x);
            break;
          }
          case "dragon_fly_hive":
          case "griffin_conservatory": {
            const unitDefId =
              bankId === "dragon_fly_hive" ? "fortress.dragon_flies" : "castle.griffins";
            if (size === 1 || effective === 1) {
              expect(reward).toEqual({ type: "GAIN_UNIT", unitDefId, side: "few" });
            } else {
              expect(reward.type).toBe("SEQUENCE");
              if (reward.type !== "SEQUENCE") break;
              expect(reward.interactions[0]).toEqual({
                type: "GAIN_UNIT",
                unitDefId,
                side: "pack",
                stacks: scale.unitStacks,
              });
              expect(reward.interactions[1]).toEqual({ type: "EMPOWER_ABILITY" });
            }
            break;
          }
          default: {
            const _exhaustive: never = bankId;
            throw new Error(`unhandled bank ${_exhaustive}`);
          }
        }
      }
    }
  });

  it("pins the explicit gold/materials ladder for sizes Ⅰ–Ⅳ", () => {
    // size Ⅱ = full 4-stack; Ⅲ/Ⅳ add base gold only (not valuables).
    const rows: Array<{
      bankId: CreatureBankId;
      size: BankSize;
      gold?: number;
      valuables?: number;
      buildingMaterials?: number;
    }> = [
      // Imp Cache: 3*(1+L) + X
      { bankId: "imp_cache", size: 1, gold: 3 },
      { bankId: "imp_cache", size: 2, gold: 7 },
      { bankId: "imp_cache", size: 3, gold: 10 },
      { bankId: "imp_cache", size: 4, gold: 13 },
      // Crypt: 6*(1+L) + 2X
      { bankId: "crypt", size: 1, gold: 6 },
      { bankId: "crypt", size: 2, gold: 14 },
      { bankId: "crypt", size: 3, gold: 20 },
      { bankId: "crypt", size: 4, gold: 26 },
      // Dwarven Treasury: 7*(1+L) + 3X
      { bankId: "dwarven_treasury", size: 1, gold: 7 },
      { bankId: "dwarven_treasury", size: 2, gold: 19 },
      { bankId: "dwarven_treasury", size: 3, gold: 26 },
      { bankId: "dwarven_treasury", size: 4, gold: 33 },
      // Naga: gold 6*(1+L)+6X; valuables 2+X only (no size Ⅲ/Ⅳ valuables bump)
      { bankId: "naga_bank", size: 1, gold: 6, valuables: 2 },
      { bankId: "naga_bank", size: 2, gold: 30, valuables: 6 },
      { bankId: "naga_bank", size: 3, gold: 36, valuables: 6 },
      // Cyclops: no gold base → Ⅲ = Ⅱ
      { bankId: "cyclops_stockpile", size: 1, buildingMaterials: 8, valuables: 2 },
      { bankId: "cyclops_stockpile", size: 2, buildingMaterials: 16, valuables: 6 },
      { bankId: "cyclops_stockpile", size: 3, buildingMaterials: 16, valuables: 6 },
      { bankId: "cyclops_stockpile", size: 4, buildingMaterials: 16, valuables: 6 },
      // Shipwreck gold: 5*(1+L) + 2X
      { bankId: "shipwreck", size: 1, gold: 5 },
      { bankId: "shipwreck", size: 2, gold: 13 },
      { bankId: "shipwreck", size: 3, gold: 18 },
      { bankId: "shipwreck", size: 4, gold: 23 },
      // Derelict Ship gold: 7*(1+L) + 2X
      { bankId: "derelict_ship", size: 1, gold: 7 },
      { bankId: "derelict_ship", size: 2, gold: 15 },
      { bankId: "derelict_ship", size: 3, gold: 22 },
      { bankId: "derelict_ship", size: 4, gold: 29 },
    ];

    for (const row of rows) {
      const reward = buildPolishCreatureBankReward(row.bankId, row.size);
      if (reward.type === "GAIN_RESOURCES") {
        expect(reward.gold ?? 0, `${row.bankId} size ${row.size} gold`).toBe(row.gold ?? 0);
        expect(reward.valuables ?? 0, `${row.bankId} size ${row.size} valuables`).toBe(row.valuables ?? 0);
        expect(reward.buildingMaterials ?? 0, `${row.bankId} size ${row.size} materials`).toBe(
          row.buildingMaterials ?? 0,
        );
      } else if (reward.type === "SEQUENCE") {
        const res = reward.interactions.find((step) => step.type === "GAIN_RESOURCES");
        expect(res?.type).toBe("GAIN_RESOURCES");
        if (res?.type !== "GAIN_RESOURCES") continue;
        expect(res.gold ?? 0, `${row.bankId} size ${row.size} gold`).toBe(row.gold ?? 0);
      } else {
        throw new Error(`unexpected reward shape for ${row.bankId}`);
      }
    }
  });

  it("CONTROL: size Ⅲ/Ⅳ never add valuables beyond the size Ⅱ full-stack package", () => {
    // Naga / Medusa / Cyclops: valuables (or choice count) stay flat from Ⅱ→Ⅳ.
    expect(buildPolishCreatureBankReward("naga_bank", 2)).toMatchObject({ valuables: 6 });
    expect(buildPolishCreatureBankReward("naga_bank", 3)).toMatchObject({ valuables: 6 });
    expect(buildPolishCreatureBankReward("naga_bank", 2)).toMatchObject({ gold: 30 });
    expect(buildPolishCreatureBankReward("naga_bank", 3)).toMatchObject({ gold: 36 });

    const medusa2 = buildPolishCreatureBankReward("medusa_stores", 2);
    const medusa3 = buildPolishCreatureBankReward("medusa_stores", 3);
    expect(medusa2.type).toBe("SEQUENCE");
    expect(medusa3.type).toBe("SEQUENCE");
    if (medusa2.type === "SEQUENCE" && medusa3.type === "SEQUENCE") {
      expect(medusa2.interactions.slice(1)).toHaveLength(4);
      expect(medusa3.interactions.slice(1)).toHaveLength(4);
      expect(medusa2.interactions[0]).toEqual({ type: "GAIN_RESOURCES", gold: 6, valuables: 1 });
      expect(medusa3.interactions[0]).toEqual({ type: "GAIN_RESOURCES", gold: 12, valuables: 1 });
    }
  });
});
