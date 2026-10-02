"use client";

/**
 * Order & Chaos tally boards in the menus: the Daily Siege orders screen, the
 * Tally Board (online boards per mode, today and all-time) and the score panel
 * on a finished run. The score rules live in the engine
 * (engine/garrison/order-chaos/scores.ts); this file only shows them, keeps
 * the player's local bests and talks to the board (lib/oc-leaderboard.ts).
 * Nothing is posted by hand: every new best (and the campaign tally) goes up
 * by itself (useOcScoreSync), and an open board refreshes itself. A board that
 * can't be reached never blocks play: local bests stay and go up once it's back.
 * The boards belong to Heroes 3 accounts (the row shows the account nickname):
 * a guest's bests stay on the device and go up once they sign in.
 */

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BLESSINGS, CARDS, DEFENDERS, ENEMIES, SPELLS, TERRAINS } from "@/engine/garrison/content";
import { OC_HEROES, OC_LEVELS, OC_RAIDS, totalStars } from "@/engine/garrison/order-chaos/campaign";
import { OC_DAILY_TWISTS, ocDaily, type OcDaily } from "@/engine/garrison/order-chaos/daily";
import {
  OC_BOARD_SIZE, OC_SCORE_RULES, ocCampaignSummary, ocDayKey, ocPrevDay, ocRunTime, ocScore, ocScoreText,
  type OcBoardMode, type OcBoardView, type OcRunSummary
} from "@/engine/garrison/order-chaos/scores";
import { OC_SCORE_LINES, OC_SCREEN_LINES, unlockedLines, type OcGatedLine, type OcLine } from "@/engine/garrison/order-chaos/story";
import { assetUrl } from "@/lib/asset-url";
import { authEnabled } from "@/lib/auth-mode";
import { fetchOcBoard, ocBoardsConfigured, postOcRun, subscribeOcPosts, useOcAccount, type OcAccount, type OcBoardRow, type OcPostResult } from "@/lib/oc-leaderboard";
import { pruneDailyBests, type OcLocalBest, type OcProgress } from "@/lib/order-chaos-progress";
import styles from "../garrison.module.css";
import { AttackerArt, CARD_SCENES, CardArt, cardScene, cardSceneSrc } from "../thumbs";
import oc from "./oc.module.css";
import sc from "./oc-scores.module.css";
import { AdvisorBubble } from "./story-ui";

const UI = {
  banner: "/assets/order-chaos/ui/banner.webp",
  packet: "/assets/order-chaos/ui/packet-frame.webp",
  tray: "/assets/order-chaos/ui/tray.webp"
} as const;

const MODE_LABEL: Record<OcBoardMode, string> = { endless: "Endless Siege", daily: "Daily Siege", raid: "Chaos Raids", campaign: "Campaign" };
/** An open Tally Board fetches itself afresh this often (the board's own cache is 15 s). */
const BOARD_REFRESH_MS = 20_000;

// ---------------------------------------------------------------------------
// Local bests

/** The local-best key of a run: "endless", "daily:<day>" or "raid:<id>". */
export function ocBestKey(run: Pick<OcRunSummary, "mode" | "day" | "raid">): string {
  return run.mode === "daily" ? `daily:${run.day ?? ""}` : run.mode === "raid" ? `raid:${run.raid ?? ""}` : "endless";
}

/** Does this run beat the best kept for its board on this device? */
export function isOcNewBest(p: OcProgress, run: OcRunSummary): boolean {
  const score = ocScore(run);
  const prev = p.bests[ocBestKey(run)];
  return score > 0 && (!prev || score > prev.score);
}

/** Keep the run as the board's personal best if it beats the one kept. */
export function recordOcBest(p: OcProgress, run: OcRunSummary): OcProgress {
  if (!isOcNewBest(p, run)) return p;
  const best: OcLocalBest = {
    score: ocScore(run), wave: run.wave, kills: run.kills, ticks: run.ticks, day: run.day ?? ocDayKey(), at: Date.now(), sent: false,
    ...(run.hero ? { hero: run.hero } : {}),
    ...(run.setup ? { setup: run.setup } : {})
  };
  return { ...p, bests: pruneDailyBests({ ...p.bests, [ocBestKey(run)]: best }) };
}

