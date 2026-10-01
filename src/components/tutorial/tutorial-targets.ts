/**
 * Where the tutorial coach points next, and what it says.
 *
 * `tutorialTargets` maps the next scripted human GameAction to an ORDERED list
 * of CSS selectors for the real table UI. `findTutorialTarget` (tutorial-pointer)
 * takes the FIRST selector that matches a visible element, so every list is
 * written back to front:
 *
 *   1. anything that blocks the surface (an open town window / spell book over
 *      the map) — it must be closed before anything under it can be clicked;
 *   2. the LAST click of the flow (Confirm / "Move there" / "Play card" …);
 *   3. … earlier clicks …;
 *   4. the FIRST click (the hand card, the town tile …);
 *   5. the phone tab / panel opener that reveals the surface.
 *
 * A later-step element that is already on screen before the earlier step is
 * done is qualified with the state the UI really sets (a `.selected` /
 * `aria-pressed` / `data-*` marker), so it only matches once it IS the next
 * click. Buttons that dispatch one specific legal action carry
 * `data-action-key={actionKey(legal.action)}`; the key is built from the
 * matching LEGAL action (its own key order), falling back to the scripted one.
 *
 * Pure: no DOM access except the optional `CSS.escape`.
 */
import {
  combatHasHumanParticipant,
  getBattlefieldLabel,
  getLegalActions,
  type GameAction,
  type GameState,
  type LegalAction,
} from "@/engine";
import { coreBuildingDefinitions, coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import { coreUnitDefinitions } from "@/data/factions/units";
import { locationDefinitions } from "@/data/map/locations";
import { DIFFICULTY_CHOICES } from "@/components/adventure/setup-hub-summary";
import { actionKey, cardName, cardSelectionKey, isBoardTargetCardAction } from "@/components/table/utils";
import { TUTORIAL_COMPUTER } from "@/lib/tutorial/tutorial-core";
import type { TutorialLanguage } from "@/lib/tutorial/tutorial-preference";

/**
 * Hint language for the current call (set by the two exported entry points;
 * the module is synchronous, so it never leaks between calls). In-game button
 * names stay English inside the quotes — that is what is on screen.
 */
let LANG: TutorialLanguage = "en";
function h(text: { en: string; vi: string; pl: string }): string {
  return text[LANG] || text.en;
}

type UiMode = "computer" | "phone";
type Targets = { selectors: string[]; hint: string };

// ---------------------------------------------------------------------------
// selector helpers
// ---------------------------------------------------------------------------

/** A quoted CSS string for an attribute value (CSS.escape when available). */
function quote(value: string | number): string {
  const text = String(value);
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return `"${CSS.escape(text)}"`;
  }
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\a ")}"`;
}

function attr(name: string, value: string | number): string {
  return `[${name}=${quote(value)}]`;
}

function phoneTab(uiMode: UiMode, tab: string): string[] {
  return uiMode === "phone" ? [`button.phoneTab${attr("data-phone-tab-id", tab)}`] : [];
}

/** Open windows that cover the adventure map, hand and HUD. */
const MAP_BLOCKERS = [
  ".spellBookBackdrop button.spellBookBookClose",
  ".tbPanelBackdrop .tbPanel button.tbPanelClose",
  ".townWindowBackdrop button.townWindowClose",
];

/** Back to the battle when the player flipped the fight to the map view. */
function returnToBattle(uiMode: UiMode): string[] {
  return uiMode === "phone"
    ? [`button.phoneTab${attr("data-phone-tab-id", "battle")}`, '[data-tutorial-action="RETURN_TO_BATTLE"]']
    : ['[data-tutorial-action="RETURN_TO_BATTLE"]'];
}

// ---------------------------------------------------------------------------
// state helpers
// ---------------------------------------------------------------------------

/** Same decision, ignoring key order and undefined fields (as the tutorial room does). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined && key !== "parallelContextId")
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const legalCache = new WeakMap<GameState, Map<string, LegalAction[]>>();

function legalActionsFor(state: GameState, playerId: string): LegalAction[] {
  let byPlayer = legalCache.get(state);
  if (!byPlayer) {
    byPlayer = new Map();
    legalCache.set(state, byPlayer);
  }
  let list = byPlayer.get(playerId);
  if (!list) {
    try {
      list = getLegalActions(state, playerId);
    } catch {
      list = [];
    }
    byPlayer.set(playerId, list);
  }
  return list;
}

function matchingLegal(state: GameState, action: GameAction): LegalAction | undefined {
  if (!("playerId" in action)) return undefined;
  const wanted = stable(action);
  return legalActionsFor(state, action.playerId).find((legal) => stable(legal.action) === wanted);
}

/** The data-action-key the UI renders for this decision. */
function keyFor(state: GameState, action: GameAction): string {
  return actionKey(matchingLegal(state, action)?.action ?? action);
}

function keyed(state: GameState, action: GameAction): string {
  return attr("data-action-key", keyFor(state, action));
}

/** Is the battlefield (not the map) the table's surface right now? */
function combatSurface(state: GameState): boolean {
  const combat = state.combat;
  if (!combat) return false;
  if (state.mode !== "adventure") return true;
  const visible = state.sessionMode !== "single-player" || combatHasHumanParticipant(state);
  if (!visible) return false;
  // PvP preparation happens on the map until the fight is decided.
  return !(combat.prep && !combat.outcome);
}

function combatUnitName(state: GameState, unitId: string): string {
  const unit = state.combat?.units[unitId] as { name?: string; cardName?: string } | undefined;
  return unit?.name ?? unit?.cardName ?? "unit";
}

function unitDefName(unitDefId: string): string {
  return coreUnitDefinitions[unitDefId]?.name ?? unitDefId;
}

function armyUnitLabel(state: GameState, playerId: string, armyUnitId: string): string {
  const unit = state.players[playerId]?.army.find((candidate) => candidate.id === armyUnitId);
  if (!unit) return h({ en: "that unit", vi: "đơn vị đó", pl: "tę jednostkę" });
  const side = unit.side === "pack" ? "Pack" : unit.side === "few" ? "Few" : unit.side === "neutral" ? "Neutral" : unit.side;
  return `${unitDefName(unit.unitDefId)} (${side})`;
}

function heroName(state: GameState, heroId: string): string {
  const hero = state.heroes[heroId];
  const name = hero?.heroDefId ? coreHeroDefinitions[hero.heroDefId]?.name : undefined;
  return (
    name ??
    (hero?.kind === "secondary"
      ? h({ en: "your Secondary Hero", vi: "tướng phụ của ngươi", pl: "twojego drugiego bohatera" })
      : h({ en: "your hero", vi: "tướng của ngươi", pl: "twojego bohatera" }))
  );
}

function fieldGuarded(state: GameState, spaceId: string, playerId: string): boolean {
  const field = state.adventure?.fields[spaceId];
  return Boolean(field && field.difficulty && !field.blackCube && !field.everFlagged && field.flagOwnerId !== playerId);
}

function fieldDescription(state: GameState, spaceId: string, playerId: string): string {
  const field = state.adventure?.fields[spaceId];
  if (!field) return h({ en: "the glowing field", vi: "ô đang sáng", pl: "podświetlone pole" });
  const name = locationDefinitions[field.location]?.name ?? field.location.replace(/_/g, " ");
  const article = /^[aeiou]/i.test(name) ? "an" : "a";
  const guarded = fieldGuarded(state, spaceId, playerId);
  return h({
    en: `the field with ${article} ${name}${guarded ? " (guarded — a fight starts there)" : ""}`,
    vi: `ô có ${name}${guarded ? " (có lính canh — sẽ đánh nhau ở đó)" : ""}`,
    pl: `pole: ${name}${guarded ? " (strzeżone — tam zacznie się walka)" : ""}`,
  });
}

function quoteLabel(label: string | undefined): string {
  return label ? `“${label}”` : h({ en: "the highlighted option", vi: "lựa chọn đang sáng", pl: "podświetloną opcję" });
}

function optionLabel(state: GameState, action: GameAction): string | undefined {
  const legal = matchingLegal(state, action);
  if (legal?.label) return legal.label;
  const choice = state.pendingChoice as { options?: { label?: string }[] } | null | undefined;
  if (action.type === "CHOOSE_OPTION") return choice?.options?.[action.optionIndex]?.label;
  if (action.type === "RESOLVE_VISIT_STEP" && action.optionIndex !== undefined) {
    const step = state.adventure?.pendingVisit?.steps[0] as { options?: { label?: string }[] } | undefined;
    return step?.options?.[action.optionIndex]?.label;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// flows
// ---------------------------------------------------------------------------

/** REFRESH_HAND / OPENING_HAND_MULLIGAN: optional discard picks, in scripted order. */
function handRefreshTargets(
  state: GameState,
  uiMode: UiMode,
  type: "REFRESH_HAND" | "OPENING_HAND_MULLIGAN",
  discardCardIds: string[],
): Targets {
  const tagged = attr("data-tutorial-action", type);
  const hand = phoneTab(uiMode, "hand");
  if (discardCardIds.length === 0) {
    return {
      selectors: [
        ...MAP_BLOCKERS,
        `${tagged}[data-tutorial-step="${type === "REFRESH_HAND" ? "draw" : "keep"}"]`,
        // Already inside the discard picker with nothing marked: its confirm
        // sends the same empty discard.
        `${tagged}[data-tutorial-step="confirm-discards"][data-discard-count="0"]`,
        ...hand,
      ],
      hint:
        type === "REFRESH_HAND"
          ? h({
              en: "Start of your turn: click “Draw new” to fill your hand back up (no discards).",
              vi: "Đầu lượt: bấm “Draw new” để rút đầy bài lại (không bỏ lá nào).",
              pl: "Początek tury: kliknij „Draw new”, aby dobrać do pełnej ręki (bez odrzucania).",
            })
          : h({
              en: "Opening Mulligan: you are happy with this hand — click “Keep hand”.",
              vi: "Đổi bài đầu ván: tay bài này ổn rồi — bấm “Keep hand”.",
              pl: "Mulligan otwarcia: ta ręka jest dobra — kliknij „Keep hand”.",
            }),
    };
  }
  // Duplicate cards (two Knowledge) share a card id, so point at specific hand
  // slots: the first unused copy of each discarded card, in hand order.
  const handNow = state.players.p1?.hand ?? [];
  const used = new Set<number>();
  const indices = discardCardIds.map((cardId) => {
    const index = handNow.findIndex((entry, position) => entry === cardId && !used.has(position));
    if (index >= 0) used.add(index);
    return index;
  });
  const slot = (index: number) => `button.adventureHandCard${attr("data-hand-index", index)}`;
  const allMarked = indices.map((index) => `:has(${slot(index)}.discarding)`).join("");
  const names = discardCardIds.map((cardId) => cardName(cardId));
  const count = discardCardIds.length;
  const picks = indices.map((index) => `.handArea ${slot(index)}[data-hand-select="discard"]:not(.discarding)`);
  // A wrongly marked card: point at it so it gets unmarked first.
  const strays = `.handArea button.adventureHandCard.discarding${indices.map((index) => `:not(${attr("data-hand-index", index)})`).join("")}`;
  const openLabel =
    type === "OPENING_HAND_MULLIGAN"
      ? "Discard & redraw"
      : state.round === 1
        ? "Discard bonus card(s) & draw up"
        : "Discard and draw new";
  const confirmLabel = type === "OPENING_HAND_MULLIGAN" ? `Discard ${count} & redraw` : `Discard ${count} & draw`;
  return {
    selectors: [
      ...MAP_BLOCKERS,
      `.handArea${allMarked} ${tagged}[data-tutorial-step="confirm-discards"]${attr("data-discard-count", count)}`,
      strays,
      ...picks,
      `${tagged}[data-tutorial-step="choose-discards"]`,
      ...hand,
    ],
    hint: h({
      en:
        `${type === "OPENING_HAND_MULLIGAN" ? "Opening Mulligan" : "Start of your turn"}: click “${openLabel}”, ` +
        `then click ${names.join(" and then ")}${count > 1 ? " in that order" : ""} to mark ${count > 1 ? "them" : "it"}, ` +
        `and press “${confirmLabel}”.`,
      vi:
        `${type === "OPENING_HAND_MULLIGAN" ? "Đổi bài đầu ván" : "Đầu lượt"}: bấm “${openLabel}”, ` +
        `rồi bấm ${names.join(" rồi ")}${count > 1 ? " theo thứ tự đó" : ""} để đánh dấu, và bấm “${confirmLabel}”.`,
      pl:
        `${type === "OPENING_HAND_MULLIGAN" ? "Mulligan otwarcia" : "Początek tury"}: kliknij „${openLabel}”, ` +
        `potem ${names.join(", a potem ")}${count > 1 ? " w tej kolejności" : ""}, aby zaznaczyć, i naciśnij „${confirmLabel}”.`,
    }),
  };
}

function mapHandPlayTargets(state: GameState, uiMode: UiMode, action: GameAction, cardId: string, verb: string): Targets {
  const key = keyed(state, action);
  const legal = matchingLegal(state, action);
  const name = cardName(cardId);
  return {
    selectors: [
      ...MAP_BLOCKERS,
      `.handButtons.playConfirm button.commandButton.primary${key}`,
      `.handPlayMenu button${key}`,
      `.adventureHandSlot button.adventureHandCard[data-hand-select="menu"]${attr("data-hand-card-id", cardId)}`,
      ...phoneTab(uiMode, "hand"),
    ],
    hint: h({
      en: `${verb} ${name}: click it in your hand, choose ${quoteLabel(legal?.label)}, then press “Confirm”.`,
      vi: `${verb === "Cast" ? "Dùng phép" : "Dùng"} ${name}: bấm lá đó trên tay, chọn ${quoteLabel(legal?.label)}, rồi bấm “Confirm”.`,
      pl: `${verb === "Cast" ? "Rzuć" : "Zagraj"} ${name}: kliknij kartę w ręce, wybierz ${quoteLabel(legal?.label)}, potem naciśnij „Confirm”.`,
    }),
  };
}

function combatCardTargets(state: GameState, uiMode: UiMode, action: Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }>): Targets {
  const legal = matchingLegal(state, action);
  const played = (legal?.action ?? action) as Extract<GameAction, { type: "CAST_SPELL" | "PLAY_CARD" }>;
  const key = keyed(state, action);
  const handCardId =
    played.type === "CAST_SPELL" && played.fromSpellDeck ? played.fromSpellDeck : played.cardId;
  const name = cardName(played.cardId);
  const fan = `button.fanCard${attr("data-hand-card-id", handCardId)}`;
  if (isBoardTargetCardAction(played)) {
    const target = played.target;
    const targetName =
      target.type === "unit"
        ? combatUnitName(state, target.unitId)
        : `${h({ en: "space", vi: "ô", pl: "pole" })} ${getBattlefieldLabel(target.position)}`;
    const own = target.type === "unit" && state.combat?.units[target.unitId]?.controllerId === action.playerId;
    return {
      selectors: [
        `button.battleCell${key}`,
        `.cardPopover button${attr("data-card-selection-key", cardSelectionKey(played))}`,
        `${fan}:not(.selected)`,
        ...phoneTab(uiMode, "hand"),
        ...returnToBattle(uiMode),
      ],
      hint: h({
        en:
          `${action.type === "CAST_SPELL" ? "Cast" : "Play"} ${name} on ${own ? "your" : "the enemy"} ${targetName}: ` +
          `click ${name} in your hand (choose “Pick target” if it asks), then click the glowing ${targetName} on the battlefield.`,
        vi:
          `${action.type === "CAST_SPELL" ? "Dùng phép" : "Dùng"} ${name} lên ${own ? "" : "địch: "}${targetName}${own ? " của ngươi" : ""}: ` +
          `bấm ${name} trên tay (chọn “Pick target” nếu được hỏi), rồi bấm ${targetName} đang sáng trên chiến trường.`,
        pl:
          `${action.type === "CAST_SPELL" ? "Rzuć" : "Zagraj"} ${name} na ${own ? "swoją jednostkę" : "wroga"} ${targetName}: ` +
          `kliknij ${name} w ręce (wybierz „Pick target”, jeśli zapyta), potem kliknij podświetlony cel ${targetName} na polu bitwy.`,
      }),
    };
  }
  return {
    selectors: [
      `.cardPlayConfirm button.confirmPlay${key}`,
      `.cardPopover button${key}`,
      fan,
      ...phoneTab(uiMode, "hand"),
      ...returnToBattle(uiMode),
    ],
    hint: h({
      en: `Play ${name}: click it in your hand, choose ${quoteLabel(legal?.label)}, then press “Confirm”.`,
      vi: `Dùng ${name}: bấm lá đó trên tay, chọn ${quoteLabel(legal?.label)}, rồi bấm “Confirm”.`,
      pl: `Zagraj ${name}: kliknij kartę w ręce, wybierz ${quoteLabel(legal?.label)}, potem naciśnij „Confirm”.`,
    }),
  };
}

function passLabel(state: GameState): string {
  const window = state.reactionWindow;
  if (window?.helmCounterCardId) return "Let it resolve";
  if (window?.triggerEvent.type === "UNIT_ATTACK_DECLARED") return "Done — roll the die!";
  if (window?.triggerEvent.type === "UNIT_LETHAL_HIT") return "Let it die";
  const top = state.stack.at(-1)?.action;
  if (top?.type === "CAST_SPELL") {
    return top.playerId === window?.priorityPlayerId ? `Resolve ${cardName(top.cardId)}` : `Pass — allow ${cardName(top.cardId)}`;
  }
  return "Pass";
}

const TRAY_RESTORE = ".reactionTray.minimized button.reactionTrayMinimize";

function reactionTargets(state: GameState, action: Extract<GameAction, { type: "PLAY_REACTION" }>): Targets {
  const key = keyed(state, action);
  const mode = action.mode ?? "basic";
  const tile = `.reactionTray .trayTile${attr("data-card-id", action.cardId)}`;
  const option = action.optionIndex !== undefined ? attr("data-option-index", action.optionIndex) : ":not([data-option-index])";
  const boost = action.asPowerBoost ? '[data-power-boost="true"]' : ":not([data-power-boost])";
  const selection = `${action.cardId}:${mode}${action.optionIndex !== undefined ? `:o${action.optionIndex}` : ""}${
    action.asPowerBoost ? ":boost" : ""
  }`;
  const name = cardName(action.cardId);
  const expert = mode === "expert" && !action.asPowerBoost;
  const what = action.asPowerBoost
    ? h({ en: `discard ${name} for +1 Power`, vi: `bỏ ${name} để được +1 Power`, pl: `odrzuć ${name} za +1 Power` })
    : h({
        en: `play ${name}${expert ? " on its Expert side (spends a crown)" : ""}`,
        vi: `dùng ${name}${expert ? " ở mặt Expert (tốn một vương miện)" : ""}`,
        pl: `zagraj ${name}${expert ? " stroną Expert (kosztuje koronę)" : ""}`,
      });
  return {
    selectors: [
      TRAY_RESTORE,
      // One-click plays (Spell Book / scroll / window-ending instants).
      `.reactionTray button${key}`,
      `.reactionTray button.trayConfirm${attr("data-selected-cards", selection)}`,
      ...(mode === "expert" && !action.asPowerBoost
        ? [`${tile} .trayGroup:has(button.trayPick[aria-pressed="true"]${option}${boost}) button.trayExpert[aria-pressed="false"]:not([disabled])`]
        : []),
      // Something else is ticked: untick it so only this card is played.
      `.reactionTray .trayTile:not(${attr("data-card-id", action.cardId)}) button.trayPick[aria-pressed="true"]`,
      `${tile} button.trayInstant${attr("data-mode", mode)}${option}`,
      `${tile} button.trayPick[aria-pressed="false"]${option}${boost}`,
    ],
    hint: h({
      en: `In the Instant window, ${what}: tick it${expert ? ", press “Expert”" : ""}, then press “Play card”. Play only this card now — the next one comes after it.`,
      vi: `Trong cửa sổ Instant, ${what}: đánh dấu lá đó${expert ? ", bấm “Expert”" : ""}, rồi bấm “Play card”. Chỉ dùng lá này thôi — lá tiếp theo sẽ đến sau.`,
      pl: `W oknie Instant ${what}: zaznacz ją${expert ? ", naciśnij „Expert”" : ""}, potem „Play card”. Teraz tylko ta karta — następna przyjdzie po niej.`,
    }),
  };
}

// ---------------------------------------------------------------------------
// main entry
// ---------------------------------------------------------------------------

export function tutorialTargets(action: GameAction, state: GameState, uiMode: UiMode, language: TutorialLanguage = "en"): Targets {
  LANG = language;
  const playerId = "playerId" in action ? (action.playerId as string) : "";
  const key = keyed(state, action);
  const legal = matchingLegal(state, action);
  const board = [...phoneTab(uiMode, "board"), ...returnToBattle(uiMode)];
  const map = phoneTab(uiMode, "map");
  // Town steps are pointed on the Town window's default "Board" view; from the
  // classic "Buildings" view the pointer first flips back to "Board".
  const townOpen = [
    '.townWindowViews button[role="tab"]:first-child[aria-selected="false"]',
    "button.townDockTile",
    ...phoneTab(uiMode, "army"),
  ];

  switch (action.type) {
    case "END_TURN":
      return {
        selectors: [
          ...MAP_BLOCKERS,
          ...(uiMode === "phone" ? [`button.phoneTab${attr("data-phone-tab-id", "end-turn")}`] : []),
          '[data-tutorial-action="END_TURN"]',
          `.commandDock > button.commandButton${key}`,
        ],
        hint: h({
          en: "You are done for this round — click “End turn”.",
          vi: "Ngươi đã xong vòng này — bấm “End turn”.",
          pl: "Na tę rundę wystarczy — kliknij „End turn”.",
        }),
      };

    case "REFRESH_HAND":
      return handRefreshTargets(state, uiMode, "REFRESH_HAND", action.discardCardIds ?? []);

    case "OPENING_HAND_MULLIGAN":
      return handRefreshTargets(state, uiMode, "OPENING_HAND_MULLIGAN", action.discardCardIds ?? []);

    case "MOVE_HERO":
    case "MOVE_HERO_PATH": {
      const to = action.type === "MOVE_HERO" ? action.to : action.path[action.path.length - 1] ?? "";
      const heroId = action.heroId;
      const hero = state.heroes[heroId];
      const ownHeroes = Object.values(state.heroes).filter((candidate) => candidate.controllerId === playerId);
      const hasTwo = ownHeroes.length > 1;
      const heroSelected = hasTwo
        ? `main.tableRoot:has(button.heroMoveSelect${attr("data-hero-id", heroId)}[aria-pressed="true"]) `
        : "";
      const secondary = hero?.kind === "secondary";
      const selectHint = hasTwo
        ? secondary
          ? h({
              en: "First select your Secondary Hero (the “2nd move” 🐎 chip in the top bar). ",
              vi: "Trước hết chọn tướng phụ (ô “2nd move” 🐎 trên thanh trên cùng). ",
              pl: "Najpierw wybierz drugiego bohatera (żeton „2nd move” 🐎 na górnym pasku). ",
            })
          : h({
              en: "Make sure your Main Hero is selected (the “move” 🐎 chip in the top bar). ",
              vi: "Hãy chắc chắn tướng chính đang được chọn (ô “move” 🐎 trên thanh trên cùng). ",
              pl: "Upewnij się, że wybrany jest główny bohater (żeton „move” 🐎 na górnym pasku). ",
            })
        : "";
      const oneStep = action.type === "MOVE_HERO";
      const guarded = fieldGuarded(state, to, playerId);
      return {
        selectors: [
          '[data-tutorial-action="CONFIRM_MOVE_INTO_BATTLE"]',
          ...MAP_BLOCKERS,
          `.moveConfirmFloat button[data-tutorial-action="MOVE_HERO"]${attr("data-hero-id", heroId)}${attr("data-space-id", to)}`,
          `${heroSelected}polygon.hexCell.moveTarget${attr("data-space-id", to)}`,
          ...(hasTwo
            ? [
                `button.heroMoveSelect${attr("data-hero-id", heroId)}[aria-pressed="false"]`,
                `g.heroPawn${attr("data-hero-id", heroId)}`,
              ]
            : []),
          ...map,
        ],
        hint:
          selectHint +
          h({
            en:
              `Move ${heroName(state, heroId)}${oneStep ? " one step" : ""} to ${fieldDescription(state, to, playerId)}: click that glowing field, then press “Move there”.` +
              (guarded ? " If the game asks “Move into battle?”, choose “Keep moving into battle”." : ""),
            vi:
              `Đưa ${heroName(state, heroId)}${oneStep ? " đi một bước" : ""} tới ${fieldDescription(state, to, playerId)}: bấm ô đang sáng đó, rồi bấm “Move there”.` +
              (guarded ? " Nếu game hỏi “Move into battle?”, chọn “Keep moving into battle”." : ""),
            pl:
              `Przesuń ${heroName(state, heroId)}${oneStep ? " o jedno pole" : ""} — cel: ${fieldDescription(state, to, playerId)}. Kliknij podświetlone pole, potem „Move there”.` +
              (guarded ? " Jeśli gra zapyta „Move into battle?”, wybierz „Keep moving into battle”." : ""),
          }),
      };
    }

    case "DISCOVER_TILE":
      return {
        selectors: [
          ...MAP_BLOCKERS,
          `polygon.hexFaceDown.discoverable${key}`,
          `polygon.hexFaceDown.discoverable${attr("data-tile-id", action.tileInstanceId)}`,
          ...map,
        ],
        hint: h({
          en: "Explore: click the glowing face-down tile next to your hero to turn it over (1 movement point).",
          vi: "Khám phá: bấm vào mảnh úp đang sáng cạnh tướng để lật nó (1 điểm di chuyển).",
          pl: "Eksploracja: kliknij podświetlony zakryty kafel obok bohatera, by go odkryć (1 punkt ruchu).",
        }),
      };

    case "PLACE_TILE":
      return {
        selectors: [
          ...MAP_BLOCKERS,
          `g.placementGhostFlower${attr("data-center-row", action.centerRow)}${attr("data-center-col", action.centerCol)}${attr("data-hero-id", action.heroId)}`,
          `.farTileTray button.farTileBack${attr("data-supply-index", action.supplyIndex)}:not(.selected)`,
          '.farTileTray button.farTileTrayToggle[aria-expanded="false"]',
          ...map,
        ],
        hint: h({
          en: "Lay a Far tile: click the Far tile in the “Far tiles” tray, then click the glowing tile outline on the map border.",
          vi: "Đặt mảnh Far: bấm mảnh Far trong khay “Far tiles”, rồi bấm vào khung mảnh đang sáng ở rìa bản đồ.",
          pl: "Połóż kafel Far: kliknij kafel w tacce „Far tiles”, potem podświetlony obrys na brzegu mapy.",
        }),
      };

    case "SET_TILE_ROTATION": {
      const rotation = action.rotation;
      const float = `.rotateFloat${attr("data-tile-id", action.tileInstanceId)}`;
      const turns: string[] = [];
      for (let preview = 0; preview < 6; preview += 1) {
        if (preview === rotation) continue;
        const clockwise = (rotation - preview + 6) % 6 <= 3;
        turns.push(`${float}${attr("data-preview-rotation", preview)} button[data-rotate="${clockwise ? "cw" : "ccw"}"]`);
      }
      return {
        selectors: [
          `${float}${attr("data-preview-rotation", rotation)} button[data-tutorial-action="SET_TILE_ROTATION"]`,
          ...turns,
          ...map,
        ],
        hint: h({
          en: `Turn the tile with the rotate arrows until it reads ${rotation * 60}°, then press “Confirm”.`,
          vi: `Xoay mảnh bằng các mũi tên cho tới ${rotation * 60}°, rồi bấm “Confirm”.`,
          pl: `Obracaj kafel strzałkami, aż pokaże ${rotation * 60}°, potem naciśnij „Confirm”.`,
        }),
      };
    }

    case "RESOLVE_VISIT_STEP":
    case "CHOOSE_OPTION":
    case "RESOLVE_COMBAT_DISCARD":
      return {
        selectors: [key],
        hint:
          action.type === "RESOLVE_COMBAT_DISCARD"
            ? h({
                en: `Choose which card to lose: ${quoteLabel(legal?.label ?? `Discard ${cardName(action.cardId)}`)}.`,
                vi: `Chọn lá bài phải bỏ: ${quoteLabel(legal?.label ?? `Discard ${cardName(action.cardId)}`)}.`,
                pl: `Wybierz kartę do odrzucenia: ${quoteLabel(legal?.label ?? `Discard ${cardName(action.cardId)}`)}.`,
              })
            : h({
                en: `Choose ${quoteLabel(optionLabel(state, action))}.`,
                vi: `Chọn ${quoteLabel(optionLabel(state, action))}.`,
                pl: `Wybierz ${quoteLabel(optionLabel(state, action))}.`,
              }),
      };

    case "RESOLVE_DECK_SEARCH": {
      const search = state.pendingChoice?.type === "DECK_SEARCH" ? state.pendingChoice : null;
      const cardId = search?.revealedCardIds[action.pick.index];
      const remove = Boolean(action.pick.remove);
      return {
        selectors: [
          `.searchModal button${key}`,
          `.searchModal button.${remove ? "searchRemoveCard" : "searchCard"}${attr("data-search-index", action.pick.index)}`,
        ],
        hint: cardId
          ? h({
              en: `${remove ? "Remove" : "Keep"} ${cardName(cardId)}: click “${remove ? "Remove" : "Keep"} ${cardName(cardId)}”.`,
              vi: `${remove ? "Loại" : "Giữ"} ${cardName(cardId)}: bấm “${remove ? "Remove" : "Keep"} ${cardName(cardId)}”.`,
              pl: `${remove ? "Usuń" : "Zatrzymaj"} ${cardName(cardId)}: kliknij „${remove ? "Remove" : "Keep"} ${cardName(cardId)}”.`,
            })
          : h({ en: "Pick the highlighted card.", vi: "Chọn lá đang sáng.", pl: "Wybierz podświetloną kartę." }),
      };
    }

    case "POPULATION_ACTION": {
      const purchases = action.purchases;
      if (purchases.length === 1) {
        const purchase = purchases[0];
        const reinforce = purchase.kind === "reinforce";
        const row = reinforce && purchase.armyUnitId
          ? `.townRecruits .recruitRow${attr("data-army-unit-id", purchase.armyUnitId)}`
          : `.townRecruits .recruitRow${attr("data-unit-def-id", purchase.unitDefId)}`;
        const name = unitDefName(purchase.unitDefId);
        return {
          selectors: [
            `${row} button.recruitQuick${attr("data-purchase-kind", purchase.kind)}`,
            `.prepTownActions button${key}`,
            ".tbRoot button.tbToken.population",
            ...townOpen,
          ],
          hint: reinforce
            ? h({
                en: `Reinforce your ${name} from Few to Pack: open your town, click the Population token, then press “Reinforce” on the ${name} row.`,
                vi: `Tăng cường ${name} từ Few lên Pack: mở thành, bấm thẻ Population, rồi bấm “Reinforce” ở dòng ${name}.`,
                pl: `Wzmocnij ${name} z Few do Pack: otwórz miasto, kliknij żeton Population, potem „Reinforce” w wierszu ${name}.`,
              })
            : h({
                en: `Recruit ${name}: open your town, click the Population token, then press “Recruit” on the ${name} row.`,
                vi: `Chiêu mộ ${name}: mở thành, bấm thẻ Population, rồi bấm “Recruit” ở dòng ${name}.`,
                pl: `Zrekrutuj ${name}: otwórz miasto, kliknij żeton Population, potem „Recruit” w wierszu ${name}.`,
              }),
        };
      }
      return {
        selectors: [`.prepTownActions button${key}`, ".townRecruits .basketFooter button.commandButton.primary", ".tbRoot button.tbToken.population", ...townOpen],
        hint: h({
          en: `Buy ${purchases.map((purchase) => unitDefName(purchase.unitDefId)).join(" and ")}: tick them in the Population window, then press “Buy ${purchases.length}”.`,
          vi: `Mua ${purchases.map((purchase) => unitDefName(purchase.unitDefId)).join(" và ")}: đánh dấu trong cửa sổ Population, rồi bấm “Buy ${purchases.length}”.`,
          pl: `Kup ${purchases.map((purchase) => unitDefName(purchase.unitDefId)).join(" i ")}: zaznacz je w oknie Population, potem „Buy ${purchases.length}”.`,
        }),
      };
    }

    case "BUILD_STRUCTURE": {
      const name = coreBuildingDefinitions[action.buildingId]?.name ?? action.buildingId;
      return {
        selectors: [
          `.tbBuildRow${attr("data-building-id", action.buildingId)} button.tbBuildGo${key}`,
          `.townBuilding${attr("data-building-id", action.buildingId)} button${key}`,
          `.prepTownActions button${key}`,
          ".tbRoot button.tbToken.build",
          ...townOpen,
        ],
        hint: h({
          en: `Build the ${name}: open your town, click the Construction (build) token, then press “Build” on ${name}.`,
          vi: `Xây ${name}: mở thành, bấm thẻ Construction (xây dựng), rồi bấm “Build” ở ${name}.`,
          pl: `Zbuduj ${name}: otwórz miasto, kliknij żeton Construction (budowa), potem „Build” przy ${name}.`,
        }),
      };
    }

    case "HIRE_SECONDARY_HERO": {
      const hero = coreHeroDefinitions[action.heroDefId]?.name ?? action.heroDefId;
      const field = action.fieldId ? state.adventure?.fields[action.fieldId] : undefined;
      const place = field
        ? field.location === "settlement"
          ? "Controlled Settlement"
          : locationDefinitions[field.location]?.name ?? field.location
        : "Your Town";
      return {
        selectors: [
          `.hireLocationGrid button.hireLocationCard${key}`,
          `.hireHeroRoster button.hireHeroChoice${attr("data-hero-def-id", action.heroDefId)}[aria-pressed="false"]`,
          ...townOpen,
        ],
        hint: h({
          en: `Hire ${hero} as your Secondary Hero (10 gold): open your town, under “Hire a Secondary Hero” pick ${hero}'s portrait, then click “${place}”.`,
          vi: `Thuê ${hero} làm tướng phụ (10 vàng): mở thành, ở mục “Hire a Secondary Hero” chọn chân dung ${hero}, rồi bấm “${place}”.`,
          pl: `Wynajmij ${hero} jako drugiego bohatera (10 złota): otwórz miasto, w „Hire a Secondary Hero” wybierz portret ${hero}, potem kliknij „${place}”.`,
        }),
      };
    }

    case "SPELL_BOOK_ACTION":
      return {
        selectors: [key, ".tbRoot button.tbToken.spellBook", ...townOpen],
        hint: h({
          en: `Buy a Spell with your Spell Book token: click ${quoteLabel(legal?.label)}.`,
          vi: `Mua phép bằng thẻ Spell Book: bấm ${quoteLabel(legal?.label)}.`,
          pl: `Kup czar żetonem Spell Book: kliknij ${quoteLabel(legal?.label)}.`,
        }),
      };

    case "MOVE_SPELL_TO_SPELL_BOOK":
      return {
        selectors: [
          ...MAP_BLOCKERS,
          `.handPlayMenu button.spellBookStash${key}`,
          `.adventureHandSlot button.adventureHandCard[data-hand-select="menu"]${attr("data-hand-card-id", action.cardId)}`,
          ...phoneTab(uiMode, "hand"),
        ],
        hint: h({
          en: `Save ${cardName(action.cardId)} for later: click it in your hand, then “📖 Move to Spell Book”.`,
          vi: `Cất ${cardName(action.cardId)} để dùng sau: bấm lá đó trên tay, rồi “📖 Move to Spell Book”.`,
          pl: `Odłóż ${cardName(action.cardId)} na później: kliknij ją w ręce, potem „📖 Move to Spell Book”.`,
        }),
      };

    case "PLAY_CARD":
      if (combatSurface(state)) return combatCardTargets(state, uiMode, action);
      return mapHandPlayTargets(state, uiMode, action, action.cardId, "Play");

    case "CAST_SPELL":
      if (combatSurface(state)) return combatCardTargets(state, uiMode, action);
      return mapHandPlayTargets(state, uiMode, action, action.cardId, "Cast");

    case "ACCEPT_COMBAT":
      return {
        selectors: [
          ...MAP_BLOCKERS,
          ".preBattlePanel.minimized button.preBattleMinimize",
          `.preBattlePanel button.combatReadyButton${key}`,
          ...map,
        ],
        hint: h({
          en: "Ready for the fight: click “Accept the battle”. Deployment starts once both sides accept.",
          vi: "Sẵn sàng chiến đấu: bấm “Accept the battle”. Dàn quân bắt đầu khi cả hai bên chấp nhận.",
          pl: "Gotowy do walki: kliknij „Accept the battle”. Rozstawienie zaczyna się, gdy obie strony zaakceptują.",
        }),
      };

    case "PLACE_COMBAT_UNIT": {
      const unitLabel = armyUnitLabel(state, playerId, action.armyUnitId);
      return {
        selectors: [
          `.placementPanel .placementCells button${key}`,
          `.placementPanel button.placementUnit${attr("data-army-unit-id", action.armyUnitId)}:not(.selected)`,
          ...board,
        ],
        hint: h({
          en: `Deploy ${unitLabel}: click it in the deploy panel, then click “${getBattlefieldLabel(action.position)}”.`,
          vi: `Đưa ${unitLabel} ra trận: bấm nó trong bảng dàn quân, rồi bấm “${getBattlefieldLabel(action.position)}”.`,
          pl: `Rozstaw ${unitLabel}: kliknij ją w panelu rozstawienia, potem „${getBattlefieldLabel(action.position)}”.`,
        }),
      };
    }

    case "FINISH_COMBAT_PLACEMENT": {
      const versusNeutrals = state.combat?.context.kind === "neutral";
      return {
        selectors: [`.placementPanel button.combatReadyButton${key}`, ...board],
        hint: versusNeutrals
          ? h({
              en: "Your army is set — click “Lock in — reveal the guards”.",
              vi: "Quân đã sẵn sàng — bấm “Lock in — reveal the guards”.",
              pl: "Armia gotowa — kliknij „Lock in — reveal the guards”.",
            })
          : h({
              en: "Your army is set — click “Ready for battle”.",
              vi: "Quân đã sẵn sàng — bấm “Ready for battle”.",
              pl: "Armia gotowa — kliknij „Ready for battle”.",
            }),
      };
    }

    case "MOVE_UNIT":
      return {
        selectors: [`button.battleCell.moveTarget${key}`, `button.battleCell${key}`, ...board],
        hint: h({
          en: `Move your ${combatUnitName(state, action.unitId)} to space ${getBattlefieldLabel(action.destination)}: click that glowing space.`,
          vi: `Đưa ${combatUnitName(state, action.unitId)} tới ô ${getBattlefieldLabel(action.destination)}: bấm ô đang sáng đó.`,
          pl: `Przesuń ${combatUnitName(state, action.unitId)} na pole ${getBattlefieldLabel(action.destination)}: kliknij to podświetlone pole.`,
        }),
      };

    case "ATTACK_UNIT":
      return {
        selectors: [`button.battleCell${key}`, ...board],
        hint: h({
          en: `Attack with your ${combatUnitName(state, action.attackerId)}: click the enemy ${combatUnitName(state, action.defenderId)}.`,
          vi: `Tấn công bằng ${combatUnitName(state, action.attackerId)}: bấm vào ${combatUnitName(state, action.defenderId)} của địch.`,
          pl: `Atak: twoja jednostka ${combatUnitName(state, action.attackerId)} — kliknij wroga ${combatUnitName(state, action.defenderId)}.`,
        }),
      };

    case "CHOOSE_ABILITY_TARGET":
      return {
        selectors: [`button.battleCell${key}`, `.promptTray button${key}`, ...board],
        hint:
          action.targetUnitId === "skip"
            ? h({ en: `Skip it: click ${quoteLabel(legal?.label)}.`, vi: `Bỏ qua: bấm ${quoteLabel(legal?.label)}.`, pl: `Pomiń: kliknij ${quoteLabel(legal?.label)}.` })
            : h({
                en: `Pick the target: click your ${combatUnitName(state, action.targetUnitId)} on the battlefield (or its button in the prompt).`,
                vi: `Chọn mục tiêu: bấm vào ${combatUnitName(state, action.targetUnitId)} của ngươi trên chiến trường (hoặc nút của nó trong bảng nhắc).`,
                pl: `Wybierz cel: kliknij swoją jednostkę ${combatUnitName(state, action.targetUnitId)} na polu bitwy (lub jej przycisk w podpowiedzi).`,
              }),
      };

    case "DEFEND_UNIT":
      return {
        selectors: [`.commandDock button.defendButton${key}`, `.commandDock button${key}`, ...board],
        hint: h({
          en: `Your ${combatUnitName(state, action.unitId)} holds this turn: click “Defend”.`,
          vi: `${combatUnitName(state, action.unitId)} của ngươi phòng thủ lượt này: bấm “Defend”.`,
          pl: `Twoja jednostka ${combatUnitName(state, action.unitId)} broni się w tej turze: kliknij „Defend”.`,
        }),
      };

    case "CONTINUE_NEUTRAL_COMBAT":
    case "RETREAT_FROM_COMBAT":
      return {
        selectors: [`.promptTray button${key}`, `.commandDock button${key}`, `.preBattlePanel button${key}`, `.placementPanel button${key}`, ...board],
        hint: h({ en: `Click ${quoteLabel(legal?.label)}.`, vi: `Bấm ${quoteLabel(legal?.label)}.`, pl: `Kliknij ${quoteLabel(legal?.label)}.` }),
      };

    case "ACKNOWLEDGE_COMBAT_END":
      return {
        selectors: [`.combatResultButtons button${key}`, `.commandDock button${key}`, ...board],
        hint: h({
          en: "The battle is over — click “Return to the adventure map”.",
          vi: "Trận đấu kết thúc — bấm “Return to the adventure map”.",
          pl: "Bitwa skończona — kliknij „Return to the adventure map”.",
        }),
      };

    case "CONTINUE_NEUTRAL_STEP": {
      const step = state.combat?.pendingNeutralStep;
      const label = step && step.kind !== "guard-walk" ? "Let the unit act" : "Continue";
      return {
        selectors: ['[data-tutorial-action="CONTINUE_NEUTRAL_STEP"]', ...returnToBattle(uiMode)],
        hint: h({
          en: `Nothing to react with now — click “${label}” (it also continues on its own after a moment).`,
          vi: `Không có gì để phản ứng — bấm “${label}” (sau một lúc nó cũng tự tiếp tục).`,
          pl: `Nie ma czym zareagować — kliknij „${label}” (po chwili samo też ruszy dalej).`,
        }),
      };
    }

    case "PASS_REACTION":
      return {
        selectors: [
          TRAY_RESTORE,
          // The "Power past the top tier — Resolve anyway" check opened by Pass.
          '.reactionTray .trayPowerBackdrop [data-tutorial-action="PASS_REACTION"]',
          '.reactionTray [data-tutorial-action="PASS_REACTION"]',
        ],
        hint: h({
          en: `Don't play a card now — click “${passLabel(state)}” in the Instant window.`,
          vi: `Không dùng bài lúc này — bấm “${passLabel(state)}” trong cửa sổ Instant.`,
          pl: `Nie zagrywaj teraz karty — kliknij „${passLabel(state)}” w oknie Instant.`,
        }),
      };

    case "PLAY_REACTION":
      return reactionTargets(state, action);

    default:
      return {
        selectors: [key],
        hint: legal?.label
          ? h({ en: `Click ${quoteLabel(legal.label)}.`, vi: `Bấm ${quoteLabel(legal.label)}.`, pl: `Kliknij ${quoteLabel(legal.label)}.` })
          : h({ en: "Follow the highlighted control.", vi: "Làm theo nút đang sáng.", pl: "Użyj podświetlonego przycisku." }),
      };
  }
}

