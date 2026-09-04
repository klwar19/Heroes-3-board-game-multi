"use client";

/* eslint-disable @next/next/no-img-element */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { assetUrl } from "@/lib/asset-url";
import { Sparkles, X, ZoomIn } from "lucide-react";
import { cardLibrary } from "@/data/cards/library";
import { cardFaceImage } from "@/data/cards/empowered-card-art";
import { useBalanceArtFlags, useCardFaceImage } from "./polish-balance-art";
import { isPolishBalanceCard } from "@/data/cards/polish-balance-art";
import { isCommunityBalanceCard } from "@/data/cards/community-balance-art";
import { balanceCardForDisplay } from "@/engine/community-balance-cards";
import {
  describeCardEffect,
  getInnateFlatAttackBonus,
  getUnitAbilityDefinitions,
  heroCombatProfile,
  unitFlipSidePreview,
  type CombatUnitState,
  type GameRuleset
} from "@/engine";
import { combatUnitVeterancy, veterancyXpLabel } from "./unit-veterancy";
import { getCardMetaLabels, isEmpoweredStatisticCard, titleCase } from "./utils";
import { SpecialtyCard } from "@/components/specialty-card";
import { canRenderSpecialtyCard, specialtyEffectText, specialtyIconSrc } from "@/components/specialty-card-data";
import { CommanderCardFace, CommanderStatsPanel } from "@/components/commander-card";
import { CardSetFrame } from "./artifact-set-badge";
import type { CommanderSlug, CommanderStatKey } from "@/data/commanders";
import { coreHeroDefinitions } from "@/data/factions/core";
import { factionGradeRegister, HERO_GRADE_REGISTERS, heroGradeIconForFaction } from "@/data/anime/hero-grades";
import { unitAbilities } from "@/data/units/abilities";

/** Anything the table can blow up to readable size: a card id or a unit card. */
export type ZoomContent = {
  title: string;
  image?: string;
  /**
   * The card this view is of, when it is a real library card. Only used to wear
   * the Polish Set Artifacts set badge (same gating and same icon as the small
   * `CardFrame` faces) — the enlarged reader is where a player actually studies
   * a card, so the set mark has to survive the zoom.
   */
  cardId?: string;
  /** Art-less specialty: render the native SpecialtyCard instead of an image. */
  specialtyCardId?: string;
  /**
   * WOG commander unit: render the DYNAMIC card face (real stat numbers and
   * the unlocked combination skills) instead of the static frame image.
   */
  commanderFace?: {
    slug: CommanderSlug;
    grades: Partial<Record<CommanderStatKey, number>>;
    statValues: { attack: number; defense: number; health: number; speed: number };
    dead?: boolean;
  };
  heroFace?: {
    heroDefId: string;
    level: number;
    grade: number;
    passiveName: string;
    combatType: CombatUnitState["type"];
    statValues: { attack: number; defense: number; health: number; initiative: number };
  };
  /** Hero Board-only progression information. Never used as the combat piece. */
  heroInfo?: NonNullable<ZoomContent["heroFace"]>;
  subtitle?: string;
  lines: string[];
  /** Empowered card (Empowered Statistic / an Empowered ability) — show the cue. */
  empowered?: boolean;
};

type LiveUnitStats = {
  attack: number;
  defense: number;
  health: number;
  initiative: number;
};

type CardZoomContextValue = {
  zoomCard: (cardId: string, empowered?: boolean) => void;
  zoomUnit: (unit: CombatUnitState, ruleset?: GameRuleset, liveStats?: LiveUnitStats) => void;
  zoomContent: (content: ZoomContent) => void;
};

const CardZoomContext = createContext<CardZoomContextValue | null>(null);

export function useCardZoom(): CardZoomContextValue {
  const value = useContext(CardZoomContext);
  if (!value) {
    throw new Error("useCardZoom must be used inside CardZoomProvider.");
  }

  return value;
}

/**
 * Like useCardZoom but returns null instead of throwing when there is no
 * provider, so a component (e.g. the town recruit rows) can offer click-to-zoom
 * where a provider exists and degrade to a plain, non-zoomable view where it is
 * rendered in isolation (unit tests, embeds).
 */
export function useOptionalCardZoom(): CardZoomContextValue | null {
  return useContext(CardZoomContext);
}

