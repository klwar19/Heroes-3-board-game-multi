"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronUp, GripHorizontal, PictureInPicture2, PanelRightClose } from "lucide-react";
import { isBulwarkPlayer } from "@/engine/runes";
import { NEUTRAL_PLAYER_ID, type GameState, type PlayerId } from "@/engine/state";
import { getCultivationMeter, isCultivationMeterFaction, type CultivationMeterView } from "@/engine/wuxia-factions";
import { assetUrl } from "@/lib/asset-url";
import styles from "./wuxia-meter-panel.module.css";

/**
 * Wuxia signature-meter panel for the combat surface: Azure Breeze Sect Qi and
 * Heavenly Demon Blood Essence, one section per wuxia seat in the fight (the
 * viewer's own first). Every figure is read from the engine's
 * `getCultivationMeter`, the same helpers the rules use: the meter with its
 * capacity (and where the extra slots come from), this round's gain/spend
 * windows, Sword Intent for Qingyun / Xuedao, and the three Cultivation Realm
 * upgrades.
 *
 * Same shell as the Bulwark Rune tracker: docked in the right rail, pop-out
 * draggable window, or minimized; on the phone layout always floating and
 * starting minimized. Its preferences are stored separately from the Rune
 * tracker's so the two panels can be arranged independently.
 */

const PREF_KEY = "homm3bg.wuxiaMeterPanel";
const QI_TOKEN = "/game-tokens/wuxia-qi-pearl.webp";
const ESSENCE_TOKEN = "/game-tokens/wuxia-blood-essence.webp";
const SWORD_INTENT_ICON = "/assets/anime/icons/cultivation/sword-intent.webp";
const AZURE_BACKDROP = "/assets/anime/notices/azure-breeze-spirit-tithe.webp";
const DEMON_BACKDROP = "/assets/anime/notices/heavenly-demon-blood-tribute.webp";
const REALM_ICONS: Record<CultivationMeterView["kind"], readonly [string, string, string]> = {
  "sect-qi": [
    "/assets/anime/icons/cultivation/foundation-establishment.webp",
    "/assets/anime/icons/cultivation/golden-core.webp",
    "/assets/anime/icons/cultivation/nascent-soul.webp"
  ],
  "blood-essence": [
    "/assets/anime/icons/cultivation/demon-foundation.webp",
    "/assets/anime/icons/cultivation/demon-core.webp",
    "/assets/anime/icons/cultivation/demon-soul.webp"
  ]
};

type PanelPos = { x: number; y: number };
type PanelPrefs = {
  minimized: boolean;
  phoneMinimized: boolean;
  floating: boolean;
  pos: PanelPos | null;
};

const DEFAULT_PREFS: PanelPrefs = { minimized: false, phoneMinimized: true, floating: false, pos: null };

// Client-only external store (see rune-panel.tsx): server render and first
// client render both see `null`, so hydration never calls setState in an effect.
let prefsCache: PanelPrefs | null = null;
const listeners = new Set<() => void>();

function readPrefs(): PanelPrefs {
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
    const pos =
      parsed.pos && Number.isFinite(parsed.pos.x) && Number.isFinite(parsed.pos.y)
        ? { x: parsed.pos.x, y: parsed.pos.y }
        : null;
    return {
      minimized: Boolean(parsed.minimized),
      phoneMinimized: parsed.phoneMinimized === undefined ? true : Boolean(parsed.phoneMinimized),
      floating: Boolean(parsed.floating),
      pos
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getPrefsSnapshot(): PanelPrefs {
  if (!prefsCache) prefsCache = readPrefs();
  return prefsCache;
}

function getPrefsServerSnapshot(): PanelPrefs | null {
  return null;
}

function setPrefs(patch: Partial<PanelPrefs>, persist = true): void {
  prefsCache = { ...getPrefsSnapshot(), ...patch };
  if (persist) {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(prefsCache));
    } catch {
      // storage blocked: the panel still works for this session
    }
  }
  for (const listener of listeners) listener();
}

function clampPos(pos: PanelPos, width: number, height: number): PanelPos {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, pos.x)),
    y: Math.min(maxY, Math.max(margin, pos.y))
  };
}

