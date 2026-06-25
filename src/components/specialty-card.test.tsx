// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
    // Art-less heroes WITHOUT a mapped icon must now render too (the frame,
    // portrait, name and effect draw; the icon slot is just empty).
    expect(canRenderSpecialtyCard("specialty.ash.1")).toBe(true); // inferno, no scan, no icon
    expect(canRenderSpecialtyCard("specialty.torosar.6")).toBe(true); // tower, no scan, no icon
    expect(canRenderSpecialtyCard("specialty.cassiopeia.4")).toBe(true); // cove, no scan
    // A baked-art specialty keeps its scan and is NOT drawn natively.
    expect(canRenderSpecialtyCard("specialty.sandro.1")).toBe(false); // has a printed cardImage
    expect(canRenderSpecialtyCard("specialty.catherine.6")).toBe(false); // has a printed cardImage
    expect(canRenderSpecialtyCard("spell.teleport")).toBe(false);
    expect(canRenderSpecialtyCard(undefined)).toBe(false);
  });
});

describe("specialtyEffectText", () => {
  it("uses the prose tag when present (Kriv carries one)", () => {
    expect(specialtyEffectText("specialty.kriv.6")).toContain("4 Runes");
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
    // Marksmen/Sorceresses/Harpies/Dragons specialists show the unit PORTRAIT, not
    // the battle sprite (specialty-card/creature-*.webp) they used to.
    expect(specialtyIconSrc("specialty.valeska.1")).toContain("units-marksman-portrait.webp");
    expect(specialtyIconSrc("specialty.casmetra.4")).toContain("units-sorceress-portrait.webp");
    expect(specialtyIconSrc("specialty.lorelei.6")).toContain("units-harpy-portrait.webp");
    expect(specialtyIconSrc("specialty.lorelei.6")).not.toContain("creature-harpy");
    expect(specialtyIconSrc("specialty.tarnum_dungeon.1")).toContain("units-black_dragon-portrait.webp");
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
    expect(container.querySelector(".scDesc")?.textContent ?? "").toContain("4 Runes");
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
});
