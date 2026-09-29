"use client";

import { useState, useSyncExternalStore } from "react";
import type { CharId, DispatchResult, NpcId, RestiaAction, RestiaState } from "../engine/types";
import { CHARACTERS, expToNext } from "../data/characters";
import { ITEMS, itemDef } from "../data/items";
import { MISSIONS, PERKS, QUESTS, RANK_GP, POINTS_PER_HEART } from "../data/progression";
import { NPCS, NPC_IDS } from "../data/npcs";
import { MONSTERS } from "../data/monsters";
import { SKILLS } from "../data/skills";
import { BUILDINGS, BUILDING_ORDER } from "../data/buildings";
import { activeLimit, canEquip, hearts, memberPassives, memberSkills, memberStats, petStats } from "../engine/party";
import { jobLock } from "../engine/jobs";
import { JOBS, JOB_EXP, JOB_IDS, JOB_MAX } from "../data/jobs";
import { PASSIVES } from "../data/passives";
import { check } from "../engine/conditions";
import { requestTitle, nextRank } from "../engine/quests";
import { npcWhere } from "../engine/social";
import { skillLevel } from "../engine/farm";
import { townRank, townScore, dailyFaith } from "../engine/town";
import { count, formatTime } from "../engine/core";
import { ZONES } from "../data/zones";
import { A, TACHIE } from "./assets";
import { ItemIcon, SpriteStill } from "./sprites";
import { audioSettings, setAudioSettings, subscribeAudio } from "./audio";
import { Panel } from "./panels-station";
import s from "./restia.module.css";

type Act = (action: RestiaAction) => DispatchResult;
export type MenuTab = "bag" | "party" | "quests" | "friends" | "town" | "system" | "options";

const TABS: { id: MenuTab; label: string }[] = [
  { id: "bag", label: "Bag" },
  { id: "party", label: "Party" },
  { id: "quests", label: "Quests" },
  { id: "friends", label: "Friends" },
  { id: "town", label: "Town" },
  { id: "system", label: "Jester" },
  { id: "options", label: "Options" }
];

export function MenuPanel({ state, act, tab, setTab, onClose, onSave }: { state: RestiaState; act: Act; tab: MenuTab; setTab: (tab: MenuTab) => void; onClose: () => void; onSave: () => void }) {
  return (
    <Panel
      onClose={onClose}
      tabs={
        <div className={s.tabs}>
          {TABS.map((entry) => (
            <button className={tab === entry.id ? s.tabActive : s.tab} key={entry.id} onClick={() => setTab(entry.id)} type="button">
              {entry.label}
            </button>
          ))}
        </div>
      }
      title="Menu"
      wide
    >
      {tab === "bag" ? <BagTab act={act} state={state} /> : null}
      {tab === "party" ? <PartyTab act={act} state={state} /> : null}
      {tab === "quests" ? <QuestsTab state={state} /> : null}
      {tab === "friends" ? <FriendsTab state={state} /> : null}
      {tab === "town" ? <TownTab state={state} /> : null}
      {tab === "system" ? <SystemTab act={act} state={state} /> : null}
      {tab === "options" ? <OptionsTab onSave={onSave} /> : null}
    </Panel>
  );
}

function targetsFor(state: RestiaState): { id: string; name: string; hp: number; maxHp: number; mp: number; maxMp: number }[] {
  const out: { id: string; name: string; hp: number; maxHp: number; mp: number; maxMp: number }[] = (Object.keys(state.members) as CharId[]).map((id) => {
    const stats = memberStats(state, id);
    const member = state.members[id]!;
    return { id, name: CHARACTERS[id].name, hp: member.hp, maxHp: stats.maxHp, mp: member.mp, maxMp: stats.maxMp };
  });
  for (const pet of state.pets) {
    const stats = petStats(pet);
    out.push({ id: `pet:${pet.uid}`, name: pet.name, hp: pet.hp, maxHp: stats.maxHp, mp: pet.mp, maxMp: stats.maxMp });
  }
  return out;
}

