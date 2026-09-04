import { describe, expect, it } from "vitest";
import {
  CREATURE_BANKS,
  CREATURE_BANK_IDS,
  POLISH_CREATURE_BANKS,
  POLISH_CREATURE_BANK_IDS,
  getCreatureBankUnitSide,
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
import {
  buildCreatureBankCombatUnits,
  creatureBankHostLocationForTile,
  creatureBankTierForTile,
  grantCreatureBankReward,
  instantiateTile,
  placeCreatureBank,
} from "./adventure";
import { markUnitRemovedIfNeeded } from "./combat-units";
import { chooseComputerAction } from "./computer/policy";
import { getUnitAbilityDefinitions } from "./unit-abilities";

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

describe("Polish Creature Bank controls are independent", () => {
  it("card roster and I–IV procedure can be enabled separately", () => {
    const sizeOnly = createAdventureGameState({
      seed: "polish-bank-size-only",
      ruleset: "legacy",
      rollFirstPlayer: false,
      creatureBanks: true,
      houseRules: { "polish-bank-sizes": true },
    });
    const sizeOnlyPile = [
      ...(sizeOnly.adventure!.creatureBankTokensFar ?? []),
      ...(sizeOnly.adventure!.creatureBankTokensNear ?? []),
    ].sort();
    expect(sizeOnlyPile).toEqual([...CREATURE_BANK_IDS].sort());
    expect(sizeOnly.adventure!.houseRules?.["split-decks"]).toBe(false);

    const cardsOnly = createAdventureGameState({
      seed: "polish-bank-cards-only",
      ruleset: "legacy",
      rollFirstPlayer: false,
      creatureBanks: true,
      houseRules: { "polish-creature-banks": true },
    });
    const cardsOnlyPile = [
      ...(cardsOnly.adventure!.creatureBankTokensFar ?? []),
      ...(cardsOnly.adventure!.creatureBankTokensNear ?? []),
    ].sort();
    expect(cardsOnlyPile).toEqual([...POLISH_CREATURE_BANK_IDS].sort());
    expect(cardsOnly.adventure!.houseRules?.["polish-bank-sizes"]).toBe(false);
    expect(cardsOnly.adventure!.houseRules?.["split-decks"]).toBe(true);
  });
});

function placeFarTileAwaitingRotation({
  enabled = true,
  openings = 0,
  pile,
  tileDefId = "F1",
}: {
  enabled?: boolean;
  openings?: number;
  pile?: CreatureBankId[];
  tileDefId?: string;
} = {}): GameState {
  let state = createAdventureGameState({
    seed: `polish-bank-${enabled}-${openings}-${pile?.length ?? "full"}`,
    difficulty: "normal",
    rollFirstPlayer: false,
    creatureBanks: true,
    houseRules: {
      "polish-creature-banks": enabled,
      "polish-bank-sizes": enabled,
    },
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
  state.adventure!.farTileScriptedDraws = [tileDefId];
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
  it("uses an Empty Field on a no-block Far tile, while rule-off leaves that tile unchanged", () => {
    let state = placeFarTileAwaitingRotation({ tileDefId: "F23" });
    const choice = bankChoice(state);
    expect(choice.prompt).toContain("Empty Field");
    expect(choice.options.at(-1)?.label).toBe("Leave it empty");
    state = choosePolishBank(state, 0);
    const tile = state.adventure!.tiles[state.adventure!.pendingTileChoice!.tileInstanceId];
    state = finishRotation(state);
    const bank = Object.values(state.adventure!.fields).find(
      (field) => field.tileInstanceId === tile.id && field.location === "creature_bank"
    );
    expect(bank?.bankId).toBeTruthy();
    expect(
      Object.values(state.adventure!.fields).some(
        (field) => field.tileInstanceId === tile.id && field.location === "empty_field"
      )
    ).toBe(false);

    const control = finishRotation(placeFarTileAwaitingRotation({ enabled: false, tileDefId: "F23" }));
    const controlTile = Object.values(control.adventure!.tiles).find((candidate) => candidate.tileDefId === "F23")!;
    expect(control.pendingChoice).toBeNull();
    expect(
      Object.values(control.adventure!.fields).some(
        (field) => field.tileInstanceId === controlTile.id && field.location === "creature_bank"
      )
    ).toBe(false);
    expect(
      Object.values(control.adventure!.fields).some(
        (field) => field.tileInstanceId === controlTile.id && field.location === "empty_field"
      )
    ).toBe(true);
  });

  it("treats IV–V sea tiles as Near banks, including the no-block Empty Field fallback", () => {
    let state = createAdventureGameState({
      seed: "polish-sea-empty-bank",
      difficulty: "normal",
      rollFirstPlayer: false,
      creatureBanks: true,
      houseRules: { "polish-bank-sizes": true },
    });
    for (const player of Object.values(state.players)) {
      player.canMulligan = false;
      player.needsHandRefresh = false;
    }
    const w2 = instantiateTile(state.adventure!, "W2", { row: 40, col: 40 }, 0, false, { materialize: false });
    w2.awaitingRotation = true;
    state.adventure!.pendingTileChoice = {
      tileInstanceId: w2.id,
      playerId: "p1",
      kind: "reveal",
    };
    expect(creatureBankTierForTile(state, w2)).toBe("near");
    expect(creatureBankHostLocationForTile(state, w2)).toBe("empty_field");
    expect(
      creatureBankTierForTile(state, { group: "sea", tileDefId: "W7" })
    ).toBeNull();

    state = apply(state, {
      type: "SET_TILE_ROTATION",
      playerId: "p1",
      tileInstanceId: w2.id,
      rotation: 0,
    });
    const choice = bankChoice(state);
    expect(choice.creatureBank?.tier).toBe("near");
    expect(choice.prompt).toContain("Empty Field");
    state = choosePolishBank(state, 0);
    expect(
      Object.values(state.adventure!.fields).some(
        (field) => field.tileInstanceId === w2.id && field.location === "creature_bank"
      )
    ).toBe(true);
  });

  it("chooses between two sized candidates before rotation, then consumes only the chosen id", () => {
    let state = placeFarTileAwaitingRotation();
    const pileBefore = [...state.adventure!.creatureBankTokensFar!];
    const choice = bankChoice(state);
    const candidates = choice.creatureBank?.candidates ?? [];
    expect(candidates).toHaveLength(2);
    expect(choice.creatureBank?.preRotation).toBe(true);
    // A / B / Leave it blocked
    expect(choice.options).toHaveLength(3);
    expect(choice.options[0].label).toMatch(/^A · .+ · size I{1,3}V?$/);
    expect(choice.options[1].label).toMatch(/^B · .+ · size I{1,3}V?$/);
    expect(choice.options[2].label).toBe("Leave it blocked");

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

  it("offers Leave it blocked before rotation; declining leaves the field blocked and the pile intact", () => {
    let state = placeFarTileAwaitingRotation();
    const pileBefore = [...state.adventure!.creatureBankTokensFar!];
    const choice = bankChoice(state);
    expect(choice.creatureBank?.preRotation).toBe(true);
    const leaveIndex = choice.options.length - 1;
    expect(choice.options[leaveIndex].label).toBe("Leave it blocked");

    state = choosePolishBank(state, leaveIndex);
    const rotatingTile = state.adventure!.tiles[state.adventure!.pendingTileChoice!.tileInstanceId];
    expect(rotatingTile.reservedBankDeclined).toBe(true);
    expect(rotatingTile.reservedBankId).toBeUndefined();
    expect(rotatingTile.reservedBankOptions).toBeUndefined();
    expect(state.adventure!.creatureBankTokensFar).toEqual(pileBefore);

    state = finishRotation(state);
    expect(
      Object.values(state.adventure!.fields).some(
        (field) => field.tileInstanceId === rotatingTile.id && field.location === "creature_bank",
      ),
    ).toBe(false);
    expect(
      Object.values(state.adventure!.fields).some(
        (field) => field.tileInstanceId === rotatingTile.id && field.location === "blocked_field",
      ),
    ).toBe(true);
    expect(state.adventure!.creatureBankTokensFar).toEqual(pileBefore);
  });

  it("a one-token pile offers Place / Leave before rotation (not auto-place)", () => {
    let state = placeFarTileAwaitingRotation({ pile: ["crypt"] });
    const choice = bankChoice(state);
    expect(choice.creatureBank?.preRotation).toBe(true);
    expect(choice.creatureBank?.candidates).toEqual([expect.objectContaining({ bankId: "crypt" })]);
    expect(choice.options).toHaveLength(2);
    expect(choice.options[0].label).toMatch(/^A · Crypt · size /);
    expect(choice.options[1].label).toBe("Leave it blocked");

    state = choosePolishBank(state, 0);
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
  const base = getCreatureBankUnitSide(unit.unitDefId!, unit.bankSideKey)!;
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
    // Stack Token, guaranteed — no BINH 80% roll, no bespoke coin layer. Across all
    // 12 banks × 4 sizes that is ~120 placements; if the guarantee were reverted
    // to the BINH 80% roll at least one would drop and the exact-count
    // assertion would fail (mutation control for the guaranteed placement).
    for (const bankId of POLISH_CREATURE_BANK_IDS) {
      for (const size of [1, 2, 3, 4] as const) {
        const { units, stackedCount } = buildCreatureBankCombatUnits(state, bankId, size);
        const expected = bankId === "black_tower" ? 0 : Math.min(size, units.length);
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

  it("uses Black Tower size as the Dragon row and gives its single Dragon no Stack Token", () => {
    const state = createAdventureGameState({
      seed: "polish-black-tower-direct-size",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-creature-banks": true, "polish-bank-sizes": true },
    });
    const sides = [
      "guardian:green-dragon",
      "guardian:red-dragon",
      "guardian:gold-dragon",
      "guardian:black-dragon",
    ];
    for (const size of [1, 2, 3, 4] as const) {
      const { units, stackedCount } = buildCreatureBankCombatUnits(state, "black_tower", size);
      expect(units).toHaveLength(1);
      expect(units[0]?.bankSideKey).toBe(sides[size - 1]);
      expect(units[0]?.stackToken).toBeUndefined();
      expect(stackedCount).toBe(0);
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

  it("CONTROL: Polish sizing off uses the official fixed Scenario Difficulty count", () => {
    const state = createAdventureGameState({
      seed: "bank-size-standard-control",
      difficulty: "impossible",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": false },
    });
    // Rule OFF: the count comes from Scenario Difficulty, not a Polish size.
    // Impossible officially places all 4 Stack Tokens.
    const counts = CREATURE_BANK_IDS.map(
      (bankId) => buildCreatureBankCombatUnits(state, bankId).stackedCount,
    );
    expect(counts.every((count) => count === 4)).toBe(true);
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
      houseRules: {
        "polish-creature-banks": size !== undefined,
        "polish-bank-sizes": size !== undefined,
        "polish-unit-stacks": unitStacks,
      },
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

  it("routes the win reward through the printed Polish bank builder, X = size", () => {
    const state = createAdventureGameState({
      seed: "bank-size-reward-routing",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-creature-banks": true, "polish-bank-sizes": true },
    });
    // The new Imp Cache card pays 2 + 2X gold.
    for (const size of [1, 2, 3, 4] as const) {
      const { stackedCount } = buildCreatureBankCombatUnits(state, "imp_cache", size);
      expect(stackedCount).toBe(size);
      expect(POLISH_CREATURE_BANKS.imp_cache.buildReward(stackedCount)).toEqual({
        type: "GAIN_RESOURCES",
        gold: 2 + 2 * size,
      });
    }
  });

  it("a resource-bank win lands the printed Polish X-scaled gold (end to end)", () => {
    const state = bankRewardState("imp_cache", 3, "polish-bank-reward-gold");
    const goldBefore = state.players.p1.resources.gold ?? 0;
    grantCreatureBankReward(state, "hero_p1", "bank-field", 3);
    expect((state.players.p1.resources.gold ?? 0) - goldBefore).toBe(8); // 2 + 2×X(3)
    expect(state.adventure!.fields["bank-field"].blackCube).toBe(true);
  });

  it("Black Tower size III pays its fixed 7 gold and opens Major Artifact Search (2)", () => {
    const state = bankRewardState("black_tower", 3, "polish-black-tower-size-three-reward");
    const goldBefore = state.players.p1.resources.gold ?? 0;
    grantCreatureBankReward(state, "hero_p1", "bank-field", 0);
    expect((state.players.p1.resources.gold ?? 0) - goldBefore).toBe(7);
    expect(state.adventure!.rewardQueue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: "p1",
          kind: "shared-deck-search",
          deckId: "artifacts-major",
          count: 2,
        }),
      ]),
    );
  });

  it("Ogre's Stronghold grants the exact size-matched Wyverns card", () => {
    const stackedState = bankRewardState("dragon_fly_hive", 3, "polish-bank-reward-stacked");
    const stackedBefore = new Set(stackedState.players.p1.army.map((unit) => unit.id));
    grantCreatureBankReward(stackedState, "hero_p1", "bank-field", 3);
    const stackedGained = stackedState.players.p1.army.filter((unit) => !stackedBefore.has(unit.id));
    expect(stackedGained).toHaveLength(1);
    expect(stackedGained[0]).toMatchObject({
      unitDefId: "neutral.wyverns",
      side: "bank",
      bankSideKey: "reward:wyverns:3"
    });
    expect(stackedGained[0].stackToken).toBeUndefined();
    expect(stackedGained[0].stacks, "never a Polish layer").toBeUndefined();
    expect(stackedState.players.p1.abilityEmpowerToken).toBe(1);

    // The field's stored size is authoritative even if a stale caller passes X=0.
    const fewState = bankRewardState("dragon_fly_hive", 1, "polish-bank-reward-few");
    const fewBefore = new Set(fewState.players.p1.army.map((unit) => unit.id));
    grantCreatureBankReward(fewState, "hero_p1", "bank-field", 0);
    const fewGained = fewState.players.p1.army.filter((unit) => !fewBefore.has(unit.id));
    expect(fewGained).toHaveLength(1);
    expect(fewGained[0]).toMatchObject({ unitDefId: "neutral.wyverns", side: "bank", bankSideKey: "reward:wyverns:1" });
    expect(fewGained[0].stackToken).toBeUndefined();
    expect(fewGained[0].stacks).toBeUndefined();
    expect(fewState.players.p1.abilityEmpowerToken).toBe(1);
  });

  it("always grants the printed Empowered Token with every Polish creature reward", () => {
    for (const bankId of [
      "dragon_fly_hive",
      "wolves_den",
      "red_tower",
      "training_grounds",
      "griffin_conservatory",
    ] as const) {
      const state = bankRewardState(bankId, 2, `mandatory-empowered-token-${bankId}`);
      state.adventure!.houseRules!["bank-empower-ability"] = false;
      expect(state.players.p1.abilityEmpowerToken ?? 0).toBe(0);
      grantCreatureBankReward(state, "hero_p1", "bank-field", 2);
      expect(state.players.p1.abilityEmpowerToken, bankId).toBe(1);
      expect(
        state.eventLog.some(
          (event) => event.type === "ABILITY_EMPOWER_TOKEN_GAINED" && event.playerId === "p1"
        ),
        `${bankId} must resolve the printed crown, not only describe it`,
      ).toBe(true);
    }
  });

  it("pays 10 gold for a size-II Graveyard", () => {
    const state = bankRewardState("graveyard", 2, "graveyard-size-two-reward");
    const before = state.players.p1.resources.gold ?? 0;
    grantCreatureBankReward(state, "hero_p1", "bank-field", 2);
    expect((state.players.p1.resources.gold ?? 0) - before).toBe(10);
  });

  it("CONTROL: Polish unit-stack layers never leak onto a size-matched reward card", () => {
    const state = bankRewardState("dragon_fly_hive", 3, "polish-bank-reward-both-on", /* unitStacks */ true);
    const before = new Set(state.players.p1.army.map((unit) => unit.id));
    grantCreatureBankReward(state, "hero_p1", "bank-field", 3);
    const gained = state.players.p1.army.filter((unit) => !before.has(unit.id));
    expect(gained).toHaveLength(1);
    expect(gained[0]).toMatchObject({
      unitDefId: "neutral.wyverns",
      side: "bank",
      bankSideKey: "reward:wyverns:3"
    });
    expect(gained[0].stackToken).toBeUndefined();
    expect(gained[0].stacks, "NO Polish layer, even with polish-unit-stacks on").toBeUndefined();
  });

  // ---------------------------------------------------------------------
  // USER BUG 2026-09-04: "after beating medusa store I cannot choose a reward
  // one by one (previously in normal game, can)". The Polish card override had
  // collapsed the printed per-Stacked-unit either/or into ONE lumped
  // "+3X gold or +X valuables" choice, so the winner could no longer MIX.
  // ---------------------------------------------------------------------

  /** Drains every offered visit-step prompt, answering with `pick` when present. */
  function drainVisitSteps(start: GameState, pick: RegExp): { prompts: string[][]; state: GameState } {
    const prompts: string[][] = [];
    let state = start;
    for (let guard = 0; guard < 16; guard += 1) {
      const offers = getLegalActions(state, "p1").filter(
        (entry) => entry.action.type === "RESOLVE_VISIT_STEP",
      );
      if (offers.length === 0) break;
      prompts.push(offers.map((offer) => offer.label));
      const chosen = offers.find((offer) => pick.test(offer.label)) ?? offers[0]!;
      state = apply(state, chosen.action);
    }
    return { prompts, state };
  }

  const MEDUSA_PICK = ["Gain 3 gold", "Gain 1 valuables"];

  it("Medusa's Lair pays its Stacked bonus ONE PICK AT A TIME, exactly like the official card", () => {
    for (const [label, size] of [["polish", 3], ["classic", undefined]] as const) {
      const state = bankRewardState("medusa_stores", size, `medusa-one-by-one-${label}`);
      const goldBefore = state.players.p1.resources.gold ?? 0;
      const valuablesBefore = state.players.p1.resources.valuables ?? 0;
      grantCreatureBankReward(state, "hero_p1", "bank-field", 3);

      // Three separate either/or prompts — never one lumped "+9 gold or +3 valuables".
      const all = drainVisitSteps(state, /never-matches/);
      expect(all.prompts, label).toEqual([MEDUSA_PICK, MEDUSA_PICK, MEDUSA_PICK]);
      expect(all.prompts.flat().some((prompt) => /Gain 9 gold|Gain 3 valuables/.test(prompt)), label).toBe(false);
      // Taking gold on all three: 6 + 3×3 gold, and only the printed 1 valuables.
      expect((all.state.players.p1.resources.gold ?? 0) - goldBefore, label).toBe(15);
      expect((all.state.players.p1.resources.valuables ?? 0) - valuablesBefore, label).toBe(1);
    }
  });

  it("the winner may MIX the picks — 2 gold + 1 valuables, which one lumped choice cannot pay", () => {
    for (const [label, size] of [["polish", 3], ["classic", undefined]] as const) {
      const state = bankRewardState("medusa_stores", size, `medusa-mixed-${label}`);
      const goldBefore = state.players.p1.resources.gold ?? 0;
      const valuablesBefore = state.players.p1.resources.valuables ?? 0;
      grantCreatureBankReward(state, "hero_p1", "bank-field", 3);

      // Answer the FIRST prompt with valuables, the remaining two with gold.
      let live = state;
      const first = getLegalActions(live, "p1").find(
        (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && entry.label === "Gain 1 valuables",
      );
      expect(first, `${label}: a per-defender valuables pick is offered`).toBeTruthy();
      live = apply(live, first!.action);
      const rest = drainVisitSteps(live, /^Gain 3 gold$/);
      expect(rest.prompts, label).toEqual([MEDUSA_PICK, MEDUSA_PICK]);
      expect((rest.state.players.p1.resources.gold ?? 0) - goldBefore, label).toBe(12); // 6 + 3 + 3
      expect((rest.state.players.p1.resources.valuables ?? 0) - valuablesBefore, label).toBe(2); // 1 + 1
    }
  });

  it("CONTROL: the Polish Medusa card is the official builder, size Ⅰ pays exactly one pick", () => {
    expect(POLISH_CREATURE_BANKS.medusa_stores.buildReward(3)).toEqual(
      CREATURE_BANKS.medusa_stores.buildReward(3),
    );
    expect(POLISH_CREATURE_BANKS.medusa_stores.name, "only the Polish NAME differs").toBe("Medusa's Lair");
    const state = bankRewardState("medusa_stores", 1, "medusa-size-one");
    const goldBefore = state.players.p1.resources.gold ?? 0;
    grantCreatureBankReward(state, "hero_p1", "bank-field", 1);
    const drained = drainVisitSteps(state, /^Gain 3 gold$/);
    expect(drained.prompts).toEqual([MEDUSA_PICK]);
    expect((drained.state.players.p1.resources.gold ?? 0) - goldBefore).toBe(9);
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
