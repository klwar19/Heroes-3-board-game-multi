"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { BLESSINGS, CARDS, DEFENDERS, ENEMIES, FUSIONS, GW_TPS, SPELLS, type CardId, type EnemyKind, type SpellId } from "@/engine/garrison/content";
import { surgeText } from "@/engine/garrison/order-chaos/surge-text";
import { baseKind } from "@/engine/garrison/order-chaos/forms";
import { cardCost, spellCooldown, spellsLeft, type GarrisonState, type Side } from "@/engine/garrison/sim";
import { assetUrl } from "@/lib/asset-url";
import styles from "./garrison.module.css";
import { PROP } from "./scene";
import { AttackerArt, CardArt } from "./thumbs";

/** An art icon that falls back to a glyph when the image is missing (unpublished media). */
export function IconOr({ src, fallback, className }: { src: string; fallback: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span aria-hidden="true">{fallback}</span>;
  return <img alt="" className={className} draggable={false} onError={() => setFailed(true)} src={assetUrl(src)} />;
}

export type Selection =
  | { t: "card"; card: CardId; beltId?: number }
  | { t: "spell"; spell: SpellId; side: Side }
  | { t: "shovel" }
  | { t: "atk"; kind: EnemyKind }
  /** Order & Chaos: a Surge orb in hand, to drop on a unit. */
  | { t: "surge" }
  /** Order & Chaos: a Valor crown in hand, to Ascend a unit. */
  | { t: "ascend" }
  | null;

export type Tip = { title: string; lines: string[] } | null;

export const DEF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
export const DEF_SPELL_KEYS = ["q", "w", "e", "r", "t", "y"];
export const ATK_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];
export const ATK_SPELL_KEYS = ["z", "x", "c"];

function fusionHints(card: CardId): string[] {
  const hints: string[] = [];
  // Order & Chaos packets carry their Barracks level (`oc-longbow@3`); recipes name the unit.
  const plain = baseKind(card);
  for (const recipe of FUSIONS) {
    const result = DEFENDERS[recipe.result]!.name;
    if (recipe.b.includes(plain)) hints.push(`Drop on ${recipe.a.map((id) => CARDS[id]!.name).join(" / ")} → ${result}`);
    if (recipe.a.includes(plain) && CARDS[card]?.places) hints.push(`Drop ${recipe.b.map((id) => CARDS[id]!.name).join(" / ")} on it → ${result}`);
  }
  return hints;
}

export function cardTip(card: CardId): Tip {
  const def = CARDS[card];
  if (!def) return null;
  const lines = [`${def.cost > 0 ? `${def.cost} gold` : "Free"} · recharge ${Math.round(def.recharge / GW_TPS)} s`, def.blurb];
  const up = def.places ? DEFENDERS[def.places]?.upgrade : undefined;
  if (up) lines.push(`Upgrade → ${DEFENDERS[up.to]!.name} (${up.cost} gold): ${DEFENDERS[up.to]!.blurb}`);
  lines.push(...fusionHints(card));
  const unit = def.places ? DEFENDERS[def.places] : undefined;
  if (unit?.surge) lines.push(`Surge: ${surgeText(unit)}`);
  return { title: unit?.level && unit.level > 1 ? `${def.name} · Lv ${unit.level}` : def.name, lines };
}

