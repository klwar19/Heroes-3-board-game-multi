"use client";

/**
 * Order & Chaos treasury screens: the Summoning Portal (a staged summon: the
 * portal charges, its light signals the best rarity actually rolled, the cards
 * are dealt and turned one by one — with Skip / Reveal all; rates, pity, the
 * summon history and the Stardust Exchange), the Satchel
 * (items with quantities), the daily attendance calendar and the item packing
 * row on the battle-preparation screen. Rules: engine/garrison/order-chaos/treasury.ts;
 * save operations: lib/order-chaos-treasury.ts.
 */

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BLESSINGS, DEFENDERS, ENEMIES } from "@/engine/garrison/content";
import { OC_GACHA_ARTIFACTS, OC_GACHA_CHAOS, OC_GACHA_HERO, OC_GACHA_UNITS } from "@/engine/garrison/order-chaos/gacha-content";
import { ocDayKey } from "@/engine/garrison/order-chaos/scores";
import {
  OC_ATTENDANCE, OC_CRYSTALS, OC_EXCHANGE_PRICE, OC_ITEMS, OC_ITEM_ORDER, OC_PACK_SLOTS, OC_RARITY_ORDER, OC_RATES, OC_SSR_PITY, OC_STARDUST_DUPLICATE,
  OC_STARDUST_PER_PULL, OC_SUMMON_LOG_KEPT, OC_UR_PITY, attendanceToday, itemPerMatch, type OcItemId, type OcPrize, type OcRarity, type OcSummonRecord
} from "@/engine/garrison/order-chaos/treasury";
import { assetUrl } from "@/lib/asset-url";
import type { OcProgress } from "@/lib/order-chaos-progress";
import {
  OC_PORTAL_POOLS, claimAttendance, exchange, itemCount, ownsPrize, pullPortal, pullPrice, togglePacked, useItem, type OcPullResult
} from "@/lib/order-chaos-treasury";
import { playGarrisonSound } from "../audio";
import styles from "../garrison.module.css";
import { AttackerArt, DefenderArt } from "../thumbs";
import oc from "./oc.module.css";
import tr from "./treasury.module.css";

type Update = (change: (p: OcProgress) => OcProgress) => void;

const ART = {
  banner: "/assets/order-chaos/ui/banner.webp",
  crystal: "/assets/order-chaos/gacha/crystal.webp",
  stardust: "/assets/order-chaos/gacha/stardust.webp",
  portal: "/assets/order-chaos/gacha/portal.webp",
  cardBack: "/assets/order-chaos/gacha/card-back.webp",
  circle: "/assets/order-chaos/gacha/summon-circle.webp",
  card: (r: OcRarity) => `/assets/order-chaos/gacha/card-${r.toLowerCase()}.webp`
} as const;