/** The two fighting seats that run a wuxia meter, viewer first. */
export function wuxiaMeterPlayersInCombat(state: GameState, viewerPlayerId: PlayerId): PlayerId[] {
  const combat = state.combat;
  if (!combat) return [];
  const ids = new Set<PlayerId>();
  for (const id of [combat.attackerPlayerId, combat.defenderPlayerId]) {
    if (id && id !== NEUTRAL_PLAYER_ID && isCultivationMeterFaction(state, id)) ids.add(id);
  }
  return [...ids].sort((a, b) => Number(b === viewerPlayerId) - Number(a === viewerPlayerId) || a.localeCompare(b));
}

function meterName(kind: CultivationMeterView["kind"]): string {
  return kind === "sect-qi" ? "Sect Qi" : "Blood Essence";
}

/** Xuanming's Legion of Bones sets an effectively unlimited per-round harvest count. */
const UNLIMITED_HARVESTS = 99;

/**
 * One entry per slot, in fill order: base slots first, then each bonus source.
 * The cap only limits GAINS, so a meter can hold more than its current capacity
 * (Qi banked while the Sword Saint stood, then it fell); those points get their
 * own slots instead of vanishing from the display.
 */
function slotSources(view: CultivationMeterView): { note: string | null }[] {
  const slots = view.capacitySources.flatMap((source, index) =>
    Array.from({ length: source.amount }, () => ({ note: index > 0 ? `extra slot from ${source.label}` : null }))
  );
  while (slots.length < view.value) slots.push({ note: "held above the current capacity" });
  return slots;
}

