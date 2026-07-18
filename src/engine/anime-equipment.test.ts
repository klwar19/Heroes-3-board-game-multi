import { describe, expect, it } from "vitest";
import {
  applyAction,
  createAdventureGameState,
  createInitialGameState,
  effectiveHandLimit,
  getLegalActions,
  getMainHero,
  getPlayerView,
  standingSpellPower,
  DEFAULT_ANIME_OPTIONS,
  EQUIPMENT_IDS,
  equipmentEnabled,
  heroEquipmentOf,
  playerHasEquipment,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerId
} from "./index";
import { beginFieldVisit, startAdventureRound } from "./adventure";
import { finalizeAdventureCombat, startNeutralEncounter } from "./adventure-reducer";
import { finishCombatIfNeeded } from "./combat-units";
import { scoreMapAction } from "./computer/map-policy";
import { chooseComputerAction } from "./computer/policy";
import { listFieldOverrideDefinitions, fieldOverridePackageAllowed } from "@/data/map/field-overrides";
import { getEquipmentDefinition } from "@/data/anime/equipment";
import { cardLibrary } from "@/data/cards/library";
import type { MapFieldState, PlayerVisibleState } from "./state";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((error) => error.message).join("; ")).toEqual([]);
  return result.state;
}

const EQUIP_ON = { ...DEFAULT_ANIME_OPTIONS, enabled: true, equipment: true };

function adventure(seed: string, anime = EQUIP_ON, extra: Record<string, unknown> = {}): GameState {
  return createAdventureGameState({ seed, difficulty: "normal", rollFirstPlayer: false, anime, ...extra });
}

function startTurn(state: GameState, playerId: PlayerId = "p1"): GameState {
  return state.players[playerId].needsHandRefresh || state.players[playerId].canMulligan
    ? applyOk(state, { type: "REFRESH_HAND", playerId, discardCardIds: [] })
    : state;
}

const FIELD_ID = "50,50";

function injectField(state: GameState, location: string): MapFieldState {
  const field: MapFieldState = {
    spaceId: FIELD_ID,
    tileInstanceId: "eq-tile",
    slot: 0,
    location,
    blackCube: false,
    flagOwnerId: null,
    everFlagged: false,
    settlementResource: null
  };
  state.adventure!.fields[field.spaceId] = field;
  getMainHero(state, "p1")!.spaceId = field.spaceId;
  return field;
}

function visitShop(state: GameState): void {
  beginFieldVisit(state, getMainHero(state, "p1")!.id, FIELD_ID, false);
}

