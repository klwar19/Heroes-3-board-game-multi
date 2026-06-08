# Heroes 3 Board Game Multiplayer Build Blueprint

This document is the long-term build plan for a non-profit online multiplayer app inspired by Heroes of Might and Magic III: The Board Game. The goal is to build a stable foundation first, then add new cards and content later without rewriting core mechanics.

## Project Goal

Build a browser-based multiplayer board game app with:

- Online rooms for 2 or more players.
- Full turn structure, map, town, deck, hand, combat, and AI support.
- Complex timing windows, including opponent-turn reactions and instant cards.
- A data-driven card system so future development mostly means adding card definitions.
- Game art, card art, and clear visual UI with proper non-profit credit.
- Server-authoritative rules so every player sees the same legal state.

## Permission And Credit Requirements

The project is intended for non-profit use only.

Keep a saved copy of the Archon/Discord permission message allowing use of art and rules for non-profit use. Do not commit private Discord screenshots if they contain personal/private details; instead keep them locally or in private storage.

The app must include:

- A visible credits page.
- Footer credit on the app shell.
- Asset source tracking for every official art/card image.
- A clear non-profit fan project notice.
- No ads.
- No paid access.
- No selling files, cards, rule packs, or subscriptions.

Suggested credit wording:

> This is a non-profit fan multiplayer tool for Heroes of Might and Magic III: The Board Game. Heroes of Might and Magic III and related artwork/rules belong to their respective owners and Archon Studio. Used with permission for non-profit fan use. This app is not affiliated with or endorsed by Ubisoft, The 3DO Company, New World Computing, or Archon Studio unless separately stated.

## Recommended Stack

Use this stack unless there is a strong reason to change it:

- App framework: Next.js
- Language: TypeScript
- UI: React
- Turn/game framework: boardgame.io
- Database/auth/storage: Supabase
- Styling: CSS modules or Tailwind, but keep design tokens centralized
- Tests: Vitest for rules engine, Playwright for browser flows
- Deployment:
  - Frontend: Vercel
  - boardgame.io server: Railway, Render, or Fly.io
  - Database/storage/auth: Supabase

Do not start with Colyseus. Use boardgame.io first because this game is mainly turn-based with reaction windows. Add Colyseus only later if realtime dragging, live animation, or spectator state becomes too hard with boardgame.io.

## Core Design Rule

Never let the UI decide rules.

The UI asks the engine:

- What actions are legal?
- What targets are legal?
- What reaction windows are open?
- What happens if this action is submitted?

The rules engine answers and produces a new state plus event log.

This keeps future AI-assisted development consistent.

## Target Architecture

```text
src/
  app/
    page.tsx
    game/[roomId]/page.tsx
    credits/page.tsx
  components/
    app-shell/
    board/
    cards/
    combat/
    town/
    lobby/
    rules-log/
  game/
    homm3-game.ts
    boardgameio.ts
    phases.ts
    moves.ts
    setup.ts
  engine/
    state.ts
    actions.ts
    events.ts
    reducer.ts
    legal-actions.ts
    reaction-windows.ts
    targeting.ts
    costs.ts
    random.ts
  rules/
    map-rules.ts
    combat-rules.ts
    town-rules.ts
    card-rules.ts
    ai-rules.ts
  data/
    cards/
      abilities.ts
      spells.ts
      hero-specialties.ts
      artifacts.ts
      ai-cards.ts
    heroes.ts
    units.ts
    towns.ts
    map-tiles.ts
    assets.ts
  server/
    boardgame-server.ts
    supabase.ts
  tests/
    engine/
    cards/
    combat/
    multiplayer/
```

## Main Game State Shape

The full game state should be a serializable TypeScript object. It must be safe to save, reload, replay, and send over the network.

```ts
type GameState = {
  id: string;
  seed: string;
  round: number;
  phase: GamePhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId | null;
  players: Record<PlayerId, PlayerState>;
  map: MapState;
  towns: Record<TownId, TownState>;
  heroes: Record<HeroId, HeroState>;
  combat: CombatState | null;
  decks: Record<DeckId, DeckState>;
  stack: ResolutionStackItem[];
  reactionWindow: ReactionWindow | null;
  eventLog: GameEvent[];
  pendingChoice: PendingChoice | null;
};
```

Important:

- No functions inside game state.
- No UI-only data inside game state.
- No random `Math.random()` inside rules. Use seeded RNG through boardgame.io or a controlled random helper.
- Every state change should come from a legal action.

## Action System

Every user move should be an action object.

Examples:

```ts
type GameAction =
  | { type: "MOVE_HERO"; playerId: PlayerId; heroId: HeroId; to: MapSpaceId }
  | { type: "CAST_SPELL"; playerId: PlayerId; cardId: CardId; target: TargetRef }
  | { type: "PLAY_CARD"; playerId: PlayerId; cardId: CardId; target?: TargetRef }
  | { type: "ATTACK_UNIT"; playerId: PlayerId; attackerId: UnitId; defenderId: UnitId }
  | { type: "BUILD_STRUCTURE"; playerId: PlayerId; townId: TownId; buildingId: BuildingId }
  | { type: "PASS_REACTION"; playerId: PlayerId };
```

The engine should expose:

```ts
getLegalActions(state, playerId): LegalAction[];
applyAction(state, action): EngineResult;
```

`EngineResult` should include:

```ts
type EngineResult = {
  state: GameState;
  events: GameEvent[];
  errors: RulesError[];
};
```

## Event Log

Actions create events. Events are the backbone of reactions, replay, debugging, and AI.

Examples:

```ts
type GameEvent =
  | { type: "SPELL_CAST_STARTED"; playerId: PlayerId; spellCardId: CardId; target: TargetRef }
  | { type: "SPELL_CAST_RESOLVED"; playerId: PlayerId; spellCardId: CardId; result: SpellResult }
  | { type: "UNIT_ATTACK_DECLARED"; attackerId: UnitId; defenderId: UnitId }
  | { type: "DAMAGE_ASSIGNED"; source: SourceRef; target: TargetRef; amount: number }
  | { type: "CARD_PLAYED"; playerId: PlayerId; cardId: CardId }
  | { type: "REACTION_WINDOW_OPENED"; windowId: string; triggerEventId: string }
  | { type: "REACTION_PASSED"; playerId: PlayerId; windowId: string };
```

Use event logs for:

- Undo/debug during development.
- Game replay later.
- Explaining why a move was legal or illegal.
- AI decision context.
- Reaction trigger checks.

## Reaction Windows

This is the most important system for complex mechanics.

Cards like Resistance require opponent-turn responses. The engine must support timing windows instead of directly resolving every action.

Example flow:

1. Player A casts Magic Arrow.
2. Engine emits `SPELL_CAST_STARTED`.
3. Engine checks all cards, heroes, artifacts, and effects that can react.
4. Engine opens a reaction window for eligible players.
5. Player B can play Resistance or pass.
6. If Resistance is played, it resolves first.
7. Original spell continues, changes, or is cancelled.
8. Engine closes the reaction window and continues the stack.

Suggested reaction window shape:

```ts
type ReactionWindow = {
  id: string;
  triggerEvent: GameEvent;
  allowedPlayerIds: PlayerId[];
  priorityPlayerId: PlayerId;
  legalReactions: Record<PlayerId, LegalAction[]>;
  passedPlayerIds: PlayerId[];
  closesWhen: "all-pass" | "one-reaction" | "choice-made";
};
```

Do not implement instant cards as random special cases in UI. Every instant card should be a card definition with trigger, condition, and effect.

## Resolution Stack

Use a stack/queue for actions that pause for reactions.

```ts
type ResolutionStackItem = {
  id: string;
  source: SourceRef;
  action: GameAction;
  status: "pending" | "waiting-for-reaction" | "resolving" | "resolved" | "cancelled";
  triggerEventIds: string[];
};
```

Typical stack order:

1. Original action enters stack.
2. Trigger event opens reaction window.
3. Reaction enters stack above original action.
4. Reaction resolves.
5. Original action resumes.

## Data-Driven Cards

Future card additions should usually happen in `src/data/cards/*`, not in the engine.

Suggested card schema:

```ts
type CardDefinition = {
  id: CardId;
  name: string;
  kind: "spell" | "ability" | "artifact" | "hero-specialty" | "ai" | "unit";
  timing: "action" | "instant" | "reaction" | "passive" | "map" | "combat" | "town";
  phaseLimit?: GamePhase[];
  tags: string[];
  cost?: CostDefinition;
  trigger?: TriggerDefinition;
  target?: TargetDefinition;
  condition?: ConditionDefinition;
  effect: EffectDefinition;
  assets?: {
    cardImage?: string;
    icon?: string;
  };
  source?: {
    product: string;
    credit: string;
    url?: string;
  };
};
```

Example Resistance-style card:

