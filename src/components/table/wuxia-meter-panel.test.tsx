// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createInitialGameState } from "@/engine";
import { resolveAnimeOptions } from "@/engine/anime";
import type { CultivationRealm } from "@/engine/anime-cultivation";
import type { GameState, PlayerId } from "@/engine/state";
import { getCultivationMeter } from "@/engine/wuxia-factions";
import { WuxiaMeterPanel } from "./wuxia-meter-panel";

/**
 * Wuxia meter panel (combat right rail). Everything shown comes from the
 * engine's `getCultivationMeter`, which reads the same capacity / per-round
 * limit helpers the rules spend and gain through.
 */
describe("WuxiaMeterPanel — Sect Qi / Blood Essence", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  function wuxiaCombat(
    seats: Partial<Record<PlayerId, { factionId: "azure_breeze" | "heavenly_demon"; heroDefId: string; realm: CultivationRealm }>>,
    records: NonNullable<NonNullable<GameState["combat"]>["cultivationFactions"]>
  ): GameState {
    const state = createInitialGameState("wuxia-meter-panel");
    state.anime = resolveAnimeOptions({ enabled: true, cultivation: true });
    for (const [playerId, seat] of Object.entries(seats)) {
      if (!seat) continue;
      state.players[playerId].factionId = seat.factionId;
      const hero = Object.values(state.heroes).find((candidate) => candidate.controllerId === playerId && candidate.kind === "main")!;
      hero.heroDefId = seat.heroDefId;
      hero.cultivationRealm = seat.realm;
    }
    state.combat!.cultivationFactions = records;
    return state;
  }

  function slotsOf(container: HTMLElement, label: string) {
    const list = container.querySelector(`ol[aria-label="${label}"]`);
    expect(list, label).toBeTruthy();
    const slots = [...list!.querySelectorAll("li")];
    return {
      total: slots.length,
      filled: slots.filter((slot) => slot.querySelector("img")).length,
      bonus: slots.filter((slot) => slot.title.includes("extra slot")).map((slot) => slot.title)
    };
  }

  it("draws Sect Qi against its realm capacity and this round's formation-link use", () => {
    const state = wuxiaCombat(
      { p1: { factionId: "azure_breeze", heroDefId: "jianxu", realm: 2 } },
      { p1: { sectQi: 3, sectQiGainedRound: state0Round(), sectQiLinkGains: 1 } }
    );
    const { container } = render(<WuxiaMeterPanel state={state} viewerPlayerId="p1" />);

    // Core Formation (realm 2) lifts the base 3 to 4: one extra, dashed slot.
    const slots = slotsOf(container, "3 of 4 Qi");
    expect(slots).toMatchObject({ total: 4, filled: 3 });
    expect(slots.bonus).toEqual(["Empty Qi slot 4 (extra slot from Core Formation)"]);
    expect(screen.getByText("Formation link 1/1 this round")).toBeTruthy();
    expect(screen.getByText("Core Formation", { selector: "span" })).toBeTruthy();
    // Jianxu is not a Sword Intent hero.
    expect(screen.queryByText(/^Intent/)).toBeNull();
    expect(screen.getByTitle(/Nascent Soul: .*not reached yet/)).toBeTruthy();
    expect(screen.getByTitle(/Foundation: Begin each combat with 1 Qi \(reached\)/)).toBeTruthy();
  });

  it("counts a new round's link as unused, adds the Sword Saint slot and shows Sword Intent for Qingyun", () => {
    const state = wuxiaCombat(
      { p1: { factionId: "azure_breeze", heroDefId: "qingyun", realm: 3 } },
      { p1: { sectQi: 0, sectQiGainedRound: state0Round() - 1, sectQiLinkGains: 2, swordIntent: 2 } }
    );
    const saint = Object.values(state.combat!.units).find((unit) => unit.controllerId === "p1")!;
    saint.commanderSlug = "sword_saint";
    const { container } = render(<WuxiaMeterPanel state={state} viewerPlayerId="p1" />);

    const slots = slotsOf(container, "0 of 5 Qi");
    expect(slots).toMatchObject({ total: 5, filled: 0 });
    expect(slots.bonus.map((title) => title.replace(/^Empty Qi slot \d /, ""))).toEqual([
      "(extra slot from Core Formation)",
      "(extra slot from Sword Saint)"
    ]);
    // Nascent Soul: two formation links per round, Sword Intent releases at 2.
    expect(screen.getByText("Formation link 0/2 this round")).toBeTruthy();
    expect(screen.getByText(/Intent 2\/2/).textContent).toContain("releases next attack");

    // The Sword Saint falls: the extra slot goes with it.
    saint.damage = saint.maxHealth;
    expect(getCultivationMeter(state, "p1")?.capacity).toBe(4);
  });

  it("draws Blood Essence with the round's Price, Harvest and Frenzy windows", () => {
    const round = state0Round();
    const state = wuxiaCombat(
      { p1: { factionId: "heavenly_demon", heroDefId: "yaoji", realm: 3 } },
      { p1: { bloodEssence: 2, bloodEssenceGainedRound: round, bloodFrenzySpentRound: round, bloodHarvestRound: round - 1 } }
    );
    const { container } = render(<WuxiaMeterPanel state={state} viewerPlayerId="p1" />);

    const slots = slotsOf(container, "2 of 5 Essence");
    expect(slots).toMatchObject({ total: 5, filled: 2 });
    expect(screen.getByText("Blood Price taken")).toBeTruthy();
    expect(screen.getByText("Harvest 0/1 this round")).toBeTruthy();
    // Devil Soul (realm 3): the Frenzy is +2, already spent this round.
    expect(screen.getByText("Frenzy +2 spent")).toBeTruthy();
  });

  it("lifts the Blood Price round limit for Shiyan and needs Essence to arm the Frenzy", () => {
    const state = wuxiaCombat(
      { p1: { factionId: "heavenly_demon", heroDefId: "shiyan", realm: 0 } },
      { p1: { bloodEssence: 0, bloodEssenceGainedRound: state0Round() } }
    );
    render(<WuxiaMeterPanel state={state} viewerPlayerId="p1" />);
    expect(screen.getByText("Blood Price · no round limit")).toBeTruthy();
    expect(screen.getByText("Frenzy +1 needs Essence")).toBeTruthy();
    expect(getCultivationMeter(state, "p1")?.capacity).toBe(4);
  });

  it("shows Sword Intent for Xuedao, a Heavenly Demon hero, but not for other Demon heroes", () => {
    const xuedao = wuxiaCombat(
      { p1: { factionId: "heavenly_demon", heroDefId: "xuedao", realm: 3 } },
      { p1: { bloodEssence: 1, swordIntent: 1 } }
    );
    render(<WuxiaMeterPanel state={xuedao} viewerPlayerId="p1" />);
    // Realm 3 lowers the release threshold to 2 for either faction's Intent hero.
    expect(screen.getByText(/Intent 1\/2/)).toBeTruthy();
    cleanup();

    const yaoji = wuxiaCombat({ p1: { factionId: "heavenly_demon", heroDefId: "yaoji", realm: 3 } }, { p1: { swordIntent: 1 } });
    render(<WuxiaMeterPanel state={yaoji} viewerPlayerId="p1" />);
    expect(screen.queryByText(/^Intent/)).toBeNull();
  });

  it("keeps Qi held above a fallen Sword Saint's capacity visible", () => {
    const state = wuxiaCombat({ p1: { factionId: "azure_breeze", heroDefId: "jianxu", realm: 0 } }, { p1: { sectQi: 4 } });
    const { container } = render(<WuxiaMeterPanel state={state} viewerPlayerId="p1" />);
    const slots = slotsOf(container, "4 of 3 Qi");
    expect(slots).toMatchObject({ total: 4, filled: 4 });
    expect(slots.bonus).toEqual([]);
    expect(container.querySelector('li[title="Qi 4 (held above the current capacity)"]')).toBeTruthy();
  });

  it("hides the realm row when the Cultivation module is off", () => {
    const state = wuxiaCombat({ p1: { factionId: "azure_breeze", heroDefId: "jianxu", realm: 3 } }, { p1: { sectQi: 1 } });
    state.anime = resolveAnimeOptions({ enabled: true, cultivation: false });
    const { container } = render(<WuxiaMeterPanel state={state} viewerPlayerId="p1" />);
    expect(container.querySelector('ol[aria-label="Cultivation Realm upgrades"]')).toBeNull();
    expect(slotsOf(container, "1 of 3 Qi").total).toBe(3);
  });

  it("shows both wuxia seats, viewer first, under one Cultivation header", () => {
    const state = wuxiaCombat(
      {
        p1: { factionId: "azure_breeze", heroDefId: "jianxu", realm: 0 },
        p2: { factionId: "heavenly_demon", heroDefId: "yaoji", realm: 0 }
      },
      { p1: { sectQi: 1 }, p2: { bloodEssence: 3 } }
    );
    render(<WuxiaMeterPanel state={state} viewerPlayerId="p2" />);
    const seats = screen.getAllByRole("region").filter((region) => /for /.test(region.getAttribute("aria-label") ?? ""));
    expect(seats.map((seat) => seat.getAttribute("aria-label")?.split(" for ")[0])).toEqual(["Blood Essence", "Sect Qi"]);
    expect(screen.getByRole("region", { name: "Cultivation meter" })).toBeTruthy();
  });

  it("renders nothing without a wuxia seat in the fight, and minimizes to its readout", () => {
    const plain = createInitialGameState("wuxia-meter-panel-none");
    const empty = render(<WuxiaMeterPanel state={plain} viewerPlayerId="p1" />);
    expect(empty.container.innerHTML).toBe("");
    empty.unmount();

    const state = wuxiaCombat({ p1: { factionId: "azure_breeze", heroDefId: "jianxu", realm: 0 } }, { p1: { sectQi: 2 } });
    const { container } = render(<WuxiaMeterPanel state={state} viewerPlayerId="p1" />);
    expect(screen.getByText("Qi 2/3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Minimize the Sect Qi panel" }));
    expect(container.querySelector('ol[aria-label="2 of 3 Qi"]')).toBeNull();
    expect(screen.getByText("Qi 2/3")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("homm3bg.wuxiaMeterPanel") ?? "{}").minimized).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Expand the Sect Qi panel" }));
    expect(container.querySelector('ol[aria-label="2 of 3 Qi"]')).toBeTruthy();
  });
});

/** The fixture combat's current round (createInitialGameState opens a combat). */
function state0Round(): number {
  return createInitialGameState("wuxia-meter-panel").combat!.round;
}