export function cardZoomContent(
  cardId: string,
  empowered?: boolean,
  balanceEnabled = false,
  communityEnabled = false
): ZoomContent {
  // Community reprints WIN over Polish ones for a card both packs cover, exactly
  // like the engine's `balanceCardLibrary`.
  const resolved = balanceCardForDisplay(balanceEnabled, communityEnabled, cardId);
  const card =
    resolved?.effect.type === "CHOOSE_ONE"
      ? {
          ...resolved,
          effect: {
            ...resolved.effect,
            options: resolved.effect.options.filter(
              (option) =>
                (balanceEnabled
                  ? option.forbidsHouseRule !== "polish-card-balance"
                  : option.requiresHouseRule !== "polish-card-balance") &&
                (communityEnabled
                  ? option.forbidsHouseRule !== "community-card-balance"
                  : option.requiresHouseRule !== "community-card-balance")
            )
          }
        }
      : resolved;
  if (!card) {
    return { title: cardId, cardId, lines: [], empowered: Boolean(empowered) };
  }

  // The reprint's own rules line. A card the COMMUNITY pack covers reads its
  // "Community balance: …" tag (that pack's definition is the one in play); a
  // Polish-only reprint keeps the "Balance pack: …" tag.
  const communityText =
    communityEnabled && isCommunityBalanceCard(cardId)
      ? card.tags.find((tag) => tag.startsWith("Community balance:"))?.replace(/^Community balance:\s*/, "")
      : undefined;
  const balanceText =
    communityText ??
    (balanceEnabled && isPolishBalanceCard(cardId)
      ? card.tags.find((tag) => tag.startsWith("Balance pack:"))?.replace(/^Balance pack:\s*/, "")
      : undefined);
  const lines: string[] = [balanceText ?? describeCardEffect(card)];
  const note = card.tags.find((tag) => tag.includes(" "));
  if (card.implementationStatus === "not-implemented" && note) {
    lines.push(`Printed text: ${note}`);
  }

  const showEmpowered = isEmpoweredStatisticCard(cardId) || Boolean(empowered);
  return {
    title: card.name,
    cardId,
    // Empowered abilities have their own printed "Empowered" face; the read view
    // shows it (with the ring on top) instead of the base scan.
    image: cardFaceImage(cardId, showEmpowered),
    specialtyCardId: !card.assets?.cardImage && canRenderSpecialtyCard(cardId) ? cardId : undefined,
    subtitle: getCardMetaLabels(card).join(" · "),
    lines,
    // An Empowered Statistic card is intrinsic; an Empowered *ability* is
    // per-owner, so the caller (which holds the player's empoweredAbilities)
    // passes the flag in — without it a zoomed empowered ability lost its glow.
    empowered: showEmpowered
  };
}

