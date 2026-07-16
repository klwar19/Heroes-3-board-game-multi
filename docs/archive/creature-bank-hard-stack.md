# Creature Bank Hard Stack (shelved alternative to Polish Bank Sizes)

**Status: SHELVED REFERENCE — NOT wired into the engine.** This file preserves
the *first* implementation of the `polish-bank-sizes` house rule (the one that
was reverted on f3015e8) so it can be resurrected later. None of the code
below runs today; it is kept verbatim as documentation.

## What it was ("Hard Stack")

The rolled bank **size** did NOT set the number of Stacked defenders. Instead it
gave **every one of the four bank guards** a deterministic *coin-layer* count and
paid a **bespoke reward scale**:

| Size | Layers per guard | Coin | Reward |
| --- | --- | --- | --- |
| Ⅰ | 0 | none | printed BASE only (X = 0) |
| Ⅱ | 1 | bronze | full 4-stack extras (X = 4) |
| Ⅲ | 2 | silver | X = 4 **+ 1** extra copy of the base GOLD |
| Ⅳ | 3 | gold | X = 4 **+ 2** extra copies of the base GOLD |

Each layer was a full extra copy of the bank card's Health; while any layer
remained the card had a flat **+1 Attack**, and lethal excess carried through as
layers peeled — exactly like the Polish *Unit Stacks* mechanic. A guard's layer
capacity was clamped by the Unit-Stack coin cap of the unit named on it
(bronze 3 / silver 3 / gold+azure 2), and a whole bank's rollable SIZE was
clamped to `1 + max guard cap` (so all-gold/azure banks topped out at Ⅲ).

**Why it was replaced:** the rule author wanted the size to only set the *number
of Stacked defenders* on an otherwise-normal Creature Bank (standard random-stat
Stack Tokens + the normal X-scaled reward). See `docs/polish-house-rules-plan.md`
§5 and the CLAUDE.md "Creature Banks" section for the shipped behaviour.

---

## The removed implementation (verbatim, from commit 43027b0)

### 1. Reward scale + reward builder — `src/data/map/creature-banks.ts`

