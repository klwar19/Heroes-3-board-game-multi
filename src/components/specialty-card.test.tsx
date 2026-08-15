// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { cardLibrary } from "@/data/cards/library";

import { SpecialtyCard } from "./specialty-card";
import { canRenderSpecialtyCard, parseSpecialtyCardId, specialtyEffectText, specialtyIconSrc } from "./specialty-card-data";
import { cardZoomContent } from "./table/zoom";

afterEach(cleanup);

describe("parseSpecialtyCardId", () => {
  it("splits a specialty id into hero slug + I/IV/VI level", () => {
    expect(parseSpecialtyCardId("specialty.kriv.6")).toEqual({ slug: "kriv", level: 6 });
    expect(parseSpecialtyCardId("specialty.tarnum_conflux.4")).toEqual({ slug: "tarnum_conflux", level: 4 });
    expect(parseSpecialtyCardId("spell.teleport")).toBeNull();
    expect(parseSpecialtyCardId("specialty.kriv.2")).toBeNull(); // only 1/4/6 are real levels
  });
});

describe("canRenderSpecialtyCard", () => {
  it("is true for EVERY art-less specialty (icon optional), false for baked-art + non-specialties", () => {
    expect(canRenderSpecialtyCard("specialty.kriv.1")).toBe(true); // Bulwark rune specialist (has icon)
    expect(canRenderSpecialtyCard("specialty.dhuin.4")).toBe(true); // Bulwark unit specialist (has icon)
    expect(canRenderSpecialtyCard("specialty.henrietta.1")).toBe(true); // Factory unit specialist
    expect(canRenderSpecialtyCard("specialty.miku.6")).toBe(true); // anime, no board-game scan exists
    // A baked-art specialty keeps its scan and is NOT drawn natively.
    expect(canRenderSpecialtyCard("specialty.sandro.1")).toBe(false); // has a printed cardImage
    expect(canRenderSpecialtyCard("specialty.catherine.6")).toBe(false); // has a printed cardImage
    expect(canRenderSpecialtyCard("specialty.cassiopeia.4")).toBe(false); // cove — now ships a board-game scan
    // The 2026-08 wiki art refresh gave the whole "Regular Stretch Goals 2024"
    // group (and Jeremy's missing Cannon I) their printed faces, so they left the
    // native renderer for the real scan (scripts/fetch-hero-art-refresh.py).
    expect(canRenderSpecialtyCard("specialty.ash.1")).toBe(false);
    expect(canRenderSpecialtyCard("specialty.torosar.6")).toBe(false);
    expect(canRenderSpecialtyCard("specialty.jeremy.1")).toBe(false);
    expect(canRenderSpecialtyCard("spell.teleport")).toBe(false);
    expect(canRenderSpecialtyCard(undefined)).toBe(false);
  });
});

describe("specialtyEffectText", () => {
  it("uses the prose tag when present (Kriv carries one)", () => {
    expect(specialtyEffectText("specialty.kriv.6")).toContain("3 Runes");
  });

  it("every unit-specialist level (I / IV / VI) has a description naming the doubled unit", () => {
    // Regression: the unit-specialist helpers (might / health / initiative) used
    // to carry no prose, so IV and VI printed blank. All three must now read.
    for (const id of ["specialty.dhuin.1", "specialty.dhuin.4", "specialty.dhuin.6"]) {
      const text = specialtyEffectText(id);
      expect(text.length, id).toBeGreaterThan(0);
      expect(text, id).toContain("Snow Elves");
    }
  });

  it("returns empty (no throw) for an unknown id", () => {
    expect(specialtyEffectText("__none__")).toBe("");
  });
});

