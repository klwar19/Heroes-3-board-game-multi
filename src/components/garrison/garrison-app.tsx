"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLESSINGS, BLESSING_ORDER, CARDS, DEFENDERS, DEF_SPELL_ORDER, ATK_SPELL_ORDER, ENEMIES, FACTIONS, FACTION_ORDER, FUSIONS, GW_TPS,
  SPELLS, SPELL_CARD_IDS, factionCards, factionWarband, upgradeChain,
  type CardId, type EnemyKind, type Faction, type SpellId
} from "@/engine/garrison/content";
import { createAttackerAi, createDefenderAi } from "@/engine/garrison/ai";
import {
  ADVENTURE, CONVEYOR_LEVEL, ENDLESS_LEVEL, FRONTS, RAIDS, VERSUS_LEVEL, adventureStage, availableCards, availableSpells, buildConfig,
  defaultLoadout, slotsForStage, unlocksAtStage, warbandCards,
  type FactionChoice, type GarrisonLevel
} from "@/engine/garrison/levels";
import type { Side } from "@/engine/garrison/sim";
import { assetUrl } from "@/lib/asset-url";
import { loadProgress, saveProgress, type GarrisonProgress } from "@/lib/garrison-progress";
import {
  GARRISON_NET_VERSION, createGuestDriver, createHostDriver, newRoomCode, normalizeCode, openLink,
  type Link as NetLink, type NetFrame, type Role
} from "@/lib/garrison-net";
import { useBackgroundMusic } from "@/lib/music";
import { createLocalDriver, type GarrisonDriver } from "./driver";
import { GarrisonGame, type GameIntro, type GameResult } from "./garrison-game";
import styles from "./garrison.module.css";
import { AttackerArt, CardArt, DefenderArt } from "./thumbs";

type Seat = "human" | "ai";

type Session = {
  key: number;
  driver: GarrisonDriver;
  town: string;
  /** Banner colour of the defending garrison. */
  color: string;
  hotseat: boolean;
  level: GarrisonLevel;
  restart?: () => void;
  online: boolean;
};

type Screen =
  | { s: "home" }
  | { s: "adventure" }
  | { s: "loadout"; level: GarrisonLevel }
  | { s: "raids" }
  | { s: "versus" }
  | { s: "almanac" }
  | { s: "play" };

const seed = () => Math.floor(Math.random() * 2147483647);
const townOf = (choice: FactionChoice) => (choice === "mixed" ? "castle" : choice);
/** Neutrals and sellswords who march with the Tide (campaign waves only). */
const NEUTRAL_MARCHERS = Object.values(ENEMIES)
  .filter((def) => def.faction === "neutral" && def.cost > 0 && !def.structure && def.kind !== "mummy")
  .sort((x, y) => x.cost - y.cost)
  .map((def) => def.kind);

/** The defending garrison's banner colour (the keep's pennants). */
const colorOf = (choice: FactionChoice) => (choice === "mixed" ? "#c9a24a" : FACTIONS[choice].color);

/**
 * The level intro: its name, and for the wave modes the foes waiting beyond
 * the road (the camera pans out to them before "Ready… Set… Defend!").
 */
function introFor(level: GarrisonLevel): GameIntro {
  const waves = level.mode === "adventure" || level.mode === "endless" || level.mode === "conveyor";
  const kinds = [...new Set([...(level.featured ? [level.featured] : []), ...level.enemies])].filter((kind) => ENEMIES[kind] && !ENEMIES[kind]!.structure);
  // Endless: a sample from across the warbands.
  const lineup = level.endless ? kinds.filter((_, i) => i % Math.max(1, Math.floor(kinds.length / 10)) === 0).slice(0, 10) : kinds.slice(0, 10);
  return {
    title: level.name,
    lineup: waves ? lineup : [],
    cue: level.mode === "raid" || level.mode === "versus" ? "Fight!" : "Defend!"
  };
}
const MIXED_ICON = "/assets/tide/mode-versus.webp";

function crest(choice: FactionChoice | undefined): string {
  return !choice || choice === "mixed" ? MIXED_ICON : FACTIONS[choice].crest;
}

function FactionChips({ value, onChange, allowMixed = true, label }: { value: FactionChoice; onChange(next: FactionChoice): void; allowMixed?: boolean; label: string }) {
  const options: FactionChoice[] = allowMixed ? [...FACTION_ORDER, "mixed"] : [...FACTION_ORDER];
  return (
    <div aria-label={label} className={styles.factions} role="radiogroup">
      {options.map((choice) => (
        <button
          aria-checked={value === choice}
          className={`${styles.faction} ${value === choice ? styles.factionOn : ""}`}
          key={choice}
          onClick={() => onChange(choice)}
          role="radio"
          title={choice === "mixed" ? "Mixed banners: every town's troops" : `${FACTIONS[choice].garrison} / ${FACTIONS[choice].warband}`}
          type="button"
        >
          <img alt="" src={assetUrl(crest(choice))} />
          {choice === "mixed" ? "Mixed" : FACTIONS[choice].name}
        </button>
      ))}
    </div>
  );
}