```ts
/**
 * Polish Bank Sizes reward scale (mirrors engine `polishBankRewardScale`):
 * size Ⅰ = base only; Ⅱ = full 4-stack extras; Ⅲ/Ⅳ = size Ⅱ + 1/2 base GOLD layers.
 */
export function polishBankRewardScale(size: BankSize): {
  stackedX: number;
  extraBaseGoldLayers: number;
  unitStacks: number;
  empower: boolean;
} {
  if (size <= 1) {
    return { stackedX: 0, extraBaseGoldLayers: 0, unitStacks: 0, empower: false };
  }
  return {
    stackedX: 4,
    extraBaseGoldLayers: size === 3 ? 1 : size === 4 ? 2 : 0,
    unitStacks: size - 1,
    empower: true
  };
}

/**
 * Polish Bank Sizes win reward. Size Ⅱ pays the classic full 4-stack extras;
 * Ⅲ/Ⅳ add 1/2 extra copies of the printed BASE gold only (never valuables or
 * materials). Unit banks grant Few / Pack+stacks and Empower only from size Ⅱ.
 */
export function buildPolishCreatureBankReward(
  bankId: CreatureBankId,
  size: BankSize
): LocationInteraction {
  const { stackedX: x, extraBaseGoldLayers: goldLayers, unitStacks, empower } =
    polishBankRewardScale(size);

  switch (bankId) {
    case "imp_cache":
      // Base 3 gold; +X gold. Size Ⅲ/Ⅳ: +3 gold per extra base layer.
      return gainResources({ gold: 3 * (1 + goldLayers) + x });
    case "crypt":
      return gainResources({ gold: 6 * (1 + goldLayers) + 2 * x });
    case "dwarven_treasury":
      return gainResources({ gold: 7 * (1 + goldLayers) + 3 * x });
    case "naga_bank":
      // Base 6g+2v; +6X gold +X valuables. Extra base layers: gold only.
      return gainResources({
        gold: 6 * (1 + goldLayers) + 6 * x,
        valuables: 2 + x
      });
    case "cyclops_stockpile":
      // Base is materials+valuables (no gold) — size Ⅲ/Ⅳ add nothing beyond Ⅱ.
      return gainResources({
        buildingMaterials: 8 + 2 * x,
        valuables: 2 + x
      });
    case "medusa_stores": {
      // Base 6g+1v once; size Ⅲ/Ⅳ add +6 gold per layer (not +valuables);
      // per-stack choices use full stackedX (0 at Ⅰ, 4 at Ⅱ+).
      return seq(
        gainResources({ gold: 6 * (1 + goldLayers), valuables: 1 }),
        ...Array.from(
          { length: Math.max(0, x) },
          (): LocationInteraction => ({
            type: "CHOOSE_ONE",
            options: [
              { label: "Gain 3 gold", interaction: { type: "GAIN_RESOURCES", gold: 3 } },
              { label: "Gain 1 valuables", interaction: { type: "GAIN_RESOURCES", valuables: 1 } }
            ]
          })
        )
      );
    }
    case "shipwreck":
      // Morale once; gold = 5*(1+layers) + 2X; Search(X) Artifacts.
      return seq(
        { type: "GAIN_MORALE", amount: 1 },
        gainResources({ gold: 5 * (1 + goldLayers) + 2 * x }),
        search("artifacts", x)
      );
    case "derelict_ship":
      return seq(
        { type: "GAIN_MORALE", amount: 1 },
        gainResources({ gold: 7 * (1 + goldLayers) + 2 * x }),
        search("spells", x)
      );
    case "pyramid":
      // No gold in base — size Ⅲ/Ⅳ match size Ⅱ (Search 5 + up to 4 remove loops).
      return x > 0
        ? {
            type: "SEQUENCE",
            interactions: [
              { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 },
              { type: "REMOVE_THEN_SEARCH_REPEAT", times: x, searchCount: 5 }
            ]
          }
        : { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 };
    case "dragon_utopia":
      // Base 40g + Search(3) Art once; size Ⅲ/Ⅳ add +40 gold only; +X Search(5) picks.
      return seq(
        gainResources({ gold: 40 * (1 + goldLayers) }),
        { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 3 },
        ...Array.from(
          { length: Math.max(0, x) },
          (): LocationInteraction => ({
            type: "CHOOSE_ONE",
            options: [
              {
                label: "Search (5) the Artifact Deck",
                interaction: { type: "SEARCH_SHARED_DECK", deckId: "artifacts", count: 5 }
              },
              {
                label: "Search (5) the Spell Deck",
                interaction: { type: "SEARCH_SHARED_DECK", deckId: "spells", count: 5 }
              }
            ]
          })
        )
      );
    case "dragon_fly_hive":
    case "griffin_conservatory": {
      // Size Ⅰ: Few, no empower. Size Ⅱ/Ⅲ/Ⅳ: Pack with 1/2/3 stacks + empower once.
      const unitDefId =
        bankId === "dragon_fly_hive" ? "fortress.dragon_flies" : "castle.griffins";
      const unitGain: LocationInteraction =
        unitStacks > 0
          ? { type: "GAIN_UNIT", unitDefId, side: "pack", stacks: unitStacks }
          : { type: "GAIN_UNIT", unitDefId, side: "few" };
      return empower ? seq(unitGain, { type: "EMPOWER_ABILITY" }) : unitGain;
    }
    default: {
      const _exhaustive: never = bankId;
      return _exhaustive;
    }
  }
}
```

### 2. Size cap + combat-unit layer builder — `src/engine/adventure.ts`

`polishBankMaxSize` and the `polish-bank-sizes` early-branch of
`buildCreatureBankCombatUnits` (the standard random-stat branch below it is the
one that ships today):

