"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BLESSINGS, CARDS, DEFENDERS, ENEMIES, FUSIONS, GW_TPS, SPELLS, type BlessingId, type DefKind, type EnemyKind, type SpellId } from "@/engine/garrison/content";
import {
  OC_ALL_CLEARED, OC_ALL_HIRED, OC_ENDLESS, OC_HEROES, OC_HERO_ORDER, OC_LEVELS, OC_LEVEL_COST, OC_LAWFUL_COLOR, OC_MAX_LEVEL, OC_MERCENARIES,
  OC_RAID_CHARGES, OC_RAIDS, OC_SPELLBOOK_SIZE, OC_SPELLS, OC_STAR_MILESTONES, OC_ULT_LEVEL, OC_WORLDS, OC_ARTIFACTS,
  altarOpen, artifactSlots, buildOcConfig, crownSlots, findOcLevel, surgeSlots, endlessOpen, goalMet, goalText, isLevelOpen, levelPower, mercCampOpen, metEnemies, raidOpen, seedSlots,
  totalStars, unlockedArtifacts, unlockedHeroes, unlockedSpells, unlockedUltimates, unlockedUnits, worldCleared,
  OC_HERO_MAX_RANK, OC_GACHA_HEROES, heroRankCap, heroRankOf, heroRankText,
  type OcHeroId, type OcLevel
} from "@/engine/garrison/order-chaos/campaign";
import { gardenOpen, gardenPlots, isRipe } from "@/engine/garrison/order-chaos/garden";
import { OC_DAILY_ID, OC_DAILY_LEVEL, buildDailyConfig, ocDaily, type OcDaily } from "@/engine/garrison/order-chaos/daily";
import { ASCEND_TICKS, VALOR_NEED } from "@/engine/garrison/order-chaos/forms";
import { ocDayKey, ocRunSummary, ocRunTime, type OcBoardMode, type OcRunSummary } from "@/engine/garrison/order-chaos/scores";
import { OC_DEFENDERS, OC_ENEMIES, OC_ULTIMATES } from "@/engine/garrison/order-chaos/roster";
import {
  OC_BATTLE_QUIPS, OC_ENDLESS_LINES, OC_EPILOGUE, OC_LEVEL_STORY, OC_PROLOGUE, OC_PROLOGUE_ID, OC_SCORE_LINES, OC_SCREEN_LINES, OC_WORLD_OUTRO, OC_WORLD_STORY, isNarration, unlockedLines,
  type OcLine, type OcQuipEvent, type OcSceneLine
} from "@/engine/garrison/order-chaos/story";
import { surgeText } from "@/engine/garrison/order-chaos/surge-text";
import { STANDOFF_NERVE, type GarrisonEvent, type Side } from "@/engine/garrison/sim";
import { assetUrl } from "@/lib/asset-url";
import { setMusicScene, type MusicScene } from "@/lib/music";
import { emptyOcProgress, loadOcProgress, OC_PROGRESS_KEY, OC_REPLAY_ORE_DAILY, saveOcProgress, takingsToday, type OcProgress } from "@/lib/order-chaos-progress";
import { preloadSprites } from "../art";
import { createLocalDriver, type GarrisonDriver } from "../driver";
import { GarrisonGame, type GameIntro, type GameResult } from "../garrison-game";
import styles from "../garrison.module.css";
import { AttackerArt, CARD_SCENES, CardArt, DefenderArt, cardScene, cardSceneSrc } from "../thumbs";
import oc from "./oc.module.css";
import { OcDailyScreen, OcRunScore, OcTallyBoard, isOcNewBest, markOcBestSent, ocBestKey, recordOcBest, useOcScoreSync } from "./oc-scores-ui";
import { AdvisorBubble, StoryScene } from "./story-ui";
import { FieldAlmanac, FieldPanel, newFieldLines } from "./field-ui";
import { ForgeScreen, GardenScreen, Materials, OreIcon } from "./forge-garden";
import { AttendanceDialog, CrystalIcon, CrystalPurse, PackItems, PortalScreen, SatchelScreen, attendanceOpen, satchelCount } from "./treasury-ui";
import { OC_CRYSTALS, OC_ITEMS, battleDrop, isOcItem } from "@/engine/garrison/order-chaos/treasury";
import { OC_GACHA_ARTIFACTS, OC_GACHA_CHAOS, OC_GACHA_UNITS } from "@/engine/garrison/order-chaos/gacha-content";
import { addItems, itemCount, packedSatchel, spendItem } from "@/lib/order-chaos-treasury";
import { canResumeOcRun, clearOcRun, loadOcRuns, saveOcRun, savedAgo, type OcRunSlot, type OcSavedRun } from "@/lib/order-chaos-runs";
import { SettingsButton } from "@/components/settings/settings-dialog";

type Screen =
  | { s: "home" }
  | { s: "campaign"; world: number }
  | { s: "prep"; level: OcLevel }
  | { s: "raids" }
  | { s: "barracks" }
  | { s: "camp" }
  | { s: "forge" }
  | { s: "garden" }
  | { s: "portal" }
  | { s: "satchel" }
  | { s: "almanac" }
  | { s: "lab" }
  | { s: "journal" }
  | { s: "daily" }
  | { s: "tally"; mode?: OcBoardMode }
  | { s: "play" };

/** `daily`: the Daily Siege orders being played (their day and fingerprint go on the tally board). */
/**
 * `slot`: where a scored run (Endless, Daily Siege, a raid) is kept while it is played (lib/order-chaos-runs.ts),
 * with the hand and hero it began with; `resumed`: it carries on a saved run.
 */
type Session = {
  key: number; driver: GarrisonDriver; level: OcLevel; restart: () => void; daily?: OcDaily;
  slot?: OcRunSlot; cards?: DefKind[]; hero?: string; resumed?: boolean;
};

/** Where a level's run in progress is kept (campaign battles are not: they give no board score mid-way). */
function runSlotOf(level: OcLevel, daily?: OcDaily): OcRunSlot | null {
  if (daily) return "daily";
  if (level.kind === "endless") return "endless";
  if (level.kind === "raid") return `raid:${level.id}`;
  return null;
}

/** The Endless Siege's pay for reaching `waves`: only what passes the best so far (Seals and Ore every 5th wave, Crystals every 10th). */
function payEndless(p: OcProgress, waves: number): OcProgress {
  const gained = Math.max(0, Math.floor(waves / 5) - Math.floor(p.bestEndless / 5));
  const tens = Math.max(0, Math.floor(waves / 10) - Math.floor(p.bestEndless / 10));
  return { ...p, bestEndless: Math.max(p.bestEndless, waves), seals: p.seals + gained, ore: p.ore + gained, crystals: p.crystals + tens * OC_CRYSTALS.endlessTen };
}

type RunSoFar = Pick<OcSavedRun, "slot" | "day" | "setup" | "hero" | "state">;

/** A siege run's standing so far as its board summary (Endless / Daily Siege); null for a raid (only a broken raid scores). */
function siegeSummary(run: RunSoFar): OcRunSummary | null {
  if (run.slot === "endless") return ocRunSummary(run.state, "endless", run.hero ? { hero: run.hero } : {});
  if (run.slot === "daily") return ocRunSummary(run.state, "daily", { day: run.day, setup: run.setup, hero: run.hero });
  return null;
}

/**
 * Keeps what a siege run has reached so far, as a finished run would: its tally-board best (posted by
 * useOcScoreSync) and, in the Endless Siege, its wave pay. Only what beats the bests kept is added, so
 * keeping the same run again (on leaving, on reopening) changes nothing.
 */
function keepSiegeProgress(p: OcProgress, run: RunSoFar): OcProgress {
  const summary = siegeSummary(run);
  if (!summary || summary.wave < 1 || run.state.outcome) return p;
  const paid = summary.mode === "endless" ? payEndless(p, summary.wave) : p;
  // (An Endless run with the testing unlock on stays off the boards, as a finished one does.)
  return summary.mode === "endless" && p.testAll ? paid : recordOcBest(paid, summary);
}

const seed = () => Math.floor(Math.random() * 2147483647);

/** Every Lawful unit with a seed packet, in campaign order. */
const LAWFUL_CARDS: DefKind[] = OC_DEFENDERS.filter((def) => def.card).map((def) => def.kind);
/** Hybrids: made on the field by dropping one seed packet on another unit. */
const HYBRIDS: DefKind[] = OC_DEFENDERS.filter((def) => def.fusion).map((def) => def.kind);

/** Conveyor-only specials: the caravan levels whose belts carry this one. */
function conveyorLevels(kind: DefKind): OcLevel[] {
  return OC_LEVELS.filter((level) => level.conveyorPool?.includes(kind));
}

/** Can the player make this hybrid (both halves recruited)? */
function hybridKnown(kind: DefKind, units: readonly DefKind[]): boolean {
  const recipe = FUSIONS.find((entry) => entry.result === kind);
  return recipe !== undefined && recipe.a.some((id) => units.includes(id)) && recipe.b.some((id) => units.includes(id));
}
/** Every Chaos creature that marches (graves included for the almanac). */
const CHAOS_KINDS: EnemyKind[] = OC_ENEMIES.map((def) => def.kind);

/** The password that switches the testing unlock on. */
const TEST_PASSWORD = "1234";

const KIND_LABEL: Record<OcLevel["kind"], string> = {
  battle: "", "last-stand": "Last Stand", conveyor: "Conveyor", protect: "Protect", boss: "Boss", raid: "Raid", endless: "Endless"
};

const ART = {
  campaign: "/assets/ui/menu/buttons/oc-campaign.webp",
  endless: "/assets/ui/menu/buttons/oc-endless.webp",
  raids: "/assets/ui/menu/buttons/oc-chaos-raids.webp",
  daily: "/assets/ui/menu/buttons/oc-daily-siege.webp",
  tally: "/assets/ui/menu/buttons/oc-tally-board.webp",
  barracks: "/assets/ui/menu/buttons/oc-barracks.webp",
  camp: "/assets/ui/menu/buttons/oc-mercenaries.webp",
  forge: "/assets/ui/menu/buttons/oc-forge.webp",
  garden: "/assets/ui/menu/buttons/oc-garden.webp",
  portal: "/assets/ui/menu/buttons/oc-portal.webp",
  satchel: "/assets/ui/menu/buttons/oc-satchel.webp",
  almanac: "/assets/ui/menu/buttons/oc-almanac.webp",
  versus: "/assets/ui/menu/buttons/gw-versus.webp",
  hybrids: "/assets/ui/menu/buttons/oc-hybrids.webp",
  sigil: "/assets/order-chaos/ui/fusion-sigil.webp",
  back: "/assets/ui/menu/buttons/back.webp",
  seal: "/assets/order-chaos/icons/seal.webp",
  star: "/assets/order-chaos/icons/star.webp",
  surge: "/assets/order-chaos/icons/surge.webp",
  valor: "/assets/order-chaos/icons/valor.webp",
  mercenary: "/assets/order-chaos/icons/mercenary.webp",
  grave: "/assets/order-chaos/props/grave.webp"
} as const;

/** Order & Chaos menu art (Codex-painted; the CSS falls back to plain frames while any is missing). */
const OC_UI = {
  banner: "/assets/order-chaos/ui/banner.webp",
  mapFrame: "/assets/order-chaos/ui/map-frame.webp",
  medal: "/assets/order-chaos/ui/medal.webp",
  medalBoss: "/assets/order-chaos/ui/medal-boss.webp",
  medalLocked: "/assets/order-chaos/ui/medal-locked.webp",
  card: "/assets/order-chaos/ui/card.webp",
  packet: "/assets/order-chaos/ui/packet-frame.webp",
  tray: "/assets/order-chaos/ui/tray.webp",
  cursor: "/assets/order-chaos/ui/cursor.png",
  cursorHot: "/assets/order-chaos/ui/cursor-hot.png",
  home: "/assets/order-chaos/ui/bg-home.webp",
  table: "/assets/order-chaos/ui/bg-table.webp",
  forge: "/assets/order-chaos/ui/bg-forge.webp",
  garden: "/assets/order-chaos/ui/bg-garden.webp",
  portal: "/assets/order-chaos/ui/bg-portal.webp"
} as const;

/**
 * What the player has unlocked, derived from their progress. The testing
 * unlock (password-gated) treats the whole campaign as cleared, every
 * mercenary as hired and every star reward as reached; Seals, Barracks
 * levels and records stay the player's own.
 */
type Unlocks = {
  test: boolean;
  cleared: readonly string[];
  stars: number;
  units: DefKind[];
  heroes: OcHeroId[];
  artifacts: BlessingId[];
  artSlots: number;
  seedSlots: number;
  crowns: number;
  surges: number;
  spells: SpellId[];
  ultimates: DefKind[];
  altar: boolean;
  camp: boolean;
  /** Chaos raiders won at the Summoning Portal. */
  raiders: string[];
};

function unlocksOf(p: OcProgress): Unlocks {
  const test = p.testAll;
  const cleared = test ? OC_ALL_CLEARED : p.cleared;
  const stars = test ? Number.MAX_SAFE_INTEGER : totalStars(p.cleared, p.stars);
  // (Portal prizes are the player's own, testing unlock or not.)
  const units = [...unlockedUnits(cleared, test ? OC_ALL_HIRED : p.hired), ...p.gacha.units.filter((kind) => DEFENDERS[kind] && OC_GACHA_UNITS.some((u) => u.kind === kind))];
  return {
    test,
    cleared,
    stars,
    units,
    heroes: [...unlockedHeroes(cleared), ...OC_GACHA_HEROES.filter((id) => p.gacha.heroes.includes(id))],
    artifacts: [...unlockedArtifacts(cleared, stars), ...p.gacha.artifacts.filter((id): id is BlessingId => OC_GACHA_ARTIFACTS.some((a) => a.id === id) && !!BLESSINGS[id as BlessingId])],
    artSlots: artifactSlots(cleared, stars),
    seedSlots: seedSlots(cleared, stars),
    crowns: crownSlots(stars),
    surges: surgeSlots(stars),
    spells: unlockedSpells(cleared, stars),
    ultimates: unlockedUltimates(cleared, units, p.levels, test),
    altar: test || altarOpen(cleared),
    camp: test || mercCampOpen(cleared),
    raiders: p.gacha.chaos.filter((kind) => ENEMIES[kind])
  };
}

/** Ore a replayed battle may still pay today (OC_REPLAY_ORE_DAILY a UTC day), and the progress with it counted. */
function replayOre(p: OcProgress, want: number): number {
  return Math.max(0, Math.min(want, OC_REPLAY_ORE_DAILY - takingsToday(p, ocDayKey()).replayOre));
}
function countReplayOre(p: OcProgress, ore: number): OcProgress {
  if (ore <= 0) return p;
  const today = takingsToday(p, ocDayKey());
  return { ...p, daily: { ...today, replayOre: today.replayOre + ore } };
}

