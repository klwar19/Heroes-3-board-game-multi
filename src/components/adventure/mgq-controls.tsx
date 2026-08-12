"use client";

/* eslint-disable @next/next/no-img-element */

import { Check, Sparkles } from "lucide-react";
import { useState } from "react";

import { coreUnitDefinitions } from "@/data/factions/units";
import {
  MGQ_GOLD_CONTRACT_LIMIT,
  isMgqGoldUnit,
  mgqGoldContractAllows
} from "@/engine/mgq-contracts";
import {
  MGQ_JOB_LABELS,
  mgqEffectiveJob,
  mgqJobAssignmentCost,
  mgqJobEligible,
  mgqJobsForUnit
} from "@/engine/mgq-jobs";
import { MGQ_SPIRITS, MGQ_SPIRIT_LABELS, MGQ_SPIRIT_RULES } from "@/engine/mgq-spirits";
import type {
  ArmyUnitState,
  GameAction,
  GameState,
  LegalAction,
  MgqSpirit,
  PlayerId,
  PlayerState,
  ResourceCost
} from "@/engine/state";
import { assetUrl } from "@/lib/asset-url";
import { formatCost } from "@/components/table/utils";

const JOB_RULES = {
  warrior: "on its own attack, roll 2 Attack dice and resolve the higher result",
  guard: "gain a Defense die when attacked",
  mage: "once per combat before moving, deal 1 damage with Magic Arrow",
  healer: "[activation] heal exactly 1 damage from a wounded adjacent ally",
  martial_artist: 'reroll every "-1" rolled by this unit',
  hunter: 'on a "-1" or "0" Attack die, ignore 1 enemy Defense',
  thief: "after attacking, may return to its starting cell",
  spiritualist: "reduce incoming Spell damage by 1",
  unemployed: "no bonus",
  noble: "+1 gold at the start of each Resource round",
  hero: 'once per combat when defeated, roll: revive at 1 Health on "-1" or "0"',
  gadabout: "+1 bonus unit experience after surviving a won combat",
  maid: "adjacent allies gain +2 Initiative while they remain adjacent"
} as const;

const JOB_ICONS = {
  warrior: "/assets/anime/icons/mgq/rank-job-warrior.webp",
  guard: "/assets/anime/icons/mgq/rank-job-guard.webp",
  mage: "/assets/anime/icons/mgq/rank-job-mage.webp",
  healer: "/assets/anime/icons/mgq/rank-job-healer.webp",
  martial_artist: "/assets/anime/icons/mgq/rank-job-martial-artist.webp",
  hunter: "/assets/anime/icons/mgq/rank-job-hunter.webp",
  thief: "/assets/anime/icons/mgq/rank-job-thief.webp",
  spiritualist: "/assets/anime/icons/mgq/rank-job-spiritualist.webp",
  unemployed: "/assets/anime/icons/mgq/rank-job-unemployed.webp",
  noble: "/assets/anime/icons/mgq/rank-job-noble.webp",
  hero: "/assets/anime/icons/mgq/rank-job-hero.webp",
  gadabout: "/assets/anime/icons/mgq/rank-job-gadabout.webp",
  maid: "/assets/anime/icons/mgq/rank-job-maid.webp"
} as const;

const SPIRIT_ICONS: Record<MgqSpirit, string> = {
  sylph: "/assets/anime/icons/mgq/spirit-sylph.webp",
  gnome: "/assets/anime/icons/mgq/spirit-gnome.webp",
  undine: "/assets/anime/icons/mgq/spirit-undine.webp",
  salamander: "/assets/anime/icons/mgq/spirit-salamander.webp"
};

/** A Gold card outside the three recorded contracts is no longer part of this game's visible roster. */
export function mgqGoldUnavailable(player: PlayerState, unitDefId: string): boolean {
  return player.factionId === "mgq" && isMgqGoldUnit(unitDefId) && !mgqGoldContractAllows(player, unitDefId);
}

