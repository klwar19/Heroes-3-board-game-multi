import type { Effect, RestiaState } from "./types";
import { Ctx, addItem, clamp, removeItem } from "./core";
import { maxStamina } from "./state";
import { healEveryone, recruit } from "./party";
import { addPoints } from "./social";
import { addGp, rankUp, startQuest } from "./quests";
import { startEventBattle } from "./battle";
import { itemDef } from "../data/items";

export function applyEffects(state: RestiaState, effects: Effect[], ctx: Ctx): void {
  for (const effect of effects) applyEffect(state, effect, ctx);
}

export function applyEffect(state: RestiaState, effect: Effect, ctx: Ctx): void {
  switch (effect.kind) {
    case "points":
      addPoints(state, effect.npc, effect.n, ctx);
      return;
    case "flag":
      state.flags[effect.key] = effect.value;
      return;
    case "item":
      if (effect.n > 0) {
        addItem(state, effect.id, effect.n);
        ctx.toast(`Received ${itemDef(effect.id).name} x${effect.n}`, "good");
      } else if (effect.n < 0) {
        removeItem(state, effect.id, -effect.n);
      }
      return;
    case "gold":
      state.gold = Math.max(0, state.gold + effect.n);
      if (effect.n > 0) ctx.toast(`+${effect.n} G`, "good");
      return;
    case "recruit":
      recruit(state, effect.id, ctx);
      return;
    case "quest":
      startQuest(state, effect.id, ctx);
      return;
    case "battle":
      startEventBattle(state, effect.encounter, ctx);
      return;
    case "time":
      state.minute += effect.minutes;
      return;
    case "faith":
      state.faith += effect.n;
      if (effect.n > 0) ctx.toast(`Faith +${effect.n}`, "system");
      return;
    case "relationship":
      state.social[effect.npc].status = effect.status;
      return;
    case "gp":
      addGp(state, effect.n, ctx);
      return;
    case "rankUp":
      rankUp(state, ctx);
      return;
    case "heal":
      healEveryone(state);
      return;
    case "meet":
      state.social[effect.npc].met = true;
      return;
    case "stamina":
      state.stamina = clamp(state.stamina + effect.n, 0, maxStamina(state));
      return;
    case "ap":
      state.admin.ap += effect.n;
      ctx.toast(`Admin Points +${effect.n}`, "system");
      return;
  }
}
