import { describe, expect, it } from "vitest";
import {
  CREATURE_BANKS,
  CREATURE_BANK_UNIT_SIDES,
  type CreatureBankId,
} from "@/data/map/creature-banks";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  polishBankSizeForAttackRolls,
  type BankSize,
  type CombatUnitState,
  type GameAction,
  type GameEvent,
  type GameState,
  type LegalAction,
  type PendingChoice,
  type PlayerVisibleState,
} from "./index";
import { buildCreatureBankCombatUnits, grantCreatureBankReward, placeCreatureBank } from "./adventure";
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

function stackTokenDelta(stat: NonNullable<CombatUnitState["stackToken"]>): number {
  return stat === "initiative" ? 2 : 1;
}

/** A Stacked bank defender's fighting stats include its token's stat bonus. */
function expectStackTokenBaked(unit: CombatUnitState): void {
  const base = CREATURE_BANK_UNIT_SIDES[unit.unitDefId!]!;
  const token = unit.stackToken;
  if (!token) {
    throw new Error("expected a Stacked bank defender (a stackToken)");
  }
  expect(unit.attack).toBe(base.attack + (token === "attack" ? stackTokenDelta("attack") : 0));
  expect(unit.defense).toBe(base.defense + (token === "defense" ? stackTokenDelta("defense") : 0));
  expect(unit.maxHealth).toBe(base.health + (token === "health" ? stackTokenDelta("health") : 0));
  expect(unit.initiative).toBe(
    base.initiative + (token === "initiative" ? stackTokenDelta("initiative") : 0),
  );
}

