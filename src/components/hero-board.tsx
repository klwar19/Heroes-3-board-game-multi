"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, GripVertical, Lock, Medal, PackageOpen, Sparkles, X } from "lucide-react";

import { HERO_INFO_STAT_ICONS } from "@/data/assets/homm-assets";
import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { HERO_GRADE_NODES } from "@/data/anime/hero-grades";
import {
  ANIME_EQUIPMENT_DEFINITIONS,
  EQUIPMENT_PACKAGE_LABEL,
  type EquipmentDefinition,
  type EquipmentGrade
} from "@/data/anime/equipment";
import { factionUiLexicon } from "@/data/faction-theme";
import { EquipGradeChip } from "@/components/equip-grade-chip";
import { UnitExperienceWindow } from "@/components/adventure/unit-experience-window";
import {
  ABILITY_SEARCH_LEVELS,
  ANIME_EQUIPMENT_SLOTS,
  CULTIVATION_REALMS,
  EQUIPMENT_SLOT_GLYPH,
  EXPERT_USES_BY_LEVEL,
  HAND_LIMIT_BY_LEVEL,
  HERO_GRADE_MAX,
  HERO_GRADE_MERIT_THRESHOLDS,
  MAX_EXPERIENCE,
  SPECIALTY_LEVELS,
  armyUnitRankInfo,
  cultivationEnabled,
  cultivationRealmOf,
  effectiveHandLimit,
  equipmentEnabled,
  equipmentImage,
  getEquipmentDefinition,
  getMainHero,
  heroEquipmentInventoryOf,
  heroEquipmentOf,
  heroGradeLabel,
  heroGradeOf,
  heroGradePickableNodes,
  heroGradePointsOf,
  heroGradeProgressOf,
  heroGradeNodesOf,
  heroGradesEnabled,
  unitExperienceActive,
  type AnimeEquipmentSlot,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { useCardZoom } from "@/components/table/zoom";
import { specialtyIconSrc } from "@/components/specialty-card-data";

const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];
/** Specialty cards sit at Ⅰ (starting deck), Ⅳ and Ⅵ — the laurelled numerals. */
const SPECIALTY_TRACK_LEVELS = [1, ...SPECIALTY_LEVELS] as number[];

/** Equipment grade order (I < II < III) for the "upgrade waiting in bag" hint. */
const EQUIPMENT_GRADE_RANK: Record<EquipmentGrade, number> = { I: 1, II: 2, III: 3 };

/** Faction palettes sampled from the printed hero board scans. */
const BOARD_THEMES: Record<string, { banner: string; edge: string }> = {
  castle: { banner: "linear-gradient(180deg, #3a74c4 0%, #1d4a8a 100%)", edge: "#3f6fb5" },
  rampart: { banner: "linear-gradient(180deg, #379a46 0%, #1c6228 100%)", edge: "#3f9e4d" },
  inferno: { banner: "linear-gradient(180deg, #ab2a1c 0%, #6e150b 100%)", edge: "#b03a26" },
  necropolis: { banner: "linear-gradient(180deg, #27796b 0%, #154c44 100%)", edge: "#2e7a6e" },
  dungeon: { banner: "linear-gradient(180deg, #6b48b8 0%, #3d2769 100%)", edge: "#7a55c0" },
  stronghold: { banner: "linear-gradient(180deg, #a9642a 0%, #5e3219 100%)", edge: "#b97835" },
  fuyuki: { banner: "linear-gradient(180deg, #164e8c 0%, #631f42 52%, #1a1838 100%)", edge: "#e15b7d" },
  azure_breeze: { banner: "linear-gradient(180deg, #4a9a8d 0%, #176477 50%, #173c54 100%)", edge: "#74d2b6" },
  hidden_leaf: { banner: "linear-gradient(180deg, #4f9d45 0%, #2f6b34 52%, #17361f 100%)", edge: "#79c76a" },
  azur_lane: { banner: "linear-gradient(180deg, #1d5db4 0%, #123a6b 52%, #0a1c33 100%)", edge: "#6fb3e8" }
};

// ---------------------------------------------------------------------------
// Printed-board iconography (statistics, crowns, hand-limit cards, laurels…)
// ---------------------------------------------------------------------------

