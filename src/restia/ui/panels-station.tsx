"use client";

import { useState, type ReactNode } from "react";
import type { BuildingId, DispatchResult, NpcId, RestiaAction, RestiaState, Station } from "../engine/types";
import { BUILDINGS, BUILDING_ORDER, maxLevel } from "../data/buildings";
import { ITEMS, itemDef } from "../data/items";
import { RECIPE_LIST, type RecipeDef } from "../data/recipes";
import { BLESSINGS, MAX_ACCEPTED_REQUESTS, RANK_EXAM, RANK_GP } from "../data/progression";
import { MONSTERS } from "../data/monsters";
import { NPCS } from "../data/npcs";
import { CHARACTERS } from "../data/characters";
import { blessingCost, nextLevelInfo, planInputs, priceAt, recipeName, recipeUnlocked, sellValue, shopStock, townRank, townScore } from "../engine/town";
import { nextRank, requestReady, requestTitle } from "../engine/quests";
import { availableStarts } from "../engine/dungeon";
import { check } from "../engine/conditions";
import { activeLimit, petStats } from "../engine/party";
import { barnCapacity } from "../engine/state";
import { count } from "../engine/core";
import { themeForFloor } from "../data/dungeon";
import { SLOTS, exportSave, listSaves, saveGame, type SlotId } from "../engine/save";
import { ItemIcon, SpriteStill } from "./sprites";
import s from "./restia.module.css";

type Act = (action: RestiaAction) => DispatchResult;

export function Panel({ title, onClose, children, wide, tabs }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; tabs?: ReactNode }) {
  return (
    <div className={s.panelBackdrop} onClick={onClose}>
      <div className={`${s.panel} ${wide ? s.panelWide : ""}`} onClick={(event) => event.stopPropagation()} role="dialog" aria-label={title}>
        <div className={s.panelHeader}>
          <h2 className={s.panelTitle}>{title}</h2>
          <button className={s.iconBtn} onClick={onClose} title="Close (Esc)" type="button">
            ✕
          </button>
        </div>
        {tabs}
        <div className={s.panelBody}>{children}</div>
      </div>
    </div>
  );
}

