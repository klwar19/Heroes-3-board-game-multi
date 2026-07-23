import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createAdventureLobbyState,
  getLegalActions,
  makeCombatUnitFromArmy,
  NEUTRAL_DECK_IDS
} from "./index";
import {
  estatesGold,
  specialtyTransformHealth,
  unitSideRuleOverrides,
  wisdomGoldDiscount
} from "./ruleset";
import { HOUSE_RULES, houseRuleDefaultFor, houseRuleEnabled, resolveHouseRules } from "./house-rules";
import type { GameAction, GameState, HouseRuleId } from "./state";

// ---------------------------------------------------------------------------
// Individual house-rule toggles. Historically the BINH tweaks were one bundle
// switched by ruleset; now each is its own on/off flag. Every test below drives
// the SAME production path the game uses (the resolver reading the frozen
// adventure.houseRules map, then the gated helper/builder) and asserts the
// OBSERVABLE result, with the opposite toggle as the control. Remove any gate
// and its assertion diverges from its control and fails.
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

/** A BINH adventure with the given individual house-rule overrides frozen in. */
function binhWith(houseRules: Partial<Record<HouseRuleId, boolean>>, seed = "house-rules"): GameState {
  return createAdventureGameState({
    seed,
    ruleset: "binh",
    rollFirstPlayer: false,
    houseRules,
    players: [
      { id: "p1", name: "Gelu", factionId: "rampart", heroDefId: "gelu" },
      { id: "p2", name: "Catherine", factionId: "castle", heroDefId: "catherine" }
    ]
  });
}

// ===========================================================================
// Registry + resolver
// ===========================================================================

describe("house-rule resolver", () => {
  it("uses each registry default in BINH and keeps every rule OFF in Legacy", () => {
    const binh = resolveHouseRules({ ruleset: "binh" });
    const legacy = resolveHouseRules({ ruleset: "legacy" });
    for (const def of HOUSE_RULES) {
      expect(binh[def.id], `${def.id} uses its declared BINH default`).toBe(def.default);
      expect(legacy[def.id], `${def.id} defaults OFF in Legacy`).toBe(false);
      expect(houseRuleDefaultFor("binh", def.id)).toBe(def.default);
      expect(houseRuleDefaultFor("legacy", def.id)).toBe(false);
    }
    expect(binh["polish-spell-book"], "Polish variants are opt-in under BINH too").toBe(false);
    expect(binh["polish-bank-sizes"], "Polish variants are opt-in under BINH too").toBe(false);
    expect(binh["polish-unit-stacks"], "Polish variants are opt-in under BINH too").toBe(false);
    expect(binh["polish-reduced-starting-bonus"], "Polish variants are opt-in under BINH too").toBe(false);
    expect(binh["polish-rule-111"], "Polish variants are opt-in under BINH too").toBe(false);
    expect(binh["polish-reduced-surrender"], "Polish variants are opt-in under BINH too").toBe(false);
    expect(binh["polish-random-artifacts"], "Polish variants are opt-in under BINH too").toBe(false);
    expect(binh["polish-pandora-search"], "Polish variants are opt-in under BINH too").toBe(false);
    expect(binh["polish-wait"], "Polish variants are opt-in under BINH too").toBe(false);
  });

  it("lets explicit flags override defaults in BINH and soft Legacy", () => {
    const binhOff = resolveHouseRules({ ruleset: "binh", houseRules: { "estates-nerf": false } });
    expect(binhOff["estates-nerf"]).toBe(false);
    expect(binhOff["griffin-buff"], "untouched rules keep the mode default").toBe(true);

    // Soft Legacy: an explicit override re-enables a rule after the preset.
    const legacyOn = resolveHouseRules({ ruleset: "legacy", houseRules: { "griffin-buff": true } });
    expect(legacyOn["griffin-buff"], "explicit Legacy override is honored").toBe(true);
    expect(legacyOn["estates-nerf"], "untouched rules keep the mode default (off)").toBe(false);
  });

  it("reads frozen house-rule flags even when the ruleset label is Legacy", () => {
    const state = binhWith({ "griffin-buff": true });
    state.ruleset = "legacy";
    expect(state.adventure?.houseRules?.["griffin-buff"]).toBe(true);
    expect(houseRuleEnabled(state, "griffin-buff")).toBe(true);
  });

  it("Legacy preset clears overrides (all off) but lets a later toggle re-enable a rule", () => {
    let state = createAdventureLobbyState({ seed: "legacy-house-rule-soft" });
    // Switching to Legacy alone clears overrides → every rule defaults off.
    state = applyOk(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p1",
      options: { ruleset: "legacy" }
    });
    expect(state.setupLobby?.options.ruleset).toBe("legacy");
    expect(state.setupLobby?.options.houseRules).toBeUndefined();
    expect(state.setupLobby?.options.spellBook).toBe(false);
    for (const enabled of Object.values(resolveHouseRules(state.setupLobby!.options))) {
      expect(enabled).toBe(false);
    }

    // Soft lock: a later multiplayer toggle re-enables a single rule.
    state = applyOk(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p2",
      options: { houseRules: { "split-decks": true } }
    });
    expect(state.setupLobby?.options.houseRules?.["split-decks"]).toBe(true);
    expect(resolveHouseRules(state.setupLobby!.options)["split-decks"]).toBe(true);
    expect(resolveHouseRules(state.setupLobby!.options)["griffin-buff"]).toBe(false);

    state = applyOk(state, {
      type: "SET_GAME_OPTIONS",
      playerId: "p2",
      options: { ruleset: "binh" }
    });
    const binhRules = resolveHouseRules(state.setupLobby!.options);
    for (const def of HOUSE_RULES) {
      expect(binhRules[def.id]).toBe(def.default);
    }
    expect(state.setupLobby?.options.spellBook).toBe(true);
  });

  it("freezes the resolved booleans onto adventure state and reads them back", () => {
    const state = binhWith({ "griffin-buff": false });
    expect(state.adventure?.houseRules?.["griffin-buff"]).toBe(false);
    expect(houseRuleEnabled(state, "griffin-buff")).toBe(false);
    expect(houseRuleEnabled(state, "marksman-buff"), "sibling toggle untouched").toBe(true);
  });
});