/** An image that hides itself (showing `fallback`) when the file is missing. */
function Pic({ src, alt = "", className, fallback = null }: { src: string; alt?: string; className?: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return <img alt={alt} className={className} draggable={false} onError={() => setFailed(true)} src={assetUrl(src)} />;
}

export function CrystalIcon({ size = 18 }: { size?: number }) {
  return <Pic className={tr.icon} fallback={<span className={tr.glyph} style={{ fontSize: size * 0.8 }}>◆</span>} src={ART.crystal} />;
}

function DustIcon() {
  return <Pic className={tr.icon} fallback={<span className={tr.glyph}>✧</span>} src={ART.stardust} />;
}

export function CrystalPurse({ progress }: { progress: OcProgress }) {
  return (
    <span className={oc.purse} title="Crystals (earned by first victories, stars, bosses, the Daily Siege and daily attendance) summon at the Portal; Stardust comes from every summon and buys prizes in the Exchange">
      <CrystalIcon /> {progress.crystals}
      <span className={tr.sep} />
      <DustIcon /> {progress.stardust}
    </span>
  );
}

function Head({ title, onBack, progress }: { title: string; onBack(): void; progress: OcProgress }) {
  return (
    <div className={oc.campHead}>
      <button className={oc.backButton} onClick={onBack} type="button">‹ Back</button>
      <h1 className={oc.titleBanner} style={{ ["--oc-banner" as string]: `url("${assetUrl(ART.banner)}")` }}><span>{title}</span></h1>
      <CrystalPurse progress={progress} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prizes

const RARITY_OF: Record<string, OcRarity> = Object.fromEntries([
  ...OC_GACHA_UNITS.map((u) => [`unit:${u.kind}`, u.rarity]),
  ...OC_GACHA_CHAOS.map((u) => [`chaos:${u.kind}`, u.rarity]),
  ...OC_GACHA_ARTIFACTS.map((a) => [`artifact:${a.id}`, a.rarity]),
  [`hero:${OC_GACHA_HERO.id}`, "UR"]
]);

export function prizeRarity(prize: OcPrize): OcRarity {
  return prize.kind === "item" ? OC_ITEMS[prize.id].rarity : RARITY_OF[`${prize.kind}:${prize.id}`] ?? "SSR";
}

export function prizeName(prize: OcPrize): string {
  switch (prize.kind) {
    case "item": return `${OC_ITEMS[prize.id].name}${prize.count > 1 ? ` ×${prize.count}` : ""}`;
    case "unit": return DEFENDERS[prize.id]?.name ?? prize.id;
    case "chaos": return ENEMIES[prize.id]?.name ?? prize.id;
    case "artifact": return BLESSINGS[prize.id as keyof typeof BLESSINGS]?.name ?? prize.id;
    case "hero": return OC_GACHA_HERO.id === prize.id ? `${OC_GACHA_HERO.name}, ${OC_GACHA_HERO.title}` : prize.id;
  }
}

function prizeKindLabel(prize: OcPrize): string {
  return prize.kind === "item" ? "Item" : prize.kind === "unit" ? "Lawful troop" : prize.kind === "chaos" ? "Chaos raider" : prize.kind === "artifact" ? "Artifact" : "Hero";
}

function prizeBlurb(prize: OcPrize): string {
  switch (prize.kind) {
    case "item": return OC_ITEMS[prize.id].blurb;
    case "unit": return DEFENDERS[prize.id]?.blurb ?? "";
    case "chaos": return `${ENEMIES[prize.id]?.blurb ?? ""} Joins your hand in every Chaos Raid.`;
    case "artifact": return `${BLESSINGS[prize.id as keyof typeof BLESSINGS]?.blurb ?? ""} Equip it before battle.`;
    case "hero": return OC_GACHA_HERO.blurb;
  }
}

function PrizeArt({ prize, size = 96 }: { prize: OcPrize; size?: number }) {
  switch (prize.kind) {
    case "item": return <Pic className={tr.itemArt} fallback={<span className={tr.glyph}>✦</span>} src={OC_ITEMS[prize.id].icon} />;
    case "unit": return <DefenderArt kind={prize.id} size={size} />;
    case "chaos": return <AttackerArt kind={prize.id} size={size} />;
    case "artifact": return <Pic className={tr.itemArt} src={BLESSINGS[prize.id as keyof typeof BLESSINGS]?.icon ?? ""} />;
    case "hero": return <Pic className={tr.heroArt} src={OC_GACHA_HERO.portrait} />;
  }
}

const rarityRank = (r: OcRarity) => OC_RARITY_ORDER.indexOf(r);

/** The best rarity among the pulls (what the Portal's signal shows before any card turns). */
function bestRarity(results: readonly { rarity: OcRarity }[]): OcRarity {
  return results.reduce<OcRarity>((top, r) => (rarityRank(r.rarity) > rarityRank(top) ? r.rarity : top), "R");
}

/** A prize's base chance on one summon: its rarity's rate × its share of that rarity's pool (the same pools and rates the pull rolls). */
function baseChance(prize: OcPrize, rarity: OcRarity): number {
  const pool = OC_PORTAL_POOLS[rarity];
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  const entry = pool.find((e) => e.prize.kind === prize.kind && e.prize.id === prize.id);
  return entry && total > 0 ? (OC_RATES[rarity] * entry.weight) / total : 0;
}

function percent(x: number): string {
  return `${(x * 100).toFixed(x > 0 && x < 0.001 ? 3 : 2)}%`;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The summon's beats (ms): the portal charges, its light shows the best rarity, the cards are dealt and turned one by one. */
const CHARGE_MS: Record<1 | 10, number> = { 1: 900, 10: 1100 };
const SIGNAL_MS: Record<OcRarity, number> = { R: 650, SR: 850, SSR: 1250, UR: 1750 };
const DEAL_MS = 70;
const FLIP_GAP_MS = 190;
/** A rare card waits a beat longer before it turns. */
const RARE_PAUSE_MS = 420;

/** Sounds (through the Garrison budget, so a fast ten-summon never stacks into noise). */
function signalSound(best: OcRarity): void {
  if (best === "UR") {
    playGarrisonSound("spells/resurrection", 0.5, 400, "cue");
    playGarrisonSound("effects/good-luck", 0.45, 400, "cue");
  } else if (best === "SSR") playGarrisonSound("spells/bless", 0.5, 400, "cue");
  else if (best === "SR") playGarrisonSound("adventure/pickup-02", 0.45, 400, "cue");
  else playGarrisonSound("adventure/pickup-01", 0.35, 400, "cue");
}

function flipSound(rarity: OcRarity): void {
  if (rarity === "UR") playGarrisonSound("spells/prayer", 0.5, 300, "cue");
  else if (rarity === "SSR") playGarrisonSound("adventure/treasure", 0.5, 300, "cue");
  else playGarrisonSound("cards/card-deal-1", rarity === "SR" ? 0.45 : 0.35, 60, "routine");
}

function PrizeCard({ result, index, open, big, onOpen }: { result: OcPullResult; index: number; open: boolean; big: boolean; onOpen(): void }) {
  const fresh = result.prize.kind !== "item" && !result.duplicate;
  const name = prizeName(result.prize);
  return (
    <button
      aria-label={open ? `${result.rarity}: ${name}${fresh ? " (new)" : result.duplicate ? ` (owned: +${result.dust} Stardust)` : ""}` : `Face-down card ${index + 1}: turn it over`}
      className={`${tr.card} ${tr[`r${result.rarity}`]} ${open ? tr.flipped : ""} ${big ? tr.cardBig : ""}`}
      onClick={open ? undefined : onOpen}
      style={{ ["--deal" as string]: `${index * DEAL_MS}ms` }}
      title={open ? prizeBlurb(result.prize) : undefined}
      type="button"
    >
      {result.rarity !== "R" ? <span aria-hidden className={tr.hintGlow} /> : null}
      {open && rarityRank(result.rarity) >= rarityRank("SSR") ? <span aria-hidden className={tr.burst} /> : null}
      <span className={tr.cardInner}>
        <span className={tr.cardBack}><Pic className={tr.backArt} src={ART.cardBack} /></span>
        <span className={tr.cardFace}>
          <span className={tr.cardArt}><PrizeArt prize={result.prize} size={big ? 140 : 92} /></span>
          <Pic className={tr.frame} src={ART.card(result.rarity)} />
          <b className={tr.rarityTag}>{result.rarity}</b>
          {fresh ? <b className={tr.newBadge}>NEW</b> : null}
          <span className={tr.cardName}>{name}</span>
          <small className={tr.cardKind}>{result.duplicate ? <>Owned → <DustIcon /> +{result.dust}</> : prizeKindLabel(result.prize)}</small>
          {rarityRank(result.rarity) >= rarityRank("SSR") ? <span aria-hidden className={tr.shine} /> : null}
        </span>
      </span>
    </button>
  );
}

function PityBar({ label, since, pity }: { label: string; since: number; pity: number }) {
  const left = Math.max(1, pity - since);
  return (
    <div className={tr.pityBar}>
      <span>{label}: certain within <b>{left}</b></span>
      <span className={tr.pityTrack} role="progressbar" aria-label={`${label} pity`} aria-valuemin={0} aria-valuemax={pity} aria-valuenow={Math.min(pity, since)}>
        <span className={tr.pityFill} style={{ transform: `scaleX(${Math.min(1, since / pity)})` }} />
      </span>
      <small>{Math.min(pity, since)} / {pity}</small>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Summoning Portal

type Summoning = {
  results: OcPullResult[];
  best: OcRarity;
  count: 1 | 10;
  stage: "charge" | "signal" | "reveal";
  /** Which cards are turned face-up. */
  open: boolean[];
};

export function PortalScreen({ progress, update, onBack }: { progress: OcProgress; update: Update; onBack(): void }) {
  const [tab, setTab] = useState<"summon" | "exchange" | "rates" | "history">("summon");
  const [show, setShow] = useState<Summoning | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  // The sequence lives in a ref too: its timers read and advance it without stale closures.
  const showRef = useRef<Summoning | null>(null);
  const timers = useRef<number[]>([]);
  const single = pullPrice(progress, 1);
  const ten = pullPrice(progress, 10);

  const commit = useCallback((next: Summoning | null) => {
    showRef.current = next;
    setShow(next);
  }, []);
  const clearTimers = useCallback(() => {
    for (const t of timers.current.splice(0)) window.clearTimeout(t);
  }, []);
  // Leaving the Portal mid-summon: nothing is left ticking.
  useEffect(() => clearTimers, [clearTimers]);

  const openCard = useCallback((i: number) => {
    const cur = showRef.current;
    if (!cur || cur.open[i]) return;
    flipSound(cur.results[i]!.rarity);
    const open = [...cur.open];
    open[i] = true;
    commit({ ...cur, stage: "reveal", open });
  }, [commit]);

  /** Skip / Reveal all: straight to the final state, every card face-up. */
  const skip = useCallback(() => {
    const cur = showRef.current;
    if (!cur) return;
    clearTimers();
    if (cur.open.some((o) => !o)) flipSound(cur.best);
    commit({ ...cur, stage: "reveal", open: cur.results.map(() => true) });
  }, [clearTimers, commit]);

  const close = useCallback(() => {
    clearTimers();
    commit(null);
  }, [clearTimers, commit]);

  const pull = (count: 1 | 10) => {
    const outcome = pullPortal(progress, count, Math.random);
    if (!outcome) {
      setRefused(`Not enough Crystals: ${pullPrice(progress, count).crystals} needed.`);
      return;
    }
    setRefused(null);
    // The pulls are rolled once here and saved as rolled (the save then holds exactly what is shown).
    update(() => outcome.p);
    clearTimers();
    const { results } = outcome;
    // The signal is the real best rarity of this summon, known before anything plays.
    const best = bestRarity(results);
    if (reducedMotion()) {
      signalSound(best);
      commit({ results, best, count, stage: "reveal", open: results.map(() => true) });
      return;
    }
    commit({ results, best, count, stage: "charge", open: results.map(() => false) });
    playGarrisonSound("adventure/teleport", 0.45, 300, "cue");
    const later = (ms: number, run: () => void) => { timers.current.push(window.setTimeout(run, ms)); };
    const charge = CHARGE_MS[count];
    const signal = SIGNAL_MS[best];
    later(charge, () => {
      const cur = showRef.current;
      if (cur) commit({ ...cur, stage: "signal" });
      signalSound(best);
    });
    later(charge + signal, () => {
      const cur = showRef.current;
      if (cur) commit({ ...cur, stage: "reveal" });
    });
    // Dealt face-down, then turned one by one; a rare card waits a beat.
    let at = charge + signal + results.length * DEAL_MS + 380;
    results.forEach((r, i) => {
      if (rarityRank(r.rarity) >= rarityRank("SSR")) at += RARE_PAUSE_MS;
      later(at, () => openCard(i));
      at += FLIP_GAP_MS;
    });
  };

  // Escape: skip a summon still playing, else close it.
  const allOpen = !!show && show.open.every(Boolean);
  useEffect(() => {
    if (!show) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (allOpen) close();
      else skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allOpen, close, show, skip]);

  return (
    <>
      <Head onBack={onBack} progress={progress} title="Summoning Portal" />
      <div aria-label="Portal" className={styles.factions} role="tablist">
        {(["summon", "exchange", "rates", "history"] as const).map((id) => (
          <button aria-selected={tab === id} className={`${styles.faction} ${tab === id ? styles.factionOn : ""}`} key={id} onClick={() => setTab(id)} role="tab" type="button">
            {id === "summon" ? "Summon" : id === "exchange" ? "Stardust Exchange" : id === "rates" ? "Rates & pity" : "History"}
          </button>
        ))}
      </div>
      {tab === "summon" ? (
        <section className={tr.portalStage}>
          <div className={tr.portal}>
            <Pic className={tr.circleIdle} src={ART.circle} />
            <Pic className={tr.portalArt} fallback={<div className={tr.portalFallback} />} src={ART.portal} />
            <div className={tr.vortex} />
          </div>
          <div className={tr.pityBars}>
            <PityBar label="SSR or better" pity={OC_SSR_PITY} since={progress.pity.sinceSsr} />
            <PityBar label="UR" pity={OC_UR_PITY} since={progress.pity.sinceUr} />
          </div>
          <p className={tr.pity}>{progress.pity.pulls} summoned so far</p>
          <div className={tr.pullRow}>
            <button className={`${styles.primary} ${tr.pull}`} disabled={progress.crystals < single.crystals || !!show} onClick={() => pull(1)} type="button">
              Summon ×1<small>{single.tickets ? "1 Summoning Ticket" : <><CrystalIcon /> {single.crystals}</>}</small>
            </button>
            <button className={`${styles.primary} ${tr.pull} ${tr.pullTen}`} disabled={progress.crystals < ten.crystals || !!show} onClick={() => pull(10)} type="button">
              Summon ×10<small>{ten.tickets ? `${ten.tickets} ticket${ten.tickets > 1 ? "s" : ""} + ` : ""}<CrystalIcon /> {ten.crystals} · an SR or better guaranteed</small>
            </button>
          </div>
          {refused ? <p className={tr.warn}>{refused}</p> : null}
          <p className={styles.note}>
            Every summon brings an item, a troop, a Chaos raider, an artifact or even a hero you can find nowhere else. Duplicates of troops, heroes and artifacts turn into Stardust;
            every summon leaves some Stardust too. Crystals are earned by playing: first victories ({OC_CRYSTALS.firstClear}, a world boss {OC_CRYSTALS.bossClear}), new stars ({OC_CRYSTALS.star} each), first raid wins ({OC_CRYSTALS.raidFirst}), every new tenth wave in the Endless Siege ({OC_CRYSTALS.endlessTen}), the day&apos;s first Daily Siege ({OC_CRYSTALS.daily}) and daily attendance.
          </p>
        </section>
      ) : tab === "exchange" ? (
        <Exchange progress={progress} update={update} />
      ) : tab === "rates" ? (
        <section className={styles.panel}>
          <h2>Rates</h2>
          <p>UR {(OC_RATES.UR * 100).toFixed(1)}% · SSR {(OC_RATES.SSR * 100).toFixed(1)}% · SR {(OC_RATES.SR * 100).toFixed(1)}% · R {(OC_RATES.R * 100).toFixed(1)}%</p>
          <p className={styles.note}>
            Pity: if {OC_SSR_PITY - 1} summons in a row bring no SSR or UR, the {OC_SSR_PITY}th is certain to. If {OC_UR_PITY - 1} bring no UR, the {OC_UR_PITY}th is a UR.
            A ten-summon always holds at least one SR or better. Your counters carry over between summons.
          </p>
          <p className={styles.note}>
            Stardust each summon leaves: R {OC_STARDUST_PER_PULL.R} · SR {OC_STARDUST_PER_PULL.SR} · SSR {OC_STARDUST_PER_PULL.SSR} · UR {OC_STARDUST_PER_PULL.UR}; a duplicate troop, raider, artifact or hero adds {OC_STARDUST_DUPLICATE.SSR} (SSR) or {OC_STARDUST_DUPLICATE.UR} (UR).
          </p>
          <h2>Prizes <small>(base chance a summon; pity and the ten-summon guarantee only raise them)</small></h2>
          <div className={tr.prizeList}>
            {[...OC_GACHA_UNITS.map((u) => ({ prize: { kind: "unit", id: u.kind } as OcPrize })), ...OC_GACHA_CHAOS.map((u) => ({ prize: { kind: "chaos", id: u.kind } as OcPrize })),
              ...OC_GACHA_ARTIFACTS.map((a) => ({ prize: { kind: "artifact", id: a.id } as OcPrize })), { prize: { kind: "hero", id: OC_GACHA_HERO.id } as OcPrize },
              ...OC_ITEM_ORDER.map((id) => ({ prize: { kind: "item", id, count: 1 } as OcPrize }))].map(({ prize }) => (
              <div className={tr.prizeRow} key={`${prize.kind}:${prize.id}`}>
                <b className={`${tr.rarityChip} ${tr[`c${prizeRarity(prize)}`]}`}>{prizeRarity(prize)}</b>
                <b className={tr.chance}>{percent(baseChance(prize, prizeRarity(prize)))}</b>
                <span><strong>{prizeName(prize)}</strong> <small>({prizeKindLabel(prize)}{ownsPrize(progress, prize) ? ", owned" : ""})</small> — {prizeBlurb(prize)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <SummonHistory progress={progress} />
      )}
      {show ? <SummonOverlay onClose={close} onOpen={openCard} onPull={pull} onSkip={skip} progress={progress} show={show} /> : null}
    </>
  );
}

/** The summon itself, over the Portal screen: the charge, the signal, the cards and what they brought. */
function SummonOverlay({ show, progress, onOpen, onSkip, onClose, onPull }: {
  show: Summoning;
  progress: OcProgress;
  onOpen(i: number): void;
  onSkip(): void;
  onClose(): void;
  onPull(count: 1 | 10): void;
}) {
  const { results, best, count, stage, open } = show;
  const done = open.every(Boolean);
  const again = pullPrice(progress, count);
  const fresh = results.filter((r) => r.prize.kind !== "item" && !r.duplicate);
  const dupes = results.filter((r) => r.duplicate).length;
  const dust = results.reduce((n, r) => n + r.dust, 0);
  const tally = [...OC_RARITY_ORDER].reverse().map((r) => [r, results.filter((x) => x.rarity === r).length] as const).filter(([, n]) => n > 0);
  return (
    <div
      aria-label="Summoning"
      aria-modal="true"
      className={`${tr.summonOverlay} ${tr[`sig${best}`] ?? ""} ${stage === "charge" ? tr.charging : stage === "signal" ? tr.signaling : tr.revealing}`}
      role="dialog"
      style={{ ["--sig" as string]: `${SIGNAL_MS[best]}ms` }}
    >
      {!done ? (
        <button className={`${styles.ghostButton} ${tr.skip}`} onClick={onSkip} type="button">{stage === "reveal" ? "Reveal all" : "Skip ▸▸"}</button>
      ) : null}
      {stage !== "reveal" ? (
        <div className={tr.altar}>
          <Pic className={tr.circle} src={ART.circle} />
          <Pic className={tr.portalArt} fallback={<div className={tr.portalFallback} />} src={ART.portal} />
          <div className={tr.vortex} />
          {stage === "signal" ? (
            <>
              {best === "UR" ? <span aria-hidden className={tr.rays} /> : null}
              <span aria-hidden className={tr.orb}>
                <span className={tr.orbCore} />
                <span className={tr.orbBlue} />
                <span className={tr.orbViolet} />
                <span className={tr.orbGold} />
              </span>
              {rarityRank(best) >= rarityRank("SSR") ? <span aria-hidden className={tr.flash} /> : null}
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className={`${tr.deck} ${count === 1 ? tr.deckOne : ""}`}>
            {results.map((r, i) => <PrizeCard big={count === 1} index={i} key={i} onOpen={() => onOpen(i)} open={open[i]!} result={r} />)}
          </div>
          {done ? (
            <div className={tr.summary} role="status">
              <span className={tr.tally}>{tally.map(([r, n]) => <b className={`${tr.rarityChip} ${tr[`c${r}`]}`} key={r}>{r} ×{n}</b>)}</span>
              {fresh.length ? <span>New: <strong>{fresh.map((r) => prizeName(r.prize)).join(", ")}</strong></span> : null}
              <span><DustIcon /> +{dust} Stardust{dupes ? ` (${dupes} duplicate${dupes > 1 ? "s" : ""} turned into Stardust)` : ""}</span>
              <span className={tr.pullRow}>
                <button className={`${styles.primary} ${tr.pull} ${count === 10 ? tr.pullTen : ""}`} disabled={progress.crystals < again.crystals} onClick={() => onPull(count)} type="button">
                  Summon ×{count} again
                  <small>{again.tickets ? `${again.tickets} ticket${again.tickets > 1 ? "s" : ""}${again.crystals ? " + " : ""}` : ""}{again.crystals ? <><CrystalIcon /> {again.crystals}</> : null}</small>
                </button>
                <button className={styles.ghostButton} onClick={onClose} type="button">Close</button>
              </span>
            </div>
          ) : <p className={tr.tapHint}>Tap a card to turn it over</p>}
        </>
      )}
    </div>
  );
}

/** The Portal's history: the latest summons the save keeps, newest first, one row a summon. */
function SummonHistory({ progress }: { progress: OcProgress }) {
  const log = progress.summonLog;
  const groups: OcSummonRecord[][] = [];
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i]!;
    const last = groups[groups.length - 1];
    if (last && last[0]!.at === entry.at) last.unshift(entry);
    else groups.push([entry]);
  }
  const tally = [...OC_RARITY_ORDER].reverse().map((r) => [r, log.filter((x) => x.rarity === r).length] as const);
  return (
    <section className={styles.panel}>
      <h2>History</h2>
      <p className={styles.note}>
        Your latest {OC_SUMMON_LOG_KEPT} summons are kept here ({progress.pity.pulls} summoned in all). Among them: {tally.map(([r, n]) => `${r} ${n}`).join(" · ")}.
      </p>
      {groups.length ? (
        <div className={tr.history}>
          {groups.map((group) => (
            <div className={tr.historyRow} key={`${group[0]!.at}:${group.length}`}>
              <small className={tr.historyWhen}>{new Date(group[0]!.at).toLocaleString()} · ×{group.length}</small>
              <span className={tr.historyItems}>
                {group.map((entry, i) => (
                  <span className={tr.historyItem} key={i} title={prizeBlurb(entry.prize)}>
                    <b className={`${tr.rarityChip} ${tr[`c${entry.rarity}`]}`}>{entry.rarity}</b> {prizeName(entry.prize)}
                    {entry.prize.kind !== "item" && !entry.duplicate ? <b className={tr.newChip}>new</b> : null}
                    {entry.duplicate ? <small> (owned, +{entry.dust} ✧)</small> : null}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      ) : <p className={styles.note}>No summons yet.</p>}
    </section>
  );
}

function Exchange({ progress, update }: { progress: OcProgress; update: Update }) {
  const offers: { prize: OcPrize; rarity: OcRarity }[] = [
    ...OC_GACHA_UNITS.map((u) => ({ prize: { kind: "unit", id: u.kind } as OcPrize, rarity: u.rarity as OcRarity })),
    { prize: { kind: "hero", id: OC_GACHA_HERO.id } as OcPrize, rarity: "UR" as OcRarity },
    ...OC_GACHA_CHAOS.map((u) => ({ prize: { kind: "chaos", id: u.kind } as OcPrize, rarity: u.rarity as OcRarity })),
    ...OC_GACHA_ARTIFACTS.map((a) => ({ prize: { kind: "artifact", id: a.id } as OcPrize, rarity: a.rarity as OcRarity })),
    ...OC_ITEM_ORDER.filter((id) => OC_ITEMS[id].rarity !== "SSR").map((id) => ({ prize: { kind: "item", id, count: 1 } as OcPrize, rarity: OC_ITEMS[id].rarity }))
  ];
  return (
    <section className={styles.panel}>
      <h2>Stardust Exchange <small>(<DustIcon /> {progress.stardust})</small></h2>
      <p className={styles.note}>Trade Stardust for the prize you want. Troops, heroes, raiders and artifacts can be bought once.</p>
      <div className={tr.exchange}>
        {offers.map(({ prize, rarity }) => {
          const owned = prize.kind !== "item" && ownsPrize(progress, prize);
          const price = OC_EXCHANGE_PRICE[rarity];
          return (
            <div className={`${tr.offer} ${tr[`b${rarity}`] ?? ""}`} key={`${prize.kind}:${prize.id}`} title={prizeBlurb(prize)}>
              <div className={tr.offerArt}><PrizeArt prize={prize} size={64} /></div>
              <b className={`${tr.rarityChip} ${tr[`c${rarity}`]}`}>{rarity}</b>
              <span>{prizeName(prize)}</span>
              <button className={styles.ghostButton} disabled={owned || progress.stardust < price} onClick={() => update((p) => exchange(p, prize, rarity))} type="button">
                {owned ? "Owned" : <><DustIcon /> {price}</>}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The Satchel

export function SatchelScreen({ progress, update, onBack, onGarden }: { progress: OcProgress; update: Update; onBack(): void; onGarden(): void }) {
  const owned = OC_ITEM_ORDER.filter((id) => itemCount(progress, id) > 0);
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <Head onBack={onBack} progress={progress} title="Satchel" />
      <p className={oc.prepBrief}>
        Items you find in battle, at the Portal and in the daily calendar. Battle boosts are packed on the battle screen (up to {OC_PACK_SLOTS} different ones) and used
        during the battle — each only a few times a battle, one copy spent a use; the rest you use from here.
      </p>
      {note ? <p className={oc.reward} role="status">{note}</p> : null}
      {owned.length ? (
        <div className={tr.satchel}>
          {owned.map((id) => {
            const item = OC_ITEMS[id];
            return (
              <div className={`${tr.slot} ${tr[`b${item.rarity}`] ?? ""}`} key={id}>
                <div className={tr.slotArt}><Pic className={tr.itemArt} fallback={<span className={tr.glyph}>✦</span>} src={item.icon} /><b className={tr.qty}>×{itemCount(progress, id)}</b></div>
                <strong>{item.name} <b className={`${tr.rarityChip} ${tr[`c${item.rarity}`]}`}>{item.rarity}</b></strong>
                <small>{item.blurb}</small>
                {item.effect.kind === "use" ? (
                  <button className={styles.primary} onClick={() => { update((p) => useItem(p, id)); setNote(`Used: ${item.name}.`); }} type="button">Use</button>
                ) : item.effect.kind === "ripen" ? (
                  <button className={styles.ghostButton} onClick={onGarden} type="button">Use in the Garden</button>
                ) : item.effect.kind === "boost" ? (
                  <span className={tr.hint}>Pack it before a battle · up to {itemPerMatch(id)} use{itemPerMatch(id) === 1 ? "" : "s"} a battle</span>
                ) : item.effect.kind === "ticket" ? (
                  <span className={tr.hint}>Spent at the Portal</span>
                ) : (
                  <span className={tr.hint}>Spent at the Forge</span>
                )}
              </div>
            );
          })}
        </div>
      ) : <p className={styles.note}>The Satchel is empty. Win battles, claim the daily calendar or summon at the Portal.</p>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Packing boosts for a battle (the preparation screen)

export function PackItems({ progress, update }: { progress: OcProgress; update: Update }) {
  const boosts = OC_ITEM_ORDER.filter((id) => OC_ITEMS[id].effect.kind === "boost" && itemCount(progress, id) > 0);
  if (!boosts.length) return null;
  return (
    <>
      <h2>Satchel ({progress.packed.length} / {OC_PACK_SLOTS} packed)</h2>
      <div className={oc.artifacts}>
        {boosts.map((id) => {
          const on = progress.packed.includes(id);
          return (
            <button aria-pressed={on} className={`${oc.artifact} ${on ? oc.artifactOn : ""}`} key={id} onClick={() => update((p) => togglePacked(p, id))} title={`${OC_ITEMS[id].blurb} Up to ${itemPerMatch(id)} use${itemPerMatch(id) === 1 ? "" : "s"} a battle.`} type="button">
              <Pic fallback={<span className={tr.glyph}>✦</span>} src={OC_ITEMS[id].icon} />
              <span>{OC_ITEMS[id].name} ×{itemCount(progress, id)} · {itemPerMatch(id)}/battle</span>
            </button>
          );
        })}
      </div>
      <p className={styles.note}>Packed items ride into the battle in your Satchel: use them there when you need them, each up to its uses a battle, one copy spent a use (not in Chaos Raids or the Daily Siege).</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Daily attendance

export function AttendanceDialog({ progress, update, onClose }: { progress: OcProgress; update: Update; onClose(): void }) {
  const day = useMemo(() => ocDayKey(), []);
  const today = attendanceToday(progress.attendance, day);
  const [claimed, setClaimed] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const shownIndex = claimed ? (progress.attendance.claimed - 1) % OC_ATTENDANCE.length : today.index;
  return (
    <div className={tr.overlay}>
      <section aria-label="Daily attendance" aria-modal="true" className={`${styles.dialog} ${tr.calendar}`} role="dialog">
        <h2>Daily Rewards</h2>
        <p className={styles.note}>One square a day (the day turns at midnight UTC). Miss a day and the calendar simply waits for you.</p>
        <div className={tr.days}>
          {OC_ATTENDANCE.map((reward, i) => {
            const done = i < (progress.attendance.claimed % OC_ATTENDANCE.length) || (claimed && i === shownIndex);
            const current = i === shownIndex;
            return (
              <div className={`${tr.day} ${done ? tr.dayDone : ""} ${current && !claimed && today.open ? tr.dayNow : ""} ${i === 6 ? tr.dayBig : ""}`} key={i}>
                <small>Day {i + 1}</small>
                {reward.crystals ? <span><CrystalIcon /> {reward.crystals}</span> : null}
                {(reward.items ?? []).map((it) => (
                  <span className={tr.dayItem} key={it.id} title={OC_ITEMS[it.id].blurb}>
                    <Pic className={tr.dayIcon} fallback={<span className={tr.glyph}>✦</span>} src={OC_ITEMS[it.id].icon} />×{it.count}
                  </span>
                ))}
                {done ? <i className={tr.stamp}>✓</i> : null}
              </div>
            );
          })}
        </div>
        <div className={tr.pullRow}>
          {today.open && !claimed ? (
            <button className={`${styles.primary} ${tr.pull}`} onClick={() => { update((p) => claimAttendance(p, day)); setClaimed(true); }} type="button">Claim day {today.index + 1}</button>
          ) : <span className={styles.note}>{claimed ? "Claimed! Come back tomorrow." : "Today's reward is claimed. Come back tomorrow."}</span>}
          <button className={styles.ghostButton} onClick={onClose} type="button">Close</button>
        </div>
      </section>
    </div>
  );
}

export function attendanceOpen(progress: OcProgress): boolean {
  return attendanceToday(progress.attendance, ocDayKey()).open;
}

/** The Satchel item list (for tiles and badges). */
export function satchelCount(progress: OcProgress): number {
  return OC_ITEM_ORDER.reduce((n, id) => n + itemCount(progress, id as OcItemId), 0);
}