/** The three persistent Gold-contract slots shown above both army and Population rosters. */
export function MgqGoldContractPanel({ player }: { player: PlayerState }) {
  if (player.factionId !== "mgq") return null;

  const picks = player.mgqGoldContracts ?? [];
  const goldRoster = Object.values(coreUnitDefinitions).filter(
    (definition) => definition.faction === "mgq" && definition.tier === "gold"
  );
  const setupPending = Boolean(player.mgqGoldContractSetupRequired);
  const hidden = picks.length >= MGQ_GOLD_CONTRACT_LIMIT || setupPending
    ? goldRoster.filter((definition) => !picks.includes(definition.id)).length
    : 0;

  return (
    <section className="mgqGoldContracts" aria-label="Gold Contract">
      <header>
        <span><Sparkles aria-hidden="true" size={14} /> Gold Contract</span>
        <b>{Math.min(picks.length, MGQ_GOLD_CONTRACT_LIMIT)}/{MGQ_GOLD_CONTRACT_LIMIT}</b>
      </header>
      <div className="mgqContractSlots">
        {Array.from({ length: MGQ_GOLD_CONTRACT_LIMIT }, (_, index) => {
          const unitDefId = picks[index];
          const definition = unitDefId ? coreUnitDefinitions[unitDefId] : undefined;
          return (
            <span className={`mgqContractSlot ${unitDefId ? "locked" : "open"}`} key={index}>
              {unitDefId ? <Check aria-hidden="true" size={12} /> : <span>{index + 1}</span>}
              <b>{definition?.name ?? `Contract ${index + 1}`}</b>
              <small>{unitDefId ? "contracted for this game" : "choose during setup"}</small>
            </span>
          );
        })}
      </div>
      <small className="mgqContractNote">
        {setupPending
          ? "Gold recruitment is locked until the mandatory setup choice selects exactly three identities."
          : hidden > 0
          ? `${hidden} uncontracted Gold companion${hidden === 1 ? " is" : "s are"} hidden; the three contracted cards remain recruitable.`
          : "Legacy game: Gold contracts are recorded on successful recruitment."}
      </small>
    </section>
  );
}

