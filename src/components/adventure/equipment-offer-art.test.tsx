// @vitest-environment jsdom
/**
 * "Buy 1 hero equipment" and every other equipment / commander-artifact offer
 * must show the item's PICTURE and its wired EFFECT (user report 2026-08-19:
 * the offers were bare text labels, so the buyer picked blind).
 *
 * jsdom cannot compute CSS — these pin the DOM contract: the offer button is a
 * .promptRewardCard tile carrying the item's art `img` plus a
 * .promptRewardDetail line with the wired summary/effect text. CONTROL: the
 * trailing Decline option stays a plain text button (no art, no detail).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PromptTray } from "./screen";
import { createAdventureGameState, getLegalActions, pumpAdventureQueues, type GameState } from "@/engine";
import { buildEquipmentGradePurchaseStep, buildEquipmentGradeRewardStep } from "@/engine/adventure";
import { getEquipmentDefinition, equipmentImage } from "@/data/anime/equipment";
import { COMMANDER_ARTIFACT_SPECS } from "@/data/wog/commander-artifacts";
import { cardLibrary } from "@/data/cards/library";

afterEach(cleanup);

function equipmentGame(seed: string): GameState {
  const state = createAdventureGameState({
    seed,
    rollFirstPlayer: false,
    anime: { enabled: true, equipment: true }
  });
  for (const player of Object.values(state.players)) {
    player.canMulligan = false;
    player.needsHandRefresh = false;
  }
  state.players.p1.resources.gold = 50;
  state.adventure!.rewardQueue = [];
  state.adventure!.pendingVisit = null;
  state.pendingChoice = null;
  return state;
}

function renderTray(state: GameState) {
  const onAction = vi.fn();
  render(
    <PromptTray
      legalActions={getLegalActions(state, "p1")}
      onAction={onAction}
      state={state}
      viewerPlayerId="p1"
    />
  );
  return onAction;
}

describe("equipment offers show the item's picture and wired effect", () => {
  it("a Grade-I purchase CHOOSE_ONE renders each item as an art tile with its summary; Decline stays a plain button", () => {
    const state = equipmentGame("equip-offer-art");
    const step = buildEquipmentGradePurchaseStep(
      state,
      "p1",
      ["I"],
      "Resource round — buy 1 Grade I equipment item:"
    );
    expect(step, "the purchase step must build with the module on").toBeTruthy();
    state.adventure!.rewardQueue = [{ playerId: "p1", kind: "visit-steps", steps: [step!] }];
    pumpAdventureQueues(state);
    renderTray(state);

    // Every buy option is an art tile: the item's icon + its wired summary.
    const swordDef = getEquipmentDefinition("anime.equip.iron_blood_sword")!;
    const buy = screen.getByRole("button", { name: new RegExp(`Buy ${swordDef.name.en}`) });
    expect(buy.className).toContain("promptRewardCard");
    expect(buy.querySelector("img")?.getAttribute("src")).toContain(
      equipmentImage("anime.equip.iron_blood_sword")!
    );
    expect(buy.querySelector(".promptRewardDetail")?.textContent).toBe(swordDef.summary);

    // CONTROL: the trailing Decline is a plain text button with no art/detail.
    const decline = screen.getByRole("button", { name: "Decline" });
    expect(decline.className).toContain("commandButton");
    expect(decline.querySelector("img")).toBeNull();
    expect(decline.querySelector(".promptRewardDetail")).toBeNull();
  });

  it("a free GRANT (Creature-Bank reward road) renders the same art + summary tiles", () => {
    const state = equipmentGame("equip-grant-art");
    const step = buildEquipmentGradeRewardStep(state, "p1", "I", "Creature Bank — take 1 equipment item:");
    expect(step).toBeTruthy();
    state.adventure!.rewardQueue = [{ playerId: "p1", kind: "visit-steps", steps: [step!] }];
    pumpAdventureQueues(state);
    renderTray(state);

    const swordDef = getEquipmentDefinition("anime.equip.iron_blood_sword")!;
    const take = screen.getByRole("button", { name: new RegExp(`Take ${swordDef.name.en}`) });
    expect(take.className).toContain("promptRewardCard");
    expect(take.querySelector("img")).toBeTruthy();
    expect(take.querySelector(".promptRewardDetail")?.textContent).toBe(swordDef.summary);
  });
});

describe("commander-artifact purchase offers show the card face and effect", () => {
  it("the post-victory commander-artifact-offer choice renders each card's face + effectText; Decline stays plain", () => {
    const state = equipmentGame("cmdr-artifact-offer-art");
    const cardId = "wog.artifact.iron_cudgel";
    const spec = COMMANDER_ARTIFACT_SPECS[cardId]!;
    state.pendingChoice = {
      id: "choice_test",
      type: "OPTION_CHOICE",
      playerId: "p1",
      prompt: "Victory spoils: buy one commander artifact for 4 gold?",
      options: [{ label: `Buy ${spec.name} (4 gold)` }, { label: "Decline" }],
      context: "commander-artifact-offer",
      commanderArtifactOffer: { cardIds: [cardId], cost: 4, source: "Victory spoils" },
      returnPhase: "player-turn"
    };
    state.phase = "choice";
    state.priorityPlayerId = "p1";
    renderTray(state);

    const buy = screen.getByRole("button", { name: new RegExp(`Buy ${spec.name}`) });
    expect(buy.className).toContain("promptRewardCard");
    expect(buy.querySelector("img")?.getAttribute("src")).toContain(
      cardLibrary[cardId]!.assets!.cardImage!
    );
    expect(buy.querySelector(".promptRewardDetail")?.textContent).toBe(spec.effectText);

    const decline = screen.getByRole("button", { name: "Decline" });
    expect(decline.className).toContain("commandButton");
    expect(decline.querySelector("img")).toBeNull();
  });
});
