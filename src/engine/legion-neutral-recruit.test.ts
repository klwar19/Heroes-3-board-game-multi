import { describe, expect, it } from "vitest";
import { coreUnitDefinitions } from "@/data/factions/units";
import { applyAction, createAdventureGameState } from "./index";
import {
  beginFieldVisit,
  elementalConfluxCandidates,
  getMainHero,
  heldRecruitDiscountCards,
  legionDiscountTargets,
  neutralRecruitCost,
  openNeutralRecruitOffer,
  NEUTRAL_DECK_IDS
} from "./adventure";
import { openDiplomacyRecruit, resolveDiplomacyRecruitChoice, resolveVisitStep } from "./adventure-reducer";
import { getPlayerView } from "./player-view";
import type { GameAction, GameState, MapFieldState, PlayerId, RecruitDiscountVoucher } from "./state";

// ---------------------------------------------------------------------------
// Legion vouchers on NEUTRAL-Unit recruits (reported bug, 2026-08-03)
//
// "Elemental Conflux map location did not allow me to use the Legion piece in my
// hand to reduce the cost of the recruited unit. Actually ALL Legion artifacts
// should give the option to reduce cost when recruiting NEUTRAL units (like
// Elemental Conflux or Diplomacy or more...)."
//
// Every surface that recruits a Neutral Unit card for its PRINTED cost now
// prices through ONE seam — `neutralRecruitCost` (adventure.ts) — so a banked
// Legion voucher lowers the offer LABEL and the gold actually charged, and the
// voucher is spent by `consumeRecruitVoucherFor` once the unit joins the army.
//
// A field visit blocks every hand-card play, and the walk that opens the visit
// wipes any pre-banked voucher (movement is the bank's expiry seam), so the
// shared NEUTRAL_RECRUIT_MENU also offers a HELD Legion piece INLINE — the only
// way the discount is reachable at such a surface.
//
// The special offers that print their own price and deliberately fold no
// voucher (Pandora's half-cost recruits, settlement capture, the Necromancy /
// Hill Fort banks, the Polish Unit-Stack offers) are unchanged — CONTROL below.
// ---------------------------------------------------------------------------

function makeGame(): GameState {
  return createAdventureGameState({
    startingBuildings: [],
    seed: "legion-neutral-seed",
    difficulty: "normal",
    rollFirstPlayer: false
  });
}

function apply(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toHaveLength(0);
  return result.state;
}

function refreshP1(state: GameState): GameState {
  return state.players.p1.needsHandRefresh || state.players.p1.canMulligan
    ? apply(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] })
    : state;
}

/** Banks a Legion voucher exactly as the BANK_RECRUIT_DISCOUNT step does. */
function bankVoucher(
  state: GameState,
  playerId: PlayerId,
  cardId: string,
  amount: number,
  target: RecruitDiscountVoucher["target"]
): void {
  const player = state.players[playerId];
  player.recruitDiscounts = [...(player.recruitDiscounts ?? []), { cardId, amount, target }];
}

function injectField(state: GameState, location: string): MapFieldState {
  const field = {
    spaceId: "60,60",
    tileInstanceId: "neutral-recruit-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  } as MapFieldState;
  state.adventure!.fields[field.spaceId] = field;
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return field;
}

/** The option labels of the CHOOSE_ONE at the head of the open visit. */
function visitOptionLabels(state: GameState): string[] {
  const step = state.adventure!.pendingVisit?.steps[0];
  if (step?.type !== "CHOOSE_ONE") {
    throw new Error(`Expected an open CHOOSE_ONE, got ${step?.type ?? "no pending visit"}`);
  }
  return step.options.map((option) => option.label);
}

/** Resolves the open visit CHOOSE_ONE by matching an option label. */
function chooseVisit(state: GameState, match: (label: string) => boolean): void {
  const labels = visitOptionLabels(state);
  const optionIndex = labels.findIndex((label) => match(label));
  if (optionIndex < 0) {
    throw new Error(`No option matched among: ${labels.join(" | ")}`);
  }
  resolveVisitStep(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex });
}