```ts
export const resistance: CardDefinition = {
  id: "ability.resistance",
  name: "Resistance",
  kind: "ability",
  timing: "reaction",
  tags: ["instant", "spell", "defense"],
  trigger: {
    event: "SPELL_CAST_STARTED",
    controller: "opponent"
  },
  condition: {
    type: "CARD_IN_HAND"
  },
  effect: {
    type: "MODIFY_OR_CANCEL_SPELL",
    amount: 1
  }
};
```

The first version can use typed effect handlers instead of a complicated scripting language. Keep effect types explicit and tested.

## Card Effect Handler Pattern

Card definitions describe what they do. Effect handlers execute it.

```ts
const effectHandlers = {
  MODIFY_OR_CANCEL_SPELL: applyModifyOrCancelSpell,
  DEAL_DAMAGE: applyDealDamage,
  DRAW_CARDS: applyDrawCards,
  ADD_ATTACK: applyAddAttack,
  ADD_DEFENSE: applyAddDefense,
  MOVE_UNIT: applyMoveUnit
};
```

When adding new cards later:

- If the effect type already exists, add only data.
- If a card needs a new effect type, add one handler and tests.
- Do not write card-specific branches inside general combat/map logic.

## boardgame.io Integration

boardgame.io should manage:

- Room state.
- Player seats.
- Turn order.
- Phases.
- Random seed.
- Server-validated moves.
- Sync to clients.

The custom rules engine should manage:

- Legal actions.
- Card timing.
- Reactions.
- Combat resolution.
- Map/town rules.
- Event log.
- AI suggestions.

boardgame.io move example:

```ts
moves: {
  submitAction({ G, ctx, random }, action: GameAction) {
    const result = applyAction(G.engineState, action, { random, currentPlayer: ctx.currentPlayer });
    if (result.errors.length) {
      return INVALID_MOVE;
    }
    G.engineState = result.state;
  }
}
```

## Game Phases

Start with these phases:

```ts
type GamePhase =
  | "setup"
  | "round-start"
  | "player-turn"
  | "ai-turn"
  | "map"
  | "town"
  | "combat"
  | "reaction"
  | "cleanup"
  | "game-over";
```

Keep phase transitions explicit. Never transition phase from UI directly.

## Multiplayer Requirements

The multiplayer server must be authoritative.

Requirements:

- Players join a room with a room code.
- Each player has a seat/color/faction.
- Only legal players can submit moves.
- Hidden information stays hidden. A player should not receive another player's hand/deck order.
- Spectators can be added later, but not in MVP.
- Reconnect should restore the player to the current room.
- Game state should be saveable to Supabase.
- A full event log should be visible to all players, with hidden events redacted when needed.

## Hidden Information

Do not send full secret state to every client.

Server state can contain:

- All deck orders.
- All hands.
- Hidden card IDs.

Client view should contain only:

- Own hand.
- Public board.
- Public discard piles.
- Counts of opponent hand/deck.
- Revealed cards.

Create a function:

```ts
getPlayerView(state, playerId): PlayerVisibleState;
```

This is essential before serious multiplayer.

## AI Player Foundation

AI should use the same legal action system as humans.

AI flow:

1. Read current state.
2. Get legal actions.
3. Score legal actions by priority.
4. Choose one action.
5. Submit it like a player.

Do not make AI cheat unless scenario rules explicitly allow it.

AI helper functions:

```ts
getLegalActions(state, aiPlayerId);
scoreAiAction(state, action);
chooseAiAction(state, aiPlayerId, rng);
```

Future AI random card pools should also produce actions through the same engine.

## UI And Graphic Direction

The UI should feel like an actual board game table, not a marketing page.

Core screens:

- Lobby and room setup.
- Scenario setup.
- Main map board.
- Player hand.
- Hero sheet.
- Town board.
- Combat board.
- Reaction prompt modal/panel.
- Event/rules log.
- Credits/assets page.

Visual requirements:

- Use official-permitted art with clear credits.
- Every card should have a card image when available.
- The map board should use tile/field art where possible.
- Combat should show unit portraits/icons and board positions.
- Reaction windows should be impossible to miss.
- Legal actions should be highlighted.
- Illegal actions should explain why they are illegal.
- Keep UI dense and readable. Avoid giant hero landing sections inside the app.

## Reaction UI Requirements

When a reaction window opens:

- Freeze normal action controls.
- Show the triggering event.
- Show whose priority it is.
- Show legal reaction cards/buttons.
- Show a clear Pass button.
- Show timer only if the room uses timers.
- After all required players pass or respond, resume resolution.

Example:

```text
Reaction Window
Player 2 cast Magic Arrow on Dwarf.

You may respond:
- Resistance
- Interference
- Pass
```