describe("hero-board / zoom wiring", () => {
  it("specialtyIconSrc gives the symbol for art-less specialties, undefined otherwise", () => {
    expect(specialtyIconSrc("specialty.dhuin.4")).toContain("units-bulwark-snow_elves-portrait.webp");
    expect(specialtyIconSrc("specialty.kriv.1")).toContain("runes-emblem.webp");
    // Septienna's specialty IS Death Ripple, so it shows the Death Ripple SPELL
    // icon — not the generic Necromancy skill emblem it used to borrow.
    expect(specialtyIconSrc("specialty.septienna.6")).toContain("icon-death_ripple.webp");
    expect(specialtyIconSrc("specialty.septienna.6")).not.toContain("abilities-necromancy");
    // Astra's specialty IS the Cure SPELL — it shows the Cure spell icon, not the
    // First Aid Tent war-machine emblem it used to (wrongly) borrow.
    expect(specialtyIconSrc("specialty.astra.1")).toContain("icon-cure.webp");
    expect(specialtyIconSrc("specialty.astra.6")).not.toContain("abilities-first_aid");
    // Jeremy's specialty IS the Cannon war machine — it shows the actual Cannon,
    // not the generic Artillery skill card it used to borrow.
    expect(specialtyIconSrc("specialty.jeremy.1")).toContain("icon-cannon.webp");
    expect(specialtyIconSrc("specialty.jeremy.4")).not.toContain("abilities-artillery");
    // Ash's specialty IS Bloodlust — it shows the Bloodlust SPELL icon, not the
    // generic Offense skill emblem it used to borrow.
    expect(specialtyIconSrc("specialty.ash.1")).toContain("icon-bloodlust.webp");
    expect(specialtyIconSrc("specialty.ash.6")).not.toContain("abilities-offense");
    // Octavia's specialty IS Gold — it shows the gold-coins icon, not the generic
    // Estates skill emblem it used to borrow.
    expect(specialtyIconSrc("specialty.octavia.1")).toContain("icon-gold.webp");
    expect(specialtyIconSrc("specialty.octavia.4")).not.toContain("abilities-estates");
    // Moandor's specialty IS the Liches — it shows the Power Lich portrait. His
    // cards are art-less now (the moandor scans were never shipped), so the symbol
    // must resolve instead of leaving a broken <img>.
    expect(specialtyIconSrc("specialty.moandor.1")).toContain("units-lich-portrait.webp");
    expect(specialtyIconSrc("specialty.moandor.6")).toContain("units-lich-portrait.webp");
    // EVERY unit specialist shows the unit's own PORTRAIT, not the battle sprite
    // (specialty-card/creature-*.webp) some of them used to.
    expect(specialtyIconSrc("specialty.valeska.1")).toContain("units-marksman-portrait.webp");
    expect(specialtyIconSrc("specialty.casmetra.4")).toContain("units-sorceress-portrait.webp");
    expect(specialtyIconSrc("specialty.lorelei.6")).toContain("units-harpy-portrait.webp");
    expect(specialtyIconSrc("specialty.lorelei.6")).not.toContain("creature-harpy");
    expect(specialtyIconSrc("specialty.tarnum_dungeon.1")).toContain("units-black_dragon-portrait.webp");
    expect(specialtyIconSrc("specialty.ingham.1")).toContain("units-zealot-portrait.webp");
    expect(specialtyIconSrc("specialty.cassiopeia.4")).toContain("units-oceanid-portrait.webp");
    expect(specialtyIconSrc("specialty.tarnum_fortress.6")).toContain("units-basilisk-portrait.webp");
    expect(specialtyIconSrc("specialty.tarnum_rampart.1")).toContain("units-sharpshooter-portrait.webp");
    expect(specialtyIconSrc("specialty.ivor.4")).toContain("units-grand_elf-portrait.webp");
    expect(specialtyIconSrc("specialty.tarnum_conflux.6")).toContain("units-enchanter-portrait.webp");
    // Factory unit specialists now use the unit's clean creature PORTRAIT, not the
    // full unit CARD art (units-factory-<tier>-<unit>-few.webp) they used to borrow.
    expect(specialtyIconSrc("specialty.henrietta.1")).toContain("units-factory-halfling-portrait.webp");
    expect(specialtyIconSrc("specialty.frederick.1")).toContain("units-factory-automaton-portrait.webp");
    expect(specialtyIconSrc("specialty.sam.4")).toContain("units-factory-mechanic-portrait.webp");
    expect(specialtyIconSrc("specialty.tancred.6")).toContain("units-factory-bounty_hunter-portrait.webp");
    expect(specialtyIconSrc("specialty.celestine.1")).toContain("units-factory-armadillo-portrait.webp");
    expect(specialtyIconSrc("specialty.agar.4")).toContain("units-factory-sandworm-portrait.webp");
    // None of the unit specialists may fall back to a full battle sprite or CARD art.
    for (const slug of [
      "valeska", "casmetra", "lorelei", "tarnum_dungeon", "ingham", "cassiopeia",
      "tarnum_fortress", "tarnum_rampart", "ivor", "tarnum_conflux",
      "dhuin", "creyle", "eikthurn", "erdamon", "monere", "pasis", "moandor",
      "henrietta", "frederick", "sam", "tancred", "celestine", "agar",
    ]) {
      const src = specialtyIconSrc(`specialty.${slug}.1`);
      expect(src, `${slug} should use a portrait, not a battle sprite`).toContain("-portrait.webp");
      expect(src, `${slug} should not use a creature-* battle sprite`).not.toContain("creature-");
      // A unit specialist must never borrow the full unit CARD art.
      expect(src, `${slug} should not use full card art`).not.toMatch(/-(few|pack|neutral)\.webp$/u);
    }
    // Melodia's specialty IS Fortune — the Fortune SPELL icon, not the Luck emblem.
    expect(specialtyIconSrc("specialty.melodia.1")).toContain("icon-fortune.webp");
    expect(specialtyIconSrc("specialty.melodia.4")).not.toContain("abilities-luck");
    // Ballista specialists show the Ballista war machine, not the Artillery emblem.
    expect(specialtyIconSrc("specialty.torosar.1")).toContain("icon-ballista.webp");
    expect(specialtyIconSrc("specialty.gerwulf.4")).toContain("icon-ballista.webp");
    expect(specialtyIconSrc("specialty.tarnum_castle.6")).toContain("icon-ballista.webp");
    expect(specialtyIconSrc("specialty.torosar.1")).not.toContain("abilities-artillery");
    // Zilare shows the Forgetfulness spell icon, not the generic Air-Magic emblem.
    expect(specialtyIconSrc("specialty.zilare.1")).toContain("icon-forgetfulness.webp");
    expect(specialtyIconSrc("specialty.zilare.6")).not.toContain("abilities-air_magic");
    // Miriam shows the large Expert Scouting emblem, not the small generic one.
    expect(specialtyIconSrc("specialty.miriam.4")).toContain("icon-scouting-expert.webp");
    // Sephinroth shows the Valuables resource icon, not the generic Estates emblem.
    expect(specialtyIconSrc("specialty.sephinroth.1")).toContain("icon-valuables.webp");
    expect(specialtyIconSrc("specialty.sephinroth.6")).not.toContain("abilities-estates");
    // Merist (Stone Skin) and Cyra (Haste) show their actual SPELL icons, not the
    // generic Armorer / Air-Magic emblems they used to borrow.
    expect(specialtyIconSrc("specialty.merist.1")).toContain("icon-stone_skin.webp");
    expect(specialtyIconSrc("specialty.merist.6")).not.toContain("abilities-armorer");
    expect(specialtyIconSrc("specialty.cyra.1")).toContain("icon-haste.webp");
    expect(specialtyIconSrc("specialty.cyra.6")).not.toContain("abilities-air_magic");
    // Invariant: no native (art-less) spell specialist falls back to a generic
    // secondary-skill emblem — each must point at a real spell icon.
    for (const slug of [
      "ash", "astra", "ciele", "cyra", "glacius", "luna", "melodia", "merist",
      "zilare", "septienna",
    ]) {
      const src = specialtyIconSrc(`specialty.${slug}.1`);
      expect(src, `${slug} should use a spell icon`).toContain("/assets/specialty-card/icon-");
      expect(src, `${slug} must not use a generic abilities-* emblem`).not.toContain("/assets/abilities-");
    }
    // Anime Realms magic heroes: dedicated specialty-card medallions (never the
    // full ability-card scan or a borrowed classic hero's baked specialty art).
    expect(specialtyIconSrc("specialty.aoko.1")).toContain("icon-cure.webp");
    expect(specialtyIconSrc("specialty.lingxi.1")).toContain("icon-first_aid.webp");
    expect(specialtyIconSrc("specialty.lingxi.1")).not.toContain("abilities-first_aid");
    expect(specialtyIconSrc("specialty.lingxi.6")).toContain("icon-first_aid.webp");
    expect(specialtyIconSrc("specialty.kudryavka_noumi.1")).toContain(
      "specialty-kud-rocket-launcher.webp"
    );
    // Unit specialists for anime towns use their own unit portraits.
    expect(specialtyIconSrc("specialty.bin.1")).toContain("fuyuki-sabers.webp");
    expect(specialtyIconSrc("specialty.qingyun.1")).toContain("azure-breeze-true-inheritors.webp");
    expect(specialtyIconSrc("specialty.catherine.1")).toBeUndefined(); // a baked-art hero
    expect(specialtyIconSrc("spell.teleport")).toBeUndefined();
    expect(specialtyIconSrc(undefined)).toBeUndefined();
  });

  it("cardZoomContent flags an art-less specialty to render the native card on zoom", () => {
    expect(cardZoomContent("specialty.kriv.6").specialtyCardId).toBe("specialty.kriv.6");
    // A baked-art specialty keeps its image and does NOT use the native card.
    expect(cardZoomContent("specialty.catherine.1").specialtyCardId).toBeUndefined();
    expect(cardZoomContent("specialty.catherine.1").image).toBeTruthy();
  });
});

