"use client";

/**
 * Order & Chaos treasury screens: the Summoning Portal (a featured banner with
 * the portal-only prizes, the wallet, 1x / 10x summons with exact costs, pity
 * bars, the daily calendar; a staged summon: the portal charges, its light
 * signals the best rarity actually rolled, the cards are dealt face down and
 * turned one by one — tap, Space, Skip / Reveal all — then the results sorted
 * by rarity; the rates and the pool with each prize's base chance, the saved
 * summon history and the Stardust Exchange), the Satchel (items with
 * quantities, grouped by use), the daily attendance dialog and the item
 * packing row on the battle-preparation screen. Rules:
 * engine/garrison/order-chaos/treasury.ts; save operations:
 * lib/order-chaos-treasury.ts. Nothing here changes a rate, a price or a prize.
 */

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { BLESSINGS, DEFENDERS, ENEMIES } from "@/engine/garrison/content";
import { OC_GACHA_ARTIFACTS, OC_GACHA_CHAOS, OC_GACHA_HERO, OC_GACHA_UNITS } from "@/engine/garrison/order-chaos/gacha-content";
import { ocDayKey } from "@/engine/garrison/order-chaos/scores";
import {
  OC_ATTENDANCE, OC_CRYSTALS, OC_EXCHANGE_PRICE, OC_ITEMS, OC_ITEM_ORDER, OC_PACK_SLOTS, OC_PULL_COST, OC_RARITY_ORDER, OC_RATES, OC_SSR_PITY,
  OC_STARDUST_DUPLICATE, OC_STARDUST_PER_PULL, OC_SUMMON_LOG_KEPT, OC_TEN_PULL_COST, OC_UR_PITY, attendanceToday, itemPerMatch,
  type OcItemId, type OcPrize, type OcRarity, type OcSummonRecord
} from "@/engine/garrison/order-chaos/treasury";
import { assetUrl } from "@/lib/asset-url";
import { prefersReducedMotion, subscribeReducedMotion } from "@/lib/display-preferences";
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
  tray: "/assets/order-chaos/ui/tray.webp",
  keyArt: "/assets/order-chaos/ui/portal-banner.webp",
  crystal: "/assets/order-chaos/gacha/crystal.webp",
  stardust: "/assets/order-chaos/gacha/stardust.webp",
  ticket: "/assets/order-chaos/items/summon-ticket.webp",
  portal: "/assets/order-chaos/gacha/portal.webp",
  cardBack: "/assets/order-chaos/gacha/card-back.webp",
  circle: "/assets/order-chaos/gacha/summon-circle.webp",
  card: (r: OcRarity) => `/assets/order-chaos/gacha/card-${r.toLowerCase()}.webp`
} as const;

const RANK: Record<OcRarity, number> = { R: 0, SR: 1, SSR: 2, UR: 3 };
const RARITY_DESC = [...OC_RARITY_ORDER].reverse() as OcRarity[];

/** The reduced-motion choice (Options override, else the OS), live. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

/** The painted plank and ribbon the framed panels are drawn with. */
const frameVars = (): CSSProperties => ({ ["--oc-tray" as string]: `url("${assetUrl(ART.tray)}")`, ["--oc-banner" as string]: `url("${assetUrl(ART.banner)}")` });

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