## Build Phases From Scratch To Full App

### Phase 0: Repo And Project Setup

Goal: Create a clean Next.js TypeScript app with tests.

Tasks:

- Create Next.js app.
- Add TypeScript strict mode.
- Add ESLint/Prettier.
- Add Vitest.
- Add Playwright.
- Add basic app shell.
- Add credits placeholder.
- Add `.env.example`.

Definition of done:

- `npm run dev` works.
- `npm test` works.
- Home page loads.
- Credits page exists.

### Phase 1: Rules Engine Skeleton

Goal: Build the engine before the UI becomes complex.

Tasks:

- Add `GameState`.
- Add `GameAction`.
- Add `GameEvent`.
- Add `applyAction`.
- Add `getLegalActions`.
- Add deterministic seeded random helper.
- Add event log.
- Add basic errors.

Definition of done:

- Tests can create a game.
- A legal action changes state.
- An illegal action returns a useful error.
- Event log records actions.

### Phase 2: Reaction Window Prototype

Goal: Prove opponent-turn instant reactions work.

Tasks:

- Add `ReactionWindow`.
- Add `ResolutionStackItem`.
- Add `SPELL_CAST_STARTED`.
- Add one test spell.
- Add one test reaction card similar to Resistance.
- Add pass reaction action.
- Add stack resolution.

Definition of done:

- Spell cast opens a reaction window for opponent.
- Opponent can pass.
- Opponent can play reaction.
- Original spell resumes or is cancelled/modified.
- Tests cover all branches.

### Phase 3: Card Data Schema

Goal: Make future card additions data-first.

Tasks:

- Add `CardDefinition`.
- Add triggers, target definitions, costs, conditions, effects.
- Add effect handler registry.
- Add card validation tests.
- Add 5-10 sample cards.

Definition of done:

- Cards can be loaded from data files.
- Cards can be validated at startup.
- Adding a simple card requires no engine edit.

### Phase 4: boardgame.io Server Integration

Goal: Multiplayer rooms with server-validated moves.

Tasks:

- Add boardgame.io game definition.
- Add server package/script.
- Add room creation.
- Add player seats.
- Add `submitAction` move.
- Add player-visible state filtering.

Definition of done:

- Two browser tabs can join the same room.
- Player 1 action updates Player 2 screen.
- Illegal moves are rejected.
- Hidden hand data is not leaked.

### Phase 5: Basic Map Board

Goal: Play a simple map turn.

Tasks:

- Add map spaces.
- Add hero positions.
- Add movement points.
- Add legal move highlighting.
- Add guarded/blocked/empty spaces.
- Add visit/flag field actions.

Definition of done:

- Hero can move legally.
- Blocked spaces reject movement.
- Mine/settlement flagging updates ownership.
- Event log explains movement.

### Phase 6: Decks, Hands, Draw, Discard

Goal: Real card flow.

Tasks:

- Add deck state.
- Add shuffle/draw/discard.
- Add hands.
- Add visible/hidden state filtering.
- Add card play flow.

Definition of done:

- Player can draw cards.
- Player can play a legal card.
- Discard pile updates.
- Opponent sees only public information.

### Phase 7: Combat Engine

Goal: Build the hardest mechanical area with tests first.

Tasks:

- Add combat state.
- Add units, stats, positions, initiative.
- Add attack declarations.
- Add damage assignment.
- Add retaliation.
- Add ranged/flying/ground rules.
- Add combat reaction windows.
- Add combat end conditions.

Definition of done:

- Combat can start.
- Units activate in correct order.
- Attacks and damage resolve.
- Instant cards can react during combat.
- Combat ends and rewards/aftermath can continue.

### Phase 8: Town And Resource Engine

Goal: Support economy and build rules.

Tasks:

- Add resource state.
- Add income.
- Add town buildings.
- Add build restrictions.
- Add recruit/reinforce.
- Add mage/spell purchase actions.

Definition of done:

- Player can collect income.
- Player can build if affordable/legal.
- Used action tokens prevent duplicate actions.
- Illegal builds explain why.

### Phase 9: Real UI Pass

Goal: Move from debug UI to playable board game UI.

Tasks:

- Build map board UI.
- Build card hand UI.
- Build town UI.
- Build combat UI.
- Build reaction prompt.
- Build event log.
- Add art assets.
- Add responsive layout.

Definition of done:

- A non-developer can play a small scenario.
- Reaction prompts are clear.
- Cards and board elements have graphics.
- No text overlaps on desktop or mobile.

### Phase 10: Scenario Setup

Goal: Start real games from scenario presets.