/** The online board now holds at least `score` for `key`: the local best needs no posting. */
export function markOcBestSent(p: OcProgress, key: string, score: number): OcProgress {
  const best = p.bests[key];
  if (!best || best.sent || best.score > score) return p;
  return { ...p, bests: { ...p.bests, [key]: { ...best, sent: true } } };
}

/** The highest score the post result shows the board holding for this player. */
function heldScore(result: OcPostResult): number {
  return result.ok ? Math.max(result.score, result.today.best?.score ?? 0, result.all.best?.score ?? 0) : 0;
}

/** A local best as a run summary (to post it later). Null when its board no longer takes it. */
function runFromBest(key: string, best: OcLocalBest): OcRunSummary | null {
  const base = { won: false, wave: best.wave, kills: best.kills, ticks: best.ticks, lost: 0, placed: 0, ...(best.hero ? { hero: best.hero } : {}) };
  if (key === "endless") return { mode: "endless", ...base };
  if (key.startsWith("raid:")) return { mode: "raid", raid: key.slice(5), ...base, won: true, wave: 0 };
  if (key.startsWith("daily:") && best.setup) {
    const day = key.slice(6);
    const today = ocDayKey();
    if (day !== today && day !== ocPrevDay(today)) return null;
    return { mode: "daily", day, setup: best.setup, ...base };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Posting by itself

/** Local bests a finished run's panel is posting right now (the sync leaves them alone). */
const claimed = new Set<string>();
/** Posts settled this visit (accepted, or refused for good): never sent again. */
const settled = new Set<string>();
let syncing = false;
/** How long the sync waits before trying an unreachable board again. */
const SYNC_RETRY_MS = 60_000;

/** The account this device's bests were last posted under (another account gets them all again). */
const BOARD_ACCOUNT_KEY = "order-chaos:board-account:v1";
let markedFor: string | null = null;

function postedForAccount(accountId: string): boolean {
  if (markedFor === accountId) return true;
  try {
    if (window.localStorage.getItem(BOARD_ACCOUNT_KEY) === accountId) {
      markedFor = accountId;
      return true;
    }
  } catch {
    // Storage blocked: the in-memory mark stands for this visit.
  }
  return false;
}

function markPostedFor(accountId: string): void {
  markedFor = accountId;
  try {
    window.localStorage.setItem(BOARD_ACCOUNT_KEY, accountId);
  } catch {
    // Best-effort (re-posting a best the account already holds changes nothing).
  }
}

/**
 * Every best on this device counts as not on the board yet: bests marked sent
 * went to the old anonymous board or under another account, so the account
 * signed in now gets them all.
 */
export function unsendOcBests(p: OcProgress): OcProgress {
  const bests: Record<string, OcLocalBest> = {};
  for (const [key, best] of Object.entries(p.bests)) bests[key] = best ? { ...best, sent: false } : best;
  return { ...p, bests, campaignPosted: 0 };
}

type SyncJob = { id: string; run: OcRunSummary; mark(p: OcProgress, held: number): OcProgress };

/** The next thing this device holds that the boards don't: an unposted best, else a campaign tally that grew. */
function nextSyncJob(p: OcProgress, skipClaimed: boolean): SyncJob | null {
  for (const [key, best] of Object.entries(p.bests)) {
    if (!best || best.sent || (skipClaimed && claimed.has(key))) continue;
    const run = runFromBest(key, best);
    const id = `${key}:${best.score}`;
    if (!run || settled.has(id)) continue;
    return { id, run, mark: (q, held) => markOcBestSent(q, key, held) };
  }
  const levels = OC_LEVELS.filter((level) => p.cleared.includes(level.id)).length;
  if (levels > 0 && !p.testAll) {
    const run = ocCampaignSummary(levels, totalStars(p.cleared, p.stars), p.hero);
    const score = ocScore(run);
    const id = `campaign:${score}`;
    if (score > p.campaignPosted && !settled.has(id)) {
      return { id, run, mark: (q, held) => ({ ...q, campaignPosted: Math.max(q.campaignPosted, held) }) };
    }
  }
  return null;
}

/**
 * Keeps the tally boards up to date by themselves while Order & Chaos is open
 * and a Heroes 3 account is signed in: one post at a time, each unposted best
 * and a grown campaign tally, marked as sent once the board holds it. A guest
 * posts nothing (the bests wait on the device); the first time an account is
 * seen here, every best on the device goes up under it. An unreachable board
 * is tried again a minute later; a refused post is not retried this visit.
 */
export function useOcScoreSync(progress: OcProgress, update: (change: (p: OcProgress) => OcProgress) => void): void {
  const account = useOcAccount();
  const [retry, setRetry] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (syncing || !account || !ocBoardsConfigured()) return;
    if (!postedForAccount(account.id)) {
      markPostedFor(account.id);
      settled.clear();
      update(unsendOcBests);
      return;
    }
    const job = nextSyncJob(progress, true);
    if (!job) {
      // A run's own panel may still be posting (or have failed): look again later.
      if (nextSyncJob(progress, false)) {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setRetry((n) => n + 1), SYNC_RETRY_MS);
      }
      return;
    }
    syncing = true;
    void postOcRun(job.run).then((result) => {
      syncing = false;
      // Signed out meanwhile: the account turns null, and the next sign-in picks this up.
      if (!result.ok && result.signedOut) return;
      if (result.ok || (!result.offline && !result.busy)) {
        settled.add(job.id);
        if (result.ok) update((p) => job.mark(p, heldScore(result)));
        setRetry((n) => n + 1);
        return;
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setRetry((n) => n + 1), result.busy ? 6_000 : SYNC_RETRY_MS);
    });
  }, [account, progress, retry, update]);
}