/** A p1 turn standing on an Elemental Conflux with a Bronze Dwelling built. */
function setupConflux(): { state: GameState; unitDefId: string; printedGold: number } {
  const state = refreshP1(makeGame());
  state.players.p1.resources.gold = 40;
  const town = state.towns.town_p1;
  town.buildings = [...new Set([...town.buildings, "castle.dwelling_bronze"])];
  injectField(state, "elemental_conflux");
  const candidates = elementalConfluxCandidates(state, "p1");
  expect(candidates.length, "a Bronze Dwelling should offer one Elementals card").toBeGreaterThan(0);
  const unitDefId = candidates[0]!.unitDefId;
  const printedGold = coreUnitDefinitions[unitDefId]!.neutral!.cost.gold ?? 0;
  expect(printedGold, "the Conflux candidate must cost gold for a discount to be observable").toBeGreaterThan(0);
  return { state, unitDefId, printedGold };
}

/** A p1 turn with a Bronze Dwelling and a stacked bronze Neutral deck. */
function setupKnownBronzeDraw(unitDefId: string): GameState {
  const state = refreshP1(makeGame());
  state.players.p1.resources.gold = 40;
  const town = state.towns.town_p1;
  town.buildings = [...new Set([...town.buildings, "castle.dwelling_bronze"])];
  state.decks[NEUTRAL_DECK_IDS.bronze].drawPile = [unitDefId];
  return state;
}

/** The open Diplomacy recruit OPTION_CHOICE, narrowed. */
function diplomacyChoice(state: GameState): { context?: string; options: { label: string }[] } {
  const choice = state.pendingChoice;
  if (!choice || choice.type !== "OPTION_CHOICE") {
    throw new Error(`Expected an OPTION_CHOICE, got ${choice?.type ?? "none"}`);
  }
  return choice;
}

const AIR_ELEMENTALS = "neutral.air_elementals";
const AIR_GOLD = coreUnitDefinitions[AIR_ELEMENTALS]!.neutral!.cost.gold ?? 0;

