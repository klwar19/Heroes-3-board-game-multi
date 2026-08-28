// @vitest-environment jsdom
/**
 * Polish Balance Pack — the FACE-SWAP seam.
 *
 * LIMIT, stated up front: jsdom cannot compute CSS, so nothing here proves a
 * face is VISIBLE or correctly sized — only that the right `src` reaches the
 * DOM. The files themselves are pinned by `src/data/cards/polish-balance-art.test.ts`.
 *
 * Every claim has a rule-OFF CONTROL, because the whole swap must be invisible
 * on a default table: with no provider (every other screen, and every isolated
 * card-face test) the render is byte-identical to before.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { cardLibrary } from "@/data/cards/library";
import {
  POLISH_BALANCE_CARD_IDS,
  POLISH_BALANCE_NOT_IMPLEMENTED,
  polishBalanceEmpoweredCardImage
} from "@/data/cards/polish-balance-art";
import { empoweredCardImage } from "@/data/cards/empowered-card-art";
import { CardFrame } from "./seats";
import { PolishBalanceArtProvider, resolveCardFaceImage, resolveUnitFaceImage } from "./polish-balance-art";
import { COMMUNITY_BALANCE_UNIT_FACES } from "@/data/cards/community-balance-art";
import { coreUnitDefinitions } from "@/data/factions/units";
import { cardZoomContent } from "./zoom";

afterEach(cleanup);

/** The `src` CardFrame renders, with the media `?v=` suffix stripped. */
function faceSrc(cardId: string, opts: { balance: boolean; empowered?: boolean }): string | null {
  const { container } = render(
    <PolishBalanceArtProvider enabled={opts.balance}>
      <CardFrame cardId={cardId} className="fanCardImage" empowered={opts.empowered} />
    </PolishBalanceArtProvider>
  );
  const img = container.querySelector("img");
  return img ? (img.getAttribute("src") ?? "").split("?")[0] : null;
}

describe("Polish Balance Pack — card faces swap while the rule is ON", () => {
  it("every WIRED reprint renders its balance face; the SAME card renders its classic face with the rule off", () => {
    for (const cardId of POLISH_BALANCE_CARD_IDS) {
      const classic = cardLibrary[cardId]?.assets?.cardImage;
      expect(classic, `${cardId} must have a classic face to swap away from`).toBeTruthy();
      const balanceFace = `/assets/polish-balance/${cardId.replaceAll(".", "-")}.webp`;

      expect(faceSrc(cardId, { balance: true }), `${cardId} must swap under the rule`).toBe(balanceFace);
      // CONTROL: the rule off renders exactly what it always did.
      expect(faceSrc(cardId, { balance: false }), `${cardId} must keep its classic face`).toBe(classic);
    }
  });

  it("an Empowered holder gets the DEDICATED empowered balance face (never the OLD-text -empowered scan)", () => {
    // The 12 abilities ship a dedicated `-empowered` balance face that prints the
    // NEW rules text; an Empowered holder must get THAT, not the classic
    // `-empowered` fan scan (OLD text) nor — as before this feature — the plain
    // balance face. Cards WITHOUT an empowered balance variant (spells, the
    // Knowledge statistic, Diplomacy) keep the plain balance face when Empowered.
    let empoweredCovered = 0;
    for (const cardId of POLISH_BALANCE_CARD_IDS) {
      const empoweredBalance = polishBalanceEmpoweredCardImage(cardId);
      const plainBalance = `/assets/polish-balance/${cardId.replaceAll(".", "-")}.webp`;
      const expected = empoweredBalance ?? plainBalance;
      if (empoweredBalance) {
        empoweredCovered += 1;
      }
      expect(faceSrc(cardId, { balance: true, empowered: true }), `${cardId} empowered balance face`).toBe(expected);
      // CONTROL: with the rule OFF the classic Empowered scan (or classic face) still wins.
      const classicEmpowered = empoweredCardImage(cardId) ?? cardLibrary[cardId]?.assets?.cardImage;
      expect(faceSrc(cardId, { balance: false, empowered: true })).toBe(classicEmpowered);
    }
    // Non-vacuity: exactly the 12 abilities carry an empowered balance face.
    expect(empoweredCovered).toBe(12);
    // The Knowledge statistic has no empowered balance variant → plain face even Empowered.
    expect(faceSrc("stat.knowledge", { balance: true, empowered: true })).toBe(
      "/assets/polish-balance/stat-knowledge.webp"
    );
    // Empowered Knowledge is its OWN card id, whose plain balance face already IS
    // the empowered art.
    expect(faceSrc("stat.knowledge.empowered", { balance: true })).toBe(
      "/assets/polish-balance/stat-knowledge-empowered.webp"
    );
    // Diplomacy has no dedicated Empowered balance reprint, so the balance face wins.
    expect(faceSrc("ability.diplomacy", { balance: true, empowered: true })).toBe(
      "/assets/polish-balance/ability-diplomacy.webp"
    );
  });

  it("the Empowered CUE is untouched by the swap — the gold ring still renders", () => {
    const cardId = POLISH_BALANCE_CARD_IDS[0];
    const { container } = render(
      <PolishBalanceArtProvider enabled>
        <CardFrame cardId={cardId} className="fanCardImage" empowered />
      </PolishBalanceArtProvider>
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("data-empowered")).toBe("true");
    expect(img.className).toContain("empoweredCard");
  });

  it("CONTROL: a card whose reprint is NOT wired keeps its classic face even with the rule ON", () => {
    // The honesty gate in DOM form: an unimplemented reprint must never show a
    // face whose printed text the engine does not run.
    for (const cardId of Object.keys(POLISH_BALANCE_NOT_IMPLEMENTED)) {
      const classic = cardLibrary[cardId]?.assets?.cardImage;
      expect(faceSrc(cardId, { balance: true }), `${cardId} must NOT swap`).toBe(classic);
    }
  });

  it("CONTROL: an unrelated card, and a render with NO provider at all, are untouched", () => {
    const estates = cardLibrary["ability.estates"]!.assets!.cardImage;
    expect(faceSrc("ability.estates", { balance: true })).toBe(estates);

    // No provider → default false → the classic/empowered precedence only.
    const { container } = render(<CardFrame cardId={POLISH_BALANCE_CARD_IDS[0]} className="fanCardImage" />);
    const src = (container.querySelector("img")?.getAttribute("src") ?? "").split("?")[0];
    expect(src).toBe(cardLibrary[POLISH_BALANCE_CARD_IDS[0]]!.assets!.cardImage);
  });
});