export function unitZoomContent(
  unit: CombatUnitState,
  ruleset: GameRuleset = "legacy",
  liveStats?: LiveUnitStats
): ZoomContent {
  const health = Math.max(0, unit.maxHealth - unit.damage);
  const abilities = getUnitAbilityDefinitions(unit);
  // A Pack card's other side: lethal damage flips it to its Few side. Shown as a
  // plain line so a player can read what the card becomes before committing.
  // (The zoom is a pure card view with no GameState, so the mode defaults come
  // from `ruleset` — the caller passes the table's.)
  const flip = unitFlipSidePreview(unit, ruleset);
  // The INNATE printed-ability flat Attack bonuses live on this card right now
  // (Cove Haspids' "Vengeance" +2 once it was knocked down to its Few side, the
  // WoG own-attack +1, the Black Dragons' Stacked +3). Read through the SAME
  // helper the attack resolver folds in, so a flipped Haspid reads the Attack
  // it will actually strike with instead of its bare printed Few value. The
  // zoom has no GameState, so card-borne buffs (Bless/Bloodlust/Offense) and
  // Attack tokens are still NOT folded here — the board card and the inspector
  // are the live-total surfaces for those.
  const innateAttackBonus = getInnateFlatAttackBonus(unit, false);
  const veterancy = combatUnitVeterancy(unit);
  const liveAttack = liveStats?.attack ?? unit.attack + innateAttackBonus;
  const liveDefense = liveStats?.defense ?? unit.defense;
  const liveHealth = liveStats?.health ?? unit.maxHealth;
  const liveInitiative = liveStats?.initiative ?? unit.initiative;

  return {
    title: unit.cardName,
    image: unit.assets?.cardImage,
    commanderFace:
      unit.commanderSlug && unit.commanderGrades
        ? {
            slug: unit.commanderSlug as CommanderSlug,
            grades: unit.commanderGrades,
            statValues: { attack: liveAttack, defense: liveDefense, health: liveHealth, speed: liveInitiative },
            dead: unit.damage >= unit.maxHealth
          }
        : undefined,
    heroFace:
      unit.heroUnit && unit.heroDefId
        ? {
            heroDefId: unit.heroDefId,
            level: unit.heroLevel ?? 1,
            grade: unit.heroGrade ?? 0,
            passiveName: unit.heroPassiveName ?? "Heroic Presence",
            combatType: unit.type,
            statValues: { attack: unit.attack, defense: unit.defense, health: unit.maxHealth, initiative: unit.initiative }
          }
        : undefined,
    subtitle: unit.heroUnit
      ? `battlefield hero · level ${unit.heroLevel ?? 1} · returns next combat`
      : unit.commanderSlug
      ? `commander (tierless) ${unit.type} · initiative ${unit.initiative}`
      : `${titleCase(unit.grade)} ${unit.type} · initiative ${unit.initiative}`,
    lines: [
      `Attack ${liveAttack}${liveAttack !== unit.attack ? ` (base ${unit.attack})` : ""} · Defense ${liveDefense}${unit.defenseToken ? " (defending: rolls +1 for +1 Defense)" : ""} · HP ${health}/${liveHealth}`,
      flip
        ? `Lethal damage flips this card to its ${flip.cardName} side: Attack ${
            flip.attack + flip.flippedAttackBonus
          }${flip.flippedAttackBonus > 0 ? ` (printed ${flip.attack}, +${flip.flippedAttackBonus} for being flipped)` : ""} · Defense ${flip.defense} · HP ${flip.health} · initiative ${flip.initiative}${
            flip.type !== unit.type ? ` (fights as a ${flip.type} unit)` : ""
          }.`
        : "",
      // Unit Experience / Neutral Rank-Up: the headline line, then the whole
      // four-rung ladder. Emitted for ANY card the reader can open — own,
      // enemy PvP or a neutral guard — because `unitRank` / `unitExperience`
      // are public engine fields (player-view never masks them). Nothing is
      // emitted when neither rule folded a rank (`combatUnitVeterancy` → null).
      veterancy
        ? `Veteran rank ${veterancy.rank} (${veterancy.rankName}) — ${veterancyXpLabel(
            veterancy
          )} on the ${veterancy.trackLabel} path; rank bonuses are folded into the stats above.`
        : "",
      ...(veterancy
        ? veterancy.ladder.map(
            (rung) =>
              `${rung.reached ? "✔" : "·"} ${rung.rankName}${
                rung.threshold !== null ? ` (${rung.threshold} XP)` : ""
              }: ${rung.text}`
          )
        : []),
      ...abilities.map(
        (ability) =>
          `${ability.name}: ${ability.text}${ability.implementationStatus === "implemented" ? "" : " (manual rule)"}`
      )
    ].filter(Boolean)
  };
}

/**
 * The enlarged card itself. Extracted so it can wrap in `CardSetFrame` —
 * with the Polish Set Artifacts rule on, a member card wears its set icon here
 * exactly as it does on the small `CardFrame` faces (same context gate, same
 * 256x256 asset). With the rule off, a non-member, or no provider at all, the
 * wrapper is not emitted and this renders the byte-identical old DOM.
 */
type BattlefieldStatLine = { attack: number; defense: number; health: number; initiative: number };

function gradeBattlefieldBonus(grade: number): BattlefieldStatLine {
  const bounded = Math.max(0, Math.min(3, Math.floor(grade)));
  return {
    attack: bounded >= 3 ? 1 : 0,
    defense: 0,
    health: (bounded >= 1 ? 1 : 0) + (bounded >= 3 ? 1 : 0),
    initiative: bounded >= 2 ? 1 : 0
  };
}

/**
 * The Hero Board button opens progression INFORMATION, not the physical card.
 * Keeping this as a distinct ZoomContent branch prevents future UI work from
 * accidentally changing the battlefield piece or the combat inspector.
 */