/** Mandatory setup surface: confirmation commits an exact trio in one engine action. */
export function MgqGoldContractSetupPrompt({
  state,
  playerId,
  legalActions,
  onAction
}: {
  state: GameState;
  playerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const choice = state.pendingChoice;
  if (
    choice?.type !== "OPTION_CHOICE" ||
    choice.context !== "mgq-gold-contract" ||
    choice.playerId !== playerId ||
    !choice.mgqGoldContract
  ) {
    return null;
  }
  return (
    <MgqGoldContractSetupBody
      choice={choice}
      key={choice.id}
      legalActions={legalActions}
      onAction={onAction}
    />
  );
}

function MgqGoldContractSetupBody({
  choice,
  legalActions,
  onAction
}: {
  choice: Extract<NonNullable<GameState["pendingChoice"]>, { type: "OPTION_CHOICE" }>;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const contract = choice.mgqGoldContract!;
  const actions = new Map<number, Extract<GameAction, { type: "CHOOSE_OPTION" }>>();
  for (const legal of legalActions) {
    if (legal.action.type === "CHOOSE_OPTION" && legal.action.choiceId === choice.id) {
      actions.set(legal.action.optionIndex, legal.action);
    }
  }
  const roster = [...new Set(contract.pairs.flat())];
  const selectedPairIndex = selected.length === MGQ_GOLD_CONTRACT_LIMIT
    ? contract.pairs.findIndex(
        ([first, second, third]) => selected.includes(first) && selected.includes(second) && selected.includes(third)
      )
    : -1;
  const confirm = selectedPairIndex >= 0 ? actions.get(selectedPairIndex) : undefined;
  return (
    <div className="promptTray mgqGoldSetupPrompt" role="dialog" aria-label="Choose three Gold Contracts">
      <header>
        <img alt="" className="mgqPromptIcon" src={assetUrl("/assets/anime/icons/mgq/mechanic-companion-seal.webp")} />
        <div><small>Mandatory setup</small><strong>Gold Contract</strong></div>
        <span>Choose exactly three Gold Companions. The other five are unavailable this game.</span>
      </header>
      <div className="mgqGoldIdentityChoices" role="group" aria-label="Gold Companion identities">
        {roster.map((unitDefId) => {
          const definition = coreUnitDefinitions[unitDefId];
          const picked = selected.includes(unitDefId);
          return (
            <button
              aria-pressed={picked}
              className={`mgqGoldIdentity ${picked ? "selected" : ""}`}
              disabled={!picked && selected.length >= MGQ_GOLD_CONTRACT_LIMIT}
              key={unitDefId}
              onClick={() => setSelected((current) =>
                current.includes(unitDefId)
                  ? current.filter((candidate) => candidate !== unitDefId)
                  : [...current, unitDefId]
              )}
              type="button"
            >
              {definition?.pack?.cardImage ? <img alt="" src={assetUrl(definition.pack.cardImage)} /> : null}
              <b>{definition?.name ?? unitDefId}</b>
              {picked ? <Check aria-hidden="true" size={16} /> : null}
            </button>
          );
        })}
      </div>
      <button
        className="commandButton primary"
        disabled={!confirm}
        onClick={() => confirm && onAction(confirm)}
        type="button"
      >
        {selected.length === MGQ_GOLD_CONTRACT_LIMIT ? "Confirm three Gold Contracts" : `Select ${MGQ_GOLD_CONTRACT_LIMIT - selected.length} more`}
      </button>
    </div>
  );
}

/** Current/default Job token and town-only reassignment controls for one eligible army card. */
export function MgqJobControl({
  state,
  playerId,
  unit,
  legalActions,
  onAction
}: {
  state: GameState;
  playerId: PlayerId;
  unit: ArmyUnitState;
  legalActions: LegalAction[];
  onAction?: (action: GameAction) => void;
}) {
  const player = state.players[playerId];
  if (player?.factionId !== "mgq" || !mgqJobEligible(unit)) return null;

  const current = mgqEffectiveJob(unit)!;
  const cost = mgqJobAssignmentCost(state, playerId);
  const assignmentActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "ASSIGN_UNIT_JOB" }> } =>
      legal.action.type === "ASSIGN_UNIT_JOB" && legal.action.armyUnitId === unit.id
  );

  return (
    <div className="mgqJobControl" aria-label={`Job for ${coreUnitDefinitions[unit.unitDefId]?.name ?? unit.unitDefId}`}>
      <div className="mgqJobCurrent">
        <img alt="" className="mgqMechanicIcon" src={assetUrl("/assets/anime/icons/mgq/mechanic-job-reassign.webp")} />
        <span>Job</span>
        <b>{MGQ_JOB_LABELS[current]}</b>
        {!unit.job ? <small>default</small> : null}
        <em>{cost === 0 ? "free reassignment" : `${cost} gold to reassign`}</em>
      </div>
      <div className="mgqJobChoices" role="group" aria-label="Reassign Job">
        {mgqJobsForUnit(unit.unitDefId).map((job) => {
          const legal = assignmentActions.find((candidate) => candidate.action.job === job);
          const selected = current === job;
          return (
            <button
              aria-pressed={selected}
              className={selected ? "selected" : ""}
              disabled={selected || !legal || !onAction}
              key={job}
              onClick={() => legal && onAction?.(legal.action)}
              title={selected ? `${MGQ_JOB_LABELS[job]} is active: ${JOB_RULES[job]}` : legal ? `${legal.label}: ${JOB_RULES[job]}` : `Reassign in your own town: ${JOB_RULES[job]}`}
              type="button"
            >
              <img alt="" src={assetUrl(JOB_ICONS[job])} />
              <span>{MGQ_JOB_LABELS[job]}</span>
            </button>
          );
        })}
      </div>
      {assignmentActions.length === 0 ? <small className="mgqJobWhere">Reassign while the main hero is in your own town.</small> : null}
    </div>
  );
}

