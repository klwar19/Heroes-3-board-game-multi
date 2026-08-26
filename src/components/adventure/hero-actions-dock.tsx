"use client";

import { artifactSetTierAt, type GameAction, type LegalAction } from "@/engine";

// ---------------------------------------------------------------------------
// Hero actions dock — the human click surface for MAP actions that have no
// destination hex to click:
//   - HERO_TRAIN (Anime Hero Grades §3.11): spend 2 movement → +1 Merit.
//   - HEAVEN_TRIBULATION (Anime Cultivation §5.6): brave the tribulation dice.
//   - REVISIT_FIELD: activate the location under a stationary Hero, including a
//     Monolith at the beginning of the turn.
//   - BUILD_GRAIL: build the carried Grail token at a Town/Settlement the Hero
//     controls (map-maker `grailBuildAt` / the hidden Grail-Utopia package). The
//     engine offers this, but without a button here it was unreachable in the UI.
//   - USE_ARTIFACT_SET_POWER (Polish Set Artifacts): the two MAP tiers — the
//     Wizard's Well draw-then-discard and the Diplomat's Cloak Neutral-deck
//     scry, both once per round. Several may be offered at once (one per Neutral
//     tier deck), so unlike the fixed hero actions these render one button per
//     OFFER, labelled by the engine.
//
// Availability is READ from the legal-action list (never re-derived here), so a
// button appears IFF `getLegalActions` currently offers that action to the
// viewer — module off, wrong phase, or not-your-turn all mean the engine emits
// no offer, so no button renders. Clicking dispatches the exact legal payload.
// ---------------------------------------------------------------------------

type HeroMapActionKey = "train" | "tribulation" | "revisit" | "build" | "artifact-set" | "ally-transfer";

/** EN/VI label + a one-line cost/effect tooltip per hero map action. */
const HERO_MAP_ACTION_LABELS: Record<HeroMapActionKey, { en: string; vi: string; title: string }> = {
  train: {
    en: "Train",
    vi: "Luyện tập",
    title: "Spend 2 movement points → +1 Merit toward the next Hero Grade (once per turn)"
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
  },
  build: {
    en: "Build the Grail",
    vi: "",
    title: "Build the carried Grail at this Town or Settlement you control"
  },
  "artifact-set": {
    en: "",
    vi: "",
    title: "Artifact set bonus — once per round"
  },
  "ally-transfer": {
    en: "",
    vi: "",
    title: "Offer this resource or Artifact to an ally; they must accept"
  }
};

/** Keys whose button text is the ENGINE's label (several offers may co-exist). */
const ENGINE_LABELLED_KEYS = new Set<HeroMapActionKey>(["revisit", "build", "artifact-set", "ally-transfer"]);

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
  if (action.type === "BUILD_GRAIL") {
    return "build";
  }
  if (action.type === "OFFER_ALLY_TRANSFER") {
    return "ally-transfer";
  }
  // Polish Set Artifacts: only the MAP tiers reach a map legal-action list at
  // all (the combat tiers live in the command dock) — the engine decides which of
  // the two, and for which deck. The one shape that must be filtered is the
  // 2026-08-11 pop-up INSTANT ("rolls 2 dice and resolves the higher result"),
  // whose only surface is the open attack window's reaction tray: dropping it
  // here keeps this dock from ever growing a duplicate button for it, however the
  // two table screens are mounted.
  if (action.type === "USE_ARTIFACT_SET_POWER") {
    return artifactSetTierAt(action.setId, action.tier)?.timing === "attack-window" ? null : "artifact-set";
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
          offer.action.type === "REVISIT_FIELD" || offer.action.type === "BUILD_GRAIL"
            ? `${offer.key}:${offer.action.heroId}`
            : offer.action.type === "USE_ARTIFACT_SET_POWER"
              ? // One offer per set tier, and the Diplomat's Cloak scry is offered
                // once per Neutral deck — so the set id alone is not unique.
                `${offer.key}:${offer.action.setId}:${offer.action.tier}:${offer.action.neutralTier ?? ""}`
              : offer.action.type === "OFFER_ALLY_TRANSFER"
                ? `${offer.key}:${offer.action.fromHeroId}:${offer.action.targetPlayerId}:${offer.action.targetHeroId ?? "market"}:${JSON.stringify(offer.action.transfer)}`
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
              {ENGINE_LABELLED_KEYS.has(offer.key) ? offer.legalLabel : label.en}
            </span>
            {label.vi ? <small className="heroActionLabelVi">{label.vi}</small> : null}
          </button>
        );
      })}
    </section>
  );
}
