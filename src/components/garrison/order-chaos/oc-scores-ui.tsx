"use client";

/**
 * Order & Chaos tally boards in the menus: the Daily Siege orders screen, the
 * Tally Board (online boards per mode, today and all-time) and the score panel
 * on a finished run. The score rules live in the engine
 * (engine/garrison/order-chaos/scores.ts); this file only shows them, keeps
 * the player's local bests and talks to the board (lib/oc-leaderboard.ts).
 * A board that can't be reached never blocks play: local bests stay, and an
 * unposted best can be posted later from the Tally Board.
 */

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLESSINGS, CARDS, DEFENDERS, ENEMIES, SPELLS, TERRAINS } from "@/engine/garrison/content";
import { OC_HEROES, OC_LEVELS, OC_RAIDS, totalStars } from "@/engine/garrison/order-chaos/campaign";
import { OC_DAILY_TWISTS, ocDaily, type OcDaily } from "@/engine/garrison/order-chaos/daily";
import {
  OC_BOARD_SIZE, OC_NAME_MAX, OC_SCORE_RULES, cleanOcName, ocCampaignSummary, ocDayKey, ocPrevDay, ocRunTime, ocScore, ocScoreText,
  type OcBoardMode, type OcBoardView, type OcRunSummary
} from "@/engine/garrison/order-chaos/scores";
import { OC_SCORE_LINES, OC_SCREEN_LINES, unlockedLines, type OcGatedLine, type OcLine } from "@/engine/garrison/order-chaos/story";
import { assetUrl } from "@/lib/asset-url";
import { getDisplayName, setDisplayName } from "@/lib/identity";
import { fetchOcBoard, getOcPublicId, ocBoardsConfigured, postOcRun, type OcBoardRow, type OcPostResult } from "@/lib/oc-leaderboard";
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
// Small pieces

function pickLine(pool: readonly OcGatedLine[] | undefined, cleared: readonly string[]): OcLine | null {
  const lines = unlockedLines(pool, cleared);
  return lines.length ? lines[Math.floor(Math.random() * lines.length)] ?? null : null;
}

function Greeting({ place, cleared }: { place: keyof typeof OC_SCREEN_LINES; cleared: readonly string[] }) {
  const [line] = useState(() => pickLine(OC_SCREEN_LINES[place], cleared));
  return line ? <div className={oc.greeting}><AdvisorBubble compact line={line} /></div> : null;
}

/** The player's name on the boards: the app's display name (shared with multiplayer), edited in place. */
function useBoardName(): [string, (name: string) => void] {
  const [name, setName] = useState(() => cleanOcName(getDisplayName()) ?? "");
  const save = useCallback((next: string) => {
    const clean = cleanOcName(next) ?? "";
    if (clean) setDisplayName(clean);
    setName(clean);
  }, []);
  return [name, save];
}

function NameField({ name, onSave, startOpen = false }: { name: string; onSave(name: string): void; startOpen?: boolean }) {
  const [editing, setEditing] = useState(startOpen || !name);
  const [draft, setDraft] = useState(name);
  if (!editing) {
    return (
      <div className={sc.nameRow}>
        <span>Your name on the board: <b>{name}</b></span>
        <button className={oc.testLink} onClick={() => { setDraft(name); setEditing(true); }} type="button">Change</button>
      </div>
    );
  }
  const clean = cleanOcName(draft);
  return (
    <form className={oc.testForm} onSubmit={(event) => { event.preventDefault(); if (clean) { onSave(clean); setEditing(false); } }}>
      <label htmlFor="oc-board-name">Your name on the board</label>
      <input autoComplete="nickname" className={sc.nameInput} id="oc-board-name" maxLength={OC_NAME_MAX} onChange={(event) => setDraft(event.target.value)} value={draft} />
      <button className={styles.primary} disabled={!clean} type="submit">Save</button>
      {name ? <button className={styles.ghostButton} onClick={() => setEditing(false)} type="button">Cancel</button> : null}
    </form>
  );
}

function rankText(rank: number | null): string {
  return rank ? `#${rank}` : `outside the top ${OC_BOARD_SIZE}`;
}

// ---------------------------------------------------------------------------
// The score panel on a finished run