export function formatTime(ticks: number): string {
  const secs = Math.floor(ticks / GW_TPS);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export function DefTray({ s, gold = s.def.gold, selection, onSelect, onTip }: {
  s: GarrisonState;
  /** Gold shown on the counter (coins still flying to it are not counted yet). */
  gold?: number;
  selection: Selection;
  onSelect(next: Selection): void;
  onTip(tip: Tip): void;
}) {
  if (s.cfg.conveyorPool) {
    return (
      <div className={styles.belt} aria-label="Summoning belt">
        {s.def.belt.map((item, index) => {
          const active = selection?.t === "card" && selection.beltId === item.uid;
          return (
            <button
              className={`${styles.card} ${active ? styles.cardSelected : ""}`}
              key={item.uid}
              onClick={() => onSelect(active ? null : { t: "card", card: item.card, beltId: item.uid })}
              onMouseEnter={() => onTip(cardTip(item.card))}
              onMouseLeave={() => onTip(null)}
              type="button"
            >
              <CardArt card={item.card} size={54} />
              <span className={styles.cardName}>{CARDS[item.card]!.name}</span>
              {index < 10 ? <kbd className={styles.key}>{DEF_KEYS[index]}</kbd> : null}
            </button>
          );
        })}
        {s.def.belt.length === 0 ? <span className={styles.beltEmpty}>The belt is warming up…</span> : null}
      </div>
    );
  }
  return (
    <div className={styles.tray}>
      {s.def.cards.map((slot, index) => {
        const def = CARDS[slot.id]!;
        const cost = cardCost(s, slot.id);
        // Last Stand planning: nothing recharges while the field is frozen.
        const wait = s.planning ? 0 : Math.max(0, slot.readyAt - s.tick);
        const charge = wait > 0 ? wait / def.recharge : 0;
        const poor = gold < cost;
        const active = selection?.t === "card" && selection.card === slot.id;
        const faction = CARDS[slot.id]!.faction;
        return (
          <button
            aria-label={`${def.name}, ${cost} gold`}
            className={`${styles.card} ${styles.packet} ${active ? styles.cardSelected : ""} ${poor || wait > 0 ? styles.cardDim : ""} ${!poor && wait === 0 ? styles.cardReady : ""}`}
            data-faction={faction}
            key={slot.id}
            onClick={() => onSelect(active ? null : { t: "card", card: slot.id })}
            onMouseEnter={() => onTip(cardTip(slot.id))}
            onMouseLeave={() => onTip(null)}
            type="button"
          >
            <CardArt card={slot.id} size={54} />
            <span className={`${styles.cost} ${poor ? styles.costPoor : ""}`}>{cost}</span>
            {charge > 0 ? <span className={styles.recharge} style={{ height: `${charge * 100}%` }} /> : null}
            {index < 10 ? <kbd className={styles.key}>{DEF_KEYS[index]}</kbd> : null}
          </button>
        );
      })}
    </div>
  );
}

export function SpellBar({ s, side, keys, selection, onChoose, onTip }: {
  s: GarrisonState;
  side: Side;
  keys: readonly string[];
  selection: Selection;
  onChoose(side: Side, spell: SpellId): void;
  onTip(tip: Tip): void;
}) {
  const pool = side === "def" ? s.cfg.spells : s.cfg.atkSpells;
  if (pool.length === 0) return null;
  const book = side === "def" ? s.def : s.atk;
  const max = side === "def" ? s.def.manaMax : 30;
  return (
    <div className={styles.spellBar}>
      <div className={styles.mana} title={`${book.mana} / ${max} mana`}>
        <span className={styles.manaFill} style={{ width: `${(book.mana / max) * 100}%` }} />
        <span className={styles.manaText}>{book.mana} mana</span>
      </div>
      {pool.map((spell, index) => {
        const def = SPELLS[spell];
        const wait = Math.max(0, (book.spellReady[spell] ?? 0) - s.tick);
        // Order & Chaos raids: Chaos spells have a few casts per battle.
        const left = side === "atk" ? spellsLeft(s, spell) : Number.POSITIVE_INFINITY;
        const limited = Number.isFinite(left);
        const poor = book.mana < def.mana || left <= 0;
        const active = selection?.t === "spell" && selection.spell === spell;
        return (
          <button
            aria-label={`${def.name}, ${def.mana} mana${limited ? `, ${left} left` : ""}`}
            className={`${styles.spell} ${active ? styles.cardSelected : ""} ${poor || wait > 0 ? styles.cardDim : ""}`}
            key={spell}
            onClick={() => onChoose(side, spell)}
            onMouseEnter={() => onTip({ title: def.name, lines: [`${def.mana} mana${limited ? ` · ${left} cast${left === 1 ? "" : "s"} left this battle` : ""}`, def.blurb] })}
            onMouseLeave={() => onTip(null)}
            type="button"
          >
            <img alt="" draggable={false} src={assetUrl(def.icon)} />
            <span className={styles.spellCost}>{def.mana}</span>
            {limited ? <span className={styles.spellCharges}>×{left}</span> : null}
            {wait > 0 ? <span className={styles.recharge} style={{ height: `${Math.min(1, wait / spellCooldown(s, side, spell)) * 100}%` }} /> : null}
            {keys[index] ? <kbd className={styles.key}>{keys[index]!.toUpperCase()}</kbd> : null}
          </button>
        );
      })}
    </div>
  );
}

export function AtkTray({ s, selection, showKeys, onPick, onTip }: {
  s: GarrisonState;
  selection: Selection;
  showKeys: boolean;
  onPick(kind: EnemyKind): void;
  onTip(tip: Tip): void;
}) {
  return (
    <div className={styles.tray}>
      {s.atk.cards.map((slot, index) => {
        const def = ENEMIES[slot.id]!;
        const wait = Math.max(0, slot.readyAt - s.tick);
        const poor = s.atk.might < def.might;
        const active = selection?.t === "atk" && selection.kind === slot.id;
        return (
          <button
            aria-label={`${def.name}, ${def.might} might`}
            className={`${styles.card} ${styles.atkCard} ${active ? styles.cardSelected : ""} ${poor || wait > 0 ? styles.cardDim : ""}`}
            key={slot.id}
            onClick={() => onPick(slot.id)}
            onMouseEnter={() => onTip({ title: def.name, lines: [`${def.might} Might · HP ${def.hp}${def.shield ? ` + shield ${def.shield}` : ""}${def.armor ? ` + armour ${def.armor}` : ""}`, def.blurb] })}
            onMouseLeave={() => onTip(null)}
            type="button"
          >
            <AttackerArt kind={slot.id} size={54} />
            <span className={`${styles.cost} ${poor ? styles.costPoor : ""}`}>{def.might}</span>
            {wait > 0 ? <span className={styles.recharge} style={{ height: `${(wait / def.recharge) * 100}%` }} /> : null}
            {showKeys && index < ATK_KEYS.length ? <kbd className={styles.key}>{ATK_KEYS[index]!.toUpperCase()}</kbd> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ s }: { s: GarrisonState }) {
  const cfg = s.cfg;
  if (cfg.mode === "versus") {
    return (
      <div className={styles.progress}>
        <span>Banners down: <b>{s.bannersDown}</b> / {Math.min(3, cfg.lanes.length)}</span>
        <span>{s.overtime ? "Overtime" : "Time"} {formatTime(s.tick)}</span>
      </div>
    );
  }
  if (cfg.mode === "raid") {
    return (
      <div className={styles.progress}>
        <span>Lanes broken: <b>{s.atk.raided.length}</b> / {cfg.lanes.length}</span>
      </div>
    );
  }
  if (cfg.boss) return <div className={styles.progress}><span>Destroy the Dracolich</span></div>;
  if (cfg.endless) {
    return (
      <div className={styles.progress}>
        <span>Wave <b>{s.director.wave}</b></span>
        <span className={styles.relics}>
          {s.def.blessings.map((id) => <img alt={BLESSINGS[id].name} key={id} src={assetUrl(BLESSINGS[id].icon)} title={`${BLESSINGS[id].name}: ${BLESSINGS[id].blurb}`} />)}
        </span>
      </div>
    );
  }
  // The level meter: it fills from the right as the waves come, the Tide's head riding its edge;
  // each great assault's flag rises once reached.
  const frac = cfg.waves > 0 ? Math.min(1, s.director.wave / cfg.waves) : 0;
  const hide = (event: React.SyntheticEvent<HTMLImageElement>) => { event.currentTarget.style.visibility = "hidden"; };
  return (
    <div className={styles.progress} aria-label={`Wave ${s.director.wave} of ${cfg.waves}`}>
      <span className={styles.levelName}>{cfg.title}</span>
      <div className={styles.meter}>
        <span className={styles.meterFill} style={{ width: `${frac * 100}%` }} />
        {Array.from({ length: cfg.waves }, (_, i) => i + 1)
          .filter((w) => w % 10 === 0 || w === cfg.waves)
          .map((w) => (
            <img alt="" className={`${styles.meterFlag} ${s.director.wave >= w ? styles.meterFlagUp : ""}`} draggable={false} key={w}
              onError={hide} src={assetUrl(PROP.flag)} style={{ right: `calc(${(w / cfg.waves) * 100}% - 9px)` }} />
          ))}
        <img alt="" className={styles.meterHead} draggable={false} onError={hide} src={assetUrl(PROP.head)} style={{ right: `calc(${frac * 100}% - 13px)` }} />
      </div>
      <span>Wave {s.director.wave} / {cfg.waves}</span>
    </div>
  );
}
