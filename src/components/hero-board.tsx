"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, GripVertical, HelpCircle, Lock, Medal, PackageOpen, Sparkles, X } from "lucide-react";

import { HERO_INFO_STAT_ICONS } from "@/data/assets/homm-assets";
import { assetUrl } from "@/lib/asset-url";
import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { HERO_GRADE_NODE_IDS, heroGradeIconForFaction } from "@/data/anime/hero-grades";
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
  EQUIPMENT_SLOT_GLYPH,
  HERO_GRADE_MAX,
  HERO_GRADE_MERIT_THRESHOLDS,
  MAX_EXPERIENCE,
  SPECIALTY_LEVELS,
  armyUnitRankInfo,
  cultivationEnabled,
  cultivationRealmLabel,
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
  heroGradeNodesForPlayer,
  heroGradesEnabled,
  heroUnitId,
  makeHeroCombatUnit,
  unitExperienceActive,
  type AnimeEquipmentSlot,
  type GameAction,
  type GameState,
  type LegalAction,
  type PlayerId
} from "@/engine";
import { heroBattlefieldInfoZoomContent, useCardZoom } from "@/components/table/zoom";
import { specialtyIconSrc } from "@/components/specialty-card-data";

const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];
const HERO_GRADE_EMBLEM_ATLAS = "/assets/anime/hero-grades/grade-emblems-atlas.webp";
const HERO_GRADE_ABILITY_ATLAS = "/assets/anime/hero-grades/ability-emblems-atlas.webp";

const HERO_GRADE_ICON_CELLS: Record<string, readonly [number, number]> = {
  [HERO_GRADE_NODE_IDS.bountyHuntersEye]: [0, 1],
  [HERO_GRADE_NODE_IDS.provisioner]: [1, 1],
  [HERO_GRADE_NODE_IDS.battleFocus]: [0, 0],
  [HERO_GRADE_NODE_IDS.spiritCompanion]: [2, 2],
  [HERO_GRADE_NODE_IDS.overflowingInsight]: [3, 0],
  [HERO_GRADE_NODE_IDS.oreDivination]: [1, 1],
  [HERO_GRADE_NODE_IDS.mineWindfall]: [1, 1],
  [HERO_GRADE_NODE_IDS.volatileTreasury]: [0, 1],
  [HERO_GRADE_NODE_IDS.artifactBroker]: [0, 2],
  [HERO_GRADE_NODE_IDS.spellSavant]: [3, 1],
  [HERO_GRADE_NODE_IDS.dualArcana]: [3, 1],
  [HERO_GRADE_NODE_IDS.encore]: [3, 2],
  [HERO_GRADE_NODE_IDS.deepPockets]: [3, 0],
  [HERO_GRADE_NODE_IDS.ironWill]: [1, 0],
  [HERO_GRADE_NODE_IDS.harmonyWard]: [1, 0],
  [HERO_GRADE_NODE_IDS.forcedMarch]: [2, 0],
  [HERO_GRADE_NODE_IDS.crystalDividend]: [2, 1],
  [HERO_GRADE_NODE_IDS.wanderingCurioDealer]: [0, 2],
  [HERO_GRADE_NODE_IDS.firstBlood]: [0, 0],
  [HERO_GRADE_NODE_IDS.resourceSacrifice]: [3, 3],
  [HERO_GRADE_NODE_IDS.combatScholar]: [2, 3],
  [HERO_GRADE_NODE_IDS.astrologersMorale]: [1, 2],
  [HERO_GRADE_NODE_IDS.resourceMastery]: [2, 1],
  [HERO_GRADE_NODE_IDS.majorLegacy]: [0, 2],
  [HERO_GRADE_NODE_IDS.arcaneInsight]: [3, 1],
  [HERO_GRADE_NODE_IDS.warCry]: [0, 0],
  [HERO_GRADE_NODE_IDS.tactician]: [0, 1],
  [HERO_GRADE_NODE_IDS.standingOvation]: [1, 2],
  [HERO_GRADE_NODE_IDS.fallingStar]: [0, 3],
  [HERO_GRADE_NODE_IDS.veteranMentor]: [2, 3],
  [HERO_GRADE_NODE_IDS.inspiringPresence]: [1, 2],
  [HERO_GRADE_NODE_IDS.swiftHost]: [2, 0],
  [HERO_GRADE_NODE_IDS.ancestralRecall]: [3, 3],
  [HERO_GRADE_NODE_IDS.relicDestiny]: [0, 2]
};