describe("Polish bank size combat and AI", () => {
  it("makes size N the GUARANTEED number of Stacked defenders (standard random-stat tokens)", () => {
    const state = createAdventureGameState({
      seed: "bank-size-guaranteed-tokens",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true },
    });

    // Every (bank, size) pair: EXACTLY `size` of the defenders carry a standard
    // Stack Token, guaranteed — no ~77% roll, no bespoke coin layer. Across all
    // 12 banks × 4 sizes that is ~120 placements; if the guarantee were reverted
    // to the difficulty 77% roll at least one would drop and the exact-count
    // assertion would fail (mutation control for the guaranteed placement).
    for (const bankId of Object.keys(CREATURE_BANKS) as CreatureBankId[]) {
      for (const size of [1, 2, 3, 4] as const) {
        const { units, stackedCount } = buildCreatureBankCombatUnits(state, bankId, size);
        const expected = Math.min(size, units.length);
        const stacked = units.filter((unit) => Boolean(unit.stackToken));
        expect(stacked, `${bankId} size ${size}`).toHaveLength(expected);
        expect(stackedCount, `${bankId} size ${size} X`).toBe(expected);
        // Bank cards stay rankless bankUnits; the army-stack layer field is never set.
        expect(units.every((unit) => unit.bankUnit === true)).toBe(true);
        expect(units.every((unit) => (unit.armyStacks ?? 0) === 0)).toBe(true);
        // Each Stacked defender's stat line actually includes its token bonus.
        for (const unit of stacked) {
          expectStackTokenBaked(unit);
        }
      }
    }
  });

  it("lets every bank reach size Ⅳ = all four defenders Stacked (no gold/azure clamp)", () => {
    const state = createAdventureGameState({
      seed: "bank-size-no-clamp",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true },
    });
    // The all-gold/azure Dragon Utopia and Pyramid used to CLAMP at Ⅲ. Now the
    // size is simply how many guards are Stacked, so Ⅳ stacks all four.
    for (const bankId of ["dragon_utopia", "pyramid", "naga_bank", "crypt"] as const) {
      const { units, stackedCount } = buildCreatureBankCombatUnits(state, bankId, 4);
      expect(units.filter((unit) => Boolean(unit.stackToken)), bankId).toHaveLength(4);
      expect(stackedCount, bankId).toBe(4);
    }
  });

  it("stores the rolled size unchanged at the reveal offer (no clamp)", () => {
    // All-gold/azure pile with two dice (size Ⅳ reachable): each stored candidate
    // size EQUALS its own rolled size — a Ⅳ roll on a Dragon Utopia stays Ⅳ.
    const state = placeFarTileAwaitingRotation({
      openings: 1,
      pile: ["dragon_utopia", "pyramid", "naga_bank"],
    });
    const rollEvents = state.eventLog.filter(
      (event): event is Extract<GameEvent, { type: "ADVENTURE_DICE_ROLLED" }> =>
        event.type === "ADVENTURE_DICE_ROLLED" && Boolean(event.results[0]?.startsWith("Bank ")),
    );
    const tile = Object.values(state.adventure!.tiles).find((candidate) => candidate.reservedBankOptions?.length);
    expect(tile?.reservedBankOptions?.length).toBe(2);
    expect(rollEvents.length).toBe(tile!.reservedBankOptions!.length);
    for (const [index, option] of tile!.reservedBankOptions!.entries()) {
      expect(option.size).toBe(polishBankSizeForAttackRolls(rollEvents[index]!.attackRolls ?? []));
    }
  });

  it("a Stacked bank defender absorbs one lethal blow by discarding its token, then dies", () => {
    const state = createAdventureGameState({
      seed: "bank-size-token-absorb",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true },
    });
    // Size Ⅰ Imp Cache: exactly one Familiar is Stacked. Its Stacked-only ability
    // (power-drain) is active while the token remains; the token absorbs one
    // lethal blow (rulebook p.67) and only the SECOND lethal hit removes it.
    const { units } = buildCreatureBankCombatUnits(state, "imp_cache", 1);
    const stacked = units.find((unit) => Boolean(unit.stackToken))!;
    expect(stacked).toBeTruthy();
    expect(getUnitAbilityDefinitions(stacked).map((ability) => ability.id)).toContain(
      "bank-familiar-power-drain",
    );

    stacked.damage = stacked.maxHealth;
    markUnitRemovedIfNeeded(state, stacked);
    expect(stacked.stackToken).toBeNull();
    expect(state.eventLog.filter((event) => event.type === "STACK_TOKEN_DISCARDED")).toHaveLength(1);
    expect(getUnitAbilityDefinitions(stacked).map((ability) => ability.id)).not.toContain(
      "bank-familiar-power-drain",
    );
    expect(
      state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === stacked.id),
    ).toBe(false);

    stacked.damage = stacked.maxHealth;
    markUnitRemovedIfNeeded(state, stacked);
    expect(
      state.eventLog.some((event) => event.type === "UNIT_REMOVED" && event.unitId === stacked.id),
    ).toBe(true);
  });

  it("CONTROL: rule off rolls the count off Scenario Difficulty at ~77% (not the size)", () => {
    const state = createAdventureGameState({
      seed: "bank-size-standard-control",
      difficulty: "impossible",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": false },
    });
    // Rule OFF: the count comes from the difficulty (impossible = up to 4 rolls)
    // and each candidate lands only ~77% of the time, so across all banks at
    // least one comes up with FEWER than 4 Stacked. If the guaranteed placement
    // were (wrongly) applied with the rule off, every bank would show 4 and this
    // control would fail.
    const counts = (Object.keys(CREATURE_BANKS) as CreatureBankId[]).map(
      (bankId) => buildCreatureBankCombatUnits(state, bankId).stackedCount,
    );
    expect(counts.every((count) => count >= 0 && count <= 4)).toBe(true);
    expect(counts.some((count) => count < 4)).toBe(true);
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

describe("Polish bank size rewards (back to the normal X-scaled reward)", () => {
  function bankRewardState(
    bankId: CreatureBankId,
    size: BankSize | undefined,
    seed: string,
    unitStacks = false,
  ): GameState {
    const state = createAdventureGameState({
      seed,
      difficulty: "normal",
      rollFirstPlayer: false,
      creatureBanks: true,
      houseRules: { "polish-bank-sizes": size !== undefined, "polish-unit-stacks": unitStacks },
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    state.adventure!.fields["bank-field"] = {
      spaceId: "bank-field",
      tileInstanceId: "t",
      slot: 0,
      location: "blocked_field",
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null,
    };
    state.heroes.hero_p1.spaceId = "bank-field";
    placeCreatureBank(state, "bank-field", bankId, size);
    return state;
  }

  it("routes the win reward through the normal bank.buildReward(X), X = the Stacked count = size", () => {
    const state = createAdventureGameState({
      seed: "bank-size-reward-routing",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true },
    });
    // Guaranteed placement makes the combat's Stacked count equal the size, and
    // the reward is the classic per-bank builder scaled by that X — there is no
    // bespoke Polish reward scale any more. Imp Cache pays its printed 3 + X gold.
    for (const size of [1, 2, 3, 4] as const) {
      const { stackedCount } = buildCreatureBankCombatUnits(state, "imp_cache", size);
      expect(stackedCount).toBe(size);
      expect(CREATURE_BANKS.imp_cache.buildReward(stackedCount)).toEqual({
        type: "GAIN_RESOURCES",
        gold: 3 + size,
      });
    }
  });

  it("a resource-bank win actually lands the normal X-scaled gold (end to end)", () => {
    const state = bankRewardState("imp_cache", 3, "polish-bank-reward-gold");
    const goldBefore = state.players.p1.resources.gold ?? 0;
    grantCreatureBankReward(state, "hero_p1", "bank-field", 3);
    expect((state.players.p1.resources.gold ?? 0) - goldBefore).toBe(6); // 3 + X(3)
    expect(state.adventure!.fields["bank-field"].blackCube).toBe(true);
  });

  it("a Dragon Fly Hive win grants the FEW card — plain at size Ⅰ, Stacked (Stack Token) from size Ⅱ, NEVER a Pack/layer", () => {
    // Size Ⅲ (X = 3 ≥ 2): the FEW card carrying a rulebook Stack Token — the actual
    // game "Stacked" unit — plus the house-rule Empower pick. NEVER the Pack side
    // and NEVER a Polish Unit-Stack layer.
    const stackedState = bankRewardState("dragon_fly_hive", 3, "polish-bank-reward-stacked");
    const stackedBefore = new Set(stackedState.players.p1.army.map((unit) => unit.id));
    grantCreatureBankReward(stackedState, "hero_p1", "bank-field", 3);
    const stackedGained = stackedState.players.p1.army.filter((unit) => !stackedBefore.has(unit.id));
    expect(stackedGained).toHaveLength(1);
    expect(stackedGained[0]).toMatchObject({ unitDefId: "fortress.dragon_flies", side: "few" });
    expect(stackedGained[0].stackToken, "size Ⅲ → a rulebook Stack Token on the Few").toBeTruthy();
    expect(stackedGained[0].stacks, "never a Polish layer").toBeUndefined();

    // Size Ⅰ (X = 0): a plain Few, no token.
    const fewState = bankRewardState("dragon_fly_hive", 1, "polish-bank-reward-few");
    const fewBefore = new Set(fewState.players.p1.army.map((unit) => unit.id));
    grantCreatureBankReward(fewState, "hero_p1", "bank-field", 0);
    const fewGained = fewState.players.p1.army.filter((unit) => !fewBefore.has(unit.id));
    expect(fewGained).toHaveLength(1);
    expect(fewGained[0]).toMatchObject({ unitDefId: "fortress.dragon_flies", side: "few" });
    expect(fewGained[0].stackToken, "size Ⅰ → plain Few, no token").toBeUndefined();
    expect(fewGained[0].stacks).toBeUndefined();
  });

  it("CONTROL (don't confuse Polish stacks): with polish-unit-stacks ON the Stacked reward STILL has NO layers — only the Stack Token", () => {
    // The user's explicit warning: even with the Polish Unit-Stacks house rule on,
    // these two banks must grant a normal-game Stack Token, never Polish layers.
    const state = bankRewardState("dragon_fly_hive", 3, "polish-bank-reward-both-on", /* unitStacks */ true);
    const before = new Set(state.players.p1.army.map((unit) => unit.id));
    grantCreatureBankReward(state, "hero_p1", "bank-field", 3);
    const gained = state.players.p1.army.filter((unit) => !before.has(unit.id));
    expect(gained).toHaveLength(1);
    expect(gained[0]).toMatchObject({ unitDefId: "fortress.dragon_flies", side: "few" });
    expect(gained[0].stackToken, "the rulebook Stack Token is present").toBeTruthy();
    expect(gained[0].stacks, "NO Polish layer, even with polish-unit-stacks on").toBeUndefined();
  });

  it("CONTROL: the SAME builder runs with the rule off — rewards are rule-independent now", () => {
    // The reward is the normal per-bank builder regardless of the Polish rule; a
    // rule-off win with X = 3 pays the identical +6 gold. Under Polish the ONLY
    // difference is that X is the deterministic size rather than a difficulty roll.
    const state = bankRewardState("imp_cache", undefined, "polish-bank-reward-control");
    const goldBefore = state.players.p1.resources.gold ?? 0;
    grantCreatureBankReward(state, "hero_p1", "bank-field", 3);
    expect((state.players.p1.resources.gold ?? 0) - goldBefore).toBe(6);
  });
});