// ===========================================================================
// Unit-stat buffs: griffin-buff, marksman-buff
// ===========================================================================

describe("griffin-buff toggle", () => {
  const fewGriffin = { id: "g", unitDefId: "castle.griffins", side: "few" as const };
  const packGriffin = { id: "g", unitDefId: "castle.griffins", side: "pack" as const };

  it("ON: Few Griffins fight at 3 Attack, Pack Griffins at 1 Defense", () => {
    const state = binhWith({ "griffin-buff": true });
    const overrides = unitSideRuleOverrides(state);
    const few = makeCombatUnitFromArmy(fewGriffin, "p1", "u1", 0, "binh", overrides)!;
    const pack = makeCombatUnitFromArmy(packGriffin, "p1", "u2", 1, "binh", overrides)!;
    expect(few.attack).toBe(3);
    expect(pack.defense).toBe(1);
  });

  it("OFF: Griffins fight at their printed 2 Attack / 0 Defense (control)", () => {
    const state = binhWith({ "griffin-buff": false });
    const overrides = unitSideRuleOverrides(state);
    const few = makeCombatUnitFromArmy(fewGriffin, "p1", "u1", 0, "binh", overrides)!;
    const pack = makeCombatUnitFromArmy(packGriffin, "p1", "u2", 1, "binh", overrides)!;
    expect(few.attack).toBe(2);
    expect(pack.defense).toBe(0);
  });
});

describe("phoenix-pack-rebirth toggle", () => {
  const packPhoenix = { id: "ph", unitDefId: "conflux.phoenixes", side: "pack" as const };
  const fewPhoenix = { id: "phf", unitDefId: "conflux.phoenixes", side: "few" as const };

  it("ON: Pack Phoenixes carry phoenix-rebirth (house rule)", () => {
    const state = binhWith({ "phoenix-pack-rebirth": true });
    const unit = makeCombatUnitFromArmy(packPhoenix, "p1", "u1", 0, "binh", unitSideRuleOverrides(state))!;
    expect(unit.abilities).toContain("phoenix-rebirth");
  });

  it("OFF: Pack Phoenixes have NO rebirth — only line attack + fire immunity (control)", () => {
    const state = binhWith({ "phoenix-pack-rebirth": false });
    const unit = makeCombatUnitFromArmy(packPhoenix, "p1", "u1", 0, "binh", unitSideRuleOverrides(state))!;
    expect(unit.abilities).not.toContain("phoenix-rebirth");
    expect(unit.abilities).toEqual(["dragon-line-attack-2", "phoenix-fire-immunity"]);
  });

  it("Few Phoenixes always have Rebirth regardless of the Pack toggle", () => {
    const off = binhWith({ "phoenix-pack-rebirth": false });
    const few = makeCombatUnitFromArmy(fewPhoenix, "p1", "u1", 0, "binh", unitSideRuleOverrides(off))!;
    expect(few.abilities).toContain("phoenix-rebirth");
  });
});