function TicketIcon() {
  return <Pic className={tr.icon} fallback={<span className={tr.glyph}>▣</span>} src={ART.ticket} />;
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

/** Crystals, Summoning Tickets and Stardust on one plank. */
function Wallet({ progress }: { progress: OcProgress }) {
  return (
    <div aria-label="Your treasury" className={tr.wallet} role="group">
      <span title={`Crystals: earned by playing; ${OC_PULL_COST} a summon, ${OC_TEN_PULL_COST} for ten`}><CrystalIcon /> <b>{progress.crystals}</b></span>
      <span title="Summoning Tickets: one free summon each, used before Crystals"><TicketIcon /> <b>{itemCount(progress, "summon-ticket")}</b></span>
      <span title="Stardust: left by every summon and by duplicates; spend it in the Stardust Exchange"><DustIcon /> <b>{progress.stardust}</b></span>
    </div>
  );
}

function Head({ title, onBack, progress }: { title: string; onBack(): void; progress: OcProgress }) {
  return (
    <div className={`${oc.campHead} ${tr.head}`}>
      <button className={oc.backButton} onClick={onBack} type="button">‹ Back</button>
      <h1 className={oc.titleBanner} style={{ ["--oc-banner" as string]: `url("${assetUrl(ART.banner)}")` }}><span>{title}</span></h1>
      <Wallet progress={progress} />
    </div>
  );
}

/** A framed panel with its name on the painted ribbon (the Home screen's group look). */
function Panel({ title, children, className = "", aside }: { title: string; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section aria-label={title} className={`${oc.homeGroup} ${tr.panel} ${className}`}>
      <h2 className={oc.groupHead}><span>{title}</span></h2>
      {aside ? <div className={tr.panelAside}>{aside}</div> : null}
      {children}
    </section>
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

const prizeKey = (prize: OcPrize) => `${prize.kind}:${prize.id}`;

/** Owned now: a permanent prize unlocked, or at least one of the item in the Satchel. */
function holds(p: OcProgress, prize: OcPrize): boolean {
  return prize.kind === "item" ? itemCount(p, prize.id) > 0 : ownsPrize(p, prize);
}

function PrizeArt({ prize, size = 96 }: { prize: OcPrize; size?: number }) {
  switch (prize.kind) {
    case "item": return <Pic className={tr.itemArt} fallback={<span className={tr.glyph}>✦</span>} src={OC_ITEMS[prize.id].icon} />;
    case "unit": return <DefenderArt kind={prize.id} size={size} />;
    case "chaos": return <AttackerArt kind={prize.id} size={size} />;
    case "artifact": return <Pic className={tr.itemArt} fallback={<span className={tr.glyph}>✦</span>} src={BLESSINGS[prize.id as keyof typeof BLESSINGS]?.icon ?? ""} />;
    case "hero": return <Pic className={tr.heroArt} src={OC_GACHA_HERO.portrait} />;
  }
}

/** The prize on its rarity card: the same frame everywhere (summon, banner, pool, Exchange, Satchel). */
function RarityCard({ prize, rarity, size = 72, dim = false, badge, className = "" }: { prize: OcPrize; rarity: OcRarity; size?: number; dim?: boolean; badge?: ReactNode; className?: string }) {
  return (
    <div className={`${tr.rcard} ${tr[`r${rarity}`]} ${dim ? tr.dim : ""} ${className}`} title={`${prizeName(prize)} (${rarity}) — ${prizeBlurb(prize)}`}>
      <div className={tr.rcardArt}><PrizeArt prize={prize} size={size} /></div>
      <Pic className={tr.frame} src={ART.card(rarity)} />
      <b className={tr.rarityTag}>{rarity}</b>
      {badge}
    </div>
  );
}

function RarityChip({ rarity }: { rarity: OcRarity }) {
  return <b className={`${tr.rarityChip} ${tr[`c${rarity}`]}`}>{rarity}</b>;
}

/** The best rarity among the pulls (what the Portal's signal shows before any card turns). */
function bestRarity(results: readonly { rarity: OcRarity }[]): OcRarity {
  return results.reduce<OcRarity>((top, r) => (RANK[r.rarity] > RANK[top] ? r.rarity : top), "R");
}

function percent(x: number): string {
  return `${(x * 100).toFixed(x > 0 && x < 0.001 ? 3 : 2)}%`;
}

const ratePct = (r: OcRarity) => `${(OC_RATES[r] * 100).toFixed(1)}%`;

// ---------------------------------------------------------------------------
// Filters (rarity, owned) shared by every prize list

type RarityFilter = "all" | OcRarity;
type OwnFilter = "all" | "owned" | "unowned";

function Filters({ rarity, onRarity, own, onOwn, ownLabels = ["Owned", "Not owned"] }: { rarity: RarityFilter; onRarity(r: RarityFilter): void; own: OwnFilter; onOwn(o: OwnFilter): void; ownLabels?: [string, string] }) {
  return (
    <div className={tr.filters}>
      <div aria-label="Rarity" className={tr.chipRow} role="group">
        {(["all", ...RARITY_DESC] as RarityFilter[]).map((r) => (
          <button aria-pressed={rarity === r} className={`${tr.filterChip} ${r !== "all" ? tr[`f${r}`] : ""} ${rarity === r ? tr.filterOn : ""}`} key={r} onClick={() => onRarity(r)} type="button">
            {r === "all" ? "All" : r}
          </button>
        ))}
      </div>
      <div aria-label="Owned" className={tr.chipRow} role="group">
        {(["all", "owned", "unowned"] as OwnFilter[]).map((o) => (
          <button aria-pressed={own === o} className={`${tr.filterChip} ${own === o ? tr.filterOn : ""}`} key={o} onClick={() => onOwn(o)} type="button">
            {o === "all" ? "Any" : o === "owned" ? ownLabels[0] : ownLabels[1]}
          </button>
        ))}
      </div>
    </div>
  );
}

function sortByRarity<T extends { rarity: OcRarity; name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => RANK[b.rarity] - RANK[a.rarity] || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// The pool, with each prize's base chance on one summon: its rarity's rate × its
// share of that rarity's pool (the same pools and rates the pull rolls).

type PoolRow = { prize: OcPrize; rarity: OcRarity; chance: number; name: string };

const POOL_ROWS: PoolRow[] = OC_RARITY_ORDER.flatMap((rarity) => {
  const pool = OC_PORTAL_POOLS[rarity];
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  return total > 0 ? pool.map((e) => ({ prize: e.prize, rarity, chance: (OC_RATES[rarity] * e.weight) / total, name: prizeName(e.prize) })) : [];
});

// ---------------------------------------------------------------------------
// The summon's beats (ms): the portal charges, its light shows the best rarity, the cards are dealt and turned one by one.

const CHARGE_MS: Record<1 | 10, number> = { 1: 900, 10: 1100 };
const SIGNAL_MS: Record<OcRarity, number> = { R: 650, SR: 850, SSR: 1250, UR: 1750 };
const DEAL_MS = 70;
const FLIP_GAP_MS = 190;
/** A rare card waits a beat longer before it turns. */
const RARE_PAUSE_MS = 420;
/** Once the last card is face up, a beat to see it before the sorted results. */
const SETTLE_MS: Record<1 | 10, number> = { 1: 1300, 10: 900 };

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

const buySound = () => playGarrisonSound("adventure/pickup-01", 0.35, 200, "cue");
const claimSound = () => playGarrisonSound("adventure/chest", 0.4, 300, "cue");

function Cost({ price }: { price: { tickets: number; crystals: number } }) {
  return (
    <>
      {price.tickets ? <><TicketIcon /> {price.tickets}{price.crystals ? " + " : ""}</> : null}
      {price.crystals ? <><CrystalIcon /> {price.crystals}</> : null}
    </>
  );
}

/** A face-down card of the summon: tap it to turn it; face down, an SR or better already glows its colour. */
function PrizeCard({ result, index, open, next, onOpen }: { result: OcPullResult; index: number; open: boolean; next: boolean; onOpen(): void }) {
  const fresh = result.prize.kind !== "item" && !result.duplicate;
  const name = prizeName(result.prize);
  const rare = RANK[result.rarity] >= RANK.SSR;
  return (
    <button
      aria-label={open ? `${result.rarity}: ${name}${fresh ? " (new)" : result.duplicate ? ` (owned: +${result.dust} Stardust)` : ""}` : `Face-down card ${index + 1}: turn it over`}
      className={`${tr.flip} ${tr[`r${result.rarity}`]} ${open ? tr.flipped : ""} ${next && !open ? tr.flipNext : ""}`}
      onClick={(event) => { event.stopPropagation(); if (!open) onOpen(); }}
      style={{ ["--deal" as string]: `${index * DEAL_MS}ms` }}
      title={open ? prizeBlurb(result.prize) : undefined}
      type="button"
    >
      {result.rarity !== "R" ? <span aria-hidden className={tr.hintGlow} /> : null}
      {open && rare ? <span aria-hidden className={tr.burst} /> : null}
      <span className={tr.flipInner}>
        <span className={tr.flipBack}><Pic className={tr.backArt} fallback={<span className={tr.backFallback} />} src={ART.cardBack} /></span>
        <span className={tr.flipFace}>
          <RarityCard
            badge={<>{fresh ? <i className={tr.newBadge}>NEW</i> : null}{rare ? <span aria-hidden className={tr.shineWrap}><span className={tr.shine} /></span> : null}</>}
            prize={result.prize}
            rarity={result.rarity}
            size={88}
          />
          <span className={tr.flipName}>{name}</span>
        </span>
      </span>
    </button>
  );
}

/** A card of the final results (sorted by rarity): NEW, or the duplicate's Stardust. */
function ResultCard({ result, progress }: { result: OcPullResult; progress: OcProgress }) {
  const fresh = result.prize.kind !== "item" && !result.duplicate;
  return (
    <div className={`${tr.resultCard} ${tr[`r${result.rarity}`]}`}>
      <RarityCard badge={fresh ? <i className={tr.newBadge}>NEW</i> : null} prize={result.prize} rarity={result.rarity} size={88} />
      <span className={tr.flipName}>{prizeName(result.prize)}</span>
      <small className={tr.resultKind}>
        {result.duplicate
          ? <>Owned → <DustIcon /> +{result.dust}</>
          : <>{prizeKindLabel(result.prize)}{result.prize.kind === "item" ? ` · ${itemCount(progress, result.prize.id)} in Satchel` : ""} · <DustIcon /> +{result.dust}</>}
      </small>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Summoning Portal

type Summoning = {
  /** A fresh id a summon, so a "summon again" deals new cards rather than turning the old ones back. */
  id: number;
  results: OcPullResult[];
  best: OcRarity;
  count: 1 | 10;
  stage: "charge" | "signal" | "reveal" | "results";
  /** Which cards are turned face-up. */
  open: boolean[];
};

type PortalTab = "summon" | "details" | "history" | "exchange";
const TAB_LABEL: Record<PortalTab, string> = { summon: "Summon", details: "Details & rates", history: "History", exchange: "Stardust Exchange" };

export function PortalScreen({ progress, update, onBack }: { progress: OcProgress; update: Update; onBack(): void }) {
  const [tab, setTab] = useState<PortalTab>("summon");
  const [show, setShow] = useState<Summoning | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const reduced = useReducedMotion();
  // The sequence lives in a ref too: its timers read and advance it without stale closures.
  const showRef = useRef<Summoning | null>(null);
  const timers = useRef<number[]>([]);
  const ids = useRef(0);

  const commit = useCallback((next: Summoning | null) => {
    showRef.current = next;
    setShow(next);
  }, []);
  const clearTimers = useCallback(() => {
    for (const t of timers.current.splice(0)) window.clearTimeout(t);
  }, []);
  const later = useCallback((ms: number, run: () => void) => { timers.current.push(window.setTimeout(run, ms)); }, []);
  // Leaving the Portal mid-summon: nothing is left ticking.
  useEffect(() => clearTimers, [clearTimers]);

  const openCard = useCallback((i: number) => {
    const cur = showRef.current;
    if (!cur || cur.open[i] || cur.stage === "results") return;
    flipSound(cur.results[i]!.rarity);
    const open = [...cur.open];
    open[i] = true;
    commit({ ...cur, stage: "reveal", open });
    // The last card turned: a beat to look at it, then the results sorted by rarity.
    if (open.every(Boolean)) {
      const id = cur.id;
      later(SETTLE_MS[cur.count], () => {
        const now = showRef.current;
        if (now && now.id === id && now.stage === "reveal") commit({ ...now, stage: "results" });
      });
    }
  }, [commit, later]);

  /** Skip / Reveal all: straight to the results, every card face-up. */
  const skip = useCallback(() => {
    const cur = showRef.current;
    if (!cur) return;
    clearTimers();
    const hidden = cur.results.filter((_, i) => !cur.open[i]);
    if (hidden.length) flipSound(bestRarity(hidden));
    commit({ ...cur, stage: "results", open: cur.results.map(() => true) });
  }, [clearTimers, commit]);

  /** A tap (or Space / Enter): open the portal at once, else turn the next face-down card. */
  const advance = useCallback(() => {
    const cur = showRef.current;
    if (!cur) return;
    if (cur.stage === "charge" || cur.stage === "signal") {
      clearTimers();
      if (cur.stage === "charge") signalSound(cur.best);
      commit({ ...cur, stage: "reveal" });
      return;
    }
    if (cur.stage !== "reveal") return;
    const nextIndex = cur.open.findIndex((o) => !o);
    if (nextIndex >= 0) openCard(nextIndex);
  }, [clearTimers, commit, openCard]);

  const close = useCallback(() => {
    clearTimers();
    commit(null);
  }, [clearTimers, commit]);

  const pull = (count: 1 | 10) => {
    const outcome = pullPortal(progress, count, Math.random);
    if (!outcome) {
      setRefused(`Not enough Crystals: ${pullPrice(progress, count).crystals} needed, you have ${progress.crystals}.`);
      return;
    }
    setRefused(null);
    // The pulls are rolled once here and saved as rolled (the save then holds exactly what is shown).
    update(() => outcome.p);
    clearTimers();
    const { results } = outcome;
    // The signal is the real best rarity of this summon, known before anything plays.
    const best = bestRarity(results);
    ids.current += 1;
    const id = ids.current;
    if (prefersReducedMotion()) {
      signalSound(best);
      commit({ id, results, best, count, stage: "results", open: results.map(() => true) });
      return;
    }
    commit({ id, results, best, count, stage: "charge", open: results.map(() => false) });
    playGarrisonSound("adventure/teleport", 0.45, 300, "cue");
    const charge = CHARGE_MS[count];
    const signal = SIGNAL_MS[best];
    later(charge, () => {
      const cur = showRef.current;
      if (cur?.id === id && cur.stage === "charge") commit({ ...cur, stage: "signal" });
      signalSound(best);
    });
    later(charge + signal, () => {
      const cur = showRef.current;
      if (cur?.id === id && cur.stage === "signal") commit({ ...cur, stage: "reveal" });
    });
    // Dealt face-down, then turned one by one; a rare card waits a beat.
    let at = charge + signal + results.length * DEAL_MS + 380;
    results.forEach((r, i) => {
      if (RANK[r.rarity] >= RANK.SSR) at += RARE_PAUSE_MS;
      later(at, () => { if (showRef.current?.id === id) openCard(i); });
      at += FLIP_GAP_MS;
    });
  };

  // Escape: skip a summon still playing, else close it. Space / Enter: the next beat.
  const stage = show?.stage ?? null;
  useEffect(() => {
    if (!stage) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (stage === "results") close();
        else skip();
      } else if ((event.key === " " || event.key === "Enter") && stage !== "results") {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, close, skip, stage]);

  return (
    <div className={`${tr.screen} ${reduced ? tr.still : ""}`} style={frameVars()}>
      <Head onBack={onBack} progress={progress} title="Summoning Portal" />
      <div aria-label="Portal" className={`${styles.factions} ${tr.tabs}`} role="tablist">
        {(Object.keys(TAB_LABEL) as PortalTab[]).map((id) => (
          <button aria-selected={tab === id} className={`${styles.faction} ${tr.tab} ${tab === id ? styles.factionOn : ""}`} key={id} onClick={() => setTab(id)} role="tab" type="button">
            {TAB_LABEL[id]}{id === "history" && progress.summonLog.length ? <small> ({progress.summonLog.length})</small> : null}
          </button>
        ))}
      </div>
      {tab === "summon" ? <SummonTab busy={!!show} onPull={pull} progress={progress} refused={refused} update={update} /> : null}
      {tab === "details" ? <Details progress={progress} /> : null}
      {tab === "history" ? <SummonHistory progress={progress} /> : null}
      {tab === "exchange" ? <Exchange progress={progress} update={update} /> : null}
      {show ? <SummonOverlay key={show.id} onAdvance={advance} onClose={close} onOpen={openCard} onPull={pull} onSkip={skip} progress={progress} show={show} /> : null}
    </div>
  );
}

/** The summon itself, over the Portal screen: the charge, the signal, the cards and what they brought. */
function SummonOverlay({ show, progress, onOpen, onAdvance, onSkip, onClose, onPull }: {
  show: Summoning;
  progress: OcProgress;
  onOpen(i: number): void;
  onAdvance(): void;
  onSkip(): void;
  onClose(): void;
  onPull(count: 1 | 10): void;
}) {
  const { results, best, count, stage, open } = show;
  const again = pullPrice(progress, count);
  const short = again.crystals - progress.crystals;
  const fresh = results.filter((r) => r.prize.kind !== "item" && !r.duplicate).length;
  const dupes = results.filter((r) => r.duplicate).length;
  const dust = results.reduce((n, r) => n + r.dust, 0);
  const tally = RARITY_DESC.map((r) => [r, results.filter((x) => x.rarity === r).length] as const).filter(([, n]) => n > 0);
  const turned = open.filter(Boolean).length;
  const nextIndex = open.findIndex((o) => !o);
  const sorted = results.map((r, i) => ({ r, i })).sort((a, b) => RANK[b.r.rarity] - RANK[a.r.rarity] || a.i - b.i);
  return (
    <div
      aria-label="Summoning"
      aria-modal="true"
      className={`${tr.summonOverlay} ${tr[`sig${best}`] ?? ""} ${stage === "charge" ? tr.charging : stage === "signal" ? tr.signaling : tr.revealing} ${stage === "reveal" ? tr.tapToReveal : ""}`}
      onClick={stage === "reveal" ? onAdvance : undefined}
      role="dialog"
      style={{ ["--sig" as string]: `${SIGNAL_MS[best]}ms` }}
    >
      {stage !== "results" ? (
        <button className={`${styles.ghostButton} ${tr.skip}`} onClick={(event) => { event.stopPropagation(); onSkip(); }} type="button">{stage === "reveal" ? "Reveal all ⏭" : "Skip ▸▸"}</button>
      ) : null}
      {stage === "charge" || stage === "signal" ? (
        <button aria-label="Open the portal" className={tr.chargeStage} onClick={onAdvance} type="button">
          <span className={tr.altar}>
            <Pic className={tr.circle} src={ART.circle} />
            <Pic className={tr.portalArt} fallback={<span className={tr.portalFallback} />} src={ART.portal} />
            <span className={tr.vortex} />
            {stage === "signal" ? (
              <>
                {best === "UR" ? <span aria-hidden className={tr.rays} /> : null}
                <span aria-hidden className={tr.orb}>
                  <span className={tr.orbCore} />
                  <span className={tr.orbSR} />
                  <span className={tr.orbSSR} />
                  <span className={tr.orbUR} />
                </span>
                {RANK[best] >= RANK.SSR ? <span aria-hidden className={tr.flash} /> : null}
              </>
            ) : null}
          </span>
          <span className={tr.chargeHint}>Tap to open</span>
        </button>
      ) : (
        <div className={tr.revealStage}>
          <h2 className={tr.revealTitle}>
            {stage === "results" ? "Summon results" : results.length > 1 ? `Revealed ${turned} / ${results.length}` : "Your summon"}
          </h2>
          {stage === "reveal" ? (
            <>
              <div className={`${tr.results} ${count === 1 ? tr.resultsOne : ""}`}>
                {results.map((r, i) => <PrizeCard index={i} key={i} next={i === nextIndex} onOpen={() => onOpen(i)} open={open[i]!} result={r} />)}
              </div>
              <p className={tr.tapHint}>{nextIndex >= 0 ? "Tap a card (or anywhere) to turn it over" : " "}</p>
            </>
          ) : (
            <>
              <div className={tr.summary} role="status">
                <span>Best: <RarityChip rarity={best} /></span>
                <span className={tr.tally}>{tally.map(([r, n]) => <b className={`${tr.rarityChip} ${tr[`c${r}`]}`} key={r}>{r} ×{n}</b>)}</span>
                <span><DustIcon /> +{dust} Stardust{dupes ? ` (${dupes} duplicate${dupes > 1 ? "s" : ""} turned into Stardust)` : ""}</span>
                {fresh ? <span className={tr.newText}>{fresh} new unlock{fresh === 1 ? "" : "s"}!</span> : null}
              </div>
              <div className={`${tr.results} ${count === 1 ? tr.resultsOne : ""}`}>
                {sorted.map(({ r, i }) => <ResultCard key={i} progress={progress} result={r} />)}
              </div>
              {count === 1 ? <p className={tr.oneBlurb}>{prizeBlurb(results[0]!.prize)}</p> : null}
              <div className={tr.revealActions}>
                <button
                  className={`${styles.primary} ${tr.cta} ${count === 10 ? tr.pullTen : ""}`}
                  disabled={short > 0}
                  onClick={() => onPull(count)}
                  title={short > 0 ? `Needs ${short} more Crystals` : ""}
                  type="button"
                >
                  Summon ×{count} again <small><Cost price={again} /></small>
                </button>
                <button className={styles.ghostButton} onClick={onClose} type="button">Close</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const FEATURED_UR: { prize: OcPrize; rarity: OcRarity }[] = [
  ...OC_GACHA_UNITS.filter((u) => u.rarity === "UR").map((u) => ({ prize: { kind: "unit", id: u.kind } as OcPrize, rarity: "UR" as OcRarity })),
  { prize: { kind: "hero", id: OC_GACHA_HERO.id } as OcPrize, rarity: "UR" as OcRarity }
];
const FEATURED_SSR: { prize: OcPrize; rarity: OcRarity }[] = [
  ...OC_GACHA_UNITS.filter((u) => u.rarity === "SSR").map((u) => ({ prize: { kind: "unit", id: u.kind } as OcPrize, rarity: "SSR" as OcRarity })),
  ...OC_GACHA_CHAOS.map((u) => ({ prize: { kind: "chaos", id: u.kind } as OcPrize, rarity: "SSR" as OcRarity })),
  ...OC_GACHA_ARTIFACTS.map((a) => ({ prize: { kind: "artifact", id: a.id } as OcPrize, rarity: "SSR" as OcRarity }))
];

function SummonTab({ progress, update, onPull, refused, busy }: { progress: OcProgress; update: Update; onPull(count: 1 | 10): void; refused: string | null; busy: boolean }) {
  const one = pullPrice(progress, 1);
  const ten = pullPrice(progress, 10);
  const ssrLeft = Math.max(1, OC_SSR_PITY - progress.pity.sinceSsr);
  const urLeft = Math.max(1, OC_UR_PITY - progress.pity.sinceUr);
  const ownedFeatured = [...FEATURED_UR, ...FEATURED_SSR].filter((f) => ownsPrize(progress, f.prize)).length;
  const headliners = FEATURED_UR.map((f) => prizeName(f.prize)).join(" and ");
  return (
    <>
      <section className={tr.banner} style={{ ["--oc-key" as string]: `url("${assetUrl(ART.keyArt)}")` }}>
        <div className={tr.bannerText}>
          <small className={tr.bannerKicker}>Portal-only prizes</small>
          <h2 className={tr.bannerTitle}>Crystal &amp; Fortune</h2>
          <p className={tr.bannerLine}>{headliners} wait beyond the portal — with angels, raiders and artifacts found nowhere else.</p>
          <div className={tr.bannerRates}>
            {RARITY_DESC.map((r) => <span key={r}><RarityChip rarity={r} /> {ratePct(r)}</span>)}
          </div>
          <small className={tr.bannerOwned}>{ownedFeatured} / {FEATURED_UR.length + FEATURED_SSR.length} portal prizes collected</small>
        </div>
        <div className={tr.showcase}>
          <div className={tr.showcaseUr}>
            {FEATURED_UR.map((f) => (
              <figure className={tr.showItem} key={prizeKey(f.prize)}>
                <RarityCard badge={ownsPrize(progress, f.prize) ? <i className={tr.ownedBadge}>✓</i> : null} prize={f.prize} rarity="UR" size={96} />
                <figcaption>{prizeName(f.prize).split(",")[0]}</figcaption>
              </figure>
            ))}
          </div>
          <div className={tr.showcaseSsr}>
            {FEATURED_SSR.map((f) => (
              <RarityCard badge={ownsPrize(progress, f.prize) ? <i className={tr.ownedBadge}>✓</i> : null} key={prizeKey(f.prize)} prize={f.prize} rarity="SSR" size={52} />
            ))}
          </div>
        </div>
      </section>

      <div className={tr.summonGrid}>
        <Panel title="Summon">
          <div className={tr.pity}>
            <PityBar label={<>An <RarityChip rarity="SSR" /> or better certain within <b>{ssrLeft}</b></>} name="SSR or better" pity={OC_SSR_PITY} rarity="SSR" since={progress.pity.sinceSsr} />
            <PityBar label={<>A <RarityChip rarity="UR" /> certain within <b>{urLeft}</b></>} name="UR" pity={OC_UR_PITY} rarity="UR" since={progress.pity.sinceUr} />
            <small className={tr.pityNote}>{progress.pity.pulls} summoned so far · counters carry over between summons</small>
          </div>
          <div className={tr.pullRow}>
            <PullButton busy={busy} count={1} onPull={onPull} price={one} progress={progress} />
            <PullButton busy={busy} count={10} onPull={onPull} price={ten} progress={progress} />
          </div>
          {refused ? <p className={tr.warn} role="alert">{refused}</p> : null}
        </Panel>
        <Panel title="Daily rewards">
          <AttendanceStrip progress={progress} update={update} />
        </Panel>
      </div>

      <Panel title="Earn Crystals">
        <p className={`${styles.note} ${tr.center}`}>
          Every summon brings an item, a troop, a Chaos raider, an artifact or even a hero you can find nowhere else. Duplicates of troops, heroes and artifacts turn into Stardust; every summon leaves some Stardust too.
        </p>
        <ul className={tr.earn}>
          <li><CrystalIcon /> <b>{OC_CRYSTALS.firstClear}</b> a first victory (<b>{OC_CRYSTALS.bossClear}</b> for a world boss)</li>
          <li><CrystalIcon /> <b>{OC_CRYSTALS.star}</b> each new star</li>
          <li><CrystalIcon /> <b>{OC_CRYSTALS.raidFirst}</b> a first Chaos Raid win</li>
          <li><CrystalIcon /> <b>{OC_CRYSTALS.endlessTen}</b> every new tenth wave in the Endless Siege</li>
          <li><CrystalIcon /> <b>{OC_CRYSTALS.daily}</b> the day&apos;s first Daily Siege</li>
          <li><CrystalIcon /> the daily rewards calendar</li>
        </ul>
      </Panel>
    </>
  );
}

function PityBar({ since, pity, label, name, rarity }: { since: number; pity: number; label: ReactNode; name: string; rarity: OcRarity }) {
  const done = Math.min(pity, since);
  return (
    <div className={tr.pityRow}>
      <span className={tr.pityLabel}>{label}</span>
      <div aria-label={`${name} pity`} aria-valuemax={pity} aria-valuemin={0} aria-valuenow={done} className={tr.pityTrack} role="progressbar">
        <div className={`${tr.pityFill} ${tr[`pf${rarity}`]}`} style={{ width: `${Math.min(1, since / pity) * 100}%` }} />
        <span className={tr.pityCount}>{done} / {pity}</span>
      </div>
    </div>
  );
}

function PullButton({ count, price, progress, onPull, busy }: { count: 1 | 10; price: { tickets: number; crystals: number }; progress: OcProgress; onPull(count: 1 | 10): void; busy: boolean }) {
  const short = price.crystals - progress.crystals;
  return (
    <button
      className={`${styles.primary} ${tr.pull} ${count === 10 ? tr.pullTen : ""}`}
      disabled={short > 0 || busy}
      onClick={() => onPull(count)}
      title={short > 0 ? `Needs ${short} more Crystals` : count === 10 ? "Ten summons; at least one is SR or better" : "One summon"}
      type="button"
    >
      {count === 10 ? <i className={tr.guarantee}>SR+ guaranteed</i> : null}
      <span className={tr.pullLabel}>Summon ×{count}</span>
      <small className={tr.pullCost}><Cost price={price} /></small>
      {short > 0 ? <small className={tr.pullShort}>short {short} Crystals</small> : null}
    </button>
  );
}

function Details({ progress }: { progress: OcProgress }) {
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [own, setOwn] = useState<OwnFilter>("all");
  const rows = sortByRarity(POOL_ROWS).filter((row) => (rarity === "all" || row.rarity === rarity) && (own === "all" || (own === "owned") === holds(progress, row.prize)));
  return (
    <>
      <Panel title="Rates">
        <div className={tr.rateGrid}>
          {RARITY_DESC.map((r) => {
            const n = POOL_ROWS.filter((row) => row.rarity === r).length;
            return (
              <div className={`${tr.rateCell} ${tr[`b${r}`]}`} key={r}>
                <RarityChip rarity={r} />
                <strong>{ratePct(r)}</strong>
                <small>{n} prize{n === 1 ? "" : "s"} · <DustIcon /> +{OC_STARDUST_PER_PULL[r]} a summon</small>
              </div>
            );
          })}
        </div>
        <ul className={tr.rules}>
          <li>Pity: if {OC_SSR_PITY - 1} summons in a row bring no SSR or UR, the {OC_SSR_PITY}th is certain to. If {OC_UR_PITY - 1} bring no UR, the {OC_UR_PITY}th is a UR. Your counters carry over between summons.</li>
          <li>A ten-summon ({OC_TEN_PULL_COST} Crystals, against ten singles of {OC_PULL_COST}) always holds at least one SR or better.</li>
          <li>Summoning Tickets are used first, one a summon; Crystals pay for the rest.</li>
          <li>Stardust each summon leaves: R {OC_STARDUST_PER_PULL.R} · SR {OC_STARDUST_PER_PULL.SR} · SSR {OC_STARDUST_PER_PULL.SSR} · UR {OC_STARDUST_PER_PULL.UR}; a duplicate troop, raider, artifact or hero adds <DustIcon /> {OC_STARDUST_DUPLICATE.SSR} (SSR) or <DustIcon /> {OC_STARDUST_DUPLICATE.UR} (UR). Items stack in the Satchel.</li>
        </ul>
      </Panel>
      <Panel title="Prize pool">
        <p className={styles.note}>Base chance a summon (pity and the ten-summon guarantee only raise them).</p>
        <Filters onOwn={setOwn} onRarity={setRarity} own={own} rarity={rarity} />
        <div className={tr.poolList}>
          {rows.map((row) => (
            <div className={`${tr.poolRow} ${tr[`b${row.rarity}`]}`} key={`${row.rarity}:${prizeKey(row.prize)}`}>
              <RarityCard badge={holds(progress, row.prize) ? <i className={tr.ownedBadge}>✓</i> : null} prize={row.prize} rarity={row.rarity} size={48} />
              <div className={tr.poolText}>
                <strong>{row.name}</strong> <small>{prizeKindLabel(row.prize)}{row.prize.kind === "item" ? (itemCount(progress, row.prize.id) ? ` · ${itemCount(progress, row.prize.id)} held` : "") : ownsPrize(progress, row.prize) ? " · owned" : ""}</small>
                <p>{prizeBlurb(row.prize)}</p>
              </div>
              <b className={tr.poolChance}>{percent(row.chance)}</b>
            </div>
          ))}
          {rows.length ? null : <p className={styles.note}>Nothing matches these filters.</p>}
        </div>
      </Panel>
    </>
  );
}

/** The Portal's history: the latest summons the save keeps, newest first, grouped a summon. */
function SummonHistory({ progress }: { progress: OcProgress }) {
  const log = progress.summonLog;
  const groups: OcSummonRecord[][] = [];
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i]!;
    const last = groups[groups.length - 1];
    if (last && last[0]!.at === entry.at) last.unshift(entry);
    else groups.push([entry]);
  }
  if (!groups.length) {
    return <Panel title="History"><p className={`${styles.note} ${tr.center}`}>No summons yet. Your latest {OC_SUMMON_LOG_KEPT} summons are kept here.</p></Panel>;
  }
  const tally = RARITY_DESC.map((r) => [r, log.filter((x) => x.rarity === r).length] as const);
  return (
    <Panel title="History">
      <div className={tr.summary}>
        <span>Latest {log.length} of {progress.pity.pulls} summoned (the last {OC_SUMMON_LOG_KEPT} are kept)</span>
        {tally.map(([r, n]) => <span key={r}><RarityChip rarity={r} /> {n}</span>)}
      </div>
      <div className={tr.history}>
        {groups.map((group) => (
          <section className={tr.historyGroup} key={`${group[0]!.at}:${group.length}`}>
            <small className={tr.historyWhen}>
              <time dateTime={new Date(group[0]!.at).toISOString()}>{new Date(group[0]!.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time> · ×{group.length}
            </small>
            <ol className={tr.historyList}>
              {[...group].sort((a, b) => RANK[b.rarity] - RANK[a.rarity]).map((entry, i) => (
                <li className={`${tr.historyRow} ${tr[`b${entry.rarity}`]}`} key={i} title={prizeBlurb(entry.prize)}>
                  <RarityChip rarity={entry.rarity} />
                  <span>{prizeName(entry.prize)}</span>
                  <small>
                    {entry.duplicate
                      ? <>owned → <DustIcon /> +{entry.dust}</>
                      : entry.prize.kind === "item" ? prizeKindLabel(entry.prize) : <b className={tr.newChip}>new unlock</b>}
                  </small>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Panel>
  );
}

function Exchange({ progress, update }: { progress: OcProgress; update: Update }) {
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [own, setOwn] = useState<OwnFilter>("all");
  const [bought, setBought] = useState<string | null>(null);
  const offers = sortByRarity([
    ...OC_GACHA_UNITS.map((u) => ({ prize: { kind: "unit", id: u.kind } as OcPrize, rarity: u.rarity as OcRarity })),
    { prize: { kind: "hero", id: OC_GACHA_HERO.id } as OcPrize, rarity: "UR" as OcRarity },
    ...OC_GACHA_CHAOS.map((u) => ({ prize: { kind: "chaos", id: u.kind } as OcPrize, rarity: u.rarity as OcRarity })),
    ...OC_GACHA_ARTIFACTS.map((a) => ({ prize: { kind: "artifact", id: a.id } as OcPrize, rarity: a.rarity as OcRarity })),
    ...OC_ITEM_ORDER.filter((id) => OC_ITEMS[id].rarity !== "SSR").map((id) => ({ prize: { kind: "item", id, count: 1 } as OcPrize, rarity: OC_ITEMS[id].rarity }))
  ].map((o) => ({ ...o, name: prizeName(o.prize) }))).filter((o) => (rarity === "all" || o.rarity === rarity) && (own === "all" || (own === "owned") === holds(progress, o.prize)));
  return (
    <Panel aside={<span className={tr.asideDust}><DustIcon /> {progress.stardust} Stardust</span>} title="Stardust Exchange">
      <p className={styles.note}>Trade Stardust for the prize you want. Troops, heroes, raiders and artifacts can be bought once; items any number of times.</p>
      {bought ? <p className={oc.reward} role="status">Bought: {bought}</p> : null}
      <Filters onOwn={setOwn} onRarity={setRarity} own={own} rarity={rarity} />
      <div className={tr.shelf}>
        {offers.map(({ prize, rarity: r, name }) => {
          const owned = prize.kind !== "item" && ownsPrize(progress, prize);
          const price = OC_EXCHANGE_PRICE[r];
          const short = price - progress.stardust;
          return (
            <div className={`${tr.offer} ${tr[`b${r}`]}`} key={prizeKey(prize)}>
              <RarityCard badge={owned ? <i className={tr.ownedBadge}>✓</i> : prize.kind === "item" && itemCount(progress, prize.id) ? <i className={tr.qtyBadge}>×{itemCount(progress, prize.id)}</i> : null} dim={owned} prize={prize} rarity={r} size={64} />
              <span className={tr.offerName}>{name}</span>
              <button
                className={short > 0 || owned ? styles.ghostButton : styles.primary}
                disabled={owned || short > 0}
                onClick={() => { update((p) => exchange(p, prize, r)); setBought(name); buySound(); }}
                title={owned ? "Already yours" : short > 0 ? `Needs ${short} more Stardust` : prizeBlurb(prize)}
                type="button"
              >
                {owned ? "Owned" : <><DustIcon /> {price}</>}
              </button>
            </div>
          );
        })}
        {offers.length ? null : <p className={styles.note}>Nothing matches these filters.</p>}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// The Satchel

type SatchelGroup = { id: string; title: string; hint: string; test(id: OcItemId): boolean };
const SATCHEL_GROUPS: SatchelGroup[] = [
  { id: "boost", title: "Battle boosts", hint: `pack up to ${OC_PACK_SLOTS} different ones on the battle screen, then use them during the battle — each only a few times a battle, one copy spent a use`, test: (id) => OC_ITEMS[id].effect.kind === "boost" },
  { id: "use", title: "Use now", hint: "resources and potions", test: (id) => OC_ITEMS[id].effect.kind === "use" || OC_ITEMS[id].effect.kind === "ripen" },
  { id: "special", title: "Tickets & tools", hint: "spent at the Portal and the Forge", test: (id) => OC_ITEMS[id].effect.kind === "ticket" || OC_ITEMS[id].effect.kind === "masterwork" }
];

export function SatchelScreen({ progress, update, onBack, onGarden }: { progress: OcProgress; update: Update; onBack(): void; onGarden(): void }) {
  const [note, setNote] = useState<string | null>(null);
  const [rarity, setRarity] = useState<RarityFilter>("all");
  const [own, setOwn] = useState<OwnFilter>("owned");
  const list = sortByRarity(OC_ITEM_ORDER.map((id) => ({ id, rarity: OC_ITEMS[id].rarity, name: OC_ITEMS[id].name })))
    .filter((it) => (rarity === "all" || it.rarity === rarity) && (own === "all" || (own === "owned") === (itemCount(progress, it.id) > 0)));
  const total = satchelCount(progress);
  const reduced = useReducedMotion();
  return (
    <div className={`${tr.screen} ${reduced ? tr.still : ""}`} style={frameVars()}>
      <Head onBack={onBack} progress={progress} title="Satchel" />
      <p className={oc.prepBrief}>
        Items you find in battle, at the Portal and in the daily calendar ({total} held). Battle boosts are packed on the battle screen (up to {OC_PACK_SLOTS} different ones) and used
        during the battle — each only a few times a battle, one copy spent a use; the rest you use from here.
      </p>
      {note ? <p className={oc.reward} role="status">{note}</p> : null}
      <div className={tr.filterBar}><Filters onOwn={setOwn} onRarity={setRarity} own={own} ownLabels={["In the Satchel", "Not yet found"]} rarity={rarity} /></div>
      {total === 0 && own === "owned" ? <p className={`${styles.note} ${tr.center}`}>The Satchel is empty. Win battles, claim the daily calendar or summon at the Portal.</p> : null}
      {SATCHEL_GROUPS.map((group) => {
        const items = list.filter((it) => group.test(it.id));
        if (!items.length) return null;
        return (
          <Panel key={group.id} title={group.title}>
            <p className={`${styles.note} ${tr.center}`}>{group.hint}</p>
            <div className={tr.satchel}>
              {items.map(({ id }) => {
                const item = OC_ITEMS[id];
                const count = itemCount(progress, id);
                const prize: OcPrize = { kind: "item", id, count: 1 };
                const uses = itemPerMatch(id);
                return (
                  <div className={`${tr.slot} ${tr[`b${item.rarity}`]} ${count ? "" : tr.slotEmpty}`} key={id}>
                    <RarityCard badge={<i className={tr.qtyBadge}>×{count}</i>} dim={!count} prize={prize} rarity={item.rarity} size={64} />
                    <div className={tr.slotText}>
                      <strong>{item.name}</strong>
                      <small>{item.blurb}</small>
                      {!count ? (
                        <span className={tr.hint}>Not in your Satchel</span>
                      ) : item.effect.kind === "use" ? (
                        <button className={styles.primary} onClick={() => { update((p) => useItem(p, id)); setNote(`Used: ${item.name}.`); buySound(); }} type="button">Use</button>
                      ) : item.effect.kind === "ripen" ? (
                        <button className={styles.ghostButton} onClick={onGarden} type="button">Use in the Garden ▸</button>
                      ) : item.effect.kind === "boost" ? (
                        <span className={tr.hint}>{progress.packed.includes(id) ? "Packed for the next battle" : "Pack it before a battle"} · up to {uses} use{uses === 1 ? "" : "s"} a battle</span>
                      ) : item.effect.kind === "ticket" ? (
                        <span className={tr.hint}>Used first at the Portal</span>
                      ) : (
                        <span className={tr.hint}>Spent at the Forge</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
      {list.length === 0 && !(total === 0 && own === "owned") ? <p className={`${styles.note} ${tr.center}`}>Nothing matches these filters.</p> : null}
    </div>
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

function AttendanceDays({ progress, justClaimed, compact = false }: { progress: OcProgress; justClaimed: boolean; compact?: boolean }) {
  const day = useMemo(() => ocDayKey(), []);
  const today = attendanceToday(progress.attendance, day);
  // After a claim the save has moved on a square; show the square just taken as the current one.
  const shownIndex = justClaimed ? (progress.attendance.claimed - 1 + OC_ATTENDANCE.length) % OC_ATTENDANCE.length : today.index;
  const doneBefore = justClaimed ? shownIndex : progress.attendance.claimed % OC_ATTENDANCE.length;
  return (
    <div className={`${tr.days} ${compact ? tr.daysCompact : ""}`}>
      {OC_ATTENDANCE.map((reward, i) => {
        const done = i < doneBefore || (justClaimed && i === shownIndex);
        const ready = i === shownIndex && today.open && !justClaimed;
        return (
          <div className={`${tr.day} ${done ? tr.dayDone : ""} ${ready ? tr.dayNow : ""} ${i === OC_ATTENDANCE.length - 1 ? tr.dayBig : ""}`} key={i}>
            <small>Day {i + 1}</small>
            <div className={tr.dayRewards}>
              {reward.crystals ? <span className={tr.dayItem} title={`${reward.crystals} Crystals`}><CrystalIcon />{reward.crystals}</span> : null}
              {(reward.items ?? []).map((it) => (
                <span className={tr.dayItem} key={it.id} title={`${OC_ITEMS[it.id].name}: ${OC_ITEMS[it.id].blurb}`}>
                  <Pic className={tr.dayIcon} fallback={<span className={tr.glyph}>✦</span>} src={OC_ITEMS[it.id].icon} />×{it.count}
                </span>
              ))}
            </div>
            {done ? <i className={tr.stamp}>✓</i> : null}
          </div>
        );
      })}
    </div>
  );
}

function useClaim(progress: OcProgress, update: Update) {
  const day = useMemo(() => ocDayKey(), []);
  const today = attendanceToday(progress.attendance, day);
  const [claimed, setClaimed] = useState(false);
  const claim = () => { update((p) => claimAttendance(p, day)); setClaimed(true); claimSound(); };
  return { today, claimed, claim };
}

/** The calendar inline (on the Portal screen). */
function AttendanceStrip({ progress, update }: { progress: OcProgress; update: Update }) {
  const { today, claimed, claim } = useClaim(progress, update);
  return (
    <div className={tr.strip}>
      <AttendanceDays compact justClaimed={claimed} progress={progress} />
      <div className={tr.pullRow}>
        {today.open && !claimed ? (
          <button className={`${styles.primary} ${tr.claim}`} onClick={claim} type="button">Claim day {today.index + 1} ★</button>
        ) : <span className={styles.note}>{claimed ? "Claimed! Come back tomorrow." : "Today's reward is claimed. A new square opens at midnight UTC."}</span>}
      </div>
    </div>
  );
}

export function AttendanceDialog({ progress, update, onClose }: { progress: OcProgress; update: Update; onClose(): void }) {
  const { today, claimed, claim } = useClaim(progress, update);
  const reduced = useReducedMotion();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={`${tr.overlay} ${reduced ? tr.still : ""}`}>
      <section aria-label="Daily attendance" aria-modal="true" className={`${styles.dialog} ${tr.calendar}`} role="dialog">
        <h2>Daily Rewards</h2>
        <p className={styles.note}>One square a day (the day turns at midnight UTC). Miss a day and the calendar simply waits for you.</p>
        <AttendanceDays justClaimed={claimed} progress={progress} />
        <div className={tr.pullRow}>
          {today.open && !claimed ? (
            <button className={`${styles.primary} ${tr.claim}`} onClick={claim} type="button">Claim day {today.index + 1} ★</button>
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