/** Non-retaliation ATTACK_ROLLED attack values, in event order. */
function initiatingAttackValues(state: GameState): number[] {
  return state.eventLog
    .filter((event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED" && !event.isRetaliation)
    .map((event) => event.attackValue);
}

function resolveReactions(state: GameState): GameState {
  let current = state;
  let guard = 60;
  while (current.reactionWindow && guard > 0) {
    guard -= 1;
    current = applyOk(current, { type: "PASS_REACTION", playerId: current.reactionWindow.priorityPlayerId });
  }
  return current;
}

/** A sandbox combat: p1 griffins @9 vs a fat p2 skeletons target, dice all 0. */
function combat(seed: string): GameState {
  const state = createInitialGameState(seed);
  state.anime = { ...EQUIP_ON };
  state.players.p1.hand = [];
  state.players.p2.hand = [];
  state.players.p1.morale = 0;
  state.players.p2.morale = 0;
  const griffins = state.combat!.units.unit_p1_griffins;
  griffins.abilities = [];
  griffins.position = 9;
  griffins.attack = 10;
  state.combat!.activeUnitId = "unit_p1_griffins";
  state.activePlayerId = "p1";
  state.combat!.dice.scriptedRolls = [0, 0, 0, 0, 0, 0, 0, 0];
  const target = state.combat!.units.unit_p2_skeletons;
  target.abilities = [];
  target.defense = 2;
  target.maxHealth = 200;
  target.damage = 0;
  return state;
}

function equip(state: GameState, playerId: PlayerId, slot: "weapon" | "armor" | "accessory", id: string): void {
  const hero = getMainHero(state, playerId)!;
  hero.equipment = { ...(hero.equipment ?? {}), [slot]: id };
}

const EQUIP_ID_SWORD = EQUIPMENT_IDS.ironBloodSword;
const EQUIP_ID_MAIL = EQUIPMENT_IDS.blackTortoiseMail;
const EQUIP_ID_COSMOS = EQUIPMENT_IDS.cosmosPendant;
const EQUIP_ID_BLADE = EQUIPMENT_IDS.adventurersBlade;
const EQUIP_ID_GUILD = EQUIPMENT_IDS.guildIssueMail;
const EQUIP_ID_SATCHEL = EQUIPMENT_IDS.supplySatchel;

// ===========================================================================
// Mode OFF — byte-identical: no pool/palette kinds, no state, refused buys
// ===========================================================================

describe("anime.equipment — module OFF is inert", () => {
  it("the two outfitter kinds appear in NO listing when the module is off (CONTROL: on = present)", () => {
    // ON (equipment): both outfitters join the anime-allowed listing.
    const on = listFieldOverrideDefinitions({
      implementedOnly: true,
      packageAllowed: (pkg) => fieldOverridePackageAllowed(pkg, { animeEnabled: true }),
      moduleEnabled: (module) => module === "equipment"
    }).map((d) => d.id);
    expect(on).toContain("ren_binh_cac");
    expect(on).toContain("adventurer_outfitter");
    expect(on).toContain("bi_canh"); // CONTROL: an ungated base kind is present too

    // OFF (module predicate false): the outfitters drop out; base kinds stay.
    const off = listFieldOverrideDefinitions({
      implementedOnly: true,
      packageAllowed: (pkg) => fieldOverridePackageAllowed(pkg, { animeEnabled: true }),
      moduleEnabled: () => false
    }).map((d) => d.id);
    expect(off).not.toContain("ren_binh_cac");
    expect(off).not.toContain("adventurer_outfitter");
    expect(off).toContain("bi_canh"); // CONTROL: base kind unaffected by the gate
  });

  it("the DESIGNER-palette style listing (no moduleEnabled predicate) also hides the outfitters", () => {
    const palette = listFieldOverrideDefinitions({
      implementedOnly: true,
      package: ["anime-xianxia", "anime-isekai", "shared"]
    }).map((d) => d.id);
    expect(palette).not.toContain("ren_binh_cac");
    expect(palette).not.toContain("adventurer_outfitter");
    // CONTROL: the 11 base anime kinds (no requiresModule) are still listed.
    expect(palette).toContain("bi_canh");
    expect(palette).toContain("capsule_lab");
  });

  it("a module-OFF shop visit builds no equipment menu, and helpers read empty", () => {
    const off = adventure("eq-off", DEFAULT_ANIME_OPTIONS);
    off.players.p1.resources.gold = 20;
    injectField(off, "anime.ren_binh_cac");
    visitShop(off);
    // NONE base + module off ⇒ no steps ⇒ no pending visit at all.
    expect(off.adventure!.pendingVisit).toBeNull();
    expect(equipmentEnabled(off)).toBe(false);
    // A stamped item is ignored by every read when the module is off.
    equip(off, "p1", "accessory", EQUIP_ID_COSMOS);
    expect(heroEquipmentOf(off, "p1")).toEqual({});
    expect(playerHasEquipment(off, "p1", EQUIP_ID_COSMOS)).toBe(false);
    expect(standingSpellPower(off, "p1", cardLibrary["spell.magic_arrow"])).toBe(
      standingSpellPower(adventure("eq-off-base", DEFAULT_ANIME_OPTIONS), "p1", cardLibrary["spell.magic_arrow"])
    );
  });
});

// ===========================================================================
// Buy flow — gold −cost, slot set, replace overwrites, owned/poor gating
// ===========================================================================

describe("anime.equipment — outfitter buy flow", () => {
  function openBlacksmith(gold: number): GameState {
    const state = adventure("eq-buy");
    state.players.p1.resources.gold = gold;
    injectField(state, "anime.ren_binh_cac");
    visitShop(state);
    return state;
  }

  function buyLabelFor(state: GameState, id: string): { optionIndex: number } | undefined {
    const def = getEquipmentDefinition(id)!;
    const legal = getLegalActions(state, "p1");
    const found = legal.find(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && entry.label.includes(def.name.en)
    );
    return found && found.action.type === "RESOLVE_VISIT_STEP" && found.action.optionIndex !== undefined
      ? { optionIndex: found.action.optionIndex }
      : undefined;
  }

  it("buying deducts the gold and sets the slot; the shop offers a Leave exit", () => {
    const state = openBlacksmith(10);
    expect(state.adventure!.pendingVisit, "the outfitter opens a menu").toBeTruthy();
    const leave = getLegalActions(state, "p1").some(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && /leave/i.test(entry.label)
    );
    expect(leave).toBe(true);

    const buy = buyLabelFor(state, EQUIP_ID_SWORD)!;
    const bought = applyOk(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: buy.optionIndex });
    expect(bought.players.p1.resources.gold).toBe(6); // 10 − 4
    expect(heroEquipmentOf(bought, "p1").weapon).toBe(EQUIP_ID_SWORD);
    expect(playerHasEquipment(bought, "p1", EQUIP_ID_SWORD)).toBe(true);
  });

  it("buying into an occupied slot REPLACES (no refund) and emits the equipped event", () => {
    const state = openBlacksmith(20);
    equip(state, "p1", "weapon", EQUIP_ID_SWORD); // already holds a weapon
    // Re-open so the menu re-derives (the sword is now owned so it drops out).
    const reopened = adventure("eq-replace");
    reopened.players.p1.resources.gold = 20;
    equip(reopened, "p1", "accessory", EQUIP_ID_COSMOS); // occupy the accessory slot
    injectField(reopened, "anime.ren_binh_cac");
    visitShop(reopened);
    const buySatchel = buyLabelFor(reopened, EQUIP_ID_SATCHEL)!;
    const bought = applyOk(reopened, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: buySatchel.optionIndex });
    // The accessory slot is overwritten — Cosmos gone, Satchel in, gold −5, no refund.
    expect(heroEquipmentOf(bought, "p1").accessory).toBe(EQUIP_ID_SATCHEL);
    expect(playerHasEquipment(bought, "p1", EQUIP_ID_COSMOS)).toBe(false);
    expect(bought.players.p1.resources.gold).toBe(15); // 20 − 5, no refund for Cosmos
    expect(bought.eventLog.some((event) => event.type === "EQUIPMENT_EQUIPPED")).toBe(true);
  });

  it("an already-owned item is ABSENT from the menu (option not built)", () => {
    const state = adventure("eq-owned");
    state.players.p1.resources.gold = 20;
    equip(state, "p1", "weapon", EQUIP_ID_SWORD);
    injectField(state, "anime.ren_binh_cac");
    visitShop(state);
    expect(buyLabelFor(state, EQUIP_ID_SWORD)).toBeUndefined();
    // CONTROL: an unowned item at the same shop is still offered.
    expect(buyLabelFor(state, EQUIP_ID_MAIL)).toBeTruthy();
  });

  it("a poor hero's unaffordable item is ABSENT from legal actions AND refused if forced", () => {
    const state = openBlacksmith(4); // sword/mail cost 4; cosmos/satchel cost 5
    expect(buyLabelFor(state, EQUIP_ID_SWORD)).toBeTruthy(); // 4 gold — affordable
    expect(buyLabelFor(state, EQUIP_ID_COSMOS)).toBeUndefined(); // 5 gold — absent
    // Forcing the unaffordable Cosmos option (it IS in step.options) is refused.
    const cosmosIndex = (state.adventure!.pendingVisit!.steps[0] as { type: "CHOOSE_ONE"; options: { steps: { type: string; equipmentId?: string }[] }[] }).options.findIndex(
      (opt) => opt.steps.some((s) => s.type === "BUY_EQUIPMENT" && s.equipmentId === EQUIP_ID_COSMOS)
    );
    expect(cosmosIndex).toBeGreaterThanOrEqual(0);
    const forced = applyAction(state, { type: "RESOLVE_VISIT_STEP", playerId: "p1", optionIndex: cosmosIndex });
    expect(forced.errors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Iron-Blood Sword — first declared attack +1, not the second, not retaliation
// ===========================================================================

describe("anime.equipment — Iron-Blood Sword (weapon)", () => {
  it("+1 Attack on the FIRST declared attack only (CONTROL: no sword → no delta)", () => {
    function firstTwoAttackValues(withSword: boolean): { first: number; second: number } {
      let state = combat(`eq-sword-${withSword}`);
      if (withSword) equip(state, "p1", "weapon", EQUIP_ID_SWORD);
      state = resolveReactions(
        applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
      );
      // Re-activate the griffins for a SECOND declared attack this combat.
      const griffins = state.combat!.units.unit_p1_griffins;
      griffins.attackedThisActivation = false;
      griffins.attacksThisActivation = 0;
      griffins.retaliatedThisRound = false;
      griffins.movedThisActivation = false;
      griffins.activatedThisRound = false;
      state.combat!.activeUnitId = "unit_p1_griffins";
      state.activePlayerId = "p1";
      state.combat!.attackSequence = null;
      state = resolveReactions(
        applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
      );
      const values = initiatingAttackValues(state);
      return { first: values[0], second: values[1] };
    }
    const sword = firstTwoAttackValues(true);
    const bare = firstTwoAttackValues(false);
    // First attack: sword adds +1 over the bare baseline.
    expect(sword.first).toBe(bare.first + 1);
    // Second declared attack: the charge is spent, so no +1 (equals the baseline).
    expect(sword.second).toBe(bare.second);
    // The bare hero shows NO first/second delta (nothing else moves the number).
    expect(bare.first).toBe(bare.second);
    // The sword's second equals its own first minus the one-shot +1.
    expect(sword.second).toBe(sword.first - 1);
  });

  it("marks the per-combat charge spent when the first attack lands", () => {
    let state = combat("eq-sword-flag");
    equip(state, "p1", "weapon", EQUIP_ID_SWORD);
    expect(state.players.p1.combatStats.equipmentFirstAttackUsed ?? false).toBe(false);
    state = resolveReactions(
      applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
    );
    expect(state.players.p1.combatStats.equipmentFirstAttackUsed).toBe(true);
  });

  it("does NOT fire on a retaliation, and a retaliation never spends the charge (CONTROL)", () => {
    // p2 attacks p1's griffins; the griffins RETALIATE. That retaliation must not
    // get the sword's +1 even though p1 owns the sword, and it must not consume
    // the sword's per-combat charge (so p1's own later attack still gets +1).
    function retaliationValue(withSword: boolean): { value: number; charge: boolean } {
      let state = combat(`eq-sword-retal-${withSword}`);
      if (withSword) equip(state, "p1", "weapon", EQUIP_ID_SWORD);
      const skeletons = state.combat!.units.unit_p2_skeletons;
      skeletons.attack = 6;
      state.combat!.activeUnitId = "unit_p2_skeletons";
      state.activePlayerId = "p2";
      state = resolveReactions(
        applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: "unit_p2_skeletons", defenderId: "unit_p1_griffins" })
      );
      const retaliation = state.eventLog.find(
        (event): event is Extract<GameEvent, { type: "ATTACK_ROLLED" }> => event.type === "ATTACK_ROLLED" && event.isRetaliation
      );
      expect(retaliation, "the griffins should retaliate").toBeTruthy();
      return { value: retaliation!.attackValue, charge: state.players.p1.combatStats.equipmentFirstAttackUsed ?? false };
    }
    const withSword = retaliationValue(true);
    const bare = retaliationValue(false);
    // The sword adds NOTHING to a retaliation (identical to the bare value)…
    expect(withSword.value).toBe(bare.value);
    // …and a retaliation never spends the sword's first-attack charge.
    expect(withSword.charge).toBe(false);
  });
});

// ===========================================================================
// Black Tortoise Mail — first incoming declared attack −1, second unaffected
// ===========================================================================

describe("anime.equipment — Black Tortoise Mail (armor)", () => {
  function incomingSetup(seed: string, withMail: boolean): GameState {
    const state = combat(seed);
    if (withMail) equip(state, "p1", "armor", EQUIP_ID_MAIL);
    const skeletons = state.combat!.units.unit_p2_skeletons;
    skeletons.attack = 10;
    skeletons.defense = 2;
    state.combat!.units.unit_p1_griffins.defense = 2;
    state.combat!.units.unit_p1_griffins.maxHealth = 200;
    state.combat!.activeUnitId = "unit_p2_skeletons";
    state.activePlayerId = "p2";
    return state;
  }

  it("the FIRST incoming attack lands at −1 Attack — damage taken drops by exactly 1 (CONTROL: no mail)", () => {
    function firstIncomingDamage(withMail: boolean): number {
      let state = incomingSetup(`eq-mail-${withMail}`, withMail);
      const griffins = state.combat!.units.unit_p1_griffins;
      const before = griffins.damage;
      state = resolveReactions(
        applyOk(state, { type: "ATTACK_UNIT", playerId: "p2", attackerId: "unit_p2_skeletons", defenderId: "unit_p1_griffins" })
      );
      return state.combat!.units.unit_p1_griffins.damage - before;
    }
    expect(firstIncomingDamage(true)).toBe(firstIncomingDamage(false) - 1);
  });

  it("only the FIRST incoming attack is reduced — the second is at full Attack", () => {
    function twoIncomingAttackValues(withMail: boolean): { first: number; second: number } {
      let state = incomingSetup(`eq-mail2-${withMail}`, withMail);
      const attackOnce = (s: GameState): GameState => {
        const sk = s.combat!.units.unit_p2_skeletons;
        sk.attackedThisActivation = false;
        sk.attacksThisActivation = 0;
        sk.retaliatedThisRound = false;
        sk.movedThisActivation = false;
        sk.activatedThisRound = false;
        s.combat!.units.unit_p1_griffins.retaliatedThisRound = true; // suppress the griffins' retaliation noise
        s.combat!.activeUnitId = "unit_p2_skeletons";
        s.activePlayerId = "p2";
        s.combat!.attackSequence = null;
        return resolveReactions(
          applyOk(s, { type: "ATTACK_UNIT", playerId: "p2", attackerId: "unit_p2_skeletons", defenderId: "unit_p1_griffins" })
        );
      };
      state = attackOnce(attackOnce(state));
      const values = initiatingAttackValues(state);
      return { first: values[0], second: values[1] };
    }
    const mail = twoIncomingAttackValues(true);
    const bare = twoIncomingAttackValues(false);
    // First incoming: mail lowers the attacker's value by 1.
    expect(mail.first).toBe(bare.first - 1);
    // Second incoming: full attack again (charge spent) — equals the bare value.
    expect(mail.second).toBe(bare.second);
  });
});

// ===========================================================================
// Cosmos Pendant — +1 spell Power, stacking with Cultivation + grade
// ===========================================================================

describe("anime.equipment — Cosmos Pendant (accessory)", () => {
  it("+1 spell Power on the printed ladder, STACKING with Cultivation + Arcane Insight (+3 total)", () => {
    const base = createInitialGameState("eq-power-base");
    base.anime = { ...EQUIP_ON };
    const arrow = cardLibrary["spell.magic_arrow"];
    const baseline = standingSpellPower(base, "p1", arrow);

    const pendant = createInitialGameState("eq-power-pendant");
    pendant.anime = { ...EQUIP_ON };
    equip(pendant, "p1", "accessory", EQUIP_ID_COSMOS);
    expect(standingSpellPower(pendant, "p1", arrow)).toBe(baseline + 1);

    // Add Cultivation Nascent Soul (realm 3, +1) and the Arcane Insight grade (+1).
    const stacked = createInitialGameState("eq-power-stack");
    stacked.anime = { ...EQUIP_ON, cultivation: true, heroGrades: true };
    equip(stacked, "p1", "accessory", EQUIP_ID_COSMOS);
    const hero = getMainHero(stacked, "p1")!;
    hero.cultivationRealm = 3;
    hero.grade = 3;
    hero.gradeNodes = ["arcane-insight"];
    expect(standingSpellPower(stacked, "p1", arrow)).toBe(baseline + 3);
  });
});

// ===========================================================================
// Adventurer's Blade — +1 gold after a won combat, stacking to +2 with grade
// ===========================================================================

describe("anime.equipment — Adventurer's Blade (weapon)", () => {
  function wonCombatGold(opts: { blade: boolean; grade: boolean }): number {
    let state = adventure("eq-blade", { ...EQUIP_ON, heroGrades: true });
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    hero.level = 1;
    hero.spaceId = "guard-field";
    if (opts.blade) equip(state, "p1", "weapon", EQUIP_ID_BLADE);
    if (opts.grade) {
      hero.grade = 1;
      hero.gradeNodes = ["bounty-hunters-eye"];
    }
    state.adventure!.fields["guard-field"] = {
      spaceId: "guard-field",
      tileInstanceId: "t",
      slot: 0,
      location: "mine",
      difficulty: 3,
      blackCube: false,
      flagOwnerId: null,
      everFlagged: false,
      settlementResource: null
    };
    startNeutralEncounter(state, hero, state.adventure!.fields["guard-field"]);
    const place = getLegalActions(state, "p1").find((entry) => entry.action.type === "PLACE_COMBAT_UNIT");
    if (place) {
      state = applyOk(state, place.action);
      state = applyOk(state, { type: "FINISH_COMBAT_PLACEMENT", playerId: "p1" });
    }
    for (const unit of Object.values(state.combat!.units)) {
      if (unit.controllerId === "neutrals") unit.damage = unit.maxHealth;
    }
    const before = state.players.p1.resources.gold;
    finishCombatIfNeeded(state);
    finalizeAdventureCombat(state);
    return state.players.p1.resources.gold - before;
  }

  it("+1 gold after a won combat, and STACKS to +2 with Bounty Hunter's Eye (CONTROL: neither)", () => {
    const none = wonCombatGold({ blade: false, grade: false });
    expect(wonCombatGold({ blade: true, grade: false })).toBe(none + 1);
    expect(wonCombatGold({ blade: true, grade: true })).toBe(none + 2);
  });
});

// ===========================================================================
// Guild-Issue Mail — +1 hand limit, stacking with Cultivation + Deep Pockets
// ===========================================================================

describe("anime.equipment — Guild-Issue Mail (armor)", () => {
  it("+1 hand limit, STACKING with Cultivation Foundation + Deep Pockets (+3 total)", () => {
    const state = adventure("eq-hand", { ...EQUIP_ON, cultivation: true, heroGrades: true });
    const hero = getMainHero(state, "p1")!;
    const base = effectiveHandLimit(state, "p1");

    equip(state, "p1", "armor", EQUIP_ID_GUILD);
    expect(effectiveHandLimit(state, "p1")).toBe(base + 1);

    hero.cultivationRealm = 1; // Foundation +1
    hero.grade = 2;
    hero.gradeNodes = ["deep-pockets"]; // +1
    expect(effectiveHandLimit(state, "p1")).toBe(base + 3);
  });
});

// ===========================================================================
// Supply Satchel — +1 building materials at a Resources round
// ===========================================================================

describe("anime.equipment — Supply Satchel (accessory)", () => {
  it("+1 building materials at the start of a Resources round (CONTROL: unequipped → no rise)", () => {
    function roundMaterials(withSatchel: boolean): number {
      const state = adventure(`eq-satchel-${withSatchel}`);
      if (withSatchel) equip(state, "p1", "accessory", EQUIP_ID_SATCHEL);
      const before = state.players.p1.resources.buildingMaterials;
      state.round = 3;
      startAdventureRound(state);
      return state.players.p1.resources.buildingMaterials - before;
    }
    expect(roundMaterials(true)).toBe(roundMaterials(false) + 1);
  });
});

// ===========================================================================
// Scope + cross-mod coexistence
// ===========================================================================

describe("anime.equipment — scope + cross-mod seams", () => {
  it("CONTROL: the combat items do NOT apply in a garrison fight (main hero not present)", () => {
    function firstAttackValue(garrison: boolean): number {
      let state = combat(`eq-scope-${garrison}`);
      equip(state, "p1", "weapon", EQUIP_ID_SWORD);
      if (garrison) {
        // A garrison-style fight: p1's main hero is NOT a fighter (defenderHeroId
        // null, attacker is p2's hero) — the commander-scope gate hides the sword.
        state.combat!.context = { kind: "player", attackerHeroId: "hero_p2", defenderHeroId: null, fieldId: "f" };
      }
      state = resolveReactions(
        applyOk(state, { type: "ATTACK_UNIT", playerId: "p1", attackerId: "unit_p1_griffins", defenderId: "unit_p2_skeletons" })
      );
      return initiatingAttackValues(state)[0];
    }
    // In p1's own (sandbox) fight the sword adds +1; in the garrison fight it does not.
    expect(firstAttackValue(false)).toBe(firstAttackValue(true) + 1);
  });

  it("coexists with WOG Commanders enabled — a sword attack resolves without crashing", () => {
    let state = combat("eq-wog");
    state.wog = { enabled: true, commanders: true, newObjects: false, newCreatures: true };
    equip(state, "p1", "weapon", EQUIP_ID_SWORD);
    const result = applyAction(state, {
      type: "ATTACK_UNIT",
      playerId: "p1",
      attackerId: "unit_p1_griffins",
      defenderId: "unit_p2_skeletons"
    });
    expect(result.errors).toEqual([]);
    state = resolveReactions(result.state);
    expect(initiatingAttackValues(state)[0]).toBe(10 + 1); // griffins attack 10 + sword +1 (pre-defense)
  });

  it("mixed packages (xianxia + isekai items together) each read correctly — no interference", () => {
    const state = adventure("eq-mixed", { ...EQUIP_ON, cultivation: true, guild: true });
    equip(state, "p1", "weapon", EQUIP_ID_SWORD); // xianxia
    equip(state, "p1", "armor", EQUIP_ID_GUILD); // isekai
    equip(state, "p1", "accessory", EQUIP_ID_SATCHEL); // shared
    expect(playerHasEquipment(state, "p1", EQUIP_ID_SWORD)).toBe(true);
    expect(playerHasEquipment(state, "p1", EQUIP_ID_GUILD)).toBe(true);
    // Guild-Issue Mail's +1 hand limit still reads with all three slots filled.
    const base = effectiveHandLimit(adventure("eq-mixed-base", { ...EQUIP_ON, cultivation: true, guild: true }), "p1");
    expect(effectiveHandLimit(state, "p1")).toBe(base + 1);
  });
});

// ===========================================================================
// Computer policy — buys from surplus, never stalls
// ===========================================================================

function observe(state: GameState, playerId: PlayerId): { playerId: PlayerId; state: PlayerVisibleState; legalActions: ReturnType<typeof getLegalActions> } {
  return { playerId, state: state as unknown as PlayerVisibleState, legalActions: getLegalActions(state, playerId) };
}

describe("anime.equipment — computer policy", () => {
  function shopOpen(gold: number): GameState {
    const state = adventure("eq-ai");
    state.players.p1.resources.gold = gold;
    injectField(state, "anime.ren_binh_cac");
    visitShop(state);
    return state;
  }

  it("scores a buy into an empty slot above Leave with surplus, and below Leave when short", () => {
    const rich = shopOpen(40);
    const buyRich = getLegalActions(rich, "p1").find(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && entry.label.includes("Iron-Blood Sword")
    )!;
    const leaveRich = getLegalActions(rich, "p1").find(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && /leave/i.test(entry.label)
    )!;
    expect(scoreMapAction(observe(rich, "p1"), buyRich.action)!.score).toBeGreaterThan(
      scoreMapAction(observe(rich, "p1"), leaveRich.action)!.score
    );

    // Barely-affordable (gold == cost): no surplus buffer → the AI prefers Leave.
    const tight = shopOpen(4);
    const buyTight = getLegalActions(tight, "p1").find(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && entry.label.includes("Iron-Blood Sword")
    )!;
    const leaveTight = getLegalActions(tight, "p1").find(
      (entry) => entry.action.type === "RESOLVE_VISIT_STEP" && /leave/i.test(entry.label)
    )!;
    expect(scoreMapAction(observe(tight, "p1"), buyTight.action)!.score).toBeLessThan(
      scoreMapAction(observe(tight, "p1"), leaveTight.action)!.score
    );
  });

  it("drives the shop to completion without stalling (rich → buys an item, shop closes)", () => {
    let state = shopOpen(40);
    let guard = 8;
    while (state.adventure?.pendingVisit && guard > 0) {
      guard -= 1;
      const decision = chooseComputerAction(observe(state, "p1"));
      expect(decision, "the AI always has a scored visit action (no stall)").toBeTruthy();
      state = applyOk(state, decision!.action);
    }
    expect(state.adventure?.pendingVisit ?? null).toBeNull();
    // With surplus into empty slots, the AI bought at least one item.
    expect(Object.keys(heroEquipmentOf(state, "p1")).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Public state & legacy snapshots
// ===========================================================================

describe("anime.equipment — public state & legacy snapshots", () => {
  it("another seat's view keeps the equipment record (PUBLIC — never stripped)", () => {
    let state = adventure("eq-view", EQUIP_ON, {
      players: [
        { id: "p1", name: "One", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Two", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
    state = startTurn(state);
    equip(state, "p1", "weapon", EQUIP_ID_SWORD);
    const p2View = getPlayerView(state, "p2");
    const viewed = Object.values(p2View.heroes).find((entry) => entry.controllerId === "p1" && entry.kind === "main");
    expect(viewed?.equipment?.weapon).toBe(EQUIP_ID_SWORD);
  });

  it("a legacy snapshot with no equipment field loads and reads empty", () => {
    let state = adventure("eq-legacy");
    state = startTurn(state);
    const hero = getMainHero(state, "p1")!;
    delete hero.equipment;
    expect(heroEquipmentOf(state, "p1")).toEqual({});
    expect(getLegalActions(state, "p1").length).toBeGreaterThan(0);
  });
});
