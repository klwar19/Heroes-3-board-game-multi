import { describe, expect, it } from "vitest";
import { cardLibrary } from "@/data/cards/library";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  NEUTRAL_DECK_IDS,
  type CardId,
  type GameAction,
  type GameState
} from "./index";
import { getMainHero } from "./adventure";
import { startNeutralEncounter } from "./adventure-reducer";

/**
 * SCHOOL-restricted Power sources may only boost a MATCHING Spell.
 *
 * USER REPORT (2026-08-22), verbatim: "Air magic - should not work with Visions
 * - it is Fire Magic spell only." The printed Visions scan
 * (`public/assets/spells-visions.webp`) carries the FIRE flame icon, and the
 * data agrees (`spellSchools: ["fire"]`). The hole was in the flat "+1 Power"
 * boost windows: `openVisionsBoostStep`, `openVisionsGuardSwapBoost` and
 * `openFortuneBoostStep` filtered the hand with the bare `cardCanBoostPower`,
 * which is TRUE for any card carrying an ADD_SPELL_POWER effect regardless of
 * its printed `schoolOnly`. So a School-of-Magic ability card (Air Magic —
 * `ADD_SPELL_POWER { amount: 0, expertAmount: 3, schoolOnly: "air" }`) was
 * offered as "Discard Air Magic → scry 2" on a FIRE spell.
 *
 * The map-spell-boost sibling was already correct (it reads
 * `spellPowerSidesOfCard(card, spell.spellSchools)`), so this suite pins the
 * three that were not — each assertion paired with a Fire Magic CONTROL on the
 * same setup, so a fix that simply hides every School ability fails too.
 */

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function makeGame(seed: string): GameState {
  const base = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
  return base.players.p1.needsHandRefresh || base.players.p1.canMulligan
    ? apply(base, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : base;
}

/** Empties every Neutral tier deck except bronze, which is set to `cards`. */
function isolateBronze(state: GameState, cards: string[]): void {
  for (const tier of ["bronze", "silver", "gold", "azure"] as const) {
    const deck = state.decks[NEUTRAL_DECK_IDS[tier]];
    deck.drawPile = tier === "bronze" ? [...cards] : [];
    deck.discardPile = [];
  }
}

/** The card ids the open boost window offers as payable Power sources. */
function boostSourceIds(state: GameState): CardId[] {
  const choice = state.pendingChoice;
  if (choice?.type !== "OPTION_CHOICE") {
    return [];
  }
  const sharedMapSources = (choice.mapSpellBoost?.offers ?? []).flatMap((offer) => {
    if (offer.kind === "card" || offer.kind === "cost-discard") {
      return [offer.cardId];
    }
    if (offer.kind === "school-permanent-expert") {
      return [offer.permanentCardId];
    }
    if (offer.kind === "school-fetch-expert") {
      return offer.fromHandCardId ? [offer.fromHandCardId] : [];
    }
    return [];
  });
  return [...(choice.visionsBoost?.spellCardIds ?? choice.fortuneBoost?.spellCardIds ?? sharedMapSources)];
}

function playVisions(hand: CardId[], seed: string): GameState {
  const state = makeGame(seed);
  state.players.p1.hand = [...hand];
  isolateBronze(state, ["n.a", "n.b", "n.c", "n.d"]);
  return apply(state, {
    type: "PLAY_CARD",
    playerId: "p1",
    cardId: "spell.visions",
    mode: "basic",
    target: { type: "none" }
  });
}

describe("Visions (Fire) Power boost — school-restricted sources", () => {
  it("printed card is a FIRE spell (the scan's flame icon)", () => {
    expect(cardLibrary["spell.visions"].spellSchools).toEqual(["fire"]);
    // The sources under test, as printed.
    expect(cardLibrary["ability.air_magic"].effect).toMatchObject({
      type: "ADD_SPELL_POWER",
      schoolOnly: "air"
    });
    expect(cardLibrary["ability.fire_magic"].effect).toMatchObject({
      type: "ADD_SPELL_POWER",
      schoolOnly: "fire"
    });
  });

  it("does NOT offer Air Magic as a Power source, but DOES offer Fire Magic", () => {
    const air = playVisions(["spell.visions", "ability.air_magic"], "visions-air");
    // Air Magic is the only other card: with it filtered out there is no boost
    // window at all, so the scry opens straight at Power 0 (1 card).
    expect(boostSourceIds(air)).not.toContain("ability.air_magic");
    expect(air.pendingChoice?.type === "OPTION_CHOICE" && air.pendingChoice.context).toBe("visions-scry");

    // CONTROL — the matching school still boosts.
    const fire = playVisions(["spell.visions", "ability.fire_magic"], "visions-fire");
    expect(fire.pendingChoice?.type === "OPTION_CHOICE" && fire.pendingChoice.context).toBe("visions-boost");
    expect(boostSourceIds(fire)).toContain("ability.fire_magic");
  });

  it("keeps offering plain Spells and school-agnostic Power sources", () => {
    const state = playVisions(["spell.visions", "spell.haste", "ability.air_magic"], "visions-mixed");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("visions-boost");
    const sources = boostSourceIds(state);
    expect(sources).toContain("spell.haste"); // a Spell's generic "+1 Power" side
    expect(sources).not.toContain("ability.air_magic");
    // The option labels the player sees match the filtered sources (one label
    // per source plus the trailing "scry now").
    const choice = state.pendingChoice;
    if (choice?.type !== "OPTION_CHOICE") {
      throw new Error("expected the visions-boost window");
    }
    expect(choice.options).toHaveLength(sources.length + 1);
    expect(choice.options.map((option) => option.label).join(" | ")).not.toContain("Air Magic");
  });

  it("Air Magic in hand cannot be spent — the scry lands at Power 0 with it still held", () => {
    // Observable outcome, not a field read: with ONLY Air Magic beside Visions,
    // the scry reveals 1 card (Power 0) and Air Magic never leaves the hand.
    const state = playVisions(["spell.visions", "ability.air_magic"], "visions-air-outcome");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.visionsScry?.remaining).toHaveLength(
      1
    );
    expect(state.players.p1.hand).toContain("ability.air_magic");

    // CONTROL — Fire Magic really can be spent for +1 card.
    let fire = playVisions(["spell.visions", "ability.fire_magic"], "visions-fire-outcome");
    fire = apply(fire, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: fire.pendingChoice!.id,
      optionIndex: 0
    });
    expect(fire.pendingChoice?.type === "OPTION_CHOICE" && fire.pendingChoice.visionsScry?.remaining).toHaveLength(2);
    expect(fire.players.p1.hand).not.toContain("ability.fire_magic");
    expect(fire.players.p1.discard).toContain("ability.fire_magic");
  });
});

