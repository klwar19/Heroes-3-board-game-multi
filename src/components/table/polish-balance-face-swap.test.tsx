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
import { POLISH_BALANCE_CARD_IDS, POLISH_BALANCE_NOT_IMPLEMENTED } from "@/data/cards/polish-balance-art";
import { empoweredCardImage } from "@/data/cards/empowered-card-art";
import { CardFrame } from "./seats";
import { PolishBalanceArtProvider, resolveCardFaceImage } from "./polish-balance-art";
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

  it("the reprint beats the printed \"-empowered\" scan (which prints the OLD rules text)", () => {
    // Most wired reprints have a separate Empowered scan, which is exactly the
    // trap this precedence exists for: an Empowered holder must still read the
    // NEW card, not a face describing rules the engine no longer runs. (Diplomacy
    // has none — it is a PRINTED always-Empowered card, so its own face IS the
    // Empowered scan; it is covered by the plain swap case above.)
    let covered = 0;
    for (const cardId of POLISH_BALANCE_CARD_IDS) {
      const empowered = empoweredCardImage(cardId);
      if (!empowered) {
        continue;
      }
      covered += 1;
      const balanceFace = `/assets/polish-balance/${cardId.replaceAll(".", "-")}.webp`;

      expect(faceSrc(cardId, { balance: true, empowered: true })).toBe(balanceFace);
      // CONTROL: with the rule off the Empowered scan still wins, unchanged.
      expect(faceSrc(cardId, { balance: false, empowered: true })).toBe(empowered);
    }
    // Non-vacuity: this must really be exercising every reprint that HAS an
    // Empowered scan — the eleven Abilities other than Diplomacy. The pack's
    // SPELLS have none: Empower is a hand-ABILITY affordance
    // (`handAbilityEmpowerCandidates`), so no spell ships an `-empowered` face
    // and there is no precedence to test for them.
    const abilities = POLISH_BALANCE_CARD_IDS.filter((cardId) => cardId.startsWith("ability."));
    expect(covered).toBeGreaterThanOrEqual(abilities.length - 1);
    expect(
      POLISH_BALANCE_CARD_IDS.filter((cardId) => cardId.startsWith("spell.") && empoweredCardImage(cardId)),
      "no reprinted Spell ships an Empowered scan"
    ).toEqual([]);
    expect(faceSrc("stat.knowledge", { balance: true, empowered: true })).toBe(
      "/assets/polish-balance/stat-knowledge.webp"
    );
    expect(faceSrc("stat.knowledge.empowered", { balance: true })).toBe(
      "/assets/polish-balance/stat-knowledge-empowered.webp"
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
    expect(resolveCardFaceImage(true, wired, true)).toBe(
      `/assets/polish-balance/${wired.replaceAll(".", "-")}.webp`
    );
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
