"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BLESSINGS, CARDS, DEFENDERS, ENEMIES, FUSIONS, GW_TPS, SPELLS, type BlessingId, type DefKind, type EnemyKind, type SpellId } from "@/engine/garrison/content";
import {
  OC_ALL_CLEARED, OC_ALL_HIRED, OC_ENDLESS, OC_HEROES, OC_HERO_ORDER, OC_LEVELS, OC_LEVEL_COST, OC_LAWFUL_COLOR, OC_MAX_LEVEL, OC_MERCENARIES,
  OC_RAID_CHARGES, OC_RAIDS, OC_SPELLBOOK_SIZE, OC_SPELLS, OC_STAR_MILESTONES, OC_ULT_LEVEL, OC_WORLDS, OC_ARTIFACTS,
  altarOpen, artifactSlots, buildOcConfig, crownSlots, endlessOpen, goalMet, goalText, isLevelOpen, levelPower, mercCampOpen, metEnemies, raidOpen, seedSlots,
  totalStars, unlockedArtifacts, unlockedHeroes, unlockedSpells, unlockedUltimates, unlockedUnits, worldCleared,
  type OcHeroId, type OcLevel
} from "@/engine/garrison/order-chaos/campaign";
import { ASCEND_TICKS, VALOR_NEED } from "@/engine/garrison/order-chaos/forms";
import { OC_DEFENDERS, OC_ENEMIES, OC_ULTIMATES } from "@/engine/garrison/order-chaos/roster";
import { surgeText } from "@/engine/garrison/order-chaos/surge-text";
import type { Side } from "@/engine/garrison/sim";
import { assetUrl } from "@/lib/asset-url";
import { setMusicScene, type MusicScene } from "@/lib/music";
import { loadOcProgress, saveOcProgress, type OcProgress } from "@/lib/order-chaos-progress";
import { createLocalDriver, type GarrisonDriver } from "../driver";
import { GarrisonGame, type GameIntro, type GameResult } from "../garrison-game";
import styles from "../garrison.module.css";
import { AttackerArt, CardArt, DefenderArt } from "../thumbs";
import oc from "./oc.module.css";

type Screen =
  | { s: "home" }
  | { s: "campaign"; world: number }
  | { s: "prep"; level: OcLevel }
  | { s: "raids" }
  | { s: "barracks" }
  | { s: "camp" }
  | { s: "almanac" }
  | { s: "play" };

type Session = { key: number; driver: GarrisonDriver; level: OcLevel; restart: () => void };

const seed = () => Math.floor(Math.random() * 2147483647);

/** Every Lawful unit with a seed packet, in campaign order. */
const LAWFUL_CARDS: DefKind[] = OC_DEFENDERS.filter((def) => def.card).map((def) => def.kind);
/** Hybrids: made on the field by dropping one seed packet on another unit. */
const HYBRIDS: DefKind[] = OC_DEFENDERS.filter((def) => def.fusion).map((def) => def.kind);
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
  barracks: "/assets/ui/menu/buttons/oc-barracks.webp",
  camp: "/assets/ui/menu/buttons/oc-mercenaries.webp",
  almanac: "/assets/ui/menu/buttons/oc-almanac.webp",
  versus: "/assets/ui/menu/buttons/gw-versus.webp",
  back: "/assets/ui/menu/buttons/back.webp",
  seal: "/assets/order-chaos/icons/seal.webp",
  star: "/assets/order-chaos/icons/star.webp",
  surge: "/assets/order-chaos/icons/surge.webp",
  valor: "/assets/order-chaos/icons/valor.webp",
  mercenary: "/assets/order-chaos/icons/mercenary.webp",
  grave: "/assets/order-chaos/props/grave.webp"
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
  spells: SpellId[];
  ultimates: DefKind[];
  altar: boolean;
  camp: boolean;
};

