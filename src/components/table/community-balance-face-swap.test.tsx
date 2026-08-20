// @vitest-environment jsdom
/**
 * Heroes 3 Board Game Community Balance Change — the FACE-SWAP seam.
 *
 * LEADING WITH THE LIMIT: the shipped community registry is EMPTY in this step,
 * so the precedence half of this file drives the seam with a MOCKED registry
 * (the lookup functions are the seam's only inputs). That is deliberate: the
 * ordering rule — community-empowered → community → polish-empowered → polish →
 * classic — is the contract later content steps must not break, and it has to be
 * pinned before any content exists. Everything OUTSIDE that mock (the provider
 * default, the rule-off render) uses the real registry.
 *
 * jsdom cannot compute CSS, so nothing here proves a face is VISIBLE — only that
 * the right `src` reaches the DOM.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { cardLibrary } from "@/data/cards/library";
import { empoweredCardImage } from "@/data/cards/empowered-card-art";
import { POLISH_BALANCE_CARD_IDS, polishBalanceEmpoweredCardImage } from "@/data/cards/polish-balance-art";
import { CardFrame } from "./seats";
import { PolishBalanceArtProvider, resolveCardFaceImage } from "./polish-balance-art";

/**
 * A card BOTH packs cover (it is a real Polish reprint) and a card ONLY the
 * community pack covers, so the truth table can discriminate every rung.
 */
const BOTH_ID = "ability.scouting";
const COMMUNITY_ONLY_ID = "ability.estates";
const communityFace = (id: string) => `/assets/community-balance/${id.replaceAll(".", "-")}.webp`;
const communityEmpoweredFace = (id: string) => `/assets/community-balance/${id.replaceAll(".", "-")}-empowered.webp`;

// Only these two ids are "covered"; every other id falls through to the real
// (empty) registry behaviour, i.e. undefined.
vi.mock("@/data/cards/community-balance-art", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/cards/community-balance-art")>();
  const covered = new Set(["ability.scouting", "ability.estates"]);
  return {
    ...actual,
    isCommunityBalanceCard: (cardId?: string) => Boolean(cardId) && covered.has(cardId!),
    communityBalanceCardImage: (cardId?: string) =>
      cardId && covered.has(cardId) ? `/assets/community-balance/${cardId.replaceAll(".", "-")}.webp` : undefined,
    communityBalanceEmpoweredCardImage: (cardId?: string) =>
      cardId === "ability.scouting"
        ? "/assets/community-balance/ability-scouting-empowered.webp"
        : undefined
  };
});

afterEach(cleanup);

/** The `src` CardFrame renders, with the media `?v=` suffix stripped. */
function faceSrc(
  cardId: string,
  opts: { polish?: boolean; community?: boolean; empowered?: boolean }
): string | null {
  const { container } = render(
    <PolishBalanceArtProvider enabled={Boolean(opts.polish)} communityEnabled={Boolean(opts.community)}>
      <CardFrame cardId={cardId} className="fanCardImage" empowered={opts.empowered} />
    </PolishBalanceArtProvider>
  );
  const img = container.querySelector("img");
  return img ? (img.getAttribute("src") ?? "").split("?")[0] : null;
}