export function heroBattlefieldInfoZoomContent(
  unit: CombatUnitState,
  ruleset: GameRuleset = "legacy"
): ZoomContent {
  const content = unitZoomContent(unit, ruleset);
  return {
    ...content,
    image: undefined,
    heroFace: undefined,
    heroInfo: content.heroFace,
    subtitle: `Little Busters battlefield profile · level ${unit.heroLevel ?? 1} · grade ${unit.heroGrade ?? 0}`
  };
}

function statDifference(next: BattlefieldStatLine, previous: BattlefieldStatLine): BattlefieldStatLine {
  return {
    attack: next.attack - previous.attack,
    defense: next.defense - previous.defense,
    health: next.health - previous.health,
    initiative: next.initiative - previous.initiative
  };
}

function formatBattlefieldGain(gain: BattlefieldStatLine): string {
  const labels: Array<[keyof BattlefieldStatLine, string]> = [
    ["attack", "ATK"], ["defense", "DEF"], ["health", "HP"], ["initiative", "INIT"]
  ];
  const parts = labels.flatMap(([key, label]) => gain[key] > 0 ? [`+${gain[key]} ${label}`] : []);
  return parts.length > 0 ? parts.join(" · ") : "No stat increase";
}

export function HeroBattlefieldCard({ face }: { face: NonNullable<ZoomContent["heroFace"]> }) {
  const hero = coreHeroDefinitions[face.heroDefId];
  if (!hero) return null;
  const gradeLabel = HERO_GRADE_REGISTERS[factionGradeRegister(hero.faction)]?.[face.grade]?.en ?? `Grade ${face.grade}`;
  const gradeIcon = heroGradeIconForFaction(hero.faction, face.grade);
  const levelProfile = heroCombatProfile(hero, face.level);
  const passive = unitAbilities[levelProfile.passiveAbilityId];
  const frameStyle = {
    "--hbc-border": `url("${assetUrl("/assets/specialty-card/border-6.webp")}")`,
    "--hbc-leather": `url("${assetUrl("/assets/specialty-card/leather.webp")}")`
  } as CSSProperties;
  return (
    <div
      aria-label={`${hero.name} dynamic battlefield hero card`}
      className="zoomCardImage hbcWrap"
      style={frameStyle}
    >
      <article className="hbc hbcPhysical">
        <header className="hbcHeader">
          <strong>{hero.name}</strong>
          <div className="hbcHeaderMeta">
            {gradeIcon ? <img alt="" src={assetUrl(gradeIcon)} /> : null}
            <span>{hero.class} · LEVEL {face.level} · {gradeLabel}</span>
          </div>
        </header>
        <div className="hbcPhysicalMain">
          <div aria-label="Battlefield hero card stats" className="hbcPhysicalStats">
            {Object.entries(face.statValues).map(([label, value]) => (
              <span key={label}>
                <small>{label === "initiative" ? "INIT" : label.slice(0, 3)}</small><b>{value}</b>
              </span>
            ))}
          </div>
          <div className="hbcArt">
            {hero.portrait ? <img alt={hero.name} src={assetUrl(hero.portrait)} /> : null}
            <span className={`hbcCombatType ${face.combatType}`}>
              {face.combatType === "ranged" ? "RANGED" : face.combatType === "flying" ? "FLYING" : "GROUND"}
            </span>
          </div>
        </div>
        <section className="hbcPhysicalRules">
          <div className="hbcPassive">
            <small>PASSIVE</small>
            <b>{face.passiveName}</b>
            <span>{passive?.text ?? "This passive is active while the hero is on the battlefield."}</span>
          </div>
        </section>
        <footer className="hbcPhysicalFooter">
          LITTLE BUSTERS HERO · Returns at full Health next combat
        </footer>
      </article>
    </div>
  );
}