function HeroGradeEmblem({
  gradeValue,
  factionId,
  className = ""
}: {
  gradeValue: number;
  factionId?: string;
  className?: string;
}) {
  const cell = Math.max(0, Math.min(3, gradeValue));
  const bespoke = heroGradeIconForFaction(factionId, gradeValue);
  return (
    <span
      aria-hidden="true"
      className={`heroGradeEmblem ${className}`}
      style={{
        "--grade-emblem-image": `url(${assetUrl(bespoke ?? HERO_GRADE_EMBLEM_ATLAS)})`,
        "--grade-emblem-x": bespoke ? "center" : `${(cell % 2) * 100}%`,
        "--grade-emblem-y": bespoke ? "center" : `${Math.floor(cell / 2) * 100}%`,
        "--grade-emblem-size": bespoke ? "cover" : "200% 200%"
      } as React.CSSProperties}
    />
  );
}

function HeroGradeAbilityEmblem({ nodeId }: { nodeId: string }) {
  const cultivationIcon: Record<string, string> = {
    "xianxia-meridian-circulation": "/assets/anime/icons/cultivation/sect-qi.webp",
    "xianxia-body-refinement": "/assets/anime/icons/cultivation/foundation-establishment.webp",
    "xianxia-sword-domain": "/assets/anime/icons/cultivation/sword-intent.webp",
    "modao-blood-refinement": "/assets/anime/icons/cultivation/blood-essence.webp",
    "modao-corpse-furnace": "/assets/anime/icons/cultivation/demon-foundation.webp",
    "modao-forbidden-overreach": "/assets/anime/icons/cultivation/demon-soul.webp"
  };
  if (cultivationIcon[nodeId]) {
    return <img alt="" aria-hidden="true" className="heroGradeAbilityImage" src={assetUrl(cultivationIcon[nodeId])} />;
  }
  const [column = 1, row = 3] = HERO_GRADE_ICON_CELLS[nodeId] ?? [];
  return (
    <span
      aria-hidden="true"
      className="heroGradeAbilityEmblem"
      style={{
        "--grade-ability-image": `url(${assetUrl(HERO_GRADE_ABILITY_ATLAS)})`,
        "--grade-ability-x": `${column * (100 / 3)}%`,
        "--grade-ability-y": `${row * (100 / 3)}%`
      } as React.CSSProperties}
    />
  );
}
/** Specialty cards sit at Ⅰ (starting deck), Ⅳ and Ⅵ — the laurelled numerals. */
const SPECIALTY_TRACK_LEVELS = [1, ...SPECIALTY_LEVELS] as number[];

/** One die-cut box on the printed experience track. */
type XpBox = {
  /** 0…MAX_EXPERIENCE — equals the `hero.experience` value that lands here. */
  index: number;
  /** The engraved value: 1, 1.5, 2, 2.5, … 7. */
  value: number;
  /** Even xp = a level box on the TOP row, odd xp = a half-step box below. */
  row: "top" | "bottom";
  /** The level this box belongs to (a top box) or advances from (a bottom box). */
  level: number;
  /** Display label ("1", "1.5", … "7"). */
  label: string;
};

/**
 * The printed hero mat's experience track is 13 die-cut boxes in a zig-zag:
 * 7 numbered level boxes on the TOP row (Ⅰ…Ⅶ, the even xp values 0,2,…,12) and
 * 6 half-step boxes on the BOTTOM row offset between them (1.5…6.5, the odd xp
 * values 1,3,…,11). The XP cube advances exactly one box per experience point,
 * so **box index === `hero.experience`** — no off-by-one, no rounding. This
 * derives every box's descriptor once; `levelOfExperience` (engine) stays the
 * single source of the level, this only lays the boxes out.
 *
 * The current box (index === experience) is marked by a glowing gold frame on
 * the box itself — as on the printed mat, nothing sits ON the box, so the
 * specialty/ability art in the top boxes stays fully visible.
 */
function xpTrackBoxes(): XpBox[] {
  return Array.from({ length: MAX_EXPERIENCE + 1 }, (_, index) => {
    const value = 1 + index / 2;
    const row: "top" | "bottom" = index % 2 === 0 ? "top" : "bottom";
    return {
      index,
      value,
      row,
      level: Math.floor(index / 2) + 1,
      label: Number.isInteger(value) ? String(value) : value.toFixed(1)
    };
  });
}