/** The spellbook a battle takes: the chosen spells still unlocked, else the first ones found. */
function spellbookOf(p: OcProgress, u: Unlocks): SpellId[] {
  const chosen = p.spellbook.filter((id) => u.spells.includes(id));
  return (chosen.length ? chosen : u.spells).slice(0, OC_SPELLBOOK_SIZE);
}

/** An art button face that falls back to its text label if the art is missing. */
function ArtFace({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={oc.artFallback}>{label}</span>;
  return <img alt="" aria-hidden className={styles.artModeImg} draggable={false} onError={() => setFailed(true)} src={assetUrl(src)} />;
}

function Icon({ src, fallback, className }: { src: string; fallback: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span aria-hidden className={className}>{fallback}</span>;
  return <img alt="" className={className} draggable={false} onError={() => setFailed(true)} src={assetUrl(src)} />;
}

function starsOf(progress: OcProgress, level: OcLevel): number {
  return (progress.cleared.includes(level.id) ? 1 : 0) + (progress.stars[level.id]?.length ?? 0);
}

/**
 * "New recruit!" — the troops a first victory hands over, each on its own card
 * with light turning behind it (the moment Plants vs. Zombies hands you a seed packet).
 */
function RecruitReveal({ kinds }: { kinds: readonly DefKind[] }) {
  return (
    <div className={oc.reveal}>
      <h3 className={oc.revealHead}>New recruit{kinds.length > 1 ? "s" : ""}!</h3>
      <div className={oc.revealCards}>
        {kinds.map((kind, i) => {
          const def = DEFENDERS[kind];
          if (!def) return null;
          return (
            <div className={oc.revealItem} key={kind} style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
              <div className={oc.revealCard} style={{ ["--oc-card" as string]: `url("${assetUrl(OC_UI.card)}")` }}>
                <span aria-hidden className={oc.revealRays} />
                <span className={oc.revealArt} style={{ backgroundImage: `url("${assetUrl(cardSceneSrc(cardScene(kind)))}")` }}><DefenderArt kind={kind} size={112} /></span>
                <strong>{def.name}</strong>
                {def.card ? <em>{def.card.cost} gold</em> : null}
              </div>
              <small className={oc.revealBlurb}>{def.blurb}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Where level `i` of `n` sits on a world map (percent of its width / height): a winding road left to right. */
function mapSpot(i: number, n: number): { x: number; y: number } {
  const x = n <= 1 ? 50 : 8 + (84 * i) / (n - 1);
  const y = [58, 27, 54, 24, 52, 27, 56][i % 7]!;
  return { x, y };
}

/** The road through a world's levels: a smooth curve (Catmull-Rom as cubic Béziers) in 0..100 map units. */
function mapRoad(n: number): string {
  const pts = Array.from({ length: n }, (_, i) => mapSpot(i, n));
  if (!pts.length) return "";
  const lead = { x: 0, y: pts[0]!.y + 12 };
  const all = [lead, ...pts];
  let d = `M ${lead.x} ${lead.y}`;
  for (let i = 0; i < all.length - 1; i += 1) {
    const p0 = all[i - 1] ?? all[i]!;
    const p1 = all[i]!;
    const p2 = all[i + 1]!;
    const p3 = all[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)}, ${c2.x.toFixed(2)} ${c2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function Stars({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span aria-label={`${count} of ${max} stars`} className={oc.stars}>
      {Array.from({ length: max }, (_, i) => <span className={i < count ? oc.starOn : oc.starOff} key={i}>★</span>)}
    </span>
  );
}

function introFor(level: OcLevel, cleared: readonly string[]): GameIntro {
  // Endless marches every foe met; the Daily Siege brings the day's horde.
  const pool = level.kind === "endless" && level.id !== OC_DAILY_ID ? metEnemies(cleared) : level.enemies;
  // (A world boss leads the line-up; none ever marches in Endless.)
  const kinds = [...new Set([...(level.warboss ? [level.warboss] : []), ...(level.featured ? [level.featured] : []), ...pool])]
    .filter((kind) => ENEMIES[kind] && !ENEMIES[kind]!.structure && (kind === level.warboss || !ENEMIES[kind]!.boss));
  return { title: level.name, lineup: level.kind === "raid" ? [] : kinds.slice(0, 10), cue: level.kind === "raid" ? "Attack!" : "Defend!" };
}

/** A starting hand: gold-makers first, then the most recently recruited troops. */
/** Worlds whose battles carry Remnants of the Horde in the rotation after Grasswalk. */
const HORDE_MUSIC_WORLDS: ReadonlySet<number> = new Set([3, 5, 7, 9]);

/**
 * A battle's music: Grasswalk then the combat rotation; Endless Siege, Chaos
 * Raids and some worlds add Remnants of the Horde to the rotation; Krewlod
 * opens with it, then Grasswalk, the two taking turns. (Daily Siege: plain.)
 */
function battleMusicFor(level: OcLevel, daily: boolean): "order-chaos" | "order-chaos-horde" | "order-chaos-remnants" {
  if (level.kind === "endless" || level.kind === "raid") return "order-chaos-horde";
  if (daily) return "order-chaos";
  if (level.world === 8) return "order-chaos-remnants";
  return HORDE_MUSIC_WORLDS.has(level.world) ? "order-chaos-horde" : "order-chaos";
}

function defaultHand(units: DefKind[], slots: number): DefKind[] {
  const econ = units.filter((kind) => DEFENDERS[kind]?.produce && DEFENDERS[kind]!.produce!.value > 0).slice(0, 1);
  const rest = units.filter((kind) => !econ.includes(kind) && !DEFENDERS[kind]?.instant).reverse();
  const instants = units.filter((kind) => DEFENDERS[kind]?.instant);
  return [...econ, ...rest, ...instants].slice(0, slots);
}

/** Where a Lawful unit is recruited (for locked entries). */
function unlockSource(kind: DefKind): string {
  const gacha = OC_GACHA_UNITS.find((entry) => entry.kind === kind);
  if (gacha) return `Summoning Portal (${gacha.rarity}) or the Stardust Exchange`;
  const merc = OC_MERCENARIES.find((entry) => entry.kind === kind);
  if (merc) return `Mercenary Camp: ${merc.seals} Seals`;
  if (DEFENDERS[kind]?.conveyor) {
    const belts = conveyorLevels(kind).map((level) => `${level.world}-${level.id.split("-")[1]} ${level.name}`);
    return `Conveyor special — only rides the caravan belts${belts.length ? ` (${belts.join(", ")})` : ""}.`;
  }
  const level = OC_LEVELS.find((entry) => entry.reward.units?.includes(kind));
  if (!level) return "From the start";
  return `Clear ${level.world}-${level.id.split("-")[1]}: ${level.name}`;
}

/** "Longbowman + Snow Elf" for a hybrid. */
function recipeText(kind: DefKind): string {
  const recipe = FUSIONS.find((entry) => entry.result === kind);
  if (!recipe) return "";
  const name = (id: string) => DEFENDERS[id]?.name ?? CARDS[id]?.name ?? id;
  return `${recipe.a.map(name).join(" / ")} + ${recipe.b.map(name).join(" / ")}`;
}

/** A story scene to show: its id is remembered once seen; `then` runs when it ends. */
type StoryShow = { id: string; lines: readonly OcSceneLine[]; letter?: string; then?: () => void };

/** The last level of the last world: clearing it earns the epilogue. */
const FINAL_LEVEL = OC_WORLDS[OC_WORLDS.length - 1]?.levels.at(-1)?.id ?? "";

/** A level's letter and talk (null when it has none, or when `seen` already holds it). */
function levelStory(level: OcLevel, seen?: readonly string[]): StoryShow | null {
  const story = OC_LEVEL_STORY[level.id];
  if (!story || (!story.before?.length && !story.letter)) return null;
  const id = `level:${level.id}`;
  if (seen?.includes(id)) return null;
  // Crag explains the battlefield systems this level brings in for the first time (order-chaos/field.ts).
  return { id, lines: [...(story.before ?? []), ...newFieldLines(level)], letter: story.letter };
}

/**
 * The first world whose closing scene is owed: the world is cleared, its outro
 * unseen, and the next world's intro unseen too (so progress made before the
 * outros existed doesn't replay a backlog of them).
 */
function owedOutro(p: OcProgress): StoryShow | null {
  for (const world of OC_WORLDS) {
    const lines = OC_WORLD_OUTRO[world.id];
    const id = `outro:${world.id}`;
    if (lines?.length && worldCleared(world.id, p.cleared) && !p.seen.includes(id) && !p.seen.includes(`world:${world.id + 1}`)) return { id, lines };
  }
  return null;
}

/** The scene a screen opens with the first time: the prologue, a world's closing scene or story, the epilogue, a level's talk. */
function autoStory(screen: Screen, p: OcProgress): StoryShow | null {
  if (screen.s === "home") return p.seen.includes(OC_PROLOGUE_ID) ? null : { id: OC_PROLOGUE_ID, lines: OC_PROLOGUE };
  if (screen.s === "campaign") {
    if (FINAL_LEVEL && p.cleared.includes(FINAL_LEVEL) && !p.seen.includes("epilogue")) return { id: "epilogue", lines: OC_EPILOGUE };
    const outro = owedOutro(p);
    if (outro) return outro;
    const id = `world:${screen.world}`;
    const lines = OC_WORLD_STORY[screen.world];
    return lines?.length && !p.seen.includes(id) ? { id, lines } : null;
  }
  if (screen.s === "prep") return levelStory(screen.level, p.seen);
  if (screen.s === "daily") return levelStory(OC_DAILY_LEVEL, p.seen);
  return null;
}

/** One scene the player has already reached, in the order the story tells it. */
type StoryLogEntry = StoryShow & { title: string };
type StoryLogChapter = { title: string; entries: StoryLogEntry[] };

/**
 * The story so far: every scene the player has reached (seen it, or won past
 * it), grouped by chapter in play order. Uses the player's real clears, not the
 * testing unlock, so it only holds what actually happened.
 */
function storyLog(p: OcProgress): StoryLogChapter[] {
  const seen = (id: string) => p.seen.includes(id);
  const cleared = (id: string) => p.cleared.includes(id) || p.raids.includes(id);
  const levelEntries = (level: OcLevel, title: string): StoryLogEntry[] => {
    const story = OC_LEVEL_STORY[level.id];
    if (!story) return [];
    const out: StoryLogEntry[] = [];
    const before = `level:${level.id}`;
    if ((story.before?.length || story.letter) && (seen(before) || cleared(level.id))) out.push({ id: before, title, lines: story.before ?? [], letter: story.letter });
    if (story.after?.length && cleared(level.id)) out.push({ id: `after:${level.id}`, title: `${title}: victory`, lines: story.after });
    return out;
  };
  const chapters: StoryLogChapter[] = [{ title: "Prologue", entries: [{ id: OC_PROLOGUE_ID, title: "Brookhold", lines: OC_PROLOGUE }] }];
  for (const world of OC_WORLDS) {
    const entries: StoryLogEntry[] = [];
    const intro = OC_WORLD_STORY[world.id];
    if (intro?.length && (seen(`world:${world.id}`) || world.levels.some((level) => cleared(level.id)))) entries.push({ id: `world:${world.id}`, title: "Arrival", lines: intro });
    for (const level of world.levels) entries.push(...levelEntries(level, `${levelCode(level)} ${level.name}`));
    const outro = OC_WORLD_OUTRO[world.id];
    if (outro?.length && worldCleared(world.id, p.cleared)) entries.push({ id: `outro:${world.id}`, title: "Chapter's end", lines: outro });
    if (entries.length) chapters.push({ title: `World ${world.id}: ${world.name}`, entries });
  }
  const side: StoryLogEntry[] = [
    ...OC_RAIDS.flatMap((raid) => levelEntries(raid, `Raid: ${raid.name}`)),
    ...levelEntries(OC_ENDLESS, "The Endless Siege"),
    ...levelEntries(OC_DAILY_LEVEL, "The Daily Siege")
  ];
  if (side.length) chapters.push({ title: "Raids and the Sieges", entries: side });
  if (FINAL_LEVEL && p.cleared.includes(FINAL_LEVEL)) chapters.push({ title: "Epilogue", entries: [{ id: "epilogue", title: "Quiet", lines: OC_EPILOGUE }] });
  return chapters;
}

function pickLine(lines: readonly OcLine[] | undefined): OcLine | null {
  return lines?.length ? lines[Math.floor(Math.random() * lines.length)] ?? null : null;
}

/** One of the lines the player has unlocked from `pool` (null when none). */
const pickUnlocked = (pool: readonly OcLine[] | undefined, cleared: readonly string[]): OcLine | null => pickLine(unlockedLines(pool, cleared));

/** A menu screen's greeting: one unlocked line, picked once when the screen opens. */
function Greeting({ place, cleared }: { place: keyof typeof OC_SCREEN_LINES; cleared: readonly string[] }) {
  const [line] = useState(() => pickUnlocked(OC_SCREEN_LINES[place], cleared));
  return line ? <div className={oc.greeting}><AdvisorBubble compact line={line} /></div> : null;
}

function ultimateLine(kind: DefKind): string | null {
  const ult = OC_ULTIMATES[kind];
  return ult ? `${ult.name} (+30% health and power): ${ult.blurb}` : null;
}

export function OrderChaosApp() {
  const [screen, setScreen] = useState<Screen>({ s: "home" });
  // (Runs left in progress — left mid-way, or a tab closed on them — keep what they reached: keepSiegeProgress.)
  const [progress, setProgress] = useState<OcProgress>(() => loadOcRuns().reduce(keepSiegeProgress, loadOcProgress()));
  // The latest progress, for a battle's restart (its Satchel holds only what is still owned).
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [note, setNote] = useState<ReactNode>(null);
  const [nextLevel, setNextLevel] = useState<OcLevel | null>(null);
  const unlocks = useMemo(() => unlocksOf(progress), [progress]);
  // In-battle quips (the defending side only), from the lines the player has unlocked.
  const battleQuip = useCallback((event: OcQuipEvent): OcLine | null => pickUnlocked(OC_BATTLE_QUIPS[event], unlocks.cleared), [unlocks.cleared]);
  // Story: a replayed (or chained) scene, else the one this screen opens with the first time.
  const [story, setStory] = useState<StoryShow | null>(null);
  // Music: the preparation theme loops on the loadout screen, the menu theme on
  // the other menus; the campaign map keeps the mode-select screen's own theme
  // playing on, uninterrupted. While a battle is on screen GarrisonGame owns the music
  // (preparation theme during Last Stand planning, then the battle score), so
  // this effect stays silent instead of fighting it; the battle's unmount stops
  // its track before this effect picks the menu scene back up.
  const menuMusic: MusicScene | null = screen.s === "play" && session ? null : screen.s === "prep" ? "oc-prep" : screen.s === "home" || screen.s === "campaign" ? "oc-home" : "oc-menu";
  useEffect(() => {
    if (menuMusic) setMusicScene(menuMusic);
  }, [menuMusic]);
  useEffect(() => () => setMusicScene(null), []);

  const replaceSession = useCallback((next: Session | null) => {
    sessionRef.current?.driver.dispose();
    sessionRef.current = next;
    setSession(next);
  }, []);
  // A scored run in progress is kept on this device as it is played, so leaving (or losing the tab) never loses it.
  const saveRun = useCallback(() => {
    const current = sessionRef.current;
    if (!current?.slot) return;
    const state = current.driver.state();
    if (state.outcome) {
      clearOcRun(current.slot);
      return;
    }
    if (state.tick <= 0) return;
    saveOcRun({
      slot: current.slot, levelId: current.level.id, cards: current.cards ?? [],
      ...(current.daily ? { day: current.daily.day, setup: current.daily.setup } : {}),
      ...(current.hero ? { hero: current.hero } : {}),
      state
    });
  }, []);
  useEffect(() => () => {
    saveRun();
    sessionRef.current?.driver.dispose();
    sessionRef.current = null;
  }, [saveRun]);
  useEffect(() => {
    if (!session?.slot) return;
    const timer = window.setInterval(saveRun, 15000);
    const onHide = () => {
      if (document.visibilityState === "hidden") saveRun();
    };
    window.addEventListener("pagehide", saveRun);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", saveRun);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [session, saveRun]);

  // Every change is written once it commits; a refused write (storage blocked
  // or full) is shown instead of silently losing the player's progress.
  const [saveFailed, setSaveFailed] = useState(false);
  const dirtyRef = useRef(false);
  const update = useCallback((change: (p: OcProgress) => OcProgress) => {
    dirtyRef.current = true;
    setProgress(change);
  }, []);
  useEffect(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveFailed(!saveOcProgress(progress));
  }, [progress]);
  // Every best and the campaign tally go up to the tally boards by themselves.
  useOcScoreSync(progress, update);
  // Runs left in progress wait to be played on.
  const [savedRuns, setSavedRuns] = useState<OcSavedRun[]>(loadOcRuns);
  const abandonRun = useCallback((run: OcSavedRun) => {
    clearOcRun(run.slot);
    setSavedRuns(loadOcRuns());
  }, []);
  // Another tab saved: adopt its progress so this tab never writes back a stale copy.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === OC_PROGRESS_KEY && event.newValue) setProgress(loadOcProgress());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const shownStory = story ?? (screen.s === "play" ? null : autoStory(screen, progress));
  // The daily calendar opens by itself once a visit, on the home screen, when today's square is unclaimed (after the prologue).
  const [calendar, setCalendar] = useState(false);
  const calendarAsked = useRef(false);
  useEffect(() => {
    if (calendarAsked.current || screen.s !== "home" || shownStory || !progress.seen.includes(OC_PROLOGUE_ID) || !attendanceOpen(progress)) return;
    calendarAsked.current = true;
    setCalendar(true);
  }, [screen.s, shownStory, progress]);
  const cursorVars = useMemo(() => ({
    ["--gw-cursor" as string]: `url("${assetUrl(OC_UI.cursor)}")`,
    ["--gw-cursor-hot" as string]: `url("${assetUrl(OC_UI.cursorHot)}")`
  }), []);
  const endStory = useCallback((shown: StoryShow) => {
    update((p) => (p.seen.includes(shown.id) ? p : { ...p, seen: [...p.seen, shown.id] }));
    setStory(null);
    shown.then?.();
  }, [update]);

  const start = useCallback((level: OcLevel, cards: DefKind[]) => {
    const p = progress;
    const u = unlocksOf(p);
    const launch = () => {
      // The packed Satchel rides into the battle (never a raid): each item usable there up to its perMatch,
      // one copy spent a use (onBattleEvents). A restart is a new battle: its uses start afresh, from what is still owned.
      const satchel = level.kind === "raid" ? [] : packedSatchel(progressRef.current);
      const config = buildOcConfig(level, {
        satchel, chaos: p.gacha.chaos.filter((kind) => ENEMIES[kind]),
        seed: seed(), cards, hero: u.heroes.includes(p.hero) ? p.hero : "catherine", heroRank: heroRankOf(u.heroes.includes(p.hero) ? p.hero : "catherine", p.heroRanks), artifacts: p.artifacts.filter((id) => u.artifacts.includes(id)).slice(0, u.artSlots),
        levels: p.levels, cleared: u.cleared, spells: spellbookOf(p, u), ultimates: u.ultimates, crowns: u.crowns, surges: u.surges
      });
      const local: Side[] = level.kind === "raid" ? ["atk"] : ["def"];
      // A new run of a scored mode takes the place of the one saved for it.
      const slot = runSlotOf(level) ?? undefined;
      if (slot) clearOcRun(slot);
      setNote(null);
      setNextLevel(null);
      replaceSession({
        key: Date.now(), driver: createLocalDriver(config, local, {}), level, restart: launch,
        slot, cards, hero: level.kind === "raid" ? undefined : u.heroes.includes(p.hero) ? p.hero : "catherine"
      });
      setScreen({ s: "play" });
    };
    launch();
  }, [progress, replaceSession]);

  // A Satchel item used in battle spends its copy from the save at once.
  const onBattleEvents = useCallback((events: readonly GarrisonEvent[]) => {
    for (const ev of events) if (ev.e === "item") update((p) => spendItem(p, ev.id));
  }, [update]);

  // The Daily Siege: today's orders, never the player's own unlocks.
  const startDaily = useCallback((daily: OcDaily) => {
    const launch = () => {
      clearOcRun("daily");
      setNote(null);
      setNextLevel(null);
      replaceSession({ key: Date.now(), driver: createLocalDriver(buildDailyConfig(daily), ["def"], {}), level: daily.level, restart: launch, daily, slot: "daily", hero: daily.hero });
      setScreen({ s: "play" });
    };
    launch();
  }, [replaceSession]);

  // Carry on a saved run where it was left (a new run of the same mode is what "Restart" then begins).
  const resumeRun = useCallback((saved: OcSavedRun) => {
    if (!canResumeOcRun(saved)) return;
    const daily = saved.slot === "daily" && saved.day ? ocDaily(saved.day) : undefined;
    // (The day's orders are rebuilt from the day: a save of other orders cannot be played on.)
    if (saved.slot === "daily" && daily?.setup !== saved.setup) return;
    const level = daily ? daily.level : findOcLevel(saved.levelId);
    if (!level) return;
    const state = saved.state;
    // Satchel items spent in other battles since the save are no longer there to use.
    const satchel = state.cfg.oc?.satchel;
    if (state.cfg.oc && satchel) {
      state.cfg.oc.satchel = satchel.map((entry) => ({
        ...entry, uses: Math.min(entry.uses, (state.def.satchelUsed?.[entry.id] ?? 0) + (isOcItem(entry.id) ? itemCount(progressRef.current, entry.id) : 0))
      }));
    }
    const local: Side[] = level.kind === "raid" ? ["atk"] : ["def"];
    const fresh = daily ? () => startDaily(daily) : () => start(level, saved.cards);
    setNote(null);
    setNextLevel(null);
    replaceSession({
      key: Date.now(), driver: createLocalDriver(state.cfg, local, {}, state), level, restart: fresh, daily,
      slot: saved.slot, cards: saved.cards, hero: saved.hero, resumed: true
    });
    setScreen({ s: "play" });
  }, [replaceSession, start, startDaily]);

  // Leaving a run before its end: it stays saved, and a siege keeps the wave it reached (its board best, Endless pay).
  const suspendRun = useCallback(() => {
    const current = sessionRef.current;
    if (!current?.slot) return;
    saveRun();
    const run: RunSoFar = { slot: current.slot, day: current.daily?.day, setup: current.daily?.setup, hero: current.hero, state: current.driver.state() };
    if (!run.state.outcome && siegeSummary(run)) update((p) => keepSiegeProgress(p, run));
  }, [saveRun, update]);

  /** A finished run's score panel: keeps the device's best for its board and posts to the tally board (`blocked`: why it can't). */
  const scorePanel = useCallback((run: OcRunSummary, blocked: string | null) => {
    const newBest = !blocked && isOcNewBest(progress, run);
    if (!blocked) update((p) => recordOcBest(p, run));
    const key = ocBestKey(run);
    return <OcRunScore blocked={blocked} cleared={unlocksOf(progress).cleared} newBest={newBest} onSent={(held) => update((p) => markOcBestSent(p, key, held))} run={run} />;
  }, [progress, update]);

  const onFinish = useCallback((result: GameResult) => {
    const level = sessionRef.current?.level;
    if (!level) return;
    // The run is over: nothing is left to play on.
    const slot = sessionRef.current?.slot;
    if (slot) {
      clearOcRun(slot);
      setSavedRuns(loadOcRuns());
    }
    const daily = sessionRef.current?.daily;
    if (daily) {
      const run = ocRunSummary(result.state, "daily", { day: daily.day, setup: daily.setup, hero: daily.hero });
      const words = pickUnlocked(isOcNewBest(progress, run) ? OC_SCORE_LINES.best : OC_SCORE_LINES.short, unlocksOf(progress).cleared);
      // The day's first Daily Siege run pays Crystals.
      const today = ocDayKey();
      const paid = progress.dailyCrystalsDay !== today;
      if (paid) update((p) => (p.dailyCrystalsDay === today ? p : { ...p, crystals: p.crystals + OC_CRYSTALS.daily, dailyCrystalsDay: today }));
      setNote(<>{words ? <AdvisorBubble compact line={words} /> : null}{paid ? <p className={oc.reward}><CrystalIcon /> +{OC_CRYSTALS.daily} Crystals (today&apos;s first Daily Siege)</p> : null}{scorePanel(run, null)}</>);
      return;
    }
    const stats = {
      lost: result.state.stats.lost,
      goldSpent: result.state.stats.goldSpent,
      // (A Champion a Phoenix Feather brought back to the gate still rode: it counts as used.)
      chargersUsed: result.state.chargers.filter((c) => c.dmg === undefined && (c.state !== "ready" || c.reborn)).length
    };
    if (level.kind === "raid") {
      if (result.winner !== "atk") return;
      const first = !progress.raids.includes(level.id);
      const ore = first ? 3 : replayOre(progress, 1);
      update((p) => {
        const paid = first ? 3 : replayOre(p, 1);
        const next = first ? p : countReplayOre(p, paid);
        return { ...next, raids: p.raids.includes(level.id) ? p.raids : [...p.raids, level.id], seals: p.seals + (first ? 4 : 1), ore: p.ore + paid, crystals: p.crystals + (first ? OC_CRYSTALS.raidFirst : 0) };
      });
      // The first win of a raid has its own words; later ones a cheer.
      const cheer = first ? OC_LEVEL_STORY[level.id]?.after ?? [] : [pickUnlocked(OC_BATTLE_QUIPS.victory, unlocksOf(progress).cleared)].filter((line): line is OcLine => line !== null);
      // Raids are fixed puzzles (no unlocks, Barracks levels or heroes involved), so a broken raid may go on its board —
      // unless the player's Portal raiders joined it.
      const run = ocRunSummary(result.state, "raid", { raid: level.id });
      const raiders = result.state.cfg.atkCards.some((kind) => progress.gacha.chaos.includes(kind) && !(level.atkCards ?? []).includes(kind));
      const raidBlocked = raiders ? "Your Summoning Portal raiders joined this raid, so it stays off the tally board (the boards compare the raid's own hand)." : null;
      setNote(<>{cheer.map((line, i) => <AdvisorBubble compact key={i} line={line} />)}<p className={oc.reward}>+{first ? 4 : 1} Seals · <OreIcon /> +{ore} Ore{!first && !ore ? " (replay Ore spent for today)" : ""}{first ? <> · <CrystalIcon /> +{OC_CRYSTALS.raidFirst} Crystals</> : null}</p>{scorePanel(run, raidBlocked)}</>);
      return;
    }
    if (level.kind === "endless") {
      const waves = result.state.director.wave;
      const gained = Math.max(0, Math.floor(waves / 5) - Math.floor(progress.bestEndless / 5));
      // Crystals for every new best tenth wave.
      const tens = Math.max(0, Math.floor(waves / 10) - Math.floor(progress.bestEndless / 10));
      update((p) => payEndless(p, waves));
      const words = pickUnlocked(waves > progress.bestEndless ? OC_ENDLESS_LINES.best : OC_ENDLESS_LINES.short, unlocksOf(progress).cleared);
      const heroes = unlocksOf(progress).heroes;
      const run = ocRunSummary(result.state, "endless", { hero: heroes.includes(progress.hero) ? progress.hero : "catherine" });
      // Endless runs use the player's own unlocks: a run with the testing unlock on stays off the boards.
      const blocked = progress.testAll ? "The testing unlock is on, so this run stays off the tally board (turn it off on the home screen)." : null;
      setNote(<>{words ? <AdvisorBubble compact line={words} /> : null}<p className={oc.reward}>{waves > progress.bestEndless ? `New best: wave ${waves}!` : `Best: wave ${progress.bestEndless}`}{gained ? ` · +${gained} Seals · +${gained} Ore` : ""}{tens ? ` · +${tens * OC_CRYSTALS.endlessTen} Crystals` : ""}</p>{scorePanel(run, blocked)}</>);
      return;
    }
    const goals = level.goals.map((goal, i) => ({ goal, i, met: result.winner === "def" && goalMet(goal, stats) }));
    if (result.winner !== "def") {
      const comfort = pickUnlocked(OC_BATTLE_QUIPS.defeat, unlocksOf(progress).cleared);
      setNote(
        <div className={oc.resultGoals}>
          {comfort ? <AdvisorBubble compact line={comfort} /> : null}
          {goals.map(({ goal, i }) => <span key={i}>☆ {goalText(goal)}</span>)}
          <small>Tip: glowing foes drop Surge orbs — click the orb button (or press G), then a unit, to unleash its Surge. Slain foes fill the Valor crown: press U and pick a unit to Ascend it.</small>
        </div>
      );
      return;
    }
    const first = !progress.cleared.includes(level.id);
    const before = progress.stars[level.id] ?? [];
    const fresh = goals.filter((g) => g.met && !before.includes(g.i)).map((g) => g.i);
    const seals = (first ? 3 : 1) + fresh.length * 2;
    // Ore for the Forge: 3 for a first victory (5 over a world boss), 1 for a replay, 1 for every new star.
    // (Replays pay at most OC_REPLAY_ORE_DAILY Ore a day between them.)
    const replay = first ? 0 : replayOre(progress, 1);
    const crystals = (first ? (level.kind === "boss" ? OC_CRYSTALS.bossClear : OC_CRYSTALS.firstClear) : 0) + fresh.length * OC_CRYSTALS.star;
    // A won battle may leave an item: always on a first victory, sometimes on a replay (while today's replay Ore lasts).
    const drop = first || replay > 0 ? battleDrop(Math.random(), Math.random(), { first, boss: level.kind === "boss" }) : null;
    const ore = (first ? (level.kind === "boss" ? 5 : 3) : replay) + fresh.length;
    const starsBefore = totalStars(progress.cleared, progress.stars);
    const starsAfter = starsBefore + (first ? 1 : 0) + fresh.length;
    const milestones = OC_STAR_MILESTONES.filter((m) => m.stars > starsBefore && m.stars <= starsAfter);
    update((p) => ({
      ...p,
      cleared: p.cleared.includes(level.id) ? p.cleared : [...p.cleared, level.id],
      stars: { ...p.stars, [level.id]: [...new Set([...(p.stars[level.id] ?? []), ...fresh])].sort() },
      seals: p.seals + seals,
      ore: p.ore + (first ? (level.kind === "boss" ? 5 : 3) : replayOre(p, 1)) + fresh.length,
      daily: first ? p.daily : countReplayOre(p, replayOre(p, 1)).daily,
      crystals: p.crystals + crystals,
      items: drop ? addItems(p, [drop]).items : p.items
    }));
    const reward = first ? level.reward : {};
    const index = OC_LEVELS.findIndex((entry) => entry.id === level.id);
    setNextLevel(OC_LEVELS[index + 1] ?? null);
    const words = first ? OC_LEVEL_STORY[level.id]?.after ?? [] : [pickUnlocked(OC_BATTLE_QUIPS.victory, unlocksOf(progress).cleared)].filter((line): line is OcLine => line !== null);
    setNote(
      <div className={oc.resultGoals}>
        {words.map((line, i) => <AdvisorBubble compact key={i} line={line} />)}
        <span className={oc.starOn}>★ Victory{first ? " (first clear)" : ""}</span>
        {goals.map(({ goal, i, met }) => (
          <span className={met ? oc.starOn : oc.starOff} key={i}>{met ? "★" : "☆"} {goalText(goal)}{fresh.includes(i) ? " — new!" : ""}</span>
        ))}
        <p className={oc.reward}>
          <Icon className={oc.inlineIcon} fallback="✦" src={ART.seal} /> +{seals} Seals · <OreIcon /> +{ore} Ore{!first && !replay ? " (replay Ore spent for today)" : ""}
          {crystals ? <> · <CrystalIcon /> +{crystals} Crystals</> : null}
        </p>
        {drop ? <p className={oc.reward}>Found: {OC_ITEMS[drop.id].name} ({OC_ITEMS[drop.id].rarity}) — in your Satchel</p> : null}
        {milestones.map((m) => <p className={oc.reward} key={m.stars}>★ {m.stars} stars: {m.label}!</p>)}
        {reward.units?.length ? <RecruitReveal kinds={reward.units} /> : null}
        {reward.hero || reward.artifact || reward.spell || reward.altar ? (
          <div className={styles.panel}>
            <h2>Unlocked</h2>
            <div className={styles.foes}>
              {reward.hero ? <div className={styles.foe}><img alt="" className={oc.portrait} src={assetUrl(OC_HEROES[reward.hero].portrait)} />Hero: {OC_HEROES[reward.hero].name}</div> : null}
              {reward.artifact ? <div className={styles.foe}><img alt="" className={oc.portrait} src={assetUrl(BLESSINGS[reward.artifact].icon)} />{BLESSINGS[reward.artifact].name}</div> : null}
              {reward.spell ? <div className={styles.foe}><img alt="" className={oc.portrait} src={assetUrl(SPELLS[reward.spell].icon)} />{SPELLS[reward.spell].name}</div> : null}
              {reward.altar ? <div className={styles.foe}><Icon className={oc.portrait} fallback="♛" src={ART.valor} />The Ascension Altar</div> : null}
            </div>
            {level.id === "w1-4" ? <p className={styles.note}>Artifact slot opened — equip one before battle.</p> : null}
            {reward.altar ? <p className={styles.note}>Train a unit to Lv {OC_ULT_LEVEL} in the Barracks to unlock its Ascended form. In battle, slain foes fill the Valor crown: press U (or the crown button) and pick a unit.</p> : null}
          </div>
        ) : null}
      </div>
    );
  }, [progress, update, scorePanel]);

  if (screen.s === "play" && session) {
    const level = session.level;
    const back: Screen = level.kind === "raid" ? { s: "raids" } : session.daily ? { s: "daily" } : level.kind === "endless" ? { s: "home" } : { s: "campaign", world: level.world };
    return (
      <div className={styles.shell} style={cursorVars}>
        <GarrisonGame
          advisor={level.kind === "raid" ? undefined : battleQuip}
          defColor={OC_LAWFUL_COLOR}
          music={battleMusicFor(level, !!session.daily)}
          driver={session.driver}
          hotseat={false}
          intro={session.resumed ? null : introFor(level, unlocks.cleared)}
          key={session.key}
          next={nextLevel ? { label: `Next: ${nextLevel.name}`, onNext: () => { replaceSession(null); setScreen({ s: "prep", level: nextLevel }); } } : null}
          onEvents={onBattleEvents}
          onFinish={onFinish}
          onLeave={() => { suspendRun(); replaceSession(null); setNote(null); setNextLevel(null); setSavedRuns(loadOcRuns()); setScreen(back); }}
          onRestart={session.restart}
          town="castle"
          unlockNote={note}
        />
      </div>
    );
  }

  // The title key art on the home screen, the war table everywhere else (the old backdrop underneath while they load).
  const backdrop = screen.s === "home" ? OC_UI.home : screen.s === "forge" ? OC_UI.forge : screen.s === "garden" ? OC_UI.garden : screen.s === "portal" ? OC_UI.portal : OC_UI.table;
  return (
    <div className={styles.shell} style={cursorVars}>
      <div className={`${styles.menu} ${oc.menu}`} style={{ backgroundImage: `url("${assetUrl(backdrop)}"), url("${assetUrl("/assets/tide/menu-backdrop.webp")}")` }}>
        {unlocks.test ? (
          <div className={oc.testBanner} role="status">
            <span>TESTING — everything is unlocked (your Seals, levels and records are unchanged).</span>
            <button className={styles.ghostButton} onClick={() => update((p) => ({ ...p, testAll: false }))} type="button">Turn off</button>
          </div>
        ) : null}
        {saveFailed ? (
          <div className={oc.testBanner} role="alert">
            <span>Your browser refused to save Order &amp; Chaos progress (storage blocked or full). Progress made now lasts only until you close this tab.</span>
          </div>
        ) : null}
        {screen.s === "home" ? (
          <Home
            onAbandon={abandonRun} onCalendar={() => setCalendar(true)} onPick={setScreen} onResume={resumeRun}
            onStory={() => setStory({ id: OC_PROLOGUE_ID, lines: OC_PROLOGUE })} progress={progress} saved={savedRuns} unlocks={unlocks} update={update}
          />
        ) : null}
        {screen.s === "journal" ? <Journal onBack={() => setScreen({ s: "home" })} onPlay={(entry) => setStory({ id: entry.id, lines: entry.lines, letter: entry.letter })} progress={progress} /> : null}
        {screen.s === "campaign" ? (
          <Campaign
            onBack={() => setScreen({ s: "home" })}
            onPick={(level) => setScreen({ s: "prep", level })}
            onStory={(world) => { const lines = OC_WORLD_STORY[world]; if (lines?.length) setStory({ id: `world:${world}`, lines }); }}
            onWorld={(world) => setScreen({ s: "campaign", world })}
            progress={progress}
            unlocks={unlocks}
            world={screen.world}
          />
        ) : null}
        {screen.s === "prep" && screen.level.kind === "endless" ? (
          <SavedRunCards note="Starting a new run ends this one." onAbandon={abandonRun} onResume={resumeRun} runs={savedRuns.filter((run) => run.slot === "endless")} />
        ) : null}
        {screen.s === "prep" ? (
          <Prep
            key={screen.level.id}
            level={screen.level}
            onBack={() => setScreen(screen.level.kind === "endless" ? { s: "home" } : { s: "campaign", world: screen.level.world })}
            onStart={(cards) => {
              update((p) => ({ ...p, loadouts: { ...p.loadouts, [screen.level.id]: cards } }));
              start(screen.level, cards);
            }}
            onTalk={() => setStory(levelStory(screen.level))}
            progress={progress}
            unlocks={unlocks}
            update={update}
          />
        ) : null}
        {screen.s === "raids" ? (
          <Raids
            onBack={() => setScreen({ s: "home" })}
            onPick={(level) => {
              // A raid left mid-way carries on where it was.
              const saved = savedRuns.find((run) => run.slot === `raid:${level.id}` && canResumeOcRun(run));
              if (saved) {
                resumeRun(saved);
                return;
              }
              // A raid's briefing plays once, then the raid begins.
              const talk = levelStory(level, progress.seen);
              if (talk) setStory({ ...talk, then: () => start(level, []) });
              else start(level, []);
            }}
            progress={progress}
            unlocks={unlocks}
          />
        ) : null}
        {screen.s === "barracks" ? <Barracks onBack={() => setScreen({ s: "home" })} progress={progress} unlocks={unlocks} update={update} /> : null}
        {screen.s === "forge" ? <ForgeScreen cleared={unlocks.cleared} heroes={unlocks.heroes} onBack={() => setScreen({ s: "home" })} progress={progress} update={update} /> : null}
        {screen.s === "garden" ? <GardenScreen cleared={unlocks.cleared} onBack={() => setScreen({ s: "home" })} progress={progress} update={update} /> : null}
        {screen.s === "portal" ? <PortalScreen onBack={() => setScreen({ s: "home" })} progress={progress} update={update} /> : null}
        {screen.s === "satchel" ? <SatchelScreen onBack={() => setScreen({ s: "home" })} onGarden={() => setScreen({ s: "garden" })} progress={progress} update={update} /> : null}
        {calendar && screen.s !== "play" ? <AttendanceDialog onClose={() => setCalendar(false)} progress={progress} update={update} /> : null}
        {screen.s === "camp" ? <Camp onBack={() => setScreen({ s: "home" })} progress={progress} unlocks={unlocks} update={update} /> : null}
        {screen.s === "almanac" ? <Almanac onBack={() => setScreen({ s: "home" })} unlocks={unlocks} /> : null}
        {screen.s === "lab" ? <HybridLab onBack={() => setScreen({ s: "home" })} progress={progress} unlocks={unlocks} /> : null}
        {screen.s === "daily" ? (
          <SavedRunCards note="Starting a new run ends this one." onAbandon={abandonRun} onResume={resumeRun} runs={savedRuns.filter((run) => run.slot === "daily")} />
        ) : null}
        {screen.s === "daily" ? (
          <OcDailyScreen
            cleared={unlocks.cleared}
            onBack={() => setScreen({ s: "home" })}
            onBoard={() => setScreen({ s: "tally", mode: "daily" })}
            onStart={startDaily}
            onTalk={() => setStory(levelStory(OC_DAILY_LEVEL))}
            progress={progress}
          />
        ) : null}
        {screen.s === "tally" ? (
          <OcTallyBoard cleared={unlocks.cleared} initialMode={screen.mode} key={screen.mode ?? "endless"} onBack={() => setScreen({ s: "home" })} progress={progress} update={update} />
        ) : null}
      </div>
      {shownStory ? null : <SettingsButton className="optionsCornerButton" compact />}
      {shownStory ? <StoryScene key={shownStory.id} letter={shownStory.letter} lines={shownStory.lines} onDone={() => endStory(shownStory)} /> : null}
    </div>
  );
}

/** Life in the title painting: embers off the campfire, its flicker, and the lich tower's pulse (decoration only). */
const EMBERS = Array.from({ length: 16 }, (_, i) => ({ left: 3 + ((i * 37) % 22), delay: (i * 0.73) % 6, dur: 5 + ((i * 1.9) % 4), drift: ((i * 29) % 40) - 20 }));

/** Can a saved run be played on here (this simulation wrote it; a Daily Siege's orders are still the same)? */
function playableRun(run: OcSavedRun): boolean {
  if (!canResumeOcRun(run)) return false;
  if (run.slot === "daily") return !!run.day && ocDaily(run.day).setup === run.setup;
  return !!findOcLevel(run.levelId);
}

/**
 * Runs left mid-way (lib/order-chaos-runs.ts): where each stands, Continue to play on from there, or
 * Abandon it. What a siege reached is already on its tally board either way.
 */
function SavedRunCards({ runs, onResume, onAbandon, note }: {
  runs: readonly OcSavedRun[];
  onResume(run: OcSavedRun): void;
  onAbandon(run: OcSavedRun): void;
  /** A word under each (e.g. that a new run replaces it). */
  note?: string;
}) {
  if (runs.length === 0) return null;
  return (
    <>
      {runs.map((run) => {
        const raid = run.slot.startsWith("raid:");
        const playable = playableRun(run);
        const title = run.slot === "endless" ? "Endless Siege" : run.slot === "daily" ? `Daily Siege · ${run.day ?? ""}` : `Chaos Raid · ${findOcLevel(run.levelId)?.name ?? run.levelId}`;
        const where = raid ? `${ocRunTime(run.ticks)} into the raid` : `Wave ${run.wave} · ${run.kills} foe${run.kills === 1 ? "" : "s"} slain`;
        return (
          <div aria-label={`Saved run: ${title}`} className={`${oc.nextCard} ${oc.continueCard}`} key={run.slot} role="group">
            <span className={oc.nextArt}>
              <img alt="" className={oc.savedArt} src={assetUrl(run.slot === "endless" ? ART.endless : run.slot === "daily" ? ART.daily : ART.raids)} />
            </span>
            <span className={oc.nextText}>
              <small>Saved run · {savedAgo(run.savedAt)}</small>
              <strong>{title}</strong>
              <span className={oc.nextPrize}>
                {where}
                {!playable ? " — saved by an older version of the game: it can't be played on." : note ? ` — ${note}` : ""}
              </span>
            </span>
            {playable ? <button className={oc.playPill} onClick={() => onResume(run)} type="button">Continue ▸</button> : null}
            <button
              className={styles.ghostButton}
              onClick={() => onAbandon(run)}
              title={raid ? "Give up this raid (only a broken raid goes on the tally board)." : "Give up this run (the wave it reached stays on your tally board)."}
              type="button"
            >
              {playable ? "Abandon" : "Dismiss"}
            </button>
          </div>
        );
      })}
    </>
  );
}

function HomeAmbience() {
  return (
    <div aria-hidden className={oc.ambience}>
      <span className={oc.fireGlow} />
      <span className={oc.lichGlow} />
      {EMBERS.map((e, i) => (
        <span className={oc.ember} key={i} style={{ left: `${e.left}%`, animationDelay: `${e.delay}s`, animationDuration: `${e.dur}s`, ["--drift" as string]: `${e.drift}px` }} />
      ))}
    </div>
  );
}

function Home({ onPick, onStory, onCalendar, onResume, onAbandon, saved, progress: p, unlocks: u, update }: {
  onPick(next: Screen): void;
  onResume(run: OcSavedRun): void;
  onAbandon(run: OcSavedRun): void;
  saved: readonly OcSavedRun[];
  onCalendar(): void;
  onStory(): void;
  progress: OcProgress;
  unlocks: Unlocks;
  update(change: (p: OcProgress) => OcProgress): void;
}) {
  const totalStarCount = totalStars(p.cleared, p.stars);
  const lastWorld = OC_WORLDS.find((world) => !worldCleared(world.id, u.cleared))?.id ?? OC_WORLDS.length;
  const endless = endlessOpen(u.cleared);
  const dailyBest = p.bests[`daily:${ocDayKey()}`];
  const raids = OC_RAIDS.some((raid) => raidOpen(raid, u.cleared));
  const next = nextLevelOf(u.cleared);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
  const [resetting, setResetting] = useState(false);
  // The painted plank and ribbon the purse and the tile groups are framed with.
  const homeArt = { ["--oc-tray" as string]: `url("${assetUrl(OC_UI.tray)}")`, ["--oc-banner" as string]: `url("${assetUrl(OC_UI.banner)}")` };
  const submitCode = () => {
    if (code === TEST_PASSWORD) {
      update((prev) => ({ ...prev, testAll: true }));
      setAsking(false);
      setCode("");
      setWrong(false);
    } else {
      setWrong(true);
    }
  };
  return (
    <>
      <HomeAmbience />
      <header className={oc.homeTop} style={homeArt}>
        <div className={styles.menuHead}>
          <div>
            <h1>Order &amp; Chaos</h1>
            <p className={oc.homeBlurb}>The Lawful hold the realm; the Chaos horde comes to break it. Raise troops, gather Surge orbs, earn Valor to Ascend your champions, recruit heroes, mercenaries and artifacts, and hold the line across ten worlds.</p>
          </div>
        </div>
        <div className={oc.homeSide}>
          {/* Everything the player owns, on one plank. */}
          <div aria-label="Your purse" className={oc.wallet} role="group">
            <span className={oc.purse} title="Seals: spend them in the Barracks and the Mercenary Camp">
              <Icon className={oc.inlineIcon} fallback="✦" src={ART.seal} /> {p.seals}
            </span>
            <Materials progress={p} />
            <CrystalPurse progress={p} />
            <button className={`${oc.backButton} ${oc.walletDaily} ${attendanceOpen(p) ? oc.walletDailyReady : ""}`} onClick={onCalendar} title={attendanceOpen(p) ? "Today's daily reward is waiting: claim it" : "The daily rewards calendar"} type="button">
              Daily rewards{attendanceOpen(p) ? <b className={oc.walletPing} title="A reward is waiting"> ★</b> : null}
            </button>
          </div>
          <div aria-label="Story" className={oc.storyCluster} role="group">
            <span className={oc.clusterLabel}>Story</span>
            <button className={oc.storyButton} onClick={onStory} title="Hear Crag Hack's tale again" type="button">
              <img alt="" className={oc.storyFace} src={assetUrl("/assets/order-chaos/story/crag-talk.webp")} />
              Crag&apos;s tale
            </button>
            <button className={oc.storyButton} onClick={() => onPick({ s: "journal" })} title="Reread every scene you have reached so far" type="button">
              <img alt="" className={oc.storyFace} src={assetUrl("/assets/order-chaos/story/crag-grin.webp")} />
              Story so far
            </button>
          </div>
        </div>
      </header>
      {p.seen.includes(OC_PROLOGUE_ID) ? <Greeting cleared={u.cleared} place="home" /> : null}
      <SavedRunCards onAbandon={onAbandon} onResume={onResume} runs={saved} />
      {next ? (
        <button className={`${oc.nextCard} ${oc.continueCard}`} onClick={() => onPick({ s: "prep", level: next })} type="button">
          <span className={oc.nextArt}>
            {next.featured || next.boss ? <AttackerArt kind={next.boss ? "dracolich" : next.featured!} size={64} /> : <DefenderArt kind="oc-longbow" size={64} />}
          </span>
          <span className={oc.nextText}>
            <small>{p.cleared.length ? "Continue the campaign" : "Begin the campaign"}</small>
            <strong>{levelCode(next)} · {next.name}</strong>
            {rewardText(next) ? <span className={oc.nextPrize}><RewardBadge level={next} size={26} /> Wins you: {rewardText(next)}</span> : null}
          </span>
          <span className={oc.playPill}>Play ▸</span>
        </button>
      ) : null}
      <div className={oc.homeGroups} style={homeArt}>
        <section aria-labelledby="oc-home-battle" className={`${oc.homeGroup} ${oc.groupBattle}`}>
          <h2 className={oc.groupHead} id="oc-home-battle"><span>Battle</span></h2>
          <div className={oc.groupTiles}>
            <button aria-label="Campaign" className={`${styles.artMode} ${oc.tilePrimary}`} onClick={() => onPick({ s: "campaign", world: lastWorld })} title="Ten worlds of the Chaos invasion. Every victory recruits new troops, heroes, artifacts or spells." type="button">
              <ArtFace label="Campaign" src={ART.campaign} />
              <small>★ {totalStarCount} / {OC_LEVELS.length * 3}</small>
            </button>
            <button
              aria-label="Endless Siege"
              className={styles.artMode}
              disabled={!endless}
              onClick={() => onPick({ s: "prep", level: OC_ENDLESS })}
              title={endless ? "The horde never ends. Choose an artifact after every great assault." : "Opens after the first world."}
              type="button"
            >
              <ArtFace label="Endless Siege" src={ART.endless} />
              <small>{endless ? (p.bestEndless ? `Best: wave ${p.bestEndless}` : " ") : "Locked"}</small>
            </button>
            <button
              aria-label="Daily Siege"
              className={styles.artMode}
              disabled={!endless}
              onClick={() => onPick({ s: "daily" })}
              title={endless ? "Today's orders, the same for every player: loaned troops, one road, one horde. Compare your score on the tally board." : "Opens after the first world."}
              type="button"
            >
              <ArtFace label="Daily Siege" src={ART.daily} />
              <small>{endless ? (dailyBest ? `Today: wave ${dailyBest.wave}` : "New orders every day") : "Locked"}</small>
            </button>
            <button
              aria-label="Chaos Raids"
              className={styles.artMode}
              disabled={!raids}
              onClick={() => onPick({ s: "raids" })}
              title={raids ? "Command the Chaos horde against a prepared Lawful line." : "Opens after the first world."}
              type="button"
            >
              <ArtFace label="Chaos Raids" src={ART.raids} />
              <small>{raids ? `${p.raids.length} / ${OC_RAIDS.length}` : "Locked"}</small>
            </button>
            <button aria-label="Tally Board" className={styles.artMode} onClick={() => onPick({ s: "tally" })} title="The tally boards: Endless Siege, Daily Siege and Chaos Raids, today and all-time." type="button">
              <ArtFace label="Tally Board" src={ART.tally} />
              <small>Tally board</small>
            </button>
          </div>
        </section>
        <section aria-labelledby="oc-home-army" className={`${oc.homeGroup} ${oc.groupArmy}`}>
          <h2 className={oc.groupHead} id="oc-home-army"><span>Your army</span></h2>
          <div className={oc.groupTiles}>
            <button aria-label="Barracks" className={styles.artMode} onClick={() => onPick({ s: "barracks" })} title="Train your troops with Seals — level 3 unlocks a unit's Ascension." type="button">
              <ArtFace label="Barracks" src={ART.barracks} />
              <small>{p.seals} Seals</small>
            </button>
            <button
              aria-label="Mercenary Camp"
              className={styles.artMode}
              disabled={!u.camp}
              onClick={() => onPick({ s: "camp" })}
              title={u.camp ? "Hire troops from other towns — even Nighon's — with Seals." : "Opens after the second world."}
              type="button"
            >
              <ArtFace label="Mercenaries" src={ART.camp} />
              <small>{u.camp ? `${OC_MERCENARIES.filter((m) => u.units.includes(m.kind)).length} / ${OC_MERCENARIES.length}` : "Locked"}</small>
            </button>
            <button aria-label="Hybrid Lab" className={styles.artMode} onClick={() => onPick({ s: "lab" })} title="Every fusion recipe: which two troops fuse into which hybrid, which you can make now, and which are still to discover." type="button">
              <ArtFace label="Hybrid Lab" src={ART.hybrids} />
              <small>{HYBRIDS.filter((kind) => hybridKnown(kind, u.units)).length} / {HYBRIDS.length} known</small>
            </button>
            <button aria-label="Summoning Portal" className={styles.artMode} onClick={() => onPick({ s: "portal" })} title="Summon troops, Chaos raiders, artifacts, a hero and items with Crystals — R, SR, SSR and UR prizes." type="button">
              <ArtFace label="Summoning Portal" src={ART.portal} />
              <small><CrystalIcon /> {p.crystals}{p.items["summon-ticket"] ? ` · ${p.items["summon-ticket"]} ticket${p.items["summon-ticket"] === 1 ? "" : "s"}` : ""}</small>
            </button>
            <button aria-label="Satchel" className={styles.artMode} onClick={() => onPick({ s: "satchel" })} title="Your items: battle boosts, resources, potions, tickets." type="button">
              <ArtFace label="Satchel" src={ART.satchel} />
              <small>{satchelCount(p)} item{satchelCount(p) === 1 ? "" : "s"}</small>
            </button>
            <button aria-label="Almanac" className={styles.artMode} onClick={() => onPick({ s: "almanac" })} title="Every Lawful unit, hybrid and Surge, every Chaos creature met, heroes, artifacts and spells." type="button">
              <ArtFace label="Almanac" src={ART.almanac} />
              <small>{" "}</small>
            </button>
          </div>
        </section>
        <section aria-labelledby="oc-home-workshops" className={`${oc.homeGroup} ${oc.groupWorkshops}`}>
          <h2 className={oc.groupHead} id="oc-home-workshops"><span>Workshops</span></h2>
          <div className={oc.groupTiles}>
            <button
              aria-label="The Forge"
              className={styles.artMode}
              disabled={heroRankCap(u.cleared) <= 1}
              onClick={() => onPick({ s: "forge" })}
              title={heroRankCap(u.cleared) > 1 ? "Forge your heroes' ranks with Ore and Gems: heat, hammer and quench the blade yourself." : "Opens after the first world."}
              type="button"
            >
              <ArtFace label="The Forge" src={ART.forge} />
              <small>{heroRankCap(u.cleared) > 1 ? `${OC_HERO_ORDER.filter((id) => u.heroes.includes(id) && heroRankOf(id, p.heroRanks) >= OC_HERO_MAX_RANK).length} / ${u.heroes.length} heroes at full rank` : "Locked"}</small>
            </button>
            <button
              aria-label="Magic Garden"
              className={styles.artMode}
              disabled={!gardenOpen(u.cleared)}
              onClick={() => onPick({ s: "garden" })}
              title={gardenOpen(u.cleared) ? "Grow Gems in real time: sow, water every stage, harvest." : "Opens after the first world's third battle."}
              type="button"
            >
              <ArtFace label="Magic Garden" src={ART.garden} />
              <small>{gardenOpen(u.cleared) ? gardenStatus(p, u.cleared) : "Locked"}</small>
            </button>
          </div>
        </section>
      </div>
      <nav aria-label="Leave Order & Chaos" className={oc.homeFoot}>
        <Link aria-label="Garrison Wars" className={styles.artMode} href="/garrison" title="Garrison Wars, the faction duel: every town defends a castle or marches on one — against the computer, on one screen or online.">
          <ArtFace label="Garrison Wars" src={ART.versus} />
          <small>Faction duels</small>
        </Link>
        <Link aria-label="Back" className={styles.artMode} href="/menu?view=singlePlayer">
          <ArtFace label="Back" src={ART.back} />
          <small>{" "}</small>
        </Link>
      </nav>
      <div className={oc.testRow}>
        {resetting ? (
          <div aria-label="Start over" className={oc.testForm} role="alertdialog">
            <span>Erase ALL Order &amp; Chaos progress (levels, stars, Seals, training, heroes, story) and start again from the prologue?</span>
            <button className={styles.primary} onClick={() => { setResetting(false); update(() => emptyOcProgress()); }} type="button">Yes, start over</button>
            <button className={styles.ghostButton} onClick={() => setResetting(false)} type="button">Cancel</button>
          </div>
        ) : (
          <button className={oc.testLink} onClick={() => setResetting(true)} type="button">Start over (erase all progress)…</button>
        )}
      </div>
      {!u.test ? (
        <div className={oc.testRow}>
          {asking ? (
            <form className={oc.testForm} onSubmit={(event) => { event.preventDefault(); submitCode(); }}>
              <label htmlFor="oc-test-code">Testing password</label>
              <input autoComplete="off" autoFocus id="oc-test-code" inputMode="numeric" onChange={(event) => { setCode(event.target.value); setWrong(false); }} type="password" value={code} />
              <button className={styles.primary} type="submit">Unlock all</button>
              <button className={styles.ghostButton} onClick={() => { setAsking(false); setCode(""); setWrong(false); }} type="button">Cancel</button>
              {wrong ? <small className={oc.testWrong}>Wrong password.</small> : null}
            </form>
          ) : (
            <button className={oc.testLink} onClick={() => setAsking(true)} type="button">Testing: unlock everything…</button>
          )}
        </div>
      ) : null}
    </>
  );
}

/** The Magic Garden tile's line: how many plots are ripe or still free. */
function gardenStatus(p: OcProgress, cleared: readonly string[]): string {
  const now = Date.now();
  const plots = Array.from({ length: gardenPlots(cleared) }, (_, i) => p.garden[i] ?? null);
  const ripe = plots.filter((plant) => plant && isRipe(plant, now)).length;
  const free = plots.filter((plant) => !plant).length;
  return ripe ? `${ripe} ready to harvest!` : free ? `${free} plot${free === 1 ? "" : "s"} free` : "Growing…";
}

/** What a level hands out on its first clear, in words ("" when nothing). */
function rewardText(level: OcLevel): string {
  const r = level.reward;
  return [
    ...(r.units ?? []).map((kind) => DEFENDERS[kind]?.name ?? kind),
    r.hero ? `Hero ${OC_HEROES[r.hero].name}` : "",
    r.artifact ? BLESSINGS[r.artifact].name : "",
    r.spell ? `Spell: ${SPELLS[r.spell].name}` : "",
    r.altar ? "The Ascension Altar" : ""
  ].filter(Boolean).join(" · ");
}

/** The first-clear prize as a small picture: the carrot hanging over each level on the map. */
function RewardBadge({ level, size = 30 }: { level: OcLevel; size?: number }) {
  const r = level.reward;
  const text = rewardText(level);
  if (!text) return null;
  const unit = r.units?.[0];
  const src = r.hero ? OC_HEROES[r.hero].portrait : r.artifact ? BLESSINGS[r.artifact].icon : r.spell ? SPELLS[r.spell].icon : null;
  return (
    <span className={oc.rewardBadge} title={`First clear: ${text}`}>
      {unit ? <DefenderArt kind={unit} size={size} /> : src ? <img alt="" src={assetUrl(src)} /> : <Icon className={oc.inlineIcon} fallback="♛" src={ART.valor} />}
    </span>
  );
}

/** The next campaign level waiting to be won (null once all are cleared). */
function nextLevelOf(cleared: readonly string[]): OcLevel | null {
  return OC_LEVELS.find((level) => !cleared.includes(level.id) && isLevelOpen(level.id, cleared)) ?? null;
}

/** "3-2" for a campaign level. */
function levelCode(level: OcLevel): string {
  const world = OC_WORLDS.find((entry) => entry.id === level.world);
  const i = world ? world.levels.findIndex((entry) => entry.id === level.id) : -1;
  return i >= 0 ? `${level.world}-${i + 1}` : level.name;
}

/** Star rewards as a road: filled up to the stars earned, a pip per reward, and how far the next one is. */
function StarTrack({ stars }: { stars: number }) {
  const max = OC_STAR_MILESTONES[OC_STAR_MILESTONES.length - 1]?.stars ?? 1;
  const next = OC_STAR_MILESTONES.find((m) => m.stars > stars);
  return (
    <div className={oc.track}>
      <div className={oc.trackHead}>
        <strong>Star rewards</strong>
        <span>{next ? <>{next.stars - stars} more <span className={oc.starOn}>★</span> → {next.label}</> : "Every star reward earned!"}</span>
      </div>
      <div className={oc.trackBar}>
        <span className={oc.trackFill} style={{ width: `${Math.min(100, (stars / max) * 100)}%` }} />
        {OC_STAR_MILESTONES.map((m) => (
          <span className={`${oc.pip} ${stars >= m.stars ? oc.pipOn : ""}`} key={m.stars} style={{ left: `${(m.stars / max) * 100}%` }} title={`${m.stars} stars: ${m.label}`}>
            <b>{m.stars}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Campaign({ world, progress, unlocks: u, onPick, onWorld, onBack, onStory }: {
  world: number;
  onStory(world: number): void;
  progress: OcProgress;
  unlocks: Unlocks;
  onPick(level: OcLevel): void;
  onWorld(world: number): void;
  onBack(): void;
}) {
  const current = OC_WORLDS.find((entry) => entry.id === world) ?? OC_WORLDS[0]!;
  const starCount = totalStars(progress.cleared, progress.stars);
  const next = nextLevelOf(u.cleared);
  const clearedHere = current.levels.filter((level) => progress.cleared.includes(level.id)).length;
  const art = (src: string) => `url("${assetUrl(src)}")`;
  return (
    <>
      <div className={oc.campHead}>
        <button className={oc.backButton} onClick={onBack} type="button">‹ Back</button>
        <h1 className={oc.titleBanner} style={{ ["--oc-banner" as string]: art(OC_UI.banner) }}><span>Campaign</span></h1>
        <div className={oc.tally}>
          <span title="Stars earned"><span className={oc.starOn}>★</span> {starCount}</span>
          <span title="Seals"><Icon className={oc.inlineIcon} fallback="✦" src={ART.seal} /> {progress.seals}</span>
        </div>
      </div>

      <div aria-label="Worlds" className={oc.worldStrip} role="tablist">
        {OC_WORLDS.map((entry) => {
          const open = entry.id === 1 || worldCleared(entry.id - 1, u.cleared);
          const stars = entry.levels.reduce((sum, level) => sum + starsOf(progress, level), 0);
          const done = entry.levels.every((level) => progress.cleared.includes(level.id));
          return (
            <button
              aria-selected={entry.id === current.id}
              className={`${oc.worldCard} ${entry.id === current.id ? oc.worldCardOn : ""} ${done ? oc.worldCardDone : ""}`}
              disabled={!open}
              key={entry.id}
              onClick={() => onWorld(entry.id)}
              role="tab"
              title={open ? entry.blurb : `Clear ${OC_WORLDS[entry.id - 2]?.name ?? "the previous world"} first.`}
              type="button"
            >
              <span className={oc.worldThumb} style={{ backgroundImage: art(entry.art) }} />
              <b className={oc.worldNum}>{entry.id}</b>
              <span className={oc.worldName}>{entry.name}</span>
              <span className={oc.worldStars}>
                {open ? (
                  <>
                    <span className={oc.worldBar}><span style={{ width: `${(stars / (entry.levels.length * 3)) * 100}%` }} /></span>
                    <small>★ {stars}/{entry.levels.length * 3}</small>
                  </>
                ) : <small>Locked</small>}
              </span>
            </button>
          );
        })}
      </div>

      <section className={oc.mapStage}>
        <header className={oc.mapHead}>
          <div>
            <h2>{current.name}</h2>
            <p>{current.blurb}</p>
          </div>
          <span className={oc.mapCount}>{clearedHere} / {current.levels.length} won</span>
          {OC_WORLD_STORY[current.id]?.length ? (
            <button className={oc.storyButton} onClick={() => onStory(current.id)} title="Hear this world's story again" type="button">
              <img alt="" className={oc.storyFace} src={assetUrl("/assets/order-chaos/story/crag-talk.webp")} />
              World story
            </button>
          ) : null}
        </header>
        {/* The world map: its painting in a carved frame, a road, and a medallion per level along it. */}
        <div className={oc.mapFrame} style={{ ["--oc-frame" as string]: art(OC_UI.mapFrame) }}>
          <div
            className={oc.map}
            style={{
              backgroundImage: art(current.art),
              ["--oc-medal" as string]: art(OC_UI.medal),
              ["--oc-medal-boss" as string]: art(OC_UI.medalBoss),
              ["--oc-medal-locked" as string]: art(OC_UI.medalLocked)
            }}
          >
            <svg aria-hidden className={oc.mapRoad} preserveAspectRatio="none" viewBox="0 0 100 100">
              <path d={mapRoad(current.levels.length)} />
            </svg>
            {current.levels.map((level, i) => {
              const open = isLevelOpen(level.id, u.cleared);
              const cleared = progress.cleared.includes(level.id);
              const spot = mapSpot(i, current.levels.length);
              const boss = level.kind === "boss" || level.boss !== undefined;
              return (
                <button
                  aria-label={`${current.id}-${i + 1}. ${level.name}${open ? "" : " (locked)"}`}
                  className={`${oc.node} ${cleared ? oc.nodeCleared : ""} ${open && !cleared ? oc.nodeNext : ""} ${boss ? oc.nodeBoss : ""} ${open ? "" : oc.nodeLocked}`}
                  disabled={!open}
                  key={level.id}
                  onClick={() => onPick(level)}
                  style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                  title={open ? level.brief : "Clear the level before it first."}
                  type="button"
                >
                  <span className={oc.medal}>
                    {level.featured || level.boss ? <AttackerArt kind={level.boss ? "dracolich" : level.featured!} size={54} /> : <DefenderArt kind="oc-longbow" size={54} />}
                    <b className={oc.nodeNum}>{current.id}-{i + 1}</b>
                    {!cleared ? <RewardBadge level={level} /> : null}
                  </span>
                  <span className={oc.nodeLabel}>
                    <strong>{level.name}</strong>
                    <small>
                      {KIND_LABEL[level.kind] ? <em className={oc.badge}>{KIND_LABEL[level.kind]}</em> : null}
                      {open ? (level.boss ? "Boss battle" : `${level.waves} waves`) : "Locked"}
                    </small>
                    <Stars count={starsOf(progress, level)} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className={oc.campFoot}>
        {next ? (
          <button className={oc.nextCard} onClick={() => onPick(next)} type="button">
            <span className={oc.nextArt}>
              {next.featured || next.boss ? <AttackerArt kind={next.boss ? "dracolich" : next.featured!} size={64} /> : <DefenderArt kind="oc-longbow" size={64} />}
            </span>
            <span className={oc.nextText}>
              <small>Next battle</small>
              <strong>{levelCode(next)} · {next.name}</strong>
              {rewardText(next) ? <span className={oc.nextPrize}><RewardBadge level={next} size={26} /> Wins you: {rewardText(next)}</span> : null}
            </span>
            <span className={oc.playPill}>Play ▸</span>
          </button>
        ) : (
          <div className={oc.nextCard}><span className={oc.nextText}><small>Campaign</small><strong>Every battle won. Try the Endless Siege!</strong></span></div>
        )}
        <StarTrack stars={starCount} />
      </div>
    </>
  );
}

function Prep({ level, progress, unlocks: u, update, onStart, onBack, onTalk }: {
  level: OcLevel;
  onTalk(): void;
  progress: OcProgress;
  unlocks: Unlocks;
  update(change: (p: OcProgress) => OcProgress): void;
  onStart(cards: DefKind[]): void;
  onBack(): void;
}) {
  const units = u.units;
  const slots = u.seedSlots;
  const hero = OC_HEROES[u.heroes.includes(progress.hero) ? progress.hero : "catherine"];
  const artifacts = u.artifacts;
  const artSlots = u.artSlots;
  const equipped = progress.artifacts.filter((id) => artifacts.includes(id)).slice(0, artSlots);
  const saved = (progress.loadouts[level.id] ?? []).filter((kind) => units.includes(kind));
  const [hand, setHand] = useState<DefKind[]>(() => (saved.length ? saved.slice(0, slots) : defaultHand(units, slots)));
  const conveyor = level.kind === "conveyor";
  // (A world boss leads the list; it never comes to Endless.)
  const foes = level.kind === "endless" ? metEnemies(u.cleared).filter((kind) => !ENEMIES[kind]?.structure && !ENEMIES[kind]?.boss) : [...new Set([...(level.warboss ? [level.warboss] : []), ...level.enemies])];
  // Foes the player has not met in a cleared level yet (besides the featured one): flagged new, with their rule.
  const metBefore = new Set(metEnemies(u.cleared.filter((id) => id !== level.id)));
  const freshFoes = level.kind === "endless" ? [] : foes.filter((kind) => kind !== level.featured && !metBefore.has(kind));
  // Foes that stop short to shoot: the scouts advise a counter (and say what happens if nothing answers them).
  const standoffs = level.kind === "raid" ? [] : foes.filter((kind) => ENEMIES[kind]?.ranged && !ENEMIES[kind]!.siege);
  const book = spellbookOf(progress, u);
  // While the player chooses, warm the battle's creature atlases (decoded off the main
  // thread): the scouted foes stand in the intro line-up and the hand is on the lawn
  // moments after "Let's fight!". Endless (every foe met) is left to load on sight, as in battle.
  const warmKey = [...(level.kind === "endless" ? [] : foes.slice(0, 30)).map((kind) => ENEMIES[kind]?.sprite), ...hand.map((kind) => DEFENDERS[kind]?.sprite)].filter(Boolean).join(",");
  useEffect(() => {
    if (!warmKey) return;
    // (After the screen's own portraits have had their turn.)
    const timer = window.setTimeout(() => preloadSprites(warmKey.split(",")), 900);
    return () => window.clearTimeout(timer);
  }, [warmKey]);
  const cleared = progress.cleared.includes(level.id);
  const met = progress.stars[level.id] ?? [];
  // Hybrids the player can make, the ones whose two halves are both in the hand first.
  const knownHybrids = HYBRIDS.filter((kind) => hybridKnown(kind, units))
    .map((kind) => ({ kind, inHand: hybridKnown(kind, hand) }))
    .sort((x, y) => Number(y.inHand) - Number(x.inHand));
  const toggle = (kind: DefKind) => setHand((current) => (current.includes(kind) ? current.filter((k) => k !== kind) : current.length < slots ? [...current, kind] : current));
  const toggleArtifact = (id: BlessingId) => update((p) => {
    const on = p.artifacts.filter((a) => artifacts.includes(a)).slice(0, artSlots);
    if (on.includes(id)) return { ...p, artifacts: on.filter((a) => a !== id) };
    if (on.length >= artSlots) return p;
    return { ...p, artifacts: [...on, id] };
  });
  const toggleSpell = (id: SpellId) => update((p) => {
    const on = spellbookOf(p, unlocksOf(p));
    // An empty book falls back to the first spells found, so the last one stays packed.
    if (on.includes(id)) return on.length > 1 ? { ...p, spellbook: on.filter((s) => s !== id) } : p;
    if (on.length >= OC_SPELLBOOK_SIZE) return p;
    return { ...p, spellbook: [...on, id] };
  });
  const art = (src: string) => `url("${assetUrl(src)}")`;
  const sceneVars = Object.fromEntries(CARD_SCENES.map((scene) => [`--oc-scene-${scene}`, art(cardSceneSrc(scene))]));
  const story = OC_LEVEL_STORY[level.id];
  // The scene's last spoken line is the reminder on this screen (narration never shows in a bubble).
  const reminder = [...(story?.before ?? [])].reverse().find((line): line is OcLine => !isNarration(line));
  return (
    <div className={oc.prep} style={{ ["--oc-packet" as string]: art(OC_UI.packet), ["--oc-tray" as string]: art(OC_UI.tray), ...sceneVars }}>
      <div className={oc.campHead}>
        <button className={oc.backButton} onClick={onBack} type="button">‹ Back</button>
        <h1 className={oc.titleBanner} style={{ ["--oc-banner" as string]: art(OC_UI.banner) }}><span>{level.name}</span></h1>
        <div className={oc.tally}>
          {level.world > 0 ? <span>{levelCode(level)}</span> : null}
          {KIND_LABEL[level.kind] ? <span className={oc.kindTag}>{KIND_LABEL[level.kind]}</span> : null}
        </div>
      </div>
      <p className={oc.prepBrief}>{level.brief}</p>
      {story?.before?.length || story?.letter ? (
        <div className={oc.advice}>
          {reminder ? <AdvisorBubble compact line={reminder} /> : <span />}
          <button className={oc.storyButton} onClick={onTalk} type="button">
            <img alt="" className={oc.storyFace} src={assetUrl("/assets/order-chaos/story/crag-talk.webp")} />
            {story.letter ? "Read Sandro's letter & hear Crag" : "Hear Crag out"}
          </button>
        </div>
      ) : null}

      <div className={oc.prepGrid}>
        <div className={oc.prepMain}>
          <section className={oc.troops}>
            {conveyor ? (
              <p className={styles.note}>Conveyor level: your troops arrive on the belt — no cards to choose.</p>
            ) : level.kind !== "raid" ? (
              <>
                <h2>Choose your troops <small>({hand.length} / {slots})</small></h2>
                {/* The seed bank you take into battle, in the order you'll see it. */}
                <div aria-label="Your troops for this battle" className={oc.bank}>
                  {hand.map((kind) => (
                    <button className={oc.pk} data-scene={cardScene(kind)} key={kind} onClick={() => toggle(kind)} title={`Remove ${DEFENDERS[kind]!.name}`} type="button">
                      <span className={oc.pkArt}><CardArt card={kind} size={52} /></span>
                      <b className={oc.pkCost}>{CARDS[kind]!.cost}</b>
                    </button>
                  ))}
                  {Array.from({ length: Math.max(0, slots - hand.length) }, (_, i) => <span className={oc.pkEmpty} key={i} />)}
                </div>
                <div className={oc.roster}>
                  {units.map((kind) => {
                    const def = DEFENDERS[kind]!;
                    const lv = progress.levels[kind] ?? 1;
                    const ult = u.ultimates.includes(kind);
                    const on = hand.includes(kind);
                    return (
                      <div className={oc.pkCell} key={kind}>
                        <button
                          aria-pressed={on}
                          className={`${oc.pk} ${on ? oc.pkOn : ""}`}
                          data-scene={cardScene(kind)}
                          onClick={() => toggle(kind)}
                          title={`${def.name}: ${def.blurb}${def.surge ? ` Surge: ${surgeText(def)}` : ""}${ult ? ` Ascension — ${ultimateLine(kind)}` : ""}`}
                          type="button"
                        >
                          <span className={oc.pkArt}><CardArt card={kind} size={56} /></span>
                          <b className={oc.pkCost}>{CARDS[kind]!.cost}</b>
                          {lv > 1 ? <i className={oc.pkLv}>Lv {lv}</i> : null}
                          {ult ? <i className={oc.pkUlt}>♛</i> : null}
                        </button>
                        <small>{def.name}</small>
                      </div>
                    );
                  })}
                </div>
                <div className={oc.hybridBox}>
                  <h3>Hybrids <small>drop one card on another unit on the field to fuse them</small></h3>
                  {knownHybrids.length ? (
                    <ul className={oc.hybridList}>
                      {knownHybrids.map(({ kind, inHand }) => (
                        <li className={inHand ? oc.hybridInHand : ""} key={kind} title={DEFENDERS[kind]!.blurb}>
                          <span>{recipeText(kind)}</span>
                          <Icon className={oc.hybridSigil} fallback="=" src={ART.sigil} />
                          <b>{DEFENDERS[kind]!.name}</b>
                          {inHand ? <em>both in your hand</em> : null}
                        </li>
                      ))}
                    </ul>
                  ) : <p className={styles.note}>Recruit both halves of a pairing to learn one.</p>}
                  <p className={styles.note}>
                    {HYBRIDS.length > knownHybrids.length ? `${HYBRIDS.length - knownHybrids.length} more to discover as you recruit (every recipe is in the Hybrid Lab). ` : ""}
                    The same packet dropped on a Wood Elf Band grows the band instead.
                  </p>
                </div>
              </>
            ) : null}
          </section>
        </div>

        <aside className={oc.prepSide}>
          {/* (Endless marches every foe met: the panel lists the packets its horde brings, a Wake-Up Brew for met Nightmares.) */}
          <FieldPanel hand={hand} level={level.kind === "endless" ? { ...level, enemies: foes } : level} />
          {level.boss ? (
            <section className={styles.panel}>
              <h2>Scouts report</h2>
              <div className={styles.foes}>
                <div className={`${styles.foe} ${styles.foeNew}`}><AttackerArt kind="dracolich" size={56} />Dracolich</div>
              </div>
            </section>
          ) : foes.length ? (
            <section className={styles.panel}>
              <h2>Scouts report</h2>
              <div className={styles.foes}>
                {foes.slice(0, 30).map((kind) => (
                  <div className={`${styles.foe} ${kind === level.featured || freshFoes.includes(kind) ? styles.foeNew : ""}`} key={kind} title={ENEMIES[kind]!.blurb}>
                    {kind === level.featured || freshFoes.includes(kind) ? <span className={styles.newTag}>New</span> : null}
                    <AttackerArt kind={kind} size={56} />
                    {ENEMIES[kind]!.name}
                  </div>
                ))}
              </div>
              {level.featured ? <p className={styles.note}>{ENEMIES[level.featured]!.name}: {ENEMIES[level.featured]!.blurb}</p> : null}
              {freshFoes.slice(0, 3).map((kind) => <p className={styles.note} key={kind}>Also new — {ENEMIES[kind]!.name}: {ENEMIES[kind]!.blurb}</p>)}
              {standoffs.length ? (
                <p className={styles.note}>
                  Counter advised — {standoffs.slice(0, 4).map((kind) => ENEMIES[kind]!.name).join(", ")}{standoffs.length > 4 ? " and more" : ""} {standoffs.length > 1 ? "stop" : "stops"} short to shoot: bring a shooter or a damage spell.
                  {" "}Left unanswered once the last wave is out, {standoffs.length > 1 ? "they run" : "it runs"} out of ammunition within {Math.round(STANDOFF_NERVE / GW_TPS)} s and {standoffs.length > 1 ? "charge" : "charges"} in.
                  {!conveyor && !hand.some((kind) => DEFENDERS[kind]?.shot) ? " Nothing in your hand shoots." : ""}
                </p>
              ) : null}
            </section>
          ) : null}
          {level.goals.length ? (
            <section className={styles.panel}>
              <h2>Goals</h2>
              <div className={oc.resultGoals}>
                <span className={cleared ? oc.starOn : oc.starOff}>{cleared ? "★" : "☆"} Win the battle</span>
                {level.goals.map((goal, i) => <span className={met.includes(i) ? oc.starOn : oc.starOff} key={i}>{met.includes(i) ? "★" : "☆"} {goalText(goal)}</span>)}
              </div>
              {!cleared && rewardText(level) ? (
                <p className={oc.nextPrize}><RewardBadge level={level} size={26} /> Victory recruits: {rewardText(level)}</p>
              ) : null}
            </section>
          ) : null}
          <section className={styles.panel}>
            <h2>Hero</h2>
            <div className={oc.heroes} role="radiogroup" aria-label="Hero">
              {OC_HERO_ORDER.map((id: OcHeroId) => {
                const open = u.heroes.includes(id);
                const h = OC_HEROES[id];
                return (
                  <button
                    aria-checked={hero.id === id}
                    className={`${oc.hero} ${hero.id === id ? oc.heroOn : ""}`}
                    disabled={!open}
                    key={id}
                    onClick={() => update((p) => ({ ...p, hero: id }))}
                    role="radio"
                    title={open ? `Rank ${heroRankOf(id, progress.heroRanks)}: ${heroRankText(id, heroRankOf(id, progress.heroRanks))}` : OC_GACHA_HEROES.includes(id) ? "Found only at the Summoning Portal (UR)." : "Recruited later in the campaign."}
                    type="button"
                  >
                    <img alt="" className={oc.portrait} src={assetUrl(h.portrait)} />
                    <span>
                      <strong>{open ? h.name : "???"}</strong>
                      <small>{open ? h.title : "Locked"}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={styles.note}>
              <b>Rank {heroRankOf(hero.id, progress.heroRanks)} / {OC_HERO_MAX_RANK}:</b> {heroRankText(hero.id, heroRankOf(hero.id, progress.heroRanks))}
              {heroRankOf(hero.id, progress.heroRanks) < OC_HERO_MAX_RANK ? " Forge higher ranks at the Forge." : ""}
            </p>
            {level.kind === "raid" ? null : <PackItems progress={progress} update={update} />}
          </section>
          <section className={styles.panel}>
            <h2>Spellbook ({book.length} / {OC_SPELLBOOK_SIZE})</h2>
            {u.spells.length ? (
              <div className={oc.artifacts}>
                {u.spells.map((id) => (
                  <button
                    aria-pressed={book.includes(id)}
                    className={`${oc.artifact} ${book.includes(id) ? oc.artifactOn : ""}`}
                    key={id}
                    onClick={() => toggleSpell(id)}
                    title={`${SPELLS[id].blurb} (${SPELLS[id].mana} mana)`}
                    type="button"
                  >
                    <img alt="" src={assetUrl(SPELLS[id].icon)} />
                    <span>{SPELLS[id].name}</span>
                  </button>
                ))}
              </div>
            ) : <p className={styles.note}>No spells found yet — the campaign hands them out.</p>}
            {artSlots > 0 ? (
              <>
                <h2>Artifacts ({equipped.length} / {artSlots})</h2>
                <div className={oc.artifacts}>
                  {artifacts.filter((id) => id !== hero.passive).map((id) => (
                    <button
                      aria-pressed={equipped.includes(id)}
                      className={`${oc.artifact} ${equipped.includes(id) ? oc.artifactOn : ""}`}
                      key={id}
                      onClick={() => toggleArtifact(id)}
                      title={BLESSINGS[id].blurb}
                      type="button"
                    >
                      <img alt="" src={assetUrl(BLESSINGS[id].icon)} />
                      <span>{BLESSINGS[id].name}</span>
                    </button>
                  ))}
                  {artifacts.length === 0 ? <p className={styles.note}>No artifacts found yet.</p> : null}
                </div>
              </>
            ) : null}
            {u.altar && level.kind !== "raid" ? (
              <p className={styles.note}>
                <Icon className={oc.inlineIcon} fallback="♛" src={ART.valor} /> Ascension: slain foes build Valor ({VALOR_NEED} per crown, {u.crowns} crown{u.crowns > 1 ? "s" : ""} at most).
                Spend a crown (U) to turn a unit into its Ascended form (fully healed, +30% health and power, and its ultimate) for {Math.round(ASCEND_TICKS / GW_TPS)} s. Ready: {u.ultimates.length ? u.ultimates.map((kind) => DEFENDERS[kind]!.name).join(", ") : `none yet — train units to Lv ${OC_ULT_LEVEL} in the Barracks`}.
              </p>
            ) : null}
          </section>
        </aside>
      </div>

      {/* Always in reach while you browse the troops. */}
      <div className={oc.fightBar}>
        <button className={oc.fightButton} disabled={!conveyor && hand.length === 0} onClick={() => onStart(hand)} type="button">Let&apos;s fight! ▸</button>
      </div>
    </div>
  );
}

function Raids({ progress, unlocks: u, onPick, onBack }: { progress: OcProgress; unlocks: Unlocks; onPick(level: OcLevel): void; onBack(): void }) {
  const charges = Object.entries(OC_RAID_CHARGES).map(([id, n]) => `${SPELLS[id as SpellId].name} ×${n}`).join(", ");
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Chaos Raids</h1>
          <p>Now you are the horde. Muster Chaos creatures right of the red line and break through the end of every lane. Slain gold-makers give you 75 Might. Your war spells are limited per raid: {charges}.</p>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.levels}>
          {OC_RAIDS.map((raid) => {
            const open = raidOpen(raid, u.cleared);
            const done = progress.raids.includes(raid.id);
            return (
              <button className={`${styles.level} ${done ? styles.levelCleared : ""}`} disabled={!open} key={raid.id} onClick={() => onPick(raid)} title={open ? raid.brief : `Opens after world ${raid.unlockWorld}.`} type="button">
                <AttackerArt kind={raid.atkCards?.[raid.atkCards.length - 1] ?? "oc-shambler"} size={44} />
                <span>
                  <strong>{raid.name}{done ? " ✓" : ""}</strong>
                  <small>{open ? raid.brief : `Opens after world ${raid.unlockWorld}`}</small>
                  {open ? <small>Might {raid.startMight} · {(raid.atkCards ?? []).map((kind) => ENEMIES[kind]!.name).join(", ")}</small> : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Barracks({ progress, unlocks: u, update, onBack }: { progress: OcProgress; unlocks: Unlocks; update(change: (p: OcProgress) => OcProgress): void; onBack(): void }) {
  const train = (kind: DefKind) => update((p) => {
    const lv = p.levels[kind] ?? 1;
    const cost = OC_LEVEL_COST[lv + 1];
    if (lv >= OC_MAX_LEVEL || cost === undefined || p.seals < cost) return p;
    return { ...p, seals: p.seals - cost, levels: { ...p.levels, [kind]: lv + 1 } };
  });
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Barracks</h1>
          <p>Spend Seals to train your troops: every level adds 15% health and power (and Surge strength). Level {OC_ULT_LEVEL} unlocks a unit&apos;s Ascension{u.altar ? "" : " once the Ascension Altar is found (world 2)"}. Earn Seals from victories, goals, raids and Endless records.</p>
        </div>
        <span className={oc.purse}><Icon className={oc.inlineIcon} fallback="✦" src={ART.seal} /> {progress.seals}</span>
      </div>
      <Greeting cleared={u.cleared} place="barracks" />
      <section className={styles.panel}>
        <div className={oc.barracks}>
          {LAWFUL_CARDS.filter((kind) => !DEFENDERS[kind]!.conveyor).map((kind) => {
            const def = DEFENDERS[kind]!;
            const open = u.units.includes(kind);
            const lv = progress.levels[kind] ?? 1;
            const cost = OC_LEVEL_COST[lv + 1];
            const ult = OC_ULTIMATES[kind];
            return (
              <div className={`${oc.unit} ${open ? "" : oc.unitLocked}`} key={kind}>
                <DefenderArt kind={kind} size={64} />
                <div>
                  <strong>{open ? def.name : "???"}</strong>
                  {open ? (
                    <>
                      <small>Lv {lv} · {Math.round(def.hp * levelPower(lv))} HP · {CARDS[kind]!.cost} gold</small>
                      <p>{def.blurb}</p>
                      {def.surge ? <p className={oc.surge}>Surge: {surgeText(def)}</p> : null}
                      {ult ? (
                        <p className={u.ultimates.includes(kind) ? oc.ultimate : oc.ultimateLocked}>
                          ♛ {ultimateLine(kind)}{u.ultimates.includes(kind) ? "" : ` (Lv ${OC_ULT_LEVEL}${u.altar ? "" : " + the Ascension Altar"})`}
                        </p>
                      ) : null}
                      {lv < OC_MAX_LEVEL && cost !== undefined ? (
                        <button className={styles.primary} disabled={progress.seals < cost} onClick={() => train(kind)} type="button">
                          Train to Lv {lv + 1} ({cost} Seals)
                        </button>
                      ) : <small>Fully trained</small>}
                    </>
                  ) : <small>{unlockSource(kind)}</small>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Camp({ progress, unlocks: u, update, onBack }: { progress: OcProgress; unlocks: Unlocks; update(change: (p: OcProgress) => OcProgress): void; onBack(): void }) {
  const hire = (kind: DefKind, seals: number) => update((p) => {
    if (p.hired.includes(kind) || p.seals < seals) return p;
    return { ...p, seals: p.seals - seals, hired: [...p.hired, kind] };
  });
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Mercenary Camp</h1>
          <p>Not every sword of Order was born Lawful. Hire champions of other towns — Nighon&apos;s Minotaurs and Beholders among them — for Seals. Hired troops join your seed packets for good.</p>
        </div>
        <span className={oc.purse}><Icon className={oc.inlineIcon} fallback="✦" src={ART.seal} /> {progress.seals}</span>
      </div>
      <Greeting cleared={u.cleared} place="camp" />
      <section className={styles.panel}>
        <div className={oc.barracks}>
          {OC_MERCENARIES.map(({ kind, seals }) => {
            const def = DEFENDERS[kind]!;
            const owned = progress.hired.includes(kind);
            const available = u.units.includes(kind);
            return (
              <div className={oc.unit} key={kind}>
                <DefenderArt kind={kind} size={64} />
                <div>
                  <strong>{def.name}</strong>
                  <small>{def.hp} HP · {CARDS[kind]!.cost} gold · recharge {Math.round((CARDS[kind]!.recharge / GW_TPS) * 10) / 10} s</small>
                  <p>{def.blurb}</p>
                  {def.surge ? <p className={oc.surge}>Surge: {surgeText(def)}</p> : null}
                  {ultimateLine(kind) ? <p className={oc.ultimate}>♛ {ultimateLine(kind)}</p> : null}
                  {owned ? <small>Hired</small> : available ? <small>Available (testing unlock)</small> : (
                    <button className={styles.primary} disabled={progress.seals < seals} onClick={() => hire(kind, seals)} type="button">
                      Hire ({seals} Seals)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/** A recipe half as the Lab shows it: the troop card, greyed until recruited. */
function LabHalf({ ids, units }: { ids: readonly string[]; units: readonly DefKind[] }) {
  const id = ids.find((one) => units.includes(one)) ?? ids[0]!;
  const have = ids.some((one) => units.includes(one));
  const name = ids.map((one) => DEFENDERS[one]?.name ?? CARDS[one]?.name ?? one).join(" / ");
  return (
    <div className={`${oc.labHalf} ${have ? "" : oc.labMissing}`} title={have ? name : `${name}: not recruited yet — ${unlockSource(id)}`}>
      <span className={oc.pk} data-scene={cardScene(id)}>
        <span className={oc.pkArt}><CardArt card={id} size={50} /></span>
        <b className={oc.pkCost}>{CARDS[id]?.cost ?? ""}</b>
      </span>
      <small>{name}</small>
    </div>
  );
}

/**
 * The Hybrid Lab: every fusion recipe as cards, A + B into the hybrid. Ready
 * ones (both halves recruited) first, then half-found, then undiscovered —
 * whose hybrid stays a silhouette with no name, as in the Almanac.
 */
function HybridLab({ progress, unlocks: u, onBack }: { progress: OcProgress; unlocks: Unlocks; onBack(): void }) {
  const art = (src: string) => `url("${assetUrl(src)}")`;
  const sceneVars = Object.fromEntries(CARD_SCENES.map((scene) => [`--oc-scene-${scene}`, art(cardSceneSrc(scene))]));
  const owned = (ids: readonly string[]) => ids.some((id) => u.units.includes(id));
  const pick = (ids: readonly string[]) => ids.find((id) => u.units.includes(id)) ?? ids[0]!;
  const names = (ids: readonly string[]) => ids.map((id) => DEFENDERS[id]?.name ?? CARDS[id]?.name ?? id).join(" / ");
  const recipes = HYBRIDS.flatMap((kind) => {
    const recipe = FUSIONS.find((entry) => entry.result === kind);
    if (!recipe) return [];
    const have = Number(owned(recipe.a)) + Number(owned(recipe.b));
    const price = (CARDS[pick(recipe.a)]?.cost ?? 0) + (CARDS[pick(recipe.b)]?.cost ?? 0);
    return [{ kind, recipe, have, price }];
  });
  const groups = [
    { id: "ready", title: "Ready to fuse", hint: "both halves recruited — take them into battle together", items: recipes.filter((r) => r.have === 2).sort((x, y) => x.price - y.price) },
    { id: "half", title: "One half to go", hint: "recruit the greyed card to learn the hybrid", items: recipes.filter((r) => r.have === 1) },
    { id: "unknown", title: "Undiscovered", hint: "neither half recruited yet", items: recipes.filter((r) => r.have === 0) }
  ];
  return (
    <div className={oc.prep} style={{ ["--oc-packet" as string]: art(OC_UI.packet), ...sceneVars }}>
      <div className={oc.campHead}>
        <button className={oc.backButton} onClick={onBack} type="button">‹ Back</button>
        <h1 className={oc.titleBanner} style={{ ["--oc-banner" as string]: art(OC_UI.banner) }}><span>Hybrid Lab</span></h1>
        <div className={oc.tally}><span>{groups[0]!.items.length} / {HYBRIDS.length} ready</span></div>
      </div>
      <p className={oc.prepBrief}>
        Put one half on the field, then drop the other half&apos;s card on it: the two fuse into the hybrid where it stands, and you pay the dropped card&apos;s price.
        {" "}A hybrid keeps the higher Barracks level of its halves. Hybrids and Ascended troops don&apos;t fuse again.
      </p>
      {groups.map((group) => group.items.length ? (
        <section aria-labelledby={`oc-lab-${group.id}`} className={`${oc.troops} ${oc.labGroup}`} key={group.id}>
          <h2 id={`oc-lab-${group.id}`}>{group.title} <small>({group.items.length}) · {group.hint}</small></h2>
          <div className={oc.labGrid}>
            {group.items.map(({ kind, recipe, have, price }) => {
              const def = DEFENDERS[kind]!;
              const known = have === 2;
              const a = pick(recipe.a);
              const b = pick(recipe.b);
              // (Either order works when both halves are troops that stay on the field.)
              const eitherWay = Boolean(CARDS[a]?.places && CARDS[b]?.places && !DEFENDERS[a]?.instant && !DEFENDERS[b]?.instant);
              const missing = [owned(recipe.a) ? "" : names(recipe.a), owned(recipe.b) ? "" : names(recipe.b)].filter(Boolean).join(" and ");
              return (
                <article className={`${oc.labCard} ${known ? oc.labReady : ""}`} key={kind}>
                  <div className={oc.labFormula}>
                    <LabHalf ids={recipe.a} units={u.units} />
                    <Icon className={oc.labSigil} fallback="+" src={ART.sigil} />
                    <LabHalf ids={recipe.b} units={u.units} />
                    <span aria-hidden className={oc.labArrow}>▸</span>
                    <span className={`${oc.labResult} ${known ? "" : oc.labSilhouette}`} title={known ? def.name : "Undiscovered hybrid"}>
                      <DefenderArt kind={kind} size={76} />
                    </span>
                  </div>
                  <div className={oc.labText}>
                    <strong>{known ? def.name : "???"}</strong>
                    {known ? (
                      <>
                        <small>
                          {Math.round(def.hp * levelPower(Math.max(progress.levels[a] ?? 1, progress.levels[b] ?? 1)))} HP · {price} gold for both cards · {eitherWay ? "drop either card on the other" : `drop ${names(recipe.b)} on ${names(recipe.a)}`}
                        </small>
                        <p>{def.blurb}</p>
                        {def.surge ? <p className={oc.surge}>Surge: {surgeText(def)}</p> : null}
                      </>
                    ) : <p>Recruit {missing} to learn this hybrid.</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null)}
    </div>
  );
}

type AlmanacTab = "lawful" | "hybrids" | "chaos" | "field" | "heroes" | "artifacts" | "spells";

const TAB_LABEL: Record<AlmanacTab, string> = { lawful: "Lawful", hybrids: "Hybrids", chaos: "Chaos", field: "Battlefield", heroes: "Heroes", artifacts: "Artifacts", spells: "Spells" };

/** The story so far: every scene the player has reached, by chapter; click one to hear it again. */
function Journal({ progress, onBack, onPlay }: { progress: OcProgress; onBack(): void; onPlay(entry: StoryLogEntry): void }) {
  const chapters = storyLog(progress);
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>The story so far</h1>
          <p>Every scene you have reached, in order. Click one to read it again.</p>
        </div>
      </div>
      <section className={styles.panel}>
        {chapters.map((chapter) => (
          <div className={oc.journalChapter} key={chapter.title}>
            <h2>{chapter.title}</h2>
            <div className={oc.journalList}>
              {chapter.entries.map((entry) => (
                <button className={oc.journalEntry} key={entry.id} onClick={() => onPlay(entry)} type="button">
                  <span aria-hidden>{entry.letter ? "✉" : "▸"}</span> {entry.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function Almanac({ unlocks: u, onBack }: { unlocks: Unlocks; onBack(): void }) {
  const [tab, setTab] = useState<AlmanacTab>("lawful");
  const met = new Set(metEnemies(u.cleared));
  const secs = (ticks: number) => Math.round((ticks / GW_TPS) * 10) / 10;
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Almanac</h1>
          <p>Every Lawful troop, its Surge and its Ascension, the hybrids, the Chaos creatures you have met, heroes, artifacts and spells.</p>
        </div>
      </div>
      <Greeting cleared={u.cleared} place="almanac" />
      <div className={styles.factions} role="tablist" aria-label="Almanac">
        {(["lawful", "hybrids", "chaos", "field", "heroes", "artifacts", "spells"] as const).map((id) => (
          <button aria-selected={tab === id} className={`${styles.faction} ${tab === id ? styles.factionOn : ""}`} key={id} onClick={() => setTab(id)} role="tab" type="button">
            {id === "lawful" || id === "chaos" ? <img alt="" src={assetUrl(`/assets/order-chaos/icons/${id}.webp`)} /> : null}
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>
      <section className={styles.panel}>
        <div className={oc.barracks}>
          {tab === "lawful" ? LAWFUL_CARDS.map((kind) => {
            const def = DEFENDERS[kind]!;
            // (A conveyor special is known once a caravan level carrying it is cleared.)
            const open = u.units.includes(kind) || (def.conveyor === true && conveyorLevels(kind).some((level) => u.cleared.includes(level.id)));
            return (
              <div className={`${oc.unit} ${open ? "" : oc.unitLocked}`} key={kind}>
                <DefenderArt kind={kind} size={64} />
                <div>
                  <strong>{open ? def.name : "???"}</strong>
                  {open ? (
                    <>
                      <small>{def.hp} HP · {CARDS[kind]!.cost} gold · recharge {secs(CARDS[kind]!.recharge)} s</small>
                      <p>{def.blurb}</p>
                      {def.surge ? <p className={oc.surge}>Surge: {surgeText(def)}</p> : <p className={oc.surge}>Acts once — no Surge.</p>}
                      {ultimateLine(kind) ? <p className={oc.ultimate}>♛ Ascension — {ultimateLine(kind)}</p> : null}
                    </>
                  ) : <small>{unlockSource(kind)}</small>}
                </div>
              </div>
            );
          }) : null}
          {tab === "hybrids" ? HYBRIDS.map((kind) => {
            const def = DEFENDERS[kind]!;
            const open = hybridKnown(kind, u.units);
            return (
              <div className={`${oc.unit} ${open ? "" : oc.unitLocked}`} key={kind}>
                <DefenderArt kind={kind} size={64} />
                <div>
                  <strong>{open ? def.name : "???"}</strong>
                  <small>{recipeText(kind)}</small>
                  {open ? (
                    <>
                      <small>{def.hp} HP</small>
                      <p>{def.blurb}</p>
                      {def.surge ? <p className={oc.surge}>Surge: {surgeText(def)}</p> : null}
                    </>
                  ) : <p>Recruit both halves to learn this hybrid.</p>}
                </div>
              </div>
            );
          }) : null}
          {tab === "chaos" ? CHAOS_KINDS.map((kind) => {
            const def = ENEMIES[kind]!;
            const open = met.has(kind) || u.raiders.includes(kind);
            return (
              <div className={`${oc.unit} ${open ? "" : oc.unitLocked}`} key={kind}>
                {def.sprite ? <AttackerArt kind={kind} size={64} /> : <Icon className={oc.portrait} fallback="🪦" src={ART.grave} />}
                <div>
                  <strong>{open ? def.name : "???"}</strong>
                  {open ? (
                    <>
                      <small>{def.hp} HP{def.shield ? ` + ${def.shield} shield` : ""}{def.armor ? ` + ${def.armor} armour` : ""}{def.flying ? " · FLYING" : ""}{def.purse ? ` · pay ${def.purse} gold` : ""}</small>
                      <p>{def.blurb}</p>
                    </>
                  ) : <small>{OC_GACHA_CHAOS.some((g) => g.kind === kind) ? "A Summoning Portal raider (SSR): once won, it joins your hand in every Chaos Raid." : "Not yet met."}</small>}
                </div>
              </div>
            );
          }) : null}
          {tab === "heroes" ? OC_HERO_ORDER.map((id) => {
            const h = OC_HEROES[id];
            const open = u.heroes.includes(id);
            return (
              <div className={`${oc.unit} ${open ? "" : oc.unitLocked}`} key={id}>
                <img alt="" className={oc.portrait} src={assetUrl(h.portrait)} />
                <div>
                  <strong>{open ? `${h.name}, ${h.title}` : "???"}</strong>
                  {open ? (
                    <>
                      <p>{h.blurb}</p>
                      <p className={oc.surge}>{SPELLS[h.spell].name}: {SPELLS[h.spell].blurb} ({SPELLS[h.spell].mana} mana)</p>
                      <small>These are the hero&apos;s numbers at full strength (rank {OC_HERO_MAX_RANK}). Heroes join weaker and grow at the Forge.</small>
                    </>
                  ) : <small>{OC_GACHA_HEROES.includes(id) ? "Found only at the Summoning Portal (UR)." : "Recruited later in the campaign."}</small>}
                </div>
              </div>
            );
          }) : null}
          {tab === "artifacts" ? OC_ARTIFACTS.map((id) => {
            const open = u.artifacts.includes(id);
            return (
              <div className={`${oc.unit} ${open ? "" : oc.unitLocked}`} key={id}>
                <img alt="" className={oc.portrait} src={assetUrl(BLESSINGS[id].icon)} />
                <div>
                  <strong>{open ? BLESSINGS[id].name : "???"}</strong>
                  <p>{open ? BLESSINGS[id].blurb : "Found later in the campaign or by stars (and offered in Endless Siege)."}</p>
                </div>
              </div>
            );
          }) : null}
          {tab === "spells" ? OC_SPELLS.map((id) => {
            const open = u.spells.includes(id);
            const spell = SPELLS[id];
            return (
              <div className={`${oc.unit} ${open ? "" : oc.unitLocked}`} key={id}>
                <img alt="" className={oc.portrait} src={assetUrl(spell.icon)} />
                <div>
                  <strong>{open ? spell.name : "???"}</strong>
                  {open ? <p>{spell.blurb} ({spell.mana} mana, recovers in {secs(spell.cooldown)} s)</p> : <small>Found later in the campaign or by stars.</small>}
                </div>
              </div>
            );
          }) : null}
        </div>
        {tab === "field" ? <FieldAlmanac cleared={u.cleared} /> : null}
      </section>
    </>
  );
}
