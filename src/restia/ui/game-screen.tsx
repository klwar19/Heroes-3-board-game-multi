"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BattleAnim, BuildingId, DaySummary, DispatchResult, NpcId, RestiaAction, RestiaEvent, RestiaState, Station } from "../engine/types";
import { dispatch } from "../engine/reducer";
import { SCENES } from "../engine/scenes";
import { saveGame } from "../engine/save";
import { formatTime, hashString } from "../engine/core";
import { themeForFloor } from "../data/dungeon";
import { ZONES } from "../data/zones";
import { NPCS } from "../data/npcs";
import { MONSTERS } from "../data/monsters";
import { playMusic, playSfx } from "./audio";
import { A } from "./assets";
import { atlasFor } from "./sprites";
import { DaySummaryModal, Hud, SayBox, ScenePlayer, Toasts, type Toast } from "./overlays";
import { WorldView } from "./world-view";
import { InteriorView } from "./interior-view";
import { BattleView } from "./battle-view";
import { DungeonView } from "./dungeon-view";
import { MenuPanel, type MenuTab } from "./panels-menu";
import {
  BarnPanel,
  BlessingPanel,
  BoardPanel,
  CraftPanel,
  DungeonPanel,
  GiftPanel,
  Panel,
  RequestsPanel,
  SavePanel,
  ShipPanel,
  ShopPanel,
  StoragePanel
} from "./panels-station";
import s from "./restia.module.css";

type PanelState = { kind: string; [key: string]: unknown };

function contextKey(state: RestiaState): string {
  return `${state.player.zone}|${state.player.inside}|${state.dungeon ? state.dungeon.floor : "-"}|${state.battle ? 1 : 0}`;
}

function musicFor(state: RestiaState, title: boolean): string {
  if (title) return "main-menu";
  const sceneMusic = state.scene ? SCENES[state.scene.id]?.music : undefined;
  if (sceneMusic && !state.battle) return sceneMusic;
  if (state.battle) {
    if (state.battle.boss) return "combat-03";
    return `battle-0${hashString(`${state.day}:${state.battle.units.map((unit) => unit.uid).join(",")}`) % 8}`;
  }
  if (state.dungeon) return themeForFloor(state.dungeon.floor).music;
  return ZONES[state.player.zone].music;
}

