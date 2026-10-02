"use client";

/**
 * Order & Chaos: the Forge (hero ranks, forged in a smithing mini-game; rules
 * in engine/garrison/order-chaos/forge-game.ts and hero-ranks.ts) and the Magic
 * Garden (gem plants that grow in real time; engine/garrison/order-chaos/garden.ts).
 * Both only change OcProgress through `update`, re-checking costs and caps at
 * the moment of the change.
 */

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  OC_HERO_MAX_RANK, OC_HEROES, OC_RANK_COST, heroRankCap, heroRankOf, heroRankText, type OcHeroId
} from "@/engine/garrison/order-chaos/campaign";
import {
  FORGE, FORGE_QUALITY_NAME, forgeAct, forgeQuality, forgeRefund, forgeScore, forgeStep, heatBand, newForgeGame, type ForgeGame
} from "@/engine/garrison/order-chaos/forge-game";
import {
  OC_GARDEN_DAILY_GEMS, OC_GARDEN_STAGES, OC_SEEDS, OC_SEED_ORDER, advancePlant, gardenPlots, harvestGems, isRipe, isThirsty, msToRipe, seedOpen, sow, stageOf, water,
  type OcPlant, type OcSeedId
} from "@/engine/garrison/order-chaos/garden";
import { assetUrl } from "@/lib/asset-url";
import { ocDayKey } from "@/engine/garrison/order-chaos/scores";
import { takingsToday, type OcProgress } from "@/lib/order-chaos-progress";
import { hammerBlade, temperBlade, type ForgeClaim } from "@/lib/order-chaos-forge";
import { ripenPlot } from "@/lib/order-chaos-treasury";
import styles from "../garrison.module.css";
import oc from "./oc.module.css";
import fg from "./forge-garden.module.css";

type Update = (change: (p: OcProgress) => OcProgress) => void;

const BANNER = "/assets/order-chaos/ui/banner.webp";

// ---------------------------------------------------------------------------
// Small pieces

export function OreIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden className={fg.icon} height={size} viewBox="0 0 24 24" width={size}>
      <path d="M3 16 7 7l6-3 7 5 1 8-6 4H8z" fill="#6f6a66" stroke="#2a2522" strokeWidth="1.5" />
      <path d="M7 7l4 5 2-8M11 12l-3 8M11 12l9-3M11 12l4 9" fill="none" stroke="#3b3632" strokeWidth="1" />
      <path d="M13 4l2 3-4 1z" fill="#b8b2aa" />
      <circle cx="16" cy="13" fill="#c98a3a" r="1.3" />
    </svg>
  );
}

export function GemIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden className={fg.icon} height={size} viewBox="0 0 24 24" width={size}>
      <path d="M6 4h12l4 6-10 11L2 10z" fill="#d23a6a" stroke="#4a0f22" strokeWidth="1.5" />
      <path d="M2 10h20M6 4l3 6 3-6 3 6 3-6M9 10l3 11 3-11" fill="none" stroke="#7a1a3a" strokeWidth="1" />
      <path d="M7 5l2 4H4z" fill="#ffd0e0" opacity="0.8" />
    </svg>
  );
}

export function Materials({ progress }: { progress: OcProgress }) {
  return (
    <span className={oc.purse} title="Ore (won in battle) and Gems (grown in the Magic Garden) pay for forging hero ranks">
      <OreIcon /> {progress.ore}
      <span className={fg.sep} />
      <GemIcon /> {progress.gems}
    </span>
  );
}

function Pips({ rank, cap }: { rank: number; cap: number }) {
  return (
    <span aria-label={`Rank ${rank} of ${OC_HERO_MAX_RANK}`} className={fg.pips}>
      {Array.from({ length: OC_HERO_MAX_RANK }, (_, i) => (
        <i className={i < rank ? fg.pipOn : i < cap ? fg.pipOpen : fg.pipLocked} key={i} />
      ))}
    </span>
  );
}

function Head({ title, onBack, progress }: { title: string; onBack(): void; progress: OcProgress }) {
  return (
    <div className={oc.campHead}>
      <button className={oc.backButton} onClick={onBack} type="button">‹ Back</button>
      <h1 className={oc.titleBanner} style={{ ["--oc-banner" as string]: `url("${assetUrl(BANNER)}")` }}><span>{title}</span></h1>
      <Materials progress={progress} />
    </div>
  );
}