describe("SpecialtyCard", () => {
  it("draws Kriv's Runes VI: title, numeral, rune emblem, portrait, frame, effect", () => {
    const { container, getByText } = render(<SpecialtyCard cardId="specialty.kriv.6" />);

    expect(getByText("Runes VI")).toBeTruthy();
    expect(container.querySelector(".scLevelBadge")?.textContent).toBe("VI");
    expect((container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src")).toContain(
      "runes-emblem.webp"
    );
    expect(container.querySelector(".scPortrait")?.getAttribute("style")).toContain("hero_portraits-kriv");
    const wrap = container.querySelector(".scWrap");
    expect(wrap?.getAttribute("data-level")).toBe("6");
    expect(wrap?.getAttribute("style")).toContain("border-6.webp");
    expect(container.querySelector(".scDesc")?.textContent ?? "").toContain("3 Runes");
  });

  it("a unit specialist (Dhuin → Snow Elves I) shows its symbol slot + non-empty text", () => {
    const { container, getByText } = render(<SpecialtyCard cardId="specialty.dhuin.1" />);
    expect(getByText("Snow Elves I")).toBeTruthy();
    expect(container.querySelector(".scLevelBadge")?.textContent).toBe("I");
    // The icon box is always present (it reserves the picture's space so the
    // title + text sit below it even before the unit symbol is generated).
    expect(container.querySelector(".scIconBox")).toBeTruthy();
    // The unit symbol is the unit's own wiki creature portrait, not the card.
    expect((container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src")).toContain(
      "units-bulwark-snow_elves-portrait.webp"
    );
    expect((container.querySelector(".scDesc")?.textContent ?? "").length).toBeGreaterThan(0);
  });

  it("renders nothing for a card it cannot express (no broken output)", () => {
    const { container } = render(<SpecialtyCard cardId="spell.teleport" />);
    expect(container.querySelector(".scWrap")).toBeNull();
  });

  it("draws Septienna's Death Ripple VI with the Death Ripple SPELL icon + its effect text", () => {
    const { container, getByText } = render(<SpecialtyCard cardId="specialty.septienna.6" />);
    expect(getByText("Death Ripple VI")).toBeTruthy();
    expect((container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src")).toContain(
      "icon-death_ripple.webp"
    );
    // ...and NOT the old Necromancy skill emblem it used to borrow.
    expect((container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src")).not.toContain(
      "abilities-necromancy"
    );
    expect(container.querySelector(".scDesc")?.textContent ?? "").toContain("suffers");
  });

  it("draws Astra's Cure with the Cure SPELL icon (not the First Aid Tent emblem)", () => {
    const { container } = render(<SpecialtyCard cardId="specialty.astra.1" />);
    const src = (container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src");
    expect(src).toContain("icon-cure.webp");
    expect(src).not.toContain("abilities-first_aid");
  });

  it("draws Jeremy's Cannon with the Cannon icon (not the generic Artillery card)", () => {
    const { container } = render(<SpecialtyCard cardId="specialty.jeremy.1" />);
    const src = (container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src");
    expect(src).toContain("icon-cannon.webp");
    expect(src).not.toContain("abilities-artillery");
  });

  it("draws Oidana's reworked Diplomacy VI text (the neutral-army Attack aura, not 'draw 3')", () => {
    const { container, getByText } = render(<SpecialtyCard cardId="specialty.oidana.6" />);
    expect(getByText("Diplomacy VI")).toBeTruthy();
    const desc = container.querySelector(".scDesc")?.textContent ?? "";
    expect(desc).toContain("draw 2 cards");
    expect(desc).toContain("+1 Attack to every neutral unit you control");
    expect(desc).not.toContain("draw 3");
    expect(desc).not.toContain("per Dwelling");
  });

  it("draws Lingxi's Healing Arts natively: themed name, First-Aid medallion icon, her portrait, Azure accent", () => {
    // Art-less retheme of Gem's First Aid — must NEVER show Gem's baked scan or
    // the full First Aid ability card, and must use the dedicated specialty-card
    // medallion + Lingxi's own portrait (not a crane / wrong art).
    for (const [id, numeral] of [
      ["specialty.lingxi.1", "I"],
      ["specialty.lingxi.4", "IV"],
      ["specialty.lingxi.6", "VI"]
    ] as const) {
      expect(canRenderSpecialtyCard(id), id).toBe(true);
      expect(cardLibrary[id]?.assets?.cardImage, id).toBeUndefined();
      expect(specialtyIconSrc(id), id).toContain("/assets/specialty-card/icon-first_aid.webp");
      expect(specialtyIconSrc(id), id).not.toContain("abilities-first_aid");
      expect(specialtyEffectText(id).trim().length, id).toBeGreaterThan(0);
    }

    const { container, getByText } = render(<SpecialtyCard cardId="specialty.lingxi.1" />);
    expect(getByText("Healing Arts I")).toBeTruthy();
    expect(container.querySelector(".scLevelBadge")?.textContent).toBe("I");
    const iconSrc = (container.querySelector(".scIcon") as HTMLImageElement | null)?.getAttribute("src") ?? "";
    expect(iconSrc).toContain("icon-first_aid.webp");
    expect(iconSrc).not.toContain("abilities-first_aid");
    expect(iconSrc).not.toContain("hero_specialties-gem");
    // Portrait strip is Lingxi's own hero portrait (new Formation Sage art).
    expect(container.querySelector(".scPortrait")?.getAttribute("style") ?? "").toContain(
      "anime/heroes/lingxi"
    );
    // Azure Breeze faction accent on the level well (not the generic grey).
    expect(container.querySelector(".scWrap")?.getAttribute("style") ?? "").toContain("#27a9a0");
    // Zoom + hand tray both route through the native card (not a blank fallback).
    expect(cardZoomContent("specialty.lingxi.4").specialtyCardId).toBe("specialty.lingxi.4");
    expect(cardZoomContent("specialty.lingxi.4").image).toBeUndefined();
  });
});