/** Hero Board information surface: progression belongs here, not on the card. */
export function HeroBattlefieldInfo({ face }: { face: NonNullable<ZoomContent["heroInfo"]> }) {
  const hero = coreHeroDefinitions[face.heroDefId];
  if (!hero) return null;
  const specialtyLevel: 1 | 4 | 6 = face.level >= 6 ? 6 : face.level >= 4 ? 4 : 1;
  const specialtyCardId = hero.specialtyCardIds?.[specialtyLevel];
  const specialty = specialtyCardId ? cardLibrary[specialtyCardId] : undefined;
  const specialtyIcon = specialtyIconSrc(specialtyCardId);
  const gradeRegister = HERO_GRADE_REGISTERS[factionGradeRegister(hero.faction)];
  const gradeLabel = gradeRegister?.[face.grade]?.en ?? `Grade ${face.grade}`;
  const gradeIcon = heroGradeIconForFaction(hero.faction, face.grade);
  const levelProfile = heroCombatProfile(hero, face.level);
  const levelOneProfile = heroCombatProfile(hero, 1);
  const nextLevelProfile = heroCombatProfile(hero, Math.min(7, face.level + 1));
  const levelGain = statDifference(levelProfile, levelOneProfile);
  const nextLevelGain = statDifference(nextLevelProfile, levelProfile);
  const gradeGain = gradeBattlefieldBonus(face.grade);
  const nextGradeGain = statDifference(gradeBattlefieldBonus(face.grade + 1), gradeGain);
  const nextGradeLabel = face.grade < 3 ? gradeRegister?.[face.grade + 1]?.en ?? `Grade ${face.grade + 1}` : null;
  const passive = unitAbilities[levelProfile.passiveAbilityId];

  return (
    <section aria-label={`${hero.name} battlefield progression information`} className="hbiWrap">
      <header className="hbiHeader">
        {hero.portrait ? <img alt="" src={assetUrl(hero.portrait)} /> : null}
        <span><small>LITTLE BUSTERS BATTLEFIELD PROFILE</small><strong>{hero.name}</strong><em>{hero.class}</em></span>
        <div>{gradeIcon ? <img alt="" src={assetUrl(gradeIcon)} /> : null}<b>LEVEL {face.level}</b><small>{gradeLabel}</small></div>
      </header>
      <div className="hbiCurrentStats">
        {Object.entries(face.statValues).map(([label, value]) => (
          <span key={label}><small>{label === "initiative" ? "INIT" : label.toUpperCase()}</small><b>{value}</b></span>
        ))}
      </div>
      <div className="hbiAbilities">
        <article><small>PASSIVE</small><b>{face.passiveName}</b><p>{passive?.text}</p></article>
        <article>
          <small>CURRENT SPECIALTY · LEVEL {specialtyLevel}</small>
          {specialtyIcon ? <img alt="" src={assetUrl(specialtyIcon)} /> : null}
          <b>{specialty?.name ?? "Specialty"}</b>
          <p>{specialtyCardId ? specialtyEffectText(specialtyCardId) : ""}</p>
        </article>
      </div>
      <div className="hbiProgress" aria-label="Battlefield hero level and grade gains">
        <article>
          <header><small>LEVEL {face.level}</small><b>Gained since Level I</b></header>
          <strong>{formatBattlefieldGain(levelGain)}</strong>
          <em>{face.level < 7 ? `Next — Level ${face.level + 1}: ${formatBattlefieldGain(nextLevelGain)}` : "Maximum level reached"}</em>
        </article>
        <article>
          <header><small>{gradeLabel}</small><b>Current grade bonus</b></header>
          <strong>{formatBattlefieldGain(gradeGain)}</strong>
          <em>{nextGradeLabel ? `Next — ${nextGradeLabel}: ${formatBattlefieldGain(nextGradeGain)}` : "Maximum grade reached"}</em>
        </article>
      </div>
      <footer>Defeat is combat-only · this hero returns at full Health in the next combat.</footer>
    </section>
  );
}