describe("Legion vouchers on Neutral-Unit recruits — Elemental Conflux", () => {
  it("a BANKED voucher lowers the label AND the gold charged, and is spent", () => {
    const { state, unitDefId, printedGold } = setupConflux();
    bankVoucher(state, "p1", "artifact.torso_of_legion", 6, { kind: "recruit", unitDefId });
    const goldBefore = state.players.p1.resources.gold;

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "60,60", false);

    // The label the player reads must be the price they pay.
    const discounted = Math.max(0, printedGold - 6);
    expect(visitOptionLabels(state).some((label) => label.includes(`${discounted} gold`))).toBe(true);

    chooseVisit(state, (label) => label.startsWith("Recruit"));

    expect(state.players.p1.army.some((unit) => unit.unitDefId === unitDefId && unit.side === "neutral")).toBe(true);
    expect(state.players.p1.resources.gold).toBe(goldBefore - discounted);
    // Single-use: the voucher is gone whether or not it was the winning source.
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });

  it("CONTROL — the same recruit with NO voucher charges the full printed cost", () => {
    const { state, unitDefId, printedGold } = setupConflux();
    const goldBefore = state.players.p1.resources.gold;

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "60,60", false);
    expect(visitOptionLabels(state).some((label) => label.includes(`${printedGold} gold`))).toBe(true);
    chooseVisit(state, (label) => label.startsWith("Recruit"));

    expect(state.players.p1.army.some((unit) => unit.unitDefId === unitDefId)).toBe(true);
    expect(state.players.p1.resources.gold).toBe(goldBefore - printedGold);
  });

  it("the reported flow — a Legion piece still IN HAND is playable inside the visit", () => {
    const { state, unitDefId, printedGold } = setupConflux();
    state.players.p1.hand = ["artifact.torso_of_legion"];
    state.players.p1.discard = [];
    const goldBefore = state.players.p1.resources.gold;

    // The piece is genuinely playable-from-hand as far as the ledger is concerned.
    expect(heldRecruitDiscountCards(state, "p1").map((piece) => piece.cardId)).toContain(
      "artifact.torso_of_legion"
    );

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "60,60", false);

    // No hand-card play is legal inside an open visit, so the piece is offered
    // inline instead — this option IS the fix for the reported bug.
    expect(
      visitOptionLabels(state).some(
        (label) =>
          label.startsWith("Play Torso of Legion (−6 gold)") && label.includes(`${printedGold - 6} gold`)
      )
    ).toBe(true);

    chooseVisit(state, (label) => label.startsWith("Play Torso of Legion"));

    // The piece really left the hand (played to the discard, voucher banked) and
    // the menu re-opened at the reduced price.
    expect(state.players.p1.hand).not.toContain("artifact.torso_of_legion");
    expect(state.players.p1.discard).toContain("artifact.torso_of_legion");
    expect(state.players.p1.legionDiscountCardIdsUsed).toContain("artifact.torso_of_legion");
    expect(visitOptionLabels(state).some((label) => label.includes(`${printedGold - 6} gold`))).toBe(true);

    chooseVisit(state, (label) => label.startsWith("Recruit"));

    expect(state.players.p1.army.some((unit) => unit.unitDefId === unitDefId && unit.side === "neutral")).toBe(true);
    expect(state.players.p1.resources.gold).toBe(goldBefore - (printedGold - 6));
  });

  it("CONTROL — with no Legion piece in hand the Conflux offers no inline discount at all", () => {
    const { state } = setupConflux();
    state.players.p1.hand = ["stat.attack"];
    beginFieldVisit(state, getMainHero(state, "p1")!.id, "60,60", false);
    expect(visitOptionLabels(state).some((label) => label.startsWith("Play "))).toBe(false);
  });

  it("two DISTINCT pieces played inline STACK by addition", () => {
    const { state, unitDefId, printedGold } = setupConflux();
    state.players.p1.hand = ["artifact.torso_of_legion", "artifact.legs_of_legion"];
    state.players.p1.discard = [];
    const goldBefore = state.players.p1.resources.gold;

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "60,60", false);
    chooseVisit(state, (label) => label.startsWith("Play Torso of Legion"));
    chooseVisit(state, (label) => label.startsWith("Play Legs of Legion"));
    chooseVisit(state, (label) => label.startsWith("Recruit"));

    // 6 + 4 ADDED (the unified pipeline), floored at 0.
    expect(state.players.p1.resources.gold).toBe(goldBefore - Math.max(0, printedGold - 10));
    expect(state.players.p1.army.some((unit) => unit.unitDefId === unitDefId)).toBe(true);
  });

  it("the SAME piece can never bank twice — its inline offer disappears after one use", () => {
    const { state } = setupConflux();
    state.players.p1.hand = ["artifact.torso_of_legion"];
    state.players.p1.discard = [];

    beginFieldVisit(state, getMainHero(state, "p1")!.id, "60,60", false);
    chooseVisit(state, (label) => label.startsWith("Play Torso of Legion"));
    expect(visitOptionLabels(state).some((label) => label.startsWith("Play Torso of Legion"))).toBe(false);

    // Even handed straight back (Scholar-style recovery) it stays spent.
    state.players.p1.hand.push("artifact.torso_of_legion");
    expect(heldRecruitDiscountCards(state, "p1")).toHaveLength(0);
  });

  // The map Legion "pick a unit" prompt is DELIBERATELY not extended with the
  // Neutral deck: a voucher banked in advance is useless at every neutral
  // recruit surface (see the NOTE in legionDiscountTargets), and listing them
  // flooded the prompt with the whole Neutral deck plus a second, ambiguous
  // "Recruit Marksmen" entry (most faction creatures have a Neutral twin card).
  it("the map Legion pick prompt lists NO Neutral-deck cards (the inline offer is the mechanism)", () => {
    const { state } = setupConflux();
    const targets = legionDiscountTargets(state, "p1");
    expect(targets.length, "the town roster/army targets are still offered").toBeGreaterThan(0);
    expect(
      targets.filter((target) => target.purchase.unitDefId.startsWith("neutral.")),
      "no Neutral-deck card may be a pre-bankable target"
    ).toHaveLength(0);
    // …and no creature name is offered twice, which is what the flood caused.
    const names = targets.map((target) => `${target.purchase.kind}:${target.unitName}`);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("Legion vouchers on Neutral-Unit recruits — Diplomacy", () => {
  it("a BANKED voucher lowers the drawn unit's label AND the gold charged, and is spent", () => {
    const state = setupKnownBronzeDraw(AIR_ELEMENTALS);
    bankVoucher(state, "p1", "artifact.legs_of_legion", 4, {
      kind: "recruit",
      unitDefId: AIR_ELEMENTALS
    });

    openDiplomacyRecruit(state, "p1", 1);
    const choice = diplomacyChoice(state);
    expect(choice.context).toBe("diplomacy-recruit");
    expect(choice.options[0]!.label).toContain(`${AIR_GOLD - 4} gold`);

    resolveDiplomacyRecruitChoice(state, "p1", 0);

    expect(
      state.players.p1.army.some((unit) => unit.unitDefId === AIR_ELEMENTALS && unit.side === "neutral")
    ).toBe(true);
    expect(state.players.p1.resources.gold).toBe(40 - (AIR_GOLD - 4));
    expect(state.players.p1.recruitDiscounts ?? []).toHaveLength(0);
  });

  it("CONTROL — the same Diplomacy recruit with NO voucher charges the full printed cost", () => {
    const state = setupKnownBronzeDraw(AIR_ELEMENTALS);

    openDiplomacyRecruit(state, "p1", 1);
    expect(diplomacyChoice(state).options[0]!.label).toContain(`${AIR_GOLD} gold`);
    resolveDiplomacyRecruitChoice(state, "p1", 0);

    expect(state.players.p1.resources.gold).toBe(40 - AIR_GOLD);
  });

  it("a Legion piece in HAND is offered INLINE (the drawn card is random, so it cannot be pre-banked)", () => {
    const state = setupKnownBronzeDraw(AIR_ELEMENTALS);
    state.players.p1.hand = ["artifact.torso_of_legion"];
    state.players.p1.discard = [];

    openDiplomacyRecruit(state, "p1", 1);
    const opened = diplomacyChoice(state);
    // The inline offers are appended LAST so every pre-existing index (recruit,
    // then "Recruit none") keeps its meaning.
    expect(opened.options[0]!.label).toContain(`${AIR_GOLD} gold`);
    expect(opened.options[1]!.label).toBe("Recruit none");
    expect(opened.options[2]!.label).toBe(
      `Play Torso of Legion (−6 gold) toward Air Elementals — then ${AIR_GOLD - 6} gold`
    );

    // Taking it discards the piece, banks the voucher and RE-OPENS the choice.
    resolveDiplomacyRecruitChoice(state, "p1", 2);
    expect(state.players.p1.hand).not.toContain("artifact.torso_of_legion");
    expect(state.players.p1.discard).toContain("artifact.torso_of_legion");
    const reopened = diplomacyChoice(state);
    expect(reopened.options[0]!.label).toContain(`${AIR_GOLD - 6} gold`);
    // The same piece is not offered again, and no card was returned to the deck.
    expect(reopened.options.some((option) => option.label.startsWith("Play "))).toBe(false);
    expect(state.decks[NEUTRAL_DECK_IDS.bronze].discardPile).not.toContain(AIR_ELEMENTALS);

    resolveDiplomacyRecruitChoice(state, "p1", 0);
    expect(
      state.players.p1.army.some((unit) => unit.unitDefId === AIR_ELEMENTALS && unit.side === "neutral")
    ).toBe(true);
    expect(state.players.p1.resources.gold).toBe(40 - (AIR_GOLD - 6));
  });

  it("CONTROL — with no Legion piece in hand the Diplomacy choice has no inline offer and no payload", () => {
    const state = setupKnownBronzeDraw(AIR_ELEMENTALS);
    state.players.p1.hand = ["stat.attack"];

    openDiplomacyRecruit(state, "p1", 1);
    const choice = diplomacyChoice(state);
    expect(choice.options.some((option) => option.label.startsWith("Play "))).toBe(false);
    expect(choice.options).toHaveLength(2);
  });

  it("the inline Legion labels are MASKED for other seats (they name private hand cards)", () => {
    const state = setupKnownBronzeDraw(AIR_ELEMENTALS);
    state.players.p1.hand = ["artifact.torso_of_legion"];
    openDiplomacyRecruit(state, "p1", 1);

    const own = getPlayerView(state, "p1").pendingChoice;
    expect(own?.type === "OPTION_CHOICE" && own.options[2]!.label).toContain("Torso of Legion");

    const other = getPlayerView(state, "p2").pendingChoice;
    if (other?.type !== "OPTION_CHOICE") {
      throw new Error("expected the opponent to see the open choice");
    }
    // The public recruit/decline labels stay readable; only the hand-card ones go.
    expect(other.options[0]!.label).toContain("Air Elementals");
    expect(other.options[2]!.label).toBe("Play a card from hand");
    expect(other.diplomacyRecruit?.legionPlays?.[0]!.cardId).toBe("hidden");
  });
});

describe("Legion vouchers on Neutral-Unit recruits — scope", () => {
  it("Portal of Summoning and the Mercenary Camp Event share the same priced seam", () => {
    // The seam itself is the guarantee (every surface reads neutralRecruitCost),
    // so pin the seam's own arithmetic including the Oidana printed reduction.
    const state = setupKnownBronzeDraw(AIR_ELEMENTALS);
    expect(neutralRecruitCost(state, "p1", AIR_ELEMENTALS)).toEqual({ gold: AIR_GOLD });

    bankVoucher(state, "p1", "artifact.legs_of_legion", 4, {
      kind: "recruit",
      unitDefId: AIR_ELEMENTALS
    });
    expect(neutralRecruitCost(state, "p1", AIR_ELEMENTALS).gold).toBe(AIR_GOLD - 4);
    // Oidana IV's printed −4 gold applies FIRST, then the voucher stacks on it.
    expect(neutralRecruitCost(state, "p1", AIR_ELEMENTALS, 4).gold).toBe(Math.max(0, AIR_GOLD - 8));

    // A voucher reserved for a DIFFERENT unit never bleeds onto this one.
    const other = setupKnownBronzeDraw(AIR_ELEMENTALS);
    bankVoucher(other, "p1", "artifact.legs_of_legion", 4, {
      kind: "recruit",
      unitDefId: "neutral.water_elementals"
    });
    expect(neutralRecruitCost(other, "p1", AIR_ELEMENTALS).gold).toBe(AIR_GOLD);
  });

  it("CONTROL — an EXCLUDED special offer (Pandora's half-cost recruit) is unchanged by a banked voucher", () => {
    function pandoraOffer(withVoucher: boolean): { label: string; goldSpent: number } {
      const state = setupKnownBronzeDraw(AIR_ELEMENTALS);
      injectField(state, "elemental_conflux");
      if (withVoucher) {
        bankVoucher(state, "p1", "artifact.torso_of_legion", 6, {
          kind: "recruit",
          unitDefId: AIR_ELEMENTALS
        });
      }
      state.players.p1.hand = ["artifact.legs_of_legion"];
      openNeutralRecruitOffer(state, "p1", 1, "bronze");
      const label = visitOptionLabels(state).find((entry) => entry.startsWith("Recruit"))!;
      // No inline Legion offer either — a special offer prints its own price.
      expect(visitOptionLabels(state).some((entry) => entry.startsWith("Play "))).toBe(false);
      chooseVisit(state, (entry) => entry.startsWith("Recruit"));
      return { label, goldSpent: 40 - state.players.p1.resources.gold };
    }

    const plain = pandoraOffer(false);
    const banked = pandoraOffer(true);
    // Air Elementals print 7 gold → half rounded up = 4, with OR without a
    // Legion voucher banked for that exact unit ("no Legion voucher folds").
    expect(plain.goldSpent).toBe(Math.ceil(AIR_GOLD / 2));
    expect(banked.goldSpent).toBe(plain.goldSpent);
    expect(banked.label).toBe(plain.label);
  });
});
