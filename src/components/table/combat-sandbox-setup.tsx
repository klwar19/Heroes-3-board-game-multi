"use client";

import { useMemo, useState } from "react";
import { cardLibrary } from "@/data/cards/library";
import {
  coreFactionDefinitions,
  coreHeroDefinitions,
  isPlayableFaction
} from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { COMMANDER_STAT_KEYS, COMMANDER_STAT_LABELS } from "@/data/commanders";
import {
  isCombatSandboxSetup,
  sandboxBattlefieldChoices,
  type CombatSandboxSeatConfig,
  type CombatSandboxUnitPick,
  type FactionId,
  type GameAction,
  type GameState,
  type PlayerId,
  type WogModOptions
} from "@/engine";
import { COMBAT_BOARD_ART_VARIANTS } from "@/components/table/board";
import { assetUrl } from "@/lib/asset-url";

const PLAYABLE_FACTIONS = Object.values(coreFactionDefinitions).filter((faction) =>
  isPlayableFaction(faction.id)
);

const HAND_CARD_KINDS = new Set([
  "spell",
  "ability",
  "artifact",
  "statistic",
  "hero-specialty",
  "war-machine"
]);

const PICKABLE_CARDS = Object.values(cardLibrary)
  .filter((card) => card.implementationStatus === "implemented" && HAND_CARD_KINDS.has(card.kind))
  .sort((a, b) => a.name.localeCompare(b.name));

// Only offer morale cards the engine actually runs in a regular/Battle Test game:
// the two Battlefield-Symbol cards are `not-implemented` (the rulebook removes
// them from regular play), so filtering on implementationStatus keeps a tester
// from stocking a held card that would do nothing.
const MORALE_POSITIVE = Object.values(cardLibrary).filter(
  (card) => card.id.startsWith("morale.positive.") && card.implementationStatus === "implemented"
);
const MORALE_NEGATIVE = Object.values(cardLibrary).filter(
  (card) => card.id.startsWith("morale.negative.") && card.implementationStatus === "implemented"
);

function heroesForFaction(factionId: FactionId) {
  return Object.values(coreHeroDefinitions).filter((hero) => hero.faction === factionId);
}