/** The statistic icons are cropped from the printed board scans themselves. */
function StatIcon({ stat }: { stat: keyof typeof HERO_INFO_STAT_ICONS }) {
  // Use the clean TRANSPARENT board-game glyphs (Heegu-sama/Homm3BG) — the same
  // set the hero-selection info board uses — not the opaque scan crops.
  return <img alt="" aria-hidden="true" className="hbStatIcon" src={assetUrl(HERO_INFO_STAT_ICONS[stat])} />;
}

function CrownIcon() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <path d="M3.4 16.6 L4.6 7.8 L8.8 11.6 L12 5.4 L15.2 11.6 L19.4 7.8 L20.6 16.6 Z" fill="currentColor" />
      <rect fill="currentColor" height="2" rx="0.6" width="17.2" x="3.4" y="17.6" />
    </svg>
  );
}

function HandCardsIcon() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <rect fill="currentColor" height="14.5" rx="1.6" transform="rotate(-10 9.5 11.5)" width="9.6" x="4.7" y="4.2" />
      <rect
        fill="currentColor"
        height="14.5"
        rx="1.6"
        stroke="var(--hb-slate)"
        strokeWidth="1"
        transform="rotate(9 14.5 12.5)"
        width="9.6"
        x="9.7"
        y="5.2"
      />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <circle cx="10.4" cy="10.4" fill="none" r="5.6" stroke="currentColor" strokeWidth="2.1" />
      <path d="M14.6 14.6 L19.6 19.6" stroke="currentColor" strokeLinecap="round" strokeWidth="2.6" />
    </svg>
  );
}

/** One laurel sprig; mirrored with CSS for the right-hand side. */
function LaurelIcon() {
  return (
    <svg aria-hidden="true" className="hbLaurel" viewBox="0 0 10 18">
      <path d="M8.6 1.6 C5 5 3.4 9.4 4.8 16.2" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M7.9 3.4 C6.3 2.7 4.9 3 3.8 4.2 C5.4 5 6.9 4.8 7.9 3.4 Z" fill="currentColor" />
      <path d="M6 7.2 C4.5 6.7 3.1 7.2 2.2 8.5 C3.9 9.1 5.3 8.7 6 7.2 Z" fill="currentColor" />
      <path d="M5 11.4 C3.6 11.1 2.3 11.7 1.6 13.1 C3.3 13.5 4.6 12.9 5 11.4 Z" fill="currentColor" />
    </svg>
  );
}

/** Spear divider between the level-track columns, as printed. */
function SpearIcon({ flip }: { flip: boolean }) {
  return (
    <svg aria-hidden="true" className="hbSpear" style={flip ? { transform: "scaleX(-1)" } : undefined} viewBox="0 0 16 16">
      <path d="M3 13 L11.4 4.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <path d="M10 2 C12 2.4 13.6 4 14 6 C12 5.6 10.4 4 10 2 Z" fill="currentColor" />
    </svg>
  );
}