describe("marksman-buff toggle", () => {
  const packMarksmen = { id: "m", unitDefId: "castle.marksmen", side: "pack" as const };

  it("ON: Pack Marksmen fight with 3 Health", () => {
    const state = binhWith({ "marksman-buff": true });
    const unit = makeCombatUnitFromArmy(packMarksmen, "p1", "u1", 0, "binh", unitSideRuleOverrides(state))!;
    expect(unit.maxHealth).toBe(3);
  });

  it("OFF: Pack Marksmen fight with the printed 2 Health (control)", () => {
    const state = binhWith({ "marksman-buff": false });
    const unit = makeCombatUnitFromArmy(packMarksmen, "p1", "u1", 0, "binh", unitSideRuleOverrides(state))!;
    expect(unit.maxHealth).toBe(2);
  });

  it("the two unit toggles are independent (Griffin off, Marksman on)", () => {
    const state = binhWith({ "griffin-buff": false, "marksman-buff": true });
    const overrides = unitSideRuleOverrides(state);
    const griffin = makeCombatUnitFromArmy(
      { id: "g", unitDefId: "castle.griffins", side: "few" },
      "p1",
      "u1",
      0,
      "binh",
      overrides
    )!;
    const marksmen = makeCombatUnitFromArmy(packMarksmen, "p1", "u2", 1, "binh", overrides)!;
    expect(griffin.attack, "griffin buff off").toBe(2);
    expect(marksmen.maxHealth, "marksman buff on").toBe(3);
  });
});

// ===========================================================================
// Ability-value tweaks: estates-nerf, wisdom-expert-discount, sandro-skeleton-hp
// ===========================================================================

describe("estates-nerf toggle", () => {
  it("ON: Estates gains 2 / 4 gold", () => {
    const state = binhWith({ "estates-nerf": true });
    const on = houseRuleEnabled(state, "estates-nerf");
    expect(estatesGold("binh", "basic", on)).toBe(2);
    expect(estatesGold("binh", "expert", on)).toBe(4);
  });

  it("OFF: Estates gains the printed 3 / 6 gold (control)", () => {
    const state = binhWith({ "estates-nerf": false });
    const on = houseRuleEnabled(state, "estates-nerf");
    expect(estatesGold("binh", "basic", on)).toBe(3);
    expect(estatesGold("binh", "expert", on)).toBe(6);
  });
});

describe("wisdom-expert-discount toggle", () => {
  it("ON: expert Wisdom takes 3 gold off (basic stays 2)", () => {
    const state = binhWith({ "wisdom-expert-discount": true });
    const on = houseRuleEnabled(state, "wisdom-expert-discount");
    expect(wisdomGoldDiscount("binh", "expert", on)).toBe(3);
    expect(wisdomGoldDiscount("binh", "basic", on)).toBe(2);
  });

  it("OFF: expert Wisdom takes the printed 2 gold off (control)", () => {
    const state = binhWith({ "wisdom-expert-discount": false });
    const on = houseRuleEnabled(state, "wisdom-expert-discount");
    expect(wisdomGoldDiscount("binh", "expert", on)).toBe(2);
  });
});

describe("sandro-skeleton-hp toggle", () => {
  it("ON: Horde / Legion of Skeletons transform to 3 Health", () => {
    const state = binhWith({ "sandro-skeleton-hp": true });
    const on = houseRuleEnabled(state, "sandro-skeleton-hp");
    expect(specialtyTransformHealth("binh", "specialty.sandro.1", 2, on)).toBe(3);
    expect(specialtyTransformHealth("binh", "specialty.sandro.6", 2, on)).toBe(3);
  });

  it("OFF: the skeleton upgrades keep the printed 2 Health (control)", () => {
    const state = binhWith({ "sandro-skeleton-hp": false });
    const on = houseRuleEnabled(state, "sandro-skeleton-hp");
    expect(specialtyTransformHealth("binh", "specialty.sandro.1", 2, on)).toBe(2);
    expect(specialtyTransformHealth("binh", "specialty.sandro.6", 2, on)).toBe(2);
  });
});

// ===========================================================================
// Split Spell & Artifact decks
// ===========================================================================