function unitsForPicker() {
  return Object.values(coreUnitDefinitions)
    .filter((unit) => unit.few || unit.pack || unit.neutral)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sideOptions(unitDefId: string): CombatSandboxUnitPick["side"][] {
  const def = coreUnitDefinitions[unitDefId];
  if (!def) {
    return [];
  }
  const sides: CombatSandboxUnitPick["side"][] = [];
  if (def.few) {
    sides.push("few");
  }
  if (def.pack) {
    sides.push("pack");
  }
  if (def.neutral) {
    sides.push("neutral");
  }
  return sides;
}

function unitCap(state: GameState): number {
  const wog = state.combatSandboxSetup?.wog;
  return wog?.enabled && wog.commanders ? 4 : 5;
}

function SeatEditor({
  seat,
  seatId,
  unitLimit,
  moraleCardsOn,
  commandersOn,
  onAction,
  actorId
}: {
  seat: CombatSandboxSeatConfig;
  seatId: PlayerId;
  unitLimit: number;
  moraleCardsOn: boolean;
  commandersOn: boolean;
  onAction: (action: GameAction) => void;
  actorId: PlayerId;
}) {
  const [cardFilter, setCardFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [cardZone, setCardZone] = useState<"hand" | "deck">("hand");

  const heroes = heroesForFaction(seat.factionId);
  const units = useMemo(() => {
    const q = unitFilter.trim().toLowerCase();
    return unitsForPicker().filter((unit) => {
      if (!q) {
        return true;
      }
      return (
        unit.name.toLowerCase().includes(q) ||
        unit.id.toLowerCase().includes(q) ||
        unit.faction.toLowerCase().includes(q)
      );
    });
  }, [unitFilter]);

  const cards = useMemo(() => {
    const q = cardFilter.trim().toLowerCase();
    return PICKABLE_CARDS.filter((card) => {
      if (!q) {
        return true;
      }
      return (
        card.name.toLowerCase().includes(q) ||
        card.id.toLowerCase().includes(q) ||
        card.kind.toLowerCase().includes(q)
      );
    }).slice(0, 80);
  }, [cardFilter]);

  const patch = (next: Partial<CombatSandboxSeatConfig>) =>
    onAction({ type: "SANDBOX_CONFIGURE_SEAT", playerId: actorId, seatId, ...next });

  const addUnit = (unitDefId: string, side: CombatSandboxUnitPick["side"]) => {
    if (seat.units.length >= unitLimit) {
      return;
    }
    patch({ units: [...seat.units, { unitDefId, side }] });
  };

  const removeUnit = (index: number) => {
    patch({ units: seat.units.filter((_, i) => i !== index) });
  };

  const addCard = (cardId: string) => {
    if (cardZone === "hand") {
      patch({ hand: [...seat.hand, cardId] });
    } else {
      patch({ deck: [...seat.deck, cardId] });
    }
  };

  const removeFromZone = (zone: "hand" | "deck", index: number) => {
    if (zone === "hand") {
      patch({ hand: seat.hand.filter((_, i) => i !== index) });
    } else {
      patch({ deck: seat.deck.filter((_, i) => i !== index) });
    }
  };

  return (
    <section className="sandboxSeatPanel" aria-label={`${seatId} setup`}>
      <header className="sandboxSeatHead">
        <h3>{seatId === "p1" ? "Attacker" : "Defender"}</h3>
        <strong>{seat.name}</strong>
      </header>

      <div className="sandboxField">
        <label htmlFor={`${seatId}-faction`}>Faction</label>
        <select
          id={`${seatId}-faction`}
          value={seat.factionId}
          onChange={(event) => patch({ factionId: event.target.value as FactionId })}
        >
          {PLAYABLE_FACTIONS.map((faction) => (
            <option key={faction.id} value={faction.id}>
              {faction.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sandboxField">
        <label htmlFor={`${seatId}-hero`}>Hero</label>
        <select
          id={`${seatId}-hero`}
          value={seat.heroDefId}
          onChange={(event) => patch({ heroDefId: event.target.value })}
        >
          {heroes.map((hero) => (
            <option key={hero.id} value={hero.id}>
              {hero.name} ({hero.class})
            </option>
          ))}
        </select>
      </div>

      <div className="sandboxFieldRow">
        <div className="sandboxField">
          <label htmlFor={`${seatId}-level`}>Hero level</label>
          <select
            id={`${seatId}-level`}
            value={seat.heroLevel}
            onChange={(event) => patch({ heroLevel: Number(event.target.value) })}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        {!moraleCardsOn ? (
          <div className="sandboxField">
            <label htmlFor={`${seatId}-morale`}>Morale token</label>
            <select
              id={`${seatId}-morale`}
              value={seat.morale}
              onChange={(event) => patch({ morale: Number(event.target.value) })}
            >
              <option value={1}>+1</option>
              <option value={0}>0</option>
              <option value={-1}>−1</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="sandboxBlock">
        <div className="sandboxBlockHead">
          <strong>
            Units ({seat.units.length}/{unitLimit})
          </strong>
          <input
            aria-label={`Filter units for ${seatId}`}
            className="sandboxFilter"
            onChange={(event) => setUnitFilter(event.target.value)}
            placeholder="Filter units…"
            value={unitFilter}
          />
        </div>
        <ul className="sandboxChipList">
          {seat.units.map((unit, index) => {
            const def = coreUnitDefinitions[unit.unitDefId];
            return (
              <li key={`${unit.unitDefId}-${index}`}>
                <span>
                  {def?.name ?? unit.unitDefId} ({unit.side})
                </span>
                <button onClick={() => removeUnit(index)} type="button">
                  Remove
                </button>
              </li>
            );
          })}
          {seat.units.length === 0 ? <li className="sandboxEmpty">No units — add from the list below.</li> : null}
        </ul>
        <div className="sandboxPickGrid" role="list">
          {units.slice(0, 48).map((unit) => {
            const sides = sideOptions(unit.id);
            return (
              <div className="sandboxPickRow" key={unit.id} role="listitem">
                <span title={unit.id}>
                  {unit.name}{" "}
                  <small>
                    ({unit.faction} · {unit.tier})
                  </small>
                </span>
                <span className="sandboxSideButtons">
                  {sides.map((side) => (
                    <button
                      disabled={seat.units.length >= unitLimit}
                      key={side}
                      onClick={() => addUnit(unit.id, side)}
                      type="button"
                    >
                      +{side}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sandboxBlock">
        <div className="sandboxBlockHead">
          <strong>Cards</strong>
          <div className="sandboxZoneToggle" role="group" aria-label="Card zone">
            <button
              aria-pressed={cardZone === "hand"}
              className={cardZone === "hand" ? "selected" : ""}
              onClick={() => setCardZone("hand")}
              type="button"
            >
              Hand ({seat.hand.length})
            </button>
            <button
              aria-pressed={cardZone === "deck"}
              className={cardZone === "deck" ? "selected" : ""}
              onClick={() => setCardZone("deck")}
              type="button"
            >
              Deck ({seat.deck.length})
            </button>
          </div>
        </div>
        <ul className="sandboxChipList">
          {(cardZone === "hand" ? seat.hand : seat.deck).map((cardId, index) => (
            <li key={`${cardZone}-${cardId}-${index}`}>
              <span>{cardLibrary[cardId]?.name ?? cardId}</span>
              <button onClick={() => removeFromZone(cardZone, index)} type="button">
                Remove
              </button>
            </li>
          ))}
        </ul>
        <input
          aria-label={`Filter cards for ${seatId}`}
          className="sandboxFilter"
          onChange={(event) => setCardFilter(event.target.value)}
          placeholder="Filter cards to add…"
          value={cardFilter}
        />
        <div className="sandboxPickGrid" role="list">
          {cards.map((card) => (
            <button
              className="sandboxCardPick"
              key={card.id}
              onClick={() => addCard(card.id)}
              type="button"
            >
              <small>{card.kind}</small> {card.name}
            </button>
          ))}
        </div>
      </div>

      {moraleCardsOn ? (
        <div className="sandboxBlock">
          <strong>Held morale cards</strong>
          <div className="sandboxFieldRow">
            <div className="sandboxField">
              <label htmlFor={`${seatId}-pos-morale`}>Add positive</label>
              <select
                id={`${seatId}-pos-morale`}
                defaultValue=""
                onChange={(event) => {
                  const id = event.target.value;
                  if (!id) {
                    return;
                  }
                  patch({
                    moraleCards: {
                      positive: [...(seat.moraleCards?.positive ?? []), id],
                      negative: [...(seat.moraleCards?.negative ?? [])]
                    }
                  });
                  event.target.value = "";
                }}
              >
                <option value="">—</option>
                {MORALE_POSITIVE.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sandboxField">
              <label htmlFor={`${seatId}-neg-morale`}>Add negative</label>
              <select
                id={`${seatId}-neg-morale`}
                defaultValue=""
                onChange={(event) => {
                  const id = event.target.value;
                  if (!id) {
                    return;
                  }
                  patch({
                    moraleCards: {
                      positive: [...(seat.moraleCards?.positive ?? [])],
                      negative: [...(seat.moraleCards?.negative ?? []), id]
                    }
                  });
                  event.target.value = "";
                }}
              >
                <option value="">—</option>
                {MORALE_NEGATIVE.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ul className="sandboxChipList">
            {(seat.moraleCards?.positive ?? []).map((cardId, index) => (
              <li key={`pos-${cardId}-${index}`}>
                <span>+ {cardLibrary[cardId]?.name ?? cardId}</span>
                <button
                  onClick={() =>
                    patch({
                      moraleCards: {
                        positive: (seat.moraleCards?.positive ?? []).filter((_, i) => i !== index),
                        negative: [...(seat.moraleCards?.negative ?? [])]
                      }
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
            {(seat.moraleCards?.negative ?? []).map((cardId, index) => (
              <li key={`neg-${cardId}-${index}`}>
                <span>− {cardLibrary[cardId]?.name ?? cardId}</span>
                <button
                  onClick={() =>
                    patch({
                      moraleCards: {
                        positive: [...(seat.moraleCards?.positive ?? [])],
                        negative: (seat.moraleCards?.negative ?? []).filter((_, i) => i !== index)
                      }
                    })
                  }
                  type="button"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {commandersOn ? (
        <div className="sandboxBlock">
          <strong>WOG Commander grades</strong>
          <div className="sandboxGradeGrid">
            {COMMANDER_STAT_KEYS.map((key) => (
              <label key={key}>
                {COMMANDER_STAT_LABELS[key]}
                <select
                  value={seat.commanderGrades?.[key] ?? 0}
                  onChange={(event) =>
                    patch({
                      commanderGrades: {
                        ...seat.commanderGrades,
                        [key]: Number(event.target.value)
                      }
                    })
                  }
                >
                  {[0, 1, 2, 3].map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="sandboxField">
            <label htmlFor={`${seatId}-cmd-points`}>Unspent grade points</label>
            <input
              id={`${seatId}-cmd-points`}
              min={0}
              type="number"
              value={seat.commanderGradePoints ?? 0}
              onChange={(event) => patch({ commanderGradePoints: Number(event.target.value) || 0 })}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Battle Test free-setup lobby: both seats, battlefield, morale and WOG, then
 * Begin battle. Pure presentation over SANDBOX_* engine actions.
 */
export function CombatSandboxSetupScreen({
  state,
  viewerPlayerId,
  onAction
}: {
  state: GameState;
  viewerPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
}) {
  if (!isCombatSandboxSetup(state) || !state.combatSandboxSetup) {
    return null;
  }

  const setup = state.combatSandboxSetup;
  const actorId: PlayerId =
    viewerPlayerId === "p1" || viewerPlayerId === "p2" ? viewerPlayerId : "p1";
  const unitLimit = unitCap(state);
  const wog: WogModOptions = { ...setup.wog };
  const boardChoices = sandboxBattlefieldChoices();

  const setOptions = (options: {
    boardArtId?: (typeof setup)["boardArtId"];
    obstacles?: number[];
    moraleCards?: boolean;
    wog?: Partial<WogModOptions>;
    playMode?: "binh" | "tournament";
  }) => onAction({ type: "SANDBOX_SET_OPTIONS", playerId: actorId, options });

  const playMode = setup.playMode === "tournament" ? "tournament" : "binh";

  const boardPreview =
    setup.boardArtId === "random"
      ? null
      : COMBAT_BOARD_ART_VARIANTS.find((variant) => variant.id === setup.boardArtId);

  return (
    <div className="sandboxSetup" aria-label="Battle Test setup">
      <header className="sandboxSetupHero">
        <div>
          <span className="sandboxEyebrow">Battle Test</span>
          <h2>Build the fight</h2>
          <p>
            Freely pick factions, units and cards for both seats, toggle morale / WOG commanders,
            choose a battlefield, then begin. Both sides will place units like a normal PvP battle.
          </p>
        </div>
        <button
          className="commandButton primary sandboxBeginBtn"
          onClick={() => onAction({ type: "SANDBOX_BEGIN_COMBAT", playerId: actorId })}
          type="button"
        >
          Begin deployment
        </button>
      </header>

      <section className="sandboxOptions" aria-label="Battle options">
        <div className="sandboxField">
          <label htmlFor="sandbox-play-mode">Rules mode</label>
          <select
            id="sandbox-play-mode"
            value={playMode}
            onChange={(event) =>
              setOptions({
                playMode: event.target.value === "tournament" ? "tournament" : "binh"
              })
            }
          >
            <option value="binh">BINH (house-rule edition)</option>
            <option value="tournament">Tournament (competitive / legacy)</option>
          </select>
        </div>
        <div className="sandboxField">
          <label htmlFor="sandbox-board">Battlefield</label>
          <select
            id="sandbox-board"
            value={setup.boardArtId}
            onChange={(event) =>
              setOptions({
                boardArtId: event.target.value as (typeof setup)["boardArtId"]
              })
            }
          >
            {boardChoices.map((id) => {
              const label =
                COMBAT_BOARD_ART_VARIANTS.find((variant) => variant.id === id)?.label ?? id;
              return (
                <option key={id} value={id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
        {boardPreview ? (
          <div className="sandboxBoardPreview">
            <img alt={boardPreview.label} src={assetUrl(boardPreview.terrain)} />
          </div>
        ) : null}

        <div className="sandboxToggleRow">
          <label className="sandboxToggle">
            <input
              checked={setup.moraleCards}
              onChange={(event) => setOptions({ moraleCards: event.target.checked })}
              type="checkbox"
            />
            Morale Cards (optional rule)
          </label>
          <label className="sandboxToggle">
            <input
              checked={wog.enabled}
              onChange={(event) =>
                setOptions({
                  wog: {
                    enabled: event.target.checked,
                    commanders: event.target.checked ? wog.commanders : false
                  }
                })
              }
              type="checkbox"
            />
            WOG mod
          </label>
          <label className="sandboxToggle">
            <input
              checked={Boolean(wog.enabled && wog.commanders)}
              disabled={!wog.enabled}
              onChange={(event) => setOptions({ wog: { enabled: true, commanders: event.target.checked } })}
              type="checkbox"
            />
            Commanders
          </label>
        </div>
        <p className="sandboxHint">
          {playMode === "tournament"
            ? "Tournament: legacy decks, Diplomacy and Hourglass banned, printed unit values. "
            : "BINH: split Spell/Artifact decks and house-rule unit tweaks. "}
          With Commanders on, each side deploys at most {unitLimit} army units (the commander is the
          extra body). Default armies are Catherine (Castle) vs Sandro (Necropolis).
        </p>
      </section>

      <div className="sandboxSeats">
        {(["p1", "p2"] as const).map((seatId) => (
          <SeatEditor
            actorId={actorId}
            commandersOn={Boolean(wog.enabled && wog.commanders)}
            key={seatId}
            moraleCardsOn={setup.moraleCards}
            onAction={onAction}
            seat={setup.seats[seatId]}
            seatId={seatId}
            unitLimit={unitLimit}
          />
        ))}
      </div>

      <footer className="sandboxSetupFoot">
        <button
          className="commandButton primary sandboxBeginBtn"
          onClick={() => onAction({ type: "SANDBOX_BEGIN_COMBAT", playerId: actorId })}
          type="button"
        >
          Begin deployment
        </button>
      </footer>
    </div>
  );
}
