import { cardLibrary } from "@/data/cards/library";
import type { CardId } from "./state";

/**
 * Phantom combat cards — distinct identity so "a phantom disappears after combat,
 * no matter what happened to it in the fight."
 *
 * The computer's always-on advantage grants a Power and a Magic Arrow into a
 * combat (see combat-boost.ts). Those SHARE the ids of real cards, so the old
 * teardown ("remove one instance of the id") could not tell a granted copy from a
 * genuinely-owned one: after a play + Knowledge recall / Mysticism / spell-book
 * shuffle it could delete the real card, or leave a granted copy behind. The fix
 * is identity: a phantom carries a distinct id (base id + marker) that BEHAVES
 * exactly like its base — every data-driven lookup (`cardLibrary[id].kind /
 * effect / statisticType / …`) resolves through a registered alias whose `.id`
 * stays the base id, so `card.id === "spell.magic_arrow"` style reads still treat
 * it as the base — while the distinct string lets combat-end cleanup find and
 * remove EXACTLY the granted copies, wherever they ended up, touching no real
 * card. Card ids never contain '#', so the marker cannot collide with a real id.
 */
export const PHANTOM_CARD_MARKER = "#phantom";

/** Base ids that may be granted as phantom combat cards (see combat-boost.ts). */
const PHANTOM_BASE_CARD_IDS: readonly CardId[] = ["stat.power", "spell.magic_arrow"];

export function isPhantomCardId(id: string): boolean {
  return id.endsWith(PHANTOM_CARD_MARKER);
}

/** The real card a (possibly phantom) id resolves to for behavior/comparison. */
export function baseCardId(id: string): CardId {
  return isPhantomCardId(id) ? id.slice(0, -PHANTOM_CARD_MARKER.length) : id;
}

/** The phantom id for a base card. */
export function toPhantomCardId(baseId: CardId): CardId {
  return `${baseId}${PHANTOM_CARD_MARKER}`;
}

/**
 * Register each phantom id as a cardLibrary alias of its base: a shallow clone
 * that KEEPS the base card's `.id`, so all data-driven resolution and every
 * `card.id === "<base>"` read treats the phantom exactly like the base card. The
 * hand still stores the distinct phantom id (for precise cleanup). Idempotent.
 */
function registerPhantomCardAliases(): void {
  const library = cardLibrary as unknown as Record<string, unknown>;
  for (const baseId of PHANTOM_BASE_CARD_IDS) {
    const phantomId = toPhantomCardId(baseId);
    const base = library[baseId];
    if (base && !library[phantomId]) {
      // Clone so the alias is a separate object, but keep every field — including
      // `id` (= baseId) — so behavior and identity-as-base are preserved.
      library[phantomId] = { ...(base as Record<string, unknown>) };
    }
  }
}

registerPhantomCardAliases();