function unlocksOf(p: OcProgress): Unlocks {
  const test = p.testAll;
  const cleared = test ? OC_ALL_CLEARED : p.cleared;
  const stars = test ? Number.MAX_SAFE_INTEGER : totalStars(p.cleared, p.stars);
  const units = unlockedUnits(cleared, test ? OC_ALL_HIRED : p.hired);
  return {
    test,
    cleared,
    stars,
    units,
    heroes: unlockedHeroes(cleared),
    artifacts: unlockedArtifacts(cleared, stars),
    artSlots: artifactSlots(cleared, stars),
    seedSlots: seedSlots(cleared, stars),
    crowns: crownSlots(stars),
    spells: unlockedSpells(cleared, stars),
    ultimates: unlockedUltimates(cleared, units, p.levels, test),
    altar: test || altarOpen(cleared),
    camp: test || mercCampOpen(cleared)
  };
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

function Stars({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span aria-label={`${count} of ${max} stars`} className={oc.stars}>
      {Array.from({ length: max }, (_, i) => <span className={i < count ? oc.starOn : oc.starOff} key={i}>★</span>)}
    </span>
  );
}

function introFor(level: OcLevel, cleared: readonly string[]): GameIntro {
  const pool = level.kind === "endless" ? metEnemies(cleared) : level.enemies;
  const kinds = [...new Set([...(level.featured ? [level.featured] : []), ...pool])].filter((kind) => ENEMIES[kind] && !ENEMIES[kind]!.structure);
  return { title: level.name, lineup: level.kind === "raid" ? [] : kinds.slice(0, 10), cue: level.kind === "raid" ? "Attack!" : "Defend!" };
}

/** A starting hand: gold-makers first, then the most recently recruited troops. */
function defaultHand(units: DefKind[], slots: number): DefKind[] {
  const econ = units.filter((kind) => DEFENDERS[kind]?.produce && DEFENDERS[kind]!.produce!.value > 0).slice(0, 1);
  const rest = units.filter((kind) => !econ.includes(kind) && !DEFENDERS[kind]?.instant).reverse();
  const instants = units.filter((kind) => DEFENDERS[kind]?.instant);
  return [...econ, ...rest, ...instants].slice(0, slots);
}

/** Where a Lawful unit is recruited (for locked entries). */
function unlockSource(kind: DefKind): string {
  const merc = OC_MERCENARIES.find((entry) => entry.kind === kind);
  if (merc) return `Mercenary Camp: ${merc.seals} Seals`;
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

function ultimateLine(kind: DefKind): string | null {
  const ult = OC_ULTIMATES[kind];
  return ult ? `${ult.name} (+30% health and power): ${ult.blurb}` : null;
}

export function OrderChaosApp() {
  const [screen, setScreen] = useState<Screen>({ s: "home" });
  const [progress, setProgress] = useState<OcProgress>(loadOcProgress);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [note, setNote] = useState<ReactNode>(null);
  const [nextLevel, setNextLevel] = useState<OcLevel | null>(null);
  const unlocks = useMemo(() => unlocksOf(progress), [progress]);
  // Music: the preparation theme loops on the loadout screen, the menu theme on
  // the other menus. While a battle is on screen GarrisonGame owns the music
  // (preparation theme during Last Stand planning, then the battle score), so
  // this effect stays silent instead of fighting it; the battle's unmount stops
  // its track before this effect picks the menu scene back up.
  const menuMusic: MusicScene | null = screen.s === "play" && session ? null : screen.s === "prep" ? "oc-prep" : "menu";
  useEffect(() => {
    if (menuMusic) setMusicScene(menuMusic);
  }, [menuMusic]);
  useEffect(() => () => setMusicScene(null), []);

  const replaceSession = useCallback((next: Session | null) => {
    sessionRef.current?.driver.dispose();
    sessionRef.current = next;
    setSession(next);
  }, []);
  useEffect(() => () => {
    sessionRef.current?.driver.dispose();
    sessionRef.current = null;
  }, []);

  const update = useCallback((change: (p: OcProgress) => OcProgress) => {
    setProgress((current) => {
      const next = change(current);
      saveOcProgress(next);
      return next;
    });
  }, []);

  const start = useCallback((level: OcLevel, cards: DefKind[]) => {
    const p = progress;
    const u = unlocksOf(p);
    const launch = () => {
      const config = buildOcConfig(level, {
        seed: seed(), cards, hero: u.heroes.includes(p.hero) ? p.hero : "catherine", artifacts: p.artifacts.filter((id) => u.artifacts.includes(id)).slice(0, u.artSlots),
        levels: p.levels, cleared: u.cleared, spells: spellbookOf(p, u), ultimates: u.ultimates, crowns: u.crowns
      });
      const local: Side[] = level.kind === "raid" ? ["atk"] : ["def"];
      setNote(null);
      setNextLevel(null);
      replaceSession({ key: Date.now(), driver: createLocalDriver(config, local, {}), level, restart: launch });
      setScreen({ s: "play" });
    };
    launch();
  }, [progress, replaceSession]);

  const onFinish = useCallback((result: GameResult) => {
    const level = sessionRef.current?.level;
    if (!level) return;
    const stats = {
      lost: result.state.stats.lost,
      goldSpent: result.state.stats.goldSpent,
      chargersUsed: result.state.chargers.filter((c) => c.dmg === undefined && c.state !== "ready").length
    };
    if (level.kind === "raid") {
      if (result.winner !== "atk") return;
      const first = !progress.raids.includes(level.id);
      update((p) => ({ ...p, raids: p.raids.includes(level.id) ? p.raids : [...p.raids, level.id], seals: p.seals + (first ? 4 : 1) }));
      setNote(<p className={oc.reward}>+{first ? 4 : 1} Seals</p>);
      return;
    }
    if (level.kind === "endless") {
      const waves = result.state.director.wave;
      const gained = Math.max(0, Math.floor(waves / 5) - Math.floor(progress.bestEndless / 5));
      update((p) => ({ ...p, bestEndless: Math.max(p.bestEndless, waves), seals: p.seals + gained }));
      setNote(<p className={oc.reward}>{waves > progress.bestEndless ? `New best: wave ${waves}!` : `Best: wave ${progress.bestEndless}`}{gained ? ` · +${gained} Seals` : ""}</p>);
      return;
    }
    const goals = level.goals.map((goal, i) => ({ goal, i, met: result.winner === "def" && goalMet(goal, stats) }));
    if (result.winner !== "def") {
      setNote(
        <div className={oc.resultGoals}>
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
    const starsBefore = totalStars(progress.cleared, progress.stars);
    const starsAfter = starsBefore + (first ? 1 : 0) + fresh.length;
    const milestones = OC_STAR_MILESTONES.filter((m) => m.stars > starsBefore && m.stars <= starsAfter);
    update((p) => ({
      ...p,
      cleared: p.cleared.includes(level.id) ? p.cleared : [...p.cleared, level.id],
      stars: { ...p.stars, [level.id]: [...new Set([...(p.stars[level.id] ?? []), ...fresh])].sort() },
      seals: p.seals + seals
    }));
    const reward = first ? level.reward : {};
    const index = OC_LEVELS.findIndex((entry) => entry.id === level.id);
    setNextLevel(OC_LEVELS[index + 1] ?? null);
    setNote(
      <div className={oc.resultGoals}>
        <span className={oc.starOn}>★ Victory{first ? " (first clear)" : ""}</span>
        {goals.map(({ goal, i, met }) => (
          <span className={met ? oc.starOn : oc.starOff} key={i}>{met ? "★" : "☆"} {goalText(goal)}{fresh.includes(i) ? " — new!" : ""}</span>
        ))}
        <p className={oc.reward}>
          <Icon className={oc.inlineIcon} fallback="✦" src={ART.seal} /> +{seals} Seals
        </p>
        {milestones.map((m) => <p className={oc.reward} key={m.stars}>★ {m.stars} stars: {m.label}!</p>)}
        {reward.units?.length || reward.hero || reward.artifact || reward.spell || reward.altar ? (
          <div className={styles.panel}>
            <h2>Unlocked</h2>
            <div className={styles.foes}>
              {(reward.units ?? []).map((kind) => (
                <div className={styles.foe} key={kind} title={DEFENDERS[kind]!.blurb}><DefenderArt kind={kind} size={56} />{DEFENDERS[kind]!.name}</div>
              ))}
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
  }, [progress, update]);

  if (screen.s === "play" && session) {
    const level = session.level;
    const back: Screen = level.kind === "raid" ? { s: "raids" } : level.kind === "endless" ? { s: "home" } : { s: "campaign", world: level.world };
    return (
      <div className={styles.shell}>
        <GarrisonGame
          defColor={OC_LAWFUL_COLOR}
          music="order-chaos"
          driver={session.driver}
          hotseat={false}
          intro={introFor(level, unlocks.cleared)}
          key={session.key}
          next={nextLevel ? { label: `Next: ${nextLevel.name}`, onNext: () => { replaceSession(null); setScreen({ s: "prep", level: nextLevel }); } } : null}
          onFinish={onFinish}
          onLeave={() => { replaceSession(null); setNote(null); setNextLevel(null); setScreen(back); }}
          onRestart={session.restart}
          town="castle"
          unlockNote={note}
        />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={`${styles.menu} ${oc.menu}`} style={{ backgroundImage: `url("${assetUrl("/assets/tide/menu-backdrop.webp")}")` }}>
        {unlocks.test ? (
          <div className={oc.testBanner} role="status">
            <span>TESTING — everything is unlocked (your Seals, levels and records are unchanged).</span>
            <button className={styles.ghostButton} onClick={() => update((p) => ({ ...p, testAll: false }))} type="button">Turn off</button>
          </div>
        ) : null}
        {screen.s === "home" ? <Home onPick={setScreen} progress={progress} unlocks={unlocks} update={update} /> : null}
        {screen.s === "campaign" ? (
          <Campaign onBack={() => setScreen({ s: "home" })} onPick={(level) => setScreen({ s: "prep", level })} onWorld={(world) => setScreen({ s: "campaign", world })} progress={progress} unlocks={unlocks} world={screen.world} />
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
            progress={progress}
            unlocks={unlocks}
            update={update}
          />
        ) : null}
        {screen.s === "raids" ? <Raids onBack={() => setScreen({ s: "home" })} onPick={(level) => start(level, [])} progress={progress} unlocks={unlocks} /> : null}
        {screen.s === "barracks" ? <Barracks onBack={() => setScreen({ s: "home" })} progress={progress} unlocks={unlocks} update={update} /> : null}
        {screen.s === "camp" ? <Camp onBack={() => setScreen({ s: "home" })} progress={progress} unlocks={unlocks} update={update} /> : null}
        {screen.s === "almanac" ? <Almanac onBack={() => setScreen({ s: "home" })} unlocks={unlocks} /> : null}
      </div>
    </div>
  );
}

function Home({ onPick, progress: p, unlocks: u, update }: {
  onPick(next: Screen): void;
  progress: OcProgress;
  unlocks: Unlocks;
  update(change: (p: OcProgress) => OcProgress): void;
}) {
  const totalStarCount = totalStars(p.cleared, p.stars);
  const lastWorld = OC_WORLDS.find((world) => !worldCleared(world.id, u.cleared))?.id ?? OC_WORLDS.length;
  const endless = endlessOpen(u.cleared);
  const raids = OC_RAIDS.some((raid) => raidOpen(raid, u.cleared));
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(false);
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
      <div className={styles.menuHead}>
        <div>
          <h1>Order &amp; Chaos</h1>
          <p>The Lawful hold the realm; the Chaos horde comes to break it. Raise troops, gather Surge orbs, earn Valor to Ascend your champions, recruit heroes, mercenaries and artifacts, and hold the line across ten worlds.</p>
        </div>
        <span className={oc.purse} title="Seals: spend them in the Barracks and the Mercenary Camp">
          <Icon className={oc.inlineIcon} fallback="✦" src={ART.seal} /> {p.seals}
        </span>
      </div>
      <div className={styles.artModes}>
        <button aria-label="Campaign" className={styles.artMode} onClick={() => onPick({ s: "campaign", world: lastWorld })} title="Ten worlds of the Chaos invasion. Every victory recruits new troops, heroes, artifacts or spells." type="button">
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
        <button aria-label="Almanac" className={styles.artMode} onClick={() => onPick({ s: "almanac" })} title="Every Lawful unit, hybrid and Surge, every Chaos creature met, heroes, artifacts and spells." type="button">
          <ArtFace label="Almanac" src={ART.almanac} />
          <small>{" "}</small>
        </button>
        <Link aria-label="Garrison Wars" className={styles.artMode} href="/garrison" title="Garrison Wars, the faction duel: every town defends a castle or marches on one — against the computer, on one screen or online.">
          <ArtFace label="Garrison Wars" src={ART.versus} />
          <small>Faction duels</small>
        </Link>
        <Link aria-label="Back" className={styles.artMode} href="/menu?view=singlePlayer">
          <ArtFace label="Back" src={ART.back} />
          <small>{" "}</small>
        </Link>
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

function Campaign({ world, progress, unlocks: u, onPick, onWorld, onBack }: {
  world: number;
  progress: OcProgress;
  unlocks: Unlocks;
  onPick(level: OcLevel): void;
  onWorld(world: number): void;
  onBack(): void;
}) {
  const current = OC_WORLDS.find((entry) => entry.id === world) ?? OC_WORLDS[0]!;
  const starCount = totalStars(progress.cleared, progress.stars);
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Campaign</h1>
          <p>Clear a world to open the next. Each level has two goals — meet them for stars and extra Seals. Stars earn rewards of their own.</p>
        </div>
      </div>
      <div className={oc.worlds} role="tablist" aria-label="Worlds">
        {OC_WORLDS.map((entry) => {
          const open = entry.id === 1 || worldCleared(entry.id - 1, u.cleared);
          const stars = entry.levels.reduce((sum, level) => sum + starsOf(progress, level), 0);
          return (
            <button
              aria-selected={entry.id === current.id}
              className={`${oc.world} ${entry.id === current.id ? oc.worldOn : ""}`}
              disabled={!open}
              key={entry.id}
              onClick={() => onWorld(entry.id)}
              role="tab"
              style={{ backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.75)), url("${assetUrl(entry.art)}")` }}
              title={open ? entry.blurb : `Clear ${OC_WORLDS[entry.id - 2]?.name ?? "the previous world"} first.`}
              type="button"
            >
              <strong>{entry.id}. {entry.name}</strong>
              <small>{open ? `★ ${stars} / ${entry.levels.length * 3}` : "Locked"}</small>
            </button>
          );
        })}
      </div>
      <section className={styles.panel}>
        <h2>{current.name}</h2>
        <p className={styles.note}>{current.blurb}</p>
        <div className={styles.levels}>
          {current.levels.map((level, i) => {
            const open = isLevelOpen(level.id, u.cleared);
            const cleared = progress.cleared.includes(level.id);
            return (
              <button
                className={`${styles.level} ${cleared ? styles.levelCleared : ""}`}
                disabled={!open}
                key={level.id}
                onClick={() => onPick(level)}
                title={open ? level.brief : "Clear the level before it first."}
                type="button"
              >
                {level.featured || level.boss ? <AttackerArt kind={level.boss ? "dracolich" : level.featured!} size={44} /> : <DefenderArt kind="oc-longbow" size={44} />}
                <span>
                  <strong>{current.id}-{i + 1}. {level.name}</strong>
                  <small>
                    {KIND_LABEL[level.kind] ? <em className={oc.badge}>{KIND_LABEL[level.kind]}</em> : null}
                    {level.boss ? "Boss battle" : `${level.waves} waves`}
                  </small>
                  <Stars count={starsOf(progress, level)} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className={styles.panel}>
        <h2>Star rewards (★ {starCount})</h2>
        <div className={oc.milestones}>
          {OC_STAR_MILESTONES.map((m) => {
            const reached = u.stars >= m.stars;
            return (
              <div className={`${oc.milestone} ${reached ? oc.milestoneOn : ""}`} key={m.stars}>
                <strong>★ {m.stars}</strong>
                <span>{m.label}</span>
                <small>{reached ? "Earned" : `${Math.max(0, m.stars - starCount)} more`}</small>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Prep({ level, progress, unlocks: u, update, onStart, onBack }: {
  level: OcLevel;
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
  const foes = level.kind === "endless" ? metEnemies(u.cleared).filter((kind) => !ENEMIES[kind]?.structure) : [...new Set(level.enemies)];
  const book = spellbookOf(progress, u);
  const cleared = progress.cleared.includes(level.id);
  const met = progress.stars[level.id] ?? [];
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
  const reward = level.reward;
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>{level.name}{KIND_LABEL[level.kind] ? <em className={oc.badge}>{KIND_LABEL[level.kind]}</em> : null}</h1>
          <p>{level.brief}</p>
        </div>
      </div>
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
              <div className={`${styles.foe} ${kind === level.featured ? styles.foeNew : ""}`} key={kind} title={ENEMIES[kind]!.blurb}>
                {kind === level.featured ? <span className={styles.newTag}>New</span> : null}
                <AttackerArt kind={kind} size={56} />
                {ENEMIES[kind]!.name}
              </div>
            ))}
          </div>
          {level.featured ? <p className={styles.note}>{ENEMIES[level.featured]!.name}: {ENEMIES[level.featured]!.blurb}</p> : null}
        </section>
      ) : null}
      {level.goals.length ? (
        <section className={styles.panel}>
          <h2>Goals</h2>
          <div className={oc.resultGoals}>
            <span className={cleared ? oc.starOn : oc.starOff}>{cleared ? "★" : "☆"} Win the battle</span>
            {level.goals.map((goal, i) => <span className={met.includes(i) ? oc.starOn : oc.starOff} key={i}>{met.includes(i) ? "★" : "☆"} {goalText(goal)}</span>)}
          </div>
          {!cleared && (reward.units?.length || reward.hero || reward.artifact || reward.spell || reward.altar) ? (
            <p className={styles.note}>
              Victory recruits: {[
                ...(reward.units ?? []).map((kind) => DEFENDERS[kind]!.name),
                reward.hero ? `the hero ${OC_HEROES[reward.hero].name}` : "",
                reward.artifact ? `the ${BLESSINGS[reward.artifact].name}` : "",
                reward.spell ? `the spell ${SPELLS[reward.spell].name}` : "",
                reward.altar ? "the Ascension Altar" : ""
              ].filter(Boolean).join(", ")}.
            </p>
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
                title={open ? h.blurb : "Recruited later in the campaign."}
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
        <p className={styles.note}>{hero.blurb} Signature spell: {SPELLS[hero.spell].name}.</p>
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
      <section className={styles.panel}>
        {conveyor ? (
          <p className={styles.note}>Conveyor level: your troops arrive on the belt — no seed packets to choose.</p>
        ) : level.kind !== "raid" ? (
          <>
            <h2>Seed packets ({hand.length} / {slots})</h2>
            <div className={styles.slots} aria-label="Your seed packets">
              {hand.map((kind) => (
                <button className={styles.pick} key={kind} onClick={() => toggle(kind)} title={`Remove ${DEFENDERS[kind]!.name}`} type="button">
                  <CardArt card={kind} size={48} />
                  <span>{DEFENDERS[kind]!.name}</span>
                </button>
              ))}
              {Array.from({ length: Math.max(0, slots - hand.length) }, (_, i) => <span className={styles.slotEmpty} key={i} />)}
            </div>
            <div className={styles.pickGrid}>
              {units.map((kind) => {
                const def = DEFENDERS[kind]!;
                const lv = progress.levels[kind] ?? 1;
                const ult = u.ultimates.includes(kind);
                return (
                  <button
                    className={`${styles.pick} ${hand.includes(kind) ? styles.pickOn : ""}`}
                    key={kind}
                    onClick={() => toggle(kind)}
                    title={`${def.name}: ${def.blurb}${def.surge ? ` Surge: ${surgeText(def)}` : ""}${ult ? ` Ascension — ${ultimateLine(kind)}` : ""}`}
                    type="button"
                  >
                    <CardArt card={kind} size={56} />
                    <span>{def.name}</span>
                    <small>{CARDS[kind]!.cost} gold{lv > 1 ? ` · Lv ${lv}` : ""}{ult ? " · ♛" : ""}</small>
                  </button>
                );
              })}
            </div>
            <p className={styles.note}>Hybrids: drop one seed packet on another unit to fuse them — {HYBRIDS.map((kind) => `${recipeText(kind)} = ${DEFENDERS[kind]!.name}`).join("; ")}.</p>
          </>
        ) : null}
        <div className={styles.menuButtons}>
          <button className={styles.primary} disabled={!conveyor && hand.length === 0} onClick={() => onStart(hand)} type="button">To battle!</button>
        </div>
      </section>
    </>
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
      <section className={styles.panel}>
        <div className={oc.barracks}>
          {LAWFUL_CARDS.map((kind) => {
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

type AlmanacTab = "lawful" | "hybrids" | "chaos" | "heroes" | "artifacts" | "spells";

const TAB_LABEL: Record<AlmanacTab, string> = { lawful: "Lawful", hybrids: "Hybrids", chaos: "Chaos", heroes: "Heroes", artifacts: "Artifacts", spells: "Spells" };

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
      <div className={styles.factions} role="tablist" aria-label="Almanac">
        {(["lawful", "hybrids", "chaos", "heroes", "artifacts", "spells"] as const).map((id) => (
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
            const open = u.units.includes(kind);
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
            const recipe = FUSIONS.find((entry) => entry.result === kind);
            const open = recipe !== undefined && recipe.a.some((id) => u.units.includes(id)) && recipe.b.some((id) => u.units.includes(id));
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
            const open = met.has(kind);
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
                  ) : <small>Not yet met.</small>}
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
                    </>
                  ) : <small>Recruited later in the campaign.</small>}
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
      </section>
    </>
  );
}