/**
 * A finished Endless / Daily Siege run, or a won raid: its score, the rule
 * behind it, and its place on the online boards. Posts by itself once when the
 * player has a name (and the run may go on a board); otherwise asks for one.
 */
export function OcRunScore({ run, blocked, newBest, cleared, onSent }: {
  run: OcRunSummary;
  /** Why this run can't be posted (null = it can). */
  blocked: string | null;
  newBest: boolean;
  cleared: readonly string[];
  onSent(heldScore: number): void;
}) {
  const [name, saveName] = useBoardName();
  const [status, setStatus] = useState<{ t: "idle" } | { t: "posting" } | { t: "done"; result: OcPostResult }>({ t: "idle" });
  const [reaction, setReaction] = useState<OcLine | null>(null);
  const busy = useRef(false);
  const score = ocScore(run);
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  }, [onSent]);

  const post = useCallback(async (who: string) => {
    if (busy.current) return;
    busy.current = true;
    setStatus({ t: "posting" });
    const result = await postOcRun(who, run);
    setStatus({ t: "done", result });
    if (result.ok) {
      onSentRef.current(heldScore(result));
      const improved = result.today.improved || result.all.improved;
      const first = (result.today.improved && result.today.rank === 1) || (result.all.improved && result.all.rank === 1);
      const top10 = (result.today.improved && (result.today.rank ?? 99) <= 10) || (result.all.improved && (result.all.rank ?? 99) <= 10);
      if (improved) setReaction(pickLine(first ? OC_SCORE_LINES.first : top10 ? OC_SCORE_LINES.top10 : undefined, cleared));
    } else {
      // Offline: let the player try again. A refusal stands.
      busy.current = !result.offline;
    }
  }, [run, cleared]);

  // Post once by itself when a name is already known.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current) return;
    auto.current = true;
    if (!blocked && name && ocBoardsConfigured()) void post(name);
  }, [blocked, name, post]);

  const raid = run.mode === "raid";
  return (
    <div className={sc.scoreBox}>
      <span className={sc.muted}>{raid ? "Time" : "Score"}</span>
      <strong className={sc.scoreBig}>{raid ? ocRunTime(run.ticks) : score.toLocaleString("en-US")}</strong>
      <span>{ocScoreText(run.mode, run)}{newBest ? " · new personal best" : ""}</span>
      <small className={sc.muted}>{OC_SCORE_RULES[run.mode]}</small>
      {reaction ? <AdvisorBubble compact line={reaction} /> : null}
      {blocked ? <small className={sc.warn}>{blocked}</small> : !ocBoardsConfigured() ? (
        <small className={sc.warn}>Board offline: no tally board is set up for this game server. Your best is kept on this device.</small>
      ) : status.t === "posting" ? (
        <small>Posting to the tally board…</small>
      ) : status.t === "done" && status.result.ok ? (
        <small>Tally board: today {rankText(status.result.today.rank)} · all-time {rankText(status.result.all.rank)}{status.result.today.improved || status.result.all.improved ? "" : " (your earlier run still stands)"}</small>
      ) : (
        <>
          {status.t === "done" && !status.result.ok ? (
            <small className={sc.warn}>{status.result.offline ? "Board offline: the tally board can't be reached. Your best is kept on this device; post it later from the Tally Board." : `Not posted: ${status.result.error}`}</small>
          ) : null}
          {status.t === "idle" || (status.t === "done" && !status.result.ok && status.result.offline) ? (
            <>
              <NameField name={name} onSave={saveName} />
              <div>
                <button className={styles.primary} disabled={!name} onClick={() => void post(name)} type="button">
                  {status.t === "done" ? "Try again" : "Post to the tally board"}
                </button>
              </div>
            </>
          ) : null}
        </>
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

export function OcTallyBoard({ progress, cleared, update, onBack, initialMode = "endless" }: {
  progress: OcProgress;
  cleared: readonly string[];
  update(change: (p: OcProgress) => OcProgress): void;
  onBack(): void;
  initialMode?: OcBoardMode;
}) {
  const [mode, setMode] = useState<OcBoardMode>(initialMode);
  const [view, setView] = useState<OcBoardView>("today");
  const [raid, setRaid] = useState<string>(OC_RAIDS[0]?.id ?? "r1");
  const daily = useMemo(() => ocDaily(), []);
  const me = useMemo(() => getOcPublicId(), []);
  const [name, saveName] = useBoardName();
  const [rows, setRows] = useState<OcBoardRow[] | null>(null);
  const [error, setError] = useState<{ text: string; offline: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const [posting, setPosting] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    void fetchOcBoard({
      mode, view,
      ...(mode === "raid" ? { raid } : {}),
      ...(mode === "daily" ? { day: daily.day, setup: daily.setup } : {})
    }, reload > 0).then((result) => {
      if (!live) return;
      if (result.ok) setRows(result.rows);
      else setError({ text: result.error, offline: result.offline });
    });
    return () => { live = false; };
  }, [mode, view, raid, daily, reload]);

  // This device's best for the board on show.
  const bestKey = mode === "campaign" ? "campaign" : mode === "raid" ? `raid:${raid}` : mode === "daily"
    ? (view === "today" ? `daily:${daily.day}` : Object.keys(progress.bests).filter((key) => key.startsWith("daily:")).sort((a, b) => (progress.bests[b]!.score - progress.bests[a]!.score))[0] ?? `daily:${daily.day}`)
    : "endless";
  const best = progress.bests[bestKey];
  // The campaign board: this device's own progress (never with the testing unlock on), posted by hand.
  const campaignLevels = OC_LEVELS.filter((level) => progress.cleared.includes(level.id)).length;
  const campaignRun = mode === "campaign" && campaignLevels > 0 && !progress.testAll
    ? ocCampaignSummary(campaignLevels, totalStars(progress.cleared, progress.stars), progress.hero)
    : null;
  const campaignPosted = campaignRun !== null && progress.campaignPosted >= ocScore(campaignRun);
  const unsent = mode === "campaign" ? (campaignRun && !campaignPosted ? campaignRun : null) : best && !best.sent ? runFromBest(bestKey, best) : null;
  const postBest = async () => {
    if (!unsent || !name || posting) return;
    setPosting("Posting…");
    const result = await postOcRun(name, unsent);
    if (result.ok) {
      if (unsent.mode === "campaign") update((p) => ({ ...p, campaignPosted: Math.max(p.campaignPosted, heldScore(result)) }));
      else update((p) => markOcBestSent(p, bestKey, heldScore(result)));
      setPosting(null);
      setReload((n) => n + 1);
    } else {
      setPosting(result.offline ? "Board offline: try again later." : `Not posted: ${result.error}`);
    }
  };

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
            campaignRun ? <span>Your campaign: <b>{ocScoreText("campaign", campaignRun)}</b>{campaignPosted ? "" : " · not on the board yet"}</span>
              : <span>{progress.testAll ? "The testing unlock is on: campaign progress stays off the board." : "Clear a campaign level to join this board."}</span>
          ) : best ? (
            <span>Your best{mode === "daily" && view === "all" ? ` (${best.day})` : ""}: <b>{ocScoreText(mode, best)}</b>{best.sent ? "" : " · not on the board yet"}</span>
          ) : <span>No run of yours on this board yet.</span>}
          {unsent ? (
            <button className={styles.primary} disabled={!name || posting === "Posting…"} onClick={() => void postBest()} type="button">{mode === "campaign" ? "Post my progress" : "Post my best"}</button>
          ) : null}
          {posting && posting !== "Posting…" ? <small className={sc.warn}>{posting}</small> : null}
        </div>
        <NameField name={name} onSave={saveName} />
        {rows ? (
          rows.length ? (
            <div className={sc.tableWrap}>
              <table className={sc.board}>
                <thead>
                  <tr><th>#</th><th>Keeper</th><th>{mode === "raid" ? "Time" : mode === "campaign" ? "Levels · stars" : "Wave · foes slain"}</th><th>Hero</th><th>{mode === "daily" && view === "all" ? "Orders of" : "Day"}</th></tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className={row.pid === me ? sc.me : ""} key={`${row.pid}-${row.rank}`}>
                      <td className={sc.rank}>{row.rank}</td>
                      <td>{row.name}{row.pid === me ? " (you)" : ""}</td>
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
        {rows && !rows.some((row) => row.pid === me) && best?.sent ? <p className={styles.note}>Your best isn&apos;t in this board&apos;s top {OC_BOARD_SIZE}.</p> : null}
      </section>
    </>
  );
}