/**
 * The authentic printed experience-track art (green marble strip with the
 * laurelled Ⅰ–Ⅶ numerals, blue connector arrows and hand-limit/crown icons all
 * baked in). The track is identical on every hero mat, so this ONE crop from
 * the printed scan is shared by all heroes. Its native crop is 1454×360.
 */
const XP_TRACK_ART = "/assets/hero-board/xp-track.webp";
const XP_TRACK_ASPECT = 1454 / 360;

/**
 * Measured position of each die-cut hole in the track art, as percentages of
 * the crop (keyed by xp index 0…12 = the box the marker lands on). Detected
 * from the scan's transparent (alpha-0) hole regions, so an overlaid card shows
 * exactly through its hole. Even indices are the TOP row, odd the BOTTOM row.
 */
const HOLE_RECTS: Record<number, { left: number; top: number; width: number; height: number }> = {
  0: { left: 5.296, top: 16.667, width: 6.534, height: 25.278 },
  1: { left: 12.173, top: 68.056, width: 6.602, height: 24.444 },
  2: { left: 19.12, top: 16.944, width: 6.602, height: 25 },
  3: { left: 25.997, top: 67.778, width: 6.602, height: 25 },
  4: { left: 32.875, top: 16.667, width: 6.671, height: 25.278 },
  5: { left: 39.89, top: 67.5, width: 6.534, height: 25.278 },
  6: { left: 46.768, top: 16.944, width: 6.534, height: 25 },
  7: { left: 53.645, top: 67.5, width: 6.602, height: 24.722 },
  8: { left: 60.523, top: 16.944, width: 6.602, height: 24.167 },
  9: { left: 67.469, top: 67.778, width: 6.534, height: 24.722 },
  10: { left: 74.278, top: 16.944, width: 6.671, height: 24.444 },
  11: { left: 81.155, top: 67.5, width: 6.602, height: 24.722 },
  12: { left: 88.171, top: 16.944, width: 6.602, height: 24.167 }
};

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
  azur_lane: { banner: "linear-gradient(180deg, #1d5db4 0%, #123a6b 52%, #0a1c33 100%)", edge: "#6fb3e8" },
  // Heavenly Demon Palace (modao): a dark blood-crimson banner + demonic edge,
  // consistent with the faction's wuxia/modao chrome (was silently falling back
  // to the Castle blue).
  heavenly_demon: { banner: "linear-gradient(180deg, #7a1524 0%, #3f0a14 52%, #17060a 100%)", edge: "#b23a4e" }
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
  const [gradeHelpOpen, setGradeHelpOpen] = useState(false);
  const [equipHelpOpen, setEquipHelpOpen] = useState(false);
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
  // Little Busters only: the hero is also a combat unit. Prefer the actual
  // battlefield body while fighting (live damage), otherwise build the exact
  // full-health profile that will enter the next combat.
  const battlefieldHero =
    heroDef.faction === "little_busters"
      ? state.combat?.units[heroUnitId(hero.id)] ?? makeHeroCombatUnit(hero, 0)
      : null;
  const handLimit = effectiveHandLimit(state, playerId);
  // Anime Cultivation (§5.6): a public realm chip (EN + VI). Renders only with
  // the module on — a module-off / non-anime table shows nothing (CONTROL).
  const cultivationGradeFaction = heroDef.faction === "azure_breeze" || heroDef.faction === "heavenly_demon";
  // Wuxia towns run Cultivation as their ONLY hero-progression system: the
  // Hero-Grade chip, picker and tree are fully hidden for them (the engine also
  // grants them no Merit or grade bonuses — see heroGradesEnabledForPlayer), and
  // their signature upgrades are folded into the Cultivation Realm. USER RULE.
  const showRealm = cultivationEnabled(state);
  const showGrade = heroGradesEnabled(state) && !cultivationGradeFaction;
  const realm = cultivationRealmLabel(state, playerId, cultivationRealmOf(state, playerId));
  // Anime Hero Grades (§3.11): a public grade chip + Merit progress + unspent-
  // point indicator, and a pick-a-node picker. Renders only with the module on.
  const gradeValue = heroGradeOf(state, playerId);
  const grade = heroGradeLabel(state, playerId, gradeValue);
  const merit = heroGradeProgressOf(state, playerId);
  const nextThreshold = gradeValue < HERO_GRADE_MAX ? HERO_GRADE_MERIT_THRESHOLDS[gradeValue] : null;
  const gradePoints = heroGradePointsOf(state, playerId);
  const combatCultivation = state.combat?.cultivationFactions?.[playerId];
  const hasSwordIntent = heroDef.id === "qingyun" || heroDef.id === "xuedao";
  const pickableGradeNodes = heroGradePickableNodes(state, playerId);
  const dealtGradeNodes = heroGradeNodesForPlayer(state, playerId);
  const ownedGradeNodes = new Set(heroGradeNodesOf(state, playerId));
  const pickableNodeIds = new Set(pickableGradeNodes.map((node) => node.id));
  // Anime Equipment (§3.13): always-on item chips (slot glyph + EN/VI name).
  // Renders only with the module on AND something equipped (CONTROL: off = null).
  const showEquip =
    equipmentEnabled(state) || state.players[playerId]?.factionId === "heavenly_demon";
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

        {battlefieldHero ? (
          <button
            aria-label={`Show ${heroDef.name} in-battle hero card`}
            className="hbBattlefieldHeroCardButton"
            onClick={() => zoomContent(heroBattlefieldInfoZoomContent(battlefieldHero, state.ruleset))}
            type="button"
          >
            Show in-battle hero
          </button>
        ) : null}

        {(() => {
          // The experience track is the AUTHENTIC printed mat art (green marble
          // strip with the Ⅰ–Ⅶ laurelled numerals, blue connector arrows, and
          // the hand-limit/crown icons all baked into the scan — identical on
          // every hero mat, so one shared crop). The 13 die-cut boxes are
          // transparent HOLES in the art; we overlay each hole at its measured
          // position (HOLE_RECTS) so the specialty/ability card shows THROUGH
          // it. The current XP box (index === experience) wears a glowing gold
          // frame plus a subtle cube tucked in its corner — the only markers,
          // never covering the card art.
          const boxes = xpTrackBoxes();
          const currentXp = Math.max(0, Math.min(MAX_EXPERIENCE, hero.experience));
          return (
            <div
              aria-label={`Level track: level ${hero.level}, ${hero.experience}/${MAX_EXPERIENCE} experience`}
              className="hbTrack"
            >
              <div
                className="hbTrackArt"
                style={{ backgroundImage: `url(${assetUrl(XP_TRACK_ART)})`, aspectRatio: String(XP_TRACK_ASPECT) }}
              >
                {boxes.map((box) => {
                  const isCurrent = currentXp === box.index;
                  const rect = HOLE_RECTS[box.index];
                  const holeStyle: React.CSSProperties = {
                    left: `${rect.left}%`,
                    top: `${rect.top}%`,
                    width: `${rect.width}%`,
                    height: `${rect.height}%`
                  };
                  const cube = isCurrent ? <span aria-hidden="true" className="hbCube" /> : null;
                  if (box.row === "top") {
                    const level = box.level;
                    const reached = hero.level >= level;
                    const specialty = SPECIALTY_TRACK_LEVELS.includes(level);
                    const specialtyCardId = specialty ? heroDef.specialtyCardIds?.[level as 1 | 4 | 6] : undefined;
                    // Ability-search levels (2/3/5/7): the card the player KEPT
                    // from that level-up Search, if any is recorded (public info).
                    const keptAbilityId = ABILITY_SEARCH_LEVELS.includes(level)
                      ? player.levelUpAbilityPicks?.[level]
                      : undefined;
                    return (
                      <div
                        aria-current={isCurrent ? "step" : undefined}
                        className={`hbXpBox hbXpBoxTop ${isCurrent ? "current" : ""}`}
                        data-current={isCurrent ? "true" : undefined}
                        data-xp-index={box.index}
                        data-xp-row="top"
                        data-xp-value={box.label}
                        key={box.index}
                        style={holeStyle}
                      >
                        {specialty && specialtyCardId ? (
                          // The specialty card shows through the hole from the
                          // very beginning: EARNED (hero level ≥ Ⅰ/Ⅳ/Ⅵ) at full
                          // colour, unearned dimmed as a preview — click zooms.
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
                            className="hbSlot hbSlotAbilityPick"
                            onClick={() => zoomCard(keptAbilityId)}
                            title={`Level ${ROMAN[level]}: kept ${
                              cardLibrary[keptAbilityId]?.name ?? keptAbilityId
                            } from the Ability Search`}
                            type="button"
                          >
                            <CardArt cardId={keptAbilityId} kind="ability" />
                          </button>
                        ) : null}
                        {cube}
                      </div>
                    );
                  }
                  // Bottom row: an empty half-step hole — transparent, as printed.
                  return (
                    <div
                      aria-current={isCurrent ? "step" : undefined}
                      className={`hbXpBox hbXpBoxBottom ${isCurrent ? "current" : ""}`}
                      data-current={isCurrent ? "true" : undefined}
                      data-xp-index={box.index}
                      data-xp-row="bottom"
                      data-xp-value={box.label}
                      key={box.index}
                      style={holeStyle}
                    >
                      {cube}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <footer className="hbFooter">
          <span>
            {lexicon.level} {ROMAN[hero.level]} · {lexicon.experience} {hero.experience}/{MAX_EXPERIENCE}
          </span>
          {showRealm ? (
            <span className="hbRealm" title={`Cultivation Realm: ${realm.en} (${realm.vi})`}>
              ☯ {realm.en} · {realm.vi}
            </span>
          ) : null}
          {showGrade ? (
            <span
              className="hbGrade"
              title={`${lexicon.grade}: ${grade.en} (${grade.vi}) · Merit ${merit}${nextThreshold ? `/${nextThreshold}` : " (max)"}`}
            >
              ⚔ {grade.en} · {grade.vi} · Merit {merit}
              {nextThreshold ? `/${nextThreshold}` : ""}
              {gradePoints > 0 ? ` · ${gradePoints} pt` : ""}
            </span>
          ) : null}
          {combatCultivation?.sectQi !== undefined ? (
            <span className="hbCultivationMeter" title="Sect Qi (capacity 2): starts at 0, or 1 with Foundation; gained at most once per round by forming a new allied adjacency; spent for a non-stacking +1 by Sword Formation or Shared Ward.">
              <img alt="" src={assetUrl("/assets/anime/icons/cultivation/sect-qi.webp")} /> Sect Qi {combatCultivation.sectQi}
            </span>
          ) : null}
          {combatCultivation?.bloodEssence !== undefined ? (
            <span className="hbCultivationMeter blood" title="Blood Essence: gained at most once per round when a real Heavenly Demon army unit first flips or is removed; Shiyan gains exactly 1. Blood Frenzy spends at most 1 in rounds 1–3.">
              <img alt="" src={assetUrl("/assets/anime/icons/cultivation/blood-essence.webp")} /> Essence {combatCultivation.bloodEssence}
            </span>
          ) : null}
          {hasSwordIntent && combatCultivation?.swordIntent !== undefined ? (
            <span className="hbCultivationMeter intent" title="Sword Intent: damaging own attacks temper it; the next attack releases at the threshold.">
              <img alt="" src={assetUrl("/assets/anime/icons/cultivation/sword-intent.webp")} /> Intent {combatCultivation.swordIntent}
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
                onClick={() => {
                  setGradeHelpOpen(false);
                  setSystemsOpen("grade");
                }}
                type="button"
              >
                <HeroGradeEmblem className="compact" factionId={heroDef.faction} gradeValue={gradeValue} />
                <span><strong>{lexicon.grade}</strong><small>{grade.en} · {gradePoints} point{gradePoints === 1 ? "" : "s"}</small></span>
              </button>
            ) : null}
            {showEquip ? (
              <button
                className="heroSystemButton equipment"
                onClick={() => {
                  setEquipHelpOpen(false);
                  setSystemsOpen("equipment");
                }}
                type="button"
              >
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
                  <div className="heroSystemHeaderActions">
                    {systemsOpen === "grade" ? (
                      <button
                        aria-expanded={gradeHelpOpen}
                        aria-label="How Hero Grades work"
                        className={`gradeHelpButton${gradeHelpOpen ? " active" : ""}`}
                        onClick={() => setGradeHelpOpen((open) => !open)}
                        title="Hero Grade rules"
                        type="button"
                      >
                        <HelpCircle size={21} />
                      </button>
                    ) : (
                      <button
                        aria-expanded={equipHelpOpen}
                        aria-label="How Hero Equipment works"
                        className={`gradeHelpButton${equipHelpOpen ? " active" : ""}`}
                        onClick={() => setEquipHelpOpen((open) => !open)}
                        title="Hero Equipment rules"
                        type="button"
                      >
                        <HelpCircle size={21} />
                      </button>
                    )}
                    <button aria-label="Close" className="heroSystemClose" onClick={() => setSystemsOpen(null)} type="button">
                      <X size={20} />
                    </button>
                  </div>
                </header>
                {systemsOpen === "grade" ? (
                  <>
                    <div className="gradeWindowSummary">
                      <span className="gradeWindowCurrent"><HeroGradeEmblem factionId={heroDef.faction} gradeValue={gradeValue} /><span><b>{grade.en}</b><small>{grade.vi}</small></span></span>
                      <span><b>{merit}{nextThreshold ? ` / ${nextThreshold}` : ""}</b><small>Merit</small></span>
                      <span className={gradePoints > 0 ? "ready" : ""}><b>{gradePoints}</b><small>Points available</small></span>
                    </div>
                    {gradeHelpOpen ? (
                      <aside className="gradeHelpPanel" role="note">
                        <div><b>1</b><span><strong>Earn Merit</strong><small>Level up, train, visit enlightenment sites, or use a Training Manual.</small></span></div>
                        <div><b>2</b><span><strong>Advance your Grade</strong><small>Reach 3 / 7 / 12 Merit to gain Grades 1–3 and one point each time.</small></span></div>
                        <div><b>3</b><span><strong>Choose one bonus</strong><small>Each tier deals four stable random choices based on the game, town, and hero. Pick one per tier.</small></span></div>
                        <p><Sparkles size={14} /> Glowing choices are available now. A check is learned; a lock needs a higher Grade or its tier is already chosen.</p>
                      </aside>
                    ) : null}
                    {heroDef.faction === "little_busters" ? (
                      <p className="hbGradePickText">
                        Battlefield hero bonus: {gradeValue === 0 ? "none" : gradeValue === 1 ? "+1 Health" : gradeValue === 2 ? "+1 Health, +1 Initiative" : "+1 Attack, +2 Health, +1 Initiative"}. If defeated, the hero returns at full Health next combat.
                      </p>
                    ) : null}
                    <div className="heroGradeTree" aria-label="Skill and passive tree">
                      {Array.from({ length: HERO_GRADE_MAX }, (_, index) => index + 1).map((tier) => (
                        <div className={`heroGradeTier tier-${tier}`} key={tier}>
                          <h3><span>Tier {tier}</span><small>{tier === 1 ? "Foundation" : tier === 2 ? "Mastery" : tier === 3 ? "Legacy" : `Ascension ${tier}`}</small></h3>
                          {dealtGradeNodes.filter((node) => node.tier === tier).map((node) => {
                            const owned = ownedGradeNodes.has(node.id);
                            const available = pickableNodeIds.has(node.id) && Boolean(onAction);
                            return (
                              <button
                                className={`heroGradeNode tier-${tier} ${owned ? "owned" : available ? "available" : "locked"}`}
                                disabled={!available}
                                key={node.id}
                                onClick={() => onAction?.({ type: "HERO_GRADE_PICK", playerId, nodeId: node.id })}
                                type="button"
                              >
                                <span className="heroGradeNodeIcon">
                                  <HeroGradeAbilityEmblem nodeId={node.id} />
                                  <span className="heroGradeNodeStatus">
                                    {owned ? <Check size={15} /> : available ? <Sparkles size={15} /> : <Lock size={13} />}
                                  </span>
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
                  <>
                    {equipHelpOpen ? (
                      <aside className="gradeHelpPanel" role="note">
                        <div><b>1</b><span><strong>Get gear</strong><small>Buy Grade I / II / III items at an outfitter (5 / 7 / 10 gold), or earn them from bank wins and tough battles.</small></span></div>
                        <div><b>2</b><span><strong>Equip a slot</strong><small>Drag an owned item onto its body slot, or press Equip. One item per slot — a new one replaces the old and returns it to your bag.</small></span></div>
                        <div><b>3</b><span><strong>Always on</strong><small>Every equipped effect runs in your main hero&apos;s combats. Same-slot items never stack.</small></span></div>
                        <p><Sparkles size={14} /> Replaced gear waits in your bag; drag it back any time you are not in combat.</p>
                      </aside>
                    ) : null}
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
                  </>
                )}
              </section>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
