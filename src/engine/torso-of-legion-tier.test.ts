import { describe, expect, it } from "vitest";
import { createAdventureGameState, eligibleArtifactDecks, getMainHero } from "./index";
import { blackMarketOffers, grantRegularArtifactOfSameGrade } from "./adventure";
import { ARTIFACT_DECK_MAJOR, ARTIFACT_DECK_MINOR, effectiveArtifactTier } from "./ruleset";
import { TORSO_OF_LEGION_ID } from "@/data/cards/artifacts";
import type { GameRuleset, GameState, HouseRuleId } from "./state";

// ---------------------------------------------------------------------------
// House rule `torso-of-legion-major` (BINH). Torso of Legion is PRINTED Minor
// but BINH plays/sorts it as a MAJOR artifact by default. This is the ONE
// re-tiered card in the game. The rule is ON by default in BOTH modes — every
// existing binh AND legacy game already treats it as Major, so the default (and
// the absent-option snapshot) is byte-identical. Unticking it ("sort normally")
// reads Torso as its Minor tier at every tier chokepoint via
// `effectiveArtifactTier`: deck placement, black-market/junk/event prices, the
// Polish tier gates and deck-return.
//
// Each behaviour below has its opposite toggle as the control — remove the gate
// and the assertion diverges from its control and fails.
// ---------------------------------------------------------------------------

const TORSO = TORSO_OF_LEGION_ID; // "artifact.torso_of_legion"
// A genuinely-Minor sibling (printed and played Minor) used as the grant source.
const MINOR_SOURCE = "artifact.boots_of_speed";