export function GameScreen({ initial, onQuit }: { initial: RestiaState; onQuit: () => void }) {
  const [state, setState] = useState(initial);
  const stateRef = useRef(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [say, setSay] = useState<{ npc: NpcId; text: string } | null>(null);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [menuTab, setMenuTab] = useState<MenuTab>("bag");
  const [animQueue, setAnimQueue] = useState<BattleAnim[][]>([]);
  const toastId = useRef(0);

  const pushToast = useCallback((text: string, tone = "info") => {
    const id = ++toastId.current;
    setToasts((current) => [...current.slice(-4), { id, text, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), tone === "bad" ? 3000 : 4000);
  }, []);

  const handleEvents = useCallback(
    (events: RestiaEvent[], next: RestiaState) => {
      for (const event of events) {
        switch (event.kind) {
          case "toast":
            pushToast(event.text, event.tone);
            if (event.tone === "system") playSfx("system");
            break;
          case "say":
            setSay({ npc: event.npc, text: event.text });
            break;
          case "levelUp":
            pushToast(`${event.who} reached level ${event.level}!`, "good");
            playSfx("good");
            break;
          case "hearts":
            pushToast(`♥ ${NPCS[event.npc].name}: ${event.hearts} heart${event.hearts === 1 ? "" : "s"}`, "love");
            break;
          case "dayEnd":
            setSummary(event.summary);
            try {
              saveGame(next, "auto");
            } catch (error) {
              pushToast(error instanceof Error ? error.message : "Auto-save failed.", "bad");
            }
            break;
          case "battle":
            if (event.anims.length) setAnimQueue((current) => [...current, event.anims]);
            break;
          default:
            break;
        }
      }
    },
    [pushToast]
  );

  const commit = useCallback(
    (result: DispatchResult) => {
      const before = stateRef.current;
      stateRef.current = result.state;
      setState(result.state);
      // A fresh battle never inherits animations from a previous one.
      if (!before.battle && result.state.battle) setAnimQueue([]);
      if (contextKey(before) !== contextKey(result.state)) {
        setPanel((current) => (current && current.kind !== "menu" && current.kind !== "save" ? null : current));
        if (result.state.battle) setPanel(null);
      }
      handleEvents(result.events, result.state);
      return result;
    },
    [handleEvents]
  );

  const act = useCallback((action: RestiaAction): DispatchResult => commit(dispatch(stateRef.current, action)), [commit]);

  const skipScene = useCallback(() => {
    let current = stateRef.current;
    const id = current.scene?.id;
    const events: RestiaEvent[] = [];
    let guard = 0;
    while (current.scene && current.scene.id === id && guard++ < 400) {
      const line = SCENES[current.scene.id]!.lines[current.scene.index];
      if (line && "choice" in line) break;
      const result = dispatch(current, { type: "sceneNext" });
      if (result.state === current) break;
      events.push(...result.events);
      current = result.state;
    }
    commit({ state: current, events });
  }, [commit]);

  // Play time.
  useEffect(() => {
    const timer = window.setInterval(() => act({ type: "tick", seconds: 30 }), 30000);
    return () => window.clearInterval(timer);
  }, [act]);

  // Warm the browser cache with the party's battle sprites so fights open without pop-in.
  const partyKey = state.active.join(",");
  useEffect(() => {
    for (const id of partyKey.split(",")) {
      const pet = id.startsWith("pet:") ? stateRef.current.pets.find((entry) => `pet:${entry.uid}` === id) : null;
      const atlas = atlasFor(pet ? MONSTERS[pet.species]?.sprite ?? "" : `restia-${id}`);
      if (atlas) new Image().src = A(atlas.image);
    }
  }, [partyKey]);

  // Music follows the situation.
  const track = musicFor(state, false);
  useEffect(() => {
    playMusic(track);
  }, [track]);

  // Your-turn chime in battle.
  const activeAlly = state.battle?.active?.startsWith("a-") ? state.battle.active : null;
  useEffect(() => {
    if (activeAlly) playSfx("turn");
  }, [activeAlly]);

  const locked = !!state.scene || !!say || !!summary || !!panel;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || state.scene || say || summary) return;
      if (panel) setPanel(null);
      else if (!state.battle) setPanel({ kind: "menu" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, say, state.battle, state.scene, summary]);

  const open = useCallback((next: PanelState) => setPanel(next), []);
  const openSave = useCallback(() => setPanel({ kind: "save" }), []);
  const close = useCallback(() => setPanel(null), []);

  const quit = useCallback(() => {
    if (!stateRef.current.battle) {
      try {
        saveGame(stateRef.current, "auto");
      } catch {
        // The title screen still works; the player was offered Export.
      }
    }
    onQuit();
  }, [onQuit]);

  let view;
  if (state.battle) {
    view = <BattleView act={act} onAnimsDone={() => setAnimQueue((current) => current.slice(1))} queue={animQueue} state={state} />;
  } else if (state.dungeon) {
    view = <DungeonView act={act} locked={locked} state={state} />;
  } else if (state.player.inside) {
    view = <InteriorView act={act} open={open} state={state} />;
  } else {
    view = <WorldView act={act} locked={locked} open={open} state={state} toast={(text) => pushToast(text, "info")} />;
  }

  return (
    <div className={s.root}>
      <Hud onClock={() => setPanel(state.battle || state.dungeon ? null : { kind: "wait" })} onMenu={() => setPanel(state.battle ? null : { kind: "menu" })} onSave={() => setPanel(state.battle ? null : { kind: "save" })} state={state} />
      <div className={s.stage}>
        {view}
        {state.scene ? <ScenePlayer onChoose={(index) => act({ type: "sceneChoose", index })} onNext={() => act({ type: "sceneNext" })} onSkip={skipScene} state={state} /> : null}
        {say && !state.scene ? <SayBox npc={say.npc} onClose={() => setSay(null)} text={say.text} /> : null}
        {summary && !state.scene ? <DaySummaryModal onClose={() => setSummary(null)} summary={summary} /> : null}
        {panel && !state.scene ? <PanelHost act={act} close={close} openSave={openSave} panel={panel} quit={quit} setTab={setMenuTab} state={state} tab={menuTab} toast={pushToast} /> : null}
        <Toasts toasts={toasts} />
      </div>
    </div>
  );
}

function PanelHost({
  panel,
  state,
  act,
  close,
  tab,
  setTab,
  openSave,
  quit,
  toast
}: {
  panel: PanelState;
  state: RestiaState;
  act: (action: RestiaAction) => DispatchResult;
  close: () => void;
  tab: MenuTab;
  setTab: (tab: MenuTab) => void;
  openSave: () => void;
  quit: () => void;
  toast: (text: string, tone?: string) => void;
}) {
  switch (panel.kind) {
    case "menu":
      return <MenuPanel act={act} onClose={close} onSave={openSave} setTab={setTab} state={state} tab={tab} />;
    case "shop":
      return <ShopPanel act={act} building={panel.building as BuildingId} onClose={close} state={state} />;
    case "craft":
      return <CraftPanel act={act} onClose={close} state={state} station={panel.station as Station} />;
    case "ship":
      return <ShipPanel act={act} onClose={close} state={state} />;
    case "storage":
      return <StoragePanel act={act} onClose={close} state={state} />;
    case "requests":
      return <RequestsPanel act={act} onClose={close} state={state} />;
    case "blessing":
      return <BlessingPanel act={act} onClose={close} state={state} />;
    case "barn":
      return <BarnPanel act={act} onClose={close} state={state} />;
    case "board":
      return <BoardPanel act={act} onClose={close} state={state} />;
    case "dungeon":
      return <DungeonPanel act={act} onClose={close} state={state} />;
    case "gift":
      return <GiftPanel act={act} npc={panel.npc as NpcId} onClose={close} state={state} />;
    case "save":
      return <SavePanel onClose={close} onQuit={quit} state={state} toast={toast} />;
    case "sleep":
      return (
        <Panel onClose={close} title="Go to sleep?">
          <p>The day ends: the shipping bin pays out, crops grow, construction advances, everyone recovers and the game auto-saves.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={s.btn}
              onClick={() => {
                close();
                act({ type: "sleep" });
              }}
              type="button"
            >
              Sleep
            </button>
            <button className={s.btnGhost} onClick={close} type="button">
              Not yet
            </button>
          </div>
        </Panel>
      );
    case "wait": {
      const options = [
        { label: "30 minutes", minutes: 30 },
        { label: "1 hour", minutes: 60 },
        { label: "3 hours", minutes: 180 },
        { label: "Until noon", minutes: 12 * 60 - state.minute },
        { label: "Until 6 PM", minutes: 18 * 60 - state.minute }
      ].filter((option) => option.minutes >= 10 && state.minute + option.minutes <= 24 * 60);
      return (
        <Panel onClose={close} title={`Pass time — it's ${formatTime(state.minute)}`}>
          <p className={s.muted}>Wait for a shop to open or for someone to arrive. Time also passes as you work, travel and fight.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {options.length ? null : <span className={s.muted}>{"It's late. Time to head home to bed."}</span>}
            {options.map((option) => (
              <button
                className={s.btnGhost}
                key={option.label}
                onClick={() => {
                  close();
                  act({ type: "wait", minutes: option.minutes });
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </Panel>
      );
    }
    case "info":
      return (
        <Panel onClose={close} title="Note">
          <p>{String(panel.text ?? "")}</p>
        </Panel>
      );
    default:
      return null;
  }
}