/** Might heroes wear the horned helmet, magic heroes the wizard hat. */
function TypeEmblem({ type }: { type: "might" | "magic" }) {
  if (type === "might") {
    return (
      <svg aria-hidden="true" className="hbEmblem" viewBox="0 0 24 24">
        <path d="M7.4 14.6 C7.4 9.4 9.2 6.6 12 6.6 C14.8 6.6 16.6 9.4 16.6 14.6 L16.6 17 L7.4 17 Z" fill="currentColor" />
        <path d="M7.6 13.4 C4.6 12.6 2.9 10.2 2.7 6.6 C5.8 7.4 7.6 9.6 8.2 12.6 Z" fill="currentColor" />
        <path d="M16.4 13.4 C19.4 12.6 21.1 10.2 21.3 6.6 C18.2 7.4 16.4 9.6 15.8 12.6 Z" fill="currentColor" />
        <rect fill="currentColor" height="1.6" rx="0.8" width="11.6" x="6.2" y="17.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="hbEmblem" viewBox="0 0 24 24">
      <path d="M3.4 17.2 C8 16 16 16 20.6 17.2 C16.4 19.2 7.6 19.2 3.4 17.2 Z" fill="currentColor" />
      <path d="M9 16.6 C9.6 11.6 11.2 7.4 15.4 3.6 C14.2 8.6 14 12.9 15.2 16.8 Z" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card-art crops: every ability/specialty card prints its art top-center, so
// a fixed window over the scan recovers the same art the board shows.
// ---------------------------------------------------------------------------

function CardArt({ cardId, kind }: { cardId?: string; kind: "ability" | "specialty" }) {
  const card = cardId ? cardLibrary[cardId] : undefined;
  const image = card?.assets?.cardImage;
  // Some cards have no scan yet (e.g. Moandor's specialties are not on the fan
  // wiki); fall back to the empty-art slot rather than a broken image. Keyed by
  // src so a different card in the same slot still renders.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!image || failedSrc === image) {
    // Art-less specialties (Bulwark/Conflux) have no scanned card; show the
    // specialty symbol so the slot isn't blank — the full native card opens on
    // zoom (see CardZoomProvider).
    const nativeIcon = kind === "specialty" ? specialtyIconSrc(cardId) : undefined;
    if (nativeIcon) {
      return (
        <div className={`hbArt hbArt-${kind}`}>
          <img alt="" className="hbSpecIcon" src={assetUrl(nativeIcon)} />
        </div>
      );
    }
    return <div className={`hbArt hbArt-${kind} hbArtEmpty`} />;
  }

  return (
    <div className={`hbArt hbArt-${kind}`}>
      <img alt="" onError={() => setFailedSrc(image)} src={assetUrl(image)} />
    </div>
  );
}

function specialtyDisplayName(cardId: string): string {
  const name = cardLibrary[cardId]?.name ?? cardId;
  return name.replace(/\s+(Ⅰ|Ⅳ|Ⅵ|I|IV|VI)$/u, "");
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * The printed hero board: portrait and name banner, the four starting
 * statistics, starting ability and specialty, and the Ⅰ–Ⅶ level track with
 * hand-limit cards, expert crowns and ability searches. Live state on top:
 * the XP cube sits on the current level and gained specialties fill their
 * laurelled slots. Click the banner for the printed scan, the ability or any
 * specialty for the full card.
 */
export function HeroBoard({
  state,
  playerId,
  onAction,
  legalActions = []
}: {
  state: GameState;
  playerId: PlayerId;
  /** When provided, the Hero-Grade node picker dispatches HERO_GRADE_PICK. */
  onAction?: (action: GameAction) => void;
  /** Engine-validated offers for the Unit Experience Board (Drill etc.). */
  legalActions?: LegalAction[];
}) {
  const { zoomCard, zoomContent } = useCardZoom();
  const [systemsOpen, setSystemsOpen] = useState<"grade" | "equipment" | "unitxp" | null>(null);
  const [draggedEquipmentId, setDraggedEquipmentId] = useState<string | null>(null);
  const player = state.players[playerId];
  const hero = getMainHero(state, playerId);
  const heroDef = player?.heroDefId ? coreHeroDefinitions[player.heroDefId] : undefined;
  if (!player || !hero || !heroDef) {
    return null;
  }

  const faction = coreFactionDefinitions[heroDef.faction];
  const theme = BOARD_THEMES[heroDef.faction] ?? BOARD_THEMES.castle;
  const lexicon = factionUiLexicon(heroDef.faction);
  const ability = cardLibrary[heroDef.startingAbilityCardId];
  const gainedSpecialtyLevels = SPECIALTY_TRACK_LEVELS.filter((level) => hero.level >= level);
  const currentSpecialtyLevel = gainedSpecialtyLevels.at(-1) ?? 1;
  const currentSpecialtyId = heroDef.specialtyCardIds?.[currentSpecialtyLevel as 1 | 4 | 6];
  const handLimit = effectiveHandLimit(state, playerId);
  // Anime Cultivation (§5.6): a public realm chip (EN + VI). Renders only with
  // the module on — a module-off / non-anime table shows nothing (CONTROL).
  const showRealm = cultivationEnabled(state);
  const realm = CULTIVATION_REALMS[cultivationRealmOf(state, playerId)];
  // Anime Hero Grades (§3.11): a public grade chip + Merit progress + unspent-
  // point indicator, and a pick-a-node picker. Renders only with the module on.
  const showGrade = heroGradesEnabled(state);
  const gradeValue = heroGradeOf(state, playerId);
  const grade = heroGradeLabel(state, playerId, gradeValue);
  const merit = heroGradeProgressOf(state, playerId);
  const nextThreshold = gradeValue < HERO_GRADE_MAX ? HERO_GRADE_MERIT_THRESHOLDS[gradeValue] : null;
  const gradePoints = heroGradePointsOf(state, playerId);
  const pickableGradeNodes = heroGradePickableNodes(state, playerId);
  const ownedGradeNodes = new Set(heroGradeNodesOf(state, playerId));
  const pickableNodeIds = new Set(pickableGradeNodes.map((node) => node.id));
  // Anime Equipment (§3.13): always-on item chips (slot glyph + EN/VI name).
  // Renders only with the module on AND something equipped (CONTROL: off = null).
  const showEquip = equipmentEnabled(state);
  const equipmentInventory = heroEquipmentInventoryOf(state, playerId);
  const inventoryEquipmentIds = new Set(equipmentInventory);
  const equippedEquipmentIds = new Set(Object.values(heroEquipmentOf(state, playerId)));
  // Unit Experience (optional rule): the veterancy board pop-up, opened from
  // the same hero-systems row as Grade / Equipment ("all systems are windows").
  const showUnitXp = unitExperienceActive(state);
  const rankedUnitCount = showUnitXp
    ? player.army.filter((unit) => (armyUnitRankInfo(unit)?.rank ?? 0) > 0).length
    : 0;
  const equippedItems = showEquip
    ? ANIME_EQUIPMENT_SLOTS
        .map((slot) => {
          const id = heroEquipmentOf(state, playerId)[slot];
          const def = id ? getEquipmentDefinition(id) : undefined;
          return def ? { slot, def } : null;
        })
        .filter((entry): entry is { slot: AnimeEquipmentSlot; def: NonNullable<typeof entry>["def"] } => entry !== null)
    : [];

  const stats = [
    { label: "Attack", value: heroDef.startingStats.attack, icon: <StatIcon stat="attack" /> },
    { label: "Defense", value: heroDef.startingStats.defense, icon: <StatIcon stat="defense" /> },
    { label: "Power", value: heroDef.startingStats.power, icon: <StatIcon stat="power" /> },
    { label: "Knowledge", value: heroDef.startingStats.knowledge, icon: <StatIcon stat="knowledge" /> }
  ];

  // Grail marker: public when this hero is carrying the dug Grail token.
  const carriesGrail =
    state.adventure?.grail?.status === "carried" &&
    state.adventure.grail.carrierHeroId === hero.id;

  return (
    <div className={`hbWrap theme-${lexicon.register}`}>
      <section
        aria-label={`${heroDef.name} hero board`}
        className="hb"
        style={{ "--hb-banner": theme.banner, "--hb-edge": theme.edge, "--hb-cube": faction?.color } as React.CSSProperties}
      >
        <div className="hbTop">
          <div className="hbPortrait">
            {heroDef.portrait ? <img alt={`${heroDef.name} portrait`} src={assetUrl(heroDef.portrait)} /> : null}
            {carriesGrail ? (
              <span
                aria-label="Carrying the Grail"
                className="hbGrailMarker"
                title="Carrying the Grail"
              >
                🏆
              </span>
            ) : null}
          </div>
          <div className="hbRight">
            <button
              className="hbBanner"
              onClick={() =>
                heroDef.boardScan
                  ? zoomContent({
                      title: `${heroDef.name} — printed hero board`,
                      image: heroDef.boardScan,
                      subtitle: `${heroDef.class} · ${faction?.name ?? heroDef.faction}`,
                      lines: ["Fan wiki scan of the physical board."]
                    })
                  : undefined
              }
              title={heroDef.boardScan ? "View the printed board scan" : undefined}
              type="button"
            >
              <span className="hbName">{heroDef.name}</span>
              <span className="hbClass">{heroDef.class}</span>
              <TypeEmblem type={heroDef.type} />
            </button>
            <div className="hbStats" title="Statistic cards in the starting deck">
              {stats.map((stat) => (
                <div className="hbStat" key={stat.label} title={`${stat.label} ${stat.value}`}>
                  {stat.icon}
                  <b>{stat.value}</b>
                </div>
              ))}
            </div>
            <div className="hbLoadout">
              <button
                className="hbAbility"
                onClick={() => zoomCard(heroDef.startingAbilityCardId)}
                title={`Starting ability: ${ability?.name ?? heroDef.startingAbilityCardId}`}
                type="button"
              >
                <span className="hbPanelLabel">{ability?.name ?? "Ability"}</span>
                <CardArt cardId={heroDef.startingAbilityCardId} kind="ability" />
              </button>
              <button
                className="hbSpecialty"
                onClick={() => (currentSpecialtyId ? zoomCard(currentSpecialtyId) : undefined)}
                title="Current specialty card"
                type="button"
              >
                <span className="hbPanelLabel">Specialty</span>
                <CardArt cardId={currentSpecialtyId} kind="specialty" />
                <span className="hbSpecName">{currentSpecialtyId ? specialtyDisplayName(currentSpecialtyId) : "—"}</span>
              </button>
            </div>
            {player.scrolls && player.scrolls.length > 0 ? (
              <div
                className="hbScrolls"
                title="Spell Scrolls (cast in combat at power 0; not in hand)"
                aria-label={`${player.scrolls.length} Spell Scroll${player.scrolls.length === 1 ? "" : "s"}`}
              >
                {player.scrolls.map((scroll) => {
                  const known = scroll.spellCardIds.filter((cardId) => cardId !== "hidden");
                  const label =
                    known.length === scroll.spellCardIds.length
                      ? known.map((cardId) => cardLibrary[cardId]?.name ?? cardId).join(" · ")
                      : `${scroll.spellCardIds.length} spell${scroll.spellCardIds.length === 1 ? "" : "s"}`;
                  return (
                    <span className="hbScrollChip" key={scroll.id} title={label}>
                      📜 {label}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div aria-label={`Level track: level ${hero.level}, ${hero.experience}/${MAX_EXPERIENCE} experience`} className="hbTrack">
          {[1, 2, 3, 4, 5, 6, 7].map((level) => {
            const reached = hero.level >= level;
            const specialty = SPECIALTY_TRACK_LEVELS.includes(level);
            const specialtyCardId = specialty ? heroDef.specialtyCardIds?.[level as 1 | 4 | 6] : undefined;
            // Ability-search levels (2/3/5/7): the card the player KEPT from that
            // level-up Search, if any is recorded (public info, opponents too).
            const keptAbilityId = ABILITY_SEARCH_LEVELS.includes(level) ? player.levelUpAbilityPicks?.[level] : undefined;
            const handGain = HAND_LIMIT_BY_LEVEL[level] !== HAND_LIMIT_BY_LEVEL[level - 1] || level === 1;
            const crowns = EXPERT_USES_BY_LEVEL[level] - (EXPERT_USES_BY_LEVEL[level - 1] ?? 0) > 0 ? EXPERT_USES_BY_LEVEL[level] : 0;

            return (
              <div className={`hbLevel ${reached ? "reached" : ""} ${hero.level === level ? "current" : ""}`} key={level}>
                {level > 1 ? <SpearIcon flip={level % 2 === 0} /> : null}
                <span className={`hbNumeral ${specialty ? "gold" : "silver"}`}>
                  {specialty ? <LaurelIcon /> : null}
                  {ROMAN[level]}
                  {specialty ? <LaurelIcon /> : null}
                </span>
                <div className="hbSlotCell">
                  {specialty && specialtyCardId ? (
                    // The specialty card is visible from the very beginning:
                    // EARNED (hero level ≥ Ⅰ/Ⅳ/Ⅵ) wears the golden frame,
                    // unearned stays a dimmed preview — click zooms either way.
                    <button
                      className={`hbSlot hbSlotSpecialty ${reached ? "gained" : "preview"}`}
                      onClick={() => zoomCard(specialtyCardId)}
                      title={
                        reached
                          ? `${specialtyDisplayName(specialtyCardId)} (level ${ROMAN[level]} specialty)`
                          : `${specialtyDisplayName(specialtyCardId)} — specialty card gained at level ${ROMAN[level]}`
                      }
                      type="button"
                    >
                      <CardArt cardId={specialtyCardId} kind="specialty" />
                    </button>
                  ) : keptAbilityId ? (
                    <button
                      className="hbSlot hbSlotSearch hbSlotAbilityPick"
                      onClick={() => zoomCard(keptAbilityId)}
                      title={`Level ${ROMAN[level]}: kept ${cardLibrary[keptAbilityId]?.name ?? keptAbilityId} from the Ability Search`}
                      type="button"
                    >
                      <CardArt cardId={keptAbilityId} kind="ability" />
                    </button>
                  ) : (
                    <div className="hbSlot hbSlotSearch" title={`Level ${ROMAN[level]}: Search (2) the Ability deck`}>
                      <SearchGlyph />
                    </div>
                  )}
                  {hero.level === level ? (
                    <span className="hbCube" title={`Experience ${hero.experience}/${MAX_EXPERIENCE}`} />
                  ) : null}
                </div>
                <div className="hbGain">
                  {handGain ? (
                    <span className="hbHandGain">
                      <HandCardsIcon />
                      <b>{HAND_LIMIT_BY_LEVEL[level]}</b>
                    </span>
                  ) : null}
                  {crowns > 0 ? (
                    <span className={`hbCrowns hbCrowns${crowns}`}>
                      {Array.from({ length: crowns }, (_, i) => (
                        <CrownIcon key={i} />
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="hbFooter">
          <span>
            Level {ROMAN[hero.level]} · XP {hero.experience}/{MAX_EXPERIENCE}
          </span>
          {showRealm ? (
            <span className="hbRealm" title={`Cultivation Realm: ${realm.en} (${realm.vi})`}>
              ☯ {realm.en} · {realm.vi}
            </span>
          ) : null}
          {showGrade ? (
            <span
              className="hbGrade"
              title={`Hero Grade: ${grade.en} (${grade.vi}) · Merit ${merit}${nextThreshold ? `/${nextThreshold}` : " (max)"}`}
            >
              ⚔ {grade.en} · {grade.vi} · Merit {merit}
              {nextThreshold ? `/${nextThreshold}` : ""}
              {gradePoints > 0 ? ` · ${gradePoints} pt` : ""}
            </span>
          ) : null}
          {showEquip && equippedItems.length > 0
            ? equippedItems.map(({ slot, def }) => {
                // Real item icon when art shipped; slot glyph fallback otherwise.
                const icon = equipmentImage(def.id);
                return (
                  <span
                    className="hbEquip"
                    key={slot}
                    title={`Equipment (${slot}, always on): ${def.summary}`}
                  >
                    {icon ? (
                      <img alt="" className="hbEquipIcon" src={assetUrl(icon)} />
                    ) : (
                      EQUIPMENT_SLOT_GLYPH[slot]
                    )}{" "}
                    {def.name.en} · {def.name.vi}
                  </span>
                );
              })
            : null}
          <span>
            Hand {handLimit} · Crowns {player.limits.expertUses}
          </span>
        </footer>

        {showGrade || showEquip || showUnitXp ? (
          <div className="heroSystemButtons" aria-label="Hero systems">
            {showGrade ? (
              <button
                className={`heroSystemButton grade${gradePoints > 0 ? " attention" : ""}`}
                onClick={() => setSystemsOpen("grade")}
                type="button"
              >
                <Sparkles aria-hidden="true" size={18} />
                <span><strong>{lexicon.grade}</strong><small>{grade.en} · {gradePoints} point{gradePoints === 1 ? "" : "s"}</small></span>
              </button>
            ) : null}
            {showEquip ? (
              <button className="heroSystemButton equipment" onClick={() => setSystemsOpen("equipment")} type="button">
                <PackageOpen aria-hidden="true" size={18} />
                <span><strong>{lexicon.equipment}</strong><small>{equippedItems.length}/{ANIME_EQUIPMENT_SLOTS.length} slots filled</small></span>
              </button>
            ) : null}
            {showUnitXp ? (
              <button className="heroSystemButton unitxp" onClick={() => setSystemsOpen("unitxp")} type="button">
                <Medal aria-hidden="true" size={18} />
                <span>
                  <strong>{lexicon.experienceBoard}</strong>
                  <small>{rankedUnitCount}/{player.army.length} card{player.army.length === 1 ? "" : "s"} ranked</small>
                </span>
              </button>
            ) : null}
          </div>
        ) : null}

        {showGrade && gradePoints > 0 ? (
          <div className="hbGradePicker hbGradePickerLegacy" aria-hidden="true">
            <strong>Spend a grade point ({gradePoints}):</strong>
            <ul>
              {pickableGradeNodes.map((node) => (
                <li key={node.id}>
                  {onAction ? (
                    <button
                      type="button"
                      className="hbGradePick"
                      onClick={() => onAction({ type: "HERO_GRADE_PICK", playerId, nodeId: node.id })}
                    >
                      <span className="hbGradePickName">
                        {node.kind === "passive" ? "◆" : "✦"} {node.name.en} · {node.name.vi} (Tier {node.tier})
                      </span>
                      <span className="hbGradePickText">{node.summary}</span>
                    </button>
                  ) : (
                    <span className="hbGradePickName">
                      {node.kind === "passive" ? "◆" : "✦"} {node.name.en} — {node.summary}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
      {systemsOpen === "unitxp" && typeof document !== "undefined"
        ? createPortal(
            <UnitExperienceWindow
              legalActions={legalActions}
              onAction={onAction}
              onClose={() => setSystemsOpen(null)}
              playerId={playerId}
              state={state}
            />,
            document.body
          )
        : null}
      {systemsOpen && systemsOpen !== "unitxp" && typeof document !== "undefined"
        ? createPortal(
            <div className={`heroSystemBackdrop theme-${lexicon.register}`} onMouseDown={() => setSystemsOpen(null)}>
              <section
                aria-label={systemsOpen === "grade" ? lexicon.grade : lexicon.equipment}
                aria-modal="true"
                className={`heroSystemModal ${systemsOpen}`}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
              >
                <header>
                  <div>
                    <small>{faction?.name} · {heroDef.name}</small>
                    <h2>{systemsOpen === "grade" ? lexicon.grade : lexicon.equipment}</h2>
                  </div>
                  <button aria-label="Close" className="heroSystemClose" onClick={() => setSystemsOpen(null)} type="button">
                    <X size={20} />
                  </button>
                </header>
                {systemsOpen === "grade" ? (
                  <>
                    <div className="gradeWindowSummary">
                      <span><b>{grade.en}</b><small>{grade.vi}</small></span>
                      <span><b>{merit}{nextThreshold ? ` / ${nextThreshold}` : ""}</b><small>Merit</small></span>
                      <span className={gradePoints > 0 ? "ready" : ""}><b>{gradePoints}</b><small>Points available</small></span>
                    </div>
                    <div className="heroGradeTree" aria-label="Skill and passive tree">
                      {[1, 2, 3].map((tier) => (
                        <div className="heroGradeTier" key={tier}>
                          <h3>Tier {tier}</h3>
                          {Object.values(HERO_GRADE_NODES).filter((node) => node.tier === tier).map((node) => {
                            const owned = ownedGradeNodes.has(node.id);
                            const available = pickableNodeIds.has(node.id) && Boolean(onAction);
                            return (
                              <button
                                className={`heroGradeNode ${owned ? "owned" : available ? "available" : "locked"}`}
                                disabled={!available}
                                key={node.id}
                                onClick={() => onAction?.({ type: "HERO_GRADE_PICK", playerId, nodeId: node.id })}
                                type="button"
                              >
                                <span className="heroGradeNodeIcon">
                                  {owned ? <Check size={18} /> : available ? <Sparkles size={18} /> : <Lock size={16} />}
                                </span>
                                <span><strong>{node.name.en}</strong><small>{node.kind === "passive" ? "Passive" : "Skill"} · {node.name.vi}</small></span>
                                <p>{node.summary}</p>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="equipmentWindowBody">
                    <div className="equipmentPaperdoll" aria-label="Equipped items">
                      <div className="equipmentSilhouette" aria-hidden="true">
                        <img alt="" src={assetUrl(heroDef.portrait)} />
                      </div>
                      {ANIME_EQUIPMENT_SLOTS.map((slot) => {
                        const itemId = heroEquipmentOf(state, playerId)[slot];
                        const def = itemId ? getEquipmentDefinition(itemId) : undefined;
                        const icon = def ? equipmentImage(def.id) : undefined;
                        const draggedDef = draggedEquipmentId ? getEquipmentDefinition(draggedEquipmentId) : undefined;
                        const acceptsDrop = Boolean(onAction && draggedDef?.slot === slot && !state.combat);
                        // Upgrade hint: an owned BAG item of the same slot at a
                        // higher grade than what is worn (pure presentation).
                        const upgrade = def
                          ? equipmentInventory
                              .map((id) => getEquipmentDefinition(id))
                              .filter(
                                (candidate): candidate is EquipmentDefinition =>
                                  Boolean(candidate) &&
                                  candidate!.slot === slot &&
                                  EQUIPMENT_GRADE_RANK[candidate!.grade] > EQUIPMENT_GRADE_RANK[def.grade]
                              )
                              .sort((a, b) => EQUIPMENT_GRADE_RANK[b.grade] - EQUIPMENT_GRADE_RANK[a.grade])[0]
                          : undefined;
                        return (
                          <div
                            aria-label={`${slot} slot${def ? `: ${def.name.en}` : ": empty"}`}
                            className={`equipmentSlot slot-${slot} ${def ? "filled" : "empty"}${acceptsDrop ? " dropReady" : ""}`}
                            key={slot}
                            onDragOver={(event) => {
                              if (acceptsDrop) event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (!acceptsDrop || !draggedDef || !onAction) return;
                              onAction({ type: "EQUIP_HERO_ITEM", playerId, equipmentId: draggedDef.id, slot });
                              setDraggedEquipmentId(null);
                            }}
                          >
                            <div className="equipmentSlotHead">
                              <small>{slot}</small>
                              {def ? <EquipGradeChip grade={def.grade} /> : null}
                            </div>
                            {icon ? <img alt="" src={assetUrl(icon)} /> : <span>{EQUIPMENT_SLOT_GLYPH[slot]}</span>}
                            <strong>{def?.name.en ?? "Empty"}</strong>
                            {def ? <p>{def.summary}</p> : null}
                            {def && onAction && !state.combat ? (
                              <button
                                className="equipmentUnequipButton"
                                onClick={() => onAction({ type: "UNEQUIP_HERO_ITEM", playerId, slot })}
                                type="button"
                              >
                                Unequip
                              </button>
                            ) : null}
                            {upgrade ? (
                              <div
                                className="equipmentUpgradeHint"
                                title={`${upgrade.name.en} (Grade ${upgrade.grade}) sits in your bag`}
                              >
                                <EquipGradeChip grade={upgrade.grade} />
                                <span>
                                  Upgrade waiting: <strong>{upgrade.name.en}</strong> in your bag
                                </span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <aside className="equipmentCatalog">
                      <h3>Equipment bag &amp; catalog</h3>
                      <p>Grouped by slot. Drag an owned item onto its matching body slot, or use Equip. Replaced gear returns here; every listed effect is live.</p>
                      {ANIME_EQUIPMENT_SLOTS.map((slot) => {
                        const slotItems = Object.values(ANIME_EQUIPMENT_DEFINITIONS)
                          .filter((def) => def.slot === slot)
                          .sort((a, b) => EQUIPMENT_GRADE_RANK[a.grade] - EQUIPMENT_GRADE_RANK[b.grade] || a.cost - b.cost);
                        const ownedInSlot = slotItems.filter(
                          (def) => equippedEquipmentIds.has(def.id) || inventoryEquipmentIds.has(def.id)
                        ).length;
                        return (
                          <div className="equipmentCatalogGroup" key={slot}>
                            <div className="equipmentCatalogGroupHead">
                              <span className="slotGlyph" aria-hidden="true">{EQUIPMENT_SLOT_GLYPH[slot]}</span>
                              <span>{slot}</span>
                              <span className="slotCount">{ownedInSlot} owned</span>
                            </div>
                            {slotItems.map((def) => {
                              const equipped = equippedEquipmentIds.has(def.id);
                              const inBag = inventoryEquipmentIds.has(def.id);
                              const canEquip = Boolean(inBag && onAction && !state.combat);
                              const icon = equipmentImage(def.id);
                              const pkg = EQUIPMENT_PACKAGE_LABEL[def.package];
                              return (
                                <article
                                  aria-label={`${def.name.en}: ${equipped ? "equipped" : inBag ? "in equipment bag" : "not owned"}`}
                                  className={`equipmentCatalogItem ${equipped ? "equipped" : inBag ? "owned" : "unowned"}`}
                                  draggable={canEquip}
                                  key={def.id}
                                  onDragEnd={() => setDraggedEquipmentId(null)}
                                  onDragStart={(event) => {
                                    if (!canEquip) return;
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", def.id);
                                    setDraggedEquipmentId(def.id);
                                  }}
                                >
                                  {icon ? <img alt="" src={assetUrl(icon)} /> : <span>{EQUIPMENT_SLOT_GLYPH[def.slot]}</span>}
                                  <span className="equipmentCatalogItemBody">
                                    <strong>{def.name.en}</strong>
                                    <span className="equipmentItemMeta">
                                      <EquipGradeChip grade={def.grade} />
                                      <span className={`equipmentPkgTag pkg-${pkg}`}>{pkg}</span>
                                      <small>{def.cost} gold{equipped ? " · Equipped" : ""}</small>
                                    </span>
                                  </span>
                                  <small className="equipmentOwnership">
                                    {equipped ? "Equipped" : inBag ? "Owned / draggable" : "Buy at outfitter"}
                                  </small>
                                  {canEquip ? (
                                    <button
                                      onClick={() => onAction?.({ type: "EQUIP_HERO_ITEM", playerId, equipmentId: def.id, slot: def.slot })}
                                      type="button"
                                    >
                                      <GripVertical aria-hidden="true" size={13} /> Equip
                                    </button>
                                  ) : null}
                                </article>
                              );
                            })}
                          </div>
                        );
                      })}
                    </aside>
                  </div>
                )}
              </section>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