function Qty({ onPick, max }: { onPick: (n: number) => void; max: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <button className={`${s.btn} ${s.btnSmall}`} disabled={max < 1} onClick={() => onPick(1)} type="button">
        x1
      </button>
      <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={max < 5} onClick={() => onPick(5)} type="button">
        x5
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------

export function ShopPanel({ state, act, building, onClose }: { state: RestiaState; act: Act; building: BuildingId; onClose: () => void }) {
  const canSell = building === "store";
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const stock = shopStock(state, building);
  const sellable = Object.keys(state.inventory).filter((id) => ITEMS[id] && ITEMS[id]!.price > 0);
  return (
    <Panel
      onClose={onClose}
      tabs={
        canSell ? (
          <div className={s.tabs}>
            <button className={tab === "buy" ? s.tabActive : s.tab} onClick={() => setTab("buy")} type="button">
              Buy
            </button>
            <button className={tab === "sell" ? s.tabActive : s.tab} onClick={() => setTab("sell")} type="button">
              Sell
            </button>
          </div>
        ) : undefined
      }
      title={`${BUILDINGS[building].name} — ${state.gold.toLocaleString()} G`}
    >
      {tab === "buy" ? (
        <div className={s.list}>
          {stock.length ? null : <div className={s.muted}>Nothing for sale right now.</div>}
          {stock.map((id) => {
            const price = priceAt(building, id);
            return (
              <div className={s.row} key={id}>
                <ItemIcon id={id} size={40} />
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>
                    {itemDef(id).name} <span className={s.muted}>(have {count(state, id)})</span>
                  </div>
                  <div className={s.muted}>{itemDef(id).desc}</div>
                </div>
                <b>{price} G</b>
                <Qty max={Math.floor(state.gold / price)} onPick={(n) => act({ type: "buy", item: id, n })} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.list}>
          {sellable.length ? null : <div className={s.muted}>Your bag is empty.</div>}
          {sellable.map((id) => (
            <div className={s.row} key={id}>
              <ItemIcon id={id} size={40} />
              <div className={s.rowMain}>
                <div className={s.rowTitle}>
                  {itemDef(id).name} x{count(state, id)}
                </div>
                <div className={s.muted}>{sellValue(state, id)} G each</div>
              </div>
              <Qty max={count(state, id)} onPick={(n) => act({ type: "sell", item: id, n })} />
              <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "sell", item: id, n: count(state, id) })} type="button">
                All
              </button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

const STATION_TITLE: Record<Station, string> = { forge: "Forge", alchemy: "Alchemy", cooking: "Kitchen" };

function inputLabel(input: RecipeDef["inputs"][number]): string {
  return "item" in input ? `${itemDef(input.item).name} x${input.n}` : `${input.label} x${input.n}`;
}

export function CraftPanel({ state, act, station, onClose }: { state: RestiaState; act: Act; station: Station; onClose: () => void }) {
  const recipes = RECIPE_LIST.filter((recipe) => recipe.station === station);
  const unlocked = recipes.filter((recipe) => recipeUnlocked(state, recipe));
  const locked = recipes.filter((recipe) => !recipeUnlocked(state, recipe) && !recipe.toolUpgrade);
  return (
    <Panel onClose={onClose} title={`${STATION_TITLE[station]} — ${state.gold.toLocaleString()} G`} wide>
      <div className={s.list}>
        {unlocked.map((recipe) => {
          const plan = planInputs(state, recipe);
          const affordable = !!plan && state.gold >= recipe.gold;
          return (
            <div className={s.row} key={recipe.id}>
              {recipe.output ? <ItemIcon id={recipe.output.item} size={40} /> : <span style={{ fontSize: 28 }}>🔨</span>}
              <div className={s.rowMain}>
                <div className={s.rowTitle}>
                  {recipeName(recipe)}
                  {recipe.output && recipe.output.n > 1 ? ` x${recipe.output.n}` : ""}
                </div>
                <div className={s.muted}>
                  {recipe.inputs.map((input, index) => {
                    const have = "item" in input ? count(state, input.item) : Object.keys(state.inventory).filter((id) => ITEMS[id]?.tags?.includes(input.tag)).reduce((sum, id) => sum + count(state, id), 0);
                    return (
                      <span className={have >= input.n ? undefined : s.bad} key={`${index}-${inputLabel(input)}`} style={{ marginRight: 10 }}>
                        {inputLabel(input)} ({have})
                      </span>
                    );
                  })}
                  {recipe.gold ? <span>{recipe.gold} G</span> : null} · {recipe.minutes} min
                </div>
                {recipe.output && itemDef(recipe.output.item).desc ? <div className={s.muted}>{itemDef(recipe.output.item).desc}</div> : null}
              </div>
              <button className={`${s.btn} ${s.btnSmall}`} disabled={!affordable} onClick={() => act({ type: "craft", recipe: recipe.id, n: 1 })} type="button">
                Make
              </button>
              {!recipe.toolUpgrade ? (
                <button className={`${s.btnGhost} ${s.btnSmall}`} disabled={!planInputs(state, recipe, 5) || state.gold < recipe.gold * 5} onClick={() => act({ type: "craft", recipe: recipe.id, n: 5 })} type="button">
                  x5
                </button>
              ) : null}
            </div>
          );
        })}
        {locked.length ? (
          <div className={s.muted} style={{ marginTop: 8 }}>
            Locked ({locked.length}): upgrade {station === "cooking" ? "Garr's Hut" : station === "forge" ? "the Ironhand Forge" : "the Apothecary"} at the Outpost Board to learn more.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function ShipPanel({ state, act, onClose }: { state: RestiaState; act: Act; onClose: () => void }) {
  const items = Object.keys(state.inventory).filter((id) => ITEMS[id] && ITEMS[id]!.price > 0);
  const inBin = Object.entries(state.shipping);
  const total = inBin.reduce((sum, [id, n]) => sum + sellValue(state, id) * n, 0);
  return (
    <Panel onClose={onClose} title="Shipping Bin" wide>
      <div className={s.columns}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Your bag</h3>
          <div className={s.list}>
            {items.map((id) => (
              <div className={s.row} key={id}>
                <ItemIcon id={id} size={36} />
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>
                    {itemDef(id).name} x{count(state, id)}
                  </div>
                  <div className={s.muted}>{sellValue(state, id)} G each</div>
                </div>
                <Qty max={count(state, id)} onPick={(n) => act({ type: "ship", item: id, n })} />
                <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "ship", item: id, n: count(state, id) })} type="button">
                  All
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className={s.card}>
          <h3 className={s.cardTitle}>In the bin — pays {total.toLocaleString()} G tonight</h3>
          <div className={s.list}>
            {inBin.length ? null : <div className={s.muted}>Empty. Everything here is sold when you sleep.</div>}
            {inBin.map(([id, n]) => (
              <div className={s.row} key={id}>
                <ItemIcon id={id} size={36} />
                <div className={s.rowMain}>
                  {itemDef(id).name} x{n}
                </div>
                <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "unship", item: id, n })} type="button">
                  Take back
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function StoragePanel({ state, act, onClose }: { state: RestiaState; act: Act; onClose: () => void }) {
  const bag = Object.keys(state.inventory);
  const chest = Object.keys(state.storage);
  return (
    <Panel onClose={onClose} title="Storage Chest" wide>
      <div className={s.columns}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Bag</h3>
          <div className={s.grid}>
            {bag.map((id) => (
              <button className={s.slot} key={id} onClick={() => act({ type: "store", item: id, n: count(state, id) })} title={`Store all ${itemDef(id).name}`} type="button">
                <ItemIcon id={id} size={40} />
                <span className={s.slotCount}>{count(state, id)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Chest (monsters leave their produce here)</h3>
          <div className={s.grid}>
            {chest.map((id) => (
              <button className={s.slot} key={id} onClick={() => act({ type: "retrieve", item: id, n: state.storage[id]! })} title={`Take all ${itemDef(id).name}`} type="button">
                <ItemIcon id={id} size={40} />
                <span className={s.slotCount}>{state.storage[id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={s.muted} style={{ marginTop: 8 }}>
        Click an item to move the whole stack.
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function RequestsPanel({ state, act, onClose }: { state: RestiaState; act: Act; onClose: () => void }) {
  const open = state.requests.filter((request) => !request.accepted);
  const mine = state.requests.filter((request) => request.accepted);
  const next = nextRank(state);
  const exam = next ? RANK_EXAM[next] : null;
  return (
    <Panel onClose={onClose} title="Request Board" wide>
      <div className={s.card} style={{ marginBottom: 10 }}>
        <div className={s.rowTitle}>
          Rank {state.guild.rank} · {state.guild.gp} GP
        </div>
        {next ? (
          <div className={s.muted}>
            Next: Rank {next} at {RANK_GP[next]} GP{exam?.text ? ` · Exam: ${exam.text}` : ""}{" "}
            <button className={`${s.btn} ${s.btnSmall}`} disabled={state.guild.gp < RANK_GP[next] || (!!exam?.cond && !check(state, exam.cond))} onClick={() => act({ type: "rankExam" })} type="button">
              Take the exam
            </button>
          </div>
        ) : (
          <div className={s.good}>Rank S — the highest there is.</div>
        )}
      </div>
      <div className={s.columns}>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Posted today</h3>
          <div className={s.list}>
            {open.length ? null : <div className={s.muted}>No new requests. Check back tomorrow.</div>}
            {open.map((request) => (
              <div className={s.row} key={request.uid}>
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>{requestTitle(request)}</div>
                  <div className={s.muted}>
                    {NPCS[request.client].name} · {request.gold} G + {request.gp} GP · expires day {request.expires}
                  </div>
                </div>
                <button className={`${s.btn} ${s.btnSmall}`} disabled={mine.length >= MAX_ACCEPTED_REQUESTS} onClick={() => act({ type: "acceptRequest", uid: request.uid })} type="button">
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className={s.card}>
          <h3 className={s.cardTitle}>
            Accepted ({mine.length}/{MAX_ACCEPTED_REQUESTS})
          </h3>
          <div className={s.list}>
            {mine.map((request) => {
              const ready = requestReady(state, request);
              return (
                <div className={s.row} key={request.uid}>
                  <div className={s.rowMain}>
                    <div className={s.rowTitle}>{requestTitle(request)}</div>
                    <div className={s.muted}>
                      {request.kind === "hunt" ? `${request.progress}/${request.amount} defeated · ` : request.kind === "explore" ? `deepest floor ${state.stats.deepest} · ` : `have ${count(state, request.target)}/${request.amount} · `}
                      {request.gold} G + {request.gp} GP
                    </div>
                  </div>
                  <button className={`${s.btn} ${s.btnSmall}`} disabled={!ready} onClick={() => act({ type: "turnIn", uid: request.uid })} type="button">
                    Turn in
                  </button>
                  <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "abandonRequest", uid: request.uid })} title="Abandon" type="button">
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function BlessingPanel({ state, act, onClose }: { state: RestiaState; act: Act; onClose: () => void }) {
  const used = state.blessingDay === state.day;
  return (
    <Panel onClose={onClose} title={`Weaver's Shrine — Audience ${state.faith}`}>
      <p className={s.muted}>Audience gathers every night from the townsfolk and your companions. Peri grants one favour a day.</p>
      <div className={s.list}>
        {BLESSINGS.map((blessing) => {
          const cost = blessingCost(state, blessing.id);
          return (
            <div className={s.row} key={blessing.id}>
              <div className={s.rowMain}>
                <div className={s.rowTitle}>{blessing.name}</div>
                <div className={s.muted}>{blessing.desc}</div>
              </div>
              <b>{cost} Audience</b>
              <button className={`${s.btn} ${s.btnSmall}`} disabled={used || state.faith < cost} onClick={() => act({ type: "pray", blessing: blessing.id })} type="button">
                Pray
              </button>
            </div>
          );
        })}
      </div>
      {used ? <p className={s.muted}>{"You've already been blessed today."}</p> : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function BarnPanel({ state, act, onClose }: { state: RestiaState; act: Act; onClose: () => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const limit = activeLimit(state);
  return (
    <Panel onClose={onClose} title={`Monster Barn — ${state.pets.length}/${barnCapacity(state)}`} wide>
      {state.pets.length ? null : <p className={s.muted}>No monsters yet. Weaken a monster in battle, stand next to it and use Befriend (a Monster Treat helps).</p>}
      <div className={s.list}>
        {state.pets.map((pet) => {
          const def = MONSTERS[pet.species]!;
          const stats = petStats(pet);
          const id = `pet:${pet.uid}`;
          const inParty = state.active.includes(id);
          return (
            <div className={s.row} key={pet.uid}>
              <SpriteStill height={56} slug={def.sprite} />
              <div className={s.rowMain}>
                <div className={s.rowTitle}>
                  {pet.name} · Lv {pet.level}
                </div>
                <div className={s.muted}>
                  HP {pet.hp}/{stats.maxHp} · ATK {stats.atk} · DEF {stats.def} · Job: {def.farmJob ?? "none"}
                  {def.produce ? ` (${itemDef(def.produce).name})` : ""}
                </div>
              </div>
              {def.farmJob ? (
                <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "petJob", uid: pet.uid, on: !pet.farmJob })} type="button">
                  {pet.farmJob ? "Working ✓" : "Resting"}
                </button>
              ) : null}
              <button
                className={`${s.btnGhost} ${s.btnSmall}`}
                disabled={!inParty && state.active.length >= limit}
                onClick={() => act({ type: "setActive", active: inParty ? state.active.filter((entry) => entry !== id) : [...state.active, id] })}
                type="button"
              >
                {inParty ? "Leave party" : "Join party"}
              </button>
              {confirm === pet.uid ? (
                <button className={`${s.btnDanger} ${s.btnSmall}`} onClick={() => act({ type: "releasePet", uid: pet.uid })} type="button">
                  Really release?
                </button>
              ) : (
                <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => setConfirm(pet.uid)} type="button">
                  Release
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function BoardPanel({ state, act, onClose }: { state: RestiaState; act: Act; onClose: () => void }) {
  const project = state.town.project;
  return (
    <Panel onClose={onClose} title={`Outpost Board — ${townRank(state)} (${townScore(state)})`} wide>
      {project ? (
        <div className={s.card} style={{ marginBottom: 10 }}>
          🔨 Building <b>{BUILDINGS[project.id].name}</b> (level {project.level}) — {project.daysLeft} day(s) left. One project at a time.
        </div>
      ) : (
        <p className={s.muted}>Pay gold and materials; builders finish overnight. Each building unlocks new people, shops and systems.</p>
      )}
      <div className={s.list}>
        {BUILDING_ORDER.map((id) => {
          const def = BUILDINGS[id];
          const level = state.town.levels[id];
          const next = nextLevelInfo(state, id);
          const done = level >= maxLevel(id);
          const requirement = next?.requires && !check(state, next.requires) ? next.requiresText ?? "more progress" : null;
          const hasMaterials = next ? Object.entries(next.items).every(([item, n]) => count(state, item) >= n) : false;
          return (
            <div className={s.row} key={id}>
              <div className={s.rowMain}>
                <div className={s.rowTitle}>
                  {def.name} <span className={s.tag}>Lv {level}</span>
                </div>
                <div className={s.muted}>{def.levels.find((entry) => entry.level === level)?.effect}</div>
                {next ? (
                  <div className={s.muted}>
                    Next: {next.effect}
                    <br />
                    Cost: <span className={state.gold >= next.gold ? undefined : s.bad}>{next.gold} G</span>
                    {Object.entries(next.items).map(([item, n]) => (
                      <span className={count(state, item) >= n ? undefined : s.bad} key={item}>
                        {" "}
                        · {itemDef(item).name} {count(state, item)}/{n}
                      </span>
                    ))}{" "}
                    · {next.days} day(s)
                    {requirement ? <span className={s.bad}> · Requires: {requirement}</span> : null}
                  </div>
                ) : null}
              </div>
              {done ? (
                <span className={s.good}>Complete</span>
              ) : (
                <button
                  className={`${s.btn} ${s.btnSmall}`}
                  disabled={!!project || !!requirement || !next || state.gold < next.gold || !hasMaterials}
                  onClick={() => act({ type: "build", building: id })}
                  type="button"
                >
                  {level === 0 ? "Build" : "Upgrade"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function DungeonPanel({ state, act, onClose }: { state: RestiaState; act: Act; onClose: () => void }) {
  if (!state.flags.catacombsOpen) {
    return (
      <Panel onClose={onClose} title="A dark cave">
        <p>Cold air breathes out of the old stone doorway. The Guild has sealed it: only Rank E adventurers may enter the Old Temple Ruins.</p>
      </Panel>
    );
  }
  return (
    <Panel onClose={onClose} title="The Old Temple Ruins">
      <p className={s.muted}>Deepest floor reached: {state.stats.deepest || "—"}. After each guardian you can start from the next floor.</p>
      <div className={s.list}>
        {availableStarts(state).map((floor) => (
          <div className={s.row} key={floor}>
            <div className={s.rowMain}>
              <div className={s.rowTitle}>Floor {floor}</div>
              <div className={s.muted}>{themeForFloor(floor).name}</div>
            </div>
            <button className={`${s.btn} ${s.btnSmall}`} onClick={() => act({ type: "enterDungeon", floor })} type="button">
              Descend
            </button>
          </div>
        ))}
      </div>
      <p className={s.muted}>Tip: bring potions and a Return Scroll. Leaving by the stairs up is always safe.</p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function GiftPanel({ state, act, npc, onClose }: { state: RestiaState; act: Act; npc: NpcId; onClose: () => void }) {
  const items = Object.keys(state.inventory);
  const rel = state.social[npc];
  const given = rel.giftDay === state.day;
  return (
    <Panel onClose={onClose} title={`Give ${NPCS[npc].name} a gift`}>
      <p className={s.muted}>
        {given ? "You've already given a gift today." : `One gift a day, two a week (${rel.giftWeek === Math.floor((state.day - 1) / 7) ? rel.giftsWeek : 0}/2 this week). Birthdays count five times.`}
        {NPCS[npc].romance ? " A Star Charm at 8 hearts is a confession; an Eternal Ring at 10 hearts is a proposal." : ""}
      </p>
      <div className={s.grid}>
        {items.map((id) => (
          <button
            className={s.slot}
            disabled={given && id !== "dawnCharm" && id !== "eternalRing"}
            key={id}
            onClick={() => {
              act({ type: "gift", npc, item: id });
              onClose();
            }}
            title={itemDef(id).name}
            type="button"
          >
            <ItemIcon id={id} size={40} />
            <span className={s.slotCount}>{count(state, id)}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function SavePanel({ state, onClose, onQuit, toast }: { state: RestiaState; onClose: () => void; onQuit: () => void; toast: (text: string, tone?: string) => void }) {
  const [saves, setSaves] = useState(() => listSaves());
  const save = (slot: SlotId) => {
    try {
      saveGame(state, slot);
      setSaves(listSaves());
      toast(`Saved to slot ${slot}.`, "good");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed.", "bad");
    }
  };
  const download = () => {
    const blob = new Blob([exportSave(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `restia-day${state.day}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Panel onClose={onClose} title="Save Game">
      <p className={s.muted}>Saves stay in this browser. Export a file to move your game to another device.</p>
      <div className={s.list}>
        {SLOTS.filter((slot) => slot !== "auto").map((slot) => {
          const meta = saves[slot];
          return (
            <div className={s.row} key={slot}>
              <div className={s.rowMain}>
                <div className={s.rowTitle}>Slot {slot}</div>
                <div className={s.muted}>{meta ? `${meta.date} · ${meta.place} · Lv ${meta.level} · ${meta.gold} G` : "Empty"}</div>
              </div>
              <button className={`${s.btn} ${s.btnSmall}`} disabled={!!state.battle} onClick={() => save(slot)} type="button">
                Save here
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className={s.btnGhost} onClick={download} type="button">
          Export save file
        </button>
        <button className={s.btnDanger} onClick={onQuit} type="button">
          Quit to title
        </button>
      </div>
    </Panel>
  );
}

export function characterName(id: string): string {
  return id in CHARACTERS ? CHARACTERS[id as keyof typeof CHARACTERS].name : id;
}
