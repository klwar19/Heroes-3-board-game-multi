import { describe, expect, it } from "vitest";
import { CREATURE_BANKS, type CreatureBankId } from "@/data/map/creature-banks";
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
import { chooseComputerAction } from "./computer/policy";

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

function bankChoice(state: GameState): Extract<PendingChoice, { type: "OPTION_CHOICE" }> {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE" || choice.context !== "place-creature-bank") {
    throw new Error("expected the Polish Creature Bank placement choice");
  }
  return choice;
}

describe("Polish bank size roll", () => {
  it("maps every possible one/two-die sum to size I-IV", () => {
    expect(polishBankSizeForAttackRolls([-1, -1])).toBe(1);
    expect(polishBankSizeForAttackRolls([-1, 0])).toBe(1);
    expect(polishBankSizeForAttackRolls([0, 0])).toBe(2);
    expect(polishBankSizeForAttackRolls([0, 1])).toBe(3);
    expect(polishBankSizeForAttackRolls([1, 1])).toBe(4);

    expect(polishBankSizeForAttackRolls([-1])).toBe(1);
    expect(polishBankSizeForAttackRolls([0])).toBe(2);
    expect(polishBankSizeForAttackRolls([1])).toBe(3);
  });

  it("rolls one die for a player's first Far opening and two thereafter", () => {
    const first = placeFarTileAwaitingRotation({ openings: 0 });
    const firstRolls = first.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.results[0]?.startsWith("Bank "),
    );
    expect(firstRolls).toHaveLength(2);
    expect(firstRolls.every((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.attackRolls?.length === 1)).toBe(true);
    const firstTile = first.adventure!.tiles[first.adventure!.pendingTileChoice!.tileInstanceId];
    expect(firstTile.reservedBankOptions).toHaveLength(2);
    expect(firstTile.reservedBankOptions?.every((candidate) => candidate.size <= 3)).toBe(true);

    const second = placeFarTileAwaitingRotation({ openings: 1 });
    const secondRolls = second.eventLog.filter(
      (event) => event.type === "ADVENTURE_DICE_ROLLED" && event.results[0]?.startsWith("Bank "),
    );
    expect(secondRolls).toHaveLength(2);
    expect(secondRolls.every((event) => event.type === "ADVENTURE_DICE_ROLLED" && event.attackRolls?.length === 2)).toBe(true);
  });
});

describe("Polish Creature Bank offer", () => {
  it("offers two sized candidates, consumes the chosen id, and leaves the other in place", () => {
    const awaiting = placeFarTileAwaitingRotation();
    const pileBefore = [...awaiting.adventure!.creatureBankTokensFar!];
    let state = finishRotation(awaiting);
    const choice = bankChoice(state);
    const candidates = choice.creatureBank?.candidates ?? [];
    expect(candidates).toHaveLength(2);
    expect(choice.options).toHaveLength(3);
    expect(choice.options[0].label).toMatch(/^A · Place .+ · size I{1,3}V?$/);
    expect(choice.options[1].label).toMatch(/^B · Place .+ · size I{1,3}V?$/);

    const selected = candidates[1];
    const unchosen = candidates[0];
    const fieldId = choice.creatureBank!.fieldId;
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: 1,
    });

    const field = state.adventure!.fields[fieldId];
    expect(field.location).toBe("creature_bank");
    expect(field.bankId).toBe(selected.bankId);
    expect(field.bankSize).toBe(selected.size);
    expect(state.adventure!.creatureBankTokensFar).toHaveLength(pileBefore.length - 1);
    expect(state.adventure!.creatureBankTokensFar).not.toContain(selected.bankId);
    expect(state.adventure!.creatureBankTokensFar).toContain(unchosen.bankId);
  });

  it("declining conserves both peeked tokens; a one-token pile offers one candidate", () => {
    let state = finishRotation(placeFarTileAwaitingRotation());
    const choice = bankChoice(state);
    const pileBefore = [...state.adventure!.creatureBankTokensFar!];
    const fieldId = choice.creatureBank!.fieldId;
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: choice.id,
      optionIndex: choice.creatureBank!.candidates!.length,
    });
    expect(state.adventure!.fields[fieldId].location).toBe("blocked_field");
    expect(state.adventure!.creatureBankTokensFar).toEqual(pileBefore);

    const one = finishRotation(placeFarTileAwaitingRotation({ pile: ["crypt"] }));
    const oneChoice = bankChoice(one);
    expect(oneChoice.creatureBank?.candidates).toEqual([
      expect.objectContaining({ bankId: "crypt" }),
    ]);
    expect(oneChoice.options).toHaveLength(2);
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
  it("uses field size, rather than global difficulty, for Stack-token rolls", () => {
    let observedDivergence = false;
    for (let index = 0; index < 80 && !observedDivergence; index += 1) {
      const state = createAdventureGameState({
        seed: `bank-size-stack-control-${index}`,
        difficulty: "normal",
        rollFirstPlayer: false,
      });
      const small = buildCreatureBankCombatUnits(state, "crypt", 1).stackedCount;
      const large = buildCreatureBankCombatUnits(state, "crypt", 4).stackedCount;
      expect(large).toBeGreaterThanOrEqual(small);
      observedDivergence ||= large > small;
    }
    expect(observedDivergence, "size IV must create extra Stack-token opportunities over size I").toBe(true);
  });

  it("AI prefers the larger beatable candidate and leaves an unbeatable pair", () => {
    const decide = (state: GameState, candidates: { bankId: string; size: BankSize }[]) => {
      const choice: Extract<PendingChoice, { type: "OPTION_CHOICE" }> = {
        id: "bank-ai",
        type: "OPTION_CHOICE",
        playerId: "p1",
        prompt: "Choose a bank",
        options: [...candidates.map((candidate) => ({ label: candidate.bankId })), { label: "Leave it blocked" }],
        context: "place-creature-bank",
        creatureBank: { fieldId: "bank", tier: "far", candidates },
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
    const leave = decide(weak, [
      { bankId: "dragon_utopia", size: 1 },
      { bankId: "dragon_utopia", size: 2 },
    ]);
    expect((leave?.action as Extract<GameAction, { type: "CHOOSE_OPTION" }>).optionIndex).toBe(2);
    expect(CREATURE_BANKS.dragon_utopia).toBeTruthy();
  });
});