// ---------------------------------------------------------------------------
// Small pieces

function pickLine(pool: readonly OcGatedLine[] | undefined, cleared: readonly string[]): OcLine | null {
  const lines = unlockedLines(pool, cleared);
  return lines.length ? lines[Math.floor(Math.random() * lines.length)] ?? null : null;
}

function Greeting({ place, cleared }: { place: keyof typeof OC_SCREEN_LINES; cleared: readonly string[] }) {
  const [line] = useState(() => pickLine(OC_SCREEN_LINES[place], cleared));
  return line ? <div className={oc.greeting}><AdvisorBubble compact line={line} /></div> : null;
}

/** What a guest is told: the boards are for Heroes 3 accounts, and their bests wait on the device. */
function SignInNote() {
  if (!authEnabled()) {
    return <small className={sc.warn}>The tally board is for Heroes 3 accounts, and this game server has none switched on. Your bests are kept on this device.</small>;
  }
  return (
    <small className={sc.warn}>
      Sign in to your Heroes 3 account to go on the tally board (your bests are kept and go up when you sign in).{" "}
      <Link className={oc.testLink} href="/login">Sign in</Link>
    </small>
  );
}

/** Whose name the boards show for this player: the signed-in account's nickname. */
function BoardIdentity({ account }: { account: OcAccount | null | undefined }) {
  return (
    <div className={sc.nameRow}>
      {account === undefined ? <span>Checking your account…</span> : account ? <span>On the board as <b>{account.nickname}</b></span> : <SignInNote />}
    </div>
  );
}

function rankText(rank: number | null): string {
  return rank ? `#${rank}` : `outside the top ${OC_BOARD_SIZE}`;
}

// ---------------------------------------------------------------------------
// The score panel on a finished run

/**
 * A finished Endless / Daily Siege run, or a won raid: its score, the rule
 * behind it, and its place on the online boards. Posts by itself (when the run
 * may go on a board); an unreachable board gets it later from the sync.
 */