```ts
/**
 * Polish Bank Sizes: the LARGEST size a given bank can be. A bank's size never
 * exceeds what its best guard can physically carry (1 + the highest bank-guard
 * layer cap among its four cards, where guards punch one above the army caps
 * to at most 3: bronze 3 / silver 3 / gold+azure 2): an all-gold/azure Dragon
 * Utopia or Pyramid tops out at size Ⅲ, while any bank with a silver or
 * bronze guard reaches the full Ⅳ. A rolled size above this is clamped BEFORE
 * the player chooses.
 */
export function polishBankMaxSize(bankId: CreatureBankId): BankSize {
  const bank = CREATURE_BANKS[bankId];
  const maxCap = (bank?.units ?? []).reduce(
    (best, unitDefId) => Math.max(best, polishBankGuardLayerCap(unitDefId)),
    0
  );
  return Math.max(1, Math.min(4, 1 + maxCap)) as BankSize;
}

/** Re-export — single source of truth lives in `creature-banks.ts`. */
export { polishBankRewardScale } from "@/data/map/creature-banks";

/**
 * Builds the Creature Bank defenders for a combat. Standard banks place their
 * random statistic Stack Tokens using Scenario Difficulty (rulebook p.66-67).
 *
 * The Polish size variant is deliberately different: the rolled coin is put on
 * EVERY one of the four bank cards and its colour is a deterministic layer
 * count (size I = 0, bronze II = 1, silver III = 2, gold IV = 3). Every layer
 * is a full extra health bar; this path never mints the standard random-stat
 * `stackToken`. Each guard's layers are additionally CAPPED by the Unit Stack
 * coin rule of the unit named on its (rankless-in-play) card, punching one
 * above the army caps with an absolute maximum of 3 — bronze 3 / silver 3 /
 * gold+azure 2 (`polishBankGuardLayerCap`) — and the whole bank's SIZE clamps
 * to what its best guard can carry (`polishBankMaxSize`): an all-gold/azure
 * Dragon Utopia tops out at size Ⅲ. Win rewards use polishBankRewardScale
 * (not layer count): size Ⅱ pays full 4-stack extras; Ⅲ/Ⅳ add gold-only base
 * layers — see grantCreatureBankReward / buildPolishCreatureBankReward.
 */
export function buildCreatureBankCombatUnits(
  state: GameState,
  bankId: CreatureBankId,
  bankSize?: BankSize
): { units: CombatUnitState[]; stackedCount: number } {
  const ruleset = getRuleset(state);
  const sideOverrides = unitSideRuleOverrides(state);
  const draws = buildCreatureBankDraws(bankId);
  const units = draws.flatMap((draw, index) => {
    const unit = makeCombatUnitFromNeutral(draw, `bank_${index + 1}_${draw.unitDefId.split(".")[1]}`, 0, ruleset, sideOverrides);
    return unit ? [unit] : [];
  });

  if (houseRuleEnabled(state, "polish-bank-sizes") && bankSize !== undefined) {
    // The roll-time clamp already keeps a stored size within the bank's max;
    // re-clamp defensively so a hand-edited or legacy field cannot pay a size
    // its guards could never physically carry.
    const effectiveSize = Math.min(bankSize, polishBankMaxSize(bankId)) as BankSize;
    const stackLayers = Math.max(0, effectiveSize - 1);
    for (const unit of units) {
      // The bank card is rankless in play, but its layer capacity follows the
      // Unit Stack coin rule of the unit NAMED on it, punching one above the
      // army caps to at most 3: bronze 3 / silver 3 / gold (and azure) 2.
      unit.bankStacks = Math.min(stackLayers, polishBankGuardLayerCap(unit.unitDefId));
      // Re-derive Attack (+1 while at least one layer remains) and preserve the
      // bank card's own abilities/stat line.
      applyUnitCurrentSide(unit, ruleset, sideOverrides);
    }
    return {
      units,
      // stackedCount for polish = the "full stack" X used by classic extras
      // (0 at size Ⅰ, 4 from size Ⅱ+). Size Ⅲ/Ⅳ gold base layers are applied
      // separately in buildPolishCreatureBankReward.
      stackedCount: polishBankRewardScale(effectiveSize).stackedX
    };
  }

  const difficulty = state.adventure?.difficulty ?? "normal";
  // The difficulty caps how many DISTINCT defenders are candidates for a token.
  const tokenRolls = Math.min(bankSize ?? STACK_TOKENS_BY_DIFFICULTY[difficulty], units.length, 4);

  const random = adventureRandom(state, `creature-bank-stack-${bankId}`);
  // Partial Fisher-Yates: pick `tokenRolls` DISTINCT candidate defenders.
  const order = units.map((_, index) => index);
  for (let i = 0; i < tokenRolls; i += 1) {
    const j = random.nextInt(i, order.length - 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  let stackedCount = 0;
  for (let i = 0; i < tokenRolls; i += 1) {
    // Roll per candidate: the token only lands STACK_TOKEN_PLACEMENT_PERCENT% of
    // the time, so the Stacked count varies run to run even at a fixed difficulty.
    if (random.nextInt(1, 100) > STACK_TOKEN_PLACEMENT_PERCENT) {
      continue;
    }
    const unit = units[order[i]];
    unit.stackToken = STACK_TOKEN_STATS[random.nextInt(0, STACK_TOKEN_STATS.length - 1)];
    // Re-derive the fighting statistics so the token's bonus is baked in.
    applyUnitCurrentSide(unit, ruleset, sideOverrides);
    stackedCount += 1;
  }

  return { units, stackedCount };
}
```

And the reward override inside `grantCreatureBankReward` (again in `adventure.ts`),
which chose the Hard-Stack reward over the normal `bank.buildReward`:

```ts
// Polish bank sizes: payout follows size (full 4-stack at Ⅱ, gold-only base
// layers at Ⅲ/Ⅳ), not the combat layer count / classic stackedCount.
const polishSize =
  houseRuleEnabled(state, "polish-bank-sizes") && field.bankSize !== undefined
    ? (Math.min(field.bankSize, polishBankMaxSize(bankId)) as BankSize)
    : undefined;
const reward =
  polishSize !== undefined
    ? buildPolishCreatureBankReward(bankId, polishSize)
    : bank.buildReward(stackedCount);
```

### 3. Guard layer cap — `src/engine/polish-unit-stacks.ts`

```ts
/**
 * Polish Bank Sizes only: bank guards in combat punch one above army caps
 * (bronze 3 / silver 3 / gold 2). Human army cards never use this table.
 */
export function polishBankGuardLayerCap(unitDefId: string | undefined): number {
  const tier = unitDefId ? coreUnitDefinitions[unitDefId]?.tier : undefined;
  if (!tier) {
    return 0;
  }
  const armyCap = tier === "azure" ? POLISH_UNIT_STACK_RULES.gold?.cap : POLISH_UNIT_STACK_RULES[tier]?.cap;
  return armyCap === undefined ? 0 : Math.min(3, armyCap + 1);
}
```

### 4. Layer peel on lethal damage — `src/engine/combat-units.ts`

Inserted in `markUnitRemovedIfNeeded` AFTER Rebirth and the army-stack peel, and
BEFORE the standard `stackToken` absorb:

```ts
  // Polish Creature Bank sizes use deterministic coin layers on EVERY bank
  // defender (II/III/IV = 1/2/3). Peel complete bank-card health bars with
  // carryover exactly like the sheet's Unit Stacks, keeping the same bank-card
  // abilities; the flat +1 Attack disappears only when the final layer does.
  // This is separate from the standard random-stat Stack Token below.
  while (
    houseRuleEnabled(state, "polish-bank-sizes") &&
    unit.bankUnit &&
    (unit.bankStacks ?? 0) > 0 &&
    unit.damage >= unit.maxHealth
  ) {
    const excess = Math.max(0, unit.damage - unit.maxHealth);
    unit.bankStacks = Math.max(0, (unit.bankStacks ?? 0) - 1);
    applyUnitCurrentSide(unit, getRuleset(state), unitSideRuleOverrides(state));
    unit.damage = excess;

    appendEvent(state, {
      type: "BANK_STACK_LOST",
      unitId: unit.id,
      playerId: unit.controllerId,
      unitName: unit.name,
      remainingStacks: unit.bankStacks,
      excessDamage: excess
    });
  }

  if (unit.damage < unit.maxHealth) {
    return;
  }
```

### 5. +1 Attack while a layer remains — `src/engine/unit-transforms.ts`

The bank branch of `applyUnitCurrentSide` (only the `polishStackAttack` term is
Hard-Stack; the `stackToken` bonus is the shipping behaviour):

```ts
  // Creature Bank defenders fight from their own card. Standard banks may add
  // one random-stat Stack Token; Polish sized banks instead add deterministic
  // full-health layers to every card and a flat +1 Attack while any layer is
  // left. The two representations are mutually exclusive at construction.
  if (unit.bankUnit && unit.unitDefId) {
    const bankSide = CREATURE_BANK_UNIT_SIDES[unit.unitDefId];
    if (!bankSide) {
      return;
    }
    const bonus = (stat: "attack" | "defense" | "health" | "initiative") =>
      unit.stackToken === stat ? stackTokenDelta(stat) : 0;
    const polishStackAttack = (unit.bankStacks ?? 0) > 0 ? 1 : 0;
    unit.attack = bankSide.attack + bonus("attack") + polishStackAttack;
    unit.defense = bankSide.defense + bonus("defense");
    unit.maxHealth = bankSide.health + bonus("health");
    unit.initiative = bankSide.initiative + bonus("initiative");
    unit.abilities = bankSide.abilities;
    return;
  }
```

### 6. AI strength (numeric size = layers) — `src/engine/computer/army-strength.ts`

The numeric-size branch of `creatureBankStrength`:

```ts
/**
 * Estimated defender strength for a known bank token. Expected stack tokens
 * (difficulty rolls) inflate health/attack conservatively so Easy is easier
 * than Impossible — the real stack count is random at combat start.
 */
export function creatureBankStrength(
  bankId: string,
  difficultyOrSize: keyof typeof STACK_TOKENS_BY_DIFFICULTY | BankSize = "normal",
): number {
  const bank = CREATURE_BANKS[bankId as CreatureBankId];
  if (!bank) return Number.POSITIVE_INFINITY;
  if (typeof difficultyOrSize === "number") {
    const layers = Math.max(0, difficultyOrSize - 1);
    return bank.units.reduce((sum, unitDefId) => {
      const side = CREATURE_BANK_UNIT_SIDES[unitDefId];
      if (!side) return sum;
      // Numeric Polish sizes are deterministic: each of all four cards repeats
      // its complete Health bar once per layer, plus one flat Attack while any
      // layer remains. This mirrors the combat stat valuation above.
      return sum + bankUnitStrength(unitDefId) + layers * side.health * 2 + (layers > 0 ? 3 : 0);
    }, 0);
  }
  const base = bank.units.reduce(
    (sum, unitDefId) => sum + bankUnitStrength(unitDefId),
    0,
  );
  const rolls = STACK_TOKENS_BY_DIFFICULTY[difficultyOrSize] ?? 2;
  // Stack tokens add a mild bulk/soak bonus, not a full extra unit each.
  // Calibrated so a full starting army (~45) clears Imp Cache on Normal but
  // refuses Dragon Utopia and refuses when gutted to one card.
  const expectedStacks = rolls * 0.77;
  return Math.round(base * (1 + expectedStacks * 0.1));
}
```

### 7. State fields / events — `src/engine/state.ts`

```ts
// on CombatUnitState:
/** Polish Creature Bank size: every defender carries the same 0/1/2/3
 *  full-health Stack layers (sizes I/II/III/IV) — a coin layer, NOT the
 *  standard random-stat stackToken. */
bankStacks?: number;

// on the CREATURE_BANK_COMBAT_STARTED event:
/** Polish size coin: identical full-health layers carried by every guard. */
stackLayers?: number;

// a dedicated event, emitted by the layer peel in §4:
| {
    /** A Polish bank-size Stack layer absorbed lethal damage. */
    id: string;
    type: "BANK_STACK_LOST";
    unitId: UnitId;
    playerId: PlayerId;
    unitName: string;
    remainingStacks: number;
    excessDamage: number;
  }
```

### 8. Coupling + UI

- `armyUnitStacksActive` (`src/engine/house-rules.ts`) returned
  `polish-unit-stacks OR polish-bank-sizes`, so the unit banks (Dragon Fly Hive /
  Griffin Conservatory) could grant a Pack carrying WORKING army-stack layers
  (`{ GAIN_UNIT side: "pack", stacks: size-1 }`) even with `polish-unit-stacks`
  off.
- `reserveCreatureBankForTile` (`adventure-reducer.ts`) clamped the rolled size
  with `polishBankMaxSize(candidateId)` before storing it, and
  `revealCreatureBankArmy` emitted `stackLayers: field.bankSize - 1`.
- UI: a `.bankStackBadge` on each guard showing the remaining layer count; the
  `InitiativeRail` bank chip showed `size-1` layers + a `polishBankRewardScale`
  reward label; the map SVG badge showed `size-1` circles; `.bankStackBadge` /
  `.bankStackCoin` / the `size-1..4` coin gradients lived in `globals.css`.

---

## How to re-enable (resurrecting Hard Stack)

The cleanest path is to **reverse the revert commit** and reconcile:

1. `git show f3015e8` shows the FULL diff that removed this system (this doc's
   §1–§8 are the deleted hunks). `git revert --no-commit f3015e8` gives a
   starting point; then re-decide the seams below rather than blindly reverting
   the tests/docs.
2. Re-add the state fields/events (§7) and the two `polishBank*` engine helpers
   plus `buildPolishCreatureBankReward` / `polishBankRewardScale` (§1–§3).
3. Restore the `buildCreatureBankCombatUnits` layer branch (§2), the
   `grantCreatureBankReward` override (§2), the `markUnitRemovedIfNeeded` layer
   peel (§4) and the `applyUnitCurrentSide` +1 Attack (§5).
4. Point `armyUnitStacksActive` back at `polish-unit-stacks OR polish-bank-sizes`
   (§8) and restore the unit-bank `stacks: size-1` reward.
5. Restore the UI badges + CSS (§8) and the reveal-time size clamp.
6. Decide whether Hard Stack is a SEPARATE toggle (e.g. a new
   `creature-bank-hard-stack` HouseRuleId) or replaces the shipped
   `polish-bank-sizes` behaviour. A separate toggle avoids re-removing the
   normal-token behaviour and lets both coexist.

`src/engine/polish-bank-sizes.test.ts` currently holds the shipped (normal-token)
suite. The original Hard-Stack test suite is recoverable verbatim with
`git show 43027b0:src/engine/polish-bank-sizes.test.ts` (the pre-revert commit).