describe("resolveCardFaceImage — the shared precedence used where a hook cannot run", () => {
  it("matches the hook's ordering for wired, unwired and non-member cards", () => {
    const wired = POLISH_BALANCE_CARD_IDS[0];
    expect(resolveCardFaceImage(true, wired, false)).toBe(
      `/assets/polish-balance/${wired.replaceAll(".", "-")}.webp`
    );
    // Empowered: the dedicated empowered balance face when the card has one, else
    // the plain balance face.
    expect(resolveCardFaceImage(true, wired, true)).toBe(
      polishBalanceEmpoweredCardImage(wired) ?? `/assets/polish-balance/${wired.replaceAll(".", "-")}.webp`
    );
    // A wired card with NO empowered balance variant (a spell) stays on the plain face.
    expect(resolveCardFaceImage(true, "spell.prayer", true)).toBe("/assets/polish-balance/spell-prayer.webp");
    expect(resolveCardFaceImage(false, wired, false)).toBe(cardLibrary[wired]!.assets!.cardImage);
    expect(resolveCardFaceImage(false, wired, true)).toBe(empoweredCardImage(wired));
    expect(resolveCardFaceImage(true, undefined, false)).toBeUndefined();
  });
});

describe("balance zoom description", () => {
  it("reads the reprinted definition while enabled and the classic definition while disabled", () => {
    expect(cardZoomContent("spell.prayer", false, true).lines.join(" ")).toContain("defense AND initiative");
    expect(cardZoomContent("ability.ballistics", false, true).lines.join(" ")).toContain("destroy 2 Walls");
    expect(cardZoomContent("ability.first_aid", false, true).lines.join(" ")).toContain(
      "use First Aid Tent on the selected unit 3 times (no crown)"
    );
    expect(cardZoomContent("artifact.hourglass_of_the_evil_hour", false, true).lines.join(" ")).toContain(
      'each "+1" result'
    );
    expect(cardZoomContent("artifact.hourglass_of_the_evil_hour", false, true).lines.join(" ")).not.toContain(
      "gain morale on a 0"
    );
    expect(cardZoomContent("ability.ballistics", false, false).lines.join(" ")).not.toContain("destroy 2 Walls");
  });
});

describe("resolveUnitFaceImage — the Community Balance Change's reprinted UNIT SIDES", () => {
  it("swaps ONLY a wired side, ONLY under the community pack (truth table)", () => {
    const printedGriffinsFew = coreUnitDefinitions["castle.griffins"]!.few!.cardImage;
    const communityGriffinsFew = "/assets/community-balance/unit-castle-griffins-few.webp";

    for (const { unitDefId, side } of COMMUNITY_BALANCE_UNIT_FACES) {
      const printed = coreUnitDefinitions[unitDefId]?.[side]?.cardImage;
      expect(printed, `${unitDefId} ${side} needs a printed scan to swap away from`).toBeTruthy();
      const community = `/assets/community-balance/unit-${unitDefId.replaceAll(".", "-")}-${side}.webp`;
      // Community ON ⇒ the reprinted face.
      expect(resolveUnitFaceImage({ polish: false, community: true }, unitDefId, side, printed)).toBe(community);
      // CONTROL: community OFF ⇒ the printed scan, whatever the POLISH flag says
      // (the Polish pack reprints no unit side at all).
      expect(resolveUnitFaceImage({ polish: false, community: false }, unitDefId, side, printed)).toBe(printed);
      expect(resolveUnitFaceImage({ polish: true, community: false }, unitDefId, side, printed)).toBe(printed);
    }

    // CONTROL: an UNCHANGED side of a covered unit, and an uncovered unit.
    const halberdiersFew = coreUnitDefinitions["castle.halberdiers"]!.few!.cardImage;
    expect(resolveUnitFaceImage({ polish: false, community: true }, "castle.halberdiers", "few", halberdiersFew)).toBe(
      halberdiersFew
    );
    const crusadersPack = coreUnitDefinitions["castle.crusaders"]!.pack!.cardImage;
    expect(resolveUnitFaceImage({ polish: false, community: true }, "castle.crusaders", "pack", crusadersPack)).toBe(
      crusadersPack
    );
    // No unit / no side / no printed face resolves nothing new.
    expect(resolveUnitFaceImage({ polish: false, community: true }, undefined, "few", undefined)).toBeUndefined();
    expect(resolveUnitFaceImage({ polish: false, community: true }, "castle.griffins", undefined, printedGriffinsFew)).toBe(
      printedGriffinsFew
    );
    // The bare-boolean form is the community flag (the unit half has no polish rung).
    expect(resolveUnitFaceImage(true, "castle.griffins", "few", printedGriffinsFew)).toBe(communityGriffinsFew);
    expect(resolveUnitFaceImage(false, "castle.griffins", "few", printedGriffinsFew)).toBe(printedGriffinsFew);
  });
});
