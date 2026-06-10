# Game Flow Script And Map Movement Plan

This document scripts how a full game of Heroes 3: The Board Game should flow through the app, and designs the adventure-map layer that comes after the combat sandbox. Sources: the official rulebook, the fan wiki (https://en.homm3bg.wiki/), and the Homecoming solo playthrough transcript.

## 1. Full Game Flow Script

### 1.1 Game setup

1. Pick a scenario (map tiles, starting towns, heroes, units, win/loss conditions, round limit, timed events).
2. Each player picks a faction + main hero and builds the starting deck:
   - Statistic cards from the hero board (e.g. Catherine: 2 Attack, 2 Defense, 1 Power, 1 Knowledge).
   - Starting spell(s): might heroes start with one copy of Magic Arrow, magic heroes with two.
   - Starting ability/specialty cards (e.g. Leadership).
3. Shuffle the player deck. Shuffle the three shared decks (Spells, Abilities, Artifacts) next to the board; each has its own discard pile.
4. Place starting units (few/pack sides), resources, income markers, the round tracker, and scenario tiles.
5. Scenario bonus choice when offered (reinforce a unit, +3 valuables, or search the artifact deck).

### 1.2 Round sequence

```
Round start
  ├─ Resource round  → income from town buildings, settlements, mines
  └─ Astrologers round → draw + resolve a global event card
Player turns (in turn order; town actions may interleave)
  └─ per player turn:
       1. Discard any number of hand cards
       2. Draw up to the hand limit (deck reshuffles from discard when empty)
       3. Spend movement points (base 3): move, reveal/place tiles,
          visit fields, flag mines/settlements, start combat
       4. Town action window (once per round, may also happen during
          another player's turn, never during combat)
End of round → advance round tracker, check scenario timers
```

### 1.3 Combat flow (implemented in the engine today)

```
Combat starts (attacker placed units first, then defender)
  └─ Combat round
       └─ Unit activation (initiative order, ties favor the attacker)
            1. Activation actions (unit abilities, e.g. Ogres' attack token)
            2. Move and/or declare attack (melee: move→attack;
               ranged: shoot→may reposition)
            3. INSTANT WINDOW on attack declaration
                 - attacker may play any number of attack instants
                   (statistics, abilities, artifacts) — singly or batched
                 - defender may play any number of defense instants
                 - priority alternates until both pass
            4. DICE LAST: only after every buff is committed, roll the
               attack die (-1/-1/0/0/+1/+1; advantage/disadvantage = 2 dice)
            5. Reroll window (Fortune/Luck/morale effects)
            6. Damage = max(0, attack + bonuses + die − defense − bonuses)
            7. Retaliation (melee, once per round unless unlimited) —
               repeats steps 3-6 with sides swapped
       └─ Spells: 1 spell card per combat round per player
            - SPELL WINDOW: caster may boost Power (statistics, artifacts),
              Knowledge can recall the spell; the defender may end the
              spell with Resistance (basic: power ≤ 1, expert: always)
            - Resistance always ends the spell the moment it applies
  └─ Combat ends: one side eliminated, or attacker retreats/runs out
     of movement (counts as a loss vs neutrals)
  └─ Aftermath: winner heals surviving cards (few stays few), gains
     experience steps (full level if enemy level was higher), level-up
     rewards (empowerment, ability/spell/artifact searches)
```

### 1.4 Timing windows the engine must keep honoring

| Window | Trigger | Who acts | Closes when |
| --- | --- | --- | --- |
| Attack instants | `UNIT_ATTACK_DECLARED` | attacker (attack cards), defender (defense cards), anyone (timing-free instants like card draws) | both pass |
| Spell instants | `SPELL_CAST_STARTED` | caster (power/knowledge), opponent (Resistance) | both pass or spell ends |
| Reroll | after the die roll | roll owner | keep or rerolls exhausted |
| Deck search | search reward | searcher | pick made |

## 2. Map Movement Design

### 2.1 Model

The map is a graph of fields grouped into tiles, not a square grid:

```ts
type MapField = {
  id: MapSpaceId;
  tileId: TileId;
  kind: "empty" | "town" | "mine" | "settlement" | "treasure" |
        "artifact" | "obelisk" | "dwelling" | "guarded" | "blocked";
  adjacent: MapSpaceId[];          // orthogonal neighbours, diagonals are NOT adjacent
  guard?: { level: number; defeated: boolean };   // Roman numeral fields
  reward?: FieldRewardDefinition;  // gold, resources, searches, experience
  flagOwnerId?: PlayerId | null;   // mines/settlements
  revisitPolicy: "once" | "per-round" | "always";
  hidden: boolean;                 // tiles start face down
};
```

The engine already has `MOVE_HERO` (adjacency + movement points + event). The next steps, in order:

1. **Field visits** — entering a field resolves its reward/encounter (`VISIT_FIELD` action; rewards reuse `DRAW_CARDS`, `SEARCH_DECK`, resource gains).
2. **Guarded fields** — entering starts a neutral combat (draw neutral units by level/difficulty); win to claim the reward, retreat/loss bounces the hero back.
3. **Tile reveal** — moving onto a tile edge reveals/places the next scenario tile (the snow/grass path choice from the playthrough is a scenario hook that picks which tile list to draw from).
4. **Flagging** — mines/settlements set `flagOwnerId` and feed the resource round.
5. **Terrain costs** — scenario modifiers like "snow path: −1 movement point per turn" attach to tiles, not hardcoded.
6. **Secondary heroes** — lighter pieces: move and flag but do not use the deck.

### 2.2 Hero turn loop on the map

```
Start of turn → discard any cards → draw up to hand limit
  → repeat while movement points remain:
       MOVE_HERO (1 point per field; scenario modifiers may tax this)
       → on enter: reveal tile? → guard? → start combat : resolve field
  → optional town action (build / population / spell book)
  → END_TURN (expires turn-scoped effects, passes to next seat)
```

### 2.3 UI direction for the map

- Same tabletop framing as combat: the map is the table, tiles render as physical tiles, the hand stays fanned at the bottom.
- Hero pawns stand on fields; legal destinations glow exactly like combat move targets.
- Entering a guarded field zooms the battlefield board in over the table (combat is "played on top of" the map, as at a real table), and returns to the map afterwards.
- The round tracker, income markers, and town boards live on rails beside the map.

## 3. What Is Already Engine-Ready For This Plan

- `MapState.spaces` graph + `MOVE_HERO` with movement points and events.
- Decks/discards (player + shared) with seeded shuffles and search flows.
- Combat as a self-contained `CombatState` that can be created from a map encounter and disposed afterwards.
- Scenario-agnostic timing windows (`ReactionWindow`, `PendingChoice`) that map encounters can reuse.
