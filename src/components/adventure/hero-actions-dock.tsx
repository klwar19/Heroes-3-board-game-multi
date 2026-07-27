"use client";

import type { GameAction, LegalAction } from "@/engine";

// ---------------------------------------------------------------------------
// Hero actions dock — the human click surface for MAP actions that have no
// destination hex to click:
//   - HERO_TRAIN (Anime Hero Grades §3.11): spend 2 movement → +1 Merit.
//   - Forced March (the USE_HERO_SKILL map-active grade skill): +1 movement.
//   - HEAVEN_TRIBULATION (Anime Cultivation §5.6): brave the tribulation dice.
//   - REVISIT_FIELD: activate the location under a stationary Hero, including a
//     Monolith at the beginning of the turn.
//
// Availability is READ from the legal-action list (never re-derived here), so a
// button appears IFF `getLegalActions` currently offers that action to the
// viewer — module off, wrong phase, or not-your-turn all mean the engine emits
// no offer, so no button renders. Clicking dispatches the exact legal payload.
// ---------------------------------------------------------------------------

type HeroMapActionKey = "train" | "forced-march" | "tribulation" | "revisit";

/** EN/VI label + a one-line cost/effect tooltip per hero map action. */
const HERO_MAP_ACTION_LABELS: Record<HeroMapActionKey, { en: string; vi: string; title: string }> = {
  train: {
    en: "Train",
    vi: "Luyện tập",
    title: "Spend 2 movement points → +1 Merit toward the next Hero Grade (once per turn)"
  },
  "forced-march": {
    en: "Forced March",
    vi: "Cưỡng hành",
    title: "+1 movement point this turn (once per round)"
  },
  tribulation: {
    en: "Heavenly Tribulation",
    vi: "Độ kiếp",
    title: "Brave the tribulation dice to break through to Core Formation — realm 3 (never forced)"
  },
  revisit: {
    en: "Revisit field",
    vi: "",
    title: "Activate the field under this Hero"
  }
};

/** Which hero map action a legal action is, or null when it is not one of them. */
function heroMapActionKey(action: GameAction): HeroMapActionKey | null {
  if (action.type === "HERO_TRAIN") {
    return "train";
  }
  if (action.type === "HEAVEN_TRIBULATION") {
    return "tribulation";
  }
  if (action.type === "REVISIT_FIELD") {
    return "revisit";
  }
  // Forced March is the only map-active grade skill: it uses USE_HERO_SKILL with
  // no unitId (the combat War Cry / reactions carry a unitId).
  if (action.type === "USE_HERO_SKILL" && action.nodeId === "forced-march") {
    return "forced-march";
  }
  return null;
}

export function HeroActionsDock({
  legalActions,
  onAction
}: {
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const offers: { key: HeroMapActionKey; action: GameAction; legalLabel: string }[] = [];
  for (const legal of legalActions) {
    const key = heroMapActionKey(legal.action);
    if (key) {
      offers.push({ key, action: legal.action, legalLabel: legal.label });
    }
  }

  if (offers.length === 0) {
    return null;
  }

  return (
    <section aria-label="Hero actions" className="heroActionsDock">
      <header>Hero actions</header>
      {offers.map((offer) => {
        const label = HERO_MAP_ACTION_LABELS[offer.key];
        const reactKey =
          offer.action.type === "REVISIT_FIELD"
            ? `${offer.key}:${offer.action.heroId}`
            : offer.key;
        return (
          <button
            className="heroActionButton"
            key={reactKey}
            onClick={() => onAction(offer.action)}
            title={label.title}
            type="button"
          >
            <span className="heroActionLabelEn">
              {offer.key === "revisit" ? offer.legalLabel : label.en}
            </span>
            {label.vi ? <small className="heroActionLabelVi">{label.vi}</small> : null}
          </button>
        );
      })}
    </section>
  );
}
