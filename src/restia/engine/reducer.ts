import type { DispatchResult, RestiaAction, RestiaState } from "./types";
import { ActionError, Ctx, PASS_OUT, clamp, fail } from "./core";
import { newGame } from "./state";
import { equip } from "./party";
import { applyTool, plant, fertilize, harvest, refill } from "./farm";
import { enter, forage, leave, locationTriggers, step } from "./world";
import { gift, talk } from "./social";
import { abandonRequest, acceptRequest, checkQuests, rankExam, refreshMissions, refreshRequests, turnIn } from "./quests";
import { build, buy, buyPerk, craft, pray, retrieve, sell, ship, store, unship } from "./town";
import { morning, passOut, sleep, waitFor } from "./day";
import { consumeItem, fieldSkill, releasePet, setActive, setPetJob } from "./items";
import { dungeonInteract, dungeonStep, enterDungeon, leaveDungeon } from "./dungeon";
import {
  battleAttack,
  battleBefriend,
  battleDefend,
  battleEndTurn,
  battleFlee,
  battleItem,
  battleMove,
  battleRush,
  battleSkill,
  battleSprint,
  battleWait,
  finishBattle
} from "./battle";
import { aiTurn } from "./battle-ai";
import { setJob } from "./jobs";
import { sceneChoose, sceneNext, startQueuedScene } from "./scenes";

const BATTLE_ACTIONS = new Set(["bMove", "bAttack", "bSkill", "bItem", "bDefend", "bWait", "bBefriend", "bFlee", "bRush", "bEndTurn", "bSprint", "bAiTurn", "bFinish"]);
const DUNGEON_ACTIONS = new Set(["dStep", "dInteract", "leaveDungeon"]);
/** Menu actions that work anywhere outside battle (world, buildings or dungeon). */
const MENU_ACTIONS = new Set(["useItem", "fieldSkill", "equip", "setJob", "setActive", "buyPerk", "petJob", "releasePet"]);

export function createGame(seed: number): DispatchResult {
  const state = newGame(seed);
  const ctx = new Ctx();
  morning(state, ctx);
  startQueuedScene(state, ctx);
  return { state, events: ctx.events };
}

export function dispatch(state: RestiaState, action: RestiaAction): DispatchResult {
  const next = structuredClone(state);
  const ctx = new Ctx();
  try {
    route(next, action, ctx);
    settle(next, ctx);
    return { state: next, events: ctx.events };
  } catch (error) {
    if (error instanceof ActionError) return { state, events: [{ kind: "toast", text: error.message, tone: "bad" }] };
    throw error;
  }
}

function route(state: RestiaState, action: RestiaAction, ctx: Ctx): void {
  if (action.type === "tick") {
    state.playSeconds += clamp(Math.round(action.seconds), 0, 3600);
    return;
  }
  if (state.scene && action.type !== "sceneNext" && action.type !== "sceneChoose") fail("Finish the conversation first.");
  const battleAction = BATTLE_ACTIONS.has(action.type);
  if (state.battle && !battleAction && !state.scene) fail("You're in a battle!");
  if (!state.battle && battleAction) fail("No battle in progress.");
  if (state.dungeon && !battleAction && !DUNGEON_ACTIONS.has(action.type) && !MENU_ACTIONS.has(action.type) && !action.type.startsWith("scene")) {
    fail("You're in the dungeon. Take the stairs up or use a Return Scroll first.");
  }
  if (!state.dungeon && DUNGEON_ACTIONS.has(action.type)) fail("You're not in the dungeon.");

  switch (action.type) {
    case "step":
      return step(state, action.dir, ctx);
    case "enter":
      return enter(state, action.building);
    case "leave":
      return leave(state);
    case "tool":
      return applyTool(state, action.tool, action.x, action.y, ctx);
    case "plant":
      return plant(state, action.item, action.x, action.y, ctx);
    case "fertilize":
      return fertilize(state, action.item, action.x, action.y);
    case "harvest":
      return harvest(state, action.x, action.y, ctx);
    case "refill":
      return refill(state, ctx);
    case "ship":
      return ship(state, action.item, action.n);
    case "unship":
      return unship(state, action.item, action.n);
    case "forage":
      return forage(state, action.index, ctx);
    case "talk":
      return talk(state, action.npc, ctx);
    case "gift":
      return gift(state, action.npc, action.item, ctx);
    case "buy":
      return buy(state, action.item, action.n, ctx);
    case "sell":
      return sell(state, action.item, action.n, ctx);
    case "craft":
      return craft(state, action.recipe, action.n, ctx);
    case "build":
      return build(state, action.building, ctx);
    case "sleep":
      return sleep(state, ctx);
    case "wait":
      return waitFor(state, action.minutes, ctx);
    case "useItem":
      return consumeItem(state, action.item, action.target, ctx);
    case "fieldSkill":
      return fieldSkill(state, action.caster, action.skill, action.target, ctx);
    case "equip":
      return equip(state, action.member, action.item, action.slot);
    case "setJob":
      return setJob(state, action.member, action.job, ctx);
    case "setActive":
      return setActive(state, action.active);
    case "store":
      return store(state, action.item, action.n);
    case "retrieve":
      return retrieve(state, action.item, action.n);
    case "sceneNext":
      return sceneNext(state, ctx);
    case "sceneChoose":
      return sceneChoose(state, action.index, ctx);
    case "acceptRequest":
      return acceptRequest(state, action.uid, ctx);
    case "turnIn":
      return turnIn(state, action.uid, ctx);
    case "abandonRequest":
      return abandonRequest(state, action.uid, ctx);
    case "rankExam":
      return rankExam(state, ctx);
    case "buyPerk":
      return buyPerk(state, action.perk, ctx);
    case "pray":
      return pray(state, action.blessing, ctx);
    case "petJob":
      return setPetJob(state, action.uid, action.on);
    case "releasePet":
      return releasePet(state, action.uid, ctx);
    case "enterDungeon":
      return enterDungeon(state, action.floor, ctx);
    case "dStep":
      return dungeonStep(state, action.dir, ctx);
    case "dInteract":
      return dungeonInteract(state, ctx);
    case "leaveDungeon":
      return leaveDungeon(state, ctx);
    case "bMove":
      return battleMove(state, action.cell, ctx);
    case "bAttack":
      return battleAttack(state, action.target, ctx);
    case "bSkill":
      return battleSkill(state, action.skill, action.cell, ctx);
    case "bItem":
      return battleItem(state, action.item, action.cell, ctx);
    case "bDefend":
      return battleDefend(state, ctx);
    case "bWait":
      return battleWait(state, ctx);
    case "bBefriend":
      return battleBefriend(state, action.target, ctx);
    case "bFlee":
      return battleFlee(state, ctx);
    case "bRush":
      return battleRush(state, ctx);
    case "bEndTurn":
      return battleEndTurn(state, ctx);
    case "bSprint":
      return battleSprint(state, ctx);
    case "bAiTurn":
      return aiTurn(state, ctx);
    case "bFinish":
      return finishBattle(state, ctx);
  }
}

/** After every action: quests, boards, story triggers, the 2 AM collapse, queued scenes. */
function settle(state: RestiaState, ctx: Ctx): void {
  if (state.battle) return;
  checkQuests(state, ctx);
  refreshRequests(state, ctx);
  refreshMissions(state);
  if (!state.scene && state.minute >= PASS_OUT) passOut(state, ctx, "You collapsed from exhaustion after 2 AM. Someone carried you home.");
  startQueuedScene(state, ctx);
  locationTriggers(state, ctx);
}
