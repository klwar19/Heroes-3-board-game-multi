"use client";

import type { BuildingId, DispatchResult, RestiaAction, RestiaState } from "../engine/types";
import { BUILDINGS } from "../data/buildings";
import { NPCS } from "../data/npcs";
import { npcsHere } from "../engine/social";
import { hearts } from "../engine/party";
import { formatTime } from "../engine/core";
import { A, TACHIE, backdrop } from "./assets";
import s from "./restia.module.css";

type Opener = (panel: { kind: string; [key: string]: unknown }) => void;

type Action = { label: string; run: () => void; primary?: boolean; hint?: string };

export function InteriorView({ state, act, open }: { state: RestiaState; act: (action: RestiaAction) => DispatchResult; open: Opener }) {
  const building = state.player.inside as BuildingId;
  const def = BUILDINGS[building];
  const people = npcsHere(state);
  const level = state.town.levels[building];
  const actions: Action[] = [];
  switch (building) {
    case "farmhouse":
      actions.push({ label: "Sleep (end the day)", primary: true, run: () => open({ kind: "sleep" }), hint: "Crops grow, the bin pays out, everyone heals, the game saves." });
      actions.push({ label: "Storage chest", run: () => open({ kind: "storage" }) });
      if (level >= 2) actions.push({ label: "Cook in the kitchen", run: () => open({ kind: "craft", station: "cooking" }) });
      else actions.push({ label: "Kitchen (expand Garr's Hut)", run: () => open({ kind: "info", text: "Expand Garr's Hut at the Outpost Board to get a kitchen of your own." }) });
      actions.push({ label: "Save game", run: () => open({ kind: "save" }) });
      break;
    case "guild":
      actions.push({ label: "Request board & rank", primary: true, run: () => open({ kind: "requests" }) });
      actions.push({ label: "Adventuring supplies", run: () => open({ kind: "shop", building }) });
      break;
    case "store":
      actions.push({ label: "Buy & sell", primary: true, run: () => open({ kind: "shop", building }) });
      break;
    case "smithy":
      actions.push({ label: "Forge (smelt, gear, tools)", primary: true, run: () => open({ kind: "craft", station: "forge" }) });
      actions.push({ label: "Buy equipment", run: () => open({ kind: "shop", building }) });
      break;
    case "atelier":
      actions.push({ label: "Alchemy", primary: true, run: () => open({ kind: "craft", station: "alchemy" }) });
      actions.push({ label: "Buy potions", run: () => open({ kind: "shop", building }) });
      break;
    case "inn":
      actions.push({ label: "Order food", primary: true, run: () => open({ kind: "shop", building }) });
      break;
    case "shrine":
      actions.push({ label: "Ask Peri for a favour", primary: true, run: () => open({ kind: "blessing" }) });
      break;
    case "barn":
      actions.push({ label: "Your monsters", primary: true, run: () => open({ kind: "barn" }) });
      break;
    default:
      break;
  }
  const cast = people.filter((npc) => TACHIE[npc]).slice(0, 2);
  return (
    <div className={s.interior} style={{ backgroundImage: `url(${backdrop(def.interior)})` }}>
      <div className={s.interiorCast}>
        {cast.map((npc) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={NPCS[npc].name} draggable={false} key={npc} src={A(TACHIE[npc]!)} />
        ))}
      </div>
      <div className={s.interiorPanel}>
        <h2 className={s.interiorTitle}>{def.name}</h2>
        <div className={s.muted}>
          {formatTime(state.minute)}
          {def.hours ? ` · open until ${formatTime(def.hours[1])}` : ""}
          {level > 0 ? ` · Lv ${level}` : ""}
        </div>
        {people.length ? (
          <div className={s.list}>
            {people.map((npc) => (
              <div className={s.row} key={npc}>
                <span className={s.portrait} style={{ backgroundImage: TACHIE[npc] ? `url(${A(TACHIE[npc]!)})` : undefined }} />
                <div className={s.rowMain}>
                  <div className={s.rowTitle}>{NPCS[npc].name}</div>
                  <div className={s.hearts}>
                    {Array.from({ length: 10 }, (_, index) => (
                      <span className={index < hearts(state, npc) ? s.heartFull : undefined} key={index}>
                        ♥
                      </span>
                    ))}
                  </div>
                </div>
                <button className={`${s.btn} ${s.btnSmall}`} onClick={() => act({ type: "talk", npc })} type="button">
                  {state.social[npc].talkedDay === state.day ? "Talk" : "💬 Talk"}
                </button>
                <button className={`${s.btnGhost} ${s.btnSmall}`} onClick={() => open({ kind: "gift", npc })} type="button">
                  Gift
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.muted}>Nobody else is here right now.</div>
        )}
        <div className={s.list}>
          {actions.map((action) => (
            <div key={action.label}>
              <button className={action.primary ? s.btn : s.btnGhost} onClick={action.run} style={{ width: "100%" }} type="button">
                {action.label}
              </button>
              {action.hint ? <div className={s.muted}>{action.hint}</div> : null}
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className={s.btnGhost} onClick={() => act({ type: "leave" })} type="button">
          ⟵ Leave
        </button>
      </div>
    </div>
  );
}
