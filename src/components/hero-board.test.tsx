// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HeroBoard } from "./hero-board";
import { CardZoomProvider } from "./table/zoom";
import { cardLibrary } from "@/data/cards/library";
import type { FactionId } from "@/data/factions/types";
import { createAdventureGameState, getMainHero, type GameAction, type GameState, type PlayerId } from "@/engine";

afterEach(cleanup);

/** A 2-player adventure where p1 fields the given Bulwark hero. */
function bulwarkAdventure(heroDefId: string): GameState {
  return createAdventureGameState({
    seed: `hero-board-${heroDefId}`,
    rollFirstPlayer: false,
    players: [
      { id: "p1", name: heroDefId, factionId: "bulwark", heroDefId },
      { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
    ]
  });
}

function renderHeroBoard(heroDefId: string) {
  return render(
    <CardZoomProvider>
      <HeroBoard state={bulwarkAdventure(heroDefId)} playerId="p1" />
    </CardZoomProvider>
  );
}

function renderBoardState(state: GameState, playerId: PlayerId = "p1") {
  return render(
    <CardZoomProvider>
      <HeroBoard state={state} playerId={playerId} />
    </CardZoomProvider>
  );
}

describe("HeroBoard — new Bulwark heroes render on the table", () => {
  it("draws Eikthurn (Chieftain) with his name banner, class and starting stats", () => {
    renderHeroBoard("eikthurn");
    expect(screen.getByLabelText("Eikthurn hero board")).toBeTruthy();
    expect(screen.getByText("Eikthurn")).toBeTruthy();
    expect(screen.getByText("Chieftain")).toBeTruthy();
    // The Chieftain's printed statistic cards (attack 2 / defense 2) are shown.
    expect(screen.getByTitle("Attack 2")).toBeTruthy();
    expect(screen.getByTitle("Defense 2")).toBeTruthy();
  });

  it("draws Oidana (Elder) — the diplomat / card-draw hero", () => {
    renderHeroBoard("oidana");
    expect(screen.getByLabelText("Oidana hero board")).toBeTruthy();
    expect(screen.getByText("Oidana")).toBeTruthy();
    expect(screen.getByText("Elder")).toBeTruthy();
    // An Elder's loadout: Power 2 / Knowledge 2.
    expect(screen.getByTitle("Power 2")).toBeTruthy();
    expect(screen.getByTitle("Knowledge 2")).toBeTruthy();
  });

  it("renders a different name/class for each hero (the board is hero-specific)", () => {
    const { unmount } = renderHeroBoard("eikthurn");
    expect(screen.queryByText("Oidana")).toBeNull();
    unmount();
    renderHeroBoard("oidana");
    expect(screen.queryByText("Eikthurn")).toBeNull();
  });
});

// jsdom cannot compute CSS, so the golden-frame LOOK is not asserted here (it
// is CSS-only, see globals.css .hbSlotSpecialty.gained/.preview); these pin the
// WIRING — which class each LEVEL-TRACK slot carries and that its card art is
// drawn from the start — so a browser paints earned-gold vs dimmed-preview.
describe("HeroBoard — the Ⅰ/Ⅳ/Ⅵ specialty cards live in the LEVEL-TRACK boxes", () => {
  it("shows all three specialty cards in the track from level 1; only Ⅰ is earned (golden), Ⅳ/Ⅵ are dimmed previews", () => {
    const { container } = renderBoardState(bulwarkAdventure("eikthurn")); // starts at level 1
    const slots = container.querySelectorAll(".hbTrack .hbSlotSpecialty");
    expect(slots).toHaveLength(3);
    // Every slot renders its card art from the very beginning (no empty box).
    for (const slot of slots) {
      expect(slot.querySelector(".hbArt")).toBeTruthy();
    }
    expect(container.querySelectorAll(".hbTrack .hbSlotSpecialty.gained")).toHaveLength(1);
    expect(container.querySelectorAll(".hbTrack .hbSlotSpecialty.preview")).toHaveLength(2);
  });

  it("CONTROL — the golden wrap tracks the hero level: at level 4, Ⅰ and Ⅳ are earned", () => {
    const state = bulwarkAdventure("eikthurn");
    getMainHero(state, "p1")!.level = 4;
    const { container } = renderBoardState(state);
    expect(container.querySelectorAll(".hbTrack .hbSlotSpecialty.gained")).toHaveLength(2);
    expect(container.querySelectorAll(".hbTrack .hbSlotSpecialty.preview")).toHaveLength(1);
  });

  it("the loadout area keeps ONLY the single current-specialty icon (no card row up top)", () => {
    const { container } = renderBoardState(bulwarkAdventure("eikthurn"));
    expect(container.querySelectorAll(".hbLoadout .hbSpecialty")).toHaveLength(1);
    expect(container.querySelector(".hbSpecialtyRow")).toBeNull();
    expect(container.querySelector(".hbSpecCard")).toBeNull();
  });
});

describe("HeroBoard — anime Cultivation realm chip (§5.6)", () => {
  function cultivationAdventure(): GameState {
    return createAdventureGameState({
      seed: "hero-board-cultivation",
      rollFirstPlayer: false,
      anime: { enabled: true, cultivation: true },
      players: [
        { id: "p1", name: "chen", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
  }

  it("shows the realm name (EN + VI) on the board when the module is on", () => {
    const state = cultivationAdventure();
    getMainHero(state, "p1")!.cultivationRealm = 2;
    const { container } = renderBoardState(state);
    const chip = container.querySelector(".hbRealm");
    expect(chip).toBeTruthy();
    expect(chip?.textContent).toContain("Master");
    expect(chip?.textContent).toContain("Bậc Thầy");
  });

  it("reads the classic realm 0 name when the hero has no stamped realm", () => {
    const { container } = renderBoardState(cultivationAdventure());
    expect(container.querySelector(".hbRealm")?.textContent).toContain("Novice");
  });

  it("CONTROL — with the module OFF, no realm chip renders", () => {
    // The default Bulwark adventure carries no anime options.
    const { container } = renderHeroBoard("eikthurn");
    expect(container.querySelector(".hbRealm")).toBeNull();
  });
});

describe("HeroBoard — progression wording follows the rendered hero's faction", () => {
  function progressionAdventure(factionId: FactionId, heroDefId: string): GameState {
    return createAdventureGameState({
      seed: `hero-board-progression-${factionId}`,
      rollFirstPlayer: false,
      anime: { enabled: true, cultivation: true, heroGrades: true, xianxiaTowns: true, isekaiTowns: true },
      players: [
        { id: "p1", name: factionId, factionId, heroDefId },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
  }

  const cases: Array<{ factionId: FactionId; heroDefId: string; progress: string; realm: string; grade: string }> = [
    { factionId: "castle", heroDefId: "catherine", progress: "Level Ⅰ · XP 0/12", realm: "Novice · Tập Sự", grade: "Recruit · Tân Binh" },
    { factionId: "fuyuki", heroDefId: "bin", progress: "Lv Ⅰ · EXP 0/12", realm: "Awakened · Thức Tỉnh", grade: "Rank F · Hạng F" },
    { factionId: "azure_breeze", heroDefId: "qingyun", progress: "Stage Ⅰ · Cultivation 0/12", realm: "Qi Refinement · Luyện Khí", grade: "Martial Artist · Võ Giả" },
    { factionId: "heavenly_demon", heroDefId: "xuedao", progress: "Stage Ⅰ · Cultivation 0/12", realm: "Blood Refinement · Luyện Huyết", grade: "Blood Adept · Huyết Đồ" },
    { factionId: "azur_lane", heroDefId: "enterprise", progress: "Lv Ⅰ · EXP 0/12", realm: "Awakened · Thức Tỉnh", grade: "Common · Thường" }
  ];

  for (const { factionId, heroDefId, progress, realm, grade } of cases) {
    it(`${factionId} renders its own level, realm and grade vocabulary`, () => {
      const { container, unmount } = renderBoardState(progressionAdventure(factionId, heroDefId));
      expect(container.querySelector(".hbFooter > span")?.textContent?.trim()).toBe(progress);
      expect(container.querySelector(".hbRealm")?.textContent).toContain(realm);
      expect(container.querySelector(".hbGrade")?.textContent).toContain(grade);
      unmount();
    });
  }
});

describe("HeroBoard — anime Hero Grades chip + picker (§3.11)", () => {
  function gradesAdventure(anime: Record<string, unknown> = { enabled: true, heroGrades: true }): GameState {
    return createAdventureGameState({
      seed: "hero-board-grades",
      rollFirstPlayer: false,
      anime,
      players: [
        { id: "p1", name: "chen", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
  }

  it("shows the grade chip + Merit progress using the resolved register (core for a plain table)", () => {
    const state = gradesAdventure();
    const hero = getMainHero(state, "p1")!;
    hero.grade = 1;
    hero.gradeProgress = 4;
    const { container } = renderBoardState(state);
    const chip = container.querySelector(".hbGrade");
    expect(chip).toBeTruthy();
    // Neither package active → per-faction (castle = core) register.
    expect(chip?.textContent).toContain("Veteran");
    expect(chip?.textContent).toContain("Merit 4");
  });

  it("keeps a Castle hero on the classic register when a xianxia module is on", () => {
    const state = gradesAdventure({ enabled: true, heroGrades: true, cultivation: true });
    getMainHero(state, "p1")!.grade = 1;
    const { container } = renderBoardState(state);
    expect(container.querySelector(".hbGrade")?.textContent).toContain("Veteran");
    expect(container.querySelector(".hbGrade")?.textContent).not.toContain("Expert");
  });

  it("renders a node picker with unspent points and dispatches HERO_GRADE_PICK on click", () => {
    const state = gradesAdventure();
    const hero = getMainHero(state, "p1")!;
    hero.grade = 1;
    hero.gradePoints = 1;
    const dispatched: unknown[] = [];
    const { container } = render(
      <CardZoomProvider>
        <HeroBoard state={state} playerId="p1" onAction={(action) => dispatched.push(action)} />
      </CardZoomProvider>
    );
    const pick = container.querySelector(".hbGradePick");
    expect(pick, "a pick button should render with an unspent point").toBeTruthy();
    fireEvent.click(pick as Element);
    expect(dispatched).toHaveLength(1);
    expect((dispatched[0] as { type: string }).type).toBe("HERO_GRADE_PICK");
  });

  it("opens the full skill/passive tree and learns from an available node", () => {
    const state = gradesAdventure();
    const hero = getMainHero(state, "p1")!;
    hero.grade = 1;
    hero.gradePoints = 1;
    const dispatched: unknown[] = [];
    render(
      <CardZoomProvider>
        <HeroBoard state={state} playerId="p1" onAction={(action) => dispatched.push(action)} />
      </CardZoomProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Hero Grade/i }));
    expect(screen.getByRole("dialog", { name: "Hero Grade" })).toBeTruthy();
    const available = document.querySelector(".heroGradeNode.available");
    expect(available).toBeTruthy();
    fireEvent.click(available as Element);
    expect((dispatched[0] as { type: string }).type).toBe("HERO_GRADE_PICK");
  });

  it("CONTROL — with the module OFF, no grade chip renders", () => {
    const { container } = renderHeroBoard("eikthurn");
    expect(container.querySelector(".hbGrade")).toBeNull();
  });
});

describe("HeroBoard — anime Equipment chips (§3.13)", () => {
  function equipmentAdventure(anime: Record<string, unknown> = { enabled: true, equipment: true }): GameState {
    return createAdventureGameState({
      seed: "hero-board-equip",
      rollFirstPlayer: false,
      anime,
      players: [
        { id: "p1", name: "chen", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
  }

  it("opens a graphic four-slot equipment window", () => {
    renderBoardState(equipmentAdventure());
    fireEvent.click(screen.getByRole("button", { name: /Hero Equipment/i }));
    const dialog = screen.getByRole("dialog", { name: "Hero Equipment" });
    expect(dialog.querySelectorAll(".equipmentSlot")).toHaveLength(4);
    expect(dialog.querySelector(".equipmentSilhouette")).toBeTruthy();
    expect(dialog.querySelector(".equipmentSilhouette img")).toBeTruthy();
  });

  it("dispatches real equip and unequip actions from the paper-doll controls", () => {
    const state = equipmentAdventure();
    const hero = getMainHero(state, "p1")!;
    hero.equipment = { armor: "anime.equip.black_tortoise_mail" };
    hero.equipmentInventory = ["anime.equip.iron_blood_sword"];
    const dispatched: GameAction[] = [];
    render(
      <CardZoomProvider>
        <HeroBoard state={state} playerId="p1" onAction={(action) => dispatched.push(action)} />
      </CardZoomProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Hero Equipment/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Equip$/i }));
    expect(dispatched[0]).toEqual({
      type: "EQUIP_HERO_ITEM",
      playerId: "p1",
      equipmentId: "anime.equip.iron_blood_sword",
      slot: "weapon"
    });
    fireEvent.click(screen.getByRole("button", { name: "Unequip" }));
    expect(dispatched[1]).toEqual({ type: "UNEQUIP_HERO_ITEM", playerId: "p1", slot: "armor" });
  });

  it("shows a chip (item icon + EN/VI name) for each equipped item when the module is on", () => {
    const state = equipmentAdventure();
    getMainHero(state, "p1")!.equipment = {
      weapon: "anime.equip.iron_blood_sword",
      accessory: "anime.equip.supply_satchel"
    };
    const { container } = renderBoardState(state);
    const chips = container.querySelectorAll(".hbEquip");
    expect(chips).toHaveLength(2);
    const text = Array.from(chips).map((chip) => chip.textContent).join(" | ");
    expect(text).toContain("Iron-Blood Sword");
    expect(text).toContain("Thiết Huyết Kiếm"); // VI name
    expect(text).toContain("Supply Satchel");
    // Real item icons (art shipped 2026-07) draw instead of the slot glyph.
    const icons = Array.from(container.querySelectorAll(".hbEquipIcon")).map((img) => img.getAttribute("src") ?? "");
    expect(icons.some((src) => src.includes("/assets/anime/equipment/iron_blood_sword.webp"))).toBe(true);
    expect(icons.some((src) => src.includes("/assets/anime/equipment/supply_satchel.webp"))).toBe(true);
  });

  it("renders a chip for the 4th (MOUNT) slot — all four slots filled show four chips", () => {
    const state = equipmentAdventure();
    getMainHero(state, "p1")!.equipment = {
      weapon: "anime.equip.iron_blood_sword",
      armor: "anime.equip.black_tortoise_mail",
      accessory: "anime.equip.supply_satchel",
      mount: "anime.equip.windrider_saddle"
    };
    const { container } = renderBoardState(state);
    const chips = container.querySelectorAll(".hbEquip");
    expect(chips).toHaveLength(4);
    const text = Array.from(chips).map((chip) => chip.textContent).join(" | ");
    expect(text).toContain("Windrider Saddle"); // the mount chip is present
    const icons = Array.from(container.querySelectorAll(".hbEquipIcon")).map((img) => img.getAttribute("src") ?? "");
    expect(icons.some((src) => src.includes("/assets/anime/equipment/windrider_saddle.webp"))).toBe(true);
  });

  it("CONTROL — with the module OFF, no equipment chip renders (even if a field is stamped)", () => {
    const state = equipmentAdventure({}); // no anime options
    getMainHero(state, "p1")!.equipment = { weapon: "anime.equip.iron_blood_sword" };
    const { container } = renderBoardState(state);
    expect(container.querySelector(".hbEquip")).toBeNull();
  });
});

describe("HeroBoard — equipment window grade chips, grouping & upgrade hint (§3.13)", () => {
  function equipmentAdventure(): GameState {
    return createAdventureGameState({
      seed: "hero-board-equip-window",
      rollFirstPlayer: false,
      anime: { enabled: true, equipment: true },
      players: [
        { id: "p1", name: "chen", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    });
  }

  function openWindow(state: GameState): HTMLElement {
    render(
      <CardZoomProvider>
        <HeroBoard state={state} playerId="p1" onAction={() => {}} />
      </CardZoomProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /Hero Equipment/i }));
    return screen.getByRole("dialog", { name: "Hero Equipment" });
  }

  it("renders a grade chip on the equipped slot AND for every catalog item, tinted by grade", () => {
    const state = equipmentAdventure();
    getMainHero(state, "p1")!.equipment = { weapon: "anime.equip.iron_blood_sword" }; // Grade I
    const dialog = openWindow(state);
    // The filled weapon slot shows a Grade I chip (bronze tint class).
    const slotChip = dialog.querySelector(".equipmentSlot.slot-weapon .equipGradeChip");
    expect(slotChip?.classList.contains("gradeI")).toBe(true);
    expect(slotChip?.textContent).toBe("I");
    // The catalog carries chips of all three grades (bronze / silver / gold).
    expect(dialog.querySelector(".equipGradeChip.gradeI")).toBeTruthy();
    expect(dialog.querySelector(".equipGradeChip.gradeII")).toBeTruthy();
    expect(dialog.querySelector(".equipGradeChip.gradeIII")).toBeTruthy();
  });

  it("groups the bag by slot (one group per slot) with a package flavour tag per item", () => {
    const dialog = openWindow(equipmentAdventure());
    // One group per equipment slot: weapon / armor / accessory / mount.
    expect(dialog.querySelectorAll(".equipmentCatalogGroup")).toHaveLength(4);
    expect(dialog.querySelectorAll(".equipmentCatalogGroupHead")).toHaveLength(4);
    // Package flavour tags cover the classic line, the shared gear and an anime line.
    const tagClasses = Array.from(dialog.querySelectorAll(".equipmentPkgTag")).map((tag) => tag.className);
    expect(tagClasses.some((cls) => cls.includes("pkg-classic"))).toBe(true);
    expect(tagClasses.some((cls) => cls.includes("pkg-shared"))).toBe(true);
    expect(tagClasses.some((cls) => cls.includes("pkg-xianxia"))).toBe(true);
  });

  it("shows an upgrade hint when a HIGHER-grade bag item exists for a filled slot", () => {
    const state = equipmentAdventure();
    const hero = getMainHero(state, "p1")!;
    hero.equipment = { weapon: "anime.equip.iron_blood_sword" }; // Grade I worn
    hero.equipmentInventory = ["anime.equip.blade_of_the_trial"]; // Grade II weapon in bag
    const dialog = openWindow(state);
    const hint = dialog.querySelector(".equipmentUpgradeHint");
    expect(hint).toBeTruthy();
    expect(hint?.textContent).toContain("Blade of the Trial");
  });

  it("CONTROL — no upgrade hint when the bag holds only a LOWER-grade item for the slot", () => {
    const state = equipmentAdventure();
    const hero = getMainHero(state, "p1")!;
    hero.equipment = { weapon: "anime.equip.blade_of_the_trial" }; // Grade II worn
    hero.equipmentInventory = ["anime.equip.iron_blood_sword"]; // Grade I (lower) in bag
    const dialog = openWindow(state);
    expect(dialog.querySelector(".equipmentUpgradeHint")).toBeNull();
  });
});

describe("HeroBoard — Feature B: the kept level-up Ability at levels 2/3/5/7", () => {
  it("renders the kept Ability card in the level slot when a pick is recorded", () => {
    const state = bulwarkAdventure("eikthurn");
    getMainHero(state, "p1")!.level = 3;
    state.players.p1.levelUpAbilityPicks = { 2: "ability.offense" };
    const { container } = renderBoardState(state);
    // Exactly the level-2 slot becomes an ability-pick tile.
    expect(container.querySelectorAll(".hbSlotAbilityPick")).toHaveLength(1);
    // Its tooltip names the kept ability card.
    const offenseName = cardLibrary["ability.offense"].name;
    expect(screen.getByTitle(new RegExp(`kept ${offenseName}`))).toBeTruthy();
  });

  it("CONTROL — with no pick recorded, the level shows the bare Search marker (no pick tile)", () => {
    const state = bulwarkAdventure("eikthurn");
    getMainHero(state, "p1")!.level = 3;
    const { container } = renderBoardState(state); // no levelUpAbilityPicks
    expect(container.querySelectorAll(".hbSlotAbilityPick")).toHaveLength(0);
    // The plain Search-glyph slot is still drawn.
    expect(container.querySelector(".hbSlotSearch .hbIcon")).toBeTruthy();
  });

  it("renders an OPPONENT's board from the same component (opponent-info modal path)", () => {
    // The opponent-info modal passes the opponent's seat as playerId; the pick
    // record is public, so it renders identically for p2.
    const state = bulwarkAdventure("eikthurn");
    getMainHero(state, "p2")!.level = 3;
    state.players.p2.levelUpAbilityPicks = { 2: "ability.offense" };
    const { container } = renderBoardState(state, "p2");
    expect(container.querySelectorAll(".hbSlotAbilityPick")).toHaveLength(1);
  });
});

describe("HeroBoard — Unit Experience Board system button", () => {
  function xpAdventure(unitExperience: boolean): GameState {
    const state = createAdventureGameState({
      seed: "hero-board-unitxp",
      rollFirstPlayer: false,
      ...(unitExperience ? { unitExperience: true } : {}),
      players: [
        { id: "p1", name: "chen", factionId: "castle", heroDefId: "catherine" },
        { id: "p2", name: "Sandro", factionId: "necropolis", heroDefId: "sandro" }
      ]
    } as Parameters<typeof createAdventureGameState>[0]);
    state.players.p1.army = [{ id: "vets", unitDefId: "castle.marksmen", side: "few", experience: 5 }];
    return state;
  }

  it("opens the Unit Experience Board window from the hero-systems row (like Grade / Equipment)", () => {
    renderBoardState(xpAdventure(true));
    const button = screen.getByRole("button", { name: /Unit Experience Board/i });
    expect(button.textContent).toContain("1/1 card ranked");
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Unit Experience Board" });
    expect(dialog.classList.contains("unitXpWindow")).toBe(true);
    // Picker first — click the unit to open the large detail panel.
    expect(dialog.textContent).toContain("Few Marksmen");
    fireEvent.click(screen.getByRole("button", { name: /Open Few Marksmen experience board/i }));
    expect(dialog.classList.contains("unitXpDetailOpen")).toBe(true);
    expect(dialog.textContent).toContain("5 / 14 XP");
    expect(dialog.textContent).toContain("2 · Veteran");
  });

  it("CONTROL — with the rule off, no Unit Experience button renders", () => {
    renderBoardState(xpAdventure(false));
    expect(screen.queryByRole("button", { name: /Unit Experience Board/i })).toBeNull();
  });
});