export function OcRunScore({ run, blocked, newBest, cleared, onSent }: {
  run: OcRunSummary;
  /** Why this run can't be posted (null = it can). */
  blocked: string | null;
  newBest: boolean;
  cleared: readonly string[];
  onSent(heldScore: number): void;
}) {
  const account = useOcAccount();
  const [status, setStatus] = useState<{ t: "idle" } | { t: "done"; result: OcPostResult }>({ t: "idle" });
  const [reaction, setReaction] = useState<OcLine | null>(null);
  const busy = useRef(false);
  const score = ocScore(run);
  // While this panel posts its run, the background sync leaves that best alone (no double post).
  const bestKey = ocBestKey(run);
  useState(() => {
    if (!blocked) claimed.add(bestKey);
    return null;
  });
  useEffect(() => () => {
    claimed.delete(bestKey);
  }, [bestKey]);
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  }, [onSent]);

  // Post once, by itself, under the signed-in account (until it settles the panel reads "Posting…").
  // A guest's run is not posted: its best waits on the device and goes up when they sign in.
  useEffect(() => {
    if (busy.current) return;
    if (blocked || !ocBoardsConfigured()) {
      busy.current = true;
      claimed.delete(bestKey);
      return;
    }
    if (account === undefined) return;
    if (account === null) {
      claimed.delete(bestKey);
      return;
    }
    busy.current = true;
    claimed.add(bestKey);
    void postOcRun(run).then((result) => {
      claimed.delete(bestKey);
      setStatus({ t: "done", result });
      if (!result.ok) return;
      onSentRef.current(heldScore(result));
      const improved = result.today.improved || result.all.improved;
      const first = (result.today.improved && result.today.rank === 1) || (result.all.improved && result.all.rank === 1);
      const top10 = (result.today.improved && (result.today.rank ?? 99) <= 10) || (result.all.improved && (result.all.rank ?? 99) <= 10);
      if (improved) setReaction(pickLine(first ? OC_SCORE_LINES.first : top10 ? OC_SCORE_LINES.top10 : undefined, cleared));
    });
  }, [account, blocked, run, cleared, bestKey]);

  const raid = run.mode === "raid";
  return (
    <div className={sc.scoreBox}>
      <span className={sc.muted}>{raid ? "Time" : "Score"}</span>
      <strong className={sc.scoreBig}>{raid ? ocRunTime(run.ticks) : score.toLocaleString("en-US")}</strong>
      <span>{ocScoreText(run.mode, run)}{newBest ? " · new personal best" : ""}</span>
      <small className={sc.muted}>{OC_SCORE_RULES[run.mode]}</small>
      {reaction ? <AdvisorBubble compact line={reaction} /> : null}
      {blocked ? <small className={sc.warn}>{blocked}</small> : status.t === "done" && status.result.ok ? (
        <small>Tally board: today {rankText(status.result.today.rank)} · all-time {rankText(status.result.all.rank)}{status.result.today.improved || status.result.all.improved ? "" : " (your earlier run still stands)"}</small>
      ) : (status.t === "done" && !status.result.ok && status.result.signedOut) || account === null ? (
        <SignInNote />
      ) : status.t === "done" && !status.result.ok ? (
        <small className={sc.warn}>{status.result.offline || status.result.busy ? "Board offline: the tally board can't be reached. Your best is kept on this device and goes up by itself once the board is back." : `Not posted: ${status.result.error}`}</small>
      ) : (
        <small>{account ? "Posting to the tally board…" : "Checking your account…"}</small>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Daily Siege orders

export function OcDailyScreen({ progress, cleared, onBack, onStart, onBoard, onTalk }: {
  progress: OcProgress;
  cleared: readonly string[];
  onBack(): void;
  onStart(daily: OcDaily): void;
  onBoard(): void;
  onTalk(): void;
}) {
  const daily = useMemo(() => ocDaily(), []);
  const best = progress.bests[`daily:${daily.day}`];
  const hero = OC_HEROES[daily.hero];
  const level = daily.level;
  const art = (src: string) => `url("${assetUrl(src)}")`;
  const sceneVars = Object.fromEntries(CARD_SCENES.map((scene) => [`--oc-scene-${scene}`, art(cardSceneSrc(scene))]));
  const spells = [hero.spell, ...daily.spells];
  return (
    <div className={oc.prep} style={{ ["--oc-packet" as string]: art(UI.packet), ["--oc-tray" as string]: art(UI.tray), ...sceneVars }}>
      <div className={oc.campHead}>
        <button className={oc.backButton} onClick={onBack} type="button">‹ Back</button>
        <h1 className={oc.titleBanner} style={{ ["--oc-banner" as string]: art(UI.banner) }}><span>Daily Siege</span></h1>
        <div className={oc.tally}>
          <span title="Orders change at midnight (UTC)">{daily.day}</span>
        </div>
      </div>
      <p className={oc.prepBrief}>{level.brief}</p>
      <div className={oc.advice}>
        <Greeting cleared={cleared} place="daily" />
        <button className={oc.storyButton} onClick={onTalk} type="button">
          <img alt="" className={oc.storyFace} src={assetUrl("/assets/order-chaos/story/crag-talk.webp")} />
          Hear Crag out
        </button>
      </div>
      <div className={oc.prepGrid}>
        <div className={oc.prepMain}>
          <section className={oc.troops}>
            <h2>The loaned company <small>(everyone gets the same · all Lv 1)</small></h2>
            <div aria-label="Today's troops" className={oc.bank}>
              {daily.cards.map((kind) => (
                <span className={oc.pk} data-scene={cardScene(kind)} key={kind} title={`${DEFENDERS[kind]?.name ?? kind}: ${DEFENDERS[kind]?.blurb ?? ""}`}>
                  <span className={oc.pkArt}><CardArt card={kind} size={52} /></span>
                  <b className={oc.pkCost}>{CARDS[kind]?.cost ?? ""}</b>
                  {daily.ultimates.includes(kind) ? <i className={oc.pkUlt}>♛</i> : null}
                </span>
              ))}
            </div>
            <p className={styles.note}>{daily.cards.map((kind) => DEFENDERS[kind]?.name ?? kind).join(" · ")}</p>
            {daily.ultimates.length ? (
              <p className={styles.note}>♛ These troops can Ascend today: slain foes fill the Valor crown, then press U and pick one.</p>
            ) : null}
          </section>
          <section className={`${styles.panel} ${sc.gap}`}>
            <h2>Today&apos;s twist: {OC_DAILY_TWISTS[daily.twist].name}</h2>
            <p>{daily.twistText}</p>
            <p className={styles.note}>
              Orders from world {daily.world}, {daily.worldName}: {TERRAINS[level.terrain]?.name ?? level.terrain}, {level.lanes.length} lanes, {level.startGold} gold to start.
            </p>
          </section>
          <section className={`${styles.panel} ${sc.gap}`}>
            <h2>The horde</h2>
            <div className={styles.foes}>
              {level.enemies.map((kind) => (
                <div className={`${styles.foe} ${kind === level.featured || kind === level.herald ? styles.foeNew : ""}`} key={kind} title={ENEMIES[kind]?.blurb}>
                  <AttackerArt kind={kind} size={56} />
                  {ENEMIES[kind]?.name ?? kind}
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className={oc.prepSide}>
          <section className={styles.panel}>
            <h2>Hero</h2>
            <div className={oc.hero}>
              <img alt="" className={oc.portrait} src={assetUrl(hero.portrait)} />
              <span><strong>{hero.name}</strong><small>{hero.title}</small></span>
            </div>
            <p className={styles.note}>{hero.blurb}</p>
            <h2>Spellbook</h2>
            <div className={oc.artifacts}>
              {spells.map((id) => (
                <span className={oc.artifact} key={id} title={`${SPELLS[id].blurb} (${SPELLS[id].mana} mana)`}>
                  <img alt="" src={assetUrl(SPELLS[id].icon)} />
                  <span>{SPELLS[id].name}</span>
                </span>
              ))}
            </div>
            {daily.artifacts.length ? (
              <>
                <h2>Artifacts</h2>
                <div className={oc.artifacts}>
                  {daily.artifacts.map((id) => (
                    <span className={oc.artifact} key={id} title={BLESSINGS[id].blurb}>
                      <img alt="" src={assetUrl(BLESSINGS[id].icon)} />
                      <span>{BLESSINGS[id].name}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </section>
          <section className={`${styles.panel} ${sc.gap}`}>
            <h2>Today&apos;s tally</h2>
            <p className={styles.note}>{OC_SCORE_RULES.daily}</p>
            <p>{best ? <>Your best today: <b>{ocScoreText("daily", best)}</b> ({best.score.toLocaleString("en-US")}){best.sent ? "" : " · not on the board yet"}</> : "No run yet today."}</p>
            <button className={styles.ghostButton} onClick={onBoard} type="button">See today&apos;s tally board</button>
          </section>
        </aside>
      </div>
      <div className={oc.fightBar}>
        <button className={oc.fightButton} onClick={() => onStart(daily)} type="button">Let&apos;s fight! ▸</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Tally Board

export function OcTallyBoard({ progress, cleared, onBack, initialMode = "endless" }: {
  progress: OcProgress;
  cleared: readonly string[];
  /** (Unused since posting became automatic; kept so callers need not change.) */
  update?(change: (p: OcProgress) => OcProgress): void;
  onBack(): void;
  initialMode?: OcBoardMode;
}) {
  const [mode, setMode] = useState<OcBoardMode>(initialMode);
  const [view, setView] = useState<OcBoardView>("today");
  const [raid, setRaid] = useState<string>(OC_RAIDS[0]?.id ?? "r1");
  const daily = useMemo(() => ocDaily(), []);
  const account = useOcAccount();
  const me = account?.pid ?? "";
  const [rows, setRows] = useState<OcBoardRow[] | null>(null);
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  // The board refreshes itself: every little while it's on screen, and right after any post from here.
  useEffect(() => {
    const every = window.setInterval(() => {
      if (!document.hidden) setReload((n) => n + 1);
    }, BOARD_REFRESH_MS);
    const unsubscribe = subscribeOcPosts(() => setReload((n) => n + 1));
    return () => {
      window.clearInterval(every);
      unsubscribe();
    };
  }, []);

  const shownRef = useRef("");
  useEffect(() => {
    let live = true;
    // A different board starts blank; a refresh of the same one keeps its rows until the new ones come.
    const shown = `${mode}|${view}|${raid}`;
    const refresh = shownRef.current === shown;
    shownRef.current = shown;
    if (!refresh) {
      setRows(null);
      setError(null);
    }
    void fetchOcBoard({
      mode, view,
      ...(mode === "raid" ? { raid } : {}),
      ...(mode === "daily" ? { day: daily.day, setup: daily.setup } : {})
    }, refresh).then((result) => {
      if (!live) return;
      if (result.ok) {
        setRows(result.rows);
        setError(null);
      } else if (!refresh) setError({ text: result.error, offline: result.offline });
    });
    return () => { live = false; };
  }, [mode, view, raid, daily, reload]);

  // This device's best for the board on show.
  const bestKey = mode === "campaign" ? "campaign" : mode === "raid" ? `raid:${raid}` : mode === "daily"
    ? (view === "today" ? `daily:${daily.day}` : Object.keys(progress.bests).filter((key) => key.startsWith("daily:")).sort((a, b) => (progress.bests[b]!.score - progress.bests[a]!.score))[0] ?? `daily:${daily.day}`)
    : "endless";
  const best = progress.bests[bestKey];
  // The campaign board: this device's own progress (never with the testing unlock on), posted by itself.
  const campaignLevels = OC_LEVELS.filter((level) => progress.cleared.includes(level.id)).length;
  const campaignRun = mode === "campaign" && campaignLevels > 0 && !progress.testAll
    ? ocCampaignSummary(campaignLevels, totalStars(progress.cleared, progress.stars), progress.hero)
    : null;
  const campaignPosted = campaignRun !== null && progress.campaignPosted >= ocScore(campaignRun);
  const pending = account ? " · going up to the board…" : " · kept on this device until you sign in";

  const raidName = OC_RAIDS.find((entry) => entry.id === raid)?.name ?? raid;
  return (
    <>
      <div className={oc.campHead}>
        <button className={oc.backButton} onClick={onBack} type="button">‹ Back</button>
        <h1 className={oc.titleBanner} style={{ ["--oc-banner" as string]: `url("${assetUrl(UI.banner)}")` }}><span>Tally Board</span></h1>
        <span />
      </div>
      <Greeting cleared={cleared} place="tally" />
      <div aria-label="Board" className={styles.factions} role="tablist">
        {(["endless", "daily", "raid", "campaign"] as const).map((id) => (
          <button aria-selected={mode === id} className={`${styles.faction} ${mode === id ? styles.factionOn : ""}`} key={id} onClick={() => setMode(id)} role="tab" type="button">
            {MODE_LABEL[id]}
          </button>
        ))}
        <span className={sc.spacer} />
        {(["today", "all"] as const).map((id) => (
          <button aria-pressed={view === id} className={`${styles.faction} ${view === id ? styles.factionOn : ""}`} key={id} onClick={() => setView(id)} type="button">
            {id === "today" ? "Today" : "All-time"}
          </button>
        ))}
      </div>
      {mode === "raid" ? (
        <div aria-label="Raid" className={styles.factions}>
          {OC_RAIDS.map((entry) => (
            <button aria-pressed={raid === entry.id} className={`${styles.faction} ${raid === entry.id ? styles.factionOn : ""}`} key={entry.id} onClick={() => setRaid(entry.id)} type="button">
              {entry.name}
            </button>
          ))}
        </div>
      ) : null}
      <section className={styles.panel}>
        <h2>
          {mode === "raid" ? `Chaos Raid: ${raidName}` : MODE_LABEL[mode]} · {view === "today" ? (mode === "daily" ? `today's orders (${daily.day})` : `today (${ocDayKey()}, UTC)`) : "all-time"}
        </h2>
        <p className={styles.note}>{OC_SCORE_RULES[mode]}{mode === "endless" ? " Endless runs use your own troops, training and artifacts; runs with the testing unlock on are never posted." : ""}</p>
        <div className={sc.mine}>
          {mode === "campaign" ? (
            campaignRun ? <span>Your campaign: <b>{ocScoreText("campaign", campaignRun)}</b>{campaignPosted ? "" : pending}</span>
              : <span>{progress.testAll ? "The testing unlock is on: campaign progress stays off the board." : "Clear a campaign level to join this board."}</span>
          ) : best ? (
            <span>Your best{mode === "daily" && view === "all" ? ` (${best.day})` : ""}: <b>{ocScoreText(mode, best)}</b>{best.sent ? "" : pending}</span>
          ) : <span>No run of yours on this board yet.</span>}
        </div>
        <BoardIdentity account={account} />
        {rows ? (
          rows.length ? (
            <div className={sc.tableWrap}>
              <table className={sc.board}>
                <thead>
                  <tr><th>#</th><th>Keeper</th><th>{mode === "raid" ? "Time" : mode === "campaign" ? "Levels · stars" : "Wave · foes slain"}</th><th>Hero</th><th>{mode === "daily" && view === "all" ? "Orders of" : "Day"}</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className={me && row.pid === me ? sc.me : ""} key={`${row.pid}-${row.rank}`}>
                      <td className={sc.rank}>{row.rank}</td>
                      <td>{row.name}{me && row.pid === me ? " (you)" : ""}</td>
                      <td className={sc.score}>{mode === "raid" ? ocRunTime(row.ticks) : mode === "campaign" ? `${row.wave} · ★ ${row.kills}` : `Wave ${row.wave} · ${row.kills}`}</td>
                      <td>{row.hero ? OC_HEROES[row.hero as keyof typeof OC_HEROES]?.name ?? "" : ""}</td>
                      <td className={sc.muted}>{row.day}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className={styles.note}>Nobody on this board yet. The first chalk mark could be yours.</p>
        ) : error ? (
          <p className={sc.warn}>{error.offline ? "Board offline: " : ""}{error.text}{best ? " Your own best (above) is kept on this device." : ""}</p>
        ) : <p className={styles.note}>Reading the tally board…</p>}
        {rows && me && !rows.some((row) => row.pid === me) && best?.sent ? <p className={styles.note}>Your best isn&apos;t in this board&apos;s top {OC_BOARD_SIZE}.</p> : null}
      </section>
    </>
  );
}
