// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HeroBoard } from "./hero-board";
import { HeroActionsDock } from "./adventure/hero-actions-dock";
import { MapDesigner } from "./adventure/map-designer";
import { CardZoomProvider } from "./table/zoom";
import {
  applyAction,
  createAdventureGameState,
  getLegalActions,
  getMainHero,
  EQUIPMENT_IDS,
  DEFAULT_ANIME_OPTIONS,
  type AnimeModOptions,
  type GameState,
} from "@/engine";

/**
 * Cross-mod COEXISTENCE GATE (d) — display coexistence (plan §3.8).
 *
 * Cheap jsdom smoke renders proving the anime displays COEXIST without collision
 * or crash when several are on at once. The deep per-feature render tests already
 * live in hero-board.test.tsx / hero-actions-dock.test.tsx / map-designer.test.tsx;
 * these only pin that the tracks render TOGETHER.
 */

afterEach(cleanup);

const ALL_TRACKS: AnimeModOptions = {
  ...DEFAULT_ANIME_OPTIONS,
  enabled: true,
  cultivation: true,
  heroGrades: true,
  equipment: true,
};

function allTracksAdventure(): GameState {
  const state = createAdventureGameState({
    seed: "anime-coexist-display",
    rollFirstPlayer: false,
    anime: ALL_TRACKS,
    players: [
      { id: "p1", name: "Chen", factionId: "castle", heroDefId: "catherine" },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" },
    ],
  });
  const hero = getMainHero(state, "p1")!;
  // Cultivation realm + Hero grade + all three equipment slots at once.
  hero.cultivationRealm = 2;
  hero.grade = 1;
  hero.gradeProgress = 4;
  hero.equipment = {
    weapon: EQUIPMENT_IDS.ironBloodSword,
    armor: EQUIPMENT_IDS.guildIssueMail,
    accessory: EQUIPMENT_IDS.supplySatchel,
  };
  return state;
}

describe("anime coexistence display — HeroBoard shows realm + grade + equipment together", () => {
  it("renders all three tracks simultaneously with no collision (chips coexist)", () => {
    const { container } = render(
      <CardZoomProvider>
        <HeroBoard state={allTracksAdventure()} playerId="p1" />
      </CardZoomProvider>,
    );
    // The Cultivation realm chip.
    const realm = container.querySelector(".hbRealm");
    expect(realm, "realm chip renders").toBeTruthy();
    expect(realm?.textContent).toContain("Core Formation");
    // The Hero Grade chip (xianxia register — cultivation is a xianxia module).
    const grade = container.querySelector(".hbGrade");
    expect(grade, "grade chip renders").toBeTruthy();
    expect(grade?.textContent).toContain("Merit 4");
    // All three equipment slot chips.
    const equipChips = container.querySelectorAll(".hbEquip");
    expect(equipChips, "three equipment chips render").toHaveLength(3);
    const equipText = Array.from(equipChips).map((c) => c.textContent).join(" | ");
    expect(equipText).toContain("Iron-Blood Sword");
    expect(equipText).toContain("Supply Satchel");
  });
});

describe("anime coexistence display — HeroActionsDock renders alongside the all-on board", () => {
  it("renders the hero-action dock (Hero Grades Train offer) under the all-on config", () => {
    let state = createAdventureGameState({
      seed: "anime-coexist-dock",
      difficulty: "normal",
      rollFirstPlayer: false,
      anime: ALL_TRACKS,
    });
    if (state.players.p1.needsHandRefresh || state.players.p1.canMulligan) {
      state = applyAction(state, { type: "REFRESH_HAND", playerId: "p1", discardCardIds: [] }).state;
    }
    const hero = getMainHero(state, "p1")!;
    hero.spaceId = "start";
    hero.movementPoints = 5;
    const legalActions = getLegalActions(state, "p1");
    // The engine offers HERO_TRAIN in this all-on fixture (grades module live).
    expect(legalActions.some((entry) => entry.action.type === "HERO_TRAIN")).toBe(true);
    const { container } = render(<HeroActionsDock legalActions={legalActions} onAction={vi.fn()} />);
    expect(container.querySelector(".heroActionsDock"), "the dock renders").toBeTruthy();
    expect(screen.getByRole("button", { name: /Train/ })).toBeTruthy();
  });
});

describe("anime coexistence display — the map-designer Field Override palette lists both packages", () => {
  it("the mod panel lists a xianxia AND an isekai kind together (cross-package coexistence)", () => {
    const { getByTestId, queryByTestId } = render(
      <MapDesigner scenarioId="skirmish" customMap={[]} onChange={() => {}} />,
    );
    // Open the Anime Mod panel.
    fireEvent.click(getByTestId("designer-mod-panel-toggle"));
    expect(getByTestId("designer-mod-panel"), "mod panel opens").toBeTruthy();
    // A xianxia kind and an isekai kind both appear in the SAME palette.
    expect(getByTestId("mod-override-bi_canh"), "xianxia kind listed").toBeTruthy();
    expect(getByTestId("mod-override-capsule_lab"), "isekai kind listed").toBeTruthy();
    // DOCUMENTED LIMIT (surfaced by this gate, not a collision): the two
    // equipment outfitters carry `requiresModule: "equipment"` and are
    // deliberately gated OUT of the ungated designer palette (a conscious §3.13
    // decision, pinned in src/engine/anime-equipment.test.ts). So the designer
    // cannot pin an outfitter today — noted in CLAUDE.md, not changed here.
    expect(queryByTestId("mod-override-ren_binh_cac"), "equipment market gated out of the palette").toBeNull();
    expect(queryByTestId("mod-override-adventurer_outfitter")).toBeNull();
  });
});