function MeterSeat({ view, name, showName }: { view: CultivationMeterView; name: string; showName: boolean }) {
  const azure = view.kind === "sect-qi";
  const token = azure ? QI_TOKEN : ESSENCE_TOKEN;
  const unit = azure ? "Qi" : "Essence";
  const slots = slotSources(view);
  const reachedRealm = view.realmSteps.filter((step) => step.reached).at(-1);
  return (
    <section
      className={`${styles.seat} ${azure ? styles.azure : styles.demon}`}
      aria-label={`${meterName(view.kind)} for ${name}: ${view.value} of ${view.capacity}`}
    >
      <div className={styles.seatHead}>
        {showName ? <h4 className={styles.seatName}>{name}</h4> : null}
        <span className={styles.meterTitle}>{meterName(view.kind)}</span>
        {reachedRealm ? <span className={styles.realmChip}>{reachedRealm.name}</span> : null}
      </div>

      <div className={styles.meterRow}>
        <ol className={styles.slots} aria-label={`${view.value} of ${view.capacity} ${unit}`}>
          {slots.map((slot, index) => {
            const filled = view.value >= index + 1;
            return (
              <li
                key={index}
                className={`${styles.slot}${filled ? ` ${styles.filled}` : ""}${slot.note ? ` ${styles.bonus}` : ""}`}
                title={`${filled ? `${unit} ${index + 1}` : `Empty ${unit} slot ${index + 1}`}${slot.note ? ` (${slot.note})` : ""}`}
              >
                {filled ? <img alt="" aria-hidden="true" className={styles.token} draggable={false} src={assetUrl(token)} /> : null}
              </li>
            );
          })}
        </ol>
        <span className={styles.count}>
          {view.value}
          <small>/{view.capacity}</small>
        </span>
      </div>

      <div className={styles.statusRow}>
        {view.formationLinks ? (
          <span
            className={`${styles.chip}${view.formationLinks.used < view.formationLinks.limit ? ` ${styles.ready}` : ""}`}
            title="Move a unit into a NEW adjacency with an ally to gain 1 Sect Qi (limit per combat round)"
          >
            Formation link {view.formationLinks.used}/{view.formationLinks.limit} this round
          </span>
        ) : null}
        {view.swordIntent ? (
          <span
            className={`${styles.chip} ${styles.intent}${view.swordIntent.value >= view.swordIntent.threshold ? ` ${styles.ready}` : ""}`}
            title={`Sword Intent: each damaging own attack tempers 1; at ${view.swordIntent.threshold} the next own attack releases it for +1 Attack`}
          >
            <img alt="" aria-hidden="true" draggable={false} src={assetUrl(SWORD_INTENT_ICON)} />
            Intent {view.swordIntent.value}/{view.swordIntent.threshold}
            {view.swordIntent.value >= view.swordIntent.threshold ? " · releases next attack" : ""}
          </span>
        ) : null}
        {view.bloodPrice ? (
          <span
            className={`${styles.chip}${view.bloodPrice.ready ? ` ${styles.ready}` : ""}`}
            title={
              view.bloodPrice.unlimited
                ? "Blood Price: each of your army units feeds 1 Essence the first time it flips or is removed (Shiyan's Corpse-Furnace Sutra lifts the once-per-round limit; Blood Oath units feed on every flip or removal)"
                : "Blood Price: your army unit's first flip or removal feeds 1 Essence, once per combat round (Blood Oath units feed on every flip or removal, even after the round's Price is taken)"
            }
          >
            Blood Price {view.bloodPrice.unlimited ? "· no round limit" : view.bloodPrice.ready ? "ready" : "taken"}
          </span>
        ) : null}
        {view.bloodHarvest ? (
          <span
            className={`${styles.chip}${view.bloodHarvest.used < view.bloodHarvest.limit ? ` ${styles.ready}` : ""}`}
            title="Blood Harvest: your attack that defeats an enemy side or Stack layer gains 1 Essence (limit per combat round)"
          >
            {view.bloodHarvest.limit >= UNLIMITED_HARVESTS
              ? "Harvest · no round limit"
              : `Harvest ${view.bloodHarvest.used}/${view.bloodHarvest.limit} this round`}
          </span>
        ) : null}
        {view.bloodFrenzy ? (
          <span
            className={`${styles.chip}${view.bloodFrenzy.ready && view.value > 0 ? ` ${styles.ready}` : ""}`}
            title={`Blood Frenzy: once per round, your first attack made while you hold Essence spends 1 for +${view.bloodFrenzy.bonus} Attack`}
          >
            Frenzy +{view.bloodFrenzy.bonus} {view.bloodFrenzy.ready ? (view.value > 0 ? "armed" : "needs Essence") : "spent"}
          </span>
        ) : null}
      </div>

      {view.realmSteps.length > 0 ? (
        <ol className={styles.realms} aria-label="Cultivation Realm upgrades">
          {view.realmSteps.map((step) => (
            <li
              key={step.realm}
              className={`${styles.realm}${step.reached ? ` ${styles.reached}` : ""}`}
              title={`${step.name}: ${step.effect}${step.reached ? " (reached)" : " (not reached yet)"}`}
            >
              <img alt="" aria-hidden="true" draggable={false} src={assetUrl(REALM_ICONS[view.kind][step.realm - 1])} />
              <span className={styles.realmText}>
                <b>{step.name}</b>
                <span>{step.effect}</span>
              </span>
              {step.reached ? <span aria-hidden="true" className={styles.realmMark}>✓</span> : null}
            </li>
          ))}
        </ol>
      ) : null}

      <dl className={styles.rules}>
        <dt>Gain</dt>
        <dd>
          {azure
            ? "Move beside a new ally (formation link)"
            : "Your army unit falls or flips · your attack defeats an enemy side/layer"}
        </dd>
        <dt>Spend</dt>
        <dd>
          {azure
            ? "Attack beside an ally: 1 Qi → +1 Attack · attacked beside an ally: 1 Qi → +1 Defense"
            : `Once a round, your first attack with Essence: 1 → +${view.bloodFrenzy?.bonus ?? 1} Attack · unit arts spend the rest`}
        </dd>
      </dl>
    </section>
  );
}