describe("split-decks toggle", () => {
  it("ON: builds the Basic/Expert Spell and Minor/Major/Relic Artifact decks", () => {
    const state = binhWith({ "split-decks": true });
    expect(state.decks["spells"], "basic spell deck").toBeTruthy();
    expect(state.decks["spells-expert"], "expert spell deck").toBeTruthy();
    expect(state.decks["artifacts-minor"]).toBeTruthy();
    expect(state.decks["artifacts-major"]).toBeTruthy();
    expect(state.decks["artifacts-relic"]).toBeTruthy();
    expect(state.decks["artifacts"], "no single artifact deck").toBeUndefined();
  });

  it("OFF: builds one shared Spell deck and one Artifact deck (control)", () => {
    const state = binhWith({ "split-decks": false });
    expect(state.decks["spells"], "single spell deck").toBeTruthy();
    expect(state.decks["spells-expert"], "no expert spell deck").toBeUndefined();
    expect(state.decks["artifacts"], "single artifact deck").toBeTruthy();
    expect(state.decks["artifacts-minor"]).toBeUndefined();
    expect(state.decks["artifacts-major"]).toBeUndefined();
    expect(state.decks["artifacts-relic"]).toBeUndefined();
  });

  it("soft Legacy honors an explicit split-decks override (and Spell Book opt-in)", () => {
    const state = createAdventureGameState({
      seed: "legacy-split-override",
      ruleset: "legacy",
      rollFirstPlayer: false,
      houseRules: { "split-decks": true },
      spellBook: true
    });
    expect(state.adventure?.houseRules?.["split-decks"]).toBe(true);
    expect(state.adventure?.spellBook).toBe(true);
    expect(state.decks.spells).toBeTruthy();
    expect(state.decks["spells-expert"]).toBeTruthy();
    expect(state.decks["artifacts-minor"]).toBeTruthy();
  });
});

// ===========================================================================
// Gelu IV Sharpshooter buff
// ===========================================================================

function findGeluRecruit(state: GameState) {
  return getLegalActions(state, "p1").find(
    (legal) =>
      legal.action.type === "PLAY_CARD" &&
      legal.action.cardId === "specialty.gelu.4" &&
      legal.action.optionIndex === 0
  );
}

/** Recruit the Sharpshooters via Gelu IV under the given toggle value. */
function recruitViaGelu(geluBuff: boolean): GameState {
  const state = binhWith({ "gelu-sharpshooter-buff": geluBuff }, `gelu-toggle-${geluBuff}`);
  for (const pl of Object.values(state.players)) {
    pl.canMulligan = false;
    pl.needsHandRefresh = false;
  }
  state.activePlayerId = "p1";
  state.pendingChoice = null;
  state.reactionWindow = null;
  state.players.p1.hand = ["specialty.gelu.4"];
  state.players.p1.army = [{ id: "army_elves", unitDefId: "rampart.elves", side: "pack" }];
  expect(state.decks[NEUTRAL_DECK_IDS.silver].drawPile).toContain("neutral.sharpshooters");
  const recruit = findGeluRecruit(state);
  expect(recruit, "the Elves→Sharpshooters trade is offered").toBeTruthy();
  return applyOk(state, recruit!.action);
}

describe("gelu-sharpshooter-buff toggle", () => {
  it("ON: the recruited Sharpshooters carries a permanent +1 Attack and fights at base + 1", () => {
    const after = recruitViaGelu(true);
    const card = after.players.p1.army.find((unit) => unit.unitDefId === "neutral.sharpshooters")!;
    expect(card.permanentAttackBonus).toBe(1);
    const buffed = makeCombatUnitFromArmy(card, "p1", "u", 0, "binh")!;
    const plain = makeCombatUnitFromArmy(
      { id: "plain", unitDefId: "neutral.sharpshooters", side: "neutral" },
      "p1",
      "p",
      1,
      "binh"
    )!;
    expect(buffed.attack).toBe(plain.attack + 1);
  });

  it("OFF: the recruit is a plain Sharpshooters — no buff, fights at base (control)", () => {
    const after = recruitViaGelu(false);
    const card = after.players.p1.army.find((unit) => unit.unitDefId === "neutral.sharpshooters")!;
    expect(card.permanentAttackBonus).toBeUndefined();
    const recruited = after.eventLog.filter(
      (event) => event.type === "UNIT_RECRUITED" && event.unitDefId === "neutral.sharpshooters"
    );
    expect(recruited.length).toBe(1);
    expect(recruited[0].type === "UNIT_RECRUITED" && recruited[0].attackBuff, "no BUFF flag on the event").toBeFalsy();
    const built = makeCombatUnitFromArmy(card, "p1", "u", 0, "binh")!;
    const plain = makeCombatUnitFromArmy(
      { id: "plain", unitDefId: "neutral.sharpshooters", side: "neutral" },
      "p1",
      "p",
      1,
      "binh"
    )!;
    expect(built.attack).toBe(plain.attack);
  });
});
