import { describe, expect, it } from "vitest";
import { CREATURE_BANKS, CREATURE_BANK_UNIT_SIDES, type CreatureBankId } from "@/data/map/creature-banks";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  polishBankSizeForAttackRolls,
  type BankSize,
  type GameAction,
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

  it("rolls two Attack dice for each of both banks, including the first Far opening", () => {
    const first = placeFarTileAwaitingRotation({ openings: 0 });
    const firstRolls = first.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.results[0]?.startsWith("Bank "),
    );
    expect(firstRolls).toHaveLength(2);
    expect(firstRolls.every((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.attackRolls?.length === 2)).toBe(true);
    const firstTile = first.adventure!.tiles[first.adventure!.pendingTileChoice!.tileInstanceId];
    expect(firstTile.reservedBankOptions).toHaveLength(2);
    expect(firstTile.reservedBankOptions?.every((candidate) => candidate.size >= 1 && candidate.size <= 4)).toBe(true);

    const second = placeFarTileAwaitingRotation({ openings: 1 });
    const secondRolls = second.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.results[0]?.startsWith("Bank "),
    );
    expect(secondRolls).toHaveLength(2);
    expect(secondRolls.every((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.attackRolls?.length === 2)).toBe(true);
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
  it("replaces random Stack Tokens with 0/1/2/3 layers on every one of the four guards", () => {
    const state = createAdventureGameState({
      seed: "bank-size-deterministic-layers",
      difficulty: "normal",
      rollFirstPlayer: false,
      houseRules: { "polish-bank-sizes": true },
    });

    for (const size of [1, 2, 3, 4] as const) {
      const { units, stackedCount } = buildCreatureBankCombatUnits(state, "crypt", size);
      expect(units).toHaveLength(4);
      expect(units.every((unit) => unit.bankStacks === size - 1)).toBe(true);
      expect(units.every((unit) => unit.stackToken === undefined)).toBe(true);
      expect(units.every((unit) => {
        const base = CREATURE_BANK_UNIT_SIDES[unit.unitDefId!];
        return unit.attack === base.attack + (size > 1 ? 1 : 0);
      })).toBe(true);
      // Rewards keep the old X scale, now deterministically equal to bank size.
      expect(stackedCount).toBe(size);
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