export function WuxiaMeterPanel({ state, viewerPlayerId, phone = false }: { state: GameState; viewerPlayerId: PlayerId; phone?: boolean }) {
  const players = wuxiaMeterPlayersInCombat(state, viewerPlayerId);
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getPrefsServerSnapshot);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const floating = phone || Boolean(prefs?.floating);
  const minimized = phone ? Boolean(prefs?.phoneMinimized) : Boolean(prefs?.minimized);
  const pos = prefs?.pos ?? null;

  useEffect(() => {
    if (!floating || !pos) return;
    const onResize = () => {
      const el = panelRef.current;
      const current = getPrefsSnapshot();
      if (!current.pos) return;
      setPrefs({ pos: clampPos(current.pos, el?.offsetWidth ?? 380, el?.offsetHeight ?? 200) });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [floating, pos]);

  const onDragPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !floating) return;
      const el = panelRef.current;
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = el.getBoundingClientRect();
      el.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: rect.left, originY: rect.top };
      setDragging(true);
    },
    [floating]
  );

  const onDragPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const el = panelRef.current;
    if (!drag || !el || drag.pointerId !== event.pointerId) return;
    const next = clampPos(
      { x: drag.originX + (event.clientX - drag.startX), y: drag.originY + (event.clientY - drag.startY) },
      el.offsetWidth,
      el.offsetHeight
    );
    setPrefs({ pos: next }, false);
  }, []);

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      panelRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    setPrefs({}, true);
  }, []);

  const views = players
    .map((playerId) => getCultivationMeter(state, playerId))
    .filter((view): view is CultivationMeterView => view !== null);
  if (views.length === 0 || !prefs) return null;

  const nameOf = (playerId: PlayerId) => state.players[playerId]?.name ?? playerId;
  const summary = views
    .map((view) => `${views.length > 1 ? `${nameOf(view.playerId)}: ` : ""}${view.kind === "sect-qi" ? "Qi" : "Essence"} ${view.value}/${view.capacity}`)
    .join("  |  ");
  const kinds = new Set(views.map((view) => view.kind));
  const title = kinds.size > 1 ? "Cultivation" : meterName(views[0].kind);
  const headToken = views[0].kind === "sect-qi" ? QI_TOKEN : ESSENCE_TOKEN;
  const backdrop = views[0].kind === "sect-qi" ? AZURE_BACKDROP : DEMON_BACKDROP;

  // A Bulwark seat in the same fight also shows the Rune tracker, whose default
  // spots are right:10/bottom:134 (phone) and right:16/top:72 (desktop): start
  // this panel clear of it.
  const runePanelToo = Boolean(
    state.combat &&
      [state.combat.attackerPlayerId, state.combat.defenderPlayerId].some(
        (id) => id && id !== NEUTRAL_PLAYER_ID && isBulwarkPlayer(state, id)
      )
  );
  const style: CSSProperties | undefined = floating
    ? pos
      ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
      : phone
        ? { right: 10, bottom: runePanelToo ? 178 : 134, left: "auto", top: "auto" }
        : { right: 16, top: runePanelToo ? 330 : 72, left: "auto", bottom: "auto" }
    : undefined;

  const theme = kinds.size > 1 ? styles.mixed : views[0].kind === "sect-qi" ? styles.azure : styles.demon;
  return (
    <div
      ref={panelRef}
      className={`${styles.panel} ${theme}${floating ? ` ${styles.floating}` : ""}${minimized ? ` ${styles.minimized}` : ""}${dragging ? ` ${styles.dragging}` : ""}${phone ? ` ${styles.phone}` : ""}`}
      style={style}
      onPointerMove={floating ? onDragPointerMove : undefined}
      onPointerUp={floating ? endDrag : undefined}
      onPointerCancel={floating ? endDrag : undefined}
      role="region"
      aria-label={`${title} meter`}
    >
      <div className={styles.head}>
        {floating ? (
          <button
            type="button"
            className={styles.handle}
            aria-label={`Drag the ${title} panel`}
            title="Drag to move"
            onPointerDown={onDragPointerDown}
          >
            <GripHorizontal size={14} aria-hidden="true" />
          </button>
        ) : null}
        <img alt="" aria-hidden="true" className={styles.headIcon} draggable={false} src={assetUrl(headToken)} />
        <span className={styles.title}>{title}</span>
        <span className={styles.summary}>{summary}</span>
        {!phone ? (
          <button
            type="button"
            className={styles.button}
            title={floating ? "Dock the panel back into the side rail" : "Pop the panel out as a movable window"}
            aria-label={floating ? `Dock the ${title} panel` : `Pop out the ${title} panel`}
            onClick={() => setPrefs({ floating: !floating, minimized: false })}
          >
            {floating ? <PanelRightClose size={14} aria-hidden="true" /> : <PictureInPicture2 size={14} aria-hidden="true" />}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.button}
          title={minimized ? "Show the full meter" : "Minimize to a one-line readout"}
          aria-label={minimized ? `Expand the ${title} panel` : `Minimize the ${title} panel`}
          aria-expanded={!minimized}
          onClick={() => setPrefs(phone ? { phoneMinimized: !minimized } : { minimized: !minimized })}
        >
          {minimized ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      </div>
      {!minimized ? (
        <div
          className={styles.body}
          style={{ backgroundImage: `linear-gradient(180deg, rgb(6 10 12 / 70%), rgb(6 10 12 / 88%)), url(${assetUrl(backdrop)})` }}
        >
          {views.map((view) => (
            <MeterSeat key={view.playerId} name={nameOf(view.playerId)} showName={views.length > 1} view={view} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
