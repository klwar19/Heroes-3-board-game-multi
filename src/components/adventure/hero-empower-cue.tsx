import { cardLibrary } from "@/data/cards/library";
import { assetUrl } from "@/lib/asset-url";
import {
  astrologersHeroEmpowerRemaining,
  getActiveAstrologersCard,
  hasOpenAdventureTurn,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";

type HeroEmpowerAction = LegalAction & {
  action: Extract<GameAction, { type: "ASTROLOGERS_HERO_EMPOWER" }>;
};

export type HeroEmpowerCueModel = {
  message: string;
  tone: "available" | "waiting";
  chooseCardId?: string;
  buttonLabel?: string;
};

/**
 * Builds the always-visible hand cue for the Hero proclamation. The legal
 * action remains attached to the Statistic card; this model only makes that
 * otherwise-hidden purchase discoverable and explains why it is unavailable.
 */
export function heroEmpowerCueModel(
  state: GameState,
  playerId: PlayerId,
  legalActions: readonly LegalAction[]
): HeroEmpowerCueModel | null {
  const effect = getActiveAstrologersCard(state)?.effect;
  if (effect?.type !== "PAID_EMPOWER_PER_TURN") {
    return null;
  }

  const astrologers = state.adventure?.astrologers;
  const player = state.players[playerId];
  if (!astrologers || !player) {
    return null;
  }

  const chosenRound = astrologers.heroEmpowerChosenRoundBy?.[playerId];
  const remaining = astrologersHeroEmpowerRemaining(state, playerId);
  const openTurn = hasOpenAdventureTurn(state, playerId);
  const actions = legalActions.filter(
    (legal): legal is HeroEmpowerAction => legal.action.type === "ASTROLOGERS_HERO_EMPOWER"
  );

  // Once this player's one eligible turn has passed, there is nothing left to
  // act on. Removing the cue also stops its availability animation immediately.
  if (chosenRound !== undefined && chosenRound !== state.round) {
    return null;
  }
  if (chosenRound === state.round && !openTurn) {
    return null;
  }
  if (remaining === 0) {
    return null;
  }
  if (!openTurn) {
    return {
      tone: "waiting",
      message: `You may choose one of your turns while Hero remains face up (up to ${effect.maxPerTurn} exchanges that turn).`
    };
  }
  if (player.needsHandRefresh || player.canMulligan) {
    return {
      tone: "waiting",
      message: "Finish the start-of-turn hand step, then choose a normal Statistic from your hand."
    };
  }
  if (actions.length > 0) {
    return {
      tone: "available",
      message: `${remaining} of ${effect.maxPerTurn} exchanges available this turn · ${effect.costGold} gold each. You may act or move between exchanges.`,
      chooseCardId: actions[0]!.action.cardId,
      buttonLabel: `Choose Statistic (${remaining} left)`
    };
  }

  const hasNormalStatistic = player.hand.some((cardId) => {
    const card = cardLibrary[cardId];
    return card?.kind === "statistic" && Boolean(card.statisticType) && !cardId.endsWith(".empowered");
  });
  return {
    tone: "waiting",
    message: hasNormalStatistic
      ? `Hero is available this turn, but you need ${effect.costGold} gold for an exchange.`
      : "Hero is available this turn, but you need a normal Statistic card in your hand."
  };
}

export function HeroEmpowerCue({
  model,
  onChoose
}: {
  model: HeroEmpowerCueModel;
  onChoose: (cardId: string) => void;
}) {
  return (
    <div className={`heroEmpowerCue ${model.tone}`} role="status" aria-label="Hero proclamation exchange">
      {/* eslint-disable-next-line @next/next/no-img-element -- compact generated game UI emblem */}
      <img
        alt=""
        aria-hidden="true"
        className="heroEmpowerIcon"
        src={assetUrl("/assets/ui/hero-empower-exchange.png")}
      />
      <span>
        <strong>Hero proclamation</strong>
        <small>{model.message}</small>
      </span>
      {model.chooseCardId && model.buttonLabel ? (
        <button className="commandButton" onClick={() => onChoose(model.chooseCardId!)} type="button">
          {model.buttonLabel}
        </button>
      ) : null}
    </div>
  );
}