function BagTab({ state, act }: { state: RestiaState; act: Act }) {
  const [selected, setSelected] = useState<string | null>(null);
  const items = Object.keys(state.inventory).sort((a, b) => (ITEMS[a]!.category + a).localeCompare(ITEMS[b]!.category + b));
  const def = selected && state.inventory[selected] ? itemDef(selected) : null;
  const use = def?.use;
  const usable = !!use && !use.bomb && !use.escape && !use.fertilizer && !use.treat;
  const needsTarget = !!use && (!!use.hp || !!use.hpPct || !!use.mp || !!use.mpPct || !!use.revivePct);
  return (
    <div className={s.columns}>
      <div>
        {items.length ? null : <div className={s.muted}>Your bag is empty.</div>}
        <div className={s.grid}>
          {items.map((id) => (
            <button className={selected === id ? s.slotSelected : s.slot} key={id} onClick={() => setSelected(id)} title={itemDef(id).name} type="button">
              <ItemIcon id={id} size={40} />
              <span className={s.slotCount}>{count(state, id)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={s.card}>
        {def && selected ? (
          <>
            <div className={s.personRow}>
              <ItemIcon id={selected} size={56} />
              <div>
                <h3 className={s.cardTitle}>{def.name}</h3>
                <div className={s.muted}>
                  {def.category} · worth {def.price} G · have {count(state, selected)}
                </div>
              </div>
            </div>
            <p>{def.desc}</p>
            {def.equip ? (
              <div className={s.muted}>
                {Object.entries(def.equip.stats)
                  .map(([key, value]) => `${key.toUpperCase()} ${value! > 0 ? "+" : ""}${value}`)
                  .join(" · ")}
                <br />
                Equip it from the Party tab.
              </div>
            ) : null}
            {usable && !needsTarget ? (
              <button className={s.btn} onClick={() => act({ type: "useItem", item: selected, target: "bin" })} type="button">
                Use / Eat
              </button>
            ) : null}
            {usable && needsTarget ? (
              <div className={s.list}>
                {targetsFor(state).map((target) => (
                  <button className={`${s.btnGhost} ${s.btnSmall}`} key={target.id} onClick={() => act({ type: "useItem", item: selected, target: target.id })} type="button">
                    Use on {target.name} ({target.hp}/{target.maxHp} HP, {target.mp}/{target.maxMp} MP)
                  </button>
                ))}
              </div>
            ) : null}
            {use?.fertilizer ? <div className={s.muted}>Select it on the farm hotbar (7) and click tilled soil.</div> : null}
            {def.sprinkler ? <div className={s.muted}>Select it on the farm hotbar (8) and click an untilled, cleared field plot. Click a placed sprinkler by hand to pick it up.</div> : null}
            {use?.bomb || use?.escape ? <div className={s.muted}>Use it from the battle Item menu.</div> : null}
          </>
        ) : (
          <div className={s.muted}>Select an item to see what it does.</div>
        )}
      </div>
    </div>
  );
}

function PartyTab({ state, act }: { state: RestiaState; act: Act }) {
  const ids = Object.keys(state.members) as CharId[];
  const [selected, setSelected] = useState<CharId>("bin");
  const [slot, setSlot] = useState<"weapon" | "armor" | "accessory" | null>(null);
  const member = state.members[selected];
  const limit = activeLimit(state);
  if (!member) return null;
  const stats = memberStats(state, selected);
  const skills = memberSkills(state, selected);
  const options = slot ? Object.keys(state.inventory).filter((id) => ITEMS[id]?.equip?.slot === slot && canEquip(selected, id)) : [];
  const inParty = state.active.includes(selected);
  return (
    <div className={s.columns}>
      <div className={s.list} style={{ alignContent: "start" }}>
        {ids.map((id) => {
          const m = state.members[id]!;
          const st = memberStats(state, id);
          return (
            <button className={s.slotCard} key={id} onClick={() => setSelected(id)} style={{ borderColor: id === selected ? "#2f7fd0" : undefined }} type="button">
              <span className={s.portrait} style={{ backgroundImage: TACHIE[id] ? `url(${A(TACHIE[id]!)})` : undefined }} />
              <span style={{ flex: 1 }}>
                <b>{CHARACTERS[id].name}</b> <span className={s.muted}>Lv {m.level}</span>
                <br />
                <span className={s.muted}>
                  HP {m.hp}/{st.maxHp} · MP {m.mp}/{st.maxMp}
                </span>
              </span>
              {state.active.includes(id) ? <span className={s.tag}>In party</span> : null}
            </button>
          );
        })}
        <div className={s.muted}>
          Party: {state.active.length}/{limit}. Monsters join from the Barn.
        </div>
      </div>
      <div className={s.card}>
        <h3 className={s.cardTitle}>
          {CHARACTERS[selected].name} — {CHARACTERS[selected].title}
        </h3>
        <div className={s.muted}>
          Lv {member.level} · EXP {member.exp}/{expToNext(member.level)} · Move {CHARACTERS[selected].move} · Range {CHARACTERS[selected].range}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, margin: "8px 0" }}>
          {(["maxHp", "maxMp", "atk", "def", "mag", "res", "spd", "luk"] as const).map((key) => (
            <span className={s.tag} key={key}>
              {key.replace("max", "").toUpperCase()} {stats[key]}
            </span>
          ))}
        </div>
        <div className={s.list}>
          {(["weapon", "armor", "accessory"] as const).map((entry) => (
            <div className={s.row} key={entry}>
              {member.equip[entry] ? <ItemIcon id={member.equip[entry]!} size={32} /> : <span style={{ width: 32 }} />}
              <div className={s.rowMain}>
                <div className={s.muted}>{entry}</div>
                <div>{member.equip[entry] ? itemDef(member.equip[entry]!).name : "—"}</div>
              </div>
              <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => setSlot(slot === entry ? null : entry)} type="button">
                Change
              </button>
              {member.equip[entry] ? (
                <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => act({ type: "equip", member: selected, item: null, slot: entry })} type="button">
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {slot ? (
          <div className={s.card} style={{ marginTop: 6 }}>
            {options.length ? null : <div className={s.muted}>No usable {slot} in your bag.</div>}
            {options.map((id) => (
              <button
                className={`${s.btnGhost} ${s.btnSmall}`}
                key={id}
                onClick={() => {
                  act({ type: "equip", member: selected, item: id, slot });
                  setSlot(null);
                }}
                style={{ margin: 2 }}
                type="button"
              >
                {itemDef(id).name}
              </button>
            ))}
          </div>
        ) : null}
        <JobSection act={act} member={selected} state={state} />
        <h4 className={s.cardTitle} style={{ marginTop: 10 }}>
          Skills
        </h4>
        <div className={s.list}>
          {skills.map((id) => {
            const skill = SKILLS[id]!;
            return (
              <div className={s.row} key={id}>
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>
                    {skill.name} <span className={s.muted}>{skill.ap ?? 2} AP · {skill.mp} MP</span>
                  </div>
                  <div className={s.muted}>{skill.desc}</div>
                </div>
                {skill.field ? <FieldSkill act={act} caster={selected} skill={id} state={state} /> : null}
              </div>
            );
          })}
        </div>
        <h4 className={s.cardTitle} style={{ marginTop: 10 }}>
          Passives
        </h4>
        <div className={s.list}>
          {memberPassives(state, selected).map((id) => (
            <div className={s.muted} key={id}>
              <b style={{ color: "inherit" }}>{PASSIVES[id]?.name ?? id}</b> — {PASSIVES[id]?.desc}
            </div>
          ))}
        </div>
        {selected !== "bin" ? (
          <button
            className={s.btnGhost}
            disabled={!inParty && state.active.length >= limit}
            onClick={() => act({ type: "setActive", active: inParty ? state.active.filter((entry) => entry !== selected) : [...state.active, selected] })}
            style={{ marginTop: 8 }}
            type="button"
          >
            {inParty ? "Leave the party" : "Join the party"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Current job, its progress, and every job this member could switch to. */
function JobSection({ state, act, member: id }: { state: RestiaState; act: Act; member: CharId }) {
  const member = state.members[id]!;
  const [open, setOpen] = useState(false);
  const job = JOBS[member.job]!;
  const progress = member.jobs[member.job] ?? { level: 1, exp: 0 };
  const next = progress.level < JOB_MAX ? job.levels[progress.level]! : null;
  const teach = (level: (typeof job.levels)[number]) => (level.skill ? `skill ${SKILLS[level.skill]?.name ?? level.skill}` : level.passive ? `passive ${PASSIVES[level.passive]?.name ?? level.passive}` : "stats");
  const blocked = state.battle ? "Not during a battle." : state.dungeon ? "Change jobs outside the ruins." : null;
  return (
    <div className={s.card} style={{ marginTop: 8 }}>
      <div className={s.row}>
        <div className={s.rowMain}>
          <div className={s.rowTitle}>
            Job: {job.name} Lv {progress.level}
            {progress.level < JOB_MAX ? <span className={s.muted}> · {progress.exp}/{JOB_EXP[progress.level - 1]} job EXP</span> : <span className={s.muted}> · mastered</span>}
          </div>
          <div className={s.muted}>
            {job.desc}
            {next ? ` Next level teaches the ${teach(next)}.` : ""}
          </div>
        </div>
        <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => setOpen(!open)} type="button">
          {open ? "Close" : "Jobs"}
        </button>
      </div>
      {open ? (
        <div className={s.list} style={{ marginTop: 6 }}>
          <div className={s.muted}>Job EXP only goes to the current job. Everything learned stays when you switch.{blocked ? ` ${blocked}` : ""}</div>
          {JOB_IDS.filter((jobId) => !JOBS[jobId]!.only || JOBS[jobId]!.only!.includes(id)).map((jobId) => {
            const def = JOBS[jobId]!;
            const have = member.jobs[jobId];
            const lock = jobLock(member, jobId);
            return (
              <div className={s.row} key={jobId}>
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>
                    {def.name} <span className={s.muted}>{have ? `Lv ${have.level}` : "new"}{def.tier === 2 ? " · advanced" : ""}</span>
                  </div>
                  <div className={s.muted}>
                    {def.levels.map((level, index) => `${index + 1}: ${teach(level)}`).join(" · ")}
                  </div>
                  {lock ? <div className={s.muted}>{lock}</div> : null}
                </div>
                <button className={`${s.btn} ${s.btnSmall}`} disabled={!!lock || !!blocked || member.job === jobId} onClick={() => act({ type: "setJob", member: id, job: jobId })} type="button">
                  {member.job === jobId ? "Current" : "Become"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FieldSkill({ state, act, caster, skill }: { state: RestiaState; act: Act; caster: CharId; skill: string }) {
  const def = SKILLS[skill]!;
  if (def.target === "allAllies") {
    return (
      <button className={`${s.btn} ${s.btnSmall}`} onClick={() => act({ type: "fieldSkill", caster, skill, target: "bin" })} type="button">
        Use
      </button>
    );
  }
  return (
    <select
      className={s.btnGhost}
      onChange={(event) => {
        if (event.target.value) act({ type: "fieldSkill", caster, skill, target: event.target.value });
        event.target.value = "";
      }}
      value=""
    >
      <option value="">Use on…</option>
      {targetsFor(state).map((target) => (
        <option key={target.id} value={target.id}>
          {target.name} ({target.hp}/{target.maxHp})
        </option>
      ))}
    </select>
  );
}

function QuestsTab({ state }: { state: RestiaState }) {
  const next = nextRank(state);
  return (
    <div className={s.columns}>
      <div className={s.list}>
        <h3 className={s.cardTitle}>Story</h3>
        {state.quests.active.map((id) => {
          const quest = QUESTS[id]!;
          return (
            <div className={s.card} key={id}>
              <div className={s.rowTitle}>{quest.title}</div>
              <div className={s.muted}>{quest.desc}</div>
              {quest.goals.map((goal) => (
                <div className={check(state, goal.cond) ? s.good : undefined} key={goal.text}>
                  {check(state, goal.cond) ? "✔" : "○"} {goal.text}
                </div>
              ))}
            </div>
          );
        })}
        {state.quests.active.length ? null : <div className={s.muted}>No open story quests.</div>}
        {state.quests.done.length ? <div className={s.muted}>Completed: {state.quests.done.map((id) => QUESTS[id]?.title).join(", ")}</div> : null}
      </div>
      <div className={s.list}>
        <h3 className={s.cardTitle}>Jester Bits (today)</h3>
        {state.missions.list.length ? null : <div className={s.muted}>Get re-registered at the Guild to receive daily Jester Bits.</div>}
        {state.missions.list.map((mission) => {
          const template = MISSIONS.find((entry) => entry.id === mission.id)!;
          return (
            <div className={s.row} key={mission.id}>
              <div className={s.rowMain}>
                <span className={s.system}>{template.text.replace("{n}", String(mission.target))}</span>
                <div className={s.muted}>
                  {mission.progress}/{mission.target} · +{mission.ap} JP
                </div>
              </div>
              {mission.done ? <span className={s.good}>Done</span> : null}
            </div>
          );
        })}
        <h3 className={s.cardTitle}>Guild</h3>
        <div className={s.muted}>
          Rank {state.guild.rank} · {state.guild.gp} GP{next ? ` · next rank at ${RANK_GP[next]} GP` : ""}
        </div>
        {state.requests
          .filter((request) => request.accepted)
          .map((request) => (
            <div className={s.row} key={request.uid}>
              {requestTitle(request)}
            </div>
          ))}
      </div>
    </div>
  );
}

function whereText(state: RestiaState, npc: NpcId): string {
  const where = npcWhere(state, npc);
  if (!where) return "Away";
  if ("building" in where) return BUILDINGS[where.building].name;
  return ZONES[where.zone].name;
}

function Hearts({ value, cap }: { value: number; cap: number }) {
  return (
    <span className={s.hearts} title={`${value} hearts`}>
      {Array.from({ length: cap }, (_, index) => (
        <span className={index < value ? s.heartFull : undefined} key={index}>
          ♥
        </span>
      ))}
    </span>
  );
}

function FriendsTab({ state }: { state: RestiaState }) {
  const met = NPC_IDS.filter((npc) => state.social[npc].met);
  return (
    <div className={s.list}>
      {met.length ? null : <div className={s.muted}>{"You haven't met anyone yet."}</div>}
      {met.map((npc) => {
        const def = NPCS[npc];
        const rel = state.social[npc];
        const value = hearts(state, npc);
        return (
          <div className={s.row} key={npc}>
            <span className={s.portrait} style={{ backgroundImage: TACHIE[npc] ? `url(${A(TACHIE[npc]!)})` : undefined }} />
            <div className={s.rowMain}>
              <div className={s.rowTitle}>
                {def.name} <span className={s.muted}>{def.title}</span> {rel.status !== "none" ? <span className={s.tag}>{rel.status === "married" ? "💍 Spouse" : "💕 Dating"}</span> : null}
              </div>
              <Hearts cap={10} value={value} />{" "}
              <span className={s.muted}>
                {rel.points % POINTS_PER_HEART}/{POINTS_PER_HEART} · Birthday: {def.birthday.season} {def.birthday.day} · Now: {whereText(state, npc)}
                {rel.talkedDay === state.day ? " · talked today" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TownTab({ state }: { state: RestiaState }) {
  const residents = Object.keys(state.members).length;
  return (
    <div className={s.columns}>
      <div className={s.card}>
        <h3 className={s.cardTitle}>
          Frostbitten — {townRank(state)} (score {townScore(state)})
        </h3>
        <div className={s.muted}>
          Companions: {residents} · Monsters: {state.pets.length} · Audience: {state.faith} (+{dailyFaith(state)}/night)
        </div>
        <div className={s.list} style={{ marginTop: 8 }}>
          {BUILDING_ORDER.map((id) => (
            <div className={s.row} key={id}>
              <div className={s.rowMain}>{BUILDINGS[id].name}</div>
              <span className={s.tag}>Lv {state.town.levels[id]}</span>
            </div>
          ))}
        </div>
        {state.town.project ? (
          <p>
            🔨 {BUILDINGS[state.town.project.id].name} ready in {state.town.project.daysLeft} day(s).
          </p>
        ) : null}
        <p className={s.muted}>Build and upgrade at the Outpost Board in the Frostbitten square.</p>
      </div>
      <div className={s.card}>
        <h3 className={s.cardTitle}>The Party</h3>
        {(["bin", "bowy", "mitia", "garr", "hilda", "senna"] as CharId[]).map((id) => (
          <div className={s.personRow} key={id} style={{ marginBottom: 6 }}>
            <span className={s.portrait} style={{ backgroundImage: TACHIE[id] ? `url(${A(TACHIE[id]!)})` : undefined, filter: state.members[id] ? undefined : "brightness(0)" }} />
            <span>{state.members[id] ? `${CHARACTERS[id].name} — ${CHARACTERS[id].title}` : "??? — not yet recruited"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemTab({ state, act }: { state: RestiaState; act: Act }) {
  const species = Object.keys(state.bestiary);
  return (
    <div className={s.columns}>
      <div className={s.card}>
        <h3 className={s.cardTitle}>
          <span className={s.system}>Cosmic Jester Shop</span> — {state.admin.ap} JP
        </h3>
        <div className={s.muted}>Earn Jester Points from daily Jester Bits, quests and story milestones.</div>
        <div className={s.list} style={{ marginTop: 8 }}>
          {PERKS.map((perk) => {
            const owned = state.admin.perks.includes(perk.id);
            return (
              <div className={s.row} key={perk.id}>
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>{perk.name}</div>
                  <div className={s.muted}>{perk.desc}</div>
                </div>
                {owned ? (
                  <span className={s.good}>Owned</span>
                ) : (
                  <button className={`${s.btn} ${s.btnSmall}`} disabled={state.admin.ap < perk.cost || (!!perk.requires && !state.admin.perks.includes(perk.requires))} onClick={() => act({ type: "buyPerk", perk: perk.id })} type="button">
                    {perk.cost} JP
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className={s.card}>
          <h3 className={s.cardTitle}>Life skills</h3>
          {Object.entries(state.skills).map(([skill, xp]) => (
            <div key={skill}>
              {skill[0]!.toUpperCase() + skill.slice(1)}: Lv {skillLevel(xp)} <span className={s.muted}>({xp} xp)</span>
            </div>
          ))}
          <div className={s.muted}>Played {Math.floor(state.playSeconds / 3600)}h {Math.floor((state.playSeconds % 3600) / 60)}m · now {formatTime(state.minute)}</div>
        </div>
        <div className={s.card} style={{ marginTop: 10 }}>
          <h3 className={s.cardTitle}>Bestiary ({species.length})</h3>
          <div className={s.list}>
            {species.map((id) => {
              const def = MONSTERS[id];
              const entry = state.bestiary[id]!;
              if (!def) return null;
              const weak = Object.entries(def.resist)
                .filter(([, mult]) => (mult ?? 1) > 1)
                .map(([element]) => element);
              const resist = Object.entries(def.resist)
                .filter(([, mult]) => (mult ?? 1) < 1)
                .map(([element]) => element);
              return (
                <div className={s.row} key={id}>
                  <SpriteStill height={48} slug={def.sprite} />
                  <div className={s.rowMain}>
                    <div className={s.rowTitle}>{def.name}</div>
                    <div className={s.muted}>
                      Seen {entry.seen} · Defeated {entry.defeated}
                      {entry.analyzed ? ` · Weak: ${weak.join(", ") || "—"} · Resists: ${resist.join(", ") || "—"}` : " · Analyze it to learn its weaknesses"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionsTab({ onSave }: { onSave: () => void }) {
  const settings = useSyncExternalStore(subscribeAudio, audioSettings, audioSettings);
  return (
    <div className={s.columns}>
      <div className={s.card}>
        <h3 className={s.cardTitle}>Sound</h3>
        <label style={{ display: "block" }}>
          Music {Math.round(settings.music * 100)}%
          <input max={1} min={0} onChange={(event) => setAudioSettings({ music: Number(event.target.value) })} step={0.05} style={{ width: "100%" }} type="range" value={settings.music} />
        </label>
        <label style={{ display: "block" }}>
          Effects {Math.round(settings.sfx * 100)}%
          <input max={1} min={0} onChange={(event) => setAudioSettings({ sfx: Number(event.target.value) })} step={0.05} style={{ width: "100%" }} type="range" value={settings.sfx} />
        </label>
        <label>
          <input checked={settings.muted} onChange={(event) => setAudioSettings({ muted: event.target.checked })} type="checkbox" /> Mute everything
        </label>
      </div>
      <div className={s.card}>
        <h3 className={s.cardTitle}>Controls</h3>
        <div className={s.muted}>
          Click / tap to walk and interact. Arrow keys or WASD move; E, Space or Enter interacts with what you face. On the farm: 1-5 tools, 6 seeds, 7 fertilizer, 8 sprinklers, 0 hand. Esc opens this menu.
        </div>
        <button className={s.btn} onClick={onSave} style={{ marginTop: 10 }} type="button">
          Save / Export / Quit…
        </button>
      </div>
    </div>
  );
}

export { ITEMS };