function makeGame(
  overrides: { ruleset?: GameRuleset; houseRules?: Partial<Record<HouseRuleId, boolean>> } = {}
): GameState {
  return createAdventureGameState({
    seed: "torso-tier",
    ruleset: overrides.ruleset ?? "binh",
    rollFirstPlayer: false,
    houseRules: overrides.houseRules,
    players: [
      { id: "p1", name: "Catherine", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Gelu", factionId: "rampart", heroDefId: "gelu" }
    ]
  });
}

/** Whether a deck holds `cardId` in its draw OR discard pile (a card is flipped to discard at setup). */
function deckHas(state: GameState, deckId: string, cardId: string): boolean {
  const deck = state.decks[deckId];
  return Boolean(deck) && (deck!.drawPile.includes(cardId) || deck!.discardPile.includes(cardId));
}

describe("torso-of-legion-major — default ON (byte-identical Major)", () => {
  it("BINH default: Torso is dealt into the Major deck (not the Minor deck) and reads Major", () => {
    const state = makeGame();
    expect(state.adventure?.houseRules?.["torso-of-legion-major"], "rule frozen ON by default").toBe(true);
    expect(deckHas(state, ARTIFACT_DECK_MAJOR, TORSO)).toBe(true);
    expect(deckHas(state, ARTIFACT_DECK_MINOR, TORSO)).toBe(false);
    expect(effectiveArtifactTier(state, TORSO)).toBe("major");
  });

  it("Legacy default also reads Major — the re-tier predates the toggle (byte-identical)", () => {
    const state = makeGame({ ruleset: "legacy" });
    // Legacy uses one combined "artifacts" deck; only the tier READ matters there.
    expect(state.adventure?.houseRules?.["torso-of-legion-major"], "ON in Legacy too").toBe(true);
    expect(deckHas(state, "artifacts", TORSO)).toBe(true);
    expect(effectiveArtifactTier(state, TORSO)).toBe("major");
  });

  it("absent frozen key (legacy/old snapshot) falls back to Major in both modes (CONTROL)", () => {
    const binh = makeGame();
    delete binh.adventure!.houseRules!["torso-of-legion-major"]; // simulate a pre-toggle snapshot
    expect(effectiveArtifactTier(binh, TORSO)).toBe("major");

    const legacy = makeGame({ ruleset: "legacy" });
    delete legacy.adventure!.houseRules!["torso-of-legion-major"];
    expect(effectiveArtifactTier(legacy, TORSO)).toBe("major");
  });
});

describe("torso-of-legion-major OFF — Torso sorts and behaves as its printed Minor", () => {
  it("deals Torso into the Minor deck, not the Major deck, and reads Minor", () => {
    const off = makeGame({ houseRules: { "torso-of-legion-major": false } });
    expect(off.adventure?.houseRules?.["torso-of-legion-major"]).toBe(false);
    expect(deckHas(off, ARTIFACT_DECK_MINOR, TORSO)).toBe(true);
    expect(deckHas(off, ARTIFACT_DECK_MAJOR, TORSO)).toBe(false);
    expect(effectiveArtifactTier(off, TORSO)).toBe("minor");
  });

  it("a below-Major-level hero reaches Torso through the always-open Minor deck (acquire gate)", () => {
    const off = makeGame({ houseRules: { "torso-of-legion-major": false } });
    const hero = getMainHero(off, "p1");
    // Fresh hero: level 1, on the home (Ⅰ) tile, no artifact source → Minor deck only.
    expect(eligibleArtifactDecks(off, "p1", hero, false)).toEqual([ARTIFACT_DECK_MINOR]);
    expect(deckHas(off, ARTIFACT_DECK_MINOR, TORSO), "Torso now sits in the reachable Minor deck").toBe(true);

    // CONTROL: with the rule ON the SAME low-level hero's reachable set is still
    // Minor-only, but Torso now sits in the out-of-reach Major deck.
    const on = makeGame();
    expect(eligibleArtifactDecks(on, "p1", getMainHero(on, "p1"), false)).toEqual([ARTIFACT_DECK_MINOR]);
    expect(deckHas(on, ARTIFACT_DECK_MAJOR, TORSO)).toBe(true);
    expect(deckHas(on, ARTIFACT_DECK_MINOR, TORSO)).toBe(false);
  });

  it("the Black Market prices Torso as Minor (5 gold), not the default Major (7 gold)", () => {
    const off = makeGame({ houseRules: { "torso-of-legion-major": false } });
    off.decks[ARTIFACT_DECK_MINOR]!.discardPile.push(TORSO); // top of the Minor discard → offered
    const offOffer = blackMarketOffers(off).find((offer) => offer.cardId === TORSO);
    expect(offOffer, "Torso is offered on the Black Market").toBeTruthy();
    expect(offOffer!.price).toBe(5); // minor

    // CONTROL: the default (rule ON) prices the same card at the Major 7.
    const on = makeGame();
    on.decks[ARTIFACT_DECK_MAJOR]!.discardPile.push(TORSO);
    const onOffer = blackMarketOffers(on).find((offer) => offer.cardId === TORSO);
    expect(onOffer!.price).toBe(7); // major
  });

  it("grantRegularArtifactOfSameGrade claims Torso for a MINOR grant on the legacy combined deck", () => {
    // This pins the legacy-combined-pile tier filter (a distinct chokepoint from
    // the Black-Market price above). Force the single Artifact deck to just Torso.
    const off = makeGame({ ruleset: "legacy", houseRules: { "torso-of-legion-major": false } });
    off.decks["artifacts"]!.drawPile = [TORSO];
    off.decks["artifacts"]!.discardPile = [];
    // A Minor-tier source: with Torso reading Minor, the same-grade grant claims it.
    expect(grantRegularArtifactOfSameGrade(off, "p1", MINOR_SOURCE)).toBe(TORSO);
    expect(off.players.p1.hand).toContain(TORSO);

    // CONTROL: with the rule ON, Torso reads Major, so a MINOR grant skips it and
    // finds nothing (the pile held only Torso).
    const on = makeGame({ ruleset: "legacy" });
    on.decks["artifacts"]!.drawPile = [TORSO];
    on.decks["artifacts"]!.discardPile = [];
    expect(grantRegularArtifactOfSameGrade(on, "p1", MINOR_SOURCE)).toBeNull();
    expect(on.players.p1.hand).not.toContain(TORSO);
  });
});