describe("resolveCardFaceImage — community / polish precedence", () => {
  it("community WINS over polish for a card both packs cover, and polish still wins alone", () => {
    const classic = cardLibrary[BOTH_ID]!.assets!.cardImage;
    const polishFace = `/assets/polish-balance/${BOTH_ID.replaceAll(".", "-")}.webp`;

    // polish only
    expect(resolveCardFaceImage({ polish: true, community: false }, BOTH_ID, false)).toBe(polishFace);
    // community only
    expect(resolveCardFaceImage({ polish: false, community: true }, BOTH_ID, false)).toBe(communityFace(BOTH_ID));
    // BOTH on → community wins
    expect(resolveCardFaceImage({ polish: true, community: true }, BOTH_ID, false)).toBe(communityFace(BOTH_ID));
    // BOTH off → classic (the byte-identical default)
    expect(resolveCardFaceImage({ polish: false, community: false }, BOTH_ID, false)).toBe(classic);
  });

  it("empowered ordering: community-empowered beats every other face", () => {
    const polishEmpowered = polishBalanceEmpoweredCardImage(BOTH_ID);
    expect(polishEmpowered, "fixture must be a polish card WITH an empowered face").toBeTruthy();

    expect(resolveCardFaceImage({ polish: true, community: false }, BOTH_ID, true)).toBe(polishEmpowered);
    expect(resolveCardFaceImage({ polish: true, community: true }, BOTH_ID, true)).toBe(
      communityEmpoweredFace(BOTH_ID)
    );
    // A community card with NO empowered variant falls back to its plain face,
    // never to the OLD-text classic `-empowered` scan.
    expect(resolveCardFaceImage({ polish: false, community: true }, COMMUNITY_ONLY_ID, true)).toBe(
      communityFace(COMMUNITY_ONLY_ID)
    );
    // CONTROL: rules off → the classic empowered scan.
    expect(resolveCardFaceImage({ polish: false, community: false }, BOTH_ID, true)).toBe(
      empoweredCardImage(BOTH_ID)
    );
  });

  it("accepts the legacy bare boolean (polish-only callers) and unknown/absent cards", () => {
    const polishFace = `/assets/polish-balance/${BOTH_ID.replaceAll(".", "-")}.webp`;
    expect(resolveCardFaceImage(true, BOTH_ID, false)).toBe(polishFace);
    expect(resolveCardFaceImage(false, BOTH_ID, false)).toBe(cardLibrary[BOTH_ID]!.assets!.cardImage);
    expect(resolveCardFaceImage({ polish: true, community: true }, undefined, false)).toBeUndefined();
    // A card id that exists in NEITHER pack (nor the library) breaks nothing.
    expect(resolveCardFaceImage({ polish: true, community: true }, "card.not_a_real_card", false)).toBeUndefined();
  });
});

describe("the provider publishes the community flag to every card face", () => {
  it("renders the community face only while the rule is ON", () => {
    expect(faceSrc(COMMUNITY_ONLY_ID, { community: true })).toBe(communityFace(COMMUNITY_ONLY_ID));
    // CONTROL: rule off → the classic face, byte-identical to before the pack.
    expect(faceSrc(COMMUNITY_ONLY_ID, { community: false })).toBe(cardLibrary[COMMUNITY_ONLY_ID]!.assets!.cardImage);
    // CONTROL: no provider at all (every non-table screen, every isolated test).
    const { container } = render(<CardFrame cardId={COMMUNITY_ONLY_ID} className="fanCardImage" />);
    const src = (container.querySelector("img")?.getAttribute("src") ?? "").split("?")[0];
    expect(src).toBe(cardLibrary[COMMUNITY_ONLY_ID]!.assets!.cardImage);
  });

  it("a card the community pack does NOT cover is untouched, whatever the flags", () => {
    const uncovered = POLISH_BALANCE_CARD_IDS.find((id) => id !== BOTH_ID)!;
    const classic = cardLibrary[uncovered]!.assets!.cardImage;
    expect(faceSrc(uncovered, { community: true })).toBe(classic);
    // …and with polish also on it is the POLISH face, not a community one.
    expect(faceSrc(uncovered, { community: true, polish: true })).toBe(
      `/assets/polish-balance/${uncovered.replaceAll(".", "-")}.webp`
    );
  });

  it("the Empowered CUE survives the swap — the gold ring still renders", () => {
    const { container } = render(
      <PolishBalanceArtProvider enabled={false} communityEnabled>
        <CardFrame cardId={BOTH_ID} className="fanCardImage" empowered />
      </PolishBalanceArtProvider>
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")?.split("?")[0]).toBe(communityEmpoweredFace(BOTH_ID));
    expect(img.getAttribute("data-empowered")).toBe("true");
    expect(img.className).toContain("empoweredCard");
  });
});