/** Innate Four Spirits summon choice; the Shrine now grants a separate resource-die bonus. */
export function MgqSpiritShrinePanel({
  state,
  playerId,
  legalActions,
  onAction
}: {
  state: GameState;
  playerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const player = state.players[playerId];
  const town = Object.values(state.towns).find((candidate) => candidate.controllerId === playerId);
  if (player?.factionId !== "mgq" || !town) return null;

  const spiritActions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "SET_MGQ_SPIRIT" }> } =>
      legal.action.type === "SET_MGQ_SPIRIT" && legal.action.playerId === playerId
  );

  return (
    <div className="mgqSpiritPanel" aria-label="Four Spirits summon">
      <div className="mgqSpiritHeading">
        <b><img alt="" className="mgqMechanicIcon" src={assetUrl("/assets/anime/icons/mgq/mechanic-spirit-contract.webp")} /> Four Spirits</b>
        <small>{player.mgqSpirit ? `${MGQ_SPIRIT_LABELS[player.mgqSpirit]} will be summoned next combat` : "Required before battle: choose 1 of the 4 Spirits"}</small>
      </div>
      <div className="mgqSpiritChoices">
        {MGQ_SPIRITS.map((spirit) => {
          const selected = player.mgqSpirit === spirit;
          const legal = spiritActions.find((candidate) => candidate.action.spirit === spirit);
          return (
            <button
              aria-pressed={selected}
              className={`built ${selected ? "selected" : ""}`}
              disabled={selected || !legal}
              key={spirit}
              onClick={() => legal && onAction(legal.action)}
              type="button"
            >
              <span><img alt="" src={assetUrl(SPIRIT_ICONS[spirit])} />{selected ? <Check aria-hidden="true" size={13} /> : <Sparkles aria-hidden="true" size={13} />}{MGQ_SPIRIT_LABELS[spirit]}</span>
              <small>Lv 1–3: {MGQ_SPIRIT_RULES[spirit].basic}<br />Lv 4–7: {MGQ_SPIRIT_RULES[spirit].advanced}</small>
            </button>
          );
        })}
      </div>
      <small className="mgqSpiritTiming">Your chosen Spirit is summoned automatically at combat start. The Spirit Shrine separately rolls one Resource die each Resource round.</small>
    </div>
  );
}

function appliedCompanionCost(state: GameState, playerId: PlayerId, printed: ResourceCost): string {
  return (state.players[playerId]?.mgqFreeCompanionSeals ?? 0) > 0
    ? `free (Eye of Recollection charge; printed ${formatCost(printed)})`
    : formatCost(printed);
}

/** Dedicated atomic after-combat offer: card face, exact price, accept, and explicit decline. */
export function MgqCompanionRecruitmentPrompt({
  state,
  playerId,
  legalActions,
  onAction
}: {
  state: GameState;
  playerId: PlayerId;
  legalActions: LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const pending = state.adventure?.pendingCompanionRecruitment;
  if (!pending || pending.playerId !== playerId) return null;

  const actions = legalActions.filter(
    (legal): legal is LegalAction & { action: Extract<GameAction, { type: "RESOLVE_COMPANION_RECRUITMENT" }> } =>
      legal.action.type === "RESOLVE_COMPANION_RECRUITMENT" && legal.action.playerId === playerId
  );
  const decline = actions.find((legal) => legal.action.unitDefId === null);

  return (
    <div className="promptTray mgqCompanionPrompt" role="dialog" aria-label="Companion Recruitment">
      <header>
        <img alt="" className="mgqPromptIcon" src={assetUrl("/assets/anime/icons/mgq/mechanic-companion-seal.webp")} />
        <div>
          <small>Fought neutral victory</small>
          <strong>Companion Recruitment</strong>
        </div>
        <span>Seal one defeated bronze or silver card</span>
      </header>
      <div className="mgqCompanionOffers">
        {pending.options.map((option) => {
          const definition = coreUnitDefinitions[option.unitDefId];
          const face = definition?.neutral ?? definition?.few ?? definition?.pack;
          const accept = actions.find((legal) => legal.action.unitDefId === option.unitDefId);
          const cost = appliedCompanionCost(state, playerId, option.cost);
          return (
            <article className={`mgqCompanionOffer ${accept ? "affordable" : "unaffordable"}`} key={option.unitDefId}>
              {face?.cardImage ? <img alt={`${definition?.name ?? option.unitDefId} Neutral card`} src={assetUrl(face.cardImage)} /> : <span className={`mgqCompanionFallback ${option.tier}`} />}
              <div>
                <span className={`tierDot ${option.tier}`} />
                <b>{definition?.name ?? option.unitDefId}</b>
                <small>{option.tier} Neutral-side Companion</small>
                <strong className="mgqCompanionCost">Cost: {cost}</strong>
                <small>Returns to the Neutral discard if defeated.</small>
              </div>
              <button className="commandButton primary" disabled={!accept} onClick={() => accept && onAction(accept.action)} type="button">
                {accept ? `Seal ${definition?.name ?? option.unitDefId}` : "Cannot afford"}
              </button>
            </article>
          );
        })}
      </div>
      {decline ? (
        <button className="commandButton mgqCompanionDecline" onClick={() => onAction(decline.action)} type="button">
          Decline Companion Recruitment
        </button>
      ) : null}
    </div>
  );
}