/** When the next Forge rank opens, in words. */
function capText(cap: number): string {
  const world = [1, 2, 3, 4][cap - 1];
  return world ? `Rank ${cap + 1} can be forged once world ${world} is cleared.` : "";
}

// ---------------------------------------------------------------------------
// The Forge

export function ForgeScreen({ progress, heroes, cleared, update, onBack }: {
  progress: OcProgress;
  heroes: readonly OcHeroId[];
  cleared: readonly string[];
  update: Update;
  onBack(): void;
}) {
  const [picked, setPicked] = useState<OcHeroId>(heroes.includes(progress.hero) ? progress.hero : heroes[0] ?? "catherine");
  const [forging, setForging] = useState<{ hero: OcHeroId; rank: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  /** The blade just finished: tempered and paid for, or "unpaid" (it could no longer be paid for: nothing spent). */
  const [tempered, setTempered] = useState<ForgeClaim | "unpaid" | null>(null);
  const hammeringRef = useRef(false);
  const cap = heroRankCap(cleared);
  const rank = heroRankOf(picked, progress.heroRanks);
  const next = rank + 1;
  const cost = OC_RANK_COST[next];
  const canAfford = !!cost && progress.ore >= cost.ore && progress.gems >= cost.gems;
  const blocked = rank >= OC_HERO_MAX_RANK ? "Full strength: nothing left to forge." : next > cap ? capText(cap) : !canAfford ? "Not enough Ore and Gems yet." : null;

  if (forging) {
    // Leaving the bench: before the blade is finished nothing was spent; once it is, it was already tempered and paid for.
    const close = () => {
      setForging(null);
      setTempered(null);
      hammeringRef.current = false;
      if (tempered === "unpaid") setResult("The blade cooled, but there wasn't enough Ore and Gems to pay for it any more — nothing was spent.");
      else if (tempered) setResult(`${OC_HEROES[tempered.hero].name} reaches rank ${tempered.rank}! ${FORGE_QUALITY_NAME[tempered.quality]} work${tempered.refund ? ` — ${tempered.refund} Ore handed back` : ""}.`);
    };
    return (
      <>
        <Head onBack={close} progress={progress} title="The Forge" />
        <ForgeBench
          hammers={progress.items["masterwork-hammer"] ?? 0}
          hero={forging.hero}
          onClose={close}
          onFinish={(game) => {
            // The blade is paid for the moment it is finished, so leaving can't throw it back for another try.
            const { hero, rank: target } = forging;
            const done = temperBlade(progress, game, hero, target, cleared);
            if (!done) {
              setTempered("unpaid");
              return;
            }
            // (Checked again at the moment of paying: another tab may have spent the Ore.)
            update((p) => temperBlade(p, game, hero, target, cleared)?.p ?? p);
            setTempered(done.claim);
          }}
          onHammer={() => {
            if (!tempered || tempered === "unpaid" || hammeringRef.current) return;
            const lifted = hammerBlade(progress, tempered);
            if (!lifted) return;
            hammeringRef.current = true;
            update((p) => hammerBlade(p, tempered)?.p ?? p);
            setTempered(lifted.claim);
          }}
          rank={forging.rank}
          tempered={tempered}
        />
      </>
    );
  }

  const hero = OC_HEROES[picked];
  return (
    <>
      <Head onBack={onBack} progress={progress} title="The Forge" />
      <p className={oc.prepBrief}>
        Heroes join weak and grow here. Each rank strengthens the hero&apos;s own skill and signature spell — forged by hand: pump the bellows, strike true, quench in time.
        Ore comes from battles: first victories, new stars and broken raids (replays add 1 each, up to 6 a day). Gems grow in the Magic Garden (up to 40 a day). Ranks also wait on the campaign: one more opens after each of worlds 1 to 4.
      </p>
      {result ? <p className={oc.reward} role="status">{result}</p> : null}
      <div className={fg.forgeGrid}>
        <div className={fg.heroList} role="radiogroup" aria-label="Hero">
          {heroes.map((id) => {
            const h = OC_HEROES[id];
            const r = heroRankOf(id, progress.heroRanks);
            return (
              <button aria-checked={id === picked} className={`${oc.hero} ${id === picked ? oc.heroOn : ""}`} key={id} onClick={() => { setPicked(id); setResult(null); }} role="radio" type="button">
                <img alt="" className={oc.portrait} src={assetUrl(h.portrait)} />
                <span>
                  <strong>{h.name}</strong>
                  <Pips cap={cap} rank={r} />
                </span>
              </button>
            );
          })}
        </div>
        <section className={styles.panel}>
          <h2>{hero.name} · rank {rank} / {OC_HERO_MAX_RANK}</h2>
          <p><b>Now:</b> {heroRankText(picked, rank)}</p>
          {rank < OC_HERO_MAX_RANK ? <p className={fg.next}><b>Rank {next}:</b> {heroRankText(picked, next)}</p> : null}
          {cost && rank < OC_HERO_MAX_RANK ? (
            <p className={fg.cost}>
              Cost: <OreIcon /> {cost.ore} Ore <GemIcon /> {cost.gems} Gems
              <small> · a Fine blade hands back a quarter of the Ore, a Masterwork half</small>
            </p>
          ) : null}
          {blocked ? <p className={styles.note}>{blocked}</p> : null}
          <button className={styles.primary} disabled={blocked !== null} onClick={() => { setResult(null); setForging({ hero: picked, rank: next }); }} type="button">
            {rank >= OC_HERO_MAX_RANK ? "Fully forged" : `Forge rank ${next} ▸`}
          </button>
        </section>
      </div>
    </>
  );
}

const HEAT_COLORS: [number, string][] = [[0, "#3a3430"], [0.35, "#7a2a14"], [0.55, "#d24a12"], [0.72, "#ff9a2a"], [0.86, "#ffe07a"], [1, "#fffbe8"]];

function heatColor(heat: number): string {
  for (let i = HEAT_COLORS.length - 1; i >= 0; i -= 1) if (heat >= HEAT_COLORS[i]![0]) return HEAT_COLORS[i]![1];
  return HEAT_COLORS[0]![1];
}

/** The smithing mini-game itself: one blade for one rank. */
function ForgeBench({ hero, rank, hammers, tempered, onFinish, onHammer, onClose }: {
  hero: OcHeroId;
  rank: number;
  hammers: number;
  /** The finished blade as paid for (null until then; "unpaid": it couldn't be paid for, nothing spent). */
  tempered: ForgeClaim | "unpaid" | null;
  /** Called once, the moment the blade is finished: the parent tempers it and pays. */
  onFinish(game: ForgeGame): void;
  onHammer(): void;
  onClose(): void;
}) {
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);
  const finishedOnceRef = useRef(false);
  const gameRef = useRef<ForgeGame>(newForgeGame(rank, Math.floor(Math.random() * 2 ** 31)));
  const pumpingRef = useRef(false);
  const [, setFrame] = useState(0);
  const [finished, setFinished] = useState<ForgeGame | null>(null);

  const act = useCallback(() => {
    gameRef.current = forgeAct(gameRef.current);
    setFrame((n) => n + 1);
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const before = gameRef.current;
      gameRef.current = forgeStep(before, dt, pumpingRef.current);
      if (gameRef.current.phase === "done") {
        setFinished(gameRef.current);
        return;
      }
      setFrame((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // The moment the blade is finished it is tempered and paid for (once).
  useEffect(() => {
    if (!finished || finishedOnceRef.current) return;
    finishedOnceRef.current = true;
    onFinishRef.current(finished);
  }, [finished]);

  // Space: hold to pump the bellows, press to strike or plunge.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      event.preventDefault();
      if (gameRef.current.phase === "heat") pumpingRef.current = true;
      else if (!event.repeat) act();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.key === " ") pumpingRef.current = false;
    };
    const release = () => { pumpingRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", release);
    };
  }, [act]);

  const g = finished ?? gameRef.current;
  const band = heatBand(rank);
  const hot = g.phase === "heat" ? g.heat : g.phase === "hammer" ? 0.78 : g.phase === "quench" ? g.temp : 0.1;
  const flashAge = g.flash ? g.flash.age : 1;
  const swing = g.phase === "hammer" || g.phase === "done" ? Math.max(0, 1 - flashAge / 0.18) : 0;
  const score = finished ? forgeScore(finished) : 0;
  const claim = tempered && tempered !== "unpaid" ? tempered : null;
  // (A Masterwork Hammer lifts the paid blade's quality.)
  const quality = claim?.quality ?? forgeQuality(score);
  const price = OC_RANK_COST[rank]!;
  const step = g.phase === "heat" ? 1 : g.phase === "hammer" ? 2 : 3;
  return (
    <section className={`${styles.panel} ${fg.bench}`}>
      <h2>Forging {OC_HEROES[hero].name}&apos;s rank {rank} · step {Math.min(3, step)} of 3</h2>
      <svg aria-hidden className={fg.scene} viewBox="0 0 640 260">
        <defs>
          <radialGradient id="fg-fire" cx="50%" cy="80%" r="70%">
            <stop offset="0%" stopColor="#fff2b0" stopOpacity={0.35 + 0.65 * (g.phase === "heat" ? g.heat : 0.4)} />
            <stop offset="45%" stopColor="#ff7a1a" stopOpacity={0.3 + 0.6 * (g.phase === "heat" ? g.heat : 0.4)} />
            <stop offset="100%" stopColor="#3a0a00" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="fg-wall" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#1d1612" />
            <stop offset="100%" stopColor="#3a2a1e" />
          </linearGradient>
        </defs>
        <rect fill="url(#fg-wall)" height="260" width="640" />
        {Array.from({ length: 6 }, (_, row) => Array.from({ length: 10 }, (_, col) => (
          <rect fill="none" height="22" key={`${row}-${col}`} stroke="#2a1f17" width="64" x={col * 64 + (row % 2) * 32 - 32} y={row * 22} />
        )))}
        <rect fill="#2b2118" height="40" width="640" y="220" />
        {/* The furnace */}
        <path d="M30 220V90q0-60 85-60t85 60v130z" fill="#5a3a2a" stroke="#2a1a10" strokeWidth="4" />
        <path d="M60 220v-80q0-38 55-38t55 38v80z" fill="#140806" />
        <ellipse cx="115" cy="190" fill="url(#fg-fire)" rx="70" ry="60" />
        <rect fill={heatColor(g.phase === "heat" ? g.heat : 0.3)} height="10" rx="3" width="80" x="75" y="196" />
        {/* The bellows */}
        <g transform={`translate(205 ${pumpingRef.current && g.phase === "heat" ? 196 : 186})`}>
          <path d={pumpingRef.current && g.phase === "heat" ? "M0 10h70l-20 14H0z" : "M0 0h70l-20 34H0z"} fill="#7a4a24" stroke="#2a1a10" strokeWidth="3" />
          <rect fill="#4a2a14" height="6" width="30" x="-28" y="12" />
        </g>
        {/* The anvil, the blade, the hammer */}
        <path d="M330 150h150q-10 18-40 22v30h20v18H350v-18h20v-30q-36-4-40-22z" fill="#3c3f44" stroke="#15171a" strokeWidth="3" />
        {g.phase !== "heat" ? <rect fill={heatColor(hot)} height="8" rx="3" width={60 + 10 * Math.min(8, g.shaped)} x={370} y={142} /> : null}
        <g transform={`rotate(${-50 + 50 * swing} 470 120)`}>
          <rect fill="#6b4a2a" height="70" rx="4" width="10" x="465" y="60" />
          <rect fill="#585c62" height="26" rx="4" width="44" x="448" y="46" />
        </g>
        {g.flash && g.flash.grade !== "miss" && flashAge < 0.35 && g.phase !== "quench"
          ? Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI - Math.PI;
            const len = 18 + 30 * (flashAge / 0.35);
            return <line key={i} stroke="#ffd36a" strokeWidth="2" x1={420 + Math.cos(a) * 8} x2={420 + Math.cos(a) * len} y1={142 + Math.sin(a) * 8} y2={142 + Math.sin(a) * len} />;
          }) : null}
        {/* The quench barrel */}
        <path d="M530 150h80l-6 70h-68z" fill="#5a3a20" stroke="#2a1a10" strokeWidth="3" />
        <rect fill="#2a5a7a" height="10" width="76" x="532" y="152" />
        {g.quench && g.quench !== "miss" ? Array.from({ length: 5 }, (_, i) => (
          <circle cx={548 + i * 12} cy={140 - flashAge * 80 - i * 4} fill="#dde6ee" key={i} opacity={Math.max(0, 0.7 - flashAge)} r={6 + flashAge * 14} />
        )) : null}
      </svg>

      {g.phase === "heat" ? (
        <div className={fg.stepBox}>
          <p><b>1 · Heat.</b> Hold <kbd>Space</kbd> (or press and hold the bellows button) to pump air. Keep the needle in the glowing band until the bar has soaked. Past white-hot it scorches.</p>
          <div className={fg.gauge}>
            <span className={fg.band} style={{ left: `${band.lo * 100}%`, width: `${(band.hi - band.lo) * 100}%` }} />
            <span className={fg.scorch} style={{ left: `${FORGE.scorchAt * 100}%` }} />
            <span className={fg.needle} style={{ left: `${g.heat * 100}%` }} />
          </div>
          <div className={fg.meter}><span style={{ width: `${(g.soak / FORGE.soakNeed) * 100}%` }} /></div>
          <button
            className={`${styles.primary} ${fg.big}`}
            onPointerDown={(event) => { event.preventDefault(); pumpingRef.current = true; }}
            onPointerLeave={() => { pumpingRef.current = false; }}
            onPointerUp={() => { pumpingRef.current = false; }}
            type="button"
          >
            Pump the bellows
          </button>
          {g.scorch > 0 ? <small className={fg.warn}>Scorched {g.scorch.toFixed(1)} s</small> : null}
        </div>
      ) : g.phase === "hammer" ? (
        <div className={fg.stepBox}>
          <p><b>2 · Hammer.</b> Strike (<kbd>Space</kbd> or the button) while the marker is over the bright spot. A perfect strike shapes twice as far as a good one; a miss shapes nothing.</p>
          <div className={fg.gauge}>
            <span className={fg.good} style={{ left: `${(g.spot - FORGE.goodBand) * 100}%`, width: `${FORGE.goodBand * 200}%` }} />
            <span className={fg.perfect} style={{ left: `${(g.spot - FORGE.perfectBand) * 100}%`, width: `${FORGE.perfectBand * 200}%` }} />
            <span className={fg.needle} style={{ left: `${g.marker * 100}%` }} />
          </div>
          <div className={fg.meter}><span style={{ width: `${(g.shaped / FORGE.shapeNeed) * 100}%` }} /></div>
          <button className={`${styles.primary} ${fg.big}`} onPointerDown={(event) => { event.preventDefault(); act(); }} type="button">Strike!</button>
          {g.flash ? <strong className={g.flash.grade === "perfect" ? fg.gradePerfect : g.flash.grade === "good" ? fg.gradeGood : fg.gradeMiss}>{g.flash.grade === "perfect" ? "Perfect!" : g.flash.grade === "good" ? "Good" : "Miss"}</strong> : null}
        </div>
      ) : g.phase === "quench" ? (
        <div className={fg.stepBox}>
          <p><b>3 · Quench.</b> The blade cools. Plunge it (<kbd>Space</kbd> or the button) while the glow sits in the blue band.</p>
          <div className={fg.gauge}>
            <span className={fg.quench} style={{ left: `${(FORGE.quenchMid - FORGE.quenchGood) * 100}%`, width: `${FORGE.quenchGood * 200}%` }} />
            <span className={fg.perfect} style={{ left: `${(FORGE.quenchMid - FORGE.quenchPerfect) * 100}%`, width: `${FORGE.quenchPerfect * 200}%` }} />
            <span className={fg.needle} style={{ left: `${g.temp * 100}%` }} />
          </div>
          <button className={`${styles.primary} ${fg.big}`} onPointerDown={(event) => { event.preventDefault(); act(); }} type="button">Plunge!</button>
        </div>
      ) : (
        <div className={fg.stepBox}>
          <p className={fg.verdict}>{FORGE_QUALITY_NAME[quality]} blade · {score} / 100{quality !== forgeQuality(score) ? " · lifted by a Masterwork Hammer" : ""}</p>
          <p className={styles.note}>
            Heat {Math.max(0, Math.round(100 - g.scorch * FORGE.scorchPenalty))} · Hammer {g.strikes.filter((x) => x === "perfect").length} perfect, {g.strikes.filter((x) => x === "good").length} good, {g.strikes.filter((x) => x === "miss").length} missed · Quench {g.quench === "perfect" ? "perfect" : g.quench === "good" ? "good" : "poor"}
          </p>
          {claim ? (
            <p>
              Tempered: {OC_HEROES[hero].name} reaches rank {rank}. Paid <OreIcon /> {price.ore} Ore <GemIcon /> {price.gems} Gems{claim.refund ? ` · ${claim.refund} Ore handed back` : ""}.
            </p>
          ) : tempered === "unpaid" ? (
            <p className={fg.warn}>The blade cooled, but there wasn&apos;t enough Ore and Gems to pay for it any more — nothing was spent.</p>
          ) : (
            <p>Tempering…</p>
          )}
          {claim && hammers > 0 && claim.quality !== "masterwork" ? (
            <button className={styles.ghostButton} onClick={onHammer} type="button">
              Spend a Masterwork Hammer (you have {hammers}): it counts as a Masterwork, {forgeRefund("masterwork", price.ore)} Ore back in all
            </button>
          ) : null}
          <button className={`${styles.primary} ${fg.big}`} onClick={onClose} type="button">Back to the Forge</button>
        </div>
      )}
      {!finished ? <button className={oc.testLink} onClick={onClose} type="button">Leave the forge (nothing is spent while the blade is unfinished)</button> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Magic Garden

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const PETAL: Record<OcSeedId, string> = { clover: "#f2d04a", fern: "#7ad8f2", rose: "#e2426e", starfruit: "#ffcf5a" };

/** A plant drawn at its stage: a sprout, a young plant, a budding plant, then ripe with gems. */
function PlantArt({ seed, stage, ripe, wet }: { seed: OcSeedId; stage: number; ripe: boolean; wet: boolean }) {
  const h = 18 + stage * 16;
  const tree = seed === "starfruit";
  const color = PETAL[seed];
  return (
    <svg aria-hidden className={fg.plant} viewBox="0 0 100 100">
      <ellipse cx="50" cy="88" fill={wet ? "#3a2614" : "#5a3a1e"} rx="40" ry="9" />
      {wet ? <ellipse cx="50" cy="88" fill="#4a7aa0" opacity="0.35" rx="30" ry="6" /> : null}
      <path d={`M50 88 Q${tree ? 46 : 52} ${88 - h / 2} 50 ${88 - h}`} fill="none" stroke={tree ? "#6a4a24" : "#3f8a3a"} strokeWidth={tree ? 6 : 3} />
      {stage >= 1 ? <path d={`M50 ${80 - h / 3} q-16 -8 -20 -2 q8 8 20 2M50 ${76 - h / 2} q16 -8 20 -2 q-8 8 -20 2`} fill="#4fa64a" /> : null}
      {stage >= 2 && tree ? <circle cx="50" cy={88 - h} fill="#3f8a3a" r="18" /> : null}
      {stage >= 2 && !tree ? <circle cx="50" cy={88 - h} fill="#8ac06a" r="6" /> : null}
      {ripe ? (
        <g className={fg.ripe}>
          {[-14, 0, 14].map((dx, i) => (
            <path d={`M${50 + dx} ${84 - h - (i === 1 ? 8 : 0)} l6 6 -6 10 -6 -10z`} fill={color} key={dx} stroke="#3a1020" strokeWidth="1" />
          ))}
        </g>
      ) : null}
    </svg>
  );
}

export function GardenScreen({ progress, cleared, update, onBack }: { progress: OcProgress; cleared: readonly string[]; update: Update; onBack(): void }) {
  const [now, setNow] = useState(() => Date.now());
  const [sowing, setSowing] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const plots = gardenPlots(cleared);
  const plotAt = (p: OcProgress, i: number): OcPlant | null => p.garden[i] ?? null;
  const setPlot = (p: OcProgress, i: number, plant: OcPlant | null): OcProgress => {
    const garden = Array.from({ length: Math.max(p.garden.length, i + 1) }, (_, k) => p.garden[k] ?? null);
    garden[i] = plant;
    return { ...p, garden };
  };
  const plant = (i: number, seed: OcSeedId) => {
    setSowing(null);
    update((p) => (i >= gardenPlots(cleared) || plotAt(p, i) || !seedOpen(OC_SEEDS[seed], cleared) ? p : setPlot(p, i, sow(seed, Date.now()))));
  };
  const waterPlot = (i: number) => update((p) => {
    const here = plotAt(p, i);
    return here ? setPlot(p, i, water(here, Date.now())) : p;
  });
  const harvested = takingsToday(progress, ocDayKey(new Date(now))).gardenGems;
  const spent = harvested >= OC_GARDEN_DAILY_GEMS;
  const harvest = (i: number) => {
    const here = plotAt(progress, i);
    const gems = here ? harvestGems(here, Date.now()) : 0;
    if (!gems || takingsToday(progress, ocDayKey()).gardenGems >= OC_GARDEN_DAILY_GEMS) return;
    update((p) => {
      const live = plotAt(p, i);
      const got = live ? harvestGems(live, Date.now()) : 0;
      const today = takingsToday(p, ocDayKey());
      // The garden's magic is spent for today: the ripe plant waits in its plot.
      if (!got || today.gardenGems >= OC_GARDEN_DAILY_GEMS) return p;
      return { ...setPlot(p, i, null), gems: p.gems + got, daily: { ...today, gardenGems: today.gardenGems + got } };
    });
    setNote(`+${gems} Gems from the ${OC_SEEDS[here!.seed].name}${here!.watered >= OC_GARDEN_STAGES ? " (lush: watered at every stage)" : ""}.`);
  };
  return (
    <>
      <Head onBack={onBack} progress={progress} title="Magic Garden" />
      <p className={oc.prepBrief}>
        Gem plants grow in real time, even while you are away. Each grows through {OC_GARDEN_STAGES} stages: water a stage and it grows twice as fast until the next one begins;
        water every stage and it ripens lush, with more Gems. Gems pay for hero ranks at the Forge.
      </p>
      {note ? <p className={oc.reward} role="status">{note}</p> : null}
      <p className={styles.note}>
        Today&apos;s harvest: <GemIcon size={14} /> {harvested} / {OC_GARDEN_DAILY_GEMS}
        {spent ? " — the garden's magic is spent until tomorrow (midnight UTC); ripe plants wait in their plots." : " (the garden's magic runs dry after that each day)"}
      </p>
      <div className={fg.garden}>
        {Array.from({ length: plots }, (_, i) => {
          const here = plotAt(progress, i);
          if (!here) {
            return (
              <div className={fg.plot} key={i}>
                <svg aria-hidden className={fg.plant} viewBox="0 0 100 100"><ellipse cx="50" cy="88" fill="#5a3a1e" rx="40" ry="9" /></svg>
                {sowing === i ? (
                  <div className={fg.seeds}>
                    {OC_SEED_ORDER.map((id) => {
                      const seed = OC_SEEDS[id];
                      const open = seedOpen(seed, cleared);
                      return (
                        <button className={styles.ghostButton} disabled={!open} key={id} onClick={() => plant(i, id)} title={open ? seed.blurb : `Opens after world ${seed.world}.`} type="button">
                          {seed.name} · {clock(seed.growMs)} · <GemIcon size={14} /> {seed.gems}/{seed.lush}
                        </button>
                      );
                    })}
                    <button className={oc.testLink} onClick={() => setSowing(null)} type="button">Cancel</button>
                  </div>
                ) : (
                  <button className={styles.primary} onClick={() => setSowing(i)} type="button">Sow a seed</button>
                )}
              </div>
            );
          }
          const seed = OC_SEEDS[here.seed];
          const live = advancePlant(here, now);
          const ripe = isRipe(here, now);
          const thirsty = isThirsty(here, now);
          return (
            <div className={`${fg.plot} ${ripe ? fg.plotRipe : ""}`} key={i}>
              <PlantArt ripe={ripe} seed={here.seed} stage={Math.min(OC_GARDEN_STAGES - 1, stageOf(seed, live.grown))} wet={live.wet} />
              <strong>{seed.name}</strong>
              <small>
                {ripe ? `Ripe! ${here.watered >= OC_GARDEN_STAGES ? seed.lush : seed.gems} Gems` : `Stage ${stageOf(seed, live.grown) + 1} / ${OC_GARDEN_STAGES} · ripe in ${clock(msToRipe(here, now))}`}
                {` · watered ${here.watered}/${OC_GARDEN_STAGES}`}
              </small>
              {ripe ? (
                <button className={styles.primary} disabled={spent} onClick={() => harvest(i)} title={spent ? "The garden's magic is spent until tomorrow." : undefined} type="button">Harvest <GemIcon size={14} /></button>
              ) : thirsty ? (
                <button className={`${styles.primary} ${fg.thirsty}`} onClick={() => waterPlot(i)} type="button">Water 💧</button>
              ) : (
                <span className={fg.wet}>Watered — growing fast</span>
              )}
              {!ripe && (progress.items["growth-potion"] ?? 0) > 0 ? (
                <button className={styles.ghostButton} onClick={() => update((p) => ripenPlot(p, i, Date.now()))} title="Spend a Growth Potion: this plant ripens now" type="button">
                  Growth Potion (×{progress.items["growth-potion"]})
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