/** Card picker: toggles cards into an ordered hand of at most `slots`. */
function CardPicker({ pool, locked, hand, slots, onChange }: {
  pool: CardId[];
  locked: CardId[];
  hand: CardId[];
  slots: number;
  onChange(next: CardId[]): void;
}) {
  const toggle = (id: CardId) => {
    if (hand.includes(id)) onChange(hand.filter((card) => card !== id));
    else if (hand.length < slots) onChange([...hand, id]);
  };
  // Mixed banners: filter the (long) pool by town; spell cards file under "Spells".
  const [filter, setFilter] = useState<Faction | "neutral" | "all">("all");
  const towns = FACTION_ORDER.filter((f) => [...pool, ...locked].some((id) => CARDS[id]?.faction === f));
  const shown = (id: CardId) => filter === "all" || CARDS[id]?.faction === filter;
  const mixedFactions = new Set(hand.map((id) => CARDS[id]?.faction).filter((f) => f && f !== "neutral")).size;
  return (
    <>
      {towns.length > 1 ? (
        <div aria-label="Filter by town" className={styles.pickFilter} role="tablist">
          {(["all", ...towns, "neutral"] as const).map((f) => (
            <button aria-selected={filter === f} className={`${styles.filterChip} ${filter === f ? styles.filterOn : ""}`} key={f} onClick={() => setFilter(f)} role="tab" type="button">
              {f !== "all" && f !== "neutral" ? <img alt="" src={assetUrl(FACTIONS[f].crest)} /> : null}
              {f === "all" ? "All" : f === "neutral" ? "Spells" : FACTIONS[f].name}
            </button>
          ))}
          {mixedFactions > 1 ? <span className={styles.note}>Your hand flies {mixedFactions} banners.</span> : null}
        </div>
      ) : null}
      <div className={styles.slots} aria-label="Your hand">
        {hand.map((id) => (
          <button className={styles.pick} key={id} onClick={() => toggle(id)} title={`Remove ${CARDS[id]!.name}`} type="button">
            <CardArt card={id} size={48} />
            <span>{CARDS[id]!.name}</span>
          </button>
        ))}
        {Array.from({ length: Math.max(0, slots - hand.length) }, (_, i) => <span className={styles.slotEmpty} key={i} />)}
      </div>
      <div className={styles.pickGrid}>
        {pool.filter(shown).map((id) => {
          const def = CARDS[id]!;
          const on = hand.includes(id);
          return (
            <button
              className={`${styles.pick} ${on ? styles.pickOn : ""}`}
              key={id}
              onClick={() => toggle(id)}
              title={`${def.name}: ${def.blurb}`}
              type="button"
            >
              <CardArt card={id} size={56} />
              <span>{def.name}</span>
              <small>{def.cost} gold</small>
            </button>
          );
        })}
        {locked.filter(shown).map((id) => {
          const def = CARDS[id]!;
          return (
            <div className={`${styles.pick} ${styles.pickLocked}`} key={id} title={`Unlocks after adventure level ${def.stage}`}>
              <CardArt card={id} size={56} />
              <span>{def.name}</span>
              <small>Level {def.stage}</small>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function GarrisonApp() {
  const [screen, setScreen] = useState<Screen>({ s: "home" });
  const [progress, setProgress] = useState<GarrisonProgress>(loadProgress);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const replaceSession = useCallback((next: Session | null) => {
    sessionRef.current?.driver.dispose();
    sessionRef.current = next;
    setSession(next);
  }, []);
  const [unlockNote, setUnlockNote] = useState<React.ReactNode>(null);
  const [nextLevel, setNextLevel] = useState<GarrisonLevel | null>(null);
  // The game screen asks for "combat" itself; asking for the same scene here
  // keeps this (parent) effect from switching the music off after it starts.
  useBackgroundMusic(screen.s === "play" ? "combat" : "menu");


  const update = useCallback((change: (p: GarrisonProgress) => GarrisonProgress) => {
    setProgress((current) => {
      const next = change(current);
      saveProgress(next);
      return next;
    });
  }, []);

  const stage = adventureStage(progress.cleared);

  const endSession = useCallback(() => {
    replaceSession(null);
    setUnlockNote(null);
    setNextLevel(null);
  }, [replaceSession]);

  // ---- Local games -----------------------------------------------------------
  const startLocal = useCallback((level: GarrisonLevel, options: {
    cards: CardId[];
    spells: SpellId[];
    defFaction: FactionChoice;
    atkFaction?: FactionChoice;
    atkCards?: EnemyKind[];
    seats: { def: Seat; atk: Seat };
  }) => {
    const build = () => {
      const config = buildConfig(level, {
        seed: seed(), cards: options.cards, spells: options.spells, atkCards: options.atkCards,
        defFaction: options.defFaction, atkFaction: options.atkFaction,
        ai: { def: options.seats.def === "ai", atk: options.seats.atk === "ai" }
      });
      const local: Side[] = [];
      if (options.seats.def === "human") local.push("def");
      if (options.seats.atk === "human") local.push("atk");
      const versus = level.mode === "versus";
      const ai = {
        def: versus && options.seats.def === "ai" ? createDefenderAi(config.seed) : undefined,
        atk: versus && options.seats.atk === "ai" ? createAttackerAi(config.seed) : undefined
      };
      return createLocalDriver(config, local, ai);
    };
    const launch = () => {
      setUnlockNote(null);
      setNextLevel(null);
      replaceSession({
        key: Date.now(), driver: build(), town: townOf(options.defFaction), color: colorOf(options.defFaction),
        hotseat: options.seats.def === "human" && options.seats.atk === "human", level, restart: launch, online: false
      });
      setScreen({ s: "play" });
    };
    launch();
  }, [replaceSession]);

  const onFinish = useCallback((result: GameResult) => {
    const level = session?.level;
    if (!level) return;
    if (level.mode === "adventure" && result.winner === "def" && !ADVENTURE.some((l) => l.id === level.id)) {
      // Another front: remembered as won, the campaign does not advance.
      update((p) => ({ ...p, cleared: p.cleared.includes(level.id) ? p.cleared : [...p.cleared, level.id] }));
    } else if (level.mode === "adventure" && result.winner === "def") {
      const index = ADVENTURE.findIndex((l) => l.id === level.id);
      if (!progress.cleared.includes(level.id)) {
        const cleared = [...progress.cleared, level.id];
        update((p) => ({ ...p, cleared: p.cleared.includes(level.id) ? p.cleared : [...p.cleared, level.id] }));
        const newStage = adventureStage(cleared);
        if (newStage > stage) {
          const gained = unlocksAtStage(progress.faction, newStage);
          const opened = FRONTS.filter((front) => front.unlock > stage && front.unlock <= newStage);
          if (gained.cards.length || gained.spells.length || opened.length) {
            setUnlockNote(
              <div className={styles.panel}>
                <h2>New for your garrison</h2>
                <div className={styles.foes}>
                  {gained.cards.map((id) => (
                    <div className={styles.foe} key={id}><CardArt card={id} size={56} />{CARDS[id]!.name}</div>
                  ))}
                  {gained.spells.map((id) => (
                    <div className={styles.foe} key={id}><img alt="" src={assetUrl(SPELLS[id].icon)} style={{ width: 56, height: 56 }} />{SPELLS[id].name}</div>
                  ))}
                </div>
                {opened.length ? <p className={styles.note}>New front opened: {opened.map((front) => front.name).join(", ")}.</p> : null}
              </div>
            );
          }
        }
      }
      setNextLevel(ADVENTURE[index + 1] ?? null);
    }
    if (level.mode === "raid" && result.winner === "atk") {
      update((p) => ({ ...p, raids: p.raids.includes(level.id) ? p.raids : [...p.raids, level.id] }));
    }
    if (level.endless) {
      const waves = result.state.director.wave;
      update((p) => ({ ...p, bestEndless: Math.max(p.bestEndless, waves) }));
    }
  }, [progress, session, stage, update]);

  // ---- Online ------------------------------------------------------------------
  const netRef = useRef<{ link: NetLink | null; role: Role | null; driver: (GarrisonDriver & { receive(frame: NetFrame): void }) | null }>({ link: null, role: null, driver: null });
  const [net, setNet] = useState<{ phase: "idle" | "waiting" | "ready" | "joined"; code: string; role: Role | null; error: string | null; peer: boolean }>({
    phase: "idle", code: "", role: null, error: null, peer: false
  });

  useEffect(() => () => {
    // Leaving the page mid-match ends the session and closes an online link.
    sessionRef.current?.driver.dispose();
    sessionRef.current = null;
    netRef.current.link?.close();
  }, []);

  const closeNet = useCallback(() => {
    netRef.current.link?.close();
    netRef.current = { link: null, role: null, driver: null };
    setNet({ phase: "idle", code: "", role: null, error: null, peer: false });
  }, []);

  const connect = useCallback((code: string) => {
    netRef.current.link?.close();
    setNet({ phase: "waiting", code, role: null, error: null, peer: false });
    const link = openLink(code, {
      onFrame(frame) {
        const ref = netRef.current;
        if (ref.driver) {
          ref.driver.receive(frame);
          return;
        }
        if (frame.k === "hello") {
          ref.role = frame.role;
          setNet((n) => ({ ...n, role: frame.role, phase: frame.role === "host" ? "waiting" : "joined" }));
        } else if (frame.k === "full") {
          ref.link?.close();
          ref.link = null;
          setNet((n) => ({ ...n, error: "That duel already has two players.", phase: "idle" }));
        } else if (frame.k === "peer") {
          setNet((n) => ({ ...n, peer: frame.present, phase: frame.present && ref.role === "host" ? "ready" : n.phase }));
        } else if (frame.k === "start" && ref.role === "guest" && ref.link) {
          if (frame.version !== GARRISON_NET_VERSION) {
            ref.link.close();
            ref.link = null;
            setNet((n) => ({ ...n, phase: "idle", error: "You and the host run different versions of the game. Reload both pages." }));
            return;
          }
          const driver = createGuestDriver(frame.config, frame.guestSide, ref.link, frame.seq + 1);
          ref.driver = driver;
          const lobby = frame.lobby as { defFaction?: FactionChoice } | undefined;
          replaceSession({ key: Date.now(), driver, town: townOf(lobby?.defFaction ?? "castle"), color: colorOf(lobby?.defFaction ?? "castle"), hotseat: false, level: VERSUS_LEVEL, online: true });
          setScreen({ s: "play" });
        }
      },
      onClosed(reason) {
        const ref = netRef.current;
        // Mid-match: the driver shows "your opponent left" and the match stops being fed.
        if (ref.driver) ref.driver.receive({ k: "bye" });
        else setNet((n) => ({ ...n, error: n.error ?? reason, phase: "idle" }));
      }
    });
    netRef.current.link = link;
  }, [replaceSession]);

  const hostStart = useCallback((options: { hostSide: Side; defFaction: FactionChoice; atkFaction: FactionChoice; cards: CardId[]; atkCards: EnemyKind[] }) => {
    const ref = netRef.current;
    if (!ref.link || ref.role !== "host") return;
    const config = buildConfig(VERSUS_LEVEL, {
      seed: seed(), cards: options.cards, spells: [...DEF_SPELL_ORDER.slice(0, 3)], atkCards: options.atkCards,
      defFaction: options.defFaction, atkFaction: options.atkFaction, ai: { def: false, atk: false }
    });
    const guestSide: Side = options.hostSide === "def" ? "atk" : "def";
    ref.link.send({ k: "start", seq: 0, version: GARRISON_NET_VERSION, config, guestSide, lobby: { defFaction: options.defFaction } });
    const driver = createHostDriver(config, options.hostSide, ref.link, 1);
    ref.driver = driver;
    replaceSession({ key: Date.now(), driver, town: townOf(options.defFaction), color: colorOf(options.defFaction), hotseat: false, level: VERSUS_LEVEL, online: true });
    setScreen({ s: "play" });
  }, [replaceSession]);

  // ---- Screens -------------------------------------------------------------------
  if (screen.s === "play" && session) {
    const next = nextLevel;
    return (
      <div className={styles.shell}>
        <GarrisonGame
          driver={session.driver}
          hotseat={session.hotseat}
          key={session.key}
          next={next ? { label: `Next: ${next.name}`, onNext: () => { endSession(); setScreen({ s: "loadout", level: next }); } } : null}
          onFinish={onFinish}
          onLeave={() => {
            const wasOnline = session.online;
            endSession();
            if (wasOnline) closeNet();
            netRef.current.driver = null;
            setScreen(session.level.mode === "adventure" ? { s: "adventure" } : session.level.mode === "raid" ? { s: "raids" } : session.level.mode === "versus" ? { s: "versus" } : { s: "home" });
          }}
          onRestart={session.restart}
          town={session.town}
          defColor={session.color}
          intro={session.online ? null : introFor(session.level)}
          unlockNote={unlockNote}
        />
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <div className={styles.menu} style={{ backgroundImage: `url("${assetUrl("/assets/tide/menu-backdrop.webp")}")` }}>
        {screen.s === "home" ? (
          <Home
            onConveyor={() => startLocal(CONVEYOR_LEVEL, { cards: [], spells: availableSpells(), defFaction: progress.faction, seats: { def: "human", atk: "ai" } })}
            onPick={setScreen}
            progress={progress}
          />
        ) : null}
        {screen.s === "adventure" ? (
          <Adventure
            onBack={() => setScreen({ s: "home" })}
            onFaction={(faction) => update((p) => ({ ...p, faction }))}
            onPick={(level) => setScreen({ s: "loadout", level })}
            progress={progress}
            stage={stage}
          />
        ) : null}
        {screen.s === "loadout" ? (
          <Loadout
            key={`${screen.level.id}:${progress.faction}`}
            level={screen.level}
            onBack={() => setScreen(screen.level.mode === "adventure" ? { s: "adventure" } : { s: "home" })}
            onFaction={(faction) => update((p) => ({ ...p, faction }))}
            onStart={(cards, spells) => {
              update((p) => ({ ...p, loadouts: { ...p.loadouts, [screen.level.id]: cards } }));
              startLocal(screen.level, { cards, spells, defFaction: progress.faction, seats: { def: "human", atk: "ai" } });
            }}
            progress={progress}
            stage={screen.level.mode === "adventure" ? stage : Number.MAX_SAFE_INTEGER}
          />
        ) : null}
        {screen.s === "raids" ? (
          <Raids
            onBack={() => setScreen({ s: "home" })}
            onPick={(level) => startLocal(level, { cards: [], spells: [], defFaction: "castle", seats: { def: "ai", atk: "human" } })}
            progress={progress}
          />
        ) : null}
        {screen.s === "versus" ? (
          <Versus
            connect={connect}
            hostStart={hostStart}
            net={net}
            onBack={() => { closeNet(); setScreen({ s: "home" }); }}
            onCancelNet={closeNet}
            onLocal={(options) => startLocal(VERSUS_LEVEL, options)}
          />
        ) : null}
        {screen.s === "almanac" ? <Almanac onBack={() => setScreen({ s: "home" })} /> : null}
      </div>
    </div>
  );
}

function Home({ onPick, onConveyor, progress: p }: { onPick(next: Screen): void; onConveyor(): void; progress: GarrisonProgress }) {
  return (
    <>
      <div className={styles.menuHead}>
        <div>
          <h1>Garrison Wars</h1>
          <p>Hold the gate, or break it. Every town of Antagarich can defend a castle — or march against one.</p>
        </div>
        <Link className={`${styles.ghostButton} ${styles.back}`} href="/single-player" style={{ marginLeft: "auto", marginRight: 0 }}>Back</Link>
      </div>
      <div className={styles.modes}>
        <button className={styles.mode} onClick={() => onPick({ s: "adventure" })} type="button">
          <img alt="" src={assetUrl("/assets/tide/mode-adventure.webp")} />
          <strong>Adventure</strong>
          <span>{ADVENTURE.length} nights against the Undead Tide and everything that marches with it — Eeofol&apos;s demons, DOOM&apos;s hell-spawn, Nighon raiders, sellswords — ending with the Dracolich. Unlocks troops, spells and other fronts. ({adventureStage(p.cleared)} / {ADVENTURE.length})</span>
        </button>
        <button className={styles.mode} onClick={() => onPick({ s: "loadout", level: ENDLESS_LEVEL })} type="button">
          <img alt="" src={assetUrl("/assets/tide/mode-endless.webp")} />
          <strong>Endless Siege</strong>
          <span>Survive forever; pick an artifact after every flag.{p.bestEndless ? ` Best: wave ${p.bestEndless}.` : ""}</span>
        </button>
        <button
          className={styles.mode}
          onClick={onConveyor}
          type="button"
        >
          <img alt="" src={assetUrl("/assets/tide/mode-conveyor.webp")} />
          <strong>Summoning Belt</strong>
          <span>No gold: creatures of every town arrive on a belt. Fuse them into hybrids.</span>
        </button>
        <button className={styles.mode} onClick={() => onPick({ s: "raids" })} type="button">
          <img alt="" src={assetUrl("/assets/tide/mode-raider.webp")} />
          <strong>Raids</strong>
          <span>Play the attacker against a prepared garrison. Break every lane. ({p.raids.length} / {RAIDS.length})</span>
        </button>
        <button className={styles.mode} onClick={() => onPick({ s: "versus" })} type="button">
          <img alt="" src={assetUrl("/assets/tide/mode-versus.webp")} />
          <strong>Versus</strong>
          <span>Defender vs attacker: against the computer, two players on one screen, or online.</span>
        </button>
        <button className={styles.mode} onClick={() => onPick({ s: "almanac" })} type="button">
          <img alt="" src={assetUrl("/assets/spells-visions.webp")} />
          <strong>Almanac</strong>
          <span>Every garrison, warband, fusion, spell and artifact.</span>
        </button>
      </div>
    </>
  );
}

function Adventure({ progress, stage, onPick, onBack, onFaction }: {
  progress: GarrisonProgress;
  stage: number;
  onPick(level: GarrisonLevel): void;
  onBack(): void;
  onFaction(faction: FactionChoice): void;
}) {
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Adventure</h1>
          <p>Choose the banner you defend under. Every victory strengthens every garrison.</p>
        </div>
      </div>
      <section className={styles.panel}>
        <h2>Your garrison</h2>
        <FactionChips label="Garrison faction" onChange={onFaction} value={progress.faction} />
      </section>
      <section className={styles.panel}>
        <h2>Campaign</h2>
        <div className={styles.levels}>
          {ADVENTURE.map((level, index) => {
            const cleared = progress.cleared.includes(level.id);
            const locked = index > stage;
            return (
              <button
                className={`${styles.level} ${cleared ? styles.levelCleared : ""}`}
                disabled={locked}
                key={level.id}
                onClick={() => onPick(level)}
                type="button"
              >
                <img alt="" src={assetUrl(crest(level.foe))} />
                <span>
                  <strong>{index + 1}. {level.name}{cleared ? " ✓" : ""}</strong>
                  <small>{level.boss ? "Boss battle" : `${level.waves} waves`} · {level.foe && level.foe !== "mixed" ? FACTIONS[level.foe].warband : "Mixed warbands"}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className={styles.panel}>
        <h2>Other fronts</h2>
        <p className={styles.note}>Single warbands on their own. They use your campaign troops and do not advance the campaign.</p>
        <div className={styles.levels}>
          {FRONTS.map((level) => {
            const cleared = progress.cleared.includes(level.id);
            const locked = stage < level.unlock;
            return (
              <button
                className={`${styles.level} ${cleared ? styles.levelCleared : ""}`}
                disabled={locked}
                key={level.id}
                onClick={() => onPick(level)}
                title={locked ? `Opens after campaign night ${level.unlock}` : level.brief}
                type="button"
              >
                <img alt="" src={assetUrl(crest(level.foe))} />
                <span>
                  <strong>{level.name}{cleared ? " ✓" : ""}</strong>
                  <small>{locked ? `Opens after night ${level.unlock}` : `${level.waves} waves · ${level.foe && level.foe !== "mixed" ? FACTIONS[level.foe].warband : "Mixed warbands"}`}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Loadout({ level, progress, stage, onStart, onBack, onFaction }: {
  level: GarrisonLevel;
  progress: GarrisonProgress;
  stage: number;
  onStart(cards: CardId[], spells: SpellId[]): void;
  onBack(): void;
  onFaction(faction: FactionChoice): void;
}) {
  const faction = progress.faction;
  const slots = level.mode === "adventure" ? slotsForStage(stage) : 10;
  const pool = availableCards(faction, stage);
  const everything = faction === "mixed" ? FACTION_ORDER.flatMap((f) => factionCards(f)) : factionCards(faction);
  const locked = [...everything, ...SPELL_CARD_IDS].filter((id) => !pool.includes(id));
  const saved = progress.loadouts[level.id]?.filter((id) => pool.includes(id)) ?? [];
  const [hand, setHand] = useState<CardId[]>(() => (saved.length ? saved.slice(0, slots) : defaultLoadout(faction, stage, slots)));
  const spells = availableSpells(stage);
  const foes = [...new Set(level.enemies)];
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>{level.name}</h1>
          <p>{level.brief}</p>
        </div>
      </div>
      {foes.length ? (
        <section className={styles.panel}>
          <h2>Scouts report</h2>
          <div className={styles.foes}>
            {foes.slice(0, 24).map((kind) => (
              <div className={`${styles.foe} ${kind === level.featured ? styles.foeNew : ""}`} key={kind} title={ENEMIES[kind]!.blurb}>
                {kind === level.featured ? <span className={styles.newTag}>New</span> : null}
                <AttackerArt kind={kind} size={56} />
                {ENEMIES[kind]!.name}
              </div>
            ))}
            {foes.length > 24 ? <div className={styles.foe}>…and {foes.length - 24} more</div> : null}
          </div>
        </section>
      ) : null}
      <section className={styles.panel}>
        <h2>Garrison banner</h2>
        <FactionChips label="Garrison faction" onChange={onFaction} value={faction} />
        <h2>Choose up to {slots} cards</h2>
        <CardPicker hand={hand} locked={level.mode === "adventure" ? locked : []} onChange={setHand} pool={pool} slots={slots} />
        {spells.length ? (
          <p className={styles.note}>Hero spells: {spells.map((id) => SPELLS[id].name).join(", ")}.</p>
        ) : null}
        <div className={styles.menuButtons}>
          <button className={styles.primary} disabled={hand.length === 0} onClick={() => onStart(hand, spells)} type="button">To battle!</button>
        </div>
      </section>
    </>
  );
}

function Raids({ progress, onPick, onBack }: { progress: GarrisonProgress; onPick(level: GarrisonLevel): void; onBack(): void }) {
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Raids</h1>
          <p>You command the attackers. Muster troops right of the red line and break through the end of every lane.</p>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.levels}>
          {RAIDS.map((level) => (
            <button className={`${styles.level} ${progress.raids.includes(level.id) ? styles.levelCleared : ""}`} key={level.id} onClick={() => onPick(level)} type="button">
              <img alt="" src={assetUrl(crest(level.foe))} />
              <span>
                <strong>{level.name}{progress.raids.includes(level.id) ? " ✓" : ""}</strong>
                <small>{level.brief}</small>
                <small>Might {level.startMight} · {(level.atkCards ?? []).map((k) => ENEMIES[k]!.name).join(", ")}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

type VersusMode = "defend" | "attack" | "hotseat" | "online";

function Versus({ onBack, onLocal, net, connect, hostStart, onCancelNet }: {
  onBack(): void;
  onLocal(options: { cards: CardId[]; spells: SpellId[]; defFaction: FactionChoice; atkFaction: FactionChoice; atkCards: EnemyKind[]; seats: { def: Seat; atk: Seat } }): void;
  net: { phase: "idle" | "waiting" | "ready" | "joined"; code: string; role: Role | null; error: string | null; peer: boolean };
  connect(code: string): void;
  hostStart(options: { hostSide: Side; defFaction: FactionChoice; atkFaction: FactionChoice; cards: CardId[]; atkCards: EnemyKind[] }): void;
  onCancelNet(): void;
}) {
  const [mode, setMode] = useState<VersusMode>("defend");
  const [defFaction, setDefFaction] = useState<FactionChoice>("castle");
  const [atkFaction, setAtkFaction] = useState<FactionChoice>("necropolis");
  const [hostSide, setHostSide] = useState<Side>("def");
  const [joinCode, setJoinCode] = useState("");
  const defPool = useMemo(() => availableCards(defFaction), [defFaction]);
  const [cards, setCards] = useState<CardId[]>(() => defaultLoadout("castle", 99, 10));
  const atkPool = useMemo(() => warbandCards(atkFaction), [atkFaction]);
  const [atkCards, setAtkCards] = useState<EnemyKind[]>(() => warbandCards("necropolis").slice(0, 10));
  const chooseDefFaction = (choice: FactionChoice) => {
    setDefFaction(choice);
    setCards(defaultLoadout(choice, 99, 10));
  };
  const chooseAtkFaction = (choice: FactionChoice) => {
    setAtkFaction(choice);
    setAtkCards(warbandCards(choice).slice(0, 10));
  };
  const toggleAtk = (kind: EnemyKind) => {
    setAtkCards((current) => current.includes(kind) ? current.filter((k) => k !== kind) : current.length < 10 ? [...current, kind] : current);
  };
  const seats: Record<Exclude<VersusMode, "online">, { def: Seat; atk: Seat }> = {
    defend: { def: "human", atk: "ai" },
    attack: { def: "ai", atk: "human" },
    hotseat: { def: "human", atk: "human" }
  };
  const ready = cards.length > 0 && atkCards.some((k) => k !== "tent");
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Versus</h1>
          <p>The defender wins by toppling 3 war banners; the attacker wins by breaking through any lane. Attackers earn Might over time and from Supply Tents.</p>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.tabs} role="tablist">
          {([
            ["defend", "Defend vs Computer"],
            ["attack", "Attack vs Computer"],
            ["hotseat", "Two players, one screen"],
            ["online", "Online duel"]
          ] as const).map(([id, label]) => (
            <button aria-selected={mode === id} className={`${styles.faction} ${mode === id ? styles.factionOn : ""}`} key={id} onClick={() => setMode(id)} role="tab" type="button">
              {label}
            </button>
          ))}
        </div>
        {mode === "hotseat" ? (
          <p className={styles.note}>Defender: mouse (and 1–0 for cards). Attacker: ↑/↓ choose a lane, A S D F G H J K L ; muster, Z X C spells.</p>
        ) : null}
        <div className={styles.sides}>
          <div>
            <h2>Defender</h2>
            <FactionChips label="Defender faction" onChange={chooseDefFaction} value={defFaction} />
            <CardPicker hand={cards} locked={[]} onChange={setCards} pool={defPool} slots={10} />
          </div>
          <div>
            <h2>Attacker</h2>
            <FactionChips label="Attacker faction" onChange={chooseAtkFaction} value={atkFaction} />
            <div className={styles.slots}>
              {atkCards.map((kind) => (
                <button className={styles.pick} key={kind} onClick={() => toggleAtk(kind)} type="button">
                  <AttackerArt kind={kind} size={48} />
                  <span>{ENEMIES[kind]!.name}</span>
                </button>
              ))}
            </div>
            <div className={styles.pickGrid}>
              {atkPool.map((kind) => (
                <button className={`${styles.pick} ${atkCards.includes(kind) ? styles.pickOn : ""}`} key={kind} onClick={() => toggleAtk(kind)} title={ENEMIES[kind]!.blurb} type="button">
                  <AttackerArt kind={kind} size={56} />
                  <span>{ENEMIES[kind]!.name}</span>
                  <small>{ENEMIES[kind]!.might} Might</small>
                </button>
              ))}
            </div>
          </div>
        </div>
        {mode !== "online" ? (
          <div className={styles.menuButtons}>
            <button
              className={styles.primary}
              disabled={!ready}
              onClick={() => onLocal({ cards, spells: [...DEF_SPELL_ORDER.slice(0, 3)], defFaction, atkFaction, atkCards, seats: seats[mode] })}
              type="button"
            >
              Start duel
            </button>
          </div>
        ) : (
          <div className={styles.panel}>
            {net.phase === "idle" ? (
              <div className={styles.row}>
                <button className={styles.primary} onClick={() => connect(newRoomCode())} type="button">Host a duel</button>
                <span className={styles.note}>or join with a code:</span>
                <input
                  aria-label="Duel code"
                  className={styles.input}
                  maxLength={8}
                  onChange={(event) => setJoinCode(normalizeCode(event.target.value))}
                  placeholder="CODE"
                  value={joinCode}
                />
                <button className={styles.ghostButton} disabled={joinCode.length < 4} onClick={() => connect(joinCode)} type="button">Join</button>
              </div>
            ) : (
              <div className={styles.row}>
                <span>Duel code: <span className={styles.code}>{net.code}</span></span>
                {net.role === "host" ? (
                  <>
                    <span className={styles.note}>{net.peer ? "Your opponent is here." : "Share the code and wait for your opponent…"}</span>
                    <span className={styles.seatSelect}>
                      <button className={`${styles.faction} ${hostSide === "def" ? styles.factionOn : ""}`} onClick={() => setHostSide("def")} type="button">I defend</button>
                      <button className={`${styles.faction} ${hostSide === "atk" ? styles.factionOn : ""}`} onClick={() => setHostSide("atk")} type="button">I attack</button>
                    </span>
                    <button
                      className={styles.primary}
                      disabled={!net.peer || !ready}
                      onClick={() => hostStart({ hostSide, defFaction, atkFaction, cards, atkCards })}
                      type="button"
                    >
                      Start duel
                    </button>
                  </>
                ) : net.role === "guest" ? (
                  <span className={styles.note}>Connected. The host picks the armies and starts the duel.</span>
                ) : (
                  <span className={styles.note}>Connecting…</span>
                )}
                <button className={styles.ghostButton} onClick={onCancelNet} type="button">Cancel</button>
              </div>
            )}
            {net.error ? <p className={styles.note} role="alert">{net.error}</p> : null}
            <p className={styles.note}>The host&apos;s armies and cards above are used for both sides. The host runs the battle; the guest follows it live.</p>
          </div>
        )}
      </section>
    </>
  );
}

type AlmanacTab = "garrison" | "warband" | "fusions" | "spells" | "artifacts";

function Almanac({ onBack }: { onBack(): void }) {
  const [tab, setTab] = useState<AlmanacTab>("garrison");
  const [faction, setFaction] = useState<Faction>("castle");
  const seconds = (ticks: number) => `${Math.round((ticks / GW_TPS) * 10) / 10} s`;
  return (
    <>
      <div className={styles.menuHead}>
        <button className={styles.ghostButton} onClick={onBack} type="button">Back</button>
        <div>
          <h1>Almanac</h1>
          <p>Everything that fights on the lawn.</p>
        </div>
      </div>
      <section className={styles.panel}>
        <div className={styles.tabs} role="tablist">
          {([
            ["garrison", "Garrisons"], ["warband", "Warbands"], ["fusions", "Fusions"], ["spells", "Spells & cards"], ["artifacts", "Artifacts"]
          ] as const).map(([id, label]) => (
            <button aria-selected={tab === id} className={`${styles.faction} ${tab === id ? styles.factionOn : ""}`} key={id} onClick={() => setTab(id)} role="tab" type="button">{label}</button>
          ))}
        </div>
        {tab === "garrison" || tab === "warband" ? (
          <FactionChips allowMixed={false} label="Faction" onChange={(f) => setFaction(f as Faction)} value={faction} />
        ) : null}
        {tab === "garrison" ? factionCards(faction).flatMap((id) => {
          const chain = upgradeChain(id).map((kind) => DEFENDERS[kind]!);
          return chain.map((def, i) => (
            <div className={styles.almanacEntry} key={def.kind}>
              <DefenderArt kind={def.kind} size={64} />
              <div>
                <strong>{def.name}</strong>
                <small>
                  {i === 0 ? `${CARDS[id]!.cost} gold · recharge ${seconds(CARDS[id]!.recharge)} · unlocks after level ${CARDS[id]!.stage}` : `Upgrade for ${chain[i - 1]!.upgrade!.cost} gold`} · {def.hp} HP
                </small>
                <p>{def.blurb}</p>
              </div>
            </div>
          ));
        }) : null}
        {tab === "warband" ? [
          ...factionWarband(faction),
          // Never drafted or mustered, but they do march: the standard-bearer and the thrown runt.
          ...(faction === "necropolis" ? ["tide-herald", "ghoul-runt"] : []),
          ...NEUTRAL_MARCHERS
        ].map((kind, index) => {
          const def = ENEMIES[kind]!;
          return (
            <div className={styles.almanacEntry} key={kind}>
              <AttackerArt kind={kind} size={64} />
              <div>
                <strong>{def.name}{def.faction === "neutral" && index >= factionWarband(faction).length ? " (neutral)" : ""}</strong>
                <small>{def.hp} HP{def.shield ? ` + ${def.shield} shield` : ""}{def.armor ? ` + ${def.armor} armour` : ""} · {def.bite > 0 ? `${def.bite} per strike` : "ranged"}{def.cost > 0 && def.faction !== "neutral" ? ` · ${def.might} Might in versus` : ""}</small>
                <p>{def.blurb}</p>
              </div>
            </div>
          );
        }) : null}
        {tab === "fusions" ? FUSIONS.map((recipe) => {
          const def = DEFENDERS[recipe.result]!;
          return (
            <div className={styles.almanacEntry} key={recipe.result}>
              <DefenderArt kind={recipe.result} size={64} />
              <div>
                <strong>{def.name}</strong>
                <small>{recipe.a.map((id) => CARDS[id]!.name).join(" / ")} + {recipe.b.map((id) => CARDS[id]!.name).join(" / ")}</small>
                <p>{def.blurb}</p>
              </div>
            </div>
          );
        }) : null}
        {tab === "spells" ? (
          <>
            {SPELL_CARD_IDS.map((id) => (
              <div className={styles.almanacEntry} key={id}>
                <CardArt card={id} size={56} />
                <div>
                  <strong>{CARDS[id]!.name}</strong>
                  <small>Card · {CARDS[id]!.cost} gold · recharge {seconds(CARDS[id]!.recharge)}</small>
                  <p>{CARDS[id]!.blurb}</p>
                </div>
              </div>
            ))}
            {[...DEF_SPELL_ORDER, ...ATK_SPELL_ORDER].map((id) => (
              <div className={styles.almanacEntry} key={id}>
                <img alt="" src={assetUrl(SPELLS[id].icon)} style={{ width: 56, height: 56, borderRadius: 6 }} />
                <div>
                  <strong>{SPELLS[id].name}</strong>
                  <small>{SPELLS[id].side === "def" ? "Defending hero" : "Attacking hero"} · {SPELLS[id].mana} mana</small>
                  <p>{SPELLS[id].blurb}</p>
                </div>
              </div>
            ))}
          </>
        ) : null}
        {tab === "artifacts" ? BLESSING_ORDER.map((id) => (
          <div className={styles.almanacEntry} key={id}>
            <img alt="" src={assetUrl(BLESSINGS[id].icon)} style={{ width: 56, height: 56, borderRadius: 6, objectFit: "cover" }} />
            <div>
              <strong>{BLESSINGS[id].name}</strong>
              <small>Endless Siege artifact{BLESSINGS[id].repeatable ? " · can be found again" : ""}</small>
              <p>{BLESSINGS[id].blurb}</p>
            </div>
          </div>
        )) : null}
      </section>
    </>
  );
}
