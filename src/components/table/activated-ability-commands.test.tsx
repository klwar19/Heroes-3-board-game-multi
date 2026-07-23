// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandDock, COMMAND_ACTION_TYPES } from "./board";
import { CardZoomProvider } from "./zoom";
import { applyAction, createInitialGameState, getLegalActions } from "@/engine";
import type { GameAction, GameState, PlayerId } from "@/engine";

afterEach(cleanup);

/**
 * INVARIANT (CLAUDE.md rule #1 / #1a): every ACTIVATED unit ability a player
 * drives on their unit's own combat activation must SURFACE somewhere the player
 * can act on it — never an engine offer with no UI. There are exactly two working
 * surfaces:
 *
 *   1. a COMMAND legal action (`USE_UNIT_ABILITY` / `SUMMON_DEMONS` /
 *      `USE_GENIE_DECK_DRAW`) whose type is in the command dock's
 *      `COMMAND_ACTION_TYPES` (Genie Wish, Ogre/Sorceress token, Dreadnought
 *      splash, Summon Demons) — rendered as a labelled command button; or
 *   2. an auto-opened `pendingChoice` the reducer raises the instant the unit
 *      becomes active (Couatl invulnerability, Automaton Overcharge, Enchanter
 *      heal, Faerie Bolt) — the player resolves it as a prompt.
 *
 * This test pins BOTH surfaces. It is mutation-checked: delete an offer in
 * legal-actions, drop its type from COMMAND_ACTION_TYPES in board.tsx, or delete
 * the auto-open block in the reducer, and the matching case fails.
 */

const ABILITY_COMMAND_TYPES = new Set<GameAction["type"]>([
  "USE_UNIT_ABILITY",
  "SUMMON_DEMONS",
  "USE_GENIE_DECK_DRAW"
]);

function applyOk(state: GameState, action: GameAction): GameState {
  const result = applyAction(state, action);
  expect(result.errors, result.errors.map((e) => e.message).join("; ")).toEqual([]);
  return result.state;
}

function setActive(state: GameState, playerId: PlayerId, unitId: string): void {
  state.activePlayerId = playerId;
  state.combat!.activeUnitId = unitId;
}

/** Bring `nextId` up as the fresh active unit through a real activation
 * transition, so the reducer's activation-choice opener runs (mirrors the
 * helper in factory-gold-abilities.test.ts). */
function makeNextActive(state: GameState, starterId: string, nextId: string): GameState {
  const combat = state.combat!;
  for (const unit of Object.values(combat.units)) {
    unit.activatedThisRound = unit.id !== starterId && unit.id !== nextId;
    unit.defendedLastActivation = false;
  }
  setActive(state, combat.units[starterId].controllerId, starterId);
  return applyOk(state, { type: "DEFEND_UNIT", playerId: combat.units[starterId].controllerId, unitId: starterId });
}

/** Active griffins carries only `abilityId`, obstacles cleared, p1 to act. */
function withActiveAbility(abilityId: string, seed: string, setup?: (s: GameState) => void): GameState {
  const s = createInitialGameState(seed);
  s.combat!.obstacles = [];
  s.combat!.units.unit_p1_griffins.abilities = [abilityId];
  setup?.(s);
  setActive(s, "p1", "unit_p1_griffins");
  return s;
}

// ---------------------------------------------------------------------------
// Surface 1 — command legal actions rendered by the command dock.
// ---------------------------------------------------------------------------

const COMMAND_ABILITY_SPECS: {
  id: string;
  /** the command label must NAME the ability / effect (a "proper" command). */
  label: RegExp;
  setup?: (s: GameState) => void;
}[] = [
  { id: "genie-spell-draw-few", label: /wish/i, setup: (s) => { s.players.p1.deck = ["spell.magic_arrow", "stat.power"]; } },
  { id: "ogres-attack-token-few", label: /bloodlust/i },
  { id: "ogres-attack-token-pack", label: /bloodlust/i },
  { id: "sorceress-weakness-few", label: /weakness/i },
  { id: "dreadnought-splash-1", label: /concussive/i },
  { id: "dreadnought-splash-2", label: /concussive/i },
  { id: "summon-demons", label: /summon/i, setup: (s) => { s.combat!.unitRemovedControllerIds = ["p1"]; } }
];