describe("Visions pre-battle guard swap — the same school filter", () => {
  // The second Visions window (`openVisionsGuardSwapBoost`) had the identical
  // hole, so it is pinned on the real pre-battle path.
  function neutralSetup(seed: string, hand: CardId[]): GameState {
    let state = createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] });
    }
    state.adventure!.astrologers = {
      activeCardId: "astrologers.dead_silence",
      nextResourceModifiers: { gold: 0, valuables: 0 },
      crazyWizardUsedBy: [],
      swiftWeaselUsedBy: []
    };
    const hero = getMainHero(state, "p1")!;
    const field = state.adventure!.fields[hero.spaceId!];
    field.difficulty = 2;
    startNeutralEncounter(state, hero, field);
    state.players.p1.hand = [...hand];
    state.players.p1.discard = [];
    return state;
  }

  /** Deploy + lock placement so the guards reveal and the Visions cast is offered. */
  function castVisions(seed: string, hand: CardId[]): GameState {
    const setup = neutralSetup(seed, hand);
    const place = getLegalActions(setup, "p1").find((legal) => legal.action.type === "PLACE_COMBAT_UNIT");
    expect(place, "a unit to place").toBeTruthy();
    const opened = apply(apply(setup, place!.action), { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    return apply(opened, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: opened.pendingChoice!.id,
      optionIndex: 1 // Cast Visions
    });
  }

  function swapsRemaining(state: GameState): number | undefined {
    const choice = state.pendingChoice;
    return choice?.type === "OPTION_CHOICE" ? choice.visionsGuardSwap?.swapsRemaining : undefined;
  }

  it("refuses Air Magic — the swap budget stays at Power 0 and the card is kept", () => {
    const state = castVisions("vis-guard-air", ["spell.visions", "ability.air_magic"]);
    // No payable source, so the boost window is skipped entirely.
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("visions-guard-swap");
    expect(swapsRemaining(state)).toBe(1);
    expect(state.players.p1.hand).toContain("ability.air_magic");
  });

  it("CONTROL — Fire Magic is offered and buys a second swap", () => {
    let state = castVisions("vis-guard-fire", ["spell.visions", "ability.fire_magic"]);
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("visions-guard-boost");
    expect(boostSourceIds(state)).toContain("ability.fire_magic");
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("visions-guard-swap");
    expect(swapsRemaining(state)).toBe(2);
    expect(state.players.p1.discard).toContain("ability.fire_magic");
  });
});

describe("Fortune (Air) Power boost — the mirror image", () => {
  // Fortune is a Basic AIR spell, so the schools swap roles: Air Magic pays it,
  // Fire Magic does not. Pinning both directions on the SAME window proves the
  // filter reads the spell's school rather than blanket-hiding School abilities.
  function playFortune(hand: CardId[], seed: string): GameState {
    const state = makeGame(seed);
    state.players.p1.hand = [...hand];
    state.players.p1.limits.expertUses = 1;
    return apply(state, {
      type: "PLAY_CARD",
      playerId: "p1",
      cardId: "spell.fortune",
      mode: "basic",
      target: { type: "none" }
    });
  }

  function rerollBudget(state: GameState): number | undefined {
    const modifier = state.activeEffects
      .find((effect) => effect.name === "Fortune")
      ?.modifiers.find((entry) => entry.type === "ADVENTURE_DIE_REROLL");
    return modifier?.type === "ADVENTURE_DIE_REROLL" ? modifier.rerolls : undefined;
  }

  it("is printed as an Air spell", () => {
    expect(cardLibrary["spell.fortune"].spellSchools).toEqual(["air"]);
  });

  it("offers Air Magic expert through the shared map boost and spends its printed +3 Power", () => {
    let state = playFortune(["spell.fortune", "ability.air_magic"], "fortune-air");
    expect(state.pendingChoice?.type === "OPTION_CHOICE" && state.pendingChoice.context).toBe("map-spell-boost");
    expect(boostSourceIds(state)).toContain("ability.air_magic");
    state = apply(state, {
      type: "CHOOSE_OPTION",
      playerId: "p1",
      choiceId: state.pendingChoice!.id,
      optionIndex: 0
    });
    // Observable outcome: expert Power 3 reaches the top 3-reroll tier.
    expect(rerollBudget(state)).toBe(3);
    expect(state.players.p1.hand).not.toContain("ability.air_magic");
  });

  it("CONTROL — Fire Magic is refused on Fortune, which resolves at Power 0", () => {
    const state = playFortune(["spell.fortune", "ability.fire_magic"], "fortune-fire");
    expect(state.pendingChoice).toBeNull(); // no payable source -> no boost window
    expect(rerollBudget(state)).toBe(1); // Power 0
    expect(state.players.p1.hand).toContain("ability.fire_magic");
  });
});