Tasks:

- Add scenario definition schema.
- Add player count/faction setup.
- Add starting decks/heroes/towns.
- Add starting map.
- Add victory/loss conditions.

Definition of done:

- Player can select a scenario.
- Setup creates valid game state.
- Scenario-specific rules can be attached cleanly.

### Phase 11: AI Player

Goal: Add AI that uses legal actions only.

Tasks:

- Add AI legal action picker.
- Add map AI priority.
- Add combat AI priority.
- Add town AI priority.
- Add optional random AI card pool.
- Add AI explanation log.

Definition of done:

- AI can take a basic turn.
- AI can fight basic combat.
- AI never submits illegal actions.
- AI explanation appears in log.

### Phase 12: Full Content Import

Goal: Add real cards/heroes/units progressively.

Tasks:

- Import heroes.
- Import hero specialties.
- Import spells.
- Import abilities.
- Import artifacts.
- Import units.
- Import town/faction data.
- Add card image metadata.
- Add source/credit metadata.

Definition of done:

- Every imported card validates.
- Missing effects are listed clearly.
- Cards with unsupported effects are marked `notImplemented`.
- App does not crash from incomplete content.

### Phase 13: Production Deployment

Goal: Put the multiplayer app online safely.

Tasks:

- Create Supabase project.
- Add database schema.
- Add auth or guest sessions.
- Deploy frontend to Vercel.
- Deploy boardgame.io server to Railway/Render/Fly.
- Add environment variables.
- Add production logging.
- Add backup/export for saved games.

Definition of done:

- Public URL works.
- Two remote players can join and play.
- Reconnect works.
- Credits page is visible.
- No secrets are committed.

## Testing Strategy

Rules tests are more important than UI tests early.

Minimum test categories:

- Legal/illegal action tests.
- Reaction window tests.
- Stack resolution tests.
- Card effect tests.
- Combat tests.
- Map movement tests.
- Town build/resource tests.
- Multiplayer view filtering tests.
- AI action tests.

Before adding many cards, create a card validation test that fails if:

- Card ID is duplicated.
- Card has no name.
- Card uses unknown effect type.
- Card uses unknown trigger.
- Card uses missing asset.
- Card has no credit/source metadata.

## AI Development Workflow

Use AI in small sessions. Do not ask AI to build the full game at once.

Good AI prompts:

- "Create the TypeScript rules engine skeleton from `BUILD_BLUEPRINT.md` Phase 1 only. Add tests."
- "Add reaction windows from Phase 2. Use a test spell and Resistance-like card. Do not build UI yet."
- "Add card schema and effect handler registry from Phase 3. Add validation tests."
- "Add boardgame.io integration from Phase 4 using the existing engine. Keep server authoritative."
- "Add map movement UI for Phase 5. UI should call legal action helpers only."
- "Add one new card definition using the existing schema. Do not edit engine unless a new effect handler is needed."

Bad AI prompts:

- "Build the whole Heroes 3 board game."
- "Make the UI pretty first."
- "Add all cards now."
- "Just hardcode this one card quickly."
- "Let the client decide if the move is legal."

## Rules For Future Card Additions

When adding a new card:

1. Add a `CardDefinition`.
2. Reuse existing trigger/effect/condition types when possible.
3. Add tests for the card.
4. Add image and credit metadata.
5. Run validation tests.
6. Only add a new effect handler if the card truly needs a new mechanic.

If a card cannot be represented yet:

- Add it with `implementationStatus: "not-implemented"`.
- Add notes describing the missing trigger/effect.
- Do not fake the card with an incorrect effect.

## Definition Of A Stable Foundation

The foundation is stable when:

- Multiplayer rooms work.
- Actions are server-validated.
- Hidden information is filtered.
- Event log exists.
- Reaction windows work.
- Stack resolution works.
- Cards are data-driven.
- Combat can open reaction windows.
- Tests cover core mechanics.
- UI only submits actions and renders state.

After this point, future development can mostly be:

- Add new card data.
- Add new effect handlers when needed.
- Add art assets.
- Add scenario definitions.
- Improve UI.

## First Milestone Recommendation

Start with this milestone, not the full board:

**Milestone 1: Engine and Reaction Proof**

Build:

- Next.js TypeScript app.
- Pure TypeScript rules engine.
- Basic game state.
- Action/event system.
- Reaction window.
- One spell.
- One Resistance-like reaction.
- Tests proving the spell can be reacted to.

This proves the hardest future mechanic before any complex UI exists.

Only after Milestone 1 passes should the project add boardgame.io multiplayer rooms.