// ---------------------------------------------------------------------------
// setup lobby
// ---------------------------------------------------------------------------

/** Close any setup window other than the ones this step needs. */
function otherSetupWindows(keep: string[]): string {
  return `.setupHubWindow${keep.map((name) => `:not(.setupHubWindow--${name})`).join("")} button.setupHubWindowClose`;
}

export function tutorialLobbyTargets(
  issue: "player-faction" | "computer-faction" | "difficulty" | "start",
  setup: { difficulty: string; playerFaction: string; playerHero: string; computerFaction: string; computerHero: string },
  language: TutorialLanguage = "en",
): Targets {
  LANG = language;
  const heroInfoClose = ".heroInfoBackdrop button.heroInfoClose";
  switch (issue) {
    case "player-faction": {
      const faction = coreFactionDefinitions[setup.playerFaction]?.name ?? setup.playerFaction;
      const hero = coreHeroDefinitions[setup.playerHero]?.name ?? setup.playerHero;
      return {
        selectors: [
          heroInfoClose,
          otherSetupWindows(["heroes"]),
          `.setupHubWindow--heroes .factionCard${attr("data-faction-id", setup.playerFaction)} button.lobbyHero${attr("data-hero-def-id", setup.playerHero)}:not(.selected):not(.computerSeatPicker *)`,
          "button.setupHubBox--heroes",
        ],
        hint: h({
          en: `Pick your side: open “Heroes & Draft”, find the ${faction} card and click ${hero}.`,
          vi: `Chọn phe: mở “Heroes & Draft”, tìm thẻ ${faction} và bấm ${hero}.`,
          pl: `Wybierz stronę: otwórz „Heroes & Draft”, znajdź kartę ${faction} i kliknij ${hero}.`,
        }),
      };
    }
    case "computer-faction": {
      const faction = coreFactionDefinitions[setup.computerFaction]?.name ?? setup.computerFaction;
      const hero = coreHeroDefinitions[setup.computerHero]?.name ?? setup.computerHero;
      const seat = `.computerSeatPicker${attr("data-seat-player-id", TUTORIAL_COMPUTER)}`;
      return {
        selectors: [
          heroInfoClose,
          otherSetupWindows(["heroes"]),
          `${seat} .factionCard${attr("data-faction-id", setup.computerFaction)} button.lobbyHero${attr("data-hero-def-id", setup.computerHero)}:not(.selected)`,
          `${seat} .computerSeatPickerButtons button.draftResetBtn[aria-expanded="false"]`,
          "button.setupHubBox--heroes",
        ],
        hint: h({
          en: `Set up your opponent: in “Heroes & Draft”, press “Pick faction & hero” on the computer seat, then click ${hero} on the ${faction} card.`,
          vi: `Thiết lập đối thủ: trong “Heroes & Draft”, bấm “Pick faction & hero” ở ghế máy, rồi bấm ${hero} trên thẻ ${faction}.`,
          pl: `Ustaw przeciwnika: w „Heroes & Draft” naciśnij „Pick faction & hero” przy miejscu komputera, potem kliknij ${hero} na karcie ${faction}.`,
        }),
      };
    }
    case "difficulty": {
      const label = DIFFICULTY_CHOICES.find((choice) => choice.id === setup.difficulty)?.label ?? setup.difficulty;
      return {
        selectors: [
          otherSetupWindows(["map", "advanced"]),
          `.setupHubWindow--map button.difficultyChessBtn${attr("data-difficulty", setup.difficulty)}:not(.selected)`,
          `.setupHubWindow--advanced button${attr("data-difficulty", setup.difficulty)}[aria-pressed="false"]`,
          "button.setupHubBox--map",
        ],
        hint: h({
          en: `Set the neutral difficulty to ${label}: open “Map” and click ${label}.`,
          vi: `Đặt độ khó lính trung lập là ${label}: mở “Map” và bấm ${label}.`,
          pl: `Ustaw trudność neutralnych na ${label}: otwórz „Map” i kliknij ${label}.`,
        }),
      };
    }
    case "start":
    default:
      return {
        selectors: [heroInfoClose, ".setupHubWindow button.setupHubWindowClose", "button.setupSceneStartButton:not([disabled])"],
        hint: h({
          en: "Everything is set — close the window and click “Start game”.",
          vi: "Mọi thứ đã sẵn sàng — đóng cửa sổ và bấm “Start game”.",
          pl: "Wszystko gotowe — zamknij okno i kliknij „Start game”.",
        }),
      };
  }
}