describe("activated abilities surface as command buttons", () => {
  for (const spec of COMMAND_ABILITY_SPECS) {
    it(`${spec.id}: offered by getLegalActions AND covered by COMMAND_ACTION_TYPES with a naming label`, () => {
      const s = withActiveAbility(spec.id, `cmd-${spec.id}`, spec.setup);
      const offered = getLegalActions(s, "p1").filter((l) => ABILITY_COMMAND_TYPES.has(l.action.type));
      const match = offered.find((l) => spec.label.test(l.label));
      // (a) the engine offers a command for it…
      expect(match, `getLegalActions must offer an ability command for ${spec.id}`).toBeTruthy();
      // (b) …and the command dock renders that action type (no orphan offer).
      expect(
        COMMAND_ACTION_TYPES.has(match!.action.type),
        `COMMAND_ACTION_TYPES must cover ${match!.action.type} so the dock renders it`
      ).toBe(true);
    });
  }

  it("CONTROL: Genie Pack (on-attack trigger) offers NO activation command before it attacks", () => {
    const s = withActiveAbility("genie-spell-draw-pack", "cmd-genie-pack", (st) => {
      st.players.p1.deck = ["spell.magic_arrow", "stat.power"];
    });
    const offered = getLegalActions(s, "p1").filter((l) => ABILITY_COMMAND_TYPES.has(l.action.type));
    expect(offered, "the Pack's Wish fires on its attack, so no activation command is shown").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Surface 2 — auto-opened activation-choice prompts (the OTHER working surface,
// pinned so the invariant covers every activated ability, not just the buttons).
// ---------------------------------------------------------------------------

const PROMPT_ABILITY_SPECS: {
  id: string;
  kind: string;
  setup?: (s: GameState) => void;
}[] = [
  { id: "couatl-invulnerability-few", kind: "couatl-invulnerability" },
  { id: "automaton-place-cube", kind: "automaton-cube" },
  { id: "faerie-dragon-spell", kind: "faerie-damage" },
  {
    id: "enchanter-heal-or-buff",
    kind: "enchanter-activation",
    // Enchant opens its heal picker only with a wounded OTHER ally to mend.
    setup: (s) => {
      const ally = s.combat!.units.unit_p1_crusaders;
      ally.damage = Math.max(1, ally.maxHealth - 1);
    }
  }
];

describe("activated abilities surface as auto-opened prompts", () => {
  for (const spec of PROMPT_ABILITY_SPECS) {
    it(`${spec.id}: raises its "${spec.kind}" choice the instant the unit becomes active`, () => {
      const s = createInitialGameState(`prompt-${spec.id}`);
      s.combat!.obstacles = [];
      s.players.p1.hand = [];
      s.players.p2.hand = [];
      s.combat!.units.unit_p1_griffins.abilities = [spec.id];
      spec.setup?.(s);
      const opened = makeNextActive(s, "unit_p1_marksmen", "unit_p1_griffins");
      const choice = opened.pendingChoice;
      expect(choice?.type, `${spec.id} should auto-open an ABILITY_TARGET_CHOICE`).toBe("ABILITY_TARGET_CHOICE");
      if (choice?.type !== "ABILITY_TARGET_CHOICE") return;
      expect(choice.kind, `${spec.id} should open the ${spec.kind} choice`).toBe(spec.kind);
    });
  }
});

// ---------------------------------------------------------------------------
// End-to-end DOM: the user's named example. The Genie Few command renders as a
// labelled button and clicking it dispatches the right action; the Pack does not.
// ---------------------------------------------------------------------------

describe("Genie command dock — DOM", () => {
  function genieState(abilityId: string, seed: string): GameState {
    const s = createInitialGameState(seed);
    const g = s.combat!.units.unit_p1_griffins;
    g.abilities = [abilityId];
    g.name = "Genies";
    g.cardName = "Genies";
    s.players.p1.deck = ["spell.magic_arrow", "stat.power", "stat.defense"];
    s.players.p1.hand = [];
    s.players.p1.discard = [];
    setActive(s, "p1", "unit_p1_griffins");
    return s;
  }

  it("Genie Few: the Wish command renders as a labelled button and dispatches USE_GENIE_DECK_DRAW", () => {
    const s = genieState("genie-spell-draw-few", "genie-dom-few");
    const legal = getLegalActions(s, "p1");
    const onAction = vi.fn();
    const { container } = render(
      <CardZoomProvider>
        <CommandDock legalActions={legal} onAction={onAction} onReset={() => {}} state={s} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const wish = [...container.querySelectorAll("button")].find((b) => /wish/i.test(b.textContent ?? ""));
    expect(wish, "the Genie's Wish command button must render").toBeTruthy();
    expect(wish!.textContent, "the label names the ability and what it does").toMatch(/take a Spell/i);
    fireEvent.click(wish!);
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: "USE_GENIE_DECK_DRAW", playerId: "p1", unitId: "unit_p1_griffins" })
    );
  });

  it("CONTROL: Genie Pack (on-attack) shows NO Wish command button", () => {
    const s = genieState("genie-spell-draw-pack", "genie-dom-pack");
    const legal = getLegalActions(s, "p1");
    const { container } = render(
      <CardZoomProvider>
        <CommandDock legalActions={legal} onAction={vi.fn()} onReset={() => {}} state={s} viewerPlayerId="p1" />
      </CardZoomProvider>
    );
    const wish = [...container.querySelectorAll("button")].find((b) => /wish/i.test(b.textContent ?? ""));
    expect(wish, "the Pack's Wish is attack-triggered, so no activation command shows").toBeFalsy();
  });
});