function ZoomCardVisual({
  content,
  failedImageSrc,
  onImageError
}: {
  content: ZoomContent;
  failedImageSrc: string | null;
  onImageError: () => void;
}) {
  // Polish Balance Pack: a reprinted card reads its NEW face here too. The hook
  // returns exactly what `cardZoomContent` already computed for every other card
  // (and `undefined` for a unit / hero / hand-built zoom, which has no cardId),
  // so `content.image` stays the value for all of them.
  const image = useCardFaceImage(content.cardId, Boolean(content.empowered)) ?? content.image;
  const visual = content.commanderFace ? (
    <div className="zoomCardImage" style={{ background: "transparent", boxShadow: "none" }}>
      <CommanderCardFace
        slug={content.commanderFace.slug}
        grades={content.commanderFace.grades}
        statValues={content.commanderFace.statValues}
        dead={content.commanderFace.dead}
      />
    </div>
  ) : content.heroInfo ? (
    <HeroBattlefieldInfo face={content.heroInfo} />
  ) : content.heroFace ? (
    <HeroBattlefieldCard face={content.heroFace} />
  ) : content.specialtyCardId ? (
    <div className="zoomNativeCard">
      <SpecialtyCard cardId={content.specialtyCardId} />
    </div>
  ) : image && failedImageSrc !== image ? (
    <img
      alt={content.empowered ? `${content.title} (empowered)` : content.title}
      className={`zoomCardImage${content.empowered ? " empoweredCard" : ""}`}
      decoding="async"
      loading="eager"
      onError={onImageError}
      referrerPolicy="no-referrer"
      src={assetUrl(image)}
    />
  ) : (
    <div className={`zoomCardImage cardFaceFallback${content.empowered ? " empoweredCard" : ""}`}>{content.title}</div>
  );

  return (
    <CardSetFrame cardId={content.cardId} className="zoomSetFrame">
      {visual}
    </CardSetFrame>
  );
}

/**
 * Table-wide card magnifier: any component can call useCardZoom() to open a
 * readable, full-size view of a card or unit. Click anywhere (or Escape) to
 * put the card back down.
 */
export function CardZoomProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ZoomContent | null>(null);
  const balanceFlags = useBalanceArtFlags();
  // Fall back to the text frame if a card's scan is missing (e.g. Moandor's
  // specialties); keyed by src so each newly zoomed card tries its own art.
  const [failedImageSrc, setFailedImageSrc] = useState<string | null>(null);

  const value = useMemo<CardZoomContextValue>(
    () => ({
      zoomCard: (cardId, empowered) =>
        setContent(cardZoomContent(cardId, empowered, balanceFlags.polish, balanceFlags.community)),
      zoomUnit: (unit, ruleset, liveStats) => setContent(unitZoomContent(unit, ruleset, liveStats)),
      zoomContent: (next) => setContent(next)
    }),
    [balanceFlags.polish, balanceFlags.community]
  );

  const close = useCallback(() => setContent(null), []);

  useEffect(() => {
    if (!content) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [content, close]);

  return (
    <CardZoomContext.Provider value={value}>
      {children}
      {content ? (
        <div aria-label={`${content.title} enlarged`} className="zoomBackdrop" onClick={close} role="dialog">
          <div className="zoomCardStage">
            <ZoomCardVisual
              content={content}
              failedImageSrc={failedImageSrc}
              onImageError={() => setFailedImageSrc(content.image ?? null)}
            />
            {!content.heroFace && !content.heroInfo ? <div className="zoomCardBody">
              <strong>{content.title}</strong>
              {content.empowered ? (
                <span className="empoweredBadge zoomEmpoweredBadge">
                  <Sparkles aria-hidden="true" size={11} /> Empowered
                </span>
              ) : null}
              {content.subtitle ? <span className="zoomMeta">{content.subtitle}</span> : null}
              {content.commanderFace ? (
                // WOG commander: the pro stats view (authentic comm3 symbols,
                // grade bonuses, Damage dice, the Power ladder, and every
                // combination skill explained) instead of the plain stat lines.
                <CommanderStatsPanel
                  slug={content.commanderFace.slug}
                  grades={content.commanderFace.grades}
                  statValues={content.commanderFace.statValues}
                  style={{ maxWidth: "100%", marginTop: 4 }}
                />
              ) : (
                content.lines.map((line) => <p key={line}>{line}</p>)
              )}
              <button onClick={close} type="button">
                <X aria-hidden="true" size={14} />
                <span>Close</span>
              </button>
            </div> : null}
          </div>
        </div>
      ) : null}
    </CardZoomContext.Provider>
  );
}

/** Small magnifier affordance for card tiles and lists. */
export function ZoomButton({ onZoom, label }: { onZoom: () => void; label?: string }) {
  return (
    <button
      aria-label={label ?? "Read card"}
      className="zoomButton"
      onClick={(event) => {
        event.stopPropagation();
        onZoom();
      }}
      title={label ?? "Read card"}
      type="button"
    >
      <ZoomIn aria-hidden="true" size={13} />
    </button>
  );
}
